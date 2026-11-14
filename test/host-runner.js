'use strict';
// S09: starts a fresh VS Code development host for test/extension-host.js and judges its result.
//   node test/host-runner.js [--keep] [--timeout=<seconds>] [--clipboard]
// What it guarantees, each covered by test/host-runner.test.js:
//   - the executable is located and verified before anything is started (AGENTVIZ_VSCODE overrides the search);
//   - the profile, extensions folder, workspace and source folders are new temporary folders, never the normal
//     editor profile, and every transcript in them is synthetic;
//   - a missing, unreadable, failed or incomplete result is a failure, whatever the exit code says;
//   - only processes carrying this run's own temporary folder on their command line are ever stopped.
// Native Windows only. Anywhere else it reports the host run as unverified and exits non-zero.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const CHECKOUT = path.resolve(__dirname, '..');
// Every group the host test must report. A result without one of them is not a pass.
const REQUIRED = [
  'command activation', 'webview editor opened', 'single panel reuse', 'close', 'reopen after disposal',
  'webview: real view loaded under its policy', 'webview: workspace selection', 'webview: name filter',
  'webview: full ID filter beyond the returned list', 'webview: no matches', 'webview: renamed session keeps its selection',
  'webview: selected child', 'webview: family lanes', 'webview: example and real are told apart',
  'webview: keyboard focus order', 'webview: accessible names', 'webview: contrast in the default dark theme', 'webview: contrast in the default light theme',
  'webview: source failures', 'webview: deleted followed session', 'webview: no console or policy errors',
  'webview: private text stays out of the page',
  'entry: invalid arguments refused', 'entry: unknown ID opens nothing', 'entry: Claude session opens the editor',
  'entry: duplicate execution keeps one editor', 'entry: Codex session reuses the open editor',
  'entry: no-argument command unchanged', 'entry: unavailable source reported', 'entry: reopen after disposal',
  'entry: the view shows the addressed session'
];
// Checks that may be reported as not run. They are listed as unverified; anything else not run is a failure.
const OPTIONAL = ['webview: Copy ID reaches the clipboard'];

const versionParts = text => String(text || '').split('.').map(part => Number.parseInt(part, 10) || 0);
const atLeast = (have, want) => { const a = versionParts(have), b = versionParts(want); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); } return true; };

// Where Code.exe is looked for. An explicit AGENTVIZ_VSCODE is the only candidate: a wrong value fails, it does
// not quietly fall back to another install.
function candidates(env = process.env) {
  if (env.AGENTVIZ_VSCODE) return [env.AGENTVIZ_VSCODE];
  return [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe')].filter(Boolean);
}

// Verified from the install's own files, without starting it: a regular file named Code.exe with VS Code's
// product and package records beside it (directly, or in the versioned folder newer installs use), and a version
// that satisfies this extension's engines.vscode.
function verifyInstall(exe, minimum) {
  let stat;
  try { stat = fs.statSync(exe); } catch { return { ok: false, reason: 'not found' }; }
  if (!stat.isFile() || path.basename(exe).toLowerCase() !== 'code.exe') return { ok: false, reason: 'not a Code.exe file' };
  const home = path.dirname(exe);
  const roots = [home];
  try { for (const entry of fs.readdirSync(home, { withFileTypes: true })) if (entry.isDirectory()) roots.push(path.join(home, entry.name)); } catch { /* judged below */ }
  for (const root of roots) {
    try {
      const app = path.join(root, 'resources', 'app');
      const product = JSON.parse(fs.readFileSync(path.join(app, 'product.json'), 'utf8'));
      const version = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version;
      if (product.applicationName !== 'code' || typeof version !== 'string') continue;
      if (!atLeast(version, minimum)) return { ok: false, reason: `version ${version} is older than the required ${minimum}` };
      return { ok: true, exe, version, commit: typeof product.commit === 'string' ? product.commit.slice(0, 12) : '' };
    } catch { /* try the next folder */ }
  }
  return { ok: false, reason: 'no VS Code product record beside it' };
}

function locate(env = process.env, minimum = '0.0.0') {
  const tried = [];
  for (const exe of candidates(env)) {
    const verdict = verifyInstall(exe, minimum);
    if (verdict.ok) return verdict;
    tried.push(`${exe}: ${verdict.reason}`);
  }
  return { ok: false, reason: tried.length ? tried.join('; ') : 'no install location is known on this machine' };
}

const inside = (folder, parent) => { const relative = path.relative(parent, folder); return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative); };

