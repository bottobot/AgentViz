'use strict';
// S08: resilience, privacy and visible caps of the combined view. These tests run the real adapters on real
// files in a temporary folder, and the real src/extension.js on a stand-in for the VS Code API. All data is
// synthetic. They prove host and controller behaviour; a real webview and VS Code host are S09's evidence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const realSessions = require('../src/sessions');
const { TranscriptReader, FamilyReader, discoverSessions, FAMILY_LIMIT, LANE_EVENTS, SESSION_LIMIT } = realSessions;
const { createSession, applyRecord, MAX_EVENTS } = require('../src/transcript');
const view = require('../media/view');
const { boot } = require('./navigation-harness');
const fx = require('./resilience-fixture');

const T0 = Date.parse('2026-11-10T10:00:00Z');
const READY = { type: 'ready', query: { seq: 1, workspaceKey: '', name: '', id: '' } };
const identity = { workspaceLabel: 'Synthetic', name: 'Synthetic session', sessionId: 'synthetic', provider: 'claude' };
const pageText = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

async function until(check, what) {
  for (let turn = 0; turn < 50000; turn++) {
    if (check()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail(`timed out waiting for ${what}`);
}
const quiet = async (turns = 300) => { for (let turn = 0; turn < turns; turn++) await new Promise(resolve => setImmediate(resolve)); };

// The real adapters, with a gate: a test can hold a transcript read or a discovery open and count the work done.
function gated() {
  const gate = { holdRead: null, holdDiscovery: null, reads: 0, discoveries: 0, readers: 0 };
  class Reader extends realSessions.FamilyReader {
    constructor(...args) { super(...args); gate.readers++; }
    // Only a read that starts while the gate is set is held; one already under way finishes normally.
    async read(...args) { const held = gate.holdRead; gate.reads++; const value = await super.read(...args); if (held && gate.holdRead === held) await held; return value; }
  }
  const module = { ...realSessions, FamilyReader: Reader, discoverSessions: async (...args) => {
    const held = gate.holdDiscovery;
    gate.discoveries++;
    const value = await realSessions.discoverSessions(...args);
    if (held && gate.holdDiscovery === held) await held;
    return value;
  } };
  const hold = key => { let release; gate[key] = new Promise(resolve => { release = resolve; }); return () => { gate[key] = null; release(); }; };
  return { gate, module, hold };
}

// Source A: two projects with one basename, saved names, a Codex session. Source B: one unrelated session.
function twoSources() {
  const root = fx.tempRoot('sources');
  const a = path.join(root, 'a');
  const b = path.join(root, 'b');
  const ids = { login: fx.uuid(1), cart: fx.uuid(2), tests: fx.uuid(3), codex: fx.uuid(4), other: fx.uuid(9) };
  const session = (base, project, id, cwd, title, at) => {
    let text = fx.claudeHead(id, at, cwd);
    for (let call = 0; call < 3; call++) text += fx.claudeCall(id, at + 1000 + call * 1000, `${id.slice(0, 8)}-${call}`, { filler: 50 });
    const file = fx.write(fx.claudeFile(base, project, id), text + fx.claudeTitle(id, title));
    fs.utimesSync(file, new Date(at), new Date(at));
    return file;
  };
  const files = {
    cart: session(a, 'p-store', ids.cart, 'C:\\Work\\storefront', 'Add cart totals', T0 + 1000),
    tests: session(a, 'p-viz', ids.tests, 'C:\\Work\\agentviz', 'Fix login tests', T0 + 2000),
    login: session(a, 'p-store', ids.login, 'C:\\Work\\storefront', 'Fix login redirect', T0 + 4000),
    other: session(b, 'p-other', ids.other, 'D:\\Else\\other-project', 'Other source session', T0 + 5000)
  };
  files.codex = fx.write(fx.codexFile(a, ids.codex), fx.codexHead(ids.codex, T0, '/home/dev/storefront') + fx.codexCall(T0 + 1000, 'cx-1'));
  fs.utimesSync(files.codex, new Date(T0 + 3000), new Date(T0 + 3000));
  fx.write(path.join(a, 'session_index.jsonl'), fx.line({ id: ids.codex, thread_name: 'Login audit', updated_at: fx.stamp(T0) }));
  return { root, a, b, ids, files, session, sourceA: { claudeRoot: a, codexRoot: a }, sourceB: { claudeRoot: b, codexRoot: path.join(b, 'no-codex') } };
}
const privateToA = source => [...Object.entries(source.ids).filter(([key]) => key !== 'other').map(([, id]) => id), 'Fix login', 'Add cart', 'Login audit', 'agentviz'];

test('a record written in pieces is applied once, when its newline arrives', async () => {
  const root = fx.tempRoot('partial');
  try {
    const id = fx.uuid(1);
    const file = fx.write(fx.claudeFile(root, 'p', id), fx.claudeHead(id, T0, 'C:\\Work\\Example'));
    const reader = new TranscriptReader('claude', id);
    const call = name => Buffer.from(fx.line({ type: 'assistant', timestamp: fx.stamp(T0 + 1000), uuid: `u-${name}`, sessionId: id,
      message: { content: [{ type: 'tool_use', id: name, name: 'Read', input: { file_path: 'C:\\Work\\Example\\src\\naïve—文.js' } }] } }));
    const bytes = call('split-1');
    // Cut inside the two-byte "ï": the first piece ends on half a character.
    const cut = bytes.indexOf(0xc3) + 1;
    assert.ok(cut > 0 && bytes[cut] >= 0x80, 'the cut is inside a multi-byte character');
    fs.appendFileSync(file, bytes.subarray(0, cut));
    let state = await reader.read(file);
    assert.deepEqual([state.events.filter(event => event.kind === 'files').length, state.invalidLines], [0, 0]);
    fs.appendFileSync(file, bytes.subarray(cut, bytes.length - 1));
    state = await reader.read(file);
    assert.deepEqual([state.events.filter(event => event.kind === 'files').length, state.invalidLines], [0, 0], 'a complete record without its newline still waits');
    fs.appendFileSync(file, '\n');
    state = await reader.read(file);
    assert.equal(state.events.at(-1).label, 'Reading src/naïve—文.js');
    assert.deepEqual([state.events.filter(event => event.kind === 'files').length, state.invalidLines], [1, 0]);

    // One byte per write, one read per byte: still one event and nothing counted as malformed.
    for (const byte of call('split-2')) { fs.appendFileSync(file, Buffer.from([byte])); state = await reader.read(file); }
    assert.deepEqual([state.events.filter(event => event.kind === 'files').length, state.invalidLines, state.bytesRead], [2, 0, fs.statSync(file).size]);

    // A write that was cut off for good is one malformed record; the next record is unaffected.
    fs.appendFileSync(file, '{"type":"assistant","timestamp":"2026-11-10T10:00:05Z","message":{"content":[{"type":"tool_use","id":"torn"\n');
    fs.appendFileSync(file, call('after-torn'));
    state = await reader.read(file);
    assert.deepEqual([state.events.filter(event => event.kind === 'files').length, state.invalidLines], [3, 1]);
    assert.ok(!state.events.some(event => event.id === 'torn'));
  } finally { fx.remove(root); }
});

test('records with unusable timestamps are counted, never drawn, and cannot fake recent activity', async () => {
  const root = fx.tempRoot('time');
  try {
    const id = fx.uuid(1);
    const call = (timestamp, name) => fx.line({ type: 'assistant', timestamp, uuid: `u-${name}`, sessionId: id, message: { content: [{ type: 'tool_use', id: name, name: 'Read', input: {} }] } });
    const good = fx.stamp(T0 + 60000);
    // Not strings (4), strings that are not dates (3), and dates no local transcript can honestly hold (5).
    const bad = [12345, { toString: 'x' }, null, true, 'not a date', '', '2026-13-45T99:99:99Z',
      '9999-12-31T23:59:59Z', '+275760-09-13T00:00:00.000Z', '-271821-04-20T00:00:00.000Z', '0000-01-01T00:00:00Z', '1970-01-01T00:00:00Z'];
    let text = fx.claudeHead(id, T0, 'C:\\Work\\Example') + call(good, 'good-1');
    bad.forEach((timestamp, index) => { text += call(timestamp, `bad-${index}`); });
    // A record far in the future that also carries the working directory: the project is still read from it.
    text += fx.line({ type: 'assistant', timestamp: '9999-01-01T00:00:00Z', cwd: 'C:\\Work\\Renamed', sessionId: id, message: { content: [] } }) + call(good, 'good-2');
    const file = fx.write(fx.claudeFile(root, 'p', id), text);
    const state = await new TranscriptReader('claude', id).read(file);
    assert.deepEqual(state.events.filter(event => event.kind === 'files').map(event => event.id), ['good-1', 'good-2']);
    assert.equal(state.invalidLines, bad.length + 1, 'every unusable timestamp is in the malformed count');
    assert.equal(state.updatedAt, T0 + 60000);
    assert.equal(state.startedAt, T0);
    assert.equal(state.project, 'Renamed');
    const now = T0 + 3600000;
    const html = view.render({ ...state, family: undefined }, { now, identity, warnings: [] });
    assert.doesNotMatch(html, /NaN|Invalid Date|Infinity|undefined/);
    assert.match(pageText(html), new RegExp(`${bad.length + 1} malformed records skipped`));
    assert.match(pageText(html), /Last record 59m ago/);
    assert.match(pageText(html), /Last record 59m ago Quiet /, 'the future-dated records do not make the session look active');

    // Codex: the same rule, and session_meta is still read when its own timestamp is unusable.
    const codexId = fx.uuid(2);
    const codex = fx.write(fx.codexFile(root, codexId), fx.line({ type: 'session_meta', timestamp: 'garbage', payload: { id: codexId, cwd: '/home/dev/example' } })
      + fx.codexCall(T0, 'ok-1') + fx.line({ type: 'response_item', timestamp: '9999-12-31T23:59:59Z', payload: { type: 'function_call', call_id: 'future', name: 'exec_command', arguments: '{}' } }));
    const codexState = await new TranscriptReader('codex', codexId).read(codex);
    assert.deepEqual([codexState.events.map(event => event.id).filter(name => name === 'future').length, codexState.project, codexState.updatedAt, codexState.invalidLines], [0, 'example', T0 + 500, 2]);
  } finally { fx.remove(root); }
});

test('malformed and oversized records are counted and the records after them still apply', async () => {
  const root = fx.tempRoot('malformed');
  try {
    const id = fx.uuid(1);
    const file = fx.write(fx.claudeFile(root, 'p', id), fx.claudeHead(id, T0, 'C:\\Work\\Example') + fx.claudeCall(id, T0 + 1000, 'first'));
    const reader = new TranscriptReader('claude', id);
    await reader.read(file);
    // Valid JSON that is not a record object (5), text that is not JSON (3), binary bytes (1), nesting too deep to parse (1).
    const junk = ['null', '123', '"a string"', '[]', 'true', '{"type":', 'PRIVATE_OUTPUT plain text', '}{', '['.repeat(200000)];
    fs.appendFileSync(file, junk.join('\n') + '\n');
    fs.appendFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0xc3, 0x28, 0x80]), Buffer.from('\n')]));
    fs.appendFileSync(file, fx.claudeCall(id, T0 + 2000, 'after-junk'));
    let state = await reader.read(file);
    assert.equal(state.invalidLines, junk.length + 1);
    assert.equal(state.events.at(-1).id, 'after-junk');

    // A complete record over the 4 MB record limit, then one still being written with no newline in sight.
    fs.appendFileSync(file, fx.line({ type: 'user', timestamp: fx.stamp(T0 + 3000), message: { content: 'PRIVATE_OUTPUT ' + 'x'.repeat(5 * 1024 * 1024) } }));
    fs.appendFileSync(file, fx.claudeCall(id, T0 + 4000, 'after-big'));
    fs.appendFileSync(file, '{"type":"user","timestamp":"2026-11-10T10:00:09Z","message":{"content":"' + 'y'.repeat(5 * 1024 * 1024));
    while ((state = await reader.read(file)).loading) { /* 8 MB per pass */ }
    assert.equal(state.oversizedLines, 2, 'the unfinished giant record is counted once, as soon as it passes the limit');
    fs.appendFileSync(file, 'y'.repeat(1024 * 1024) + '"}}\n' + fx.claudeCall(id, T0 + 5000, 'after-giant'));
    while ((state = await reader.read(file)).loading) { /* read to the end */ }
    assert.equal(state.oversizedLines, 2, 'the rest of the same record is not counted again');
    assert.deepEqual(state.events.filter(event => event.kind === 'files').map(event => event.id), ['first', 'after-junk', 'after-big', 'after-giant']);
    assert.ok(reader.tail.length < 1024, 'nothing of the giant record is kept');
    const text = pageText(view.render({ ...state, family: undefined }, { now: T0 + 6000, identity, warnings: [] }));
    assert.match(text, new RegExp(`${junk.length + 1} malformed records skipped`));
    assert.doesNotMatch(JSON.stringify(state) + text, /PRIVATE_/);

  } finally { fx.remove(root); }
});

