'use strict';
// S02 controller regressions: media/app.js runs against the real toolbar markup from src/webview.js and a small
// stand-in DOM. This proves controller behaviour only; rendering in a browser and a VS Code host is separate evidence.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const view = require('../media/view');
const { webviewHtml } = require('../src/webview');
const { catalogue, snapshot, WS_STORE, WS_VIZ, HOSTILE } = require('./navigation-fixture');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'media', 'app.js'), 'utf8');
const markup = webviewHtml({ css: 'style.css', view: 'view.js', app: 'app.js', cspSource: 'test:' });
const body = markup.slice(markup.indexOf('<body>'));

function boot({ host = true, saved, clipboard = 'ok', answer = true } = {}) {
  const document = { activeElement: null, selected: null };
  class Element {
    constructor(tag, id = '') { Object.assign(this, { tagName: tag, id, children: [], listeners: {}, attributes: {}, stored: '', text: '', disabled: false, hidden: false, innerHTML: '', valueWrites: 0, rebuilds: 0 }); }
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
  document.execCommand = command => { document.executed = command; return clipboard === 'fallback'; };
  const posted = [];
  const states = [];
  const copied = [];
  const windowListeners = {};
  const sandbox = {
    document, AgentViz: view, console,
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

const settle = () => new Promise(resolve => setImmediate(resolve));

test('the toolbar labels every filter and orders controls project, name, ID, session, copy', () => {
  for (const id of ['workspace', 'name-filter', 'id-filter', 'session']) assert.match(body, new RegExp(`<label[^>]* for="${id}"`), id);
  const order = ['id="workspace"', 'id="name-filter"', 'id="id-filter"', 'id="clear-filters"', 'id="session"', 'id="copy-id"'].map(part => body.indexOf(part));
  assert.ok(order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1])), String(order));
  // Native controls in source order give the keyboard order; nothing reorders focus or hides a control from it.
  assert.doesNotMatch(body, /tabindex/);
  assert.match(body, /<select id="workspace"/);
  assert.match(body, /<input id="name-filter" type="search"/);
  assert.match(body, /<input id="id-filter" type="search"/);
  assert.match(body, /<button id="copy-id" type="button"/);
  assert.match(markup, /default-src 'none'/);
});

test('filters narrow the session list by project, name and ID together', () => {
  const page = boot();
  const sessions = catalogue();
  page.deliver(sessions, 'claude:a1');
  assert.deepEqual(page.options('workspace').map(option => option.value), ['', WS_VIZ, sessions[4].workspaceKey, WS_STORE]);
  assert.match(page.options('workspace')[0].text, /^All projects/);
  assert.deepEqual(page.options('session').map(option => option.value), sessions.map(session => session.id));
  assert.equal(page.elements.session.value, 'claude:a1');

  page.type('name-filter', '  FIX login ');
  assert.deepEqual(page.options('session').map(option => option.value), ['claude:a1', 'codex:b1', 'claude:e1']);
  page.elements.workspace.stored = WS_STORE;
  page.elements.workspace.fire('change');
  assert.deepEqual(page.options('session').map(option => option.value), ['claude:a1', 'codex:b1']);
  page.type('id-filter', '0C1E2D3F4B');
  assert.deepEqual(page.options('session').map(option => option.value), ['', 'codex:b1']);
  assert.match(page.elements.matches.textContent, /1 of 6/);
  assert.deepEqual(page.posted.filter(message => message.type === 'select'), [], 'filtering alone never changes the followed session');
});

