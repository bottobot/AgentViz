'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async function () {
  const resultFile = path.resolve(__dirname, '../artifacts/extension-host-result.json');
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
    assert.equal(tabs().length, 1, 'One activity editor opened');
    await vscode.commands.executeCommand('agentviz.open');
    assert.equal(tabs().length, 1, 'Opening again reuses the same editor');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await waitForTabs(0);
    assert.equal(tabs().length, 0, 'The editor closes cleanly');
    await vscode.commands.executeCommand('agentviz.open');
    await waitForTabs(1);
    assert.equal(tabs().length, 1, 'The editor reopens after disposal');
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await fs.writeFile(resultFile, JSON.stringify({ passed: true, checks: ['command activation', 'webview editor opened', 'single panel reuse', 'close', 'reopen after disposal'], vscode: vscode.version }, null, 2));
  } catch (error) {
    await fs.writeFile(resultFile, JSON.stringify({ passed: false, error: error.message }, null, 2));
    throw error;
  }
};
