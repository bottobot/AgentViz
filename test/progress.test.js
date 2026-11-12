const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSession, applyRecord, PROGRESS_ITEMS } = require('../src/transcript');
const { render, progressFacts, demoSession } = require('../media/view');

// S05: progress from explicit agent task lists. Every record here is synthetic. PRIVATE_ strings stand for
// content that must never reach the view: prompts, task descriptions, explanations, tool output and paths.
// Record forms follow the providers' published tool definitions (see docs/development/agentviz-next-run.md);
// no local transcript held such a record, so these fixtures are built from those definitions.

let tick = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 12, 9, 0, tick++)).toISOString();
const claudeCall = (id, name, input) => ({ type: 'assistant', timestamp: stamp(), uuid: `a-${id}`, message: { content: [
  { type: 'text', text: 'PRIVATE_REPLY' }, { type: 'tool_use', id, name, input }] } });
const claudeResult = (id, toolUseResult, part = {}) => ({ type: 'user', timestamp: stamp(), uuid: `u-${id}`, toolUseResult,
  message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'PRIVATE_OUTPUT', ...part }] } });
const todo = (content, status) => ({ content, status, activeForm: `PRIVATE_ACTIVE ${content}` });
const codex = (payload, type = 'response_item') => ({ type, timestamp: stamp(), payload });
const planCall = (id, plan, extra = {}) => codex({ type: 'function_call', call_id: id, name: 'update_plan', arguments: JSON.stringify({ explanation: 'PRIVATE_EXPLANATION', plan, ...extra }) });
const planDone = (id, output = 'Plan updated') => codex({ type: 'function_call_output', call_id: id, output });
const apply = (state, ...records) => { for (const record of records) applyRecord(state, record); return state; };
const summary = state => state.progress.items.map(item => `${item.id}:${item.status}:${item.label}`);

function todoWrite(state, id, todos, part) {
  return apply(state, claudeCall(id, 'TodoWrite', { todos }), claudeResult(id, { oldTodos: [], newTodos: todos }, part));
}
function taskCreate(state, call, taskId, subject) {
  return apply(state, claudeCall(call, 'TaskCreate', { subject, description: 'PRIVATE_DESCRIPTION', activeForm: 'PRIVATE_ACTIVE', metadata: { note: 'PRIVATE_METADATA' } }),
    claudeResult(call, { task: { id: taskId, subject } }));
}
function taskUpdate(state, call, input, result = { success: true, taskId: input.taskId, updatedFields: ['status'] }, part) {
  return apply(state, claudeCall(call, 'TaskUpdate', { description: 'PRIVATE_DESCRIPTION', ...input }), claudeResult(call, result, part));
}

test('no list record means no progress, whatever the amount of tool activity', () => {
  const claude = createSession('claude', 'session');
  for (let index = 0; index < 40; index++) apply(claude, claudeCall(`read-${index}`, 'Read', { file_path: 'C:/PRIVATE_PATH/a.js' }), claudeResult(`read-${index}`, { filePath: 'C:/PRIVATE_PATH' }));
  apply(claude, { type: 'assistant', timestamp: stamp(), uuid: 'end', message: { stop_reason: 'end_turn', content: [] } });
  assert.equal(claude.progress, null);
  assert.equal(claude.events.filter(event => event.kind === 'files').length, 40);

  const rollout = createSession('codex', 'session');
  for (let index = 0; index < 40; index++) apply(rollout, codex({ type: 'function_call', call_id: `c-${index}`, name: 'shell_command', arguments: '{}' }), planDone(`c-${index}`, 'ok'));
  apply(rollout, codex({ type: 'task_complete', turn_id: 't' }, 'event_msg'));
  assert.equal(rollout.progress, null);
  assert.ok(Object.keys(rollout).includes('progress'), 'progress is part of the snapshot the host forwards');
});

