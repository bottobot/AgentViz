'use strict';

const { createHash } = require('node:crypto');

// WARNING: retained history is bounded; droppedEvents is always shown in the view.
const MAX_EVENTS = 10000;
const shortName = value => typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160) : '';
const pathParts = value => typeof value === 'string' ? value.replace(/\\/g, '/').split('/').filter(part => part && !/^[a-z]:$/i.test(part)) : [];
const fileName = value => shortName(pathParts(value).slice(-2).join('/'));
const projectName = value => shortName(pathParts(value).at(-1));

const UNNAMED_SESSION = 'Unnamed session';
const TITLE_LENGTH = 80;

// Saved provider titles are display metadata: one short line, no control or direction-override characters.
// Markup characters stay as text; the view escapes them where it writes HTML.
function sessionTitle(value) {
  if (typeof value !== 'string') return '';
  const characters = [...value.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '').replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim()];
  return characters.length > TITLE_LENGTH ? characters.slice(0, TITLE_LENGTH - 1).join('').trimEnd() + '\u2026' : characters.join('');
}

// Windows drive and UNC paths compare without case or separator differences. Any other path is treated as
// POSIX and compared exactly, so a Linux directory recorded in a transcript keeps its case semantics.
// The key is opaque; the absolute path and its segments stay in the extension host.
function workspaceIdentity(cwd) {
  if (typeof cwd !== 'string' || !cwd.trim()) return null;
  const windows = /^[a-z]:(?:[\\/]|$)/i.test(cwd) || cwd.startsWith('\\\\');
  const segments = (windows ? cwd.replace(/\\/g, '/') : cwd).split('/').filter(Boolean);
  const normal = windows ? `win:${cwd.startsWith('\\\\') ? '//' : ''}${segments.join('/').toLowerCase()}` : `posix:/${segments.join('/')}`;
  return { key: `ws:${createHash('sha256').update(normal).digest('hex').slice(0, 20)}`, segments, windows };
}

function describeTool(name, input) {
  const tool = shortName(name).split(/__|\./).at(-1) || 'Tool';
  const lower = tool.toLowerCase();
  const args = input && typeof input === 'object' ? input : {};
  const file = fileName(args.file_path || args.filePath || args.path);
  if (/^(read|read_file|view_image|glob|grep|list_directory|search_files|list_files)$/.test(lower)) {
    return { kind: 'files', label: file ? `Reading ${file}` : /grep|glob|search/.test(lower) ? 'Searching files' : 'Reading files' };
  }
  if (/^(edit|write|multiedit|edit_file|write_file|apply_patch|notebookedit)$/.test(lower)) {
    const patchFile = typeof input === 'string' ? input.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/m)?.[1] : '';
    return { kind: 'edits', label: file || patchFile ? `Editing ${file || fileName(patchFile)}` : 'Editing files' };
  }
  if (/agent|spawn|collab|task$/.test(lower) && !/taskkill/.test(lower)) return { kind: 'agents', label: /wait/.test(lower) ? 'Waiting for agents' : 'Working with agents' };
  if (/memory|todo|plan|goal/.test(lower)) return { kind: 'memory', label: /todo|plan|goal/.test(lower) ? 'Updating plan' : 'Using memory' };
  if (/web|fetch|browse|navigate|search_query/.test(lower) || /^(?:web__|mcp__chrome|mcp__playwright)/i.test(name)) {
    let host = '';
    try { host = new URL(args.url).hostname; } catch { /* A search has no hostname. */ }
    return { kind: 'network', label: host ? `Fetching ${shortName(host)}` : 'Searching the web' };
  }
  if (lower === 'exec' && typeof input === 'string') {
    const nested = [...input.matchAll(/tools\.([\w]+)\s*\(/g)].map(match => describeTool(match[1], {}));
    if (nested.length && nested.every(item => item.kind === nested[0].kind)) return nested[0];
    return { kind: 'shell', label: 'Running tools' };
  }
  if (/^(bash|powershell|shell|exec_command|run_command|start_process|terminal)$/.test(lower)) {
    const command = typeof (args.cmd || args.command) === 'string' ? (args.cmd || args.command).trim() : '';
    if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|^(?:pytest|vitest|jest)\b|^(?:cargo|go|dotnet)\s+test\b|^node\s+--test\b/i.test(command)) return { kind: 'shell', label: 'Running tests' };
    if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build\b|^(?:cargo|dotnet)\s+build\b/i.test(command)) return { kind: 'shell', label: 'Building' };
    const executable = command.match(/^([A-Za-z][A-Za-z0-9_.-]*)(?=\s|$)/)?.[1];
    return { kind: 'shell', label: executable ? `Running ${executable}` : 'Running a command' };
  }
  return { kind: 'other', label: tool.replace(/[^\w .-]/g, '') || 'Tool' };
}

function createSession(provider, id) {
  const state = { provider, id, project: '', parent: null, events: [], status: 'unknown', context: null, updatedAt: 0, invalidLines: 0, oversizedLines: 0, droppedEvents: 0 };
  Object.defineProperties(state, {
    calls: { value: new Map() },
    markers: { value: new Set() },
    turn: { value: null, writable: true },
    capacity: { value: null, writable: true }
  });
  return state;
}