test('hostile shapes inside well-formed records do not throw and put no unbounded text into an event', () => {
  const hostile = createSession('claude', 'synthetic');
  const huge = 'PRIVATE_SECRET'.repeat(5000);
  for (const record of [
    { type: 'assistant', timestamp: fx.stamp(T0), uuid: huge, message: { stop_reason: 'end_turn', content: [{ type: 'tool_use', id: huge, name: 'Read', input: { file_path: huge } }, { type: 'tool_use', id: 'named', name: { toString: () => huge }, input: huge }] } },
    { type: 'user', timestamp: fx.stamp(T0 + 1), uuid: { secret: huge }, message: { content: huge } },
    { type: 'user', timestamp: fx.stamp(T0 + 2), uuid: ['PRIVATE_SECRET'], message: { content: [{ type: 'text', text: huge }] } },
    { type: 'system', subtype: 'compact_boundary', timestamp: fx.stamp(T0 + 3), uuid: huge }
  ]) assert.doesNotThrow(() => applyRecord(hostile, record));
  const codexHostile = createSession('codex', 'synthetic');
  for (const payload of [{ type: 'user_message', id: huge }, { type: 'task_complete', turn_id: huge }, { type: 'context_compacted', id: { secret: huge } }]) {
    assert.doesNotThrow(() => applyRecord(codexHostile, { type: 'event_msg', timestamp: fx.stamp(T0), payload }));
  }
  for (const session of [hostile, codexHostile]) {
    assert.ok(session.events.length >= 3);
    for (const event of session.events) assert.ok(event.id.length <= 200 && event.label.length <= 200, `bounded event text (${event.kind})`);
  }
  // A marker's ID comes from a record ID that is not a call ID; when that is not short plain text it is not used.
  // (A call ID and a file name are identifiers the view may show; they are cut to 160 characters.)
  const markers = [...hostile.events, ...codexHostile.events].filter(event => ['prompt', 'complete', 'paused', 'compaction'].includes(event.kind));
  assert.equal(markers.length, 7);
  for (const event of markers) assert.match(event.id, /^[a-z]+:\d+$/, `${event.kind} marker falls back to its time`);
});

