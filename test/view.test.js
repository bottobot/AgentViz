const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize, activityBuckets, render, demoSession } = require('../media/view');

// SPEC: first-slice acceptance 4, map and timeline use the same event counts.
test('station and activity totals count calls once and exclude lifecycle markers', () => {
  const session = demoSession(1800000);
  const summary = summarize(session.events);
  const buckets = activityBuckets(session.events, 1800000);
  assert.equal(Object.values(summary.counts).reduce((a, b) => a + b, 0), summary.total);
  assert.equal(buckets.reduce((n, bucket) => n + bucket.total, 0), summary.total);
  assert.ok(summary.errors > 0);
});

test('fixed thirty second buckets preserve silence and positions between new events', () => {
  const events = [{ id: 'one', time: 120000, kind: 'files', label: 'Reading files', outcome: 'success' }, { id: 'two', time: 210000, kind: 'edits', label: 'Editing files', outcome: 'error' }];
  const before = activityBuckets(events, 215000);
  const after = activityBuckets([...events, { ...events[1], id: 'three', time: 216000 }], 218000);
  assert.equal(before.findIndex(bucket => bucket.start === 120000), after.findIndex(bucket => bucket.start === 120000));
  assert.equal(before.find(bucket => bucket.start === 150000).total, 0);
  assert.equal(after.find(bucket => bucket.start === 210000).errors, 2);
  assert.ok(activityBuckets(events, 9000000).every(bucket => bucket.total === 0));
});

test('the view escapes names, distinguishes synthetic data and reports history gaps', () => {
  const demo = demoSession(1800000);
  demo.project = '<img src=x onerror=alert(1)>';
  demo.droppedEvents = 45;
  demo.invalidLines = 2;
  const html = render(demo, { now: 1800000, example: true });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /Example session/);
  assert.match(html, /45/);
  assert.match(html, /2 malformed/);
  assert.match(render(null), /Choose a session|No session/);
});

// S02: workspace, name and ID navigation. Synthetic catalogue only.
const { filterSessions, navigate, workspaceChoices, idLabels, sessionLabel, demoCatalogue, demoIdentity } = require('../media/view');
const { catalogue, snapshot, WS_STORE, WS_VIZ, WS_DOCS, HOSTILE } = require('./navigation-fixture');
const ids = list => list.map(session => session.id);

test('workspace, name and ID filters intersect, ignore case and trim surrounding whitespace', () => {
  const sessions = catalogue();
  assert.deepEqual(ids(filterSessions(sessions, {})), ids(sessions));
  assert.deepEqual(ids(filterSessions(sessions, { name: '  FIX LOGIN  ' })), ['claude:a1', 'codex:b1', 'claude:e1']);
  assert.deepEqual(ids(filterSessions(sessions, { workspaceKey: WS_STORE, name: 'fix login' })), ['claude:a1', 'codex:b1']);
  assert.deepEqual(ids(filterSessions(sessions, { workspaceKey: WS_STORE, name: 'fix login', id: ' 4B02 ' })), ['codex:b1']);
  assert.deepEqual(ids(filterSessions(sessions, { workspaceKey: WS_VIZ, name: 'fix login' })), []);
  assert.deepEqual(ids(filterSessions(sessions, { workspaceKey: WS_DOCS, id: 'abcdef12' })), ['claude:e1']);
  // Whitespace only filters are no filter at all.
  assert.deepEqual(ids(filterSessions(sessions, { name: '   ', id: '\t' })), ids(sessions));
});

test('ID search matches the complete ID and fragments beyond the first eight characters', () => {
  const sessions = catalogue();
  assert.deepEqual(ids(filterSessions(sessions, { id: '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4b02' })), ['codex:b1']);
  assert.deepEqual(ids(filterSessions(sessions, { id: '3F2A9C1E-7B64-4D10-9A55-0C1E2D3F4B02' })), ['codex:b1']);
  assert.deepEqual(ids(filterSessions(sessions, { id: '3f2a9c1e' })), ['claude:a1', 'codex:b1']);
  assert.deepEqual(ids(filterSessions(sessions, { id: '9a55-0c1e2d3f4a' })), ['claude:a1']);
  assert.deepEqual(ids(filterSessions(sessions, { id: 'beef' })), ['claude:f1']);
  assert.deepEqual(ids(filterSessions(sessions, { id: '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4b02x' })), []);
  // The ID filter never searches the name, and the name filter never searches the ID.
  assert.deepEqual(ids(filterSessions(sessions, { id: 'login' })), []);
  assert.deepEqual(ids(filterSessions(sessions, { name: '3f2a9c1e' })), []);
});

