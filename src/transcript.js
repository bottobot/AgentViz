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

// File activity footprint (S06). Counting rule, shared with the stations:
//   Every recorded call counts once at its station, whatever its outcome. A Files or Edits call that names a file
//   through a recognized structured argument is a "named" call; every other Files or Edits call names no file.
//   So: Files station = readCalls + unnamedReads, and Edits station = editCalls + unnamedEdits, for the same events.
//   Per file: reads and edits are the named calls not recorded as failed; failed calls are counted as failed.
//   A patch call that names several files is one call at the station and one edit for each distinct file.
// Recognized arguments: file_path, filePath, path or notebook_path of Read, read_file, view_image, Edit, Write,
// MultiEdit, NotebookEdit, edit_file, write_file, and the "*** Update/Add/Delete File:" and "*** Move to:" header
// lines of an apply_patch call. Searches and listings name a folder or pattern, not one file. Shell commands,
// program text, tool output, file contents and patch bodies are never read for file names.
// Kept per file: an opaque key and a label of at most the last two path segments. The path stays in the host.
// WARNING: bounded list; only this many ranked files are sent to the view, and the view says how many are not.
const FOOTPRINT_FILES = 12;
const PATH_LENGTH = 2048;
const PATCH_FILES = 50;
const READ_TOOLS = /^(read|read_file|view_image)$/;
const EDIT_TOOLS = /^(edit|write|multiedit|edit_file|write_file|notebookedit)$/;
const absoluteWindows = value => /^[a-z]:(?:[\\/]|$)/i.test(value) || value.startsWith('\\\\');
// One path segment as display text: cleaned like a saved title, and cut short.
const labelPart = value => {
  const characters = [...sessionTitle(value)];
  return characters.length > 40 ? characters.slice(0, 39).join('') + '\u2026' : characters.join('');
};

// One identity per file. Windows drive and UNC paths compare without case or separator differences; any other
// absolute path is POSIX and compared exactly. A relative path is resolved against the recorded working directory
// when there is one; without it the relative path is its own identity and is never guessed to be an absolute one.
// Returns null for anything that is not one usable path.
function fileIdentity(value, cwd) {
  if (typeof value !== 'string' || !value.trim() || value.length > PATH_LENGTH || /[\x00-\x1f]/.test(value)) return null;
  let text = value.trim().replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
  let form = absoluteWindows(text) ? 'win' : text.startsWith('/') ? 'posix' : 'rel';
  if (form === 'rel' && typeof cwd === 'string' && cwd.length <= PATH_LENGTH && !/[\x00-\x1f]/.test(cwd)) {
    const base = cwd.trim().replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
    if (absoluteWindows(base)) { form = 'win'; text = `${base}\\${text}`; }
    else if (base.startsWith('/')) { form = 'posix'; text = `${base}/${text.replace(/\\/g, '/')}`; }
  }
  const unc = form === 'win' && text.startsWith('\\\\');
  const segments = [];
  for (const part of (form === 'posix' ? text : text.replace(/\\/g, '/')).split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      // A drive or the root is never climbed past; a relative path keeps the steps it cannot resolve.
      if (segments.length && segments.at(-1) !== '..' && !/^[a-z]:$/i.test(segments.at(-1))) segments.pop();
      else if (form === 'rel') segments.push(part);
    }
    else segments.push(part);
  }
  const named = segments.filter(part => !/^[a-z]:$/i.test(part) && part !== '..');
  if (!named.length) return null;
  const normal = form === 'win' ? `win:${unc ? '//' : ''}${segments.join('/').toLowerCase()}` : form === 'posix' ? `posix:/${segments.join('/')}` : `rel:${segments.join('/')}`;
  const label = named.slice(-2).map(labelPart).filter(Boolean).join('/');
  return { key: `f:${createHash('sha256').update(normal).digest('hex').slice(0, 20)}`, label: label || 'Unnamed file' };
}

