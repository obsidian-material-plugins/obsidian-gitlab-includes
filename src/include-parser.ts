export interface IncludeLine {
  from: number;
  to: number;
  path: string;
}

export function parseDirective(line: string): string | null {
  const match = /^::include\{file=([^\r\n]{1,1024})\}$/.exec(line);
  return match ? match[1] : null;
}

export function outsideFenceLines(text: string): { text: string; from: number; to: number }[] {
  const result: { text: string; from: number; to: number }[] = [];
  let fence: { char: string; length: number } | null = null;
  let offset = 0;
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (marker && !(marker[1][0] === "`" && marker[2].includes("`"))) {
      fence = { char: marker[1][0], length: marker[1].length };
    } else {
      result.push({ text: line, from: offset, to: offset + line.length });
    }
    offset += raw.length + 1;
  }
  return result;
}

export function findIncludes(text: string): IncludeLine[] {
  return outsideFenceLines(text).flatMap(line => {
    const path = parseDirective(line.text);
    return path === null ? [] : [{ from: line.from, to: line.to, path }];
  });
}
