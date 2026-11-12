import { App, Editor, FuzzySuggestModal, MarkdownPostProcessorContext, Notice, Plugin, TFile } from "obsidian";
import { parseDirective } from "./include-parser";
import { IncludeRender } from "./embed-renderer";
import { livePreview } from "./live-preview";
import { conversions } from "./conversion";
import { isRepresentablePath, relativePath } from "./path-resolver";
import { IncludeReferenceUpdates } from "./reference-updates";
import { IncludeLinkIndex } from "./native-link-index";
import { DEFAULT_SETTINGS, IncludeSettings, IncludeSettingsTab, readSettings } from "./settings";
import { IncludeSuggest } from "./include-suggest";
import { prioritizeIncludeSuggest } from "./native-suggestions";

class FilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private choose: (file: TFile) => void) { super(app); }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
}

export default class GitLabIncludes extends Plugin {
  settings: IncludeSettings = { ...DEFAULT_SETTINGS };
  private suggest: IncludeSuggest | null = null;

  async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.addSettingTab(new IncludeSettingsTab(this.app, this));
    this.suggest = new IncludeSuggest(this.app, () => this.settings.shorthand);
    this.registerEditorSuggest(this.suggest);
    prioritizeIncludeSuggest(this.app, this.suggest);
    this.addChild(new IncludeReferenceUpdates(this.app));
    this.addChild(new IncludeLinkIndex(this.app));
    this.registerMarkdownPostProcessor((el, ctx) => this.renderReading(el, ctx));
    this.registerEditorExtension(livePreview(this.app));
    this.addCommand({
      id: "insert-include",
      name: "Insert GitLab include",
      editorCallback: (editor, info) => { if (info.file) this.insert(editor, info.file); }
    });
    this.addCommand({
      id: "convert-embeds",
      name: "Convert Markdown embeds to GitLab includes",
      editorCallback: (editor, info) => {
        if (!info.file) return;
        const source = info.file.path;
        const result = conversions(editor.getValue(), source, link => this.app.metadataCache.getFirstLinkpathDest(link, source)?.path ?? null);
        if (result.changes.length) editor.transaction({
          changes: result.changes.map(change => ({ from: editor.offsetToPos(change.from), to: editor.offsetToPos(change.to), text: change.text }))
        });
        new Notice(`Converted ${result.changes.length} embed(s). ${result.skipped} unsupported or unresolved embed(s) left unchanged.`);
      }
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, info) => {
      if (info.file) menu.addItem(item => item.setTitle("Insert GitLab include").setIcon("file-plus").onClick(() => {
        if (info.file) this.insert(editor, info.file);
      }));
    }));
  }

  async setShorthand(value: string): Promise<void> {
    this.settings.shorthand = value;
    this.suggest?.close();
    await this.saveData(this.settings);
  }

  async onExternalSettingsChange(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.suggest?.close();
  }

  private insert(editor: Editor, source: TFile): void {
    new FilePicker(this.app, file => {
      const path = relativePath(source.path, file.path);
      if (!isRepresentablePath(path)) { new Notice("This filename cannot be represented in a GitLab include."); return; }
      const from = editor.getCursor("from");
      const to = editor.getCursor("to");
      const prefix = from.ch > 0 ? "\n" : "";
      const suffix = to.ch < editor.getLine(to.line).length ? "\n" : "";
      editor.replaceSelection(`${prefix}::include{file=${path}}${suffix}`);
    }).open();
  }

  private renderReading(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    if (el.closest(".gitlab-include")) return;
    for (const paragraph of Array.from(el.querySelectorAll("p"))) {
      if (paragraph.closest(".gitlab-include")) continue;
      const nodes = Array.from(paragraph.childNodes);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const previous = i === 0 || (nodes[i - 1] instanceof HTMLBRElement);
        const next = i === nodes.length - 1 || (nodes[i + 1] instanceof HTMLBRElement);
        const lines = (node.textContent ?? "").split("\n");
        const fragment = document.createDocumentFragment();
        let changed = false;
        lines.forEach((line, index) => {
          if (index) fragment.append("\n");
          const path = (index > 0 || previous) && (index < lines.length - 1 || next) ? parseDirective(line) : null;
          if (path === null) { fragment.append(line); return; }
          const container = document.createElement("span");
          container.className = "gitlab-include";
          fragment.append(container);
          ctx.addChild(new IncludeRender(container, this.app, ctx.sourcePath, path));
          changed = true;
        });
        if (changed) node.replaceWith(fragment);
      }
    }
  }
}
