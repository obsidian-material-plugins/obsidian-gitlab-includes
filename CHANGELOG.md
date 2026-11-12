# Changelog

## 0.1.1

- Use Obsidian DOM helpers and each embed's document for element creation.
- Recognize Reading View line breaks across popout windows.
- Shorten command labels without changing command IDs.
- Preserve typed return values in metadata wrappers and use the browser timer API.
- Add a cross-window rendering regression test and enforce typed unsafe-return checks.

## 0.1.0

Initial release: GitLab full-note includes with native embed rendering, editor commands, selection-aware reference editing, live CSS inheritance, native backlinks/global and local graphs, and automatic relative-path maintenance on renames and moves. Indexing translates references only in memory; saved notes retain GitLab syntax.

Includes a configurable inline completion shorthand, defaulting to `::`, with a native-style Markdown-only note picker.

See [release notes](RELEASE_NOTES.md) for supported behavior and limitations, and [the audit](docs/embed-parity.md) for validation details.
