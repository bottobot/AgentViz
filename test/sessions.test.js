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

// S01 fixtures are synthetic. Shapes follow the locally observed key sets only:
// Claude {type:'custom-title',customTitle,sessionId} and {type:'ai-title',aiTitle,sessionId};
// Codex session_index.jsonl lines {id,thread_name,updated_at}.
const CLAUDE_ID = '11111111-2222-4333-8444-555555555555';
const CODEX_ID = '019a0000-aaaa-7bbb-8ccc-0123456789ab';
const line = value => JSON.stringify(value) + '\n';
const prompt = cwd => line({ type: 'user', timestamp: '2026-11-11T18:00:00Z', cwd, sessionId: CLAUDE_ID, message: { content: 'PRIVATE_PROMPT sk-PRIVATE_SECRET' } });
const customTitle = text => line({ type: 'custom-title', customTitle: text, sessionId: CLAUDE_ID });
const aiTitle = text => line({ type: 'ai-title', aiTitle: text, sessionId: CLAUDE_ID });
const publicFields = session => { const { file, ...rest } = session; return rest; };

async function roots(t) {
  const folder = await temporary(t);
  const claudeRoot = path.join(folder, 'claude');
  const codexRoot = path.join(folder, 'codex');
  const claudeDir = path.join(claudeRoot, 'projects', 'encoded-project');
  const codexDir = path.join(codexRoot, 'sessions', '2026', '11', '11');
  await fs.mkdir(claudeDir, { recursive: true });
  await fs.mkdir(codexDir, { recursive: true });
  return { folder, claudeRoot, codexRoot, claudeDir, codexDir, index: path.join(codexRoot, 'session_index.jsonl') };
}
const rollout = (dir, id = CODEX_ID) => path.join(dir, `rollout-2026-11-11T10-00-00-${id}.jsonl`);
const codexMeta = (cwd, id = CODEX_ID) => line({ type: 'session_meta', timestamp: '2026-11-11T18:00:00Z', payload: { id, cwd, base_instructions: { text: 'PRIVATE_INSTRUCTIONS' } } });
async function listing(folder) {
  const out = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true, recursive: true })) {
    const file = path.join(entry.parentPath, entry.name);
    const stat = await fs.stat(file);
    out.push(`${path.relative(folder, file)}|${entry.isDirectory() ? 'dir' : `${stat.size}|${stat.mtimeMs}`}`);
  }
  return out.sort();
}

// SPEC: S01, custom titles take precedence over generated titles wherever they appear.
test('Claude names prefer the latest custom title over generated titles and report their source', async (t) => {
  const { claudeRoot, codexRoot, claudeDir } = await roots(t);
  await fs.writeFile(path.join(claudeDir, `${CLAUDE_ID}.jsonl`), aiTitle('Generated first') + prompt('C:\\work\\Example') + customTitle('Chosen by hand') + record('one') + aiTitle('Generated later'));
  await fs.writeFile(path.join(claudeDir, 'generated-only.jsonl'), prompt('C:\\work\\Example') + aiTitle('Generated first') + aiTitle('Generated latest'));
  await fs.writeFile(path.join(claudeDir, 'untitled.jsonl'), prompt('C:\\work\\Example') + record('one'));
  const { sessions } = await discoverSessions({ claudeRoot, codexRoot });
  const by = id => sessions.find(session => session.sessionId === id);
  assert.deepEqual([by(CLAUDE_ID).name, by(CLAUDE_ID).nameSource], ['Chosen by hand', 'custom']);
  assert.deepEqual([by('generated-only').name, by('generated-only').nameSource], ['Generated latest', 'generated']);
  assert.deepEqual([by('untitled').name, by('untitled').nameSource], ['Unnamed session', 'none']);
  assert.equal(by(CLAUDE_ID).sessionId.length, 36);
  assert.equal(by(CLAUDE_ID).project, 'Example');
  assert.doesNotMatch(JSON.stringify(sessions.map(publicFields)), /PRIVATE_|C:\\\\work/);
});

