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
  let state = { sessions: [], selectedId: '', selected: null, snapshot: null, warnings: [], workspaces: null, lookup: null };
  // Filter requests to the host are numbered. An answer is used only when it carries the newest number.
  let seq = 1;
  let answered = 0;
  // The last catalogue entry seen for the followed session. An answer that leaves it out does not unname it.
  let remembered = null;
  if (!api) {
    const sessions = AgentViz.demoCatalogue(Date.now());
    state = { ...state, sessions, selectedId: sessions[0].id };
  }
  let shown = null;
  // The session last drawn, and its markup, for the details panel and the redraw check.
  let current = null;
  let drawn = '';
  const send = message => { if (api) api.postMessage(message); };
  const request = () => ({ seq, workspaceKey: filters.workspaceKey, name: text(filters.name).trim(), id: text(filters.id).trim() });
  const whole = value => Number.isInteger(value) && value >= 0 ? value : 0;
  const ask = () => send({ type: 'query', ...request() });
  // A catalogue entry from before workspaces and saved names existed still gets a truthful label, never "undefined".
  function entry(value) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string') return null;
    if (typeof value.workspaceKey === 'string' && typeof value.workspaceLabel === 'string' && typeof value.name === 'string' && typeof value.sessionId === 'string') return value;
    const known = field => typeof value[field] === 'string' && value[field] ? value[field] : '';
    return { ...value, sessionId: known('sessionId') || value.id, workspaceKey: known('workspaceKey') || 'ws:unknown',
      workspaceLabel: known('workspaceLabel') || known('project') || 'Unknown workspace', name: known('name') || 'Unnamed session' };
  }
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

  // The host answers with the matches for the current filters, newest first and cut to its limit. The followed
  // session travels separately, so it stays identified when the filters or the limit leave it out of that list.
  function listed() {
    const followed = state.selected && state.selected.id === state.selectedId ? state.selected : remembered && remembered.id === state.selectedId ? remembered : null;
    return followed && !state.sessions.some(session => session.id === followed.id) ? [...state.sessions, followed] : state.sessions;
  }

  // Project groups come from the host for every session it found, not from the returned list.
  function projectChoices(sessions) {
    // Sessions without a known project are one group under one plain label, whatever older label each carries.
    if (!Array.isArray(state.workspaces)) return AgentViz.workspaceChoices(sessions).map(choice => choice.key === 'ws:unknown' ? { ...choice, label: 'Unknown workspace' } : choice);
    // A group is {key, label, count}. A count is shown only when the host sends a usable one.
    const choices = state.workspaces.filter(group => group && typeof group === 'object' && typeof group.key === 'string')
      .map(group => ({ key: group.key, label: typeof group.label === 'string' && group.label ? group.label : 'Unknown workspace', count: Number.isInteger(group.count) && group.count >= 0 ? group.count : null }));
    const uses = new Map();
    for (const choice of choices) uses.set(choice.label.toLowerCase(), (uses.get(choice.label.toLowerCase()) || 0) + 1);
    // Different directories that still share a label are told apart by a fragment of their opaque key.
    for (const choice of choices) if (uses.get(choice.label.toLowerCase()) > 1) choice.label = `${choice.label} · ${choice.key.slice(3, 9)}`;
    return choices.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  }

  function paintWorkspaces(sessions, total) {
    const choices = projectChoices(sessions);
    const chosen = choices.find(choice => choice.key === filters.workspaceKey);
    const wanted = [{ value: '', text: `All projects (${total})` }, ...choices.map(choice => ({ value: choice.key, text: choice.count === null ? choice.label : `${choice.label} (${choice.count})` }))];
    if (chosen && chosen.label !== workspaceLabel) { workspaceLabel = chosen.label; persist(); }
    // A chosen project with no listed sessions stays chosen and says so, instead of quietly widening to all projects.
    if (filters.workspaceKey && !chosen) wanted.push({ value: filters.workspaceKey, text: `${workspaceLabel || 'Saved project'} (not in the current list)` });
    syncOptions(workspace, wanted);
    if (workspace.value !== filters.workspaceKey) workspace.value = filters.workspaceKey;
  }

  function paint() {
    const sessions = listed();
    const exampleOverLive = Boolean(api) && example;
    const nav = AgentViz.navigate(sessions, filters, state.selectedId);
    // Until the host has answered the current filters, the old list is only narrowed here and is labelled as a lookup.
    const waiting = Boolean(api) && answered !== seq;
    const lookup = (!waiting && state.lookup) || {};
    const total = Math.max(whole(lookup.total), sessions.length);
    const matched = Math.max(whole(lookup.matched), nav.matches.length);
    const pendingNames = whole(lookup.pendingNames);
    const pendingWorkspaces = whole(lookup.pendingWorkspaces);
    const none = !total;
    // The host lists only sessions that are running now unless told otherwise; the wording says which it is.
    const liveWord = lookup.live === true ? 'live ' : '';
    paintWorkspaces(sessions, total);

    const placeholder = waiting && !nav.matches.length ? 'Looking up sessions…'
      : none ? (liveWord ? 'No live sessions found' : 'No local sessions found')
      : !nav.matches.length ? (pendingNames || pendingWorkspaces ? 'No matches yet. Still reading sessions…' : 'No sessions match these filters')
      : exampleOverLive ? 'Example shown. Choose a session to follow it'
      : !nav.selected ? 'Choose a session'
      : nav.excluded ? 'Followed session is hidden by these filters'
      : '';
    const short = AgentViz.idLabels(sessions);
    const wanted = nav.matches.map(session => ({ value: session.id, text: AgentViz.sessionLabel(session, short.get(session.id)) }));
    if (placeholder) wanted.unshift({ value: '', text: placeholder });
    syncOptions(picker, wanted);
    // The picker shows the followed session only when it is really in the list. It never falls through to a neighbour.
    const pick = placeholder ? '' : state.selectedId;
    if (picker.value !== pick) picker.value = pick;
    picker.disabled = !nav.matches.length;
    clearButton.disabled = !nav.active;
    // The status line always says how much of the source the list covers: lookup, limit and unread parts included.
    const notes = [waiting ? 'Looking up sessions…'
      : none ? ''
      : !nav.matches.length ? `No sessions match${pendingNames || pendingWorkspaces ? ' yet' : ''}. Clear filters to see all ${total}.`
      : nav.active ? `${matched} of ${total} ${liveWord}sessions match.` : `${total} ${liveWord}sessions found.`];
    if (!waiting && matched > state.sessions.length && state.sessions.length) notes.push(`Showing the ${state.sessions.length} most recently written${nav.active ? ' matches' : ''}. Choose a project or narrow the search to reach older ones.`);
    if (pendingNames) notes.push(`Still reading saved names in ${pendingNames} sessions; more matches may appear.`);
    if (pendingWorkspaces) notes.push(`Still reading projects for ${pendingWorkspaces} sessions.`);
    setText(matches, notes.filter(Boolean).join(' '));

    // The identity bar always names what the activity below belongs to.
    const identity = exampleOverLive ? AgentViz.demoIdentity : nav.selected;
    if (shown !== (identity ? identity.sessionId : null)) { shown = identity ? identity.sessionId : null; setText(copyStatus, ''); }
    selection.hidden = !identity;
    if (identity) {
      setText(selectedWorkspace, identity.workspaceLabel);
      setText(selectedName, identity.name);
      setText(selectedId, identity.sessionId);
      setText(selectedProvider, `${identity.provider === 'claude' ? 'Claude Code' : 'Codex'}${identity.child ? ' · subagent' : ''}${example ? ' · synthetic example' : ''}`);
      const missing = !exampleOverLive && !waiting && lookup.missing === true;
      setText(selectionNote, missing ? 'No longer in the source folders (deleted or moved). Choose another session.'
        : !exampleOverLive && nav.excluded ? 'Hidden by the current filters. Still followed until you choose another session.' : '');
    }

    const now = Date.now();
    // A snapshot is drawn only under the session it was read from.
    const live = nav.selected && state.snapshot && state.snapshot.id === nav.selected.sessionId && state.snapshot.provider === nav.selected.provider ? state.snapshot : null;
    const session = example ? AgentViz.demoSession(now) : live;
    current = session;
    // The content is drawn again every second. A focused clickable item is found again by its data-open value, so
    // keyboard focus survives the redraw.
    const focused = document.activeElement && content.contains(document.activeElement) ? document.activeElement.getAttribute('data-open') : null;
    const html = AgentViz.render(session, { now, example, identity: identity || undefined, warnings: example ? [] : state.warnings });
    if (html !== drawn) {
      content.innerHTML = html;
      drawn = html;
      if (focused) content.querySelector(`button[data-open="${CSS.escape(focused)}"]`)?.focus();
    }
    exampleButton.textContent = example ? 'Return to live' : 'Show example';
    exampleButton.setAttribute('aria-pressed', String(example));
    setText(connection, example ? 'Example data only. Choose a session or return to live to follow real activity.' : !session && state.warnings.length ? state.warnings.join(' ') : '');
  }

  function changeFilters(next) {
    filters = { ...filters, ...next };
    seq++;
    persist();
    ask();
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
    const data = event.data;
    if (api && data?.type === 'detail') { showAnswer(data); return; }
    if (!api || data?.type !== 'state' || !Array.isArray(data.sessions)) return;
    // An answer to filters that have since changed is dropped whole, so an old list never appears under new filters.
    const answer = data.lookup && Number.isInteger(data.lookup.seq) ? data.lookup.seq : seq;
    if (answer !== seq) return;
    answered = seq;
    const selectedId = typeof data.selectedId === 'string' ? data.selectedId : '';
    state = { ...data, selectedId, sessions: data.sessions.map(entry).filter(Boolean), selected: entry(data.selected), snapshot: data.snapshot || null, warnings: Array.isArray(data.warnings) ? data.warnings : [] };
    const seen = (state.selected && state.selected.id === selectedId && state.selected) || state.sessions.find(session => session.id === selectedId);
    if (seen) remembered = seen;
    else if (remembered && remembered.id !== selectedId) remembered = null;
    paint();
  });
  workspace.addEventListener('change', () => {
    const key = workspace.value;
    const choice = projectChoices(listed()).find(candidate => candidate.key === key);
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
    remembered = listed().find(session => session.id === id) || null;
    state = { ...state, selectedId: id, selected: remembered, snapshot: null };
    if (!drawer.hidden) closeDrawer();
    persist();
    send({ type: 'select', id });
    paint();
  });
  copyButton.addEventListener('click', () => { void copyId(); });
  exampleButton.addEventListener('click', () => {
    example = !example;
    if (!drawer.hidden) closeDrawer();
    persist();
    paint();
  });
  element('refresh').addEventListener('click', () => { send({ type: 'refresh' }); paint(); });
  element('settings').addEventListener('click', () => send({ type: 'settings' }));

  // ---- Details on click ---------------------------------------------------------------------------------------
  // A click on a station, a bar, a recent row, a lane or a file opens the panel on the calls it stands for. A click
  // on one of those calls asks the host to read it from the transcript (src/detail.js). Everything shown here is
  // written as text, never as markup.
  const drawer = element('drawer');
  const drawerTitle = element('drawer-title');
  const drawerBody = element('drawer-body');
  const drawerBack = element('drawer-back');
  drawerTitle.tabIndex = -1;
  const LIST_ROWS = 300;
  let opener = null;
  let listSpec = null;
  let asking = 0;
  let wanted = null;
  const node = (tag, className, text) => { const made = document.createElement(tag); if (className) made.className = className; if (text !== undefined) made.textContent = text; return made; };
  const at = time => Number.isFinite(time) && time > 0 ? new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'not recorded';
  const span = ms => !Number.isFinite(ms) || ms < 0 ? '' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round(ms % 60000 / 1000)} s`;
  const count = value => Number.isFinite(value) ? value.toLocaleString() : null;
  const outcomeName = value => ({ success: 'Succeeded', error: 'Error', running: 'Running' })[value] || String(value || '');
  const kindName = { files: 'Files', edits: 'Edits', shell: 'Shell', network: 'Network', agents: 'Agents', memory: 'Memory', other: 'Other', prompt: 'Prompt', handoff: 'Task received', complete: 'Turn complete', paused: 'Turn paused', compaction: 'Compaction' };

  function openDrawer(title) {
    drawer.hidden = false;
    drawerTitle.textContent = title;
    drawerBody.replaceChildren();
    document.body.classList.add('drawer-open');
  }
  function closeDrawer() {
    drawer.hidden = true;
    // What was shown leaves the page with the panel: transcript text is never kept in a hidden part of the page.
    drawerBody.replaceChildren();
    drawerTitle.textContent = '';
    document.body.classList.remove('drawer-open');
    listSpec = null;
    wanted = null;
    const back = opener && content.querySelector(`button[data-open="${CSS.escape(opener)}"]`);
    if (back) back.focus();
  }

  function facts(rows) {
    const list = node('dl', 'detail-facts');
    for (const [key, value] of rows) {
      if (value === null || value === undefined || value === '') continue;
      list.append(node('dt', '', key), node('dd', '', String(value)));
    }
    return list;
  }
  function block(title, text, more) {
    const section = node('section', 'detail-block');
    section.append(node('h3', '', title));
    const pre = node('pre', 'detail-text', text);
    pre.tabIndex = 0;
    section.append(pre);
    if (more > 0) section.append(node('p', 'muted', `${more.toLocaleString()} more characters not shown.`));
    return section;
  }

  function showList(spec) {
    if (!current) return;
    const found = AgentViz.eventsFor(current, spec, Date.now());
    listSpec = spec;
    wanted = null;
    drawerBack.hidden = true;
    openDrawer(found.title);
    if (found.facts) drawerBody.append(node('p', 'detail-note', found.facts.join(' · ')));
    const total = found.events.length;
    drawerBody.append(node('p', 'muted', total ? `${total} ${total === 1 ? 'event' : 'events'}, newest first.${total > LIST_ROWS ? ` The newest ${LIST_ROWS} are listed.` : ''} Choose one for its full details.` : 'No recorded events here.'));
    const list = node('ol', 'detail-list');
    for (const item of found.events.slice(0, LIST_ROWS)) {
      const row = node('li');
      const button = node('button', `detail-row ${item.kind}`);
      button.type = 'button';
      button.append(node('span', 'event-dot' + (item.outcome === 'error' ? ' failed' : '')), node('span', 'event-label', item.label), node('span', 'event-outcome', item.outcome === 'error' ? 'Error' : item.outcome === 'running' ? 'Running' : ''), node('time', '', new Date(item.time).toLocaleTimeString()));
      button.addEventListener('click', () => showEvent(item));
      row.append(button);
      list.append(row);
    }
    drawerBody.append(list);
    drawerTitle.focus();
  }

  function showEvent(item) {
    drawerBack.hidden = !listSpec;
    openDrawer(item.label);
    drawerBody.append(facts([['Kind', kindName[item.kind] || item.kind], ['Lane', item.laneName], ['Time', at(item.time)], ['Outcome', outcomeName(item.outcome)]]));
    drawerTitle.focus();
    if (example || !api) { drawerBody.append(node('p', 'muted', 'Example data: there is no transcript behind it, so there is nothing more to read.')); return; }
    const status = node('p', 'muted', 'Reading the transcript…');
    status.setAttribute('role', 'status');
    drawerBody.append(status);
    wanted = { requestId: ++asking, item };
    send({ type: 'detail', requestId: asking, lane: item.lane || 'main', id: item.id });
  }

  function showAnswer(data) {
    if (!wanted || data.requestId !== wanted.requestId || drawer.hidden) return;
    const item = wanted.item;
    const detail = data.detail && typeof data.detail === 'object' ? data.detail : { ok: false, reason: 'unknown' };
    wanted = null;
    drawerBody.replaceChildren();
    const word = { 'not-found': 'This event is no longer in the followed transcript. Press Refresh and try again.', 'source-unavailable': 'The transcript could not be read.', 'invalid-argument': 'This event cannot be looked up.' };
    if (!detail.ok) { drawerBody.append(facts([['Kind', kindName[item.kind] || item.kind], ['Lane', item.laneName], ['Time', at(item.time)]]), node('p', 'notice', word[detail.reason] || 'The details could not be read.')); return; }
    const text = value => typeof value === 'string' ? value : '';
    const started = Number.isFinite(detail.time) ? detail.time : item.time;
    const finished = Number.isFinite(detail.finished) ? detail.finished : null;
    drawerBody.append(facts([
      ['Tool', text(detail.tool)], ['Kind', kindName[item.kind] || item.kind], ['Lane', item.laneName],
      ['Outcome', detail.failed ? 'Error' : outcomeName(item.outcome)], ['Started', at(started)],
      ['Finished', finished ? at(finished) : ''], ['Took', finished ? span(finished - started) : ''], ['Model', text(detail.model)],
      ['Provider', detail.provider === 'claude' ? 'Claude Code' : detail.provider === 'codex' ? 'Codex' : ''], ['Call ID', text(detail.id)]
    ]));
    for (const note of Array.isArray(detail.notes) ? detail.notes : []) if (typeof note === 'string') drawerBody.append(node('p', 'detail-note', note));
    if (text(detail.input)) drawerBody.append(block('Input', detail.input, detail.inputMore));
    if (text(detail.output)) drawerBody.append(block(detail.failed ? 'Output (error)' : 'Output', detail.output, detail.outputMore));
    const tokens = detail.tokens && typeof detail.tokens === 'object' ? detail.tokens : null;
    if (tokens) {
      const section = node('section', 'detail-block');
      section.append(node('h3', '', 'Tokens'));
      section.append(facts([['Input', count(tokens.input)], ['Cached input read', count(tokens.cacheRead)], ['Cache written', count(tokens.cacheWrite)], ['Output', count(tokens.output)],
        ['Reasoning', count(tokens.reasoning)], ['Context in use', count(tokens.context)], ['Context window', count(tokens.window)], ['Session total', count(tokens.sessionTotal)]]));
      section.append(node('p', 'muted', detail.provider === 'claude' ? 'From the model call that made this tool call.' : 'From the token report nearest this event in its turn.'));
      drawerBody.append(section);
    }
    if (detail.prompt && text(detail.prompt.text)) drawerBody.append(block(`Prompt that started this turn${Number.isFinite(detail.prompt.time) ? ` · ${at(detail.prompt.time)}` : ''}`, detail.prompt.text, detail.prompt.more));
    const messages = Array.isArray(detail.messages) ? detail.messages.filter(message => message && typeof message.text === 'string') : [];
    if (messages.length) {
      const section = node('section', 'detail-block');
      section.append(node('h3', '', 'Agent messages in this turn'));
      for (const message of messages) {
        section.append(node('p', 'detail-when', `${message.when === 'before' ? 'Before' : 'After'} this event${Number.isFinite(message.time) ? ` · ${at(message.time)}` : ''}`));
        const pre = node('pre', 'detail-text', message.text);
        pre.tabIndex = 0;
        section.append(pre);
        if (message.more > 0) section.append(node('p', 'muted', `${message.more.toLocaleString()} more characters not shown.`));
      }
      if (detail.messagesMore > 0) section.append(node('p', 'muted', `${detail.messagesMore} more messages in this turn are not shown.`));
      drawerBody.append(section);
    }
  }

  content.addEventListener('click', event => {
    const target = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-open]') : null;
    if (!target || !content.contains(target)) return;
    opener = target.getAttribute('data-open');
    showList(opener);
  });
  element('drawer-close').addEventListener('click', closeDrawer);
  drawerBack.addEventListener('click', () => { if (listSpec) showList(listSpec); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !drawer.hidden && event.target?.tagName !== 'INPUT') { event.preventDefault(); closeDrawer(); } });
  paint();
  send({ type: 'ready', query: request() });
})();
