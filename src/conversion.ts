import { outsideFenceLines } from "./include-parser";
import { isRepresentablePath, relativePath } from "./path-resolver";

export interface Conversion {
  from: number;
  to: number;
  text: string;
}

export function conversions(text: string, source: string, resolve: (link: string) => string | null): { changes: Conversion[]; skipped: number } {
  const changes: Conversion[] = [];
  let skipped = 0;
  for (const line of outsideFenceLines(text)) {
    const match = /^!\[\[([^\]\r\n]+)\]\]$/.exec(line.text);
    if (!match) continue;
    const link = match[1];
    if (/[#|]/.test(link)) { skipped++; continue; }
    const target = resolve(link);
    if (!target || !target.endsWith(".md")) { skipped++; continue; }
    const path = relativePath(source, target);
    if (!isRepresentablePath(path)) { skipped++; continue; }
    changes.push({ from: line.from, to: line.to, text: `::include{file=${path}}` });
  }
  return { changes, skipped };
}