test('a replaced, shortened or deleted transcript leaves nothing of its old contents behind', async () => {
  const root = fx.tempRoot('replace');
  try {
    const id = fx.uuid(1);
    const cwd = 'C:\\Work\\Example';
    const main = fx.claudeFile(root, 'p', id);
    const child = fx.claudeChildFile(root, 'p', id, 'agentold');
    const todo = (callId, label) => fx.line({ type: 'assistant', timestamp: fx.stamp(T0 + 5000), sessionId: id, message: { content: [{ type: 'tool_use', id: callId, name: 'TodoWrite', input: { todos: [{ content: label, status: 'in_progress', activeForm: 'PRIVATE_TASK' }] } }] } })
      + fx.line({ type: 'user', timestamp: fx.stamp(T0 + 5500), sessionId: id, message: { content: [{ type: 'tool_result', tool_use_id: callId, content: 'PRIVATE_OUTPUT' }] } });
    fx.write(main, fx.claudeHead(id, T0, cwd) + fx.claudeCall(id, T0 + 1000, 'old-main-1', { tool: 'Edit' }) + fx.claudeCall(id, T0 + 2000, 'old-main-2') + todo('old-todo', 'Old plan item'));
    fx.write(child, fx.claudeHead(id, T0 + 100, cwd, 'agentold') + fx.claudeCall(id, T0 + 3000, 'old-child-1', { agentId: 'agentold' }));
    fs.writeFileSync(child.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'old-worker', description: 'PRIVATE_TASK' }));
    const listing = async () => (await discoverSessions({ claudeRoot: root, codexRoot: path.join(root, 'none') }, {})).all;
    let files = await listing();
    const reader = new FamilyReader('claude', id);
    let state = await reader.read(main, { files });
    assert.deepEqual([state.events.length, state.family.lanes.length, state.progress.items[0].label, state.footprint.total, state.family.lanes[1].label], [4, 2, 'Old plan item', 1, 'old-worker']);

    // Deleted and written again under the same name, shorter, with other contents and another child.
    fs.rmSync(main);
    fs.rmSync(child);
    fs.rmSync(child.replace(/\.jsonl$/, '.meta.json'));
    fx.write(main, fx.claudeHead(id, T0 + 60000, cwd) + fx.claudeCall(id, T0 + 61000, 'new-main-1', { tool: 'Bash' }));
    fx.write(fx.claudeChildFile(root, 'p', id, 'agentnew'), fx.claudeHead(id, T0 + 60100, cwd, 'agentnew') + fx.claudeCall(id, T0 + 62000, 'new-child-1', { agentId: 'agentnew' }));
    files = await listing();
    state = await reader.read(main, { files });
    const sent = JSON.stringify(state);
    assert.doesNotMatch(sent, /old-main|old-child|old-todo|Old plan item|old-worker|agentold|PRIVATE_/);
    assert.deepEqual([state.events.map(event => event.id).filter(name => !name.includes(':')), state.progress, state.footprint.total, state.startedAt, state.family.lanes.map(lane => lane.key)],
      [['new-main-1'], null, 0, T0 + 60000, ['main', 'agentnew']]);
    assert.equal(reader.children.size, 1, 'the reader of the removed child is dropped');

    // Cut short in place (same file): read again from the start, not from the old offset.
    fs.truncateSync(main, Buffer.byteLength(fx.claudeHead(id, T0 + 60000, cwd)));
    state = await reader.read(main, { files });
    assert.deepEqual([state.events.filter(event => event.kind !== 'prompt').length, state.bytesRead], [0, fs.statSync(main).size]);
    fs.appendFileSync(main, fx.claudeCall(id, T0 + 70000, 'after-cut'));
    state = await reader.read(main, { files });
    assert.equal(state.events.at(-1).id, 'after-cut');

    // Deleted while followed: the read fails with a code, and the next read after it returns starts clean.
    fs.rmSync(main);
    await assert.rejects(reader.read(main, { files }), { code: 'ENOENT' });
    fx.write(main, fx.claudeHead(id, T0 + 80000, cwd) + fx.claudeCall(id, T0 + 81000, 'returned'));
    state = await reader.read(main, { files });
    assert.deepEqual(state.events.map(event => event.id).filter(name => !name.includes(':')), ['returned']);
  } finally { fx.remove(root); }
});

test('Refresh recovers an edit between the rewrite samples; an edit inside a sample is noticed without it', async () => {
  const source = twoSources();
  try {
    const id = source.ids.login;
    let text = fx.claudeHead(id, T0, 'C:\\Work\\storefront');
    for (let call = 0; call < 40; call++) text += fx.claudeCall(id, T0 + 1000 + call * 1000, `edit-${String(call).padStart(2, '0')}`, { filler: 400 });
    fs.writeFileSync(source.files.login, text);
    const host = fx.realHost(source.sourceA);
    host.open();
    host.send(READY);
    await until(() => host.messages.length === 1, 'the first message');
    const kindOf = (message, name) => message.snapshot.events.find(event => event.id === name)?.kind;
    assert.equal(host.messages[0].selected.sessionId, id);
    assert.equal(kindOf(host.messages[0], 'edit-20'), 'files');

    // The same file is edited in place, same length, in a part that is in neither 4 KB sample, and then grows.
    const overwrite = (name, from, to) => {
      const bytes = fs.readFileSync(source.files.login);
      const at = bytes.indexOf(from, bytes.indexOf(`"id":"${name}"`));
      assert.ok(at > 0 && from.length === to.length);
      const handle = fs.openSync(source.files.login, 'r+');
      fs.writeSync(handle, to, at);
      fs.closeSync(handle);
      return { at, size: bytes.length };
    };
    const middle = overwrite('edit-20', '"name":"Read"', '"name":"Edit"');
    assert.ok(middle.at > 4096 && middle.at < middle.size - 4096, 'the edit lies wholly between the samples');
    fs.appendFileSync(source.files.login, fx.claudeCall(id, T0 + 90000, 'appended-1'));
    let message = await host.pass();
    assert.equal(kindOf(message, 'appended-1'), 'files', 'the appended record is read');
    // WARNING: the documented limitation. The edited record keeps its old meaning until Refresh.
    assert.equal(kindOf(message, 'edit-20'), 'files');
    assert.equal(message.snapshot.footprint.editCalls, 0);

    host.send({ type: 'refresh' });
    await until(() => host.messages.at(-1) !== message, 'the message after Refresh');
    message = host.messages.at(-1);
    assert.equal(kindOf(message, 'edit-20'), 'edits', 'Refresh rereads the transcript from the beginning');
    assert.equal(message.snapshot.footprint.editCalls, 1);
    assert.equal(message.selected.sessionId, id, 'Refresh keeps the followed session');

    // An edit inside the first 4 KB is caught by the sample on the next ordinary pass.
    const early = overwrite('edit-00', '"name":"Read"', '"name":"Edit"');
    assert.ok(early.at < 4096);
    fs.appendFileSync(source.files.login, fx.claudeCall(id, T0 + 91000, 'appended-2'));
    message = await host.pass();
    assert.equal(kindOf(message, 'edit-00'), 'edits');
    // The limitation stays documented where a user reads it.
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8'), /first and last 4 KB[^.]*\. Edits wholly between those samples can be missed; Refresh rereads/);
    host.panel().dispose();
    assert.deepEqual(host.errors, []);
  } finally { fx.remove(source.root); }
});

test('filters asked while a transcript is being read are not answered with the previous list', async () => {
  const source = twoSources();
  try {
    const { gate, module, hold } = gated();
    const host = fx.realHost({ ...source.sourceA, sessions: module });
    host.open();
    host.send(READY);
    await until(() => host.messages.length === 1, 'the first message');
    assert.equal(host.messages[0].sessions.length, 4);

    const release = hold('holdRead');
    const reads = gate.reads;
    host.callbacks.tick();
    await until(() => gate.reads > reads, 'a transcript read in flight');
    host.send({ type: 'query', seq: 2, workspaceKey: '', name: 'cart', id: '' });
    release();
    // The lookup for request 2 runs on the next timer pass.
    await until(() => (host.callbacks.tick(), host.messages.some(message => message.lookup.seq === 2 && message.sessions.length === 1)), 'the answer to request 2');
    // The view accepts a message as the answer to its newest request by this number alone.
    for (const message of host.messages.filter(message => message.lookup.seq === 2)) {
      assert.deepEqual(message.sessions.map(session => session.name), ['Add cart totals'], 'a message numbered 2 holds the matches of request 2');
      assert.deepEqual([message.lookup.matched, message.lookup.total], [1, 4]);
    }

    // A reloaded view starts numbering at 1 again; a list worked out for the old view's filters is not its answer.
    await quiet(60);
    const again = hold('holdRead');
    const before = gate.reads;
    const sent = host.messages.length;
    await until(() => (host.callbacks.tick(), gate.reads > before), 'a second read in flight');
    host.send({ type: 'ready', query: { seq: 1, workspaceKey: '', name: 'login', id: '' } });
    again();
    await until(() => (host.callbacks.tick(), host.messages.slice(sent).some(message => message.lookup.seq === 1 && message.sessions.length === 3)), 'the answer to the reloaded view');
    for (const message of host.messages.slice(sent).filter(message => message.lookup.seq === 1)) {
      assert.deepEqual(message.sessions.map(session => session.name).sort(), ['Fix login redirect', 'Fix login tests', 'Login audit']);
    }
    host.panel().dispose();
    assert.deepEqual(host.errors, []);
  } finally { fx.remove(source.root); }
});

