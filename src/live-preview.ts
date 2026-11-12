import { App, editorInfoField, editorLivePreviewField } from "obsidian";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { findIncludes, IncludeLine } from "./include-parser";
import { IncludeRender } from "./embed-renderer";
import { onEmbedClick } from "./embed-interactions";

export const editInclude = StateEffect.define<number>({ map: (position, changes) => changes.mapPos(position) });

const mounts = new WeakMap<HTMLElement, IncludeRender>();

class IncludeWidget extends WidgetType {
  constructor(private app: App, private source: string, private path: string) { super(); }
  eq(other: IncludeWidget): boolean { return this.source === other.source && this.path === other.path; }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement("div");
    el.className = "gitlab-include";
    const child = new IncludeRender(el, this.app, this.source, this.path);
    mounts.set(el, child);
    child.load();
    // Native embeds render asynchronously and can change height after mounting.
    const observer = new ResizeObserver(() => view.requestMeasure());
    observer.observe(el, { box: "border-box" });
    child.register(() => observer.disconnect());
    child.register(onEmbedClick(el, () => {
      const position = view.posAtDOM(el);
      const include = findIncludes(view.state.doc.toString()).find(value => value.from <= position && value.to >= position);
      if (!include) return;
      view.focus();
      view.dispatch({
        selection: { anchor: include.to, head: include.from },
        effects: editInclude.of(include.from),
        scrollIntoView: true
      });
    }));
    return el;
  }
  // The embedded note handles its own selection and controls. Letting the outer
  // editor handle these events turns a drag inside the embed into source edits.
  ignoreEvent(): boolean { return true; }
  destroy(dom: HTMLElement): void {
    mounts.get(dom)?.unload();
    mounts.delete(dom);
  }
}

export function livePreview(app: App) {
  function build(state: EditorState, includes: IncludeLine[], editing: number | null): DecorationSet {
    if (!state.field(editorLivePreviewField, false)) return Decoration.none;
    const source = state.field(editorInfoField, false)?.file?.path;
    if (!source) return Decoration.none;
    return Decoration.set(includes.map(include => {
      const widget = new IncludeWidget(app, source, include.path);
      const active = state.selection.ranges.some(selection =>
        (selection.empty || editing === include.from) && selection.from >= include.from && selection.to <= include.to
      );
      // Reveal source for an editing caret or an explicit click. A selection
      // passing over the embed must keep its directive hidden.
      return active
        ? Decoration.widget({ widget, block: true, side: 1 }).range(include.to)
        : Decoration.replace({ widget, block: true, inclusive: false }).range(include.from, include.to);
    }), true);
  }

  // Block decorations must be supplied directly from state so CodeMirror can
  // account for their height before calculating the viewport.
  return StateField.define<{ source: string | null; includes: IncludeLine[]; editing: number | null; decorations: DecorationSet }>({
    create(state) {
      const includes = findIncludes(state.doc.toString());
      const source = state.field(editorInfoField, false)?.file?.path ?? null;
      return { source, includes, editing: null, decorations: build(state, includes, null) };
    },
    update(value, transaction) {
      const source = transaction.state.field(editorInfoField, false)?.file?.path ?? null;
      if (!transaction.docChanged && !transaction.selection && !transaction.effects.some(effect => effect.is(editInclude)) &&
          transaction.startState.field(editorLivePreviewField, false) === transaction.state.field(editorLivePreviewField, false) &&
          value.source === source) return value;
      const includes = transaction.docChanged ? findIncludes(transaction.state.doc.toString()) : value.includes;
      let editing = value.editing === null || value.source !== source ? null : transaction.changes.mapPos(value.editing);
      for (const effect of transaction.effects) if (effect.is(editInclude)) editing = effect.value;
      const include = includes.find(include => include.from === editing);
      if (!include || !transaction.state.selection.ranges.some(selection => selection.from >= include.from && selection.to <= include.to)) editing = null;
      return { source, includes, editing, decorations: build(transaction.state, includes, editing) };
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations)
  });
}
