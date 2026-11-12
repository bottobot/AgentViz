'use strict';
// S02 (parallel plan): media/app.js against a stand-in host that speaks the frozen Parallel interface contract in
// ORCHESTRATION.md: the page sends {type: "query", requestId, workspaceKey, name, sessionId}; the host answers with
// queryRequestId, workspaces [{key, label}], sessions, selectedId, snapshot and warnings, and nothing else.
// Synthetic catalogue only. This proves controller behaviour on the shared stand-in DOM; rendering in a browser and
// in a VS Code host is separate evidence. The older request form stays covered by test/navigation.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const view = require('../media/view');
const { boot } = require('./navigation-harness');
const { catalogue, snapshot, WS_STORE, WS_VIZ, WS_DOCS, HOSTILE } = require('./navigation-fixture');

const settle = () => new Promise(resolve => setImmediate(resolve));
const queries = page => page.posted.filter(message => message.type === 'query');
const selects = page => page.posted.filter(message => message.type === 'select');
const listed = page => page.options('session').map(option => option.value);

// The contract host. It filters before answering and names only the fields the contract lists.
function contractHost(page, full, selectedId = '') {
  const host = {
    full, selectedId,
    state(requestId, query, extra = {}) {
      const found = query ? view.filterSessions(host.full, { workspaceKey: query.workspaceKey, name: query.name, id: query.sessionId }) : host.full;
      const selected = host.full.find(session => session.id === host.selectedId);
      page.raw({ type: 'state', queryRequestId: requestId, sessions: found, selectedId: host.selectedId, snapshot: selected ? snapshot(selected) : null, warnings: [],
        workspaces: view.workspaceChoices(host.full).map(({ key, label }) => ({ key, label })), ...extra });
    },
    // Before any query the acknowledged ID is zero.
    first(extra) { host.state(0, null, extra); },
    answer(query = queries(page).at(-1), extra) { host.state(query.requestId, query, extra); }
  };
  return host;
}

function open(options = {}, selectedId = 'claude:a1') {
  const page = boot({ answer: false, ...options });
  const host = contractHost(page, catalogue(), selectedId);
  return { page, host, sessions: host.full };
}

const change = (page, id, value) => { page.elements[id].stored = value; page.elements[id].fire('change'); };

test('a host that acknowledges queryRequestId is sent the frozen query message, trimmed and numbered upwards', () => {
  const { page, host } = open();
  host.first();
  assert.deepEqual(queries(page), [], 'nothing is asked while no filter is set');
  page.type('name-filter', '  Fix LOGIN ');
  change(page, 'workspace', WS_STORE);
  page.type('id-filter', ' 9A55-0C1E2D3F4B02 ');
  const sent = queries(page);
  assert.deepEqual(sent.map(message => Object.keys(message).sort()), Array(3).fill(['name', 'requestId', 'sessionId', 'type', 'workspaceKey']));
  assert.deepEqual(sent.map(({ workspaceKey, name, sessionId }) => [workspaceKey, name, sessionId]),
    [['', 'Fix LOGIN', ''], [WS_STORE, 'Fix LOGIN', ''], [WS_STORE, 'Fix LOGIN', '9A55-0C1E2D3F4B02']]);
  const numbers = sent.map(message => message.requestId);
  assert.ok(numbers.every((number, index) => Number.isInteger(number) && number > (index ? numbers[index - 1] : 0)), String(numbers));
  // The typed text itself is left alone; only the request is trimmed.
  assert.equal(page.elements['name-filter'].value, '  Fix LOGIN ');
});

test('project, name and ID filters intersect on the contract host, past the first eight ID characters', () => {
  const { page, host } = open();
  host.first();
  assert.deepEqual(page.options('workspace').map(option => [option.value, option.text]),
    [['', 'All projects'], [WS_VIZ, 'agentviz'], [WS_DOCS, 'docs-site'], [WS_STORE, 'storefront']], 'no count is shown that the host did not send');
  assert.deepEqual(listed(page), host.full.map(session => session.id));
  assert.equal(page.elements.session.value, 'claude:a1');
  assert.match(page.elements.matches.textContent, /^6 sessions listed\.$/, 'no source total is claimed that the host did not send');

  page.type('name-filter', 'fix login');
  host.answer();
  assert.deepEqual(listed(page), ['claude:a1', 'codex:b1', 'claude:e1'], 'one name, three sessions, two projects');
  change(page, 'workspace', WS_STORE);
  host.answer();
  assert.deepEqual(listed(page), ['claude:a1', 'codex:b1'], 'duplicate names in one project stay two rows');
  const rows = page.options('session').map(option => option.text);
  assert.notEqual(rows[0], rows[1]);
  for (const row of rows) {
    const order = ['storefront', 'Fix login redirect', '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4', row.includes('Codex') ? 'Codex' : 'Claude'].map(part => row.indexOf(part));
    assert.ok(order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1])), row);
  }
  // A fragment that begins after the eighth character, in another case.
  page.type('id-filter', '0C1E2D3F4B');
  host.answer();
  assert.deepEqual(listed(page), ['', 'codex:b1']);
  // The complete ID.
  page.type('id-filter', '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4a01');
  host.answer();
  assert.deepEqual(listed(page), ['claude:a1']);
  assert.equal(page.elements.session.value, 'claude:a1');
  assert.deepEqual(selects(page), [], 'filtering alone never changes the followed session');
});

