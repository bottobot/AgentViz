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
