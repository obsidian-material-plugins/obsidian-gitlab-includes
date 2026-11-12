import { describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { TFile, TFolder } from "./obsidian-mock";
import { IncludeReferenceUpdates, movedPath, updateReferences } from "../src/reference-updates";

describe("include reference updates", () => {
  it("updates target renames while retaining GitLab syntax, Unicode and CRLF", () => {
    const text = "before\r\n::include{file=../notes/old.md}\r\nafter\r\n";
    expect(updateReferences(text, "docs/index.md", "docs/index.md", { before: "notes/old.md", after: "notes/Ä new.md" }))
      .toBe(text.replace("../notes/old.md", "../notes/Ä new.md"));
  });
  it("keeps references pointed at the same target when the source note moves", () => {
    expect(updateReferences("::include{file=child.md}", "docs/index.md", "archive/index.md", { before: "docs/index.md", after: "archive/index.md" }))
      .toBe("::include{file=../docs/child.md}");
  });
  it("handles folder moves, sources inside the folder, and path-prefix collisions", () => {
    const move = { before: "docs", after: "archive/docs" };
    expect(updateReferences("::include{file=docs/child.md}", "index.md", "index.md", move)).toBe("::include{file=archive/docs/child.md}");
    expect(updateReferences("::include{file=./child.md}", "docs/index.md", "archive/docs/index.md", move)).toBe("::include{file=./child.md}");
    expect(movedPath("docs-old/child.md", move)).toBe("docs-old/child.md");
  });
  it("preserves examples, inline directives, invalid paths and unrelated targets", () => {
    const text = "```md\n::include{file=old.md}\n```\ninline ::include{file=old.md}\n::include{file=../../outside.md}\n::include{file=other.md}";
    expect(updateReferences(text, "docs/index.md", "docs/index.md", { before: "docs/old.md", after: "docs/new.md" })).toBe(text);
  });
  it("supports successive moves and self-includes", () => {
    const first = updateReferences("::include{file=child.md}", "docs/index.md", "archive/index.md", { before: "docs/index.md", after: "archive/index.md" });
    expect(updateReferences(first, "archive/index.md", "notes/index.md", { before: "archive/index.md", after: "notes/index.md" }))
      .toBe("::include{file=../docs/child.md}");
    expect(updateReferences("::include{file=index.md}", "docs/index.md", "docs/new.md", { before: "docs/index.md", after: "docs/new.md" }))
      .toBe("::include{file=new.md}");
  });
});

describe("rename event lifecycle", () => {
  function fixture(enabled: boolean) {
    const source = new TFile("docs/index.md");
    const target = new TFile("docs/new.md");
    let text = "::include{file=old.md}";
    let rename: ((file: TFile, oldPath: string) => void) | null = null;
    const process = vi.fn(async (_file: TFile, change: (text: string) => string) => {
      // A concurrent edit made after the cached read must be retained.
      text = change(text + "\nconcurrent edit");
      return text;
    });
    const cleanup = vi.fn();
    const app = { vault: {
      getConfig: () => enabled,
      on: (_name: string, callback: typeof rename) => { rename = callback; return cleanup; },
      getMarkdownFiles: () => [source, target],
      getAbstractFileByPath: (path: string) => [source, target].find(file => file.path === path),
      cachedRead: async (file: TFile) => file === source ? text : "target content",
      process
    } };
    const manager = new IncludeReferenceUpdates(app as unknown as App);
    manager.load();
    const trigger = () => rename?.(target, "docs/old.md");
    return { manager, process, cleanup, trigger, text: () => text };
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  it("honors automatic-link preferences and applies an atomic, syntax-preserving edit", async () => {
    const enabled = fixture(true);
    enabled.trigger(); await settle();
    expect(enabled.text()).toBe("::include{file=new.md}\nconcurrent edit");
    expect(enabled.process).toHaveBeenCalledOnce();
    enabled.manager.unload();
    expect(enabled.cleanup).toHaveBeenCalledOnce();
    const disabled = fixture(false);
    disabled.trigger(); await settle();
    expect(disabled.process).not.toHaveBeenCalled();
    expect(disabled.text()).toBe("::include{file=old.md}");
    disabled.manager.unload();
  });
  it("cancels queued writes when the plugin is unloaded", async () => {
    const value = fixture(true);
    value.trigger(); value.manager.unload(); await settle();
    expect(value.process).not.toHaveBeenCalled();
  });
  it("coalesces a folder rename and its child events before rewriting references", async () => {
    const inside = new TFile("docs/index.md"), target = new TFile("docs/child.md"), outside = new TFile("index.md");
    const folder = new TFolder("archive", [inside, target]);
    const contents = new Map([[inside, "::include{file=child.md}"], [target, "content"], [outside, "::include{file=docs/child.md}"]]);
    let rename!: (file: TFile | TFolder, before: string) => void;
    const process = vi.fn(async (file: TFile, fn: (text: string) => string) => {
      const result = fn(contents.get(file)!); contents.set(file, result); return result;
    });
    const app = { vault: {
      getConfig: () => true,
      on: (_name: string, callback: typeof rename) => { rename = callback; return () => {}; },
      getMarkdownFiles: () => [inside, target, outside],
      getAbstractFileByPath: (path: string) => [inside, target, outside].find(file => file.path === path),
      cachedRead: async (file: TFile) => contents.get(file)!, process
    } };
    const manager = new IncludeReferenceUpdates(app as unknown as App);
    manager.load();
    rename(folder, "docs");
    inside.path = "archive/index.md"; rename(inside, "docs/index.md");
    target.path = "archive/child.md"; rename(target, "docs/child.md");
    await settle();
    expect(contents.get(inside)).toBe("::include{file=child.md}");
    expect(contents.get(outside)).toBe("::include{file=archive/child.md}");
    expect(process).toHaveBeenCalledOnce();
    manager.unload();
  });
});
