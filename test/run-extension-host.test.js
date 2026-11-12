const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const base = require('./host-runner');
const runner = require('./run-extension-host.cjs');

// P01: the rules of test/run-extension-host.cjs. No editor is started here. Installs are invented folders, Git
// answers are invented, and the launch, result and stop rules run against a stand-in Node process.
const windows = process.platform === 'win32';
const temp = (t, prefix = runner.RUN_PREFIX) => { const folder = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); t.after(() => fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })); return folder; };
function install(root, { version = '1.146.0', name = 'Code.exe' } = {}) {
  const app = path.join(root, 'resources', 'app');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({ applicationName: 'code', commit: 'a'.repeat(40) }));
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ version }));
  const exe = path.join(root, name);
  fs.writeFileSync(exe, 'stand-in');
  return exe;
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const passing = extra => JSON.stringify({ passed: true, checks: [...base.REQUIRED], notRun: [], vscode: '1.146.0', ...extra });
// A stand-in host: a Node process that does what `body` says with the result path it was given.
const standIn = body => ['-e', `const fs = require('node:fs'); const file = process.env.AGENTVIZ_HOST_RESULT; ${body}`];
const noStop = calls => (child, marker) => { calls.push({ child: Boolean(child), marker }); return { stopped: [], listed: true }; };

test('executable selection is platform guarded and verified, with no silent fallback', t => {
  const root = temp(t, 'agentviz-install-');
  let asked = 0;
  const elsewhere = runner.selectExecutable({ platform: 'linux', env: {}, locate: () => { asked++; return { ok: true }; } });
  assert.equal(elsewhere.ok, false);
  assert.equal(elsewhere.unverified, true);
  assert.match(elsewhere.reason, /native Windows only, not linux/);
  assert.equal(asked, 0, 'Nothing is looked up off Windows');

  const env = { LOCALAPPDATA: path.join(root, 'local'), ProgramFiles: path.join(root, 'pf') };
  const none = runner.selectExecutable({ platform: 'win32', env, minimum: '1.96.0' });
  assert.equal(none.ok, false);
  assert.equal(none.unverified, true);
  assert.match(none.reason, /No usable VS Code executable/);

  const user = install(path.join(root, 'local', 'Programs', 'Microsoft VS Code'));
  const system = install(path.join(root, 'pf', 'Microsoft VS Code'), { version: '1.150.0' });
  assert.deepEqual(runner.selectExecutable({ platform: 'win32', env, minimum: '1.96.0' }), { ok: true, exe: user, version: '1.146.0', commit: 'aaaaaaaaaaaa' }, 'The per-user install is tried first');
  assert.equal(runner.selectExecutable({ platform: 'win32', env, minimum: '1.147.0' }).exe, system, 'An install that is too old is passed over for one that verifies');
  assert.match(runner.selectExecutable({ platform: 'win32', env, minimum: '1.200.0' }).reason, /older than the required 1\.200\.0/);

  // An explicit choice is the only candidate, and it must verify.
  assert.equal(runner.selectExecutable({ platform: 'win32', env: { ...env, AGENTVIZ_VSCODE: system }, minimum: '1.96.0' }).exe, system);
  assert.equal(runner.selectExecutable({ platform: 'win32', env: { ...env, AGENTVIZ_VSCODE: path.join(root, 'nowhere', 'Code.exe') }, minimum: '1.96.0' }).ok, false);
  const other = install(path.join(root, 'other'), { name: 'Other.exe' });
  assert.equal(runner.selectExecutable({ platform: 'win32', env: { ...env, AGENTVIZ_VSCODE: other }, minimum: '1.96.0' }).ok, false, 'Another program is refused');
});

