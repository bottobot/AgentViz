'use strict';
// P01: a repeatable native Windows launcher for the existing host suite, test/extension-host.js.
//   node test/run-extension-host.cjs [--keep] [--timeout=<seconds>] [--clipboard] [--receipt=<file>]
// It reuses the launch, isolation, verdict and stop rules of test/host-runner.js and adds what a calibration needs:
//   - the source revision (commit, branch, uncommitted files) is read before the run and written into the receipt;
//   - the suite's explicit result file is waited for, and one that is missing, older than this run, unreadable,
//     failed or incomplete is a failure, whatever the exit code says;
//   - the receipt of an earlier run is removed first, so it can never stand in for this one.
// The profile, extensions folder, workspace and source folders are new folders under the system temporary folder.
// The normal editor profile is never named on the command line and never written. Only processes that carry this
// run's own temporary folder on their command line are stopped. Exit codes: 0 passed, 1 failed, 2 unverified
// (not native Windows, or no usable VS Code). Rules are covered by test/run-extension-host.test.js.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const base = require('./host-runner.js');

const CHECKOUT = path.resolve(__dirname, '..');
const RUN_PREFIX = 'agentviz-host-';
const DEFAULT_RECEIPT = path.join(CHECKOUT, 'artifacts', 'host', 'run-extension-host-receipt.json');
const SCOPE = 'Runs the host suite of the recorded source revision only. It does not accept features added after that revision.';

// Platform guarded: nothing is looked up anywhere but native Windows.
function selectExecutable({ platform = process.platform, env = process.env, minimum = '0.0.0', locate = base.locate } = {}) {
  if (platform !== 'win32') return { ok: false, unverified: true, reason: `This runner covers native Windows only, not ${platform}.` };
  const found = locate(env, minimum);
  if (!found.ok) return { ok: false, unverified: true, reason: `No usable VS Code executable: ${found.reason}` };
  return found;
}

// The commit the run is taken from, and whether the checkout differs from it. An unreadable answer is not "clean".
function sourceRevision(checkout = CHECKOUT, run = spawnSync) {
  const git = args => { const done = run('git', ['-C', checkout, ...args], { encoding: 'utf8', windowsHide: true }); return done && done.status === 0 ? String(done.stdout) : null; };
  const commit = (git(['rev-parse', 'HEAD']) || '').trim();
  if (!/^[0-9a-f]{40,64}$/.test(commit)) return { ok: false, reason: 'The source revision could not be read from Git.' };
  const status = git(['status', '--porcelain']);
  if (status === null) return { ok: false, reason: 'The state of the checkout could not be read from Git.' };
  const changed = status.split(/\r?\n/).filter(Boolean).map(line => line.slice(3));
  return { ok: true, commit, branch: (git(['rev-parse', '--abbrev-ref', 'HEAD']) || '').trim(), dirty: changed.length > 0, changed };
}

// A new run folder under the system temporary folder, checked against the normal editor profiles before use.
function prepareRun({ tmp = os.tmpdir(), env = process.env, home = os.homedir() } = {}) {
  const folders = base.layout(fs.mkdtempSync(path.join(tmp, RUN_PREFIX)));
  try { base.assertIsolated(folders, env, home); } catch (error) { fs.rmSync(folders.runDir, { recursive: true, force: true }); throw error; }
  return folders;
}

// The verdict on one run: the shared rules, plus the result having been written during this run.
function assess({ exitCode, timedOut, resultText, resultMtimeMs, startedMs, expectedVersion, required, optional }) {
  const present = resultText !== undefined && resultText !== null;
  const stale = present && !(Number.isFinite(resultMtimeMs) && Number.isFinite(startedMs) && resultMtimeMs >= startedMs);
  // A stale result is not judged at all: nothing in it describes this run.
  const verdict = base.judge({ exitCode, timedOut, resultText: stale ? undefined : resultText, expectedVersion, required, optional });
  if (!stale) return { ...verdict, stale: false };
  return { ok: false, stale: true, unverified: [], result: null,
    problems: ['The result file is older than this run and was not used.', ...verdict.problems.filter(problem => problem !== 'The host wrote no result file.')] };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function readResult(file) {
  try { return { text: fs.readFileSync(file, 'utf8'), mtimeMs: fs.statSync(file).mtimeMs }; } catch { return { text: undefined, mtimeMs: undefined }; }
}
// The host writes its result just before it exits. Give a complete record a short time to land.
async function waitForResult(file, graceMs) {
  const end = Date.now() + graceMs;
  for (;;) {
    const read = readResult(file);
    if (read.text !== undefined) { try { JSON.parse(read.text); return read; } catch { /* still being written, or broken */ } }
    if (Date.now() >= end) return read;
    await sleep(100);
  }
}

// One run. `exe` and `args` are injectable so the rules can be tested with a stand-in process; main() always
// passes a verified Code.exe. `stop` is only ever given this run's child and this run's folder.
async function runIsolated({ exe, args, folders, env = {}, timeoutMs, resultGraceMs = 5000, expectedVersion, required, optional, stop = base.stopOwn }) {
  base.assertIsolated(folders);
  for (const key of ['profile', 'extensions', 'fixture', 'workspace']) fs.mkdirSync(folders[key], { recursive: true });
  fs.mkdirSync(path.join(folders.profile, 'User'), { recursive: true });
  fs.writeFileSync(path.join(folders.profile, 'User', 'settings.json'), JSON.stringify(base.profileSettings(folders), null, 2));
  fs.rmSync(folders.result, { force: true });
  const startedMs = Date.now();
  const child = spawn(exe, args, { stdio: 'ignore', windowsHide: false,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, VSCODE_DEV: undefined, ...env, AGENTVIZ_HOST_FIXTURE: folders.fixture, AGENTVIZ_HOST_RESULT: folders.result } });
  let timedOut = false;
  const exitCode = await new Promise(resolve => {
    const timer = setTimeout(() => { timedOut = true; stop(child, folders.runDir); }, timeoutMs);
    child.once('error', () => { clearTimeout(timer); resolve(-1); });
    child.once('exit', code => { clearTimeout(timer); resolve(code === null ? -1 : code); });
  });
  const read = timedOut ? readResult(folders.result) : await waitForResult(folders.result, resultGraceMs);
  const swept = stop(null, folders.runDir);
  return { ...assess({ exitCode, timedOut, resultText: read.text, resultMtimeMs: read.mtimeMs, startedMs, expectedVersion, required, optional }),
    exitCode, timedOut, pid: child.pid, leftovers: swept.stopped || [], seconds: Math.round((Date.now() - startedMs) / 100) / 10 };
}