test('a source changed during a read or a lookup shows nothing of the old source afterwards', async () => {
  const source = twoSources();
  try {
    const { gate, module, hold } = gated();
    const host = fx.realHost({ ...source.sourceA, sessions: module });
    host.open();
    host.send(READY);
    await until(() => host.messages.length === 1, 'the first message');
    assert.match(JSON.stringify(host.messages[0]), /Fix login redirect/);

    for (const stage of ['holdRead', 'holdDiscovery']) {
      const fromA = stage === 'holdRead';
      // Back to source A for the second round, read to a settled state first.
      if (!fromA) {
        host.setRoots(source.sourceA);
        await until(() => (host.callbacks.tick(), host.messages.at(-1).selected?.sessionId === source.ids.login && host.messages.at(-1).snapshot), 'source A again');
      }
      const sent = host.messages.length;
      const readers = gate.readers;
      const release = hold(stage);
      const count = fromA ? gate.reads : gate.discoveries;
      if (!fromA) host.send({ type: 'refresh' });
      await until(() => (host.callbacks.tick(), (fromA ? gate.reads : gate.discoveries) > count), `${stage} in flight`);
      host.setRoots(source.sourceB);
      release();
      await until(() => (host.callbacks.tick(), host.messages.length > sent && host.messages.at(-1).snapshot), 'a message from the new source');
      const after = host.messages.slice(sent);
      const text = JSON.stringify(after);
      for (const word of privateToA(source)) assert.ok(!text.includes(word), `${stage}: "${word}" of the old source is not sent after the change`);
      const last = after.at(-1);
      assert.deepEqual([last.sessions.map(session => session.name), last.selected.sessionId, last.snapshot.id, last.workspaces.map(group => group.label), last.lookup.total],
        [['Other source session'], source.ids.other, source.ids.other, ['other-project'], 1]);
      assert.ok(last.warnings.every(warning => /^Codex sessions folder not found\.$/.test(warning)), 'only the new source is reported on');
      assert.ok(gate.readers > readers, 'the old reader is dropped, not reused');
    }

    // An ID of the old source can no longer be followed, by the view or by the entry command.
    const stale = host.messages[0].selectedId;
    host.send({ type: 'select', id: stale });
    assert.deepEqual({ ...await host.openSession({ provider: 'claude', sessionId: source.ids.login }) }, { ok: false, reason: 'not-found' });
    assert.equal((await host.pass()).selected.sessionId, source.ids.other);
    host.panel().dispose();
    assert.deepEqual(host.errors, []);
  } finally { fx.remove(source.root); }
});

test('a source setting that is not usable text falls back to the default folder without an error every second', async () => {
  const home = fx.tempRoot('home');
  try {
    const id = fx.uuid(1);
    fx.write(fx.claudeFile(path.join(home, '.claude'), 'p', id), fx.claudeHead(id, T0, 'C:\\Work\\Example') + fx.claudeTitle(id, 'Default folder session'));
    for (const value of [42, ['x'], { path: 'x' }, true, '   ']) {
      const host = fx.realHost({ claudeRoot: value, codexRoot: value, home });
      host.open();
      host.send(READY);
      await until(() => host.messages.length > 0 || host.errors.length > 0, 'a message or an error');
      for (let pass = 0; pass < 3; pass++) { host.callbacks.tick(); await quiet(50); }
      assert.deepEqual(host.errors, [], `no error for ${JSON.stringify(value)}`);
      assert.deepEqual(host.messages.at(-1).sessions.map(session => session.name), ['Default folder session']);
      assert.deepEqual({ ...await host.openSession({ provider: 'claude', sessionId: id }) }, { ok: true, provider: 'claude', sessionId: id });
      host.panel().dispose();
    }
  } finally { fx.remove(home); }
});

test('a hidden panel reads nothing, and showing it again answers the filters it was left with', async () => {
  const source = twoSources();
  try {
    const { gate, module } = gated();
    const host = fx.realHost({ ...source.sourceA, sessions: module });
    host.open();
    host.send(READY);
    await until(() => host.messages.length === 1, 'the first message');
    host.send({ type: 'query', seq: 2, workspaceKey: '', name: 'login', id: '' });
    await until(() => host.messages.at(-1).lookup.seq === 2, 'the filtered answer');
    await quiet(50);

    host.panel().visible = false;
    host.panel().viewState();
    const idle = { messages: host.messages.length, reads: gate.reads, discoveries: gate.discoveries };
    fs.appendFileSync(source.files.login, fx.claudeCall(source.ids.login, T0 + 90000, 'while-hidden'));
    host.advance(60000);
    for (let pass = 0; pass < 5; pass++) { host.callbacks.tick(); await quiet(40); }
    assert.deepEqual({ messages: host.messages.length, reads: gate.reads, discoveries: gate.discoveries }, idle, 'no folder listing, no read and no message while hidden');

    host.panel().visible = true;
    host.panel().viewState();
    await until(() => host.messages.length > idle.messages, 'a message after showing the panel');
    const shown = host.messages.at(-1);
    assert.deepEqual([shown.lookup.seq, shown.sessions.map(session => session.name).sort(), shown.selected.sessionId],
      [2, ['Fix login redirect', 'Fix login tests', 'Login audit'], source.ids.login], 'the filters and the followed session are unchanged');
    assert.ok(shown.snapshot.events.some(event => event.id === 'while-hidden'), 'what was written while hidden is read on return');
    host.panel().dispose();
    assert.deepEqual(host.errors, []);
  } finally { fx.remove(source.root); }
});

test('closing stops all work, even mid-read, and repeated reopening starts clean each time', async () => {
  const source = twoSources();
  try {
    const { gate, module, hold } = gated();
    const host = fx.realHost({ ...source.sourceA, sessions: module });
    host.open();
    host.send(READY);
    await until(() => host.messages.length === 1, 'the first message');
    const first = host.panel();
    // The user follows a session that is not the newest; that choice is what a reopened panel restores.
    host.send({ type: 'select', id: host.messages[0].sessions.find(session => session.sessionId === source.ids.tests).id });
    await until(() => host.messages.at(-1).snapshot?.id === source.ids.tests, 'the chosen session');
    const chosen = host.messages.length;

    // Closed while a read is in flight: its result is discarded without a message or an error.
    const release = hold('holdRead');
    const reads = gate.reads;
    host.callbacks.tick();
    await until(() => gate.reads > reads, 'a read in flight');
    first.dispose();
    release();
    await quiet();
    assert.equal(host.messages.length, chosen);
    assert.deepEqual(host.errors, []);
    assert.deepEqual([first.listeners.message.disposed, first.listeners.visibility.disposed, host.callbacks.configListener.disposed], [true, true, true]);
    assert.deepEqual(host.timers(), { started: 1, cleared: 1 });
    const work = { reads: gate.reads, discoveries: gate.discoveries };
    host.callbacks.tick();
    first.receive?.({ type: 'refresh' });
    await quiet();
    assert.deepEqual({ reads: gate.reads, discoveries: gate.discoveries }, work, 'a closed panel does no further work');

    // Closed during a lookup, too.
    host.open();
    const lookup = hold('holdDiscovery');
    host.send(READY);
    await until(() => gate.discoveries > work.discoveries, 'a lookup in flight');
    host.panel().dispose();
    lookup();
    await quiet();
    assert.equal(host.messages.length, chosen);

    const nonces = new Set();
    for (let round = 0; round < 25; round++) {
      const sent = host.messages.length;
      host.open();
      host.open();
      const panel = host.panel();
      nonces.add(panel.html.match(/script-src 'nonce-([^']+)'/)[1]);
      // A reopened view starts with its own saved filters; nothing of the previous panel's filters is reused.
      host.send(round % 2 ? { type: 'ready', query: { seq: 1, workspaceKey: '', name: 'cart', id: '' } } : READY);
      await until(() => host.messages.length > sent, `a message in round ${round}`);
      const message = host.messages.at(-1);
      assert.equal(message.sessions.length, round % 2 ? 1 : 4, `round ${round}: filters of this view only`);
      assert.equal(message.selected.sessionId, source.ids.tests, 'the followed session is restored whatever the filters, not reset');
      assert.equal(message.lookup.seq, 1);
      panel.dispose();
      panel.dispose();
    }
    assert.deepEqual([host.created.length, nonces.size, host.timers().started, host.timers().cleared], [27, 25, 27, 27]);
    assert.equal(host.panels.filter(panel => panel.reveals).length, 25, 'a second open reveals the same panel');
    const settled = host.messages.length;
    host.callbacks.tick();
    await quiet();
    assert.equal(host.messages.length, settled);

    host.open();
    host.deactivate();
    assert.deepEqual(host.timers(), { started: 28, cleared: 28 });
    assert.deepEqual(host.errors, []);
  } finally { fx.remove(source.root); }
});

