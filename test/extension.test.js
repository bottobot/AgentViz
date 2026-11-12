const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSession } = require('../src/transcript');
const flush = () => new Promise(resolve => setImmediate(resolve));

function host(discoverSessions) {
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
