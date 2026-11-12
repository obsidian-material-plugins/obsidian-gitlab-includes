// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onEmbedClick } from "../src/embed-interactions";

describe("native-style embed clicks", () => {
  let el: HTMLElement, edit: ReturnType<typeof vi.fn<() => void>>, cleanup: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement("div");
    el.innerHTML = '<h2>Heading</h2><p>Text</p><a>Link</a><input type="checkbox"><span class="collapse-indicator"></span><div class="markdown-embed-link"></div>';
    document.body.append(el);
    edit = vi.fn();
    cleanup = onEmbedClick(el, edit);
  });
  afterEach(() => { cleanup(); el.remove(); window.getSelection()?.removeAllRanges(); vi.useRealTimers(); });
  const click = (target: Element, options: MouseEventInit = {}) => target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, ...options }));
  it("activates editing after a plain content click", () => {
    click(el.querySelector("h2")!);
    expect(edit).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(edit).toHaveBeenCalledOnce();
  });
  it("leaves drag selections and double-click word selections intact", () => {
    const range = document.createRange();
    range.selectNodeContents(el.querySelector("p")!);
    window.getSelection()?.addRange(range);
    click(el.querySelector("p")!);
    vi.runAllTimers();
    expect(edit).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
    click(el.querySelector("p")!);
    el.dispatchEvent(new MouseEvent("mousedown", { detail: 2 }));
    click(el.querySelector("p")!, { detail: 2 });
    vi.runAllTimers();
    expect(edit).not.toHaveBeenCalled();
  });
  it("leaves links, checkboxes, folding and open-note controls to the renderer", () => {
    for (const selector of ["a", "input", ".collapse-indicator", ".markdown-embed-link"]) click(el.querySelector(selector)!);
    click(el.querySelector("h2")!, { shiftKey: true });
    click(el.querySelector("h2")!, { button: 1 });
    vi.runAllTimers();
    expect(edit).not.toHaveBeenCalled();
  });
  it("cancels pending work and listeners when the embed is destroyed", () => {
    click(el.querySelector("p")!);
    cleanup();
    vi.runAllTimers();
    click(el.querySelector("p")!);
    vi.runAllTimers();
    expect(edit).not.toHaveBeenCalled();
  });
});
