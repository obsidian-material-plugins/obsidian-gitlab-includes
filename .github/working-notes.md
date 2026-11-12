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

## Checkpoint and in-memory translation

- Checkpoint pushed to `main`: `2cc246e3ee78787fbc8b72fdf6ff5f06d0903f28`. Its GitHub validation run succeeded. No tag/release was created.
- Subsequent implementation is isolated on `feat/native-link-index`.
- The user suggested transforming include references on the fly and forwarding them to the native resolver. Their hard requirement remains: "the text itself on the file cannot change, so that gitlab can still render the embeds". This refers to indexing/rendering; previously authorized rename updates still preserve the directive syntax.

Verified by local inspection of the installed Obsidian 1.15.0 runtime (no proprietary implementation copied into the plugin):

- Global/local graph renderers consume `resolvedLinks` and `unresolvedLinks`.
- The native backlinks pane first filters sources by resolved counts, then reads references and original-source positions from `getFileCache`. `getBacklinksForFile` alone does not populate that pane.
- Native `resolveLinks` consumes `iterateRefsForFile`, which reads `getFileCache` for Markdown. A runtime metadata copy can therefore feed the original resolver and the native pane together.
- Native file rename rewriting obtains references from `iterateAllRefs`, which reads the stored parse metadata directly. Leaving those stores untouched keeps translated references out of that writer.
- Native rename writes use original source offsets. Include path edits must wait for native link updates to finish, otherwise changing earlier directive lengths can invalidate those offsets. The FileManager update queue provides a completion promise; the adapter feature-detects it.

Implementation uses guarded, reversible wrappers for `getFileCache`, `getFirstLinkpathDest` and `getBacklinksForFile`. Metadata copies append native-shaped embeds whose positions refer to the original GitLab directive. Rooted reference keys avoid basename fallback; collision handling and exact-file checks preserve literal relative paths, hashes/percent signs and native link coexistence. No translated reference enters stored parse caches or saved Markdown. Native resolution queues publish the usual graph/backlink refresh events. Startup reads are bounded and cannot overwrite newer metadata events.

Live evidence so far: the actual native resolver reports two includes plus a native embed as three references; the native backlinks pane renders the original directives; literal hash/percent/Unicode targets, create/delete and directive removal reconcile correctly. Full graph-renderer assertions, rename ordering and unload/reload verification are still being completed. Earlier pane timeouts came from an unpinned test pane and a cached development script; they are not compatibility claims.

## Integration outcome

The final indexing run passed all 24 in-app checks with no errors. This includes real include-only edges in both graph renderers, native backlink snippets and click navigation to the directive line, outgoing-link deduplication, literal filenames, missing/create/delete transitions, source edits, file/source/folder renames, and unload/reload cleanup without duplicate counts. The automatic suite passes 48 unit tests plus type/lint/manifest/build/compiled-artifact checks. Evidence is in `docs/validation/0.1.0-links.json`.

The rename-order guard is verified in the app: two earlier include paths change length while a later native embed is also rewritten, and all three references still resolve. Source edits follow the existing automatic-link preference; indexing itself does not alter files. A follow-up rendering regression audit is run with indexing active.

Development notes: use fresh Node modules for repeated audits, pin backlink/local-graph fixture panes to their intended files, and poll for native ephemeral cursor selection after backlink navigation. Temporary local development hooks are removed from the installed bundle before handoff. The user's own test-vault notes changed during the session; do not restore their older contents or hashes.

Rendering regression completed: all 73 existing checks pass with indexing active, zero errors. Recorded in `docs/validation/0.1.0-with-indexing.json`. Combined in-app coverage is 97 passing checks.

Handoff cleanup verified: temporary fixture folders are gone, the development bridge is stopped, and the plugin has been reloaded from the clean build. Installed `main.js`, `manifest.json` and `styles.css` are byte-identical to the validated release assets. The release ZIP contains exactly those three files with matching hashes. No tag or release was published.

## 2026-11-12: merged indexing and configurable shorthand

The user explicitly requested merging the integration into `main` and adding a setting for a shorthand that opens the same style of search as native `[[`, excluding images and other non-Markdown files. Default shorthand: `::`. PR #3 was merged as `e50e990b9e7dfefcfc4f3ba4dbcfd9409473fbc3` after verifying its head and successful checks.

The new picker uses public `EditorSuggest` and the public fuzzy-search helper. It reuses the installed native link suggester's row renderer through a guarded adapter, with a public DOM/renderMatches fallback. It changes no global CSS. Native row markup/classes are identical; all computed row/title styles match at the same available width. The popup's natural width follows its footer content; this footer describes include insertion rather than unsupported heading/block/alias operations.

Picking a note inserts a standalone `::include{file=...}` with a literal relative path in one `input.autocomplete` transaction. Default/custom triggers, Markdown-only filtering, native Enter/Tab/Escape/mouse handling, undo, persistence across reload, code/frontmatter exclusions and rendering were tested in the running app. Settings use Obsidian's declarative PluginSettingTab API, default to `::`, and accept an empty value to disable completion. Existing complete directives do not retrigger while their source is being edited. A configured native trigger such as `[[` takes priority only when this suggester's own context matches; removal restores the other suggesters' relative order.

Validation: 59 unit tests plus type/lint/build/manifest/artifact checks, and 23 passing shorthand checks in Obsidian 1.15.0 for Windows. The live test used actual Windows Tab/Enter/Escape input. Results are stored in `docs/validation/0.1.0-shorthand.json`. Temporary fixture panes are saved before closing to avoid delayed editor saves recreating deleted test notes. User notes/configuration outside this plugin's settings are preserved.

Final UI verification observed the Include shorthand field under Settings → GitLab Includes with value `::`. The clean plugin is installed and reloaded, exactly one include suggester is registered, and all three installed assets match the validated build byte for byte. Development hooks and owned fixture files/folders are removed. The user's README hash remains unchanged from the start of this feature work.
