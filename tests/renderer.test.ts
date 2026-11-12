// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { IncludeRender } from "../src/embed-renderer";
import { App } from "obsidian";
import { Component, MarkdownRenderer, TFile } from "./obsidian-mock";

afterEach(() => vi.restoreAllMocks());

function fixture(initial: string | null, path = "docs/child.md") {
  const callbacks = new Map<string, Set<(file: TFile) => void>>();
  const file = new TFile(path);
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
    }
  };
  // Simulate an asynchronous native embed without reimplementing its parser.
  const render = vi.spyOn(MarkdownRenderer, "render").mockImplementation(async (_app, _markdown, el) => {
    el.textContent = await app.vault.cachedRead() ?? "";
  });
  const event = (name: string) => callbacks.get(name)?.forEach(callback => callback(file));
  const setText = (value: string | null) => { text = value; event("modify"); };
  return { app: app as unknown as App, callbacks, event, file, setText, render };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("native embed rendering", () => {
  it("uses the full native embed factory and unloads it with its owner", async () => {
    const { app, file, render } = fixture("content");
    const cleanup = vi.fn();
    const native = Object.assign(new Component(), { loadFile: vi.fn(async () => {}) });
    native.register(cleanup);
    const create = vi.fn(() => native);
    Object.assign(app, { embedRegistry: { getEmbedCreator: vi.fn(() => create) } });
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load(); await settle();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ app, containerEl: el, sourcePath: "docs/index.md", displayMode: false, showInline: true }), file, "");
    expect(native.loadFile).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();
    expect(el.matches(".internal-embed")).toBe(true);
    expect(el.getAttribute("src")).toBe("child.md");
    child.unload();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("falls back to the public renderer if the native factory changes or fails", async () => {
    const { app, render } = fixture("content");
    const cleanup = vi.fn();
    const native = Object.assign(new Component(), { loadFile: vi.fn(async () => { throw new Error("incompatible embed"); }) });
    native.register(cleanup);
    Object.assign(app, { embedRegistry: { getEmbedCreator: () => () => native } });
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load(); await settle();
    expect(render).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(el.querySelector(".internal-embed")).toBeNull();
    expect(el.textContent).toBe("content");
    child.unload();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("keeps the native instance on target edits and unrelated renames", async () => {
    const { app, setText, event } = fixture("content");
    const native = Object.assign(new Component(), { loadFile: vi.fn(async () => {}) });
    const create = vi.fn(() => native);
    Object.assign(app, { embedRegistry: { getEmbedCreator: () => create } });
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load(); await settle();
    setText("updated"); event("rename"); await settle();
    expect(create).toHaveBeenCalledOnce();
    expect(native.loadFile).toHaveBeenCalledOnce();
    expect(el.matches(".internal-embed")).toBe(true);
    child.unload();
  });
  it("keeps rendering when the source and target move together without text changes", async () => {
    const { app, file, event } = fixture("content");
    const source = new TFile("docs/index.md");
    const original = app.vault.getAbstractFileByPath;
    vi.spyOn(app.vault, "getAbstractFileByPath").mockImplementation(path => path === source.path ? source as never : original(path));
    const native = Object.assign(new Component(), { loadFile: vi.fn(async () => {}) });
    const create = vi.fn(() => native);
    Object.assign(app, { embedRegistry: { getEmbedCreator: () => create } });
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, source.path, "child.md");
    child.load(); await settle();
    source.path = "archive/index.md";
    file.path = "archive/child.md";
    event("rename"); await settle();
    expect(create).toHaveBeenCalledOnce();
    expect(el.matches(".internal-embed")).toBe(true);
    expect(el.textContent).not.toContain("Include not found");
    child.unload();
  });
  it("delegates a note embed to Obsidian with the source path and a managed component", async () => {
    const { app, render } = fixture("# Heading\nparagraph\n::include{file=nested.md}");
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load();
    await settle();
    expect(render).toHaveBeenCalledWith(app, "![](child.md)", el.firstElementChild, "docs/index.md", expect.any(Component));
    expect(el.textContent).toContain("::include{file=nested.md}");
    expect(el.querySelector(".gitlab-include-header")).toBeNull();
    child.unload();
  });
  it("encodes literal filenames without losing relative path segments", async () => {
    const { app, render } = fixture("content", "kansio/Ä # [x] (1) %.md");
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, "docs/index.md", "../kansio/Ä # [x] (1) %.md");
    child.load();
    await settle();
    expect(render.mock.calls[0][1]).toBe("![](../kansio/%C3%84%20%23%20%5Bx%5D%20%281%29%20%25.md)");
    child.unload();
  });
  it("provides an open-note control with modifier and middle-click support in the fallback", async () => {
    const { app, render } = fixture("content");
    const openLinkText = vi.fn();
    Object.assign(app, { workspace: { openLinkText } });
    render.mockImplementationOnce(async (_app, _markdown, el) => {
      const embed = document.createElement("span");
      embed.className = "markdown-embed";
      el.append(embed);
    });
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load(); await settle();
    const open = el.querySelector<HTMLAnchorElement>(".markdown-embed-link")!;
    expect(open.getAttribute("aria-label")).toBe("Open link");
    for (const options of [{ button: 0 }, { button: 0, ctrlKey: true }, { button: 1 }]) {
      const event = new MouseEvent(options.button === 1 ? "auxclick" : "click", { ...options, cancelable: true });
      open.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(openLinkText.mock.calls).toEqual([
      ["docs/child.md", "docs/index.md", false],
      ["docs/child.md", "docs/index.md", true],
      ["docs/child.md", "docs/index.md", true]
    ]);
    child.unload();
  });
  it("independently updates views and reports missing or non-Markdown files", async () => {
    const { app, setText, callbacks, file } = fixture(null);
    const a = document.createElement("div");
    const b = document.createElement("div");
    const first = new IncludeRender(a, app, "docs/index.md", "child.md");
    const second = new IncludeRender(b, app, "docs/index.md", "child.md");
    first.load(); second.load(); await settle();
    expect(a.textContent).toContain("Include not found: child.md");
    setText("# Updated"); await settle();
    expect(a.textContent).toBe("# Updated");
    expect(b.textContent).toBe("# Updated");
    file.extension = "png"; setText("not markdown"); await settle();
    expect(a.textContent).toContain("Include not found");
    first.unload(); second.unload();
    expect([...callbacks.values()].every(set => set.size === 0)).toBe(true);
  });
  it("does not allow stale renders to overwrite newer content", async () => {
    const { app, event, render } = fixture("# new");
    let finish!: () => void;
    render.mockImplementationOnce(async (_app, _markdown, el) => {
      await new Promise<void>(resolve => { finish = resolve; });
      el.textContent = "# old";
    });
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load();
    event("modify"); await settle();
    finish(); await settle();
    expect(el.textContent).toBe("# new");
    expect(el.children).toHaveLength(1);
    child.unload();
  });
  it("reports render failures and unloads native embed components", async () => {
    const { app, render } = fixture("content");
    const cleanup = vi.fn();
    render.mockImplementationOnce(async (_app, _markdown, _el, _source, component) => {
      component?.register(cleanup);
      throw new Error("unreadable target");
    });
    const el = document.createElement("div");
    const child = new IncludeRender(el, app, "docs/index.md", "child.md");
    child.load(); await settle();
    expect(el.textContent).toBe("Unable to render include: child.md");
    child.unload();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