test('background updates leave the typed filters alone, and a new source leaves only the chosen filter behind', async () => {
  const source = twoSources();
  try {
    const host = fx.realHost(source.sourceA);
    host.open();
    let forwarded = 0;
    const page = boot({ answer: false, post: message => host.send(message) });
    const pump = () => { while (forwarded < host.messages.length) page.raw(host.messages[forwarded++]); };
    const answered = async seq => { await until(() => (host.callbacks.tick(), host.messages.at(-1)?.lookup.seq === seq), `the answer to request ${seq}`); await quiet(30); pump(); };
    const names = () => page.options('session').filter(option => option.value).map(option => option.text.split(' · ')[0]);
    await answered(1);
    assert.equal(page.options('session').filter(option => option.value).length, 4);
    assert.equal(page.elements['selected-name'].textContent, 'Fix login redirect');

    page.type('name-filter', 'login');
    await answered(2);
    assert.equal(names().length, 3);
    const project = page.options('workspace').find(option => /^Work\/storefront/.test(option.text));
    assert.ok(project, 'two folders named storefront are told apart');
    page.elements.workspace.stored = project.value;
    page.elements.workspace.fire('change');
    await answered(3);
    assert.deepEqual(names(), ['Work/storefront › Fix login redirect']);

    // Background changes: new activity, a rename of the followed session, a matching and a non-matching new session.
    const writes = page.elements['name-filter'].valueWrites + page.elements['id-filter'].valueWrites;
    fs.appendFileSync(source.files.login, fx.claudeCall(source.ids.login, T0 + 90000, 'later-work') + fx.claudeTitle(source.ids.login, 'Fix login redirect v2'));
    source.session(source.a, 'p-store', fx.uuid(5), 'C:\\Work\\storefront', 'Unrelated new work', Date.now() + 1000);
    source.session(source.a, 'p-store', fx.uuid(6), 'C:\\Work\\storefront', 'Login again', Date.now() + 2000);
    host.advance(11000);
    await until(() => (host.callbacks.tick(), host.messages.at(-1).sessions.length === 2 && host.messages.at(-1).selected.name === 'Fix login redirect v2'), 'the refreshed list');
    await quiet(30);
    pump();
    assert.deepEqual(names(), ['Work/storefront › Login again', 'Work/storefront › Fix login redirect v2']);
    assert.deepEqual([page.elements['name-filter'].value, page.elements.workspace.value, page.document.activeElement.id, page.elements['name-filter'].valueWrites + page.elements['id-filter'].valueWrites],
      ['login', project.value, 'name-filter', writes], 'the typed text, the chosen project and the focus are untouched');
    assert.equal(page.elements['selected-name'].textContent, 'Fix login redirect v2');
    assert.equal(page.elements.session.value, host.messages[0].selectedId, 'the followed session is still the selected one');
    assert.match(page.elements.content.innerHTML, /later-work|Reading/);
    assert.deepEqual(page.posted.filter(message => message.type === 'select'), [], 'no update changed the followed session');
    assert.equal(host.messages.at(-1).lookup.seq, 3);

    // The source folder changes under the same view.
    host.setRoots(source.sourceB);
    await until(() => (host.callbacks.tick(), host.messages.at(-1).selected?.sessionId === source.ids.other && host.messages.at(-1).snapshot), 'the new source');
    await quiet(30);
    pump();
    const everything = () => [...Object.values(page.elements).map(node => `${node.textContent} ${node.innerHTML} ${node.children.map(option => `${option.value} ${option.textContent}`).join(' ')}`)].join('\n');
    let shown = everything();
    for (const word of [...privateToA(source), 'Login again', 'Unrelated new work']) assert.ok(!shown.includes(word), `"${word}" of the old source is no longer on the page`);
    assert.equal(page.elements['selected-name'].textContent, 'Other source session');
    assert.equal(page.elements['selected-id'].textContent, source.ids.other);
    // The one thing kept is the user's own project filter, named as theirs and as absent from this source.
    assert.deepEqual(page.options('workspace').filter(option => /storefront/.test(option.text)).map(option => option.text), ['Work/storefront (not in the current list)']);
    assert.equal((shown.match(/storefront/g) || []).length, 1);
    assert.match(page.elements.matches.textContent, /No sessions match\. Clear filters to see all 1\./);
    assert.equal(page.elements['name-filter'].value, 'login');

    page.elements['clear-filters'].fire('click');
    await answered(4);
    shown = everything();
    assert.ok(!shown.includes('storefront'));
    assert.deepEqual(names(), ['other-project › Other source session']);
    host.panel().dispose();
    assert.deepEqual(host.errors, []);
  } finally { fx.remove(source.root); }
});

// Every field name the view may receive. A field added to a message by a later change fails here until it is listed.
const SHAPE = {
  message: ['lookup', 'selected', 'selectedId', 'sessions', 'snapshot', 'type', 'warnings', 'workspaces'],
  entry: ['child', 'id', 'modified', 'name', 'nameSource', 'project', 'provider', 'sessionId', 'workspaceKey', 'workspaceLabel'],
  workspace: ['count', 'key', 'label'],
  lookup: ['limit', 'matched', 'missing', 'pendingNames', 'pendingWorkspaces', 'seq', 'total'],
  snapshot: ['bytesRead', 'context', 'droppedEvents', 'events', 'family', 'fileBytes', 'footprint', 'id', 'invalidLines', 'loading', 'oversizedLines', 'parent', 'progress', 'project', 'provider', 'startedAt', 'status', 'updatedAt'],
  event: ['id', 'kind', 'label', 'outcome', 'time'],
  family: ['eventLimit', 'found', 'lanes', 'limit', 'notes'],
  lane: ['depth', 'duplicates', 'end', 'events', 'invalidLines', 'key', 'label', 'link', 'loading', 'missing', 'omitted', 'oversizedLines', 'parentKey', 'parentKnown', 'role', 'start', 'status', 'unreadable', 'updatedAt'],
  footprint: ['editCalls', 'edits', 'failedCalls', 'files', 'limit', 'readCalls', 'reads', 'total', 'unnamedEdits', 'unnamedReads'],
  // events: the IDs of the calls behind the row (details on click), never their content.
  file: ['edits', 'events', 'failed', 'key', 'label', 'reads', 'shared'],
  progress: ['items', 'omitted', 'source', 'unmatched', 'unread', 'unreadable', 'updatedAt'],
  item: ['id', 'label', 'status']
};
function checkShape(message) {
  const keys = (value, shape, optional = []) => assert.deepEqual(Object.keys(value).filter(key => !optional.includes(key)).sort(), SHAPE[shape].filter(key => !optional.includes(key)), `fields of ${shape}`);
  keys(message, 'message');
  message.sessions.forEach(entry => keys(entry, 'entry'));
  if (message.selected) keys(message.selected, 'entry');
  message.workspaces.forEach(group => keys(group, 'workspace'));
  keys(message.lookup, 'lookup');
  const snapshot = message.snapshot;
  if (!snapshot) return;
  keys(snapshot, 'snapshot');
  snapshot.events.forEach(event => keys(event, 'event'));
  keys(snapshot.family, 'family');
  for (const lane of snapshot.family.lanes) {
    keys(lane, 'lane', ['events']);
    (lane.events || []).forEach(event => keys(event, 'event'));
    assert.deepEqual([Object.keys(lane.start).sort(), Object.keys(lane.end).sort()], [['source', 'time'], ['state', 'time']]);
  }
  keys(snapshot.footprint, 'footprint');
  snapshot.footprint.files.forEach(file => keys(file, 'file'));
  if (snapshot.progress) { keys(snapshot.progress, 'progress'); snapshot.progress.items.forEach(item => keys(item, 'item')); }
}
function strings(value, found = []) {
  if (typeof value === 'string') found.push(value);
  else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) { found.push(key); strings(inner, found); }
  return found;
}

