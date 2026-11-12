// Match the editor-side interaction around a native note embed. The native
// renderer owns links and controls; a plain click selects the source reference.
export function onEmbedClick(el: HTMLElement, edit: () => void): () => void {
  const win = el.ownerDocument.defaultView!;
  let timer: number | undefined;
  const cancel = () => { if (timer !== undefined) win.clearTimeout(timer); };
  const hasSelection = () => {
    const selection = win.getSelection();
    if (!selection || selection.isCollapsed) return false;
    for (let i = 0; i < selection.rangeCount; i++) {
      if (selection.getRangeAt(i).intersectsNode(el)) return true;
    }
    return false;
  };
  const down = (event: MouseEvent) => { if (event.detail > 1) cancel(); };
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.detail > 1 || event.shiftKey || hasSelection()) return;
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest("a, button, input, select, textarea, .markdown-embed-link, .collapse-indicator, .callout-title, .interactive-child, .cm-editor, [contenteditable=true]");
    if (control && el.contains(control)) return;
    const focused = el.ownerDocument.activeElement;
    if (focused && focused !== el && el.contains(focused)) return;
    cancel();
    // Give a second click or a text-selection gesture time to take precedence.
    timer = win.setTimeout(() => {
      if (!event.defaultPrevented && !hasSelection() && el.isConnected) {
        event.preventDefault();
        edit();
      }
    }, target && Array.from(target.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ? 150 : 10);
  };
  el.addEventListener("mousedown", down);
  el.addEventListener("click", click);
  return () => {
    cancel();
    el.removeEventListener("mousedown", down);
    el.removeEventListener("click", click);
  };
}
