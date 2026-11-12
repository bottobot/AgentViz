'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const cdp = require('./cdp');
const probes = require('./page-probes');
const fx = require('./resilience-fixture');

// Runs inside a VS Code extension test host. Start it with `npm run host` (test/host-runner.js), which uses a new
// temporary profile, never the normal one, and judges the result file this writes. By hand:
//   Code.exe --extensionDevelopmentPath=<checkout> --extensionTestsPath=<checkout>/test/extension-host.js
//            --user-data-dir=<temp profile> --extensions-dir=<temp folder> --disable-extensions
// Environment, all set by the runner:
//   AGENTVIZ_HOST_FIXTURE  an empty folder the profile's agentviz.claudeRoot and agentviz.codexRoot both name.
//                          Synthetic transcripts are written there; the settings of that profile are changed for
//                          the source failure checks and put back.
//   AGENTVIZ_HOST_CDP      the debugging port of this window. With it the checks drive and read the real webview.
//   AGENTVIZ_HOST_RESULT   where the result is written (default artifacts/extension-host-result.json).
//   AGENTVIZ_HOST_SHOTS    a folder for screenshots of the window. Every title in them is synthetic.
//   AGENTVIZ_HOST_CLIPBOARD=1  also check that Copy ID reaches the clipboard (the clipboard text is put back).
// Anything that could not run is listed under notRun; nothing is reported as passed without having run.
const { CLAUDE_ID, TWIN_ID, CODEX_ID, OLD_ID, GONE_ID, BIG_ID, CHILD_ID, TITLE, RENAMED, HOSTILE_TITLE, BIG, writeFixture } = require('./acceptance-fixture');

const sleep = cdp.sleep;