test('Claude TodoWrite is a replacement list: the newest accepted list is the whole list', () => {
  const state = createSession('claude', 'session');
  todoWrite(state, 'todo-1', [todo('Read the parser', 'completed'), todo('Write the test', 'in_progress'), todo('Run the suite', 'pending')]);
  assert.equal(state.progress.source, 'claude-todos');
  assert.deepEqual(summary(state), ['1:completed:Read the parser', '2:in_progress:Write the test', '3:pending:Run the suite']);
  // A shorter list replaces the longer one; nothing of the old list survives.
  todoWrite(state, 'todo-2', [todo('Write the test', 'completed'), todo('Ship it', 'in_progress')]);
  assert.deepEqual(summary(state), ['1:completed:Write the test', '2:in_progress:Ship it']);
  // A refused call changes nothing, and neither does a call that has no result yet.
  todoWrite(state, 'todo-3', [todo('Refused list', 'completed')], { is_error: true });
  apply(state, claudeCall('todo-4', 'TodoWrite', { todos: [todo('Unanswered list', 'completed')] }));
  assert.deepEqual(summary(state), ['1:completed:Write the test', '2:in_progress:Ship it']);
  // An empty list is an explicit empty list, not an absent one.
  todoWrite(state, 'todo-5', []);
  assert.deepEqual([state.progress.source, state.progress.items.length], ['claude-todos', 0]);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_/);
});

test('Claude Task records build a list by task ID: create, update, rename, delete and list read-back', () => {
  const state = createSession('claude', 'session');
  taskCreate(state, 'c-1', '1', 'Map the records');
  taskCreate(state, 'c-2', '2', 'Draw the panel');
  taskCreate(state, 'c-3', '3', 'Check the output');
  assert.equal(state.progress.source, 'claude-tasks');
  assert.deepEqual(summary(state), ['1:pending:Map the records', '2:pending:Draw the panel', '3:pending:Check the output']);
  taskUpdate(state, 'u-1', { taskId: '1', status: 'in_progress' });
  taskUpdate(state, 'u-2', { taskId: '1', status: 'completed' });
  // The model's raw key names are stored as written; id and task_id are the documented near misses.
  taskUpdate(state, 'u-3', { id: '2', status: 'in_progress', subject: 'Draw the progress panel' });
  taskUpdate(state, 'u-4', { task_id: '3', status: 'deleted' });
  assert.deepEqual(summary(state), ['1:completed:Map the records', '2:in_progress:Draw the progress panel']);
  // Refused or unsuccessful updates change nothing.
  taskUpdate(state, 'u-5', { taskId: '2', status: 'completed' }, { success: false, taskId: '2', updatedFields: [], error: 'PRIVATE_ERROR' });
  taskUpdate(state, 'u-6', { taskId: '2', status: 'completed' }, 'PRIVATE_ERROR_TEXT', { is_error: true });
  apply(state, claudeCall('u-7', 'TaskUpdate', { taskId: '2', status: 'completed' }));
  assert.equal(state.progress.items[1].status, 'in_progress');
  // An update for a task this transcript never created is counted, never turned into an item.
  taskUpdate(state, 'u-8', { taskId: '77', status: 'completed' });
  assert.equal(state.progress.unmatched, 1);
  assert.equal(state.progress.items.length, 2);
  // A create whose result holds no task ID cannot be followed and says so.
  apply(state, claudeCall('c-4', 'TaskCreate', { subject: 'No recorded ID' }), claudeResult('c-4', 'PRIVATE_TEXT_RESULT'));
  assert.equal(state.progress.unreadable, 1);
  assert.equal(state.progress.items.length, 2);
  // TaskList is the source's own full list and replaces what was built up.
  apply(state, claudeCall('l-1', 'TaskList', {}), claudeResult('l-1', { tasks: [
    { id: '1', subject: 'Map the records', status: 'completed', blockedBy: [] },
    { id: '2', subject: 'Draw the progress panel', status: 'completed', owner: 'PRIVATE_OWNER', blockedBy: [] },
    { id: '9', subject: 'Added elsewhere', status: 'pending', blockedBy: ['PRIVATE_BLOCK'] }] }));
  assert.deepEqual(summary(state), ['1:completed:Map the records', '2:completed:Draw the progress panel', '9:pending:Added elsewhere']);
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_/);
});

