'use strict';
// Details on click (Robert, 12 November 2026): the host reads one event's call, output, turn messages, model and
// tokens again from the transcript, at the positions the reader noted. Synthetic transcripts only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FamilyReader } = require('../src/sessions');

const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agentviz-detail-'));
test.after(() => fs.rmSync(folder, { recursive: true, force: true }));
const write = (name, records) => { const file = path.join(folder, name); fs.writeFileSync(file, records.map(record => JSON.stringify(record)).join('\n') + '\n'); return file; };
const at = seconds => new Date(Date.UTC(2026, 10, 12, 10, 0, seconds)).toISOString();

const claudeRecords = [
  { type: 'user', uuid: 'u1', timestamp: at(0), cwd: '/work/demo', message: { role: 'user', content: 'Run the tests, then tell me — résumé ✓' } },
  { type: 'assistant', uuid: 'a1', timestamp: at(2), message: { model: 'claude-opus-5-5', role: 'assistant', content: [{ type: 'text', text: 'Running the suite now.' }, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npm test -- --grep detail', description: 'Run tests' } }],
    usage: { input_tokens: 12, output_tokens: 40, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 } } },
  { type: 'user', uuid: 'u2', timestamp: at(9), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'ok 1 - detail\n# pass 1' }], is_error: false }] } },
  { type: 'assistant', uuid: 'a2', timestamp: at(11), message: { model: 'claude-opus-5-5', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'All tests pass.' }], usage: { input_tokens: 3, output_tokens: 5, cache_read_input_tokens: 1240, cache_creation_input_tokens: 0 } } },
  { type: 'user', uuid: 'u3', timestamp: at(30), message: { role: 'user', content: 'Next task' } }
];

test('a Claude call answers with its input, output, duration, model, tokens, prompt and the messages around it', async () => {
  const file = write('claude.jsonl', claudeRecords);
  const reader = new FamilyReader('claude', 'claude-detail');
  const snapshot = await reader.read(file, { files: [] });
  assert.ok(snapshot.events.some(event => event.id === 'toolu_1'));
  assert.equal(JSON.stringify(snapshot).includes('npm test'), false, 'the snapshot itself still carries no command');
  const detail = await reader.detail('main', 'toolu_1');
  assert.equal(detail.ok, true);
  assert.equal(detail.tool, 'Bash');
  assert.match(detail.input, /"command": "npm test -- --grep detail"/);
  assert.equal(detail.output, 'ok 1 - detail\n# pass 1');
  assert.equal(detail.failed, false);
  assert.equal(detail.finished - detail.time, 7000);
  assert.equal(detail.model, 'claude-opus-5-5');
  assert.deepEqual(detail.tokens, { input: 12, output: 40, cacheRead: 1000, cacheWrite: 200, context: 1212 });
  assert.equal(detail.prompt.text, 'Run the tests, then tell me — résumé ✓');
  assert.deepEqual(detail.messages.map(message => [message.when, message.text]), [['before', 'Running the suite now.'], ['after', 'All tests pass.']]);
  assert.deepEqual(detail.notes, []);
});

test('a prompt event answers with its own text and the reply; the next prompt ends the turn', async () => {
  const file = write('claude-prompt.jsonl', claudeRecords);
  const reader = new FamilyReader('claude', 'claude-prompt');
  const snapshot = await reader.read(file, { files: [] });
  const prompt = snapshot.events.find(event => event.kind === 'prompt');
  const detail = await reader.detail('main', prompt.id);
  assert.equal(detail.prompt.text, 'Run the tests, then tell me — résumé ✓');
  assert.deepEqual(detail.messages.map(message => message.text), ['Running the suite now.', 'All tests pass.']);
  const next = snapshot.events.filter(event => event.kind === 'prompt')[1];
  assert.equal((await reader.detail('main', next.id)).prompt.text, 'Next task');
});

test('a transcript rewritten after it was read gives a note, never another call\'s data', async () => {
  const file = write('claude-rewrite.jsonl', claudeRecords);
  const reader = new FamilyReader('claude', 'claude-rewrite');
  await reader.read(file, { files: [] });
  fs.writeFileSync(file, `${JSON.stringify({ type: 'user', timestamp: at(0), message: { role: 'user', content: 'x'.repeat(50) } })}\n`.repeat(8));
  const detail = await reader.detail('main', 'toolu_1');
  assert.equal(detail.ok, true);
  assert.equal(detail.input, '');
  assert.equal(detail.output, '');
  assert.ok(detail.notes.some(note => /not found where it was recorded/.test(note)));
});