exports.run = async function () {
  const resultFile = process.env.AGENTVIZ_HOST_RESULT || path.resolve(__dirname, '../artifacts/extension-host-result.json');
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  const checks = [];
  const failed = [];
  const notRun = [];
  const findings = [];
  const measurements = {};
  const problems = [];
  const sessions = [];
  // One named check. A failure is recorded and the run goes on, so one defect does not hide the others.
  const check = async (name, body) => {
    try { await body(); checks.push(name); }
    catch (error) { failed.push({ name, error: String(error && error.message || error).slice(0, 1500) }); }
  };
  const write = fatal => fs.writeFileSync(resultFile, JSON.stringify({ passed: !fatal && failed.length === 0, checks, failed, notRun, findings, measurements, vscode: vscode.version,
    ...(fatal || failed.length ? { error: fatal ? String(fatal.message || fatal) : failed.map(entry => `${entry.name}: ${entry.error}`).join(' | ').slice(0, 3000) } : {}) }, null, 2));
  try {
    const fixture = process.env.AGENTVIZ_HOST_FIXTURE;
    const port = Number.parseInt(process.env.AGENTVIZ_HOST_CDP || '', 10);
    const shots = process.env.AGENTVIZ_HOST_SHOTS;
    const settings = () => vscode.workspace.getConfiguration('agentviz');
    let source;
    if (fixture) {
      assert.equal(settings().get('claudeRoot'), fixture, 'The profile reads Claude sessions from the synthetic folder');
      assert.equal(settings().get('codexRoot'), fixture, 'The profile reads Codex sessions from the synthetic folder');
      assert.deepEqual(fs.readdirSync(fixture), [], 'The synthetic folder starts empty');
      source = writeFixture(fixture);
    }

    const extension = vscode.extensions.getExtension('agentviz-local.agent-viz');
    assert.ok(extension, 'Development extension is registered');
    const tabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.label === 'AgentViz');
    const waitForTabs = async count => {
      const deadline = Date.now() + 5000;
      while (tabs().length !== count && Date.now() < deadline) await sleep(50);
    };
    const close = async () => {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await waitForTabs(0);
      assert.equal(tabs().length, 0, 'The editor closes cleanly');
    };

    // The real webview, reached over the window's debugging port. The page inside it is the frame that holds
    // the session picker; everything is evaluated in that frame's own context, under the page's own policy.
    async function attachView() {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        let list = [];
        try { list = await cdp.targets(port); } catch { /* the endpoint is not up yet */ }
        for (const target of list.filter(entry => entry.type === 'iframe' && entry.url.startsWith('vscode-webview://')).reverse()) {
          let session;
          try { session = await cdp.connect(target.webSocketDebuggerUrl); } catch { continue; }
          await session.send('Runtime.enable');
          await session.send('Log.enable');
          for (let attempt = 0; attempt < 20; attempt++) {
            for (const context of [...session.contexts]) {
              let found = false;
              try { found = await session.evaluate("typeof AgentViz === 'object' && Boolean(document.getElementById('session'))", { contextId: context.id }); } catch { /* a frame that went away */ }
              if (!found) continue;
              sessions.push(session);
              const run = (expression, options = {}) => session.evaluate(expression, { ...options, contextId: context.id });
              const state = () => run(probes.call(probes.viewState));
              const until = async (accept, label, ms = 25000) => {
                const end = Date.now() + ms;
                let last;
                while (Date.now() < end) { last = await state(); if (accept(last)) return last; await sleep(150); }
                const { sessions: listed, workspaces, ...rest } = last || {};
                throw new Error(`Timed out waiting for: ${label}. Last view state: ${JSON.stringify({ ...rest, sessions: (listed || []).length, workspaces: (workspaces || []).length })}`);
              };
              const id = value => JSON.stringify(value);
              return { session, run, state, until,
                input: (element, value) => run(`(() => { const e = document.getElementById(${id(element)}); e.focus(); e.value = ${id(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`),
                choose: (element, value) => run(`(() => { const e = document.getElementById(${id(element)}); e.value = ${id(value)}; if (e.value !== ${id(value)}) throw new Error('That choice is not in the list'); e.dispatchEvent(new Event('change', { bubbles: true })); })()`),
                click: element => run(`document.getElementById(${id(element)}).click()`, { userGesture: true }),
                focus: element => run(`document.getElementById(${id(element)}).focus()`) };
            }
            await sleep(150);
          }
          session.close();
        }
        await sleep(250);
      }
      throw new Error('The webview did not appear on the debugging port.');
    }
    const shot = async name => {
      if (!shots || !port) return;
      const page = (await cdp.targets(port)).find(entry => entry.type === 'page');
      const session = await cdp.connect(page.webSocketDebuggerUrl);
      try {
        const { data } = await session.send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(shots, { recursive: true });
        fs.writeFileSync(path.join(shots, name), Buffer.from(data, 'base64'));
      } finally { session.close(); }
    };

    // 1. Open, reuse, close, reopen.
    await vscode.commands.executeCommand('agentviz.open');
    await waitForTabs(1);
    assert.ok(extension.isActive, 'The contributed command activated the extension');
    assert.equal(tabs().length, 1, 'One activity editor opened');
    await vscode.commands.executeCommand('agentviz.open');
    assert.equal(tabs().length, 1, 'Opening again reuses the same editor');
    await close();
    await vscode.commands.executeCommand('agentviz.open');
    await waitForTabs(1);
    assert.equal(tabs().length, 1, 'The editor reopens after disposal');
    checks.push('command activation', 'webview editor opened', 'single panel reuse', 'close', 'reopen after disposal');

    const WEBVIEW = ['real view loaded under its policy', 'workspace selection', 'name filter', 'full ID filter beyond the returned list', 'no matches', 'renamed session keeps its selection',
      'selected child', 'family lanes', 'example and real are told apart', 'keyboard focus order', 'accessible names', 'contrast in the default dark theme', 'contrast in the default light theme',
      'source failures', 'deleted followed session', 'private text stays out of the page', 'Copy ID reaches the clipboard', 'no console or policy errors'].map(name => `webview: ${name}`);
    const ENTRY = ['invalid arguments refused', 'unknown ID opens nothing', 'Claude session opens the editor', 'duplicate execution keeps one editor', 'Codex session reuses the open editor',
      'no-argument command unchanged', 'unavailable source reported', 'reopen after disposal', 'the view shows the addressed session'].map(name => `entry: ${name}`);
    if (!fixture) notRun.push(...WEBVIEW.map(name => `${name} (AGENTVIZ_HOST_FIXTURE not set)`), ...ENTRY.map(name => `${name} (AGENTVIZ_HOST_FIXTURE not set)`));
    else if (!port) notRun.push(...WEBVIEW.map(name => `${name} (AGENTVIZ_HOST_CDP not set)`), 'entry: the view shows the addressed session (AGENTVIZ_HOST_CDP not set)');

    if (fixture && port) {
      const ids = source.ids;
      const view = await attachView();
      const values = state => state.sessions.map(option => option.value).filter(Boolean);
      const clear = async () => {
        const state = await view.state();
        if (!state.clearDisabled) await view.click('clear-filters');
        if (state.examplePressed === 'true') await view.click('example');
        await view.until(next => next.clearDisabled && next.examplePressed === 'false' && !next.nameFilter && !next.idFilter && !next.workspaceValue && /sessions found\./.test(next.matches), 'filters cleared and the list answered');
      };
      // Follows one session the way a person does: its full ID in the ID filter, then the picker.
      const followById = async (sessionId, catalogue) => {
        await clear();
        await view.input('id-filter', sessionId);
        await view.until(state => values(state).includes(catalogue), `the session ${sessionId} listed`);
        if ((await view.state()).barId !== sessionId) await view.choose('session', catalogue);
        const state = await view.until(next => next.barId === sessionId && next.headingId === sessionId && next.status !== 'Loading history', `the session ${sessionId} followed and drawn`);
        await clear();
        return state;
      };

      await check('webview: real view loaded under its policy', async () => {
        const state = await view.until(next => /sessions found\./.test(next.matches) && next.barId, 'the first list and selection');
        const page = await view.run(`({ policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, scripts: [...document.scripts].map(script => Boolean(script.src) && Boolean(script.nonce || script.getAttribute('nonce'))), inlineStyles: document.querySelectorAll('body [style], body style').length, origin: location.protocol })`);
        assert.match(page.policy, /default-src 'none'/);
        assert.match(page.policy, /script-src 'nonce-/);
        assert.doesNotMatch(page.policy, /unsafe-inline|unsafe-eval|data:|blob:/);
        // Scripts are allowed by nonce only. VS Code's own style source is the one host pattern in the policy.
        assert.match(page.policy, /script-src 'nonce-[A-Za-z0-9+/=]+';/);
        measurements.policy = page.policy.replace(/'nonce-[^']+'/, "'nonce-…'");
        assert.equal(page.origin, 'vscode-webview:');
        // VS Code puts the theme variables on the root element itself; the page's own content carries no inline style.
        assert.equal(page.inlineStyles, 0, 'No inline style in the page body');
        // Total, limit and the first selection came from the host through the real message channel.
        assert.match(state.matches, new RegExp(`^${source.total} sessions found\\. Showing the 80 most recently written\\.`));
        assert.equal(values(state).length, 80);
        assert.ok(!values(state).includes(ids.old), 'The old session is outside the returned list');
        assert.equal(state.eyebrow, 'LOCAL SESSION · PROJECT');
        assert.equal(state.headingId, state.barId, 'The heading and the bar name the same session');
        measurements.theme = await view.run("({ kind: document.body.className, name: document.body.getAttribute('data-vscode-theme-name') || '' })");
      });

      await check('webview: workspace selection', async () => {
        await clear();
        const before = await view.state();
        const labels = before.workspaces.map(option => option.text);
        const archive = before.workspaces.find(option => /^Archive \(1\)$/.test(option.text));
        assert.ok(archive, `A project named Archive with one session is offered: ${labels.join(' | ')}`);
        // Two directories share the basename Alpha: both are offered, under different labels.
        assert.equal(labels.filter(label => /Alpha \(\d+\)$/.test(label)).length, 2, labels.join(' | '));
        assert.equal(new Set(labels).size, labels.length, 'Every project label is distinct');
        assert.match(labels[0], new RegExp(`^All projects \\(${source.total}\\)$`));
        await view.choose('workspace', archive.value);
        const narrowed = await view.until(state => /^1 of \d+ sessions match\./.test(state.matches) && values(state).length === 1, 'one match in the chosen project');
        assert.deepEqual(values(narrowed), [ids.old], 'The project older than the returned list is reached');
        // The followed session is outside the project: it stays followed and labelled, and the picker shows no neighbour.
        assert.equal(narrowed.barId, before.barId);
        assert.equal(narrowed.sessionValue, '');
        assert.match(narrowed.barNote, /Hidden by the current filters\. Still followed/);
        await view.choose('session', ids.old);
        const followed = await view.until(state => state.barId === OLD_ID && state.headingId === OLD_ID && state.status !== 'Loading history', 'the chosen session followed and drawn');
        assert.equal(followed.barWorkspace, 'Archive');
        assert.equal(followed.barName, 'Synthetic archive audit');
        assert.equal(followed.heading, 'Synthetic archive audit');
        assert.equal(followed.barProvider, 'Claude Code');
        assert.equal(followed.calls, '5');
        assert.equal(followed.barNote, '');
      });

      await check('webview: name filter', async () => {
        await clear();
        await view.input('name-filter', '  CHECKOUT fix ');
        const named = await view.until(state => /^2 of \d+ sessions match\./.test(state.matches), 'two sessions with the same saved name');
        assert.deepEqual(values(named).sort(), [ids.claude, ids.twin].sort());
        const texts = named.sessions.filter(option => option.value).map(option => option.text);
        // The same name twice: project first, then name, then enough of the ID to tell them apart.
        assert.ok(texts.every(text => text.includes(TITLE)), texts.join(' | '));
        assert.notEqual(texts[0], texts[1]);
        assert.ok(texts.some(text => text.startsWith('Synthetic/Alpha › ')) && texts.some(text => text.startsWith('Other/Alpha › ')), texts.join(' | '));
        // Name and project intersect.
        const alpha = named.workspaces.find(option => /^Other\/Alpha \(1\)$/.test(option.text));
        await view.choose('workspace', alpha.value);
        const both = await view.until(state => /^1 of \d+ sessions match\./.test(state.matches), 'name and project together');
        assert.deepEqual(values(both), [ids.twin]);
        // A saved name that is markup is found, and shown, as text.
        await view.choose('workspace', '');
        await view.input('name-filter', '<img src=x');
        const hostile = await view.until(state => state.workspaceValue === '' && /^1 of \d+ sessions match\./.test(state.matches), 'the name that is markup found as text');
        assert.deepEqual(values(hostile), [ids.hostile]);
        assert.ok(hostile.sessions.some(option => option.text.includes(HOSTILE_TITLE)), 'The name is shown whole');
        assert.equal(await view.run("document.querySelectorAll('img, [onerror]').length"), 0, 'No element was made from it');
      });

      await check('webview: full ID filter beyond the returned list', async () => {
        await clear();
        await view.input('id-filter', `  ${OLD_ID.toUpperCase()} `);
        const exact = await view.until(state => /^1 of \d+ sessions match\./.test(state.matches), 'the full ID matched');
        assert.deepEqual(values(exact), [ids.old]);
        // A fragment from the end of the ID, far past the eight characters shown.
        await view.input('id-filter', OLD_ID.slice(-12));
        const partial = await view.until(state => state.idFilter === OLD_ID.slice(-12) && /^1 of \d+ sessions match\./.test(state.matches), 'a late fragment matched');
        assert.deepEqual(values(partial), [ids.old]);
        // Name and ID intersect: the ID of one twin with the shared name leaves that twin only.
        await view.input('id-filter', TWIN_ID);
        await view.input('name-filter', 'checkout');
        const both = await view.until(state => state.nameFilter === 'checkout' && /^1 of \d+ sessions match\./.test(state.matches), 'name and ID together');
        assert.deepEqual(values(both), [ids.twin]);
      });

      await check('webview: no matches', async () => {
        await clear();
        const before = await view.state();
        await view.input('name-filter', 'zzz no such session');
        const none = await view.until(state => /^No sessions match\. Clear filters to see all \d+\.$/.test(state.matches), 'the no matches state');
        assert.equal(none.sessionDisabled, true);
        assert.deepEqual(none.sessions.map(option => option.text), ['No sessions match these filters']);
        assert.equal(none.clearDisabled, false);
        // The followed session is still named and still drawn.
        assert.equal(none.barId, before.barId);
        assert.equal(none.headingId, before.barId);
        await shot('host-no-matches.png');
      });

      await check('webview: renamed session keeps its selection', async () => {
        const before = await followById(CLAUDE_ID, ids.claude);
        assert.equal(before.barName, TITLE);
        fs.appendFileSync(source.files.claude, fx.claudeTitle(CLAUDE_ID, RENAMED) + fx.claudeCall(CLAUDE_ID, Date.now(), 'after-rename'));
        // No Refresh: the ordinary passes pick the new name up.
        const after = await view.until(state => state.barName === RENAMED, 'the new name on an ordinary refresh', 30000);
        assert.equal(after.barId, CLAUDE_ID);
        assert.equal(after.headingId, CLAUDE_ID);
        assert.equal(after.heading, RENAMED);
        assert.equal(after.sessionValue, ids.claude, 'The picker still shows the same source');
        assert.ok(after.sessions.find(option => option.value === ids.claude).text.includes(RENAMED));
        // A Codex name lives in the index: a newer line renames it.
        fs.appendFileSync(source.files.index, fx.line({ id: CODEX_ID, thread_name: 'Synthetic release review', updated_at: fx.stamp(Date.now()) }));
        await view.input('name-filter', 'release review');
        const codex = await view.until(state => /^1 of \d+ sessions match\./.test(state.matches), 'the renamed Codex session found by its new name', 30000);
        assert.deepEqual(values(codex), [ids.codex]);
        assert.equal(codex.barId, CLAUDE_ID, 'The followed session did not move');
      });

      await check('webview: family lanes', async () => {
        const state = await followById(CLAUDE_ID, ids.claude);
        const family = await view.until(next => next.lanes.length === 3, 'main and two subagent lanes');
        assert.equal(family.lanes[0], 'Main session');
        assert.ok(family.panelScopes.some(scope => /MAIN \+ 2 SUBAGENT LANES/.test(scope)), family.panelScopes.join(' | '));
        assert.equal(state.barProvider, 'Claude Code');
        await shot('host-dark-family.png');
      });

      await check('webview: selected child', async () => {
        await clear();
        await view.input('id-filter', CHILD_ID);
        await view.until(state => values(state).includes(ids.child), 'the subagent transcript listed');
        await view.choose('session', ids.child);
        const child = await view.until(state => state.barId === CHILD_ID && state.headingId === CHILD_ID && state.status !== 'Loading history', 'the subagent followed and drawn');
        assert.equal(child.barProvider, 'Claude Code · subagent');
        assert.match(child.caption, /Claude Code · subagent/);
        assert.equal(child.barWorkspace, 'Synthetic/Alpha');
        assert.ok(child.laneNotes.some(note => /itself a subagent\. Its parent and sibling agents are not shown/.test(note)), child.laneNotes.join(' | '));
        assert.equal(child.calls, '4', 'Only the subagent\'s own calls are counted');
      });

      await check('webview: example and real are told apart', async () => {
        const live = await followById(CLAUDE_ID, ids.claude);
        assert.equal(live.exampleButton, 'Show example');
        assert.equal(live.eyebrow, 'LOCAL SESSION · PROJECT');
        assert.doesNotMatch(live.barProvider, /example/);
        assert.equal(live.connection, '');
        await view.click('example');
        const example = await view.until(state => state.examplePressed === 'true', 'example mode');
        assert.equal(example.exampleButton, 'Return to live');
        assert.equal(example.eyebrow, 'SYNTHETIC EXAMPLE · PROJECT');
        assert.match(example.barProvider, /synthetic example$/);
        assert.match(example.connection, /^Example data only\./);
        assert.notEqual(example.barId, CLAUDE_ID, 'The bar names the example, not the real session');
        assert.equal(example.headingId, example.barId);
        assert.equal(example.sessions[0].text, 'Example shown. Choose a session to follow it');
        await shot('host-example.png');
        await view.click('example');
        const back = await view.until(state => state.examplePressed === 'false' && state.barId === CLAUDE_ID && state.headingId === CLAUDE_ID, 'the real session again');
        assert.equal(back.eyebrow, 'LOCAL SESSION · PROJECT');
      });

      await check('webview: keyboard focus order', async () => {
        await followById(CLAUDE_ID, ids.claude);
        await view.session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
        await view.focus('refresh');
        const order = ['refresh'];
        const rings = [];
        for (let n = 0; n < 6; n++) {
          await view.session.key('Tab');
          await sleep(60);
          const ring = await view.run(probes.call(probes.focusReport));
          order.push(ring ? ring.id : '');
          if (ring) rings.push(ring);
        }
        // Clear filters is disabled with no filter set, so Tab passes it.
        assert.deepEqual(order, ['refresh', 'example', 'workspace', 'name-filter', 'id-filter', 'session', 'copy-id']);
        for (const ring of rings) assert.ok(ring.outlineStyle !== 'none' && ring.devicePixels >= 2 && ring.ratio >= 3 && ring.inView, `A visible focus ring on ${ring.id}: ${JSON.stringify(ring)}`);
        // Typed with real key events into the focused field; Escape empties it.
        await view.focus('name-filter');
        await view.session.type('filler 7');
        const typed = await view.until(state => state.nameFilter === 'filler 7' && /^1 of \d+ sessions match\./.test(state.matches), 'typed text filtering the list');
        assert.equal(typed.focus, 'name-filter');
        await view.session.key('Escape');
        const emptied = await view.until(state => state.nameFilter === '' && state.clearDisabled, 'Escape emptied the filter');
        assert.equal(emptied.focus, 'name-filter');
        measurements.focusRings = rings.map(ring => `${ring.id}: ${ring.devicePixels} device px ${ring.outlineStyle}, ${ring.ratio}:1`);
      });

      await check('webview: accessible names', async () => {
        await followById(CLAUDE_ID, ids.claude);
        const names = await view.run(probes.call(probes.nameReport));
        assert.deepEqual(Object.fromEntries(names.controls.map(control => [control.id, control.name])), { refresh: 'Refresh', example: 'Show example', workspace: 'Project / workspace', 'name-filter': 'Session name',
          'id-filter': 'Session ID (optional)', 'clear-filters': 'Clear filters', session: 'Session', 'copy-id': 'Copy full session ID' });
        assert.deepEqual(names.landmarks.map(landmark => landmark.name), ['Session controls', 'Find a session', 'Followed session', 'Session activity']);
        assert.ok(names.images.length >= 3 && names.images.every(Boolean), `Every graphic has a name: ${JSON.stringify(names.images)}`);
        assert.equal(names.unnamedGraphics, 0);
        assert.equal(names.lang, 'en');
        assert.equal(names.title, 'AgentViz');
        assert.equal(names.headings.filter(tag => tag === 'h1').length, 1);
        assert.ok(names.live.includes('matches') && names.live.includes('connection'));
      });

      const contrast = async label => {
        await followById(CLAUDE_ID, ids.claude);
        const report = await view.run(probes.call(probes.contrastReport));
        measurements[`contrast ${label}`] = { measured: report.measured, lowest: report.lowest, skippedDisabled: report.disabled, skippedDecorative: report.decorative, failures: report.failures };
        assert.ok(report.measured > 60, `Text was measured: ${report.measured}`);
        assert.deepEqual(report.failures, [], `Text below WCAG AA in the ${label} theme`);
      };
      await check('webview: contrast in the default dark theme', async () => {
        assert.match((await view.state()).bodyClass, /vscode-dark/);
        await contrast('dark');
      });
      {
        const workbench = vscode.workspace.getConfiguration('workbench');
        const previous = workbench.get('colorTheme');
        await workbench.update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
        let light = false;
        try { await view.until(state => /vscode-light/.test(state.bodyClass), 'the light theme', 10000); light = true; } catch { /* reported below */ }
        if (light) {
          await check('webview: contrast in the default light theme', async () => { await shot('host-light.png'); await contrast('light'); });
        } else notRun.push('webview: contrast in the default light theme (the theme did not switch)');
        await vscode.workspace.getConfiguration('workbench').update('colorTheme', previous, vscode.ConfigurationTarget.Global);
        await view.until(state => /vscode-dark/.test(state.bodyClass), 'the dark theme again', 10000).catch(() => {});
      }

      await check('webview: source failures', async () => {
        await followById(CLAUDE_ID, ids.claude);
        // One provider's folder is missing: said in the view, the other provider keeps working.
        await settings().update('codexRoot', path.join(fixture, 'missing-codex'), vscode.ConfigurationTarget.Global);
        try {
          const partial = await view.until(state => state.notices.some(notice => /Codex sessions folder not found\./.test(notice)), 'the missing Codex folder reported in the view');
          assert.equal(partial.barId, CLAUDE_ID, 'The followed Claude session is restored');
          assert.match(partial.matches, new RegExp(`^${source.total - 1} sessions found\\.`));
          await view.input('name-filter', 'release review');
          await view.until(state => /^No sessions match\./.test(state.matches), 'the Codex session gone from the list');
          await shot('host-source-failure.png');
          // Both folders missing: nothing of the old source stays on the page.
          await settings().update('claudeRoot', path.join(fixture, 'missing-claude'), vscode.ConfigurationTarget.Global);
          await view.click('clear-filters');
          const none = await view.until(state => state.barHidden && state.sessionDisabled && /Claude sessions folder not found\./.test(state.connection), 'both folders reported missing');
          assert.match(none.connection, /Codex sessions folder not found\./);
          assert.deepEqual(none.sessions.map(option => option.text), ['No local sessions found']);
          assert.equal(none.heading, 'No session selected');
          const text = await view.run('document.body.innerText');
          for (const old of ['Synthetic', 'Alpha', CLAUDE_ID, CODEX_ID]) assert.ok(!text.includes(old), `Nothing of the old source is left: ${old}`);
        } finally {
          await settings().update('claudeRoot', fixture, vscode.ConfigurationTarget.Global);
          await settings().update('codexRoot', fixture, vscode.ConfigurationTarget.Global);
        }
        const back = await view.until(state => new RegExp(`^${source.total} sessions found\\.`).test(state.matches) && !state.barHidden, 'both sources back');
        assert.ok(!back.notices.some(notice => /folder not found|could not be read/.test(notice)), back.notices.join(' | '));
      });

      await check('webview: deleted followed session', async () => {
        await followById(GONE_ID, ids.gone);
        fs.rmSync(source.files.gone);
        await view.click('refresh');
        const gone = await view.until(state => /No longer in the source folders/.test(state.barNote), 'the missing transcript reported');
        // It stays named. No other session is put in its place.
        assert.equal(gone.barId, GONE_ID);
        assert.equal(gone.barName, 'Synthetic short lived');
        assert.ok(gone.headingId === GONE_ID || gone.headingId === null);
        // The picker keeps the followed session as its own entry; the host's count no longer includes it.
        assert.ok(gone.sessionValue === ids.gone || gone.sessionValue === '', gone.sessionValue);
        assert.ok(gone.notices.concat(gone.connection).some(text => /no longer in the source folders/.test(text)), 'The warning is shown');
        assert.match(gone.matches, new RegExp(`^${source.total - 1} sessions found\\.`));
      });

      // The cost of the once-a-second message at full retention, inside the real webview (the S08 open question).
      await check('webview: private text stays out of the page', async () => {
        await followById(BIG_ID, ids.big);
        const loaded = await view.until(state => state.lanes.length === BIG.children + 1 && !/Loading/.test(state.status), 'the large family loaded', 60000);
        await view.run(`(() => { const probe = window.__agentvizProbe = { tasks: [], handler: [], bytes: 0, events: 0 };
          new PerformanceObserver(list => { for (const entry of list.getEntries()) probe.tasks.push(Math.round(entry.duration)); }).observe({ entryTypes: ['longtask'] });
          window.addEventListener('message', event => { if (!event.data || event.data.type !== 'state') return; probe.handler.push(Math.round(performance.now() - event.timeStamp));
            if (!probe.bytes && event.data.snapshot) { probe.bytes = JSON.stringify(event.data).length; probe.events = event.data.snapshot.events.length + event.data.snapshot.family.lanes.reduce((sum, lane) => sum + (lane.events ? lane.events.length : 0), 0); } }); })()`);
        await sleep(8000);
        const probe = await view.run('window.__agentvizProbe');
        const sorted = [...probe.handler].sort((a, b) => a - b);
        measurements.largeFamily = { lanes: loaded.lanes.length, callsShown: loaded.calls, messagesIn8s: probe.handler.length, messageBytes: probe.bytes, eventsInMessage: probe.events,
          handlerMs: { median: sorted[Math.floor(sorted.length / 2)] ?? null, max: sorted.at(-1) ?? null }, longTasks: { count: probe.tasks.length, maxMs: Math.max(0, ...probe.tasks) } };
        if (probe.tasks.length && Math.max(...probe.tasks) >= 200) findings.push(`With a family at full retention the view blocks for up to ${Math.max(...probe.tasks)} ms on each once-a-second message of ${probe.bytes} bytes (${probe.handler.length} messages in 8 s). The host sends the whole history every second, changed or not.`);
        // Every page drawn so far used records full of sentinels; none may be in the page, nor any local path.
        const page = await view.run('document.documentElement.outerHTML');
        for (const sentinel of fx.SENTINELS) assert.ok(!page.includes(sentinel), `${sentinel} is not in the page`);
        assert.ok(!page.includes(path.basename(path.dirname(fixture))), 'The source folder is not named in the page');
        // URLs (the policy, the script and style addresses, SVG namespaces) are set aside; what is left may hold no drive, share or transcript name.
        assert.doesNotMatch(page.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)]+/gi, ''), /\b[A-Za-z]:[\\/]|\\\\|\.jsonl|\.meta\.json/, 'No local path in the page');
        await shot('host-large-family.png');
      });

      if (process.env.AGENTVIZ_HOST_CLIPBOARD === '1') {
        const before = await vscode.env.clipboard.readText();
        // An empty read can also mean a picture is on the clipboard, which could not be put back.
        if (!before) notRun.push('webview: Copy ID reaches the clipboard (the clipboard holds no text to put back)');
        else await check('webview: Copy ID reaches the clipboard', async () => {
          try {
            await followById(CLAUDE_ID, ids.claude);
            await view.click('copy-id');
            const copied = await view.until(state => state.copyStatus !== '', 'a copy result');
            const read = await vscode.env.clipboard.readText();
            assert.equal(copied.copyStatus, 'Session ID copied.');
            assert.equal(read, CLAUDE_ID);
          } finally { await vscode.env.clipboard.writeText(before); }
        });
      } else notRun.push('webview: Copy ID reaches the clipboard (not asked for: it overwrites the clipboard; run with --clipboard)');

      // Everything the webview reported so far. Then a control: the same channel does report a violation.
      await check('webview: no console or policy errors', async () => {
        const all = sessions.flatMap(session => session.problems);
        // VS Code's own frame around the page asks for browser features this build does not know. That warning
        // comes from the editor, once per webview, whatever the page is. Nothing else is set aside.
        const fromEditor = all.filter(problem => problem.kind === 'log warning' && /^Unrecognized feature: '[\w-]+'\.$/.test(problem.text));
        const reported = all.filter(problem => !fromEditor.includes(problem));
        measurements.console = { webviewsWatched: sessions.length, fromThePage: reported.length, entries: reported.slice(0, 10), fromTheEditorFrame: [...new Set(fromEditor.map(problem => problem.text))] };
        assert.deepEqual(reported, [], 'The webview reported errors or warnings');
        const violation = await view.run(`new Promise(resolve => { document.addEventListener('securitypolicyviolation', event => resolve(event.effectiveDirective), { once: true });
          const script = document.createElement('script'); script.textContent = 'window.__agentvizInline = true'; document.body.append(script); setTimeout(() => resolve('none'), 3000); })`);
        assert.equal(violation, 'script-src-elem', 'The policy blocks a script without the nonce');
        assert.equal(await view.run('window.__agentvizInline === true'), false);
        await sleep(300);
        assert.ok(view.session.problems.some(problem => /Content Security Policy/i.test(problem.text)), 'The blocked script was reported on the channel that was checked');
      });
      for (const session of sessions) problems.push(...session.problems);
    }

    await close();
    if (fixture) {
      const open = argument => vscode.commands.executeCommand('agentviz.openSession', argument);
      const refused = async (argument, reason, count, label) => {
        assert.deepEqual(await open(argument), { ok: false, reason }, label);
        await sleep(300);
        assert.equal(tabs().length, count, `${label}: editor count unchanged`);
      };
      let view = null;
      const shows = async (sessionId, provider, name) => {
        if (!port) return;
        if (!view || !view.session.open) view = await attachView();
        const state = await view.until(next => next.barId === sessionId && next.headingId === sessionId && next.status !== 'Loading history', `the view showing ${sessionId}`);
        assert.equal(state.barProvider, provider);
        assert.equal(state.barName, name);
        assert.equal(state.heading, name);
      };

      await check('entry: invalid arguments refused', async () => {
        // Nothing is open. Refused calls open nothing.
        await refused(undefined, 'invalid-argument', 0, 'No argument');
        await refused({ provider: 'claude', sessionId: source.files.claude }, 'invalid-argument', 0, 'A file path as the session ID');
        await refused({ provider: 'claude', sessionId: CLAUDE_ID, file: 'C:\\Synthetic\\session.jsonl' }, 'invalid-argument', 0, 'An extra file field');
        await refused({ provider: 'gemini', sessionId: CLAUDE_ID }, 'invalid-argument', 0, 'An unknown provider');
      });
      await check('entry: unknown ID opens nothing', async () => {
        await refused({ provider: 'claude', sessionId: 'ffffffff-0000-4000-8000-000000000000' }, 'not-found', 0, 'An unknown session ID');
        await refused({ provider: 'codex', sessionId: CLAUDE_ID }, 'not-found', 0, 'A Claude ID addressed as Codex');
      });
      await check('entry: Claude session opens the editor', async () => {
        assert.deepEqual(await open({ provider: 'claude', sessionId: CLAUDE_ID }), { ok: true, provider: 'claude', sessionId: CLAUDE_ID });
        await waitForTabs(1);
        assert.equal(tabs().length, 1, 'The entry command opened one editor');
      });
      await check('entry: duplicate execution keeps one editor', async () => {
        const twice = await Promise.all([open({ provider: 'claude', sessionId: CLAUDE_ID }), open({ provider: 'claude', sessionId: CLAUDE_ID })]);
        // The newest call always succeeds; the older one is superseded unless its lookup had already finished.
        assert.deepEqual(twice[1], { ok: true, provider: 'claude', sessionId: CLAUDE_ID });
        assert.ok(twice[0].ok === true || twice[0].reason === 'superseded', 'The older duplicate succeeded or was superseded');
        assert.equal(tabs().length, 1, 'Duplicate execution keeps one editor');
      });
      let shown = 0;
      await check('entry: Codex session reuses the open editor', async () => {
        await shows(CLAUDE_ID, 'Claude Code', RENAMED); shown++;
        assert.deepEqual(await open({ provider: 'codex', sessionId: CODEX_ID }), { ok: true, provider: 'codex', sessionId: CODEX_ID });
        assert.equal(tabs().length, 1, 'The open editor is reused for another session');
        await shows(CODEX_ID, 'Codex', 'Synthetic release review'); shown++;
        await refused({ provider: 'codex', sessionId: 'unknown-session' }, 'not-found', 1, 'An unknown ID with the editor open');
      });
      await check('entry: no-argument command unchanged', async () => {
        await vscode.commands.executeCommand('agentviz.open');
        assert.equal(tabs().length, 1, 'The Command Palette command still reuses the editor');
      });
      await check('entry: unavailable source reported', async () => {
        // The Codex setting points at a folder that does not exist (isolated profile only).
        await settings().update('codexRoot', path.join(fixture, 'missing'), vscode.ConfigurationTarget.Global);
        try { await refused({ provider: 'codex', sessionId: CODEX_ID }, 'source-unavailable', 1, 'A missing Codex folder'); }
        finally { await settings().update('codexRoot', fixture, vscode.ConfigurationTarget.Global); }
      });
      await check('entry: reopen after disposal', async () => {
        if (view) view.session.close();
        await close();
        // A session older than the returned list, addressed on a closed editor.
        assert.deepEqual(await open({ provider: 'claude', sessionId: OLD_ID }), { ok: true, provider: 'claude', sessionId: OLD_ID });
        await waitForTabs(1);
        assert.equal(tabs().length, 1, 'The entry command reopens a closed editor');
        view = null;
        await shows(OLD_ID, 'Claude Code', 'Synthetic archive audit'); shown++;
      });
      if (port) await check('entry: the view shows the addressed session', async () => { assert.equal(shown, 3, 'Each addressed session was seen in the real view'); });
      if (view) view.session.close();
      await close();
    }
    for (const session of sessions) session.close();
    write();
  } catch (error) {
    write(error);
    throw error;
  }
  if (failed.length) throw new Error(`${failed.length} host checks failed: ${failed.map(entry => entry.name).join('; ')}`);
};