test('Codex update_plan is a replacement list read from the structured call, and only when it was accepted', () => {
  const state = createSession('codex', 'session');
  apply(state, planCall('p-1', [{ step: 'Inspect the adapter', status: 'completed' }, { step: 'Add the reader', status: 'in_progress' }, { step: 'Verify', status: 'pending' }]));
  assert.equal(state.progress, null, 'a call without its output is not an accepted plan');
  apply(state, planDone('p-1'));
  assert.equal(state.progress.source, 'codex-plan');
  assert.deepEqual(summary(state), ['1:completed:Inspect the adapter', '2:in_progress:Add the reader', '3:pending:Verify']);
  apply(state, planCall('p-2', [{ step: 'Add the reader', status: 'completed' }, { step: 'Verify', status: 'in_progress' }]), planDone('p-2'));
  assert.deepEqual(summary(state), ['1:completed:Add the reader', '2:in_progress:Verify']);
  // A failed call and unparseable arguments leave the accepted plan alone.
  apply(state, planCall('p-3', [{ step: 'Refused', status: 'completed' }]), planDone('p-3', JSON.stringify({ exit_code: 1, output: 'PRIVATE_OUTPUT' })));
  apply(state, codex({ type: 'function_call', call_id: 'p-4', name: 'update_plan', arguments: '{"plan": [PRIVATE_BROKEN' }), planDone('p-4'));
  assert.deepEqual(summary(state), ['1:completed:Add the reader', '2:in_progress:Verify']);
  assert.equal(state.progress.unreadable, 1);
  // A plan written as program text inside a code call is counted as not read; its content is never parsed.
  const code = 'const r = await tools.update_plan({ plan: [{ step: "PRIVATE_CODE_STEP", status: "completed" }] }); await tools.shell_command({ command: "PRIVATE_COMMAND" });';
  const exec = codex({ type: 'custom_tool_call', call_id: 'x-1', name: 'exec', input: code });
  apply(state, exec, exec, codex({ type: 'custom_tool_call_output', call_id: 'x-1', output: [{ type: 'text', text: 'PRIVATE_OUTPUT' }] }));
  assert.equal(state.progress.unread, 1);
  assert.deepEqual(summary(state), ['1:completed:Add the reader', '2:in_progress:Verify']);
  const only = apply(createSession('codex', 'other'), exec);
  assert.deepEqual([only.progress.source, only.progress.items.length, only.progress.unread], ['', 0, 1]);
  assert.doesNotMatch(JSON.stringify([state, only]), /PRIVATE_/);
});

test('duplicate records are applied once and cannot bring back an older list', () => {
  const state = createSession('claude', 'session');
  const firstCall = claudeCall('todo-1', 'TodoWrite', { todos: [todo('Old item', 'in_progress')] });
  const firstResult = claudeResult('todo-1', {});
  apply(state, firstCall, firstCall, firstResult, firstResult);
  todoWrite(state, 'todo-2', [todo('Old item', 'completed'), todo('New item', 'in_progress')]);
  apply(state, firstCall, firstResult, firstResult);
  assert.deepEqual(summary(state), ['1:completed:Old item', '2:in_progress:New item']);

  const tasks = createSession('claude', 'session');
  taskCreate(tasks, 'c-1', '1', 'Only once');
  taskCreate(tasks, 'c-1', '1', 'Only once');
  taskCreate(tasks, 'c-9', '1', 'Same ID again');
  taskUpdate(tasks, 'u-1', { taskId: '1', status: 'completed' });
  taskUpdate(tasks, 'u-1', { taskId: '1', status: 'pending' });
  assert.deepEqual(summary(tasks), ['1:completed:Only once']);

  const rollout = createSession('codex', 'session');
  const plan = planCall('p-1', [{ step: 'First plan', status: 'in_progress' }]);
  const done = planDone('p-1');
  apply(rollout, plan, plan, done, done, planCall('p-2', [{ step: 'First plan', status: 'completed' }]), planDone('p-2'), plan, done);
  assert.deepEqual(summary(rollout), ['1:completed:First plan']);
});

