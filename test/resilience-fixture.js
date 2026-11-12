'use strict';
// S08: synthetic transcript builders and a host stand-in shared by test/resilience.test.js and test/benchmark.js.
// Everything written here is invented. Each private part of a record carries a PRIVATE_ sentinel, so a probe of
// the host message can prove that prompts, reasoning, commands, output, paths and secrets stay in the host.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const SENTINELS = ['PRIVATE_PROMPT', 'PRIVATE_REASONING', 'PRIVATE_COMMAND', 'PRIVATE_OUTPUT', 'PRIVATE_PATH', 'PRIVATE_SECRET', 'PRIVATE_CODE', 'PRIVATE_TASK', 'PRIVATE_URL'];
const stamp = at => new Date(at).toISOString();
const line = record => JSON.stringify(record) + '\n';
const uuid = n => `${String(n).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(n).padStart(12, '0')}`;

// One Claude call and its result. `filler` pads the result the way real tool output does.
function claudeCall(sessionId, at, id, { agentId, filler = 0, failed = false, tool = 'Read' } = {}) {
  const own = agentId ? { agentId } : {};
  const input = tool === 'Bash' ? { command: `deploy --token PRIVATE_SECRET PRIVATE_COMMAND` }
    : tool === 'WebFetch' ? { url: 'https://example.org/PRIVATE_URL?key=PRIVATE_SECRET', prompt: 'PRIVATE_PROMPT' }
    : { file_path: `C:\\PRIVATE_PATH\\deep\\src\\file-${id.length % 7}.js`, content: 'PRIVATE_CODE', old_string: 'PRIVATE_CODE' };
  return line({ type: 'assistant', timestamp: stamp(at), uuid: `a-${id}`, sessionId, ...own, message: { content: [
    { type: 'thinking', thinking: 'PRIVATE_REASONING' }, { type: 'text', text: 'PRIVATE_REASONING' },
    { type: 'tool_use', id, name: tool, input }] } })
    + line({ type: 'user', timestamp: stamp(at + 500), uuid: `r-${id}`, sessionId, ...own, toolUseResult: { stdout: 'PRIVATE_OUTPUT', filePath: 'C:\\PRIVATE_PATH\\x' },
      message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: failed, content: 'PRIVATE_OUTPUT ' + 'x'.repeat(filler) }] } });
}
const claudeHead = (sessionId, at, cwd, agentId) => line({ type: 'user', timestamp: stamp(at), uuid: `p-${sessionId}-${agentId || 'main'}`, sessionId, ...(agentId ? { agentId } : {}), cwd,
  message: { content: 'PRIVATE_PROMPT please use PRIVATE_SECRET' } });
const claudeTitle = (sessionId, title, type = 'custom-title') => line(type === 'custom-title' ? { type, customTitle: title, sessionId } : { type, aiTitle: title, sessionId });

function codexHead(id, at, cwd, parent) {
  return line({ type: 'session_meta', timestamp: stamp(at), payload: { id, cwd, instructions: 'PRIVATE_PROMPT',
    ...(parent ? { source: { subagent: { thread_spawn: { parent_thread_id: parent, depth: 1, agent_nickname: 'Synthetic helper' } } } } : {}) } })
    + line({ type: 'event_msg', timestamp: stamp(at + 1), payload: { type: 'user_message', message: 'PRIVATE_PROMPT' } });
}
function codexCall(at, id, { filler = 0, failed = false } = {}) {
  return line({ type: 'response_item', timestamp: stamp(at), payload: { type: 'reasoning', summary: [{ text: 'PRIVATE_REASONING' }] } })
    + line({ type: 'response_item', timestamp: stamp(at), payload: { type: 'function_call', call_id: id, name: 'exec_command', arguments: JSON.stringify({ cmd: 'git push PRIVATE_COMMAND --token PRIVATE_SECRET', workdir: '/PRIVATE_PATH/repo' }) } })
    + line({ type: 'response_item', timestamp: stamp(at + 500), payload: { type: 'function_call_output', call_id: id, output: `Process exited with code ${failed ? 1 : 0}\nPRIVATE_OUTPUT ` + 'x'.repeat(filler) } });
}
const codexFile = (root, id, day = '2026/11/01') => path.join(root, 'sessions', ...day.split('/'), `rollout-2026-11-01T00-00-00-${id}.jsonl`);
const claudeFile = (root, project, sessionId) => path.join(root, 'projects', project, `${sessionId}.jsonl`);
const claudeChildFile = (root, project, sessionId, agentId) => path.join(root, 'projects', project, sessionId, 'subagents', `agent-${agentId}.jsonl`);

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}
const tempRoot = name => fs.mkdtempSync(path.join(os.tmpdir(), `agentviz-${name}-`));
const remove = folder => fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });

