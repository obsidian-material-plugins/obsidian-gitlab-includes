import { App } from "obsidian";

/** Wait for native offset-based Markdown rewrites before changing include lengths. */
export function nativeLinkUpdateCompletion(app: App): Promise<void> {
  const manager = app.fileManager as unknown as { updateQueue?: { promise?: unknown } } | undefined;
  const pending = manager?.updateQueue?.promise;
  // Vault-only renames do not start a FileManager operation. If the internal
  // queue is unavailable, retain the independent public-vault rename behavior.
  return Promise.resolve(pending).then(() => undefined, () => undefined);
}