test('answers to older requests are dropped; the wait is shown and typed text and focus stay put', () => {
  const { page, host, sessions } = open();
  host.first();
  page.type('name-filter', 'zzz');
  const [older] = queries(page);
  assert.match(page.options('session')[0].text, /Looking up sessions/);
  page.type('name-filter', 'filters');
  const input = page.elements['name-filter'];

  host.answer(older);
  assert.match(page.elements.matches.textContent, /Looking up sessions/, 'the answer to "zzz" is not shown under "filters"');
  assert.deepEqual(listed(page), ['', 'claude:c1'], 'still the earlier list, narrowed in the page');
  host.first();
  assert.match(page.elements.matches.textContent, /Looking up sessions/, 'an unfiltered answer does not bring every session back');
  // Background refreshes for the current request, one of them with a rename.
  host.answer();
  host.answer();
  host.full = sessions.map(session => session.id === 'claude:c1' ? { ...session, name: 'Add session filters v2' } : session);
  host.answer();
  assert.deepEqual(listed(page), ['', 'claude:c1']);
  assert.match(page.options('session')[1].text, /Add session filters v2/);
  assert.match(page.elements.matches.textContent, /^1 session matches\.$/);
  assert.equal(page.document.activeElement, input);
  assert.equal(input.value, 'filters');
  assert.equal(input.valueWrites, 0, 'the controller never rewrites what the user typed');
  assert.equal(page.elements['selected-id'].textContent, sessions[0].sessionId);

  // Once the host has acknowledged by number, an answer without a usable number is not trusted.
  const before = listed(page);
  for (const queryRequestId of [undefined, '3', -1, 2.5, null]) page.raw({ type: 'state', queryRequestId, sessions: sessions, selectedId: 'codex:b1', snapshot: null, warnings: [] });
  assert.deepEqual(listed(page), before);
  assert.equal(page.elements['selected-id'].textContent, sessions[0].sessionId);
});

test('filters restored from saved state are asked again in the frozen form before any list is shown as their answer', () => {
  const { page, host } = open({ saved: { workspaceKey: WS_STORE, workspaceLabel: 'storefront', name: 'login', id: '4b02' } });
  assert.equal(page.elements['name-filter'].value, 'login');
  host.first();
  assert.deepEqual(queries(page).map(({ type, workspaceKey, name, sessionId }) => ({ type, workspaceKey, name, sessionId })),
    [{ type: 'query', workspaceKey: WS_STORE, name: 'login', sessionId: '4b02' }]);
  assert.match(page.elements.matches.textContent, /Looking up sessions/, 'the unfiltered first answer is not passed off as the filtered one');
  host.answer();
  assert.deepEqual(listed(page), ['', 'codex:b1']);
  assert.equal(page.elements.workspace.value, WS_STORE);
  host.answer();
  assert.equal(queries(page).length, 1, 'asked once, not on every refresh');
});

