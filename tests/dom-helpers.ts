/** The public Obsidian DOM extensions, installed in each test window's realm. */
export function installDomHelpers(view: Window & typeof globalThis): void {
  const create = function(this: Node, tag: keyof HTMLElementTagNameMap, options?: DomElementInfo | string, callback?: (el: HTMLElement) => void): HTMLElement {
    const document = this.nodeType === 9 ? this as Document : this.ownerDocument!;
    const el = document.createElement(tag), info = typeof options === "string" ? { cls: options } : options ?? {};
    if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
    if (typeof info.text === "string") el.textContent = info.text;
    else if (info.text) el.append(info.text);
    for (const [name, value] of Object.entries(info.attr ?? {})) if (value !== null) el.setAttribute(name, String(value));
    callback?.(el); this.appendChild(el); return el;
  };
  for (const [name, tag] of [["createDiv", "div"], ["createSpan", "span"]] as const) Object.defineProperty(view.Node.prototype, name, {
    configurable: true, value: function(this: Node, options?: DomElementInfo | string, callback?: (el: HTMLElement) => void) { return create.call(this, tag, options, callback); }
  });
  Object.defineProperty(view.Node.prototype, "createEl", { configurable: true, value: create });
  Object.defineProperty(view.Node.prototype, "instanceOf", { configurable: true, value: function(this: Node, type: { name: string }) {
    const realm = this.ownerDocument?.defaultView ?? view;
    const constructor = (realm as unknown as Record<string, unknown>)[type.name];
    return typeof constructor === "function" && this instanceof constructor;
  } });
}