test('an excluded selection stays followed and labelled; no other session appears under it', () => {
  const page = boot();
  const sessions = catalogue();
  page.deliver(sessions, 'claude:a1');
  page.elements.workspace.stored = WS_VIZ;
  page.elements.workspace.fire('change');

  const listed = page.options('session');
  assert.equal(listed[0].value, '');
  assert.match(listed[0].text, /hidden by these filters/i);
  assert.deepEqual(listed.slice(1).map(option => option.value), ['claude:c1', 'codex:d1']);
  assert.equal(page.elements.session.value, '', 'the picker does not fall through to the first match');
  assert.equal(page.elements['selected-workspace'].textContent, 'storefront');
  assert.equal(page.elements['selected-name'].textContent, 'Fix login redirect');
  assert.equal(page.elements['selected-id'].textContent, '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4a01');
  assert.match(page.elements['selection-note'].textContent, /hidden by the current filters/i);
  assert.match(page.elements.content.innerHTML, /3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4a01/);
  assert.doesNotMatch(page.elements.content.innerHTML, /Add Session Filters/);
  assert.deepEqual(page.posted.filter(message => message.type === 'select'), []);

  // The placeholder is not a session: choosing it sends nothing.
  page.elements.session.stored = '';
  page.elements.session.fire('change');
  assert.deepEqual(page.posted.filter(message => message.type === 'select'), []);

  // No matches at all: the selection is still the one named, and the list says so.
  page.type('name-filter', 'nothing called this');
  assert.deepEqual(page.options('session').map(option => option.value), ['']);
  assert.match(page.options('session')[0].text, /No sessions match/);
  assert.equal(page.elements.session.disabled, true);
  assert.match(page.elements.matches.textContent, /No sessions match/);
  assert.equal(page.elements['selected-id'].textContent, '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4a01');

  // Choosing a visible match is the only thing that moves the selection.
  page.type('name-filter', '');
  page.elements.session.stored = 'claude:c1';
  page.elements.session.fire('change');
  assert.deepEqual(page.posted.filter(message => message.type === 'select'), [{ type: 'select', id: 'claude:c1' }]);
  assert.equal(page.elements['selected-name'].textContent, 'Add Session Filters');
  assert.equal(page.elements['selection-note'].textContent, '');
  assert.doesNotMatch(page.elements.content.innerHTML, /Reading files/, 'the previous session activity is not shown under the new label');
});

test('a snapshot for a different session is never drawn under the selected label', () => {
  const page = boot();
  const sessions = catalogue();
  page.deliver(sessions, 'claude:c1', { snapshot: snapshot(sessions[0], 'Stale activity') });
  assert.equal(page.elements['selected-name'].textContent, 'Add Session Filters');
  assert.doesNotMatch(page.elements.content.innerHTML, /Stale activity/);
  assert.match(page.elements.content.innerHTML, /9d8c7b6a-1111-4222-8333-444455556666/);
});

test('background refreshes keep focus, typed text and an unchanged option list in place', () => {
  const page = boot();
  const sessions = catalogue();
  page.deliver(sessions, 'claude:a1');
  page.type('name-filter', 'Fix Lo');
  const input = page.elements['name-filter'];
  const rebuilds = page.elements.session.rebuilds;
  const workspaceRebuilds = page.elements.workspace.rebuilds;
  const before = page.options('session');

  const later = sessions.map(session => ({ ...session, modified: session.modified + 3600000 }));
  page.deliver(later, 'claude:a1');
  page.deliver(later.map(session => session.id === 'codex:b1' ? { ...session, name: 'Fix login redirect v2' } : session), 'claude:a1');

  assert.equal(page.document.activeElement, input);
  assert.equal(input.value, 'Fix Lo');
  assert.equal(input.valueWrites, 0, 'the controller never rewrites what the user typed');
  assert.equal(page.elements['id-filter'].valueWrites, 0);
  assert.equal(page.elements.session.rebuilds, rebuilds, 'same sessions in the same order update in place');
  assert.equal(page.elements.workspace.rebuilds, workspaceRebuilds);
  assert.equal(page.options('session')[1].value, 'codex:b1');
  assert.match(page.options('session')[1].text, /Fix login redirect v2/);
  assert.notDeepEqual(page.options('session'), before);
  assert.equal(page.elements.session.value, 'claude:a1');
});

