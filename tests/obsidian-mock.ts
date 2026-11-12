export class Component {
  private children = new Set<Component>();
  private cleanups: (() => void)[] = [];
  load(): void { this.onload(); }
  onload(): void {}
  onunload(): void {}
  unload(): void { this.onunload(); for (const child of this.children) child.unload(); for (const cleanup of this.cleanups) cleanup(); }
  addChild<T extends Component>(child: T): T { this.children.add(child); child.load(); return child; }
  removeChild<T extends Component>(child: T): T { if (this.children.delete(child)) child.unload(); return child; }
  registerEvent(cleanup: () => void): void { this.cleanups.push(cleanup); }
}
export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) { super(); }
}
export class TFile {
  constructor(public path: string, public extension = "md") {}
  get name(): string { return this.path.split("/").pop() ?? ""; }
}
export const MarkdownRenderer = {
  async render(_app: unknown, markdown: string, el: HTMLElement): Promise<void> {
    for (const line of markdown.split("\n")) {
      const element = document.createElement(line.startsWith("# ") ? "h1" : "p");
      element.textContent = line.startsWith("# ") ? line.slice(2) : line;
      el.appendChild(element);
    }
  }
};
