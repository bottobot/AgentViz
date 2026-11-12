const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FamilyReader, discoverSessions, FAMILY_LIMIT } = require('../src/sessions');
const { createSession, applyRecord } = require('../src/transcript');
const view = require('../media/view');

// S04: main and subagent lanes. Every transcript here is synthetic; PRIVATE_ strings stand for content that
// must never reach the view.
const MAIN = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';
const at = seconds => Date.UTC(2026, 10, 11, 18, 0, seconds);
const ts = seconds => new Date(at(seconds)).toISOString();
const line = value => JSON.stringify(value) + '\n';
const kinds = ['files', 'edits', 'shell', 'network', 'agents', 'memory', 'other'];
const calls = events => events.filter(event => kinds.includes(event.kind));

// Claude records, in the shapes verified locally on 2026-11-12.
const use = (seconds, id, name = 'Read', input = { file_path: 'C:/PRIVATE_PATH/src/a.js' }, extra = {}) =>
  line({ type: 'assistant', timestamp: ts(seconds), sessionId: MAIN, ...extra, message: { content: [{ type: 'tool_use', id, name, input }] } });
const result = (seconds, id, extra = {}, part = {}) =>
  line({ type: 'user', timestamp: ts(seconds), sessionId: MAIN, ...extra, message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'PRIVATE_OUTPUT', ...part }] } });
const spawn = (seconds, call, extra) => use(seconds, call, 'Agent', { description: 'PRIVATE_DESCRIPTION', prompt: 'PRIVATE_PROMPT', subagent_type: 'Explore' }, extra);
const launched = (seconds, call, agentId, extra) => result(seconds, call, { ...extra, toolUseResult: { status: 'async_launched', isAsync: true, agentId, prompt: 'PRIVATE_PROMPT', description: 'PRIVATE_DESCRIPTION', outputFile: 'C:/PRIVATE_PATH/out' } });
const finished = (seconds, call, agentId, extra) => result(seconds, call, { ...extra, toolUseResult: { status: 'completed', agentId, prompt: 'PRIVATE_PROMPT', totalDurationMs: 123456, content: [{ type: 'text', text: 'PRIVATE_OUTPUT' }] } });
const notice = (agentId, status) => `<task-notification>\n<task-id>${agentId}</task-id>\n<tool-use-id>toolu_PRIVATE</tool-use-id>\n<output-file>C:/PRIVATE_PATH/out</output-file>\n<status>${status}</status>\n<summary>PRIVATE_SUMMARY <status>failed</status></summary>\n</task-notification>`;
const queued = (seconds, agentId, status, operation = 'enqueue') => line({ type: 'queue-operation', operation, timestamp: ts(seconds), sessionId: MAIN, content: notice(agentId, status) });
const delivered = (seconds, agentId, status) => line({ type: 'user', timestamp: ts(seconds), sessionId: MAIN, uuid: `notice-${agentId}-${seconds}`, message: { content: notice(agentId, status) } });
const prompt = (seconds, extra = {}) => line({ type: 'user', timestamp: ts(seconds), sessionId: MAIN, uuid: `prompt-${seconds}-${extra.agentId || 'main'}`, cwd: 'C:\\work\\Example', ...extra, message: { content: 'PRIVATE_PROMPT sk-PRIVATE_SECRET' } });
const inChild = agentId => ({ agentId, isSidechain: true });

async function claudeFamily(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentviz-family-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'claude', 'projects', 'C--work-Example');
  const sub = path.join(project, MAIN, 'subagents');
  await fs.mkdir(path.join(sub, 'workflows', 'run-1'), { recursive: true });
  const mainFile = path.join(project, `${MAIN}.jsonl`);
  const roots = { claudeRoot: path.join(root, 'claude'), codexRoot: path.join(root, 'codex') };
  const child = (agentId, folder = sub) => path.join(folder, `agent-${agentId}.jsonl`);
  const meta = (agentId, value, folder = sub) => fs.writeFile(path.join(folder, `agent-${agentId}.meta.json`), typeof value === 'string' ? value : JSON.stringify(value));
  const listing = async () => (await discoverSessions(roots)).all;
  return { root, project, sub, mainFile, roots, child, meta, listing };
}

