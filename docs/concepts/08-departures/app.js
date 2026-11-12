/* AgentViz concept 08: Departures Hall.
 * Every tool call is a flight. Split-flap boards list departures and arrivals; a route map flies each data hop
 * between airports (files, Context, Terminal, Plan tower, Web hosts, subagent airfields). Data: ../shared/sim.js.
 */
(function () {
  'use strict';
  const sim = AgentVizSim.create({ seed: 7, history: 30 });
  const S = sim.state;
  const REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NS = 'http://www.w3.org/2000/svg';
  const $ = sel => document.querySelector(sel);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const hhmm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const hms = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const fmtK = n => n >= 10000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));
  const fmtDur = ms => ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`;
  const ago = ms => ms < 1500 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)}s ago` : `${Math.round(ms / 60000)}m ago`;
  const n1 = v => (Math.round(v * 10) / 10).toString();

  // ---------- airlines: one per kind of work ----------
  const AIR = {
    files: { code: 'RD', name: 'Read Air', gate: 'A', color: '#4fa8ff', glyph: 'jet', run: 'IN FLIGHT', how: 'Jets fly file text from a Disk airport via the RD beacon to the Context apron. A Grep or Glob launches a formation, one plane from every matching file.' },
    edits: { code: 'ED', name: 'Edit Cargo', gate: 'B', color: '#e276cc', glyph: 'cargo', run: 'IN FLIGHT', how: 'Wide freighters carry replacement text out of Context and unload it on a file airport, stamping +added −removed. A failed edit diverts to a NOTAM beside the file.' },
    shell: { code: 'SH', name: 'Shell Express', gate: 'C', color: '#38d1c4', glyph: 'turbo', run: 'ETA', how: 'Turboprops hold over the Terminal while the command runs; the board counts down to the expected landing and the exit code is stamped on arrival.' },
    network: { code: 'NW', name: 'Network Intl', gate: 'I', color: '#9d8cff', glyph: 'jumbo', run: 'INTL', how: 'International jumbos clear customs at the dateline, cross the ocean to a Web host, and fly the page summary home as the heaviest payload of the day.' },
    agents: { code: 'AG', name: 'Agents Charter', gate: 'K', color: '#cdb487', glyph: 'bizjet', run: 'CHARTER', how: 'Charter jets fly a brief to a satellite airfield that opens for the subagent, and fly its final report home when the airfield closes.' },
    memory: { code: 'MM', name: 'Memory Shuttle', gate: 'T', color: '#bfe3ee', glyph: 'heli', run: 'SHUTTLE', how: 'Helicopter shuttles hop from Context to the Plan tower; the day\'s schedule changes on landing.' },
    other: { code: 'OT', name: 'Other Regional', gate: 'G', color: '#a59f97', glyph: 'prop', run: 'IN FLIGHT', how: 'Small props fetch from MCP servers and other tools, landing their result in Context.' }
  };
  const KINDS = sim.kinds;
  const TOOL_SHORT = { Read: 'READ', Grep: 'GREP', Glob: 'GLOB', Edit: 'EDIT', Write: 'WRITE', MultiEdit: 'MEDIT', Bash: 'BASH', WebFetch: 'FETCH', WebSearch: 'SRCH', Task: 'TASK', TodoWrite: 'TODO', TaskUpdate: 'TUPD', mcp__github__get_issue: 'MCP', NotebookEdit: 'NBED' };
  const GLYPH = {
    jet: 'M10 0L6 -1.4L1 -1.4L-4 -8L-6.5 -8L-3 -1.4L-7 -1.4L-9 -4.5L-10.5 -4.5L-9.5 0L-10.5 4.5L-9 4.5L-7 1.4L-3 1.4L-6.5 8L-4 8L1 1.4L6 1.4Z',
    cargo: 'M10.5 0L7.5 -2.6L1 -2.6L-3 -9L-6 -9L-3.6 -2.6L-7 -2.6L-9 -5.6L-11 -5.6L-10 0L-11 5.6L-9 5.6L-7 2.6L-3.6 2.6L-6 9L-3 9L1 2.6L7.5 2.6Z',
    turbo: 'M9 0L6.5 -1.5L1.5 -1.5L1.5 -9.5L-1.5 -9.5L-1.5 -1.5L-7 -1.3L-8.5 -4L-10 -4L-9.5 0L-10 4L-8.5 4L-7 1.3L-1.5 1.5L-1.5 9.5L1.5 9.5L1.5 1.5L6.5 1.5Z M2.2 -6.5H4.4V-5H2.2Z M2.2 5H4.4V6.5H2.2Z',
    jumbo: 'M13 0L9 -2.2L2 -2.2L-5 -12L-8.5 -12L-4.5 -2.2L-9 -2.2L-11.5 -6.5L-13.5 -6.5L-12 0L-13.5 6.5L-11.5 6.5L-9 2.2L-4.5 2.2L-8.5 12L-5 12L2 2.2L9 2.2Z M-1 -6.2H2.4V-4.8H-1Z M-3.5 -9.4H-0.1V-8H-3.5Z M-1 4.8H2.4V6.2H-1Z M-3.5 8H-0.1V9.4H-3.5Z',
    bizjet: 'M10 0L6.5 -1.2L-1 -1.2L-2.5 -6.5L-4.5 -6.5L-4 -1.2L-8.5 -1.2L-10.5 -5L-12 -5L-11 0L-12 5L-10.5 5L-8.5 1.2L-4 1.2L-4.5 6.5L-2.5 6.5L-1 1.2L6.5 1.2Z M-7 -2.6H-4.5V-1.2H-7Z M-7 1.2H-4.5V2.6H-7Z',
    heli: 'M6.5 0L4 -2.4L-1.5 -2.4L-3 -0.8L-10 -0.6L-11 -2.6L-12 -2.6L-11.6 0L-12 2.6L-11 2.6L-10 0.6L-3 0.8L-1.5 2.4L4 2.4Z',
    prop: 'M8 0L5 -1.2L0.8 -1.2L0.8 -7.5L-1.2 -7.5L-1.2 -1.2L-6 -1L-7 -3L-8 -3L-7.6 0L-8 3L-7 3L-6 1L-1.2 1.2L-1.2 7.5L0.8 7.5L0.8 1.2L5 1.2Z M8.6 -3.6H9.6V3.6H8.6Z'
  };
  function logo(kind, size = 16) {
    const d = '#101010';
    const marks = {
      files: `<circle cx="8" cy="8" r="4" fill="none" stroke="${d}" stroke-width="2.2"/>`,
      edits: `<path d="M8 2.5L13.5 8L8 13.5L2.5 8Z" fill="${d}"/>`,
      shell: `<path d="M3.5 4.5L7.5 8L3.5 11.5" fill="none" stroke="${d}" stroke-width="2"/><rect x="8.5" y="10.5" width="4.5" height="2" fill="${d}"/>`,
      network: `<circle cx="8" cy="8" r="5" fill="none" stroke="${d}" stroke-width="1.5"/><ellipse cx="8" cy="8" rx="2.2" ry="5" fill="none" stroke="${d}" stroke-width="1.3"/><path d="M3 8H13" stroke="${d}" stroke-width="1.3"/>`,
      agents: `<path d="M8 2.2L9.6 6.2L13.8 6.4L10.5 9L11.7 13.2L8 10.8L4.3 13.2L5.5 9L2.2 6.4L6.4 6.2Z" fill="${d}"/>`,
      memory: `<path d="M6 14L6.8 7H9.2L10 14Z M5 3.5H11V6.5H5Z" fill="${d}"/>`,
      other: `<path d="M8 2.5L12.8 5.25V10.75L8 13.5L3.2 10.75V5.25Z" fill="none" stroke="${d}" stroke-width="1.8"/>`
    };
    return `<svg class="logo" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true"><rect width="16" height="16" rx="2.5" fill="${AIR[kind].color}"/>${marks[kind]}</svg>`;
  }
  const flightNo = c => AIR[c.kind].code + pad(c.seq % 10000, 4);
  const gateOf = c => AIR[c.kind].gate + ((c.seq % 19) + 1);

  // ---------- airports: codes, names, positions ----------
  const CODES = {
    'file:src/extension.js': 'EXT', 'file:src/transcript.js': 'TRN', 'file:src/sessions.js': 'SES', 'file:src/webview.js': 'WBV',
    'file:media/view.js': 'VEW', 'file:media/app.js': 'APP', 'file:media/style.css': 'CSS', 'file:test/view.test.js': 'VWT',
    'file:test/transcript.test.js': 'TRT', 'file:test/sessions.test.js': 'SST', 'file:package.json': 'PKG', 'file:README.md': 'RDM',
    'file:docs/ui-exploration/PLAN.md': 'PLA', model: 'MDL', context: 'CTX', terminal: 'TRM', plan: 'PLN', answer: 'ANS', user: 'USR', disk: 'DSK',
    'web:code.visualstudio.com': 'VSC', 'web:developer.mozilla.org': 'MDN', 'web:nodejs.org': 'NOD', 'web:github.com': 'GHB', 'web:search': 'WWW', 'mcp:github': 'MCP',
    'ctxfile:~/.claude/CLAUDE.md': 'UCL', 'ctxfile:CLAUDE.md': 'PCL', 'ctxfile:.claude/memory/MEMORY.md': 'MEM', 'ctxfile:.claude/skills/run/SKILL.md': 'SKL'
  };
  const NAMES = { model: 'Model', context: 'Context', terminal: 'Terminal', plan: 'Plan tower', answer: 'Reply', user: 'User', disk: 'Disk', 'web:code.visualstudio.com': 'VS Code docs', 'web:developer.mozilla.org': 'Mozilla MDN', 'web:nodejs.org': 'Node.js', 'web:github.com': 'GitHub', 'web:search': 'Web search', 'mcp:github': 'GitHub MCP' };
  const used = new Set(Object.values(CODES));
  const laneCodes = {}; let laneCount = 0;
  function laneCode(key) { if (key === 'main') return 'MDL'; if (!laneCodes[key]) laneCodes[key] = 'S' + pad(++laneCount); return laneCodes[key]; }
  function codeFor(id) {
    if (CODES[id]) return CODES[id];
    if (id.startsWith('lane:')) return laneCode(id.slice(5));
    if (id.startsWith('tool:')) return AIR[id.slice(5)].code;
    const base = (id.replace(/^\w+:/, '').split('/').pop().replace(/\.[^.]*$/, '').replace(/[^a-z]/gi, '') || 'XXX').toUpperCase();
    let cand = (base[0] + (base.slice(1).replace(/[AEIOU]/g, '') + 'XX').slice(0, 2));
    let i = 0; while (used.has(cand)) cand = cand.slice(0, 2) + (i++ % 10);
    used.add(cand); CODES[id] = cand; return cand;
  }
  function nameFor(id) {
    if (NAMES[id]) return NAMES[id];
    if (id.startsWith('file:')) return id.slice(5).split('/').pop();
    if (id.startsWith('lane:')) { const l = sim.laneByKey(id.slice(5)); return l ? l.label : 'Satellite'; }
    if (id.startsWith('tool:')) return `${AIR[id.slice(5)].name} beacon`;
    if (id.startsWith('web:')) return id.slice(4);
    if (id.startsWith('ctxfile:')) return id.slice(8);
    return id;
  }
  const P = {
    model: [610, 168], context: [705, 205], terminal: [560, 522], plan: [737, 505], user: [655, 50], answer: [772, 50], disk: [215, 300],
    'web:code.visualstudio.com': [1020, 85], 'web:developer.mozilla.org': [1132, 98], 'web:nodejs.org': [1012, 205], 'web:github.com': [1132, 212], 'web:search': [1070, 148], 'mcp:github': [1072, 292],
    'tool:files': [478, 158], 'tool:edits': [490, 300], 'tool:shell': [497, 442], 'tool:network': [878, 150], 'tool:agents': [862, 428], 'tool:memory': [652, 442], 'tool:other': [905, 290]
  };
  const FILE_POS = {
    'src/extension.js': [95, 110], 'src/transcript.js': [190, 76], 'src/sessions.js': [292, 112], 'src/webview.js': [150, 172],
    'media/view.js': [85, 262], 'media/app.js': [212, 246], 'media/style.css': [318, 288],
    'test/view.test.js': [80, 398], 'test/transcript.test.js': [195, 428], 'test/sessions.test.js': [304, 398],
    'package.json': [388, 152], 'README.md': [398, 262], 'docs/ui-exploration/PLAN.md': [385, 410]
  };
  const SPARE = { test: [[112, 488], [232, 506], [338, 478], [262, 462], [180, 472], [70, 440]], other: [[262, 192], [64, 332], [360, 345], [150, 330]] };
  for (const [path, p] of Object.entries(FILE_POS)) P['file:' + path] = p;
  const SLOTS = [[935, 400], [1015, 396], [1095, 404], [1166, 398], [930, 462], [1010, 468], [1092, 462], [1166, 468], [935, 528], [1015, 534], [1095, 528], [1166, 534]];
  const slotOf = {}; // lane key -> slot index
  function assignSlot(key) {
    if (slotOf[key] != null) return slotOf[key];
    const taken = new Set(Object.values(slotOf));
    let idx = SLOTS.findIndex((_, i) => !taken.has(i));
    if (idx < 0) {
      const closed = Object.keys(slotOf).map(k => sim.laneByKey(k)).filter(l => l && l.state !== 'running').sort((a, b) => a.endedAt - b.endedAt);
      if (!closed.length) return null;
      idx = slotOf[closed[0].key]; delete slotOf[closed[0].key];
    }
    slotOf[key] = idx; return idx;
  }
  function pos(id) {
    if (P[id]) return P[id];
    if (id.startsWith('lane:')) { const s = slotOf[id.slice(5)]; return s != null ? SLOTS[s] : P['tool:agents']; }
    if (id.startsWith('file:')) {
      const path = id.slice(5); const list = path.startsWith('test/') ? SPARE.test : SPARE.other;
      const spot = list.shift() || SPARE.other.shift() || [60 + (path.length * 37) % 300, 120 + (path.length * 53) % 360];
      P[id] = spot; return spot;
    }
    if (id.startsWith('web:')) return P['web:search'];
    return P.context;
  }

  // ---------- routes: where a flight departs from and where it lands ----------
  const home = c => c.lane === 'main' ? 'context' : 'lane:' + c.lane;
  const origin = c => c.lane === 'main' ? 'model' : 'lane:' + c.lane;
  function spawnedLane(c) {
    const ref = c.refs.find(r => r.type === 'lane' && r.role === 'spawned'); if (ref) return ref.value;
    if (c.input && c.input.result_of) return c.input.result_of;
    const l = S.lanes.find(x => x.parent === c.lane && x.label === (c.target && c.target.value) && Math.abs(x.startedAt - c.startedAt) < 5);
    return l ? l.key : null;
  }
  function hostOf(c) {
    const hop = c.flow.find(h => h.from.startsWith('web:')); if (hop) return hop.from;
    if (c.target && c.target.type === 'url') { try { return 'web:' + new URL(c.target.value).host; } catch (e) { /* fall through */ } }
    return 'web:search';
  }
  const filePath = c => { const r = c.refs.find(x => x.type === 'file'); return r ? r.value : (c.target && c.target.value); };
  function route(c) {
    switch (c.kind) {
      case 'files': return c.tool === 'Read' ? { from: 'file:' + filePath(c), to: home(c) } : { from: 'disk', to: home(c) };
      case 'edits': return { from: home(c), to: 'file:' + c.target.value };
      case 'shell': return { from: origin(c), to: 'terminal' };
      case 'network': return { from: hostOf(c), to: home(c) };
      case 'agents': { const k = spawnedLane(c); const sat = k ? 'lane:' + k : 'tool:agents'; return c.input && c.input.result_of ? { from: sat, to: home(c) } : { from: home(c), to: sat }; }
      case 'memory': return { from: home(c), to: 'plan' };
      default: return { from: 'mcp:github', to: home(c) };
    }
  }
  function incidentNode(c) {
    const r = route(c);
    if (c.kind === 'files') return r.from === 'disk' ? r.to : r.from;
    if (c.kind === 'network' || c.kind === 'other') return r.from;
    if (c.kind === 'agents') return c.input && c.input.result_of ? r.from : r.to;
    return r.to;
  }
  function payloadOf(c) {
    if (c.status === 'running') { const t = c.flow.reduce((s, h) => s + (h.tokens || 0), 0); return t ? fmtK(t) + 'T' : '···'; }
    if (c.kind === 'edits') { const b = c.flow.reduce((s, h) => s + (h.bytes || 0), 0); return b ? fmtK(b) + 'B' : '0B'; }
    return fmtK(c.tokens.in) + 'T';
  }
  const lastPromptTime = () => { for (let i = S.markers.length - 1; i >= 0; i--) if (S.markers[i].kind === 'prompt') return S.markers[i].time; return 0; };

  // ---------- statuses on the boards ----------
  function depStatus(c) {
    if (c.status === 'running') {
      const el = S.now - c.startedAt;
      if (el < 350) return { t: 'BOARDING', cls: 'st-board' };
      if (c.kind === 'shell') {
        const left = Math.ceil((c.startedAt + c.duration - S.now) / 1000);
        if (left <= 0) return { t: 'DELAYED', cls: 'st-delay' };
        return { t: `${c.attempt > 1 ? 'R' + c.attempt + ' ' : ''}ETA ${pad(left)}S`, cls: c.attempt > 1 ? 'st-retry' : 'st-fly' };
      }
      if (c.kind === 'network' && el < c.duration * 0.35) return { t: 'CUSTOMS', cls: 'st-fly' };
      if (el > 2400) return { t: 'DELAYED', cls: 'st-delay' };
      if (c.attempt > 1) return { t: `↻ RETRY ${c.attempt}`, cls: 'st-retry' };
      if (c.kind === 'agents' && c.input && c.input.result_of) return { t: 'INBOUND', cls: 'st-fly' };
      return { t: AIR[c.kind].run === 'ETA' ? 'IN FLIGHT' : AIR[c.kind].run === 'INTL' ? 'INTL FLIGHT' : AIR[c.kind].run, cls: 'st-fly' };
    }
    if (c.status === 'error') return { t: '✕ DIVERTED', cls: 'st-div' };
    return { t: c.attempt > 1 ? '↻ DEPARTED' : 'DEPARTED', cls: 'st-done' };
  }
  function arrStatus(c) {
    if (c.status === 'error') return { t: '✕ ' + c.error.code, cls: 'st-err' };
    if (c.attempt > 1) return { t: `↻ LANDED R${c.attempt}`, cls: 'st-retry' };
    const s = (c.endedAt - c.startedAt) / 1000;
    return { t: `LANDED ${s < 10 ? s.toFixed(1) : Math.round(s)}S`, cls: 'st-ok' };
  }

  // ---------- split-flap engine ----------
  const CHARSET = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.:-';
  const pending = new Set();
  function setFlaps(col, text, delay) {
    const cells = col.children; const w = cells.length;
    const t = String(text).toUpperCase().padEnd(w).slice(0, w);
    const now = performance.now();
    for (let i = 0; i < w; i++) {
      const cell = cells[i]; const ch = t[i];
      if (cell._t === ch) continue;
      cell._t = ch;
      if (REDUCE || cell._skip) { cell.textContent = ch; continue; }
      // time-based: a cell shows 1-2 intermediate flaps, then lands on its character by _end even if frames drop
      cell._at = now + delay + i * 6;
      cell._end = cell._at + 60 * (1 + Math.floor(Math.random() * 2));
      pending.add(cell);
    }
  }
  function flapTick(now) {
    if (now == null) now = performance.now();
    for (const cell of pending) {
      if (now < cell._at) continue;
      if (now >= cell._end) { cell.textContent = cell._t; pending.delete(cell); }
      else { cell.textContent = CHARSET[1 + Math.floor(Math.random() * (CHARSET.length - 1))]; cell._at = now + 60; }
      if (cell.classList.contains('fa')) { cell.classList.remove('fa'); cell.classList.add('fb'); } else { cell.classList.remove('fb'); cell.classList.add('fa'); }
    }
  }
  setInterval(() => flapTick(), 60);
  function cellsHtml(n) { return '<i class="c"> </i>'.repeat(n); }

  // ---------- boards ----------
  const COLS_FULL = [['TIME', 5], ['FLIGHT', 11], ['FROM', 11], ['VIA', 3], ['TO', 11], ['LOAD', 5], ['STATUS', 12]];
  const COLS_COMPACT = [['TIME', 5], ['FLIGHT', 11], ['FROM', 8], ['TO', 8], ['STATUS', 12]];
  const N_ROWS = 8;
  let layoutKey = '';
  const board = { dep: { rows: [] }, arr: { rows: [] } };
  function layoutBoards() {
    const bw = $('#dep').clientWidth;
    const inner = bw - 18 - 26;
    const fit = cols => Math.floor((inner - (cols.length - 1) * 7) / cols.reduce((s, c) => s + c[1], 0));
    let cols = COLS_FULL; let cw = fit(cols);
    if (cw < 8) { cols = COLS_COMPACT; cw = fit(cols); }
    cw = clamp(cw, 6, 11);
    const key = cols.length + ':' + cw;
    if (key === layoutKey) return;
    layoutKey = key;
    $('#boards').style.setProperty('--cw', cw + 'px');
    buildBoard('dep', cols); buildBoard('arr', cols);
    renderBoards(true);
  }
  function buildBoard(id, cols) {
    const dep = id === 'dep';
    const plane = `<svg viewBox="-12 -12 24 24" width="19" height="19"><path transform="rotate(${dep ? -28 : 28})" d="${GLYPH.jet}" fill="#111"/></svg>`;
    let h = `<div class="bhead"><span class="pict">${plane}</span><div><div class="btitle">${dep ? 'Departures' : 'Arrivals'}</div><div class="bsub">${dep ? 'Every tool call leaving the gate <i>· latest first</i>' : 'Where the data landed, and in what condition <i>· latest first</i>'}</div></div><div class="bnote">LOAD: T tokens · B bytes<br>VIA: gate (airline letter)</div></div>`;
    h += `<div class="bcols"><span class="lg"></span>${cols.map(([name, w]) => `<span class="h" style="width:calc(var(--cw) * ${w})">${name}</span>`).join('')}</div>`;
    h += '<div class="rows">';
    for (let r = 0; r < N_ROWS; r++) h += `<div class="row empty" tabindex="-1"><span class="lg"></span>${cols.map(([name, w]) => `<span class="col" data-c="${name}">${cellsHtml(w)}</span>`).join('')}</div>`;
    h += '</div>';
    const el = document.getElementById(id); el.innerHTML = h;
    board[id].cols = cols;
    board[id].rows = [...el.querySelectorAll('.row')].map(row => ({ el: row, cols: Object.fromEntries([...row.querySelectorAll('.col')].map(c => [c.dataset.c, c])), lg: row.querySelector('.lg'), kind: null, id: null }));
    if (REDUCE) for (const r of board[id].rows) for (const c of Object.values(r.cols)) for (const cell of c.children) cell._skip = true;
  }
  function rowText(c, which) {
    const r = route(c);
    const st = which === 'arr' ? arrStatus(c) : depStatus(c);
    return {
      TIME: hhmm(which === 'arr' ? c.endedAt : c.startedAt), FLIGHT: `${flightNo(c)} ${TOOL_SHORT[c.tool] || c.tool.slice(0, 4)}`,
      FROM: `${codeFor(r.from)} ${nameFor(r.from)}`, VIA: gateOf(c), LOAD: payloadOf(c), TO: `${codeFor(r.to)} ${nameFor(r.to)}`, PAYLOAD: payloadOf(c), STATUS: st.t, cls: st.cls
    };
  }
  let selectedCall = null;
  function renderBoards() {
    const dep = S.calls.slice(-N_ROWS).reverse();
    const arr = S.calls.filter(c => c.endedAt != null).slice(-60).sort((a, b) => b.endedAt - a.endedAt).slice(0, N_ROWS);
    fillBoard('dep', dep); fillBoard('arr', arr);
  }
  function fillBoard(which, list) {
    board[which].rows.forEach((row, i) => {
      const c = list[i];
      if (!c) { row.el.className = 'row empty'; row.el.removeAttribute('data-open'); row.el.tabIndex = -1; for (const col of Object.values(row.cols)) setFlaps(col, '', 0); row.lg.innerHTML = ''; row.kind = null; return; }
      const t = rowText(c, which);
      const delay = row.id !== c.id ? i * 28 : 0;
      for (const [name, col] of Object.entries(row.cols)) setFlaps(col, t[name], delay);
      row.cols.STATUS.className = 'col ' + t.cls;
      if (row.kind !== c.kind) { row.lg.innerHTML = logo(c.kind, 16); row.kind = c.kind; }
      row.id = c.id;
      row.el.dataset.open = 'call:' + c.id; row.el.tabIndex = 0;
      row.el.className = `row k-${c.kind}${c.status === 'error' ? ' err' : ''}${selectedCall === c.id ? ' sel' : ''}`;
      row.el.setAttribute('aria-label', `${flightNo(c)} ${c.tool} ${c.label}, ${t.STATUS}`);
    });
  }

  // ---------- header ----------
  function buildClock() { $('#clock').innerHTML = cellsHtml(8); }
  let lastRecord = 0;
  function noteRecord(t) { if (t > lastRecord) lastRecord = t; }
  function renderHeader() {
    const s = S.session;
    const since = S.now - lastRecord;
    const status = s.status === 'complete' ? ['turn', 'Turn complete'] : since < 8000 ? ['ok', 'Recent activity'] : ['quiet', 'Quiet'];
    const active = [...new Set(sim.runningCalls().map(c => c.kind))];
    const html = `<div class="l1"><b>${esc(s.project)}</b> · ${esc(s.name)} <span class="pill ${status[0]}">${status[1]}</span> <span class="muted">· turn ${s.turn} · last record ${ago(since)}</span></div>
      <div class="l2"><span class="mono">${esc(s.id)}</span><span>${esc(s.provider)}</span><span>${esc(s.model)}</span><span>branch ${esc(s.branch)}</span><span>${active.length ? 'active now: ' + active.map(k => AIR[k].code + ' ' + AIR[k].name).join(', ') : 'no flight in the air'}</span></div>`;
    setHTML($('#ident'), html);
    setFlaps($('#clock'), hms(S.now), 0);
  }
  function renderMode() {
    const m = $('#mode');
    if (sim.running) { m.className = 'mode live'; m.textContent = 'LIVE'; }
    else { m.className = 'mode inspect'; m.textContent = `❚❚ INSPECTING ${hms(S.now)}`; }
    $('#pause').textContent = sim.running ? '❚❚ Pause' : '▶ Resume';
  }
  function setHTML(el, html) { if (el._h !== html) { el._h = html; el.innerHTML = html; } }

  // ---------- map: static geography ----------
  const L = {};
  function rnd(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function smooth(pts, closed) {
    const n = pts.length; const g = i => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
    let d = `M${n1(pts[0][0])},${n1(pts[0][1])}`;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      d += `C${n1(p1[0] + (p2[0] - p0[0]) / 6)},${n1(p1[1] + (p2[1] - p0[1]) / 6)} ${n1(p2[0] - (p3[0] - p1[0]) / 6)},${n1(p2[1] - (p3[1] - p1[1]) / 6)} ${n1(p2[0])},${n1(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  function blob(cx, cy, rx, ry, seed, rough = 0.07, n = 46) {
    const r = rnd(seed); const ph = [r() * 7, r() * 7, r() * 7, r() * 7];
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const m = 1 + rough * (0.55 * Math.sin(3 * a + ph[0]) + 0.3 * Math.sin(5 * a + ph[1]) + 0.2 * Math.sin(11 * a + ph[2]) + 0.12 * Math.sin(19 * a + ph[3]));
      pts.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m]);
    }
    return smooth(pts, true);
  }
  const SAT_ISLES = SLOTS.map(([x, y], i) => blob(x, y + 4, 34, 22, 100 + i, 0.14, 24));
  function buildMap() {
    const svg = $('#map');
    const lands = [
      blob(222, 292, 222, 268, 11, 0.06), blob(690, 265, 128, 152, 21, 0.08), blob(714, 48, 98, 30, 31, 0.12),
      blob(560, 520, 78, 46, 41, 0.12), blob(737, 507, 56, 42, 51, 0.12), blob(1078, 186, 114, 156, 61, 0.08)
    ];
    let grat = '';
    for (let y = 40; y < 580; y += 60) grat += `<path class="grat" d="M0 ${y} Q600 ${y - 18} 1200 ${y}"/>`;
    for (let x = 60; x < 1200; x += 100) grat += `<path class="grat" d="M${x} 0 Q${x + (x - 600) * 0.05} 290 ${x} 580"/>`;
    const borders = [
      smooth([[18, 214], [120, 202], [222, 214], [342, 200]], false), smooth([[18, 344], [130, 330], [240, 352], [348, 336]], false),
      smooth([[344, 56], [350, 200], [342, 336], [352, 470], [340, 548]], false)
    ];
    svg.innerHTML = `
      <rect width="1200" height="580" fill="#161718"/>
      <g>${grat}</g>
      <g>${lands.map(d => `<path class="landglow" d="${d}"/>`).join('')}${lands.map(d => `<path class="land" d="${d}"/>`).join('')}</g>
      <g>${borders.map(d => `<path class="border" d="${d}"/>`).join('')}</g>
      <line class="dateline" x1="878" y1="14" x2="878" y2="352"/>
      <text class="tiny" transform="translate(888 336) rotate(-90)" letter-spacing="2">INTERNATIONAL DATELINE · CUSTOMS</text>
      <g>
        <text class="region" x="14" y="22">DISK</text><text class="tiny" x="68" y="22">one airport per file</text>
        <text class="country" x="232" y="186">SRC</text><text class="country" x="120" y="322">MEDIA</text><text class="country" x="150" y="372">TEST</text><text class="country" x="356" y="96">ROOT</text><text class="country" x="356" y="372">DOCS</text>
        <text class="region" x="575" y="104">CONTEXT</text>
        <text class="region" x="996" y="20">WEB</text><text class="tiny" x="1046" y="20">one airport per host</text>
        <text class="region" x="900" y="372">SATELLITE AIRFIELDS</text>
        <text class="tiny" x="600" y="14">USERLAND</text>
      </g>
      <g id="hist"></g><g id="apron"></g><g id="sats"></g><g id="airports"></g><g id="itin"></g><g id="incidents"></g><g id="trails"></g><g id="planes"></g><g id="fx"></g>`;
    for (const k of ['hist', 'apron', 'sats', 'airports', 'itin', 'incidents', 'trails', 'planes', 'fx']) L[k] = svg.querySelector('#' + k);
    buildApron();
    $('#maplegend').innerHTML = KINDS.map(k => `<span>${logo(k, 13)}<b style="color:${AIR[k].color}">${AIR[k].code}</b> ${AIR[k].name}</span>`).join('') +
      '<span>· plane size = payload · dashed trail = request, solid = data · circling = still running · loop = retry · <b style="color:var(--red)">▲ NOTAM</b> = error · <b style="color:var(--yellow)">click any airport, beacon, plane or NOTAM</b></span>';
  }

  // Context apron: 25 x 2 stands, each 2% of the window; fills left to right like a gauge.
  const STANDS = [];
  function buildApron() {
    const x0 = 628, y0 = 252;
    let h = `<text class="tiny" x="${x0}" y="${y0 - 5}">APRON</text><text class="apron-pct" x="${x0 + 152}" y="${y0 + 19}" text-anchor="end"></text>`;
    for (let i = 0; i < 50; i++) { const col = Math.floor(i / 2), row = i % 2; h += `<rect class="stand" x="${x0 + col * 6}" y="${y0 + row * 12}" width="5" height="11" rx="1"/>`; }
    h += `<line class="apron-mark a" x1="${x0 + 17.5 * 6 - 0.5}" y1="${y0 - 3}" x2="${x0 + 17.5 * 6 - 0.5}" y2="${y0 + 27}"/><line class="apron-mark r" x1="${x0 + 22.5 * 6 - 0.5}" y1="${y0 - 3}" x2="${x0 + 22.5 * 6 - 0.5}" y2="${y0 + 27}"/>`;
    h += `<text class="tiny" x="${x0 + 17.5 * 6 - 4}" y="${y0 + 36}">70</text><text class="tiny" x="${x0 + 22.5 * 6 - 4}" y="${y0 + 36}">90</text>`;
    h += '<g id="based"></g><g id="banner"></g>';
    const g = L.apron; g.innerHTML = h; g.setAttribute('data-open', 'node:context'); g.setAttribute('tabindex', '0'); g.style.cursor = 'pointer';
    STANDS.push(...g.querySelectorAll('.stand'));
  }
  const lvl = p => p >= 90 ? 'lv-red' : p >= 70 ? 'lv-amber' : 'lv-ok';
  function renderApron() {
    const p = S.context.percent; const on = Math.round(p / 2);
    L.apron.setAttribute('class', lvl(p) + (L.apron._clearing ? ' clearing' : ''));
    STANDS.forEach((s, i) => s.classList.toggle('on', i < on));
    L.apron.querySelector('.apron-pct').textContent = p.toFixed(1) + '%';
    const based = S.context.files.map((f, i) => {
      const x = 640 + i * 38, y = 330;
      return `<g transform="translate(${x} ${y})"><path d="${GLYPH.jet}" transform="rotate(-90) scale(.55)" fill="#cfc7b8" stroke="#000" stroke-width=".6"/><text class="tiny" y="16" text-anchor="middle">${codeFor('ctxfile:' + f.path)}</text></g>`;
    }).join('');
    setHTML(L.apron.querySelector('#based'), `<text class="tiny" x="606" y="316">BASED AIRCRAFT · context files</text>${based}`);
  }

  // ---------- map: dynamic airports, beacons, airfields, incidents ----------
  function apHtml(id, extra = '', cls = '') {
    const [x, y] = pos(id);
    return `<g class="ap ${cls}${dossierKey === 'node:' + id ? ' sel' : ''}" data-open="node:${esc(id)}" tabindex="0" transform="translate(${x} ${y})" aria-label="${esc(codeFor(id) + ' ' + nameFor(id))}"><circle class="hit" r="11"/><circle class="ring" r="6"/><circle class="dot" r="3.2"/><text class="code" x="8" y="-3">${esc(codeFor(id))}</text><text class="nm" x="8" y="7">${esc(nameFor(id))}</text>${extra}</g>`;
  }
  function renderAirports() {
    let h = '';
    const files = S.nodes.filter(n => n.group === 'disk');
    for (const n of files) {
      const f = S.files[n.label];
      let extra = '';
      if (f) {
        extra = `<text class="tr" x="8" y="17"><tspan class="a">▼${f.reads}</tspan> <tspan class="d">▲${f.edits}</tspan>${f.failed ? ` <tspan class="x">✕${f.failed}</tspan>` : ''}</text>`;
        if (f.edits >= 3) extra += '<g class="hot" transform="translate(-24 -6)"><rect width="18" height="10" rx="2"/><text x="2" y="7.5">HOT</text></g>';
      }
      h += apHtml(n.id, extra, f ? '' : 'cold');
    }
    // Context mega-airport
    const [cx, cy] = P.context;
    h += `<g class="ap mega${dossierKey === 'node:context' ? ' sel' : ''}" data-open="node:context" tabindex="0" transform="translate(${cx} ${cy})" aria-label="CTX Context window"><circle class="hit" r="16"/><circle class="ring" r="12"/><circle class="ring" r="8"/><circle class="dot" r="4.5"/><text class="code" x="15" y="-2">CTX</text><text class="nm" x="15" y="9">Context window · ${fmtK(S.context.used)} / ${fmtK(S.context.capacity)} tokens</text><text class="nm" x="15" y="19">${S.context.compactions} compaction${S.context.compactions === 1 ? '' : 's'}</text></g>`;
    const mainLane = S.lanes[0];
    h += apHtml('model', `<text class="tr" x="8" y="17">${mainLane.calls} calls · ${mainLane.errors} err</text>`);
    const shells = S.calls.filter(c => c.kind === 'shell' && c.endedAt);
    const lastSh = shells[shells.length - 1];
    const exit = lastSh ? (lastSh.output && lastSh.output.exitCode != null ? lastSh.output.exitCode : lastSh.error ? lastSh.error.code : 0) : null;
    h += apHtml('terminal', `<rect x="-11" y="-6" width="22" height="12" rx="1.5" fill="none" stroke="#38d1c4" stroke-width="1"/>` + (lastSh ? `<g class="chip" transform="translate(8 11)"><rect width="${lastSh.error ? 58 : 40}" height="11" fill="${lastSh.error ? '#ff4b3e' : '#4fd071'}"/><text x="3" y="8.5" fill="#000">${lastSh.error ? '✕ ' + esc(String(lastSh.error.code)) : 'EXIT ' + exit}</text></g><text class="tr" x="8" y="32">${shells.length} commands</text>` : ''));
    const t = S.tasks.items; const done = t.filter(x => x.status === 'completed').length;
    h += apHtml('plan', `<path d="M-3 9L-2 -3H2L3 9Z M-6 -9H6V-3H-6Z" fill="#bfe3ee" stroke="#000" stroke-width=".5"/><text class="tr" x="8" y="17">${done}/${t.length} tasks done</text>`);
    const prompts = S.markers.filter(m => m.kind === 'prompt').length, turns = S.markers.filter(m => m.kind === 'turn-complete').length;
    h += apHtml('user', `<text class="tr" x="8" y="17">${prompts} prompts</text>`);
    h += apHtml('answer', `<text class="tr" x="8" y="17">${turns} replies</text>`);
    for (const host of ['web:code.visualstudio.com', 'web:developer.mozilla.org', 'web:nodejs.org', 'web:github.com', 'web:search', 'mcp:github']) {
      const calls = S.calls.filter(c => (c.kind === 'network' || c.kind === 'other') && route(c).from === host && c.endedAt);
      const last = calls[calls.length - 1];
      const st = last ? (last.error ? `<tspan class="x">✕${esc(last.error.code)}</tspan>` : (last.output && last.output.status) || 'OK') : '';
      h += apHtml(host, calls.length ? `<text class="tr" x="8" y="17">${calls.length} flights · ${st}</text>` : '', calls.length ? '' : 'cold');
    }
    // beacons (tool waypoints)
    const active = new Set(sim.runningCalls().map(c => c.kind));
    for (const k of KINDS) {
      const [x, y] = P['tool:' + k]; const col = AIR[k].color;
      h += `<g class="beacon${active.has(k) ? ' active' : ''}" style="color:${col}" data-open="kind:${k}" tabindex="0" transform="translate(${x} ${y})" aria-label="${AIR[k].name} beacon"><path class="hex" stroke="${col}" d="M0 -10L8.7 -5V5L0 10L-8.7 5V-5Z"/><text y="3" fill="${col}">${AIR[k].code}</text><text class="bl" y="20">${k === 'network' ? 'CUSTOMS' : 'VOR'}</text></g>`;
    }
    setHTML(L.airports, h);
  }
  function renderSats() {
    let h = '';
    for (const [key, s] of Object.entries(slotOf)) {
      const lane = sim.laneByKey(key); if (!lane) continue;
      const [x, y] = SLOTS[s];
      const parent = lane.parent && lane.parent !== 'main' && slotOf[lane.parent] != null ? SLOTS[slotOf[lane.parent]] : null;
      if (parent) h += `<path class="nest" d="M${parent[0]} ${parent[1]} Q${(parent[0] + x) / 2} ${Math.min(parent[1], y) - 26} ${x} ${y}"/>`;
      const open = lane.state === 'running';
      const st = open ? '<tspan fill="#4fd071">● OPEN</tspan>' : lane.state === 'failed' ? '<tspan fill="#ff4b3e">✕ FAIL</tspan>' : '<tspan fill="#a8a090">✓</tspan>';
      h += `<g class="sat ${open ? 'open' : 'closed'}${dossierKey === 'node:lane:' + key ? ' sel' : ''}" data-open="node:lane:${key}" tabindex="0" aria-label="Satellite airfield ${laneCode(key)} ${esc(lane.label)}, ${lane.state}">
        <path class="isle" d="${SAT_ISLES[s]}"/><line class="rw" x1="${x - 16}" y1="${y + 7}" x2="${x + 16}" y2="${y + 1}"/><line class="rwc" x1="${x - 14}" y1="${y + 6.6}" x2="${x + 14}" y2="${y + 1.4}"/>
        <circle class="rwl" cx="${x - 17}" cy="${y + 7.2}" r="1.6"/><circle class="rwl" cx="${x + 17}" cy="${y + 0.8}" r="1.6"/>
        <text class="code" x="${x - 26}" y="${y - 9}">${laneCode(key)}</text><text class="stt" x="${x - 6}" y="${y - 9}">${st}</text>
        <text class="nm" x="${x - 26}" y="${y + 20}">${esc(lane.label.slice(0, 13))}${lane.depth > 1 ? ' ·d' + lane.depth : ''}</text></g>`;
    }
    setHTML(L.sats, h);
  }
  const pendingInc = new Set();
  const freshInc = new Set();
  // NOTAMs: errors since the last prompt get a full tag; older ones shrink to a small marker (max 2 per airport).
  function incidentList() {
    const since = lastPromptTime();
    const fresh = S.errors.filter(c => c.startedAt >= since).slice(-8);
    const stale = []; const per = {};
    for (const c of S.errors.slice(-30).reverse()) { if (c.startedAt >= since) continue; const n = incidentNode(c); if ((per[n] = (per[n] || 0) + 1) <= 2) stale.push(c); }
    return { fresh, stale: stale.slice(0, 10), since };
  }
  function incidentPos(c, list, stale) {
    const node = incidentNode(c); const p = pos(node);
    const same = list.filter(x => incidentNode(x) === node);
    const i = Math.max(0, same.indexOf(c));
    return stale ? [p[0] - 12 - i * 9, p[1] - 12, p] : [p[0] + 14 + (i % 2) * 6, p[1] - 22 - i * 16, p];
  }
  function renderIncidents() {
    const { fresh, stale } = incidentList();
    let h = '';
    const live = fresh.filter(c => !pendingInc.has(c.id));
    for (const c of stale) {
      const [x, y] = incidentPos(c, stale, true);
      h += `<g class="inc stale${dossierKey === 'err:' + c.id ? ' sel' : ''}" data-open="err:${c.id}" tabindex="0" aria-label="Earlier NOTAM ${esc(c.error.code)} on ${flightNo(c)}"><title>${esc(c.error.code)} · ${flightNo(c)}</title><path class="tri" transform="translate(${n1(x)} ${n1(y)}) scale(.6)" d="M0 -8L7.5 5H-7.5Z"/></g>`;
    }
    for (const c of live) {
      const [x, y, p] = incidentPos(c, fresh, false);
      const code = c.error.code; const w = (code.length + 6) * 5.3 + 8;
      h += `<g class="inc${freshInc.has(c.id) ? ' fresh' : ''}${dossierKey === 'err:' + c.id ? ' sel' : ''}" data-open="err:${c.id}" tabindex="0" aria-label="NOTAM ${esc(code)} on ${flightNo(c)}">
        <line class="leader" x1="${p[0]}" y1="${p[1]}" x2="${x}" y2="${y}"/><g transform="translate(${x} ${y})"><path class="tri" d="M0 -8L7.5 5H-7.5Z"/><text class="bang" y="3.5">!</text>
        <g class="tag"><rect x="10" y="-8" width="${w}" height="13" rx="1"/><text x="13" y="1.5">NOTAM ${esc(code)}</text></g></g></g>`;
    }
    setHTML(L.incidents, h);
  }

  // ---------- map: planes ----------
  let animNow = 0;
  const flights = new Set();
  const holds = new Map();
  function ctrl(p0, p1) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1]; const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len; if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
    const k = Math.min(len * 0.2, 80);
    return [(p0[0] + p1[0]) / 2 + nx * k, (p0[1] + p1[1]) / 2 + ny * k];
  }
  const qpt = (p0, c, p1, t) => [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]];
  const qtan = (p0, c, p1, t) => [2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]), 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])];
  function scaleFor(hop) { const amt = (hop.tokens || 0) * 4 + (hop.bytes || 0); return amt ? clamp(0.55 + (Math.log10(amt) - 2) * 0.38, 0.5, 1.75) : 0.5; }
  function planeEl(kind, cls, callId) {
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `plane ${cls || ''}`);
    if (callId) { g.setAttribute('data-open', 'call:' + callId); }
    const col = AIR[kind] ? AIR[kind].color : '#fff';
    g.innerHTML = `<path class="body" d="${GLYPH[AIR[kind] ? AIR[kind].glyph : 'jet']}" fill="${col}"/>` + (kind === 'memory' ? `<g class="rotor"><path d="M-8 -8L8 8M-8 8L8 -8" stroke="${col}" stroke-width="1" opacity=".8"/></g>` : '');
    g.style.visibility = 'hidden';
    L.planes.appendChild(g);
    return g;
  }
  function fly(o) {
    const p0 = o.from, p1 = o.to; const c = ctrl(p0, p1);
    const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    let dur = clamp(dist / 0.42, 380, 1500) * (o.kind === 'network' ? 1.15 : o.kind === 'memory' ? 0.75 : 1) * (1 + (o.scale || 0.5) * 0.12);
    if (REDUCE) dur = 1;
    const el = planeEl(o.kind, o.cls, o.callId);
    let trail = null;
    if (!REDUCE && flights.size < 70) {
      trail = document.createElementNS(NS, 'path');
      trail.setAttribute('class', `trail${o.req ? ' req' : ''}`);
      trail.setAttribute('stroke', o.cls === 'divert' ? '#ff4b3e' : o.cls === 'prompt' ? '#ffcd1c' : o.cls === 'reply' ? '#4fd071' : AIR[o.kind] ? AIR[o.kind].color : '#fff');
      trail.setAttribute('stroke-width', n1(0.8 + (o.scale || 0.5) * 1.3));
      L.trails.appendChild(trail);
    }
    const f = { el, trail, p0, c, p1, t0: animNow + (o.delay || 0), dur, scale: o.scale || 0.55, loop: !!o.loop && !REDUCE, onDone: o.onDone, kind: o.kind, cls: o.cls };
    flights.add(f);
    return f;
  }
  function stepFlights() {
    for (const f of flights) {
      const u = (animNow - f.t0) / f.dur;
      if (u < 0) continue;
      const total = f.loop ? 1.7 : 1;
      if (u >= total) { landFlight(f); continue; }
      f.el.style.visibility = 'visible';
      let x, y, ang;
      if (u <= 1) {
        [x, y] = qpt(f.p0, f.c, f.p1, u); const tg = qtan(f.p0, f.c, f.p1, Math.min(u, 0.999)); ang = Math.atan2(tg[1], tg[0]);
        if (f.trail) { const q1 = [f.p0[0] + (f.c[0] - f.p0[0]) * u, f.p0[1] + (f.c[1] - f.p0[1]) * u]; f.trail.setAttribute('d', `M${n1(f.p0[0])} ${n1(f.p0[1])}Q${n1(q1[0])} ${n1(q1[1])} ${n1(x)} ${n1(y)}`); }
      } else {
        // go-around: a full loop past the runway, then land
        const tg = qtan(f.p0, f.c, f.p1, 0.999); const a0 = Math.atan2(tg[1], tg[0]);
        const R = 15; const phi = (u - 1) / (total - 1) * Math.PI * 2;
        const cxl = f.p1[0] + Math.cos(a0 - Math.PI / 2) * R, cyl = f.p1[1] + Math.sin(a0 - Math.PI / 2) * R;
        const start = a0 + Math.PI / 2;
        x = cxl + Math.cos(start - phi) * R; y = cyl + Math.sin(start - phi) * R; ang = a0 - phi;
      }
      f.el.setAttribute('transform', `translate(${n1(x)} ${n1(y)}) rotate(${n1(ang * 180 / Math.PI)}) scale(${n1(f.scale)})`);
    }
    for (const h of holds.values()) {
      const a = (animNow - h.t0) / 1100 * Math.PI * 2 * (h.dir || 1);
      const x = h.center[0] + Math.cos(a) * h.r, y = h.center[1] + Math.sin(a) * h.r;
      h.pos = [x, y];
      h.el.style.visibility = 'visible';
      h.el.setAttribute('transform', `translate(${n1(x)} ${n1(y)}) rotate(${n1(a * 180 / Math.PI + 90 * (h.dir || 1))}) scale(${n1(h.scale)})`);
      if (h.ring) {
        const c = h.call; const frac = clamp((c.startedAt + c.duration - S.now) / c.duration, 0, 1);
        const circ = 2 * Math.PI * 21;
        h.ring.setAttribute('stroke-dasharray', `${n1(circ * frac)} ${n1(circ)}`);
        h.txt.textContent = frac > 0 ? `T-${Math.ceil((c.startedAt + c.duration - S.now) / 1000)}s` : 'DELAYED';
      }
    }
  }
  const hist = [];
  function landFlight(f) {
    flights.delete(f);
    f.el.remove();
    if (f.trail) { const t = f.trail; t.setAttribute('d', `M${n1(f.p0[0])} ${n1(f.p0[1])}Q${n1(f.c[0])} ${n1(f.c[1])} ${n1(f.p1[0])} ${n1(f.p1[1])}`); t.classList.add('fade'); setTimeout(() => t.remove(), 1500); }
    if (!f.cls || f.cls === 'req') {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'hist'); p.setAttribute('stroke', AIR[f.kind] ? AIR[f.kind].color : '#888');
      p.setAttribute('d', `M${n1(f.p0[0])} ${n1(f.p0[1])}Q${n1(f.c[0])} ${n1(f.c[1])} ${n1(f.p1[0])} ${n1(f.p1[1])}`);
      L.hist.appendChild(p); hist.push(p); if (hist.length > 60) hist.shift().remove();
    }
    if (f.onDone) f.onDone();
  }
  function hold(c, center, opts = {}) {
    if (holds.has(c.id) || c.status !== 'running') return;
    const el = planeEl(c.kind, '', c.id);
    const h = { el, center, r: opts.r || 12, t0: animNow, scale: 0.62, call: c, dir: c.seq % 2 ? 1 : -1, pos: center };
    if (opts.countdown && !REDUCE) {
      const g = document.createElementNS(NS, 'g');
      g.innerHTML = `<circle class="holdring" r="21" cx="${center[0]}" cy="${center[1]}" stroke="${AIR.shell.color}" transform="rotate(-90 ${center[0]} ${center[1]})"/><text class="holdtxt" x="${center[0]}" y="${center[1] - 26}" fill="${AIR.shell.color}"></text>`;
      L.fx.appendChild(g); h.ringG = g; h.ring = g.querySelector('circle'); h.txt = g.querySelector('text');
    }
    holds.set(c.id, h);
  }
  function release(c) {
    const h = holds.get(c.id); if (!h) return null;
    holds.delete(c.id); h.el.remove(); if (h.ringG) h.ringG.remove();
    return h.pos;
  }
  function pulse(p, color) {
    if (REDUCE) return;
    const e = document.createElementNS(NS, 'circle');
    e.setAttribute('class', 'pulse'); e.setAttribute('cx', p[0]); e.setAttribute('cy', p[1]); e.setAttribute('r', 8); e.setAttribute('stroke', color);
    L.fx.appendChild(e); setTimeout(() => e.remove(), 950);
  }
  function stamp(p, text, color, dy = -16) {
    const e = document.createElementNS(NS, 'text');
    e.setAttribute('class', 'stamp'); e.setAttribute('x', p[0]); e.setAttribute('y', p[1] + dy); e.setAttribute('fill', color); e.setAttribute('text-anchor', 'middle');
    e.textContent = text; L.fx.appendChild(e); setTimeout(() => e.remove(), REDUCE ? 2500 : 1850);
  }
  // Fly a list of hops for one call. Consecutive hops landing on the same node fly together (a search formation).
  function runLegs(c, legs, done, opts = {}) {
    const groups = [];
    for (const hop of legs) { const g = groups[groups.length - 1]; if (g && g[0].to === hop.to && g[0].from !== hop.from && hop.from.startsWith('file:')) g.push(hop); else groups.push([hop]); }
    const next = gi => {
      if (gi >= groups.length) { if (done) done(); return; }
      const g = groups[gi]; let left = g.length;
      const last = gi === groups.length - 1;
      g.forEach((hop, i) => fly({
        from: pos(hop.from), to: pos(hop.to), kind: c.kind, scale: scaleFor(hop), callId: c.id, req: !hop.tokens && !hop.bytes,
        cls: opts.err ? 'divert' : '', delay: i * 70, loop: opts.goAround && last,
        onDone: () => { arrive(c, hop, opts); if (--left === 0) next(gi + 1); }
      }));
    };
    next(0);
  }
  function arrive(c, hop, opts) {
    const p = pos(hop.to);
    pulse(p, opts.err ? '#ff4b3e' : AIR[c.kind].color);
    if (hop.to === 'context' && (hop.tokens || 0) > 0) { const on = STANDS.filter(s => s.classList.contains('on')); const s = on[on.length - 1]; if (s) { s.classList.add('flash'); setTimeout(() => s.classList.remove('flash'), 500); } }
    if (hop.to.startsWith('file:') && c.diff) stamp(p, `+${c.diff.added} −${c.diff.removed}`, AIR.edits.color);
    if (hop.to === 'terminal' && c.output) stamp(p, c.error ? `✕ ${c.error.code}` : `EXIT ${c.output.exitCode ?? 0}`, c.error ? '#ff4b3e' : '#4fd071', -22);
    if (hop.to === 'plan') stamp(p, c.output ? c.output.summary.slice(0, 22) : 'PLAN', AIR.memory.color, -18);
  }
  function holdPoint(c) {
    if (c.kind === 'shell') return { node: 'terminal', countdown: true };
    if (c.kind === 'network') return { node: hostOf(c) };
    if (c.kind === 'other') return { node: 'mcp:github' };
    return { node: 'tool:' + c.kind };
  }
  function launch(c) {
    c._shown = c.flow.length;
    runLegs(c, c.flow.slice(), () => {
      if (c.status !== 'running') return;
      const hp = holdPoint(c);
      const bp = pos('tool:' + c.kind);
      if (c.kind === 'network') {
        stamp(bp, 'CUSTOMS ✓', AIR.network.color, -20);
        fly({ from: bp, to: pos(hp.node), kind: 'network', scale: 0.6, callId: c.id, req: true, delay: REDUCE ? 0 : 350, onDone: () => hold(c, pos(hp.node), { r: 13 }) });
      } else if (c.kind === 'shell' || c.kind === 'other') {
        fly({ from: bp, to: pos(hp.node), kind: c.kind, scale: 0.55, callId: c.id, req: true, onDone: () => hold(c, pos(hp.node), { countdown: hp.countdown, r: 13 }) });
      } else hold(c, bp, { r: 11 });
    });
  }
  function landResult(c) {
    const from = release(c);
    const legs = c.flow.slice(c._shown != null ? c._shown : 1);
    if (c.status === 'error') {
      pendingInc.add(c.id);
      const [ix, iy] = incidentPos(c, incidentList().fresh, false);
      fly({ from: from || pos(holdPoint(c).node), to: [ix, iy], kind: c.kind, scale: 0.7, cls: 'divert', callId: c.id, onDone: () => {
        pendingInc.delete(c.id); freshInc.add(c.id); setTimeout(() => freshInc.delete(c.id), 4000);
        stamp([ix, iy], 'DIVERTED', '#ff4b3e', -14);
        renderIncidents();
        if (legs.length) runLegs(c, legs, null, { err: true });
      } });
    } else {
      runLegs(c, legs, null, { goAround: c.attempt > 1 });
    }
  }

  // ---------- selected flight: itinerary + causedBy chain ----------
  function renderItin() {
    let h = '';
    const c = selectedCall && sim.callById(selectedCall);
    if (c) {
      c.flow.forEach((hop, i) => {
        const p0 = pos(hop.from), p1 = pos(hop.to), q = ctrl(p0, p1); const m = qpt(p0, q, p1, 0.5);
        h += `<path class="itin" d="M${n1(p0[0])} ${n1(p0[1])}Q${n1(q[0])} ${n1(q[1])} ${n1(p1[0])} ${n1(p1[1])}"/><g transform="translate(${n1(m[0])} ${n1(m[1])})"><rect class="itin-box" x="-8" y="-7" width="16" height="12" rx="2"/><text class="itin-lbl" x="0" y="2.5" text-anchor="middle">${i + 1}</text></g>`;
      });
      const chain = []; let up = c; const seen = new Set();
      while (up && up.causedBy && !seen.has(up.id) && chain.length < 6) { seen.add(up.id); up = sim.callById(up.causedBy); if (up) chain.unshift(up); }
      chain.push(c);
      for (const d of S.calls.filter(x => x.causedBy === c.id || x.retryOf === c.id)) if (!chain.includes(d)) chain.push(d);
      if (chain.length > 1) {
        const at = x => pos(x.kind === 'files' || x.kind === 'network' ? route(x).from === 'disk' ? route(x).to : route(x).from : route(x).to);
        for (let i = 1; i < chain.length; i++) {
          const p0 = at(chain[i - 1]), p1 = at(chain[i]);
          if (p0[0] === p1[0] && p0[1] === p1[1]) continue;
          const q = ctrl(p0, p1);
          h += `<path class="itin chain" d="M${n1(p0[0])} ${n1(p0[1])}Q${n1(q[0])} ${n1(q[1] - 20)} ${n1(p1[0])} ${n1(p1[1])}"/>`;
        }
        chain.forEach((x, i) => { const p = at(x); const lbl = flightNo(x); h += `<g data-open="call:${x.id}" style="cursor:pointer" transform="translate(${n1(p[0] - 22)} ${n1(p[1] + 22 + (i % 2) * 13)})"><rect class="itin-box" width="${lbl.length * 6 + 6}" height="12" rx="2"/><text class="itin-lbl" x="3" y="9">${lbl}</text></g>`; });
      }
    }
    setHTML(L.itin, h);
  }

  // ---------- sidebar ----------
  function renderGates() {
    const esp = sim.errorsSincePrompt();
    const all = {}; for (const e of S.errors) all[e.kind] = (all[e.kind] || 0) + 1;
    const active = new Set(sim.runningCalls().map(c => c.kind));
    const total = KINDS.reduce((s, k) => s + S.counts[k], 0);
    let h = '<table class="gates"><thead><tr><th></th><th>AIRLINE</th><th>FLIGHTS</th><th title="Errors since the last prompt">ERR NOW</th><th>ALL ERR</th><th></th></tr></thead><tbody>';
    for (const k of KINDS) {
      h += `<tr data-open="kind:${k}" tabindex="0"><td>${logo(k, 15)}</td><td><span class="ac">${AIR[k].code}</span> <span class="an">${AIR[k].name}</span></td><td>${S.counts[k]}</td><td>${esp[k] ? `<span class="e">✕ ${esp[k]}</span>` : '<span class="zero">0</span>'}</td><td>${all[k] ? all[k] : '<span class="zero">0</span>'}</td><td>${active.has(k) ? '<span class="now">NOW</span>' : ''}</td></tr>`;
    }
    h += `</tbody><tfoot><tr><td></td><td colspan="5"><b>${total}</b> flights · <b>${S.errors.length}</b> tool errors (<b>${Object.values(esp).reduce((a, b) => a + b, 0)}</b> since prompt) · tokens in <b>${fmtK(S.tokens.input)}</b> out <b>${fmtK(S.tokens.output)}</b> cache <b>${fmtK(S.tokens.cacheRead)}</b></td></tr></tfoot></table>`;
    setHTML($('#s-gates'), h);
  }
  function sparkSvg(width, height, from) {
    const samples = S.context.samples.filter(s => s.time >= from);
    const x = t => (t - from) / (S.now - from || 1) * width;
    const y = p => height - 2 - p / 100 * (height - 4);
    const pts = samples.map(s => `${n1(x(s.time))},${n1(y(s.percent))}`).join(' ');
    const comps = S.markers.filter(m => m.kind === 'compaction' && m.time >= from).map(m => `<line x1="${n1(x(m.time))}" x2="${n1(x(m.time))}" y1="0" y2="${height}" stroke="#ffad1f" stroke-dasharray="2 2"/><text x="${n1(x(m.time) + 2)}" y="9" fill="#ffad1f" font-size="9">≋</text>`).join('');
    return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" data-open="node:context" tabindex="0" aria-label="Context history"><rect width="${width}" height="${height}" fill="#101010"/><line x1="0" x2="${width}" y1="${y(70)}" y2="${y(70)}" stroke="#ffad1f" stroke-width=".7" opacity=".6"/><line x1="0" x2="${width}" y1="${y(90)}" y2="${y(90)}" stroke="#ff4b3e" stroke-width=".7" opacity=".6"/>${comps}<polyline points="${pts}" fill="none" stroke="#f1ebdc" stroke-width="1.3"/></svg>`;
  }
  function renderApronSide() {
    const p = S.context.percent; const L2 = lvl(p);
    let h = `<div class="apron-row" data-open="node:context" style="cursor:pointer"><div class="apron-big ${L2}">${p.toFixed(1)}%</div><div class="apron-sub">${fmtK(S.context.used)} of ${fmtK(S.context.capacity)} tokens parked<br>${S.context.compactions} compaction${S.context.compactions === 1 ? '' : 's'} (runway cleared)</div></div>`;
    h += `<div class="gauge ${L2}"><i style="width:${Math.min(100, p)}%"></i><b class="a" style="left:70%"></b><b class="r" style="left:90%"></b></div><div class="gscale"><span>0</span><span>amber 70 · red 90</span><span>100%</span></div>`;
    h += sparkSvg(340, 46, Math.max(S.session.startedAt, S.now - 30 * 60000));
    h += `<div class="muted" style="font-size:11px;margin-top:4px">Based aircraft (context files loaded):</div><ul class="based">${S.context.files.map(f => `<li><code>${codeFor('ctxfile:' + f.path)}</code><span>${esc(f.path)}</span><span class="t">${fmtK(f.tokens)}T</span></li>`).join('') || '<li class="muted">none yet</li>'}</ul>`;
    setHTML($('#s-apron'), h);
  }
  const TST = { pending: 'SCHEDULED', in_progress: 'BOARDING', completed: '✓ DEPARTED' };
  function renderSched() {
    const t = S.tasks.items;
    const n = s => t.filter(x => x.status === s).length;
    let h = `<div class="sched-sum"><b>${n('completed')}</b> of <b>${t.length}</b> departed · <b>${n('in_progress')}</b> boarding · <b>${n('pending')}</b> scheduled</div>`;
    h += t.map(x => `<div class="task" data-open="node:plan" tabindex="0"><span class="tst ${x.status}">${TST[x.status] || x.status}</span><div><div>${esc(x.id)}. ${esc(x.label)}</div><div class="thist">${x.history.map(e => `<span>${hhmm(e.time)} ${(TST[e.status] || e.status).replace('✓ ', '')}</span>`).join(' → ')}</div></div></div>`).join('');
    setHTML($('#s-sched'), h || '<div class="muted">No schedule yet</div>');
  }
  function renderTraffic() {
    const files = Object.values(S.files).sort((a, b) => b.lastTouched - a.lastTouched);
    let h = '<table class="traffic"><thead><tr><th></th><th>AIRPORT</th><th title="Reads">ARR</th><th title="Edits">DEP</th><th title="Failed calls">✕</th><th>+ / −</th></tr></thead><tbody>';
    for (const f of files) h += `<tr data-open="node:file:${esc(f.path)}" tabindex="0"><td class="code">${codeFor('file:' + f.path)}</td><td class="f" title="${esc(f.path)}">${esc(f.path)} ${f.edits >= 3 ? '<span class="hotb">HOT</span>' : ''}</td><td>${f.reads}</td><td>${f.edits}</td><td>${f.failed ? `<span class="e">${f.failed}</span>` : '<span class="zero">0</span>'}</td><td><span class="add">+${f.added}</span> <span class="rem">−${f.removed}</span></td></tr>`;
    h += '</tbody></table><div class="muted" style="font-size:10.5px;margin-top:3px">ARR = reads (arrivals into context) · DEP = edits (departures to disk) · HOT = edited 3+ times</div>';
    setHTML($('#s-traffic'), h);
  }
  function laneFacts(l) {
    const parent = l.parent ? (l.parent === 'main' ? 'main' : laneCode(l.parent)) : '—';
    return `depth ${l.depth} · parent ${parent} · ${hhmm(l.startedAt)}–${l.endedAt ? hhmm(l.endedAt) : 'now'} · ${l.calls} calls · ${l.errors ? `<span class="e">${l.errors} err</span>` : '0 err'} · ${fmtK(l.tokens)} tok`;
  }
  function renderSats2() {
    const lanes = S.lanes.slice().reverse();
    const h = lanes.map(l => {
      const st = l.state === 'running' ? '<span class="ok-t">● OPEN</span>' : l.state === 'failed' ? '<span class="err-t">✕ CLOSED · FAILED</span>' : '<span class="muted">✓ CLOSED</span>';
      return `<div class="satcard ${l.state}" data-open="node:${l.key === 'main' ? 'model' : 'lane:' + l.key}" tabindex="0"><div class="t1"><b>${laneCode(l.key)}</b><span>${'↳ '.repeat(Math.max(0, l.depth - 1))}${esc(l.label)}</span><span class="st">${st}</span></div>
        <div class="facts">${esc(l.agentType)} · ${esc(l.model)} · ${laneFacts(l)}</div>${l.task ? `<div class="brief">Brief: ${esc(l.task)}</div>` : ''}${l.result ? `<div class="res ${l.state === 'failed' ? 'err-t' : 'ok-t'}">Result: ${esc(l.result)}</div>` : ''}</div>`;
    }).join('');
    setHTML($('#s-sats'), h);
  }
  function logEvents(limit) {
    const ev = [];
    for (const c of S.calls.slice(-80)) ev.push({ time: c.startedAt, key: `${c.kind}|${c.tool}|${c.status}|${c.target && c.target.value}`, c });
    for (const m of S.markers.slice(-30)) ev.push({ time: m.time, key: 'm|' + m.kind + m.label, m });
    ev.sort((a, b) => b.time - a.time);
    const out = [];
    for (const e of ev) { const last = out[out.length - 1]; if (last && last.key === e.key) last.n++; else out.push({ ...e, n: 1 }); if (out.length >= limit) break; }
    return out;
  }
  function renderLog() {
    const h = logEvents(16).map(e => {
      if (e.m) {
        const sym = e.m.kind === 'prompt' ? '<span class="mk k-prompt">▼</span>' : e.m.kind === 'turn-complete' ? '<span class="mk k-turn">◆</span>' : e.m.kind === 'compaction' ? '<span class="mk k-comp">≋</span>' : '<span class="mk muted">+</span>';
        return `<div class="logrow" data-open="${e.m.kind === 'compaction' || e.m.kind === 'context-file' ? 'node:context' : e.m.kind === 'prompt' ? 'node:user' : 'node:answer'}" tabindex="0"><span class="tm">${hms(e.time)}</span>${sym}<span class="tx">${esc(e.m.label)}</span>${e.n > 1 ? `<span class="xn">×${e.n}</span>` : ''}</div>`;
      }
      const c = e.c; const st = c.status === 'running' ? '<span class="run-t">IN FLIGHT</span>' : c.status === 'error' ? `<span class="err-t">✕ ${esc(c.error.code)}</span>` : '<span class="ok-t">LANDED</span>';
      return `<div class="logrow" data-open="call:${c.id}" tabindex="0"><span class="tm">${hms(e.time)}</span><span class="mk">${logo(c.kind, 13)}</span><span class="tx"><b class="mono">${flightNo(c)}</b> ${esc(c.label)} · ${st}</span>${e.n > 1 ? `<span class="xn">×${e.n}</span>` : ''}</div>`;
    }).join('');
    setHTML($('#s-log'), h);
  }

  // ---------- timeline ----------
  function renderTimeline() {
    const svg = $('#timeline'); const W = Math.max(300, svg.clientWidth || 900), H = Math.max(40, svg.clientHeight || 70);
    const span = 30 * 60000; const t0 = S.now - span; const left = 26, right = W - 6;
    const x = t => left + (t - t0) / span * (right - left);
    const rowH = (H - 14) / 7;
    let h = '';
    for (let m = 0; m <= 30; m++) { const xx = x(t0 + m * 60000); h += `<line class="tl-grid" x1="${n1(xx)}" x2="${n1(xx)}" y1="2" y2="${H - 11}"/>`; if (m % 5 === 0) h += `<text class="tl-lbl" x="${n1(xx)}" y="${H - 1}" text-anchor="middle">${m === 30 ? 'now' : '−' + (30 - m) + 'm'}</text>`; }
    KINDS.forEach((k, i) => { h += `<text class="tl-kind" x="2" y="${n1(4 + i * rowH + rowH * 0.75)}" fill="${AIR[k].color}">${AIR[k].code}</text>`; });
    for (const c of S.calls) {
      if (c.startedAt < t0) continue;
      const i = KINDS.indexOf(c.kind); const y = 3 + i * rowH;
      const w = Math.max(1.6, ((c.endedAt || S.now) - c.startedAt) / span * (right - left));
      h += `<rect x="${n1(x(c.startedAt))}" y="${n1(y)}" width="${n1(w)}" height="${n1(rowH - 1.5)}" fill="${c.status === 'error' ? '#ff4b3e' : AIR[c.kind].color}" opacity="${c.status === 'running' ? 1 : 0.85}"/>`;
      if (c.status === 'error') h += `<text x="${n1(x(c.startedAt))}" y="${n1(y + rowH - 1)}" fill="#ff4b3e" font-size="${n1(rowH + 1)}" font-weight="800" text-anchor="middle">✕</text>`;
    }
    for (const m of S.markers) {
      if (m.time < t0) continue; const xx = x(m.time);
      if (m.kind === 'prompt') h += `<line x1="${n1(xx)}" x2="${n1(xx)}" y1="0" y2="${H - 11}" stroke="#ffcd1c" stroke-width="1.2"/><text x="${n1(xx)}" y="9" fill="#ffcd1c" font-size="10" text-anchor="middle">▼</text>`;
      else if (m.kind === 'turn-complete') h += `<line x1="${n1(xx)}" x2="${n1(xx)}" y1="0" y2="${H - 11}" stroke="#4fd071" stroke-dasharray="2 2"/><text x="${n1(xx)}" y="${H - 12}" fill="#4fd071" font-size="10" text-anchor="middle">◆</text>`;
      else if (m.kind === 'compaction') h += `<line x1="${n1(xx)}" x2="${n1(xx)}" y1="0" y2="${H - 11}" stroke="#ffad1f" stroke-width="2"/><text x="${n1(xx + 3)}" y="10" fill="#ffad1f" font-size="11" font-weight="800">≋</text>`;
    }
    for (let m = 0; m < 30; m++) { const a = t0 + m * 60000; h += `<rect class="tl-min" data-open="minute:${Math.round(a)}" tabindex="0" x="${n1(x(a))}" y="0" width="${n1(x(a + 60000) - x(a))}" height="${H - 10}"><title>Inspect ${hhmm(a)}</title></rect>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = h;
  }

  // ---------- dossier (drill-down) ----------
  let dossierKey = null; const back = [];
  const link = (key, text, cls = '') => `<button type="button" class="lnk ${cls}" data-open="${esc(key)}">${text}</button>`;
  const callLink = c => link('call:' + c.id, `${logo(c.kind, 12)} ${flightNo(c)} ${esc(c.tool)}`, 'fl');
  const nodeLink = id => link('node:' + id, `<b>${esc(codeFor(id))}</b> ${esc(nameFor(id))}`);
  const kv = rows => `<dl class="kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const sec = (title, body) => `<div class="dsec"><h3>${title}</h3>${body}</div>`;
  function pill(c) {
    if (c.status === 'running') return `<span class="pill run">${esc(depStatus(c).t)}</span>`;
    if (c.status === 'error') return `<span class="pill err">✕ Diverted · ${esc(c.error.code)}</span>`;
    return `<span class="pill ok">${c.attempt > 1 ? '↻ Landed on attempt ' + c.attempt : '✓ Landed'}</span>`;
  }
  function refLink(r) {
    if (r.type === 'file') return nodeLink('file:' + r.value) + ` <span class="muted">${esc(r.role)}</span>`;
    if (r.type === 'url') { let host = ''; try { host = new URL(r.value).host; } catch (e) { host = ''; } const id = 'web:' + host; return (P[id] ? link('node:' + id, esc(r.value)) : esc(r.value)) + ` <span class="muted">${esc(r.role)}${r.title ? ' · ' + esc(r.title) : ''}</span>`; }
    if (r.type === 'lane') return nodeLink('lane:' + r.value) + ` <span class="muted">${esc(r.role)}</span>`;
    if (r.type === 'task') return link('node:plan', 'Task ' + esc(r.value)) + ` <span class="muted">${esc(r.role)}</span>`;
    return esc(r.type + ' ' + r.value);
  }
  function diffHtml(d) {
    return `<div><span class="add">+${d.added}</span> <span class="rem">−${d.removed}</span> lines</div>` + d.hunks.map(hk => `<pre><span class="n">@@ line ${hk.at} @@</span>\n${hk.lines.map(l => `<span class="${l[0] === '+' ? 'p' : l[0] === '-' ? 'm' : 'n'}">${esc(l)}</span>`).join('\n')}</pre>`).join('');
  }
  function nextAfterError(c) {
    const retries = S.calls.filter(x => x.retryOf === c.id);
    const follow = S.calls.filter(x => x.causedBy === c.id && x.retryOf !== c.id);
    const fixed = retries.find(x => x.status === 'success');
    let h = '';
    if (fixed) h += `<div class="ok-t">✓ Fixed: retried as ${callLink(fixed)} (attempt ${fixed.attempt}), landed.</div>`;
    else if (retries.length) h += `<div>${retries.map(r => `↻ Retry ${callLink(r)} · ${r.status === 'running' ? 'in flight' : r.status === 'error' ? '<span class="err-t">failed again</span>' : 'landed'}`).join('<br>')}</div>`;
    else h += '<div class="muted">No retry of this exact flight (yet).</div>';
    if (follow.length) h += `<div>Follow-up flights: ${follow.map(callLink).join(', ')}</div>`;
    return h;
  }
  function notam(c) {
    const e = c.error;
    return `<div class="notam"><div class="nh">▲ NOTAM · ${esc(e.name || 'Error')}</div><div class="code">${esc(e.code)}</div><div class="msg">${esc(e.message)}</div>${e.hint ? `<div class="hint">${esc(e.hint)}</div>` : ''}<div class="next"><b>What happened next</b>${nextAfterError(c)}</div></div>`;
  }
  function dCall(c) {
    const r = route(c);
    const durMs = c.endedAt != null ? c.endedAt - c.startedAt : S.now - c.startedAt;
    const caused = S.calls.filter(x => x.causedBy === c.id);
    const retries = S.calls.filter(x => x.retryOf === c.id);
    const lane = sim.laneByKey(c.lane);
    let h = `<div class="dh">${logo(c.kind, 30)}<div><div class="dtitle">${flightNo(c)} · ${esc(c.tool)}</div><div class="dsub">${esc(AIR[c.kind].name)} · ${esc(c.label)}</div></div>${pill(c)}</div>`;
    h += `<div class="droute">${nodeLink(r.from)}<span class="arrow">──✈──</span>${nodeLink(r.to)}<span class="muted" style="margin-left:auto">gate ${gateOf(c)}</span></div>`;
    if (c.error) h += notam(c);
    h += sec('Flight', kv([
      ['Lane', c.lane === 'main' ? nodeLink('model') + ' main session' : nodeLink('lane:' + c.lane) + (lane ? ` depth ${lane.depth}` : '')],
      ['Target', c.target ? `<span class="mono">${esc(c.target.type)}: ${esc(c.target.value)}</span>` : '—'],
      ['Departed', hms(c.startedAt)], ['Arrived', c.endedAt != null ? hms(c.endedAt) : '<span class="run-t">in the air</span>'],
      ['Duration', fmtDur(durMs) + (c.status === 'running' ? ' so far' : '')], ['Status', esc(c.status)],
      ['Attempt', c.attempt + (c.retryOf ? ` · retry of ${sim.callById(c.retryOf) ? callLink(sim.callById(c.retryOf)) : c.retryOf}` : '')],
      ['Tokens', c.status === 'running' ? '—' : `in ${c.tokens.in} · out ${c.tokens.out}`],
      ['Context after', c.contextAfter ? `<span class="${lvl(c.contextAfter.percent) === 'lv-ok' ? '' : lvl(c.contextAfter.percent) === 'lv-amber' ? 'run-t' : 'err-t'}">${c.contextAfter.percent}%</span> (${fmtK(c.contextAfter.used)} tokens)` : '—'],
      ['Payload', payloadOf(c)]
    ]));
    h += sec(`Itinerary · ${c.flow.length} leg${c.flow.length === 1 ? '' : 's'}`, `<table class="legs"><thead><tr><th>#</th><th>FROM</th><th>TO</th><th>CARGO</th><th>TOK</th><th>BYTES</th></tr></thead><tbody>${c.flow.map((hop, i) => `<tr><td class="n">${i + 1}</td><td>${nodeLink(hop.from)}</td><td>${nodeLink(hop.to)}</td><td>${esc(hop.what)}</td><td class="n">${hop.tokens ?? ''}</td><td class="n">${hop.bytes ?? ''}</td></tr>`).join('')}</tbody></table>${c.status === 'running' ? '<div class="muted">More legs are filed when the flight lands.</div>' : ''}`);
    h += sec('Input arguments', `<pre>${esc(JSON.stringify(c.input, null, 2))}</pre>`);
    if (c.output) {
      const o = c.output;
      h += sec('Output', kv([['Summary', esc(o.summary)], o.exitCode !== undefined ? ['Exit code', o.exitCode == null ? '—' : `<span class="${o.exitCode === 0 ? 'ok-t' : 'err-t'}">${o.exitCode}</span>`] : null, o.status ? ['HTTP status', esc(o.status)] : null, o.lines != null ? ['Lines', o.lines] : null, o.bytes != null ? ['Bytes', fmtK(o.bytes)] : null]) + (o.preview ? `<pre>${o.preview.map(esc).join('\n')}</pre>` : ''));
      if (o.tests) h += sec('Tests', `<div class="tests"><b class="ok-t">${o.tests.passed} passed</b> · <b class="${o.tests.failed ? 'err-t' : 'muted'}">${o.tests.failed} failed</b> · ${o.tests.skipped} skipped</div>${o.tests.failures.length ? `<ul class="list">${o.tests.failures.map(n => `<li class="err-t">✕ ${esc(n)}</li>`).join('')}</ul>` : ''}`);
    }
    if (c.diff) h += sec('Diff', diffHtml(c.diff));
    if (c.refs.length) h += sec('References', `<ul class="list">${c.refs.map(rf => `<li>${refLink(rf)}</li>`).join('')}</ul>`);
    const cause = c.causedBy && sim.callById(c.causedBy);
    h += sec('Connecting itinerary (cause chain)', kv([
      ['Caused by', cause ? callLink(cause) + ` <span class="muted">${esc(cause.label)}${cause.error ? ' · ' + esc(cause.error.code) : ''}</span>` : '<span class="muted">nothing recorded</span>'],
      ['Led to', caused.length ? caused.map(callLink).join(', ') : '<span class="muted">nothing yet</span>'],
      ['Retries', retries.length ? retries.map(x => callLink(x) + ' ' + (x.status === 'success' ? '<span class="ok-t">landed</span>' : x.status === 'error' ? '<span class="err-t">failed</span>' : '<span class="run-t">in flight</span>')).join(', ') : '<span class="muted">none</span>']
    ]) + '<div class="muted" style="font-size:11px">Shown on the map as yellow dashed connections.</div>');
    return h;
  }
  function flightList(calls, extra) {
    if (!calls.length) return '<div class="muted">No flights yet.</div>';
    return `<ul class="list">${calls.map(c => `<li><span class="tm">${hms(c.startedAt)}</span>${callLink(c)} ${c.status === 'error' ? `<span class="err-t">✕ ${esc(c.error.code)}</span>` : c.status === 'running' ? '<span class="run-t">in flight</span>' : '<span class="ok-t">landed</span>'} ${extra ? extra(c) : ''}</li>`).join('')}</ul>`;
  }
  function dNode(id) {
    if (id.startsWith('tool:')) return dKind(id.slice(5));
    if (id.startsWith('lane:')) return dLane(id.slice(5));
    const head = (sub, extra = '') => `<div class="dh"><span class="pict" style="width:34px;height:34px;font-size:13px">${esc(codeFor(id))}</span><div><div class="dtitle">${esc(nameFor(id))}</div><div class="dsub">${sub}</div></div>${extra}</div>`;
    if (id.startsWith('file:')) {
      const path = id.slice(5); const f = S.files[path];
      const calls = sim.callsForFile(path);
      let h = head(`Disk airport · <span class="mono">${esc(path)}</span>`, f && f.edits >= 3 ? '<span class="hotb" style="margin-left:auto">HOT</span>' : '');
      h += sec('Traffic', f ? kv([['Arrivals (reads)', f.reads], ['Departures (edits)', f.edits], ['Failed calls', f.failed ? `<span class="e">✕ ${f.failed}</span>` : 0], ['Lines', `<span class="add">+${f.added}</span> <span class="rem">−${f.removed}</span> · now ${f.lines} lines`], ['Last touched', hms(f.lastTouched)]]) : '<div class="muted">No traffic yet.</div>');
      h += sec(`Every flight that touched it · ${calls.length}`, calls.length ? `<ul class="list">${calls.map(c => `<li><span class="tm">${hms(c.startedAt)}</span>${callLink(c)} ${c.status === 'error' ? `<span class="err-t">✕ ${esc(c.error.code)} · ${esc(c.error.message)}</span>` : c.status === 'running' ? '<span class="run-t">in flight</span>' : '<span class="ok-t">' + esc(c.output ? c.output.summary : 'landed') + '</span>'}${c.diff ? diffHtml(c.diff) : ''}</li>`).join('')}</ul>` : '<div class="muted">None.</div>');
      return h;
    }
    if (id === 'context') {
      const p = S.context.percent;
      const by = {};
      for (const s of S.context.samples) if (s.delta > 0) { const k = s.callId || s.why; (by[k] = by[k] || { k, why: s.why, callId: s.callId, t: 0 }).t += s.delta; }
      const top = Object.values(by).sort((a, b) => b.t - a.t).slice(0, 10); const max = top.length ? top[0].t : 1;
      let h = head('Mega-airport · the model\'s context window', `<span class="pill ${p >= 90 ? 'err' : p >= 70 ? 'run' : 'ok'}" style="margin-left:auto">${p.toFixed(1)}%</span>`);
      h += sec('Apron', kv([['Used', `${fmtK(S.context.used)} of ${fmtK(S.context.capacity)} tokens`], ['Level', p >= 90 ? '<span class="err-t">red (90%+)</span>' : p >= 70 ? '<span class="run-t">amber (70%+)</span>' : 'normal'], ['Compactions', S.context.compactions]]) + sparkSvg(360, 60, S.session.startedAt));
      h += sec('Biggest contributors', `<div class="bars">${top.map(x => { const c = x.callId && sim.callById(x.callId); return `<div>${c ? callLink(c) : esc(x.why)}<div class="b"><i style="width:${n1(x.t / max * 100)}%"></i></div></div><div class="mono" style="text-align:right">${fmtK(x.t)}T</div>`; }).join('')}</div>`);
      const comps = S.markers.filter(m => m.kind === 'compaction');
      h += sec('Compactions · runway clearings', comps.length ? `<ul class="list">${comps.map(m => `<li><span class="tm">${hms(m.time)}</span>${esc(m.label)}</li>`).join('')}</ul>` : '<div class="muted">None yet.</div>');
      h += sec('Context files · based aircraft', `<ul class="list">${S.context.files.map(f => `<li><span class="tm">${hms(f.loadedAt)}</span><b class="mono">${codeFor('ctxfile:' + f.path)}</b> ${esc(f.path)} · ${fmtK(f.tokens)}T<br><span class="muted">${esc(f.why)}</span></li>`).join('')}</ul>`);
      return h;
    }
    if (id === 'terminal') {
      const calls = S.calls.filter(c => c.kind === 'shell').slice(-30).reverse();
      return head('Terminal · every command and its exit code') + sec(`Commands · ${calls.length} latest`, flightList(calls, c => `<br><span class="mono">$ ${esc(c.input.command)}</span> · ${c.output ? `exit <b class="${c.output.exitCode === 0 ? 'ok-t' : 'err-t'}">${c.output.exitCode ?? '—'}</b>` : ''}${c.output && c.output.tests ? ` · tests ${c.output.tests.passed}/${c.output.tests.passed + c.output.tests.failed}` : ''} · ${fmtDur((c.endedAt || S.now) - c.startedAt)}`));
    }
    if (id === 'plan') {
      const t = S.tasks.items;
      const calls = S.calls.filter(c => c.kind === 'memory').slice(-15).reverse();
      return head('Plan tower · the agent\'s task list', `<span class="pill turn" style="margin-left:auto">${t.filter(x => x.status === 'completed').length}/${t.length}</span>`) +
        sec('Schedule', t.map(x => `<div class="task"><span class="tst ${x.status}">${TST[x.status]}</span><div><div>${esc(x.id)}. ${esc(x.label)}</div><div class="thist">${x.history.map(e => { const c = sim.callById(e.callId); return `${hhmm(e.time)} ${TST[e.status]} ${c ? '(' + link('call:' + c.id, flightNo(c)) + ')' : ''}`; }).join(' → ')}</div></div></div>`).join('')) +
        sec('Shuttle flights', flightList(calls, c => `<span class="muted">${esc(c.output ? c.output.summary : '')}</span>`));
    }
    if (id.startsWith('web:') || id === 'mcp:github') {
      const calls = S.calls.filter(c => (c.kind === 'network' || c.kind === 'other') && route(c).from === id).reverse();
      return head(id === 'mcp:github' ? 'MCP server · regional airport' : id === 'web:search' ? 'Web search · results from many hosts' : 'Web host · international airport') +
        sec(`Fetches · ${calls.length}`, flightList(calls, c => `<br><span class="mono">${esc(c.target.value)}</span> · ${c.error ? `<span class="err-t">${esc(c.error.code)}</span>` : c.output ? `status ${esc(c.output.status || 'OK')} · ${c.output.bytes ? fmtK(c.output.bytes) + 'B' : ''}` : ''}`));
    }
    if (id === 'model') {
      const l = S.lanes[0];
      return head('Model · main session') + sec('Main lane', `<div class="facts">${laneFacts(l)}</div>`) + sec('In the air now', flightList(sim.runningCalls())) + sec('Latest flights', flightList(S.calls.filter(c => c.lane === 'main').slice(-15).reverse()));
    }
    if (id === 'user' || id === 'answer') {
      const ms = S.markers.filter(m => m.kind === (id === 'user' ? 'prompt' : 'turn-complete')).reverse();
      return head(id === 'user' ? 'Userland · prompts arrive here' : 'Reply · where each turn lands') + sec(id === 'user' ? 'Prompts' : 'Turn completes', `<ul class="list">${ms.map(m => `<li><span class="tm">${hms(m.time)}</span>${esc(m.label)}</li>`).join('')}</ul>`);
    }
    if (id === 'disk') {
      return head('Disk · all file airports') + sec('Airports', `<ul class="list">${Object.values(S.files).map(f => `<li>${nodeLink('file:' + f.path)} ▼${f.reads} ▲${f.edits}${f.failed ? ` <span class="e">✕${f.failed}</span>` : ''}</li>`).join('')}</ul>`) + sec('Searches', flightList(S.calls.filter(c => c.kind === 'files' && c.tool !== 'Read').slice(-12).reverse(), c => `<span class="muted">${esc(c.output ? c.output.summary : '')}</span>`));
    }
    return head('Airport');
  }
  function dLane(key) {
    const l = sim.laneByKey(key); if (!l) return '<div class="muted">Unknown airfield.</div>';
    const calls = S.calls.filter(c => c.lane === key);
    const kids = S.lanes.filter(x => x.parent === key);
    const st = l.state === 'running' ? '<span class="pill ok">● Open</span>' : l.state === 'failed' ? '<span class="pill err">✕ Closed · failed</span>' : '<span class="pill quiet">✓ Closed</span>';
    let h = `<div class="dh"><span class="pict" style="width:34px;height:34px;font-size:13px">${laneCode(key)}</span><div><div class="dtitle">${esc(l.label)}</div><div class="dsub">Satellite airfield · subagent lane · ${esc(l.agentType)} · ${esc(l.model)}</div></div><span style="margin-left:auto">${st}</span></div>`;
    h += sec('Airfield', kv([['Depth', l.depth], ['Parent', l.parent === 'main' ? nodeLink('model') : nodeLink('lane:' + l.parent)], ['Opened', hms(l.startedAt)], ['Closed', l.endedAt ? hms(l.endedAt) : 'still open'], ['Flights', l.calls], ['Errors', l.errors ? `<span class="e">✕ ${l.errors}</span>` : 0], ['Tokens', fmtK(l.tokens)], ['Nested airfields', kids.length ? kids.map(k => nodeLink('lane:' + k.key)).join(', ') : 'none']]));
    h += sec('Brief (task)', `<pre>${esc(l.task || '—')}</pre>`);
    h += sec('Final result', l.result ? `<div class="${l.state === 'failed' ? 'err-t' : 'ok-t'}">${esc(l.result)}</div>` : '<div class="muted">Not closed yet.</div>');
    const charters = S.calls.filter(c => c.kind === 'agents' && spawnedLane(c) === key);
    h += sec('Charter flights', flightList(charters));
    h += sec(`Flights from this airfield · ${calls.length}`, flightList(calls));
    return h;
  }
  function dKind(k) {
    const a = AIR[k]; const calls = S.calls.filter(c => c.kind === k);
    const esp = sim.errorsSincePrompt()[k] || 0; const errs = calls.filter(c => c.status === 'error');
    let h = `<div class="dh">${logo(k, 30)}<div><div class="dtitle">${a.code} · ${a.name}</div><div class="dsub">Gate ${a.gate} · tools ${sim.kindInfo[k].tools.join(', ')}</div></div></div>`;
    h += `<div class="droute">${esc(a.how)}</div>`;
    h += sec('Stats', kv([['Flights', calls.length], ['In the air', calls.filter(c => c.status === 'running').length], ['Errors since prompt', esp ? `<span class="e">✕ ${esp}</span>` : 0], ['Errors total', errs.length]]));
    if (errs.length) h += sec('NOTAMs', `<ul class="list">${errs.slice(-8).reverse().map(c => `<li><span class="tm">${hms(c.startedAt)}</span>${link('err:' + c.id, '▲ ' + esc(c.error.code))} on ${callLink(c)}</li>`).join('')}</ul>`);
    h += sec('Latest flights', flightList(calls.slice(-20).reverse()));
    return h;
  }
  function dErr(c) {
    const lane = sim.laneByKey(c.lane);
    let h = `<div class="dh"><svg width="30" height="30" viewBox="-10 -10 20 20"><path d="M0 -8L8 6H-8Z" fill="#ff4b3e"/><text y="4" fill="#fff" font-size="9" font-weight="900" text-anchor="middle">!</text></svg><div><div class="dtitle">NOTAM ${esc(c.error.code)}</div><div class="dsub">${esc(c.error.name || '')} · diverted at ${nodeLink(incidentNode(c))}</div></div></div>`;
    h += notam(c);
    h += sec('Flight', kv([['Call', callLink(c) + ' ' + esc(c.label)], ['Lane', c.lane === 'main' ? 'main session' : nodeLink('lane:' + c.lane) + (lane ? ' depth ' + lane.depth : '')], ['When', hms(c.startedAt)], ['Attempt', c.attempt], ['Caused by', c.causedBy && sim.callById(c.causedBy) ? callLink(sim.callById(c.causedBy)) : '—']]));
    if (c.output) h += sec('Output', `<pre>${esc(c.output.summary)}${c.output.preview ? '\n' + c.output.preview.map(esc).join('\n') : ''}</pre>`);
    return h;
  }
  function dMinute(t) {
    const calls = S.calls.filter(c => c.startedAt >= t && c.startedAt < t + 60000);
    const ms = S.markers.filter(m => m.time >= t && m.time < t + 60000);
    return `<div class="dh"><span class="pict" style="width:34px;height:34px">◷</span><div><div class="dtitle">${hhmm(t)} – ${hhmm(t + 60000)}</div><div class="dsub">One minute of traffic · ${calls.length} flights · ${calls.filter(c => c.status === 'error').length} errors</div></div></div>` +
      (ms.length ? sec('Markers', `<ul class="list">${ms.map(m => `<li><span class="tm">${hms(m.time)}</span>${esc(m.label)}</li>`).join('')}</ul>`) : '') + sec('Flights', flightList(calls));
  }
  function dossierHtml(key) {
    const i = key.indexOf(':'); const kind = key.slice(0, i), id = key.slice(i + 1);
    if (kind === 'call') { const c = sim.callById(id); return c ? ['FLIGHT DOSSIER', dCall(c)] : null; }
    if (kind === 'err') { const c = sim.callById(id); return c && c.error ? ['NOTAM · INCIDENT', dErr(c)] : null; }
    if (kind === 'node') return [id.startsWith('lane:') ? 'AIRFIELD INFO' : id.startsWith('tool:') ? 'AIRLINE INFO' : 'AIRPORT INFO', dNode(id)];
    if (kind === 'kind') return ['AIRLINE INFO', dKind(id)];
    if (kind === 'minute') return ['TRAFFIC MINUTE', dMinute(Number(id))];
    return null;
  }
  function renderDossier() {
    const d = $('#dossier');
    if (!dossierKey) { d.hidden = true; return; }
    const r = dossierHtml(dossierKey); if (!r) { d.hidden = true; return; }
    const html = `<div class="dbar"><button type="button" id="dback" ${back.length ? '' : 'disabled'} title="Back">◀</button><span class="dk">${r[0]}</span><span class="snap">${sim.running ? '● LIVE' : '❚❚ SNAPSHOT ' + hms(S.now)}</span><button type="button" id="dclose" title="Close (Esc)">✕ Close</button></div>${r[1]}`;
    if (d._h !== html) { const st = d.scrollTop; d.innerHTML = html; d._h = html; d.scrollTop = st; }
    d.hidden = false;
  }
  function open(key) {
    if (!key) return;
    if (dossierKey && dossierKey !== key) back.push(dossierKey);
    dossierKey = key;
    selectedCall = key.startsWith('call:') ? key.slice(5) : key.startsWith('err:') ? key.slice(4) : null;
    const d = $('#dossier'); d._h = ''; d.scrollTop = 0;
    renderAll(); renderDossier();
    const first = d.querySelector('#dclose'); if (first && document.activeElement && document.activeElement.closest && !document.activeElement.closest('#dossier')) first.focus({ preventScroll: true });
  }
  function close() { dossierKey = null; selectedCall = null; back.length = 0; renderAll(); renderDossier(); }

  // ---------- events ----------
  document.addEventListener('click', e => {
    if (e.target.closest('#dclose')) { close(); return; }
    if (e.target.closest('#dback')) { const k = back.pop(); if (k) { dossierKey = null; open(k); } return; }
    const sp = e.target.closest('[data-speed]'); if (sp) { sim.setSpeed(Number(sp.dataset.speed)); document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', b === sp)); return; }
    if (e.target.closest('#pause')) { togglePause(); return; }
    const t = e.target.closest('[data-open]'); if (t && t.getAttribute('data-open')) open(t.getAttribute('data-open'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dossierKey) { close(); return; }
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute && t.getAttribute('data-open') && t.tagName !== 'BUTTON') { e.preventDefault(); open(t.getAttribute('data-open')); return; }
    if (e.key === ' ' && (t === document.body || !t)) { e.preventDefault(); togglePause(); }
  });
  function togglePause() { if (sim.running) sim.pause(); else sim.start(); renderMode(); renderDossier(); }

  sim.on('start', c => { noteRecord(c.startedAt); launch(c); });
  sim.on('end', c => { noteRecord(c.endedAt); landResult(c); });
  sim.on('marker', m => {
    noteRecord(m.time);
    if (m.kind === 'prompt') { fly({ from: P.user, to: P.context, kind: 'files', cls: 'prompt', scale: 0.8 }); stamp(P.user, 'PROMPT', '#ffcd1c', -14); }
    else if (m.kind === 'turn-complete') fly({ from: P.context, to: P.answer, kind: 'files', cls: 'reply', scale: 0.8, onDone: () => stamp(P.answer, 'REPLY LANDED', '#4fd071', -14) });
    else if (m.kind === 'compaction') {
      L.apron._clearing = true;
      L.apron.querySelector('#banner').innerHTML = '<g class="banner" transform="translate(628 212)"><rect width="150" height="14" rx="2"/><text x="6" y="10">≋ RUNWAY CLEARING · COMPACTION</text></g>';
      setTimeout(() => { L.apron._clearing = false; L.apron.querySelector('#banner').innerHTML = ''; }, 4000);
    } else if (m.kind === 'context-file') stamp(P.context, 'BASED +1', '#f1ebdc', 30);
  });
  sim.on('lane', l => {
    noteRecord(S.now);
    if (l.key === 'main') return;
    laneCode(l.key);
    if (l.state === 'running') { const s = assignSlot(l.key); if (s != null) { stamp(SLOTS[s], 'NOW OPEN', '#4fd071', -22); pulse(SLOTS[s], '#4fd071'); } }
    else if (slotOf[l.key] != null) stamp(SLOTS[slotOf[l.key]], l.state === 'failed' ? '✕ CLOSED' : '✓ CLOSED', l.state === 'failed' ? '#ff4b3e' : '#c8c0b0', -22);
    renderSats();
  });
  sim.on('tick', () => renderAll());

  let lastSlow = 0;
  function renderAll() {
    renderBoards(); renderHeader(); renderMode(); renderApron(); renderAirports(); renderSats(); renderIncidents(); renderItin();
    const now = performance.now();
    if (now - lastSlow > 900 || !sim.running) {
      lastSlow = now;
      renderGates(); renderApronSide(); renderSched(); renderTraffic(); renderSats2(); renderLog(); renderTimeline();
      if (sim.running) renderDossier();
    }
  }

  let lastTs = performance.now();
  function frame(ts) {
    const dt = Math.min(120, ts - lastTs); lastTs = ts;
    if (sim.running) animNow += dt * sim.speed;
    stepFlights(); flapTick(ts);
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------
  for (const l of S.lanes) if (l.key !== 'main') laneCode(l.key);
  for (const l of S.lanes.filter(x => x.key !== 'main').slice(-SLOTS.length)) assignSlot(l.key);
  for (const c of S.calls) { noteRecord(c.endedAt || c.startedAt); }
  for (const m of S.markers) noteRecord(m.time);
  buildClock(); buildMap();
  layoutBoards();
  for (const c of sim.runningCalls()) { c._shown = 1; const hp = holdPoint(c); hold(c, pos(hp.node), { countdown: hp.countdown, r: 12 }); }
  renderAll(); renderGates(); renderApronSide(); renderSched(); renderTraffic(); renderSats2(); renderLog(); renderTimeline();
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layoutBoards(); renderTimeline(); }, 120); });
  sim.start();
  requestAnimationFrame(frame);
})();