// The files one structured call names. Only the argument keys and patch header lines listed above are looked at.
function fileTargets(name, input, cwd) {
  const lower = (shortName(name).split(/__|\./).at(-1) || '').toLowerCase();
  const args = input && typeof input === 'object' ? input : {};
  if (lower === 'apply_patch') {
    const patch = typeof input === 'string' ? input : typeof args.input === 'string' ? args.input : typeof args.patch === 'string' ? args.patch : '';
    const found = new Map();
    // A header starts its line; every body line of a patch starts with a space, + or -.
    for (const match of patch.matchAll(/^\*\*\* (?:(?:Update|Add|Delete) File|Move to): (.+)$/gm)) {
      const identity = fileIdentity(match[1], cwd);
      if (identity && !found.has(identity.key)) found.set(identity.key, identity);
      if (found.size >= PATCH_FILES) break;
    }
    return [...found.values()];
  }
  if (!READ_TOOLS.test(lower) && !EDIT_TOOLS.test(lower)) return [];
  const identity = fileIdentity(args.file_path ?? args.filePath ?? args.notebook_path ?? args.path, cwd);
  return identity ? [identity] : [];
}

// Built from normalized events, so it always describes exactly the events it is shown with: retained history
// only, and the current outcome of each call. Events of other kinds are ignored.
function fileFootprint(events) {
  const files = new Map();
  const totals = { total: 0, reads: 0, edits: 0, readCalls: 0, editCalls: 0, unnamedReads: 0, unnamedEdits: 0, failedCalls: 0 };
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.kind !== 'files' && event?.kind !== 'edits') continue;
    const reading = event.kind === 'files';
    const targets = Array.isArray(event.files) ? event.files : [];
    if (!targets.length) { totals[reading ? 'unnamedReads' : 'unnamedEdits']++; continue; }
    totals[reading ? 'readCalls' : 'editCalls']++;
    const failed = event.outcome === 'error';
    if (failed) totals.failedCalls++;
    for (const target of targets) {
      let entry = files.get(target.key);
      if (!entry) files.set(target.key, entry = { key: target.key, label: target.label, reads: 0, edits: 0, failed: 0, shared: false });
      if (failed) entry.failed++;
      else { entry[reading ? 'reads' : 'edits']++; totals[reading ? 'reads' : 'edits']++; }
    }
  }
  const labels = new Map();
  for (const entry of files.values()) labels.set(entry.label, (labels.get(entry.label) || 0) + 1);
  for (const entry of files.values()) entry.shared = labels.get(entry.label) > 1;
  totals.total = files.size;
  const ranked = [...files.values()].sort((a, b) => b.edits - a.edits || b.reads - a.reads || b.failed - a.failed || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) || (a.key < b.key ? -1 : 1));
  return { files: ranked.slice(0, FOOTPRINT_FILES), ...totals, limit: FOOTPRINT_FILES };
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
  // progress stays null until this transcript records an explicit task list (S05). It is never derived from events.
  const state = { provider, id, project: '', parent: null, events: [], status: 'unknown', context: null, progress: null, updatedAt: 0, startedAt: 0, invalidLines: 0, oversizedLines: 0, droppedEvents: 0 };
  Object.defineProperties(state, {
    // File activity (S06): computed from the retained events whenever a snapshot is taken, so it is part of what
    // the host forwards and can never disagree with the events sent beside it.
    footprint: { enumerable: true, get: () => fileFootprint(state.events) },
    // Host only (S06): the recorded working directory, used to resolve relative file paths. Never sent.
    cwd: { value: '', writable: true },
    // Host only (S05): calls waiting for their result, calls already applied, and the list being built.
    tasks: { value: { pending: new Map(), done: new Map(), items: new Map(), source: '', omitted: 0, unread: 0, unmatched: 0, unreadable: 0, updatedAt: 0 } },
    calls: { value: new Map() },
    markers: { value: new Set() },
    turn: { value: null, writable: true },
    capacity: { value: null, writable: true },
    // Host only (S04): what this transcript records about agents it started. Never sent to the view as is.
    // spawns: by the parent's call ID; agents: by child agent ID; notices: the first end report per child agent ID.
    lifecycle: { value: { spawns: new Map(), agents: new Map(), notices: new Map() } },
    agentLabel: { value: '', writable: true }
  });
  return state;
}

// WARNING: bounded host memory; the oldest lifecycle entry is forgotten past this many per transcript.
const LIFECYCLE_LIMIT = 5000;
function remember(map, key, value) {
  if (map.has(key)) return;
  map.set(key, value);
  if (map.size > LIFECYCLE_LIMIT) map.delete(map.keys().next().value);
}
const agentKey = value => typeof value === 'string' && /^[\w-]{1,80}$/.test(value) ? value : '';

