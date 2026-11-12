# Publishing handoff: 0.1.1

Version 0.1.0 is already published with the required assets. This branch prepares 0.1.1 for the directory's source warnings. Merge and publication of this patch are separate final actions; the existing release remains unchanged.

## Prepared scope

- Native full-note includes in Live Preview and Reading View, with live theme/CSS inheritance and native controls.
- Click-to-edit reference selection and selection across rendered content.
- Configurable Markdown-only inline completion, default shorthand `::`.
- File/folder rename and move support, including rebasing paths when the including note moves, following Obsidian's automatic-link preference.
- Native backlinks, global/local graphs and outgoing links through in-memory metadata translation, without converting saved Markdown.
- Public-renderer compatibility fallback and local error handling.
- Documented limits: guarded internal API compatibility, direct-cache third-party consumers, remote includes, heading/block include syntax and recursive GitLab includes.

Requires Obsidian 1.15.0+. The in-app validation platform is Windows with Obsidian 1.15.0. Other platforms remain unverified by that UI audit.

## Reproduce the package

```sh
npm ci
npm run prepare:release
```

This runs the full automated validation, smoke-tests the built CommonJS plugin and its runtime imports, copies exactly `main.js`, `manifest.json` and `styles.css` into `dist/gitlab-includes/`, and writes `dist/SHA256SUMS` and `dist/RELEASE_NOTES.md`. The three installable files are byte-for-byte copies of the validated build.

## Final publishing action

1. Review and commit the prepared source, workflows, manifest/version files, release notes, and audit documentation. Keep `main.js`, `dist/`, local playground artifacts and dependencies out of source control.
2. Push the reviewed commit to `main` and let CI validate it.
3. Create and push the tag **`0.1.1`**, pointing at that exact commit. Use no `v` prefix. This triggers the release workflow and is the publishing step.
4. Verify that the GitHub release contains `main.js`, `manifest.json`, `styles.css` and `SHA256SUMS`, with the prepared release notes.
5. For Community directory availability, submit the repository through [community.obsidian.md](https://community.obsidian.md). That account-owned submission is separate from publishing the GitHub release.

## Patch-release walkthrough

The user published 0.1.0 on 2026-11-12. Its manifest, tag, required assets and successful release workflow were verified. The subsequent `fix/directory-review` branch contains the warning fixes for 0.1.1. Until those fixes are merged and released, main continues to declare the existing 0.1.0 release.

1. After the fixes are merged to `main` and CI passes, publish the prepared version by creating and pushing its tag. These commands are the public release action:

   ```powershell
   git tag -a 0.1.1 -m "GitLab Includes 0.1.1"
   git push origin 0.1.1
   ```

2. Wait for the [Release workflow](https://github.com/obsidian-material-plugins/obsidian-gitlab-includes/actions/workflows/release.yml) to succeed. On the [release page](https://github.com/obsidian-material-plugins/obsidian-gitlab-includes/releases), confirm the `0.1.1` release has separate `main.js`, `manifest.json`, `styles.css` and `SHA256SUMS` assets. The workflow builds and uploads them; the local ZIP alone is not the installable release used by Obsidian.
3. Open [Obsidian Community](https://community.obsidian.md), sign in with an Obsidian account, and connect the GitHub account under the community profile. Complete authentication and authorization yourself.
4. If the plugin is not already in your profile, select **Plugins → New plugin**. Enter `https://github.com/obsidian-material-plugins/obsidian-gitlab-includes` as the repository URL. Choose yourself or a community-directory organization as the owner. The directory reads the committed manifest from the default branch; the plugin ID is `gitlab-includes` and the name is `GitLab Includes`.
5. Review the developer policies and support commitment, agree if you accept them, and select **Submit**. Review the resulting manifest, release-asset, source and build scan results. Fix any errors in the repository and publish an incremented version when required. **Review branch** can preview a scan; **Request review** reruns it after fixes.
6. Complete the listing through **Edit listing**, then select **Publish**. Installation through Obsidian becomes available after blocking review errors are resolved. Later versions are distributed through matching GitHub releases; the initial directory submission is not repeated.

This sequence follows the current official [submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin), [account and repository setup](https://docs.obsidian.md/community-directory/set-up-and-claim), and [review/listing guidance](https://docs.obsidian.md/community-directory/manage-entry), checked on 2026-11-12.

The remote repository has published 0.1.0 and its default branch is `main`. No new tag or GitHub release was created as part of preparing 0.1.1. If the portal still reports no matching release for 0.1.0, use **… → Check for new releases**, followed by **… → Request review**. The listed source warnings do not block submission according to Obsidian's review guidance.

## Development-only in-app audit

`scripts/audit-embeds.cjs` exports an async function. From a temporary local development plugin command, call it with the running app and explicit output options:

```js
await require("/absolute/path/to/scripts/audit-embeds.cjs")(this.app, {
  appVersion: require("obsidian").apiVersion,
  reportPath: "/absolute/path/to/report.json"
});
```

It creates isolated fixture notes, compares native and GitLab embeds, tests rename preferences without changing app.json on disk, restores the original view, and removes its fixtures. It temporarily instruments the native factory to compare the resulting component constructors. Run it in a trusted disposable test vault and remove the temporary command afterward. Never append it to release assets; the artifact validator rejects development harness references.

`scripts/audit-links.cjs` uses the same function signature for resolver counts, real global/local graph edges, backlink/outgoing panes and navigation, exact filenames, rename/move ordering, and unload/reload cleanup. It creates its own fixture notes and temporary panes. Use a fresh module load when repeating either audit: Node can retain development scripts across plugin reloads. Remove development hooks from the installed plugin after validation, then compare the installed assets with the validated release files.

Publishing requirements were checked against the official [release instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin), [manifest reference](https://docs.obsidian.md/Reference/Manifest), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins) and [developer policies](https://docs.obsidian.md/community-directory/developer-policies).