test('Clear filters and Escape restore the list without changing the selection', () => {
  const page = boot();
  const sessions = catalogue();
  page.deliver(sessions, 'claude:a1');
  assert.equal(page.elements['clear-filters'].disabled, true);
  page.elements.workspace.stored = WS_VIZ;
  page.elements.workspace.fire('change');
  page.type('name-filter', 'filters');
  page.type('id-filter', '9d8c');
  assert.equal(page.elements['clear-filters'].disabled, false);
  assert.deepEqual(page.options('session').map(option => option.value), ['', 'claude:c1']);

  // Keyboard: Escape empties the focused filter only.
  const escape = page.elements['id-filter'].fire('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(page.elements['id-filter'].value, '');
  assert.equal(page.elements['name-filter'].value, 'filters');
  assert.equal(page.elements['id-filter'].fire('keydown', { key: 'Escape' }).defaultPrevented, false, 'an empty filter leaves Escape alone');

  page.elements['clear-filters'].fire('click');
  assert.equal(page.elements['name-filter'].value, '');
  assert.equal(page.elements.workspace.value, '');
  assert.deepEqual(page.options('session').map(option => option.value), sessions.map(session => session.id));
  assert.equal(page.elements.session.value, 'claude:a1');
  assert.equal(page.elements['clear-filters'].disabled, true);
  assert.equal(page.document.activeElement, page.elements['name-filter'], 'focus moves to a control that is still enabled');
  assert.deepEqual(page.posted.filter(message => message.type === 'select'), []);
});

test('Copy ID copies the complete ID of the labelled session, with a selectable fallback', async () => {
  const page = boot();
  const sessions = catalogue();
  page.deliver(sessions, 'codex:b1');
  page.elements['copy-id'].fire('click');
  await settle();
  assert.deepEqual(page.copied, ['3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4b02']);
  assert.match(page.elements['copy-status'].textContent, /copied/i);

  const fallback = boot({ clipboard: 'fallback' });
  fallback.deliver(sessions, 'codex:b1');
  fallback.elements['copy-id'].fire('click');
  await settle();
  assert.equal(fallback.document.executed, 'copy');
  assert.equal(fallback.document.selected, fallback.elements['selected-id']);
  assert.match(fallback.elements['copy-status'].textContent, /copied/i);

  const blocked = boot({ clipboard: 'none' });
  blocked.deliver(sessions, 'codex:b1');
  blocked.elements['copy-id'].fire('click');
  await settle();
  assert.equal(blocked.document.selected, blocked.elements['selected-id']);
  assert.match(blocked.elements['copy-status'].textContent, /Ctrl\+C/);
  assert.doesNotMatch(blocked.elements['copy-status'].textContent, /copied/i);
});

test('hostile title text reaches the page only as text', () => {
  const page = boot();
  const sessions = catalogue().map(session => session.id === 'claude:f1' ? { ...session, workspaceLabel: HOSTILE, workspaceKey: `ws:${'f'.repeat(20)}` } : session);
  page.deliver(sessions, 'claude:f1');
  assert.equal(page.elements['selected-name'].textContent, HOSTILE);
  assert.equal(page.elements['selected-name'].innerHTML, '');
  assert.ok(page.options('session').some(option => option.text.includes(HOSTILE)));
  assert.ok(page.options('workspace').some(option => option.text.includes(HOSTILE)));
  for (const id of ['session', 'workspace', 'selection', 'matches']) assert.equal(page.elements[id].innerHTML, '', id);
  assert.doesNotMatch(page.elements.content.innerHTML, /<img/);
  assert.match(page.elements.content.innerHTML, /&lt;img src=x/);
  page.type('name-filter', '<IMG SRC');
  assert.deepEqual(page.options('session').map(option => option.value), ['claude:f1']);
});

test('example mode labels the example, not the real selection, and choosing a session returns to live', () => {
  const page = boot({ saved: { example: true } });
  const sessions = catalogue();
  page.deliver(sessions, 'claude:a1');
  assert.equal(page.elements['selected-id'].textContent, 'example-session');
  assert.match(page.elements['selected-provider'].textContent, /synthetic example/i);
  assert.equal(page.elements.session.value, '');
  assert.match(page.options('session')[0].text, /example/i);
  assert.match(page.elements.content.innerHTML, /SYNTHETIC EXAMPLE/);
  assert.doesNotMatch(page.elements.content.innerHTML, /Fix login redirect/);
  // The filters still work on the real catalogue while the example is shown.
  page.type('name-filter', 'filters');
  assert.deepEqual(page.options('session').map(option => option.value), ['', 'claude:c1']);
  // The already selected live session can be chosen again because the placeholder holds the picker.
  page.type('name-filter', '');
  page.elements.session.stored = 'claude:a1';
  page.elements.session.fire('change');
  assert.deepEqual(page.posted.filter(message => message.type === 'select'), [{ type: 'select', id: 'claude:a1' }]);
  assert.equal(page.elements['selected-id'].textContent, '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4a01');
  assert.equal(page.states.at(-1).example, false);
});

test('without a host the page runs entirely on the synthetic catalogue', async () => {
  const page = boot({ host: false });
  const all = page.options('session');
  assert.ok(all.length >= 5);
  assert.ok(all.every(option => option.value.startsWith('demo:')));
  assert.match(page.elements['selected-provider'].textContent, /synthetic example/i);
  const duplicate = view.demoCatalogue(0).find((session, index, list) => list.findIndex(other => other.name === session.name) !== index);
  page.type('name-filter', duplicate.name.toUpperCase());
  assert.ok(page.options('session').filter(option => option.value).length >= 2);
  page.type('id-filter', duplicate.sessionId.slice(9));
  assert.deepEqual(page.options('session').map(option => option.value).filter(Boolean), [duplicate.id]);
  page.elements.session.stored = duplicate.id;
  page.elements.session.fire('change');
  assert.equal(page.elements['selected-id'].textContent, duplicate.sessionId);
  assert.match(page.elements.content.innerHTML, /SYNTHETIC EXAMPLE/);
  page.elements['copy-id'].fire('click');
  await settle();
  assert.deepEqual(page.copied, [duplicate.sessionId]);
});

test('only bounded filter preferences are persisted, and bad saved state is ignored', () => {
  const page = boot();
  const sessions = catalogue();
  page.deliver(sessions, 'claude:a1');
  page.elements.workspace.stored = WS_STORE;
  page.elements.workspace.fire('change');
  page.type('name-filter', 'x'.repeat(500));
  page.type('id-filter', '4b02');
  const saved = page.states.at(-1);
  assert.deepEqual(Object.keys(saved).sort(), ['example', 'id', 'name', 'workspaceKey', 'workspaceLabel']);
  assert.equal(saved.workspaceKey, WS_STORE);
  assert.equal(saved.workspaceLabel, 'storefront');
  assert.equal(saved.name.length, 200);
  assert.equal(saved.id, '4b02');
  assert.doesNotMatch(JSON.stringify(page.states), /claude:a1|3f2a9c1e|Fix login|Reading files/, 'no catalogue, selection or activity is stored');

  const restored = boot({ saved: { example: false, workspaceKey: WS_STORE, workspaceLabel: 'storefront', name: 'login', id: '4b02' } });
  assert.equal(restored.elements['name-filter'].value, 'login');
  assert.equal(restored.elements['id-filter'].value, '4b02');
  restored.deliver(sessions, 'claude:a1');
  assert.equal(restored.elements.workspace.value, WS_STORE);
  assert.deepEqual(restored.options('session').map(option => option.value), ['', 'codex:b1']);

  // A saved project that is not in the current list stays chosen and visible instead of silently widening the search.
  const absent = `ws:${'e'.repeat(20)}`;
  const stale = boot({ saved: { workspaceKey: absent, workspaceLabel: 'old-project' } });
  stale.deliver(sessions, 'claude:a1');
  assert.equal(stale.elements.workspace.value, absent);
  assert.match(stale.options('workspace').find(option => option.value === absent).text, /old-project.*not in the current list/);
  assert.deepEqual(stale.options('session').map(option => option.value), ['']);

  const bad = boot({ saved: { example: 'yes', workspaceKey: 'C:\\private\\path', workspaceLabel: 7, name: { toString: () => 'x' }, id: ['a'] } });
  bad.deliver(sessions, 'claude:a1');
  assert.equal(bad.elements.workspace.value, '');
  assert.equal(bad.elements['name-filter'].value, '');
  assert.equal(bad.elements['id-filter'].value, '');
  assert.deepEqual(bad.options('session').map(option => option.value), sessions.map(session => session.id));
});

test('the stylesheet stacks the filters and wraps the full ID on a narrow viewport', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'media', 'style.css'), 'utf8');
  const narrow = css.slice(css.indexOf('@media (max-width: 480px)'));
  assert.match(narrow, /\.finder\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.selection-id\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.match(css, /input:focus-visible/);
});

