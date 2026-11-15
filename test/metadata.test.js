// Workspace, saved name and ID metadata from both providers, carried from transcript files to the webview through
// the real discovery and the real host whitelist. Synthetic fixtures only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createSession } = require('../src/transcript');
const realSessions = require('../src/sessions');

// `tick` stands in for the host's one-second timer, which the stand-in VS Code does not run.
async function until(check, label, tick) {
  for (let turn = 0; turn < 400; turn++) {
    if (check()) return;
    if (tick) tick();
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for: ${label}`);
}

// The extension host with a stand-in VS Code, over the real `discoverSessions` and fixture folders.
function host(discoverSessions, root = 'synthetic-root') {
  const callbacks = {};
  const messages = [];
  const disposable = { dispose() {} };
  const panel = {
    visible: true, reveal() {},
    webview: { cspSource: 'test:', asWebviewUri: value => value, onDidReceiveMessage: callback => { callbacks.message = callback; return disposable; }, postMessage: async value => { messages.push(value); } },
    onDidChangeViewState: () => disposable, onDidDispose: callback => { callbacks.dispose = callback; }, dispose() { callbacks.dispose(); }
  };
  const vscode = {
    commands: { registerCommand: (name, callback) => { callbacks[name] = callback; return disposable; } },
    window: { createWebviewPanel: () => panel, createTreeView: () => ({ visible: false, onDidChangeVisibility: () => disposable, dispose() {} }), showErrorMessage: message => { throw Error(message); } },
    workspace: { workspaceFolders: undefined, getConfiguration: () => ({ get: key => key === 'sessions' ? 'all' : root }), onDidChangeConfiguration: () => disposable },
    Uri: { joinPath: (...parts) => parts.join('/') }, ViewColumn: { One: 1 }
  };
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require: name => {
    if (name === 'vscode') return vscode;
    if (name === './sessions') return { discoverSessions, FamilyReader: class { async read() { return createSession('claude', 'synthetic'); } } };
    if (name === './webview') return require('../src/webview');
    if (name === './transcript') return require('../src/transcript');
    return require(name);
  }, setInterval: callback => { callbacks.tick = callback; return 1; }, clearInterval() {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/extension.js'), 'utf8'), sandbox);
  module.exports.activate({ extensionUri: 'extension:', subscriptions: [], workspaceState: { get() {}, async update() {} } });
  callbacks['agentviz.open']();
  return { callbacks, messages, send: message => callbacks.message(message), tick: () => callbacks.tick(), close: () => callbacks.dispose() };
}

const CATALOGUE_FIELDS = ['child', 'id', 'modified', 'name', 'nameSource', 'project', 'provider', 'sessionId', 'workspaceKey', 'workspaceLabel'];

// SPEC: S01 acceptance. Both providers carry tested workspace/name/ID metadata to the webview from transcript
// files, through the real discovery and the real host whitelist, and private payload sentinels stay absent.
test('both providers carry workspace, saved name and full ID from transcript files to the webview', async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agentviz-metadata-'));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  let clock = 0;
  const write = async (file, records) => {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, typeof records === 'string' ? records : records.map(record => `${JSON.stringify(record)}\n`).join(''));
    const time = new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock));
    await fs.promises.utimes(file, time, time);
  };
  const prompt = cwd => ({ type: 'user', cwd, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'PRIVATE_PROMPT sk-PRIVATE_SECRET' } });
  const tool = { type: 'assistant', timestamp: '2026-01-01T00:00:01Z', message: { content: [
    { type: 'thinking', thinking: 'PRIVATE_REASONING' },
    { type: 'tool_use', id: 'call-1', name: 'Bash', input: { command: 'PRIVATE_COMMAND --token PRIVATE_SECRET' } }] } };
  const claude = (folder, id) => path.join(root, 'projects', folder, `${id}.jsonl`);
  const ids = {
    renamed: 'aaaaaaaa-1111-4111-8111-000000000001', generated: 'aaaaaaaa-1111-4111-8111-000000000002', sameDirectory: 'aaaaaaaa-1111-4111-8111-000000000003',
    otherDrive: 'aaaaaaaa-1111-4111-8111-000000000004', linuxUpper: 'aaaaaaaa-1111-4111-8111-000000000005', linuxLower: 'aaaaaaaa-1111-4111-8111-000000000006',
    corrupt: 'aaaaaaaa-1111-4111-8111-000000000007', codexNamed: 'cccccccc-2222-4222-8222-000000000001', codexUnnamed: 'cccccccc-2222-4222-8222-000000000002'
  };
  // Generated title first, then a custom title, then an unrelated record, then a later generated title: custom wins.
  await write(claude('C--Work-Example', ids.renamed), [prompt('C:\\Work\\Example'), { type: 'ai-title', aiTitle: 'Generated first', sessionId: ids.renamed },
    { type: 'custom-title', customTitle: 'Chosen name', sessionId: ids.renamed }, tool, { type: 'ai-title', aiTitle: 'Generated later', sessionId: ids.renamed }]);
  await write(claude('C--Work-Example', ids.generated), [prompt('C:\\Work\\Example'), tool, { type: 'ai-title', aiTitle: 'Generated only', sessionId: ids.generated }]);
  // Same Windows directory written with another case and separator; a different drive with the same basename.
  await write(claude('c--work-example', ids.sameDirectory), [prompt('c:/work/example/'), { type: 'custom-title', customTitle: 'Chosen name', sessionId: ids.sameDirectory }]);
  await write(claude('D--Other-Example', ids.otherDrive), [prompt('D:\\Other\\Example')]);
  // Linux directories recorded in a transcript: case is part of the identity.
  await write(claude('-home-dev-Example', ids.linuxUpper), [prompt('/home/dev/Example')]);
  await write(claude('-home-dev-example', ids.linuxLower), [prompt('/home/dev/example')]);
  // Title records that cannot be used: broken JSON, a non-text title, and a title made only of control characters.
  await write(claude('C--Work-Example', ids.corrupt), `${JSON.stringify(prompt('C:\\Work\\Example'))}\n{"type":"custom-title","customTitle":"PRIVATE_BROKEN\n${JSON.stringify({ type: 'custom-title', customTitle: { text: 'PRIVATE_OBJECT' } })}\n${JSON.stringify({ type: 'ai-title', aiTitle: '\u001b\u202e\u0000 \u0007' })}\n`);
  const rollout = id => path.join(root, 'sessions', '2026', '01', '01', `rollout-2026-01-01T00-00-00-${id}.jsonl`);
  const meta = (id, cwd) => [{ type: 'session_meta', timestamp: '2026-01-01T00:00:00Z', payload: { id, cwd, base_instructions: { text: 'PRIVATE_PROMPT' } } },
    { type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'function_call', call_id: 'c1', name: 'shell', arguments: JSON.stringify({ command: 'PRIVATE_COMMAND' }) } }];
  await write(rollout(ids.codexNamed), meta(ids.codexNamed, 'C:\\Work\\Example'));
  await write(rollout(ids.codexUnnamed), meta(ids.codexUnnamed, 'D:\\Other\\Example'));
  // The index: a first name, a corrupt line, a line for another thread, then the rename. The unnamed thread has no line.
  const indexFile = path.join(root, 'session_index.jsonl');
  await write(indexFile, [JSON.stringify({ id: ids.codexNamed, thread_name: 'First thread name', updated_at: '2026-01-01T00:00:00Z' }), '{"id":"PRIVATE_BROKEN',
    JSON.stringify({ id: 'dddddddd-0000-4000-8000-000000000000', thread_name: 'PRIVATE_OTHER_THREAD', updated_at: '2026-01-01T00:00:00Z' }),
    JSON.stringify({ id: ids.codexNamed.toUpperCase(), thread_name: 'Renamed <b>thread</b>', updated_at: '2026-01-01T00:00:02Z' })].join('\n') + '\n');
  const before = await fs.promises.readdir(root, { recursive: true });

  const instance = host(realSessions.discoverSessions, root);
  instance.send({ type: 'ready' });
  await until(() => instance.messages.some(message => message.sessions.length === 9 && message.sessions.every(session => session.name)), 'the first catalogue', instance.tick);
  let message = instance.messages.at(-1);
  const by = key => message.sessions.find(session => session.sessionId === ids[key]);
  for (const session of message.sessions) assert.deepEqual(Object.keys(session).sort(), CATALOGUE_FIELDS);
  assert.deepEqual(message.sessions.map(session => session.sessionId).sort(), Object.values(ids).sort(), 'every session ID is whole');

  assert.deepEqual([by('renamed').name, by('renamed').nameSource], ['Chosen name', 'custom']);
  assert.deepEqual([by('generated').name, by('generated').nameSource], ['Generated only', 'generated']);
  assert.deepEqual([by('codexNamed').name, by('codexNamed').nameSource, by('codexNamed').provider], ['Renamed <b>thread</b>', 'index', 'codex']);
  for (const key of ['otherDrive', 'linuxUpper', 'codexUnnamed', 'corrupt']) assert.deepEqual([by(key).name, by(key).nameSource], ['Unnamed session', 'none'], key);

  // Workspaces: one identity per recorded directory, across providers; equal basenames get distinct labels.
  assert.equal(new Set(['renamed', 'generated', 'sameDirectory', 'corrupt', 'codexNamed'].map(key => by(key).workspaceKey)).size, 1, 'Windows paths compare without case or separator differences');
  assert.equal(by('otherDrive').workspaceKey, by('codexUnnamed').workspaceKey);
  assert.notEqual(by('linuxUpper').workspaceKey, by('linuxLower').workspaceKey, 'a Linux path keeps its case');
  assert.equal(message.workspaces.length, 4);
  assert.equal(new Set(message.workspaces.map(group => group.label)).size, 4, 'no two projects share a label');
  for (const group of message.workspaces) {
    assert.match(group.key, /^ws:[0-9a-f]{20}$/);
    assert.ok(group.label.length > 0 && [...group.label].length <= 80);
    assert.doesNotMatch(group.label, /^[A-Za-z]:|^[\\/]|home/, 'a label holds no drive, root or deep path');
  }
  for (const session of message.sessions) assert.equal(session.workspaceLabel, message.workspaces.find(group => group.key === session.workspaceKey).label);
  // Two sessions share a title; their IDs and catalogue IDs keep them apart.
  assert.equal(by('sameDirectory').name, by('renamed').name);
  assert.notEqual(by('sameDirectory').id, by('renamed').id);

  // A filter request: project, name and a fragment from the far end of the ID intersect.
  instance.send({ type: 'query', seq: 1, workspaceKey: by('renamed').workspaceKey, name: 'chosen', id: '000000000001' });
  await until(() => instance.messages.at(-1).lookup.seq === 1, 'the answer to request 1', instance.tick);
  assert.deepEqual(instance.messages.at(-1).sessions.map(session => session.sessionId), [ids.renamed]);

  // A late rename appended after everything else: the name changes, the identity and the workspace do not.
  const identity = { id: by('renamed').id, sessionId: by('renamed').sessionId, workspaceKey: by('renamed').workspaceKey };
  await fs.promises.appendFile(claude('C--Work-Example', ids.renamed), `${JSON.stringify({ type: 'custom-title', customTitle: 'Renamed late', sessionId: ids.renamed })}\n`);
  instance.send({ type: 'refresh' });
  instance.send({ type: 'query', seq: 2, workspaceKey: '', name: 'renamed late', id: '' });
  await until(() => instance.messages.at(-1).lookup.seq === 2 && instance.messages.at(-1).sessions.length === 1, 'the renamed session', instance.tick);
  const renamed = instance.messages.at(-1).sessions[0];
  assert.deepEqual([renamed.name, renamed.nameSource, renamed.id, renamed.sessionId, renamed.workspaceKey], ['Renamed late', 'custom', identity.id, identity.sessionId, identity.workspaceKey]);

  // Nothing private crossed the boundary, and looking names up wrote nothing into the provider folders.
  const sent = JSON.stringify(instance.messages);
  assert.doesNotMatch(sent, /PRIVATE_|sk-|\.jsonl|agentviz-metadata-|C:\\\\Work|c:\/work|\/home\/dev|D:\\\\Other|base_instructions|First thread name/);
  assert.doesNotMatch(sent, /[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/);
  assert.deepEqual((await fs.promises.readdir(root, { recursive: true })).sort(), before.sort(), 'no file was created or removed');
  instance.close();
});