// Main starts aaa1 and bbb2 in the background (they overlap), and eee5 whose transcript never appears.
// aaa1 starts ccc3 and waits for it. ddd4 is a workflow agent: no parent call is recorded for it.
async function writeFamily(family) {
  const { mainFile, sub, child, meta } = family;
  await fs.writeFile(mainFile, prompt(0) + use(5, 'main-1')
    + spawn(10, 'call-a') + launched(11, 'call-a', 'aaa1') + launched(11, 'call-a', 'aaa1')
    + spawn(15, 'call-b') + launched(16, 'call-b', 'bbb2')
    + queued(45, 'aaa1', 'completed') + queued(46, 'aaa1', 'completed', 'remove') + delivered(47, 'aaa1', 'completed')
    + queued(50, 'bbb2', 'failed') + delivered(51, 'bbb2', 'failed')
    + spawn(55, 'call-e') + launched(56, 'call-e', 'eee5'));
  await fs.writeFile(child('aaa1'), prompt(12, inChild('aaa1')) + use(13, 'a-1', 'Read', undefined, inChild('aaa1'))
    + spawn(20, 'call-c', inChild('aaa1')) + finished(30, 'call-c', 'ccc3', inChild('aaa1')) + use(40, 'a-3', 'Grep', {}, inChild('aaa1')));
  await meta('aaa1', { agentType: 'Explore', description: 'PRIVATE_DESCRIPTION', toolUseId: 'call-a', spawnDepth: 1, finished: true });
  await fs.writeFile(child('ccc3'), prompt(22, inChild('ccc3')) + use(23, 'c-1', 'Bash', { command: 'npm test PRIVATE_ARGUMENT' }, inChild('ccc3')));
  await meta('ccc3', { agentType: '<b>checker</b>', description: 'PRIVATE_DESCRIPTION', toolUseId: 'call-c', parentAgentId: 'aaa1', spawnDepth: 2, finished: true });
  await fs.writeFile(child('bbb2'), prompt(17, inChild('bbb2')) + use(18, 'b-1', 'Read', undefined, inChild('bbb2'))
    + use(25, 'b-2', 'Bash', { command: 'node PRIVATE_ARGUMENT' }, inChild('bbb2')) + result(26, 'b-2', inChild('bbb2'), { is_error: true }));
  await meta('bbb2', '{"agentType": "PRIVATE_HALF_WRITTEN');
  const run = path.join(sub, 'workflows', 'run-1');
  await fs.writeFile(child('ddd4', run), prompt(58, inChild('ddd4')) + use(59, 'd-1', 'Edit', { file_path: 'C:/PRIVATE_PATH/src/b.js' }, inChild('ddd4')));
  await meta('ddd4', { agentType: 'workflow-step', description: 'PRIVATE_DESCRIPTION', workflowPhase: 'Review', spawnDepth: 1 }, run);
}

const lanesOf = snapshot => snapshot.family.lanes.map(lane => [lane.key, lane.depth, lane.parentKey]);
const lane = (snapshot, key) => snapshot.family.lanes.find(candidate => candidate.key === key);

