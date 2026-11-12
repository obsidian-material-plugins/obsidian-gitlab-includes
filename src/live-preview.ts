import { App, editorInfoField, editorLivePreviewField } from "obsidian";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { findIncludes, IncludeLine } from "./include-parser";
import { IncludeRender } from "./embed-renderer";

const mounts = new WeakMap<HTMLElement, IncludeRender>();

class IncludeWidget extends WidgetType {
  constructor(private app: App, private source: string, private path: string) { super(); }
  eq(other: IncludeWidget): boolean { return this.source === other.source && this.path === other.path; }
  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "gitlab-include internal-embed";
    const child = new IncludeRender(el, this.app, this.source, this.path);
    mounts.set(el, child);
    child.load();
    return el;
  }
  ignoreEvent(): boolean { return false; }
  destroy(dom: HTMLElement): void {
    mounts.get(dom)?.unload();
    mounts.delete(dom);
  }
}

export function livePreview(app: App) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    includes: IncludeLine[];
    constructor(view: EditorView) {
      this.includes = findIncludes(view.state.doc.toString());
      this.decorations = this.build(view);
    }
    update(update: ViewUpdate): void {
      if (update.docChanged) this.includes = findIncludes(update.state.doc.toString());
      if (update.docChanged || update.selectionSet || update.startState.field(editorLivePreviewField, false) !== update.state.field(editorLivePreviewField, false) ||
          update.startState.field(editorInfoField, false)?.file?.path !== update.state.field(editorInfoField, false)?.file?.path) {
        this.decorations = this.build(update.view);
      }
    }
    build(view: EditorView): DecorationSet {
      if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;
      const source = view.state.field(editorInfoField, false)?.file?.path;
      if (!source) return Decoration.none;
      const ranges = this.includes.filter(include => !view.state.selection.ranges.some(selection =>
        selection.from <= include.to && selection.to >= include.from
      )).map(include => Decoration.replace({ widget: new IncludeWidget(app, source, include.path) }).range(include.from, include.to));
      return Decoration.set(ranges, true);
    }
  }, { decorations: value => value.decorations });
}