// S03: the view asks the host, and shows how much of the source an answer covers.
const group = (key, label, count) => ({ key, label, count });
const answerFor = (page, seq, sessions, extra = {}) => page.raw({ type: 'state', sessions, selectedId: '', selected: null, snapshot: null, warnings: [],
  workspaces: [], lookup: { seq, total: sessions.length, matched: sessions.length, limit: 80, pendingNames: 0, pendingWorkspaces: 0 }, ...extra });

test('every filter change asks the host with a numbered, trimmed request, and the saved filters go with ready', () => {
  const page = boot({ saved: { workspaceKey: WS_STORE, workspaceLabel: 'storefront', name: 'login', id: '4b02' } });
  assert.deepEqual(page.posted, [{ type: 'ready', query: { seq: 1, workspaceKey: WS_STORE, name: 'login', id: '4b02' } }]);
  page.deliver(catalogue(), 'claude:a1');
  page.type('name-filter', '  Fix LOGIN ');
  page.type('id-filter', ' 3F2A9C1E-7B64-4D10-9A55-0C1E2D3F4B02 ');
  page.elements['clear-filters'].fire('click');
  assert.deepEqual(page.posted.slice(1), [
    { type: 'query', seq: 2, workspaceKey: WS_STORE, name: 'Fix LOGIN', id: '4b02' },
    { type: 'query', seq: 3, workspaceKey: WS_STORE, name: 'Fix LOGIN', id: '3F2A9C1E-7B64-4D10-9A55-0C1E2D3F4B02' },
    { type: 'query', seq: 4, workspaceKey: '', name: '', id: '' }
  ]);
});