test('a parent transcript records each subagent once: launch, end report and failure, never as a prompt', () => {
  const state = createSession('claude', MAIN);
  const apply = text => text.trim().split('\n').forEach(row => applyRecord(state, JSON.parse(row)));
  apply(prompt(0) + spawn(10, 'call-a') + launched(11, 'call-a', 'aaa1') + launched(12, 'call-a', 'aaa1')
    + queued(45, 'aaa1', 'completed') + queued(46, 'aaa1', 'failed', 'remove') + delivered(47, 'aaa1', 'stopped')
    + line({ type: 'attachment', timestamp: ts(48), attachment: { type: 'queued_command', prompt: notice('aaa1', 'failed') } })
    + spawn(20, 'call-s') + finished(30, 'call-s', 'sync1')
    + spawn(31, 'call-x') + result(32, 'call-x', { toolUseResult: 'PRIVATE_ERROR_TEXT' }, { is_error: true })
    + use(33, 'plain-1') + result(34, 'plain-1', { toolUseResult: { filePath: 'C:/PRIVATE_PATH' } }));
  // Three Agent calls and one Read; the repeated result record and the four end reports add nothing.
  assert.deepEqual(calls(state.events).map(event => [event.id, event.kind]), [['call-a', 'agents'], ['call-s', 'agents'], ['call-x', 'agents'], ['plain-1', 'files']]);
  assert.equal(state.events.filter(event => event.kind === 'prompt').length, 1, 'an end report delivered as a user record is not a user prompt');
  assert.deepEqual({ ...state.lifecycle.agents.get('aaa1') }, { launched: at(10), reported: at(11), ended: false, failed: false });
  assert.deepEqual({ ...state.lifecycle.notices.get('aaa1') }, { time: at(45), status: 'completed' }, 'the first end report wins; the status inside the summary is ignored');
  assert.deepEqual({ ...state.lifecycle.agents.get('sync1') }, { launched: at(20), reported: at(30), ended: true, failed: false });
  assert.deepEqual({ ...state.lifecycle.spawns.get('call-x') }, { launched: at(31), reported: at(32), ended: true, failed: true });
  assert.equal(state.lifecycle.spawns.has('plain-1'), false, 'an ordinary tool result is not a spawn');
  assert.equal(state.startedAt, at(0));
  // A user who types the notice text mid-sentence is still a prompt, and nothing here is enumerable state.
  applyRecord(state, { type: 'user', timestamp: ts(60), uuid: 'typed', message: { content: `please explain ${notice('zzz9', 'failed')}` } });
  assert.equal(state.events.filter(event => event.kind === 'prompt').length, 2);
  assert.equal(state.lifecycle.notices.has('zzz9'), false);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_|lifecycle|aaa1/);
});