// Removes one run folder and nothing else: it must be a folder this runner's prefix names, inside the temporary folder.
function cleanup(runDir) {
  if (path.basename(path.resolve(runDir)).length <= RUN_PREFIX.length) throw new Error('Refusing to remove a folder this runner did not create.');
  return base.removeRun(runDir);
}

// The normal profile's settings file, looked at only to record that the run left it alone.
function normalSettingsStamp(env = process.env) {
  if (!env.APPDATA) return null;
  try { const stat = fs.statSync(path.join(env.APPDATA, 'Code', 'User', 'settings.json')); return `${stat.mtimeMs}:${stat.size}`; } catch { return 'absent'; }
}

async function main(argv, { platform = process.platform, env = process.env } = {}) {
  const keep = argv.includes('--keep');
  const seconds = Number.parseInt((argv.find(arg => arg.startsWith('--timeout=')) || '').slice(10), 10) || 240;
  const named = (argv.find(arg => arg.startsWith('--receipt=')) || '').slice(10);
  const receiptFile = named ? path.resolve(named) : DEFAULT_RECEIPT;
  fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
  fs.rmSync(receiptFile, { force: true });
  const source = sourceRevision();
  const receipt = body => fs.writeFileSync(receiptFile, JSON.stringify({ when: new Date().toISOString(), runner: 'test/run-extension-host.cjs', suite: 'test/extension-host.js', scope: SCOPE,
    source: source.ok ? { commit: source.commit, branch: source.branch, dirty: source.dirty, changed: source.changed } : null, ...body }, null, 2));
  if (!source.ok) {
    receipt({ passed: false, problems: [source.reason] });
    console.error(`FAIL ${source.reason}`);
    return 1;
  }
  const minimum = String(require('../package.json').engines.vscode).replace(/^[^\d]*/, '');
  const code = selectExecutable({ platform, env, minimum });
  if (!code.ok) {
    receipt({ passed: false, unverified: true, problems: [code.reason] });
    console.error(`UNVERIFIED: ${code.reason} Set AGENTVIZ_VSCODE to a Code.exe on native Windows.`);
    return 2;
  }
  const before = normalSettingsStamp(env);
  const folders = prepareRun({ env });
  let outcome;
  let removed = null;
  try {
    const port = await base.freePort();
    outcome = await runIsolated({ exe: code.exe, args: base.launchArguments(folders, port, CHECKOUT), folders, timeoutMs: seconds * 1000, expectedVersion: code.version,
      env: { AGENTVIZ_HOST_CDP: String(port), AGENTVIZ_HOST_SHOTS: path.join(path.dirname(receiptFile), 'shots'), AGENTVIZ_HOST_CLIPBOARD: argv.includes('--clipboard') ? '1' : '' } });
  } finally {
    if (!keep) { removed = cleanup(folders.runDir); if (!removed) console.error(`The temporary run folder could not be removed: ${folders.runDir}`); }
  }
  const result = outcome.result || {};
  const list = value => (Array.isArray(value) ? value : []);
  const after = normalSettingsStamp(env);
  const normalProfile = before === null ? 'not checked: APPDATA is not set' : before === after ? 'settings file unchanged during the run' : 'settings file changed during the run (not by this runner\'s command line; check by hand)';
  receipt({ passed: outcome.ok, problems: outcome.problems, unverified: outcome.unverified, staleResult: outcome.stale, vscode: code.version, vscodeCommit: code.commit, executable: code.exe,
    exitCode: outcome.exitCode, timedOut: outcome.timedOut, seconds: outcome.seconds, isolatedProfile: true, syntheticSources: true, normalProfile,
    processesStoppedAfterExit: outcome.leftovers.length, runFolderRemoved: removed, required: base.REQUIRED.length,
    checks: list(result.checks), failed: list(result.failed), notRun: list(result.notRun), measurements: result.measurements || null, findings: list(result.findings) });
  for (const name of list(result.checks)) console.log(`PASS ${name}`);
  for (const entry of list(result.failed)) console.error(`FAIL ${entry.name}: ${entry.error}`);
  for (const name of outcome.unverified) console.log(`UNVERIFIED ${name}`);
  for (const problem of outcome.problems) console.error(`FAIL ${problem}`);
  console.log(`${outcome.ok ? 'PASSED' : 'FAILED'}: source ${source.commit.slice(0, 12)}${source.dirty ? ' with uncommitted changes' : ''}, VS Code ${code.version}, ${list(result.checks).length} checks, ${outcome.unverified.length} unverified, ${outcome.seconds} s. Receipt: ${receiptFile}`);
  return outcome.ok ? 0 : 1;
}

module.exports = { RUN_PREFIX, DEFAULT_RECEIPT, selectExecutable, sourceRevision, prepareRun, assess, readResult, waitForResult, runIsolated, cleanup, normalSettingsStamp, main };

if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
