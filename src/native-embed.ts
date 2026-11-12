import { App, Component, MarkdownRenderer, setIcon, TFile } from "obsidian";
import { relativePath } from "./path-resolver";

interface NativeEmbed extends Component {
  loadFile(): Promise<void>;
}

interface EmbedContext {
  app: App;
  containerEl: HTMLElement;
  linktext: string;
  sourcePath: string;
  showInline: boolean;
  displayMode: boolean;
  depth: number;
}

type EmbedApp = App & {
  embedRegistry?: {
    getEmbedCreator?: (file: TFile) => ((context: EmbedContext, file: TFile, subpath: string) => NativeEmbed) | null;
  };
};

export function mountNativeEmbed(app: App, file: TFile, container: HTMLElement, source: string, linktext: string, component: Component): NativeEmbed | null {
  // Obsidian's public renderer uses a reduced display-only embed. Isolate and
  // feature-detect the internal factory to use the same view as native embeds.
  const registry = (app as EmbedApp).embedRegistry;
  if (typeof registry?.getEmbedCreator === "function") {
    const el = container;
    el.classList.add("internal-embed", "is-loaded");
    el.setAttribute("src", linktext);
    el.setAttribute("alt", file.basename);
    el.contentEditable = "false";
    el.tabIndex = -1;
    let embed: NativeEmbed | null = null;
    try {
      const create = registry.getEmbedCreator(file);
      const candidate = create?.({ app, containerEl: el, linktext, sourcePath: source, showInline: true, displayMode: false, depth: 1 }, file, "");
      if (!(candidate instanceof Component) || typeof candidate.loadFile !== "function") throw new Error("Native embed factory unavailable");
      embed = candidate;
      component.addChild(embed);
      return embed;
    } catch {
      if (embed) component.removeChild(embed);
      el.replaceChildren();
      // A changed internal API must not break includes on future app versions.
    }
  }
  return null;
}

export async function renderFallbackEmbed(app: App, file: TFile, container: HTMLElement, source: string, component: Component): Promise<void> {
  // Public-API fallback, with literal filenames safely encoded as link syntax.
  const link = relativePath(source, file.path).split("/").map(segment =>
    encodeURIComponent(segment).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
  ).join("/");
  await MarkdownRenderer.render(app, `![](${link})`, container, source, component);
  const el = container.querySelector<HTMLElement>(".markdown-embed");
  if (el && !el.querySelector(".markdown-embed-link")) {
    const open = el.createEl("a", { cls: "markdown-embed-link", attr: { "aria-label": "Open link", href: file.path } });
    setIcon(open, "lucide-maximize-2");
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      void app.workspace.openLinkText(file.path, source, event.ctrlKey || event.metaKey || event.button === 1);
    };
    open.addEventListener("click", onClick);
    open.addEventListener("auxclick", onClick);
  }
}