test('a Claude family shows main first, nested and overlapping children indented, each with its own work only', async (t) => {
  const family = await claudeFamily(t);
  await writeFamily(family);
  const reader = new FamilyReader('claude', MAIN);
  const snapshot = await reader.read(family.mainFile, { files: await family.listing() });
  assert.deepEqual(lanesOf(snapshot), [['main', 0, ''], ['aaa1', 1, 'main'], ['ccc3', 2, 'aaa1'], ['bbb2', 1, 'main'], ['eee5', 1, 'main'], ['ddd4', 1, 'main']]);
  assert.deepEqual([snapshot.id, snapshot.provider, snapshot.family.found], [MAIN, 'claude', 4]);

  // The parent's three Agent calls are the parent's work. No child lane holds a call its parent made.
  assert.deepEqual(calls(snapshot.events).map(event => event.id), ['main-1', 'call-a', 'call-b', 'call-e']);
  assert.deepEqual(calls(lane(snapshot, 'aaa1').events).map(event => [event.id, event.kind]), [['a-1', 'files'], ['call-c', 'agents'], ['a-3', 'files']]);
  assert.deepEqual(calls(lane(snapshot, 'ccc3').events).map(event => event.label), ['Running tests']);
  assert.deepEqual(calls(lane(snapshot, 'bbb2').events).map(event => event.outcome), ['running', 'error']);
  assert.deepEqual(calls(lane(snapshot, 'ddd4').events).map(event => event.id), ['d-1']);
  assert.deepEqual(lane(snapshot, 'eee5').events, []);
  // The task a child receives is a handoff marker in its lane, not a user prompt.
  assert.deepEqual(lane(snapshot, 'aaa1').events[0], { id: 'prompt:prompt-12-aaa1', time: at(12), kind: 'handoff', label: 'Task received', outcome: 'success' });
  assert.equal(snapshot.events.filter(event => event.kind === 'prompt').length, 1);

  // Lifecycle: only recorded boundaries. Background ends come from the first report, a waited-for child from its
  // parent's result record, and a child with no report has no end.
  assert.deepEqual([lane(snapshot, 'aaa1').start, lane(snapshot, 'aaa1').end], [{ time: at(12), source: 'own' }, { state: 'completed', time: at(45) }]);
  assert.deepEqual(lane(snapshot, 'bbb2').end, { state: 'failed', time: at(50) });
  assert.deepEqual(lane(snapshot, 'ccc3').end, { state: 'completed', time: at(30) });
  assert.deepEqual(lane(snapshot, 'ddd4').end, { state: 'open', time: null });
  assert.deepEqual([lane(snapshot, 'eee5').missing, lane(snapshot, 'eee5').start, lane(snapshot, 'eee5').end], [true, { time: at(55), source: 'parent' }, { state: 'open', time: null }]);
  assert.deepEqual(snapshot.family.lanes.map(entry => [entry.key, entry.label, entry.link]),
    [['main', '', ''], ['aaa1', 'Explore', 'spawn'], ['ccc3', '<b>checker</b>', 'spawn'], ['bbb2', 'Subagent', 'spawn'], ['eee5', 'Subagent', 'spawn'], ['ddd4', 'workflow-step', 'records']]);
  assert.match(snapshot.family.notes.join(' '), /1 subagent recorded by a parent has no transcript/);

  // One counting rule for stations, lanes and the strip: every call once, in the lane of the agent that made it.
  const lanes = view.familyLanes(snapshot);
  const events = view.familyEvents(lanes);
  const perLane = lanes.map(entry => view.laneCounts(entry.events).calls);
  assert.deepEqual(perLane, [4, 3, 1, 2, 0, 1]);
  assert.equal(view.summarize(events).total, 11);
  assert.equal(view.summarize(events).counts.agents, 4, 'four Agent calls: three by main, one by aaa1');
  assert.equal(view.activityBuckets(events, at(90)).reduce((sum, bucket) => sum + bucket.total, 0), 11);
  assert.equal(view.summarize(events).errors, lanes.reduce((sum, entry) => sum + view.laneCounts(entry.events).errors, 0));
  assert.equal(new Set(events.filter(event => kinds.includes(event.kind)).map(event => event.id)).size, 11, 'no call appears in two lanes');

  // Nothing but names, IDs, times and labels crosses to the view.
  const sent = JSON.stringify(snapshot);
  assert.doesNotMatch(sent, /PRIVATE_|sk-|\.jsonl|agentviz-family|C:[\\/]/);
  assert.doesNotMatch(sent, /description|"prompt":|toolUseId|outputFile|lifecycle/);
});

test('repeated reads keep one lane per child, reopen only changed transcripts and follow appended child work', async (t) => {
  const family = await claudeFamily(t);
  await writeFamily(family);
  const files = await family.listing();
  const reader = new FamilyReader('claude', MAIN);
  const first = await reader.read(family.mainFile, { files });
  const promises = require('node:fs/promises');
  const open = promises.open;
  const opened = [];
  promises.open = (file, ...rest) => { opened.push(path.basename(String(file))); return open(file, ...rest); };
  t.after(() => { promises.open = open; });
  const second = await reader.read(family.mainFile, { files });
  assert.deepEqual(lanesOf(second), lanesOf(first));
  assert.deepEqual(opened, [`${MAIN}.jsonl`], 'unchanged children and their link records are not opened again');
  // The same parent metadata arriving again, and new child work, change counts only where work was added.
  await fs.appendFile(family.mainFile, launched(70, 'call-a', 'aaa1') + queued(71, 'aaa1', 'failed') + delivered(72, 'bbb2', 'completed'));
  await fs.appendFile(family.child('bbb2'), use(73, 'b-3', 'Read', undefined, inChild('bbb2')));
  opened.length = 0;
  const third = await reader.read(family.mainFile, { files });
  assert.deepEqual(opened.sort(), [`${MAIN}.jsonl`, 'agent-bbb2.jsonl'].sort());
  assert.deepEqual(lanesOf(third), lanesOf(first));
  assert.deepEqual(third.family.lanes.map(entry => calls(entry.events || third.events).length), [4, 3, 1, 3, 0, 1]);
  assert.deepEqual([lane(third, 'aaa1').end, lane(third, 'bbb2').end], [{ state: 'completed', time: at(45) }, { state: 'failed', time: at(50) }]);
});