test('compaction and an ended turn leave the explicit list as recorded', () => {
  const state = createSession('claude', 'session');
  taskCreate(state, 'c-1', '1', 'Before compaction');
  taskCreate(state, 'c-2', '2', 'Still open');
  taskUpdate(state, 'u-1', { taskId: '1', status: 'in_progress' });
  apply(state, { type: 'system', subtype: 'compact_boundary', timestamp: stamp(), uuid: 'compact-1', content: 'PRIVATE_SUMMARY' });
  assert.deepEqual(summary(state), ['1:in_progress:Before compaction', '2:pending:Still open']);
  // Records after the boundary keep addressing the same task IDs.
  taskUpdate(state, 'u-2', { taskId: '1', status: 'completed' });
  taskCreate(state, 'c-3', '3', 'After compaction');
  apply(state, { type: 'assistant', timestamp: stamp(), uuid: 'end', message: { stop_reason: 'end_turn', content: [] } });
  assert.equal(state.status, 'complete');
  assert.deepEqual(summary(state), ['1:completed:Before compaction', '2:pending:Still open', '3:pending:After compaction']);

  const rollout = createSession('codex', 'session');
  apply(rollout, codex({ type: 'task_started', turn_id: 't-1' }, 'event_msg'), planCall('p-1', [{ step: 'Done step', status: 'completed' }, { step: 'Open step', status: 'in_progress' }]), planDone('p-1'),
    codex({ type: 'context_compacted', id: 'k-1' }, 'event_msg'), codex({ type: 'task_complete', turn_id: 't-1' }, 'event_msg'));
  assert.equal(rollout.status, 'complete');
  assert.deepEqual(summary(rollout), ['1:completed:Done step', '2:in_progress:Open step']);

  // The view says the turn ended with open items; it never rounds that up to done.
  const html = render({ ...JSON.parse(JSON.stringify(rollout)), family: undefined }, { now: rollout.updatedAt + 1000 });
  assert.match(html, /1 of 2 listed items completed/);
  assert.match(html, /last turn ended with 1 listed item still open/i);
  assert.doesNotMatch(html, /Every listed item is marked completed/);
});

test('labels are bounded, cleaned text; statuses outside the schema are not counted as done; long lists are cut openly', () => {
  const state = createSession('claude', 'session');
  const hostile = '<img src=x onerror=alert(1)>\u202E\u0000\r\n' + 'x'.repeat(400);
  todoWrite(state, 'todo-1', [todo(hostile, 'in_progress'), todo('', 'completed'), { content: { nested: 'PRIVATE_OBJECT' }, status: 'done' }, null, todo('Fine', 'COMPLETED')]);
  const items = state.progress.items;
  assert.equal([...items[0].label].length, 80);
  assert.doesNotMatch(items[0].label, /[\u0000-\u001f\u202e]/);
  assert.deepEqual(items.slice(1).map(item => [item.status, item.label]), [['completed', 'Unlabelled item'], ['unknown', 'Unlabelled item'], ['unknown', 'Unlabelled item'], ['unknown', 'Fine']]);
  assert.deepEqual(Object.keys(items[0]).sort(), ['id', 'label', 'status']);

  const html = render({ ...JSON.parse(JSON.stringify(state)) }, { now: state.updatedAt });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /1 of 5 listed items completed/);
  assert.match(html, /3 with a status this view does not recognise/);

  // Task IDs are short safe tokens; anything else is not used as an ID.
  const tasks = createSession('claude', 'session');
  apply(tasks, claudeCall('c-1', 'TaskCreate', { subject: 'Odd ID' }), claudeResult('c-1', { task: { id: '<script>PRIVATE_ID</script>', subject: 'Odd ID' } }));
  apply(tasks, claudeCall('c-2', 'TaskCreate', { subject: 'Number ID' }), claudeResult('c-2', { task: { id: 7, subject: 'Number ID' } }));
  assert.deepEqual(summary(tasks), ['7:pending:Number ID']);
  assert.equal(tasks.progress.unreadable, 1);

  const long = createSession('codex', 'session');
  apply(long, planCall('p-1', Array.from({ length: PROGRESS_ITEMS + 5 }, (_, index) => ({ step: `Step ${index}`, status: 'pending' }))), planDone('p-1'));
  assert.equal(long.progress.items.length, PROGRESS_ITEMS);
  assert.equal(long.progress.omitted, 5);
  assert.match(render(JSON.parse(JSON.stringify(long)), { now: long.updatedAt }), /5 further items in the source list are not shown or counted/);

  for (const record of [claudeCall('bad-1', 'TodoWrite', null), claudeCall('bad-2', 'TodoWrite', { todos: 'PRIVATE_STRING' }), claudeCall('bad-3', 'TaskUpdate', { taskId: {}, status: 5 }), claudeResult('bad-2', null), claudeResult('bad-3', []), claudeResult('never-called', { task: { id: '1' } })]) {
    assert.doesNotThrow(() => applyRecord(state, record));
  }
  assert.doesNotMatch(JSON.stringify([state, tasks, long]), /PRIVATE_/);
});

