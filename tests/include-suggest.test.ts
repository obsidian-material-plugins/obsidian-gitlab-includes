// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { App, Editor, EditorSuggestContext, EditorSuggestTriggerInfo, EditorTransaction } from "obsidian";
import { TFile } from "./obsidian-mock";
import { IncludeSuggest, includeCompletion, shorthandTrigger } from "../src/include-suggest";
import { prioritizeIncludeSuggest, renderNoteSuggestion } from "../src/native-suggestions";
import { IncludeSettingsTab, readSettings, shorthandError } from "../src/settings";
import GitLabIncludes from "../src/main";

function editorFor(initial: string, line = 0, ch = initial.split("\n")[line].length) {
  let text = initial;
  const offset = (position: { line: number; ch: number }) => text.split("\n").slice(0, position.line).reduce((sum, value) => sum + value.length + 1, 0) + position.ch;
  const transaction = vi.fn((change: EditorTransaction) => {
    for (const edit of [...(change.changes ?? [])].reverse()) text = text.slice(0, offset(edit.from)) + edit.text + text.slice(offset(edit.to ?? edit.from));
  });
  const editor = { getLine: (line: number) => text.split("\n")[line], getRange: (from: { line: number; ch: number }, to: { line: number; ch: number }) => text.slice(offset(from), offset(to)), transaction, focus: vi.fn() };
  return { editor: editor as unknown as Editor, cursor: { line, ch }, text: () => text, transaction };
}
const context = (editor: Editor, file: TFile, trigger: EditorSuggestTriggerInfo): EditorSuggestContext => ({ ...trigger, editor, file: file as never });

describe("shorthand recognition and insertion", () => {
  it("recognizes default, Unicode and literal custom triggers without matching partial words", () => {
    expect(shorthandTrigger("::", { line: 0, ch: 2 }, "::")?.query).toBe("");
    expect(shorthandTrigger("before .*Ä note", { line: 2, ch: 15 }, ".*")).toEqual({ start: { line: 2, ch: 7 }, end: { line: 2, ch: 15 }, query: "Ä note" });
    expect(shorthandTrigger("12::30", { line: 0, ch: 6 }, "::")).toBeNull();
    expect(shorthandTrigger("::child", { line: 0, ch: 7 }, "")).toBeNull();
  });
  it("leaves directives, escaped shorthand and inline code alone", () => {
    for (const line of ["::include{file=child.md}", "\\::", "`code ::", "``code ` ::"]) expect(shorthandTrigger(line, { line: 0, ch: line.length }, "::")).toBeNull();
    expect(shorthandTrigger("`code` ::", { line: 0, ch: 9 }, "::")).not.toBeNull();
    expect(shorthandTrigger("::include{file=child.md}", { line: 0, ch: 2 }, "::")).toBeNull();
  });
  it("inserts a relative directive as a standalone line without losing surrounding text", () => {
    const value = editorFor("Before ::chi after", 0, 12);
    const trigger = shorthandTrigger(value.editor.getLine(0), value.cursor, "::")!;
    const edit = includeCompletion(value.editor, trigger, "::", "../notes/Ä child.md")!;
    value.editor.transaction(edit);
    expect(value.text()).toBe("Before \n::include{file=../notes/Ä child.md}\n after");
    expect(edit.selection?.from).toEqual({ line: 1, ch: "::include{file=../notes/Ä child.md}".length });
    expect(value.transaction).toHaveBeenCalledOnce();
  });
  it("removes whitespace around a standalone shorthand and consumes auto-closed wiki brackets", () => {
    for (const [text, shorthand, ch] of [["  ::child  ", "::", 9], ["[[child]]", "[[", 7]] as const) {
      const value = editorFor(text, 0, ch), trigger = shorthandTrigger(text, value.cursor, shorthand)!;
      value.editor.transaction(includeCompletion(value.editor, trigger, shorthand, "child.md")!);
      expect(value.text()).toBe("::include{file=child.md}");
    }
  });
  it("rejects stale suggestion contexts and unrepresentable paths", () => {
    const value = editorFor("::child"), trigger = shorthandTrigger("::child", value.cursor, "::")!;
    expect(includeCompletion(value.editor, trigger, "@@", "child.md")).toBeNull();
    expect(includeCompletion(value.editor, trigger, "::", "bad\npath.md")).toBeNull();
  });
});

