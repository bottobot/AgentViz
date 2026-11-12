'use strict';

const vscode = require('vscode');
const os = require('node:os');
const path = require('node:path');
const { TranscriptReader, discoverSessions } = require('./sessions');
const { webviewHtml } = require('./webview');
const { sessionTitle, workspaceIdentity, UNNAMED_SESSION } = require('./transcript');

const NAME_SOURCES = ['custom', 'generated', 'index'];
// The only catalogue fields the webview may receive. Titles and labels are cleaned again here so nothing a
// discovery change adds later (paths, scan state, raw text) can cross this boundary by accident.
function catalogueEntry({ id, sessionId, provider, project, child, modified, workspaceKey, workspaceLabel, name, nameSource }) {
  const known = typeof workspaceKey === 'string' && /^ws:[0-9a-f]{20}$/.test(workspaceKey);
  const title = sessionTitle(name);
  return {
    id, sessionId, provider, project, child, modified,
    workspaceKey: known ? workspaceKey : 'ws:unknown',
    workspaceLabel: (known && sessionTitle(workspaceLabel)) || 'Unknown workspace',
    name: title || UNNAMED_SESSION,
    nameSource: title && title !== UNNAMED_SESSION && NAME_SOURCES.includes(nameSource) ? nameSource : 'none'
  };
}

let panel;

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('agentviz.open', () => {
    if (panel) { panel.reveal(); return; }
    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    const current = vscode.window.createWebviewPanel('agentviz.activity', 'AgentViz', vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [media] });
    panel = current;
    const resource = name => current.webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString();
    current.webview.html = webviewHtml({ css: resource('style.css'), view: resource('view.js'), app: resource('app.js'), cspSource: current.webview.cspSource });
    let catalog = { sessions: [], warnings: [] };
    let selected;
    let reader;
    let lastScan = 0;
    let busy = false;
    let disposed = false;
    let ready = false;
    let generation = 0;

    async function refresh(force = false) {
      if (busy || disposed || !ready || !current.visible) return;
      busy = true;
      const revision = generation;
      try {
        if (force || Date.now() - lastScan >= 10000) {
          const config = vscode.workspace.getConfiguration('agentviz');
          const discovered = await discoverSessions({ claudeRoot: config.get('claudeRoot') || path.join(os.homedir(), '.claude'), codexRoot: config.get('codexRoot') || path.join(os.homedir(), '.codex') });
          if (disposed || revision !== generation) return;
          catalog = discovered;
          lastScan = Date.now();
          if (disposed) return;
          if (selected && !catalog.sessions.some(session => session.id === selected.id)) catalog.sessions.push(selected);
          if (!selected) {
            const previousId = context.workspaceState.get('selectedSession');
            // An open folder is matched by its directory, never by a basename that another directory may share.
            const openWorkspaces = new Set((vscode.workspace.workspaceFolders || []).filter(folder => folder.uri?.scheme === 'file').map(folder => workspaceIdentity(folder.uri.fsPath)?.key));
            selected = catalog.sessions.find(session => session.id === previousId)
              || catalog.sessions.find(session => openWorkspaces.has(session.workspaceKey))
              || catalog.sessions[0];
          }
        }
        let snapshot = null;
        const warnings = [...catalog.warnings];
        const selection = selected;
        if (selection) {
          if (!reader) reader = new TranscriptReader(selection.provider, selection.sessionId);
          try { snapshot = await reader.read(selection.file); }
          catch (error) { warnings.push(`Selected transcript could not be read (${error.code || 'unknown error'}). Choose another session or refresh.`); }
        }
        if (disposed || revision !== generation || selected !== selection) return;
        await current.webview.postMessage({
          type: 'state', selectedId: selected?.id || '', snapshot,
          sessions: catalog.sessions.map(catalogueEntry), warnings
        });
      } catch (error) {
        if (!disposed) vscode.window.showErrorMessage(`AgentViz could not refresh (${error.code || 'unexpected error'}).`);
      } finally { busy = false; }
    }

    const messages = current.webview.onDidReceiveMessage(message => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'ready') { ready = true; void refresh(true); }
      else if (message.type === 'refresh') {
        generation++;
        reader = null;
        lastScan = 0;
        void refresh(true);
      }
      else if (message.type === 'select' && typeof message.id === 'string') {
        const next = catalog.sessions.find(session => session.id === message.id);
        if (next && next.id !== selected?.id) {
          generation++;
          selected = next;
          reader = null;
          void context.workspaceState.update('selectedSession', next.id);
          void refresh();
        }
      }
    });
    const visibility = current.onDidChangeViewState(() => { if (current.visible) { ready = true; void refresh(); } });
    const config = vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('agentviz')) return;
      generation++;
      catalog = { sessions: [], warnings: [] };
      selected = undefined;
      reader = null;
      lastScan = 0;
      void refresh(true);
    });
    const timer = setInterval(() => { void refresh(); }, 1000);
    current.onDidDispose(() => {
      disposed = true;
      clearInterval(timer);
      messages.dispose();
      visibility.dispose();
      config.dispose();
      if (panel === current) panel = undefined;
    });
    context.subscriptions.push(current);
  }));
}

function deactivate() { if (panel) panel.dispose(); }

module.exports = { activate, deactivate };
