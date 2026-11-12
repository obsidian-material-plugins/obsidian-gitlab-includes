import { App, Component, MarkdownRenderChild, MarkdownRenderer, TFile } from "obsidian";
import { resolvePath } from "./path-resolver";

export class IncludeRender extends MarkdownRenderChild {
  private generation = 0;
  private content: Component | null = null;
  private dead = false;

  constructor(el: HTMLElement, private app: App, private source: string, private path: string) {
    super(el);
  }

  onload(): void {
    this.registerEvent(this.app.vault.on("modify", file => {
      if (file.path === resolvePath(this.source, this.path)) void this.refresh();
    }));
    this.registerEvent(this.app.vault.on("create", file => {
      if (file.path === resolvePath(this.source, this.path)) void this.refresh();
    }));
    this.registerEvent(this.app.vault.on("delete", file => {
      if (file.path === resolvePath(this.source, this.path)) void this.refresh();
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
    const target = resolvePath(this.source, this.path);
    const file = target ? this.app.vault.getAbstractFileByPath(target) : null;
    const stage = document.createElement("span");
    stage.className = "gitlab-include-stage";
    stage.hidden = true;
    this.containerEl.appendChild(stage);
    const component = this.addChild(new Component());
    try {
      if (!(file instanceof TFile) || file.path !== target || file.extension !== "md") {
        stage.createEl("span", { cls: "gitlab-include-error", text: `Include not found: ${this.path}` });
      } else {
        const header = stage.createEl("a", { cls: "gitlab-include-header", text: file.name, href: "#" });
        header.addEventListener("click", event => {
          event.preventDefault();
          void this.app.workspace.openLinkText(file.path, this.source, event.ctrlKey || event.metaKey);
        });
        const body = stage.createDiv({ cls: "gitlab-include-content markdown-rendered" });
        const markdown = await this.app.vault.cachedRead(file);
        if (generation !== this.generation || this.dead) return;
        await MarkdownRenderer.render(this.app, markdown, body, file.path, component);
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
