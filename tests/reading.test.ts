// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import GitLabIncludes from "../src/main";
import { TFile } from "./obsidian-mock";
import { App, MarkdownPostProcessorContext } from "obsidian";
import { installDomHelpers } from "./dom-helpers";

describe("reading view postprocessor", () => {
  it("renders independent include lines without altering source or code examples", async () => {
    const root = document.createElement("div");
    const paragraph = document.createElement("p");
    paragraph.textContent = "before\n::include{file=one.md}\n::include{file=two.md}\nafter";
    const pre = document.createElement("pre");
    pre.textContent = "::include{file=one.md}";
    root.append(paragraph, pre);
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
    await plugin.onload();
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
  it("recognizes line breaks and creates embeds in a different window's document", async () => {
    const frame = document.createElement("iframe"); document.body.append(frame);
    const doc = frame.contentDocument!;
    installDomHelpers(frame.contentWindow as Window & typeof globalThis);
    doc.body.innerHTML = "<p>before<br>::include{file=one.md}<br>after</p>";
    expect(doc.querySelector("br") instanceof HTMLBRElement).toBe(false);
    const file = new TFile("docs/one.md");
    const app = { vault: { on: () => () => {}, cachedRead: async () => "# Heading", getAbstractFileByPath: (path: string) => path === file.path ? file : null }, workspace: { on: () => () => {} } };
    const plugin = new GitLabIncludes(app as unknown as App, {} as never); await plugin.onload();
    const children: { load: () => void; unload: () => void }[] = [];
    const ctx = { sourcePath: "docs/index.md", addChild: (child: typeof children[number]) => { children.push(child); child.load(); } };
    const processor = (plugin as unknown as { processor: (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void }).processor;
    processor(doc.body, ctx as unknown as MarkdownPostProcessorContext);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(doc.querySelectorAll(".gitlab-include")).toHaveLength(1);
    expect(doc.querySelector(".gitlab-include-stage")?.ownerDocument).toBe(doc);
    for (const child of children) child.unload(); plugin.unload(); frame.remove();
  });
});
