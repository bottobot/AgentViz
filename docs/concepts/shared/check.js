'use strict';
// Opens one concept page in headless Edge or Chrome, lets it run, and reports what a reviewer needs:
// console errors and exceptions, two screenshots some seconds apart, and whether the page changed between them.
//
//   node docs/concepts/shared/check.js docs/concepts/01-circuit/index.html [--wait 6] [--width 1600] [--height 1000]
//        [--eval "expression run after the first shot, e.g. a click"] [--out <dir>]
//
// Screenshots land in <out> (default: artifacts/concepts/<page folder>/). Exit code 0 = no problems seen,
// 1 = problems, 2 = no browser found (UNVERIFIED, not a pass).
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const cdp = require('../../../test/cdp');

const args = process.argv.slice(2);
const flag = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 ? args[at + 1] : fallback; };
const page = path.resolve(args.find(arg => !arg.startsWith('--') && !args[args.indexOf(arg) - 1]?.startsWith('--')) || '');
const wait = Number(flag('wait', 6)) * 1000;
const width = Number(flag('width', 1600));
const height = Number(flag('height', 1000));
const extra = flag('eval', '');
const repo = path.resolve(__dirname, '..', '..', '..');
const out = path.resolve(flag('out', path.join(repo, 'artifacts', 'concepts', path.basename(path.dirname(page)))));

function locateBrowser(env = process.env) {
  if (env.AGENTVIZ_BROWSER) return env.AGENTVIZ_BROWSER;
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
  for (const tail of [['Microsoft', 'Edge', 'Application', 'msedge.exe'], ['Google', 'Chrome', 'Application', 'chrome.exe']]) {
    for (const root of roots) { const exe = path.join(root, ...tail); try { if (fs.statSync(exe).isFile()) return exe; } catch { /* next */ } }
  }
  return null;
}
const freePort = () => new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); }); });

async function main() {
  if (!fs.existsSync(page)) { console.error(`No such page: ${page}`); return 1; }
  const exe = locateBrowser();
  if (!exe) { console.error('UNVERIFIED: no Edge or Chrome found. Set AGENTVIZ_BROWSER.'); return 2; }
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agentviz-concept-'));
  const port = await freePort();
  const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let tab;
  const report = { page, problems: [], shots: [] };
  try {
    let target;
    for (let attempt = 0; attempt < 75 && !target; attempt++) { await cdp.sleep(200); try { target = (await cdp.targets(port)).find(entry => entry.type === 'page'); } catch { /* not up */ } }
    if (!target) throw new Error('The browser did not expose a page.');
    tab = await cdp.connect(target.webSocketDebuggerUrl);
    await tab.send('Page.enable'); await tab.send('Runtime.enable'); await tab.send('Log.enable');
    await tab.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await tab.send('Page.navigate', { url: pathToFileURL(page).href });
    await cdp.sleep(1500);
    const shot = async name => {
      const { data } = await tab.send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(out, name);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      report.shots.push(file);
      return crypto.createHash('sha1').update(data).digest('hex');
    };
    const first = await shot('1-start.png');
    if (extra) { try { report.eval = await tab.evaluate(extra, { userGesture: true }); } catch (error) { report.problems.push({ kind: 'eval', text: String(error.message).slice(0, 300) }); } }
    await cdp.sleep(wait);
    const second = await shot('2-later.png');
    report.changed = first !== second;
    report.title = await tab.evaluate('document.title');
    report.problems.push(...tab.problems);
  } catch (error) {
    report.problems.push({ kind: 'harness', text: String(error.message) });
  } finally {
    if (tab) tab.close();
    // On Windows, Edge leaves child processes behind unless the whole tree is ended.
    if (process.platform === 'win32') { try { require('child_process').execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ } }
    else child.kill();
    await cdp.sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold it */ }
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.changed) console.error('WARNING: the two screenshots are identical; the page did not visibly move.');
  return report.problems.length ? 1 : 0;
}

main().then(code => process.exit(code), error => { console.error(error); process.exit(1); });