// Verified local shape (2026-11-12): Claude reports the end of a background agent to its parent as text starting
// with <task-notification>, holding <task-id> (the child agent ID) and <status> before <summary>. The same notice
// repeats in queue-operation, attachment and user records; the first one seen is kept. Only the ID and the status
// word are read. Returns true when the text is such a notice, so it is not mistaken for a user prompt.
function taskNotice(state, time, text) {
  if (typeof text !== 'string') return false;
  const head = text.slice(0, 4096).trimStart();
  if (!head.startsWith('<task-notification>')) return false;
  const summary = head.indexOf('<summary>');
  const fields = summary === -1 ? head : head.slice(0, summary);
  const id = fields.match(/<task-id>([\w-]{1,80})<\/task-id>/)?.[1];
  const status = fields.match(/<status>([a-z_]{1,24})<\/status>/)?.[1];
  if (id && status) remember(state.lifecycle.notices, id, { time, status });
  return true;
}

// Verified local shape (2026-11-12): the user record answering an Agent call carries toolUseResult
// { agentId, status: 'async_launched' | 'completed', ... }; a failed call has is_error and no agent ID.
function spawnResult(state, time, part, result) {
  const call = state.calls.get(part.tool_use_id);
  const agent = result && typeof result === 'object' ? agentKey(result.agentId) : '';
  if (!agent && call?.kind !== 'agents') return;
  const failed = part.is_error === true;
  const entry = { launched: call ? call.time : time, reported: time, ended: failed || result?.status === 'completed', failed };
  if (typeof part.tool_use_id === 'string') remember(state.lifecycle.spawns, part.tool_use_id, entry);
  if (agent) remember(state.lifecycle.agents, agent, entry);
}

// Explicit task lists (S05). Record forms follow the providers' published tool definitions, checked 2026-11-12:
//   Claude TodoWrite  input { todos: [{ content, status, activeForm }] }: the whole list on every call, no IDs.
//   Claude TaskCreate input { subject, description, activeForm?, metadata? }; the ID is only in the result,
//                     toolUseResult { task: { id, subject } }.
//   Claude TaskUpdate input { taskId, status?: pending | in_progress | completed | deleted, subject?, ... };
//                     toolUseResult { success, taskId, updatedFields, error?, statusChange? }. The stored input is
//                     what the model wrote, so the documented near misses id and task_id are accepted for taskId.
//   Claude TaskList   toolUseResult { tasks: [{ id, subject, status, owner?, blockedBy }] }: the whole list.
//   Codex update_plan function_call arguments { explanation?, plan: [{ step, status }] }: the whole list, no IDs.
// The envelopes (tool_use part, toolUseResult on the answering record, function_call with JSON arguments and its
// output) are the ones verified on local data for other tools. No local transcript held one of these list
// records, so the list schemas themselves rest on the published definitions.
// Kept per item: an ID (the source's, or the position where the source has none), a status word and one short
// cleaned label. Descriptions, explanations, active forms, owners and metadata are never read out.
// A list changes only when the source recorded that the call was accepted. Nothing here looks at tool counts.
// WARNING: bounded list; items past this many are not kept or counted, and the view says how many.
const PROGRESS_ITEMS = 200;
const PENDING_LIMIT = 200;
const STATUSES = new Set(['pending', 'in_progress', 'completed']);
const taskId = value => {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof text === 'string' && /^[\w.:-]{1,40}$/.test(text) ? text : '';
};
const taskStatus = value => STATUSES.has(value) ? value : 'unknown';
const taskLabel = value => sessionTitle(value) || 'Unlabelled item';

function explicitList(entries, labelKey, withIds) {
  if (!Array.isArray(entries)) return null;
  const items = new Map();
  let skipped = 0;
  for (const [index, entry] of entries.entries()) {
    if (items.size >= PROGRESS_ITEMS) break;
    const id = withIds ? taskId(entry?.id) : String(index + 1);
    if (!id || items.has(id)) { skipped++; continue; }
    items.set(id, { id, status: taskStatus(entry?.status), label: taskLabel(entry?.[labelKey]) });
  }
  return { items, omitted: entries.length - items.size - skipped, skipped };
}

