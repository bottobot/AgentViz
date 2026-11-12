const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runner = require('./host-runner');
const { locateBrowser } = require('./browser-check');

// S09: the rules of the VS Code host runner. No editor is started here: the launch and stop rules run against
// a stand-in process, and the install checks against invented install folders.
const temp = (t, prefix = 'agentviz-host-') => { const folder = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); t.after(() => fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })); return folder; };
function install(root, { version = '1.146.0', versioned = false, name = 'Code.exe', applicationName = 'code' } = {}) {
  const app = path.join(root, versioned ? 'abc123' : '', 'resources', 'app');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'product.json'), JSON.stringify({ applicationName, commit: 'f'.repeat(40) }));
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ version }));
  const exe = path.join(root, name);
  fs.writeFileSync(exe, 'stand-in');
  return exe;
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const passing = extra => JSON.stringify({ passed: true, checks: [...runner.REQUIRED], notRun: [], vscode: '1.146.0', ...extra });

test('the executable is located and verified from its own install records, with no silent fallback', t => {
  const root = temp(t, 'agentviz-install-');
  const flat = install(path.join(root, 'flat'));
  const versioned = install(path.join(root, 'versioned'), { versioned: true, version: '1.200.1' });
  assert.deepEqual(runner.verifyInstall(flat, '1.96.0'), { ok: true, exe: flat, version: '1.146.0', commit: 'ffffffffffff' });
  assert.equal(runner.verifyInstall(versioned, '1.96.0').version, '1.200.1', 'The versioned folder newer installs use is read');
  assert.match(runner.verifyInstall(install(path.join(root, 'old'), { version: '1.95.9' }), '1.96.0').reason, /older than the required 1\.96\.0/);
  assert.equal(runner.verifyInstall(path.join(root, 'missing', 'Code.exe'), '1.96.0').ok, false);
  assert.equal(runner.verifyInstall(install(path.join(root, 'other'), { name: 'Other.exe' }), '1.96.0').ok, false, 'Another program is refused');
  assert.equal(runner.verifyInstall(install(path.join(root, 'fork'), { applicationName: 'something-else' }), '1.96.0').ok, false, 'A product that is not VS Code is refused');
  fs.mkdirSync(path.join(root, 'folder', 'Code.exe'), { recursive: true });
  assert.equal(runner.verifyInstall(path.join(root, 'folder', 'Code.exe'), '1.96.0').ok, false, 'A folder is not an executable');
  const bare = path.join(root, 'bare', 'Code.exe');
  fs.mkdirSync(path.dirname(bare));
  fs.writeFileSync(bare, 'stand-in');
  assert.match(runner.verifyInstall(bare, '1.96.0').reason, /no VS Code product record/);

  // The usual locations, in order; the first that verifies wins.
  const env = { LOCALAPPDATA: path.join(root, 'local'), ProgramFiles: path.join(root, 'pf') };
  assert.equal(runner.locate(env, '1.96.0').ok, false);
  assert.match(runner.locate({}, '1.96.0').reason, /no install location is known/);
  const system = install(path.join(root, 'pf', 'Microsoft VS Code'));
  assert.equal(runner.locate(env, '1.96.0').exe, system);
  // An explicit choice is the only candidate. A wrong one fails; it never falls back to another install.
  assert.deepEqual(runner.candidates({ ...env, AGENTVIZ_VSCODE: 'X:\\nowhere\\Code.exe' }), ['X:\\nowhere\\Code.exe']);
  assert.equal(runner.locate({ ...env, AGENTVIZ_VSCODE: path.join(root, 'nowhere', 'Code.exe') }, '1.96.0').ok, false);
  assert.equal(runner.locate({ ...env, AGENTVIZ_VSCODE: flat }, '1.96.0').exe, flat);
});

