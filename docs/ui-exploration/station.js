/* Standalone synthetic prototype. No transcript reads, network calls or storage. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const categories = [
    { id: 'files', name: 'Files', letter: 'F', color: '#9ce3c3', x: 270, y: 235, description: 'Reads, searches and source discovery. Follow a file to see every recorded interaction.', icon: 'M-16-69H5L16-58V-30H-16ZM5-69V-57H16M-9-48H8M-9-40H5' },
    { id: 'edits', name: 'Edits', letter: 'E', color: '#9fbafa', x: 500, y: 140, description: 'Patches and writes. Open a call to compare its requested change with the resulting diff.', icon: 'M-16-35L-12-47L9-68L20-57L-1-36ZM-12-47L-1-36M-16-35L-5-38' },
    { id: 'shell', name: 'Shell', letter: 'S', color: '#f0c48b', x: 730, y: 235, description: 'Commands, tests and builds. Inspect exit codes, sample output and recorded failures.', icon: 'M-22-67H22V-32H-22ZM-13-58L-5-50L-13-42M2-42H13' },
    { id: 'network', name: 'Network', letter: 'N', color: '#8cd9ec', x: 730, y: 440, description: 'API requests and responses. Inspect methods, response codes, timings and sample JSON.', icon: 'M-22-50H22M0-73V-27M-15-65Q0-56 15-65M-15-35Q0-44 15-35M0-73Q-20-50 0-27Q20-50 0-73' },
    { id: 'agents', name: 'Agents', letter: 'A', color: '#cbb2f0', x: 500, y: 535, description: 'Delegation and handoffs. Read the requested task and the returned result, not hidden reasoning.', icon: 'M0-61V-47M-19-35V-47H19V-35M-6-73H6V-61H-6ZM-25-35H-13V-23H-25ZM13-35H25V-23H13Z' },
    { id: 'memory', name: 'Memory', letter: 'M', color: '#e3c5ab', x: 270, y: 440, description: 'Plan and note updates. Inspect the structured state the agent recorded as the work progressed.', icon: 'M-20-68H20V-28H-20ZM-12-58H-7M0-58H12M-12-48H-7M0-48H12M-12-38H-7M0-38H12' }
  ];
  const byKind = Object.fromEntries(categories.map(c => [c.id, c]));
  const sample = (kind, tool, resource, title, duration, input, output, error = false) => ({ kind, tool, resource, title, duration, input, output, error });
  const templates = [
    sample('files', 'read_file', 'src/view.js', 'Read view renderer', 86, { path: 'src/view.js', lines: [1, 36] }, 'export function renderStation(station) {\n  return { label: station.name, count: station.calls.length };\n}\n\n// Synthetic source excerpt.'),
    sample('files', 'search_files', 'src/sessions.js', 'Locate session selection', 124, { query: 'selectedSession', scope: 'src/' }, { matches: [{ file: 'src/sessions.js', line: 42, label: 'selectedSession' }], total: 1 }),
    sample('files', 'read_file', 'test/view.test.js', 'Read renderer tests', 71, { path: 'test/view.test.js' }, "test('empty station has zero calls', () => {\n  assert.equal(renderStation({ calls: [] }).count, 0);\n});"),
    sample('memory', 'update_plan', 'Implementation plan', 'Record the working plan', 24, { steps: ['Inspect renderer', 'Add station selection', 'Check empty and error states'] }, { active: 'Inspect renderer', completed: [], remaining: 3 }),
    sample('agents', 'spawn_agent', 'Renderer review', 'Delegate a renderer review', 640, { task: 'Review station keyboard navigation', scope: ['src/view.js', 'test/view.test.js'] }, { agent: 'reviewer-demo', status: 'accepted', taskId: 'review-01' }),
    sample('edits', 'apply_patch', 'src/view.js', 'Add station selection', 178, { file: 'src/view.js', change: 'Expose selected state in the view model' }, '- return { label: station.name, count: station.calls.length };\n+ return { label: station.name, count: station.calls.length, selected: station.id === selectedId };'),
    sample('shell', 'exec_command', 'Renderer tests', 'Run renderer tests', 1420, { command: 'node --test test/view.test.js', cwd: 'example-project' }, { exitCode: 0, stdout: 'tests 6\npass 6\nfail 0', stderr: '' }),
    sample('network', 'http_request', 'GET /sessions', 'Fetch sample session list', 228, { method: 'GET', url: 'https://api.example.invalid/sessions', headers: { Accept: 'application/json' } }, { status: 200, body: { sessions: [{ id: 'demo-01', provider: 'codex', state: 'active' }] } }),
    sample('network', 'http_request', 'GET /activity', 'API rate limit', 312, { method: 'GET', url: 'https://api.example.invalid/activity?session=demo-01' }, { status: 429, headers: { 'Retry-After': '3' }, body: { error: 'rate_limit', message: 'Synthetic rate-limit example. Retry after 3 seconds.' } }, true),
    sample('edits', 'apply_patch', 'test/view.test.js', 'Cover keyboard selection', 159, { file: 'test/view.test.js', change: 'Add Enter and Space interaction tests' }, '+ test("Enter selects the focused station", selectWithEnter);\n+ test("Space selects the focused station", selectWithSpace);'),
    sample('shell', 'exec_command', 'Renderer tests', 'Empty-state test failed', 1328, { command: 'node --test test/view.test.js', cwd: 'example-project' }, { exitCode: 1, stdout: 'tests 8\npass 7\nfail 1', stderr: 'AssertionError: expected 0, received undefined\n  at emptyStation (test/view.test.js:28:10)' }, true),
    sample('agents', 'agent_result', 'Renderer review', 'Reviewer returned findings', 3810, { taskId: 'review-01', agent: 'reviewer-demo' }, { status: 'complete', findings: ['Station focus needs a visible outline', 'Empty call counts must default to zero'], filesReviewed: 2 }),
    sample('edits', 'apply_patch', 'src/view.js', 'Handle empty call counts', 133, { file: 'src/view.js', change: 'Provide an empty calls list when absent' }, '- const count = station.calls?.length;\n+ const count = (station.calls ?? []).length;'),
    sample('network', 'http_request', 'GET /activity', 'Read sample activity', 184, { method: 'GET', url: 'https://api.example.invalid/activity?session=demo-01' }, { status: 200, body: { events: [{ kind: 'files', label: 'Reading src/view.js', outcome: 'success' }], nextCursor: null } }),
    sample('memory', 'update_plan', 'Implementation plan', 'Record verification progress', 21, { complete: ['Inspect renderer', 'Add station selection'], active: 'Check empty and error states' }, { completed: 2, remaining: 1, note: 'Keep error evidence visible after later successful calls.' }),
    sample('files', 'read_file', 'README.md', 'Read usage guidance', 44, { path: 'README.md', section: 'Reading the view' }, 'Recent activity means transcript records were observed.\nQuiet is not a process health check.\nContext usage is not task completion.'),
    sample('shell', 'exec_command', 'Build check', 'Check JavaScript syntax', 420, { command: 'node --check src/view.js', cwd: 'example-project' }, { exitCode: 0, stdout: '', stderr: '' }),
    sample('memory', 'write_note', 'Review notes', 'Save a design decision', 32, { topic: 'Station interactions', note: 'Keep category controls available outside the map.' }, { saved: true, note: 'Keyboard and compact layouts use the same station selection state.' })
  ];
  const sequence = [0,1,2,3,0,7,4,1,5,0,9,6,7,5,2,3,0,8,11,12,9,6,13,0,14,5,7,1,9,2,10,12,0,6,13,11,15,16,14,17,6,0];
  const events = sequence.map((index, n) => ({ ...templates[index], id: `call-${String(n + 1).padStart(3, '0')}`, ordinal: n + 1, time: `14:${String(10 + Math.floor(n / 3)).padStart(2, '0')}:${String(n % 3 * 20).padStart(2, '0')}` }));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { position: 12, station: null, resource: null, errors: false, playing: !reduced.matches, speed: 1, motion: !reduced.matches, detail: null };
  let timer;
  const svgNS = 'http://www.w3.org/2000/svg';
  const loaded = () => events.slice(0, state.position);
  const selected = () => loaded().filter(e => (!state.station || e.kind === state.station) && (!state.resource || e.resource === state.resource) && (!state.errors || e.error));
  const seconds = ms => `${(ms / 1000).toFixed(1)}s`;
  const showPayload = value => typeof value === 'string' ? value || '(empty)' : JSON.stringify(value, null, 2);
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function chooseStation(id) {
    state.station = id; state.resource = null; state.errors = false;
    render();
  }
  function buildMap() {
    for (const c of categories) {
      const line = document.createElementNS(svgNS, 'path');
      line.id = `line-${c.id}`; line.setAttribute('d', `M500 325L${c.x} ${c.y}`);
      line.style.setProperty('--station-color', c.color); $('connections').append(line);
      const station = document.createElementNS(svgNS, 'g');
      station.id = `station-${c.id}`; station.setAttribute('class', 'station');
      station.setAttribute('transform', `translate(${c.x} ${c.y})`);
      station.setAttribute('role', 'button'); station.setAttribute('tabindex', '0');
      station.style.setProperty('--station-color', c.color);
      // Geometry and labels here are fixed prototype constants, never transcript content.
      station.innerHTML = `<ellipse cy="22" rx="82" ry="36" fill="#0004"/>
        <g class="iso-shape"><path class="selection-ring" d="M-90 0L0-52L90 0L0 52Z"/>
        <path class="side" d="M-76 0L0-44L76 0V20L0 64L-76 20Z"/><path class="platform" d="M-76 0L0-44L76 0L0 44Z"/>
        <path class="front" d="M-43-30L0-55L43-30V1L0 26L-43 1Z"/><path class="roof" d="M-43-30L0-55L43-30L0-5Z"/>
        <path d="M0-5V26M-30-15V-3M-20-9V3M20-9V3M30-15V-3" stroke="${c.color}" stroke-opacity=".5"/></g>
        <g class="flat-shape"><rect class="platform" x="-66" y="-65" width="132" height="110" rx="16"/><rect class="selection-ring" x="-73" y="-72" width="146" height="124" rx="20"/></g>
        <path class="icon" d="${c.icon}" transform="translate(0 -22)"/>
        <circle class="beacon" cx="0" cy="-106" r="4"/><text class="station-count" y="5">0</text>
        <text class="station-label" y="85">${c.name.toUpperCase()}</text><text class="station-status" y="104">No calls yet</text><text class="error-badge" x="68" y="-29"></text>`;
      station.addEventListener('click', () => chooseStation(c.id));
      station.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chooseStation(c.id); } });
      $('stations').append(station);
      const button = element('button', 'station-button'); button.dataset.station = c.id;
      button.style.setProperty('--station-color', c.color); button.append(element('span', '', c.name), element('strong', '', '0'));
      button.addEventListener('click', () => chooseStation(c.id)); $('station-list').append(button);
    }
  }
  function render() {
    const all = loaded(), last = all.at(-1), calls = selected();
    document.body.classList.toggle('playing', state.playing);
    document.body.classList.toggle('signals-on', state.motion);
    $('play').textContent = state.playing ? 'Pause' : state.position === events.length ? 'Replay' : 'Play';
    $('position').value = state.position; $('position').max = events.length;
    $('position-label').textContent = `${last?.time || '14:10:00'} · ${state.position}/${events.length}`;
    $('playback-state').textContent = state.playing ? 'Playing example' : state.position === events.length ? 'Example ended' : 'Paused';
    $('motion').checked = state.motion; $('only-errors').checked = state.errors;
    $('total').textContent = all.length; $('hub-count').textContent = all.length;
    $('errors').textContent = `${all.filter(e => e.error).length} errors ↗`;
    $('resource-total').textContent = new Set(all.map(e => e.resource)).size;
    $('context').textContent = state.position >= 36 ? 'Reported context: 66% (sample)' : 'Context not yet reported';
    for (const c of categories) {
      const stationCalls = all.filter(e => e.kind === c.id), errors = stationCalls.filter(e => e.error).length;
      const station = $(`station-${c.id}`), current = last?.kind === c.id;
      station.classList.toggle('latest', current); station.classList.toggle('selected', state.station === c.id);
      station.setAttribute('aria-pressed', String(state.station === c.id));
      station.setAttribute('aria-label', `${c.name}: ${stationCalls.length} calls, ${errors} errors. Inspect station.`);
      station.querySelector('.station-count').textContent = stationCalls.length;
      station.querySelector('.station-status').textContent = current ? 'LATEST EVENT' : stationCalls.length ? `${errors} errors recorded` : 'No calls yet';
      station.querySelector('.error-badge').textContent = errors ? `! ${errors}` : '';
      $(`line-${c.id}`).setAttribute('class', `connection${current ? ' latest' : ''}${state.station === c.id ? ' selected' : ''}`);
      const button = document.querySelector(`[data-station="${c.id}"]`);
      button.setAttribute('aria-pressed', String(state.station === c.id)); button.querySelector('strong').textContent = stationCalls.length;
    }
    const category = byKind[state.station];
    $('world-title').textContent = category ? `${category.name} station` : 'The whole session';
    $('inspector-kicker').textContent = state.resource ? `${category?.name || 'Session'} / Resource` : category ? 'Station detail' : 'Session overview';
    $('inspector-title').textContent = state.resource || category?.name || 'Follow a signal.';
    $('inspector-description').textContent = category?.description || 'All stations, one session. Select a resource or open an event below.';
    $('selection-count').textContent = calls.length; $('selection-errors').textContent = calls.filter(e => e.error).length;
    $('selection-duration').textContent = seconds(calls.reduce((sum, e) => sum + e.duration, 0));
    $('clear-resource').hidden = !state.resource;
    $('filter-description').textContent = `${state.resource || category?.name || 'All stations'}${state.errors ? ' · errors only' : ''} · newest first`;
    const resources = new Map();
    for (const e of all.filter(e => !state.station || e.kind === state.station)) resources.set(e.resource, [...(resources.get(e.resource) || []), e]);
    const resourceNodes = [...resources].map(([name, rows]) => {
      const button = element('button', 'resource'); button.dataset.resource = name; button.setAttribute('aria-pressed', String(state.resource === name));
      button.append(element('span', '', name), element('small', '', `${rows.length} calls · ${rows.filter(e => e.error).length} errors ↗`));
      button.addEventListener('click', () => {
        pause(); state.resource = name; render();
        [...$('resources').children].find(node => node.dataset.resource === name)?.focus();
      }); return button;
    });
    $('resources').replaceChildren(...(resourceNodes.length ? resourceNodes : [element('p', 'empty', 'No resources recorded yet. Advance the timeline.')]));
    const eventNodes = [...calls].reverse().map(e => {
      const c = byKind[e.kind], button = element('button', `event${e.error ? ' failed' : ''}`); button.dataset.event = e.id;
      button.style.setProperty('--station-color', c.color);
      const label = element('span'); label.append(element('b', '', e.title), element('small', '', `${e.time} · ${e.error ? 'Error' : 'Success'} · ${seconds(e.duration)}`));
      button.append(element('span', 'event-icon', e.error ? '!' : c.letter), label, element('span', '', '↗'));
      button.addEventListener('click', () => openEvent(e.id)); return button;
    });
    $('events').replaceChildren(...(eventNodes.length ? eventNodes : [element('p', 'empty', 'No calls match this view. Change station, clear the resource or turn off Errors only.')]));
    $('trail').replaceChildren(...events.map(e => {
      const button = element('button', `${e.ordinal > state.position ? 'future' : ''}${e.error ? ' failed' : ''}${e.ordinal === state.position ? ' current' : ''}`, e.error ? '!' : byKind[e.kind].letter);
      button.style.setProperty('--station-color', byKind[e.kind].color); button.disabled = e.ordinal > state.position;
      button.setAttribute('aria-label', `${e.id}: ${e.title}${e.ordinal > state.position ? ', not yet recorded' : ''}`);
      button.title = `${e.time} · ${e.title}`; button.addEventListener('click', () => openEvent(e.id)); return button;
    }));
  }
  function pulse(e) {
    $('signals').replaceChildren();
    if (!e || !state.motion || reduced.matches) return;
    const c = byKind[e.kind];
    for (const [radius, delay] of [[5, 0], [3, 140], [2, 280]]) {
      const dot = document.createElementNS(svgNS, 'circle'); dot.setAttribute('r', radius); dot.setAttribute('fill', e.error ? '#ffac94' : c.color);
      dot.style.opacity = '0'; $('signals').append(dot);
      const animation = dot.animate([{ transform: 'translate(500px,325px)', opacity: 0 }, { opacity: 1, offset: .15 }, { transform: `translate(${c.x}px,${c.y}px)`, opacity: 0 }], { duration: 1100 / state.speed, delay: delay / state.speed, fill: 'forwards' });
      animation.onfinish = () => dot.remove();
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!state.playing) return;
    timer = setTimeout(() => {
      state.position = Math.min(events.length, state.position + 1);
      if (state.position === events.length) state.playing = false;
      render(); pulse(events[state.position - 1]); schedule();
    }, 1800 / state.speed);
  }
  function pause() { state.playing = false; clearTimeout(timer); $('signals').replaceChildren(); }
  function pauseForInspection() {
    pause(); document.body.classList.remove('playing');
    $('play').textContent = state.position === events.length ? 'Replay' : 'Play'; $('playback-state').textContent = 'Paused';
  }
  function paintDetail() {
    const e = events.find(e => e.id === state.detail), c = byKind[e.kind];
    $('detail-category').textContent = `${c.name} / ${e.tool} / ${e.id}`; $('detail-title').textContent = e.title;
    $('detail-summary').textContent = `${e.resource} · ${e.error ? 'A failure was recorded. Inspect the response below.' : 'A successful result was recorded.'}`;
    $('detail-meta').replaceChildren(...Object.entries({ Status: e.error ? 'Error' : 'Success', Time: e.time, Duration: seconds(e.duration), Resource: e.resource }).map(([label, value]) => {
      const item = element('div'); item.append(element('dt', '', label), element('dd', '', value)); return item;
    }));
    $('detail-input').textContent = showPayload(e.input); $('detail-output').textContent = showPayload(e.output); $('detail-caution').hidden = !e.error;
    const rows = selected(), index = rows.findIndex(row => row.id === e.id);
    $('previous-event').disabled = index <= 0; $('next-event').disabled = index < 0 || index >= rows.length - 1;
  }
  function openEvent(id) {
    if (!loaded().some(e => e.id === id)) return;
    pauseForInspection(); state.detail = id;
    // Preserve the originating button while the dialog is open so Escape can return focus.
    paintDetail(); if (!$('event-dialog').open) $('event-dialog').showModal();
  }
  $('play').addEventListener('click', () => {
    if (state.playing) pause(); else { if (state.position === events.length) state.position = 0; state.playing = true; }
    render(); schedule();
  });
  $('restart').addEventListener('click', () => { state.position = 0; state.station = null; state.resource = null; state.errors = false; state.playing = true; render(); schedule(); });
  $('speed').addEventListener('change', e => { state.speed = Number(e.target.value); schedule(); });
  $('position').addEventListener('input', e => { pause(); state.position = Math.min(events.length, Math.max(0, Number(e.target.value))); render(); });
  $('motion').addEventListener('change', e => { state.motion = e.target.checked; if (!state.motion) $('signals').replaceChildren(); render(); });
  $('view').addEventListener('change', e => document.body.classList.toggle('flat-view', e.target.value === 'flat'));
  $('reset-view').addEventListener('click', () => chooseStation(null));
  $('home').addEventListener('click', e => { e.preventDefault(); chooseStation(null); });
  $('errors').addEventListener('click', () => { pause(); state.station = null; state.resource = null; state.errors = true; render(); });
  $('only-errors').addEventListener('change', e => { pause(); state.errors = e.target.checked; render(); });
  $('clear-resource').addEventListener('click', () => { state.resource = null; render(); });
  $('close-detail').addEventListener('click', () => $('event-dialog').close());
  $('event-dialog').addEventListener('close', () => { state.detail = null; });
  for (const [id, delta] of [['previous-event', -1], ['next-event', 1]]) $(id).addEventListener('click', () => {
    const rows = selected(), next = rows[rows.findIndex(e => e.id === state.detail) + delta];
    if (next) { state.detail = next.id; paintDetail(); }
  });
  $('related-resource').addEventListener('click', () => {
    const e = events.find(e => e.id === state.detail); $('event-dialog').close(); state.station = e.kind; state.resource = e.resource; state.errors = false; render(); $('clear-resource').focus();
  });
  function applyMotionPreference() {
    if (reduced.matches) { state.motion = false; pause(); }
    $('motion').disabled = reduced.matches;
    $('motion-note').textContent = reduced.matches ? 'Reduced motion: signals disabled; playback starts paused.' : '';
    render();
  }
  reduced.addEventListener('change', applyMotionPreference);
  document.querySelector('.inspector').addEventListener('focusin', pauseForInspection);
  $('trail').addEventListener('focusin', pauseForInspection);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); render(); } });
  buildMap(); applyMotionPreference(); schedule();
})();
