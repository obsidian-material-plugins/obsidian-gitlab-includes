import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import { App, editorInfoField, editorLivePreviewField } from "obsidian";
import { editInclude, livePreview } from "../src/live-preview";

function fixture(live = true) {
  const doc = "before\n::include{file=child.md}\nafter";
  const field = livePreview({} as App);
  const file = { path: "index.md" };
  const state = EditorState.create({
    doc,
    extensions: [
      editorInfoField.init(() => ({ file }) as never),
      editorLivePreviewField.init(() => live),
      EditorState.allowMultipleSelections.of(true),
      field
    ]
  });
  const ranges = (value: EditorState) => {
    const result: { from: number; to: number; decoration: Decoration }[] = [];
    value.field(field).decorations.between(0, value.doc.length, (from, to, decoration) => { result.push({ from, to, decoration }); });
    return result;
  };
  return { state, ranges, file, field, from: 7, to: doc.indexOf("\nafter") };
}

describe("Live Preview embeds", () => {
  it("uses a block embed to replace an inactive directive", () => {
    const { state, ranges, from, to } = fixture();
    const [range] = ranges(state);
    expect(range.from).toBe(from);
    expect(range.to).toBe(to);
    expect(range.decoration.spec.block).toBe(true);
    expect(range.decoration.spec.widget).toBeDefined();
    expect(range.decoration.spec.widget.ignoreEvent()).toBe(true);
  });
  it("shows the source above the embed only for an editing caret on the directive", () => {
    const { state, ranges, from, to } = fixture();
    for (const selection of [
      EditorSelection.cursor(from),
      EditorSelection.cursor(from + 5),
      EditorSelection.cursor(to)
    ]) {
      const next = state.update({ selection: EditorSelection.create([selection]) }).state;
      const result = ranges(next);
      expect(result).toHaveLength(1);
      expect(result[0].from).toBe(to);
      expect(result[0].to).toBe(to);
      expect(result[0].decoration.spec.block).toBe(true);
      expect(result[0].decoration.spec.widget).toBeDefined();
    }
  });
  it("keeps source hidden for selections across or within the directive in either direction", () => {
    const { state, ranges, from, to } = fixture();
    for (const selection of [
      EditorSelection.range(0, state.doc.length),
      EditorSelection.range(state.doc.length, 0),
      EditorSelection.range(from, to),
      EditorSelection.range(to, from),
      EditorSelection.range(from + 2, from + 5),
      EditorSelection.range(from + 5, from + 2),
      EditorSelection.range(0, from + 5),
      EditorSelection.range(state.doc.length, from + 5)
    ]) {
      const next = state.update({ selection: EditorSelection.create([selection]) }).state;
      const result = ranges(next);
      expect(result).toHaveLength(1);
      expect(result[0].from).toBe(from);
      expect(result[0].to).toBe(to);
      expect(result[0].decoration.spec.block).toBe(true);
      expect(result[0].decoration.spec.widget).toBeDefined();
    }
  });
  it("handles multiple selections and restores the replacement when the cursor leaves", () => {
    const { state, ranges, from, to } = fixture();
    const selected = state.update({ selection: EditorSelection.create([
      EditorSelection.cursor(0), EditorSelection.cursor(from + 3)
    ]) }).state;
    expect(ranges(selected)[0].from).toBe(to);
    const next = selected.update({ selection: { anchor: state.doc.length } }).state;
    expect(ranges(next)[0].from).toBe(from);
    expect(ranges(next)[0].to).toBe(to);
  });
  it("reveals and selects the reference after an explicit embed click, without changing drag behavior", () => {
    const { state, ranges, from, to } = fixture();
    const clicked = state.update({ selection: { anchor: to, head: from }, effects: editInclude.of(from) }).state;
    expect(clicked.sliceDoc(clicked.selection.main.from, clicked.selection.main.to)).toBe("::include{file=child.md}");
    expect(ranges(clicked)[0].from).toBe(to);
    const editing = clicked.update({ selection: { anchor: from + 15, head: to - 1 } }).state;
    expect(ranges(editing)[0].from).toBe(to);
    const dragged = editing.update({ selection: { anchor: 0, head: state.doc.length } }).state;
    expect(ranges(dragged)[0].from).toBe(from);
    const selectedAgain = dragged.update({ selection: { anchor: from, head: to } }).state;
    expect(ranges(selectedAgain)[0].from).toBe(from);
  });
  it("updates directive offsets after edits and leaves Source mode literal", () => {
    const { state, ranges, from, to } = fixture();
    const next = state.update({ changes: { from: 0, insert: "new\n" } }).state;
    expect(ranges(next)[0].from).toBe(from + 4);
    expect(ranges(next)[0].to).toBe(to + 4);
    const source = fixture(false);
    expect(source.ranges(source.state)).toEqual([]);
  });
  it("rebuilds when Obsidian mutates a source TFile path in place", () => {
    const { state, file, field } = fixture();
    file.path = "moved/index.md";
    const next = state.update({}).state;
    expect(next.field(field).source).toBe("moved/index.md");
    expect(state.field(field).source).toBe("index.md");
    expect(next.field(field).decorations).not.toBe(state.field(field).decorations);
  });
});
