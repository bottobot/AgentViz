'use strict';
// media/app.js on answers that are incomplete or malformed: a followed session the page was never given an entry
// for, bad project groups and entries, and a catalogue from before workspaces and saved names existed.
// Synthetic catalogue only. This proves controller behaviour on the shared stand-in DOM; rendering in a browser and
// in a VS Code host is separate evidence. The ordinary request and answer form is covered by test/navigation.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const view = require('../media/view');
const { boot } = require('./navigation-harness');
const { catalogue, snapshot, WS_STORE, WS_VIZ, WS_DOCS } = require('./navigation-fixture');

const queries = page => page.posted.filter(message => message.type === 'query');
const listed = page => page.options('session').map(option => option.value);
const change = (page, id, value) => { page.elements[id].stored = value; page.elements[id].fire('change'); };

// A host that sends the list, the followed ID and the project groups, and no separate entry for the followed session.
function bareHost(page, full, selectedId = '') {
  const host = {
    full, selectedId,
    answer(extra = {}) {
      const query = queries(page).at(-1);
      const found = query ? view.filterSessions(host.full, { workspaceKey: query.workspaceKey, name: query.name, id: query.id }) : host.full;
      const selected = host.full.find(session => session.id === host.selectedId);
      page.raw({ type: 'state', sessions: found, selectedId: host.selectedId, snapshot: selected ? snapshot(selected) : null, warnings: [],
        workspaces: view.workspaceChoices(host.full).map(({ key, label }) => ({ key, label })), ...extra });
    }
  };
  return host;
}

function open(selectedId = 'claude:a1') {
  const page = boot({ answer: false });
  return { page, host: bareHost(page, catalogue(), selectedId) };
}

test('a followed session the page has never been told about is not given another session\'s name', () => {
  const { page, host } = open('claude:never-listed');
  host.answer({ snapshot: snapshot(catalogue()[0]) });
  assert.equal(page.elements.selection.hidden, true);
  assert.equal(page.elements.session.value, '');
  assert.match(page.options('session')[0].text, /Choose a session/);
  assert.match(page.elements.content.innerHTML, /No session selected/);
  assert.doesNotMatch(page.elements.content.innerHTML, /Reading files/);
  // The host moves the selection away from a remembered one: the remembered name does not linger.
  host.selectedId = 'claude:a1';
  host.answer();
  assert.equal(page.elements['selected-name'].textContent, 'Fix login redirect');
  host.selectedId = 'claude:never-listed';
  change(page, 'workspace', WS_VIZ);
  host.answer();
  assert.equal(page.elements.selection.hidden, true);
});

test('malformed project groups and entries from the host are skipped, not shown', () => {
  const { page, host } = open();
  host.answer({ workspaces: [null, 'storefront', { label: 'no key' }, { key: 7, label: 'bad key' }, { key: WS_STORE, label: '' }, { key: WS_VIZ, label: 'agentviz', count: 2 }, { key: WS_DOCS, label: 'docs-site', count: -1 }],
    sessions: [null, 7, { name: 'no id' }, ...host.full.slice(0, 2)], warnings: 'not a list' });
  assert.deepEqual(page.options('workspace').slice(1).map(option => option.text), ['agentviz (2)', 'docs-site', 'Unknown workspace']);
  assert.deepEqual(listed(page), ['claude:a1', 'codex:b1']);
  assert.equal(page.elements.connection.textContent, '');
});

test('a legacy snapshot without the new fields still lists, filters and names its sessions', () => {
  const page = boot({ answer: false });
  // The shape from before S01: no workspace, name, lookup or group fields at all.
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

  // The request keeps its one form, and the page narrows the unfiltered list itself.
  page.type('id-filter', '0000-4000-8000-000000000001');
  assert.deepEqual(Object.keys(queries(page).at(-1)).sort(), ['id', 'name', 'seq', 'type', 'workspaceKey']);
  legacy();
  assert.deepEqual(listed(page), ['', 'claude:old1']);
  assert.equal(page.elements['selected-id'].textContent, 'bbbb2222-0000-4000-8000-000000000002');
  assert.match(page.elements['selection-note'].textContent, /Hidden by the current filters/);
  assert.equal(page.elements['id-filter'].valueWrites, 0);
});
