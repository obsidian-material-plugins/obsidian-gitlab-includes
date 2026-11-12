# GitLab Includes 0.1.0

Use GitLab Markdown include directives as native note embeds in Obsidian 1.15.0 or newer.

- Render standalone `::include{file=...}` directives in Live Preview and Reading View, with relative paths, spaces and Unicode filenames.
- Use native embed styling, theme rules, CSS snippets, folding, scrolling, task checkboxes and open-note controls.
- Click an embed to select its reference for editing. Dragging across it keeps the directive hidden.
- Keep references valid when files or folders are renamed or moved, when Obsidian's automatic link updates are enabled.
- Insert includes from the command palette or editor menu, and explicitly convert supported native embeds.
- Keep GitLab include syntax in saved Markdown. The plugin works locally, without network requests or telemetry.

Native rendering is verified on Obsidian 1.15.0 for Windows. Native backlinks/graph indexing, heading/block include syntax, remote includes and recursively expanded includes are outside this release's scope. A public-renderer fallback is provided if Obsidian's internal embed factory changes; that fallback has fewer native interactions.

Install the `main.js`, `manifest.json` and `styles.css` assets into `.obsidian/plugins/gitlab-includes/`, then enable GitLab Includes.