function push(state, event) {
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) {
    const removed = state.events.shift();
    state.calls.delete(removed.id);
    state.markers.delete(removed.id);
    state.droppedEvents++;
  }
}

function marker(state, time, kind, id, label) {
  const key = `${kind}:${id || time}`;
  if (state.markers.has(key)) return;
  state.markers.add(key);
  push(state, { id: key, time, kind, label, outcome: 'success' });
}

function startTool(state, time, id, name, input) {
  if (typeof id !== 'string' || !id || typeof name !== 'string' || state.calls.has(id)) return;
  const event = { id: shortName(id), time, ...describeTool(name, input), outcome: 'running' };
  state.calls.set(id, event);
  push(state, event);
  state.status = 'active';
}

function finishTool(state, id, failed) {
  const event = state.calls.get(id);
  if (event) event.outcome = failed ? 'error' : 'success';
}

function failedOutput(output) {
  if (output && typeof output === 'object') return output.isError === true || output.is_error === true || (typeof output.exit_code === 'number' && output.exit_code !== 0);
  if (typeof output !== 'string') return false;
  try { return failedOutput(JSON.parse(output)); } catch { /* Most command outputs are plain text. */ }
  const exit = output.match(/(?:Process exited with code|exit code\s*:|"exit_code"\s*:)\s*(-?\d+)/i);
  return !!exit && Number(exit[1]) !== 0;
}

function applyRecord(state, record) {
  if (!record || typeof record !== 'object') return;
  const time = typeof record.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
  const validTime = Number.isFinite(time);
  if (validTime) state.updatedAt = Math.max(state.updatedAt, time);
  if (state.provider === 'claude') {
    if (typeof record.cwd === 'string') state.project = projectName(record.cwd);
    if (!validTime) return;
    const content = Array.isArray(record.message?.content) ? record.message.content : [];
    if (record.type === 'assistant') {
      for (const part of content) if (part?.type === 'tool_use') startTool(state, time, part.id, part.name, part.input);
      if (record.message?.stop_reason === 'end_turn') {
        state.status = 'complete';
        marker(state, time, 'complete', record.uuid, 'Turn complete');
      }
    } else if (record.type === 'user') {
      for (const part of content) if (part?.type === 'tool_result') finishTool(state, part.tool_use_id, part.is_error === true);
      if ((typeof record.message?.content === 'string' || content.some(part => part?.type === 'text')) && !content.some(part => part?.type === 'tool_result')) {
        marker(state, time, 'prompt', record.uuid, 'User prompt');
        state.status = 'active';
      }
    } else if (record.type === 'system' && record.subtype === 'compact_boundary') marker(state, time, 'compaction', record.uuid, 'Context compacted');
    return;
  }

  const payload = record.payload;
  if (!payload || typeof payload !== 'object') return;
  if (record.type === 'session_meta') {
    if (typeof payload.id === 'string' && payload.id !== state.id) return;
    if (typeof payload.cwd === 'string') state.project = projectName(payload.cwd);
    const parent = payload.source?.subagent?.thread_spawn?.parent_thread_id;
    if (typeof parent === 'string') state.parent = shortName(parent);
    return;
  }
  if (!validTime) return;
  if (record.type === 'response_item') {
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      let input = payload.input;
      if (typeof payload.arguments === 'string') {
        try { input = JSON.parse(payload.arguments); } catch { input = {}; }
      }
      startTool(state, time, payload.call_id, payload.name, input);
    } else if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') finishTool(state, payload.call_id, failedOutput(payload.output));
    return;
  }
  if (record.type !== 'event_msg') return;
  if (payload.type === 'user_message') {
    marker(state, time, 'prompt', payload.id, 'User prompt');
    state.status = 'active';
  } else if (payload.type === 'task_started') {
    state.turn = payload.turn_id || null;
    state.status = 'active';
    if (Number.isFinite(payload.model_context_window) && payload.model_context_window > 0) state.capacity = payload.model_context_window;
  } else if (payload.type === 'task_complete' || payload.type === 'turn_aborted') {
    if (payload.turn_id && state.turn && payload.turn_id !== state.turn) return;
    state.status = payload.type === 'task_complete' ? 'complete' : 'paused';
    marker(state, time, payload.type === 'task_complete' ? 'complete' : 'paused', payload.turn_id, payload.type === 'task_complete' ? 'Turn complete' : 'Turn paused');
  } else if (payload.type === 'context_compacted') marker(state, time, 'compaction', payload.id, 'Context compacted');
  else if (payload.type === 'token_count') {
    const usage = payload.info?.last_token_usage;
    const capacity = payload.info?.model_context_window || state.capacity;
    const used = usage?.total_tokens;
    if (Number.isFinite(capacity) && capacity > 0 && Number.isFinite(used) && used >= 0) state.context = Math.round(100 * used / capacity);
  }
}

module.exports = { createSession, applyRecord, describeTool, projectName, sessionTitle, workspaceIdentity, MAX_EVENTS, UNNAMED_SESSION };
