'use strict';
// Details on click (Robert, 12 November 2026: "we need a lot more data to be available when I click on things").
// The live view carries short labels only. When the view asks about one event, the host reads that event's records
// again from the transcript, at the byte positions the reader noted (src/sessions.js, src/transcript.js), and
// answers with the full call, its output, the messages of its turn, the model and the token counts.
// Nothing here runs unless the view asks, and nothing is kept: each answer is read fresh and sent once.
// Every record found at a noted position is checked (same call ID, same kind of record) before it is used, so a
// transcript rewritten since it was read gives a note, never another call's data.
const fs = require('node:fs/promises');

// WARNING: disclosed limits. Each one is stated in the answer when it is reached.
const LINE_LIMIT = 4 * 1024 * 1024;     // the reader's own line limit
const TEXT_LIMIT = 24 * 1024;           // characters of one input, output or message shown
const TURN_BYTES = 16 * 1024 * 1024;    // bytes of one turn scanned for its messages and tokens
const TURN_LINES = 20000;               // records of one turn scanned
const MESSAGES = 30;                    // agent messages shown from one turn, nearest the event first
const CHUNK = 256 * 1024;

const notes = () => [];
function cut(text, limit = TEXT_LIMIT) {
  if (typeof text !== 'string') return { text: '', more: 0 };
  const clean = text.replace(/\r\n/g, '\n');
  return clean.length > limit ? { text: clean.slice(0, limit), more: clean.length - limit } : { text: clean, more: 0 };
}
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const name = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120) : '';

// A tool's input as readable text: JSON objects pretty-printed, program or patch text as it is.
function inputText(input) {
  if (typeof input === 'string') {
    try { const parsed = JSON.parse(input); if (parsed && typeof parsed === 'object') return JSON.stringify(parsed, null, 2); } catch { /* plain text */ }
    return input;
  }
  if (input === undefined || input === null) return '';
  try { return JSON.stringify(input, null, 2); } catch { return ''; }
}

// Text parts of a content value in any of the shapes the two providers write.
function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) {
    if (content && typeof content === 'object') {
      if (typeof content.output === 'string') return content.output;
      if (typeof content.text === 'string') return content.text;
      if (Array.isArray(content.content)) return contentText(content.content);
    }
    return '';
  }
  return content.map(part => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (part.type === 'image' || part.type === 'input_image') return '[image]';
    if (Array.isArray(part.content)) return contentText(part.content);
    return '';
  }).filter(Boolean).join('\n');
}

// One line from a byte position, parsed. Null when nothing usable is there.
async function recordAt(handle, position) {
  if (!Number.isSafeInteger(position) || position < 0) return null;
  const parts = [];
  let total = 0;
  for (;;) {
    const buffer = Buffer.alloc(Math.min(CHUNK, LINE_LIMIT + 1 - total));
    if (!buffer.length) return null;
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position + total);
    if (!bytesRead) break;
    const newline = buffer.subarray(0, bytesRead).indexOf(10);
    if (newline !== -1) { parts.push(buffer.subarray(0, newline)); break; }
    parts.push(buffer.subarray(0, bytesRead));
    total += bytesRead;
  }
  try {
    const record = JSON.parse(Buffer.concat(parts).toString('utf8'));
    return record && typeof record === 'object' && !Array.isArray(record) ? record : null;
  } catch { return null; }
}

// Records from a byte position onward, each with its own position, within the turn limits.
async function* recordsFrom(handle, start, state) {
  let position = start;
  let carry = Buffer.alloc(0);
  let lines = 0;
  while (position - start < TURN_BYTES) {
    const buffer = Buffer.alloc(CHUNK);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position + carry.length);
    if (!bytesRead) return;
    let data = Buffer.concat([carry, buffer.subarray(0, bytesRead)]);
    let at = 0;
    for (;;) {
      const newline = data.indexOf(10, at);
      if (newline === -1) break;
      const line = data.subarray(at, newline);
      const here = position + at;
      at = newline + 1;
      if (++lines > TURN_LINES) { state.limited = true; return; }
      if (line.length > LINE_LIMIT || !line.length) continue;
      let record;
      try { record = JSON.parse(line.toString('utf8')); } catch { continue; }
      if (record && typeof record === 'object' && !Array.isArray(record)) yield { position: here, record };
    }
    position += at;
    carry = data.subarray(at);
    if (carry.length > LINE_LIMIT) { position += carry.length; carry = Buffer.alloc(0); }
    data = null;
  }
  state.limited = true;
}

const time = record => { const value = typeof record?.timestamp === 'string' ? Date.parse(record.timestamp) : NaN; return Number.isFinite(value) ? value : null; };

