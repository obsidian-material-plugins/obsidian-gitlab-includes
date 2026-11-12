import { App, EditorSuggest, TFile, SearchMatches, renderMatches } from "obsidian";

export interface NoteSuggestion {
  type: "file";
  file: TFile;
  path: string;
  score: number;
  matches: SearchMatches | null;
}
interface NativeSuggest {
  suggestManager?: { getFileSuggestions?: unknown };
  renderSuggestion?: (item: NoteSuggestion, el: HTMLElement) => void;
}
interface SuggestRegistry { suggests?: NativeSuggest[] }

/** Reuse the installed [[ row renderer; keep a public-API fallback. */
export function renderNoteSuggestion(app: App, item: NoteSuggestion, el: HTMLElement): void {
  const registry = (app.workspace as unknown as { editorSuggest?: SuggestRegistry }).editorSuggest;
  const native = registry?.suggests?.find(suggest => typeof suggest.suggestManager?.getFileSuggestions === "function" && typeof suggest.renderSuggestion === "function");
  if (native) {
    try { native.renderSuggestion!(item, el); return; }
    catch { el.replaceChildren(); }
  }
  el.classList.add("mod-complex");
  const content = el.createDiv("suggestion-content");
  el.createDiv("suggestion-aux");
  const title = content.createDiv("suggestion-title"), note = content.createDiv("suggestion-note");
  const nameStart = item.path.lastIndexOf("/") + 1;
  renderMatches(title, item.path.slice(nameStart), item.matches, -nameStart);
  renderMatches(note, item.path.slice(0, nameStart), item.matches);
}

/** Native popovers accept Tab through their chooser, as [[ does. */
export function acceptSelectedSuggestion(suggest: EditorSuggest<NoteSuggestion>, event: KeyboardEvent): boolean {
  const chooser = (suggest as unknown as { suggestions?: { useSelectedItem?: (event: KeyboardEvent) => boolean } }).suggestions;
  return chooser?.useSelectedItem?.(event) ?? false;
}

/** Let an explicitly configured native trigger (e.g. [[) select includes too. */
export function prioritizeIncludeSuggest(app: App, suggest: EditorSuggest<NoteSuggestion>): void {
  const registry = (app.workspace as unknown as { editorSuggest?: { suggests?: unknown[] } }).editorSuggest;
  const items = registry?.suggests, index = items?.indexOf(suggest) ?? -1;
  if (items && index > 0) { items.splice(index, 1); items.unshift(suggest); }
  // registerEditorSuggest owns removal; other suggesters keep their order.
}
