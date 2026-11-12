const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const filename = 'agentviz-next.parallel.plan.json';
const folder = path.resolve(__dirname, '../workflows');
const active = path.join(folder, filename);
const archive = path.join(folder, 'archive');
const candidates = fs.existsSync(active) ? [active] : fs.readdirSync(archive)
  .filter(name => name === filename || (name.startsWith('agentviz-next.parallel-') && name.endsWith('.plan.json')))
  .map(name => path.join(archive, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
assert.ok(candidates.length, 'Active or archived parallel workflow must be available');
const plan = JSON.parse(fs.readFileSync(candidates[0], 'utf8'));
const byId = new Map(plan.steps.map(step => [step.id, step]));

function ancestors(id, visiting = new Set()) {
  assert.ok(byId.has(id), `Unknown dependency: ${id}`);
  assert.ok(!visiting.has(id), `Dependency cycle at ${id}`);
  const next = new Set([...visiting, id]);
  const result = new Set();
  for (const dependency of byId.get(id).after || []) {
    result.add(dependency);
    for (const previous of ancestors(dependency, next)) result.add(previous);
  }
  return result;
}

function ready(done = []) {
  return plan.steps.filter(step => !done.includes(step.id) && (step.after || []).every(id => done.includes(id))).map(step => step.id);
}

test('parallel plan exposes three independent starting tasks and remains acyclic', () => {
  assert.equal(byId.size, plan.steps.length);
  for (const step of plan.steps) ancestors(step.id);
  assert.deepEqual(ready().sort(), ['filters', 'host-harness', 'metadata']);
});

test('every pair that can run concurrently has disjoint declared writable paths', () => {
  let concurrentPairs = 0;
  for (let i = 0; i < plan.steps.length; i++) {
    for (let j = i + 1; j < plan.steps.length; j++) {
      const a = plan.steps[i], b = plan.steps[j];
      if (ancestors(a.id).has(b.id) || ancestors(b.id).has(a.id)) continue;
      concurrentPairs++;
      for (const first of a.files) for (const second of b.files) {
        const x = first.toLowerCase().replace(/\/$/, '');
        const y = second.toLowerCase().replace(/\/$/, '');
        assert.ok(x !== y && !x.startsWith(y + '/') && !y.startsWith(x + '/'), `${a.id} and ${b.id} both own ${first} / ${second}`);
      }
    }
  }
  assert.ok(concurrentPairs > 0);
});

test('join gates wait for both branches while independent command work can overlap progress', () => {
  assert.ok(!ready(['metadata']).includes('discovery'));
  assert.ok(!ready(['filters']).includes('discovery'));
  assert.ok(ready(['metadata', 'filters']).includes('discovery'));
  const completed = ['metadata', 'filters', 'discovery', 'lanes'];
  assert.ok(ready(completed).includes('progress'));
  assert.ok(ready(completed).includes('agentboard-entry'));
  assert.deepEqual(byId.get('resilience').after, ['footprint', 'agentboard-entry']);
  assert.deepEqual(byId.get('windows-acceptance').after, ['resilience', 'host-harness']);
  assert.ok(ancestors('handoff').has('host-harness'));
});

test('handoff alone can consolidate the ledger and receives no conflicting worker prohibition', () => {
  const ledger = 'docs/development/agentviz-next-parallel-run.md';
  for (const step of plan.steps) {
    assert.equal(step.files.includes(ledger), step.id === 'handoff');
    assert.ok(step.files.includes(`docs/development/agentviz-next/${step.id}.md`));
  }
  assert.ok(!byId.get('handoff').goal.includes('Do not edit the shared run ledger'));
  assert.ok(byId.get('handoff').goal.includes('must consolidate the other task receipts'));
});