test('missing files, cycles, unknown parents and foreign transcripts are disclosed, not guessed', async (t) => {
  const family = await claudeFamily(t);
  const { child, meta } = family;
  await fs.writeFile(family.mainFile, prompt(0) + spawn(10, 'call-g') + launched(11, 'call-g', 'gone7'));
  // xxx1 and yyy2 each name the other as parent. zzz3 names a parent that has no transcript.
  for (const [id, parent, seconds] of [['xxx1', 'yyy2', 20], ['yyy2', 'xxx1', 21], ['zzz3', 'nobody', 22]]) {
    await fs.writeFile(child(id), prompt(seconds, inChild(id)) + use(seconds + 1, `${id}-1`, 'Read', undefined, inChild(id)));
    await meta(id, { agentType: 'general-purpose', toolUseId: `call-${id}`, parentAgentId: parent, spawnDepth: 2 });
  }
  // A transcript in this folder whose own records name another session.
  await fs.writeFile(child('fff6'), line({ type: 'user', timestamp: ts(30), sessionId: OTHER, agentId: 'fff6', cwd: 'C:\\work\\Example', message: { content: 'PRIVATE_PROMPT' } })
    + line({ type: 'assistant', timestamp: ts(31), sessionId: OTHER, agentId: 'fff6', message: { content: [{ type: 'tool_use', id: 'f-1', name: 'Read', input: {} }] } }));
  await meta('fff6', { agentType: 'general-purpose', toolUseId: 'call-f', spawnDepth: 1 });
  const reader = new FamilyReader('claude', MAIN);
  let snapshot = await reader.read(family.mainFile, { files: await family.listing() });
  assert.deepEqual(lanesOf(snapshot), [['main', 0, ''], ['gone7', 1, 'main'], ['xxx1', 1, 'main'], ['yyy2', 1, 'main'], ['zzz3', 1, 'main']]);
  assert.deepEqual(['xxx1', 'yyy2', 'zzz3'].map(key => lane(snapshot, key).parentKnown), [false, false, false]);
  assert.deepEqual([lane(snapshot, 'gone7').missing, lane(snapshot, 'gone7').parentKnown], [true, true]);
  assert.match(snapshot.family.notes.join(' '), /1 transcript in the subagent folder names another session and is not shown/);
  assert.equal(view.summarize(view.familyEvents(view.familyLanes(snapshot))).total, 4, 'the foreign transcript adds no calls');
  const html = view.render(snapshot, { now: at(120) });
  assert.match(html, /Transcript not found \(deleted, moved or not written yet\)/);
  assert.match(html, /Parent lane not loaded; shown under the followed session/);

  // A child transcript deleted between two folder listings: its lane stays, says so, and is not read.
  await fs.rm(child('zzz3'));
  snapshot = await reader.read(family.mainFile, { files: reader.listing });
  assert.deepEqual([lane(snapshot, 'zzz3').missing, calls(lane(snapshot, 'zzz3').events).length], [true, 1]);
  // After the next listing it is no longer followed at all.
  snapshot = await reader.read(family.mainFile, { files: await family.listing() });
  assert.equal(lane(snapshot, 'zzz3'), undefined);
  assert.deepEqual([...reader.children.keys()].map(file => path.basename(file)).sort(), ['agent-fff6.jsonl', 'agent-xxx1.jsonl', 'agent-yyy2.jsonl']);
});

