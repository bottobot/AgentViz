(function () {
  'use strict';
  const api = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const picker = document.getElementById('session');
  const content = document.getElementById('content');
  const connection = document.getElementById('connection');
  const exampleButton = document.getElementById('example');
  let example = api ? api.getState()?.example === true : true;
  let state = { sessions: [], selectedId: '', snapshot: null, warnings: [] };
  let catalogKey = '';
  const send = message => { if (api) api.postMessage(message); };

  function paint() {
    const key = JSON.stringify(state.sessions);
    if (key !== catalogKey) {
      catalogKey = key;
      picker.replaceChildren();
      if (!state.sessions.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = api ? 'No local sessions found' : 'Synthetic example';
        picker.append(option);
      }
      for (const session of state.sessions) {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = `${session.project || 'Session'} · ${session.provider === 'claude' ? 'Claude' : 'Codex'}${session.child ? ' child' : ''} · ${session.sessionId.slice(0, 8)} · ${new Date(session.modified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        picker.append(option);
      }
    }
    picker.value = state.selectedId || '';
    picker.disabled = !state.sessions.length;
    const now = Date.now();
    const session = example ? AgentViz.demoSession(now) : state.snapshot;
    content.innerHTML = AgentViz.render(session, { now, example, warnings: example ? [] : state.warnings });
    exampleButton.textContent = example ? 'Return to live' : 'Show example';
    exampleButton.setAttribute('aria-pressed', String(example));
    connection.textContent = example ? 'Example data only. Choose a session or return to live to follow real activity.' : !session && state.warnings.length ? state.warnings.join(' ') : '';
  }

  window.addEventListener('message', event => {
    if (!api || event.data?.type !== 'state' || !Array.isArray(event.data.sessions)) return;
    state = event.data;
    paint();
  });
  picker.addEventListener('change', () => {
    const id = picker.value;
    example = false;
    state = { ...state, selectedId: id, snapshot: null };
    api?.setState({ example });
    send({ type: 'select', id });
    paint();
  });
  exampleButton.addEventListener('click', () => {
    example = !example;
    api?.setState({ example });
    paint();
  });
  document.getElementById('refresh').addEventListener('click', () => { send({ type: 'refresh' }); paint(); });
  paint();
  send({ type: 'ready' });
})();
