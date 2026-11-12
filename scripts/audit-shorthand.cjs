// Development-only: run inside Obsidian. No production imports depend on this.
module.exports = async function(app, { appVersion, reportPath }) {
  const fs = require('fs'), path = require('path');
  const report = { appVersion, checks: [], errors: [], phase: 'starting' };
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const check = (name, pass, details) => { report.checks.push({ name, pass: !!pass, ...(details === undefined ? {} : { details }) }); save(); };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (test, label, timeout = 10000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await test()) return; await pause(60); } throw new Error('Timed out: ' + label); };
  const folder = '_gitlab-shorthand-audit-' + Date.now(), owned = [];
  const originalLeaf = app.workspace.activeLeaf;
  const originalSettings = { ...app.plugins.plugins['gitlab-includes'].settings };
  const leaf = app.workspace.getLeaf(true);
  let editor;
  const plugin = () => app.plugins.plugins['gitlab-includes'];
  const suggest = () => app.workspace.editorSuggest.suggests.find(item => item.constructor.name === 'IncludeSuggest');
  const native = () => app.workspace.editorSuggest.suggests.find(item => item.suggestManager?.getFileSuggestions);
  const input = async text => {
    editor.setValue(text); editor.setCursor(editor.offsetToPos(text.length)); editor.focus();
    await pause(120);
    await until(() => {
      if (!app.workspace.editorSuggest.currentSuggest?.isOpen) {
        editor.focus(); app.workspace.editorSuggest.trigger(editor, leaf.view.file, true);
      }
      return app.workspace.editorSuggest.currentSuggest?.isOpen;
    }, 'suggestion popup');
    await pause(100);
    return app.workspace.editorSuggest.currentSuggest;
  };
  const styles = el => { const css = getComputedStyle(el); return Object.fromEntries([...css].map(key => [key, css.getPropertyValue(key)])); };
  const ownedPaths = () => owned.map(file => file.path);
  save();
  try {
    await app.vault.createFolder(folder);
    const target = await app.vault.create(folder + '/Shorthand target Ä.md', '# Included heading'); owned.push(target);
    const image = await app.vault.createBinary(folder + '/Shorthand target Ä.png', new Uint8Array([137,80,78,71]).buffer); owned.push(image);
    const source = await app.vault.create(folder + '/source.md', ''); owned.push(source);
    await leaf.openFile(source, { active: true, state: { mode: 'source', source: false } });
    editor = leaf.view.editor;
    await until(() => app.metadataCache.getFileCache(target), 'fixture metadata');
    check('default shorthand is two colons', plugin().settings.shorthand === '::');
    const definition = plugin().settingTab.getSettingDefinitions().find(item => item.control?.key === 'shorthand');
    check('native settings tab exposes a validated text control', definition?.control.type === 'text' && definition.control.defaultValue === '::' && !!definition.control.validate('bad value'));
    await plugin().setShorthand('::');
    const nativePopup = await input('[[Shorthand target Ä');
    check('native [[ picker is still available', nativePopup === native());
    const nativeItem = nativePopup.suggestions.values.find(item => item.file === target && item.type === 'file');
    const nativeIndex = nativePopup.suggestions.values.indexOf(nativeItem);
    const nativeRow = nativePopup.suggestEl.querySelectorAll('.suggestion-item')[nativeIndex];
    nativePopup.suggestEl.style.width = '480px';
    const expected = { html: nativeRow.innerHTML, classes: nativeRow.className, styles: styles(nativeRow), title: styles(nativeRow.querySelector('.suggestion-title')) };
    nativePopup.suggestEl.style.removeProperty('width');
    nativePopup.close();
    const popup = await input('::Shorthand target Ä');
    check(':: opens the registered inline include popup', popup === suggest());
    check('only Markdown files appear, excluding a matching PNG', popup.suggestions.values.length === 1 && popup.suggestions.values.every(item => item.file.extension === 'md'), popup.suggestions.values.map(item => item.file.path));
    const row = popup.suggestEl.querySelector('.suggestion-item');
    check('rows use identical native [[ markup and classes', row.innerHTML === expected.html && row.className === expected.classes);
    // The two footers describe different supported actions and therefore give
    // auto-width popovers different intrinsic widths. Compare CSS at the same
    // available width; this is test-only, never a production style override.
    popup.suggestEl.style.width = '480px';
    const rowStyles = styles(row), titleStyles = styles(row.querySelector('.suggestion-title'));
    const differences = [ ['row', expected.styles, rowStyles], ['title', expected.title, titleStyles] ].flatMap(([element, native, include]) => Object.keys(native).filter(key => native[key] !== include[key]).map(key => ({ element, property: key, native: native[key], include: include[key] })));
    check('all row and title CSS properties match native [[ at equal popup width', differences.length === 0, differences);
    popup.suggestEl.style.removeProperty('width');
    report.phase = 'press-tab'; save();
    await until(() => editor.getValue() === '::include{file=Shorthand target Ä.md}', 'real Tab completion', 90000);
    check('Tab inserts a GitLab include with a literal relative path', editor.getValue() === '::include{file=Shorthand target Ä.md}');
    editor.undo();
    check('one undo restores the shorthand and query', editor.getValue() === '::Shorthand target Ä');
    await input('::Shorthand target Ä'); report.phase = 'press-enter'; save();
    await until(() => editor.getValue() === '::include{file=Shorthand target Ä.md}', 'real Enter completion', 90000);
    check('Enter accepts the native-style suggestion', editor.getValue() === '::include{file=Shorthand target Ä.md}');
    await input('::Shorthand target Ä'); report.phase = 'press-escape'; save();
    await until(() => !suggest().isOpen, 'real Escape dismissal', 90000);
    check('Escape dismisses without changing Markdown', editor.getValue() === '::Shorthand target Ä');
    const mousePopup = await input('::Shorthand target Ä');
    mousePopup.suggestEl.querySelector('.suggestion-item').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    await until(() => editor.getValue() === '::include{file=Shorthand target Ä.md}', 'mouse completion');
    check('clicking a suggestion inserts a GitLab include', editor.getValue() === '::include{file=Shorthand target Ä.md}');
    await plugin().setShorthand('@@');
    const saved = JSON.parse(await app.vault.adapter.read(plugin().manifest.dir + '/data.json'));
    check('custom shorthand is persisted to plugin settings', saved.shorthand === '@@');
    const custom = await input('@@Shorthand target Ä');
    check('custom shorthand opens the same picker', custom === suggest());
    custom.selectSuggestion(custom.suggestions.values[0]);
    check('custom shorthand still writes GitLab syntax', editor.getValue() === '::include{file=Shorthand target Ä.md}');
    await app.plugins.disablePlugin('gitlab-includes'); await app.plugins.enablePlugin('gitlab-includes');
    check('custom shorthand survives a plugin reload', plugin().settings.shorthand === '@@');
    check('reload registers exactly one include suggester', app.workspace.editorSuggest.suggests.filter(item => item.constructor.name === 'IncludeSuggest').length === 1);
    await plugin().setShorthand('');
    check('empty shorthand disables completion', suggest().onTrigger({line:0,ch:2}, { getLine:()=> '::' }, source) === null);
    await plugin().setShorthand('::');
    for (const text of ['```md\n::Shorthand', '---\ntags:\n::Shorthand', '`example ::Shorthand']) {
      editor.setValue(text); const cursor = editor.offsetToPos(text.length); editor.setCursor(cursor);
      check('no popup in code/frontmatter: ' + text.split('\n')[0], suggest().onTrigger(cursor, editor, source) === null);
    }
    await input('Before ::Shorthand target Ä');
    suggest().selectSuggestion(suggest().suggestions.values[0]);
    check('inline shorthand becomes a standalone directive', editor.getValue() === 'Before \n::include{file=Shorthand target Ä.md}');
    editor.setCursor({line:0,ch:0});
    await until(() => leaf.view.containerEl.querySelector('.gitlab-include')?.textContent.includes('Included heading'), 'rendered shorthand include');
    check('inserted directive renders through the existing native embed', !!leaf.view.containerEl.querySelector('.gitlab-include .markdown-embed-content'));
  } catch(error) {
    report.errors.push(String(error.stack || error)); report.sourceAtFailure = editor?.getValue();
    report.failureFocus = { active: app.workspace.activeLeaf === leaf, hasFocus: editor?.hasFocus(), cmHasFocus: editor?.cm?.hasFocus, current: app.workspace.editorSuggest.currentSuggest?.constructor.name,
      nativeTrigger: native().onTrigger(editor.getCursor(), editor, leaf.view.file), nativeItems: app.metadataCache.getLinkSuggestions().filter(item => item.file?.path.startsWith(folder)).map(item=>item.path) };
  }
  finally {
    app.workspace.editorSuggest.close();
    await plugin().setShorthand(originalSettings.shorthand);
    await leaf.view.save();
    leaf.detach(); await pause(250); if (originalLeaf) app.workspace.setActiveLeaf(originalLeaf, {focus:true});
    for (const file of owned.reverse()) if (file.path.startsWith(folder + '/') && app.vault.getAbstractFileByPath(file.path) === file) await app.vault.delete(file);
    const root = path.resolve(app.vault.adapter.getBasePath()), dir = path.resolve(root, folder);
    if (dir.startsWith(root + path.sep) && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    report.summary = { passed: report.checks.filter(item => item.pass).length, failed: report.checks.filter(item => !item.pass).length };
    report.phase = 'complete'; report.fixturePaths = ownedPaths(); save();
  }
};
