# GitLab Includes: working instructions

## User intent

- Support GitLab's standalone `::include{file=...}` syntax without converting saved notes to native embed syntax.
- Make rendered includes match native Obsidian embeds in appearance, CSS inheritance and interactions. Preserve click-to-edit, drag selection, copying, folding, task editing, scrolling and navigation behavior already audited.
- Keep file/folder rename and move support, including source-note rebasing, controlled by Obsidian's automatic-link preference.
- Native graph/backlink integration is implemented and audited. Preserve it alongside the rendering, rename and shorthand behavior.
- Graph/backlink integration was merged through PR #3. The user then requested a configurable insertion shorthand, default `::`, with an inline picker like native `[[` completion, listing only Markdown files. Insert GitLab directives in one undoable edit and persist the setting. Merge the completed work into `main`; release/tag publication remains separate.
- The user published `0.1.0` on 2026-11-12. Its tag and all required assets were verified. Preserve that published release.
- For the current task, the user explicitly authorized merging all prepared fixes directly into `main` and publishing `0.1.1`. They confirmed that refreshing the community portal resolved the earlier missing-release notice. Complete release verification and remove the merged fix branch without asking again.

## Working practices

- Record relevant user requirements, investigation evidence, compatibility assumptions and decisions in `.github/working-notes.md`.
- Use `AGENTS.md` as the standard agent instruction filename (the user's "afents.md" request refers to this file).
- Preserve GitLab syntax and exact relative-file resolution. Never inject synthetic links into saved notes to obtain graph/backlink support.
- The user explicitly approved translating includes into native references in memory and forwarding them to Obsidian's resolver. Saved Markdown must remain usable by GitLab. Keep this invariant when choosing an indexing approach.
- Isolate internal Obsidian API adapters, feature-detect them, and restore any patched functions/cache state on unload. Research notes must distinguish verified behavior from hypotheses.
- Test new link integration alongside ordinary native links, duplicates, missing targets, literal filenames, edits, creates, deletions, source/target/folder renames, reloads and unloads. Check source text remains intact.
- Do not vendor extracted Obsidian implementation code. Reuse runtime APIs/components; keep local inspection artifacts outside this repository.
- The sibling `test-repo` vault contains user-authored changes. Do not revert or commit its notes/configuration. Use isolated temporary fixtures and clean up only files created by the tests. The sibling `playground` is available for experiments.
- Reload only this plugin for live validation; an app-wide reload without saving was rejected during prior work.

## Validation and publishing boundary

- `npm run validate`: unit tests, type checking, lint, manifest/version checks, build, compiled-bundle smoke test.
- `npm run prepare:release`: validation plus the installable assets and checksums under ignored `dist/`.
- `scripts/audit-embeds.cjs`: development-only in-app audit; never bundle it or local diagnostics into `main.js`.
- The checkpoint was verified with 35 unit tests and 73 in-app rendering/rename checks on Obsidian 1.15.0 for Windows. Preserve that evidence in `docs/validation/0.1.0.json`; add new evidence for link integration.
- GitHub release tags must exactly match `manifest.json` (`0.1.1` for this release, without a `v` prefix). A tag push publishes via the release workflow. Publishing this version is authorized by the current request.
