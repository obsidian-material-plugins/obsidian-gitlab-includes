import { describe, expect, it, vi } from "vitest";
import { App, CachedMetadata, ReferenceCache } from "obsidian";
import { TFile } from "./obsidian-mock";
import { IncludeLinkIndex, includeReferences } from "../src/native-link-index";

class Backlinks {
  data = new Map<string, ReferenceCache[]>();
  add(path: string, ref: ReferenceCache): void { this.data.set(path, [...(this.data.get(path) ?? []), ref]); }
}
const nativeRef = (link: string): ReferenceCache => ({ link, original: `[[${link}]]`,
  position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 8, offset: 8 } } });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(text = "::include{file=child.md}", native: CachedMetadata = {}) {
  const source = new TFile("docs/source.md"), child = new TFile("docs/child.md");
  const files = [source, child], contents = new Map([[source, text], [child, "# Child"]]);
  const raw = new Map<TFile, CachedMetadata>([[source, native], [child, {}]]);
  const events = new Map<string, Set<(...args: unknown[]) => void>>();
  const on = (name: string, fn: (...args: unknown[]) => void) => {
    const listeners = events.get(name) ?? new Set(); events.set(name, listeners); listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const emit = (name: string, ...args: unknown[]) => { for (const fn of events.get(name) ?? []) fn(...args); };
  const refs = (cache: CachedMetadata | null) => [...(cache?.links ?? []), ...(cache?.embeds ?? [])];
  class Cache {
    resolvedLinks: Record<string, Record<string, number>> = {};
    unresolvedLinks: Record<string, Record<string, number>> = {};
    on = on;
    getFileCache(file: TFile) { return raw.get(file) ?? null; }
    getFirstLinkpathDest(link: string, from: string) {
      const path = link.startsWith("/") ? link.slice(1) : from.slice(0, from.lastIndexOf("/") + 1) + link;
      return files.find(file => file.path.toLowerCase() === path.toLowerCase()) ?? files.find(file => file.name === link) ?? null;
    }
    iterateAllRefs(callback: (path: string, ref: ReferenceCache) => void) {
      for (const [file, metadata] of raw) if (files.includes(file)) for (const ref of refs(metadata)) callback(file.path, ref);
    }
    getBacklinksForFile(file: TFile) {
      const result = new Backlinks();
      this.iterateAllRefs((path, ref) => { if (this.getFirstLinkpathDest(ref.link.split("#")[0], path) === file) result.add(path, ref); });
      return result;
    }
    resolveLinks(path: string) {
      const file = files.find(file => file.path === path); if (!file) return;
      const resolved: Record<string, number> = {}, unresolved: Record<string, number> = {};
      for (const ref of refs(this.getFileCache(file))) {
        const link = ref.link.split("#")[0], target = this.getFirstLinkpathDest(link, path);
        const counts = target ? resolved : unresolved, key = target?.path ?? link.toLowerCase();
        counts[key] = (counts[key] ?? 0) + 1;
      }
      this.resolvedLinks[path] = resolved; this.unresolvedLinks[path] = unresolved;
    }
    queueFileForLinkResolution(file: TFile) { queueMicrotask(() => this.resolveLinks(file.path)); }
  }
  const cache = new Cache(), originalCache = cache.getFileCache, originalResolver = cache.getFirstLinkpathDest;
  const read = vi.fn(async (file: TFile) => contents.get(file) ?? "");
  const app = { metadataCache: cache, vault: { on, getMarkdownFiles: () => files, cachedRead: read,
    getAbstractFileByPath: (path: string) => files.find(file => file.path === path) },
  workspace: { onLayoutReady: (fn: () => void) => fn() } };
  const manager = new IncludeLinkIndex(app as unknown as App);
  const change = (file: TFile, value: string) => { contents.set(file, value); emit("changed", file, value, raw.get(file)); };
  return { app, manager, cache, source, child, files, raw, contents, emit, change, read, originalCache, originalResolver };
}

describe("runtime include references", () => {
  it("retains original UTF-16/CRLF positions and ignores fenced/inline examples", () => {
    const text = "Ä😀\r\n```md\r\n::include{file=ignored.md}\r\n```\r\ninline ::include{file=ignored.md}\r\n::include{file=./child.md}\r\n";
    const refs = includeReferences(text, "docs/source.md", {});
    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe("docs/child.md");
    expect(refs[0].position.start).toEqual({ line: 5, col: 0, offset: text.indexOf("::include{file=./child.md}") });
    expect(text.slice(refs[0].position.start.offset, refs[0].position.end.offset)).toBe(refs[0].original);
  });
  it("avoids collisions with native links and retains literal hash/percent filenames", () => {
    const refs = includeReferences("::include{file=child.md}\n::include{file=a#b%23.md}", "docs/source.md", { links: [nativeRef("/docs/child.md")] });
    expect(refs[0].link).toBe("/./docs/child.md");
    expect(refs[1].link).toBe("/docs/a%23b%2523.md");
    expect(refs[1].target).toBe("docs/a#b%23.md");
  });
});

describe("native indexing adapter", () => {
  it("feeds the native resolver, preserves native duplicate counts and original source", async () => {
    const value = fixture("::include{file=child.md}\n::include{file=child.md}", { embeds: [nativeRef("child.md")] });
    value.manager.load(); await settle();
    expect(value.cache.resolvedLinks[value.source.path]).toEqual({ [value.child.path]: 3 });
    const backlinks = value.cache.getBacklinksForFile(value.child).data.get(value.source.path)!;
    expect(backlinks).toHaveLength(3);
    expect(backlinks[1].original).toBe("::include{file=child.md}");
    expect(value.contents.get(value.source)).toBe("::include{file=child.md}\n::include{file=child.md}");
    value.manager.unload();
  });
  it("exposes native-shaped metadata without mutating stored metadata or native rename input", async () => {
    const metadata = Object.freeze({ embeds: Object.freeze([nativeRef("child.md")]) }) as unknown as CachedMetadata;
    const value = fixture(undefined, metadata); value.manager.load(); await settle();
    expect(value.cache.getFileCache(value.source)?.embeds).toHaveLength(2);
    expect(value.raw.get(value.source)?.embeds).toHaveLength(1);
    const input: ReferenceCache[] = []; value.cache.iterateAllRefs((_path, ref) => input.push(ref));
    expect(input).toHaveLength(1); expect(input[0].original).toBe("[[child.md]]");
    value.manager.unload();
  });
  it("resolves exact filenames and refuses fuzzy, case-only and non-Markdown substitutes", async () => {
    const value = fixture("::include{file=missing.md}\n::include{file=Child.md}\n::include{file=a#b%23.md}\n::include{file=image.png}");
    const literal = new TFile("docs/a#b%23.md"); value.files.push(literal, new TFile("other/missing.md"), new TFile("docs/image.png", "png"));
    value.manager.load(); await settle();
    expect(value.cache.resolvedLinks[value.source.path]).toEqual({ [literal.path]: 1 });
    expect(Object.values(value.cache.unresolvedLinks[value.source.path]).reduce((a, b) => a + b, 0)).toBe(3);
    expect(value.cache.getBacklinksForFile(literal).data.get(value.source.path)).toHaveLength(1);
    value.manager.unload();
  });
  it("updates positions and removes stale links when the source is edited", async () => {
    const value = fixture(); value.manager.load(); await settle();
    value.change(value.source, "before\n\n::include{file=child.md}"); await settle();
    expect(value.cache.getBacklinksForFile(value.child).data.get(value.source.path)?.[0].position.start.line).toBe(2);
    value.change(value.source, "no includes"); await settle();
    expect(value.cache.resolvedLinks[value.source.path]).toEqual({});
    expect(value.cache.getBacklinksForFile(value.child).data.size).toBe(0);
    value.manager.unload();
  });
  it("removes backlinks to a deleted target object and references from a non-Markdown source", async () => {
    const value = fixture(); value.manager.load(); await settle();
    value.files.splice(value.files.indexOf(value.child), 1); value.emit("delete", value.child); await settle();
    expect(value.cache.getBacklinksForFile(value.child).data.size).toBe(0);
    value.files.push(value.child);
    value.source.extension = "txt"; value.source.path = "docs/source.txt"; value.emit("rename", value.source, "docs/source.md"); await settle();
    expect(value.cache.getFileCache(value.source)?.embeds).toBeUndefined();
    expect(value.cache.getBacklinksForFile(value.child).data.size).toBe(0);
    value.manager.unload();
  });
  it("leaves the public cache untouched when required native hooks are absent", async () => {
    const value = fixture();
    Object.defineProperty(value.cache, "queueFileForLinkResolution", { value: undefined });
    value.manager.load(); await settle();
    expect(value.cache.getFileCache).toBe(value.originalCache);
    expect(value.read).not.toHaveBeenCalled();
    value.manager.unload();
  });
  it("reconciles target creation/deletion and source/folder path mutation", async () => {
    const value = fixture("::include{file=later.md}"); value.manager.load(); await settle();
    const later = new TFile("docs/later.md"); value.files.push(later); value.emit("create", later); await settle();
    expect(value.cache.resolvedLinks[value.source.path]).toEqual({ [later.path]: 1 });
    value.files.splice(value.files.indexOf(later), 1); value.emit("delete", later); await settle();
    expect(value.cache.resolvedLinks[value.source.path]).toEqual({});
    value.source.path = "moved/source.md"; later.path = "moved/later.md"; value.files.push(later); value.emit("rename", value.source, "docs/source.md"); await settle();
    expect(value.cache.resolvedLinks[value.source.path]).toEqual({ [later.path]: 1 });
    expect(value.cache.getBacklinksForFile(later).data.has("moved/source.md")).toBe(true);
    value.manager.unload();
  });
  it("restores the original methods and removes only include-derived counts on unload/reload", async () => {
    const value = fixture(undefined, { links: [nativeRef("child.md")] }); value.manager.load(); await settle();
    value.manager.unload(); await settle();
    expect(value.cache.getFileCache).toBe(value.originalCache);
    expect(value.cache.getFirstLinkpathDest).toBe(value.originalResolver);
    expect(value.cache.resolvedLinks[value.source.path]).toEqual({ [value.child.path]: 1 });
    const reloaded = new IncludeLinkIndex(value.app as unknown as App); reloaded.load(); await settle();
    expect(value.cache.resolvedLinks[value.source.path]).toEqual({ [value.child.path]: 2 });
    reloaded.unload();
  });
  it("leaves a later plugin's wrapper intact and delegates through the inactive adapter", async () => {
    const value = fixture(); value.manager.load(); await settle();
    const wrapped = value.cache.getFileCache;
    const later = (file: TFile) => wrapped.call(value.cache, file); value.cache.getFileCache = later;
    value.manager.unload(); await settle();
    expect(value.cache.getFileCache).toBe(later);
    expect(value.cache.getFileCache(value.source)?.embeds).toBeUndefined();
  });
  it("does not let a delayed startup read overwrite a newer metadata event or survive unload", async () => {
    const value = fixture(); let release!: (text: string) => void;
    value.read.mockImplementation(file => file === value.source ? new Promise(resolve => { release = resolve; }) : Promise.resolve(""));
    value.manager.load(); value.change(value.source, "new text without includes"); release("::include{file=child.md}"); await settle();
    expect(value.cache.getBacklinksForFile(value.child).data.size).toBe(0);
    value.manager.unload();
  });
});
