import { App, Component, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import { findIncludes } from "./include-parser";
import { isRepresentablePath, relativePath, resolvePath } from "./path-resolver";

export interface PathMove { before: string; after: string }

export function movedPath(path: string, move: PathMove): string {
  return path === move.before || path.startsWith(move.before + "/")
    ? move.after + path.slice(move.before.length) : path;
}

export function updateReferences(text: string, sourceBefore: string, sourceAfter: string, move: PathMove): string {
  let result = text;
  for (const include of findIncludes(text).reverse()) {
    const targetBefore = resolvePath(sourceBefore, include.path);
    if (!targetBefore) continue;
    const targetAfter = movedPath(targetBefore, move);
    if (sourceBefore === sourceAfter && targetBefore === targetAfter) continue;
    let path = relativePath(sourceAfter, targetAfter);
    if (include.path.startsWith("./") && !path.startsWith("../")) path = "./" + path;
    if (!isRepresentablePath(path)) continue;
    result = result.slice(0, include.from) + `::include{file=${path}}` + result.slice(include.to);
  }
  return result;
}

// This setting currently has no typed public accessor. Isolate the lookup and
// default to preserving source if a future app no longer exposes it.
function automaticUpdatesEnabled(app: App): boolean {
  const vault = app.vault as typeof app.vault & { getConfig?: (key: string) => unknown };
  return typeof vault.getConfig === "function" && vault.getConfig("alwaysUpdateLinks") === true;
}

export class IncludeReferenceUpdates extends Component {
  private queue: Promise<void> = Promise.resolve();
  private dead = false;
  private covered = new WeakMap<TAbstractFile, PathMove>();

  constructor(private app: App) { super(); }

  onload(): void {
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      const covered = this.covered.get(file);
      this.covered.delete(file);
      if (covered?.before === oldPath && covered.after === file.path) return;
      if (!automaticUpdatesEnabled(this.app)) return;
      const move = { before: oldPath, after: file.path };
      if (file instanceof TFolder) {
        const visit = (folder: TFolder) => {
          for (const child of folder.children) {
            const after = movedPath(child.path, move);
            const before = movedPath(after, { before: move.after, after: move.before });
            this.covered.set(child, { before, after });
            if (child instanceof TFolder) visit(child);
          }
        };
        visit(file);
      }
      // Capture logical source paths at event time so rapid successive renames
      // can be handled in order, even after the TFile has moved again.
      const sources = this.app.vault.getMarkdownFiles().map(source => {
        const after = movedPath(source.path, move);
        return { file: source, after, before: movedPath(after, { before: move.after, after: move.before }) };
      });
      this.queue = this.queue.then(() => this.apply(move, sources)).catch(error => {
        console.error("GitLab Includes: failed to update include references", error);
        if (!this.dead) new Notice("Some GitLab include references could not be updated. Check the console for details.");
      });
    }));
  }

  onunload(): void { this.dead = true; }

  private async apply(move: PathMove, sources: { file: TFile; before: string; after: string }[]): Promise<void> {
    // The folder event precedes its child events. Let the vault finish moving
    // the TFiles before reading or writing their now-renamed disk paths.
    const deadline = Date.now() + 10000;
    while (!this.dead && sources.some(source => source.before !== source.after && source.file.path === source.before)) {
      if (Date.now() >= deadline) throw new Error("Timed out waiting for a folder move to finish");
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    let next = 0, failures = 0;
    await Promise.all(Array.from({ length: Math.min(8, sources.length) }, async () => {
      while (!this.dead && next < sources.length) {
        const source = sources[next++];
        try {
          if (this.app.vault.getAbstractFileByPath(source.file.path) !== source.file) continue;
          const text = await this.app.vault.cachedRead(source.file);
          if (!text.includes("::include{file=") || text === updateReferences(text, source.before, source.after, move)) continue;
          if (this.dead) return;
          await this.app.vault.process(source.file, current => updateReferences(current, source.before, source.after, move));
        } catch (error) {
          failures++;
          console.error(`GitLab Includes: could not update references in ${source.file.path}`, error);
        }
      }
    }));
    if (failures && !this.dead) new Notice(`Could not update GitLab include references in ${failures} note(s). Check the console for details.`);
  }
}