function publishProgress(state, time) {
  const tasks = state.tasks;
  tasks.updatedAt = Math.max(tasks.updatedAt, time);
  state.progress = { source: tasks.source, items: [...tasks.items.values()].map(item => ({ id: item.id, status: item.status, label: item.label })),
    omitted: tasks.omitted, unread: tasks.unread, unmatched: tasks.unmatched, unreadable: tasks.unreadable, updatedAt: tasks.updatedAt };
}

// A list call is only remembered here. It takes effect in taskResult, when the source records its outcome.
function taskCall(state, id, name, input) {
  const tasks = state.tasks;
  if (typeof id !== 'string' || !id || typeof name !== 'string' || tasks.pending.has(id) || tasks.done.has(id)) return;
  const args = input && typeof input === 'object' ? input : {};
  let call = null;
  if (state.provider === 'claude') {
    if (name === 'TodoWrite') call = { form: 'claude-todos', list: explicitList(args.todos, 'content', false) };
    else if (name === 'TaskCreate') call = { form: 'claude-tasks', create: taskLabel(args.subject) };
    else if (name === 'TaskUpdate') call = { form: 'claude-tasks', update: { id: taskId(args.taskId ?? args.id ?? args.task_id), status: args.status, label: sessionTitle(args.subject) } };
    else if (name === 'TaskList') call = { form: 'claude-tasks', read: true };
  } else if (name === 'update_plan') call = { form: 'codex-plan', list: explicitList(args.plan, 'step', false) };
  if (!call) return;
  tasks.pending.set(id, call);
  if (tasks.pending.size > PENDING_LIMIT) tasks.pending.delete(tasks.pending.keys().next().value);
}