describe("Markdown suggestion picker", () => {
  const source = new TFile("docs/source.md"), child = new TFile("notes/Ä child.md"), image = new TFile("notes/child.png", "png");
  const app = { vault: { getMarkdownFiles: () => [source, child, image] }, workspace: {} } as unknown as App;
  it("lists only Markdown files and searches note names and folders", () => {
    const suggest = new IncludeSuggest(app, () => "::"), value = editorFor("::");
    const base = context(value.editor, source, { start: { line: 0, ch: 0 }, end: value.cursor, query: "" });
    expect(suggest.getSuggestions(base).map(item => item.file.path)).toEqual([source.path, child.path]);
    expect(suggest.getSuggestions({ ...base, query: "Äch" }).map(item => item.file.path)).toEqual([child.path]);
    expect(suggest.getSuggestions({ ...base, query: "notes/" }).map(item => item.file.path)).toEqual([child.path]);
  });
  it("avoids fenced examples and frontmatter, including after edits to preceding context", () => {
    const suggest = new IncludeSuggest(app, () => "::");
    for (const [text, line, allowed] of [["```md\n::", 1, false], ["~~~\n::", 1, false], ["```md\n```\n::", 2, true], ["---\ntags:\n::", 2, false], ["---\n---\n::", 2, true]] as const) {
      const value = editorFor(text, line, 2);
      expect(!!suggest.onTrigger(value.cursor, value.editor, source as never)).toBe(allowed);
    }
    const value = editorFor("::");
    expect(suggest.onTrigger(value.cursor, value.editor, image as never)).toBeNull();
  });
  it("selects using the live file paths and makes one autocomplete transaction", () => {
    const value = editorFor("::child"), suggest = new IncludeSuggest(app, () => "::");
    suggest.context = context(value.editor, source, shorthandTrigger("::child", value.cursor, "::")!);
    suggest.selectSuggestion(suggest.getSuggestions(suggest.context)[0]);
    expect(value.text()).toBe("::include{file=../notes/Ä child.md}");
    expect(value.transaction).toHaveBeenCalledWith(expect.anything(), "input.autocomplete");
    expect(suggest.context).toBeNull();
  });
  it("delegates row rendering to the native [[ renderer without changing it", () => {
    const native = { suggestManager: { getFileSuggestions: () => {} }, renderSuggestion: vi.fn() };
    const suggest = new IncludeSuggest(app, () => "::");
    const items = [native, suggest];
    const nativeApp = { workspace: { editorSuggest: { suggests: items } } } as unknown as App;
    prioritizeIncludeSuggest(nativeApp, suggest);
    expect(items).toEqual([suggest, native]);
    const item = { type: "file" as const, file: child as never, path: "notes/Ä child", score: 0, matches: null }, el = document.createElement("div");
    renderNoteSuggestion(nativeApp, item, el);
    expect(native.renderSuggestion).toHaveBeenCalledWith(item, el);
  });
});

describe("shorthand settings", () => {
  it("defaults to ::, preserves custom/disabled values, and validates persisted data", () => {
    expect(readSettings(null)).toEqual({ shorthand: "::" });
    expect(readSettings({ shorthand: "@@" })).toEqual({ shorthand: "@@" });
    expect(readSettings({ shorthand: "" })).toEqual({ shorthand: "" });
    expect(readSettings({ shorthand: "bad\nvalue" })).toEqual({ shorthand: "::" });
    expect(shorthandError("a b")).toBeTruthy();
    expect(shorthandError("x".repeat(33))).toBeTruthy();
  });
  it("loads, persists and reloads the setting through the plugin's own storage", async () => {
    const app = { vault: { on: () => () => {} }, workspace: { on: () => () => {} } } as unknown as App;
    const plugin = new GitLabIncludes(app, {} as never), load = vi.spyOn(plugin, "loadData").mockResolvedValue({ shorthand: "@@" }), save = vi.spyOn(plugin, "saveData");
    await plugin.onload(); expect(plugin.settings.shorthand).toBe("@@");
    const tab = new IncludeSettingsTab(app, plugin);
    await tab.setControlValue("shorthand", "!!");
    expect(save).toHaveBeenCalledWith({ shorthand: "!!" });
    await tab.setControlValue("shorthand", "bad value");
    expect(plugin.settings.shorthand).toBe("!!");
    load.mockResolvedValue({ shorthand: "::" }); await plugin.onExternalSettingsChange();
    expect(plugin.settings.shorthand).toBe("::"); plugin.unload();
  });
});
