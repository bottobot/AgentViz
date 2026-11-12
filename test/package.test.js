'use strict';
// Release packaging (S10). What a VSIX may hold is decided by .vscodeignore; these tests keep it an allow-list
// and build a real package from a folder seeded with the kinds of private files that must never ship.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readArchive, judge, staleFiles, PRODUCT, ENVELOPE } = require('./vsix-check');

const root = path.join(__dirname, '..');
const vsce = path.join(root, 'node_modules', '@vscode', 'vsce', 'vsce');
const ALLOWED = ['!package.json', '!README.md', '!src/*.js', '!media/app.js', '!media/view.js', '!media/style.css'];

test('.vscodeignore ignores everything first and then allows only the product files', () => {
  const rules = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  assert.equal(rules[0], '**', 'the first rule ignores everything, so a new file is left out until it is allowed');
  assert.deepEqual(rules.filter(rule => rule.startsWith('!')).sort(), [...ALLOWED].sort(), 'only the product files are allowed back in');
  const lastAllow = Math.max(...rules.map((rule, index) => rule.startsWith('!') ? index : -1));
  // Explicit exclusions come after the allowed files, so they win even if an allow rule is widened later.
  for (const rule of ['test/**', 'docs/**', 'artifacts/**', 'workflows/**', 'node_modules/**', '.agentboard/**', '.claude/**', '**/*.jsonl', '**/*.vsix', 'ORCHESTRATION.md', 'HANDOFF.md'])
    assert.ok(rules.indexOf(rule) > lastAllow, `${rule} is excluded after the allow rules`);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies, undefined, 'no runtime dependencies');
  assert.equal(manifest.files, undefined, 'the ignore file alone decides the package contents');
  assert.match(manifest.scripts.package, /--no-dependencies/);
});

test('the package inspector passes only the exact product set with no local path inside', () => {
  const good = [...ENVELOPE, ...PRODUCT].map(name => ({ name, data: Buffer.from(name === 'extension/package.json' ? '{"main":"./src/extension.js"}' : 'synthetic') }));
  assert.deepEqual(judge(good, ['c:\\users\\synthetic']).problems, []);
  const problems = entries => judge(entries, ['c:\\users\\synthetic', '/users/synthetic']).problems.join(' | ');
  assert.match(problems([...good, { name: 'extension/test/extension.test.js', data: Buffer.from('x') }]), /unexpected file in the package: extension\/test\/extension\.test\.js/);
  assert.match(problems([...good, { name: 'extension/.claude/settings.local.json', data: Buffer.from('{}') }]), /unexpected file/);
  assert.match(problems([...good, { name: 'extension/node_modules/x/index.js', data: Buffer.from('x') }]), /unexpected file/);
  assert.match(problems(good.filter(entry => entry.name !== 'extension/media/view.js')), /missing from the package: extension\/media\/view\.js/);
  assert.match(problems(good.map(entry => entry.name === 'extension/readme.md' ? { ...entry, data: Buffer.from('see C:\\Users\\Synthetic\\notes') } : entry)), /local path of this machine is inside extension\/readme\.md/);
  assert.match(problems(good.map(entry => entry.name === 'extension/src/sessions.js' ? { ...entry, data: Buffer.from('file:///C:/Users/synthetic/x') } : entry)), /local path/);
  assert.match(problems(good.map(entry => entry.name === 'extension/package.json' ? { ...entry, data: Buffer.from('{"main":"./src/extension.js","dependencies":{"left-pad":"1"}}') } : entry)), /runtime dependencies/);
  assert.match(problems(good.map(entry => entry.name === 'extension/package.json' ? { ...entry, data: Buffer.from('not json') } : entry)), /not readable JSON/);
  assert.match(problems([...good, good[2]]), /same path twice/);
  // A package that no longer matches the checkout it sits in is stale, and so is one checked against no checkout.
  const current = PRODUCT.map(name => ({ name, data: fs.readFileSync(path.join(root, name === 'extension/readme.md' ? 'README.md' : name.slice(10))) }));
  assert.deepEqual(staleFiles(current, root), []);
  assert.match(staleFiles(current.map(entry => entry.name === 'extension/src/webview.js' ? { ...entry, data: Buffer.from('older build') } : entry), root).join(' | '), /^extension\/src\/webview\.js differs from the checkout/);
  assert.equal(staleFiles(current, path.join(root, 'no-such-folder')).length, PRODUCT.length);
  // Nothing readable is never a pass.
  assert.notDeepEqual(judge([], []).problems, []);
  assert.throws(() => readArchive(Buffer.from('this is not an archive at all, just some synthetic text')), /not a zip archive/);
  assert.throws(() => readArchive(Buffer.alloc(0)), /not a zip archive/);
});

