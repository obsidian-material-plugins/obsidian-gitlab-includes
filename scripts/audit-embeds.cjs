module.exports = async function auditEmbeds(app, options) {
  const fs = require('fs');
  const reportPath = options.reportPath;
  const report = { appVersion: options.appVersion, checks: [], differences: {}, errors: [] };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const leaf = app.workspace.getMostRecentLeaf();
  const originalState = leaf.getViewState();
  const folder = 'include-parity-audit-' + Date.now();
  const owned = [];
  const registry = app.embedRegistry;
  const originalCreator = registry.getEmbedCreator;
  const components = new WeakMap();
  registry.getEmbedCreator = function(file) {
    const create = originalCreator.call(this, file);
    return create && function(context, target, subpath) {
      const component = create(context, target, subpath);
      components.set(context.containerEl, component);
      return component;
    };
  };
  const visible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
  const roots = () => {
    const all = [...leaf.view.containerEl.querySelectorAll('.internal-embed')].filter(visible);
    return { include: all.find(el => el.closest('.gitlab-include')), native: all.find(el => !el.closest('.gitlab-include')) };
  };
  const until = async (predicate, label) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await pause(50);
    }
    throw new Error('Timed out: ' + label);
  };
  const ready = async (selector = 'h2') => {
    const cm = leaf.view.getMode() === 'source' ? leaf.view.editor.cm : null;
    if (cm) { cm.scrollDOM.scrollTop = 0; cm.requestMeasure(); }
    await until(() => { const r = roots(); return r.include?.querySelector(selector) && r.native?.querySelector(selector); }, 'both native embeds rendering ' + selector);
  };
  const styleDiff = (a, b) => {
    if (!a || !b) return [{ missing: true }];
    const x = getComputedStyle(a), y = getComputedStyle(b);
    return [...x].filter(key => x.getPropertyValue(key) !== y.getPropertyValue(key)).map(key => ({ key, include: x.getPropertyValue(key), native: y.getPropertyValue(key) }));
  };
  const sourceText = 'Before\n\n::include{file=child.md}\n\nBetween\n\n![child](child.md)\n\nAfter\n';
  const targetText = '## Heading\n\nParagraph with **bold** text and [local link](other.md).\n\n- [ ] Task\n- List item\n';
  let style;
  save();
  try {
    await app.vault.createFolder(folder);
    for (const [name, text] of [['source.md', sourceText], ['child.md', targetText], ['other.md', '# Destination']]) {
      owned.push(await app.vault.create(folder + '/' + name, text));
    }
    await pause(400);
    for (const mode of ['source', 'preview']) {
      await leaf.setViewState({ type: 'markdown', state: { file: folder + '/source.md', mode, source: false } });
      await pause(700);
      if (mode === 'source') { leaf.view.editor.setCursor({ line: 0, ch: 0 }); await pause(200); }
      await ready('input[type=checkbox]');
      const { include, native } = roots();
      check(mode + ': both embeds mounted', include && native);
      if (!include || !native) continue;
      check(mode + ': same native component constructor', components.get(include)?.constructor === components.get(native)?.constructor, {
        include: components.get(include)?.constructor.name, native: components.get(native)?.constructor.name
      });
      const markup = el => ({ tag: el.tagName, classes: [...el.classList].filter(c => c !== 'gitlab-include').sort(), src: el.getAttribute('src'), alt: el.getAttribute('alt'), parent: el.parentElement.className });
      report.differences[mode + ': roots'] = { include: markup(include), native: markup(native) };
      check(mode + ': same embed attributes and classes', JSON.stringify({ ...markup(include), parent: null }) === JSON.stringify({ ...markup(native), parent: null }));
      for (const theme of ['theme-light', 'theme-dark']) {
        const wasLight = document.body.classList.contains('theme-light');
        document.body.classList.toggle('theme-light', theme === 'theme-light');
        document.body.classList.toggle('theme-dark', theme === 'theme-dark');
        check(mode + ': theme cascade matches in ' + theme, styleDiff(include, native).length === 0);
        document.body.classList.toggle('theme-light', wasLight);
        document.body.classList.toggle('theme-dark', !wasLight);
      }
      for (const [name, selector] of [['root', null], ['title', '.markdown-embed-title'], ['content', '.markdown-embed-content'], ['preview', '.markdown-preview-view'], ['heading', 'h2'], ['paragraph', '.el-p p'], ['open control', '.markdown-embed-link'], ['checkbox', 'input[type=checkbox]']]) {
        const a = selector ? include.querySelector(selector) : include;
        const b = selector ? native.querySelector(selector) : native;
        const diff = styleDiff(a, b);
        check(mode + ': all computed styles match for ' + name, diff.length === 0);
        if (diff.length) report.differences[mode + ': ' + name + ' styles'] = diff;
      }
      for (const selector of ['.cm-content > .internal-embed', 'p > .internal-embed', '.markdown-preview-section > .el-p > p > .internal-embed', '.internal-embed[src="child.md"]', '.internal-embed[alt="child"]']) {
        check(mode + ': selector parity ' + selector, include.matches(selector) === native.matches(selector), { include: include.matches(selector), native: native.matches(selector) });
      }
      style = document.createElement('style');
      style.textContent = '.internal-embed { --embed-background: rgb(11, 22, 33); border-radius: 13px !important; } .markdown-embed-title { color: rgb(17, 190, 94) !important; font-size: 19px !important; } .markdown-embed-content h2 { letter-spacing: 2px !important; } .markdown-embed-link { color: rgb(211, 100, 60) !important; }';
      document.head.append(style);
      for (const [name, selector, property] of [['background', null, 'backgroundColor'], ['title color', '.markdown-embed-title', 'color'], ['heading spacing', 'h2', 'letterSpacing'], ['control color', '.markdown-embed-link', 'color']]) {
        const a = selector ? include.querySelector(selector) : include;
        const b = selector ? native.querySelector(selector) : native;
        check(mode + ': live CSS propagates to ' + name, getComputedStyle(a)[property] === getComputedStyle(b)[property]);
      }
      style.remove(); style = null;
      style = document.createElement('style');
      style.textContent = '.cm-content > .internal-embed, .markdown-preview-section > .el-p > p > .internal-embed { outline: 3px dashed rgb(70, 80, 90) !important; }';
      document.head.append(style);
      check(mode + ': structural CSS snippet applies automatically', getComputedStyle(include).outline === getComputedStyle(native).outline && getComputedStyle(include).outlineStyle === 'dashed');
      style.remove(); style = null;
      const foldResults = [];
      for (const el of [include, native]) {
        const fold = el.querySelector('h2 .collapse-indicator');
        fold?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await pause(200);
        foldResults.push({ available: !!fold, hidden: !el.querySelector('.el-p') || el.querySelector('.el-p').getBoundingClientRect().height === 0 });
        fold?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await pause(150);
      }
      check(mode + ': heading folding works equally', foldResults.every(x => x.available && x.hidden), foldResults);
      for (const which of ['include', 'native']) {
        const target = owned.find(file => file.name === 'child.md');
        await app.vault.modify(target, targetText);
        // Use a fresh view for each independent edit; the two copies share a
        // file, so a previous checkbox save can otherwise overlap the reset.
        await leaf.setViewState({ type: 'markdown', state: { file: folder + '/other.md', mode, source: false } });
        await leaf.setViewState({ type: 'markdown', state: { file: folder + '/source.md', mode, source: false } });
        await pause(700);
        await ready('input[type=checkbox]');
        const el = roots()[which];
        const checkbox = el?.querySelector('input[type=checkbox]');
        const before = { checked: checkbox?.checked, text: await app.vault.cachedRead(target) };
        checkbox?.click();
        await pause(900);
        const after = await app.vault.cachedRead(target);
        check(mode + ': ' + which + ' checkbox updates target note', after.includes('- [x] Task'), { before, after });
        await app.vault.modify(target, targetText); await pause(700);
      }
      if (mode === 'source') {
        const editor = leaf.view.editor;
        const from = sourceText.indexOf('::include'), to = sourceText.indexOf('}', from) + 1;
        const clickResults = [];
        for (const which of ['include', 'native']) {
          editor.setCursor({ line: 0, ch: 0 });
          await pause(150);
          window.getSelection()?.removeAllRanges();
          const el = roots()[which];
          el.querySelector('h2')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
          await pause(250);
          const selected = editor.getSelection();
          clickResults.push(selected);
        }
        check('source: clicking embed selects reference for editing', clickResults[0] === sourceText.slice(from, to), clickResults);
        editor.setCursor({ line: 0, ch: 0 }); await pause(200);
        await ready();
        const before = roots();
        const target = owned.find(file => file.name === 'child.md');
        await app.vault.modify(target, targetText + '\nUpdated content\n');
        await until(() => { const r = roots(); return r.include?.textContent.includes('Updated content') && r.native?.textContent.includes('Updated content'); }, 'target edit rendered in both embeds');
        const after = roots();
        check('source: included content updates with target', after.include?.textContent.includes('Updated content') && after.native?.textContent.includes('Updated content'));
        check('source: target updates preserve embed instance like native', before.include === after.include && before.native === after.native, { include: before.include === after.include, native: before.native === after.native });
        await app.vault.modify(target, targetText); await pause(400);
        const rich = '---\ntags: [audit]\n---\n\n## Heading\n\nParagraph with **bold**, *italic*, `code` and [local link](other.md).\n\n> [!note] Callout\n> Content\n\n| One | Two |\n| --- | --- |\n| A | B |\n\n```js\nconst answer = 42;\n```\n\n' + Array.from({ length: 24 }, (_, i) => 'Paragraph ' + i + '.\n').join('\n');
        style = document.createElement('style');
        style.textContent = '.internal-embed { --embed-max-height: 240px; }';
        document.head.append(style);
        const cm = leaf.view.editor.cm;
        if (cm) { cm.scrollDOM.scrollTop = 0; cm.requestMeasure(); }
        await app.vault.modify(target, rich); await pause(800);
        await ready('table');
        const richRoots = roots();
        for (const selector of ['table', 'pre', '.callout', 'a.internal-link', '.metadata-container']) {
          const a = richRoots.include?.querySelector(selector), b = richRoots.native?.querySelector(selector);
          check('source: rich content parity ' + selector, a && b && a.textContent === b.textContent && styleDiff(a, b).length === 0);
        }
        const aScroll = richRoots.include?.querySelector('.markdown-embed-content'), bScroll = richRoots.native?.querySelector('.markdown-embed-content');
        if (aScroll && bScroll) { aScroll.scrollTop = 120; bScroll.scrollTop = 120; }
        check('source: long embeds scroll equally', aScroll?.scrollTop === bScroll?.scrollTop && aScroll?.scrollHeight === bScroll?.scrollHeight);
        await app.vault.modify(target, rich + '\nAdditional update\n'); await pause(700);
        check('source: target update preserves scroll like native', roots().include?.querySelector('.markdown-embed-content').scrollTop === roots().native?.querySelector('.markdown-embed-content').scrollTop);
        await app.vault.modify(target, targetText); await pause(700);
        style.remove(); style = null;
        for (const [name, anchor, head] of [['forward', 0, sourceText.length], ['reverse', sourceText.length, 0]]) {
          editor.setSelection(editor.offsetToPos(anchor), editor.offsetToPos(head)); await pause(200);
          const content = leaf.view.containerEl.querySelector('.markdown-source-view .cm-content');
          check('source: ' + name + ' selection keeps include reference hidden', !content.textContent.includes('::include{file='));
        }
        editor.setCursor(editor.offsetToPos(from + 10)); await pause(200);
        check('source: arrow/caret editing reveals reference', leaf.view.containerEl.querySelector('.markdown-source-view .cm-content').textContent.includes('::include{file='));
      }
    }
    check('source Markdown unchanged', await app.vault.cachedRead(owned.find(file => file.name === 'source.md')) === sourceText);
    const originalConfig = app.vault.getConfig;
    // Exercise both preference values without changing app.json on disk.
    app.vault.getConfig = function(key) { return key === 'alwaysUpdateLinks' ? true : originalConfig.call(this, key); };
    try {
      const source = owned.find(file => file.name === 'source.md');
      const child = owned.find(file => file.name === 'child.md');
      await leaf.setViewState({ type: 'markdown', state: { file: source.path, mode: 'source', source: false } });
      await pause(300);
      await app.fileManager.renameFile(child, folder + '/renamed child.md');
      await until(async () => (await app.vault.cachedRead(source)).includes('::include{file=renamed child.md}'), 'target reference rename');
      await ready();
      check('rename: included target reference remains GitLab syntax', (await app.vault.cachedRead(source)).includes('::include{file=renamed child.md}'));
      check('rename: both embeds render after target rename', roots().include?.textContent.includes('Heading') && roots().native?.textContent.includes('Heading'));
      await app.vault.createFolder(folder + '/moved');
      await app.fileManager.renameFile(source, folder + '/moved/source.md');
      await until(async () => (await app.vault.cachedRead(source)).includes('::include{file=../renamed child.md}'), 'source reference rebase');
      await ready();
      check('rename: moving the source rebases relative include paths', (await app.vault.cachedRead(source)).includes('::include{file=../renamed child.md}'));
      check('rename: both embeds render after source move', roots().include?.textContent.includes('Heading') && roots().native?.textContent.includes('Heading'));
      const dir = app.vault.getAbstractFileByPath(folder);
      await app.fileManager.renameFile(dir, folder + '-moved');
      await pause(900);
      await ready();
      check('rename: folder move preserves an unchanged relative include', (await app.vault.cachedRead(source)).includes('::include{file=../renamed child.md}'), { path: source.path, text: await app.vault.cachedRead(source) });
      check('rename: both embeds render after moving source and target together', roots().include?.textContent.includes('Heading') && roots().native?.textContent.includes('Heading'));
      app.vault.getConfig = function(key) { return key === 'alwaysUpdateLinks' ? false : originalConfig.call(this, key); };
      const before = await app.vault.cachedRead(source), childPath = child.path;
      await app.vault.rename(child, folder + '-moved/disabled.md');
      await pause(600);
      check('rename: disabled automatic link updates preserve source', await app.vault.cachedRead(source) === before);
      await app.vault.rename(child, childPath);
      await pause(300);
    } finally { app.vault.getConfig = originalConfig; }
  } catch (error) {
    report.errors.push(String(error.stack || error));
  } finally {
    style?.remove();
    registry.getEmbedCreator = originalCreator;
    report.summary = { passed: report.checks.filter(x => x.pass).length, failed: report.checks.filter(x => !x.pass).length };
    save();
    try {
      await leaf.setViewState(originalState);
      await pause(250);
      for (const file of owned.reverse()) if (app.vault.getAbstractFileByPath(file.path) === file && [folder, folder + '-moved'].some(dir => file.path.startsWith(dir + '/'))) await app.vault.delete(file);
      const path = require('path');
      const root = path.resolve(app.vault.adapter.getBasePath());
      for (const dir of [folder + '/moved', folder + '-moved/moved', folder, folder + '-moved']) {
        const absolute = path.resolve(root, dir);
        if (absolute.startsWith(root + path.sep) && fs.existsSync(absolute) && fs.readdirSync(absolute).length === 0) fs.rmdirSync(absolute);
      }
    } catch (error) { report.errors.push('cleanup: ' + String(error.stack || error)); }
    save();
  }
};