function taskResult(state, time, id, failed, result) {
  const tasks = state.tasks;
  const call = tasks.pending.get(id);
  if (!call) return;
  tasks.pending.delete(id);
  remember(tasks.done, id, true);
  const output = result && typeof result === 'object' ? result : {};
  // A refused or unsuccessful call changed nothing in the source, so it changes nothing here.
  if (failed || output.success === false) return;
  // Another list form in the same transcript starts a new list; the forms are never merged.
  const start = () => { if (tasks.source !== call.form) { tasks.source = call.form; tasks.items = new Map(); tasks.omitted = 0; } };
  if ('list' in call) {
    if (!call.list) tasks.unreadable++;
    else { start(); tasks.items = call.list.items; tasks.omitted = call.list.omitted; tasks.unreadable += call.list.skipped; }
  } else if ('create' in call) {
    const created = taskId(output.task?.id);
    if (!created) tasks.unreadable++;
    else {
      start();
      if (!tasks.items.has(created)) {
        if (tasks.items.size >= PROGRESS_ITEMS) tasks.omitted++;
        else tasks.items.set(created, { id: created, status: 'pending', label: call.create });
      }
    }
  } else if (call.update) {
    const item = tasks.source === call.form ? tasks.items.get(call.update.id) : null;
    if (!call.update.id) tasks.unreadable++;
    else if (!item) { if (call.update.status !== 'deleted') tasks.unmatched++; }
    else if (call.update.status === 'deleted') tasks.items.delete(item.id);
    else {
      if (call.update.status !== undefined) item.status = taskStatus(call.update.status);
      if (call.update.label) item.label = call.update.label;
    }
  } else {
    const list = explicitList(output.tasks, 'subject', true);
    if (!list) return;
    start();
    tasks.items = list.items;
    tasks.omitted = list.omitted;
    tasks.unreadable += list.skipped;
  }
  publishProgress(state, time);
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
  if (event.kind === 'files' || event.kind === 'edits') {
    // Host only: the event sent to the view keeps its five fields; file identity travels in the footprint.
    const files = fileTargets(name, input, state.cwd);
    if (files.length) Object.defineProperty(event, 'files', { value: files });
  }
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
  if (validTime) {
    state.updatedAt = Math.max(state.updatedAt, time);
    if (!state.startedAt || time < state.startedAt) state.startedAt = time;
  }
  if (state.provider === 'claude') {
    if (typeof record.cwd === 'string') { state.project = projectName(record.cwd); state.cwd = record.cwd; }
    // A subagent transcript names itself and the session it belongs to on its own records.
    if (!state.parent && record.agentId === state.id && typeof record.sessionId === 'string' && record.sessionId !== state.id) state.parent = shortName(record.sessionId);
    if (!validTime) return;
    if (record.type === 'queue-operation') { taskNotice(state, time, record.content); return; }
    if (record.type === 'attachment') { if (record.attachment?.type === 'queued_command') taskNotice(state, time, record.attachment.prompt); return; }
    const content = Array.isArray(record.message?.content) ? record.message.content : [];
    if (record.type === 'assistant') {
      for (const part of content) if (part?.type === 'tool_use') { taskCall(state, part.id, part.name, part.input); startTool(state, time, part.id, part.name, part.input); }
      if (record.message?.stop_reason === 'end_turn') {
        state.status = 'complete';
        marker(state, time, 'complete', record.uuid, 'Turn complete');
      }
    } else if (record.type === 'user') {
      const results = content.filter(part => part?.type === 'tool_result');
      for (const part of results) {
        finishTool(state, part.tool_use_id, part.is_error === true);
        spawnResult(state, time, part, results.length === 1 ? record.toolUseResult : null);
        taskResult(state, time, part.tool_use_id, part.is_error === true, results.length === 1 ? record.toolUseResult : null);
      }
      const text = typeof record.message?.content === 'string' ? record.message.content : content.find(part => part?.type === 'text')?.text;
      // An end report delivered as a user record is a lifecycle event, not something the user typed.
      if (taskNotice(state, time, text)) return;
      if ((typeof record.message?.content === 'string' || content.some(part => part?.type === 'text')) && !results.length) {
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
    if (typeof payload.cwd === 'string') { state.project = projectName(payload.cwd); state.cwd = payload.cwd; }
    const spawn = payload.source?.subagent?.thread_spawn;
    if (typeof spawn?.parent_thread_id === 'string') state.parent = shortName(spawn.parent_thread_id);
    // Verified local shape (2026-11-12): a child rollout stores a short generated nickname and an optional role.
    state.agentLabel = sessionTitle(typeof spawn?.agent_role === 'string' && spawn.agent_role ? spawn.agent_role : spawn?.agent_nickname).slice(0, 40);
    return;
  }
  if (!validTime) return;
  // Verified local shape (2026-11-12): rare parent-side record { agent_thread_id, kind: 'started' | 'interacted' }.
  // It proves the child existed; Codex parents do not record when a child ends.
  if (record.type === 'event_msg' && payload.type === 'sub_agent_activity') {
    const agent = agentKey(payload.agent_thread_id);
    if (agent) remember(state.lifecycle.agents, agent.toLowerCase(), { launched: time, reported: time, ended: false, failed: false });
    return;
  }
  if (record.type === 'response_item') {
    if (payload.type === 'function_call' || payload.type === 'custom_tool_call') {
      let input = payload.input;
      if (typeof payload.arguments === 'string') {
        try { input = JSON.parse(payload.arguments); } catch { input = {}; }
      }
      taskCall(state, payload.call_id, payload.name, input);
      // Verified local shape (2026-11-12, 3 calls in 1,191 rollouts): in code mode the plan tool is called from
      // program text inside an exec call, as a JavaScript object literal. That text is a program, not a record of
      // an accepted plan, so it is counted as not read and never parsed.
      const tasks = state.tasks;
      if (payload.name === 'exec' && typeof payload.input === 'string' && typeof payload.call_id === 'string' && !tasks.done.has(payload.call_id) && /\btools\.update_plan\s*\(/.test(payload.input)) {
        remember(tasks.done, payload.call_id, true);
        tasks.unread++;
        publishProgress(state, time);
      }
      startTool(state, time, payload.call_id, payload.name, input);
    } else if (payload.type === 'function_call_output' || payload.type === 'custom_tool_call_output') {
      finishTool(state, payload.call_id, failedOutput(payload.output));
      taskResult(state, time, payload.call_id, failedOutput(payload.output), null);
    }
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

module.exports = { createSession, applyRecord, describeTool, fileIdentity, fileFootprint, FOOTPRINT_FILES, projectName, sessionTitle, workspaceIdentity, MAX_EVENTS, LIFECYCLE_LIMIT, PROGRESS_ITEMS, UNNAMED_SESSION };
