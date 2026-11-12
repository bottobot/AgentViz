'use strict';
// S09: a minimal DevTools protocol client on the WebSocket and fetch that Node provides. No dependency.
// Used by test/browser-check.js (a real browser) and test/extension-host.js (the real VS Code webview).

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function targets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`The debugging endpoint answered ${response.status}.`);
  return response.json();
}

// One session on one target. `problems` collects every error or warning the target reports: uncaught
// exceptions, console.error and console.warn calls, and browser log entries (policy violations arrive there).
async function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = () => reject(new Error('The debugging socket did not open.')); });
  let next = 0;
  const waiting = new Map();
  const problems = [];
  const contexts = [];
  const clip = text => String(text || '').slice(0, 300);
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    else if (message.method === 'Runtime.executionContextCreated') contexts.push(message.params.context);
    else if (message.method === 'Runtime.executionContextDestroyed') { const index = contexts.findIndex(context => context.id === message.params.executionContextId); if (index >= 0) contexts.splice(index, 1); }
    else if (message.method === 'Runtime.executionContextsCleared') contexts.length = 0;
    else if (message.method === 'Runtime.exceptionThrown') problems.push({ kind: 'exception', text: clip(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text) });
    else if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) problems.push({ kind: `log ${message.params.entry.level}`, source: message.params.entry.source, text: clip(message.params.entry.text) });
    else if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(message.params.type)) problems.push({ kind: `console ${message.params.type}`, text: clip(message.params.args.map(argument => argument.value ?? argument.description ?? '').join(' ')) });
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (socket.readyState !== 1) { reject(new Error('The debugging socket is closed.')); return; }
    const id = ++next;
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  // Evaluates an expression and returns its value. `contextId` picks a frame; `userGesture` marks it as a user action.
  const evaluate = async (expression, { contextId, userGesture = false } = {}) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture, ...(contextId ? { contextId } : {}) });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const KEYS = { Tab: 9, Escape: 27, Enter: 13, ArrowDown: 40, ArrowUp: 38, ' ': 32 };
  // A real key press, delivered through the browser's input pipeline.
  const key = async (name, { shift = false } = {}) => {
    const base = { key: name, code: name === ' ' ? 'Space' : name, windowsVirtualKeyCode: KEYS[name], modifiers: shift ? 8 : 0 };
    const text = name === 'Enter' ? '\r' : name === ' ' ? ' ' : undefined;
    await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  };
  const type = async value => { for (const character of value) await send('Input.dispatchKeyEvent', { type: 'char', text: character }); };
  const close = () => { try { socket.close(); } catch { /* already closed */ } };
  return { send, evaluate, key, type, close, problems, contexts, get open() { return socket.readyState === 1; } };
}

module.exports = { sleep, targets, connect };
