# Native link indexing

GitLab includes participate in the built-in backlinks pane, global graph, local graph and outgoing-links pane. Their saved syntax remains `::include{file=...}`. Enabling indexing does not write notes, insert hidden native links or convert directives.

## Runtime translation

`IncludeLinkIndex` indexes standalone directives outside fenced examples. It produces native-shaped embed references whose UTF-16 offsets, line/column positions and `original` text refer to the original directive. Relative paths retain the renderer's exact file semantics; basename fallback, case-only substitutes and heading interpretation of literal `#` filenames are excluded.

The adapter wraps three runtime methods:

- `getFileCache` returns a metadata copy with include references appended. The stored native metadata and its arrays remain unchanged.
- `getFirstLinkpathDest` recognizes only those added references, forwards ordinary paths to the native resolver, and retains exact-file resolution for literal filenames. Synthetic reference keys cannot collide with native references from the same source.
- `getBacklinksForFile` adds include references to the native result, preserving ordinary links and duplicate counts.

Obsidian's existing `resolveLinks` consumes the metadata copy through `iterateRefsForFile` and maintains `resolvedLinks`/`unresolvedLinks`. Its normal resolution queue supplies the native refresh events. The native backlinks pane reads the same runtime metadata and original-source positions. No graph renderer or backlinks-pane implementation is copied or replaced.

## Writes and lifecycle

Obsidian's native rename pipeline enumerates its stored parse metadata through `iterateAllRefs`. Includes stay out of that enumeration and its Markdown formatter. The plugin's separate rename handler retains GitLab syntax and respects the automatic-link preference. It waits for the native FileManager update queue before changing directive lengths, so earlier includes cannot invalidate offsets used to rewrite later native links.

Startup reads use at most eight concurrent workers. Metadata changes invalidate delayed reads. File objects track source moves; target creation, deletion and rename events requeue affected include sources. Disabling the plugin makes wrappers inert, restores methods that it still owns, and requeues sources through native resolution to remove only include-derived counts. Later plugins' wrappers are preserved.

## Compatibility and validation

Obsidian's public [API definitions](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) expose the resolved/unresolved counts and metadata events, but no custom syntax registration method. The adapter therefore depends on feature-detected internal methods and the native separation between runtime reads and stored rename inputs. This has been inspected and tested on Obsidian 1.15.0 for Windows. Missing required methods disable indexing with a notice. Future versions and other plugins that replace these internals require a fresh compatibility check; plugins reading stored parse caches directly may not see includes.

`tests/native-link-index.test.ts` checks reference positions, duplicate/native coexistence, exact and missing targets, changes, moves, delayed startup reads, unload/reload, hook absence and wrapper ownership. `scripts/audit-links.cjs` exercises the running app's resolver, actual graph renderer edges, native backlink/outgoing panes, filenames, navigation, file/folder moves and plugin reloads in isolated temporary fixtures. It is development-only and is excluded from release assets.

The [in-app indexing results](validation/0.1.0-links.json) record **24 passing checks, zero failures**, including a native backlink click navigating to the original directive line. The automated suite passes **48 unit tests**, TypeScript, ESLint, manifest checks, build and compiled-artifact validation. The earlier rendering/rename checkpoint remains on `main` at `2cc246e`; indexing adds no saved-source conversion.
