const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSession } = require('../src/transcript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function host(discoverSessions, workspaceFolders) {
  const callbacks = {};
  const messages = [];
  const reads = [];
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
      async read(file) { reads.push(file); return createSession('claude', 'synthetic'); }
    } };
    if (name === './webview') return require('../src/webview');
    if (name === './transcript') return require('../src/transcript');
    return require(name);
  }, setInterval: callback => { callbacks.tick = callback; return 1; }, clearInterval: () => { stopped = true; } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/extension.js'), 'utf8'), sandbox);
  module.exports.activate({ extensionUri: 'extension:', subscriptions: [], workspaceState: { get() {}, async update() {} } });
  callbacks.open();
  return { callbacks, messages, reads, stopped: () => stopped, setRoot(value) { root = value; callbacks.config({ affectsConfiguration: () => true }); } };
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
