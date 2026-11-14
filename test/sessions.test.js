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

// Workspace scope (Robert, 2026-11-14): only sessions recorded in an open folder or below it are listed, counted
// and grouped; Windows paths match without case or separator differences; a sibling folder with the same prefix
// does not count; the followed session (keep) stays listed wherever it is.
test('a scope keeps only sessions in the workspace folders and their subfolders, worktrees included', async (t) => {
  const { claudeRoot, codexRoot, claudeDir, codexDir } = await roots(t);
  const ids = ['a', 'b', 'c'].map(letter => `019a0000-bbbb-7bbb-8ccc-00000000000${letter}`);
  await fs.writeFile(path.join(claudeDir, 'root.jsonl'), prompt('C:\\Work\\Alpha'));
  await fs.writeFile(path.join(claudeDir, 'worktree.jsonl'), prompt('C:\\Work\\Alpha\\.agentboard\\wt\\1a2b3c'));
  await fs.writeFile(rollout(codexDir, ids[0]), codexMeta('c:/work/ALPHA/src/', ids[0]));
  await fs.writeFile(path.join(claudeDir, 'sibling.jsonl'), prompt('C:\\Work\\AlphaBeta'));
  await fs.writeFile(rollout(codexDir, ids[1]), codexMeta('D:\\Elsewhere', ids[1]));
  await fs.writeFile(rollout(codexDir, ids[2]), codexMeta('/home/dev/alpha', ids[2]));
  const scoped = await discoverSessions({ claudeRoot, codexRoot }, { scope: ['C:\\Work\\Alpha\\'], keep: [] });
  assert.deepEqual(scoped.sessions.map(session => session.sessionId).sort(), [ids[0], 'root', 'worktree'].sort());
  assert.equal(scoped.total, 3);
  assert.equal(scoped.outside, 3);
  assert.equal(scoped.workspaces.reduce((sum, group) => sum + group.count, 0), 3);
  assert.equal(scoped.all.length, 3);
  const followed = (await discoverSessions({ claudeRoot, codexRoot })).sessions.find(session => session.sessionId === ids[1]);
  const keeping = await discoverSessions({ claudeRoot, codexRoot }, { scope: ['C:\\Work\\Alpha'], keep: [followed.id] });
  assert.deepEqual(keeping.kept.map(session => session.sessionId), [ids[1]]);
  assert.equal(keeping.sessions.some(session => session.sessionId === ids[1]), false);
  const unscoped = await discoverSessions({ claudeRoot, codexRoot });
  assert.equal(unscoped.total, 6);
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

// S03: discovery answers a query over the whole source. Fixtures are synthetic.
const { workspaceIdentity } = require('../src/transcript');
const keyOf = cwd => workspaceIdentity(cwd).key;
async function transcript(dir, id, cwd, seconds, extra = '') {
  const file = path.join(dir, `${id}.jsonl`);
  await fs.writeFile(file, prompt(cwd) + extra);
  await fs.utimes(file, seconds, seconds);
  return file;
}
const BUSY = 'C:\\work\\Busy';
const QUIET = 'D:\\archive\\Quiet';
const TWIN = 'E:\\elsewhere\\Quiet';
const OLD_ID = '0a0a0a0a-1111-4222-8333-44445555aaaa';
const OLD_CODEX = '019a0000-aaaa-7bbb-8ccc-00000000c0de';
// 85 recent sessions in one project, then five older ones in two directories that share a basename.
async function crowded(t) {
  const made = await roots(t);
  for (let index = 0; index < 85; index++) await transcript(made.claudeDir, `busy-${String(index).padStart(3, '0')}`, BUSY, 5000 + index, aiTitle(`Busy work ${index}`));
  await transcript(made.claudeDir, OLD_ID, QUIET, 300, customTitle('Old launch plan') + record('one'));
  await transcript(made.claudeDir, 'quiet-two', QUIET, 200);
  await transcript(made.claudeDir, 'quiet-three', QUIET, 100, aiTitle('Something else'));
  await transcript(made.claudeDir, 'twin-one', TWIN, 60, customTitle('Twin directory'));
  await fs.writeFile(rollout(made.codexDir, OLD_CODEX), codexMeta(QUIET, OLD_CODEX));
  await fs.utimes(rollout(made.codexDir, OLD_CODEX), 50, 50);
  await fs.writeFile(made.index, line({ id: OLD_CODEX, thread_name: 'Old launch notes', updated_at: '2026-11-11T18:00:00Z' }));
  return made;
}

// SPEC: S03, project groups and filters are applied before the response cap.
test('a project older than 80 newer sessions is listed and its sessions are returned before the cap', async (t) => {
  const { claudeRoot, codexRoot } = await crowded(t);
  const everything = await discoverSessions({ claudeRoot, codexRoot });
  assert.deepEqual([everything.sessions.length, everything.matched, everything.total, everything.limit], [80, 90, 90, 80]);
  assert.ok(everything.sessions.every(session => session.workspaceKey === keyOf(BUSY)), 'the recent list alone holds no older project');
  assert.match(everything.warnings.join(' '), /Showing the 80 most recently written sessions of 90\./);
  // The groups cover all 90 sessions, including two directories with the same basename under distinct labels.
  const groups = Object.fromEntries(everything.workspaces.map(group => [group.key, group]));
  assert.deepEqual([groups[keyOf(BUSY)].count, groups[keyOf(QUIET)].count, groups[keyOf(TWIN)].count, everything.workspaces.length], [85, 4, 1, 3]);
  assert.equal(groups[keyOf(BUSY)].label, 'Busy');
  assert.notEqual(groups[keyOf(QUIET)].label.toLowerCase(), groups[keyOf(TWIN)].label.toLowerCase());
  for (const group of everything.workspaces) assert.doesNotMatch(group.label, /^[a-z]:|\\/i);

  const quiet = await discoverSessions({ claudeRoot, codexRoot }, { query: { workspaceKey: keyOf(QUIET) } });
  assert.deepEqual(quiet.sessions.map(session => session.sessionId), [OLD_ID, 'quiet-two', 'quiet-three', OLD_CODEX]);
  assert.deepEqual([quiet.matched, quiet.total], [4, 90]);
  assert.deepEqual(quiet.sessions.map(session => [session.name, session.nameSource]), [['Old launch plan', 'custom'], ['Unnamed session', 'none'], ['Something else', 'generated'], ['Old launch notes', 'index']]);
  assert.ok(quiet.sessions.every(session => session.workspaceLabel === groups[keyOf(QUIET)].label));
  assert.deepEqual(quiet.workspaces, everything.workspaces, 'the project list does not depend on the filters');
  assert.deepEqual(quiet.warnings, []);

  // A cap smaller than the matches cuts the matches, never the unfiltered recent list.
  const capped = await discoverSessions({ claudeRoot, codexRoot }, { limit: 2, query: { workspaceKey: keyOf(QUIET) } });
  assert.deepEqual([capped.sessions.map(session => session.sessionId), capped.matched], [[OLD_ID, 'quiet-two'], 4]);
  assert.match(capped.warnings.join(' '), /Showing the 2 most recently written sessions of 4 that match\./);
  const twin = await discoverSessions({ claudeRoot, codexRoot }, { query: { workspaceKey: keyOf(TWIN) } });
  assert.deepEqual(twin.sessions.map(session => session.sessionId), ['twin-one']);
  assert.doesNotMatch(JSON.stringify([everything.sessions.map(publicFields), everything.workspaces, quiet.sessions.map(publicFields)]), /PRIVATE_|[a-z]:\\\\|[a-z]:\//i, 'no drive or root reaches a label or a public field');
});

// SPEC: S03, a full ID or a saved name outside the recent list is found; filters intersect; no matches is explicit.
test('full IDs, partial IDs and names outside the recent list are found, and filters intersect', async (t) => {
  const { claudeRoot, codexRoot } = await crowded(t);
  const find = async query => { const result = await discoverSessions({ claudeRoot, codexRoot }, { query }); return [result.sessions.map(session => session.sessionId), result.matched, result.total]; };
  assert.deepEqual(await find({ id: `  ${OLD_ID.toUpperCase()} ` }), [[OLD_ID], 1, 90]);
  assert.deepEqual(await find({ id: '8333-44445555AAAA' }), [[OLD_ID], 1, 90], 'a fragment past the first eight characters');
  assert.deepEqual(await find({ id: OLD_CODEX }), [[OLD_CODEX], 1, 90]);
  assert.deepEqual(await find({ name: ' OLD LAUNCH ' }), [[OLD_ID, OLD_CODEX], 2, 90], 'saved names of both providers, read before the cap');
  assert.deepEqual(await find({ name: 'old launch', workspaceKey: keyOf(QUIET), id: 'c0de' }), [[OLD_CODEX], 1, 90]);
  assert.deepEqual(await find({ name: 'old launch', workspaceKey: keyOf(BUSY) }), [[], 0, 90]);
  assert.deepEqual(await find({ name: 'busy work' }), [Array.from({ length: 80 }, (_, index) => `busy-${String(84 - index).padStart(3, '0')}`), 85, 90]);

  const none = await discoverSessions({ claudeRoot, codexRoot }, { query: { name: 'no session is called this' } });
  assert.deepEqual([none.sessions, none.matched, none.total, none.pending], [[], 0, 90, { workspaces: 0, names: 0 }]);
  assert.equal(none.workspaces.length, 3, 'no matches still reports every project');
  assert.deepEqual(none.warnings, []);
  const absent = await discoverSessions({ claudeRoot, codexRoot }, { query: { workspaceKey: `ws:${'0'.repeat(20)}` } });
  assert.deepEqual([absent.sessions, absent.matched], [[], 0]);
});

// SPEC: S03, a followed session keeps its identity through a rename and disappears cleanly when deleted.
test('a rename moves a session between name matches without changing its ID, and a deletion removes it', async (t) => {
  const { claudeRoot, codexRoot, claudeDir } = await crowded(t);
  const file = path.join(claudeDir, `${OLD_ID}.jsonl`);
  const look = (query, keep = []) => discoverSessions({ claudeRoot, codexRoot }, { query, keep });
  const before = (await look({ name: 'old launch plan' })).sessions[0];
  // The followed session is reported in `kept` whatever the filters say, and is not padded into the answer.
  let result = await look({ name: 'busy' }, [before.id]);
  assert.deepEqual([result.kept.map(session => [session.id, session.name]), result.sessions.some(session => session.id === before.id)], [[[before.id, 'Old launch plan']], false]);

  await fs.appendFile(file, customTitle('Shipped at last'));
  await fs.utimes(file, 301, 301);
  assert.equal((await look({ name: 'old launch plan' })).matched, 0);
  const after = (await look({ name: 'shipped' })).sessions[0];
  assert.deepEqual([after.id, after.sessionId, after.workspaceKey, after.name], [before.id, before.sessionId, before.workspaceKey, 'Shipped at last']);
  assert.equal((await look({ name: 'busy' }, [before.id])).kept[0].name, 'Shipped at last');

  await fs.unlink(file);
  result = await look({ workspaceKey: keyOf(QUIET) }, [before.id]);
  assert.deepEqual([result.kept, result.total, result.matched], [[], 89, 3]);
  assert.ok(!result.all.some(session => session.id === before.id));
  assert.equal(result.workspaces.find(group => group.key === keyOf(QUIET)).count, 3);
  await fs.unlink(path.join(claudeDir, 'twin-one.jsonl'));
  assert.deepEqual((await look({})).workspaces.map(group => group.key).sort(), [keyOf(BUSY), keyOf(QUIET)].sort(), 'an emptied project leaves the list');
});

// SPEC: S03, metadata is remembered where reads were measured to repeat; transcripts are not reread per refresh.
test('an unchanged transcript is not opened again, and names are read once and only when needed', async (t) => {
  const { claudeRoot, codexRoot, claudeDir } = await roots(t);
  const files = [];
  for (let index = 0; index < 30; index++) files.push(await transcript(claudeDir, `cost-${String(index).padStart(2, '0')}`, BUSY, 1000 + index, longRecord('filler') + customTitle(`Costly ${index}`)));
  const run = options => discoverSessions({ claudeRoot, codexRoot }, { limit: 5, ...options });
  const first = await run({});
  // 30 project reads, plus saved names for the five returned sessions only.
  assert.deepEqual([first.cost.files, first.cost.opened, first.cost.walked], [30, 35, true]);
  assert.deepEqual(first.sessions.map(session => session.name), [29, 28, 27, 26, 25].map(index => `Costly ${index}`));
  const repeat = await run({});
  assert.deepEqual([repeat.cost.opened, repeat.cost.bytesRead], [0, 0], 'an ordinary refresh opens no unchanged transcript');
  assert.deepEqual(repeat.sessions.map(publicFields), first.sessions.map(publicFields));

  // New activity on one returned session: only that transcript is opened, and only the new bytes are read.
  const appended = record('new-activity') + customTitle('Costly renamed');
  await fs.appendFile(files[29], appended);
  const grown = await run({});
  assert.deepEqual([grown.cost.opened, grown.cost.bytesRead, grown.sessions[0].name], [1, Buffer.byteLength(appended), 'Costly renamed']);

  // A name search reads the remaining 25 transcripts once; asking again reads nothing.
  const search = await run({ query: { name: 'costly 1' } });
  assert.deepEqual([search.cost.opened, search.matched, search.pending.names], [25, 11, 0]);
  const again = await run({ query: { name: 'costly 1' } });
  assert.deepEqual([again.cost.opened, again.cost.bytesRead, again.matched], [0, 0, 11]);

  // A reused listing answers a new query without walking; a file created since then appears only after a fresh walk.
  await transcript(claudeDir, 'cost-late', BUSY, 9000);
  const reused = await run({ query: { id: 'cost-' }, walk: again.walk });
  assert.deepEqual([reused.cost.walked, reused.total, reused.cost.opened], [false, 30, 0]);
  assert.equal((await run({ query: { id: 'cost-' } })).total, 31);

  // A listing that is older than the followed transcript's latest bytes must not cause a full reread.
  const stale = (await run({})).walk;
  const more = customTitle('Followed and growing');
  await fs.appendFile(files[0], more);
  const keep = [first.all.find(session => session.sessionId === 'cost-00').id];
  const followed = await run({ keep });
  assert.deepEqual([followed.kept[0].name, followed.cost.bytesRead], ['Followed and growing', Buffer.byteLength(more)]);
  const behind = await run({ keep, walk: stale });
  assert.deepEqual([behind.kept[0].name, behind.cost.bytesRead], ['Followed and growing', 0]);
});

// SPEC: S03, an incomplete lookup is reported, continues on later calls and never restarts.
test('unread projects and names are counted as pending and are completed over later calls', async (t) => {
  const { claudeRoot, codexRoot, claudeDir } = await roots(t);
  let bytes = 0;
  for (let index = 0; index < 10; index++) bytes += (await fs.stat(await transcript(claudeDir, `slow-${index}`, index % 2 ? BUSY : QUIET, 1000 + index, longRecord('filler').repeat(3) + customTitle(`Needle ${index}`)))).size;
  const pass = options => discoverSessions({ claudeRoot, codexRoot }, { limit: 2, headBudget: 3, ...options });
  const seen = [];
  let result;
  do {
    result = await pass({});
    seen.push([result.pending.workspaces, result.workspaces.reduce((sum, group) => sum + group.count, 0)]);
    if (result.pending.workspaces) assert.match(result.warnings.join(' '), new RegExp(`Projects are still being read for ${result.pending.workspaces} sessions`));
  } while (result.pending.workspaces && seen.length < 10);
  assert.deepEqual(seen, [[7, 3], [4, 6], [1, 9], [0, 10]]);
  assert.deepEqual(result.workspaces.map(group => group.count), [5, 5]);
  assert.equal(result.total, 10, 'the total never hides the unread sessions');

  // Names: a small read allowance per call. Matches grow, the pending count falls, and no byte is read twice.
  const matched = [];
  const passes = [];
  let read = 0;
  do {
    result = await pass({ query: { name: 'needle' }, titleBudget: 100 * 1024 });
    matched.push(result.matched);
    read += result.cost.bytesRead;
    assert.equal(result.matched + result.pending.names, 10);
    passes.push(result.cost.opened);
    if (result.pending.names) assert.match(result.warnings.join(' '), /Saved names are still being read in \d+ sessions/);
  } while (result.pending.names && matched.length < 20);
  assert.equal(matched.at(-1), 10);
  assert.ok(matched.length > 2 && matched.every((count, index) => index === 0 || count >= matched[index - 1]), String(matched));
  assert.ok(passes.every(opened => opened <= 4), `a call whose allowance is spent opens nothing more: ${passes}`);
  assert.ok(read <= bytes, `${read} bytes read for names in ${bytes} bytes of transcripts`);
  assert.deepEqual(result.warnings, ['Showing the 2 most recently written sessions of 10 that match.']);
});