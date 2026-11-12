// Development-only integration audit, executed inside the installed Obsidian.
// Never bundled. Creates and removes only its own timestamped fixture notes.
module.exports = async function auditLinks(app, { reportPath, appVersion }) {
  const fs = require('fs'), path = require('path');
  const report = { appVersion, checks: [], errors: [], probes: {} };
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const check = (name, pass, details) => { report.checks.push({ name, pass: !!pass, ...(details === undefined ? {} : { details }) }); save(); };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (condition, label) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) { if (await condition()) return; await pause(80); }
    throw new Error('Timed out: ' + label);
  };
  const folder = '_gitlab-link-audit-' + Date.now(), owned = [], leaves = [];
  const originalLeaf = app.workspace.activeLeaf, config = app.vault.getConfig;
  const cache = app.metadataCache;
  let currentFolder = folder;
  const create = async (name, text) => { const file = await app.vault.create(currentFolder + '/' + name, text); owned.push(file); return file; };
  const count = (source, target) => cache.resolvedLinks[source.path]?.[target.path] ?? 0;
  const backlinkRefs = (source, target) => cache.getBacklinksForFile(target).get(source.path) ?? [];
  const keys = object => object && Object.keys(object);
  save();
  try {
    await app.vault.createFolder(folder);
    const target = await create('child.md', '# Child\n\nNative graph target.');
    const sourceText = 'Before\n\n::include{file=child.md}\n\nBetween\n\n::include{file=child.md}\n\n![native](child.md)\n\nAfter\n';
    const source = await create('source.md', sourceText);
    const graphSource = await create('graph-source.md', '::include{file=child.md}');
    await until(() => count(source, target) === 3, 'native resolver counts');
    check('native resolver counts include/native duplicates', count(source, target) === 3);
    check('stored parse metadata remains native-only', cache.getCache(source.path).embeds.length === 1);
    const references = backlinkRefs(source, target);
    check('native backlink query includes all three original references', references.length === 3, references);
    check('backlink offsets refer to original directives', references.filter(ref => ref.original.startsWith('::include')).every(ref => sourceText.slice(ref.position.start.offset, ref.position.end.offset) === ref.original));
    check('indexing preserves saved GitLab Markdown', await app.vault.cachedRead(source) === sourceText);
    const editorLeaf = app.workspace.getLeaf(true); leaves.push(editorLeaf);
    await editorLeaf.openFile(source, { state: { mode: 'source' } });
    for (const type of ['backlink', 'graph', 'localgraph', 'outgoing-link']) {
      const leaf = app.workspace.getLeaf(true); leaves.push(leaf);
      leaf.setPinned(true);
      await leaf.setViewState({ type, active: true, state: { file: type === 'outgoing-link' ? source.path : target.path, backlinkCollapsed: false, unlinkedCollapsed: true } });
      await pause(800);
      const view = leaf.view;
      report.probes[type] = { file: view.file?.path, view: keys(view), prototype: Object.getOwnPropertyNames(Object.getPrototypeOf(view)), renderer: keys(view.renderer), data: view.renderer?.data,
        backlink: keys(view.backlink), outgoingLink: keys(view.outgoingLink), text: view.containerEl.textContent.slice(0, 1200) };
      save();
      if (type === 'backlink') {
        await until(() => view.backlink?.backlinkDom?.getMatchCount() === 4, 'native backlink pane');
        check('native backlink pane renders all include/native matches', view.backlink.backlinkDom.getMatchCount() === 4, view.containerEl.textContent);
        const match = [...view.containerEl.querySelectorAll('.search-result-file-match')].find(el => el.textContent.includes('::include'));
        check('backlink pane displays the original include directive', !!match);
        if (match) {
          match.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
          await until(() => app.workspace.activeEditor?.file?.path === source.path || app.workspace.activeEditor?.file?.path === graphSource.path, 'backlink navigation');
          await until(() => {
            const editor = app.workspace.activeEditor?.editor;
            return editor && editor.getLine(editor.getCursor().line).startsWith('::include{file=');
          }, 'backlink source line selection');
          const editor = app.workspace.activeEditor.editor;
          check('native backlink click navigates to the include source line', editor.getLine(editor.getCursor().line).startsWith('::include{file='), { cursor: editor.getCursor() });
        }
      }
      if (type === 'graph' || type === 'localgraph') {
        const edge = () => view.renderer?.links?.some(link => link.source.id === graphSource.path && link.target.id === target.path);
        await until(edge, type + ': include-only rendered edge');
        check(type + ': native renderer contains an include-only edge', edge());
      }
      if (type === 'outgoing-link') {
        await until(() => view.outgoingLink?.outgoingLinkDom?.vChildren?.children?.length === 1, 'native outgoing links');
        check('native outgoing pane deduplicates include/native destinations', view.outgoingLink.outgoingLinkDom.vChildren.children.length === 1);
      }
    }
    const literal = await create('hash # percent %23 Ä.md', '# Literal filename');
    const literalSource = await create('literal-source.md', '::include{file=hash # percent %23 Ä.md}');
    await until(() => count(literalSource, literal) === 1, 'literal filename');
    check('literal hash/percent/Unicode filename is indexed exactly', backlinkRefs(literalSource, literal).length === 1);
    const missing = await create('missing-source.md', '::include{file=later.md}');
    await until(() => Object.values(cache.unresolvedLinks[missing.path] ?? {}).reduce((a,b) => a+b, 0) === 1, 'missing target');
    check('missing include appears in native unresolved links', Object.keys(cache.unresolvedLinks[missing.path]).length === 1);
    const later = await create('later.md', '# Later');
    await until(() => count(missing, later) === 1, 'created target');
    check('creating a target resolves an existing include', count(missing, later) === 1);
    await app.vault.delete(later);
    await until(() => count(missing, later) === 0, 'deleted target');
    check('deleting a target removes the resolved edge', count(missing, later) === 0);
    check('deleted target objects have no include backlinks', backlinkRefs(missing, later).length === 0);
    await app.vault.modify(missing, 'no includes');
    await until(() => Object.keys(cache.unresolvedLinks[missing.path] ?? {}).length === 0, 'removed directive');
    check('editing out a directive clears its unresolved edge', Object.keys(cache.unresolvedLinks[missing.path]).length === 0);
    app.vault.getConfig = function(key) { return key === 'alwaysUpdateLinks' ? true : config.call(this, key); };
    await app.fileManager.renameFile(target, folder + '/renamed child.md');
    await until(async () => count(source, target) === 3 && (await app.vault.cachedRead(source)).includes('::include{file=renamed child.md}'), 'target rename');
    const renamed = await app.vault.cachedRead(source);
    check('native rename preserves two GitLab directives', renamed.match(/::include\{file=renamed child.md\}/g)?.length === 2, renamed);
    check('target rename preserves graph and backlink counts', count(source, target) === 3 && backlinkRefs(source, target).length === 3);
    await app.vault.createFolder(folder + '/moved');
    await app.fileManager.renameFile(source, folder + '/moved/source.md');
    await until(async () => count(source, target) === 3 && (await app.vault.cachedRead(source)).includes('::include{file=../renamed child.md}'), 'source move');
    check('source move rebases GitLab paths and indexes their new source', backlinkRefs(source, target).length === 3);
    await app.fileManager.renameFile(app.vault.getAbstractFileByPath(folder), folder + '-moved');
    currentFolder = folder + '-moved';
    await until(() => count(source, target) === 3, 'folder rename');
    check('whole-folder rename preserves graph and backlink references', backlinkRefs(source, target).length === 3);
    // Reload only this plugin. The installed development hook has a one-run
    // guard, so the ongoing audit is not recursively started when enabling it.
    await app.plugins.disablePlugin('gitlab-includes');
    await until(() => count(source, target) === 1, 'unload removes include edges');
    check('unload leaves the native graph edge and removes include edges', count(source, target) === 1);
    check('unload restores native metadata and backlinks', cache.getFileCache(source).embeds.length === 1 && backlinkRefs(source, target).length === 1);
    await app.plugins.enablePlugin('gitlab-includes');
    await until(() => count(source, target) === 3, 'reload restores include edges');
    check('reload rebuilds include edges once', count(source, target) === 3 && backlinkRefs(source, target).length === 3);
  } catch (error) {
    report.errors.push(String(error.stack || error));
    report.failureState = [];
    for (const file of owned) if (app.vault.getAbstractFileByPath(file.path) === file) report.failureState.push({ path: file.path, text: await app.vault.cachedRead(file), resolved: cache.resolvedLinks[file.path], unresolved: cache.unresolvedLinks[file.path] });
  }
  finally {
    app.vault.getConfig = config;
    for (const leaf of leaves.reverse()) leaf.detach();
    if (originalLeaf) app.workspace.setActiveLeaf(originalLeaf, { focus: true });
    for (const file of owned.reverse()) {
      if (app.vault.getAbstractFileByPath(file.path) === file && [folder, folder + '-moved'].some(dir => file.path.startsWith(dir + '/'))) await app.vault.delete(file);
    }
    const root = path.resolve(app.vault.adapter.getBasePath());
    for (const dir of [folder + '/moved', folder + '-moved/moved', folder, folder + '-moved']) {
      const absolute = path.resolve(root, dir);
      if (absolute.startsWith(root + path.sep) && fs.existsSync(absolute) && fs.readdirSync(absolute).length === 0) fs.rmdirSync(absolute);
    }
    report.summary = { passed: report.checks.filter(x => x.pass).length, failed: report.checks.filter(x => !x.pass).length };
    report.completed = true; save();
  }
};
