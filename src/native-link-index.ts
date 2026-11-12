import { App, CachedMetadata, Component, EmbedCache, Notice, ReferenceCache, TFile } from "obsidian";
import { findIncludes } from "./include-parser";
import { resolvePath } from "./path-resolver";

interface IndexedInclude extends EmbedCache { target: string }
interface Backlinks { add(path: string, reference: ReferenceCache): void }
interface NativeLinkCache {
  getFileCache(file: TFile): CachedMetadata | null;
  getFirstLinkpathDest(link: string, source: string): TFile | null;
  getBacklinksForFile(file: TFile): Backlinks;
  resolveLinks(path: string): void;
  queueFileForLinkResolution(file: TFile): void;
  iterateAllRefs(callback: (path: string, reference: ReferenceCache) => void): void;
}

/** Native-shaped references, with offsets into the original GitLab source. */
export function includeReferences(text: string, source: string, native: CachedMetadata): IndexedInclude[] {
  const occupied = new Set([...(native.links ?? []), ...(native.embeds ?? []), ...(native.frontmatterLinks ?? [])]
    .map(reference => reference.link.split("#", 1)[0]));
  let line = 0, start = 0;
  return findIncludes(text).flatMap(include => {
    while (start < include.from) {
      const next = text.indexOf("\n", start);
      if (next < 0) break;
      start = next + 1; line++;
    }
    const target = resolvePath(source, include.path);
    if (!target) return [];
    // Rooted references prevent Obsidian's basename fallback. Escape literal #
    // so it cannot be interpreted as a heading. Keep keys separate from native
    // references, including native references containing literal percent signs.
    let link = "/" + target.replace(/%/g, "%25").replace(/#/g, "%23");
    while (occupied.has(link)) link = "/./" + link.slice(1);
    return [{ link, target, original: text.slice(include.from, include.to), displayText: include.path,
      position: { start: { line, col: include.from - start, offset: include.from },
        end: { line, col: include.to - start, offset: include.to } } }];
  });
}

/**
 * Runtime-only metadata translation. Never changes Obsidian's stored parse
 * cache: iterateAllRefs (used by its Markdown rename writer) stays native-only.
 * All internal API use for graph/backlink indexing lives in this adapter.
 */
export class IncludeLinkIndex extends Component {
  private sources = new Map<TFile, string>();
  private memo = new WeakMap<TFile, { text: string; path: string; metadata: CachedMetadata; references: IndexedInclude[] }>();
  private revisions = new WeakMap<TFile, number>();
  private native: NativeLinkCache | null = null;
  private rawCache!: NativeLinkCache["getFileCache"];
  private dead = false;
  private pending = false;

  constructor(private app: App) { super(); }

  onload(): void {
    const cache = this.app.metadataCache as unknown as Partial<NativeLinkCache>;
    const methods = ["getFileCache", "getFirstLinkpathDest", "getBacklinksForFile", "resolveLinks", "queueFileForLinkResolution", "iterateAllRefs"] as const;
    if (!cache || !methods.every(name => typeof cache[name] === "function")) {
      new Notice("GitLab Includes: graph and backlink integration is unavailable in this Obsidian version.");
      return;
    }
    this.native = cache as NativeLinkCache;
    this.rawCache = this.native.getFileCache.bind(this.native);
    this.patch("getFileCache", original => file => {
      const metadata = original.call(cache, file);
      if (!metadata) return metadata;
      const references = this.references(file, metadata);
      return references.length ? { ...metadata, embeds: [...(metadata.embeds ?? []), ...references] } : metadata;
    });
    this.patch("getFirstLinkpathDest", original => (link, source) => {
      const file = this.app.vault.getAbstractFileByPath(source);
      const reference = file instanceof TFile ? this.references(file).find(ref => ref.link === link) : undefined;
      if (!reference) return original.call(cache, link, source);
      const target = this.app.vault.getAbstractFileByPath(reference.target);
      if (!(target instanceof TFile) || target.path !== reference.target || target.extension !== "md") return null;
      // Use Obsidian's resolver for ordinary paths. Exact lookup also supports
      // literal #/% filenames, which native linktext treats as special syntax.
      const resolved = original.call(cache, "/" + reference.target, source);
      return resolved === target ? resolved : target;
    });
    this.patch("getBacklinksForFile", original => file => {
      const backlinks = original.call(cache, file);
      if (file.extension !== "md" || this.app.vault.getAbstractFileByPath(file.path) !== file) return backlinks;
      for (const source of this.sources.keys()) {
        for (const reference of this.references(source)) {
          if (reference.target === file.path && file.extension === "md") backlinks.add(source.path, reference);
        }
      }
      return backlinks;
    });
    this.registerEvent(this.app.metadataCache.on("changed", (file, text) => { this.index(file, text); }));
    this.registerEvent(this.app.vault.on("create", () => this.queueAll()));
    this.registerEvent(this.app.vault.on("delete", () => this.queueAll()));
    this.registerEvent(this.app.vault.on("rename", () => this.queueAll()));
    this.app.workspace.onLayoutReady(() => { if (!this.dead) void this.scan(); });
  }

  onunload(): void {
    this.dead = true;
    // Patch cleanups run after onunload. Inert wrappers delegate immediately,
    // including if a later plugin has wrapped one of our functions.
    for (const file of this.sources.keys()) {
      if (this.app.vault.getAbstractFileByPath(file.path) === file) this.native?.queueFileForLinkResolution(file);
    }
    this.sources.clear();
    this.memo = new WeakMap();
  }

  private patch<K extends "getFileCache" | "getFirstLinkpathDest" | "getBacklinksForFile">(
    name: K, wrap: (original: NativeLinkCache[K]) => NativeLinkCache[K]
  ): void {
    const cache = this.native!;
    const original = cache[name], descriptor = Object.getOwnPropertyDescriptor(cache, name);
    const replacement = wrap(original);
    const inactive = () => this.dead;
    // The concrete wrappers have different signatures; preserve each method's
    // type at the adapter boundary and its original receiver when inactive.
    const guarded = function(this: NativeLinkCache, ...args: Parameters<NativeLinkCache[K]>): ReturnType<NativeLinkCache[K]> {
      const invoke = (inactive() ? original : replacement) as (...values: Parameters<NativeLinkCache[K]>) => ReturnType<NativeLinkCache[K]>;
      return invoke.apply(this, args);
    } as NativeLinkCache[K];
    cache[name] = guarded;
    this.register(() => {
      if (cache[name] !== guarded) return;
      if (descriptor) Object.defineProperty(cache, name, descriptor);
      else delete (cache as unknown as Record<string, unknown>)[name];
    });
  }

  private references(file: TFile, metadata = this.rawCache(file)): IndexedInclude[] {
    if (this.dead || file.extension !== "md" || !metadata || this.app.vault.getAbstractFileByPath(file.path) !== file) return [];
    const text = this.sources.get(file);
    if (text === undefined) return [];
    const memo = this.memo.get(file);
    if (memo?.text === text && memo.path === file.path && memo.metadata === metadata) return memo.references;
    const references = includeReferences(text, file.path, metadata);
    this.memo.set(file, { text, path: file.path, metadata, references });
    return references;
  }

  private index(file: TFile, text: string): void {
    if (this.dead || file.extension !== "md") return;
    this.revisions.set(file, (this.revisions.get(file) ?? 0) + 1);
    const existed = this.sources.has(file), includes = findIncludes(text);
    if (includes.length) this.sources.set(file, text);
    else this.sources.delete(file);
    if (existed || includes.length) this.native?.queueFileForLinkResolution(file);
  }

  private queueAll(): void {
    if (this.dead || this.pending) return;
    this.pending = true;
    // Folder rename emits parent and then child events. Coalesce each batch;
    // the TFile keys follow moved notes without leaving old source paths behind.
    queueMicrotask(() => {
      this.pending = false;
      if (this.dead) return;
      for (const file of this.sources.keys()) {
        if (this.app.vault.getAbstractFileByPath(file.path) !== file) this.sources.delete(file);
        else {
          if (file.extension !== "md") this.sources.delete(file);
          this.native?.queueFileForLinkResolution(file);
        }
      }
    });
  }

  private async scan(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
      while (!this.dead && next < files.length) {
        const file = files[next++], revision = this.revisions.get(file);
        try {
          const text = await this.app.vault.cachedRead(file);
          if (!this.dead && revision === this.revisions.get(file) && this.app.vault.getAbstractFileByPath(file.path) === file) this.index(file, text);
        } catch (error) {
          if (!this.dead) console.error(`GitLab Includes: could not index ${file.path}`, error);
        }
      }
    }));
  }
}
