export function resolvePath(source: string, target: string): string | null {
  if (!target || target.startsWith("/") || /[\\\0\r\n]/.test(target) ||
      /^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  const parts = source.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length ? parts.join("/") : null;
}

export function relativePath(source: string, target: string): string {
  const from = source.split("/").slice(0, -1);
  const to = target.split("/");
  while (from.length && to.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return [...from.map(() => ".."), ...to].join("/");
}

export function isRepresentablePath(path: string): boolean {
  return !!path && path.length <= 1024 && !/[\0\r\n\\]/.test(path) && !/^[a-z][a-z0-9+.-]*:/i.test(path);
}
