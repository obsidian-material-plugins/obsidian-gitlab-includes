# Requirements and investigation log

## 2026-11-12: rendering and rename checkpoint

The user is building a GitLab include plugin and testing it in the sibling `test-repo` vault. Their reference example pairs `::include{file=kansio/tiedosto kansiossa.md}` with a native Markdown note embed.

Accepted behavior:

- Dragging across the rendered include keeps its directive hidden. A plain click reveals and selects the reference for editing. Arrow/caret editing remains available.
- Native rendering, generic theme/CSS rules, controls, folding, tasks, scrolling and navigation should behave like native embeds. Styles inherit through native classes and structure rather than copying computed styles.
- Saved notes retain GitLab syntax. Live Preview's native source-Markdown copying behavior is retained.
- Renames/moves update paths when automatic internal-link updates are enabled, including moved sources and whole folders. Folder/child rename events must not cause duplicate rebasing.
- Initial audited scope was prepared as version 0.1.0, with 35 unit tests and 73 in-app checks. No release was published or tagged.

## 2026-11-12: current request supersedes backlink deferral

The user first chose to ship rendering and rename support with backlinks/graph indexing documented as a limitation. After clarification that integration is feasible, they explicitly changed direction:

> "continue on with that integration. we will get this done. push the current code to main as a checkpoint and start exploring a definite solution to the problem. log any relevant prompt info to the .github folder and afents.md for the plugin."

Interpretation: preserve and push the audited implementation, then investigate and implement built-in graph/backlink integration. `AGENTS.md` is the intended standard instruction file. This authorizes a checkpoint push to `main`, not a release/tag publication.

## Investigation questions

1. Which data paths drive global graph, local graph, backlink counts and backlink result snippets in Obsidian 1.15.0?
2. Can include edges be supplied without changing saved Markdown or corrupting native cache ownership?
3. Can backlink reference positions use the original include directive, while preventing native link-rewrite routines from replacing it with Obsidian syntax?
4. How will edits, missing targets, file/folder moves, plugin reloads and unloads reconcile the extra edges and references?
5. What compatibility guards and regression checks make the integration reliable across app updates?

## Evidence available before this investigation

- The typed public `MetadataCache` exposes `resolvedLinks`, `unresolvedLinks`, cached metadata reads and indexing/resolution events, but no custom-link-syntax registration method.
- Native rendering already uses the installed app's own embed component through a guarded internal factory.
- The app bundle has been extracted locally into the sibling `playground` for inspection. It is not part of the plugin source or release assets.
- Directly adding include references to native cached embeds could affect Obsidian's native rename/rewrite pipeline; this is a hypothesis to test, not an approved implementation design.
