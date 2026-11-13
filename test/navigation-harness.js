'use strict';
// The stand-in DOM that runs the real media/app.js against the real toolbar markup from src/webview.js.
// Shared by test/navigation.test.js (S02, S03) and test/resilience.test.js (S08). It proves controller
// behaviour only; rendering in a browser and a VS Code host is separate evidence.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const view = require('../media/view');
const { webviewHtml } = require('../src/webview');
const { snapshot } = require('./navigation-fixture');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'media', 'app.js'), 'utf8');
const markup = webviewHtml({ css: 'style.css', view: 'view.js', app: 'app.js', cspSource: 'test:' });
const body = markup.slice(markup.indexOf('<body>'));
// `post` receives every message the page sends, so a test can connect the page to a real host.
function boot({ host = true, saved, clipboard = 'ok', answer = true, post } = {}) {
  const document = { activeElement: null, selected: null };
  class Element {
    constructor(tag, id = '') { Object.assign(this, { tagName: tag, id, children: [], listeners: {}, attributes: {}, stored: '', text: '', disabled: false, hidden: false, innerHTML: '', valueWrites: 0, rebuilds: 0, classList: { add() {}, remove() {} } }); }
    // The details panel (details on click) asks these; the stand-in holds no rendered content to search.
    contains() { return false; }
    querySelector() { return null; }
    get textContent() { return this.text; }
    set textContent(value) { this.text = String(value); }
    get value() {
      if (this.tagName !== 'select') return this.stored;
      return (this.children.find(option => option.value === this.stored) || this.children[0])?.value ?? '';
    }
    set value(value) { this.stored = String(value); this.valueWrites++; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; this.rebuilds++; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    focus() { document.activeElement = this; }
    fire(type, detail = {}) {
      const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...detail };
      for (const listener of this.listeners[type] || []) listener(event);
      return event;
    }
  }
  // Every element the controller may look up comes from the real markup, so a renamed or missing control fails here.
  const elements = {};
  for (const [, tag, attributes] of body.matchAll(/<([a-z0-9]+)\b([^>]*)>/g)) {
    const id = /\bid="([^"]+)"/.exec(attributes)?.[1];
    if (id) elements[id] = new Element(tag, id);
  }
  document.getElementById = id => elements[id] || null;
  document.createElement = tag => new Element(tag);
  document.body = new Element('body');
  document.addEventListener = (type, listener) => { (document.listeners ||= {})[type] = listener; };
  document.execCommand = command => { document.executed = command; return clipboard === 'fallback'; };
  const posted = [];
  const states = [];
  const copied = [];
  const windowListeners = {};
  const sandbox = {
    document, AgentViz: view, console, CSS: { escape: value => String(value) },
    setTimeout: () => 0, clearTimeout: () => {},
    window: {
      addEventListener: (type, listener) => { windowListeners[type] = listener; },
      getSelection: () => ({ removeAllRanges() {}, addRange(range) { document.selected = range.node; } })
    },
    navigator: clipboard === 'ok' ? { clipboard: { writeText: async value => { copied.push(value); } } } : {}
  };
  document.createRange = () => ({ selectNodeContents(node) { this.node = node; } });
  // A stand-in host (S03): it holds the whole catalogue, filters it for the newest request and answers with that
  // request's number, the project groups of the whole catalogue and the followed session on its own.
  let full = null;
  let followed = '';
  let asked = { seq: 1 };
  const respond = (extra = {}) => {
    const found = view.filterSessions(full, asked);
    const selected = full.find(session => session.id === followed) || null;
    windowListeners.message({ data: { type: 'state', sessions: found, selectedId: followed, selected, snapshot: selected ? snapshot(selected) : null, warnings: [],
      workspaces: view.workspaceChoices(full), lookup: { seq: asked.seq, total: full.length, matched: found.length, limit: 80, pendingNames: 0, pendingWorkspaces: 0 }, ...extra } });
  };
  if (host) sandbox.acquireVsCodeApi = () => ({ postMessage: message => {
    posted.push(structuredClone(message));
    if (post) post(structuredClone(message));
    if (message.type === 'ready' && message.query) asked = message.query;
    if (message.type === 'select') followed = message.id;
    if (message.type === 'query') { asked = message; if (answer && full) respond(); }
  }, getState: () => saved, setState: value => states.push(structuredClone(value)) });
  vm.runInNewContext(appSource, sandbox, { filename: 'media/app.js' });
  const deliver = (sessions, selectedId, extra = {}) => { full = sessions; followed = selectedId; respond(extra); };
  const raw = data => windowListeners.message({ data });
  const type = (id, text) => { elements[id].focus(); elements[id].stored = text; elements[id].fire('input'); };
  const options = id => elements[id].children.map(option => ({ value: option.value, text: option.textContent }));
  return { elements, document, posted, states, copied, deliver, raw, type, options };
}

module.exports = { boot, markup, body, appSource };
