# GitLab Includes 0.1.0

Use GitLab Markdown include directives as native note embeds in Obsidian 1.15.0 or newer.

- Render standalone `::include{file=...}` directives in Live Preview and Reading View, with relative paths, spaces and Unicode filenames.
- Use native embed styling, theme rules, CSS snippets, folding, scrolling, task checkboxes and open-note controls.
- Click an embed to select its reference for editing. Dragging across it keeps the directive hidden.
- Keep references valid when files or folders are renamed or moved, when Obsidian's automatic link updates are enabled.
- Find includes in native backlinks, global/local graphs and outgoing links through in-memory reference translation. Backlinks retain original directive positions; saved notes remain GitLab Markdown.
- Insert includes from the command palette or editor menu, and explicitly convert supported native embeds.
- Keep GitLab include syntax in saved Markdown. The plugin works locally, without network requests or telemetry.

Native rendering and indexing are verified on Obsidian 1.15.0 for Windows. Heading/block include syntax, remote includes and recursively expanded includes are outside this release's scope. Rendering and indexing use guarded internal APIs; a public-renderer fallback has fewer native interactions, and unavailable metadata hooks disable indexing with a notice. Other plugins reading stored parse metadata directly may not see includes.

Install the `main.js`, `manifest.json` and `styles.css` assets into `.obsidian/plugins/gitlab-includes/`, then enable GitLab Includes.
