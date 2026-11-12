import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, EditorTransaction, TFile, prepareFuzzySearch } from "obsidian";
import { outsideFenceLines } from "./include-parser";
import { isRepresentablePath, relativePath } from "./path-resolver";
import { acceptSelectedSuggestion, NoteSuggestion, renderNoteSuggestion } from "./native-suggestions";

export function shorthandTrigger(line: string, cursor: EditorPosition, shorthand: string): EditorSuggestTriggerInfo | null {
  if (!shorthand) return null;
  if (/^\s*::include\{file=/.test(line)) return null;
  const before = line.slice(0, cursor.ch), start = before.lastIndexOf(shorthand);
  if (start < 0 || (start > 0 && !/\s/u.test(before[start - 1]))) return null;
  const query = before.slice(start + shorthand.length);
  if (/[{}\r\n]/.test(query)) return null;
  // Do not trigger inside inline code, including multi-backtick delimiters.
  let code = 0;
  for (const match of before.slice(0, start).matchAll(/(`+)|\\./g)) {
    if (!match[1]) continue;
    const length = match[1].length;
    if (!code) code = length;
    else if (code === length) code = 0;
  }
  if (code) return null;
  return { start: { line: cursor.line, ch: start }, end: cursor, query };
}

/** Make a complete standalone directive in one undoable editor transaction. */
export function includeCompletion(editor: Editor, context: EditorSuggestTriggerInfo, shorthand: string, path: string): EditorTransaction | null {
  if (!isRepresentablePath(path) || !shorthand || editor.getRange(context.start, context.end) !== shorthand + context.query) return null;
  const before = editor.getLine(context.start.line).slice(0, context.start.ch);
  let end = context.end;
  let after = editor.getLine(end.line).slice(end.ch);
  if (shorthand.endsWith("[[") && after.startsWith("]]")) { end = { line: end.line, ch: end.ch + 2 }; after = after.slice(2); }
  const prefix = before.trim() ? "\n" : "", suffix = after.trim() ? "\n" : "";
  const directive = `::include{file=${path}}`;
  return { changes: [{ from: before.trim() ? context.start : { line: context.start.line, ch: 0 },
    to: after.trim() ? end : { line: end.line, ch: editor.getLine(end.line).length }, text: prefix + directive + suffix }],
    selection: { from: { line: context.start.line + (prefix ? 1 : 0), ch: directive.length } } };
}

export class IncludeSuggest extends EditorSuggest<NoteSuggestion> {
  private prose = new WeakMap<Editor, { prefix: string; allowed: boolean }>();
  constructor(app: App, private shorthand: () => string) {
    super(app);
    this.setInstructions([{ command: "↑↓", purpose: "Navigate" }, { command: "↵ / tab", purpose: "Insert include" }, { command: "esc", purpose: "Dismiss" }]);
    this.scope.register([], "Tab", event => {
      if (!event.isComposing && acceptSelectedSuggestion(this, event)) return false;
    });
  }
  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!file || file.extension !== "md") return null;
    const trigger = shorthandTrigger(editor.getLine(cursor.line), cursor, this.shorthand());
    if (!trigger) return null;
    const prefix = editor.getRange({ line: 0, ch: 0 }, { line: cursor.line, ch: 0 });
    let cached = this.prose.get(editor);
    if (cached?.prefix !== prefix) {
      const frontmatter = /^---\r?\n/.test(prefix) && !/(?:^|\n)(?:---|\.\.\.)\r?\n/.test(prefix.slice(prefix.indexOf("\n") + 1));
      const allowed = !frontmatter && outsideFenceLines(prefix).some(line => line.from === prefix.length);
      cached = { prefix, allowed }; this.prose.set(editor, cached);
    }
    return cached.allowed ? trigger : null;
  }
  getSuggestions(context: EditorSuggestContext): NoteSuggestion[] {
    const query = context.query.trim(), search = prepareFuzzySearch(query);
    const items: NoteSuggestion[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (file.extension !== "md" || !isRepresentablePath(relativePath(context.file.path, file.path))) continue;
      const path = file.path.slice(0, -3), nameStart = path.lastIndexOf("/") + 1;
      if (!query) { items.push({ type: "file", file, path, score: file.stat.mtime, matches: null }); continue; }
      const nameMatch = search(path.slice(nameStart)), match = nameMatch ?? search(path);
      if (!match) continue;
      items.push({ type: "file", file, path, score: match.score - (nameMatch ? 0 : 1),
        matches: match.matches.map(([from, to]) => [from + (nameMatch ? nameStart : 0), to + (nameMatch ? nameStart : 0)]) });
    }
    return items.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  }
  renderSuggestion(item: NoteSuggestion, el: HTMLElement): void { renderNoteSuggestion(this.app, item, el); }
  selectSuggestion(item: NoteSuggestion): void {
    const context = this.context;
    this.close();
    if (!context) return;
    const transaction = includeCompletion(context.editor, context, this.shorthand(), relativePath(context.file.path, item.file.path));
    if (transaction) { context.editor.transaction(transaction, "input.autocomplete"); context.editor.focus(); }
  }
}
