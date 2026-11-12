const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TranscriptReader, discoverSessions } = require('../src/sessions');

async function temporary(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'agentviz-test-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  return folder;
}
const record = (id) => JSON.stringify({ type: 'assistant', timestamp: '2026-11-11T18:00:00Z', message: { content: [
  { type: 'tool_use', id, name: 'Read', input: { file_path: 'C:/project/src/caf\u00e9.js' } }
] } }) + '\n';
const longRecord = id => record(id).trimEnd().replace('"file_path":', '"content":"' + 'same-content'.repeat(1000) + '","file_path":') + '\n';

// SPEC: first-slice acceptance 2, partial JSON and UTF8 wait for subsequent bytes.
test('incremental reads preserve split UTF8 and JSON, skip damaged complete lines and never recount', async (t) => {
  const file = path.join(await temporary(t), 'session.jsonl');
  const bytes = Buffer.from(record('one'));
  const split = bytes.indexOf(Buffer.from('\u00e9')) + 1;
  await fs.writeFile(file, bytes.subarray(0, split));
  const reader = new TranscriptReader('claude', 'session');
  assert.equal((await reader.read(file)).events.length, 0);
  await fs.appendFile(file, bytes.subarray(split));
  let state = await reader.read(file);
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].label, 'Reading src/caf\u00e9.js');
  assert.equal((await reader.read(file)).events.length, 1);
  await fs.appendFile(file, '{not JSON}\n' + record('two'));
  state = await reader.read(file);
  assert.equal(state.events.length, 2);
  assert.equal(state.invalidLines, 1);
});

test('truncation and replacement reset old calls; failed reads reject clearly', async (t) => {
  const folder = await temporary(t);
  const file = path.join(folder, 'session.jsonl');
  await fs.writeFile(file, record('one') + record('two'));
  const reader = new TranscriptReader('claude', 'session');
  assert.equal((await reader.read(file)).events.length, 2);
  await fs.writeFile(file, record('new'));
  assert.deepEqual((await reader.read(file)).events.map(e => e.id), ['new']);
  const replacement = path.join(folder, 'replacement.jsonl');
  await fs.writeFile(replacement, record('replacement'));
  await fs.rename(replacement, file);
  assert.deepEqual((await reader.read(file)).events.map(e => e.id), ['replacement']);
  await fs.unlink(file);
  await assert.rejects(reader.read(file), { code: 'ENOENT' });
});

test('a truncate and regrow between polls resets old history', async (t) => {
  const file = path.join(await temporary(t), 'session.jsonl');
  await fs.writeFile(file, record('old-1') + record('old-2'));
  const reader = new TranscriptReader('claude', 'session');
  await reader.read(file);
  await fs.writeFile(file, record('new-1') + record('new-2') + record('new-3'));
  assert.deepEqual((await reader.read(file)).events.map(event => event.id), ['new-1', 'new-2', 'new-3']);
});

test('rewrite detection checks the prefix when longer records have identical trailing content', async (t) => {
  const file = path.join(await temporary(t), 'session.jsonl');
  await fs.writeFile(file, longRecord('old-1') + longRecord('old-2'));
  const reader = new TranscriptReader('claude', 'session');
  await reader.read(file);
  await fs.writeFile(file, longRecord('new-1') + longRecord('new-2') + longRecord('new-3'));
  assert.deepEqual((await reader.read(file)).events.map(event => event.id), ['new-1', 'new-2', 'new-3']);
});

test('a short initial write grows the prefix sample as more bytes arrive', async (t) => {
  const file = path.join(await temporary(t), 'session.jsonl');
  const original = longRecord('old-1') + longRecord('old-2');
  await fs.writeFile(file, original.slice(0, 10));
  const reader = new TranscriptReader('claude', 'session');
  await reader.read(file);
  await fs.appendFile(file, original.slice(10));
  assert.equal((await reader.read(file)).events.length, 2);
  await fs.writeFile(file, longRecord('new-1') + longRecord('new-2') + longRecord('new-3'));
  assert.deepEqual((await reader.read(file)).events.map(event => event.id), ['new-1', 'new-2', 'new-3']);
});

test('a bad timestamp does not discard following records from the same chunk', async (t) => {
  const file = path.join(await temporary(t), 'session.jsonl');
  await fs.writeFile(file, JSON.stringify({ type: 'unknown', timestamp: { toString: 'bad' } }) + '\n' + record('valid'));
  const state = await new TranscriptReader('claude', 'session').read(file);
  assert.deepEqual(state.events.map(event => event.id), ['valid']);
  assert.equal(state.invalidLines, 1);
});

test('a line above the size limit is reported once and does not discard later calls', async (t) => {
  const file = path.join(await temporary(t), 'session.jsonl');
  await fs.writeFile(file, '{"large":"' + 'x'.repeat(4 * 1024 * 1024 + 100) + '"}\n' + record('after-large-line'));
  const state = await new TranscriptReader('claude', 'session').read(file);
  assert.equal(state.oversizedLines, 1);
  assert.equal(state.invalidLines, 0);
  assert.deepEqual(state.events.map(event => event.id), ['after-large-line']);
});

test('discovery finds both providers, sorts by writes, reports the list limit and tolerates missing roots', async (t) => {
  const folder = await temporary(t);
  const claudeRoot = path.join(folder, 'claude');
  const codexRoot = path.join(folder, 'codex');
  await fs.mkdir(path.join(claudeRoot, 'projects', 'project'), { recursive: true });
  await fs.mkdir(path.join(codexRoot, 'sessions', '2026', '11', '11'), { recursive: true });
  const first = path.join(claudeRoot, 'projects', 'project', 'one.jsonl');
  const second = path.join(codexRoot, 'sessions', '2026', '11', '11', 'rollout-two.jsonl');
  await fs.writeFile(first, record('one'));
  await fs.writeFile(second, JSON.stringify({ type: 'session_meta', payload: { id: 'two', cwd: 'C:/work/Example' } }) + '\n');
  await fs.utimes(first, 1000, 1000);
  await fs.utimes(second, 2000, 2000);
  const result = await discoverSessions({ claudeRoot, codexRoot }, 1);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].provider, 'codex');
  assert.equal(result.sessions[0].project, 'Example');
  assert.ok(!result.sessions[0].id.includes(folder));
  assert.equal(result.total, 2);
  assert.match(result.warnings.join(' '), /1.*2|2.*1/);
  const absent = await discoverSessions({ claudeRoot: path.join(folder, 'absent'), codexRoot: path.join(folder, 'absent-too') });
  assert.equal(absent.sessions.length, 0);
  assert.equal(absent.warnings.length, 2);
});