test('the final host message holds no prompt, reasoning, command, output, raw path or secret, for either provider', async () => {
  const root = fx.tempRoot('privacy');
  try {
    const claudeRoot = path.join(root, 'PRIVATE_PATH_claude');
    const codexRoot = path.join(root, 'PRIVATE_PATH_codex');
    const id = fx.uuid(1);
    const cwd = 'C:\\PRIVATE_PATH\\clients\\acme\\storefront';
    const record = (type, at, extra) => fx.line({ type, timestamp: fx.stamp(at), sessionId: id, uuid: `u-${at}`, cwd, gitBranch: 'PRIVATE_SECRET', ...extra });
    const result = (at, callId, toolUseResult, extra = {}) => record('user', at, { toolUseResult, message: { content: [{ type: 'tool_result', tool_use_id: callId, content: 'PRIVATE_OUTPUT', ...extra }] } });
    const use = (at, callId, name, input) => record('assistant', at, { message: { model: 'PRIVATE_SECRET', usage: { input_tokens: 5 }, content: [{ type: 'thinking', thinking: 'PRIVATE_REASONING', signature: 'PRIVATE_SECRET' }, { type: 'text', text: 'PRIVATE_REASONING' }, { type: 'tool_use', id: callId, name, input }] } });
    let main = record('user', T0, { message: { role: 'user', content: 'PRIVATE_PROMPT api key PRIVATE_SECRET' } })
      + record('user', T0 + 1, { message: { content: [{ type: 'text', text: 'PRIVATE_PROMPT' }, { type: 'image', source: { data: 'PRIVATE_SECRET' } }] } })
      + fx.line({ type: 'summary', summary: 'PRIVATE_PROMPT', leafUuid: 'x' })
      + fx.line({ type: 'file-history-snapshot', snapshot: { trackedFileBackups: { 'C:\\PRIVATE_PATH\\a.js': { content: 'PRIVATE_CODE' } } } })
      + record('system', T0 + 2, { subtype: 'local_command', content: 'PRIVATE_COMMAND' })
      + record('attachment', T0 + 3, { attachment: { type: 'file', filename: 'C:\\PRIVATE_PATH\\notes.txt', content: 'PRIVATE_CODE' } });
    const tools = [
      ['Read', { file_path: 'C:\\PRIVATE_PATH\\clients\\acme\\storefront\\src\\checkout.js' }],
      ['Edit', { file_path: 'C:\\PRIVATE_PATH\\clients\\acme\\storefront\\src\\checkout.js', old_string: 'PRIVATE_CODE', new_string: 'PRIVATE_CODE' }],
      ['Write', { file_path: '\\\\PRIVATE_PATH\\share\\deploy\\settings.env', content: 'TOKEN=PRIVATE_SECRET' }],
      ['Bash', { command: 'curl -H "Authorization: Bearer PRIVATE_SECRET" https://example.org/PRIVATE_URL && PRIVATE_COMMAND', description: 'PRIVATE_COMMAND' }],
      ['PowerShell', { command: '$env:API_KEY="PRIVATE_SECRET"; C:\\PRIVATE_PATH\\tool.exe --PRIVATE_COMMAND' }],
      ['Bash', { command: 'PRIVATE_SECRET=1 npm test' }],
      ['Grep', { pattern: 'PRIVATE_CODE', path: 'C:\\PRIVATE_PATH\\clients\\acme\\storefront\\src' }],
      ['Glob', { pattern: 'C:/PRIVATE_PATH/**/*.js' }],
      ['WebFetch', { url: 'https://user:PRIVATE_SECRET@example.org/PRIVATE_URL/page?token=PRIVATE_SECRET#PRIVATE_URL', prompt: 'PRIVATE_PROMPT' }],
      ['WebSearch', { query: 'PRIVATE_PROMPT' }],
      ['mcp__internal__lookup', { text: 'PRIVATE_PROMPT', path: '/PRIVATE_PATH/x' }],
      ['NotebookEdit', { notebook_path: '/home/PRIVATE_PATH/analysis/report.ipynb', new_source: 'PRIVATE_CODE' }],
      ['TodoWrite', { todos: [{ content: 'Synthetic step one', status: 'completed', activeForm: 'PRIVATE_TASK' }, { content: 'Synthetic step two', status: 'in_progress', activeForm: 'PRIVATE_TASK' }] }],
      ['Agent', { description: 'PRIVATE_TASK', prompt: 'PRIVATE_PROMPT', subagent_type: 'synthetic-worker' }]
    ];
    tools.forEach(([name, input], index) => {
      const at = T0 + 1000 * (index + 1);
      main += use(at, `call-${index}`, name, input)
        + result(at + 500, `call-${index}`, name === 'Agent' ? { agentId: 'agentone', status: 'async_launched', prompt: 'PRIVATE_PROMPT', outputFile: 'C:\\PRIVATE_PATH\\out' } : { stdout: 'PRIVATE_OUTPUT', stderr: 'PRIVATE_OUTPUT', filePath: 'C:\\PRIVATE_PATH\\f', content: 'PRIVATE_CODE' }, { is_error: index === 3 });
    });
    main += record('user', T0 + 60000, { message: { content: '<task-notification><task-id>agentone</task-id><status>completed</status><summary>PRIVATE_OUTPUT</summary><result>PRIVATE_OUTPUT</result></task-notification>' } })
      + fx.claudeTitle(id, 'Synthetic checkout work') + record('assistant', T0 + 61000, { message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'PRIVATE_REASONING' }] } });
    const mainFile = fx.write(fx.claudeFile(claudeRoot, 'C--PRIVATE-PATH-clients-acme', id), main);
    const childFile = fx.write(fx.claudeChildFile(claudeRoot, 'C--PRIVATE-PATH-clients-acme', id, 'agentone'),
      fx.line({ type: 'user', timestamp: fx.stamp(T0 + 15000), sessionId: id, agentId: 'agentone', cwd, message: { content: 'PRIVATE_PROMPT' } }) + fx.claudeCall(id, T0 + 16000, 'child-1', { agentId: 'agentone', tool: 'Bash' }) + fx.claudeCall(id, T0 + 17000, 'child-2', { agentId: 'agentone' }));
    fs.writeFileSync(childFile.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'synthetic-worker', toolUseId: 'call-13', description: 'PRIVATE_TASK', prompt: 'PRIVATE_PROMPT' }));
    fs.utimesSync(mainFile, new Date(T0 + 62000), new Date(T0 + 62000));

    const codexId = fx.uuid(2);
    const childId = fx.uuid(3);
    const item = (at, payload, type = 'response_item') => fx.line({ type, timestamp: fx.stamp(at), payload });
    const codex = fx.line({ type: 'session_meta', timestamp: fx.stamp(T0), payload: { id: codexId, cwd: '/home/PRIVATE_PATH/dev/storefront', instructions: 'PRIVATE_PROMPT', git: { repository_url: 'https://PRIVATE_SECRET@example.org/PRIVATE_URL.git' } } })
      + item(T0 + 1, { type: 'user_message', message: 'PRIVATE_PROMPT', images: ['PRIVATE_SECRET'] }, 'event_msg')
      + item(T0 + 2, { type: 'task_started', turn_id: 'turn-1', model_context_window: 1000 }, 'event_msg')
      + item(T0 + 3, { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'PRIVATE_PROMPT' }] })
      + item(T0 + 4, { type: 'reasoning', summary: [{ type: 'summary_text', text: 'PRIVATE_REASONING' }], encrypted_content: 'PRIVATE_SECRET' })
      + item(T0 + 5, { type: 'agent_reasoning', text: 'PRIVATE_REASONING' }, 'event_msg')
      + item(T0 + 1000, { type: 'function_call', call_id: 'cx-1', name: 'exec_command', arguments: JSON.stringify({ cmd: 'git push https://PRIVATE_SECRET@example.org/PRIVATE_URL PRIVATE_COMMAND', workdir: '/home/PRIVATE_PATH/dev' }) })
      + item(T0 + 1500, { type: 'function_call_output', call_id: 'cx-1', output: 'Process exited with code 1\nPRIVATE_OUTPUT' })
      + item(T0 + 2000, { type: 'custom_tool_call', call_id: 'cx-2', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: /home/PRIVATE_PATH/dev/storefront/src/cart.js\n@@\n-PRIVATE_CODE\n+PRIVATE_CODE\n*** End Patch' })
      + item(T0 + 2500, { type: 'custom_tool_call_output', call_id: 'cx-2', output: 'PRIVATE_OUTPUT' })
      + item(T0 + 3000, { type: 'custom_tool_call', call_id: 'cx-3', name: 'exec', input: 'const key = "PRIVATE_SECRET"; await tools.apply_patch("PRIVATE_CODE"); await tools.update_plan({ plan: [{ step: "PRIVATE_TASK" }] });' })
      + item(T0 + 3500, { type: 'function_call', call_id: 'cx-4', name: 'update_plan', arguments: JSON.stringify({ explanation: 'PRIVATE_REASONING', plan: [{ step: 'Synthetic plan step', status: 'in_progress' }] }) })
      + item(T0 + 3600, { type: 'function_call_output', call_id: 'cx-4', output: 'Plan updated' })
      + item(T0 + 4000, { type: 'function_call', call_id: 'cx-5', name: 'spawn_agent', arguments: JSON.stringify({ message: 'PRIVATE_PROMPT', task_name: 'PRIVATE_TASK' }) })
      + item(T0 + 4100, { type: 'function_call_output', call_id: 'cx-5', output: JSON.stringify({ task_name: 'PRIVATE_TASK' }) })
      + item(T0 + 5000, { type: 'token_count', info: { last_token_usage: { total_tokens: 400 }, model_context_window: 1000 } }, 'event_msg')
      + item(T0 + 6000, { type: 'agent_message', message: 'PRIVATE_REASONING' }, 'event_msg')
      + item(T0 + 7000, { type: 'task_complete', turn_id: 'turn-1', last_agent_message: 'PRIVATE_OUTPUT' }, 'event_msg');
    const codexFile = fx.write(fx.codexFile(codexRoot, codexId), codex);
    fx.write(fx.codexFile(codexRoot, childId), fx.line({ type: 'session_meta', timestamp: fx.stamp(T0 + 4200), payload: { id: childId, cwd: '/home/PRIVATE_PATH/dev/storefront', instructions: 'PRIVATE_PROMPT',
      source: { subagent: { thread_spawn: { parent_thread_id: codexId, depth: 1, agent_nickname: 'Synthetic helper', agent_path: '/PRIVATE_PATH/agents/helper' } } } } })
      + item(T0 + 4300, { type: 'user_message', message: 'PRIVATE_PROMPT' }, 'event_msg') + fx.codexCall(T0 + 4400, 'cx-child-1'));
    fs.utimesSync(codexFile, new Date(T0 + 30000), new Date(T0 + 30000));
    fx.write(path.join(codexRoot, 'session_index.jsonl'), fx.line({ id: codexId, thread_name: 'Synthetic cart work', updated_at: fx.stamp(T0), first_prompt: 'PRIVATE_PROMPT' }));

    const host = fx.realHost({ claudeRoot, codexRoot });
    host.open();
    host.send(READY);
    await until(() => host.messages.length > 0, 'the first message');
    host.send({ type: 'select', id: host.messages[0].sessions.find(session => session.sessionId === id).id });
    await until(() => host.messages.at(-1).snapshot?.id === id && host.messages.at(-1).snapshot.family.lanes.length === 2 && !host.messages.at(-1).snapshot.loading, 'the Claude family');
    const claudeMessage = host.messages.at(-1);
    host.send({ type: 'select', id: claudeMessage.sessions.find(session => session.provider === 'codex' && !session.child).id });
    await until(() => host.messages.at(-1).snapshot?.provider === 'codex' && host.messages.at(-1).snapshot.family.lanes.length === 2 && !host.messages.at(-1).snapshot.loading, 'the Codex family');
    const codexMessage = host.messages.at(-1);
    // A filter for a name that matches nothing, and a deleted followed session, are messages too.
    host.send({ type: 'query', seq: 2, workspaceKey: '', name: 'PRIVATE_PROMPT', id: 'PRIVATE_SECRET' });
    await until(() => host.messages.at(-1).lookup.seq === 2, 'the filtered answer');
    fs.rmSync(codexFile);
    await host.pass();
    host.send({ type: 'refresh' });
    await until(() => host.messages.at(-1).lookup.missing === true, 'the missing notice');

    // The probe did see the data: both families, every station, a list, a footprint and both lanes arrived.
    assert.deepEqual([claudeMessage.selected.name, claudeMessage.snapshot.events.filter(event => event.outcome !== 'success' || true).length >= 14, claudeMessage.snapshot.progress.items.length, claudeMessage.snapshot.footprint.total >= 3,
      claudeMessage.snapshot.family.lanes[1].label, claudeMessage.snapshot.family.lanes[1].end.state, codexMessage.selected.name, codexMessage.snapshot.context, codexMessage.snapshot.progress.items[0].label, codexMessage.snapshot.footprint.total],
      ['Synthetic checkout work', true, 2, true, 'synthetic-worker', 'completed', 'Synthetic cart work', 40, 'Synthetic plan step', 1]);
    assert.deepEqual([...new Set(claudeMessage.snapshot.events.map(event => event.kind))].sort(), ['agents', 'complete', 'edits', 'files', 'memory', 'network', 'other', 'prompt', 'shell']);

    const sent = JSON.stringify(host.messages);
    for (const word of fx.SENTINELS) assert.ok(!sent.includes(word), `${word} is not in any host message`);
    // No absolute path in any form: drive, UNC, home, the temporary source folder, a transcript or link file name.
    assert.doesNotMatch(sent, /[A-Za-z]:[\\/]|\\\\\\\\|\/home\/|\/Users\/|\.jsonl|\.meta\.json|session_index|clients|AppData|agentviz-privacy/);
    assert.ok(!sent.includes(path.basename(root)) && !sent.toLowerCase().includes(root.toLowerCase().replace(/\\/g, '\\\\')));
    host.messages.forEach(checkShape);
    const longest = strings(host.messages).reduce((longest, text) => text.length > longest.length ? text : longest, '');
    assert.ok(longest.length <= 200, `no long free text is sent (longest: ${longest.length} characters)`);
    // What is allowed through, exactly: tool-derived labels of at most two path segments, a host name, an executable name.
    const labels = [...new Set([claudeMessage, codexMessage].flatMap(message => [...message.snapshot.events, ...message.snapshot.family.lanes.flatMap(lane => lane.events || [])].map(event => event.label)))].sort();
    assert.deepEqual(labels, ['Editing deploy/settings.env', 'Editing files', 'Editing src/cart.js', 'Editing src/checkout.js', 'Fetching example.org', 'Reading src/checkout.js', 'Reading src/file-0.js', 'Reading storefront/src', 'Running a command',
      'Running curl', 'Running deploy', 'Running git', 'Running tools', 'Searching files', 'Searching the web', 'Task received', 'Turn complete', 'Updating plan', 'User prompt', 'Working with agents', 'lookup'], 'no label outside the known set');
    assert.deepEqual(host.errors, []);

    // The page built from those messages holds nothing more, and nothing the content policy would block.
    for (const message of [claudeMessage, codexMessage]) {
      const html = view.render(message.snapshot, { now: T0 + 120000, identity: message.selected, warnings: message.warnings });
      for (const word of fx.SENTINELS) assert.ok(!html.includes(word), `${word} is not on the page`);
      assert.doesNotMatch(html, /<script|<iframe|<img|<link|\sstyle=|\son[a-z]+=|javascript:|https?:\/\//i);
    }
    host.panel().dispose();
  } finally { fx.remove(root); }
});