// ---- Claude ----------------------------------------------------------------------------------------------------
const claudeParts = record => Array.isArray(record?.message?.content) ? record.message.content : [];
const claudeTokens = usage => usage && typeof usage === 'object' ? {
  input: number(usage.input_tokens), output: number(usage.output_tokens), cacheRead: number(usage.cache_read_input_tokens), cacheWrite: number(usage.cache_creation_input_tokens),
  context: [usage.input_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens].every(value => Number.isFinite(value)) ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens : null
} : null;
function claudePrompt(record) {
  if (record?.type !== 'user') return null;
  const parts = claudeParts(record);
  if (parts.some(part => part?.type === 'tool_result')) return null;
  const text = typeof record.message?.content === 'string' ? record.message.content : parts.filter(part => part?.type === 'text').map(part => part.text).join('\n');
  if (!text || text.trimStart().startsWith('<task-notification>')) return null;
  return text;
}
const claude = {
  call(record, id) {
    if (record?.type !== 'assistant') return null;
    const part = claudeParts(record).find(entry => entry?.type === 'tool_use' && entry.id === id);
    return part ? { tool: name(part.name), input: part.input, model: name(record.message?.model), tokens: claudeTokens(record.message?.usage) } : null;
  },
  result(record, id) {
    if (record?.type !== 'user') return null;
    const part = claudeParts(record).find(entry => entry?.type === 'tool_result' && entry.tool_use_id === id);
    if (!part) return null;
    let output = contentText(part.content);
    if (!output && record.toolUseResult !== undefined) output = inputText(record.toolUseResult);
    return { output, failed: part.is_error === true };
  },
  prompt: claudePrompt,
  messages(record) {
    if (record?.type !== 'assistant') return [];
    return claudeParts(record).filter(part => part?.type === 'text' && typeof part.text === 'string' && part.text.trim()).map(part => part.text);
  },
  tokens(record) { return record?.type === 'assistant' ? claudeTokens(record.message?.usage) : null; },
  model(record) { return record?.type === 'assistant' ? name(record.message?.model) : ''; },
  // A new prompt ends the turn being read.
  ends(record) { return claudePrompt(record) !== null; }
};

