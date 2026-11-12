/* AgentViz concept 07: Mixing Console.
 * The session is a studio desk. One channel strip per tool kind and per subagent lane, a master section for the
 * model whose bus meter is the context window, a patch bay where every flow hop is a patch cable, output meters for
 * every destination, and a multitrack tape of the last 30 minutes. Everything on screen is derived from the shared
 * simulator at a "view time": live (now) or a rewound moment picked on the tape.
 */
(function () {
  'use strict';

  const sim = AgentVizSim.create({ seed: 7, history: 30 });
  const S = sim.state;
  const KINDS = sim.kinds;
  const KI = sim.kindInfo;

  // ---------- palette: one saturated cable colour per kind; red is reserved for errors ----------
  const COL = {
    files: { c: '#1d5bd6', g: '#86b0ff' },
    edits: { c: '#f2c300', g: '#ffe36e' },
    shell: { c: '#0f9f48', g: '#62ea94' },
    network: { c: '#ff6c00', g: '#ffad6b' },
    agents: { c: '#7a2fd8', g: '#c4a0ff' },
    memory: { c: '#00a6c8', g: '#6ae6ff' },
    other: { c: '#d8259f', g: '#ff8ad8' },
    sys: { c: '#e9dfc2', g: '#f3ead2' },
    err: { c: '#e2101d', g: '#ff6155' }
  };
  const SIGNAL = { files: 'steady sine', edits: 'square bursts', shell: 'sawtooth with a tail while running', network: 'noise burst from outside', agents: 'sidechain trigger', memory: 'single click', other: 'triangle' };
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const WIN30 = 30 * 60000;
  const CABLE_WIN = 150000;
  const SCOPE_WIN = 24000;
  const SEG = 18;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const view = { inspect: null, sel: null, mute: new Set(), solo: new Set() };
  const vt = () => (view.inspect != null ? view.inspect : S.now);

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const pad = n => String(n).padStart(2, '0');
  const clock = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const dur = ms => ms == null ? '-' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`;
  const ago = ms => ms < 1500 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)}s ago` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s ago`;
  const kfmt = n => n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
  const bfmt = b => b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1000 ? `${(b / 1000).toFixed(1)} KB` : `${b} B`;
  const hopSize = h => h.tokens || (h.bytes ? h.bytes / 4 : 0);
  const hopAmount = h => [h.tokens ? `${kfmt(h.tokens)} tok` : '', h.bytes ? bfmt(h.bytes) : ''].filter(Boolean).join(' / ') || 'signal only';
  const base = p => String(p).split('/').pop();
  const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const isDone = (c, t) => c.endedAt != null && c.endedAt <= t;
  const lk = (key, text) => `<span class="lk" data-open="${esc(key)}" tabindex="0" role="button">${esc(text)}</span>`;
  const setHTML = (el, html) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } };
  const targetText = c => c.target ? c.target.value : '';
  const kindName = k => (KI[k] ? KI[k].name : k);
  function glyphSVG(kind, err) {
    const c = err ? COL.err.c : (COL[kind] || COL.sys).c;
    const shapes = {
      files: `<circle cx="6" cy="6" r="4.5" fill="${c}"/>`,
      edits: `<rect x="1.5" y="1.5" width="9" height="9" fill="${c}"/>`,
      shell: `<path d="M1 10 L9 2 L9 10 Z" fill="${c}"/>`,
      network: `<circle cx="3" cy="4" r="2" fill="${c}"/><circle cx="8" cy="3" r="1.6" fill="${c}"/><circle cx="6" cy="8" r="2.2" fill="${c}"/><circle cx="10" cy="8" r="1.2" fill="${c}"/>`,
      agents: `<path d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 Z" fill="${c}"/>`,
      memory: `<circle cx="6" cy="6" r="4" fill="none" stroke="${c}" stroke-width="2"/>`,
      other: `<path d="M6 1 L11 10.5 L1 10.5 Z" fill="${c}"/>`
    };
    const x = err ? '<path d="M3 3 L9 9 M9 3 L3 9" stroke="#fff" stroke-width="1.6"/>' : '';
    return `<svg class="glyph" viewBox="0 0 12 12" aria-hidden="true">${shapes[kind] || shapes.files}${x}</svg>`;
  }

  // ---------- derived state at a view time ----------
  let D = null;
  function derive(t) {
    const calls = [];
    for (const c of S.calls) { if (c.startedAt > t) break; calls.push(c); }
    const markers = S.markers.filter(m => m.time <= t);
    let lastPrompt = null, lastTurn = null;
    for (const m of markers) { if (m.kind === 'prompt') lastPrompt = m; if (m.kind === 'turn-complete') lastTurn = m; }
    const since = lastPrompt ? lastPrompt.time : 0;
    const kinds = {};
    for (const k of KINDS) kinds[k] = { count: 0, errors: 0, esp: 0, dur: 0, n: 0, ok: 0, running: [], last: null, lastErr: null, tokens: 0, tools: {} };
    const lanes = new Map();
    for (const l of S.lanes) if (l.startedAt <= t) lanes.set(l.key, { lane: l, state: l.endedAt != null && l.endedAt <= t ? l.state : 'running', calls: 0, errors: 0, tokens: 0, running: [], ok: 0, n: 0, dur: 0, last: null, lastErr: null });
    const files = {};
    const F = p => files[p] || (files[p] = { path: p, reads: 0, edits: 0, failed: 0, added: 0, removed: 0, touches: [], last: 0 });
    let errors = 0, tin = 0, tout = 0, lastRecord = S.session.startedAt;
    for (const c of calls) {
      const K = kinds[c.kind], L = lanes.get(c.lane);
      K.count++; K.last = c; K.tools[c.tool] = (K.tools[c.tool] || 0) + 1;
      if (L) { L.calls++; L.last = c; }
      lastRecord = Math.max(lastRecord, c.startedAt);
      if (!isDone(c, t)) { K.running.push(c); if (L) L.running.push(c); continue; }
      lastRecord = Math.max(lastRecord, c.endedAt);
      const d = c.endedAt - c.startedAt, tk = c.tokens.in + c.tokens.out;
      K.n++; K.dur += d; K.tokens += tk; tin += c.tokens.in; tout += c.tokens.out;
      if (L) { L.n++; L.dur += d; L.tokens += tk; }
      if (c.status === 'error') { errors++; K.errors++; K.lastErr = c; if (c.startedAt >= since) K.esp++; if (L) { L.errors++; L.lastErr = c; } }
      else { K.ok++; if (L) L.ok++; }
      if (c.kind === 'files' && c.tool === 'Read') { const r = c.refs.find(x => x.type === 'file'); if (r) { const f = F(r.value); if (c.status === 'error') f.failed++; else f.reads++; f.touches.push(c); f.last = c.endedAt; } }
      if (c.kind === 'edits' && c.target) { const f = F(c.target.value); if (c.status === 'error') f.failed++; else { f.edits++; if (c.diff) { f.added += c.diff.added; f.removed += c.diff.removed; } } f.touches.push(c); f.last = c.endedAt; }
    }
    for (const m of markers) lastRecord = Math.max(lastRecord, m.time);
    let ctx = { percent: 0, used: 0 };
    const samples = S.context.samples;
    for (let i = samples.length - 1; i >= 0; i--) if (samples[i].time <= t) { ctx = samples[i]; break; }
    const compactions = markers.filter(m => m.kind === 'compaction');
    const ctxFiles = S.context.files.filter(f => f.loadedAt <= t);
    const tasks = S.tasks.items.map(it => { const h = it.history.filter(x => x.time <= t); return h.length ? { ...it, status: h[h.length - 1].status, history: h } : null; }).filter(Boolean);
    const turn = markers.filter(m => m.kind === 'prompt').length;
    const quiet = t - lastRecord;
    const status = lastTurn && (!lastPrompt || lastTurn.time > lastPrompt.time) ? 'turn complete' : quiet < 20000 ? 'recent activity' : 'quiet';
    return { t, calls, markers, lastPrompt, lastTurn, kinds, lanes, files, errors, tin, tout, ctx, compactions, ctxFiles, tasks, turn, status, lastRecord };
  }

  // ---------- mute / solo filter (really filters the view) ----------
  function visible(c) {
    const ks = [], ls = [];
    for (const s of view.solo) (s.startsWith('lane:') ? ls : ks).push(s);
    const kOk = ks.length ? ks.includes(c.kind) : !view.mute.has(c.kind);
    const lOk = ls.length ? ls.includes('lane:' + c.lane) : !view.mute.has('lane:' + c.lane);
    return kOk && lOk;
  }
  function chVisible(ch) {
    const isLane = ch.startsWith('lane:');
    const solos = [...view.solo].filter(s => s.startsWith('lane:') === isLane);
    return solos.length ? solos.includes(ch) : !view.mute.has(ch);
  }

  // ---------- cause chains: ancestors via causedBy, descendants and retries ----------
  function chainOf(id) {
    const set = new Set();
    const c = sim.callById(id);
    if (!c) return set;
    set.add(c.id);
    let p = c;
    while (p && p.causedBy && !set.has(p.causedBy)) { set.add(p.causedBy); p = sim.callById(p.causedBy); }
    if (c.retryOf) set.add(c.retryOf);
    const desc = new Set([c.id]);
    let grew = true;
    while (grew) { grew = false; for (const x of S.calls) if (!desc.has(x.id) && (desc.has(x.causedBy) || desc.has(x.retryOf))) { desc.add(x.id); grew = true; } }
    desc.forEach(d => set.add(d));
    return set;
  }
  const selectedCallId = () => (view.sel && /^(call|error):/.test(view.sel) ? view.sel.split(':')[1] : null);

  // ================= PATCH BAY =================
  const bay = $('#bay');
  let bayW = 0, bayH = 0, jackSig = '', jackPos = new Map(), rowsY = [0, 0, 0];
  const NS = 'http://www.w3.org/2000/svg';
  function rowOf(n) { if (n.group === 'user' || n.group === 'contextfile' || n.group === 'web') return 0; if (n.group === 'model' || n.group === 'tool' || n.group === 'lane') return 1; return 2; }
  function jackLabel(n) {
    switch (n.group) {
      case 'user': return 'PROMPT';
      case 'contextfile': return (n.label.startsWith('~') ? '~/' : '') + base(n.label);
      case 'web': return n.id === 'mcp:github' ? 'MCP github' : n.label.replace(/^(www|developer|code)\./, '').replace(/\.(com|org)$/, '');
      case 'model': return 'MODEL';
      case 'tool': return n.label.toUpperCase();
      case 'lane': { const l = sim.laneByKey(n.lane); return l ? l.label : n.label; }
      case 'context': return 'CTX BUS';
      case 'terminal': return 'TERMINAL';
      case 'plan': return 'TASKS';
      case 'answer': return 'REPLY';
      default: return base(n.label);
    }
  }
  function jackKind(n) { return n.group === 'tool' ? n.kind : null; }
  function layoutBay() {
    const t = vt();
    const rows = [[], [], []];
    for (const n of S.nodes) {
      if (n.group === 'lane') { const l = sim.laneByKey(n.lane); if (!l || l.startedAt > t) continue; }
      rows[rowOf(n)].push(n);
    }
    const ord1 = n => n.group === 'tool' ? KINDS.indexOf(n.kind) : n.group === 'lane' ? 10 + S.lanes.findIndex(l => l.key === n.lane) : 1000;
    const ord2 = n => ({ context: 0, terminal: 1, plan: 2, answer: 3 }[n.group] ?? 10 + S.nodes.indexOf(n));
    rows[1].sort((a, b) => ord1(a) - ord1(b));
    rows[2].sort((a, b) => ord2(a) - ord2(b));
    const W = bay.clientWidth || 900, H = bay.clientHeight || 206;
    const sig = W + 'x' + H + '|' + rows.map(r => r.map(n => n.id).join(',')).join('/');
    if (sig === jackSig) return;
    jackSig = sig; bayW = W; bayH = H;
    bay.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const bandH = Math.round((H - 34) / 3);
    const tops = [6, 6 + bandH + 2, 6 + (bandH + 2) * 2];
    rowsY = tops.map(top => top + 14);
    const x0 = 100, x1 = W - 10;
    const rowDefs = [['SOURCES', 'prompt, ctx files,', 'web, MCP'], ['CHANNELS', 'tools, lanes,', 'model'], ['BUSES', 'context, terminal,', 'tasks, reply, disk']];
    let out = `<defs><radialGradient id="nut" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fafafa"/><stop offset=".55" stop-color="#b5babf"/><stop offset="1" stop-color="#6f7479"/></radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter></defs><g id="bands">`;
    jackPos = new Map();
    rows.forEach((row, r) => {
      const top = tops[r];
      out += `<text class="rowlabel" x="8" y="${top + 14}">${rowDefs[r][0]}</text><text class="rowsub" x="8" y="${top + 26}">${rowDefs[r][1]}</text><text class="rowsub" x="8" y="${top + 36}">${rowDefs[r][2]}</text>`;
      out += `<rect class="band" x="${x0 - 6}" y="${top}" width="${x1 - x0 + 12}" height="${bandH - 6}" rx="3"/>`;
      const step = (x1 - x0) / Math.max(1, row.length);
      const maxChars = Math.max(4, Math.floor(step / 5));
      row.forEach((n, i) => {
        const x = Math.round(x0 + step * (i + 0.5)), y = top + 14;
        jackPos.set(n.id, { x, y });
        const kc = jackKind(n) ? COL[jackKind(n)].c : n.group === 'lane' ? '#8b8b8b' : null;
        out += `<g class="jack" data-open="node:${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.label)}" data-node="${esc(n.id)}"><title>${esc(n.label)}</title>
          ${kc ? `<rect x="${x - 10}" y="${y - 13}" width="20" height="3" fill="${kc}"/>` : ''}
          <circle class="nut" cx="${x}" cy="${y}" r="8.5"/><circle class="hole" cx="${x}" cy="${y}" r="4"/></g>
          <text class="jl" x="${x}" y="${y + 21}">${esc(short(jackLabel(n), maxChars))}</text>`;
      });
    });
    out += `</g><g id="cables"></g><g id="flashes"></g><g id="pulses"></g>`;
    bay.innerHTML = out;
  }
  function geo(a, b) {
    const dx = Math.abs(b.x - a.x);
    const low = Math.max(a.y, b.y);
    const sag = Math.min(bayH - 3, low + 20 + dx * 0.045 + (a.y === b.y ? 10 : 0));
    return [a.x, a.y, a.x + (b.x - a.x) * 0.12, sag, b.x - (b.x - a.x) * 0.12, sag, b.x, b.y];
  }
  function bez(g, u) {
    const m = 1 - u;
    return { x: m * m * m * g[0] + 3 * m * m * u * g[2] + 3 * m * u * u * g[4] + u * u * u * g[6], y: m * m * m * g[1] + 3 * m * m * u * g[3] + 3 * m * u * u * g[5] + u * u * u * g[7] };
  }
  const pathD = g => `M${g[0]} ${g[1]} C${g[2]} ${g[3]} ${g[4]} ${g[5]} ${g[6]} ${g[7]}`;

  function cablesAt(t) {
    const map = new Map();
    const add = (from, to, info) => {
      const key = from + '>' + to;
      let e = map.get(key);
      if (!e) map.set(key, e = { key, from, to, hops: [], last: -Infinity, size: 0 });
      e.hops.push(info); e.size += info.size;
      if (info.time >= e.last) { e.last = info.time; e.kind = info.kind; e.err = info.err; e.retry = info.retry; e.lastSize = info.size; }
    };
    for (let i = S.calls.length - 1; i >= 0; i--) {
      const c = S.calls[i];
      if (c.startedAt > t) continue;
      if (c.startedAt < t - CABLE_WIN) break;
      if (!visible(c)) continue;
      const done = isDone(c, t), err = done && c.status === 'error';
      c.flow.forEach((h, idx) => {
        if (idx > 0 && !done) return;
        add(h.from, h.to, { call: c, hop: h, idx, time: idx === 0 ? c.startedAt : c.endedAt, size: hopSize(h), kind: c.kind, err, retry: c.attempt > 1 });
      });
    }
    if (!view.solo.size) for (const m of S.markers) {
      if (m.time > t || m.time < t - CABLE_WIN) continue;
      const hop = markerHop(m);
      if (hop) add(hop.from, hop.to, { marker: m, hop, time: m.time, size: hopSize(hop), kind: 'sys', err: false, retry: false });
    }
    return [...map.values()].sort((a, b) => a.last - b.last);
  }
  function markerHop(m) {
    if (m.kind === 'prompt') return { from: 'user', to: 'context', what: 'prompt text', tokens: m.detail.tokens || 200 };
    if (m.kind === 'context-file') return { from: 'ctxfile:' + m.detail.path, to: 'context', what: 'loaded into context', tokens: m.detail.tokens };
    if (m.kind === 'turn-complete') return { from: 'model', to: 'answer', what: 'reply to user', tokens: 400 };
    return null;
  }
  let lastCables = [];
  function renderCables() {
    const g = $('#cables');
    if (!g) return;
    const t = vt();
    const cables = cablesAt(t);
    lastCables = cables;
    const sel = selectedCallId();
    const chain = sel ? chainOf(sel) : null;
    const selNode = view.sel && view.sel.startsWith('node:') ? view.sel.slice(5) : null;
    let out = '', top = '';
    for (const e of cables) {
      const a = jackPos.get(e.from), b = jackPos.get(e.to);
      if (!a || !b) continue;
      const inChain = chain && e.hops.some(h => h.call && chain.has(h.call.id));
      const touches = selNode && (e.from === selNode || e.to === selNode);
      const age = t - e.last;
      let op = Math.max(0.12, 1 - age / CABLE_WIN);
      if (chain || selNode) op = inChain || touches ? 1 : 0.08;
      const w = 1.6 + Math.min(5.5, Math.log10(1 + e.lastSize) * 1.35);
      const col = e.err ? COL.err : COL[e.kind] || COL.sys;
      const gg = geo(a, b), d = pathD(gg);
      const mid = bez(gg, 0.5);
      const label = `${e.from} to ${e.to}: ${e.hops.length} hop${e.hops.length > 1 ? 's' : ''}${e.err ? ', error' : ''}`;
      const s = `<g class="cable${inChain ? ' chain' : ''}" opacity="${op.toFixed(2)}" data-open="cable:${esc(e.key)}" tabindex="-1" role="button" aria-label="${esc(label)}"><title>${esc(label)}</title>
        <path class="hit" d="${d}" stroke-width="12"/>
        ${inChain ? `<path d="${d}" stroke="#fff3a0" stroke-width="${w + 7}" opacity=".7" filter="url(#glow)"/>` : ''}
        <path class="outline" d="${d}" stroke="#111" stroke-width="${(w + 2).toFixed(1)}"/>
        <path class="core" d="${d}" stroke="${col.c}" stroke-width="${w.toFixed(1)}"/>
        <path d="${d}" stroke="rgba(255,255,255,.45)" stroke-width="${Math.max(0.6, w * 0.28).toFixed(1)}" ${e.err ? 'stroke-dasharray="5 4"' : ''} transform="translate(0 -${(w * 0.2).toFixed(1)})"/>
        <circle cx="${a.x}" cy="${a.y}" r="${(w / 2 + 2.6).toFixed(1)}" fill="${col.c}" stroke="#111"/><circle cx="${b.x}" cy="${b.y}" r="${(w / 2 + 2.6).toFixed(1)}" fill="${col.c}" stroke="#111"/>
        ${e.err ? `<text class="tag" x="${mid.x}" y="${mid.y + 3}" fill="${COL.err.c}">✕ ${esc(errCodeOf(e))}</text>` : e.retry ? `<text class="tag" x="${mid.x}" y="${mid.y + 3}" fill="#222">TAKE 2</text>` : e.hops.length > 2 ? `<text class="tag" x="${mid.x}" y="${mid.y + 3}" fill="#333">×${e.hops.length}</text>` : ''}
      </g>`;
      if (inChain || touches) top += s; else out += s;
    }
    g.innerHTML = out + top;
    bay.querySelectorAll('.jack').forEach(j => j.classList.toggle('sel', j.dataset.node === selNode));
  }
  function errCodeOf(e) { for (let i = e.hops.length - 1; i >= 0; i--) { const c = e.hops[i].call; if (c && c.error) return c.error.code; } return 'ERR'; }

  // pulses travelling along cables
  const pulses = [];
  const flashes = [];
  function launch(hop, kind, err, delay, call) {
    if (view.inspect != null) return;
    const size = hopSize(hop);
    pulses.push({ from: hop.from, to: hop.to, size, kind, err, call, t0: performance.now() + delay, dur: reduced ? 0 : 700 + 320 * Math.log10(1 + size) });
  }
  function pulseShape(p, x, y) {
    const col = p.err ? COL.err : COL[p.kind] || COL.sys;
    const r = 2.6 + Math.min(5, Math.log10(1 + p.size) * 1.2);
    const st = `stroke="#111" stroke-width="1"`;
    if (p.err) return `<g transform="translate(${x} ${y})"><circle r="${r + 2}" fill="#fff" ${st}/><path d="M-${r} -${r} L${r} ${r} M${r} -${r} L-${r} ${r}" stroke="${col.c}" stroke-width="2.6"/></g>`;
    switch (p.kind) {
      case 'files': return `<circle cx="${x}" cy="${y}" r="${r}" fill="${col.g}" ${st}/>`;
      case 'edits': return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${col.g}" ${st}/>`;
      case 'shell': return `<path d="M${x - r * 1.4} ${y + r} L${x + r * 1.4} ${y - r} L${x + r * 1.4} ${y + r} Z" fill="${col.g}" ${st}/>`;
      case 'network': { let s = ''; for (let i = 0; i < 5; i++) s += `<circle cx="${x + (Math.random() - 0.5) * r * 3}" cy="${y + (Math.random() - 0.5) * r * 3}" r="${r * 0.45}" fill="${col.g}" ${st}/>`; return s; }
      case 'agents': return `<path d="M${x} ${y - r * 1.3} L${x + r * 1.3} ${y} L${x} ${y + r * 1.3} L${x - r * 1.3} ${y} Z" fill="${col.g}" ${st}/>`;
      case 'memory': return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${col.c}" stroke-width="2.5"/>`;
      case 'other': return `<path d="M${x} ${y - r * 1.2} L${x + r * 1.2} ${y + r} L${x - r * 1.2} ${y + r} Z" fill="${col.g}" ${st}/>`;
      default: return `<circle cx="${x}" cy="${y}" r="${r}" fill="${col.g}" stroke="#3b3631" stroke-width="1.5"/>`;
    }
  }
  function drawPulses(now) {
    const pg = $('#pulses'), fg = $('#flashes');
    if (!pg) return;
    let out = '';
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const u = p.dur ? (now - p.t0) / p.dur : (now >= p.t0 ? 1 : -1);
      if (u < 0) continue;
      const a = jackPos.get(p.from), b = jackPos.get(p.to);
      if (u >= 1) { pulses.splice(i, 1); if (b) arrive(p, now); continue; }
      if (!a || !b) continue;
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const pt = bez(geo(a, b), e);
      out += pulseShape(p, pt.x, pt.y);
    }
    pg.innerHTML = out;
    let fo = '';
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], u = (now - f.t0) / 700;
      if (u >= 1) { flashes.splice(i, 1); continue; }
      const pos = jackPos.get(f.node);
      if (pos) fo += `<circle class="flash" cx="${pos.x}" cy="${pos.y}" r="${9 + u * 12}" stroke="${f.color}" stroke-width="${3 * (1 - u)}" opacity="${1 - u}"/>`;
    }
    fg.innerHTML = fo;
  }
  function arrive(p, now) {
    flashes.push({ node: p.to, t0: now, color: p.err ? COL.err.c : (COL[p.kind] || COL.sys).c });
    if (p.call) bumpCall(p.call, p.size);
  }

  // ================= CHANNEL STRIPS =================
  const strips = new Map();
  const kindHost = $('#kindStrips'), laneHost = $('#laneStrips');
  function makeStrip(ch, opts) {
    const el = document.createElement('div');
    el.className = 'strip' + (opts.lane ? ' lane-strip' : '');
    el.style.setProperty('--kc', opts.kind ? COL[opts.kind].c : '#8a8a8a');
    const key = opts.kind ? `kind:${opts.kind}` : `lane:${opts.lane}`;
    el.innerHTML = `
      <div class="scribble" data-open="${key}" tabindex="0" role="button" title="Open channel inspector"><span class="sc-txt"></span><span class="sc-sub"></span></div>
      <div class="leds"><span class="led sig"></span><span class="sig-l">SIG</span><span class="led clip" data-open="clip:${ch}" tabindex="0" role="button" title="Clip: errors since the last prompt. Opens the latest error."></span><span>CLIP</span></div>
      <div class="lcd" data-open="clip:${ch}" tabindex="-1"><div class="l1"></div><div class="l2"></div><div class="l3"></div></div>
      <canvas class="scope" data-open="scope:${ch}" tabindex="0" role="button" title="Scope: recent activity. Opens the latest call."></canvas>
      <div class="knobs">
        <div class="knob-wrap" title="${opts.kind ? 'GAIN: average call duration' : 'GAIN: tokens moved by this lane'}"><div class="knob"><i class="k1"></i></div><b class="v1"></b><small>${opts.kind ? 'AVG DUR' : 'TOKENS'}</small></div>
        <div class="knob-wrap" title="PAN: success rate (left = failing, right = all OK)"><div class="knob"><i class="k2"></i></div><b class="v2"></b><small>OK RATE</small></div>
      </div>
      <div class="mf"><div class="vu">${Array.from({ length: SEG }, (_, i) => `<i class="${i >= 16 ? 'r' : i >= 12 ? 'a' : 'g'}"></i>`).join('')}</div>
        <div class="fader" data-open="${key}" title="Fader: cumulative calls"><div class="scale"></div><div class="slot"></div><div class="cap"></div></div></div>
      <div class="readout"></div>
      <div class="ms"><button class="hw mute" data-mute="${ch}" aria-pressed="false" title="Mute: hide this channel's cables, tape marks and log rows">M</button><button class="hw solo" data-solo="${ch}" aria-pressed="false" title="Solo: show only soloed channels">S</button></div>
      <div class="plate" data-open="${key}">${esc(opts.plate)}</div>`;
    const st = { ch, el, kind: opts.kind || null, laneKey: opts.lane || null, level: 0, peak: 0, peakAt: 0, lit: -1, pk: -1 };
    st.r = { txt: $('.sc-txt', el), sub: $('.sc-sub', el), sig: $('.sig', el), clip: $('.clip', el), l1: $('.l1', el), l2: $('.l2', el), l3: $('.l3', el), scope: $('.scope', el), k1: $('.k1', el), k2: $('.k2', el), v1: $('.v1', el), v2: $('.v2', el), scale: $('.scale', el), cap: $('.cap', el), readout: $('.readout', el), mute: $('.mute', el), solo: $('.solo', el) };
    st.segs = [...el.querySelectorAll('.vu i')];
    st.ctx = st.r.scope.getContext('2d');
    strips.set(ch, st);
    return st;
  }
  KINDS.forEach((k, i) => {
    const st = makeStrip(k, { kind: k, plate: `CH${i + 1} ${KI[k].name.toUpperCase()}` });
    st.r.txt.textContent = KI[k].name;
    st.r.sub.textContent = KI[k].tools.join(' ').replace('mcp__github__get_issue', 'MCP');
    kindHost.appendChild(st.el);
  });

  // master section
  const masterEl = $('#master');
  masterEl.innerHTML = `
    <div class="scribble" data-open="master" tabindex="0" role="button" style="--kc:#3b3631">Master · model<span class="sc-sub" id="mModel"></span></div>
    <div class="lcd" data-open="session" tabindex="-1"><div id="m1"></div><div id="m2"></div><div id="m3"></div></div>
    <div class="busrow" data-open="context" tabindex="0" role="button" title="Context window bus. Opens what filled it.">
      <div class="busmeter" id="busmeter">${Array.from({ length: 30 }, (_, i) => `<i class="${i >= 27 ? 'r' : i >= 21 ? 'a' : 'g'}"></i>`).join('')}</div>
      <div class="busscale"><span style="bottom:0%">0</span><span style="bottom:50%">50</span><span class="a" style="bottom:70%">70</span><span class="r" style="bottom:90%">90</span><span style="bottom:100%">100</span></div>
      <div class="businfo">
        <div class="engr small">CONTEXT BUS</div>
        <div class="lcd bigpct" id="bigpct">0%</div>
        <div class="lcd" id="busused" style="font-size:9.5px;padding:2px 5px"></div>
        <div class="gr" title="Limiter: compaction ducks the context bus"><span>LIMIT</span><span class="led a" id="gr1"></span><span class="led a" id="gr2"></span><span class="led r" id="gr3"></span><span id="compCount"></span></div>
        <div class="engr small" id="ctxFilesN"></div>
      </div>
    </div>
    <canvas class="hist" id="hist" data-open="context" title="Context history, last 30 minutes"></canvas>
    <div class="totals">
      <div>CALLS<b id="tCalls">0</b></div><div>TOOL ERRORS<b id="tErr" class="bad">0</b></div>
      <div>TOKENS IN/OUT<b id="tTok">0</b></div><div>ACTIVE NOW<b id="tActive">-</b></div>
    </div>`;
  const histCv = $('#hist');

  function syncLaneStrips() {
    let added = false;
    for (const [key, L] of D.lanes) {
      if (key === 'main') continue;
      let st = strips.get('lane:' + key);
      if (!st) {
        st = makeStrip('lane:' + key, { lane: key, plate: `LANE ${String(L.lane.depth).padStart(1)} · ${L.lane.agentType}` });
        const empty = $('.lanes-empty', laneHost); if (empty) empty.remove();
        laneHost.appendChild(st.el);
        added = true;
      }
    }
    for (const st of strips.values()) if (st.laneKey) st.el.style.display = D.lanes.has(st.laneKey) ? '' : 'none';
    if (added) laneHost.scrollLeft = laneHost.scrollWidth;
  }

  const knobAngle = u => -135 + 270 * Math.max(0, Math.min(1, u));
  function faderScale(max) { return [0, 0.25, 0.5, 0.75, 1].map(f => `<span style="bottom:calc(6px + (100% - 12px) * ${f})">${Math.round(max * f)}</span>`).join(''); }
  let faderMax = 20;
  function updateStrips() {
    let maxCount = 0;
    for (const k of KINDS) maxCount = Math.max(maxCount, D.kinds[k].count);
    for (const L of D.lanes.values()) if (L.lane.key !== 'main') maxCount = Math.max(maxCount, L.calls);
    const fm = Math.max(20, Math.ceil(maxCount * 1.15 / 10) * 10);
    const scaleChanged = fm !== faderMax; faderMax = fm;
    const selId = selectedCallId();
    const selCall = selId ? sim.callById(selId) : null;
    for (const st of strips.values()) {
      const r = st.r;
      let A;
      if (st.kind) {
        A = D.kinds[st.kind];
        const lastErr = A.lastErr;
        r.l1.innerHTML = A.esp > 0 ? `<span class="alarm">✕ ${esc(lastErr.error.code)}</span>` : lastErr ? `<span class="dim">last ${esc(lastErr.error.code)}</span>` : '<span class="dim">NO CLIP</span>';
        r.l2.innerHTML = `ERR ${A.esp}<span class="dim"> /${A.errors} total</span>${A.last && A.last.attempt > 1 ? ' TAKE ' + A.last.attempt : ''}`;
        const run = A.running[0];
        r.l3.textContent = run ? `▶ ${short(base(targetText(run)) || run.tool, 14)}` : A.last ? `${A.last.tool} ${base(targetText(A.last))}` : '-';
        const avg = A.n ? A.dur / A.n : 0;
        r.k1.style.transform = `rotate(${knobAngle(avg ? (Math.log10(avg) - 2) / (Math.log10(8000) - 2) : 0)}deg)`;
        r.v1.textContent = A.n ? dur(avg) : '-';
        r.clip.classList.toggle('on', A.esp > 0);
        st.el.classList.toggle('active-now', A.running.length > 0);
        st.el.classList.toggle('selected', !!(view.sel === 'kind:' + st.kind || (selCall && selCall.kind === st.kind)));
      } else {
        A = D.lanes.get(st.laneKey);
        if (!A) continue;
        const l = A.lane;
        r.txt.textContent = (l.depth > 1 ? '↳'.repeat(l.depth - 1) + ' ' : '') + l.label;
        const parent = sim.laneByKey(l.parent);
        r.sub.textContent = `from ${parent ? parent.label : l.parent} · d${l.depth}`;
        r.l1.innerHTML = A.state === 'failed' ? '<span class="alarm">✕ FAILED</span>' : A.state === 'completed' ? '<span>✓ COMPLETED</span>' : '<span>▶ RUNNING</span>';
        r.l2.innerHTML = `ERR ${A.errors}<span class="dim"> · ${esc(l.model.replace('claude-', ''))}</span>`;
        r.l3.textContent = A.running[0] ? `▶ ${A.running[0].tool} ${base(targetText(A.running[0]))}` : short(l.task, 30);
        r.k1.style.transform = `rotate(${knobAngle(A.tokens ? (Math.log10(A.tokens) - 2) / 3 : 0)}deg)`;
        r.v1.textContent = kfmt(A.tokens);
        r.clip.classList.toggle('on', A.errors > 0);
        st.el.classList.toggle('ended', A.state !== 'running');
        st.el.classList.toggle('active-now', A.running.length > 0);
        st.el.classList.toggle('selected', !!(view.sel === 'lane:' + st.laneKey || (selCall && selCall.lane === st.laneKey)));
        let stamp = $('.stamp', st.el);
        if (A.state !== 'running') { if (!stamp) { stamp = document.createElement('div'); st.el.appendChild(stamp); } stamp.className = 'stamp ' + A.state; stamp.textContent = A.state === 'failed' ? '✕ FAILED' : '✓ DONE'; }
        else if (stamp) stamp.remove();
      }
      const okRate = A.n ? A.ok / A.n : 1;
      r.k2.style.transform = `rotate(${knobAngle(okRate)}deg)`;
      r.v2.textContent = A.n ? `${Math.round(okRate * 100)}%` : '-';
      r.sig.classList.toggle('on', A.running.length > 0);
      const count = st.kind ? A.count : A.calls;
      if (scaleChanged || !r.scale.innerHTML) r.scale.innerHTML = faderScale(faderMax);
      r.cap.style.bottom = `calc(6px + (100% - 12px) * ${Math.min(1, count / faderMax)})`;
      r.readout.textContent = `${count} call${count === 1 ? '' : 's'}`;
      r.mute.classList.toggle('on', view.mute.has(st.ch)); r.mute.setAttribute('aria-pressed', view.mute.has(st.ch));
      r.solo.classList.toggle('on', view.solo.has(st.ch)); r.solo.setAttribute('aria-pressed', view.solo.has(st.ch));
      st.el.classList.toggle('muted', !chVisible(st.ch));
    }
  }

  function updateMaster() {
    const pct = D.ctx.percent || 0;
    const segs = $('#busmeter').children;
    const lit = Math.round(pct / 100 * 30);
    for (let i = 0; i < segs.length; i++) segs[i].classList.toggle('on', i < lit);
    const big = $('#bigpct');
    big.textContent = `${pct.toFixed(1)}%`;
    big.className = 'lcd bigpct' + (pct >= 90 ? ' r' : pct >= 70 ? ' a' : '');
    $('#busused').textContent = `${kfmt(D.ctx.used || 0)} / ${kfmt(S.context.capacity)} tok`;
    const lastComp = D.compactions[D.compactions.length - 1];
    const sinceComp = lastComp ? D.t - lastComp.time : Infinity;
    $('#gr1').classList.toggle('on', sinceComp < 9000);
    $('#gr2').classList.toggle('on', sinceComp < 6000);
    $('#gr3').classList.toggle('on', sinceComp < 3000);
    $('#compCount').textContent = `×${D.compactions.length}`;
    $('#ctxFilesN').textContent = `${D.ctxFiles.length} context file${D.ctxFiles.length === 1 ? '' : 's'} inserted`;
    $('#mModel').textContent = S.session.model;
    $('#m1').textContent = `TURN ${D.turn} · ${D.status.toUpperCase()}`;
    $('#m2').textContent = `cache ${kfmt(S.tokens.cacheRead)} tok read`;
    const esp = sim.errorsSincePrompt();
    const espN = view.inspect == null ? Object.values(esp).reduce((a, b) => a + b, 0) : KINDS.reduce((a, k) => a + D.kinds[k].esp, 0);
    $('#m3').innerHTML = espN ? `<span class="alarm" style="color:var(--lcd-alarm)">✕ ${espN} error${espN > 1 ? 's' : ''} since prompt</span>` : 'no errors since prompt';
    $('#tCalls').textContent = D.calls.length;
    $('#tErr').textContent = D.errors;
    $('#tTok').textContent = `${kfmt(D.tin)}/${kfmt(D.tout)}`;
    const act = KINDS.filter(k => D.kinds[k].running.length);
    $('#tActive').textContent = act.length ? act.map(kindName).join(', ') : 'idle';
    $('#tActive').style.color = act.length ? COL[act[0]].c : '';
    drawHist();
  }
  function sizeCanvas(cv) {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  function drawHist() {
    const { ctx, w, h } = sizeCanvas(histCv);
    ctx.fillStyle = '#0b2c29'; ctx.fillRect(0, 0, w, h);
    const end = D.t, start = end - WIN30;
    const X = t => (t - start) / WIN30 * w, Y = p => h - 2 - p / 100 * (h - 4);
    ctx.strokeStyle = 'rgba(255,179,0,.6)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, Y(70)); ctx.lineTo(w, Y(70)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,43,28,.7)'; ctx.beginPath(); ctx.moveTo(0, Y(90)); ctx.lineTo(w, Y(90)); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath();
    let first = true;
    for (const s of S.context.samples) { if (s.time < start || s.time > end) continue; const x = X(s.time), y = Y(s.percent); if (first) { ctx.moveTo(x, h); ctx.lineTo(x, y); first = false; } else ctx.lineTo(x, y); }
    if (!first) { ctx.lineTo(X(end), Y(D.ctx.percent || 0)); ctx.lineTo(X(end), h); ctx.closePath(); ctx.fillStyle = 'rgba(127,243,216,.18)'; ctx.fill(); ctx.strokeStyle = '#7ff3d8'; ctx.lineWidth = 1.2; ctx.stroke(); }
    for (const m of D.compactions) { if (m.time < start) continue; const x = X(m.time); ctx.strokeStyle = '#ffb300'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.fillStyle = '#ffb300'; ctx.font = 'bold 8px Consolas, monospace'; ctx.fillText('C', x + 2, 9); }
    ctx.fillStyle = 'rgba(127,243,216,.6)'; ctx.font = '8px Consolas, monospace'; ctx.fillText('ctx % · 30 min', 3, h - 3);
  }

  // ---------- meters (per frame) ----------
  function bump(ch, size) {
    const st = strips.get(ch);
    if (!st) return;
    st.level = Math.max(st.level, Math.min(1, 0.22 + Math.log10(1 + size) / 4.6));
  }
  function bumpCall(c, size) {
    if (!visible(c)) return;
    bump(c.kind, size);
    if (c.lane !== 'main') bump('lane:' + c.lane, size);
  }
  function staticLevel(st, t) {
    let sum = 0, running = false;
    for (let i = S.calls.length - 1; i >= 0; i--) {
      const c = S.calls[i];
      if (c.startedAt > t) continue;
      if (c.startedAt < t - 15000) break;
      if (st.kind ? c.kind !== st.kind : c.lane !== st.laneKey) continue;
      if (!isDone(c, t)) running = true;
      c.flow.forEach((h, idx) => { const at = idx === 0 ? c.startedAt : c.endedAt; if (at != null && at <= t && at > t - 4000) sum += hopSize(h) * (1 - (t - at) / 4000); });
    }
    return Math.max(running ? (st.kind === 'shell' ? 0.42 : 0.24) : 0, sum ? Math.min(1, 0.22 + Math.log10(1 + sum) / 4.6) : 0);
  }
  let lastMeter = performance.now();
  function updateMeters(now, t) {
    const dt = Math.min(100, now - lastMeter); lastMeter = now;
    for (const st of strips.values()) {
      if (view.inspect != null) st.level = staticLevel(st, t);
      else {
        const A = st.kind ? D.kinds[st.kind] : D.lanes.get(st.laneKey);
        let floor = 0;
        if (A && A.running.length && sim.running && chVisible(st.ch)) floor = (st.kind === 'shell' ? 0.4 : 0.2) + (reduced ? 0 : Math.random() * 0.1);
        st.level = Math.max(floor, st.level * Math.pow(0.92, dt / 16.7));
      }
      if (st.level >= st.peak) { st.peak = st.level; st.peakAt = now; }
      else if (now - st.peakAt > 1500) st.peak = Math.max(st.level, st.peak - dt / 2500);
      const lit = Math.round(st.level * SEG), pk = Math.min(SEG - 1, Math.round(st.peak * SEG) - 1);
      if (lit !== st.lit || pk !== st.pk) { st.segs.forEach((s, i) => { s.classList.toggle('on', i < lit); s.classList.toggle('pk', i === pk && pk >= lit); }); st.lit = lit; st.pk = pk; }
    }
  }

  // ---------- scopes: each kind's signal has its own waveform ----------
  const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
  function amp(c) { const size = c.tokens ? c.tokens.in + c.tokens.out : 0; return size ? 0.35 + 0.65 * Math.min(1, Math.log10(1 + size) / 3.6) : 0.5; }
  function drawScope(st, t) {
    const cv = st.r.scope;
    if (!cv.clientWidth) return;
    const { ctx, w, h } = sizeCanvas(cv);
    ctx.fillStyle = '#0a2624'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(127,243,216,.09)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 6; i++) { ctx.moveTo(Math.round(w * i / 6) + 0.5, 0); ctx.lineTo(Math.round(w * i / 6) + 0.5, h); }
    for (let i = 1; i < 4; i++) { ctx.moveTo(0, Math.round(h * i / 4) + 0.5); ctx.lineTo(w, Math.round(h * i / 4) + 0.5); }
    ctx.stroke();
    const mid = h / 2;
    ctx.strokeStyle = 'rgba(127,243,216,.28)'; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
    const X = tt => w - (t - tt) / SCOPE_WIN * w;
    const on = chVisible(st.ch);
    for (let i = S.calls.length - 1; i >= 0; i--) {
      const c = S.calls[i];
      if (c.startedAt > t) continue;
      if (c.startedAt < t - SCOPE_WIN - 10000) break;
      if (st.kind ? c.kind !== st.kind : c.lane !== st.laneKey) continue;
      const done = isDone(c, t);
      const x0 = X(c.startedAt);
      const xe = done ? X(c.endedAt) : w;
      const x1 = Math.max(x0 + 16, xe);
      if (x1 < -30) continue;
      ctx.globalAlpha = on && visible(c) ? 1 : 0.3;
      wave(ctx, c, x0, x1, xe, mid, (h / 2 - 3) * amp(c), done && c.status === 'error', !done, w);
    }
    ctx.globalAlpha = 1;
    if (view.inspect != null) { ctx.fillStyle = 'rgba(255,210,122,.85)'; ctx.font = '8px Consolas, monospace'; ctx.fillText('@' + clock(t), 2, 9); }
  }
  function wave(ctx, c, x0, x1, xe, mid, A, err, running, w) {
    const kind = c.kind;
    const col = err ? COL.err.g : COL[kind].g;
    ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.shadowColor = col; ctx.shadowBlur = reduced ? 0 : 3;
    const clip = v => (err ? Math.max(-A * 0.55, Math.min(A * 0.55, v * 1.6)) : v);
    const n = Math.max(1, Math.round(x1 - x0));
    const seed = c.seq * 3.7;
    ctx.beginPath();
    if (kind === 'memory') {
      ctx.moveTo(x0 - 2, mid); ctx.lineTo(x0, mid); ctx.lineTo(x0, mid - A); ctx.lineTo(x0 + 1.5, mid + A * 0.45); ctx.lineTo(x0 + 3, mid);
      ctx.stroke(); ctx.fillStyle = col; ctx.fillRect(x0 - 2, mid - A - 4, 4, 4);
    } else if (kind === 'agents') {
      ctx.moveTo(x0, mid); ctx.lineTo(x0, mid - A); ctx.lineTo(x0 + 1, mid + A * 0.75);
      for (let i = 1; i <= n; i++) { const u = i / n; const y = -A * 0.75 * Math.exp(-u * 3.2) + A * 0.18 * Math.sin(i * 0.9) * (1 - Math.exp(-u * 3.2)); ctx.lineTo(x0 + 1 + i, mid - clip(-y)); }
      ctx.stroke();
      ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(x0, mid + A); ctx.lineTo(x0, mid - A); ctx.stroke(); ctx.setLineDash([]);
    } else {
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        let y = 0;
        if (kind === 'files') { const env = Math.min(1, u * 5, (1 - u) * 5); y = A * env * Math.sin(i / 2.2); }
        else if (kind === 'edits') { const burst = Math.floor(u * 5) % 2 === 0; y = burst ? (Math.sin(i / 1.6) >= 0 ? A : -A) : 0; }
        else if (kind === 'shell') { const per = 8; y = A * (2 * ((i % per) / per) - 1) * (running ? 1 : 0.9); }
        else if (kind === 'network') { const env = u < 0.12 ? u / 0.12 : Math.exp(-(u - 0.12) * 2.2); y = A * env * (hash(seed + i) * 2 - 1); }
        else { const per = 10; y = A * (1 - 4 * Math.abs(((i / per) + 0.25) % 1 - 0.5)); }
        const px = x0 + i;
        if (i === 0) ctx.moveTo(px, mid); else ctx.lineTo(px, mid - clip(y));
      }
      if (kind === 'shell' && !running) { for (let j = 1; j < 26; j++) { const per = 8; const y = A * Math.exp(-j / 7) * (2 * (((n + j) % per) / per) - 1); ctx.lineTo(x1 + j, mid - clip(y)); } }
      ctx.lineTo(Math.min(w, x1 + (kind === 'shell' && !running ? 26 : 0)), mid);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    if (err) {
      ctx.strokeStyle = COL.err.g; ctx.lineWidth = 1.6; const ex = x0 + 4, ey = 6;
      ctx.beginPath(); ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3); ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3); ctx.stroke();
    }
    if (c.attempt > 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold 7px Consolas, monospace'; ctx.fillText('T' + c.attempt, x0 + 1, mid + A + 8 > 40 ? 42 : mid + A + 8); }
  }

  // ================= RACK: output meters, disk, activity =================
  function renderRack() {
    const t = D.t;
    // context bus summary
    const pct = D.ctx.percent || 0;
    const shellCalls = D.calls.filter(c => c.kind === 'shell').slice(-4).reverse();
    const doneT = D.tasks.filter(x => x.status === 'completed').length, prog = D.tasks.filter(x => x.status === 'in_progress').length, pend = D.tasks.length - doneT - prog;
    const turnMarks = D.markers.filter(m => m.kind === 'turn-complete');
    const statusMark = s => s === 'completed' ? '●' : s === 'in_progress' ? '◐' : '○';
    const statusCol = s => s === 'completed' ? '#1c7a35' : s === 'in_progress' ? '#b07800' : '#666';
    let html = `
      <div class="bus" data-open="context" tabindex="0" role="button"><div class="bn"><span class="ojack"></span>CTX BUS</div><div class="bv">
        <div class="progress" title="${pct}%"><i style="width:${Math.min(70, pct)}%;background:var(--led-g)"></i><i style="width:${Math.max(0, Math.min(20, pct - 70))}%;background:var(--led-a)"></i><i style="width:${Math.max(0, pct - 90)}%;background:var(--led-r)"></i></div>
        <div class="line">${pct.toFixed(1)}% · ${D.compactions.length} compaction${D.compactions.length === 1 ? '' : 's'} · ${D.ctxFiles.length} context files</div>
        ${D.ctxFiles.map(f => `<div class="line" title="${esc(f.why)}">⊕ ${esc(f.path)} <span style="color:#666">${kfmt(f.tokens)} tok</span></div>`).join('')}
      </div></div>
      <div class="bus" data-open="terminal" tabindex="0" role="button"><div class="bn"><span class="ojack"></span>TERMINAL</div><div class="bv">
        ${shellCalls.length ? shellCalls.map(c => { const done = isDone(c, t); const ex = done ? (c.output && c.output.exitCode != null ? c.output.exitCode : c.status === 'error' ? c.error.code : 0) : null; return `<div class="line">${done ? (c.status === 'error' ? `<b style="color:var(--err)">✕ ${esc(c.error.code)}</b>` : '<b style="color:#1c7a35">✓ exit 0</b>') : '<b style="color:#b07800">▶ running</b>'} $ ${esc(targetText(c))}</div>`; }).join('') : '<div class="line">no commands yet</div>'}
      </div></div>
      <div class="bus" data-open="tasks" tabindex="0" role="button"><div class="bn"><span class="ojack"></span>TASKS</div><div class="bv">
        <div class="line"><b>${doneT}/${D.tasks.length}</b> done · ${prog} in progress · ${pend} not started</div>
        <div class="progress"><i style="width:${D.tasks.length ? doneT / D.tasks.length * 100 : 0}%;background:#1c7a35"></i><i style="width:${D.tasks.length ? prog / D.tasks.length * 100 : 0}%;background:#e0a100"></i></div>
        ${D.tasks.map(x => `<div class="task" data-open="task:${esc(x.id)}" tabindex="0" role="button"><span class="ts" style="color:${statusCol(x.status)}">${statusMark(x.status)}</span><span>${esc(x.label)}</span><span class="th" title="status changes">${x.history.map(hh => statusMark(hh.status)).join('')}</span></div>`).join('')}
      </div></div>
      <div class="bus" data-open="reply" tabindex="0" role="button"><div class="bn"><span class="ojack"></span>REPLY</div><div class="bv">
        <div class="line">${turnMarks.length} turn${turnMarks.length === 1 ? '' : 's'} answered${turnMarks.length ? ` · last ${ago(t - turnMarks[turnMarks.length - 1].time)}` : ''}</div>
        <div class="line">${D.lastPrompt ? esc(D.lastPrompt.detail.text) : ''}</div>
      </div></div>`;
    setHTML($('#buses'), html);

    // files
    const files = Object.values(D.files).sort((a, b) => b.last - a.last);
    html = files.map(f => {
      const hot = f.edits >= 3;
      const cells = f.touches.slice(-22).map(c => { const err = c.status === 'error'; return `<i class="${err ? 'x' : ''}" style="${err ? '' : `background:${COL[c.kind].c}`}" title="${esc(c.tool)} ${err ? c.error.code : 'ok'}"></i>`; }).join('');
      return `<div class="orow" data-open="file:${esc(f.path)}" tabindex="0" role="button" title="${esc(f.path)}"><span class="ojack"></span><span class="op">${esc(f.path)}${hot ? `<span class="hot">HOT ×${f.edits}</span>` : ''}</span>
        <span class="oc">R${f.reads} E${f.edits}${f.failed ? ` <span class="f">F${f.failed}✕</span>` : ''} <span class="add">+${f.added}</span> <span class="rem">−${f.removed}</span></span>
        <span class="cells">${cells}${f.touches.length > 22 ? `<span class="more">+${f.touches.length - 22}</span>` : ''}</span></div>`;
    }).join('') || '<div class="note">No file touched yet.</div>';
    setHTML($('#files'), html);

    // activity, folded
    const rows = [];
    for (let i = D.calls.length - 1; i >= 0 && rows.length < 60; i--) {
      const c = D.calls[i];
      if (!visible(c)) continue;
      const st = isDone(c, t) ? c.status : 'running';
      const key = `${c.lane}|${c.tool}|${c.label}|${st}|${st === 'error' ? c.error.code : ''}`;
      const prev = rows[rows.length - 1];
      if (prev && prev.key === key) { prev.n++; continue; }
      rows.push({ key, c, st, n: 1 });
    }
    html = rows.map(r => {
      const c = r.c;
      const s = r.st === 'error' ? `<span class="as err">✕ ${esc(c.error.code)}</span>` : r.st === 'running' ? '<span class="as run">▶ run</span>' : '<span class="as">✓</span>';
      return `<div class="act" data-open="call:${c.id}" tabindex="0" role="button"><span class="at">${clock(c.startedAt)}</span>${glyphSVG(c.kind, r.st === 'error')}<span class="al">${c.lane !== 'main' ? `<b>[${esc(c.laneLabel)}]</b> ` : ''}${esc(c.label)} <span style="color:#666">${esc(short(base(targetText(c)), 28))}</span>${c.attempt > 1 ? ' <b>TAKE ' + c.attempt + '</b>' : ''}${r.n > 1 ? `<span class="fold">×${r.n}</span>` : ''}</span>${s}</div>`;
    }).join('');
    setHTML($('#activity'), html);
  }

  // ================= INSPECTOR =================
  const insp = $('#insp'), inspBody = $('#inspBody');
  function kv(pairs) { return `<div class="kv">${pairs.filter(p => p && p[1] !== undefined && p[1] !== null && p[1] !== '').map(([k, v]) => `<span>${esc(k)}</span><span>${v}</span>`).join('')}</div>`; }
  function nodeKey(id) {
    if (id.startsWith('tool:')) return 'kind:' + id.slice(5);
    if (id.startsWith('lane:')) return 'lane:' + id.slice(5);
    if (id.startsWith('file:')) return 'file:' + id.slice(5);
    if (id.startsWith('ctxfile:')) return 'ctxfile:' + id.slice(8);
    if (id.startsWith('web:')) return 'web:' + id.slice(4);
    return { user: 'user', model: 'master', context: 'context', terminal: 'terminal', plan: 'tasks', answer: 'reply', 'mcp:github': 'mcp' }[id] || 'session';
  }
  function nodeLink(id) { const n = sim.node(id); return lk(nodeKey(id), n ? (n.group === 'lane' ? jackLabel(n) + ' (lane)' : n.label) : id); }
  function callRow(c) {
    const done = isDone(c, D.t), st = done ? c.status : 'running';
    return `<div class="row" data-open="call:${c.id}" tabindex="0" role="button"><span class="rt">${clock(c.startedAt)}</span>${glyphSVG(c.kind, st === 'error')}<span class="rl">${c.lane !== 'main' ? `[${esc(c.laneLabel)}] ` : ''}${esc(c.tool)} · ${esc(short(targetText(c), 40))}${c.attempt > 1 ? ' · TAKE ' + c.attempt : ''}</span><span class="rs ${st === 'error' ? 'err' : ''}">${st === 'error' ? '✕ ' + esc(c.error.code) : st === 'running' ? '▶' : '✓ ' + dur(c.endedAt - c.startedAt)}</span></div>`;
  }
  function tapeChip(kind, text) { return `<span class="tapechip" style="--kc:${kind ? (COL[kind] || COL.sys).c : '#3b3631'}">${esc(text)}</span>`; }
  function badge(st, text) { return `<span class="badge ${st}">${esc(text || st.toUpperCase())}</span>`; }

  function callHTML(c) {
    if (!c) return '<p class="note">That call is not in the session.</p>';
    if (c.startedAt > D.t) return `<p class="note">This call starts after the inspected moment (${clock(c.startedAt)}). Return to live to see it.</p>`;
    const t = D.t, done = isDone(c, t), st = done ? c.status : 'running';
    const caused = S.calls.filter(x => x.causedBy === c.id && x.startedAt <= t);
    const retries = S.calls.filter(x => x.retryOf === c.id && x.startedAt <= t);
    const cause = c.causedBy ? sim.callById(c.causedBy) : null;
    const orig = c.retryOf ? sim.callById(c.retryOf) : null;
    const o = done ? c.output || {} : {};
    let h = `<div class="ih">${glyphSVG(c.kind, st === 'error')}${tapeChip(c.kind, kindName(c.kind))}<h3>${esc(c.tool)}</h3>${badge(st, st === 'error' ? '✕ ERROR' : st === 'running' ? '▶ RUNNING' : '✓ OK')}${c.attempt > 1 ? badge('take', 'TAKE ' + c.attempt) : ''}</div>`;
    h += `<div class="note">${esc(c.label)} · signal: ${SIGNAL[c.kind]}</div>`;
    if (st === 'error' && c.error) {
      const fixed = retries.find(r => isDone(r, t) && r.status === 'success');
      const nextInLane = S.calls.find(x => x.lane === c.lane && x.seq > c.seq && x.startedAt <= t);
      h += `<div class="errbox"><div class="code-h">✕ ${esc(c.error.code)} · ${esc(c.error.name || '')}</div><div>${esc(c.error.message)}</div><div class="note">Hint: ${esc(c.error.hint || '-')}</div>
        <div class="sec" style="margin-top:6px">What happened next</div>
        ${retries.length ? retries.map(r => `<div>Retried as ${lk('call:' + r.id, 'take ' + r.attempt + ' (' + r.id + ')')}: ${isDone(r, t) ? (r.status === 'success' ? '<b style="color:#1c7a35">✓ fixed</b>' : '<b style="color:var(--err)">✕ failed again</b>') : 'running'}</div>`).join('') : '<div>No retry of this exact call.</div>'}
        ${caused.length ? `<div>Led to: ${caused.map(x => lk('call:' + x.id, x.tool + ' ' + base(targetText(x)))).join(', ')}</div>` : ''}
        ${nextInLane && !caused.includes(nextInLane) ? `<div>Next in lane: ${lk('call:' + nextInLane.id, nextInLane.tool + ' ' + base(targetText(nextInLane)))}</div>` : ''}
        ${fixed ? '' : retries.length ? '' : ''}</div>`;
    }
    h += kv([
      ['Lane', c.lane === 'main' ? lk('master', 'Main session') : lk('lane:' + c.lane, c.laneLabel + ' (depth ' + c.depth + ')')],
      ['Target', c.target ? `${esc(c.target.type)}: ${c.target.type === 'file' ? lk('file:' + (c.refs.find(r => r.type === 'file') || c.target).value, c.target.value) : c.target.type === 'url' ? lk('web:' + c.target.value.split('/')[2], c.target.value) : c.target.type === 'agent' ? esc(c.target.value) : esc(c.target.value)}` : '-'],
      ['Started', `${clock(c.startedAt)} (${ago(t - c.startedAt)})`],
      ['Duration', done ? dur(c.endedAt - c.startedAt) : `running ${dur(t - c.startedAt)} (planned ${dur(c.duration)})`],
      ['Status', esc(st)],
      ['Tokens', done ? `${kfmt(c.tokens.in)} in / ${kfmt(c.tokens.out)} out` : '-'],
      ['Context after', done && c.contextAfter ? `${c.contextAfter.percent}% (${kfmt(c.contextAfter.used)} tok)` : c.lane !== 'main' ? 'subagent: not in main context' : '-'],
      ['Exit code', o.exitCode != null ? esc(o.exitCode) : null],
      ['HTTP status', o.status ? esc(o.status) : null],
      ['Call id', esc(c.id)]
    ]);
    h += `<div class="sec">Input arguments</div><div class="lcd code">${esc(JSON.stringify(c.input, null, 1))}</div>`;
    if (done) {
      h += `<div class="sec">Output</div><div>${esc(o.summary || '-')}${o.lines ? ` · ${o.lines} lines` : ''}${o.bytes ? ` · ${bfmt(o.bytes)}` : ''}</div>`;
      if (o.preview && o.preview.length) h += `<div class="lcd code">${o.preview.map(esc).join('\n')}</div>`;
      if (o.tests) h += `<div class="sec">Tests</div><div><b style="color:#1c7a35">${o.tests.passed} passed</b> · <b style="color:${o.tests.failed ? 'var(--err)' : 'inherit'}">${o.tests.failed} failed</b> · ${o.tests.skipped} skipped</div>${o.tests.failures.length ? `<div>${o.tests.failures.map(f => `<div style="color:var(--err)">✕ ${esc(f)}</div>`).join('')}</div>` : ''}`;
      if (c.diff) h += `<div class="sec">Diff <span class="add">+${c.diff.added}</span> <span class="rem">−${c.diff.removed}</span></div><div class="lcd code">${c.diff.hunks.map(hk => `@@ line ${hk.at} @@\n` + hk.lines.map(l => `<span class="${l[0] === '+' ? 'p' : l[0] === '-' ? 'm' : ''}">${esc(l)}</span>`).join('\n')).join('\n')}</div>`;
    }
    h += `<div class="sec">Flow hops (patch cables)</div>`;
    c.flow.forEach((hp, idx) => {
      if (idx > 0 && !done) return;
      const col = st === 'error' ? COL.err.c : COL[c.kind].c;
      h += `<div class="hop"><span>${nodeLink(hp.from)}</span><span class="cab" style="background:${col}"></span><span>${nodeLink(hp.to)}</span><span class="hw2">${idx === 0 ? 'at start' : 'at end'} · ${esc(hp.what)} · ${hopAmount(hp)}</span></div>`;
    });
    if (c.refs.length) h += `<div class="sec">References</div>` + c.refs.map(r => `<div>${esc(r.role)} ${esc(r.type)}: ${r.type === 'file' ? lk('file:' + r.value, r.value) : r.type === 'url' ? lk('web:' + r.value.split('/')[2], r.title || r.value) + ` <span class="note">${esc(r.value)}</span>` : r.type === 'lane' ? lk('lane:' + r.value, (sim.laneByKey(r.value) || {}).label || r.value) : r.type === 'task' ? lk('tasks', 'task ' + r.value) : esc(r.value)}</div>`).join('');
    h += `<div class="sec">Cause chain</div>`;
    h += `<div>Caused by: ${cause ? lk('call:' + cause.id, `${cause.tool} ${base(targetText(cause))} (${cause.id})`) + (cause.status === 'error' ? ' <b style="color:var(--err)">✕ ' + esc(cause.error && cause.error.code) + '</b>' : '') : 'nothing recorded (model decision)'}</div>`;
    h += `<div>Caused: ${caused.length ? caused.map(x => lk('call:' + x.id, `${x.tool} ${base(targetText(x))}`)).join(', ') : 'nothing yet'}</div>`;
    h += `<div>Retries: ${orig ? `this is take ${c.attempt} of ${lk('call:' + orig.id, orig.tool + ' (' + orig.id + ')')}` : ''}${retries.length ? retries.map(r => lk('call:' + r.id, 'take ' + r.attempt)).join(', ') : orig ? '' : 'none'}</div>`;
    h += `<div class="note">The cause chain is lit in the patch bay and outlined on the tape.</div>`;
    return h;
  }

  function kindHTML(k) {
    const A = D.kinds[k];
    const calls = D.calls.filter(c => c.kind === k);
    const errs = calls.filter(c => isDone(c, D.t) && c.status === 'error');
    let h = `<div class="ih">${glyphSVG(k)}${tapeChip(k, KI[k].name)}<h3>Channel: ${esc(KI[k].name)}</h3></div>`;
    h += `<div class="note">${esc(KI[k].verb)} · tools ${esc(KI[k].tools.join(', '))} · scope signal: ${SIGNAL[k]} · cable colour ${COL[k].c}</div>`;
    h += kv([['Calls (fader)', A.count], ['Running now', A.running.length ? A.running.map(c => lk('call:' + c.id, c.tool + ' ' + base(targetText(c)))).join(', ') : 'none'], ['Errors since prompt', A.esp ? `<b style="color:var(--err)">✕ ${A.esp}</b>` : '0'], ['Errors total', A.errors], ['Avg duration (gain)', A.n ? dur(A.dur / A.n) : '-'], ['Success (pan)', A.n ? Math.round(A.ok / A.n * 100) + '%' : '-'], ['Tokens moved', kfmt(A.tokens)], ['By tool', Object.entries(A.tools).map(([tl, n]) => `${esc(tl)} ×${n}`).join(', ') || '-']]);
    if (errs.length) h += `<div class="sec">Errors (clip history)</div>` + errs.slice(-10).reverse().map(callRow).join('');
    h += `<div class="sec">Calls, newest first</div>` + calls.slice(-40).reverse().map(callRow).join('');
    return h;
  }
  function laneHTML(key) {
    const L = D.lanes.get(key);
    if (!L) return '<p class="note">This lane had not started at the inspected moment.</p>';
    const l = L.lane;
    const parent = sim.laneByKey(l.parent);
    const children = S.lanes.filter(x => x.parent === key && x.startedAt <= D.t);
    let h = `<div class="ih">${glyphSVG('agents')}${tapeChip('agents', l.label)}<h3>Lane</h3>${badge(L.state, L.state === 'failed' ? '✕ FAILED' : L.state === 'completed' ? '✓ COMPLETED' : '▶ RUNNING')}</div>`;
    h += kv([['Key', esc(l.key)], ['Role', esc(l.role)], ['Agent type', esc(l.agentType)], ['Model', esc(l.model)], ['Depth', l.depth], ['Parent', parent ? (parent.key === 'main' ? lk('master', 'Main session') : lk('lane:' + parent.key, parent.label)) : '-'], ['Children', children.map(x => lk('lane:' + x.key, x.label)).join(', ') || 'none'], ['Started', clock(l.startedAt)], ['Ended', l.endedAt != null && l.endedAt <= D.t ? clock(l.endedAt) + ` (ran ${dur(l.endedAt - l.startedAt)})` : 'still running'], ['Calls', L.calls], ['Errors', L.errors ? `<b style="color:var(--err)">✕ ${L.errors}</b>` : '0'], ['Tokens', kfmt(L.tokens)]]);
    h += `<div class="sec">Brief (task)</div><div class="lcd code">${esc(l.task || '-')}</div>`;
    h += `<div class="sec">Final result</div><div class="${L.state === 'failed' ? 'errbox' : ''}">${L.state === 'running' ? 'Not finished yet.' : esc(l.result)}</div>`;
    h += `<div class="sec">Calls in this lane</div>` + D.calls.filter(c => c.lane === key).reverse().map(callRow).join('');
    return h;
  }
  function fileHTML(path) {
    const f = D.files[path];
    const node = sim.node('file:' + path);
    const touches = sim.callsForFile(path).filter(c => c.startedAt <= D.t);
    let h = `<div class="ih"><span class="ojack"></span>${tapeChip(null, base(path))}<h3>File on disk</h3>${f && f.edits >= 3 ? '<span class="hot">HOT</span>' : ''}</div>`;
    h += kv([['Path', esc(path)], ['Lines now', node ? node.lines : '-'], ['Reads', f ? f.reads : 0], ['Edits', f ? f.edits : 0], ['Failed', f && f.failed ? `<b style="color:var(--err)">✕ ${f.failed}</b>` : '0'], ['Lines', f ? `<span class="add">+${f.added}</span> <span class="rem">−${f.removed}</span>` : '-'], ['Hot', f && f.edits >= 3 ? `yes, edited ${f.edits} times` : 'no (hot = 3+ edits)']]);
    h += `<div class="sec">Every call that touched it, in order</div>`;
    h += touches.map(c => {
      const done = isDone(c, D.t);
      let extra = '';
      if (done && c.status === 'error') extra = `<div class="errbox" style="margin:2px 0 6px 60px"><b style="color:var(--err)">✕ ${esc(c.error.code)}</b> ${esc(c.error.message)}</div>`;
      else if (done && c.diff) extra = `<div class="lcd code" style="margin:2px 0 6px 60px">${c.diff.hunks.map(hk => `@@ ${hk.at} @@ +${c.diff.added} −${c.diff.removed}\n` + hk.lines.map(l => `<span class="${l[0] === '+' ? 'p' : l[0] === '-' ? 'm' : ''}">${esc(l)}</span>`).join('\n')).join('\n')}</div>`;
      return callRow(c) + extra;
    }).join('') || '<div class="note">Not touched yet.</div>';
    return h;
  }
  function contextHTML() {
    const pct = D.ctx.percent || 0;
    let h = `<div class="ih">${tapeChip(null, 'Context bus')}<h3>Context window</h3>${badge(pct >= 90 ? 'error' : pct >= 70 ? 'running' : 'success', pct.toFixed(1) + '%')}</div>`;
    h += kv([['Used', `${kfmt(D.ctx.used || 0)} of ${kfmt(S.context.capacity)} tokens`], ['Level', pct >= 90 ? 'RED (90%+)' : pct >= 70 ? 'AMBER (70%+)' : 'green'], ['Compactions', D.compactions.length], ['Context files', D.ctxFiles.length]]);
    h += `<div class="sec">Compactions (limiter ducking)</div>` + (D.compactions.map(m => `<div>${clock(m.time)} · ${esc(m.label)}</div>`).join('') || '<div class="note">None yet.</div>');
    h += `<div class="sec">Context files inserted</div>` + (D.ctxFiles.map(f => `<div>${lk('ctxfile:' + f.path, f.path)} · ${kfmt(f.tokens)} tok · ${esc(f.why)} · ${clock(f.loadedAt)}</div>`).join('') || '<div class="note">None.</div>');
    const lastComp = D.compactions[D.compactions.length - 1];
    const from = lastComp ? lastComp.time : 0;
    const agg = new Map();
    const bigCalls = [];
    for (const s of S.context.samples) {
      if (s.time > D.t || s.time < from || s.delta <= 0) continue;
      const key = s.why.replace(/^Loaded .*/, 'Context files');
      agg.set(key, (agg.get(key) || 0) + s.delta);
      if (s.callId) bigCalls.push(s);
    }
    const tops = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = tops.length ? tops[0][1] : 1;
    h += `<div class="sec">What filled it${lastComp ? ' since the last compaction' : ''}</div><div class="bars">` + tops.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${Math.max(4, v / max * 80)}px"></i><span>${kfmt(v)}</span></div>`).join('') + '</div>';
    h += `<div class="sec">Biggest single contributors</div>` + bigCalls.sort((a, b) => b.delta - a.delta).slice(0, 8).map(s => { const c = sim.callById(s.callId); return c ? callRow(c).replace('</span></div>', ` · ${kfmt(s.delta)} tok</span></div>`) : ''; }).join('');
    return h;
  }
  function terminalHTML() {
    const calls = D.calls.filter(c => c.kind === 'shell').reverse();
    let h = `<div class="ih">${glyphSVG('shell')}${tapeChip('shell', 'Terminal')}<h3>Terminal</h3></div><div class="note">Commands and exit codes, newest first.</div>`;
    h += calls.map(c => {
      const done = isDone(c, D.t), o = c.output || {};
      return `<div class="row" data-open="call:${c.id}" tabindex="0" role="button" style="grid-template-columns:56px minmax(0,1fr) auto"><span class="rt">${clock(c.startedAt)}</span><span class="rl" style="font-family:var(--mono)">$ ${esc(targetText(c))}${c.attempt > 1 ? ' · TAKE ' + c.attempt : ''}${c.lane !== 'main' ? ' [' + esc(c.laneLabel) + ']' : ''}</span><span class="rs ${done && c.status === 'error' ? 'err' : ''}">${!done ? '▶ running' : c.status === 'error' ? '✕ ' + esc(c.error.code) : 'exit ' + (o.exitCode ?? 0)}${done && o.tests ? ` · ${o.tests.passed}/${o.tests.passed + o.tests.failed}` : ''}</span></div>`;
    }).join('');
    return h;
  }
  function tasksHTML(focus) {
    const doneT = D.tasks.filter(x => x.status === 'completed').length, prog = D.tasks.filter(x => x.status === 'in_progress').length;
    let h = `<div class="ih">${glyphSVG('memory')}${tapeChip('memory', 'Task list')}<h3>Task list</h3></div>`;
    h += kv([['Completed', `${doneT} of ${D.tasks.length}`], ['In progress', prog], ['Not started', D.tasks.length - doneT - prog], ['Source', esc(S.tasks.source)]]);
    h += D.tasks.map(x => `<div class="sec" style="${focus === x.id ? 'background:rgba(255,240,150,.5)' : ''}">${esc(x.id)}. ${esc(x.label)} · ${esc(x.status)}</div>` + x.history.map(hh => `<div>${clock(hh.time)} → ${esc(hh.status)} by ${lk('call:' + hh.callId, hh.callId)}</div>`).join('')).join('') || '<div class="note">No task list yet.</div>';
    return h;
  }
  function markersHTML(kind, title, chip) {
    const ms = D.markers.filter(m => m.kind === kind).reverse();
    return `<div class="ih">${tapeChip(null, chip)}<h3>${esc(title)}</h3></div>` + (ms.map(m => `<div class="row" style="grid-template-columns:56px minmax(0,1fr)"><span class="rt">${clock(m.time)}</span><span class="rl">${esc(m.detail.text || m.label)}${m.detail.tokens ? ` · ${m.detail.tokens} tok` : ''}</span></div>`).join('') || '<div class="note">None yet.</div>');
  }
  function webHTML(host) {
    const calls = D.calls.filter(c => c.kind === 'network' && (targetText(c).includes(host) || c.flow.some(hh => hh.from === 'web:' + host)));
    const searches = D.calls.filter(c => c.tool === 'WebSearch');
    let h = `<div class="ih">${glyphSVG('network')}${tapeChip('network', host)}<h3>Web host</h3></div>`;
    h += `<div class="sec">Fetches and status</div>` + (calls.reverse().map(c => callRow(c).replace('</span></div>', ` · ${isDone(c, D.t) ? (c.status === 'error' ? '' : 'HTTP ' + ((c.output || {}).status || 200)) : ''}</span></div>`)).join('') || '<div class="note">No fetch from this host yet.</div>');
    if (searches.length) h += `<div class="sec">Web searches (no single host)</div>` + searches.slice(-6).reverse().map(callRow).join('');
    return h;
  }
  function cableHTML(key) {
    const e = lastCables.find(x => x.key === key);
    const [from, to] = key.split('>');
    let h = `<div class="ih">${tapeChip(e ? e.kind : null, 'Patch cable')}<h3>${esc(short(jackLabel(sim.node(from) || { group: '', label: from }), 18))} → ${esc(short(jackLabel(sim.node(to) || { group: '', label: to }), 18))}</h3></div>`;
    h += kv([['From', nodeLink(from)], ['To', nodeLink(to)], ['Hops', e ? e.hops.length + ' in the last ' + Math.round(CABLE_WIN / 60000 * 10) / 10 + ' min' : 'none in window'], ['Moved', e ? kfmt(e.size) + ' tok-equivalent' : '-']]);
    if (e) h += `<div class="sec">Signals on this cable, newest first</div>` + e.hops.slice().sort((a, b) => b.time - a.time).map(hp => hp.call ? callRow(hp.call).replace('</span></div>', ` · ${esc(hp.hop.what)} ${hopAmount(hp.hop)}</span></div>`) : `<div class="row" style="grid-template-columns:56px minmax(0,1fr)"><span class="rt">${clock(hp.time)}</span><span class="rl">${esc(hp.marker.label)}</span></div>`).join('');
    return h;
  }
  function sessionHTML() {
    const s = S.session;
    let h = `<div class="ih">${tapeChip(null, s.project)}<h3>Session</h3>${badge(D.status === 'quiet' ? 'running' : 'success', D.status.toUpperCase())}</div>`;
    h += kv([['Project', esc(s.project)], ['Session', esc(s.name)], ['Id', esc(s.id)], ['Provider', esc(s.provider)], ['Model', esc(s.model)], ['Branch', esc(s.branch)], ['Directory', esc(s.cwd)], ['Started', clock(s.startedAt)], ['Status', esc(D.status)], ['Last record', ago(D.t - D.lastRecord)], ['Turn', D.turn], ['Calls', D.calls.length], ['Tool errors', D.errors], ['Tokens', `${kfmt(D.tin)} in / ${kfmt(D.tout)} out / ${kfmt(S.tokens.cacheRead)} cache read`]]);
    h += `<div class="sec">Calls per kind</div>` + KINDS.map(k => `<div class="row" data-open="kind:${k}" tabindex="0" role="button" style="grid-template-columns:12px minmax(0,1fr) auto"><span>${glyphSVG(k)}</span><span class="rl">${esc(KI[k].name)}${D.kinds[k].running.length ? ' · <b>active</b>' : ''}</span><span class="rs ${D.kinds[k].esp ? 'err' : ''}">${D.kinds[k].count} · err ${D.kinds[k].esp} since prompt</span></div>`).join('');
    h += `<div class="sec">Lanes</div>` + [...D.lanes.values()].map(L => `<div class="row" data-open="${L.lane.key === 'main' ? 'master' : 'lane:' + esc(L.lane.key)}" tabindex="0" role="button" style="grid-template-columns:minmax(0,1fr) auto"><span class="rl">${'↳ '.repeat(L.lane.depth)}${esc(L.lane.label)}</span><span class="rs ${L.state === 'failed' ? 'err' : ''}">${esc(L.state)} · ${L.calls} calls</span></div>`).join('');
    return h;
  }
  function keyNode(key) {
    const i = key.indexOf(':');
    const type = i < 0 ? key : key.slice(0, i), id = i < 0 ? '' : key.slice(i + 1);
    return { kind: 'tool:' + id, lane: 'lane:' + id, file: 'file:' + id, web: 'web:' + id, ctxfile: 'ctxfile:' + id, context: 'context', terminal: 'terminal', tasks: 'plan', task: 'plan', reply: 'answer', user: 'user', mcp: 'mcp:github', master: 'model' }[type] || null;
  }
  function inspectorHTML(key) {
    const node = keyNode(key);
    let h = inspectorBody(key);
    if (node) {
      const cs = lastCables.filter(e => e.from === node || e.to === node).sort((a, b) => b.last - a.last);
      if (cs.length) h += `<div class="sec">Patch cables at this jack (last ${CABLE_WIN / 60000} min)</div>` + cs.map(e => `<div class="hop"><span>${nodeLink(e.from)}</span><span class="cab" style="background:${(e.err ? COL.err : COL[e.kind] || COL.sys).c}"></span><span>${nodeLink(e.to)}</span><span class="hw2">${lk('cable:' + e.key, `${e.hops.length} signal${e.hops.length > 1 ? 's' : ''}, ${kfmt(e.size)} tok-eq`)}${e.err ? ' · <b style="color:var(--err)">✕ error</b>' : ''}</span></div>`).join('');
    }
    return h;
  }
  function inspectorBody(key) {
    const i = key.indexOf(':');
    const type = i < 0 ? key : key.slice(0, i), id = i < 0 ? '' : key.slice(i + 1);
    switch (type) {
      case 'call': case 'error': return callHTML(sim.callById(id));
      case 'kind': return kindHTML(id);
      case 'lane': return laneHTML(id);
      case 'file': return fileHTML(id);
      case 'cable': return cableHTML(id);
      case 'context': return contextHTML();
      case 'terminal': return terminalHTML();
      case 'tasks': return tasksHTML();
      case 'task': return tasksHTML(id);
      case 'reply': return markersHTML('turn-complete', 'Reply to user', 'Reply bus');
      case 'user': return markersHTML('prompt', 'User prompts', 'Prompt source');
      case 'web': return webHTML(id);
      case 'mcp': return `<div class="ih">${glyphSVG('other')}${tapeChip('other', 'MCP github')}<h3>MCP source</h3></div>` + (D.calls.filter(c => c.kind === 'other').reverse().map(callRow).join('') || '<div class="note">No MCP calls yet.</div>');
      case 'ctxfile': { const f = S.context.files.find(x => x.path === id) || (sim.node('ctxfile:' + id) || {}); return `<div class="ih">${tapeChip(null, base(id))}<h3>Context file</h3></div>` + kv([['Path', esc(id)], ['Tokens', f.tokens ? kfmt(f.tokens) : '-'], ['Why', esc(f.why || 'Not loaded yet')], ['Loaded', f.loadedAt && f.loadedAt <= D.t ? clock(f.loadedAt) : 'not loaded at this moment']]); }
      case 'master': case 'session': return sessionHTML();
      default: return '<p class="note">Nothing to show.</p>';
    }
  }
  function resolveKey(key) {
    if (key.startsWith('node:')) return nodeKey(key.slice(5));
    if (key.startsWith('clip:') || key.startsWith('scope:')) {
      const ch = key.slice(key.indexOf(':') + 1);
      const A = ch.startsWith('lane:') ? D.lanes.get(ch.slice(5)) : D.kinds[ch];
      if (!A) return ch.startsWith('lane:') ? ch : 'kind:' + ch;
      const c = key.startsWith('clip:') ? A.lastErr || null : A.running[0] || A.last;
      return c ? 'call:' + c.id : ch.startsWith('lane:') ? ch : 'kind:' + ch;
    }
    return key;
  }
  function open(key) {
    view.sel = resolveKey(key);
    insp.hidden = false;
    inspBody.scrollTop = 0;
    inspBody._html = null;
    render(true);
  }
  function closeInsp() { view.sel = null; insp.hidden = true; render(true); }
  function renderInspector() {
    if (!view.sel) return;
    setHTML(inspBody, inspectorHTML(view.sel));
  }

  // ================= TAPE =================
  const tapeCv = $('#tape');
  let tapeHits = [];
  const TAPE_X0 = 72;
  function tapeGeom() { const w = tapeCv.clientWidth, h = tapeCv.clientHeight; const end = S.now, start = end - WIN30; return { w, h, end, start, X: t => TAPE_X0 + (t - start) / WIN30 * (w - TAPE_X0 - 10), T: x => start + (x - TAPE_X0) / (w - TAPE_X0 - 10) * WIN30 }; }
  function drawTape() {
    if (!tapeCv.clientWidth) return;
    const { ctx, w, h } = sizeCanvas(tapeCv);
    const g = tapeGeom();
    const top = 18, axis = 14, tr = (h - top - axis - 2) / KINDS.length;
    ctx.fillStyle = '#121514'; ctx.fillRect(0, 0, w, h);
    const sel = selectedCallId();
    const chain = sel ? chainOf(sel) : null;
    KINDS.forEach((k, i) => {
      const y = top + i * tr;
      ctx.fillStyle = i % 2 ? '#171c1b' : '#1a201f'; ctx.fillRect(TAPE_X0, y, w - TAPE_X0, tr);
      const on = chVisible(k);
      ctx.fillStyle = COL[k].c; ctx.fillRect(4, y + 2, 5, tr - 4);
      ctx.fillStyle = on ? '#f3ead2' : '#6b665c'; ctx.font = `${Math.min(10, tr - 2)}px Segoe UI, Arial`; ctx.textBaseline = 'middle';
      ctx.fillText(KI[k].name.toUpperCase() + (on ? '' : ' (M)'), 13, y + tr / 2);
    });
    ctx.fillStyle = '#0d100f'; ctx.fillRect(TAPE_X0, 0, w - TAPE_X0, top - 1);
    ctx.fillStyle = '#c9bf9f'; ctx.font = '9px Segoe UI, Arial'; ctx.fillText('MARKERS', 13, top / 2);
    // time axis
    ctx.fillStyle = '#9f977f'; ctx.font = '9px Consolas, monospace'; ctx.textBaseline = 'alphabetic';
    for (let m = 0; m <= 30; m += 5) { const x = g.X(g.start + m * 60000); ctx.fillRect(x, h - axis, 1, 4); ctx.fillText(m === 30 ? 'now ' + clock(g.end) : `-${30 - m}m`, Math.min(x + 2, w - 80), h - 3); }
    // session start
    const xs = g.X(S.session.startedAt);
    if (xs > TAPE_X0) { ctx.fillStyle = 'rgba(243,234,210,.35)'; ctx.fillRect(xs, 0, 1, h - axis); ctx.fillStyle = '#9f977f'; ctx.fillText('session start', xs + 3, h - axis - 3); }
    tapeHits = [];
    for (const c of S.calls) {
      if (c.startedAt < g.start) continue;
      const i = KINDS.indexOf(c.kind), y = top + i * tr;
      const x = g.X(c.startedAt);
      const end = c.endedAt != null ? c.endedAt : g.end;
      const ww = Math.max(2, g.X(end) - x);
      const err = c.status === 'error' && c.endedAt != null;
      const vis = visible(c);
      const future = view.inspect != null && c.startedAt > view.inspect;
      ctx.globalAlpha = (vis ? 1 : 0.15) * (future ? 0.3 : 1) * (chain && !chain.has(c.id) ? 0.35 : 1);
      ctx.fillStyle = err ? COL.err.c : COL[c.kind].g;
      ctx.fillRect(x, y + 2, ww, tr - 4);
      if (err) { ctx.fillStyle = COL.err.g; ctx.fillRect(x, y, 2, tr); ctx.strokeStyle = '#ff6155'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 2.5, y - 1); ctx.lineTo(x + 2.5, y + 4); ctx.moveTo(x + 2.5, y - 1); ctx.lineTo(x - 2.5, y + 4); ctx.stroke(); }
      if (c.attempt > 1) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(x - 1.5, y + 1, ww + 3, tr - 2); }
      if (chain && chain.has(c.id)) { ctx.globalAlpha = 1; ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y, ww + 4, tr); }
      ctx.globalAlpha = 1;
      tapeHits.push({ x, w: ww, y, h: tr, key: 'call:' + c.id, t: c.startedAt });
    }
    // markers lane
    for (const m of S.markers) {
      if (m.time < g.start) continue;
      const x = g.X(m.time);
      ctx.globalAlpha = view.inspect != null && m.time > view.inspect ? 0.3 : 1;
      if (m.kind === 'prompt') { ctx.fillStyle = '#f3ead2'; ctx.fillRect(x, 2, 1.5, h - axis - 2); ctx.beginPath(); ctx.moveTo(x + 1.5, 2); ctx.lineTo(x + 9, 5.5); ctx.lineTo(x + 1.5, 9); ctx.fill(); ctx.fillStyle = '#141312'; ctx.font = 'bold 7px Segoe UI'; ctx.fillText('P', x + 2.5, 8); tapeHits.push({ x: x - 2, w: 12, y: 0, h: top, key: 'user', t: m.time }); }
      else if (m.kind === 'turn-complete') { ctx.strokeStyle = '#3be35d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 4, 8); ctx.lineTo(x - 1, 12); ctx.lineTo(x + 5, 3); ctx.stroke(); tapeHits.push({ x: x - 5, w: 11, y: 0, h: top, key: 'reply', t: m.time }); }
      else if (m.kind === 'compaction') { ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.moveTo(x - 5, 2); ctx.lineTo(x + 5, 2); ctx.lineTo(x, 12); ctx.fill(); ctx.fillRect(x - 0.5, 12, 1, h - axis - 12); ctx.fillStyle = '#141312'; ctx.font = 'bold 7px Segoe UI'; ctx.fillText('C', x - 2, 8); tapeHits.push({ x: x - 5, w: 11, y: 0, h: top, key: 'context', t: m.time }); }
      else if (m.kind === 'context-file') { ctx.fillStyle = '#6ae6ff'; ctx.beginPath(); ctx.arc(x, 13, 2.5, 0, Math.PI * 2); ctx.fill(); tapeHits.push({ x: x - 3, w: 6, y: 8, h: 10, key: 'ctxfile:' + m.detail.path, t: m.time }); }
      ctx.globalAlpha = 1;
    }
    // playhead
    const ph = g.X(vt());
    if (view.inspect != null) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(ph, 0, w - ph, h - axis); }
    ctx.fillStyle = view.inspect != null ? '#ffd27a' : '#ff2b1c';
    ctx.fillRect(ph - 1, 0, 2, h - axis);
    ctx.beginPath(); ctx.moveTo(ph - 5, 0); ctx.lineTo(ph + 5, 0); ctx.lineTo(ph, 6); ctx.fill();
    $('#tapeTime').textContent = view.inspect != null ? `◀ ${clock(view.inspect)} (−${dur(S.now - view.inspect)})` : `● ${clock(S.now)}`;
  }
  function setInspect(t) {
    const g = tapeGeom();
    if (t == null || t >= S.now - 500) view.inspect = null;
    else view.inspect = Math.max(Math.max(g.start, S.session.startedAt), t);
    pulses.length = 0;
    render(true);
  }
  let dragging = false;
  function tapeEvent(e, click) {
    const r = tapeCv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const g = tapeGeom();
    if (x < TAPE_X0) return;
    if (x > g.w - 12) { setInspect(null); return; }
    setInspect(g.T(x));
    if (click) {
      let best = null, bd = 6;
      for (const hit of tapeHits) { if (y < hit.y - 1 || y > hit.y + hit.h + 1) continue; const d = x < hit.x ? hit.x - x : x > hit.x + hit.w ? x - hit.x - hit.w : 0; if (d < bd) { bd = d; best = hit; } }
      if (best) open(best.key);
    }
  }
  tapeCv.addEventListener('mousedown', e => { dragging = true; reelsEl.classList.add('rewind'); tapeEvent(e, true); });
  window.addEventListener('mousemove', e => { if (dragging) tapeEvent(e, false); });
  window.addEventListener('mouseup', () => { if (dragging) { dragging = false; reelsEl.classList.remove('rewind'); } });
  tapeCv.addEventListener('keydown', e => {
    const step = e.shiftKey ? 60000 : 10000;
    if (e.key === 'ArrowLeft') { setInspect(vt() - step); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setInspect(vt() + step); e.preventDefault(); }
    else if (e.key === 'End') { setInspect(null); e.preventDefault(); }
    else if (e.key === 'Enter') {
      const t = vt(); let best = null;
      for (const c of S.calls) { if (c.startedAt > t) break; best = c; }
      if (best) open('call:' + best.id);
      e.preventDefault();
    }
  });

  // ================= HEADER =================
  const reelsEl = $('#reels');
  function renderHeader() {
    const s = S.session;
    $('#s1').textContent = `${s.project} — ${s.name}`;
    $('#s2').textContent = `id ${s.id.slice(0, 13)}… · ${s.provider} · ${s.model} · branch ${s.branch} · turn ${D.turn}`;
    const led = $('#statusLed');
    led.className = 'led big ' + (D.status === 'recent activity' ? 'g on' : D.status === 'quiet' ? 'a on' : 'w on');
    $('#statusTxt').textContent = D.status;
    $('#statusSub').textContent = `last record ${ago(D.t - D.lastRecord)} · turn ${D.turn}`;
    const mode = $('#mode');
    if (view.inspect != null) { mode.textContent = `◀ INSPECTING ${clock(view.inspect)}`; mode.classList.add('inspect'); }
    else { mode.textContent = sim.running ? `● LIVE ${clock(S.now)} · ${sim.speed}x` : `❚❚ PAUSED ${clock(S.now)}`; mode.classList.remove('inspect'); }
    $('#pauseBtn').textContent = sim.running ? 'PAUSE' : 'RESUME';
    $('#pauseBtn').classList.toggle('on', !sim.running);
    document.querySelectorAll('.hw.sp').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === sim.speed));
    document.querySelector('.hw.live').classList.toggle('on', view.inspect == null);
    reelsEl.classList.toggle('stopped', !sim.running || view.inspect != null);
  }

  // ================= RENDER LOOP =================
  let dirty = true, lastRender = 0, lastScope = 0, lastTickReal = performance.now(), lastCompSeen = S.compactions;
  function render(force) {
    D = derive(vt());
    layoutBay();
    syncLaneStrips();
    updateStrips();
    updateMaster();
    renderCables();
    renderRack();
    drawTape();
    renderHeader();
    renderInspector();
    dirty = false; lastRender = performance.now();
  }
  function displayNow() {
    if (view.inspect != null) return view.inspect;
    if (!sim.running) return S.now;
    return S.now + Math.min(260, performance.now() - lastTickReal) * sim.speed;
  }
  function frame(now) {
    if (dirty && now - lastRender > 180) render();
    const t = displayNow();
    drawPulses(now);
    updateMeters(now, t);
    if (now - lastScope > (reduced ? 500 : 40)) { for (const st of strips.values()) if (st.el.style.display !== 'none') drawScope(st, t); lastScope = now; }
    requestAnimationFrame(frame);
  }

  // ---------- simulator events ----------
  sim.on('tick', () => { lastTickReal = performance.now(); dirty = true; });
  sim.on('start', c => {
    dirty = true;
    if (view.inspect != null || !visible(c)) return;
    if (c.flow[0]) launch(c.flow[0], c.kind, false, 0, c);
    bumpCall(c, 60);
  });
  sim.on('end', c => {
    dirty = true;
    if (view.inspect != null || !visible(c)) return;
    const err = c.status === 'error';
    const rest = c.flow.slice(1);
    rest.forEach((h, i) => launch(h, c.kind, err, i * 420, c));
    if (err && !rest.length && c.flow[0]) launch({ from: c.flow[0].to, to: c.flow[0].from, what: 'rejected', tokens: 40 }, c.kind, true, 0, c);
  });
  sim.on('marker', m => {
    dirty = true;
    if (view.inspect != null) return;
    const hop = markerHop(m);
    if (hop && !view.solo.size) launch(hop, 'sys', false, 0, null);
    if (m.kind === 'compaction') { const bm = $('#busmeter'); bm.classList.remove('duck'); void bm.offsetWidth; bm.classList.add('duck'); }
  });
  sim.on('lane', () => { dirty = true; });
  sim.on('tasks', () => { dirty = true; });

  // ---------- controls ----------
  document.addEventListener('click', e => {
    const ms = e.target.closest('[data-mute],[data-solo]');
    if (ms) {
      const isMute = ms.hasAttribute('data-mute');
      const ch = isMute ? ms.dataset.mute : ms.dataset.solo;
      const set = isMute ? view.mute : view.solo;
      if (set.has(ch)) set.delete(ch); else set.add(ch);
      render(true);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'pause') { if (sim.running) sim.pause(); else { lastTickReal = performance.now(); sim.start(); } }
      else if (a === 'speed') sim.setSpeed(Number(act.dataset.v));
      else if (a === 'live') setInspect(null);
      else if (a === 'rew') { reelsEl.classList.add('rewind'); setTimeout(() => reelsEl.classList.remove('rewind'), 400); setInspect(vt() + Number(act.dataset.v)); }
      else if (a === 'close') closeInsp();
      render(true);
      return;
    }
    const o = e.target.closest('[data-open]');
    if (o) open(o.dataset.open);
  });
  document.addEventListener('keydown', e => {
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el && el.getAttribute && el.getAttribute('data-open') && el.tagName !== 'BUTTON') {
      e.preventDefault();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return;
    }
    if (e.key === 'Escape') { if (view.sel) closeInsp(); else if (view.inspect != null) setInspect(null); }
    if (e.key === ' ' && (el === document.body || !el.closest('[data-open],button,canvas'))) { e.preventDefault(); if (sim.running) sim.pause(); else { lastTickReal = performance.now(); sim.start(); } render(true); }
  });
  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { jackSig = ''; render(true); }, 120); });

  // expose for verification / debugging
  window.AgentVizConsole = { sim, open, setInspect, view };

  sim.start();
  render(true);
  requestAnimationFrame(frame);
})();