// The real src/extension.js with the real adapters, on a stand-in for the VS Code API. Time is driven by `tick`.
// `sessions` replaces the adapters' module (default: the real one), so a probe can delay or observe a read.
// `home` replaces the user's home folder, so a default source folder never points at real transcripts.
function realHost({ claudeRoot, codexRoot, sessions = require('../src/sessions'), saved, home = path.join(os.tmpdir(), 'agentviz-no-such-home') } = {}) {
  const callbacks = {};
  const messages = [];
  const errors = [];
  const panels = [];
  const created = [];
  const roots = { claudeRoot, codexRoot };
  const subscriptions = [];
  let timers = 0;
  let cleared = 0;
  let stored = saved;
  // The host's clock: real time plus what a test adds, so the ten second folder listing can be made due.
  let skew = 0;
  const disposable = () => { const item = { disposed: false, dispose() { item.disposed = true; } }; return item; };
  const newPanel = options => {
    const listeners = { message: disposable(), visibility: disposable() };
    const panel = {
      visible: true, reveals: 0, options, html: '', listeners, reveal() { panel.reveals++; },
      webview: { cspSource: 'vscode-resource:', asWebviewUri: value => `vscode-resource:/${value}`,
        onDidReceiveMessage: callback => { panel.receive = callback; return listeners.message; },
        postMessage: async value => { messages.push(JSON.parse(JSON.stringify(value))); panel.posted = (panel.posted || 0) + 1; return true; },
        set html(value) { panel.html = value; }, get html() { return panel.html; } },
      onDidChangeViewState: callback => { panel.viewState = callback; return listeners.visibility; },
      // Like VS Code, the dispose event fires once however often dispose is called.
      onDidDispose: callback => { panel.disposeCallback = callback; }, dispose() { if (panel.closed) return; panel.closed = true; panel.disposeCallback(); }
    };
    panels.push(panel);
    return panel;
  };
  const vscode = {
    commands: { registerCommand: (name, callback) => { callbacks[name] = callback; return disposable(); } },
    window: { createWebviewPanel: (type, title, column, options) => { created.push(options); return newPanel(options); }, showErrorMessage: message => { errors.push(message); } },
    workspace: {
      workspaceFolders: [],
      getConfiguration: () => ({ get: key => roots[key] }),
      onDidChangeConfiguration: callback => { callbacks.config = callback; const item = disposable(); callbacks.configListener = item; return item; }
    },
    Uri: { joinPath: (...parts) => parts.join('/') }, ViewColumn: { One: 1 }
  };
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require: name => name === 'vscode' ? vscode : name === './sessions' ? sessions
    : name === 'node:os' ? { ...os, homedir: () => home } : name.startsWith('./') ? require(`../src/${name.slice(2)}`) : require(name),
    Date: { now: () => Date.now() + skew }, setInterval: callback => { callbacks.tick = callback; return ++timers; }, clearInterval: () => { cleared++; } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/extension.js'), 'utf8'), sandbox, { filename: 'src/extension.js' });
  module.exports.activate({ extensionUri: 'extension:', subscriptions, workspaceState: { get: () => stored, async update(key, value) { stored = value; } } });
  const panel = () => panels.at(-1);
  // One timer pass, waited to its end: the host posts at most one message per pass.
  const pass = async () => {
    const before = messages.length;
    callbacks.tick();
    for (let turn = 0; turn < 2000 && messages.length === before; turn++) await new Promise(resolve => setImmediate(resolve));
    return messages.at(-1);
  };
  const settle = async (turns = 40) => { for (let turn = 0; turn < turns; turn++) await new Promise(resolve => setImmediate(resolve)); };
  return { callbacks, messages, errors, panels, created, subscriptions, panel, pass, settle, deactivate: () => module.exports.deactivate(),
    timers: () => ({ started: timers, cleared }), saved: () => stored,
    open: () => callbacks['agentviz.open'](), openSession: argument => callbacks['agentviz.openSession'](argument),
    send: message => panel().receive(message), advance: milliseconds => { skew += milliseconds; },
    setRoots(next) { Object.assign(roots, next); callbacks.config({ affectsConfiguration: () => true }); } };
}

module.exports = { SENTINELS, stamp, line, uuid, claudeCall, claudeHead, claudeTitle, codexHead, codexCall, codexFile, claudeFile, claudeChildFile, write, tempRoot, remove, realHost };