test('the progress area shows completed of total, the current explicit item, its source and what it does not prove', () => {
  const state = createSession('claude', 'session-main');
  taskCreate(state, 'c-1', '1', 'Map the records');
  taskCreate(state, 'c-2', '2', 'Draw the panel');
  taskCreate(state, 'c-3', '3', 'Check the output');
  taskUpdate(state, 'u-1', { taskId: '1', status: 'completed' });
  taskUpdate(state, 'u-2', { taskId: '2', status: 'in_progress' });
  const session = JSON.parse(JSON.stringify(state));
  const facts = progressFacts(session.progress);
  assert.deepEqual([facts.available, facts.total, facts.completed, facts.inProgress, facts.pending], [true, 3, 1, 1, 1]);
  assert.deepEqual(facts.current.map(item => item.id), ['2']);

  const html = render(session, { now: state.updatedAt + 5000 });
  const area = html.slice(html.indexOf('<div class="progress-block'), html.indexOf('<!-- /progress -->'));
  assert.ok(area.length > 0);
  assert.match(area, /1 of 3 listed items completed/);
  assert.match(area, /Current item/);
  assert.match(area, /Draw the panel/);
  assert.match(area, /Claude Task records/);
  assert.match(area, /the agent&#39;s own plan, not independently measured project completion/);
  assert.match(area, /<progress[^>]* max="3"[^>]* value="1"/);
  // A task label appears in the progress area and nowhere else in the page.
  const outside = html.replace(area, '');
  for (const label of ['Map the records', 'Draw the panel', 'Check the output']) assert.ok(!outside.includes(label), `${label} leaked outside the progress area`);
  assert.doesNotMatch(html, /PRIVATE_/);

  // Every item completed is still the agent's own statement.
  taskUpdate(state, 'u-3', { taskId: '2', status: 'completed' });
  taskUpdate(state, 'u-4', { taskId: '3', status: 'completed' });
  const done = render(JSON.parse(JSON.stringify(state)), { now: state.updatedAt });
  assert.match(done, /3 of 3 listed items completed/);
  assert.match(done, /Every listed item is marked completed/);
  assert.match(done, /not independently measured project completion/);
  // Tool counts never feed the bar.
  assert.doesNotMatch(done, /%\s*complete|percent complete/i);
});

test('an absent list reads as unavailable for either provider, with the reason, and never as zero progress', () => {
  for (const provider of ['claude', 'codex']) {
    const state = createSession(provider, 'session');
    const html = render(JSON.parse(JSON.stringify(state)), { now: 1000 });
    const area = html.slice(html.indexOf('<div class="progress-block'), html.indexOf('<!-- /progress -->'));
    assert.match(area, /Unavailable/);
    assert.match(area, /No explicit task list is recorded/);
    assert.match(area, /Tool activity is not used to estimate progress/);
    assert.doesNotMatch(area, /<progress|0 of 0/);
  }
  assert.equal(progressFacts(null).available, false);
  assert.equal(progressFacts(undefined).available, false);
  assert.equal(progressFacts({ source: 'made-up', items: [{ id: '1', status: 'completed', label: 'x' }] }).available, false);
  // Codex plan calls made in program text: unavailable, and the view says why.
  const coded = apply(createSession('codex', 'session'), codex({ type: 'custom_tool_call', call_id: 'x-1', name: 'exec', input: 'await tools.update_plan({plan: []})' }));
  const html = render(JSON.parse(JSON.stringify(coded)), { now: coded.updatedAt });
  assert.match(html, /Unavailable/);
  assert.match(html, /1 code call named the plan tool/);
  // An explicit empty list is not the same as no list.
  const empty = todoWrite(createSession('claude', 'session'), 'todo-1', []);
  assert.match(render(JSON.parse(JSON.stringify(empty)), { now: empty.updatedAt }), /The recorded list is empty/);
});

test('main and subagent lists stay separate: no merged total, each under its own lane name', () => {
  const main = createSession('claude', 'session-main');
  todoWrite(main, 'todo-1', [todo('Main item A', 'completed'), todo('Main item B', 'in_progress')]);
  const child = createSession('claude', 'agent-1');
  todoWrite(child, 'todo-1', [todo('Child item A', 'completed'), todo('Child item B', 'completed'), todo('Child item C', 'pending')]);
  const session = JSON.parse(JSON.stringify(main));
  const lane = (key, extra) => ({ key, parentKey: 'main', parentKnown: true, depth: 1, role: 'subagent', label: 'Explore', link: 'spawn', start: { time: main.startedAt, source: 'own' }, end: { state: 'open', time: null }, status: 'active', updatedAt: main.updatedAt, events: [], ...extra });
  session.family = { lanes: [
    { key: 'main', parentKey: '', parentKnown: true, depth: 0, role: 'main', start: { time: main.startedAt, source: 'own' }, end: { state: 'open', time: null }, updatedAt: main.updatedAt },
    lane('agent-1', { progress: JSON.parse(JSON.stringify(child.progress)) }),
    lane('agent-2', { label: '<b>checker</b>', progress: null })
  ], notes: [] };
  const html = render(session, { now: main.updatedAt });
  const area = html.slice(html.indexOf('<div class="progress-block'), html.indexOf('<!-- /progress -->'));
  assert.match(area, /1 of 2 listed items completed/);
  assert.match(area, /2 of 3 listed items completed/);
  assert.doesNotMatch(area, /3 of 5|of 5 listed/);
  assert.match(area, /Subagent lists are separate/);
  assert.match(area, /Explore/);
  assert.match(area, /&lt;b&gt;checker&lt;\/b&gt;[^<]*<\/b>[^]*?No explicit task list is recorded/);
  assert.doesNotMatch(area, /<b>checker<\/b>/);
  // When the host sends no list field for subagent lanes, the view says they are not loaded; it does not say "none".
  session.family.lanes[1] = lane('agent-1', {});
  session.family.lanes[2] = lane('agent-2', {});
  const unloaded = render(session, { now: main.updatedAt });
  assert.match(unloaded, /Task lists of the 2 subagent lanes are not loaded in this view/);
  assert.doesNotMatch(unloaded, /Child item/);
});

test('the host reader forwards the followed session\'s list from a transcript file, split writes included', async () => {
  const os = require('node:os');
  const fsp = require('node:fs/promises');
  const { FamilyReader } = require('../src/sessions');
  const folder = await fsp.mkdtemp(path.join(os.tmpdir(), 'agentviz-progress-'));
  try {
    const file = path.join(folder, 'session-main.jsonl');
    const line = record => JSON.stringify({ sessionId: 'session-main', cwd: 'C:\\work\\Example', ...record }) + '\n';
    const first = line(claudeCall('c-1', 'TaskCreate', { subject: 'Read from disk', description: 'PRIVATE_DESCRIPTION' })) + line(claudeResult('c-1', { task: { id: '1', subject: 'Read from disk' } }));
    const update = line(claudeCall('u-1', 'TaskUpdate', { taskId: '1', status: 'completed' }));
    await fsp.writeFile(file, first + update);
    const reader = new FamilyReader('claude', 'session-main');
    let snapshot = await reader.read(file, { files: [] });
    assert.deepEqual(snapshot.progress.items, [{ id: '1', status: 'pending', label: 'Read from disk' }]);
    // The update takes effect only once its result record has been appended.
    await fsp.appendFile(file, line(claudeResult('u-1', { success: true, taskId: '1', updatedFields: ['status'], statusChange: { from: 'pending', to: 'completed' } })));
    snapshot = await reader.read(file, { files: [] });
    assert.deepEqual(snapshot.progress.items, [{ id: '1', status: 'completed', label: 'Read from disk' }]);
    assert.equal(snapshot.progress.source, 'claude-tasks');
    const sent = JSON.stringify(snapshot);
    assert.doesNotMatch(sent, /PRIVATE_|pending":\{|"tasks"/);
    assert.match(render(JSON.parse(sent), { now: snapshot.updatedAt }), /1 of 1 listed item completed/);
  } finally { await fsp.rm(folder, { recursive: true, force: true }); }
});

test('the example session carries a synthetic list and the stylesheet styles the progress area without inline styles', () => {
  const demo = demoSession(1800000);
  assert.ok(progressFacts(demo.progress).available);
  const html = render(demo, { now: 1800000, example: true });
  assert.match(html, /class="progress-block/);
  assert.doesNotMatch(html.slice(html.indexOf('<div class="progress-block'), html.indexOf('<!-- /progress -->')), /style=/);
  const css = fs.readFileSync(path.join(__dirname, '..', 'media', 'style.css'), 'utf8');
  for (const rule of ['.progress-block', '.task-label', 'progress']) assert.ok(css.includes(rule), `${rule} is styled`);
});
