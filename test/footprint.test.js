const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSession, applyRecord, fileIdentity, fileFootprint, MAX_EVENTS, FOOTPRINT_FILES } = require('../src/transcript');
const { render, summarize, footprintFacts, familyLanes, familyEvents, demoSession } = require('../media/view');

// S06: file activity footprint. Every record here is synthetic. PRIVATE_ strings stand for content that must
// never reach the view: full paths above the last two segments, file contents, patch bodies, code, commands
// and tool output.

let tick = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 12, 10, 0, tick++)).toISOString();
const ROOT = 'C:\\Users\\PRIVATE_USER\\PRIVATE_ORG\\example-app';
const claudeCall = (id, name, input, extra = {}) => ({ type: 'assistant', timestamp: stamp(), uuid: `a-${id}`, cwd: ROOT, ...extra, message: { content: [
  { type: 'text', text: 'PRIVATE_REPLY' }, { type: 'tool_use', id, name, input }] } });
const claudeResult = (id, part = {}) => ({ type: 'user', timestamp: stamp(), uuid: `u-${id}`, cwd: ROOT, toolUseResult: { filePath: `${ROOT}\\PRIVATE_RESULT`, content: 'PRIVATE_CONTENT' },
  message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'PRIVATE_OUTPUT', ...part }] } });
const codex = (payload, type = 'response_item') => ({ type, timestamp: stamp(), payload });
const apply = (state, ...records) => { for (const record of records) applyRecord(state, record); return state; };
let serial = 0;
function call(state, name, input, part) {
  const id = `call-${serial++}`;
  return apply(state, claudeCall(id, name, input), claudeResult(id, part));
}
const read = (state, file, part) => call(state, 'Read', { file_path: file, offset: 1 }, part);
const edit = (state, file, part) => call(state, 'Edit', { file_path: file, old_string: 'PRIVATE_OLD_CODE', new_string: 'PRIVATE_NEW_CODE' }, part);
const sent = state => JSON.parse(JSON.stringify(state));
const row = (footprint, label) => footprint.files.filter(file => file.label === label);
const area = html => html.slice(html.indexOf('<div class="footprint-block'), html.indexOf('<!-- /footprint -->'));

// The documented counting rule: every Files or Edits station call is either a call that named a file or one that did not.
function assertAgrees(state) {
  const footprint = state.footprint;
  const counts = summarize(state.events).counts;
  assert.equal(footprint.readCalls + footprint.unnamedReads, counts.files, 'Files station');
  assert.equal(footprint.editCalls + footprint.unnamedEdits, counts.edits, 'Edits station');
}

