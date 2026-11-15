const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSession } = require('../src/transcript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function host(discoverSessions, workspaceFolders, savedSelection, family, { open = true, root: firstRoot = 'old-root', workspaceFile, sessions = 'all' } = {}) {
  const callbacks = {};
  const messages = [];
  const reads = [];
  const readers = [];
  const contexts = [];
  const counts = { panels: 0, reveals: 0 };
  const executed = [];
  const views = [];
  let root = firstRoot;
  let stopped = false;
  const disposable = { dispose() {} };
  const panel = {
    visible: true, reveal() { counts.reveals++; },
    webview: { cspSource: 'test:', asWebviewUri: value => value, onDidReceiveMessage: callback => { callbacks.message = callback; return disposable; }, postMessage: async value => { messages.push(value); } },
    onDidChangeViewState: callback => { callbacks.visibility = callback; return disposable; },
    onDidDispose: callback => { callbacks.dispose = callback; }, dispose() { callbacks.dispose(); }
  };
  const vscode = {
    commands: { registerCommand: (name, callback) => { callbacks[name === 'agentviz.open' ? 'open' : name] = callback; return disposable; }, executeCommand: async (...args) => { executed.push(args); } },
    window: { createWebviewPanel: () => { counts.panels++; return panel; }, createTreeView: (id, options) => { views.push({ id, options }); return { visible: false, onDidChangeVisibility: callback => { callbacks.sidebar = callback; return disposable; }, dispose() {} }; }, showErrorMessage: message => { throw Error(message); } },
    workspace: {
      workspaceFolders, workspaceFile, name: 'Window name (Workspace)',
      // Past fixture sessions are listed unless a test asks for the default (running sessions only).
      getConfiguration: () => ({ get: key => key === 'sessions' ? sessions : root }),
      onDidChangeConfiguration: callback => { callbacks.config = callback; return disposable; }
    },
    Uri: { joinPath: (...parts) => parts.join('/') }, ViewColumn: { One: 1 }
  };
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require: name => {
    if (name === 'vscode') return vscode;
    // S04: the host follows a session through FamilyReader and hands it the host-only list of source files.
    if (name === './sessions') return { discoverSessions, FamilyReader: class {
      constructor(provider, id) { readers.push(id); }
      async read(file, context) { reads.push(file); contexts.push(context); return family ? family(file, context) : createSession('claude', 'synthetic'); }
      async detail(lane, id) { return { ok: true, lane, id }; }
    } };
    if (name === './webview') return require('../src/webview');
    if (name === './transcript') return require('../src/transcript');
    return require(name);
  }, setInterval: callback => { callbacks.tick = callback; return 1; }, clearInterval: () => { stopped = true; } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/extension.js'), 'utf8'), sandbox);
  module.exports.activate({ extensionUri: 'extension:', subscriptions: [], workspaceState: { get() { return savedSelection; }, async update() {} } });
  if (open) callbacks.open();
  return { callbacks, messages, reads, readers, contexts, counts, executed, views, stopped: () => stopped,
    // S07: the entry command another extension calls. The promise is never left unhandled by a throw.
    openSession: argument => Promise.resolve().then(() => callbacks['agentviz.openSession'](argument)),
    setRoot(value) { root = value; if (callbacks.config) callbacks.config({ affectsConfiguration: () => true }); } };
}

const catalog = root => ({ sessions: [{ id: root, sessionId: 'synthetic', provider: 'claude', project: 'Example', file: `${root}/session.jsonl`, modified: 1 }], warnings: [] });

// The sidebar icon and the Settings button (Robert, 12 November 2026).
test('the sidebar view opens the activity tab when shown, and Settings opens AgentViz settings from the command and the panel', async () => {
  const instance = host(() => Promise.resolve(catalog('root')), undefined, undefined, undefined, { open: false });
  assert.deepEqual(instance.views.map(view => view.id), ['agentviz.home']);
  assert.equal((await instance.views[0].options.treeDataProvider.getChildren()).length, 0, 'empty, so VS Code shows the welcome text');
  instance.callbacks.sidebar({ visible: false });
  assert.equal(instance.counts.panels, 0);
  instance.callbacks.sidebar({ visible: true });
  assert.equal(instance.counts.panels, 1);
  instance.callbacks.sidebar({ visible: true });
  assert.deepEqual([instance.counts.panels, instance.counts.reveals], [1, 1], 'shown again: the same tab is brought forward');
  await instance.callbacks['agentviz.settings']();
  instance.callbacks.message({ type: 'settings' });
  assert.deepEqual(instance.executed, [['workbench.action.openSettings', '@ext:agentviz-local.agent-viz'], ['agentviz.settings']]);
  instance.callbacks.dispose();
});

// Details on click: the panel asks about one event; only a plain lane key and event ID reach the reader.
test('a detail request is answered by the followed session\'s reader under its own number; malformed ones are refused', async () => {
  const instance = host(() => Promise.resolve(catalog('root')));
  instance.callbacks.message({ type: 'ready' });
  await flush();
  const answers = () => instance.messages.filter(message => message.type === 'detail');
  instance.callbacks.message({ type: 'detail', requestId: 4, lane: 'main', id: 'toolu_1' });
  await flush();
  assert.equal(JSON.stringify(answers().at(-1)), JSON.stringify({ type: 'detail', requestId: 4, detail: { ok: true, lane: 'main', id: 'toolu_1' } }));
  instance.callbacks.message({ type: 'detail', requestId: 5, lane: '../x', id: 'toolu_1' });
  instance.callbacks.message({ type: 'detail', requestId: 6, lane: 'main', id: 'a b' });
  await flush();
  assert.deepEqual(answers().slice(-2).map(message => [message.requestId, message.detail.reason]), [[5, 'invalid-argument'], [6, 'invalid-argument']]);
  const before = answers().length;
  instance.callbacks.message({ type: 'detail', lane: 'main', id: 'toolu_1' });
  await flush();
  assert.equal(answers().length, before, 'no request number, no answer');
  instance.callbacks.dispose();
});