// SPEC: S01, a rename appended after the header is found and keeps the source identity stable.
test('a late Claude rename beyond the header preview replaces the name without changing identity', async (t) => {
  const { claudeRoot, codexRoot, claudeDir } = await roots(t);
  const file = path.join(claudeDir, `${CLAUDE_ID}.jsonl`);
  const quoted = line({ type: 'user', timestamp: '2026-11-11T18:00:00Z', message: { content: '{"type":"custom-title","customTitle":"PRIVATE_QUOTED_TITLE"}' } });
  const nested = line({ type: 'assistant', timestamp: '2026-11-11T18:00:00Z', message: { type: 'custom-title', customTitle: 'PRIVATE_NESTED_TITLE', content: [] } });
  const huge = line({ type: 'custom-title', customTitle: 'PRIVATE_HUGE_TITLE', sessionId: CLAUDE_ID, padding: 'x'.repeat(300 * 1024) });
  await fs.writeFile(file, prompt('C:\\work\\Example') + customTitle('Before rename') + longRecord('filler').repeat(12) + quoted + nested + huge);
  const before = (await discoverSessions({ claudeRoot, codexRoot })).sessions[0];
  assert.equal(before.name, 'Before rename');
  const split = Buffer.from(customTitle('After r\u00e9name'));
  const cut = split.indexOf(Buffer.from('\u00e9')) + 1;
  await fs.appendFile(file, split.subarray(0, cut));
  assert.equal((await discoverSessions({ claudeRoot, codexRoot })).sessions[0].name, 'Before rename');
  await fs.appendFile(file, split.subarray(cut));
  const after = (await discoverSessions({ claudeRoot, codexRoot })).sessions[0];
  assert.deepEqual([after.name, after.nameSource], ['After r\u00e9name', 'custom']);
  assert.deepEqual([after.id, after.sessionId, after.workspaceKey], [before.id, before.sessionId, before.workspaceKey]);
  await fs.writeFile(file, prompt('C:\\work\\Example') + aiTitle('Rewritten'));
  const rewritten = (await discoverSessions({ claudeRoot, codexRoot })).sessions[0];
  assert.deepEqual([rewritten.name, rewritten.nameSource, rewritten.id], ['Rewritten', 'generated', before.id]);
});

// SPEC: S01, Codex names come only from the verified local session_index.jsonl shape.
test('Codex names come from the latest matching session index line', async (t) => {
  const { claudeRoot, codexRoot, codexDir, index } = await roots(t);
  const other = '019a0000-aaaa-7bbb-8ccc-ffffffffffff';
  await fs.writeFile(rollout(codexDir), codexMeta('C:/work/Example') + line({ type: 'event_msg', timestamp: '2026-11-11T18:00:01Z', payload: { type: 'user_message', message: 'PRIVATE_PROMPT' } }));
  await fs.writeFile(rollout(codexDir, other), codexMeta('C:/work/Example', other));
  await fs.writeFile(index, line({ id: CODEX_ID, thread_name: 'First name', updated_at: '2026-11-11T18:00:00Z' })
    + line({ id: 'unrelated', thread_name: 'PRIVATE_OTHER_THREAD', updated_at: '2026-11-11T18:00:01Z' })
    + '{not JSON}\n' + line({ id: CODEX_ID, thread_name: 7 }) + line(['array'])
    + line({ id: CODEX_ID.toUpperCase(), thread_name: 'Renamed thread', updated_at: '2026-11-11T18:00:02Z' }));
  let { sessions, warnings } = await discoverSessions({ claudeRoot, codexRoot });
  const named = sessions.find(session => session.sessionId === CODEX_ID);
  const unnamed = sessions.find(session => session.sessionId === other);
  assert.deepEqual([named.name, named.nameSource, named.project], ['Renamed thread', 'index', 'Example']);
  assert.deepEqual([unnamed.name, unnamed.nameSource], ['Unnamed session', 'none']);
  assert.equal(named.workspaceKey, unnamed.workspaceKey);
  assert.deepEqual(warnings, []);
  assert.doesNotMatch(JSON.stringify(sessions.map(publicFields)), /PRIVATE_/);
  await fs.appendFile(index, line({ id: CODEX_ID, thread_name: 'Renamed again', updated_at: '2026-11-11T18:00:03Z' }));
  const again = (await discoverSessions({ claudeRoot, codexRoot })).sessions.find(session => session.sessionId === CODEX_ID);
  assert.deepEqual([again.name, again.id], ['Renamed again', named.id]);
});