test('repeated reads and edits are counted per file, ranked, and marked after three recorded edits', () => {
  const state = createSession('claude', 'session');
  const hot = `${ROOT}\\src\\hot.js`;
  const warm = `${ROOT}\\src\\warm.js`;
  const cold = `${ROOT}\\docs\\cold.md`;
  read(state, hot); read(state, hot);
  edit(state, hot); edit(state, hot);
  assert.equal(row(state.footprint, 'src/hot.js')[0].edits, 2);
  edit(state, hot);
  call(state, 'Write', { file_path: warm, content: 'PRIVATE_FILE_BODY' });
  call(state, 'MultiEdit', { file_path: warm, edits: [{ old_string: 'PRIVATE_OLD_CODE', new_string: 'PRIVATE_NEW_CODE' }] });
  call(state, 'NotebookEdit', { notebook_path: `${ROOT}\\nb\\plot.ipynb`, new_source: 'PRIVATE_CELL' });
  read(state, cold); read(state, cold); read(state, cold); read(state, cold);

  const footprint = state.footprint;
  assert.deepEqual(footprint.files.map(file => [file.label, file.reads, file.edits]), [['src/hot.js', 2, 3], ['src/warm.js', 0, 2], ['nb/plot.ipynb', 0, 1], ['docs/cold.md', 4, 0]]);
  assert.deepEqual([footprint.total, footprint.readCalls, footprint.editCalls, footprint.unnamedReads, footprint.unnamedEdits], [4, 6, 6, 0, 0]);
  for (const file of footprint.files) {
    assert.deepEqual(Object.keys(file).sort(), ['edits', 'events', 'failed', 'key', 'label', 'reads', 'shared']);
    assert.match(file.key, /^f:[0-9a-f]{20}$/);
  }
  assertAgrees(state);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_/);

  const html = render(sent(state), { now: state.updatedAt });
  const block = area(html);
  assert.ok(block.length > 0);
  assert.match(block, /4 FILES · 6 READS · 6 EDITS/);
  // The marker is text, on the one file with three recorded edits.
  assert.equal(block.match(/class="file-hot"/g).length, 1);
  assert.match(block, /src\/hot\.js<\/span>[^]*?2 reads · 3 edits[^]*?EDITED 3\+ TIMES/);
  assert.ok(block.indexOf('src/hot.js') < block.indexOf('src/warm.js') && block.indexOf('src/warm.js') < block.indexOf('docs/cold.md'));
  assert.match(block, /recognized structured file tools/);
  assert.match(block, /retained history/);
  assert.doesNotMatch(html, /PRIVATE_/);
});

test('a duplicate call record is counted once', () => {
  const state = createSession('claude', 'session');
  const first = claudeCall('dup-1', 'Edit', { file_path: `${ROOT}\\src\\a.js`, old_string: 'PRIVATE_OLD_CODE', new_string: 'PRIVATE_NEW_CODE' });
  const done = claudeResult('dup-1');
  apply(state, first, first, done, done, first);
  assert.deepEqual(state.footprint.files.map(file => [file.label, file.edits]), [['src/a.js', 1]]);
  assert.equal(state.footprint.editCalls, 1);

  const rollout = createSession('codex', 'session');
  const reading = codex({ type: 'function_call', call_id: 'r-1', name: 'read_file', arguments: JSON.stringify({ path: '/home/dev/app/src/a.js' }) });
  apply(rollout, reading, reading, codex({ type: 'function_call_output', call_id: 'r-1', output: 'PRIVATE_OUTPUT' }), reading);
  assert.deepEqual(rollout.footprint.files.map(file => [file.label, file.reads]), [['src/a.js', 1]]);
  assertAgrees(state);
  assertAgrees(rollout);
});