test('the README that ships in the package describes this release and carries no orchestration material', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  // It is packaged, so planning and board material stay out of it.
  for (const word of ['workflows/', 'ORCHESTRATION.md', '.agentboard', 'Run a Plan', 'agentviz-next', 'not launched', 'HANDOFF.md'])
    assert.ok(!readme.includes(word), `the shipped README does not mention ${word}`);
  // Current behaviour, launch and check commands, and the limits earlier steps left for the handoff.
  for (const text of ['Project / workspace', 'Session name', 'Session ID (optional)', 'Unnamed session', 'Copy ID', 'Agent lanes', 'Task list progress', 'File activity',
    'agentviz.openSession', 'npm run host', 'npm run browser', 'npm run package:check', 'more than a day after this machine\'s clock', 'Not verified: Linux, VSCodium',
    'No AgentBoard caller exists yet', 'allow-list'])
    assert.ok(readme.includes(text), `the README states: ${text}`);
  const { name, version, scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(readme.includes(`${name}-${version}.vsix`), 'the README names the package file this version builds');
  for (const command of readme.match(/npm run [\w:-]+/g)) assert.ok(scripts[command.slice(8)], `${command} exists in package.json`);
});

test('a package built beside transcripts, settings, evidence and orchestration files holds only the product', { skip: fs.existsSync(vsce) ? false : 'the packaging tool is not installed (npm ci --ignore-scripts); the built package was NOT checked by this run' }, () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agentviz-package-'));
  try {
    for (const name of ['package.json', 'README.md', '.vscodeignore']) fs.copyFileSync(path.join(root, name), path.join(folder, name));
    for (const dir of ['src', 'media']) fs.cpSync(path.join(root, dir), path.join(folder, dir), { recursive: true });
    // Synthetic stand-ins for what a working checkout collects. None of these may reach the package.
    const strays = ['.claude/settings.local.json', '.claude/retrospective/library/invariants.yaml', '.env', 'notes.md', 'session-copy.jsonl', 'src/captured-transcript.jsonl',
      'src/notes.md', 'media/screenshot.png', 'media/extra.js', 'artifacts/host/extension-host-result.json', '.agentboard/tasks.json', 'test/extension.test.js', 'docs/development/agentviz-next-run.md',
      'ORCHESTRATION.md', 'HANDOFF.md', 'workflows/agentviz-next.plan.json', 'node_modules/left-pad/index.js', 'old-build-0.0.1.vsix', 'AgentViz.code-workspace', 'package-lock.json', '.vscode/launch.json', '.gitignore', 'src/nested/deep.js'];
    for (const stray of strays) {
      fs.mkdirSync(path.dirname(path.join(folder, stray)), { recursive: true });
      fs.writeFileSync(path.join(folder, stray), 'PRIVATE_STRAY synthetic content');
    }
    const out = path.join(folder, 'built.vsix');
    const run = spawnSync(process.execPath, [vsce, 'package', '--no-dependencies', '--allow-missing-repository', '--skip-license', '--out', out], { cwd: folder, encoding: 'utf8', timeout: 120000 });
    assert.equal(run.status, 0, `packaging failed: ${(run.stderr || run.stdout || String(run.error)).slice(0, 400)}`);
    const entries = readArchive(fs.readFileSync(out));
    assert.deepEqual(entries.map(entry => entry.name).sort(), [...ENVELOPE, ...PRODUCT].sort());
    for (const entry of entries) assert.ok(!entry.data.includes('PRIVATE_STRAY'), `${entry.name} holds stray content`);
    assert.deepEqual(judge(entries).problems, []);
    // The packaged files are the checkout's own, byte for byte (the tool only renames README.md).
    for (const [packed, source] of [['extension/src/sessions.js', 'src/sessions.js'], ['extension/media/view.js', 'media/view.js'], ['extension/readme.md', 'README.md']])
      assert.ok(entries.find(entry => entry.name === packed).data.equals(fs.readFileSync(path.join(root, source))), `${packed} equals ${source}`);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