test('only the selected family is followed, a followed subagent shows its own descendants, and limits are stated', async (t) => {
  const family = await claudeFamily(t);
  await writeFamily(family);
  // Another session in the same project with its own subagent.
  const otherFile = path.join(family.project, `${OTHER}.jsonl`);
  const otherSub = path.join(family.project, OTHER, 'subagents');
  await fs.mkdir(otherSub, { recursive: true });
  await fs.writeFile(otherFile, line({ type: 'user', timestamp: ts(0), sessionId: OTHER, uuid: 'other-prompt', cwd: 'C:\\work\\Example', message: { content: 'PRIVATE_PROMPT' } }));
  await fs.writeFile(path.join(otherSub, 'agent-ooo8.jsonl'), line({ type: 'assistant', timestamp: ts(5), sessionId: OTHER, agentId: 'ooo8', cwd: 'C:\\work\\Example', message: { content: [{ type: 'tool_use', id: 'o-1', name: 'Read', input: {} }] } }));
  const files = await family.listing();
  assert.equal(files.find(session => session.sessionId === 'ddd4').child, true, 'a workflow agent below subagents/ is listed as a subagent');

  const main = new FamilyReader('claude', MAIN);
  assert.ok(!lanesOf(await main.read(family.mainFile, { files })).some(([key]) => key === 'ooo8'));
  assert.ok([...main.children.keys()].every(file => file.startsWith(family.sub)));
  // Selection change: a new reader for the other session reads only that family.
  const other = new FamilyReader('claude', OTHER);
  assert.deepEqual(lanesOf(await other.read(otherFile, { files })), [['main', 0, ''], ['ooo8', 1, 'main']]);
  assert.deepEqual([...other.children.keys()].map(file => path.basename(file)), ['agent-ooo8.jsonl']);

  // Following aaa1 itself: its child ccc3 is shown, its parent and siblings are not, and the view says so.
  const nested = new FamilyReader('claude', 'aaa1');
  const snapshot = await nested.read(family.child('aaa1'), { files });
  assert.deepEqual(lanesOf(snapshot), [['main', 0, ''], ['ccc3', 1, 'main']]);
  assert.deepEqual([snapshot.family.lanes[0].role, snapshot.parent, lane(snapshot, 'ccc3').end], ['subagent', MAIN, { state: 'completed', time: at(30) }]);
  assert.match(snapshot.family.notes.join(' '), /itself a subagent/);
  assert.match(view.render(snapshot, { now: at(120) }), /Followed subagent/);

  // More children than the lane limit: the newest are followed and the cut is stated.
  for (let index = 0; index < FAMILY_LIMIT + 3; index++) {
    const id = `many${String(index).padStart(2, '0')}`;
    await fs.writeFile(family.child(id), use(100 + index, `${id}-1`, 'Read', undefined, inChild(id)));
  }
  const crowded = await new FamilyReader('claude', MAIN).read(family.mainFile, { files: await family.listing() });
  assert.equal(crowded.family.lanes.filter(entry => entry.depth > 0 && !entry.missing).length, FAMILY_LIMIT);
  assert.equal(crowded.family.found, FAMILY_LIMIT + 7);
  assert.match(crowded.family.notes.join(' '), new RegExp(`Following the ${FAMILY_LIMIT} most recently written of ${FAMILY_LIMIT + 7} subagent transcripts\\. Totals cover the lanes shown\\.`));
});

// Codex records, in the shapes verified locally on 2026-11-12.
const thread = n => `019a0000-aaaa-7bbb-8ccc-00000000000${n}`;
const codexMeta = (id, seconds, parent, nickname = 'Kepler') => line({ type: 'session_meta', timestamp: ts(seconds), payload: { id, cwd: 'C:\\work\\Example', timestamp: ts(seconds), base_instructions: { text: 'PRIVATE_INSTRUCTIONS' },
  ...(parent ? { forked_from_id: parent, parent_thread_id: parent, agent_path: '/root/PRIVATE_TASK', source: { subagent: { thread_spawn: { parent_thread_id: parent, depth: 1, agent_nickname: nickname, agent_role: null, agent_path: '/root/PRIVATE_TASK' } } } } : { source: 'cli' }) } });