test('an answer to older filters is dropped, and the wait for the current answer is visible', () => {
  const page = boot({ answer: false });
  const sessions = catalogue();
  assert.match(page.options('session')[0].text, /Looking up sessions/);
  assert.match(page.elements.matches.textContent, /Looking up sessions/);
  page.deliver(sessions, 'claude:a1');
  assert.match(page.elements.matches.textContent, /^6 sessions found\.$/);

  page.type('name-filter', 'zzz');
  assert.deepEqual(page.options('session').map(option => option.value), ['']);
  assert.match(page.options('session')[0].text, /Looking up sessions/, 'not "No sessions match" before the host has answered');
  assert.match(page.elements.matches.textContent, /Looking up sessions/);
  assert.doesNotMatch(page.elements.matches.textContent, /No sessions match/);
  page.type('name-filter', 'filters');

  // The answer to the second request (seq 2, "zzz") arrives after the third was sent: it must not be shown.
  answerFor(page, 2, [], { selectedId: 'claude:a1', selected: sessions[0] });
  assert.match(page.elements.matches.textContent, /Looking up sessions/);
  assert.deepEqual(page.options('session').map(option => option.value), ['', 'claude:c1'], 'still the old list narrowed locally');
  // An even older answer for the unfiltered list must not bring every session back under the new filter.
  answerFor(page, 1, sessions, { selectedId: 'claude:a1', selected: sessions[0] });
  assert.match(page.elements.matches.textContent, /Looking up sessions/);

  // The current answer brings a session the old list never held.
  const older = { ...sessions[2], id: 'claude:old', sessionId: '00000000-9999-4999-8999-999999999999', name: 'Older filters work' };
  answerFor(page, 3, [sessions[2], older], { selectedId: 'claude:a1', selected: sessions[0], lookup: { seq: 3, total: 400, matched: 2, limit: 80, pendingNames: 0, pendingWorkspaces: 0 } });
  assert.deepEqual(page.options('session').map(option => option.value), ['', 'claude:c1', 'claude:old']);
  assert.match(page.elements.matches.textContent, /^2 of 400 sessions match\.$/);
  assert.equal(page.elements['selected-id'].textContent, sessions[0].sessionId, 'the followed session is unchanged throughout');
  assert.equal(page.elements['name-filter'].valueWrites, 0);
});

