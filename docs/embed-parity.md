# Native embed parity audit

Audited on 2026-11-12 using the installed Obsidian 1.15.0 desktop app and its default theme. The test fixture used two embeds of the same Markdown note, one GitLab include and one native Markdown embed, in both Live Preview and Reading View.

Result: **73 integration checks passed, 0 failed** (66 rendering checks and 7 rename/preference checks). The release candidate also passes **35 unit tests**, TypeScript, ESLint, manifest validation, build, and whitespace checks.

| Area | Evidence |
| --- | --- |
| Rendering implementation | Both embeds instantiate the very same native component constructor from Obsidian's embed registry. |
| HTML structure | Live Preview uses a native DIV directly inside the CodeMirror content; Reading View uses a native SPAN directly inside the rendered paragraph. Classes and `src`/`alt` attributes match the equivalent native embed, apart from the plugin's identifying class. |
| Styles | All enumerated computed CSS properties match on the root, title, content, preview, heading, paragraph, open control and checkbox. |
| Theme changes | Native theme rules match in both light and dark modes. |
| CSS snippets | Background, title, heading and control rules update both embeds live. Direct-child selectors for Live Preview and Reading View apply equally. Styles flow through the normal CSS cascade. |
| Clicking | A plain content click reveals and selects the complete include reference, just as a native embed selects its reference. |
| Text selection | Selection across the include keeps the directive hidden in both directions. Explicit reference editing remains possible. Unit tests cover drag selection, double-click selection, modifier clicks, controls and cancellation on unload. |
| Folding | Both embeds fold and unfold headings. |
| Tasks | Each embed can edit a task in the target note. Tests isolate each task edit in a fresh view to avoid overlapping saves from two views of one file. |
| Rich content | Tables, code, callouts, relative links and metadata render with matching content and computed styles. |
| Scrolling | Long embeds scroll equally under a shared max-height CSS rule; updates preserve scroll behavior. |
| Updates | Both render target changes while retaining their component/DOM instance. |
| Renames and moves | Target renames, source moves, whole-folder moves and disabled automatic-link preferences pass; saved references retain GitLab syntax. |
| Source preservation | The fixture's source Markdown was unchanged; the original test-vault README hash also remained unchanged. |

The [release audit results](validation/0.1.0.json) contain all 73 passing checks. The development harness is [`scripts/audit-embeds.cjs`](../scripts/audit-embeds.cjs). Temporary fixture notes were removed. The extracted installed-app files were used only for inspection, not copied into the plugin.

## What changed

- Removed staging and card wrappers from the full native render path, which fixed inherited wrapping, root element type, hover behavior and CSS selectors that depend on parent-child relationships.
- Preserved the original relative reference in the native `src` attribute.
- Added the editor-side click gesture that selects the source reference, while leaving drag selection, double clicks, links and native controls intact.
- Stopped recreating the native embed on target edits; the native component already handles metadata and quick-preview events.

## Release hardening

The release candidate adds atomic include-path updates for file/folder renames and moves, respecting Obsidian's automatic-link preference. Folder and child rename events are coalesced so a reference is not rewritten twice. Source-file path snapshots and live TFile references prevent stale rendering when an entire folder moves without changing the include text. The release package is smoke-tested as compiled CommonJS, checked for development-only code and unexpected runtime imports, and copied with SHA-256 checksums.

## Limits of the conclusion

This is a comparison of the supported full-note embed behavior on the installed app version, not a proof that every possible Obsidian feature or future release is identical. Includes deliberately retain GitLab syntax and relative-path semantics. They are not indexed as native backlinks/graph links. With automatic internal-link updates enabled, the plugin now rewrites include paths after file/folder renames and moves, while retaining GitLab syntax. Native heading/block-reference syntax and recursive GitLab includes are outside the supported directive syntax.

The full native path uses an internal factory. If that API becomes unavailable, the public renderer fallback has fewer native interactions and cannot offer the same structural guarantee. CSS can also deliberately distinguish `.gitlab-include` from a native embed, or depend on an explicit native alias that GitLab syntax cannot express.

Live Preview copies source Markdown across both types of embed; hiding syntax during selection does not change that clipboard policy. Open-note navigation and cross-embed mouse selection were also checked manually in the original README.
