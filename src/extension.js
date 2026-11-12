'use strict';

const vscode = require('vscode');
const os = require('node:os');
const path = require('node:path');
const { FamilyReader, discoverSessions } = require('./sessions');
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

const WORKSPACE_KEY = /^ws:([0-9a-f]{20}|unknown)$/;
const count = value => Number.isInteger(value) && value >= 0 ? value : 0;
// The project list is whitelisted the same way: an opaque key, a cleaned label and a count.
function workspaceEntry({ key, label, count: sessions }) {
  const known = typeof key === 'string' && /^ws:[0-9a-f]{20}$/.test(key);
  return { key: known ? key : 'ws:unknown', label: (known && sessionTitle(label)) || 'Unknown workspace', count: count(sessions) };
}
// A filter request from the view. Anything that is not a plain bounded string or a known key shape is dropped.
function cleanQuery(value) {
  const text = field => typeof value?.[field] === 'string' ? value[field].slice(0, 200) : '';
  return { seq: Number.isSafeInteger(value?.seq) && value.seq > 0 ? value.seq : 0, workspaceKey: WORKSPACE_KEY.test(text('workspaceKey')) ? value.workspaceKey : '', name: text('name'), id: text('id') };
}
const emptyCatalog = () => ({ sessions: [], warnings: [], workspaces: [], total: 0, matched: 0, limit: 0, pending: { workspaces: 0, names: 0 }, walk: null });

const PROVIDERS = ['claude', 'codex'];
const SESSION_ID = /^[\w-]{1,128}$/;
// Discovery's own wording for a provider folder that is missing or cannot be listed.
const SOURCE_WARNING = { claude: /^Claude (sessions folder not found|folder could not be read)/, codex: /^Codex (sessions folder not found|folder could not be read)/ };
// The argument of agentviz.openSession, sent by another extension. Exactly { provider, sessionId }: a known
// provider and an ID made of letters, digits, _ and - only. Nothing else is accepted, so a path, a pattern or an
// extra field (file, root, query) can never reach discovery or the file system from here.
function cleanTarget(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const keys = Object.keys(value);
    if (keys.length !== 2 || !keys.includes('provider') || !keys.includes('sessionId')) return null;
    const { provider, sessionId } = value;
    if (typeof provider !== 'string' || !PROVIDERS.includes(provider) || typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null;
    return { provider, sessionId };
  } catch { return null; }
}
function sourceRoots() {
  const config = vscode.workspace.getConfiguration('agentviz');
  return { claudeRoot: config.get('claudeRoot') || path.join(os.homedir(), '.claude'), codexRoot: config.get('codexRoot') || path.join(os.homedir(), '.codex') };
}

let panel;
// Set while a panel is open: makes that panel follow a session found in the current source.
let follow;
let requests = 0;

// agentviz.openSession: opens (or reuses) the panel on one local session named by provider and session ID.
// The session is looked up in the configured source folders; the transcript path always comes from that
// listing, never from the argument. Answers { ok: true, provider, sessionId } or { ok: false, reason }, where
// reason is invalid-argument, not-found, source-unavailable or superseded. A failed call opens and changes nothing.
async function openSession(context, argument) {
  const target = cleanTarget(argument);
  if (!target) return { ok: false, reason: 'invalid-argument' };
  const request = ++requests;
  const roots = sourceRoots();
  let discovered;
  // The same lookup the ID filter uses (S03): every transcript is listed before any cap, so an older session
  // can be addressed. No project or name is read here; an open panel may be reading those at the same time.
  try { discovered = await discoverSessions(roots, { query: { id: target.sessionId }, headBudget: 0, titleBudget: 0 }); }
  catch { return { ok: false, reason: 'source-unavailable' }; }
  const now = sourceRoots();
  // A newer call, or a source setting changed while this one was looking: its answer is for an old question.
  if (request !== requests || now.claudeRoot !== roots.claudeRoot || now.codexRoot !== roots.codexRoot) return { ok: false, reason: 'superseded' };
  // The ID filter matches fragments and is cut to the cap, so the exact comparison runs over the whole listing.
  const wanted = target.sessionId.toLowerCase();
  const matches = (discovered.all || discovered.sessions || []).filter(session => session.provider === target.provider && typeof session.sessionId === 'string' && session.sessionId.toLowerCase() === wanted);
  // One ID in two transcripts: a session's own transcript before a subagent's, then the most recently written.
  const found = matches.find(session => !session.child) || matches[0];
  if (!found) return { ok: false, reason: (discovered.warnings || []).some(warning => SOURCE_WARNING[target.provider].test(warning)) ? 'source-unavailable' : 'not-found' };
  openPanel(context);
  follow(found);
  return { ok: true, provider: found.provider, sessionId: found.sessionId };
}

