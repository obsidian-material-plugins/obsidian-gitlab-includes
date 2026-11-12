// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { IncludeRender } from "../src/embed-renderer";
import { App } from "obsidian";
import { MarkdownRenderer, TFile } from "./obsidian-mock";

beforeAll(() => {
  HTMLElement.prototype.createEl = function(this: HTMLElement, tag: string, options: { cls?: string; text?: string; href?: string }) {
    const el = document.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    if (options.href) el.setAttribute("href", options.href);
    this.appendChild(el);
    return el;
  } as typeof HTMLElement.prototype.createEl;
  HTMLElement.prototype.createDiv = function(this: HTMLElement, options: { cls: string }) {
    const el = document.createElement("div");
    el.className = options.cls;
    this.appendChild(el);
    return el;
  } as typeof HTMLElement.prototype.createDiv;
});

function fixture(initial: string | null) {
  const callbacks = new Map<string, Set<(file: TFile) => void>>();
  const file = new TFile("docs/child.md");
  let text = initial;
  const app = {
    vault: {
      on: (name: string, callback: (file: TFile) => void) => {
        if (!callbacks.has(name)) callbacks.set(name, new Set());
        callbacks.get(name)?.add(callback);
        return () => callbacks.get(name)?.delete(callback);
      },
      getAbstractFileByPath: (path: string) => path === file.path && text !== null ? file : null,
      cachedRead: async () => text
    },
    workspace: { openLinkText: vi.fn() }
  };
  const event = (name: string) => callbacks.get(name)?.forEach(callback => callback(file));
  const setText = (value: string | null) => { text = value; event("modify"); };
  return { app: app as unknown as App, callbacks, event, file, setText };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("render lifecycle", () => {
  it("renders headings, content and nested directives as text; opens the target", async () => {
    const { app } = fixture("# Heading\nparagraph\n::include{file=nested.md}");
    const el = document.createElement("span");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load();
    await settle();
    expect(el.querySelector("h1")?.textContent).toBe("Heading");
    expect(el.textContent).toContain("paragraph");
    expect(el.textContent).toContain("::include{file=nested.md}");
    el.querySelector("a")?.click();
    expect(app.workspace.openLinkText).toHaveBeenCalledWith("docs/child.md", "docs/index.md", false);
    child.unload();
  });
  it("independently updates views and reports missing or non-Markdown files", async () => {
    const { app, setText, callbacks, file } = fixture(null);
    const a = document.createElement("span");
    const b = document.createElement("span");
    const first = new IncludeRender(a, app, "docs/index.md", "child.md");
    const second = new IncludeRender(b, app, "docs/index.md", "child.md");
    first.load(); second.load(); await settle();
    expect(a.textContent).toContain("Include not found: child.md");
    setText("# Updated"); await settle();
    expect(a.querySelector("h1")?.textContent).toBe("Updated");
    expect(b.querySelector("h1")?.textContent).toBe("Updated");
    file.extension = "png"; setText("not markdown"); await settle();
    expect(a.textContent).toContain("Include not found");
    first.unload(); second.unload();
    expect([...callbacks.values()].every(set => set.size === 0)).toBe(true);
  });
  it("does not allow stale reads to overwrite newer content", async () => {
    const { app, event } = fixture("# old");
    let finish!: (value: string) => void;
    const read = vi.spyOn(app.vault, "cachedRead");
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    read.mockResolvedValue("# new");
    const el = document.createElement("span");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load();
    event("modify"); await settle();
    finish("# old"); await settle();
    expect(el.querySelector("h1")?.textContent).toBe("new");
    child.unload();
    expect(MarkdownRenderer.render).toBeDefined();
  });
});