test('a run never uses the normal editor profile or a folder outside its own temporary folder', t => {
  const run = temp(t);
  const folders = runner.layout(run);
  assert.equal(runner.assertIsolated(folders), true);
  const appData = path.join(os.tmpdir(), 'agentviz-fake-appdata');
  const env = { APPDATA: appData };
  const home = path.join(os.tmpdir(), 'agentviz-fake-home');
  assert.throws(() => runner.assertIsolated({ ...folders, profile: path.join(appData, 'Code') }, env, home), /profile folder must be inside the run folder/);
  assert.throws(() => runner.assertIsolated({ ...folders, extensions: path.join(home, '.vscode', 'extensions') }, env, home), /extensions folder must be inside the run folder/);
  assert.throws(() => runner.assertIsolated(runner.layout(path.join(os.homedir(), 'agentviz-run')), env, home), /inside the system temporary folder/);
  assert.throws(() => runner.assertIsolated(runner.layout(os.tmpdir()), env, home), /inside the system temporary folder/);
  // Even inside the temporary folder, anything that is or holds a normal profile is refused.
  const inProfile = runner.layout(path.join(os.tmpdir(), 'agentviz-fake-appdata', 'Code', 'run'));
  assert.throws(() => runner.assertIsolated(inProfile, env, home), /overlaps a normal editor profile/);

  const args = runner.launchArguments(folders, 4321, 'C:\\checkout');
  assert.ok(args.includes(`--user-data-dir=${folders.profile}`) && args.includes(`--extensions-dir=${folders.extensions}`) && args.includes('--disable-extensions'));
  assert.ok(args.includes('--extensionDevelopmentPath=C:\\checkout') && args.includes(`--extensionTestsPath=${path.join('C:\\checkout', 'test', 'extension-host.js')}`));
  assert.equal(args.at(-1), folders.workspace, 'The window opens the empty temporary folder, not a real workspace');
  assert.ok(!args.some(arg => /--install-extension|--profile=/.test(arg)));
  const settings = runner.profileSettings(folders);
  assert.equal(settings['agentviz.claudeRoot'], folders.fixture);
  assert.equal(settings['agentviz.codexRoot'], folders.fixture);
  assert.equal(settings['telemetry.telemetryLevel'], 'off');
  // Cleanup only ever removes a folder this runner made.
  assert.throws(() => runner.removeRun(path.join(os.tmpdir(), 'something-else')), /did not create/);
  assert.throws(() => runner.removeRun(path.join(os.homedir(), 'agentviz-host-x')), /did not create/);
});

test('only a complete passing result from the verified executable counts as a pass', () => {
  const judge = overrides => runner.judge({ exitCode: 0, timedOut: false, resultText: passing(), expectedVersion: '1.146.0', ...overrides });
  assert.deepEqual(judge({}).problems, []);
  assert.equal(judge({}).ok, true);
  assert.match(judge({ resultText: undefined }).problems.join(' '), /wrote no result file/);
  assert.match(judge({ resultText: '{"passed": tr' }).problems.join(' '), /not readable JSON/);
  assert.match(judge({ resultText: '[]' }).problems.join(' '), /not a result record/);
  assert.match(judge({ resultText: 'null' }).problems.join(' '), /wrote no result file|not a result record|failed/);
  assert.match(judge({ resultText: passing({ passed: false, error: 'a check failed' }) }).problems.join(' '), /host test failed: a check failed/);
  assert.match(judge({ resultText: passing({ passed: 'true' }) }).problems.join(' '), /host test failed/);
  // A passing result is not enough when the process says otherwise.
  assert.match(judge({ exitCode: 1 }).problems.join(' '), /exited with code 1/);
  assert.match(judge({ timedOut: true, exitCode: -1 }).problems.join(' '), /did not finish in time/);
  // Every required check must be named in the result.
  const fewer = judge({ resultText: passing({ checks: runner.REQUIRED.slice(1) }) });
  assert.equal(fewer.ok, false);
  assert.match(fewer.problems.join(' '), new RegExp(`Checks missing from the result: ${runner.REQUIRED[0]}`));
  assert.equal(judge({ resultText: passing({ checks: 'all' }) }).ok, false);
  // Something not run fails the run, unless it is one of the named optional checks; that one is reported as unverified.
  assert.match(judge({ resultText: passing({ notRun: ['entry: unknown ID opens nothing (no fixture)'] }) }).problems.join(' '), /Not run: entry: unknown ID/);
  const optional = judge({ resultText: passing({ notRun: [`${runner.OPTIONAL[0]} (not asked for)`] }) });
  assert.equal(optional.ok, true);
  assert.deepEqual(optional.unverified, [`${runner.OPTIONAL[0]} (not asked for)`]);
  assert.equal(judge({ resultText: passing({ notRun: 'none' }) }).ok, false);
  // The result must come from the executable that was verified.
  assert.match(judge({ resultText: passing({ vscode: '1.99.0' }) }).problems.join(' '), /names VS Code 1\.99\.0, not the verified 1\.146\.0/);
  for (const name of runner.OPTIONAL) assert.ok(!runner.REQUIRED.includes(name));
});