test('unknown lanes and events are refused without reading anything', async () => {
  const file = write('claude-unknown.jsonl', claudeRecords);
  const reader = new FamilyReader('claude', 'claude-unknown');
  await reader.read(file, { files: [] });
  assert.deepEqual(await reader.detail('elsewhere', 'toolu_1'), { ok: false, reason: 'not-found' });
  assert.deepEqual(await reader.detail('main', 'toolu_missing'), { ok: false, reason: 'not-found' });
  assert.deepEqual(await new FamilyReader('claude', 'never-read').detail('main', 'toolu_1'), { ok: false, reason: 'not-found' });
});

test('a Codex call answers with its program text, the joined output, the turn model, the nearest token report and the prompt', async () => {
  const file = write('codex.jsonl', [
    { type: 'session_meta', timestamp: at(0), payload: { id: 'codex-detail', cwd: '/work/demo' } },
    { type: 'event_msg', timestamp: at(1), payload: { type: 'task_started', turn_id: 't1', model_context_window: 200000 } },
    { type: 'turn_context', timestamp: at(1), payload: { turn_id: 't1', model: 'gpt-6-luna', effort: 'max' } },
    { type: 'response_item', timestamp: at(2), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions for /work/demo' }] } },
    { type: 'response_item', timestamp: at(3), payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'List the files' }] } },
    { type: 'response_item', timestamp: at(4), payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Listing them.' }] } },
    { type: 'response_item', timestamp: at(5), payload: { type: 'custom_tool_call', call_id: 'call_1', name: 'exec', input: 'const r = await tools.exec_command({ cmd: "ls" });' } },
    { type: 'response_item', timestamp: at(6), payload: { type: 'custom_tool_call_output', call_id: 'call_1', output: [{ type: 'input_text', text: 'a.js' }, { type: 'input_text', text: 'b.js' }] } },
    { type: 'event_msg', timestamp: at(7), payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 900, cached_input_tokens: 800, output_tokens: 30, reasoning_output_tokens: 10, total_tokens: 930 }, total_token_usage: { total_tokens: 5000 }, model_context_window: 200000 } } },
    { type: 'response_item', timestamp: at(8), payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Two files.' }] } },
    { type: 'event_msg', timestamp: at(9), payload: { type: 'task_complete', turn_id: 't1' } }
  ]);
  const reader = new FamilyReader('codex', 'codex-detail');
  await reader.read(file, { files: [] });
  const detail = await reader.detail('main', 'call_1');
  assert.equal(detail.tool, 'exec');
  assert.equal(detail.input, 'const r = await tools.exec_command({ cmd: "ls" });');
  assert.equal(detail.output, 'a.js\nb.js');
  assert.equal(detail.model, 'gpt-6-luna');
  assert.deepEqual(detail.tokens, { input: 900, output: 30, cacheRead: 800, cacheWrite: null, reasoning: 10, context: 930, window: 200000, sessionTotal: 5000 });
  assert.equal(detail.prompt.text, 'List the files', 'instruction blocks are not taken for the prompt');
  assert.deepEqual(detail.messages.map(message => [message.when, message.text]), [['before', 'Listing them.'], ['after', 'Two files.']]);
});

test('long inputs and outputs are cut, and the answer says by how much', async () => {
  const big = 'y'.repeat(30000);
  const file = write('claude-long.jsonl', [
    claudeRecords[0],
    { ...claudeRecords[1], message: { ...claudeRecords[1].message, content: [{ type: 'tool_use', id: 'toolu_2', name: 'Write', input: { file_path: '/work/demo/a.txt', content: big } }] } },
    { type: 'user', timestamp: at(9), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: big }] } }
  ]);
  const reader = new FamilyReader('claude', 'claude-long');
  await reader.read(file, { files: [] });
  const detail = await reader.detail('main', 'toolu_2');
  assert.equal(detail.output.length, 24 * 1024);
  assert.equal(detail.outputMore, 30000 - 24 * 1024);
  assert.ok(detail.inputMore > 0);
});
