const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSession, applyRecord, describeTool, MAX_EVENTS } = require('../src/transcript');

const time = '2026-11-11T18:00:00.000Z';
const codex = (payload, type = 'response_item') => ({ type, timestamp: time, payload });

// SPEC: first-slice acceptance 1, tool starts and outcomes without payload text.
test('Claude tools are counted once, linked to results, and keep only safe names', () => {
  const state = createSession('claude', 'session');
  const call = { type: 'assistant', timestamp: time, cwd: 'C:\\private\\Project', message: { content: [
    { type: 'thinking', thinking: 'PRIVATE_THOUGHT' },
    { type: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: 'C:\\private\\Project\\src\\main.ts', content: 'PRIVATE_CODE' } }
  ] } };
  applyRecord(state, call);
  applyRecord(state, call);
  applyRecord(state, { type: 'user', timestamp: time, message: { content: [
    { type: 'tool_result', tool_use_id: 'read-1', is_error: true, content: 'PRIVATE_OUTPUT' }
  ] } });
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].kind, 'files');
  assert.equal(state.events[0].label, 'Reading src/main.ts');
  assert.equal(state.events[0].outcome, 'error');
  assert.equal(state.project, 'Project');
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_|C:\\\\private/);
});

test('Codex parses function and custom calls, handles unknown records, and detects failed commands', () => {
  const state = createSession('codex', 'session');
  applyRecord(state, codex({ type: 'user_message', message: 'PRIVATE_PROMPT' }, 'event_msg'));
  applyRecord(state, codex({ type: 'function_call', call_id: 'shell-1', name: 'exec_command', arguments: JSON.stringify({ cmd: 'npm test --token PRIVATE_SECRET' }) }));
  applyRecord(state, codex({ type: 'function_call_output', call_id: 'shell-1', output: 'Process exited with code 1\nPRIVATE_OUTPUT' }));
  applyRecord(state, codex({ type: 'custom_tool_call', call_id: 'patch-1', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: C:/private/Project/src/app.js\n+PRIVATE_CODE\n*** End Patch' }));
  applyRecord(state, codex({ type: 'new_unknown_format', text: 'PRIVATE_NEW_DATA' }));
  assert.equal(state.events.length, 3);
  assert.equal(state.events[1].label, 'Running tests');
  assert.equal(state.events[1].outcome, 'error');
  assert.equal(state.events[2].kind, 'edits');
  assert.equal(state.events[2].label, 'Editing src/app.js');
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE_/);
});

test('lifecycle and context come from source records, never from tool counts', () => {
  const state = createSession('codex', 'session');
  assert.equal(state.context, null);
  applyRecord(state, codex({ type: 'task_started', turn_id: 'turn-2', model_context_window: 1000 }, 'event_msg'));
  applyRecord(state, codex({ type: 'token_count', info: { last_token_usage: { total_tokens: 700 }, model_context_window: 1000 } }, 'event_msg'));
  applyRecord(state, codex({ type: 'task_complete', turn_id: 'turn-1' }, 'event_msg'));
  assert.equal(state.status, 'active');
  assert.equal(state.context, 70);
  applyRecord(state, codex({ type: 'task_complete', turn_id: 'turn-2' }, 'event_msg'));
  assert.equal(state.status, 'complete');
  applyRecord(state, codex({ type: 'task_started', turn_id: 'turn-3' }, 'event_msg'));
  assert.equal(state.status, 'active');
});

test('metadata preserves child identity when a Codex child repeats parent metadata', () => {
  const state = createSession('codex', 'child');
  applyRecord(state, codex({ id: 'child', cwd: 'C:/work/Project', source: { subagent: { thread_spawn: { parent_thread_id: 'parent', agent_role: 'explorer' } } } }, 'session_meta'));
  applyRecord(state, codex({ id: 'parent', cwd: 'C:/work/Other' }, 'session_meta'));
  assert.equal(state.project, 'Project');
  assert.equal(state.parent, 'parent');
});

test('tool descriptions do not reveal shell arguments, URL queries or text payloads', () => {
  assert.deepEqual(describeTool('PowerShell', { command: 'Get-ChildItem C:/private --secret PASSWORD' }), { kind: 'shell', label: 'Running Get-ChildItem' });
  assert.deepEqual(describeTool('WebFetch', { url: 'https://example.org/private?token=PASSWORD' }), { kind: 'network', label: 'Fetching example.org' });
  assert.equal(describeTool('mcp__server__unknown', { text: 'PASSWORD' }).label, 'unknown');
  assert.equal(describeTool('exec', 'await tools.apply_patch("PRIVATE_CODE")').kind, 'edits');
  assert.doesNotThrow(() => describeTool(null, null));
  assert.equal(describeTool('Read', { file_path: 'C:/' + 'long-directory/'.repeat(20) + 'src/main.js' }).label, 'Reading src/main.js');
  assert.equal(describeTool('web__run', {}).kind, 'network');
  assert.equal(describeTool('Read', { file_path: 'C:\\secret.txt' }).label, 'Reading secret.txt');
});

test('malformed record shapes are ignored, including invalid context and dates', () => {
  const state = createSession('claude', 'session');
  for (const record of [null, [], 3, { type: 'new_unknown_format', timestamp: { toString: 'bad' } }, { type: 'assistant', timestamp: 'invalid', message: { content: 'wrong' } }, { type: 'assistant', timestamp: time, message: { content: [null, 4, { type: 'tool_use', name: 'Read' }] } }]) {
    assert.doesNotThrow(() => applyRecord(state, record));
  }
  assert.equal(state.events.length, 0);
});

test('bounded history discloses omissions and releases old call lookup entries', () => {
  const state = createSession('codex', 'session');
  for (let index = 0; index < MAX_EVENTS + 2; index++) applyRecord(state, codex({ type: 'function_call', call_id: String(index), name: 'Read', arguments: '{}' }));
  assert.equal(state.events.length, MAX_EVENTS);
  assert.equal(state.droppedEvents, 2);
  assert.equal(state.calls.size, MAX_EVENTS);
  assert.equal(state.events[0].id, '2');
});