test('the webview policy and the packaged resource roots allow only the extension\'s own media files', () => {
  const host = fx.realHost({ claudeRoot: 'unused', codexRoot: 'unused' });
  host.open();
  // Scripts on; one resource root, the media folder; no context kept alive while hidden.
  assert.deepEqual(JSON.parse(JSON.stringify(host.created[0])), { enableScripts: true, localResourceRoots: ['extension:/media'] });
  const html = host.panel().html;
  const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1];
  const nonce = policy.match(/'nonce-([A-Za-z0-9+/=]{20,})'/)[1];
  assert.deepEqual(policy.split(';').map(part => part.trim()).filter(Boolean),
    ["default-src 'none'", 'style-src vscode-resource:', `script-src 'nonce-${nonce}'`, "connect-src 'none'", "base-uri 'none'", "form-action 'none'"]);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*|https?:|data:|blob:/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([^<]*)<\/script>/g)];
  assert.deepEqual(scripts.map(([, attributes, inline]) => [attributes.includes(`nonce="${nonce}"`), inline]), [[true, ''], [true, '']], 'two external scripts, both with the nonce, no inline code');
  assert.deepEqual([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]), ['vscode-resource:/extension:/media/style.css', 'vscode-resource:/extension:/media/view.js', 'vscode-resource:/extension:/media/app.js']);
  assert.doesNotMatch(html, /\sstyle=|\son[a-z]+=|<style|javascript:|https?:\/\//i);
  host.panel().dispose();

  // The shipped view code makes no request, evaluates no text as code and writes no inline style or handler.
  const media = path.join(__dirname, '..', 'media');
  assert.deepEqual(fs.readdirSync(media).sort(), ['app.js', 'style.css', 'view.js']);
  for (const name of ['app.js', 'view.js']) {
    const code = fs.readFileSync(path.join(media, name), 'utf8');
    assert.doesNotMatch(code, /\beval\s*\(|new Function|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|\bimport\s*\(|document\.write|localStorage|sessionStorage|indexedDB|document\.cookie/, name);
    assert.doesNotMatch(code, /https?:\/\/|\sstyle=|\.style\.|\son[a-z]+=|setAttribute\(\s*['"](?:style|on)/i, name);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(media, 'style.css'), 'utf8'), /url\s*\(|@import|https?:|expression\s*\(/i);
  // The example session drawn by the real view is as clean as live data.
  assert.doesNotMatch(view.render(view.demoSession(T0), { now: T0, example: true, identity: view.demoIdentity, warnings: [] }), /<script|\sstyle=|\son[a-z]+=|javascript:|https?:\/\//i);

  // The host reads only node builtins and its own files; the package ships no runtime dependency and no test data.
  const source = path.join(__dirname, '..', 'src');
  const required = fs.readdirSync(source).flatMap(name => [...fs.readFileSync(path.join(source, name), 'utf8').matchAll(/require\('([^']+)'\)/g)].map(match => match[1]));
  assert.deepEqual([...new Set(required)].filter(name => !name.startsWith('node:') && !name.startsWith('./')), ['vscode']);
  for (const name of fs.readdirSync(source)) assert.doesNotMatch(fs.readFileSync(path.join(source, name), 'utf8'), /child_process|node:(?:http|https|net|dgram|tls|worker_threads)|\bfetch\s*\(|writeFile|appendFile|createWriteStream|\.rm\(|unlink|rename\(|mkdir/, `${name} only reads`);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.deepEqual([manifest.dependencies, manifest.main, manifest.extensionKind, manifest.capabilities.untrustedWorkspaces.supported], [undefined, './src/extension.js', ['ui'], false]);
  const ignored = fs.readFileSync(path.join(__dirname, '..', '.vscodeignore'), 'utf8').split(/\r?\n/).filter(Boolean);
  for (const rule of ['test/**', 'docs/**', 'artifacts/**', 'workflows/**', 'node_modules/**', '.agentboard/**', '.git/**', 'ORCHESTRATION.md', 'HANDOFF.md']) assert.ok(ignored.includes(rule), `${rule} stays out of the package`);
});

test('every cap that shapes the view is stated in the view when it is reached', async () => {
  const root = fx.tempRoot('caps');
  try {
    const id = fx.uuid(1);
    const cwd = 'C:\\Work\\Example';
    // A main transcript over the 8 MB pass budget and the retained-event cap; one child over the lane-event cap;
    // more children than lanes; more sessions than the returned list.
    const main = fx.claudeFile(root, 'p', id);
    let text = fx.claudeHead(id, T0, cwd);
    const calls = MAX_EVENTS + 600;
    for (let call = 0; call < calls; call++) text += fx.claudeCall(id, T0 + call * 100, `m${call}`, { filler: 520 });
    fx.write(main, text);
    assert.ok(fs.statSync(main).size > 8 * 1024 * 1024);
    const children = FAMILY_LIMIT + 2;
    for (let child = 0; child < children; child++) {
      const agent = `agent${String(child).padStart(2, '0')}`;
      let childText = fx.claudeHead(id, T0 + 100, cwd, agent);
      for (let call = 0; call < (child === children - 1 ? LANE_EVENTS + 100 : 2); call++) childText += fx.claudeCall(id, T0 + 200 + call * 100, `k${child}-${call}`, { agentId: agent });
      const file = fx.write(fx.claudeChildFile(root, 'p', id, agent), childText);
      fs.utimesSync(file, new Date(T0 + child * 1000), new Date(T0 + child * 1000));
    }
    for (let other = 0; other < SESSION_LIMIT; other++) fx.write(fx.claudeFile(root, 'p', fx.uuid(100 + other)), fx.claudeHead(fx.uuid(100 + other), T0, cwd));
    const roots = { claudeRoot: root, codexRoot: path.join(root, 'none') };
    const found = await discoverSessions(roots, {});
    assert.deepEqual([found.total, found.sessions.length, found.limit], [1 + children + SESSION_LIMIT, SESSION_LIMIT, SESSION_LIMIT]);
    assert.ok(found.warnings.some(warning => warning === `Showing the ${SESSION_LIMIT} most recently written sessions of ${found.total}.`));

    const reader = new FamilyReader('claude', id);
    const first = await reader.read(main, { files: found.all });
    assert.equal(first.loading, true);
    assert.ok(first.bytesRead <= 8 * 1024 * 1024 && first.bytesRead < first.fileBytes);
    assert.match(pageText(view.render(first, { now: T0 + 2000000, identity, warnings: [] })), /Loading history/);
    let state = first;
    let passes = 1;
    while (state.loading) { state = await reader.read(main, { files: found.all }); passes++; }
    assert.ok(passes >= 2 && passes <= 4, `read over ${passes} passes`);
    assert.deepEqual([state.events.length, state.droppedEvents > 600, state.family.lanes.length - 1, state.family.found], [MAX_EVENTS, true, FAMILY_LIMIT, children]);
    const page = pageText(view.render(state, { now: T0 + 2000000, identity, warnings: found.warnings }));
    assert.match(page, new RegExp(`Showing the latest ${MAX_EVENTS} events; ${state.droppedEvents} earlier events omitted\\.`));
    assert.match(page, new RegExp(`Following the ${FAMILY_LIMIT} most recently written of ${children} subagent transcripts\\. Totals cover the lanes shown\\.`));
    assert.match(page, new RegExp(`101 earlier subagent events omitted; each lane keeps its latest ${LANE_EVENTS}\\.`));
    assert.match(page, new RegExp(`Showing the ${SESSION_LIMIT} most recently written sessions of ${found.total}\\.`));
    assert.match(page, /MAIN \+ 24 SUBAGENT LANES/);

    // Cost of a pass with nothing new: no byte is read again; an append reads exactly the appended bytes.
    const offsets = () => [reader.main.offset, ...[...reader.children.values()].map(child => child.reader.offset)].reduce((sum, value) => sum + value, 0);
    const before = offsets();
    await reader.read(main, { files: found.all });
    assert.equal(offsets(), before);
    const more = fx.claudeCall(id, T0 + 3000000, 'appended');
    fs.appendFileSync(main, more);
    state = await reader.read(main, { files: found.all });
    assert.deepEqual([offsets() - before, state.events.at(-1).id], [Buffer.byteLength(more), 'appended']);
  } finally { fx.remove(root); }
});
