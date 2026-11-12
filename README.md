# GitLab Includes

GitLab Includes renders GitLab Flavored Markdown include directives as embedded notes in Obsidian, without changing the saved Markdown. This lets the same document work in a GitLab repository and in an Obsidian vault.

```markdown
::include{file=kansio/tiedosto kansiossa.md}
```

Unlike the native Obsidian embed `![[kansio/tiedosto kansiossa.md]]`, this syntax is understood by GitLab. An include is not part of standard CommonMark; other Markdown editors need additional support.

For example:

```text
vault/
├── README.md
└── kansio/
    └── tiedosto kansiossa.md
```

`README.md`:

```markdown
# Example

This is an embedded document:

::include{file=kansio/tiedosto kansiossa.md}
```

GitLab renders the included file seamlessly, while Obsidian displays its native note embed, including the current theme's border, title, content spacing, scrolling, and open-note control. Paths are relative to the containing file, including `./` and `../`; spaces and Unicode are retained. The target must be an existing Markdown file inside the vault. The content is rendered by Obsidian using the target note's path for relative links. Missing, invalid, or unreadable targets show an error without changing the source.

## Usage

- Type `::` followed by a note name to open an inline Markdown-file picker. Use the arrow keys, Enter/Tab, or a mouse click to choose a note; Escape dismisses it. The result is a standalone GitLab include with a relative path, inserted as one undoable edit. Images and other attachments are excluded. Change **Settings → GitLab Includes → Include shorthand** to use another trigger, or leave it empty to disable completion. Fenced examples, inline code and frontmatter do not trigger the picker.
- In Reading View and Live Preview, standalone directives are displayed as native embeds. Click the embed to reveal and select its reference for editing, or move the editing cursor onto the directive. The embed stays visible. Dragging across an embed keeps its directive hidden; double-click text selection, links, folding and task checkboxes retain their native behavior. Source mode always shows the original directive without a preview.
- Theme rules and CSS snippets targeting native note embeds apply directly to includes through the same native classes and HTML structure. Styles are inherited live through the CSS cascade; the plugin does not copy or freeze computed styles.
- Includes appear in Obsidian's native backlinks, global graph, local graph and outgoing links. The plugin translates references in memory and forwards them to Obsidian's resolver; saved notes retain GitLab syntax. Backlink matches show the original directive and navigate to its source line. Disabling the plugin removes its indexed references.
- As with native embeds, copying a selection across an embed in Live Preview preserves the underlying Markdown. Hiding the directive during selection does not expand the included note into the clipboard.
- When **Automatically update internal links** is enabled in Obsidian, renaming or moving a file or folder updates affected include paths while retaining GitLab syntax. Moving the including note also rebases its paths. With that preference disabled, directives remain unchanged and may need manual correction.
- Run **Insert include** from the command palette or editor context menu, then search for a Markdown note. The plugin inserts the correct relative path as one undoable edit.
- Run **Convert Markdown embeds to includes** to convert supported standalone `![[note]]` embeds in the current note. Conversion uses Obsidian link resolution and is undoable. Nothing is converted automatically when enabling the plugin.

## Limitations

- Native Obsidian embed insertion is not intercepted: not every insertion workflow has a stable public interception API. Use the command above for guaranteed GitLab syntax; native embeds remain unchanged until explicitly converted.
- Conversion only handles standalone note embeds without aliases, headings, or block references. Inline embeds, unresolved references, attachments, ordinary links, and fenced code examples are left unchanged. A notice reports skipped standalone references.
- GitLab processes include directives before Markdown, including in fenced code blocks. This plugin intentionally leaves fenced code examples unchanged and only renders note includes; source-code includes are not supported.
- GitLab does not recursively expand includes; directives within included notes remain literal. Remote URLs, paths outside the vault, and non-Markdown targets are not loaded. A self-include displays the note once without recursively expanding its includes.
- Reading View detects directives in rendered paragraph text. Markdown formatting characters that alter the directive's rendered structure may prevent detection; use Live Preview or Source mode to inspect such a directive.
- The plugin uses Obsidian's native embed factory when available, with a public Markdown renderer fallback if that internal API changes. The fallback preserves the native embed styles and open-note control, but some native interactions (such as heading folding) may be unavailable. The saved directive is never changed into an Obsidian link.
- Graph/backlink integration uses guarded internal metadata APIs because Obsidian has no public custom-link-syntax registration API. If required hooks are unavailable, a notice reports that indexing is unavailable. Other plugins that read Obsidian's stored parse cache directly may not see includes; see [indexing details](docs/link-indexing.md).

## Compatibility and privacy

Requires Obsidian 1.15.0 or newer. Native embed behavior was audited on Obsidian 1.15.0 for Windows; other desktop platforms and mobile have not received the same UI audit. The shipped plugin uses no Node.js or Electron APIs.

The plugin works locally, makes no network requests, and contains no telemetry. It only reads or edits files inside the vault. Saved notes change through explicit insert/conversion commands, edits made through native task controls, or automatic include-path updates following the link-update preference described above.

## Build and manually install

Requires Node.js 22.22.2 or newer in the Node 22 series (or a supported newer LTS) and npm. Clone this repository, then:

```sh
cd obsidian-gitlab-includes
npm ci
npm run build
```

Copy the three files into the vault's configuration directory (normally `.obsidian`; substitute your actual path):

```sh
mkdir -p "/path/to/vault/.obsidian/plugins/gitlab-includes"
cp main.js manifest.json styles.css "/path/to/vault/.obsidian/plugins/gitlab-includes/"
```

Windows PowerShell:

```powershell
cd obsidian-gitlab-includes
npm ci
npm run build
$dest = "C:\path\to\vault\.obsidian\plugins\gitlab-includes"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item main.js, manifest.json, styles.css $dest
```

Restart or reload Obsidian, enable community plugins, and enable **GitLab Includes**. The plugin ID and installation folder are `gitlab-includes`.

## Test in a disposable vault

1. Make a new vault, install and enable the plugin as above.
2. Create `kansio/tiedosto kansiossa.md` with a heading, paragraph, list, and link.
3. Create `README.md` with the example above. Check the embed and clickable header in Reading View and Live Preview. Select the directive in Live Preview and check Source mode.
4. Edit the included note, then rename or delete it; check updates and missing-file feedback. Test a `../` path from a nested note.
5. Insert an include using the command, and convert a standalone `![[note]]` using the conversion command. Undo both; check image and PDF embeds are unchanged.
6. Inspect `README.md` outside Obsidian to verify the include remains `::include{file=...}`. Push the files to GitLab and check its rendered result.

Run `npm run validate` for unit tests, type checking, lint, manifest/version checks, build and a smoke test of the actual release bundle. The [audit report](docs/embed-parity.md) describes the in-app comparisons. The development-only [audit harness](scripts/audit-embeds.cjs) is never bundled into the plugin.

## Release and community submission

Run `npm run prepare:release` to validate the source and prepare `dist/gitlab-includes/` with the three installable files, plus release notes and SHA-256 checksums in `dist/`. See the [publishing handoff](docs/publishing.md) for the final steps.

For a later version, update `manifest.json`, `package.json`, `package-lock.json`, `versions.json` and the release notes together. The GitHub release tag must match the manifest version exactly, such as `0.1.0`, without a `v` prefix. The release workflow validates the tag and publishes the prepared assets. Ordinary branch pushes do not publish releases.

Before submitting, review the current [manifest reference](https://docs.obsidian.md/Reference/Manifest), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and [developer policies](https://docs.obsidian.md/community-directory/developer-policies). Publish a release, then follow the community directory submission process to propose the repository. This project uses the MIT license.
