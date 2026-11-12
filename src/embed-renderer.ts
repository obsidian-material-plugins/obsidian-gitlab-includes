import { App, Component, MarkdownRenderChild, TFile } from "obsidian";
import { resolvePath } from "./path-resolver";
import { mountNativeEmbed, renderFallbackEmbed } from "./native-embed";

export class IncludeRender extends MarkdownRenderChild {
  private generation = 0;
  private content: Component | null = null;
  private dead = false;
  private nativeFile: TFile | null = null;
  private nativeLoad: Promise<void> | null = null;
  private sourceFile: TFile | null;

  constructor(el: HTMLElement, private app: App, private source: string, private path: string) {
    super(el);
    const file = app.vault.getAbstractFileByPath(source);
    this.sourceFile = file instanceof TFile ? file : null;
  }

  private get sourcePath(): string { return this.sourceFile?.path ?? this.source; }

  onload(): void {
    this.registerEvent(this.app.vault.on("modify", file => {
      // Native embeds already watch metadata and quick-preview changes. Keep
      // their instance, scroll and folding state intact when a target changes.
      if (file !== this.nativeFile && file.path === resolvePath(this.sourcePath, this.path)) void this.refresh();
    }));
    this.registerEvent(this.app.vault.on("create", file => {
      if (file.path === resolvePath(this.sourcePath, this.path)) void this.refresh();
    }));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (file.path === resolvePath(this.sourcePath, this.path)) void this.refresh();
    }));
    this.registerEvent(this.app.vault.on("rename", () => { void this.refresh(); }));
    void this.refresh();
  }

  onunload(): void {
    this.dead = true;
    this.generation++;
  }

  private async refresh(): Promise<void> {
    const generation = ++this.generation;
    if (this.nativeLoad) await this.nativeLoad;
    if (generation !== this.generation || this.dead) return;
    const target = resolvePath(this.sourcePath, this.path);
    const file = target ? this.app.vault.getAbstractFileByPath(target) : null;
    if (file === this.nativeFile && this.nativeFile) return;
    if (this.nativeFile) this.clearContent();
    if (file instanceof TFile && file.path === target && file.extension === "md") {
      this.clearContent();
      const component = this.addChild(new Component());
      const native = mountNativeEmbed(this.app, file, this.containerEl, this.sourcePath, this.path, component);
      if (native) {
        if (this.content) this.removeChild(this.content);
        this.content = component;
        this.nativeFile = file;
        const loading = (async () => {
          try { await native.loadFile(); }
          catch {
            this.clearContent();
            if (generation === this.generation && !this.dead) await this.renderFallback(generation, file);
          }
        })();
        this.nativeLoad = loading;
        await loading;
        if (this.nativeLoad === loading) this.nativeLoad = null;
        return;
      }
      this.removeChild(component);
      this.resetContainer();
    }
    await this.renderFallback(generation, file instanceof TFile && file.path === target && file.extension === "md" ? file : null);
  }

  private clearContent(): void {
    if (this.content) this.removeChild(this.content);
    this.content = null;
    this.nativeFile = null;
    this.resetContainer();
  }

  private resetContainer(): void {
    this.containerEl.replaceChildren();
    this.containerEl.classList.remove("internal-embed", "is-loaded", "markdown-embed", "inline-embed");
    this.containerEl.removeAttribute("src");
    this.containerEl.removeAttribute("alt");
  }

  private async renderFallback(generation: number, file: TFile | null): Promise<void> {
    const stage = this.containerEl.createDiv({ cls: "gitlab-include-stage" });
    stage.hidden = true;
    const component = this.addChild(new Component());
    try {
      if (!file) {
        stage.createEl("span", { cls: "gitlab-include-error", text: `Include not found: ${this.path}` });
      } else {
        await renderFallbackEmbed(this.app, file, stage, this.sourcePath, component);
      }
    } catch {
      stage.replaceChildren();
      stage.createEl("span", { cls: "gitlab-include-error", text: `Unable to render include: ${this.path}` });
    } finally {
      if (generation !== this.generation || this.dead) {
        this.removeChild(component);
        stage.remove();
      } else {
        if (this.content) this.removeChild(this.content);
        for (const child of Array.from(this.containerEl.children)) {
          if (child !== stage) child.remove();
        }
        this.content = component;
        stage.hidden = false;
      }
    }
  }
}