// The folders of one run. All of them are new and under the system temporary folder.
function layout(runDir) {
  return { runDir, profile: path.join(runDir, 'profile'), extensions: path.join(runDir, 'extensions'), fixture: path.join(runDir, 'fixture'),
    workspace: path.join(runDir, 'workspace'), result: path.join(runDir, 'result.json') };
}

// Refuses anything that is, holds or sits in a normal editor profile, and anything outside this run's folder.
function assertIsolated(folders, env = process.env, home = os.homedir()) {
  const normal = [env.APPDATA && path.join(env.APPDATA, 'Code'), path.join(home, '.vscode'), env.APPDATA && path.join(env.APPDATA, 'Code - Insiders'), path.join(home, '.vscode-insiders')].filter(Boolean).map(folder => path.resolve(folder).toLowerCase());
  const temp = path.resolve(os.tmpdir());
  if (!inside(path.resolve(folders.runDir), temp)) throw new Error('The run folder must be inside the system temporary folder.');
  for (const key of ['profile', 'extensions', 'fixture', 'workspace', 'result']) {
    const folder = path.resolve(folders[key]);
    if (!inside(folder, path.resolve(folders.runDir))) throw new Error(`The ${key} folder must be inside the run folder.`);
    const lower = folder.toLowerCase();
    for (const profile of normal) if (lower === profile || lower.startsWith(profile + path.sep) || profile.startsWith(lower + path.sep)) throw new Error(`The ${key} folder overlaps a normal editor profile.`);
  }
  return true;
}

function launchArguments(folders, port, checkout = CHECKOUT) {
  return [`--extensionDevelopmentPath=${checkout}`, `--extensionTestsPath=${path.join(checkout, 'test', 'extension-host.js')}`,
    `--user-data-dir=${folders.profile}`, `--extensions-dir=${folders.extensions}`, '--disable-extensions', '--disable-workspace-trust',
    '--skip-welcome', '--skip-release-notes', '--disable-updates', '--new-window', `--remote-debugging-port=${port}`, folders.workspace];
}

// The isolated profile's settings: both sources point at the synthetic folder, and nothing calls home.
function profileSettings(folders) {
  return { 'agentviz.claudeRoot': folders.fixture, 'agentviz.codexRoot': folders.fixture, 'agentviz.scope': 'all', 'telemetry.telemetryLevel': 'off', 'update.mode': 'none',
    'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false, 'workbench.enableExperiments': false, 'window.restoreWindows': 'none',
    'security.workspace.trust.enabled': false, 'workbench.startupEditor': 'none', 'workbench.colorTheme': 'Default Dark Modern' };
}

// The verdict on one run. Nothing but a complete passing result from the verified executable counts.
function judge({ exitCode, timedOut, resultText, expectedVersion, required = REQUIRED, optional = OPTIONAL }) {
  const problems = [];
  if (timedOut) problems.push('The host did not finish in time and was stopped.');
  else if (exitCode !== 0) problems.push(`The host exited with code ${exitCode}.`);
  let result = null;
  if (resultText === undefined || resultText === null) problems.push('The host wrote no result file.');
  else {
    let readable = true;
    try { result = JSON.parse(resultText); } catch { readable = false; problems.push('The result file is not readable JSON.'); }
    // null, a number, text or a list is not a result, and must never read as "nothing went wrong".
    if (readable && (!result || typeof result !== 'object' || Array.isArray(result))) { result = null; problems.push('The result file is not a result record.'); }
  }
  const unverified = [];
  if (result) {
    if (result.passed !== true) problems.push(`The host test failed${typeof result.error === 'string' ? `: ${result.error.slice(0, 400)}` : '.'}`);
    const checks = Array.isArray(result.checks) ? result.checks : [];
    const missing = required.filter(name => !checks.includes(name));
    if (missing.length) problems.push(`Checks missing from the result: ${missing.join('; ')}.`);
    for (const entry of Array.isArray(result.notRun) ? result.notRun : ['(unreadable list of checks not run)']) {
      const name = String(entry);
      if (optional.some(allowed => name.startsWith(allowed))) unverified.push(name);
      else problems.push(`Not run: ${name}.`);
    }
    if (expectedVersion && result.vscode !== expectedVersion) problems.push(`The result names VS Code ${result.vscode}, not the verified ${expectedVersion}.`);
  }
  return { ok: problems.length === 0, problems, unverified, result };
}

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