test('a failed call counts at its station and is shown as failed, never as a read, an edit or part of the marker', () => {
  const state = createSession('claude', 'session');
  const file = `${ROOT}\\src\\a.js`;
  edit(state, file); edit(state, file);
  edit(state, file, { is_error: true });
  read(state, file, { is_error: true });
  // A call still waiting for its result is a recorded call.
  apply(state, claudeCall('open-1', 'Read', { file_path: file }));
  let entry = state.footprint.files[0];
  assert.deepEqual([entry.reads, entry.edits, entry.failed], [1, 2, 2]);
  assert.deepEqual([state.footprint.readCalls, state.footprint.editCalls, state.footprint.failedCalls], [2, 3, 2]);
  assertAgrees(state);
  let block = area(render(sent(state), { now: state.updatedAt }));
  assert.match(block, /1 read · 2 edits · 2 failed/);
  assert.doesNotMatch(block, /class="file-hot"/);
  // The pending call fails later: the same record moves from read to failed.
  apply(state, claudeResult('open-1', { is_error: true }));
  entry = state.footprint.files[0];
  assert.deepEqual([entry.reads, entry.edits, entry.failed], [0, 2, 3]);
  edit(state, file);
  block = area(render(sent(state), { now: state.updatedAt }));
  assert.match(block, /class="file-hot"/);
  assertAgrees(state);

  // Codex: a patch whose output reports a failure.
  const rollout = createSession('codex', 'session');
  apply(rollout, codex({ type: 'custom_tool_call', call_id: 'p-1', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/a.js\n@@\n-PRIVATE_OLD_CODE\n+PRIVATE_NEW_CODE\n*** End Patch' }),
    codex({ type: 'custom_tool_call_output', call_id: 'p-1', output: JSON.stringify({ output: 'PRIVATE_OUTPUT', metadata: { exit_code: 1 } , exit_code: 1 }) }));
  assert.deepEqual(rollout.footprint.files.map(entry => [entry.label, entry.edits, entry.failed]), [['src/a.js', 0, 1]]);
  assert.doesNotMatch(JSON.stringify([state, rollout]), /PRIVATE_/);
});

test('Windows, UNC and Unix path forms give one identity per file and a two-segment label', () => {
  const key = (file, cwd) => fileIdentity(file, cwd)?.key;
  // Windows drive paths ignore case and separator style; dot segments are resolved.
  const windows = key('C:\\Work\\PRIVATE_REPO\\src\\App.js');
  assert.equal(key('c:/work/private_repo/SRC/app.js'), windows);
  assert.equal(key('C:\\Work\\PRIVATE_REPO\\lib\\..\\src\\.\\App.js'), windows);
  assert.equal(key('\\\\?\\C:\\Work\\PRIVATE_REPO\\src\\App.js'), windows);
  assert.equal(key('src\\App.js', 'C:\\Work\\PRIVATE_REPO'), windows);
  assert.equal(key('./src/App.js', 'c:/work/PRIVATE_REPO/'), windows);
  assert.notEqual(key('D:\\Work\\PRIVATE_REPO\\src\\App.js'), windows);
  // UNC paths ignore case too and differ from a drive path with the same tail.
  const unc = key('\\\\PRIVATE_SERVER\\share\\src\\App.js');
  assert.equal(key('\\\\private_server\\SHARE\\src\\app.js'), unc);
  assert.equal(key('\\\\?\\UNC\\PRIVATE_SERVER\\share\\src\\App.js'), unc);
  assert.notEqual(unc, windows);
  // Unix paths are compared exactly: case is part of the name.
  const unix = key('/home/PRIVATE_USER/app/src/App.js');
  assert.equal(key('/home/PRIVATE_USER/app//src/./App.js'), unix);
  assert.equal(key('src/App.js', '/home/PRIVATE_USER/app'), unix);
  assert.notEqual(key('/home/PRIVATE_USER/app/src/app.js'), unix);
  assert.notEqual(unix, windows);
  // A relative path with no known working directory is its own identity, not a guess at an absolute one.
  assert.notEqual(key('src/App.js'), unix);
  assert.equal(key('src/App.js'), key('./src/App.js'));

  for (const file of ['C:\\Work\\PRIVATE_REPO\\src\\App.js', '\\\\PRIVATE_SERVER\\share\\src\\App.js', '/home/PRIVATE_USER/app/src/App.js']) {
    const identity = fileIdentity(file);
    assert.equal(identity.label, 'src/App.js');
    assert.match(identity.key, /^f:[0-9a-f]{20}$/);
    assert.doesNotMatch(JSON.stringify(identity), /PRIVATE_|Work|home/);
  }
  assert.equal(fileIdentity('C:\\top.txt').label, 'top.txt');
  // Labels are short, cleaned text.
  const hostile = fileIdentity(`/srv/<img src=x onerror=alert(1)>\u202e/${'n'.repeat(300)}.js`);
  assert.ok([...hostile.label].length <= 81);
  assert.doesNotMatch(hostile.label, /[\u0000-\u001f\u202e]/);

  // In a transcript: three spellings of one Windows file are one row; the Unix twin is another.
  const state = createSession('claude', 'session');
  read(state, `${ROOT}\\src\\App.js`);
  edit(state, 'c:/users/private_user/private_org/example-app/src/app.js');
  call(state, 'Read', { file_path: 'src\\App.js' });
  read(state, '/home/PRIVATE_USER/app/src/App.js');
  assert.deepEqual(state.footprint.files.map(file => [file.label, file.reads, file.edits]), [['src/App.js', 2, 1], ['src/App.js', 1, 0]]);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_/i);
});

test('two different files with the same short label stay apart and are told apart by an opaque key', () => {
  const state = createSession('claude', 'session');
  edit(state, `${ROOT}\\packages\\PRIVATE_A\\src\\index.js`);
  read(state, `${ROOT}\\packages\\PRIVATE_B\\src\\index.js`);
  read(state, `${ROOT}\\src\\other.js`);
  const twins = row(state.footprint, 'src/index.js');
  assert.equal(twins.length, 2);
  assert.notEqual(twins[0].key, twins[1].key);
  assert.deepEqual(twins.map(file => file.shared), [true, true]);
  assert.equal(row(state.footprint, 'src/other.js')[0].shared, false);

  const html = render(sent(state), { now: state.updatedAt });
  const block = area(html);
  for (const twin of twins) assert.ok(block.includes(`src/index.js</span> <span class="lane-id">${twin.key.slice(2, 8)}</span>`), 'the key fragment follows the shared label');
  assert.doesNotMatch(block, new RegExp(`src/other\\.js</span> <span class="lane-id">`));
  assert.match(block, /same short label/);
  assert.doesNotMatch(html, /PRIVATE_/);
});

test('missing or unusable paths, searches and shell work name no file and are counted as such', () => {
  const state = createSession('claude', 'session');
  call(state, 'Read', {});
  call(state, 'Read', { file_path: '' });
  call(state, 'Read', { file_path: 42 });
  call(state, 'Read', { file_path: { nested: 'PRIVATE_OBJECT' } });
  call(state, 'Read', null);
  call(state, 'Read', { file_path: `${ROOT}\\PRIVATE_DIR\nPRIVATE_SECOND_LINE\\src\\a.js` });
  call(state, 'Read', { file_path: 'C:\\' + 'PRIVATE_LONG\\'.repeat(400) + 'src\\a.js' });
  call(state, 'Edit', { old_string: 'PRIVATE_OLD_CODE' });
  // A search or listing names a folder or pattern, not one file.
  call(state, 'Grep', { pattern: 'PRIVATE_PATTERN', path: `${ROOT}\\src` });
  call(state, 'Glob', { pattern: '**/*.PRIVATE_EXT', path: `${ROOT}\\src` });
  // Shell commands and their output are never parsed for file names.
  call(state, 'Bash', { command: `cat ${ROOT}\\PRIVATE_SHELL.js && sed -i s/a/b/ PRIVATE_SED.js` });
  call(state, 'PowerShell', { command: 'Set-Content PRIVATE_PS.txt' });
  let footprint = state.footprint;
  assert.deepEqual([footprint.files.length, footprint.total, footprint.readCalls, footprint.editCalls, footprint.unnamedReads, footprint.unnamedEdits], [0, 0, 0, 0, 9, 1]);
  assertAgrees(state);

  // No paths at all: the existing generic labels and an explicit empty state, not an empty list.
  assert.ok(state.events.some(event => event.label === 'Reading files'));
  let block = area(render(sent(state), { now: state.updatedAt }));
  assert.match(block, /No file paths are recorded/);
  assert.match(block, /recognized structured file tools/);
  assert.doesNotMatch(block, /<ol class="file-list"/);
  const bare = area(render(sent(createSession('codex', 'session')), { now: 1000 }));
  assert.match(bare, /No file paths are recorded/);

  // Codex: program text and shell calls are not parsed; structured calls are read.
  const rollout = createSession('codex', 'session');
  apply(rollout, codex({ type: 'session_meta', id: 'session', cwd: '/home/PRIVATE_USER/app' }, 'session_meta'),
    codex({ type: 'custom_tool_call', call_id: 'x-1', name: 'exec', input: 'await tools.read_file({ path: "PRIVATE_CODE_PATH.js" });' }),
    codex({ type: 'function_call', call_id: 's-1', name: 'shell_command', arguments: JSON.stringify({ command: 'apply_patch <<EOF\n*** Update File: PRIVATE_SHELL_PATCH.js\nEOF' }) }),
    codex({ type: 'function_call_output', call_id: 's-1', output: '*** Update File: PRIVATE_OUTPUT.js' }),
    codex({ type: 'function_call', call_id: 'v-1', name: 'view_image', arguments: JSON.stringify({ path: '/home/PRIVATE_USER/app/shots/one.png' }) }),
    codex({ type: 'function_call', call_id: 'bad-1', name: 'read_file', arguments: '{"path": PRIVATE_BROKEN' }));
  footprint = rollout.footprint;
  assert.deepEqual(footprint.files.map(file => [file.label, file.reads]), [['shots/one.png', 1]]);
  assert.deepEqual([footprint.readCalls, footprint.unnamedReads], [1, 2]);
  assertAgrees(rollout);
  block = area(render(sent(rollout), { now: rollout.updatedAt }));
  assert.match(block, /2 named no single file/);
  assert.doesNotMatch(JSON.stringify([state, rollout]) + block, /PRIVATE_/);
});

test('a patch call names files only through its file headers; bodies are never read out', () => {
  const state = createSession('codex', 'session');
  apply(state, codex({ id: 'session', cwd: 'C:\\Users\\PRIVATE_USER\\app' }, 'session_meta'));
  const patch = ['*** Begin Patch', '*** Update File: src/one.js', '@@ PRIVATE_CONTEXT', '-PRIVATE_OLD_CODE', '+PRIVATE_NEW_CODE',
    '+*** Update File: PRIVATE_BODY_DECOY.js', ' *** Add File: PRIVATE_CONTEXT_DECOY.js',
    '*** Add File: src/two.js', '+PRIVATE_NEW_FILE', '*** Delete File: C:\\Users\\PRIVATE_USER\\app\\src\\three.js',
    '*** Update File: src/four.js', '*** Move to: src/five.js', '@@', '*** Update File: SRC\\ONE.js', '@@', '*** End Patch'].join('\n');
  apply(state, codex({ type: 'custom_tool_call', call_id: 'p-1', name: 'apply_patch', input: patch }), codex({ type: 'custom_tool_call_output', call_id: 'p-1', output: 'PRIVATE_OUTPUT' }));
  let footprint = state.footprint;
  // One call at the Edits station; one edit for each distinct file its headers name.
  assert.deepEqual(footprint.files.map(file => [file.label, file.edits]).sort(), [['src/five.js', 1], ['src/four.js', 1], ['src/one.js', 1], ['src/three.js', 1], ['src/two.js', 1]]);
  assert.deepEqual([footprint.editCalls, footprint.unnamedEdits, summarize(state.events).counts.edits], [1, 0, 1]);
  // The same tool called through JSON arguments, twice more on one file: the marker follows recorded edits.
  for (const id of ['p-2', 'p-3']) apply(state, codex({ type: 'function_call', call_id: id, name: 'apply_patch', arguments: JSON.stringify({ input: '*** Begin Patch\n*** Update File: src/one.js\n@@\n+PRIVATE_NEW_CODE\n*** End Patch' }) }), codex({ type: 'function_call_output', call_id: id, output: 'ok' }));
  // A patch with no readable header is an edit call that names no file.
  apply(state, codex({ type: 'custom_tool_call', call_id: 'p-4', name: 'apply_patch', input: 'PRIVATE_NOT_A_PATCH' }));
  footprint = state.footprint;
  assert.deepEqual([footprint.files[0].label, footprint.files[0].edits, footprint.editCalls, footprint.unnamedEdits], ['src/one.js', 3, 3, 1]);
  assertAgrees(state);
  const html = render(sent(state), { now: state.updatedAt });
  assert.match(area(html), /A patch that names several files counts once at the station and once for each file/);
  assert.match(area(html), /class="file-hot"/);
  assert.doesNotMatch(JSON.stringify(state) + html, /PRIVATE_/);
});

test('the footprint covers retained history only and says how much fell outside it', () => {
  const state = createSession('claude', 'session');
  const old = `${ROOT}\\src\\old.js`;
  const kept = `${ROOT}\\src\\kept.js`;
  for (let index = 0; index < 5; index++) apply(state, claudeCall(`old-${index}`, 'Edit', { file_path: old }));
  assert.equal(row(state.footprint, 'src/old.js')[0].edits, 5);
  for (let index = 0; index < MAX_EVENTS - 2; index++) apply(state, claudeCall(`kept-${index}`, 'Read', { file_path: kept }));
  // Three of the five old edits have left retained history; the counts follow the retained events exactly.
  assert.equal(state.droppedEvents, 3);
  assert.deepEqual(state.footprint.files.map(file => [file.label, file.reads, file.edits]), [['src/old.js', 0, 2], ['src/kept.js', MAX_EVENTS - 2, 0]]);
  assertAgrees(state);
  for (let index = 0; index < 2; index++) apply(state, claudeCall(`late-${index}`, 'Read', { file_path: kept }));
  assert.deepEqual(state.footprint.files.map(file => file.label), ['src/kept.js']);
  assert.equal(state.footprint.total, 1);
  assertAgrees(state);
  const block = area(render(sent(state), { now: state.updatedAt }));
  assert.match(block, /5 earlier events are outside retained history and are not counted here/);
  assert.doesNotMatch(block, /src\/old\.js/);

  // The list sent to the view is small; the totals still cover every retained file.
  const wide = createSession('claude', 'session');
  for (let index = 0; index < FOOTPRINT_FILES + 7; index++) apply(wide, claudeCall(`wide-${index}`, 'Read', { file_path: `${ROOT}\\src\\file-${index}.js` }));
  assert.deepEqual([wide.footprint.files.length, wide.footprint.total, wide.footprint.readCalls], [FOOTPRINT_FILES, FOOTPRINT_FILES + 7, FOOTPRINT_FILES + 7]);
  assert.match(area(render(sent(wide), { now: wide.updatedAt })), /7 more files are not listed/);
});

test('child attribution: a file call belongs to the transcript that made it, and lanes are shown apart', () => {
  const main = createSession('claude', 'session-main');
  read(main, `${ROOT}\\src\\main.js`);
  // Starting a subagent is the parent's Agents call. A path in its prompt is not file activity.
  call(main, 'Agent', { subagent_type: 'Explore', prompt: `PRIVATE_PROMPT read ${ROOT}\\src\\child.js`, file_path: undefined });
  const child = createSession('claude', 'agent-1');
  const childRecord = record => ({ ...record, agentId: 'agent-1', sessionId: 'session-main' });
  apply(child, childRecord(claudeCall('k-1', 'Read', { file_path: `${ROOT}\\src\\child.js` })), childRecord(claudeCall('k-2', 'Edit', { file_path: `${ROOT}\\src\\child.js` })),
    childRecord(claudeCall('k-3', 'Read', { file_path: `${ROOT}\\src\\main.js` })));
  assert.deepEqual(main.footprint.files.map(file => [file.label, file.reads, file.edits]), [['src/main.js', 1, 0]]);
  assert.deepEqual(child.footprint.files.map(file => [file.label, file.reads, file.edits]), [['src/child.js', 1, 1], ['src/main.js', 1, 0]]);
  // The same file has the same key in both transcripts.
  assert.equal(row(main.footprint, 'src/main.js')[0].key, row(child.footprint, 'src/main.js')[0].key);
  assertAgrees(main);
  assertAgrees(child);
  // A lane built from a subset of a transcript's events (the host leaves out calls copied from the parent) is counted from that subset.
  const own = fileFootprint(child.events.filter(event => event.id !== 'k-3'));
  assert.deepEqual(own.files.map(file => [file.label, file.reads, file.edits]), [['src/child.js', 1, 1]]);
  assert.equal(own.readCalls, 1);

  const session = sent(main);
  const lane = (key, extra) => ({ key, parentKey: 'main', parentKnown: true, depth: 1, role: 'subagent', label: 'Explore', link: 'spawn', start: { time: main.startedAt, source: 'own' }, end: { state: 'open', time: null }, status: 'active', updatedAt: main.updatedAt, events: sent(child).events, ...extra });
  session.family = { lanes: [
    { key: 'main', parentKey: '', parentKnown: true, depth: 0, role: 'main', start: { time: main.startedAt, source: 'own' }, end: { state: 'open', time: null }, updatedAt: main.updatedAt },
    lane('agent-1', { footprint: sent(child).footprint }),
    lane('agent-2', { label: '<b>checker</b>', events: [], footprint: sent(createSession('claude', 'agent-2')).footprint })
  ], notes: [] };
  let block = area(render(session, { now: main.updatedAt }));
  assert.match(block, /1 FILE · 1 READ · 0 EDITS/);
  assert.match(block, /Subagent lanes are counted apart/);
  assert.match(block, /Explore<\/b>[^]*?2 files · 2 reads · 1 edit[^]*?src\/child\.js/);
  assert.match(block, /&lt;b&gt;checker&lt;\/b&gt;[^]*?No file paths are recorded/);
  assert.doesNotMatch(block, /<b>checker<\/b>/);
  // The followed session's own list never holds the child's file.
  const ownList = block.slice(0, block.indexOf('footprint-subagents'));
  assert.doesNotMatch(ownList, /src\/child\.js/);
  // Lanes the host sent without a footprint are called not loaded, never empty.
  session.family.lanes[1] = lane('agent-1', {});
  session.family.lanes[2] = lane('agent-2', { events: [] });
  block = area(render(session, { now: main.updatedAt }));
  assert.match(block, /File activity of the 2 subagent lanes is not loaded in this view/);
  assert.doesNotMatch(block, /src\/child\.js/);
  assert.doesNotMatch(JSON.stringify([main, child]) + block, /PRIVATE_/);
});

test('the footprint and the station totals agree under the documented counting rule, and the view states it', () => {
  const state = createSession('claude', 'session');
  const file = `${ROOT}\\src\\a.js`;
  read(state, file); read(state, file, { is_error: true }); edit(state, file);
  call(state, 'Grep', { pattern: 'PRIVATE_PATTERN' });
  call(state, 'Edit', {});
  call(state, 'Bash', { command: 'git status PRIVATE_ARGUMENT' });
  const session = sent(state);
  const facts = footprintFacts(session.footprint, session.events);
  assert.deepEqual([facts.stationReads, facts.stationEdits, facts.readCalls, facts.unnamedReads, facts.editCalls, facts.unnamedEdits, facts.agrees], [3, 2, 2, 1, 1, 1, true]);
  const html = render(session, { now: state.updatedAt });
  const block = area(html);
  assert.match(block, /Of its 3 Files calls, 2 named one file and 1 named no single file/);
  assert.match(block, /Of its 2 Edits calls, 1 named a file and 1 named none/);
  // The station totals drawn on the same page are the same numbers.
  assert.match(html, /Files<b>3<\/b>/);
  assert.match(html, /Edits<b>2<\/b>/);
  // A footprint that does not match the events it is shown with is called out, not silently drawn.
  const off = footprintFacts({ ...session.footprint, readCalls: 9 }, session.events);
  assert.equal(off.agrees, false);
  assert.match(area(render({ ...session, footprint: { ...session.footprint, readCalls: 9 } }, { now: state.updatedAt })), /do not match the station totals/);
  // Malformed footprints from an older host are an empty state, not an error.
  for (const bad of [undefined, null, 'x', { files: 'PRIVATE_STRING' }, { files: [null, { key: 5, label: {} }] }]) {
    assert.doesNotThrow(() => render({ ...session, footprint: bad }, { now: state.updatedAt }));
    assert.equal(footprintFacts(bad, []).files.length, 0);
  }
  assert.doesNotMatch(html, /PRIVATE_/);
});

test('the host reader forwards the followed session\'s footprint from a transcript file', async () => {
  const os = require('node:os');
  const fsp = require('node:fs/promises');
  const { FamilyReader } = require('../src/sessions');
  const folder = await fsp.mkdtemp(path.join(os.tmpdir(), 'agentviz-footprint-'));
  try {
    const file = path.join(folder, 'session-main.jsonl');
    const line = record => JSON.stringify({ sessionId: 'session-main', ...record }) + '\n';
    await fsp.writeFile(file, line(claudeCall('e-1', 'Edit', { file_path: `${ROOT}\\src\\disk.js`, new_string: 'PRIVATE_NEW_CODE' })) + line(claudeResult('e-1')));
    const reader = new FamilyReader('claude', 'session-main');
    let snapshot = await reader.read(file, { files: [] });
    assert.deepEqual(snapshot.footprint.files.map(entry => [entry.label, entry.edits]), [['src/disk.js', 1]]);
    await fsp.appendFile(file, line(claudeCall('e-2', 'Read', { file_path: 'src/disk.js' })));
    snapshot = await reader.read(file, { files: [] });
    assert.deepEqual(snapshot.footprint.files.map(entry => [entry.label, entry.reads, entry.edits]), [['src/disk.js', 1, 1]]);
    const text = JSON.stringify(snapshot);
    assert.doesNotMatch(text, /PRIVATE_|"cwd"|"files":\[\{"key":"f:[0-9a-f]+","label":"[^"]*[\\:]/);
    // Events sent to the view carry no file identity of their own.
    assert.deepEqual(Object.keys(JSON.parse(text).events[0]).sort(), ['id', 'kind', 'label', 'outcome', 'time']);
    assert.match(area(render(JSON.parse(text), { now: snapshot.updatedAt })), /1 FILE · 1 READ · 1 EDIT/);
  } finally { await fsp.rm(folder, { recursive: true, force: true }); }
});

test('the example session carries a synthetic footprint that agrees with its stations; the stylesheet styles the area', () => {
  const demo = demoSession(1800000);
  const facts = footprintFacts(demo.footprint, demo.events);
  assert.ok(facts.files.length > 0);
  assert.equal(facts.agrees, true);
  // With every lane's footprint loaded, the lanes add up to the family's Files and Edits stations.
  const lanes = familyLanes(demo);
  const family = summarize(familyEvents(lanes)).counts;
  const perLane = lanes.map((lane, index) => footprintFacts(index ? lane.footprint : demo.footprint, lane.events));
  assert.ok(perLane.every(lane => lane.agrees));
  assert.equal(perLane.reduce((sum, lane) => sum + lane.readCalls + lane.unnamedReads, 0), family.files);
  assert.equal(perLane.reduce((sum, lane) => sum + lane.editCalls + lane.unnamedEdits, 0), family.edits);
  const html = render(demo, { now: 1800000, example: true });
  const block = area(html);
  assert.match(block, /class="file-hot"/);
  assert.match(block, /Subagent lanes are counted apart/);
  assert.doesNotMatch(block, /style=/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'media', 'style.css'), 'utf8');
  for (const rule of ['.footprint-block', '.file-list', '.file-hot']) assert.ok(css.includes(rule), `${rule} is styled`);
});
