(function () {
  'use strict';
  const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const element = id => document.getElementById(id);
  const picker = element('session');
  const workspace = element('workspace');
  const nameInput = element('name-filter');
  const idInput = element('id-filter');
  const clearButton = element('clear-filters');
  const matches = element('matches');
  const selection = element('selection');
  const selectedWorkspace = element('selected-workspace');
  const selectedName = element('selected-name');
  const selectedId = element('selected-id');
  const selectedProvider = element('selected-provider');
  const selectionNote = element('selection-note');
  const copyButton = element('copy-id');
  const copyStatus = element('copy-status');
  const content = element('content');
  const connection = element('connection');
  const exampleButton = element('example');

  // Saved view state holds only the example switch and the three filters. It is checked again on the way in.
  const saved = (api && api.getState()) || {};
  const text = value => typeof value === 'string' ? value.slice(0, 200) : '';
  let example = api ? saved.example === true : true;
  let filters = { workspaceKey: /^ws:([0-9a-f]{20}|unknown)$/.test(text(saved.workspaceKey)) ? saved.workspaceKey : '', name: text(saved.name), id: text(saved.id) };
  let workspaceLabel = filters.workspaceKey ? text(saved.workspaceLabel) : '';
  let state = { sessions: [], selectedId: '', snapshot: null, warnings: [] };
  if (!api) {
    const sessions = AgentViz.demoCatalogue(Date.now());
    state = { ...state, sessions, selectedId: sessions[0].id };
  }
  let shown = null;
  const send = message => { if (api) api.postMessage(message); };
  const persist = () => { if (api) api.setState({ example, workspaceKey: filters.workspaceKey, workspaceLabel, name: text(filters.name), id: text(filters.id) }); };
  const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  // Typed text is restored once, here. After this the controller reads the inputs and never writes them during a refresh.
  if (filters.name) nameInput.value = filters.name;
  if (filters.id) idInput.value = filters.id;

  // Same values in the same order: update the wording in place, so an open list and its keyboard position survive a refresh.
  function syncOptions(select, wanted) {
    const current = select.children;
    let same = current.length === wanted.length;
    for (let index = 0; same && index < wanted.length; index++) same = current[index].value === wanted[index].value;
    if (same) {
      wanted.forEach((option, index) => setText(current[index], option.text));
      return;
    }
    select.replaceChildren(...wanted.map(option => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.text;
      return node;
    }));
  }

  function paintWorkspaces() {
    const choices = AgentViz.workspaceChoices(state.sessions);
    const chosen = choices.find(choice => choice.key === filters.workspaceKey);
    const wanted = [{ value: '', text: `All projects (${state.sessions.length})` }, ...choices.map(choice => ({ value: choice.key, text: `${choice.label} (${choice.count})` }))];
    if (chosen && chosen.label !== workspaceLabel) { workspaceLabel = chosen.label; persist(); }
    // A chosen project with no listed sessions stays chosen and says so, instead of quietly widening to all projects.
    if (filters.workspaceKey && !chosen) wanted.push({ value: filters.workspaceKey, text: `${workspaceLabel || 'Saved project'} (not in the current list)` });
    syncOptions(workspace, wanted);
    if (workspace.value !== filters.workspaceKey) workspace.value = filters.workspaceKey;
  }

  function paint() {
    const total = state.sessions.length;
    const exampleOverLive = Boolean(api) && example;
    const nav = AgentViz.navigate(state.sessions, filters, state.selectedId);
    paintWorkspaces();

    const placeholder = !total ? 'No local sessions found'
      : !nav.matches.length ? 'No sessions match these filters'
      : exampleOverLive ? 'Example shown. Choose a session to follow it'
      : !nav.selected ? 'Choose a session'
      : nav.excluded ? 'Followed session is hidden by these filters'
      : '';
    const short = AgentViz.idLabels(state.sessions);
    const wanted = nav.matches.map(session => ({ value: session.id, text: AgentViz.sessionLabel(session, short.get(session.id)) }));
    if (placeholder) wanted.unshift({ value: '', text: placeholder });
    syncOptions(picker, wanted);
    // The picker shows the followed session only when it is really in the list. It never falls through to a neighbour.
    const pick = placeholder ? '' : state.selectedId;
    if (picker.value !== pick) picker.value = pick;
    picker.disabled = !nav.matches.length;
    clearButton.disabled = !nav.active;
    setText(matches, !total ? '' : !nav.matches.length ? `No sessions match. Clear filters to see all ${total} listed.`
      : nav.active ? `${nav.matches.length} of ${total} listed sessions match.` : `${total} sessions listed.`);

    // The identity bar always names what the activity below belongs to.
    const identity = exampleOverLive ? AgentViz.demoIdentity : nav.selected;
    if (shown !== (identity ? identity.sessionId : null)) { shown = identity ? identity.sessionId : null; setText(copyStatus, ''); }
    selection.hidden = !identity;
    if (identity) {
      setText(selectedWorkspace, identity.workspaceLabel);
      setText(selectedName, identity.name);
      setText(selectedId, identity.sessionId);
      setText(selectedProvider, `${identity.provider === 'claude' ? 'Claude Code' : 'Codex'}${identity.child ? ' · subagent' : ''}${example ? ' · synthetic example' : ''}`);
      setText(selectionNote, !exampleOverLive && nav.excluded ? 'Hidden by the current filters. Still followed until you choose another session.' : '');
    }

    const now = Date.now();
    // A snapshot is drawn only under the session it was read from.
    const live = nav.selected && state.snapshot && state.snapshot.id === nav.selected.sessionId && state.snapshot.provider === nav.selected.provider ? state.snapshot : null;
    const session = example ? AgentViz.demoSession(now) : live;
    content.innerHTML = AgentViz.render(session, { now, example, identity: identity || undefined, warnings: example ? [] : state.warnings });
    exampleButton.textContent = example ? 'Return to live' : 'Show example';
    exampleButton.setAttribute('aria-pressed', String(example));
    setText(connection, example ? 'Example data only. Choose a session or return to live to follow real activity.' : !session && state.warnings.length ? state.warnings.join(' ') : '');
  }

  function changeFilters(next) {
    filters = { ...filters, ...next };
    persist();
    paint();
  }

  function selectForCopy() {
    try {
      const range = document.createRange();
      range.selectNodeContents(selectedId);
      const marked = window.getSelection();
      marked.removeAllRanges();
      marked.addRange(range);
      return true;
    } catch { return false; }
  }

  async function copyId() {
    const id = selectedId.textContent;
    if (!id) return;
    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(id); copied = true; }
    } catch { copied = false; }
    if (!copied) {
      const marked = selectForCopy();
      try { copied = marked && document.execCommand('copy') === true; } catch { copied = false; }
    }
    if (selectedId.textContent !== id) return;
    setText(copyStatus, copied ? 'Session ID copied.' : 'Copy is unavailable here. The ID is selected; press Ctrl+C.');
  }

  window.addEventListener('message', event => {
    if (!api || event.data?.type !== 'state' || !Array.isArray(event.data.sessions)) return;
    state = event.data;
    paint();
  });
  workspace.addEventListener('change', () => {
    const key = workspace.value;
    const choice = AgentViz.workspaceChoices(state.sessions).find(candidate => candidate.key === key);
    if (choice) workspaceLabel = choice.label;
    else if (!key) workspaceLabel = '';
    changeFilters({ workspaceKey: key });
  });
  for (const [input, field] of [[nameInput, 'name'], [idInput, 'id']]) {
    input.addEventListener('input', () => changeFilters({ [field]: input.value }));
    input.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !input.value) return;
      event.preventDefault();
      input.value = '';
      changeFilters({ [field]: '' });
    });
  }
  clearButton.addEventListener('click', () => {
    nameInput.value = '';
    idInput.value = '';
    workspaceLabel = '';
    // The button disables itself once nothing is filtered, so focus goes to a control that stays usable.
    nameInput.focus();
    changeFilters({ workspaceKey: '', name: '', id: '' });
  });
  picker.addEventListener('change', () => {
    const id = picker.value;
    if (!id) return;
    if (api) example = false;
    state = { ...state, selectedId: id, snapshot: null };
    persist();
    send({ type: 'select', id });
    paint();
  });
  copyButton.addEventListener('click', () => { void copyId(); });
  exampleButton.addEventListener('click', () => {
    example = !example;
    persist();
    paint();
  });
  element('refresh').addEventListener('click', () => { send({ type: 'refresh' }); paint(); });
  paint();
  send({ type: 'ready' });
})();