// Processes whose command line names this run's own folder. The folder name is random and new, so nothing the
// runner did not start can match. The marker travels in an environment variable, never inside the script text.
function processesOf(marker) {
  const script = '$m = $env:AGENTVIZ_RUN_MARKER; Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($m) -and $_.ProcessId -ne $PID } | ForEach-Object { $_.ProcessId }';
  const listed = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, AGENTVIZ_RUN_MARKER: marker }, encoding: 'utf8', windowsHide: true });
  if (listed.status !== 0) return { ok: false, pids: [] };
  return { ok: true, pids: listed.stdout.split(/\r?\n/).map(line => Number.parseInt(line, 10)).filter(pid => Number.isInteger(pid) && pid > 0) };
}

// Stops what this run started and nothing else: the process tree of the child it spawned, then any process still
// carrying the run folder on its command line.
function stopOwn(child, marker) {
  const stopped = [];
  if (child && child.pid && child.exitCode === null && child.signalCode === null) {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    stopped.push(child.pid);
  }
  const left = processesOf(marker);
  for (const pid of left.pids) { spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); stopped.push(pid); }
  return { stopped: [...new Set(stopped)], listed: left.ok };
}

// One run of an executable against the folders of `folders`. `exe` and `args` are injectable so the stop and
// result rules can be tested with a stand-in process; the real entry point below always passes a verified Code.exe.
async function runHost({ exe, args, folders, env = {}, timeoutMs, expectedVersion, required, optional }) {
  assertIsolated(folders);
  for (const key of ['profile', 'extensions', 'fixture', 'workspace']) fs.mkdirSync(folders[key], { recursive: true });
  fs.mkdirSync(path.join(folders.profile, 'User'), { recursive: true });
  fs.writeFileSync(path.join(folders.profile, 'User', 'settings.json'), JSON.stringify(profileSettings(folders), null, 2));
  fs.rmSync(folders.result, { force: true });
  const started = Date.now();
  const child = spawn(exe, args, { stdio: 'ignore', windowsHide: false, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, VSCODE_DEV: undefined, ...env, AGENTVIZ_HOST_FIXTURE: folders.fixture, AGENTVIZ_HOST_RESULT: folders.result } });
  let timedOut = false;
  const exitCode = await new Promise(resolve => {
    const timer = setTimeout(() => { timedOut = true; stopOwn(child, folders.runDir); }, timeoutMs);
    child.once('error', () => { clearTimeout(timer); resolve(-1); });
    child.once('exit', code => { clearTimeout(timer); resolve(code === null ? -1 : code); });
  });
  // Anything of this run still alive after the host ended is stopped; nothing else is touched.
  const swept = stopOwn(null, folders.runDir);
  let resultText;
  try { resultText = fs.readFileSync(folders.result, 'utf8'); } catch { resultText = undefined; }
  return { ...judge({ exitCode, timedOut, resultText, expectedVersion, required, optional }), exitCode, timedOut, pid: child.pid, leftovers: swept.stopped, seconds: Math.round((Date.now() - started) / 100) / 10 };
}

