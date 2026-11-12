export class Component {
  private children = new Set<Component>();
  private cleanups: (() => void)[] = [];
  load(): void { this.onload(); }
  onload(): void {}
  onunload(): void {}
  unload(): void { this.onunload(); for (const child of this.children) child.unload(); for (const cleanup of this.cleanups) cleanup(); }
  addChild<T extends Component>(child: T): T { this.children.add(child); child.load(); return child; }
  removeChild<T extends Component>(child: T): T { if (this.children.delete(child)) child.unload(); return child; }
  register(cleanup: () => void): void { this.cleanups.push(cleanup); }
  registerEvent(cleanup: () => void): void { this.cleanups.push(cleanup); }
}
export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) { super(); }
}
export class TFile {
  stat = { mtime: 0, ctime: 0, size: 0 };
  constructor(public path: string, public extension = "md") {}
  get name(): string { return this.path.split("/").pop() ?? ""; }
  get basename(): string { return this.name.replace(/\.md$/, ""); }
}
export class TFolder { constructor(public path: string, public children: (TFile | TFolder)[] = []) {} }
export const editorInfoField = StateField.define({ create: () => null, update: value => value });
export const editorLivePreviewField = StateField.define({ create: () => true, update: value => value });
export class FuzzySuggestModal {}
export class EditorSuggest<T> {
  context: import("obsidian").EditorSuggestContext | null = null;
  scope = { register: () => {} };
  constructor(public app: import("obsidian").App) {}
  setInstructions(): void {}
  close(): void { this.context = null; }
  renderSuggestion(_value: T, _el: HTMLElement): void { void _value; void _el; }
}
export class PluginSettingTab {
  constructor(public app: unknown, public plugin: unknown) {}
}
export function prepareFuzzySearch(query: string) {
  return (text: string) => {
    const matches: [number, number][] = []; let next = 0;
    for (const char of query.toLowerCase()) {
      const from = text.toLowerCase().indexOf(char, next);
      if (from < 0) return null;
      matches.push([from, from + 1]); next = from + 1;
    }
    return { matches, score: -text.length };
  };
}
export function renderMatches(el: HTMLElement, text: string): void { el.textContent = text; }
export class Notice { constructor(public message: string) {} }
export function setIcon(el: HTMLElement, name: string): void { el.dataset.icon = name; }
export class Plugin extends Component {
  constructor(public app: unknown) { super(); }
  processor: ((el: HTMLElement, ctx: unknown) => void) | null = null;
  registerMarkdownPostProcessor(processor: (el: HTMLElement, ctx: unknown) => void): void { this.processor = processor; }
  registerEditorExtension(): void {}
  registerEditorSuggest(): void {}
  addSettingTab(): void {}
  async loadData(): Promise<unknown> { return undefined; }
  async saveData(_data: unknown): Promise<void> { void _data; }
  addCommand(): void {}
}
export const MarkdownRenderer = {
  async render(_app: unknown, markdown: string, el: HTMLElement, _source?: string, _component?: Component): Promise<void> {
    void _source; void _component;
    for (const line of markdown.split("\n")) {
      const element = document.createElement(line.startsWith("# ") ? "h1" : "p");
      element.textContent = line.startsWith("# ") ? line.slice(2) : line;
      el.appendChild(element);
    }
  }
};
import { StateField } from "@codemirror/state";
