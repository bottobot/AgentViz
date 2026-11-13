'use strict';
// S09: inspects the emitted UI in a real browser, with real key presses, at desktop and narrow widths.
//   node test/browser-check.js
// The page is the markup from src/webview.js with the real stylesheet and scripts, under its own content
// security policy. Its data comes from the real host code (src/extension.js and the adapters) reading a synthetic
// source folder; this script only carries messages between the two, as VS Code's message channel would.
// The browser is headless Edge or Chrome with a new temporary profile. AGENTVIZ_BROWSER names another one.
// Screenshots and the receipt go to artifacts/browser/ (not committed). Every title in them is synthetic.
// Not covered here: VS Code's own theme colours, and the real clipboard (it is replaced by a recorder so the
// user's clipboard is never written). The VS Code host run (npm run host) covers the real webview.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const cdp = require('./cdp');
const probes = require('./page-probes');
const fx = require('./resilience-fixture');
const acceptance = require('./acceptance-fixture');
const { stopOwn, freePort } = require('./host-runner');
const { webviewHtml } = require('../src/webview');

const CHECKOUT = path.resolve(__dirname, '..');
const OUT = path.join(CHECKOUT, 'artifacts', 'browser');
const sleep = cdp.sleep;

function locateBrowser(env = process.env) {
  if (env.AGENTVIZ_BROWSER) return fs.existsSync(env.AGENTVIZ_BROWSER) && fs.statSync(env.AGENTVIZ_BROWSER).isFile() ? env.AGENTVIZ_BROWSER : null;
  const roots = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean);
  for (const tail of [['Microsoft', 'Edge', 'Application', 'msedge.exe'], ['Google', 'Chrome', 'Application', 'chrome.exe']]) {
    for (const root of roots) { const exe = path.join(root, ...tail); try { if (fs.statSync(exe).isFile()) return exe; } catch { /* next */ } }
  }
  return null;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const receiptFile = path.join(OUT, 'browser-check.json');
  // An old receipt or screenshot never stands in for this run.
  fs.rmSync(receiptFile, { force: true });
  for (const name of fs.readdirSync(OUT)) if (name.endsWith('.png')) fs.rmSync(path.join(OUT, name), { force: true });
  const checks = [];
  const measurements = {};
  const receipt = body => fs.writeFileSync(receiptFile, JSON.stringify({ when: new Date().toISOString(), ...body }, null, 2));
  const exe = locateBrowser();
  if (!exe) {
    receipt({ passed: false, unverified: true, problems: ['No Edge or Chrome executable was found. The browser inspection is unverified here.'] });
    console.error('UNVERIFIED: no Edge or Chrome executable was found. Set AGENTVIZ_BROWSER.');
    return 2;
  }
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'agentviz-browser-'));
  const source = path.join(run, 'source');
  fs.mkdirSync(source);
  const fixture = acceptance.writeFixture(source, { fillers: 6, big: false });
  const media = name => pathToFileURL(path.join(CHECKOUT, 'media', name)).href;
  const pageFile = path.join(run, 'page.html');
  fs.writeFileSync(pageFile, webviewHtml({ css: media('style.css'), view: media('view.js'), app: media('app.js'), cspSource: 'file:' }));
  const host = fx.realHost({ claudeRoot: source, codexRoot: source });
  const port = await freePort();
  const child = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(run, 'profile')}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  let page;
  let failure = null;
  const check = async (name, body) => {
    try { await body(); checks.push({ name, pass: true }); console.log(`PASS ${name}`); }
    catch (error) { const detail = String(error && error.message || error).slice(0, 1500); checks.push({ name, pass: false, detail }); console.error(`FAIL ${name}: ${detail}`); }
  };
  try {
    let target;
    for (let attempt = 0; attempt < 75 && !target; attempt++) {
      await sleep(200);
      try { target = (await cdp.targets(port)).find(entry => entry.type === 'page'); } catch { /* not up yet */ }
    }
    if (!target) throw new Error('The browser did not expose a page.');
    page = await cdp.connect(target.webSocketDebuggerUrl);
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Log.enable'); await page.send('Accessibility.enable');
    measurements.browser = (await page.send('Browser.getVersion')).product;
    const size = async (width, height = 900) => { await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(200); };
    const load = async () => { await page.send('Page.navigate', { url: pathToFileURL(pageFile).href }); await sleep(700); };
    const shot = async name => { const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64')); };
    const state = () => page.evaluate(probes.call(probes.viewState));
    const active = () => page.evaluate('document.activeElement ? document.activeElement.id : ""');
    const tabTo = async id => { for (let n = 0; n < 14; n++) { if (await active() === id) return; await page.key('Tab'); } assert(await active() === id, `Tab reaches ${id}`); };
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    const same = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
    const contrast = async label => {
      const report = await page.evaluate(probes.call(probes.contrastReport));
      measurements[`contrast ${label}`] = { measured: report.measured, lowest: report.lowest, skippedDisabled: report.disabled, skippedDecorative: report.decorative, failures: report.failures };
      assert(report.measured > 30, `Text was measured in the ${label} state: ${report.measured}`);
      same(report.failures, [], `Text below WCAG AA in the ${label} state`);
    };
    const layout = async label => {
      const report = await page.evaluate(probes.call(probes.layoutReport));
      measurements[`layout ${label}`] = report;
      assert(report.scrollWidth <= report.innerWidth && report.outside.length === 0, `No sideways scroll and every control in view at ${label}: ${JSON.stringify(report)}`);
    };

    // 1. The page with no host at all: it can only be the example, and says so.
    await size(1280);
    await load();
    await check('without a host the page shows the example and labels it', async () => {
      const example = await state();
      same([example.eyebrow, example.exampleButton, example.examplePressed], ['SYNTHETIC EXAMPLE · PROJECT', 'Return to live', 'true'], 'Example labels');
      assert(/synthetic example$/.test(example.barProvider) && /^Example data only\./.test(example.connection), `The bar and the note say example: ${example.barProvider} | ${example.connection}`);
      await contrast('example, 1280 px');
      await layout('example, 1280 px');
      await shot('example-1280.png');
    });

    // 2. The page with the real host code behind it. The clipboard is a recorder, never the real one.
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__posted = []; window.__saved = undefined; window.__copied = [];
      window.acquireVsCodeApi = () => ({ postMessage: message => window.__posted.push(message), getState: () => window.__saved, setState: value => { window.__saved = value; } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied.push(text); } } });` });
    await load();
    host.open();
    let delivered = 0;
    // One exchange: what the page posted goes to the host, one host pass runs, and its messages go to the page.
    const pump = async () => {
      for (const message of await page.evaluate('window.__posted.splice(0)')) host.send(message);
      await host.pass();
      await host.settle();
      while (delivered < host.messages.length) await page.evaluate(`window.postMessage(${JSON.stringify(host.messages[delivered++])}, '*'); new Promise(resolve => setTimeout(resolve, 20))`);
    };
    const until = async (accept, label, ms = 15000) => {
      const end = Date.now() + ms;
      let last;
      while (Date.now() < end) { await pump(); last = await state(); if (accept(last)) return last; await sleep(60); }
      const { sessions, workspaces, ...rest } = last || {};
      throw new Error(`Timed out waiting for: ${label}. Last view state: ${JSON.stringify(rest)}`);
    };
    const values = view => view.sessions.map(option => option.value).filter(Boolean);
    const followClaude = async () => {
      host.openSession({ provider: 'claude', sessionId: acceptance.CLAUDE_ID });
      return until(view => view.barId === acceptance.CLAUDE_ID && view.headingId === acceptance.CLAUDE_ID && view.lanes.length === 3, 'the synthetic family followed and drawn');
    };

    await check('with a host the page shows the local session and labels it', async () => {
      const live = await followClaude();
      same([live.eyebrow, live.exampleButton, live.examplePressed, live.connection], ['LOCAL SESSION · PROJECT', 'Show example', 'false', ''], 'Live labels');
      same([live.barWorkspace, live.barName, live.heading, live.barProvider], ['Synthetic/Alpha', acceptance.TITLE, acceptance.TITLE, 'Claude Code'], 'The followed session');
      assert(new RegExp(`^${fixture.total} sessions found\\.`).test(live.matches), `The status line counts the source: ${live.matches}`);
      await shot('live-1280.png');
    });

    await check('keyboard: Tab order and a visible focus ring on every control', async () => {
      await followClaude();
      await page.evaluate('document.activeElement && document.activeElement.blur()');
      const order = [];
      const rings = [];
      for (let n = 0; n < 8; n++) {
        await page.key('Tab');
        const ring = await page.evaluate(probes.call(probes.focusReport));
        order.push(ring ? ring.id : '');
        if (ring) rings.push(ring);
      }
      // Clear filters is disabled with no filter set, so Tab passes it.
      same(order, ['refresh', 'settings', 'example', 'workspace', 'name-filter', 'id-filter', 'session', 'copy-id'], 'Tab order');
      for (const ring of rings) assert(ring.outlineStyle !== 'none' && ring.devicePixels >= 2 && ring.ratio >= 3 && ring.inView, `A visible focus ring on ${ring.id}: ${JSON.stringify(ring)}`);
      measurements.focusRings = rings.map(ring => `${ring.id}: ${ring.devicePixels} device px ${ring.outlineStyle}, ${ring.ratio}:1`);
      // Shift+Tab goes back the same way.
      await page.key('Tab', { shift: true });
      same(await active(), 'session', 'Shift+Tab');
    });

    await check('keyboard: filter, choose, copy, Escape, Clear and the example switch without a pointer', async () => {
      await followClaude();
      await page.evaluate('document.activeElement && document.activeElement.blur()');
      await tabTo('name-filter');
      await page.type('  CHECKOUT fix ');
      const named = await until(view => /^2 of \d+ sessions match\./.test(view.matches), 'two sessions with the same saved name');
      same(values(named).sort(), [fixture.ids.claude, fixture.ids.twin].sort(), 'The matches');
      assert(named.focus === 'name-filter' && named.nameFilter === '  CHECKOUT fix ', 'Typed text and focus are kept across the answer');
      // The ID filter narrows to the twin; the followed session is then hidden, not replaced.
      await page.key('Tab');
      await page.type(acceptance.TWIN_ID.slice(-12));
      const hidden = await until(view => /^1 of \d+ sessions match\./.test(view.matches), 'one match by a late part of the ID');
      same([values(hidden), hidden.sessionValue, hidden.barId], [[fixture.ids.twin], '', acceptance.CLAUDE_ID], 'The followed session stays followed');
      assert(/Hidden by the current filters/.test(hidden.barNote), hidden.barNote);
      await shot('hidden-selection-1280.png');
      // Arrow keys in the list choose the match.
      await tabTo('session');
      await page.key('ArrowDown');
      const chosen = await until(view => view.barId === acceptance.TWIN_ID && view.headingId === acceptance.TWIN_ID, 'the match chosen with the arrow key');
      same([chosen.barWorkspace, chosen.barName, chosen.barNote], ['Other/Alpha', acceptance.TITLE, ''], 'The chosen twin');
      // Enter on Copy ID hands the whole ID to the clipboard.
      await tabTo('copy-id');
      await page.key('Enter');
      const copied = await until(view => view.copyStatus !== '', 'a copy result');
      same([copied.copyStatus, await page.evaluate('window.__copied')], ['Session ID copied.', [acceptance.TWIN_ID]], 'Copy ID');
      // Escape empties the focused filter only.
      await page.evaluate('document.getElementById("id-filter").focus()');
      await page.key('Escape');
      const escaped = await until(view => view.idFilter === '' && /^2 of \d+ sessions match\./.test(view.matches), 'Escape emptied the ID filter');
      assert(escaped.nameFilter.trim() === 'CHECKOUT fix' && escaped.focus === 'id-filter', 'The name filter and focus are untouched');
      // Enter on Clear filters resets everything and moves focus to a control that stays usable.
      await tabTo('clear-filters');
      await page.key('Enter');
      const cleared = await until(view => view.clearDisabled && /sessions found\./.test(view.matches), 'filters cleared');
      same([cleared.focus, cleared.nameFilter, cleared.idFilter], ['name-filter', '', ''], 'After Clear filters');
      // Space on the example switch, and back.
      await page.key('Tab', { shift: true }); await page.key('Tab', { shift: true });
      same(await active(), 'example', 'Focus on the example switch');
      await page.key(' ');
      const example = await until(view => view.examplePressed === 'true', 'the example');
      same([example.eyebrow, example.exampleButton], ['SYNTHETIC EXAMPLE · PROJECT', 'Return to live'], 'Example labels');
      assert(example.barId !== acceptance.TWIN_ID && /synthetic example$/.test(example.barProvider) && /^Example data only\./.test(example.connection), 'The example never carries the real session\'s identity');
      await page.key(' ');
      const back = await until(view => view.examplePressed === 'false' && view.barId === acceptance.TWIN_ID, 'the real session again');
      same(back.eyebrow, 'LOCAL SESSION · PROJECT', 'Live label');
    });

    await check('no matches is stated and the followed session stays', async () => {
      const before = await followClaude();
      await page.evaluate('document.getElementById("name-filter").focus()');
      await page.type('zzz no such session');
      const none = await until(view => /^No sessions match\. Clear filters to see all \d+\.$/.test(view.matches), 'the no matches state');
      same([none.sessionDisabled, none.sessions.map(option => option.text), none.barId], [true, ['No sessions match these filters'], before.barId], 'No matches');
      await contrast('no matches, 1280 px');
      await shot('no-matches-1280.png');
      await page.key('Escape');
      await until(view => view.clearDisabled, 'the filter emptied');
    });

    await check('a saved name that is markup stays text', async () => {
      host.openSession({ provider: 'claude', sessionId: acceptance.HOSTILE_ID });
      const hostile = await until(view => view.barId === acceptance.HOSTILE_ID && view.headingId === acceptance.HOSTILE_ID, 'the session with the hostile name');
      same([hostile.barName, hostile.heading], [acceptance.HOSTILE_TITLE, acceptance.HOSTILE_TITLE], 'The name is shown whole');
      same(await page.evaluate("document.querySelectorAll('img, [onerror]').length"), 0, 'Elements made from it');
      await shot('hostile-name-1280.png');
    });

    await check('accessible names as the browser computes them', async () => {
      await followClaude();
      const { nodes } = await page.send('Accessibility.getFullAXTree');
      const named = nodes.filter(node => !node.ignored && node.role).map(node => ({ role: node.role.value, name: node.name ? String(node.name.value || '') : '' }));
      const of = (...roles) => named.filter(node => roles.includes(node.role)).map(node => node.name).sort();
      same(of('button'), ['Clear filters', 'Copy full session ID', 'Refresh', 'Settings', 'Show example'], 'Buttons');
      same(of('combobox', 'ComboBoxSelect', 'MenuListPopup').filter(Boolean).filter((name, index, all) => all.indexOf(name) === index), ['Project / workspace', 'Session'], 'Lists');
      same(of('searchbox', 'textbox'), ['Session ID (optional)', 'Session name'], 'Search fields');
      same(of('navigation', 'search', 'main'), ['Find a session', 'Session activity', 'Session controls'], 'Landmarks');
      const graphics = of('image', 'img', 'graphics-document', 'meter', 'progressbar');
      assert(graphics.length >= 4 && graphics.every(Boolean), `Every graphic and gauge has a name: ${JSON.stringify(graphics.map(name => name.slice(0, 30)))}`);
      const page_ = await page.evaluate(probes.call(probes.nameReport));
      same([page_.lang, page_.title, page_.unnamedGraphics, page_.headings.filter(tag => tag === 'h1').length], ['en', 'AgentViz', 0, 1], 'Language, title, unnamed graphics, main headings');
      measurements.accessibleNames = { buttons: of('button'), lists: of('combobox', 'ComboBoxSelect'), fields: of('searchbox', 'textbox'), landmarks: of('navigation', 'search', 'main'), graphics: graphics.length };
    });

    await check('contrast of the live view', async () => {
      await followClaude();
      await contrast('live, 1280 px');
    });

    await check('layout and focus at 1280, 600 and 360 px', async () => {
      await followClaude();
      await layout('live, 1280 px');
      for (const width of [600, 360]) {
        await size(width, 800);
        await layout(`live, ${width} px`);
        await contrast(`live, ${width} px`);
        await page.evaluate('document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0)');
        const seen = [];
        // Tab carries on from the control used last and passes through the browser's own frame once per round,
        // so the walk goes one full round and is then read from the first control.
        for (let n = 0; n < 16 && seen.length < 8; n++) {
          await page.key('Tab');
          const ring = await page.evaluate(probes.call(probes.focusReport));
          if (!ring) continue;
          assert(ring.outlineStyle !== 'none' && ring.devicePixels >= 2 && ring.inView, `A focus ring inside the ${width} px viewport: ${JSON.stringify(ring)}`);
          seen.push(ring.id);
        }
        const start = seen.indexOf('refresh');
        same([...seen.slice(start), ...seen.slice(0, start)], ['refresh', 'settings', 'example', 'workspace', 'name-filter', 'id-filter', 'session', 'copy-id'], `Tab order at ${width} px`);
        await page.evaluate('document.activeElement.blur(); window.scrollTo(0, 0)');
        await shot(`live-${width}.png`);
      }
      await page.evaluate('document.getElementById("example").click()');
      await until(view => view.examplePressed === 'true', 'the example at 360 px');
      await layout('example, 360 px');
      await contrast('example, 360 px');
      await shot('example-360.png');
      await page.evaluate('document.getElementById("example").click()');
      await size(1280);
    });

    await check('private text stays out of the page', async () => {
      await followClaude();
      const html = await page.evaluate('document.documentElement.outerHTML');
      for (const sentinel of fx.SENTINELS) assert(!html.includes(sentinel), `${sentinel} is in the page`);
      assert(!html.includes(path.basename(run)), 'The source folder is named in the page');
      assert(!/\b[A-Za-z]:[\\/]|\\\\|\.jsonl|\.meta\.json/.test(html.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi, '')), 'A local path is in the page');
    });

    await check('no console errors, exceptions or policy violations', async () => {
      measurements.console = { reported: page.problems.length, entries: page.problems.slice(0, 10) };
      same(page.problems, [], 'Reported by the browser');
      same(host.errors, [], 'Reported by the host code');
      // A control: the same channel does report a violation, so the empty list above means something.
      const violation = await page.evaluate(`new Promise(resolve => { document.addEventListener('securitypolicyviolation', event => resolve(event.effectiveDirective), { once: true });
        const script = document.createElement('script'); script.textContent = 'window.__inline = true'; document.body.append(script); setTimeout(() => resolve('none'), 3000); })`);
      same([violation, await page.evaluate('window.__inline === true')], ['script-src-elem', false], 'A script without the nonce is blocked');
      await sleep(300);
      assert(page.problems.some(problem => /Content Security Policy/i.test(problem.text)), 'The blocked script was reported on the channel that was checked');
    });
  } catch (error) {
    failure = String(error && error.message || error);
    console.error(`FAIL ${failure}`);
  } finally {
    if (page) page.close();
    host.panel() && host.panel().dispose();
    const stopped = stopOwn(child, run);
    measurements.processesStopped = stopped.stopped.length;
    for (let attempt = 0; attempt < 10; attempt++) { try { fs.rmSync(run, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); break; } catch { await sleep(500); } }
  }
  const failed = checks.filter(entry => !entry.pass);
  const passed = !failure && failed.length === 0 && checks.length === 11;
  receipt({ passed, problems: [failure, checks.length !== 11 && !failure ? `Only ${checks.length} of 11 checks ran.` : null].filter(Boolean), checks, measurements, syntheticSources: true,
    screenshots: fs.readdirSync(OUT).filter(name => name.endsWith('.png')).sort() });
  console.log(`${passed ? 'PASSED' : 'FAILED'}: ${measurements.browser || 'browser'}, ${checks.length - failed.length} of ${checks.length} checks. Receipt: ${receiptFile}`);
  return passed ? 0 : 1;
}

if (require.main === module) main().then(code => { process.exitCode = code; }, error => { console.error(`FAIL ${error.message}`); process.exitCode = 1; });
module.exports = { locateBrowser };