const codexCall = (seconds, id, name = 'shell', args = { command: 'ls PRIVATE_ARGUMENT' }) => line({ type: 'response_item', timestamp: ts(seconds), payload: { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) } });
const codexEvent = (seconds, payload) => line({ type: 'event_msg', timestamp: ts(seconds), payload });

test('a Codex family links children by their own session metadata and never invents an end', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentviz-family-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'codex', 'sessions', '2026', '11', '11');
  await fs.mkdir(folder, { recursive: true });
  const rollout = id => path.join(folder, `rollout-2026-11-11T10-00-00-${id}.jsonl`);
  const [P, C1, G, C2, GONE, R, K] = [1, 2, 3, 4, 5, 6, 7].map(thread);
  await fs.writeFile(rollout(P), codexMeta(P, 0) + codexCall(5, 'p-1') + codexCall(10, 'p-spawn', 'spawn_agent', { task_name: 'PRIVATE_TASK', message: 'PRIVATE_PROMPT' })
    + codexEvent(11, { type: 'sub_agent_activity', agent_thread_id: GONE, kind: 'started', agent_path: '/root/PRIVATE_TASK' })
    + codexEvent(11, { type: 'sub_agent_activity', agent_thread_id: GONE, kind: 'interacted' }));
  // C1 was forked: it repeats its parent's metadata and one of its parent's calls before doing its own work.
  await fs.writeFile(rollout(C1), codexMeta(C1, 12, P) + codexMeta(P, 12) + codexCall(13, 'p-1') + codexCall(14, 'c1-1')
    + codexEvent(15, { type: 'task_started', turn_id: 'turn-1' }) + codexEvent(20, { type: 'task_complete', turn_id: 'turn-1' }));
  await fs.writeFile(rollout(G), codexMeta(G, 15, C1, '<i>Noether</i>') + codexCall(16, 'g-1'));
  await fs.writeFile(rollout(C2), codexMeta(C2, 14, P.toUpperCase()) + codexCall(15, 'c2-1') + codexCall(18, 'c2-2'));
  // R and K name each other as parent; neither belongs to P.
  await fs.writeFile(rollout(R), codexMeta(R, 0, K) + codexCall(1, 'r-1'));
  await fs.writeFile(rollout(K), codexMeta(K, 0, R) + codexCall(2, 'k-1'));
  const roots = { claudeRoot: path.join(root, 'claude'), codexRoot: path.join(root, 'codex') };
  const files = (await discoverSessions(roots)).all;
  assert.deepEqual(files.filter(session => session.child).map(session => session.sessionId).sort(), [C1, G, C2, R, K].sort());

  const snapshot = await new FamilyReader('codex', P).read(rollout(P), { files });
  assert.deepEqual(lanesOf(snapshot), [['main', 0, ''], [GONE, 1, 'main'], [C1, 1, 'main'], [G, 2, C1], [C2, 1, 'main']]);
  assert.deepEqual(calls(snapshot.events).map(event => event.id), ['p-1', 'p-spawn']);
  assert.deepEqual([calls(lane(snapshot, C1).events).map(event => event.id), lane(snapshot, C1).duplicates], [['c1-1'], 1], 'a call copied from the parent is not the child\'s work');
  assert.deepEqual([lane(snapshot, C1).label, lane(snapshot, G).label], ['Kepler', '<i>Noether</i>']);
  assert.deepEqual([lane(snapshot, C1).start, lane(snapshot, C1).end, lane(snapshot, C1).status], [{ time: at(12), source: 'own' }, { state: 'open', time: null }, 'complete']);
  assert.deepEqual([lane(snapshot, GONE).missing, lane(snapshot, GONE).start], [true, { time: at(11), source: 'parent' }]);
  const events = view.familyEvents(view.familyLanes(snapshot));
  assert.equal(view.summarize(events).total, 6);
  const facts = view.laneFacts({ ...lane(snapshot, C1) }).join(' · ');
  assert.match(facts, /No end recorded/);
  assert.match(facts, /Its own last turn is complete/);
  assert.doesNotMatch(facts, / from .* to /, 'no duration without a recorded end');
  assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_|\.jsonl|agentviz-family/);

  // A parent loop terminates: R shows K once, and K does not show R again below itself.
  const loop = await new FamilyReader('codex', R).read(rollout(R), { files });
  assert.deepEqual(lanesOf(loop), [['main', 0, ''], [K, 1, 'main']]);
});