test('a selection the filters exclude stays followed and named; nothing else is shown under its label', () => {
  const { page, host, sessions } = open();
  host.first();
  change(page, 'workspace', WS_VIZ);
  // The contract answer carries no separate entry for the followed session, and the filtered list leaves it out.
  host.answer();
  const options = page.options('session');
  assert.match(options[0].text, /Followed session is hidden by these filters/);
  assert.deepEqual(options.slice(1).map(option => option.value), ['claude:c1', 'codex:d1']);
  assert.equal(page.elements.session.value, '', 'the picker does not fall through to the first match');
  assert.equal(page.elements.selection.hidden, false);
  assert.equal(page.elements['selected-workspace'].textContent, 'storefront');
  assert.equal(page.elements['selected-name'].textContent, 'Fix login redirect');
  assert.equal(page.elements['selected-id'].textContent, sessions[0].sessionId);
  assert.match(page.elements['selected-provider'].textContent, /^Claude Code/);
  assert.match(page.elements['selection-note'].textContent, /Hidden by the current filters\. Still followed until you choose another session\./);
  assert.match(page.elements.content.innerHTML, /3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4a01/);
  assert.match(page.elements.content.innerHTML, /Reading files/, 'its own activity is still drawn');
  assert.doesNotMatch(page.elements.content.innerHTML, /Add Session Filters|9d8c7b6a/);

  // No matches: still the same session, and the list says there is nothing to choose.
  page.type('name-filter', 'nothing called this');
  host.answer();
  assert.deepEqual(listed(page), ['']);
  assert.match(page.options('session')[0].text, /No sessions match these filters/);
  assert.equal(page.elements.session.disabled, true);
  assert.match(page.elements.matches.textContent, /^No sessions match\. Clear filters to see every session\.$/);
  assert.equal(page.elements['selected-id'].textContent, sessions[0].sessionId);
  assert.deepEqual(selects(page), []);

  // A snapshot that belongs to another session is never drawn under the followed label.
  host.answer(undefined, { snapshot: snapshot(sessions[2], 'Stale activity') });
  assert.doesNotMatch(page.elements.content.innerHTML, /Stale activity/);
  assert.equal(page.elements['selected-name'].textContent, 'Fix login redirect');

  // Clearing asks for everything in the frozen form and puts the followed session back in the picker.
  page.elements['clear-filters'].fire('click');
  const cleared = queries(page).at(-1);
  assert.deepEqual([cleared.workspaceKey, cleared.name, cleared.sessionId], ['', '', '']);
  host.answer();
  assert.deepEqual(listed(page), sessions.map(session => session.id));
  assert.equal(page.elements.session.value, 'claude:a1');
  assert.equal(page.elements['selection-note'].textContent, '');
  assert.equal(page.elements['clear-filters'].disabled, true);
  assert.equal(page.document.activeElement, page.elements['name-filter']);

  // Only choosing a listed session moves the selection, and the old activity leaves with it.
  change(page, 'workspace', WS_VIZ);
  host.answer();
  change(page, 'session', 'claude:c1');
  assert.deepEqual(selects(page), [{ type: 'select', id: 'claude:c1' }]);
  assert.equal(page.elements['selected-name'].textContent, 'Add Session Filters');
  assert.doesNotMatch(page.elements.content.innerHTML, /Reading files/);
});

test('a followed session the page has never been told about is not given another session\'s name', () => {
  const { page, host } = open({}, 'claude:never-listed');
  host.first({ snapshot: snapshot(catalogue()[0]) });
  assert.equal(page.elements.selection.hidden, true);
  assert.equal(page.elements.session.value, '');
  assert.match(page.options('session')[0].text, /Choose a session/);
  assert.match(page.elements.content.innerHTML, /No session selected/);
  assert.doesNotMatch(page.elements.content.innerHTML, /Reading files/);
  // The host moves the selection away from a remembered one: the remembered name does not linger.
  host.selectedId = 'claude:a1';
  host.first();
  assert.equal(page.elements['selected-name'].textContent, 'Fix login redirect');
  host.selectedId = 'claude:never-listed';
  change(page, 'workspace', WS_VIZ);
  host.answer();
  assert.equal(page.elements.selection.hidden, true);
});

