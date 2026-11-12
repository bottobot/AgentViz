const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSession } = require('../src/transcript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function host(discoverSessions, workspaceFolders, savedSelection) {
  const callbacks = {};
  const messages = [];
  const reads = [];
  const readers = [];
  let root = 'old-root';
  let stopped = false;
  const disposable = { dispose() {} };
  const panel = {
    visible: true, reveal() {},
    webview: { cspSource: 'test:', asWebviewUri: value => value, onDidReceiveMessage: callback => { callbacks.message = callback; return disposable; }, postMessage: async value => { messages.push(value); } },
    onDidChangeViewState: callback => { callbacks.visibility = callback; return disposable; },
    onDidDispose: callback => { callbacks.dispose = callback; }, dispose() { callbacks.dispose(); }
  };
  const vscode = {
    commands: { registerCommand: (name, callback) => { callbacks.open = callback; return disposable; } },
    window: { createWebviewPanel: () => panel, showErrorMessage: message => { throw Error(message); } },
    workspace: {
      workspaceFolders,
      getConfiguration: () => ({ get: () => root }),
      onDidChangeConfiguration: callback => { callbacks.config = callback; return disposable; }
    },
    Uri: { joinPath: (...parts) => parts.join('/') }, ViewColumn: { One: 1 }
  };
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require: name => {
    if (name === 'vscode') return vscode;
    if (name === './sessions') return { discoverSessions, TranscriptReader: class {
      constructor(provider, id) { readers.push(id); }
      async read(file) { reads.push(file); return createSession('claude', 'synthetic'); }
    } };
    if (name === './webview') return require('../src/webview');
    if (name === './transcript') return require('../src/transcript');
    return require(name);
  }, setInterval: callback => { callbacks.tick = callback; return 1; }, clearInterval: () => { stopped = true; } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/extension.js'), 'utf8'), sandbox);
  module.exports.activate({ extensionUri: 'extension:', subscriptions: [], workspaceState: { get() { return savedSelection; }, async update() {} } });
  callbacks.open();
  return { callbacks, messages, reads, readers, stopped: () => stopped, setRoot(value) { root = value; callbacks.config({ affectsConfiguration: () => true }); } };
}

const catalog = root => ({ sessions: [{ id: root, sessionId: 'synthetic', provider: 'claude', project: 'Example', file: `${root}/session.jsonl`, modified: 1 }], warnings: [] });

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
  assert.deepEqual({ ...message.lookup }, { seq: 5, total: 412, matched: 97, limit: 80, pendingNames: 5, pendingWorkspaces: 2, missing: false });
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
  assert.doesNotMatch(JSON.stringify(instance.messages), /PRIVATE_|\.jsonl/);
  instance.callbacks.dispose();
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