test('duplicate names stay distinguishable by workspace and by an ID prefix long enough to differ', () => {
  const sessions = catalogue();
  const short = idLabels(sessions);
  const labels = sessions.map(session => sessionLabel(session, short.get(session.id)));
  assert.equal(new Set(labels).size, sessions.length);
  assert.notEqual(short.get('claude:a1'), short.get('codex:b1'));
  assert.ok(short.get('claude:a1').length > 9, 'a shared eight character prefix is extended');
  assert.equal(short.get('claude:c1'), '9d8c7b6a…');
  // Order inside one label: workspace, then name, then ID, then provider as supporting detail.
  const label = labels[1];
  const order = ['storefront', 'Fix login redirect', '3f2a9c1e', 'Codex'].map(part => label.indexOf(part));
  assert.ok(order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1])), label);
  assert.match(sessionLabel(sessions[3], short.get('codex:d1')), /subagent/);
});

test('project choices count sessions per workspace key and keep equal labels apart', () => {
  const sessions = catalogue();
  assert.deepEqual(workspaceChoices(sessions).map(choice => [choice.key, choice.label, choice.count]),
    [[WS_VIZ, 'agentviz', 2], [WS_DOCS, 'docs-site', 2], [WS_STORE, 'storefront', 2]]);
  const twin = { ...sessions[0], id: 'claude:z9', workspaceKey: `ws:${'d'.repeat(20)}` };
  const choices = workspaceChoices([...sessions, twin]).filter(choice => choice.label.startsWith('storefront'));
  assert.equal(choices.length, 2);
  assert.notEqual(choices[0].label, choices[1].label);
});

test('a filter that excludes the selection keeps it identified and never substitutes a match', () => {
  const sessions = catalogue();
  const shown = navigate(sessions, { name: 'fix login' }, 'claude:a1');
  assert.equal(shown.selected.id, 'claude:a1');
  assert.equal(shown.excluded, false);
  const hidden = navigate(sessions, { workspaceKey: WS_VIZ }, 'claude:a1');
  assert.deepEqual(ids(hidden.matches), ['claude:c1', 'codex:d1']);
  assert.equal(hidden.selected.id, 'claude:a1');
  assert.equal(hidden.excluded, true);
  const none = navigate(sessions, { name: 'no such session' }, 'claude:a1');
  assert.deepEqual(none.matches, []);
  assert.equal(none.selected.id, 'claude:a1');
  assert.equal(none.excluded, true);
  assert.equal(none.active, true);
  const cleared = navigate(sessions, { workspaceKey: '', name: '', id: '' }, 'claude:a1');
  assert.equal(cleared.matches.length, sessions.length);
  assert.equal(cleared.active, false);
  assert.equal(navigate(sessions, {}, 'claude:gone').selected, null);
});

test('the heading shows workspace, name, full ID then provider, and escapes hostile titles', () => {
  const sessions = catalogue();
  const html = render(snapshot(sessions[1]), { now: 1800000001000, identity: sessions[1] });
  const order = ['storefront', 'Fix login redirect', '3f2a9c1e-7b64-4d10-9a55-0c1e2d3f4b02', 'Codex'].map(part => html.indexOf(part));
  assert.ok(order.every((at, index) => at >= 0 && (index === 0 || at > order[index - 1])), String(order));
  const hostile = render(snapshot(sessions[5]), { now: 1800000001000, identity: { ...sessions[5], workspaceLabel: HOSTILE } });
  assert.doesNotMatch(hostile, /<img/);
  assert.match(hostile, /&lt;img src=x onerror=alert\(1\)&gt;&quot;&#39;&amp;/);
  // A selected session whose activity has not arrived is named, not replaced by another session.
  const loading = render(null, { identity: sessions[2] });
  assert.match(loading, /Add Session Filters/);
  assert.match(loading, /9d8c7b6a-1111-4222-8333-444455556666/);
  assert.doesNotMatch(loading, /No session selected/);
});

test('the example catalogue is synthetic, filterable and holds duplicate names', () => {
  const demo = demoCatalogue(1800000000000);
  assert.ok(demo.length >= 5);
  assert.ok(demo.every(session => /^demo:/.test(session.id) && /^ws:[0-9a-f]{20}$/.test(session.workspaceKey)));
  const names = demo.map(session => session.name);
  assert.ok(names.length > new Set(names).size, 'the example includes a duplicate name');
  const short = idLabels(demo);
  assert.equal(new Set(demo.map(session => sessionLabel(session, short.get(session.id)))).size, demo.length);
  assert.ok(workspaceChoices(demo).length >= 2);
  assert.equal(demoIdentity.sessionId, 'example-session');
});