function removeRun(runDir) {
  if (!inside(path.resolve(runDir), path.resolve(os.tmpdir())) || !path.basename(runDir).startsWith('agentviz-host-')) throw new Error('Refusing to remove a folder this runner did not create.');
  for (let attempt = 0; attempt < 10; attempt++) {
    try { fs.rmSync(runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); return true; } catch { spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 500)']); }
  }
  return false;
}

async function main(argv) {
  const keep = argv.includes('--keep');
  const seconds = Number.parseInt((argv.find(arg => arg.startsWith('--timeout=')) || '').slice(10), 10) || 240;
  const receiptDir = path.join(CHECKOUT, 'artifacts', 'host');
  const receiptFile = path.join(receiptDir, 'extension-host-result.json');
  fs.mkdirSync(receiptDir, { recursive: true });
  // An old receipt never stands in for this run.
  fs.rmSync(receiptFile, { force: true });
  const receipt = body => fs.writeFileSync(receiptFile, JSON.stringify({ when: new Date().toISOString(), ...body }, null, 2));
  if (process.platform !== 'win32') {
    receipt({ passed: false, unverified: true, problems: ['This runner covers native Windows only. The host run is unverified here.'] });
    console.error('UNVERIFIED: the VS Code host run covers native Windows only.');
    return 2;
  }
  const minimum = String(require('../package.json').engines.vscode).replace(/^[^\d]*/, '');
  const code = locate(process.env, minimum);
  if (!code.ok) {
    receipt({ passed: false, unverified: true, problems: [`No usable VS Code executable: ${code.reason}`] });
    console.error(`UNVERIFIED: no usable VS Code executable (${code.reason}). Set AGENTVIZ_VSCODE to a Code.exe.`);
    return 2;
  }
  const folders = layout(fs.mkdtempSync(path.join(os.tmpdir(), 'agentviz-host-')));
  let outcome;
  try {
    const port = await freePort();
    outcome = await runHost({ exe: code.exe, args: launchArguments(folders, port), folders, timeoutMs: seconds * 1000, expectedVersion: code.version,
      env: { AGENTVIZ_HOST_CDP: String(port), AGENTVIZ_HOST_SHOTS: path.join(receiptDir, 'shots'), AGENTVIZ_HOST_CLIPBOARD: argv.includes('--clipboard') ? '1' : '' } });
  } finally {
    if (!keep && !removeRun(folders.runDir)) console.error(`The temporary run folder could not be removed: ${folders.runDir}`);
  }
  const result = outcome.result || {};
  receipt({ passed: outcome.ok, problems: outcome.problems, unverified: outcome.unverified, vscode: code.version, commit: code.commit, exitCode: outcome.exitCode, timedOut: outcome.timedOut,
    seconds: outcome.seconds, isolatedProfile: true, syntheticSources: true, processesStoppedAfterExit: outcome.leftovers.length,
    checks: Array.isArray(result.checks) ? result.checks : [], failed: Array.isArray(result.failed) ? result.failed : [], notRun: Array.isArray(result.notRun) ? result.notRun : [],
    measurements: result.measurements || null, findings: result.findings || [] });
  for (const name of Array.isArray(result.checks) ? result.checks : []) console.log(`PASS ${name}`);
  for (const entry of Array.isArray(result.failed) ? result.failed : []) console.error(`FAIL ${entry.name}: ${entry.error}`);
  for (const name of outcome.unverified) console.log(`UNVERIFIED ${name}`);
  for (const finding of Array.isArray(result.findings) ? result.findings : []) console.log(`FINDING ${finding}`);
  for (const problem of outcome.problems) console.error(`FAIL ${problem}`);
  console.log(`${outcome.ok ? 'PASSED' : 'FAILED'}: VS Code ${code.version}, ${(result.checks || []).length} checks, ${outcome.unverified.length} unverified, ${outcome.seconds} s. Receipt: ${receiptFile}`);
  return outcome.ok ? 0 : 1;
}

module.exports = { REQUIRED, OPTIONAL, candidates, verifyInstall, locate, layout, assertIsolated, launchArguments, profileSettings, judge, processesOf, stopOwn, runHost, removeRun, freePort };

if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
