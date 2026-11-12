// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import GitLabIncludes from "../src/main";
import { TFile } from "./obsidian-mock";
import { App, MarkdownPostProcessorContext } from "obsidian";

describe("reading view postprocessor", () => {
  it("renders independent include lines without altering source or code examples", async () => {
    const root = document.createElement("div");
    const paragraph = document.createElement("p");
    paragraph.textContent = "before\n::include{file=one.md}\n::include{file=two.md}\nafter";
    const pre = document.createElement("pre");
    pre.textContent = "::include{file=one.md}";
    root.append(paragraph, pre);
    HTMLElement.prototype.createEl = function(this: HTMLElement, tag: string, options: { cls?: string; text?: string }) {
      const el = document.createElement(tag);
      if (options.cls) el.className = options.cls;
      if (options.text) el.textContent = options.text;
      this.appendChild(el);
      return el;
    } as typeof HTMLElement.prototype.createEl;
    HTMLElement.prototype.createDiv = function(this: HTMLElement, options: { cls: string }) {
      const el = document.createElement("div");
      el.className = options.cls;
      this.appendChild(el);
      return el;
    } as typeof HTMLElement.prototype.createDiv;
    const files = [new TFile("docs/one.md"), new TFile("docs/two.md")];
    const app = {
      vault: {
        on: () => () => {},
        getAbstractFileByPath: (path: string) => files.find(file => file.path === path),
        cachedRead: async (file: TFile) => `# ${file.name}`
      },
      workspace: { on: () => () => {}, openLinkText: vi.fn() }
    };
    const plugin = new GitLabIncludes(app as unknown as App, {} as never);
    plugin.onload();
    const children: { load: () => void; unload: () => void }[] = [];
    const ctx = { sourcePath: "docs/index.md", addChild: (child: typeof children[number]) => { children.push(child); child.load(); } };
    const processor = (plugin as unknown as { processor: (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void }).processor;
    processor(root, ctx as unknown as MarkdownPostProcessorContext);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(root.querySelectorAll(".gitlab-include")).toHaveLength(2);
    expect(Array.from(root.querySelectorAll(".gitlab-include-stage")).map(el => el.textContent)).toEqual(["![](one.md)", "![](two.md)"]);
    expect(paragraph.textContent).toContain("before");
    expect(paragraph.textContent).toContain("after");
    expect(pre.textContent).toBe("::include{file=one.md}");
    for (const child of children) child.unload();
  });
});
