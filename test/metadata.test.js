// S01 (parallel plan): workspace, saved name and ID metadata from both providers, carried to the webview through
// the frozen interface of ORCHESTRATION.md ("Parallel interface contract"). Synthetic fixtures only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createSession } = require('../src/transcript');
const realSessions = require('../src/sessions');

const flush = () => new Promise(resolve => setImmediate(resolve));
// 	ick stands in for the host's one-second timer, which the stand-in VS Code does not run.
async function until(check, label, tick) {
  for (let turn = 0; turn < 400; turn++) {
    if (check()) return;
    if (tick) tick();
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail(`timed out waiting for: ${label}`);
}

// The extension host with a stand-in VS Code. `discoverSessions` is a stub, or the real one over fixture folders.
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
    workspace: { workspaceFolders: undefined, getConfiguration: () => ({ get: () => root }), onDidChangeConfiguration: () => disposable },
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
const WS_A = `ws:${'a'.repeat(20)}`;
const entry = (id, extra = {}) => ({ id, sessionId: `${id}-full-id`, provider: 'claude', project: 'Example', child: false, modified: 1, file: `C:/PRIVATE_PATH/${id}.jsonl`,
  workspaceKey: WS_A, workspaceLabel: 'Example', name: `Name of ${id}`, nameSource: 'custom', ...extra });
const answer = sessions => ({ sessions, kept: [], warnings: [], all: sessions, total: sessions.length, matched: sessions.length, limit: 80,
  workspaces: [{ key: WS_A, label: 'Example', count: sessions.length, cwd: 'C:/PRIVATE_PATH/Example' }], pending: { workspaces: 0, names: 0 }, walk: { files: sessions, warnings: [] } });

// SPEC: frozen interface, inbound half. {type:"query", requestId, workspaceKey, name, sessionId} is accepted and
// acknowledged in the existing `lookup.seq`. The top-level `queryRequestId` is NOT sent yet: test/resilience.test.js
// pins the exact fields of a host message and belongs to the joining discovery step (see the receipt).
test('the frozen query message reaches discovery and the state acknowledges its request number', async () => {
  const calls = [];
  const instance = host((roots, options) => { calls.push(options); return Promise.resolve(answer([entry('claude:one')])); });
  instance.send({ type: 'ready' });
  await flush();
  let message = instance.messages.at(-1);
  assert.equal(message.lookup.seq, 0, 'before any query the acknowledged ID is zero');
  assert.deepEqual(message.workspaces.map(group => [group.key, group.label]), [[WS_A, 'Example']]);
  assert.deepEqual(Object.keys(message.sessions[0]).sort(), CATALOGUE_FIELDS);
  for (const field of ['id', 'sessionId', 'provider', 'workspaceKey', 'workspaceLabel', 'name', 'nameSource']) assert.equal(typeof message.sessions[0][field], 'string', field);
  assert.deepEqual([typeof message.sessions[0].modified, typeof message.sessions[0].child], ['number', 'boolean']);

  const fullId = '11111111-2222-4333-8444-555555555555';
  instance.send({ type: 'query', requestId: 1, workspaceKey: WS_A, name: 'Login', sessionId: fullId });
  await flush();
  assert.deepEqual([calls.at(-1).query.workspaceKey, calls.at(-1).query.name, calls.at(-1).query.id], [WS_A, 'Login', fullId], 'the whole session ID is the ID filter');
  assert.equal(instance.messages.at(-1).lookup.seq, 1);

  // Empty filter values mean unfiltered and are a valid request.
  instance.send({ type: 'query', requestId: 2, workspaceKey: '', name: '', sessionId: '' });
  await flush();
  assert.deepEqual([calls.at(-1).query.workspaceKey, calls.at(-1).query.name, calls.at(-1).query.id], ['', '', '']);
  assert.equal(instance.messages.at(-1).lookup.seq, 2);

  // A request numbered at or below the last accepted one arrived late: it changes nothing.
  const count = calls.length;
  instance.send({ type: 'query', requestId: 1, workspaceKey: '', name: 'late', sessionId: '' });
  instance.send({ type: 'query', requestId: 2, workspaceKey: '', name: 'repeat', sessionId: '' });
  await flush();
  instance.tick();
  await flush();
  assert.equal(calls.length, count);
  assert.equal(instance.messages.at(-1).lookup.seq, 2);
  assert.doesNotMatch(JSON.stringify(instance.messages), /PRIVATE_|\.jsonl/);
  instance.close();
});

test('malformed frozen queries are rejected whole at the host boundary', async () => {
  const calls = [];
  const instance = host((roots, options) => { calls.push(options); return Promise.resolve(answer([entry('claude:one')])); });
  instance.send({ type: 'ready' });
  await flush();
  instance.send({ type: 'query', requestId: 3, workspaceKey: '', name: 'accepted', sessionId: '' });
  await flush();
  const count = calls.length;
  const good = { type: 'query', requestId: 9, workspaceKey: '', name: 'PRIVATE_REJECTED', sessionId: '' };
  const malformed = [
    { ...good, requestId: -1 }, { ...good, requestId: 4.5 }, { ...good, requestId: '9' }, { ...good, requestId: null }, { ...good, requestId: Number.MAX_SAFE_INTEGER + 2 },
    { ...good, workspaceKey: 'C:/PRIVATE_PATH' }, { ...good, workspaceKey: 7 }, { ...good, workspaceKey: undefined },
    { ...good, name: ['PRIVATE_REJECTED'] }, { ...good, name: { toString: () => 'PRIVATE_REJECTED' } }, { ...good, name: undefined },
    { ...good, sessionId: 12345678 }, { ...good, sessionId: null },
    { type: 'query', requestId: 9 }
  ];
  for (const message of malformed) instance.send(message);
  await flush();
  instance.tick();
  await flush();
  assert.equal(calls.length, count, 'no malformed request starts a lookup');
  assert.equal(instance.messages.at(-1).lookup.seq, 3, 'and none is acknowledged');
  assert.ok(calls.every(call => call.query.name !== 'PRIVATE_REJECTED'));

  // Filter text is bounded before discovery sees it; the request itself is still valid.
  instance.send({ type: 'query', requestId: 10, workspaceKey: 'ws:unknown', name: 'n'.repeat(500), sessionId: 'x'.repeat(500) });
  await flush();
  assert.deepEqual([calls.at(-1).query.workspaceKey, calls.at(-1).query.name.length, calls.at(-1).query.id.length], ['ws:unknown', 200, 200]);
  assert.equal(instance.messages.at(-1).lookup.seq, 10);
  instance.close();
});

test('a reloaded view restarts its numbering, and the earlier seq form is still answered', async () => {
  const calls = [];
  const instance = host((roots, options) => { calls.push(options); return Promise.resolve(answer([entry('claude:one')])); });
  instance.send({ type: 'ready' });
  await flush();
  instance.send({ type: 'query', requestId: 7, workspaceKey: '', name: 'before reload', sessionId: '' });
  await flush();
  assert.equal(instance.messages.at(-1).lookup.seq, 7);
  // A reloaded view may hand over its remembered filters with `ready`, in the frozen form.
  instance.send({ type: 'ready', query: { requestId: 0, workspaceKey: WS_A, name: 'kept', sessionId: '' } });
  await flush();
  assert.deepEqual([calls.at(-1).query.workspaceKey, calls.at(-1).query.name, instance.messages.at(-1).lookup.seq], [WS_A, 'kept', 0]);
  instance.send({ type: 'query', requestId: 1, workspaceKey: '', name: 'after reload', sessionId: '' });
  await flush();
  assert.deepEqual([calls.at(-1).query.name, instance.messages.at(-1).lookup.seq], ['after reload', 1]);
  // A malformed query beside `ready` is dropped; the view still gets an unfiltered answer.
  instance.send({ type: 'ready', query: { requestId: 'PRIVATE_ID', workspaceKey: WS_A, name: 'PRIVATE_NAME', sessionId: '' } });
  await flush();
  assert.deepEqual([calls.at(-1).query.workspaceKey, calls.at(-1).query.name, instance.messages.at(-1).lookup.seq], ['', '', 0]);

  // Legacy form, kept until the joining discovery step retires it: seq and id, answered in lookup.seq.
  instance.send({ type: 'query', seq: 4, workspaceKey: '', name: 'legacy', id: 'abc' });
  await flush();
  assert.deepEqual([calls.at(-1).query.name, calls.at(-1).query.id, instance.messages.at(-1).lookup.seq], ['legacy', 'abc', 4]);
  assert.doesNotMatch(JSON.stringify(instance.messages), /PRIVATE_/);
  instance.close();
});

test('a catalogue worked out for an older request is never acknowledged as the newest one', async () => {
  const pending = [];
  const instance = host((roots, options) => new Promise(resolve => { pending.push({ options, resolve }); }));
  instance.send({ type: 'ready' });
  await flush();
  pending[0].resolve(answer([entry('claude:first')]));
  await flush();
  assert.equal(instance.messages.at(-1).lookup.seq, 0);
  instance.send({ type: 'query', requestId: 1, workspaceKey: '', name: 'one', sessionId: '' });
  await flush();
  instance.send({ type: 'query', requestId: 2, workspaceKey: '', name: 'two', sessionId: '' });
  pending[1].resolve(answer([entry('claude:answer-to-one')]));
  await flush();
  assert.ok(instance.messages.every(message => message.lookup.seq !== 2), 'the answer to request 1 is not shown as the answer to request 2');
  instance.tick();
  await flush();
  assert.equal(pending[2].options.query.name, 'two');
  pending[2].resolve(answer([entry('claude:answer-to-two')]));
  await flush();
  assert.deepEqual([instance.messages.at(-1).lookup.seq, instance.messages.at(-1).sessions.map(session => session.id)], [2, ['claude:answer-to-two']]);
  instance.close();
});

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

  // The frozen query: project, name and a fragment from the far end of the ID intersect.
  instance.send({ type: 'query', requestId: 1, workspaceKey: by('renamed').workspaceKey, name: 'chosen', sessionId: '000000000001' });
  await until(() => instance.messages.at(-1).lookup.seq === 1, 'the answer to request 1', instance.tick);
  assert.deepEqual(instance.messages.at(-1).sessions.map(session => session.sessionId), [ids.renamed]);

  // A late rename appended after everything else: the name changes, the identity and the workspace do not.
  const identity = { id: by('renamed').id, sessionId: by('renamed').sessionId, workspaceKey: by('renamed').workspaceKey };
  await fs.promises.appendFile(claude('C--Work-Example', ids.renamed), `${JSON.stringify({ type: 'custom-title', customTitle: 'Renamed late', sessionId: ids.renamed })}\n`);
  instance.send({ type: 'refresh' });
  instance.send({ type: 'query', requestId: 2, workspaceKey: '', name: 'renamed late', sessionId: '' });
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