test('a stand-in host: missing and failed results fail, and only the processes of the run are stopped', { skip: process.platform !== 'win32' && 'Windows only' }, async t => {
  // A process the runner did not start. It must still be running at the end.
  const bystander = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  t.after(() => bystander.kill());
  const standIn = (body, run) => ['-e', body, run];
  const go = async (body, extra = {}) => {
    const folders = runner.layout(temp(t));
    const outcome = await runner.runHost({ exe: process.execPath, args: standIn(body, folders.runDir), folders, timeoutMs: 20000, expectedVersion: '1.146.0', ...extra });
    return { outcome, folders };
  };
  const writeResult = `require('node:fs').writeFileSync(process.env.AGENTVIZ_HOST_RESULT, ${JSON.stringify(passing())});`;

  const good = await go(`if (!process.env.AGENTVIZ_HOST_FIXTURE.startsWith(process.argv[1])) process.exit(9); ${writeResult}`);
  assert.deepEqual(good.outcome.problems, []);
  assert.equal(good.outcome.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(good.folders.profile, 'User', 'settings.json'), 'utf8'))['agentviz.claudeRoot'], good.folders.fixture, 'The profile it started with names the synthetic folder');

  // Exit code 0 and no result file is a failure, not a pass.
  const silent = await go('process.exit(0)');
  assert.equal(silent.outcome.ok, false);
  assert.match(silent.outcome.problems.join(' '), /wrote no result file/);

  const failing = await go(`require('node:fs').writeFileSync(process.env.AGENTVIZ_HOST_RESULT, ${JSON.stringify(passing({ passed: false, error: 'one check failed' }))}); process.exit(1);`);
  assert.equal(failing.outcome.ok, false);
  assert.match(failing.outcome.problems.join(' '), /exited with code 1/);
  assert.match(failing.outcome.problems.join(' '), /one check failed/);

  // A host that leaves a process of its own behind: that process is stopped after the run. It carries the run
  // folder on its command line, which is how the runner knows it.
  const leftover = await go(`const child = require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)', process.argv[1]], { detached: true, stdio: 'ignore' }); child.unref();
    require('node:fs').writeFileSync(require('node:path').join(process.argv[1], 'left.pid'), String(child.pid)); ${writeResult}`);
  const left = Number(fs.readFileSync(path.join(leftover.folders.runDir, 'left.pid'), 'utf8'));
  assert.equal(leftover.outcome.ok, true);
  assert.ok(leftover.outcome.leftovers.includes(left), 'The leftover process was found by the run folder');
  assert.equal(alive(left), false, 'The leftover process was stopped');

  // A host that never finishes is stopped at the time limit, and that is a failure even if a result exists.
  const hung = await go(`${writeResult} setTimeout(() => {}, 120000);`, { timeoutMs: 1500 });
  assert.equal(hung.outcome.timedOut, true);
  assert.equal(hung.outcome.ok, false);
  assert.equal(alive(hung.outcome.pid), false, 'The process the runner started was stopped');

  assert.equal(alive(bystander.pid), true, 'A process the runner did not start is still running');
  assert.equal(alive(process.pid), true);
  assert.deepEqual(runner.processesOf(path.join(os.tmpdir(), 'agentviz-host-no-such-run')).pids, [], 'A folder nothing was started with matches no process');
});

test('the browser inspection takes an explicit browser as given and reports none when there is none', t => {
  const root = temp(t, 'agentviz-browser-test-');
  assert.equal(locateBrowser({ AGENTVIZ_BROWSER: path.join(root, 'missing.exe') }), null, 'A wrong explicit browser is not replaced by another');
  assert.equal(locateBrowser({ AGENTVIZ_BROWSER: root }), null, 'A folder is not a browser');
  assert.equal(locateBrowser({ ProgramFiles: root, LOCALAPPDATA: root }), null);
  const edge = path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  fs.mkdirSync(path.dirname(edge), { recursive: true });
  fs.writeFileSync(edge, 'stand-in');
  assert.equal(locateBrowser({ ProgramFiles: root }), edge);
  assert.equal(locateBrowser({ AGENTVIZ_BROWSER: edge }), edge);
});

// The station colours are text in the map and the file list. They were measured under 2.2:1 on VS Code's default
// light theme in the host run; the stylesheet now carries a second set for light themes.
test('station colours reach WCAG AA as text on dark and on light backgrounds', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../media/style.css'), 'utf8');
  const channel = value => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const luminance = hex => { const n = Number.parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
  const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const palette = block => Object.fromEntries([...block.matchAll(/--(files|edits|shell|network|agents|memory|other):\s*(#[0-9a-f]{6})/g)].map(match => [match[1], match[2]]));
  const names = ['files', 'edits', 'shell', 'network', 'agents', 'memory', 'other'];
  const dark = palette(css.match(/:root\s*\{[^}]*\}/)[0]);
  const lightRule = css.match(/body\.vscode-light,\s*body\.vscode-high-contrast-light\s*\{[^}]*\}/);
  assert.ok(lightRule, 'Light themes have their own station colours');
  const light = palette(lightRule[0]);
  assert.deepEqual(Object.keys(dark).sort(), [...names].sort());
  assert.deepEqual(Object.keys(light).sort(), [...names].sort());
  // The stylesheet's own dark fallbacks, and the editor and side bar colours of the default light themes.
  for (const name of names) {
    for (const background of ['#10161f', '#151d28']) assert.ok(ratio(dark[name], background) >= 4.5, `${name} on dark ${background}: ${ratio(dark[name], background).toFixed(2)}`);
    for (const background of ['#ffffff', '#f8f8f8', '#f3f3f3']) assert.ok(ratio(light[name], background) >= 4.5, `${name} on light ${background}: ${ratio(light[name], background).toFixed(2)}`);
  }
});