test('the source revision is read from Git, and an unreadable answer is never taken as clean', () => {
  const commit = 'c0ffee'.padEnd(40, '0');
  const git = answers => (command, args) => {
    assert.equal(command, 'git');
    assert.deepEqual(args.slice(0, 2), ['-C', 'X:\\checkout']);
    const answer = answers[args.slice(2).join(' ')];
    return answer === undefined ? { status: 128, stdout: '' } : { status: 0, stdout: answer };
  };
  assert.deepEqual(runner.sourceRevision('X:\\checkout', git({ 'rev-parse HEAD': `${commit}\n`, 'status --porcelain': '', 'rev-parse --abbrev-ref HEAD': 'task/x\n' })),
    { ok: true, commit, branch: 'task/x', dirty: false, changed: [] });
  const dirty = runner.sourceRevision('X:\\checkout', git({ 'rev-parse HEAD': `${commit}\n`, 'status --porcelain': ' M src/extension.js\n?? test/new file.js\n', 'rev-parse --abbrev-ref HEAD': 'HEAD\n' }));
  assert.equal(dirty.dirty, true);
  assert.deepEqual(dirty.changed, ['src/extension.js', 'test/new file.js']);
  assert.equal(runner.sourceRevision('X:\\checkout', git({})).ok, false, 'No Git answer');
  assert.equal(runner.sourceRevision('X:\\checkout', git({ 'rev-parse HEAD': 'not a commit\n', 'status --porcelain': '' })).ok, false, 'Not a commit ID');
  assert.match(runner.sourceRevision('X:\\checkout', git({ 'rev-parse HEAD': `${commit}\n` })).reason, /state of the checkout/, 'An unreadable status is not a clean checkout');
  assert.equal(runner.sourceRevision('X:\\checkout', () => null).ok, false);
});

test('a missing, stale, unreadable, failed or incomplete result is a failure whatever the exit code says', () => {
  const run = { exitCode: 0, timedOut: false, startedMs: 1000, resultMtimeMs: 1500, expectedVersion: '1.146.0' };
  const good = runner.assess({ ...run, resultText: passing() });
  assert.equal(good.ok, true);
  assert.equal(good.stale, false);
  assert.deepEqual(good.problems, []);

  const missing = runner.assess({ ...run, resultText: undefined, resultMtimeMs: undefined });
  assert.equal(missing.ok, false);
  assert.equal(missing.stale, false);
  assert.match(missing.problems.join(' '), /wrote no result file/);

  // Stale: a passing record written before this run started, or one whose time cannot be read.
  for (const resultMtimeMs of [999, undefined, Number.NaN]) {
    const stale = runner.assess({ ...run, resultText: passing(), resultMtimeMs });
    assert.equal(stale.ok, false);
    assert.equal(stale.stale, true);
    assert.equal(stale.result, null, 'Nothing from a stale record is carried into the verdict');
    assert.match(stale.problems[0], /older than this run/);
    assert.doesNotMatch(stale.problems.join(' '), /wrote no result file/);
  }
  assert.equal(runner.assess({ ...run, resultText: passing(), resultMtimeMs: 1000 }).ok, true, 'Written at the start instant is this run');
  assert.equal(runner.assess({ ...run, resultText: passing(), startedMs: undefined }).stale, true, 'An unknown start time proves nothing');

  assert.match(runner.assess({ ...run, resultText: '{"passed": tr' }).problems.join(' '), /not readable JSON/);
  assert.match(runner.assess({ ...run, resultText: 'null' }).problems.join(' '), /not a result record/);
  const failed = runner.assess({ ...run, exitCode: 1, resultText: JSON.stringify({ passed: false, error: 'close: the editor stayed open', checks: [], notRun: [], vscode: '1.146.0' }) });
  assert.equal(failed.ok, false);
  assert.match(failed.problems.join(' '), /exited with code 1/);
  assert.match(failed.problems.join(' '), /the editor stayed open/);
  assert.match(runner.assess({ ...run, resultText: passing({ checks: base.REQUIRED.slice(1) }) }).problems.join(' '), /Checks missing from the result/);
  assert.match(runner.assess({ ...run, resultText: passing({ notRun: ['webview: name filter'] }) }).problems.join(' '), /Not run: webview: name filter/);
  assert.match(runner.assess({ ...run, resultText: passing({ vscode: '1.1.0' }) }).problems.join(' '), /not the verified 1\.146\.0/);
  assert.equal(runner.assess({ ...run, exitCode: 3, resultText: passing() }).ok, false, 'A passing record does not excuse a failing exit code');
  assert.equal(runner.assess({ ...run, timedOut: true, exitCode: -1, resultText: passing() }).ok, false, 'Nor a run that had to be stopped');
  const optional = runner.assess({ ...run, resultText: passing({ notRun: [`${base.OPTIONAL[0]} (not asked for)`] }) });
  assert.equal(optional.ok, true);
  assert.equal(optional.unverified.length, 1, 'An optional check that did not run is listed as unverified, not passed');
});