// SPEC: S01, absent or unreadable title metadata yields the literal fallback, never prompt text.
test('missing and corrupt title metadata fall back to Unnamed session for both providers', async (t) => {
  const { claudeRoot, codexRoot, claudeDir, codexDir, index } = await roots(t);
  await fs.writeFile(path.join(claudeDir, 'corrupt.jsonl'), prompt('C:\\work\\Example')
    + '{"type":"custom-title","customTitle":"PRIVATE_TRUNCATED\n'
    + line({ type: 'custom-title', customTitle: { text: 'PRIVATE_OBJECT' } }) + line({ type: 'ai-title', aiTitle: 12 })
    + line({ type: 'custom-title', customTitle: ' \u0000\n ' }) + line({ type: 'custom-title', title: 'PRIVATE_WRONG_KEY' }));
  await fs.writeFile(path.join(claudeDir, 'no-cwd.jsonl'), customTitle('Has a name') + 'not json at all\n');
  await fs.writeFile(rollout(codexDir), codexMeta('C:/work/Example'));
  let { sessions, warnings } = await discoverSessions({ claudeRoot, codexRoot });
  assert.deepEqual(warnings, []);
  for (const id of ['corrupt', CODEX_ID]) {
    const session = sessions.find(item => item.sessionId === id);
    assert.deepEqual([session.name, session.nameSource], ['Unnamed session', 'none']);
  }
  const lost = sessions.find(item => item.sessionId === 'no-cwd');
  assert.deepEqual([lost.name, lost.project, lost.workspaceKey, lost.workspaceLabel], ['Has a name', '', 'ws:unknown', 'Unknown workspace']);
  await fs.writeFile(index, Buffer.from([0xff, 0xfe, 0x00, 0x7b, 0x0a, 0x7b, 0x22]));
  ({ sessions, warnings } = await discoverSessions({ claudeRoot, codexRoot }));
  assert.equal(sessions.find(item => item.sessionId === CODEX_ID).name, 'Unnamed session');
  await fs.rm(index);
  await fs.mkdir(index);
  ({ sessions, warnings } = await discoverSessions({ claudeRoot, codexRoot }));
  assert.equal(sessions.find(item => item.sessionId === CODEX_ID).name, 'Unnamed session');
  assert.match(warnings.join(' '), /Codex session names could not be read/);
  assert.doesNotMatch(JSON.stringify(sessions.map(publicFields)), /PRIVATE_/);
});

test('hostile title text is reduced to short control-free text for both providers', async (t) => {
  const { claudeRoot, codexRoot, claudeDir, codexDir, index } = await roots(t);
  const hostile = '<script>alert(1)</script>\u001b]0;x\u0007\r\n\u202E' + 'long '.repeat(100);
  await fs.writeFile(path.join(claudeDir, `${CLAUDE_ID}.jsonl`), prompt('C:\\work\\Example') + customTitle(hostile));
  await fs.writeFile(rollout(codexDir), codexMeta('C:/work/Example'));
  await fs.writeFile(index, line({ id: CODEX_ID, thread_name: hostile, updated_at: '2026-11-11T18:00:00Z' }));
  const { sessions } = await discoverSessions({ claudeRoot, codexRoot });
  assert.equal(sessions.length, 2);
  for (const session of sessions) {
    assert.ok(session.name.startsWith('<script>alert(1)</script>'));
    assert.ok([...session.name].length <= 80);
    assert.doesNotMatch(session.name, /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/);
  }
});

