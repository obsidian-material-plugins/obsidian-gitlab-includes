# Publishing handoff: 0.1.0

The release is prepared locally. Publishing is a separate final action.

## Prepared scope

- Native full-note includes in Live Preview and Reading View, with live theme/CSS inheritance and native controls.
- Click-to-edit reference selection and selection across rendered content.
- File/folder rename and move support, including rebasing paths when the including note moves, following Obsidian's automatic-link preference.
- Public-renderer compatibility fallback and local error handling.
- Documented limits: native backlink/graph indexing, remote includes, heading/block include syntax and recursive GitLab includes are outside 0.1.0.

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
3. Create and push the tag **`0.1.0`**, pointing at that exact commit. Use no `v` prefix. This triggers the release workflow and is the publishing step.
4. Verify that the GitHub release contains `main.js`, `manifest.json`, `styles.css` and `SHA256SUMS`, with the prepared release notes.
5. For Community directory availability, submit the repository through [community.obsidian.md](https://community.obsidian.md). That account-owned submission is separate from publishing the GitHub release.

The current remote repository has no published release and its default branch is `main`. No tag or GitHub release was created as part of preparing this handoff.

## Development-only in-app audit

`scripts/audit-embeds.cjs` exports an async function. From a temporary local development plugin command, call it with the running app and explicit output options:

```js
await require("/absolute/path/to/scripts/audit-embeds.cjs")(this.app, {
  appVersion: require("obsidian").apiVersion,
  reportPath: "/absolute/path/to/report.json"
});
```

It creates isolated fixture notes, compares native and GitLab embeds, tests rename preferences without changing app.json on disk, restores the original view, and removes its fixtures. It temporarily instruments the native factory to compare the resulting component constructors. Run it in a trusted disposable test vault and remove the temporary command afterward. Never append it to release assets; the artifact validator rejects development harness references.

Publishing requirements were checked against the official [release instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin), [manifest reference](https://docs.obsidian.md/Reference/Manifest), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins) and [developer policies](https://docs.obsidian.md/community-directory/developer-policies).