test('keyboard, hostile titles, copy and example mode work the same on the contract host', async () => {
  const { page, host, sessions } = open({}, 'claude:f1');
  host.first();
  // Hostile title text is only ever text.
  assert.equal(page.elements['selected-name'].textContent, HOSTILE);
  for (const id of ['session', 'workspace', 'selection', 'matches', 'selected-name']) assert.equal(page.elements[id].innerHTML, '', id);
  assert.doesNotMatch(page.elements.content.innerHTML, /<img/);
  assert.match(page.elements.content.innerHTML, /&lt;img src=x/);
  page.type('name-filter', '<IMG SRC');
  host.answer();
  assert.deepEqual(listed(page), ['claude:f1']);

  // Escape empties the focused filter, asks again, and leaves an empty filter's Escape to the editor.
  const escape = page.elements['name-filter'].fire('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.deepEqual([queries(page).at(-1).name, queries(page).at(-1).requestId > queries(page).at(-2).requestId], ['', true]);
  assert.equal(page.elements['name-filter'].fire('keydown', { key: 'Escape' }).defaultPrevented, false);
  host.answer();

  // The whole ID is copied, not the shortened one in the list.
  page.elements['copy-id'].fire('click');
  await settle();
  assert.deepEqual(page.copied, [sessions[5].sessionId]);
  assert.match(page.elements['copy-status'].textContent, /copied/i);

  // Example mode names the example, keeps filtering the real list, and stores no catalogue data.
  page.elements.example.fire('click');
  assert.equal(page.elements['selected-id'].textContent, 'example-session');
  assert.match(page.elements['selected-provider'].textContent, /synthetic example/i);
  assert.match(page.elements.content.innerHTML, /SYNTHETIC EXAMPLE/);
  assert.equal(page.elements.session.value, '');
  page.type('id-filter', 'BEEF');
  assert.equal(queries(page).at(-1).sessionId, 'BEEF');
  host.answer();
  assert.deepEqual(listed(page), ['', 'claude:f1']);
  assert.match(page.options('session')[0].text, /Example shown/);
  assert.deepEqual(Object.keys(page.states.at(-1)).sort(), ['example', 'id', 'name', 'workspaceKey', 'workspaceLabel']);
  assert.doesNotMatch(JSON.stringify(page.states), /claude:f1|77770000|onerror|Reading files/);
});

test('malformed project groups and entries from the host are skipped, not shown', () => {
  const { page, host } = open();
  host.first({ workspaces: [null, 'storefront', { label: 'no key' }, { key: 7, label: 'bad key' }, { key: WS_STORE, label: '' }, { key: WS_VIZ, label: 'agentviz', count: 2 }, { key: WS_DOCS, label: 'docs-site', count: -1 }],
    sessions: [null, 7, { name: 'no id' }, ...host.full.slice(0, 2)], warnings: 'not a list' });
  assert.deepEqual(page.options('workspace').slice(1).map(option => option.text), ['agentviz (2)', 'docs-site', 'Unknown workspace']);
  assert.deepEqual(listed(page), ['claude:a1', 'codex:b1']);
  assert.equal(page.elements.connection.textContent, '');
});

test('a legacy snapshot without the new fields still lists, filters and names its sessions', () => {
  const page = boot({ answer: false });
  // The shape from before S01: no workspace, name, lookup, group or acknowledgement fields at all.
  const old = [
    { id: 'claude:old1', sessionId: 'aaaa1111-0000-4000-8000-000000000001', provider: 'claude', project: 'storefront', child: false, modified: 1800000000000 },
    { id: 'codex:old2', sessionId: 'bbbb2222-0000-4000-8000-000000000002', provider: 'codex', project: 'docs-site', child: false, modified: 1799999990000 }
  ];
  const legacy = () => page.raw({ type: 'state', sessions: old, selectedId: 'codex:old2', snapshot: snapshot({ ...old[1], project: 'docs-site' }), warnings: [] });
  legacy();
  const text = JSON.stringify([page.options('session'), page.options('workspace'), page.elements['selected-workspace'].textContent, page.elements['selected-name'].textContent, page.elements.content.innerHTML]);
  assert.doesNotMatch(text, /undefined|null|NaN/);
  assert.deepEqual(listed(page), ['claude:old1', 'codex:old2']);
  assert.equal(page.elements.session.value, 'codex:old2');
  assert.deepEqual(page.options('workspace').map(option => option.text), ['All projects (2)', 'Unknown workspace (2)']);
  assert.match(page.options('session')[0].text, /^storefront › Unnamed session · aaaa1111/);
  assert.equal(page.elements['selected-workspace'].textContent, 'docs-site');
  assert.equal(page.elements['selected-name'].textContent, 'Unnamed session');
  assert.equal(page.elements['selected-id'].textContent, 'bbbb2222-0000-4000-8000-000000000002');
  assert.match(page.elements.content.innerHTML, /Reading files/);

  // That host has not acknowledged by number, so it keeps getting the older request form, and the page narrows its list itself.
  page.type('id-filter', '0000-4000-8000-000000000001');
  assert.deepEqual(Object.keys(queries(page).at(-1)).sort(), ['id', 'name', 'seq', 'type', 'workspaceKey']);
  legacy();
  assert.deepEqual(listed(page), ['', 'claude:old1']);
  assert.equal(page.elements['selected-id'].textContent, 'bbbb2222-0000-4000-8000-000000000002');
  assert.match(page.elements['selection-note'].textContent, /Hidden by the current filters/);
  assert.equal(page.elements['id-filter'].valueWrites, 0);
});