// SPEC: S01, different directories never collapse because their basenames match.
test('workspaces group by recorded directory, with distinct labels for duplicate basenames', async (t) => {
  const { claudeRoot, codexRoot, claudeDir, codexDir } = await roots(t);
  const ids = ['a', 'b', 'c', 'd', 'e'].map(letter => `019a0000-aaaa-7bbb-8ccc-00000000000${letter}`);
  await fs.writeFile(path.join(claudeDir, 'win-one.jsonl'), prompt('C:\\Work\\Alpha\\Example'));
  await fs.writeFile(rollout(codexDir, ids[0]), codexMeta('c:/work/ALPHA/example/', ids[0]));
  await fs.writeFile(path.join(claudeDir, 'win-two.jsonl'), prompt('D:\\Other\\Beta\\Example'));
  await fs.writeFile(rollout(codexDir, ids[1]), codexMeta('/home/dev/Example', ids[1]));
  await fs.writeFile(rollout(codexDir, ids[2]), codexMeta('/home/dev/example', ids[2]));
  await fs.writeFile(rollout(codexDir, ids[3]), codexMeta('C:\\Work\\Alpha\\Example', ids[3]));
  await fs.writeFile(rollout(codexDir, ids[4]), codexMeta('C:\\Solo\\Unique', ids[4]));
  await fs.writeFile(path.join(claudeDir, 'same-tail.jsonl'), prompt('E:\\Work\\Alpha\\Example'));
  const { sessions } = await discoverSessions({ claudeRoot, codexRoot });
  const by = id => sessions.find(session => session.sessionId === id);
  assert.equal(by('win-one').workspaceKey, by(ids[0]).workspaceKey);
  assert.equal(by('win-one').workspaceKey, by(ids[3]).workspaceKey);
  assert.equal(by('win-one').workspaceLabel, by(ids[0]).workspaceLabel);
  const distinct = ['win-one', 'win-two', ids[1], ids[2], ids[4], 'same-tail'].map(by);
  assert.equal(new Set(distinct.map(session => session.workspaceKey)).size, 6);
  assert.equal(new Set(distinct.map(session => session.workspaceLabel.toLowerCase())).size, 6);
  assert.equal(by(ids[4]).workspaceLabel, 'Unique');
  for (const session of sessions) {
    assert.match(session.workspaceKey, /^ws:[0-9a-f]{20}$/);
    assert.ok(session.workspaceLabel.length <= 80);
    assert.doesNotMatch(session.workspaceLabel, /^[a-z]:[\\/]|^\/home/i);
    assert.match(session.project, /^example$|^Unique$/i);
  }
  const again = (await discoverSessions({ claudeRoot, codexRoot })).sessions;
  assert.deepEqual(again.map(publicFields), sessions.map(publicFields));
});

// SPEC: S01, metadata lookup is read only.
test('discovery leaves provider folders byte-for-byte untouched and creates no files', async (t) => {
  const { folder, claudeRoot, codexRoot, claudeDir, codexDir, index } = await roots(t);
  await fs.writeFile(path.join(claudeDir, `${CLAUDE_ID}.jsonl`), prompt('C:\\work\\Example') + customTitle('Named'));
  await fs.writeFile(rollout(codexDir), codexMeta('C:/work/Example'));
  await fs.writeFile(index, line({ id: CODEX_ID, thread_name: 'Named', updated_at: '2026-11-11T18:00:00Z' }));
  await fs.writeFile(path.join(codexRoot, 'auth.json'), '{"token":"PRIVATE_SECRET"}');
  const before = await listing(folder);
  const result = await discoverSessions({ claudeRoot, codexRoot });
  await discoverSessions({ claudeRoot, codexRoot });
  assert.deepEqual(await listing(folder), before);
  assert.equal(result.sessions.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
});