function activate(context) {
  // The Command Palette command takes no argument; anything passed to it is ignored.
  context.subscriptions.push(vscode.commands.registerCommand('agentviz.open', () => openPanel(context)));
  context.subscriptions.push(vscode.commands.registerCommand('agentviz.openSession', argument => openSession(context, argument)));
}

function openPanel(context) {
    if (panel) { panel.reveal(); return; }
    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    const current = vscode.window.createWebviewPanel('agentviz.activity', 'AgentViz', vscode.ViewColumn.One, { enableScripts: true, localResourceRoots: [media] });
    panel = current;
    const resource = name => current.webview.asWebviewUri(vscode.Uri.joinPath(media, name)).toString();
    current.webview.html = webviewHtml({ css: resource('style.css'), view: resource('view.js'), app: resource('app.js'), cspSource: current.webview.cspSource });
    let catalog = emptyCatalog();
    // Every session of the current source by catalogue ID, not only the ones sent to the view.
    let index = new Map();
    // The same sessions as a list, host only: the family reader looks for subagent transcripts in it.
    let sourceFiles = [];
    let query = cleanQuery();
    let selected;
    let reader;
    let lastWalk = 0;
    let lookupDue = false;
    let busy = false;
    let disposed = false;
    let ready = false;
    let generation = 0;

    async function refresh(force = false) {
      if (busy || disposed || !ready || !current.visible) return;
      busy = true;
      const revision = generation;
      try {
        const listingDue = force || Date.now() - lastWalk >= 10000;
        if (listingDue || lookupDue) {
          const asked = query;
          lookupDue = false;
          const roots = sourceRoots();
          // A new filter, or names still being read, reuses the last folder listing; the folders are listed again every 10 seconds.
          let discovered = await discoverSessions(roots, { query: asked, keep: selected ? [selected.id] : [], walk: listingDue ? undefined : catalog.walk || undefined });
          if (disposed) return;
          // The source, the selection or the filters changed while this lookup ran: its answer is for an old
          // question. It is not shown, and the lookup is asked again on the next pass.
          if (revision !== generation || asked !== query) { lookupDue = true; return; }
          let all = discovered.all || discovered.sessions;
          if (!selected) {
            const previousId = context.workspaceState.get('selectedSession');
            // An open folder is matched by its directory, never by a basename that another directory may share.
            const openWorkspaces = new Set((vscode.workspace.workspaceFolders || []).filter(folder => folder.uri?.scheme === 'file').map(folder => workspaceIdentity(folder.uri.fsPath)?.key).filter(Boolean));
            const first = all.find(session => session.id === previousId)
              || all.find(session => openWorkspaces.has(session.workspaceKey))
              || discovered.sessions[0] || all[0];
            if (first && first.name === undefined && discovered.walk) {
              // The first choice can be older than the returned list; read its own name before it is shown.
              discovered = await discoverSessions(roots, { query: asked, keep: [first.id], walk: discovered.walk });
              if (disposed) return;
              if (revision !== generation || asked !== query) { lookupDue = true; return; }
              all = discovered.all || discovered.sessions;
            }
            selected = first && (all.find(session => session.id === first.id) || first);
          }
          catalog = { ...emptyCatalog(), ...discovered };
          index = new Map(all.map(session => [session.id, session]));
          sourceFiles = all;
          if (listingDue) lastWalk = Date.now();
          // The followed session is looked up by its stable ID. It is never replaced by a neighbour: a transcript
          // that has left the source stays named and is reported as missing.
          if (selected) selected = index.get(selected.id) || { ...selected, missing: true };
          lookupDue = lookupDue || catalog.pending.workspaces > 0 || catalog.pending.names > 0;
        }
        let snapshot = null;
        const warnings = [...catalog.warnings];
        const selection = selected;
        if (selection?.missing) warnings.push('The followed session is no longer in the source folders (deleted or moved). Choose another session.');
        else if (selection) {
          // One reader per followed session: it reads that session and the subagent transcripts that belong to it.
          // Choosing another session, Refresh or a new source drops it, and with it every child reader.
          if (!reader) reader = new FamilyReader(selection.provider, selection.sessionId);
          try { snapshot = await reader.read(selection.file, { files: sourceFiles }); }
          catch (error) { warnings.push(`Selected transcript could not be read (${error.code || 'unknown error'}). Choose another session or refresh.`); }
        }
        if (disposed || revision !== generation || selected !== selection) return;
        await current.webview.postMessage({
          type: 'state', selectedId: selected?.id || '', selected: selected ? catalogueEntry(selected) : null, snapshot,
          sessions: catalog.sessions.map(catalogueEntry), workspaces: catalog.workspaces.map(workspaceEntry),
          lookup: { seq: query.seq, total: count(catalog.total) || catalog.sessions.length, matched: count(catalog.matched) || catalog.sessions.length, limit: count(catalog.limit),
            pendingNames: count(catalog.pending.names), pendingWorkspaces: count(catalog.pending.workspaces), missing: Boolean(selected?.missing) },
          warnings
        });
      } catch (error) {
        if (!disposed) vscode.window.showErrorMessage(`AgentViz could not refresh (${error.code || 'unexpected error'}).`);
      } finally { busy = false; }
    }

    const choose = next => {
      if (!next || next.id === selected?.id) return;
      generation++;
      selected = next;
      reader = null;
      if (next.name === undefined) lookupDue = true;
      void context.workspaceState.update('selectedSession', next.id);
      void refresh();
    };
    follow = found => {
      const known = index.get(found.id);
      // Not in this panel's last folder listing (a new transcript, or a panel that has not listed yet): list
      // again before deciding it is missing. Its name and project are read by the panel's own lookup.
      if (!known) lastWalk = 0;
      choose(known || { ...found, name: undefined });
    };
    const messages = current.webview.onDidReceiveMessage(message => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'ready') {
        // A reloaded view starts its request numbering again, so its first request is taken as it comes.
        ready = true;
        query = cleanQuery(message.query);
        void refresh(true);
      }
      else if (message.type === 'query') {
        const next = cleanQuery(message);
        // Requests are numbered by the view; one that arrives after a newer one is ignored.
        if (next.seq <= query.seq) return;
        query = next;
        lookupDue = true;
        void refresh();
      }
      else if (message.type === 'refresh') {
        generation++;
        reader = null;
        lastWalk = 0;
        void refresh(true);
      }
      else if (message.type === 'select' && typeof message.id === 'string') {
        // Only an ID present in the current source can be followed, whether or not it was in the returned list.
        choose(index.get(message.id));
      }
    });
    const visibility = current.onDidChangeViewState(() => { if (current.visible) { ready = true; void refresh(); } });
    const config = vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('agentviz')) return;
      generation++;
      catalog = emptyCatalog();
      index = new Map();
      sourceFiles = [];
      selected = undefined;
      reader = null;
      lastWalk = 0;
      void refresh(true);
    });
    const timer = setInterval(() => { void refresh(); }, 1000);
    current.onDidDispose(() => {
      disposed = true;
      clearInterval(timer);
      messages.dispose();
      visibility.dispose();
      config.dispose();
      if (panel === current) { panel = undefined; follow = undefined; }
    });
    context.subscriptions.push(current);
}

function deactivate() { if (panel) panel.dispose(); }

module.exports = { activate, deactivate };