// ---- Codex -----------------------------------------------------------------------------------------------------
// Verified local shapes (2026-11-12): custom_tool_call { call_id, name, input } and custom_tool_call_output { call_id,
// output: [{ type: 'input_text', text }] }; older rollouts use function_call { arguments } and a string output.
// Prompts are response_item messages with role user (instruction blocks skipped) or, in older rollouts, event_msg
// user_message. Agent text is response_item message role assistant, output_text parts. token_count carries
// info.last_token_usage, info.total_token_usage and info.model_context_window.
const INSTRUCTION = /^\s*(?:# AGENTS\.md instructions|<environment_context|<user_instructions|<permissions|<INSTRUCTIONS>|<turn_aborted)/;
function codexPrompt(record) {
  const payload = record?.payload;
  if (record?.type === 'event_msg' && payload?.type === 'user_message' && typeof payload.message === 'string') return payload.message;
  if (record?.type === 'response_item' && payload?.type === 'message' && payload.role === 'user') {
    const text = (Array.isArray(payload.content) ? payload.content : []).filter(part => typeof part?.text === 'string' && !INSTRUCTION.test(part.text)).map(part => part.text).join('\n');
    return text.trim() ? text : null;
  }
  return null;
}
const codexTokens = info => {
  const last = info?.last_token_usage;
  if (!last || typeof last !== 'object') return null;
  return { input: number(last.input_tokens), output: number(last.output_tokens), cacheRead: number(last.cached_input_tokens), cacheWrite: number(last.cache_write_input_tokens),
    reasoning: number(last.reasoning_output_tokens), context: number(last.total_tokens), window: number(info.model_context_window), sessionTotal: number(info.total_token_usage?.total_tokens) };
};
const codex = {
  call(record, id) {
    const payload = record?.payload;
    if (record?.type !== 'response_item' || (payload?.type !== 'function_call' && payload?.type !== 'custom_tool_call') || payload.call_id !== id) return null;
    return { tool: name(payload.name), input: typeof payload.arguments === 'string' ? payload.arguments : payload.input, model: '', tokens: null };
  },
  result(record, id) {
    const payload = record?.payload;
    if (record?.type !== 'response_item' || (payload?.type !== 'function_call_output' && payload?.type !== 'custom_tool_call_output') || payload.call_id !== id) return null;
    const output = contentText(payload.output);
    let failed = false;
    try { const parsed = typeof payload.output === 'string' ? JSON.parse(payload.output) : payload.output; failed = Number.isFinite(parsed?.metadata?.exit_code) && parsed.metadata.exit_code !== 0; } catch { /* plain text */ }
    if (!failed) { const exit = output.match(/(?:Process exited with code|exit code\s*:)\s*(-?\d+)/i); failed = !!exit && Number(exit[1]) !== 0; }
    return { output, failed };
  },
  prompt: codexPrompt,
  messages(record) {
    const payload = record?.payload;
    if (record?.type !== 'response_item' || payload?.type !== 'message' || payload.role !== 'assistant') return [];
    return (Array.isArray(payload.content) ? payload.content : []).filter(part => typeof part?.text === 'string' && part.text.trim()).map(part => part.text);
  },
  tokens(record) { return record?.type === 'event_msg' && record.payload?.type === 'token_count' ? codexTokens(record.payload.info) : null; },
  model(record) { return record?.type === 'turn_context' ? name(record.payload?.model) : ''; },
  ends(record) { return (record?.type === 'event_msg' && record.payload?.type === 'task_started') || codexPrompt(record) !== null; }
};

// The answer for one event. `event` is the reader's own event object; its `at` holds the noted positions.
async function readDetail(provider, file, event) {
  const forms = provider === 'claude' ? claude : codex;
  const at = event?.at || {};
  const answer = { ok: true, id: event.id, kind: event.kind, label: event.label, outcome: event.outcome, time: event.time, provider,
    tool: '', input: '', inputMore: 0, output: '', outputMore: 0, failed: event.outcome === 'error', finished: at.finished || null,
    prompt: null, messages: [], messagesMore: 0, model: at.model || '', tokens: null, notes: notes() };
  let handle;
  try { handle = await fs.open(file, 'r'); }
  catch (error) { return { ok: false, reason: error.code === 'ENOENT' ? 'not-found' : 'source-unavailable' }; }
  try {
    const isCall = Number.isSafeInteger(at.call);
    if (isCall) {
      const call = forms.call(await recordAt(handle, at.call), event.id);
      if (!call) answer.notes.push('The call was not found where it was recorded; the transcript may have been rewritten. Press Refresh and try again.');
      else {
        answer.tool = call.tool;
        const input = cut(inputText(call.input));
        answer.input = input.text; answer.inputMore = input.more;
        if (call.model) answer.model = call.model;
        if (call.tokens) answer.tokens = call.tokens;
      }
      if (at.result >= 0) {
        const result = forms.result(await recordAt(handle, at.result), event.id);
        if (!result) answer.notes.push('The result was not found where it was recorded. Press Refresh and try again.');
        else {
          const output = cut(result.output);
          answer.output = output.text; answer.outputMore = output.more; answer.failed = result.failed || answer.failed;
          if (!output.text) answer.notes.push('The tool returned no text.');
        }
      } else answer.notes.push(event.outcome === 'running' ? 'No result is recorded yet; the call may still be running.' : 'No result is recorded for this call.');
    }

    // The turn: from its first record to the next prompt, within the limits.
    const anchor = isCall ? at.call : Number.isSafeInteger(at.record) ? at.record : -1;
    const start = Number.isSafeInteger(at.turn) && at.turn >= 0 && at.turn <= anchor ? at.turn : anchor;
    if (start >= 0) {
      const scan = { limited: false };
      const before = [];
      const after = [];
      let lastTokens = null;
      let tokensAfter = null;
      let first = true;
      const after0 = isCall && at.result >= 0 ? at.result : anchor;
      for await (const { position, record } of recordsFrom(handle, start, scan)) {
        if (!first && position > anchor && forms.ends(record)) break;
        if (first || position === start) {
          const text = forms.prompt(record);
          if (text !== null) { const prompt = cut(text); answer.prompt = { text: prompt.text, more: prompt.more, time: time(record) }; }
        } else if (!answer.prompt && position <= anchor) {
          const text = forms.prompt(record);
          if (text !== null) { const prompt = cut(text); answer.prompt = { text: prompt.text, more: prompt.more, time: time(record) }; }
        }
        first = false;
        const model = forms.model(record);
        if (model && (position <= anchor || !answer.model)) answer.model = model;
        const tokens = forms.tokens(record);
        if (tokens) { if (position <= after0) lastTokens = tokens; else if (!tokensAfter) tokensAfter = tokens; }
        for (const text of forms.messages(record)) {
          const message = cut(text, TEXT_LIMIT / 2);
          (position <= anchor ? before : after).push({ text: message.text, more: message.more, time: time(record), when: position <= anchor ? 'before' : 'after' });
        }
        if (after.length > MESSAGES) break;
      }
      if (!answer.tokens) answer.tokens = tokensAfter || lastTokens;
      const half = Math.floor(MESSAGES / 2);
      const keepBefore = before.slice(-Math.max(half, MESSAGES - after.length));
      const keepAfter = after.slice(0, MESSAGES - keepBefore.length);
      answer.messages = [...keepBefore, ...keepAfter];
      answer.messagesMore = before.length + after.length - answer.messages.length;
      if (scan.limited) answer.notes.push(`Only the first ${TURN_BYTES / 1024 / 1024} MB or ${TURN_LINES} records of this turn were read for messages and tokens.`);
    }
    if (!answer.prompt && start >= 0) answer.notes.push('No prompt text was found for this turn.');
    return answer;
  } catch (error) {
    return { ok: false, reason: 'source-unavailable', code: error.code || 'unknown' };
  } finally { await handle.close(); }
}

module.exports = { readDetail, TEXT_LIMIT, MESSAGES };
