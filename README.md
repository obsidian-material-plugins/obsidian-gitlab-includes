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

GitLab renders the included file seamlessly, while Obsidian displays a recognizable bordered embedded note with a clickable filename. Paths are relative to the containing file, including `./` and `../`; spaces and Unicode are retained. The target must be an existing Markdown file inside the vault. The content is rendered by Obsidian using the target note's path for relative links. Missing, invalid, or unreadable targets show an error without changing the source. When a target changes, is removed, or is renamed, the displayed content refreshes; a rename does not rewrite directives.

## Usage

- In Reading View and Live Preview, standalone directives are displayed as embeds. Move the cursor or selection onto a directive in Live Preview to edit its actual text. Source mode always shows the original directive.
- Run **Insert GitLab include** from the command palette or editor context menu, then search for a Markdown note. The plugin inserts the correct relative path as one undoable edit.
- Run **Convert Markdown embeds to GitLab includes** to convert supported standalone `![[note]]` embeds in the current note. Conversion uses Obsidian link resolution and is undoable. Nothing is converted automatically when enabling the plugin.

## Limitations

- Native Obsidian embed insertion is not intercepted: not every insertion workflow has a stable public interception API. Use the command above for guaranteed GitLab syntax; native embeds remain unchanged until explicitly converted.
- Conversion only handles standalone note embeds without aliases, headings, or block references. Inline embeds, unresolved references, attachments, ordinary links, and fenced code examples are left unchanged. A notice reports skipped standalone references.
- GitLab processes include directives before Markdown, including in fenced code blocks. This plugin intentionally leaves fenced code examples unchanged and only renders note includes; source-code includes are not supported.
- GitLab does not recursively expand includes; directives within included notes remain literal. Remote URLs, paths outside the vault, and non-Markdown targets are not loaded. A self-include displays the note once without recursively expanding its includes.
- Reading View detects directives in rendered paragraph text. Markdown formatting characters that alter the directive's rendered structure may prevent detection; use Live Preview or Source mode to inspect such a directive.
- The display is a close approximation using the public Markdown renderer, not Obsidian's native embed implementation. Native embed-specific controls, resizing and editing within the embed are not provided. Header display and rendering are always enabled.

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

Automated checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:manifest`, and `npm run build`.

## Release and community submission

Update the version in `manifest.json` and `package.json` together, update the lockfile with `npm install --package-lock-only`, and run the checks above. Commit those changes and push a matching semantic version tag, e.g. `v0.1.0`. The release workflow checks the tag and publishes `main.js`, `manifest.json`, and `styles.css` as release assets. Ordinary pushes do not publish releases.

Before submitting, review the current [manifest reference](https://docs.obsidian.md/Reference/Manifest), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and [developer policies](https://docs.obsidian.md/community-directory/developer-policies). Publish a release, then follow the community directory submission process to propose the repository. This project uses the MIT license.
