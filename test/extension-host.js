'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

// Runs inside a VS Code extension test host. Start it with an isolated profile, never the normal one:
//   Code.exe --extensionDevelopmentPath=<checkout> --extensionTestsPath=<checkout>/test/extension-host.js
//            --user-data-dir=<temp profile> --extensions-dir=<temp folder> --disable-extensions
// The entry command checks (S07) run only when AGENTVIZ_HOST_FIXTURE names an empty folder and the profile's
// settings point agentviz.claudeRoot and agentviz.codexRoot at it. They write synthetic transcripts there and
// change agentviz.codexRoot in that profile for one check. Without the variable they are reported as not run.
const CLAUDE_ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const CODEX_ID = '0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';

exports.run = async function () {
  const resultFile = path.resolve(__dirname, '../artifacts/extension-host-result.json');
  await fs.mkdir(path.dirname(resultFile), { recursive: true });
  const checks = [];
  const notRun = [];
  try {
    const extension = vscode.extensions.getExtension('agentviz-local.agent-viz');
    assert.ok(extension, 'Development extension is registered');
    await vscode.commands.executeCommand('agentviz.open');
    await new Promise(resolve => setTimeout(resolve, 2000));
    assert.ok(extension.isActive, 'The contributed command activated the extension');
    const tabs = () => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.label === 'AgentViz');
    const waitForTabs = async count => {
      const deadline = Date.now() + 5000;
      while (tabs().length !== count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    };
    const close = async () => {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await waitForTabs(0);
      assert.equal(tabs().length, 0, 'The editor closes cleanly');
    };
    assert.equal(tabs().length, 1, 'One activity editor opened');
    await vscode.commands.executeCommand('agentviz.open');
    assert.equal(tabs().length, 1, 'Opening again reuses the same editor');
    await close();
    await vscode.commands.executeCommand('agentviz.open');
    await waitForTabs(1);
    assert.equal(tabs().length, 1, 'The editor reopens after disposal');
    await close();
    checks.push('command activation', 'webview editor opened', 'single panel reuse', 'close', 'reopen after disposal');

    const fixture = process.env.AGENTVIZ_HOST_FIXTURE;
    if (!fixture) notRun.push('agentviz.openSession entry command (AGENTVIZ_HOST_FIXTURE not set)');
    else {
      const settings = () => vscode.workspace.getConfiguration('agentviz');
      assert.equal(settings().get('claudeRoot'), fixture, 'The profile reads Claude sessions from the synthetic folder');
      assert.equal(settings().get('codexRoot'), fixture, 'The profile reads Codex sessions from the synthetic folder');
      const write = async (file, record) => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, `${JSON.stringify(record)}\n`);
      };
      await write(path.join(fixture, 'projects', 'synthetic-project', `${CLAUDE_ID}.jsonl`), { type: 'user', cwd: 'C:\\Synthetic\\Alpha', sessionId: CLAUDE_ID });
      await write(path.join(fixture, 'sessions', '2026', '01', '01', `rollout-2026-01-01T00-00-00-${CODEX_ID}.jsonl`), { type: 'session_meta', payload: { id: CODEX_ID, cwd: 'C:\\Synthetic\\Beta' } });
      const open = argument => vscode.commands.executeCommand('agentviz.openSession', argument);
      const refused = async (argument, reason, count, label) => {
        assert.deepEqual(await open(argument), { ok: false, reason }, label);
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(tabs().length, count, `${label}: editor count unchanged`);
      };

      // Nothing is open. Refused calls open nothing.
      await refused(undefined, 'invalid-argument', 0, 'No argument');
      await refused({ provider: 'claude', sessionId: path.join(fixture, 'projects', 'synthetic-project', `${CLAUDE_ID}.jsonl`) }, 'invalid-argument', 0, 'A file path as the session ID');
      await refused({ provider: 'claude', sessionId: CLAUDE_ID, file: 'C:\\Synthetic\\session.jsonl' }, 'invalid-argument', 0, 'An extra file field');
      await refused({ provider: 'gemini', sessionId: CLAUDE_ID }, 'invalid-argument', 0, 'An unknown provider');
      await refused({ provider: 'claude', sessionId: 'ffffffff-0000-4000-8000-000000000000' }, 'not-found', 0, 'An unknown session ID');
      await refused({ provider: 'codex', sessionId: CLAUDE_ID }, 'not-found', 0, 'A Claude ID addressed as Codex');
      checks.push('entry: invalid arguments refused', 'entry: unknown ID opens nothing');

      // A Claude session opens the editor; the same call twice at once still gives one editor.
      assert.deepEqual(await open({ provider: 'claude', sessionId: CLAUDE_ID }), { ok: true, provider: 'claude', sessionId: CLAUDE_ID });
      await waitForTabs(1);
      assert.equal(tabs().length, 1, 'The entry command opened one editor');
      const twice = await Promise.all([open({ provider: 'claude', sessionId: CLAUDE_ID }), open({ provider: 'claude', sessionId: CLAUDE_ID })]);
      // The newest call always succeeds; the older one is superseded unless its lookup had already finished.
      assert.deepEqual(twice[1], { ok: true, provider: 'claude', sessionId: CLAUDE_ID });
      assert.ok(twice[0].ok === true || twice[0].reason === 'superseded', 'The older duplicate succeeded or was superseded');
      assert.equal(tabs().length, 1, 'Duplicate execution keeps one editor');
      checks.push('entry: Claude session opens the editor', 'entry: duplicate execution keeps one editor');

      // A Codex session on the already open editor; refused calls leave it open.
      assert.deepEqual(await open({ provider: 'codex', sessionId: CODEX_ID }), { ok: true, provider: 'codex', sessionId: CODEX_ID });
      assert.equal(tabs().length, 1, 'The open editor is reused for another session');
      await refused({ provider: 'codex', sessionId: 'unknown-session' }, 'not-found', 1, 'An unknown ID with the editor open');
      await vscode.commands.executeCommand('agentviz.open');
      assert.equal(tabs().length, 1, 'The Command Palette command still reuses the editor');
      checks.push('entry: Codex session reuses the open editor', 'entry: no-argument command unchanged');

      // An unavailable source: the Codex setting points at a folder that does not exist (isolated profile only).
      await settings().update('codexRoot', path.join(fixture, 'missing'), vscode.ConfigurationTarget.Global);
      try { await refused({ provider: 'codex', sessionId: CODEX_ID }, 'source-unavailable', 1, 'A missing Codex folder'); }
      finally { await settings().update('codexRoot', fixture, vscode.ConfigurationTarget.Global); }
      checks.push('entry: unavailable source reported');

      // Closed, then addressed again.
      await close();
      assert.deepEqual(await open({ provider: 'codex', sessionId: CODEX_ID }), { ok: true, provider: 'codex', sessionId: CODEX_ID });
      await waitForTabs(1);
      assert.equal(tabs().length, 1, 'The entry command reopens a closed editor');
      await close();
      checks.push('entry: reopen after disposal');
    }
    await fs.writeFile(resultFile, JSON.stringify({ passed: true, checks, notRun, vscode: vscode.version }, null, 2));
  } catch (error) {
    await fs.writeFile(resultFile, JSON.stringify({ passed: false, checks, notRun, error: error.message }, null, 2));
    throw error;
  }
};