test('a run uses new isolated folders and waits for the explicit result of its own process', async t => {
  const folders = runner.prepareRun();
  t.after(() => fs.rmSync(folders.runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  assert.ok(path.basename(folders.runDir).startsWith(runner.RUN_PREFIX));
  assert.equal(path.dirname(folders.runDir), path.resolve(os.tmpdir()));
  assert.deepEqual(fs.readdirSync(folders.runDir), [], 'The run folder is new and empty');
  // A leftover record at the result path is removed before the launch, so it cannot be read back as this run's.
  fs.writeFileSync(folders.result, passing());
  const calls = [];
  const silent = await runner.runIsolated({ exe: process.execPath, args: standIn(''), folders, timeoutMs: 20000, resultGraceMs: 300, expectedVersion: '1.146.0', stop: noStop(calls) });
  assert.equal(silent.ok, false);
  assert.equal(silent.exitCode, 0);
  assert.match(silent.problems.join(' '), /wrote no result file/);
  assert.deepEqual(calls, [{ child: false, marker: folders.runDir }], 'After a normal exit only this run\'s folder is swept');

  // The profile the stand-in was given: inside the run folder, pointing both sources at the synthetic folder.
  const settings = JSON.parse(fs.readFileSync(path.join(folders.profile, 'User', 'settings.json'), 'utf8'));
  assert.equal(settings['agentviz.claudeRoot'], folders.fixture);
  assert.equal(settings['agentviz.codexRoot'], folders.fixture);
  assert.deepEqual(fs.readdirSync(folders.fixture), [], 'The source folder starts empty: only synthetic transcripts can be in it');

  // The result is written a moment after the launch, with the environment the suite reads.
  const good = await runner.runIsolated({ exe: process.execPath, folders, timeoutMs: 20000, expectedVersion: '1.146.0', stop: noStop(calls),
    args: standIn(`if (process.env.AGENTVIZ_HOST_FIXTURE !== ${JSON.stringify(folders.fixture)}) process.exit(9); setTimeout(() => fs.writeFileSync(file, ${JSON.stringify(passing())}), 300);`) });
  assert.deepEqual(good.problems, []);
  assert.equal(good.ok, true);
  assert.equal(good.stale, false);

  const failed = await runner.runIsolated({ exe: process.execPath, folders, timeoutMs: 20000, expectedVersion: '1.146.0', stop: noStop(calls),
    args: standIn(`fs.writeFileSync(file, JSON.stringify({ passed: false, error: 'reopen after disposal: no editor', checks: [], notRun: [], vscode: '1.146.0' })); process.exit(1);`) });
  assert.equal(failed.ok, false);
  assert.equal(failed.exitCode, 1);
  assert.match(failed.problems.join(' '), /no editor/);

  // A passing record carrying an old time is stale, even with exit code 0.
  const stale = await runner.runIsolated({ exe: process.execPath, folders, timeoutMs: 20000, expectedVersion: '1.146.0', stop: noStop(calls),
    args: standIn(`fs.writeFileSync(file, ${JSON.stringify(passing())}); const old = new Date('2020-01-01T00:00:00Z'); fs.utimesSync(file, old, old);`) });
  assert.equal(stale.ok, false);
  assert.equal(stale.stale, true);
  assert.match(stale.problems.join(' '), /older than this run/);

  const absent = await runner.runIsolated({ exe: path.join(folders.runDir, 'no-such-program.exe'), args: [], folders, timeoutMs: 20000, resultGraceMs: 100, stop: noStop(calls) });
  assert.equal(absent.ok, false, 'A program that cannot start is a failure');
  assert.ok(calls.every(call => call.marker === folders.runDir), 'Stopping is only ever asked for this run\'s own folder');

  // Folders that are not this run's are refused before anything is started.
  const outside = base.layout(path.join(os.homedir(), 'agentviz-host-not-temporary'));
  await assert.rejects(runner.runIsolated({ exe: process.execPath, args: standIn(''), folders: outside, timeoutMs: 1000 }), /inside the system temporary folder/);
  assert.equal(fs.existsSync(outside.runDir), false);
  await assert.rejects(runner.runIsolated({ exe: process.execPath, args: standIn(''), folders: { ...folders, profile: path.join(os.tmpdir(), 'agentviz-elsewhere') }, timeoutMs: 1000 }), /profile folder must be inside the run folder/);
});

test('a run folder that would sit in a normal editor profile is refused and not left behind', t => {
  const appData = temp(t, 'agentviz-appdata-');
  const inProfile = path.join(appData, 'Code');
  fs.mkdirSync(inProfile);
  assert.throws(() => runner.prepareRun({ tmp: inProfile, env: { APPDATA: appData } }), /temporary folder|normal editor profile/);
  assert.deepEqual(fs.readdirSync(inProfile), [], 'The refused folder is removed again');
});

test('a hung host is stopped, and only the process this run started', { skip: !windows && 'Stopping is implemented for native Windows only.' }, async t => {
  const folders = runner.prepareRun();
  t.after(() => fs.rmSync(folders.runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  // A bystander: the same program, the same shape of command line, but not this run's folder.
  const otherRun = temp(t);
  const bystander = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', otherRun], { stdio: 'ignore' });
  t.after(() => { try { bystander.kill(); } catch { /* already gone */ } });
  const hung = await runner.runIsolated({ exe: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)', folders.runDir], folders, timeoutMs: 1500, expectedVersion: '1.146.0' });
  assert.equal(hung.timedOut, true);
  assert.equal(hung.ok, false);
  assert.match(hung.problems.join(' '), /did not finish in time/);
  assert.match(hung.problems.join(' '), /wrote no result file/);
  assert.equal(alive(hung.pid), false, 'The hung process of this run is gone');
  assert.equal(alive(bystander.pid), true, 'A process of another run is left alone');
  assert.equal(alive(process.pid), true);
});

test('cleanup removes this run\'s folder and refuses everything else', t => {
  const mine = fs.mkdtempSync(path.join(os.tmpdir(), runner.RUN_PREFIX));
  const neighbour = temp(t);
  fs.mkdirSync(path.join(mine, 'profile', 'User'), { recursive: true });
  fs.writeFileSync(path.join(mine, 'profile', 'User', 'settings.json'), '{}');
  fs.writeFileSync(path.join(neighbour, 'kept.txt'), 'kept');
  assert.equal(runner.cleanup(mine), true);
  assert.equal(fs.existsSync(mine), false);
  assert.equal(fs.readFileSync(path.join(neighbour, 'kept.txt'), 'utf8'), 'kept', 'Another run\'s folder is untouched');

  const foreign = temp(t, 'agentviz-other-');
  const refused = [foreign, os.tmpdir(), path.join(os.tmpdir(), runner.RUN_PREFIX), os.homedir(), path.resolve(__dirname, '..'), path.join(os.homedir(), `${runner.RUN_PREFIX}abc123`),
    path.join(neighbour, '..'), path.join(os.tmpdir(), `${runner.RUN_PREFIX}x`, '..', '..')];
  if (process.env.APPDATA) refused.push(path.join(process.env.APPDATA, 'Code'), path.join(process.env.APPDATA, 'Code', `${runner.RUN_PREFIX}abc123`));
  for (const folder of refused) assert.throws(() => runner.cleanup(folder), /Refusing to remove/, folder);
  assert.equal(fs.existsSync(foreign), true);
});

test('without a usable host the run is reported unverified, and an old receipt never stands in for it', async t => {
  const folder = temp(t, 'agentviz-receipt-');
  const receiptFile = path.join(folder, 'receipt.json');
  const quiet = t.mock.method(console, 'error', () => {});
  fs.writeFileSync(receiptFile, JSON.stringify({ passed: true, note: 'an earlier run' }));
  assert.equal(await runner.main([`--receipt=${receiptFile}`], { platform: 'linux', env: {} }), 2);
  let receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  assert.equal(receipt.passed, false);
  assert.equal(receipt.unverified, true);
  assert.equal(receipt.note, undefined, 'The earlier receipt is gone');
  assert.match(receipt.problems.join(' '), /native Windows only/);
  assert.match(receipt.source.commit, /^[0-9a-f]{40,64}$/, 'The receipt names the source revision even when nothing ran');
  assert.equal(receipt.suite, 'test/extension-host.js');

  fs.writeFileSync(receiptFile, JSON.stringify({ passed: true }));
  assert.equal(await runner.main([`--receipt=${receiptFile}`], { platform: 'win32', env: { AGENTVIZ_VSCODE: path.join(folder, 'missing', 'Code.exe') } }), 2);
  receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  assert.equal(receipt.passed, false);
  assert.equal(receipt.unverified, true);
  assert.match(receipt.problems.join(' '), /No usable VS Code executable/);
  assert.ok(quiet.mock.callCount() >= 2);
});