// SPEC: first-slice acceptance 3 and 5, validated selection and complete disposal.
test('a configuration change discards an outstanding discovery from the previous source', async () => {
  let resolveOld;
  const instance = host(({ claudeRoot }) => claudeRoot === 'old-root' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(catalog(claudeRoot)));
  instance.callbacks.message({ type: 'ready' });
  instance.setRoot('new-root');
  resolveOld(catalog('old-root'));
  await flush();
  instance.callbacks.tick();
  await flush();
  assert.deepEqual(instance.reads, ['new-root/session.jsonl']);
  assert.equal(instance.messages.at(-1).selectedId, 'new-root');
  assert.ok(!JSON.stringify(instance.messages).includes('session.jsonl'));
  instance.callbacks.message({ type: 'select', id: 'unlisted-private-file' });
  await flush();
  assert.equal(instance.messages.at(-1).selectedId, 'new-root');
  instance.callbacks.dispose();
  assert.equal(instance.stopped(), true);
  const count = instance.reads.length;
  instance.callbacks.tick();
  await flush();
  assert.equal(instance.reads.length, count);
});

test('old picker entries cannot reselect the old source while new roots are being discovered', async () => {
  let resolveNew;
  const instance = host(({ claudeRoot }) => claudeRoot === 'new-root' ? new Promise(resolve => { resolveNew = resolve; }) : Promise.resolve(catalog(claudeRoot)));
  instance.callbacks.message({ type: 'ready' });
  await flush();
  const oldReadCount = instance.reads.length;
  instance.setRoot('new-root');
  instance.callbacks.message({ type: 'select', id: 'old-root' });
  resolveNew(catalog('new-root'));
  await flush();
  instance.callbacks.tick();
  await flush();
  assert.ok(instance.reads.slice(oldReadCount).every(file => file === 'new-root/session.jsonl'));
  assert.equal(instance.messages.at(-1).selectedId, 'new-root');
  instance.callbacks.dispose();
});