test('lanes share one time axis, state unknown boundaries and escape every label', () => {
  const snapshot = view.demoSession(at(3600));
  const lanes = view.familyLanes(snapshot);
  assert.deepEqual(lanes.map(entry => [entry.key, entry.depth]), [['main', 0], ['demo-explore', 1], ['demo-nested', 2], ['demo-tests', 1]]);
  const axis = view.laneAxis(lanes);
  assert.ok(axis.from <= Math.min(...lanes.map(entry => entry.start.time)) && axis.to >= Math.max(...lanes.map(entry => entry.updatedAt)));
  // Overlap is visible on the shared axis: the second child starts before the first one's recorded end.
  assert.ok(axis.x(lanes[3].start.time) < axis.x(lanes[1].end.time));
  assert.equal(view.summarize(view.familyEvents(lanes)).total, lanes.reduce((sum, entry) => sum + view.laneCounts(entry.events).calls, 0));

  const completed = view.laneFacts(lanes[1]).join(' · ');
  assert.match(completed, /Completed .* \(reported to parent\) · 5m from first record to reported end/);
  assert.match(view.laneFacts(lanes[2]).join(' · '), /Failed .* \(reported to parent\)/);
  const open = view.laneFacts(lanes[3]).join(' · ');
  assert.match(open, /No end recorded · Last record/);
  assert.doesNotMatch(open, /reported end|Completed|Failed/);
  assert.match(view.laneFacts({ ...lanes[3], end: { state: 'finished', time: null }, start: { time: null, source: '' } }).join(' · '), /Start not recorded · Marked finished; end time not recorded/);
  assert.match(view.laneFacts({ ...lanes[3], start: { time: at(0), source: 'parent' }, end: { state: 'stopped', time: at(60) } }).join(' · '), /Launch recorded by parent .* Stopped .* 1m from recorded launch to reported end/);

  const hostile = '<img src=x onerror=alert(1)>';
  snapshot.family.lanes[1].label = hostile;
  snapshot.family.lanes[1].key = '"><script>';
  snapshot.family.notes = [hostile];
  // A repeated lane key is drawn once.
  snapshot.family.lanes.push({ ...snapshot.family.lanes[3] });
  const html = view.render(snapshot, { now: at(3600), example: true });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(html.match(/<li class="lane /g).length, 4);
  assert.match(html, /class="lane depth-0"[\s\S]*class="lane depth-1"[\s\S]*class="lane depth-2"/);
  assert.match(html, /ONE TIME AXIS/);
  assert.match(html, /FIXED STATIONS · MAIN \+ 3 SUBAGENT LANES/);
  assert.match(html, /30s PER BAR · MAIN \+ 3 SUBAGENT LANES/);
  assert.match(html, /count each call once, in the lane of the agent that made it/);
  assert.doesNotMatch(html, /style="/, 'the lanes need no inline style, so the CSP is unchanged');

  // A session with no family data is one lane and says that no subagents were found.
  const alone = view.render({ ...view.demoSession(at(3600)), family: undefined }, { now: at(3600) });
  assert.equal(alone.match(/<li class="lane /g).length, 1);
  assert.match(alone, /No subagent transcripts were found for this session/);
  assert.match(alone, /FIXED STATIONS · FOLLOWED SESSION ONLY/);
});