test('project choices come from the host groups, not from the returned sessions', () => {
  const page = boot({ answer: false });
  const sessions = catalogue();
  const old = `ws:${'d'.repeat(20)}`;
  const twin = `ws:${'e'.repeat(20)}`;
  answerFor(page, 1, sessions.slice(0, 2), { selectedId: 'claude:a1', selected: sessions[0],
    workspaces: [group(WS_STORE, 'storefront', 2), group(old, 'archive', 3), group(twin, 'Archive', 1), group('ws:unknown', 'Unknown workspace', 4)],
    lookup: { seq: 1, total: 10, matched: 10, limit: 2, pendingNames: 0, pendingWorkspaces: 0 } });
  const options = page.options('workspace');
  assert.equal(options[0].text, 'All projects (10)');
  // Two directories with the same label stay apart by key fragment, and a project with no returned session is listed.
  assert.deepEqual(options.slice(1).map(option => option.text).sort(), ['Archive · eeeeee (1)', 'Unknown workspace (4)', 'archive · dddddd (3)', 'storefront (2)'].sort());
  assert.deepEqual(options.slice(1).map(option => option.value).sort(), [old, twin, WS_STORE, 'ws:unknown'].sort());
  assert.match(page.elements.matches.textContent, /10 sessions found\. Showing the 2 most recently written\. Choose a project or narrow the search to reach older ones\./);

  page.elements.workspace.stored = old;
  page.elements.workspace.fire('change');
  assert.deepEqual(page.posted.at(-1), { type: 'query', seq: 2, workspaceKey: old, name: '', id: '' });
  assert.equal(page.states.at(-1).workspaceLabel, 'archive · dddddd');
});

test('the followed session stays named when the answer leaves it out, and limits and unread names are stated', () => {
  const page = boot({ answer: false });
  const sessions = catalogue();
  const followed = { ...sessions[4], id: 'claude:deep', sessionId: 'deadbeef-0000-4000-8000-00000000d00d', name: 'Followed from long ago' };
  // The returned list is the newest two of many; the followed session is older than all of them.
  answerFor(page, 1, sessions.slice(0, 2), { selectedId: 'claude:deep', selected: followed, snapshot: snapshot(followed),
    lookup: { seq: 1, total: 500, matched: 500, limit: 2, pendingNames: 0, pendingWorkspaces: 7 } });
  assert.equal(page.elements['selected-name'].textContent, 'Followed from long ago');
  assert.equal(page.elements['selected-id'].textContent, 'deadbeef-0000-4000-8000-00000000d00d');
  assert.equal(page.elements.session.value, 'claude:deep', 'the picker shows the followed session itself, not the first returned one');
  assert.match(page.elements.content.innerHTML, /deadbeef-0000-4000-8000-00000000d00d/);
  assert.match(page.elements.matches.textContent, /500 sessions found\. Showing the 2 most recently written\./);
  assert.match(page.elements.matches.textContent, /Still reading projects for 7 sessions\./);

  // A rename arrives in a later answer: same ID, new name, still followed.
  answerFor(page, 1, sessions.slice(0, 2), { selectedId: 'claude:deep', selected: { ...followed, name: 'Renamed while followed' }, snapshot: snapshot(followed),
    lookup: { seq: 1, total: 500, matched: 500, limit: 2, pendingNames: 0, pendingWorkspaces: 0 } });
  assert.equal(page.elements['selected-name'].textContent, 'Renamed while followed');
  assert.equal(page.elements.session.value, 'claude:deep');
  assert.deepEqual(page.posted.filter(message => message.type === 'select'), []);

  // A name search that is still reading transcripts says so instead of claiming there are no matches.
  page.type('name-filter', 'needle');
  answerFor(page, 2, [], { selectedId: 'claude:deep', selected: followed, lookup: { seq: 2, total: 500, matched: 0, limit: 80, pendingNames: 41, pendingWorkspaces: 0 } });
  assert.match(page.options('session')[0].text, /No matches yet\. Still reading sessions/);
  assert.match(page.elements.matches.textContent, /No sessions match yet\. .*Still reading saved names in 41 sessions; more matches may appear\./);
  assert.equal(page.elements['selected-name'].textContent, 'Followed from long ago');
  assert.match(page.elements['selection-note'].textContent, /hidden by the current filters/i);

  // The followed transcript was deleted: it stays named and is reported as gone; nothing else takes its place.
  const gone = 'The followed session is no longer in the source folders (deleted or moved). Choose another session.';
  answerFor(page, 2, [], { selectedId: 'claude:deep', selected: followed, warnings: [gone], lookup: { seq: 2, total: 499, matched: 0, limit: 80, pendingNames: 0, pendingWorkspaces: 0, missing: true } });
  assert.equal(page.elements['selected-id'].textContent, 'deadbeef-0000-4000-8000-00000000d00d');
  assert.match(page.elements['selection-note'].textContent, /No longer in the source folders/);
  assert.equal(page.elements.connection.textContent, gone);
  assert.deepEqual(page.posted.filter(message => message.type === 'select'), []);
});