// SPEC: S01, the webview receives only approved catalogue metadata.
test('the host message carries workspace, name and full ID metadata and nothing unlisted', async () => {
  const fullId = '11111111-2222-4333-8444-555555555555';
  const entry = (id, extra) => ({ id, sessionId: fullId, provider: 'claude', project: 'Example', child: false, modified: 1, file: `C:/PRIVATE_PATH/${id}.jsonl`,
    workspaceKey: 'ws:0123456789abcdef0123', workspaceLabel: 'Alpha/Example', name: 'Synthetic name', nameSource: 'custom', ...extra });
  const instance = host(() => Promise.resolve({ warnings: [], sessions: [
    entry('claude:one', { cwd: 'C:/PRIVATE_PATH/Example', prompt: 'PRIVATE_PROMPT', token: 'PRIVATE_SECRET', custom: 'PRIVATE_CACHE' }),
    entry('codex:two', { provider: 'codex', name: '<b>x</b>\u001b[2J\u202E' + 'n'.repeat(300), nameSource: 'index', workspaceLabel: 'L'.repeat(300) }),
    entry('claude:three', { name: undefined, nameSource: 'PRIVATE_SOURCE', workspaceKey: 'C:/PRIVATE_PATH/Example', workspaceLabel: 7 })
  ] }));
  instance.callbacks.message({ type: 'ready' });
  await flush();
  const { sessions, selectedId } = instance.messages.at(-1);
  assert.equal(selectedId, 'claude:one');
  for (const session of sessions) assert.deepEqual(Object.keys(session).sort(), ['child', 'id', 'modified', 'name', 'nameSource', 'project', 'provider', 'sessionId', 'workspaceKey', 'workspaceLabel']);
  assert.deepEqual({ ...sessions[0] }, { id: 'claude:one', sessionId: fullId, provider: 'claude', project: 'Example', child: false, modified: 1,
    workspaceKey: 'ws:0123456789abcdef0123', workspaceLabel: 'Alpha/Example', name: 'Synthetic name', nameSource: 'custom' });
  assert.ok(sessions[1].name.startsWith('<b>x</b>'));
  assert.ok([...sessions[1].name].length <= 80 && [...sessions[1].workspaceLabel].length <= 80);
  assert.doesNotMatch(sessions[1].name, /[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/);
  assert.deepEqual([sessions[2].name, sessions[2].nameSource, sessions[2].workspaceKey, sessions[2].workspaceLabel], ['Unnamed session', 'none', 'ws:unknown', 'Unknown workspace']);
  assert.doesNotMatch(JSON.stringify(instance.messages), /PRIVATE_|\.jsonl/);
  instance.callbacks.dispose();
});

// SPEC: S01, a workspace folder is associated only by its proven directory, never by basename.
test('the first selection follows the open folder by directory identity, not a matching basename', async () => {
  const { workspaceIdentity } = require('../src/transcript');
  const entry = (id, cwd, modified) => ({ id, sessionId: id, provider: 'claude', project: 'Example', child: false, modified, file: `${id}.jsonl`,
    workspaceKey: workspaceIdentity(cwd).key, workspaceLabel: 'Example', name: 'Unnamed session', nameSource: 'none' });
  const sessions = [entry('other-directory', 'D:\\Other\\Example', 3), entry('open-directory', 'C:\\Work\\Example', 2)];
  const matched = host(() => Promise.resolve({ warnings: [], sessions }), [{ name: 'Example', uri: { scheme: 'file', fsPath: 'c:\\work\\example' } }]);
  matched.callbacks.message({ type: 'ready' });
  await flush();
  assert.equal(matched.messages.at(-1).selectedId, 'open-directory');
  matched.callbacks.dispose();
  const unproven = host(() => Promise.resolve({ warnings: [], sessions }), [{ name: 'Example', uri: { scheme: 'file', fsPath: 'E:\\Elsewhere\\Example' } }]);
  unproven.callbacks.message({ type: 'ready' });
  await flush();
  assert.equal(unproven.messages.at(-1).selectedId, 'other-directory');
  unproven.callbacks.dispose();
});

// A project is the workspace loaded in the window (Robert, 2026-11-15): discovery is told its file and its name.
test('discovery is given the loaded workspace file as the one project, and nothing for a single folder', async () => {
  const folders = [{ name: 'Alpha', uri: { scheme: 'file', fsPath: 'C:\\Work\\Alpha' } }, { name: 'Beta', uri: { scheme: 'file', fsPath: 'D:\\Tools\\Beta' } }];
  const asked = async workspaceFile => {
    const calls = [];
    const instance = host((roots, options) => { calls.push(options); return Promise.resolve({ warnings: [], sessions: [] }); }, folders, undefined, undefined, { workspaceFile });
    instance.callbacks.message({ type: 'ready' });
    await flush();
    instance.callbacks.dispose();
    return { scope: [...calls[0].scope], project: calls[0].project && { ...calls[0].project } };
  };
  const scope = ['C:\\Work\\Alpha', 'D:\\Tools\\Beta'];
  assert.deepEqual(await asked({ scheme: 'file', fsPath: 'C:\\Work\\Alpha\\Studio.code-workspace' }), { scope, project: { path: 'C:\\Work\\Alpha\\Studio.code-workspace', name: 'Studio' } });
  assert.deepEqual(await asked({ scheme: 'untitled', toString: () => 'untitled:Untitled-1' }), { scope, project: { path: 'untitled:Untitled-1', name: 'Window name (Workspace)' } });
  assert.deepEqual(await asked(undefined), { scope, project: undefined });
});

// Only live sessions are listed (Robert, 2026-11-15): that is the default, `all` turns it off, and the page is told.
test('discovery is asked for running sessions only unless the setting says all, and the page is told which', async () => {
  const asked = async sessions => {
    const calls = [];
    const instance = host((roots, options) => { calls.push(options); return Promise.resolve(answer([listed('claude:one')], undefined, { live: options.live === true })); }, undefined, undefined, undefined, { sessions });
    instance.callbacks.message({ type: 'ready' });
    await flush();
    instance.callbacks.dispose();
    return [calls[0].live, instance.messages.at(-1).lookup.live];
  };
  assert.deepEqual(await asked('live'), [true, true]);
  assert.deepEqual(await asked(''), [true, true], 'anything but all means running sessions only');
  assert.deepEqual(await asked('all'), [false, false]);
});

// S03: the host query contract. Synthetic catalogue; `all` is every session of the source, `sessions` the answer.
const WS_A = `ws:${'a'.repeat(20)}`;
const WS_B = `ws:${'b'.repeat(20)}`;
const listed = (id, extra = {}) => ({ id, sessionId: `${id}-full-id`, provider: 'claude', project: 'Example', child: false, modified: 1, file: `C:/PRIVATE_PATH/${id}.jsonl`,
  workspaceKey: WS_A, workspaceLabel: 'Example', name: `Name of ${id}`, nameSource: 'custom', ...extra });
const answer = (sessions, all = sessions, extra = {}) => ({ sessions, kept: [], warnings: [], all, total: all.length, matched: sessions.length, limit: 80,
  workspaces: [{ key: WS_A, label: 'Example', count: all.length }], pending: { workspaces: 0, names: 0 }, walk: { files: all, warnings: [] }, ...extra });

test('the host passes the filters and the followed session to discovery and answers with the request number', async () => {
  const calls = [];
  const recent = listed('claude:recent');
  const result = answer([recent], [recent], { workspaces: [{ key: WS_A, label: 'Example', count: 1 }, { key: 'C:/PRIVATE_PATH/Example', label: 'PRIVATE_LABEL', count: -4, cwd: 'PRIVATE_CWD' }, { key: WS_B, label: '<b>x</b>\u202E', count: 3 }],
    total: 412, matched: 97, pending: { workspaces: 2, names: 5 }, cost: { secret: 'PRIVATE_COST' } });
  const instance = host((roots, options) => { calls.push(options); return Promise.resolve(result); });
  instance.callbacks.message({ type: 'ready', query: { seq: 5, workspaceKey: WS_B, name: '  Login ', id: 'ABC', extra: 'PRIVATE_EXTRA' } });
  await flush();
  assert.deepEqual({ ...calls[0].query }, { seq: 5, workspaceKey: WS_B, name: '  Login ', id: 'ABC' });
  assert.deepEqual([...calls[0].keep], []);
  assert.equal(calls[0].walk, undefined, 'the first lookup lists the folders');
  const message = instance.messages.at(-1);
  assert.deepEqual({ ...message.lookup }, { seq: 5, total: 412, matched: 97, limit: 80, pendingNames: 5, pendingWorkspaces: 2, missing: false, live: false });
  assert.deepEqual(message.workspaces.map(group => ({ ...group })), [{ key: WS_A, label: 'Example', count: 1 }, { key: 'ws:unknown', label: 'Unknown workspace', count: 0 }, { key: WS_B, label: '<b>x</b>', count: 3 }]);
  assert.equal(message.selected.id, 'claude:recent');
  assert.deepEqual(Object.keys(message.selected).sort(), Object.keys(message.sessions[0]).sort());

  // A hostile request is reduced to a known key shape and bounded strings before discovery sees it.
  instance.callbacks.message({ type: 'query', seq: 6, workspaceKey: 'C:/PRIVATE_PATH', name: { toString: () => 'PRIVATE_NAME' }, id: 'x'.repeat(500) });
  await flush();
  assert.deepEqual({ ...calls.at(-1).query }, { seq: 6, workspaceKey: '', name: '', id: 'x'.repeat(200) });
  assert.deepEqual([...calls.at(-1).keep], ['claude:recent'], 'the followed session is always looked up, whatever the filters');
  assert.equal(calls.at(-1).walk, result.walk, 'a new filter reuses the folder listing instead of walking again');
  assert.equal(instance.messages.at(-1).lookup.seq, 6);

  // A request numbered below the newest one arrived late: it is ignored.
  const count = calls.length;
  instance.callbacks.message({ type: 'query', seq: 4, workspaceKey: '', name: 'late', id: '' });
  instance.callbacks.message({ type: 'query', seq: 6, workspaceKey: '', name: 'repeat', id: '' });
  instance.callbacks.message({ type: 'query', seq: 'PRIVATE_SEQ', name: 'bad' });
  await flush();
  instance.callbacks.tick();
  await flush();
  // Names and projects were reported as still being read, so the lookup continues, for the same request.
  assert.ok(calls.length > count);
  assert.ok(calls.slice(count).every(call => call.query.seq === 6 && call.query.name === '' && call.walk === result.walk));
  assert.doesNotMatch(JSON.stringify(instance.messages), /PRIVATE_|\.jsonl/);
  instance.callbacks.dispose();
});

test('a lookup overtaken by newer filters or a new source is never shown as their answer', async () => {
  const pending = [];
  const instance = host((roots, options) => new Promise(resolve => { pending.push({ roots, options, resolve }); }));
  const first = listed('claude:first-answer');
  const second = listed('claude:second-answer');
  instance.callbacks.message({ type: 'ready', query: { seq: 1, workspaceKey: '', name: '', id: '' } });
  await flush();
  instance.callbacks.message({ type: 'query', seq: 2, workspaceKey: '', name: 'second', id: '' });
  await flush();
  assert.equal(pending.length, 1, 'one lookup at a time');
  pending[0].resolve(answer([first]));
  await flush();
  assert.deepEqual(instance.messages, [], 'the answer to request 1 arrived after request 2 and is dropped');
  instance.callbacks.tick();
  await flush();
  assert.equal(pending[1].options.query.seq, 2);

  // While request 2 is being answered the source changes and request 3 arrives; both make that answer stale.
  instance.setRoot('new-root');
  instance.callbacks.message({ type: 'query', seq: 3, workspaceKey: '', name: 'third', id: '' });
  pending[1].resolve(answer([first]));
  await flush();
  assert.deepEqual(instance.messages, []);
  assert.deepEqual(instance.reads, [], 'nothing from the old source is read');
  instance.callbacks.tick();
  await flush();
  assert.deepEqual([pending[2].roots.claudeRoot, pending[2].options.query.seq, pending[2].options.query.name], ['new-root', 3, 'third']);
  assert.equal(pending[2].options.walk, undefined, 'a new source is listed afresh');
  pending[2].resolve(answer([second]));
  await flush();
  assert.equal(instance.messages.length, 1);
  assert.deepEqual([instance.messages[0].lookup.seq, instance.messages[0].selectedId, instance.messages[0].sessions.map(session => session.id)], [3, 'claude:second-answer', ['claude:second-answer']]);
  instance.callbacks.dispose();
});

test('an older session can be followed by ID and stays followed through rename, reordering and deletion', async () => {
  const recent = [listed('claude:recent-1'), listed('claude:recent-2')];
  const old = listed('claude:old', { workspaceKey: WS_B, workspaceLabel: 'Archive', name: 'Before rename' });
  let current = answer(recent, [...recent, old]);
  const calls = [];
  const instance = host((roots, options) => { calls.push(options); return Promise.resolve(current); });
  const lookAgain = async name => { instance.callbacks.message({ type: 'query', seq: calls.length + 1, workspaceKey: '', name, id: '' }); await flush(); };
  instance.callbacks.message({ type: 'ready' });
  await flush();
  assert.equal(instance.messages.at(-1).selectedId, 'claude:recent-1');

  // IDs are checked against every session of the current source, not only the returned list.
  instance.callbacks.message({ type: 'select', id: 'codex:not-in-this-source' });
  instance.callbacks.message({ type: 'select', id: 'C:/PRIVATE_PATH/claude:old.jsonl' });
  await flush();
  assert.equal(instance.messages.at(-1).selectedId, 'claude:recent-1');
  instance.callbacks.message({ type: 'select', id: 'claude:old' });
  await flush();
  let message = instance.messages.at(-1);
  assert.deepEqual([message.selectedId, message.selected.name, message.selected.workspaceLabel], ['claude:old', 'Before rename', 'Archive']);
  assert.ok(!message.sessions.some(session => session.id === 'claude:old'), 'the answer list is not padded; the followed session travels on its own');
  assert.equal(instance.reads.at(-1), 'C:/PRIVATE_PATH/claude:old.jsonl');
  const readers = instance.readers.length;

  // Renamed, and pushed further down by newer sessions: same ID, same reader, new name.
  current = answer([listed('claude:newer'), ...recent], [listed('claude:newer'), ...recent, { ...old, name: 'After rename' }]);
  await lookAgain('zzz');
  message = instance.messages.at(-1);
  assert.deepEqual([...calls.at(-1).keep], ['claude:old']);
  assert.deepEqual([message.selectedId, message.selected.name, message.lookup.missing], ['claude:old', 'After rename', false]);
  assert.equal(instance.readers.length, readers, 'an ordinary refresh keeps reading the same source from where it was');

  // Deleted: still named, reported as missing, not read, and not replaced by the newest session.
  current = answer([listed('claude:newer'), ...recent]);
  const reads = instance.reads.length;
  await lookAgain('');
  message = instance.messages.at(-1);
  assert.deepEqual([message.selectedId, message.selected.name, message.lookup.missing, message.snapshot], ['claude:old', 'After rename', true, null]);
  assert.match(message.warnings.join(' '), /no longer in the source folders/);
  assert.equal(instance.reads.length, reads);
  instance.callbacks.tick();
  await flush();
  assert.equal(instance.messages.at(-1).selectedId, 'claude:old');
  assert.equal(instance.reads.length, reads);

  // It comes back (same file, same ID): followed again without a new choice.
  current = answer(recent, [...recent, { ...old, name: 'Back again' }]);
  await lookAgain('back');
  message = instance.messages.at(-1);
  assert.deepEqual([message.selectedId, message.selected.name, message.lookup.missing], ['claude:old', 'Back again', false]);
  assert.equal(instance.reads.length, reads + 1);

  // The same file on disk is listed under its other path (a hard link was added): still followed, same reader.
  current = answer(recent, [...recent, { ...old, name: 'Back again', identity: 'disk:1' }]);
  await lookAgain('link');
  const before = instance.readers.length;
  current = answer(recent, [...recent, { ...old, id: 'claude:old-link', file: 'C:/PRIVATE_PATH/link.jsonl', name: 'Back again', identity: 'disk:1' }]);
  await lookAgain('linked');
  message = instance.messages.at(-1);
  assert.deepEqual([message.selectedId, message.selected.name, message.lookup.missing], ['claude:old-link', 'Back again', false]);
  assert.equal(instance.reads.at(-1), 'C:/PRIVATE_PATH/link.jsonl');
  assert.equal(instance.readers.length, before);
  // Another file with the same session ID is not it.
  current = answer(recent, [...recent, { ...old, id: 'claude:old-copy', identity: 'disk:2' }]);
  await lookAgain('copy');
  assert.deepEqual([instance.messages.at(-1).selectedId, instance.messages.at(-1).lookup.missing], ['claude:old-link', true]);
  assert.doesNotMatch(JSON.stringify(instance.messages), /PRIVATE_|\.jsonl/);
  instance.callbacks.dispose();
});

// SPEC: S04, the host follows one family per selection and forwards its lanes without source metadata.
test('the host gives the family reader the source list, forwards lanes, and starts a new reader on a new selection', async () => {
  const first = listed('claude:first');
  const second = listed('claude:second');
  const child = listed('claude:child', { child: true, parentId: 'PRIVATE_PARENT' });
  const all = [first, second, child];
  const instance = host(() => Promise.resolve(answer([first, second], all)), undefined, undefined, (file, context) => ({
    ...createSession('claude', 'synthetic'),
    family: { lanes: [{ key: 'main', depth: 0 }, { key: 'agent-1', depth: 1, label: 'Explore', events: [], listed: context.files.length }], found: 1, limit: 24, eventLimit: 2000, notes: [] }
  }));
  instance.callbacks.message({ type: 'ready' });
  await flush();
  assert.equal(instance.contexts.at(-1).files, all, 'the host-only list of every source transcript, not the returned page');
  let message = instance.messages.at(-1);
  assert.deepEqual(message.snapshot.family.lanes.map(lane => [lane.key, lane.depth]), [['main', 0], ['agent-1', 1]]);
  assert.equal(message.snapshot.family.lanes[1].listed, 3);
  assert.deepEqual(instance.readers, ['claude:first-full-id']);
  instance.callbacks.tick();
  await flush();
  assert.deepEqual(instance.readers, ['claude:first-full-id'], 'an ordinary refresh keeps the same family reader');

  // Another selection: a new reader, and the first family's transcript is not read again.
  instance.callbacks.message({ type: 'select', id: 'claude:second' });
  await flush();
  instance.callbacks.tick();
  await flush();
  assert.deepEqual(instance.readers, ['claude:first-full-id', 'claude:second-full-id']);
  const reads = instance.reads.length;
  assert.ok(instance.reads.slice(instance.reads.lastIndexOf('C:/PRIVATE_PATH/claude:first.jsonl') + 1).every(file => file === 'C:/PRIVATE_PATH/claude:second.jsonl'));
  assert.doesNotMatch(JSON.stringify(instance.messages), /PRIVATE_|\.jsonl|parentId/);

  // Disposal stops every read, so no child reader outlives the panel.
  instance.callbacks.dispose();
  instance.callbacks.tick();
  await flush();
  assert.equal(instance.reads.length, reads);
});

test('a saved selection older than the returned list is restored and its own name is read', async () => {
  const recent = [listed('claude:recent-1'), listed('claude:recent-2')];
  const calls = [];
  const instance = host((roots, options) => {
    calls.push(options);
    // Like discovery: only returned and kept sessions carry a name.
    const old = listed('claude:old', { name: options.keep.includes('claude:old') ? 'Old but named' : undefined });
    return Promise.resolve(answer(recent, [...recent, old]));
  }, undefined, 'claude:old');
  instance.callbacks.message({ type: 'ready' });
  await flush();
  const message = instance.messages.at(-1);
  assert.deepEqual([message.selectedId, message.selected.name], ['claude:old', 'Old but named']);
  assert.deepEqual(calls.map(call => [...call.keep]), [[], ['claude:old']]);
  assert.equal(calls[1].walk.files.length, 3, 'the second read reuses the listing');
  instance.callbacks.dispose();
});

// SPEC: S07, the narrow entry command another extension calls. Lookups made by the command ask for no project
// or name reads (headBudget and titleBudget 0); the panel's own lookups do not set them.
const CLAUDE_ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const CODEX_ID = '0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
const byCommand = options => options.headBudget === 0 && options.titleBudget === 0;
const entrySource = () => {
  const recent = [listed('claude:recent-1'), listed('claude:recent-2')];
  const old = listed('claude:old', { sessionId: CLAUDE_ID, name: undefined });
  const codex = listed('codex:old', { provider: 'codex', sessionId: CODEX_ID, name: undefined });
  return { recent, old, codex, all: [...recent, old, codex] };
};
const until = async (instance, done) => {
  for (let pass = 0; pass < 500 && !done(); pass++) { instance.callbacks.tick?.(); await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.ok(done(), 'the expected host state was reached');
};

test('agentviz.openSession opens the panel on a session of either provider that is older than the returned list', async () => {
  const { recent, all } = entrySource();
  const calls = [];
  const instance = host((roots, options) => { calls.push(options); return Promise.resolve(answer(recent, all)); }, undefined, 'claude:recent-2', undefined, { open: false });
  assert.equal(instance.counts.panels, 0);
  const first = await instance.openSession({ provider: 'claude', sessionId: CLAUDE_ID });
  assert.deepEqual({ ...first }, { ok: true, provider: 'claude', sessionId: CLAUDE_ID });
  assert.equal(instance.counts.panels, 1, 'no panel was open, so one is created');
  assert.ok(byCommand(calls[0]));
  assert.deepEqual({ ...calls[0].query }, { id: CLAUDE_ID }, 'the target is resolved through the ID lookup of the catalogue query');
  assert.equal(calls[0].walk, undefined, 'the source folders are listed for the lookup');
  instance.callbacks.message({ type: 'ready' });
  await flush();
  let message = instance.messages.at(-1);
  assert.deepEqual([message.selectedId, message.selected.sessionId, message.selected.provider], ['claude:old', CLAUDE_ID, 'claude'], 'the addressed session wins over the saved selection');
  assert.ok(!message.sessions.some(session => session.id === 'claude:old'), 'it is outside the returned list');
  assert.equal(instance.reads.at(-1), 'C:/PRIVATE_PATH/claude:old.jsonl', 'the transcript path comes from the listing');

  // The other provider, on the panel that is already open. IDs are compared without case.
  const second = await instance.openSession({ provider: 'codex', sessionId: CODEX_ID.toUpperCase() });
  await flush();
  assert.deepEqual({ ...second }, { ok: true, provider: 'codex', sessionId: CODEX_ID });
  assert.deepEqual([instance.counts.panels, instance.counts.reveals], [1, 1], 'the open panel is reused and revealed');
  message = instance.messages.at(-1);
  assert.deepEqual([message.selectedId, message.selected.sessionId, message.selected.provider], ['codex:old', CODEX_ID, 'codex']);
  assert.equal(instance.readers.at(-1), CODEX_ID);

  // The provider is part of the address: a Claude ID asked for as Codex is not found, and nothing changes.
  const third = await instance.openSession({ provider: 'codex', sessionId: CLAUDE_ID });
  await flush();
  assert.deepEqual({ ...third }, { ok: false, reason: 'not-found' });
  assert.equal(instance.messages.at(-1).selectedId, 'codex:old');
  assert.doesNotMatch(JSON.stringify([instance.messages, first, second, third]), /PRIVATE_|\.jsonl/);
  instance.callbacks.dispose();
});

test('an absent or unknown session ID opens nothing and leaves an open panel on its session', async () => {
  const { recent, all } = entrySource();
  const discover = () => Promise.resolve(answer(recent, all));
  const closed = host(discover, undefined, undefined, undefined, { open: false });
  assert.deepEqual({ ...await closed.openSession({ provider: 'claude', sessionId: 'ffffffff-0000-4000-8000-000000000000' }) }, { ok: false, reason: 'not-found' });
  assert.deepEqual({ ...await closed.openSession() }, { ok: false, reason: 'invalid-argument' });
  // A fragment of a real ID is not an address.
  assert.deepEqual({ ...await closed.openSession({ provider: 'claude', sessionId: CLAUDE_ID.slice(0, 8) }) }, { ok: false, reason: 'not-found' });
  assert.equal(closed.counts.panels, 0);

  const opened = host(discover);
  opened.callbacks.message({ type: 'ready' });
  await flush();
  const readers = opened.readers.length;
  assert.deepEqual({ ...await opened.openSession({ provider: 'codex', sessionId: 'unknown-session' }) }, { ok: false, reason: 'not-found' });
  await flush();
  assert.deepEqual([opened.counts.panels, opened.counts.reveals, opened.readers.length, opened.messages.at(-1).selectedId], [1, 0, readers, 'claude:recent-1']);
  opened.callbacks.dispose();
});

test('an unavailable source is reported as such, without a panel and without the cause', async () => {
  const { recent, old } = entrySource();
  const missing = host(() => Promise.resolve(answer(recent, [...recent, old], { warnings: ['Codex sessions folder not found.', 'A session label could not be read (EPERM).'] })), undefined, undefined, undefined, { open: false });
  assert.deepEqual({ ...await missing.openSession({ provider: 'codex', sessionId: CODEX_ID }) }, { ok: false, reason: 'source-unavailable' });
  assert.deepEqual({ ...await missing.openSession({ provider: 'claude', sessionId: 'ffffffff-0000-4000-8000-000000000000' }) }, { ok: false, reason: 'not-found' }, 'the other provider folder is readable');
  assert.equal(missing.counts.panels, 0);
  assert.equal((await missing.openSession({ provider: 'claude', sessionId: CLAUDE_ID })).ok, true, 'one missing provider does not block the other');
  missing.callbacks.dispose();

  const unreadable = host(() => Promise.resolve(answer([], [], { warnings: ['Claude folder could not be read (EPERM).'] })), undefined, undefined, undefined, { open: false });
  assert.deepEqual({ ...await unreadable.openSession({ provider: 'claude', sessionId: CLAUDE_ID }) }, { ok: false, reason: 'source-unavailable' });

  const failing = host(() => Promise.reject(Object.assign(new Error('C:/PRIVATE_PATH/PRIVATE_FAILURE'), { code: 'EPERM' })), undefined, undefined, undefined, { open: false });
  const result = await failing.openSession({ provider: 'claude', sessionId: CLAUDE_ID });
  assert.deepEqual({ ...result }, { ok: false, reason: 'source-unavailable' });
  assert.deepEqual([unreadable.counts.panels, failing.counts.panels], [0, 0]);
});

test('malicious command arguments never reach discovery, and the Command Palette command ignores arguments', async () => {
  const { recent, all } = entrySource();
  const calls = [];
  const instance = host((roots, options) => { calls.push(options); return Promise.resolve(answer(recent, all)); }, undefined, undefined, undefined, { open: false });
  const hostile = [
    undefined, null, 0, true, CLAUDE_ID, 'C:/PRIVATE_PATH/claude:old.jsonl', ['claude', CLAUDE_ID], [{ provider: 'claude', sessionId: CLAUDE_ID }],
    {}, { provider: 'claude' }, { sessionId: CLAUDE_ID },
    { provider: 'gemini', sessionId: CLAUDE_ID }, { provider: 'Claude', sessionId: CLAUDE_ID }, { provider: '__proto__', sessionId: CLAUDE_ID }, { provider: 'constructor', sessionId: CLAUDE_ID },
    { provider: ['claude'], sessionId: CLAUDE_ID }, { provider: 'claude', sessionId: [CLAUDE_ID] }, { provider: 'claude', sessionId: { toString: () => CLAUDE_ID } }, { provider: 'claude', sessionId: 7 },
    { provider: 'claude', sessionId: '' }, { provider: 'claude', sessionId: 'a'.repeat(129) }, { provider: 'claude', sessionId: `${CLAUDE_ID}\n` }, { provider: 'claude', sessionId: ` ${CLAUDE_ID}` },
    { provider: 'claude', sessionId: 'C:\\PRIVATE_PATH\\session.jsonl' }, { provider: 'claude', sessionId: '/home/PRIVATE_PATH/session.jsonl' }, { provider: 'claude', sessionId: '..\\..\\PRIVATE_PATH' },
    { provider: 'claude', sessionId: '../PRIVATE_PATH' }, { provider: 'claude', sessionId: `${CLAUDE_ID}.jsonl` }, { provider: 'claude', sessionId: 'file:PRIVATE_PATH' }, { provider: 'claude', sessionId: '*' },
    { provider: 'claude', sessionId: 'a\u0000b' }, { provider: 'claude', sessionId: 'a\u202Eb' }, { provider: 'claude', sessionId: '%2e%2e%2fPRIVATE' }, { provider: 'claude', sessionId: 'é' },
    // A valid address with anything extra is refused whole: there is no file, root or query field to smuggle in.
    { provider: 'claude', sessionId: CLAUDE_ID, file: 'C:/PRIVATE_PATH/session.jsonl' }, { provider: 'claude', sessionId: CLAUDE_ID, claudeRoot: 'C:/PRIVATE_PATH' },
    { provider: 'claude', sessionId: CLAUDE_ID, query: { workspaceKey: 'C:/PRIVATE_PATH' } }, { provider: 'claude', sessionId: CLAUDE_ID, id: 'claude:old' },
    { get provider() { throw new Error('PRIVATE_THROW'); }, sessionId: CLAUDE_ID },
    new Proxy({}, { ownKeys() { throw new Error('PRIVATE_THROW'); } })
  ];
  for (const argument of hostile) assert.deepEqual({ ...await instance.openSession(argument) }, { ok: false, reason: 'invalid-argument' });
  assert.deepEqual([calls.length, instance.counts.panels], [0, 0], 'nothing was looked up, read or opened');

  // The existing command: an argument (here a would-be address with a path) changes nothing about it.
  assert.equal(instance.callbacks.open({ provider: 'claude', sessionId: CLAUDE_ID, file: 'C:/PRIVATE_PATH/session.jsonl' }), undefined);
  instance.callbacks.message({ type: 'ready' });
  await flush();
  assert.equal(instance.counts.panels, 1);
  assert.equal(calls.filter(byCommand).length, 0);
  assert.equal(instance.messages.at(-1).selectedId, 'claude:recent-1', 'the usual first selection, not the argument');
  instance.callbacks.open();
  assert.deepEqual([instance.counts.panels, instance.counts.reveals], [1, 1], 'opening again still reuses the panel');
  instance.callbacks.dispose();
});

test('duplicate command executions open one panel and the newest call decides the followed session', async () => {
  const { recent, all } = entrySource();
  const pending = [];
  const instance = host((roots, options) => byCommand(options) ? new Promise(resolve => { pending.push(resolve); }) : Promise.resolve(answer(recent, all)), undefined, undefined, undefined, { open: false });
  const a = instance.openSession({ provider: 'claude', sessionId: CLAUDE_ID });
  const b = instance.openSession({ provider: 'codex', sessionId: CODEX_ID });
  await flush();
  assert.equal(pending.length, 2);
  // The older lookup answers last.
  pending[1](answer(recent, all));
  pending[0](answer(recent, all));
  assert.deepEqual([{ ...await a }, { ...await b }], [{ ok: false, reason: 'superseded' }, { ok: true, provider: 'codex', sessionId: CODEX_ID }]);
  instance.callbacks.message({ type: 'ready' });
  await flush();
  assert.deepEqual([instance.counts.panels, instance.messages.at(-1).selectedId], [1, 'codex:old']);

  // The same address again, twice at once (a double click): still one panel, and the session is not reloaded.
  const readers = instance.readers.length;
  const c = instance.openSession({ provider: 'codex', sessionId: CODEX_ID });
  const d = instance.openSession({ provider: 'codex', sessionId: CODEX_ID });
  await flush();
  pending[2](answer(recent, all));
  pending[3](answer(recent, all));
  assert.deepEqual([(await c).ok, { ...await d }], [false, { ok: true, provider: 'codex', sessionId: CODEX_ID }]);
  await flush();
  const again = instance.openSession({ provider: 'codex', sessionId: CODEX_ID });
  await flush();
  pending[4](answer(recent, all));
  assert.equal((await again).ok, true);
  await flush();
  assert.deepEqual([instance.counts.panels, instance.readers.length, instance.messages.at(-1).selectedId], [1, readers, 'codex:old']);
  instance.callbacks.dispose();
});

test('an already open panel lists the source again for a session it has not seen, and the command reopens a closed panel', async () => {
  const { recent, all } = entrySource();
  let current = answer(recent, recent);
  const calls = [];
  const instance = host((roots, options) => { calls.push(options); return Promise.resolve(current); });
  instance.callbacks.message({ type: 'ready' });
  await flush();
  assert.equal(instance.messages.at(-1).selectedId, 'claude:recent-1');

  // The addressed transcript was written after the panel last listed the folders.
  current = answer(recent, all);
  assert.equal((await instance.openSession({ provider: 'claude', sessionId: CLAUDE_ID })).ok, true);
  await flush();
  const lookup = calls.filter(options => !byCommand(options)).at(-1);
  assert.equal(lookup.walk, undefined, 'the panel lists the folders again instead of reusing a listing without the session');
  assert.deepEqual([...lookup.keep], ['claude:old']);
  const message = instance.messages.at(-1);
  assert.deepEqual([message.selectedId, message.lookup.missing, instance.counts.panels, instance.counts.reveals], ['claude:old', false, 1, 1]);
  assert.doesNotMatch(message.warnings.join(' '), /no longer in the source folders/);

  // A source setting changes while a lookup runs: its answer belongs to the old source and is not followed.
  let release;
  const slow = host((roots, options) => byCommand(options) ? new Promise(resolve => { release = resolve; }) : Promise.resolve(answer(recent, all)), undefined, undefined, undefined, { open: false });
  const overtaken = slow.openSession({ provider: 'claude', sessionId: CLAUDE_ID });
  await flush();
  slow.setRoot('new-root');
  release(answer(recent, all));
  assert.deepEqual([{ ...await overtaken }, slow.counts.panels], [{ ok: false, reason: 'superseded' }, 0]);

  // Closed, then addressed again: a new panel, on the addressed session.
  instance.callbacks.dispose();
  assert.equal((await instance.openSession({ provider: 'codex', sessionId: CODEX_ID })).ok, true);
  instance.callbacks.message({ type: 'ready' });
  await flush();
  assert.deepEqual([instance.counts.panels, instance.messages.at(-1).selectedId], [2, 'codex:old']);
  instance.callbacks.dispose();
});

test('the entry command resolves real transcript files of both providers through discovery, past the session cap', async t => {
  const os = require('node:os');
  const { discoverSessions, SESSION_LIMIT } = require('../src/sessions');
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agentviz-entry-'));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const write = async (file, record, seconds) => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, `${JSON.stringify(record)}\n`);
    const time = new Date(Date.UTC(2026, 0, 1, 0, 0, seconds));
    await fs.promises.utimes(file, time, time);
  };
  const project = path.join(root, 'projects', 'synthetic-project');
  await write(path.join(project, `${CLAUDE_ID}.jsonl`), { type: 'user', cwd: 'C:\\Synthetic\\Alpha', sessionId: CLAUDE_ID }, 1);
  for (let number = 0; number < SESSION_LIMIT + 5; number++) {
    const id = `bbbbbbbb-0000-4000-8000-${String(number).padStart(12, '0')}`;
    await write(path.join(project, `${id}.jsonl`), { type: 'user', cwd: 'C:\\Synthetic\\Alpha', sessionId: id }, 100 + number);
  }
  const instance = host(discoverSessions, undefined, undefined, undefined, { open: false, root });

  // The Codex sessions folder does not exist yet: discovery's own warning is what the command reports.
  assert.deepEqual({ ...await instance.openSession({ provider: 'codex', sessionId: CODEX_ID }) }, { ok: false, reason: 'source-unavailable' });
  assert.deepEqual({ ...await instance.openSession({ provider: 'claude', sessionId: 'ffffffff-0000-4000-8000-000000000000' }) }, { ok: false, reason: 'not-found' });
  assert.equal(instance.counts.panels, 0);

  // The oldest of 86 Claude sessions: outside the 80 returned, addressed by its full ID.
  assert.deepEqual({ ...await instance.openSession({ provider: 'claude', sessionId: CLAUDE_ID }) }, { ok: true, provider: 'claude', sessionId: CLAUDE_ID });
  instance.callbacks.message({ type: 'ready' });
  await until(instance, () => instance.messages.length > 0);
  let message = instance.messages.at(-1);
  assert.deepEqual([message.selected.sessionId, message.selected.provider, message.selected.workspaceLabel, message.lookup.missing], [CLAUDE_ID, 'claude', 'Alpha', false]);
  assert.equal(message.sessions.length, SESSION_LIMIT);
  assert.ok(!message.sessions.some(session => session.sessionId === CLAUDE_ID));
  assert.equal(instance.reads.at(-1), path.join(project, `${CLAUDE_ID}.jsonl`));

  // A Codex rollout appears; the open panel is moved to it.
  const rollout = path.join(root, 'sessions', '2026', '01', '01', `rollout-2026-01-01T00-00-00-${CODEX_ID}.jsonl`);
  await write(rollout, { type: 'session_meta', payload: { id: CODEX_ID, cwd: 'C:\\Synthetic\\Beta' } }, 2);
  assert.deepEqual({ ...await instance.openSession({ provider: 'codex', sessionId: CODEX_ID }) }, { ok: true, provider: 'codex', sessionId: CODEX_ID });
  await until(instance, () => instance.messages.at(-1).selected?.provider === 'codex' && !instance.messages.at(-1).lookup.missing);
  message = instance.messages.at(-1);
  assert.deepEqual([message.selected.sessionId, message.selected.workspaceLabel, instance.counts.panels], [CODEX_ID, 'Beta', 1]);
  assert.equal(instance.reads.at(-1), rollout);

  // A path that really exists is still not an address.
  for (const sessionId of [rollout, path.join(project, `${CLAUDE_ID}.jsonl`), `..\\synthetic-project\\${CLAUDE_ID}`]) {
    assert.deepEqual({ ...await instance.openSession({ provider: 'claude', sessionId }) }, { ok: false, reason: 'invalid-argument' });
  }
  assert.doesNotMatch(JSON.stringify(instance.messages), /\.jsonl|Synthetic\\\\|agentviz-entry-/);
  instance.callbacks.dispose();
});