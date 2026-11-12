/* AgentViz concept 06: Code Galaxy.
 * A star chart of the codebase. Files are stars clustered by folder; the main agent is a craft that flies between
 * them, subagents are probes. Each kind of work is a different phenomenon. Data: ../shared/sim.js (read only).
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- data + constants
  const sim = AgentVizSim.create({ seed: 7, history: 30 });
  const S = sim.state;
  const KINDS = sim.kinds;
  const INFO = sim.kindInfo;
  const K = {
    files: { c: '#7fe8ff', g: '◉', name: 'Read', phen: 'scan beam, text into hold' },
    edits: { c: '#ffe3bd', g: '✹', name: 'Edit', phen: 'fire material, star flares' },
    shell: { c: '#b48cff', g: '⊛', name: 'Shell', phen: 'burst at terminal pulsar' },
    network: { c: '#6f8dff', g: '≋', name: 'Network', phen: 'signal from a quasar' },
    agents: { c: '#4ff0c0', g: '➤', name: 'Agents', phen: 'probe launch and dock' },
    memory: { c: '#ffd36e', g: '⚑', name: 'Plan', phen: 'nav-log beacon pulse' },
    other: { c: '#9cffb4', g: '☄', name: 'Other', phen: 'comet (MCP) signal' }
  };
  const RED = '#ff2e4d', AMBER = '#ffb347', ICE = '#dff6ff', CYAN = '#a9f4ff', HOT = '#fff4e2';
  const MONO = '"Cascadia Mono", Consolas, "SFMono-Regular", Menlo, monospace';
  const LANE_COLORS = ['#c39bff', '#5ff5d2', '#ff9ee8', '#8fb4ff', '#ffe08a', '#9dffb0', '#7fe8ff'];
  const FLY = 750; // sim ms to fly between waypoints
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FOLDERS = {
    src: { x: -330, y: -160, label: 'SRC/', neb: [120, 70, 235] },
    media: { x: 190, y: -230, label: 'MEDIA/', neb: [55, 80, 225] },
    test: { x: 110, y: 250, label: 'TEST/', neb: [150, 60, 215] },
    docs: { x: -360, y: 270, label: 'DOCS/', neb: [40, 60, 200] },
    root: { x: -90, y: 40, label: 'ROOT', neb: [80, 95, 235] }
  };
  const PULSAR = { x: 500, y: 20 };
  const BEACON = { x: -560, y: 60 };
  const HOME = { x: 0, y: 440 };
  const QY = -470;

  // ---------------------------------------------------------------- helpers
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const clock = t => new Date(t).toLocaleTimeString('en-GB', { hour12: false });
  const ago = ms => ms < 1000 ? 'now' : ms < 60000 ? `${Math.round(ms / 1000)}s ago` : ms < 3600000 ? `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s ago` : `${Math.floor(ms / 3600000)}h ago`;
  const ktok = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));
  const kbytes = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
  const base = p => p.split('/').pop();
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const ctxColor = p => p >= 90 ? RED : p >= 70 ? AMBER : CYAN;
  const ctxClass = p => p >= 90 ? 'red' : p >= 70 ? 'amber' : 'ok';
  const folderOf = path => { const i = path.indexOf('/'); if (i < 0) return 'root'; const f = path.slice(0, i); return FOLDERS[f] ? f : 'root'; };
  const callById = id => sim.callById(id);
  const fileOf = c => { const r = c.refs.find(ref => ref.type === 'file' && (ref.role === 'read' || ref.role === 'wrote')); return r ? r.value : null; };
  const hostOf = c => {
    if (c.target && c.target.type === 'url') { try { return new URL(c.target.value).host; } catch (e) { /* fallthrough */ } }
    const hop = c.flow.find(h => h.from.startsWith('web:'));
    return hop ? hop.from.slice(4) : 'web search';
  };

  // ---------------------------------------------------------------- stars
  const STARS = new Map();
  const folderCount = {};
  function ensureStar(path) {
    let star = STARS.get(path);
    if (star) return star;
    const node = sim.node(`file:${path}`);
    const folder = folderOf(path);
    const f = FOLDERS[folder];
    const k = folderCount[folder] = (folderCount[folder] || 0) + 1;
    const h = hash(path);
    const ang = k * 2.39996 + (h % 628) / 100;
    const r = folder === 'root' ? 50 + 30 * (k - 1) : (k === 1 ? 16 : 46 + 40 * Math.sqrt(k - 1)) + (h % 13);
    star = { path, folder, x: f.x + Math.cos(ang) * r, y: f.y + Math.sin(ang) * r * 0.85, base: node ? node.lines || 0 : 0, isNew: node ? node.lines === 0 : true, tw: (h % 1000) / 1000 * 6.28 };
    STARS.set(path, star);
    return star;
  }
  for (const n of S.nodes) if (n.group === 'disk') ensureStar(n.label);

  // quasars: one per web host, plus one for failed searches
  const QUASARS = new Map();
  function ensureQuasar(host) {
    if (QUASARS.has(host)) return QUASARS.get(host);
    const i = QUASARS.size;
    const q = { host, x: -420 + i * 210, y: QY + (i % 2 ? 22 : -6) };
    QUASARS.set(host, q);
    return q;
  }
  for (const n of S.nodes) if (n.id.startsWith('web:')) ensureQuasar(n.id.slice(4));
  ensureQuasar('web search');

  const cometPos = t => { const period = 540000; const k = ((t % period) + period) % period / period; return { x: -560 + k * 1120, y: -360 + Math.sin(k * Math.PI) * -30 + k * 40 }; };

  // ---------------------------------------------------------------- lanes / waypoints (the craft's route)
  const WP = {};
  const laneColor = {};
  function addLane(lane) {
    if (WP[lane.key]) return;
    laneColor[lane.key] = lane.depth ? LANE_COLORS[(Object.keys(laneColor).length - 1) % LANE_COLORS.length] : '#9fe4ff';
    WP[lane.key] = lane.depth ? [{ t: lane.startedAt, dock: lane.parent, launch: true }] : [{ t: S.session.startedAt, x: HOME.x + 30, y: HOME.y - 70 }];
  }
  function laneEnded(lane) {
    const w = WP[lane.key];
    if (lane.depth && lane.endedAt != null && w && !w.some(p => p.dockEnd)) w.push({ t: lane.endedAt, dock: lane.parent, dockEnd: true });
  }
  function offsetFor(key) { const a = (hash(key) % 628) / 100; const r = key === 'main' ? 16 : 13; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }
  function callStarted(c) {
    if (!WP[c.lane]) addLane(sim.laneByKey(c.lane));
    if ((c.kind === 'files' && c.tool === 'Read') || c.kind === 'edits') {
      const path = fileOf(c);
      if (!path) return;
      const star = ensureStar(path);
      const o = offsetFor(c.lane);
      WP[c.lane].push({ t: c.startedAt, x: star.x + o.x, y: star.y + o.y, call: c.id, star: path });
    }
  }
  // history first: lanes, then calls and lane ends in time order
  for (const lane of S.lanes) addLane(lane);
  {
    const events = [];
    for (const c of S.calls) events.push({ t: c.startedAt, run: () => callStarted(c) });
    for (const lane of S.lanes) if (lane.endedAt != null) events.push({ t: lane.endedAt + 0.5, run: () => laneEnded(lane) });
    events.sort((a, b) => a.t - b.t).forEach(e => e.run());
  }
  sim.on('start', c => { if (c.kind === 'edits') { const p = fileOf(c); if (p) ensureStar(p); } callStarted(c); });
  sim.on('lane', lane => { addLane(lane); laneEnded(lane); });

  function wobble(key, t) {
    if (reduced) return { x: 0, y: 0 };
    const h = hash(key) % 100;
    return { x: Math.sin(t / 1400 + h) * 4, y: Math.cos(t / 1100 + h * 1.3) * 3 };
  }
  function bez(a, b, e, seed) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const bend = (seed % 2 ? 1 : -1) * 0.16;
    const cx = mx - dy * bend, cy = my + dx * bend;
    const u = 1 - e;
    return { x: u * u * a.x + 2 * u * e * cx + e * e * b.x, y: u * u * a.y + 2 * u * e * cy + e * e * b.y };
  }
  function wpXY(w, t, key) {
    if (w.dock) {
      if (w.launch) { if (!w._p) w._p = lanePos(w.dock, w.t); return w._p; }
      return lanePos(w.dock, Math.min(t, w.t + FLY));
    }
    return w;
  }
  function wpIndex(w, t) { let i = w.length - 1; while (i > 0 && w[i].t > t) i--; return i; }
  function lanePos(key, t) {
    const w = WP[key];
    if (!w || !w.length) return { x: HOME.x, y: HOME.y };
    const i = wpIndex(w, t);
    const cur = wpXY(w[i], t, key);
    const wob = wobble(key, t);
    if (i === 0 || w[i].t > t) return { x: cur.x + wob.x, y: cur.y + wob.y };
    const k = (t - w[i].t) / FLY;
    if (k >= 1 || w[i].dockEnd && k >= 1) return { x: cur.x + wob.x, y: cur.y + wob.y };
    const prevRaw = wpXY(w[i - 1], w[i].t, key);
    const pw = wobble(key, w[i].t);
    const prev = { x: prevRaw.x + pw.x, y: prevRaw.y + pw.y };
    const e = ease(k);
    const p = bez(prev, cur, e, hash(key) + i);
    return { x: p.x + wob.x * e, y: p.y + wob.y * e };
  }
  function laneVisible(lane, t) { return t >= lane.startedAt && (lane.depth === 0 || lane.endedAt == null || t <= lane.endedAt + FLY + 400); }
  function laneStateAt(lane, t) { return lane.endedAt != null && lane.endedAt <= t ? lane.state : 'running'; }

  // where a call "happened" on the chart
  function callLoc(c) {
    if ((c.kind === 'files' && c.tool === 'Read') || c.kind === 'edits') { const p = fileOf(c); const s = p && STARS.get(p); if (s) return { x: s.x, y: s.y }; }
    if (c.kind === 'files') return lanePos(c.lane, c.startedAt);
    if (c.kind === 'shell') return PULSAR;
    if (c.kind === 'network') return ensureQuasar(hostOf(c));
    if (c.kind === 'memory') return BEACON;
    if (c.kind === 'other') return cometPos(c.startedAt);
    if (c.kind === 'agents') {
      const key = c.input && c.input.result_of;
      const lane = key && sim.laneByKey(key);
      if (lane) return lanePos(key, (lane.endedAt || c.startedAt) - 10);
      return lanePos(c.lane, c.startedAt);
    }
    return lanePos(c.lane, c.startedAt);
  }
  function locKey(c) {
    if (c.kind === 'files' || c.kind === 'edits') { const p = fileOf(c); if (p && STARS.has(p) && (c.tool === 'Read' || c.kind === 'edits')) return `file:${p}`; return `lane:${c.lane}`; }
    if (c.kind === 'shell') return 'terminal';
    if (c.kind === 'network') return `host:${hostOf(c)}`;
    if (c.kind === 'memory') return 'plan';
    if (c.kind === 'other') return 'mcp';
    return `agent:${c.input && c.input.result_of || c.lane}`;
  }

  // file stats at time t (so replay shows the past correctly)
  let fsKey = '', fsCache = null;
  function fileStatsAt(t) {
    const key = `${Math.floor(t / 200)}:${S.calls.length}:${S.errors.length}`;
    if (key === fsKey) return fsCache;
    const out = {};
    for (const [path, s] of STARS) out[path] = { path, reads: 0, edits: 0, failed: 0, added: 0, removed: 0, lines: s.base, act: 0, last: 0, born: s.isNew ? null : -Infinity, calls: [] };
    for (const c of S.calls) {
      if (c.startedAt > t) break;
      const done = c.endedAt != null && c.endedAt <= t;
      if (c.kind !== 'files' && c.kind !== 'edits') continue;
      const p = fileOf(c);
      const st = p && out[p];
      if (st) {
        const tt = done ? c.endedAt : c.startedAt;
        st.calls.push(c);
        st.act += Math.exp(-(t - tt) / 80000);
        st.last = Math.max(st.last, tt);
        if (done) {
          if (c.status === 'error') st.failed++;
          else if (c.kind === 'files') st.reads++;
          else { st.edits++; if (c.diff) { st.added += c.diff.added; st.removed += c.diff.removed; st.lines += c.diff.added - c.diff.removed; } if (st.born === null) st.born = c.endedAt; }
        }
      }
      if (done) for (const r of c.refs) if (r.role === 'cited' && r.type === 'file' && out[r.value]) { out[r.value].act += 0.35 * Math.exp(-(t - c.endedAt) / 80000); out[r.value].last = Math.max(out[r.value].last, c.endedAt); }
    }
    fsKey = key; fsCache = out;
    return out;
  }

  // ---------------------------------------------------------------- flow hops (time based, so replay works)
  const isStartHop = h => /^tool:/.test(h.to) && /^(model|context|lane:)/.test(h.from);
  function hopsOf(c) {
    if (c._g && c._g.n === c.flow.length && c._g.e === c.endedAt) return c._g.hops;
    let nStart = 0;
    while (nStart < c.flow.length && isStartHop(c.flow[nStart])) nStart++;
    const hops = [];
    let idx = -1, lastGroup = '';
    c.flow.forEach((h, i) => {
      const start = i < nStart;
      const t0b = start ? c.startedAt : c.endedAt;
      if (t0b == null) return;
      const group = `${start}|${h.from.split(':')[0]}>${h.to}`;
      if (group !== lastGroup) { idx++; lastGroup = group; }
      if (i === nStart) idx = 0;
      const amt = h.tokens || (h.bytes ? h.bytes / 4 : 40);
      hops.push({ h, t0: t0b + idx * 480, D: 1000 + 280 * Math.log10(1 + amt), amt, err: c.status === 'error' && !start && /error|failure/.test(h.what) });
    });
    c._g = { n: c.flow.length, e: c.endedAt, hops };
    return hops;
  }
  function nodePos(id, c, t) {
    if (id === 'model' || id === 'context') return lanePos('main', t);
    if (id.startsWith('tool:')) return lanePos(c.lane, t);
    if (id.startsWith('lane:')) return lanePos(id.slice(5), t);
    if (id.startsWith('file:')) { const s = STARS.get(id.slice(5)); return s ? s : lanePos(c.lane, t); }
    if (id.startsWith('web:')) return ensureQuasar(id.slice(4));
    if (id === 'mcp:github') return cometPos(t);
    if (id === 'terminal') return PULSAR;
    if (id === 'plan') return BEACON;
    if (id === 'user' || id === 'answer') return HOME;
    return lanePos('main', t);
  }

  // ---------------------------------------------------------------- view state
  const view = { zoom: 1, px: 0, py: 0, W: 0, H: 0, s: 1 };
  let inspectT = null; // null = live
  let liveT = S.now, lastTickPerf = performance.now(), dragging = false;
  let selected = null; // { type, id }
  let hits = [], segs = [], kbIndex = -1, hover = null;
  sim.on('tick', () => { lastTickPerf = performance.now(); });

  const chart = $('#chart'), g = chart.getContext('2d');
  const tl = $('#timeline'), tg = tl.getContext('2d');
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    for (const [cv, cx] of [[chart, g], [tl, tg]]) {
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cv._w = r.width; cv._h = r.height;
    }
  }
  window.addEventListener('resize', resize);
  const X = x => (x - view.px) * view.s + view.W / 2;
  const Y = y => (y - view.py) * view.s + view.H / 2;
  const WX = sx => (sx - view.W / 2) / view.s + view.px;
  const WY = sy => (sy - view.H / 2) / view.s + view.py;

  // background starfield
  const DUST = [];
  { let a = 12345; const r = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; for (let i = 0; i < 520; i++) DUST.push({ x: r() * 2400 - 1200, y: r() * 2000 - 1000, m: r(), p: 0.25 + r() * 0.5 }); }

  // ---------------------------------------------------------------- drawing primitives
  function text(str, x, y, color, size = 10, align = 'left', weight = '') {
    g.font = `${weight} ${size}px ${MONO}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(str, x, y);
  }
  function glow(x, y, r, color, a = 1) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, hexA(color, a)); grd.addColorStop(1, hexA(color, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  function scarMark(x, y, size, a) {
    g.save(); g.strokeStyle = hexA(RED, a); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - size, y - size); g.lineTo(x + size, y + size); g.moveTo(x + size, y - size); g.lineTo(x - size, y + size); g.stroke();
    g.lineWidth = 1; g.beginPath(); for (let i = 0; i < 6; i++) { const an = i * 1.047 + 0.3; g.moveTo(x + Math.cos(an) * size * 1.3, y + Math.sin(an) * size * 1.3); g.lineTo(x + Math.cos(an) * size * 2, y + Math.sin(an) * size * 2); } g.stroke();
    g.restore();
  }
  function brackets(x, y, r, color) {
    g.save(); g.strokeStyle = color; g.lineWidth = 1.5; const l = Math.max(5, r * 0.5);
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.moveTo(x + sx * r, y + sy * (r - l)); g.lineTo(x + sx * r, y + sy * r); g.lineTo(x + sx * (r - l), y + sy * r); g.stroke(); }
    g.restore();
  }
  function hit(x, y, r, sel, label, prio = 1) { hits.push({ x, y, r, sel, label, prio }); }

  // ---------------------------------------------------------------- chart render
  function drawChart(T, realNow) {
    const W = chart._w, H = chart._h;
    view.W = W; view.H = H;
    view.s = Math.min(W / 1260, H / 1040) * view.zoom;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    hits = []; segs = [];
    const stats = fileStatsAt(T);

    // dust with parallax
    for (const d of DUST) {
      const sx = (d.x - view.px * d.p) * view.s * (0.6 + d.p * 0.4) + W / 2, sy = (d.y - view.py * d.p) * view.s * (0.6 + d.p * 0.4) + H / 2;
      if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
      const tw = reduced ? 1 : 0.7 + 0.3 * Math.sin(realNow / 900 + d.m * 40);
      g.fillStyle = `rgba(${170 + d.m * 60 | 0},${200 + d.m * 40 | 0},255,${(0.12 + d.m * 0.4) * tw})`;
      g.fillRect(sx, sy, d.m > 0.92 ? 1.6 : 1, d.m > 0.92 ? 1.6 : 1);
    }
    // galaxy disc
    {
      const gx = X(-10), gy = Y(10), r = 560 * view.s;
      g.save(); g.translate(gx, gy); g.scale(1, 0.82);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grd.addColorStop(0, 'rgba(40,60,140,0.10)'); grd.addColorStop(0.6, 'rgba(30,30,110,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill(); g.restore();
      text('· · · GALAXY RIM · · ·  outside: quasars (web)', X(0), Y(-405), 'rgba(90,110,160,0.55)', 9, 'center');
    }
    // nebulae + constellation lines + folder labels
    for (const [name, f] of Object.entries(FOLDERS)) {
      const members = [...STARS.values()].filter(s => s.folder === name && (!s.isNew || (stats[s.path] && stats[s.path].born != null && stats[s.path].born <= T)));
      if (!members.length) continue;
      const act = members.reduce((a, s) => a + (stats[s.path] ? stats[s.path].act : 0), 0);
      const r = (90 + members.length * 16) * view.s;
      for (let i = 0; i < 3; i++) {
        const ox = Math.cos(i * 2.1 + hash(name) % 7) * r * 0.35, oy = Math.sin(i * 2.1 + hash(name) % 5) * r * 0.25;
        const grd = g.createRadialGradient(X(f.x) + ox, Y(f.y) + oy, 0, X(f.x) + ox, Y(f.y) + oy, r * (0.8 + i * 0.15));
        grd.addColorStop(0, rgba(f.neb, 0.10 + Math.min(0.12, act * 0.03))); grd.addColorStop(1, rgba(f.neb, 0));
        g.fillStyle = grd; g.beginPath(); g.arc(X(f.x) + ox, Y(f.y) + oy, r * (0.8 + i * 0.15), 0, 6.2832); g.fill();
      }
      // constellation lines: nearest-neighbour chain
      if (members.length > 1) {
        g.strokeStyle = rgba(f.neb.map(v => Math.min(255, v + 60)), 0.22); g.lineWidth = 1; g.setLineDash([]);
        const order = [...members].sort((a, b) => Math.atan2(a.y - f.y, a.x - f.x) - Math.atan2(b.y - f.y, b.x - f.x));
        g.beginPath(); order.forEach((s, i) => { if (i) g.lineTo(X(s.x), Y(s.y)); else g.moveTo(X(s.x), Y(s.y)); }); g.stroke();
      }
      const ly = Math.min(...members.map(s => s.y)) - 34;
      text(f.label, X(f.x), Y(ly), rgba(f.neb.map(v => Math.min(255, v + 90)), 0.75), 10, 'center', '600');
    }

    // trails (the route through the codebase)
    for (const lane of S.lanes) drawTrail(lane, T);
    drawRetries(T);

    // stars
    for (const s of STARS.values()) drawStar(s, stats[s.path], T, realNow);

    // fixed objects: pulsar, beacon, home, quasars, comet
    drawPulsar(T, realNow);
    drawBeacon(T, realNow);
    drawHome(T);
    for (const q of QUASARS.values()) drawQuasar(q, T, realNow);
    drawComet(T, realNow);

    // scars from errors
    drawScars(T);

    // calls: running visuals, end effects, hops
    drawCallEffects(T, realNow);
    drawMarkerEffects(T);

    // causal chain for a selected call
    if (selected && selected.type === 'call') drawCausal(callById(selected.id), T);

    // crafts and probes on top
    for (const lane of S.lanes) if (laneVisible(lane, T)) drawCraft(lane, T, realNow);

    // selection reticle
    const sp = selectionPos(T);
    if (sp) brackets(X(sp.x), Y(sp.y), sp.r || 16, '#ffffff');
    // keyboard focus
    const fh = kbTargets()[kbIndex];
    if (fh && document.activeElement === chart) { g.save(); g.setLineDash([3, 3]); g.strokeStyle = CYAN; g.beginPath(); g.arc(fh.x, fh.y, fh.r + 6, 0, 6.2832); g.stroke(); g.restore(); text(fh.label.split('\n')[0], fh.x, fh.y - fh.r - 14, CYAN, 10, 'center'); }
  }

  function drawTrail(lane, T) {
    const w = WP[lane.key];
    if (!w) return;
    const color = laneColor[lane.key];
    const main = lane.depth === 0;
    for (let i = 1; i < w.length; i++) {
      const wp = w[i];
      if (wp.t > T) break;
      const age = T - wp.t;
      // the route fades: bright for the last minute, a faint ghost for a few more, then gone
      const a = (main ? 0.9 : 0.75) * Math.exp(-age / 45000);
      if (a < 0.035) continue;
      const A = wpXY(w[i - 1], wp.t, lane.key);
      const B = wpXY(wp, wp.t + FLY, lane.key);
      const e = clamp((T - wp.t) / FLY, 0, 1);
      if (Math.hypot(A.x - B.x, A.y - B.y) < 1) continue;
      const pts = [];
      const n = 14;
      for (let j = 0; j <= n; j++) { const p = bez(A, B, (j / n) * e, hash(lane.key) + i); pts.push({ x: X(p.x), y: Y(p.y) }); }
      g.save();
      g.strokeStyle = hexA(color, a); g.lineWidth = main ? 1.7 : 1.1;
      if (wp.dockEnd) g.setLineDash([2, 4]);
      g.beginPath(); pts.forEach((p, j) => j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
      g.restore();
      // stop marker
      if (e >= 1 && !wp.dock) { g.fillStyle = hexA(color, a); g.fillRect(pts[n].x - 1.5, pts[n].y - 1.5, 3, 3); }
      if (wp.call) segs.push({ pts, sel: { type: 'call', id: wp.call }, label: `${lane.label} route → ${base(wp.star || '')}` });
    }
  }

  function drawRetries(T) {
    for (const c of S.calls) {
      if (!c.retryOf || c.startedAt > T || T - c.startedAt > 20 * 60000) continue;
      const o = callById(c.retryOf);
      if (!o) continue;
      const A = callLoc(o), B = callLoc(c);
      g.save(); g.setLineDash([4, 4]); g.strokeStyle = hexA(c.status === 'error' ? RED : ICE, 0.55); g.lineWidth = 1.2;
      let lx, ly;
      if (Math.hypot(A.x - B.x, A.y - B.y) < 8) {
        const r = 15 + (c.attempt - 2) * 5; const cx = X(A.x) - 2, cy = Y(A.y) - r * 1.1;
        g.beginPath(); g.arc(cx, cy, r, 0.4 * Math.PI, 2.6 * Math.PI); g.stroke();
        g.setLineDash([]); g.beginPath(); g.moveTo(cx + r * Math.cos(0.4 * Math.PI) - 4, cy + r * Math.sin(0.4 * Math.PI) - 2); g.lineTo(cx + r * Math.cos(0.4 * Math.PI), cy + r * Math.sin(0.4 * Math.PI)); g.lineTo(cx + r * Math.cos(0.4 * Math.PI) + 4, cy + r * Math.sin(0.4 * Math.PI) - 3); g.stroke();
        lx = cx; ly = cy - r - 7;
      } else {
        g.beginPath(); g.moveTo(X(A.x), Y(A.y)); const m = bez(A, B, 0.5, 3); g.quadraticCurveTo(X(m.x) * 2 - (X(A.x) + X(B.x)) / 2, Y(m.y) * 2 - (Y(A.y) + Y(B.y)) / 2, X(B.x), Y(B.y)); g.stroke();
        lx = X(m.x); ly = Y(m.y) - 8;
      }
      g.restore();
      text(`↻ try ${c.attempt}`, lx, ly, hexA(c.status === 'error' ? RED : ICE, 0.8), 9, 'center');
      hit(lx, ly, 10, { type: 'call', id: c.id }, `Retry: ${c.tool} attempt ${c.attempt}\nretry of ${o.id} (${o.error ? o.error.code : o.status})`, 2);
    }
  }

  function drawStar(s, st, T, realNow) {
    if (!st) return;
    if (s.isNew && (st.born == null || st.born > T)) return;
    const x = X(s.x), y = Y(s.y);
    const size = (2.2 + Math.sqrt(Math.max(10, st.lines)) * 0.32) * Math.max(0.7, Math.min(1.6, view.s * 1.2));
    const bright = clamp(0.35 + 0.65 * Math.min(1, st.act), 0.35, 1);
    const hot = st.edits >= 3;
    const tw = reduced ? 1 : 0.9 + 0.1 * Math.sin(realNow / 700 + s.tw);
    // halo
    glow(x, y, size * (4 + bright * 4), hot ? '#ffcf96' : '#9fdcff', 0.18 * bright * tw);
    // hot corona
    if (hot) {
      const pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(realNow / 260);
      g.save(); g.strokeStyle = hexA('#ffd9a8', 0.35 + 0.35 * pulse); g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 16; i++) { const an = i / 16 * 6.2832 + realNow / 4000; const r1 = size * 1.6, r2 = size * (2.4 + (i % 2) * 0.8 + pulse * 0.6); g.moveTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); g.lineTo(x + Math.cos(an) * r2, y + Math.sin(an) * r2); }
      g.stroke(); g.restore();
    }
    // edit rings: one per edit
    const rings = Math.min(st.edits, 8);
    for (let i = 0; i < rings; i++) { g.strokeStyle = hexA(hot ? '#ffe3bd' : '#cfe9ff', 0.5 - i * 0.04); g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, size + 4 + i * 3.2, 0, 6.2832); g.stroke(); }
    // core
    const core = g.createRadialGradient(x, y, 0, x, y, size);
    core.addColorStop(0, '#ffffff'); core.addColorStop(0.45, hot ? '#ffe8c8' : hexA('#bfeaff', 0.6 + bright * 0.4)); core.addColorStop(1, hexA(hot ? '#ffb070' : '#4fa8ff', 0.1));
    g.fillStyle = core; g.beginPath(); g.arc(x, y, size, 0, 6.2832); g.fill();
    // label
    const lc = st.failed ? '#ffb3c0' : hot ? '#ffe3bd' : hexA('#bfe3ff', 0.45 + bright * 0.5);
    text(base(s.path), x + size + 6 + rings * 3, y - 1, lc, 10);
    if (st.edits || st.reads) text(`${st.lines}L${st.edits ? ` · ${st.edits}✎` : ''}${hot ? ' HOT' : ''}`, x + size + 6 + rings * 3, y + 10, hexA(hot ? '#ffcf96' : '#7f9cc0', 0.8), 8);
    hit(x, y, Math.max(9, size + 4 + rings * 3), { type: 'file', id: s.path }, `${s.path}\n${st.lines} lines · ${st.reads} reads · ${st.edits} edits${st.failed ? ` · ${st.failed} failed` : ''}${hot ? '\nHOT: 3+ edits' : ''}`, 3);
  }

  function lastCalls(filter, T, n) { const out = []; for (let i = S.calls.length - 1; i >= 0 && out.length < n; i--) { const c = S.calls[i]; if (c.startedAt <= T && filter(c)) out.push(c); } return out; }

  function drawPulsar(T, realNow) {
    const x = X(PULSAR.x), y = Y(PULSAR.y);
    const runningShell = lastCalls(c => c.kind === 'shell', T, 6).filter(c => c.endedAt == null || c.endedAt > T);
    const spin = reduced ? 0 : realNow / (runningShell.length ? 180 : 1400);
    glow(x, y, 34, K.shell.c, 0.35);
    g.save(); g.translate(x, y); g.rotate(spin);
    const beam = g.createLinearGradient(0, -60, 0, 60);
    beam.addColorStop(0, hexA(K.shell.c, 0)); beam.addColorStop(0.5, hexA('#e6d8ff', 0.75)); beam.addColorStop(1, hexA(K.shell.c, 0));
    g.fillStyle = beam; g.beginPath(); g.moveTo(-3, -60); g.lineTo(3, -60); g.lineTo(-3, 60); g.lineTo(3, 60); g.closePath();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-5, -60); g.lineTo(5, -60); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-5, 60); g.lineTo(5, 60); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#f2ebff'; g.beginPath(); g.arc(x, y, 4, 0, 6.2832); g.fill();
    text('TERMINAL PULSAR', x, y - 72, hexA(K.shell.c, 0.9), 9, 'center', '600');
    // readout: last commands with exit pattern
    const recent = lastCalls(c => c.kind === 'shell', T, 4);
    const rx = Math.min(x - 50, chart._w - 178);
    if (recent.length) { g.fillStyle = 'rgba(8,2,20,0.7)'; g.fillRect(rx - 4, y + 66, 176, recent.length * 13 + 4); }
    recent.forEach((c, i) => {
      const yy = y + 74 + i * 13;
      const done = c.endedAt != null && c.endedAt <= T;
      const cmd = (c.target && c.target.value || '').slice(0, 20);
      const code = !done ? '…' : c.error ? `${c.error.code} ✕` : `exit ${c.output && c.output.exitCode != null ? c.output.exitCode : 0}`;
      text(`$ ${cmd}`, rx, yy, hexA('#d8c8ff', i ? 0.55 : 0.9), 9);
      text(code, rx + 168, yy, !done ? K.agents.c : c.error ? RED : hexA(CYAN, 0.8), 9, 'right', c.error ? '700' : '');
      hit(rx + 60, yy, 7, { type: 'call', id: c.id }, `${c.target.value}\n${code}`, 2);
    });
    hit(x, y, 24, { type: 'terminal' }, 'Terminal pulsar\nall shell commands and exit codes', 2);
  }

  function drawBeacon(T, realNow) {
    const x = X(BEACON.x), y = Y(BEACON.y);
    const last = lastCalls(c => c.kind === 'memory', T, 1)[0];
    const since = last ? T - (last.endedAt || last.startedAt) : 1e9;
    const blink = reduced ? 0.7 : (Math.sin(realNow / 500) > 0.6 ? 1 : 0.35);
    g.strokeStyle = hexA(K.memory.c, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y + 18); g.lineTo(x, y - 14); g.moveTo(x - 8, y + 18); g.lineTo(x, y - 4); g.lineTo(x + 8, y + 18); g.stroke();
    glow(x, y - 16, since < 2500 ? 40 : 18, K.memory.c, since < 2500 ? 0.8 : 0.4 * blink);
    g.fillStyle = K.memory.c; g.beginPath(); g.arc(x, y - 16, 3, 0, 6.2832); g.fill();
    text('NAV LOG BEACON', x, y - 34, hexA(K.memory.c, 0.85), 9, 'center', '600');
    // task boxes as of T (live list; history used for past)
    const items = S.tasks.items.map(it => { let st = null; for (const h of it.history) if (h.time <= T) st = h.status; return st; }).filter(Boolean);
    const done = items.filter(s => s === 'completed').length;
    items.forEach((st, i) => {
      const bx = x - items.length * 6 + i * 12, by = y + 30;
      g.strokeStyle = K.memory.c; g.lineWidth = 1; g.strokeRect(bx, by, 9, 9);
      if (st === 'completed') { g.fillStyle = K.memory.c; g.fillRect(bx + 2, by + 2, 5, 5); }
      if (st === 'in_progress') { g.fillStyle = hexA(K.memory.c, 0.5); g.fillRect(bx + 2, by + 2, 3, 5); }
    });
    if (items.length) text(`${done}/${items.length} done`, x, y + 50, hexA(K.memory.c, 0.75), 9, 'center');
    hit(x, y, 24, { type: 'plan' }, `Navigation log (task list)\n${done} of ${items.length} completed`, 2);
  }

  function drawHome(T) {
    const x = X(HOME.x), y = Y(HOME.y);
    g.strokeStyle = hexA(ICE, 0.7); g.lineWidth = 1.3;
    g.beginPath(); g.arc(x, y, 12, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y + 10); g.moveTo(x - 6, y + 10); g.lineTo(x + 6, y + 10); g.stroke();
    text('HOME RELAY · prompts in / replies out', x, y + 22, hexA(ICE, 0.6), 9, 'center');
    const p = [...S.markers].reverse().find(m => m.kind === 'prompt' && m.time <= T);
    if (p) text(`“${p.detail.text.slice(0, 44)}”`, x, y + 34, hexA(CYAN, 0.55), 9, 'center');
    hit(x, y, 18, { type: 'home' }, 'Home relay\nuser prompts and replies', 2);
  }

  function drawQuasar(q, T, realNow) {
    const x = X(q.x), y = Y(q.y);
    const calls = lastCalls(c => c.kind === 'network' && hostOf(c) === q.host, T, 3);
    const runningNow = calls.some(c => c.endedAt == null || c.endedAt > T);
    const last = calls[0];
    glow(x, y, runningNow ? 30 : 16, K.network.c, runningNow ? 0.7 : 0.35);
    g.strokeStyle = hexA('#b9c6ff', 0.5); g.lineWidth = 1;
    const jl = runningNow && !reduced ? 22 + 6 * Math.sin(realNow / 120) : 16;
    g.beginPath(); g.moveTo(x - jl * 0.3, y - jl); g.lineTo(x + jl * 0.3, y + jl); g.stroke();
    g.fillStyle = '#e8ecff'; g.beginPath(); g.arc(x, y, 2.6, 0, 6.2832); g.fill();
    text(q.host, x, y + 24, hexA('#b9c6ff', 0.8), 9, 'center');
    if (last) {
      const done = last.endedAt != null && last.endedAt <= T;
      const st = !done ? 'signal…' : last.error ? `${last.error.code} ✕` : `${last.output && last.output.status || 200} ok`;
      text(st, x, y + 35, !done ? K.agents.c : last.error ? RED : hexA(CYAN, 0.6), 8, 'center', last.error ? '700' : '');
    }
    hit(x, y, 18, { type: 'host', id: q.host }, `Quasar: ${q.host}\n${calls.length ? 'web fetches from this host' : 'no fetches yet'}`, 2);
  }

  function drawComet(T, realNow) {
    const p = cometPos(T), p2 = cometPos(T - 4000);
    const x = X(p.x), y = Y(p.y);
    const running = lastCalls(c => c.kind === 'other', T, 2).some(c => c.endedAt == null || c.endedAt > T);
    const dx = x - X(p2.x), dy = y - Y(p2.y), d = Math.hypot(dx, dy) || 1;
    const tail = running ? 90 : 50;
    const grd = g.createLinearGradient(x, y, x - dx / d * tail, y - dy / d * tail);
    grd.addColorStop(0, hexA(K.other.c, 0.7)); grd.addColorStop(1, hexA(K.other.c, 0));
    g.strokeStyle = grd; g.lineWidth = running ? 5 : 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - dx / d * tail + dy / d * 6, y - dy / d * tail - dx / d * 6); g.stroke(); g.lineCap = 'butt';
    glow(x, y, running ? 18 : 9, K.other.c, 0.7);
    g.fillStyle = '#eafff0'; g.beginPath(); g.arc(x, y, 2.4, 0, 6.2832); g.fill();
    text('MCP github comet', x, y - 14, hexA(K.other.c, 0.7), 9, 'center');
    hit(x, y, 14, { type: 'mcp' }, 'Comet: MCP github\nother tools (MCP, NotebookEdit)', 2);
  }

  function drawScars(T) {
    const groups = new Map();
    for (const c of S.errors) {
      if (c.endedAt > T) continue;
      const key = locKey(c);
      const gr = groups.get(key) || { calls: [], key };
      gr.calls.push(c); groups.set(key, gr);
    }
    for (const gr of groups.values()) {
      const c = gr.calls[gr.calls.length - 1];
      const loc = callLoc(c);
      let x = X(loc.x), y = Y(loc.y);
      if (gr.key.startsWith('file:')) { x -= 16; y -= 14; } else if (gr.key === 'terminal') { x -= 36; y += 30; } else if (gr.key.startsWith('host:')) { x -= 20; y += 4; } else if (gr.key === 'plan') { x += 22; y -= 4; } else { x += 14; y += 12; }
      const age = T - c.endedAt;
      const a = Math.max(0.55, 1 - age / 600000);
      scarMark(x, y, 4.5, a);
      const label = `${c.error.code}${gr.calls.length > 1 ? ` ×${gr.calls.length}` : ''}`;
      g.font = `700 9px ${MONO}`;
      const tw = g.measureText(label).width;
      g.fillStyle = 'rgba(30,0,6,0.8)'; g.fillRect(x - tw - 12, y - 6, tw + 4, 12);
      text(label, x - 10, y, hexA('#ff6b80', a), 9, 'right', '700');
      hit(x, y, 9, gr.calls.length > 1 ? { type: 'errors', id: gr.key } : { type: 'call', id: c.id }, `Error scar: ${label}\n${c.error.message}`, 4);
    }
  }

  function particle(style, x, y, s, color, a, ang, seed) {
    g.globalAlpha = a;
    switch (style) {
      case 'glyph': { g.font = `${8 + s}px ${MONO}`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('{;a=()<>'[seed % 8], x, y); break; }
      case 'bolt': { g.strokeStyle = color; g.lineWidth = s; g.beginPath(); g.moveTo(x - Math.cos(ang) * s * 4, y - Math.sin(ang) * s * 4); g.lineTo(x, y); g.stroke(); glow(x, y, s * 3, '#ffd9a8', 0.5 * a); break; }
      case 'wave': { g.strokeStyle = color; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 3 + s * 1.5, ang + Math.PI - 0.9, ang + Math.PI + 0.9); g.stroke(); break; }
      case 'square': { g.fillStyle = color; g.fillRect(x - s / 2, y - s / 2, s, s); break; }
      case 'diamond': { g.fillStyle = color; g.beginPath(); g.moveTo(x, y - s * 1.4); g.lineTo(x + s, y); g.lineTo(x, y + s * 1.4); g.lineTo(x - s, y); g.closePath(); g.fill(); break; }
      case 'chevron': { g.strokeStyle = color; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - Math.cos(ang - 0.6) * s * 2, y - Math.sin(ang - 0.6) * s * 2); g.lineTo(x, y); g.lineTo(x - Math.cos(ang + 0.6) * s * 2, y - Math.sin(ang + 0.6) * s * 2); g.stroke(); break; }
      case 'dash': { g.strokeStyle = color; g.lineWidth = s * 0.8; g.beginPath(); g.moveTo(x - Math.cos(ang) * s * 2.5, y - Math.sin(ang) * s * 2.5); g.lineTo(x + Math.cos(ang) * s * 2.5, y + Math.sin(ang) * s * 2.5); g.stroke(); break; }
      default: { g.fillStyle = color; g.beginPath(); g.arc(x, y, s, 0, 6.2832); g.fill(); }
    }
    g.globalAlpha = 1;
  }
  function hopStyle(c, h, err) {
    if (err) return ['dot', RED];
    if (h.from.startsWith('file:') && c.kind === 'files') return ['glyph', K.files.c];
    if (h.to.startsWith('file:')) return ['bolt', HOT];
    if (h.to === 'terminal') return ['dash', K.shell.c];
    if (h.from === 'terminal') return ['square', c.status === 'error' ? '#ff7d92' : '#d8c8ff'];
    if (h.from.startsWith('web:')) return ['wave', '#a9b8ff'];
    if (h.from.startsWith('mcp:')) return ['dot', K.other.c];
    if (h.to === 'plan') return ['chevron', K.memory.c];
    if (c.kind === 'agents') return ['diamond', K.agents.c];
    return ['dot', K[c.kind].c];
  }

  function drawHop(c, hp, T) {
    const p = (T - hp.t0) / hp.D;
    if (p < 0 || p > 1) return;
    const { h } = hp;
    const A = nodePos(h.from, c, T), B = nodePos(h.to, c, T);
    const ax = X(A.x), ay = Y(A.y), bx = X(B.x), by = Y(B.y);
    const dist = Math.hypot(bx - ax, by - ay);
    const amt = hp.amt;
    const n = reduced ? 2 : clamp(Math.round(2 + Math.log2(1 + amt / 40)), 2, 16);
    const s = 1.2 + Math.log10(1 + amt) * 0.75;
    const [style, color] = hopStyle(c, h, hp.err);
    if (dist < 8) {
      // intake into the cargo hold (or a charge-up at the craft)
      if (!(h.to === 'context' || h.to.startsWith('lane:'))) return;
      for (let j = 0; j < n; j++) {
        const q = clamp(p * 1.4 - j / n * 0.4, 0, 1);
        if (q <= 0 || q >= 1) continue;
        const an = j * 2.4 + q * 5;
        const r = (1 - q) * (16 + s * 4);
        particle(style === 'glyph' ? 'glyph' : 'dot', bx + Math.cos(an) * r, by + Math.sin(an) * r, s * 0.8, hp.err ? RED : CYAN, 1 - q * 0.6, an, j);
      }
      return;
    }
    const seed = hash(c.id + h.to);
    const A2 = { x: ax, y: ay }, B2 = { x: bx, y: by };
    for (let j = 0; j < n; j++) {
      const q = p * (1 + n * 0.06) - j * 0.06;
      if (q < 0 || q > 1) continue;
      const e = ease(q);
      const pt = bez(A2, B2, e, seed);
      const nx = bez(A2, B2, Math.min(1, e + 0.02), seed);
      const ang = Math.atan2(nx.y - pt.y, nx.x - pt.x);
      const jit = Math.sin(j * 1.7 + seed) * s * 1.6;
      particle(style, pt.x - Math.sin(ang) * jit, pt.y + Math.cos(ang) * jit, s, color, Math.sin(q * Math.PI) * 0.9 + 0.1, ang, j + seed);
    }
    // what label on the lead particle for big hops
    if (amt > 300 && p > 0.15 && p < 0.85) { const pt = bez(A2, B2, ease(p), seed); text(`${h.what}${h.tokens ? ` · ${ktok(h.tokens)} tok` : h.bytes ? ` · ${kbytes(h.bytes)}` : ''}`, pt.x + 8, pt.y - 9, hexA(color, 0.75), 9); }
  }

  function firstCallIndex(t) { let lo = 0, hi = S.calls.length; while (lo < hi) { const m = (lo + hi) >> 1; if (S.calls[m].startedAt < t) lo = m + 1; else hi = m; } return lo; }

  function drawCallEffects(T, realNow) {
    const from = firstCallIndex(T - 20000);
    const to = firstCallIndex(T + 1);
    for (let i = from; i < to; i++) {
      const c = S.calls[i];
      const running = c.endedAt == null || c.endedAt > T;
      const craft = lanePos(c.lane, T);
      const cx = X(craft.x), cy = Y(craft.y);
      if (running) {
        if (c.kind === 'files' && c.tool === 'Read') {
          const s = STARS.get(fileOf(c));
          if (s) {
            const sx = X(s.x), sy = Y(s.y), an = Math.atan2(sy - cy, sx - cx), w = 9 + (reduced ? 0 : Math.sin(realNow / 90) * 3);
            const grd = g.createLinearGradient(cx, cy, sx, sy); grd.addColorStop(0, hexA(K.files.c, 0.55)); grd.addColorStop(1, hexA(K.files.c, 0.05));
            g.fillStyle = grd; g.beginPath(); g.moveTo(cx, cy); g.lineTo(sx - Math.sin(an) * w, sy + Math.cos(an) * w); g.lineTo(sx + Math.sin(an) * w, sy - Math.cos(an) * w); g.closePath(); g.fill();
            text('SCAN', (cx + sx) / 2, (cy + sy) / 2 - 10, hexA(K.files.c, 0.8), 8, 'center');
          }
        } else if (c.kind === 'files') {
          const an = reduced ? 0 : realNow / 260;
          g.fillStyle = hexA(K.files.c, 0.12); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 120 * view.s + 30, an, an + 0.7); g.closePath(); g.fill();
          text(`${c.tool} ${c.target ? c.target.value : ''}`.slice(0, 30), cx, cy + 26, hexA(K.files.c, 0.8), 9, 'center');
        } else if (c.kind === 'edits') {
          glow(cx, cy, 20, '#ffe3bd', 0.5 + (reduced ? 0 : 0.3 * Math.sin(realNow / 70)));
          const s = STARS.get(fileOf(c));
          if (s) { g.strokeStyle = hexA(HOT, 0.4); g.setLineDash([1, 3]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(X(s.x), Y(s.y)); g.stroke(); g.setLineDash([]); }
        } else if (c.kind === 'shell') {
          g.strokeStyle = hexA(K.shell.c, 0.45); g.setLineDash([6, 5]); g.lineDashOffset = reduced ? 0 : -realNow / 40;
          g.beginPath(); g.moveTo(cx, cy); g.lineTo(X(PULSAR.x), Y(PULSAR.y)); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
          text(`$ ${c.target.value}`, X(PULSAR.x), Y(PULSAR.y) + 52, '#e6d8ff', 10, 'center', '700');
        } else if (c.kind === 'network') {
          const q = ensureQuasar(hostOf(c));
          g.strokeStyle = hexA(K.network.c, 0.35); g.setLineDash([2, 6]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(X(q.x), Y(q.y)); g.stroke(); g.setLineDash([]);
        } else if (c.kind === 'agents' && c.input && c.input.result_of) {
          const pp = lanePos(c.input.result_of, T);
          g.strokeStyle = hexA(K.agents.c, 0.5); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(X(pp.x), Y(pp.y)); g.stroke(); g.setLineDash([]);
        }
      } else {
        const dt = T - c.endedAt;
        if (dt < 2600) {
          const k = dt / 2600;
          if (c.status === 'error') {
            const l = callLoc(c); const x = X(l.x), y = Y(l.y);
            glow(x, y, 20 + k * 70, RED, 0.7 * (1 - k));
            g.strokeStyle = hexA(RED, 1 - k); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6 + k * 60, 0, 6.2832); g.stroke();
            g.lineWidth = 1.2; g.beginPath(); for (let j = 0; j < 10; j++) { const an = j * 0.628; g.moveTo(x + Math.cos(an) * (8 + k * 20), y + Math.sin(an) * (8 + k * 20)); g.lineTo(x + Math.cos(an) * (14 + k * 50), y + Math.sin(an) * (14 + k * 50)); } g.stroke();
            text(`✕ ${c.error.code}`, x, y - 22 - k * 20, hexA('#ff8094', 1 - k * 0.5), 13, 'center', '700');
          } else if (c.kind === 'edits') {
            const s = STARS.get(fileOf(c));
            if (s) {
              const x = X(s.x), y = Y(s.y);
              const st = fileStatsAt(T)[s.path];
              const nova = st && st.born === c.endedAt;
              glow(x, y, (nova ? 60 : 30) + k * 30, '#fff1dc', (nova ? 1 : 0.8) * (1 - k));
              g.strokeStyle = hexA('#ffffff', 1 - k); g.lineWidth = 1.3; g.beginPath();
              for (let j = 0; j < 4; j++) { const an = j * Math.PI / 2 + 0.785; const r = 10 + k * (nova ? 60 : 30); g.moveTo(x + Math.cos(an) * 4, y + Math.sin(an) * 4); g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); }
              g.stroke();
              text(nova ? '✷ NOVA · new file' : `+${c.diff ? c.diff.added : 0} −${c.diff ? c.diff.removed : 0}`, x, y - 20 - k * 12, hexA(HOT, 1 - k * 0.6), nova ? 11 : 10, 'center', '700');
            }
          } else if (c.kind === 'shell') {
            const x = X(PULSAR.x), y = Y(PULSAR.y);
            // exit pattern: exit 0 = one long ice pulse; failure = three short crimson pulses
            const pulses = c.error ? 3 : 1;
            for (let j = 0; j < pulses; j++) { const kk = (dt - j * 280) / (c.error ? 900 : 2200); if (kk < 0 || kk > 1) continue; g.strokeStyle = hexA(c.error ? RED : CYAN, 1 - kk); g.lineWidth = c.error ? 2 : 3; g.beginPath(); g.arc(x, y, 8 + kk * 70, 0, 6.2832); g.stroke(); }
          } else if (c.kind === 'memory') {
            const x = X(BEACON.x), y = Y(BEACON.y) - 16;
            g.strokeStyle = hexA(K.memory.c, 1 - k); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 6 + k * 40, 0, 6.2832); g.stroke();
          } else if (c.kind === 'files' && c.tool !== 'Read' && dt < 1400) {
            for (const r of c.refs) if (r.role === 'cited') { const s = STARS.get(r.value); if (s) { g.strokeStyle = hexA(K.files.c, 0.5 * (1 - dt / 1400)); g.beginPath(); g.moveTo(cx, cy); g.lineTo(X(s.x), Y(s.y)); g.stroke(); glow(X(s.x), Y(s.y), 14, K.files.c, 0.6 * (1 - dt / 1400)); } }
          }
        }
      }
      for (const hp of hopsOf(c)) drawHop(c, hp, T);
    }
    // probe launches
    for (const lane of S.lanes) {
      if (!lane.depth) continue;
      const dt = T - lane.startedAt;
      if (dt >= 0 && dt < 1600) { const p = lanePos(lane.parent, lane.startedAt); const k = dt / 1600; g.strokeStyle = hexA(laneColor[lane.key], 1 - k); g.lineWidth = 1.5; g.beginPath(); g.arc(X(p.x), Y(p.y), 6 + k * 34, 0, 6.2832); g.stroke(); text('LAUNCH', X(p.x), Y(p.y) - 26 - k * 10, hexA(laneColor[lane.key], 1 - k), 9, 'center', '700'); }
      if (lane.endedAt != null) { const dd = T - lane.endedAt - FLY; if (dd >= 0 && dd < 1200) { const p = lanePos(lane.parent, T); text(lane.state === 'failed' ? 'DOCKED ✕ failed' : 'DOCKED ✓', X(p.x), Y(p.y) + 30, hexA(lane.state === 'failed' ? RED : laneColor[lane.key], 1 - dd / 1200), 9, 'center', '700'); } }
    }
  }

  function drawMarkerEffects(T) {
    for (let i = S.markers.length - 1; i >= 0; i--) {
      const m = S.markers[i];
      if (m.time > T) continue;
      const dt = T - m.time;
      if (dt > 26000) break;
      const craft = lanePos('main', T);
      if (m.kind === 'compaction') {
        const at = lanePos('main', m.time);
        const k = dt / 26000;
        const n = reduced ? 14 : 46;
        for (let j = 0; j < n; j++) {
          const an = j * 2.399 + hash(m.id) % 7, sp = 30 + (j * 37 % 60);
          const x = X(at.x + Math.cos(an) * sp * Math.sqrt(k) * 3), y = Y(at.y + Math.sin(an) * sp * Math.sqrt(k) * 3);
          g.fillStyle = hexA(j % 3 ? AMBER : '#c9a46a', 0.8 * (1 - k)); g.fillRect(x, y, 2 + (j % 3), 2);
        }
        if (dt < 9000) text(`JETTISON · ${ktok(m.detail.before)} → ${ktok(m.detail.after)} tok`, X(at.x), Y(at.y) - 40, hexA(AMBER, 1 - dt / 9000), 11, 'center', '700');
      } else if ((m.kind === 'prompt' || m.kind === 'context-file') && dt < 3000) {
        const k = dt / 3000;
        for (let j = 0; j < 6; j++) { const q = clamp(k * 1.3 - j * 0.05, 0, 1); const p = bez(HOME, craft, ease(q), 5); if (m.kind === 'prompt') particle('wave', X(p.x), Y(p.y), 3, ICE, 1 - q * 0.5, Math.atan2(craft.y - HOME.y, craft.x - HOME.x) + Math.PI, j); else particle('square', X(p.x), Y(p.y), 5, CYAN, 1 - q * 0.5, 0, j); }
        if (m.kind === 'prompt' && dt < 2500) text('PROMPT RECEIVED', X(HOME.x), Y(HOME.y) - 22, hexA(ICE, 1 - k), 10, 'center', '700');
      } else if (m.kind === 'turn-complete' && dt < 3000) {
        const k = dt / 3000;
        for (let j = 0; j < 6; j++) { const q = clamp(k * 1.3 - j * 0.05, 0, 1); const at = lanePos('main', m.time); const p = bez(at, HOME, ease(q), 6); particle('wave', X(p.x), Y(p.y), 3, CYAN, 1 - q * 0.5, Math.atan2(HOME.y - at.y, HOME.x - at.x) + Math.PI, j); }
        text('REPLY SENT · turn complete', X(HOME.x), Y(HOME.y) - 22, hexA(CYAN, 1 - k), 10, 'center', '700');
      }
    }
  }

  function drawCausal(c, T) {
    if (!c) return;
    const chain = new Map();
    let up = c, guard = 0;
    while (up && guard++ < 12) { chain.set(up.id, up); up = up.causedBy ? callById(up.causedBy) : null; }
    const down = [c];
    for (let d = 0; d < 3; d++) { const next = []; for (const x of down) for (const y of S.calls) if ((y.causedBy === x.id || y.retryOf === x.id) && !chain.has(y.id)) { chain.set(y.id, y); next.push(y); } down.splice(0, down.length, ...next); }
    const links = [];
    for (const x of chain.values()) { if (x.causedBy && chain.has(x.causedBy)) links.push([chain.get(x.causedBy), x]); else if (x.retryOf && chain.has(x.retryOf)) links.push([chain.get(x.retryOf), x]); }
    g.save();
    for (const [a, b] of links) {
      const A = callLoc(a), B = callLoc(b);
      const ax = X(A.x), ay = Y(A.y), bx = X(B.x), by = Y(B.y);
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.4;
      if (Math.hypot(ax - bx, ay - by) < 6) { g.beginPath(); g.arc(ax + 12, ay, 12, 0, 6.2832); g.stroke(); continue; }
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      const an = Math.atan2(by - ay, bx - ax), mx = (ax + bx) / 2, my = (ay + by) / 2;
      g.beginPath(); g.moveTo(mx + Math.cos(an) * 6, my + Math.sin(an) * 6); g.lineTo(mx + Math.cos(an + 2.5) * 6, my + Math.sin(an + 2.5) * 6); g.lineTo(mx + Math.cos(an - 2.5) * 6, my + Math.sin(an - 2.5) * 6); g.closePath(); g.fillStyle = '#fff'; g.fill();
    }
    let n = 0;
    for (const x of chain.values()) {
      const L = callLoc(x); const sx = X(L.x), sy = Y(L.y);
      g.fillStyle = x.status === 'error' ? RED : '#fff'; g.beginPath(); g.arc(sx, sy, x.id === c.id ? 5 : 3.5, 0, 6.2832); g.fill();
      g.font = `700 10px ${MONO}`;
      const lab = `${x.id} ${x.tool}${x.error ? ` ✕${x.error.code}` : ''}`;
      const tw = g.measureText(lab).width;
      const ly = sy + 16 + (n++ % 2) * 12;
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(sx - tw / 2 - 3, ly - 7, tw + 6, 13);
      text(lab, sx, ly, x.status === 'error' ? '#ff8094' : '#ffffff', 10, 'center', '700');
    }
    g.restore();
  }

  function drawCraft(lane, T, realNow) {
    const p = lanePos(lane.key, T), q = lanePos(lane.key, T - 160);
    const x = X(p.x), y = Y(p.y);
    let an = Math.atan2(p.y - q.y, p.x - q.x);
    const moving = Math.hypot(p.x - q.x, p.y - q.y) > 1.5;
    if (!moving) an = lane._an ?? -Math.PI / 2; else lane._an = an;
    const color = laneColor[lane.key];
    const main = lane.depth === 0;
    const sz = main ? 11 : 7 - Math.min(2, lane.depth - 1);
    const failed = laneStateAt(lane, T) === 'failed';
    if (main) glow(x, y, 26, '#bfe8ff', 0.35);
    g.save(); g.translate(x, y); g.rotate(an);
    if (moving && !reduced) { const fl = sz * (1.2 + Math.random() * 0.6); const grd = g.createLinearGradient(-sz, 0, -sz - fl * 1.6, 0); grd.addColorStop(0, hexA(CYAN, 0.9)); grd.addColorStop(1, hexA(CYAN, 0)); g.fillStyle = grd; g.beginPath(); g.moveTo(-sz * 0.6, -sz * 0.35); g.lineTo(-sz - fl * 1.6, 0); g.lineTo(-sz * 0.6, sz * 0.35); g.fill(); }
    g.fillStyle = failed ? RED : color; g.strokeStyle = '#000'; g.lineWidth = 1;
    g.beginPath();
    if (main) { g.moveTo(sz * 1.3, 0); g.lineTo(-sz * 0.8, -sz * 0.75); g.lineTo(-sz * 0.4, 0); g.lineTo(-sz * 0.8, sz * 0.75); }
    else { g.moveTo(sz * 1.2, 0); g.lineTo(0, -sz * 0.6); g.lineTo(-sz * 0.8, 0); g.lineTo(0, sz * 0.6); }
    g.closePath(); g.fill(); g.stroke();
    g.restore();
    if (main) {
      // cargo gauge (context window) under the craft
      const pct = contextAt(T);
      const bw = 40, bx = x - bw / 2, by = y + 17;
      g.fillStyle = 'rgba(0,10,25,0.85)'; g.fillRect(bx - 1, by - 1, bw + 2, 6);
      g.fillStyle = ctxColor(pct); g.fillRect(bx, by, bw * pct / 100, 4);
      g.fillStyle = AMBER; g.fillRect(bx + bw * 0.7, by - 2, 1, 8); g.fillStyle = RED; g.fillRect(bx + bw * 0.9, by - 2, 1, 8);
      text(`MAIN · hold ${pct.toFixed(0)}%`, x, y + 30, ctxColor(pct), 10, 'center', '700');
      // permanent cargo modules (context files), towed behind
      const files = S.context.files.filter(f => f.loadedAt <= T);
      const back = an + Math.PI;
      files.forEach((f, i) => {
        const mx = x + Math.cos(back) * (20 + i * 10) + Math.cos(back + Math.PI / 2) * (i % 2 ? 4 : -4), my = y + Math.sin(back) * (20 + i * 10) + Math.sin(back + Math.PI / 2) * (i % 2 ? 4 : -4);
        g.fillStyle = '#0d3350'; g.strokeStyle = CYAN; g.lineWidth = 1; g.fillRect(mx - 3.5, my - 3.5, 7, 7); g.strokeRect(mx - 3.5, my - 3.5, 7, 7);
        hit(mx, my, 6, { type: 'context', id: f.path }, `Cargo module: ${f.path}\n${ktok(f.tokens)} tokens · ${f.why}`, 5);
      });
      hit(x, y, 16, { type: 'lane', id: 'main' }, `Main craft (main session)\ncargo hold ${pct.toFixed(1)}% · ${lane.calls} calls`, 6);
    } else {
      const st = laneStateAt(lane, T);
      text(`${lane.label}${st === 'failed' ? ' ✕' : st === 'completed' ? ' ✓' : ''}`, x, y - 13, failed ? RED : hexA(color, 0.9), 9, 'center', '600');
      hit(x, y, 12, { type: 'lane', id: lane.key }, `Probe: ${lane.label} (depth ${lane.depth})\n${st} · ${lane.calls} calls · ${lane.errors} errors`, 6);
    }
  }

  function contextAt(T) {
    const s = S.context.samples;
    if (!s.length) return 0;
    if (T >= s[s.length - 1].time) return s[s.length - 1].percent;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m].time <= T) lo = m; else hi = m - 1; }
    return s[lo].time <= T ? s[lo].percent : 0;
  }

  function selectionPos(T) {
    if (!selected) return null;
    const { type, id } = selected;
    if (type === 'call') { const c = callById(id); return c ? { ...callLoc(c), r: 14 } : null; }
    if (type === 'file') { const s = STARS.get(id); return s ? { x: s.x, y: s.y, r: 16 } : null; }
    if (type === 'lane') { const l = sim.laneByKey(id); return l ? { ...lanePos(id, Math.min(T, l.endedAt ? l.endedAt + FLY : T)), r: 16 } : null; }
    if (type === 'host') { const q = QUASARS.get(id); return q ? { x: q.x, y: q.y, r: 18 } : null; }
    if (type === 'terminal') return { ...PULSAR, r: 26 };
    if (type === 'plan') return { ...BEACON, r: 26 };
    if (type === 'home') return { ...HOME, r: 20 };
    if (type === 'mcp') return { ...cometPos(T), r: 16 };
    if (type === 'context') return { ...lanePos('main', T), r: 22 };
    return null;
  }

  // ---------------------------------------------------------------- timeline (flight recorder)
  const TL = { x0: 128, pad: 14, win: 30 * 60000 };
  function drawTimeline(T, liveNow) {
    const W = tl._w, H = tl._h;
    tg.fillStyle = '#01040b'; tg.fillRect(0, 0, W, H);
    const x0 = TL.x0, x1 = W - TL.pad, end = liveNow, start = end - TL.win;
    const tx = t => x0 + (t - start) / TL.win * (x1 - x0);
    const yM = 6, yH0 = 22, yH1 = H - 46, yE = H - 38, yA = H - 14;
    tg.font = `600 10px ${MONO}`; tg.fillStyle = '#7fb6ff'; tg.textAlign = 'left'; tg.textBaseline = 'middle';
    tg.fillText('FLIGHT RECORDER', 10, 12);
    tg.font = `9px ${MONO}`; tg.fillStyle = '#4d6585';
    tg.fillText('markers', 10, yM + 8); tg.fillText('activity by kind', 10, (yH0 + yH1) / 2); tg.fillText('— hold %', 10, (yH0 + yH1) / 2 + 12); tg.fillText('errors', 10, yE); tg.fillText('30 min', 10, yA);
    // grid
    tg.strokeStyle = '#0e1a2e'; tg.lineWidth = 1;
    for (let m = 0; m <= 30; m += 5) { const x = tx(end - m * 60000); tg.beginPath(); tg.moveTo(x, yM); tg.lineTo(x, yE + 8); tg.stroke(); tg.fillStyle = '#4d6585'; tg.textAlign = 'center'; tg.fillText(m ? `−${m}m` : 'now', x, yA); }
    // session start
    if (S.session.startedAt > start) { const x = tx(S.session.startedAt); tg.fillStyle = 'rgba(20,30,60,0.35)'; tg.fillRect(x0, yM, x - x0, yE + 8 - yM); tg.fillStyle = '#4d6585'; tg.textAlign = 'right'; tg.fillText('session start ▸', x - 3, yH0 + 6); }
    // histogram: 20s buckets stacked by kind
    const B = 20000, nb = Math.ceil(TL.win / B), buckets = Array.from({ length: nb }, () => ({}));
    let maxB = 1;
    for (let i = firstCallIndex(start); i < S.calls.length; i++) { const c = S.calls[i]; const b = Math.floor((c.startedAt - start) / B); if (b < 0 || b >= nb) continue; buckets[b][c.kind] = (buckets[b][c.kind] || 0) + 1; }
    for (const b of buckets) maxB = Math.max(maxB, Object.values(b).reduce((a, v) => a + v, 0));
    const bw = (x1 - x0) / nb;
    buckets.forEach((b, i) => {
      let y = yH1;
      for (const k of KINDS) { const v = b[k]; if (!v) continue; const h = v / maxB * (yH1 - yH0); tg.fillStyle = hexA(K[k].c, 0.75); tg.fillRect(x0 + i * bw + 0.5, y - h, Math.max(1, bw - 1), h); y -= h; }
    });
    // context % line
    tg.strokeStyle = hexA(CYAN, 0.7); tg.lineWidth = 1; tg.beginPath(); let first = true;
    for (const s of S.context.samples) { if (s.time < start) continue; const x = tx(s.time), y = yH1 - s.percent / 100 * (yH1 - yH0); if (first) { tg.moveTo(x, y); first = false; } else tg.lineTo(x, y); }
    tg.stroke();
    tg.setLineDash([2, 3]); tg.strokeStyle = hexA(AMBER, 0.35); const y70 = yH1 - 0.7 * (yH1 - yH0); tg.beginPath(); tg.moveTo(x0, y70); tg.lineTo(x1, y70); tg.stroke(); tg.strokeStyle = hexA(RED, 0.35); const y90 = yH1 - 0.9 * (yH1 - yH0); tg.beginPath(); tg.moveTo(x0, y90); tg.lineTo(x1, y90); tg.stroke(); tg.setLineDash([]);
    // markers
    tl._marks = [];
    for (const m of S.markers) {
      if (m.time < start) continue; const x = tx(m.time);
      if (m.kind === 'prompt') { tg.fillStyle = ICE; tg.fillRect(x, yM, 1, yH1 - yM); tg.beginPath(); tg.moveTo(x, yM); tg.lineTo(x + 8, yM + 4); tg.lineTo(x, yM + 8); tg.fill(); tg.font = `700 8px ${MONO}`; tg.textAlign = 'left'; tg.fillText('P', x + 2, yM + 15); }
      else if (m.kind === 'turn-complete') { tg.fillStyle = CYAN; tg.font = `700 10px ${MONO}`; tg.textAlign = 'center'; tg.fillText('✓', x, yM + 6); }
      else if (m.kind === 'compaction') { tg.fillStyle = AMBER; tg.fillRect(x - 0.5, yM, 1.5, yH1 - yM); tg.font = `700 9px ${MONO}`; tg.textAlign = 'center'; tg.fillText('⇣C', x, yM + 6); }
      else if (m.kind === 'context-file') { tg.strokeStyle = CYAN; tg.strokeRect(x - 2.5, yM + 2, 5, 5); }
      tl._marks.push({ x, m });
    }
    // error ticks
    tl._errs = [];
    for (const c of S.errors) {
      if (c.endedAt < start) continue; const x = tx(c.endedAt);
      tg.strokeStyle = RED; tg.lineWidth = 1.5; tg.beginPath(); tg.moveTo(x - 3, yE - 4); tg.lineTo(x + 3, yE + 4); tg.moveTo(x + 3, yE - 4); tg.lineTo(x - 3, yE + 4); tg.stroke();
      tg.fillStyle = hexA(RED, 0.4); tg.fillRect(x - 0.5, yH0, 1, yE - 6 - yH0);
      tl._errs.push({ x, c });
    }
    // cursor
    const cx = tx(T);
    if (inspectT != null) {
      tg.fillStyle = 'rgba(255,179,71,0.12)'; tg.fillRect(cx, yM, x1 - cx, yE + 8 - yM);
      tg.strokeStyle = AMBER; tg.lineWidth = 2; tg.beginPath(); tg.moveTo(cx, yM); tg.lineTo(cx, yE + 8); tg.stroke();
      tg.fillStyle = AMBER; tg.font = `700 10px ${MONO}`; tg.textAlign = cx > W - 150 ? 'right' : 'left'; tg.fillText(` INSPECTING ${clock(T)} `, cx + (cx > W - 150 ? -4 : 4), yM + 4);
    } else { tg.fillStyle = '#4ff0c0'; tg.font = `700 9px ${MONO}`; tg.textAlign = 'right'; tg.fillText('● LIVE', x1, yM + 4); tg.fillRect(x1 - 1, yM + 10, 2, yE - yM); }
    tl._tx = tx; tl._range = [start, end, x0, x1];
  }

  // ---------------------------------------------------------------- HUD panels
  function lastRecordTime() {
    let t = S.session.startedAt;
    const c = S.calls[S.calls.length - 1]; if (c) t = Math.max(t, c.endedAt || c.startedAt);
    for (const x of S.calls.slice(-10)) if (x.endedAt) t = Math.max(t, x.endedAt);
    const m = S.markers[S.markers.length - 1]; if (m) t = Math.max(t, m.time);
    return t;
  }
  function renderIdent() {
    const s = S.session, since = S.now - lastRecordTime();
    const st = s.status === 'complete' ? ['complete', 'TURN COMPLETE'] : since < 20000 ? ['active', 'RECENT ACTIVITY'] : ['quiet', 'QUIET'];
    $('#ident').innerHTML = `<span class="proj">${esc(s.project)}</span><span class="nm">${esc(s.name)}</span><span class="k opt" title="${esc(s.id)}">id ${esc(s.id.slice(0, 12))}…</span><span class="k">${esc(s.provider)} · ${esc(s.model)}</span><span class="k opt">⎇ ${esc(s.branch)}</span><span class="st ${st[0]}">${st[1]}</span><span class="k">last record ${ago(since)}</span><span class="k">turn <b style="color:var(--ice)">${s.turn}</b></span>`;
  }
  function renderKinds() {
    const esp = sim.errorsSincePrompt();
    const runningKinds = new Set(sim.runningCalls().map(c => c.kind));
    let html = '';
    for (const k of KINDS) {
      const e = esp[k] || 0, act = runningKinds.has(k);
      html += `<button class="krow${act ? ' act' : ''}" style="color:${K[k].c}" data-open="kind:${k}" data-key="kind:${k}"><span class="g">${K[k].g}</span><span class="n">${INFO[k].name} <span class="live">${act ? '▶ ACTIVE' : ''}</span><small>${K[k].phen}</small></span><span class="c">${S.counts[k]}</span><span class="e${e ? ' bad' : ''}" title="errors since last prompt">${e ? `✕ ${e}` : '0 err'}</span></button>`;
    }
    const active = [...runningKinds].map(k => INFO[k].name).join(', ') || 'idle';
    html += `<div class="tot"><span>total <b>${S.calls.length}</b> calls</span><span class="${S.errors.length ? 'bad' : ''}">${S.errors.length} tool errors</span><span>now: <b>${esc(active)}</b></span></div>`;
    $('#kinds').innerHTML = html;
  }
  function sparkSVG(w, h, windowMs) {
    const end = S.now, start = end - windowMs;
    const pts = S.context.samples.filter(s => s.time >= start).map(s => `${((s.time - start) / windowMs * w).toFixed(1)},${(h - s.percent / 100 * h).toFixed(1)}`);
    const comp = S.markers.filter(m => m.kind === 'compaction' && m.time >= start).map(m => { const x = ((m.time - start) / windowMs * w).toFixed(1); return `<line x1="${x}" x2="${x}" y1="0" y2="${h}" stroke="${AMBER}" stroke-dasharray="2 2"/><text x="${x}" y="9" fill="${AMBER}" font-size="8" text-anchor="middle">C</text>`; }).join('');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" data-open="context"><rect width="${w}" height="${h}" fill="#030a16"/><line x1="0" x2="${w}" y1="${h * 0.3}" y2="${h * 0.3}" stroke="${AMBER}" stroke-opacity=".4" stroke-dasharray="3 3"/><line x1="0" x2="${w}" y1="${h * 0.1}" y2="${h * 0.1}" stroke="${RED}" stroke-opacity=".4" stroke-dasharray="3 3"/>${comp}<polyline points="${pts.join(' ')}" fill="none" stroke="${CYAN}" stroke-width="1.2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function renderCargo() {
    const c = S.context, p = c.percent;
    $('#cargo').innerHTML = `<div class="cargo-top" data-open="context" data-key="ctx-top"><span class="pct ${ctxClass(p)}">${p.toFixed(1)}%</span><span class="muted">${ktok(c.used)} / ${ktok(c.capacity)} tok · ${c.compactions} compaction${c.compactions === 1 ? '' : 's'}</span></div>
      <div class="gauge" data-open="context"><div class="fill ${ctxClass(p)}" style="width:${p}%"></div><i style="left:70%"></i><i class="r" style="left:90%"></i></div>
      <div class="gauge-l"><span>fuel/cargo</span><span>amber 70 · red 90</span></div>
      ${sparkSVG(280, 46, 30 * 60000)}
      <div class="gauge-l"><span>hold history · 30 min</span><span>C = jettison (compaction)</span></div>
      <div class="mods">${c.files.map(f => `<button class="mod" data-open="context:${esc(f.path)}" data-key="mod:${esc(f.path)}" title="${esc(f.why)}"><span class="sq"></span><span>${esc(f.path)}</span><em>${ktok(f.tokens)}</em></button>`).join('') || '<span class="muted">no cargo modules</span>'}</div>`;
  }
  const taskGlyph = s => s === 'completed' ? '☑' : s === 'in_progress' ? '◐' : '☐';
  function renderNav() {
    const items = S.tasks.items;
    const done = items.filter(i => i.status === 'completed').length, prog = items.filter(i => i.status === 'in_progress').length;
    $('#navlog').innerHTML = `<div class="navsum"><b>${done}</b> of <b>${items.length}</b> completed · ${prog} in progress · ${items.length - done - prog} not started</div>` +
      items.map(it => `<button class="task ${it.status}" data-open="plan" data-key="task:${it.id}"><span class="s">${taskGlyph(it.status)}</span><span class="l">${esc(it.label)}</span><span class="h">${it.history.map(h => `${h.status.replace('_', ' ')} ${clock(h.time).slice(0, 5)}`).join(' → ')}</span></button>`).join('');
  }
  function renderLanes() {
    const order = [S.lanes[0]]; const walk = key => { for (const l of S.lanes.filter(x => x.parent === key).sort((a, b) => b.startedAt - a.startedAt)) { order.push(l); walk(l.key); } };
    walk('main');
    $('#lanes').innerHTML = order.filter(Boolean).slice(0, 14).map(l => {
      const stc = l.state === 'running' ? 'st-run' : l.state === 'failed' ? 'st-fail' : 'st-ok';
      const stl = l.state === 'running' ? '● running' : l.state === 'failed' ? '✕ FAILED' : '✓ completed';
      const parent = l.parent ? (sim.laneByKey(l.parent) || {}).label || l.parent : '—';
      return `<button class="lane" style="--c:${laneColor[l.key] || ICE}; margin-left:${l.depth * 10}px" data-open="lane:${l.key}" data-key="lane:${l.key}"><span class="t"><b>${l.depth ? '└ ' : ''}${esc(l.label)}</b><span class="${stc}">${stl}</span></span>
      <span class="m">depth <b>${l.depth}</b> · parent <b>${esc(parent)}</b> · <b>${l.calls}</b> calls · <span class="${l.errors ? 'bad' : ''}">${l.errors} err</span> · <b>${ktok(l.tokens)}</b> tok · ${clock(l.startedAt).slice(0, 5)}${l.endedAt ? `–${clock(l.endedAt).slice(0, 5)}` : '→'}</span>
      ${l.task ? `<div class="brief">brief: ${esc(l.task)}</div>` : ''}${l.result ? `<div class="res">result: ${esc(l.result)}</div>` : ''}</button>`;
    }).join('');
  }
  function renderCatalogue() {
    const stats = Object.values(fileStatsAt(S.now)).filter(f => f.calls.length).sort((a, b) => b.calls.length - a.calls.length);
    $('#catalogue').innerHTML = `<table class="cat"><tr><th>star (file)</th><th title="reads">R</th><th title="edits">E</th><th title="failed calls">✕</th><th>+/−</th><th></th></tr>` +
      stats.map(f => `<tr class="r"><td><button data-open="file:${esc(f.path)}" data-key="file:${esc(f.path)}" title="${esc(f.path)}" class="${f.edits >= 3 ? 'hot' : ''}">${esc(f.path)}</button></td><td><span>${f.reads}</span></td><td><span>${f.edits}</span></td><td><span class="${f.failed ? 'fail' : 'fold'}">${f.failed}</span></td><td><span><span class="add" style="display:inline;padding:0">+${f.added}</span> <span class="rem" style="display:inline;padding:0">−${f.removed}</span></span></td><td><span class="hot">${f.edits >= 3 ? '★HOT' : ''}</span></td></tr>`).join('') + '</table>';
  }
  function statusMark(c) {
    if (c.status === 'running') return '<span class="sx run">◌ running</span>';
    if (c.status === 'error') return `<span class="sx err">✕ ${esc(c.error.code)}</span>`;
    return `<span class="sx ok">✓${c.attempt > 1 ? ` ↻${c.attempt}` : ''}</span>`;
  }
  function callRow(c, extra = '') {
    const tgt = c.target ? (c.target.type === 'file' ? base(c.target.value) : c.target.value) : '';
    return `<button class="crow" data-open="call:${c.id}" data-key="crow:${c.id}"><span style="color:${K[c.kind].c}">${K[c.kind].g}</span><span class="tm">${clock(c.startedAt)}</span><span class="lb">${esc(c.tool)} <small>${esc(String(tgt).slice(0, 40))}${c.lane !== 'main' ? ` · ${esc(c.laneLabel)}` : ''}</small>${extra}</span>${statusMark(c)}</button>`;
  }
  function renderRecent() {
    const rows = [];
    for (let i = S.calls.length - 1; i >= 0 && rows.length < 26; i--) {
      const c = S.calls[i];
      const last = rows[rows.length - 1];
      if (last && last.c.tool === c.tool && last.c.lane === c.lane && last.c.status === c.status && (last.c.target && last.c.target.value) === (c.target && c.target.value)) { last.n++; continue; }
      rows.push({ c, n: 1 });
    }
    $('#recent').innerHTML = rows.map(r => callRow(r.c, r.n > 1 ? `<span class="x">×${r.n}</span>` : '')).join('');
  }
  function renderHUD() {
    const active = document.activeElement;
    const key = active && active.dataset ? active.dataset.key : null;
    renderIdent(); renderKinds(); renderCargo(); renderNav(); renderLanes(); renderCatalogue(); renderRecent();
    if (key) { const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`); if (el && el !== active) el.focus(); }
  }

  // ---------------------------------------------------------------- detail drawer
  let dStack = [];
  const lnk = (open, label) => `<button class="lnk" data-open="${esc(open)}">${esc(label)}</button>`;
  const nodeLabel = id => { const n = sim.node(id); return n ? n.label : id; };
  function nodeOpen(id) {
    if (id.startsWith('file:')) return id; if (id.startsWith('web:')) return `host:${id.slice(4)}`; if (id.startsWith('lane:')) return id;
    if (id === 'terminal') return 'terminal'; if (id === 'plan') return 'plan'; if (id === 'context' || id === 'model' || id.startsWith('ctxfile:')) return 'context';
    if (id.startsWith('tool:')) return `kind:${id.slice(5)}`; if (id === 'mcp:github') return 'mcp'; return 'home';
  }
  const kv = rows => `<div class="kv">${rows.filter(Boolean).map(([k, v]) => `<span>${esc(k)}</span><span>${v}</span>`).join('')}</div>`;
  const dur = c => c.endedAt != null ? `${c.endedAt - c.startedAt} ms` : `running ${((S.now - c.startedAt) / 1000).toFixed(1)} s`;
  function diffHTML(d) {
    if (!d) return '';
    return `<pre class="diff"><span class="a">+${d.added}</span> <span class="d">−${d.removed}</span>\n${d.hunks.map(hk => `<span class="h">@@ line ${hk.at} @@</span>\n${hk.lines.map(l => `<span class="${l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : ''}">${esc(l)}</span>`).join('\n')}`).join('\n')}</pre>`;
  }
  function nextAfterError(c) {
    const retries = S.calls.filter(x => x.retryOf === c.id);
    const caused = S.calls.filter(x => x.causedBy === c.id && x.retryOf !== c.id);
    const fixed = retries.find(r => r.status === 'success') || S.calls.find(x => x.startedAt > c.startedAt && x.kind === c.kind && x.status === 'success' && x.lane === c.lane && x.target && c.target && (x.target.value === c.target.value || fileOf(x) && fileOf(x) === fileOf(c)));
    const parts = [];
    if (retries.length) parts.push(`retried: ${retries.map(r => `${lnk(`call:${r.id}`, `${r.id} attempt ${r.attempt}`)} ${r.status === 'error' ? '✕ failed again' : r.status === 'success' ? '✓ succeeded' : '◌ running'}`).join(', ')}`);
    if (caused.length) parts.push(`led to: ${caused.map(r => lnk(`call:${r.id}`, `${r.id} ${r.tool}`)).join(', ')}`);
    parts.push(fixed ? `fixed: ✓ later success ${lnk(`call:${fixed.id}`, `${fixed.id} ${fixed.tool}`)}` : 'fixed: not yet');
    return parts.join('<br>');
  }
  function dCall(id) {
    const c = callById(id);
    if (!c) return ['Call', '<p class="muted">Not found.</p>'];
    const k = K[c.kind];
    const tgt = c.target ? (c.target.type === 'file' ? lnk(`file:${fileOf(c) || c.target.value}`, c.target.value) : c.target.type === 'url' ? lnk(`host:${hostOf(c)}`, c.target.value) : c.target.type === 'command' ? lnk('terminal', c.target.value) : c.target.type === 'agent' ? esc(c.target.value) : esc(c.target.value)) : '—';
    const children = S.calls.filter(x => x.causedBy === c.id);
    const retries = S.calls.filter(x => x.retryOf === c.id);
    const chain = []; let up = c.causedBy ? callById(c.causedBy) : null; let guard = 0;
    while (up && guard++ < 10) { chain.push(up); up = up.causedBy ? callById(up.causedBy) : null; }
    const o = c.output || {};
    let h = `<div style="color:${k.c}" class="big">${k.g} ${esc(c.tool)}</div><div class="muted">${esc(c.label)} · ${INFO[c.kind].name} · ${k.phen}</div>`;
    h += `<div style="margin:6px 0">${c.status === 'error' ? `<span class="badge" style="color:${RED}">✕ ERROR</span>` : c.status === 'running' ? `<span class="badge" style="color:${K.agents.c}">◌ RUNNING</span>` : `<span class="badge" style="color:${CYAN}">✓ SUCCESS</span>`} ${c.attempt > 1 ? `<span class="badge" style="color:${AMBER}">↻ attempt ${c.attempt}</span>` : ''}</div>`;
    if (c.error) h += `<div class="errbox"><div class="code">✕ ${esc(c.error.code)} · ${esc(c.error.name || '')}</div><div class="msg">${esc(c.error.message)}</div><div class="hint">hint: ${esc(c.error.hint || '—')}</div><div class="next">lane: ${lnk(`lane:${c.lane}`, c.laneLabel)}<br>${nextAfterError(c)}</div></div>`;
    h += '<div class="dh">Call</div>' + kv([
      ['id', esc(c.id)], ['tool', esc(c.tool)], ['label', esc(c.label)], ['lane', lnk(`lane:${c.lane}`, `${c.laneLabel} (depth ${c.depth})`)], ['target', tgt],
      ['started', clock(c.startedAt)], ['duration', dur(c)], ['status', esc(c.status)],
      c.retryOf ? ['retry of', lnk(`call:${c.retryOf}`, c.retryOf)] : null,
      ['tokens', `in ${ktok(c.tokens.in)} · out ${ktok(c.tokens.out)}`],
      ['context after', c.contextAfter ? `<span style="color:${ctxColor(c.contextAfter.percent)}">${c.contextAfter.percent}%</span> (${ktok(c.contextAfter.used)} tok)` : '—']
    ]);
    h += `<div class="dh">Input arguments</div><pre>${esc(JSON.stringify(c.input, null, 2))}</pre>`;
    if (c.output) {
      h += '<div class="dh">Output</div>' + kv([
        ['summary', esc(o.summary || '—')], o.exitCode !== undefined ? ['exit code', o.exitCode === null ? '— (no code)' : `<b style="color:${o.exitCode ? RED : CYAN}">${o.exitCode}</b>`] : null,
        o.status ? ['http status', esc(o.status)] : null, o.lines != null ? ['lines', esc(o.lines)] : null, o.bytes != null ? ['bytes', kbytes(o.bytes)] : null,
        o.tests ? ['tests', `<span style="color:${CYAN}">${o.tests.passed} passed</span> · <span style="color:${o.tests.failed ? RED : 'inherit'}">${o.tests.failed} failed</span>${o.tests.failures.length ? `<br>failing: ${o.tests.failures.map(esc).join(', ')}` : ''}`] : null
      ]);
      if (o.preview && o.preview.length) h += `<pre>${esc(o.preview.join('\n'))}</pre>`;
    }
    if (c.diff) h += `<div class="dh">Diff</div>${diffHTML(c.diff)}`;
    h += `<div class="dh">Flow hops (${c.flow.length})</div>` + (c.flow.map(f => `<div class="hop">${lnk(nodeOpen(f.from), nodeLabel(f.from))}<span>→</span>${lnk(nodeOpen(f.to), nodeLabel(f.to))}<span class="w">${esc(f.what)}${f.tokens ? ` · ${ktok(f.tokens)} tokens` : ''}${f.bytes ? ` · ${kbytes(f.bytes)}` : ''}</span></div>`).join('') || '<span class="muted">none</span>');
    if (c.refs.length) h += '<div class="dh">References</div>' + c.refs.map(r => `<div>${esc(r.role)} ${esc(r.type)}: ${r.type === 'file' ? lnk(`file:${r.value}`, r.value) : r.type === 'lane' ? lnk(`lane:${r.value}`, (sim.laneByKey(r.value) || {}).label || r.value) : r.type === 'task' ? lnk('plan', `task ${r.value}`) : r.type === 'url' ? lnk(`host:${(() => { try { return new URL(r.value).host; } catch (e) { return r.value; } })()}`, r.title || r.value) : esc(r.value)}</div>`).join('');
    h += '<div class="dh">Cause chain</div>';
    h += `<div>caused by: ${chain.length ? chain.map(x => `${lnk(`call:${x.id}`, `${x.id} ${x.tool}`)}${x.error ? ` <span style="color:${RED}">✕${esc(x.error.code)}</span>` : ''}`).join(' ← ') : '<span class="muted">nothing (started by the model)</span>'}</div>`;
    h += `<div>caused: ${children.length ? children.map(x => lnk(`call:${x.id}`, `${x.id} ${x.tool}`)).join(', ') : '<span class="muted">nothing yet</span>'}</div>`;
    h += `<div>retries: ${retries.length ? retries.map(x => `${lnk(`call:${x.id}`, `${x.id} attempt ${x.attempt}`)} ${x.status === 'error' ? '✕' : x.status === 'success' ? '✓' : '◌'}`).join(', ') : '<span class="muted">none</span>'}</div>`;
    h += '<p class="muted" style="margin-top:8px">The chart draws the cause chain as white constellation lines while this call is selected.</p>';
    return [`${c.id} · ${c.tool}`, h];
  }
  function dFile(path) {
    const st = fileStatsAt(S.now)[path] || { reads: 0, edits: 0, failed: 0, added: 0, removed: 0, lines: 0 };
    const calls = sim.callsForFile(path);
    let h = `<div class="big ${st.edits >= 3 ? 'hot' : ''}" style="color:${st.edits >= 3 ? '' : ICE}">✦ ${esc(path)}</div><div class="muted">constellation ${FOLDERS[folderOf(path)].label} · ${st.edits >= 3 ? '<span class="hot">HOT: edited 3+ times (pulsing corona)</span>' : 'star size = lines, brightness = recent activity, one ring per edit'}</div>`;
    h += '<div class="dh">Footprint</div>' + kv([['lines now', st.lines], ['reads', st.reads], ['edits', st.edits], ['failed calls', st.failed ? `<b style="color:${RED}">${st.failed}</b>` : 0], ['lines', `<span class="add">+${st.added}</span> <span class="rem">−${st.removed}</span>`], ['touches', calls.length]]);
    h += `<div class="dh">Every call that touched it (${calls.length}, oldest first)</div>`;
    h += calls.map(c => `<div class="entry"><div class="top">${lnk(`call:${c.id}`, `${clock(c.startedAt)} ${c.tool}`)}${statusMark(c)}</div><div class="muted">${esc(c.laneLabel)} · ${esc((c.output && c.output.summary) || c.label)}${c.refs.some(r => r.role === 'cited' && r.value === path) ? ' · cited by search' : ''}</div>${c.error ? `<div style="color:${RED}">✕ ${esc(c.error.code)}: ${esc(c.error.message)}</div>` : ''}${diffHTML(c.diff)}</div>`).join('') || '<span class="muted">not touched yet</span>';
    return [base(path), h];
  }
  function dContext(focus) {
    const c = S.context;
    const contrib = c.samples.filter(s => s.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 10);
    const byKind = {};
    for (const s of c.samples) { if (s.delta <= 0) continue; const call = s.callId && callById(s.callId); const key = call ? INFO[call.kind].name : s.why.startsWith('Loaded') ? 'Context files' : s.why; byKind[key] = (byKind[key] || 0) + s.delta; }
    const tot = Object.values(byKind).reduce((a, v) => a + v, 0) || 1;
    let h = `<div class="big" style="color:${ctxColor(c.percent)}">${c.percent.toFixed(1)}% of the cargo hold</div><div class="muted">${ktok(c.used)} of ${ktok(c.capacity)} tokens · amber at 70% · red at 90% · ${c.compactions} compaction(s)</div>`;
    h += sparkSVG(340, 70, 30 * 60000);
    h += '<div class="dh">Cargo modules (context files)</div>' + c.files.map(f => `<div class="entry" style="${focus === f.path ? 'outline:1px solid var(--cyan)' : ''}"><div class="top"><b style="color:${CYAN}">▣ ${esc(f.path)}</b><span>${ktok(f.tokens)} tok</span></div><div class="muted">${esc(f.why)} · loaded ${clock(f.loadedAt)}</div></div>`).join('');
    h += '<div class="dh">What filled it</div>' + Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="top" style="display:flex;justify-content:space-between"><span>${esc(k)}</span><span>${ktok(v)}</span></div><div class="bar"><i style="width:${v / tot * 100}%;background:${(Object.entries(INFO).find(([, i]) => i.name === k) || [])[0] ? K[Object.entries(INFO).find(([, i]) => i.name === k)[0]].c : CYAN}"></i></div>`).join('');
    h += '<div class="dh">Biggest contributors</div>' + contrib.map(s => `<div class="entry"><div class="top">${s.callId ? lnk(`call:${s.callId}`, `${s.callId} ${s.why}`) : esc(s.why)}<span>+${ktok(s.delta)}</span></div><div class="muted">${clock(s.time)}</div></div>`).join('');
    h += '<div class="dh">Compactions (jettisons)</div>' + (S.markers.filter(m => m.kind === 'compaction').map(m => `<div class="entry" style="color:${AMBER}">⇣ ${clock(m.time)} · ${esc(m.label)}</div>`).join('') || '<span class="muted">none yet</span>');
    return ['Cargo hold · context window', h];
  }
  function dTerminal() {
    const calls = S.calls.filter(c => c.kind === 'shell').reverse();
    let h = `<div class="big" style="color:${K.shell.c}">⊛ Terminal pulsar</div><div class="muted">exit 0 = one long ice pulse · failure = three short crimson pulses · ${calls.length} commands, ${calls.filter(c => c.error).length} failed</div><div class="dh">Commands (newest first)</div>`;
    h += calls.map(c => `<div class="entry"><div class="top">${lnk(`call:${c.id}`, `$ ${c.target.value}`)}${statusMark(c)}</div><div class="muted">${clock(c.startedAt)} · ${dur(c)} · exit ${c.output ? (c.output.exitCode ?? '—') : '…'} · ${esc(c.laneLabel)}${c.output && c.output.tests ? ` · tests ${c.output.tests.passed}✓ ${c.output.tests.failed}✕` : ''}</div></div>`).join('');
    return ['Terminal', h];
  }
  function dPlan() {
    const items = S.tasks.items, done = items.filter(i => i.status === 'completed').length;
    let h = `<div class="big" style="color:${K.memory.c}">⚑ Navigation log</div><div class="muted">${done} of ${items.length} completed · source ${esc(S.tasks.source)} · updated ${S.tasks.updatedAt ? clock(S.tasks.updatedAt) : '—'}</div><div class="dh">Items with status history</div>`;
    h += items.map(it => `<div class="entry"><div class="top"><b>${taskGlyph(it.status)} ${esc(it.id)}. ${esc(it.label)}</b><span>${esc(it.status.replace('_', ' '))}</span></div>${it.history.map(x => `<div class="muted">${clock(x.time)} → ${esc(x.status.replace('_', ' '))} ${x.callId ? lnk(`call:${x.callId}`, x.callId) : ''}</div>`).join('')}</div>`).join('');
    const upd = S.calls.filter(c => c.kind === 'memory').reverse().slice(0, 20);
    h += '<div class="dh">Plan calls</div><div class="list">' + upd.map(c => callRow(c)).join('') + '</div>';
    return ['Navigation log · task list', h];
  }
  function dHost(host) {
    const calls = S.calls.filter(c => c.kind === 'network' && hostOf(c) === host).reverse();
    let h = `<div class="big" style="color:${K.network.c}">≋ ${esc(host)}</div><div class="muted">a quasar beyond the galaxy rim · signals travel in as wavefronts · ${calls.length} requests</div><div class="dh">Fetches and status</div>`;
    h += calls.map(c => `<div class="entry"><div class="top">${lnk(`call:${c.id}`, `${clock(c.startedAt)} ${c.tool}`)}${c.error ? `<span class="sx err">✕ ${esc(c.error.code)}</span>` : c.status === 'running' ? '<span class="sx run">◌</span>' : `<span class="sx ok">${c.output.status || 200} ✓</span>`}</div><div class="muted">${esc(c.target.value)}<br>${esc((c.output && c.output.summary) || '')}</div></div>`).join('') || '<span class="muted">no requests yet</span>';
    return [host, h];
  }
  function dLane(key) {
    const l = sim.laneByKey(key);
    if (!l) return ['Lane', '<p class="muted">Not found.</p>'];
    const calls = S.calls.filter(c => c.lane === key).reverse();
    const kids = S.lanes.filter(x => x.parent === key);
    const spawn = S.calls.find(c => c.refs.some(r => r.type === 'lane' && r.value === key && r.role === 'spawned'));
    let h = `<div class="big" style="color:${laneColor[key]}">${l.depth ? '◆ Probe' : '▲ Main craft'}: ${esc(l.label)}</div>`;
    h += kv([['key', esc(l.key)], ['role', esc(l.role)], ['agent type', esc(l.agentType)], ['model', esc(l.model)], ['depth', l.depth], ['parent', l.parent ? lnk(`lane:${l.parent}`, (sim.laneByKey(l.parent) || {}).label || l.parent) : '—'],
      ['state', l.state === 'failed' ? `<b style="color:${RED}">✕ failed</b>` : l.state === 'running' ? `<span style="color:${K.agents.c}">● running</span>` : '✓ completed'],
      ['started', clock(l.startedAt)], ['ended', l.endedAt ? clock(l.endedAt) : '—'], ['calls', l.calls], ['errors', l.errors ? `<b style="color:${RED}">${l.errors}</b>` : 0], ['tokens', ktok(l.tokens)],
      spawn ? ['launched by', lnk(`call:${spawn.id}`, `${spawn.id} ${spawn.tool}`)] : null]);
    if (l.task) h += `<div class="dh">Brief</div><pre>${esc(l.task)}</pre>`;
    if (l.result) h += `<div class="dh">Result</div><pre style="${l.state === 'failed' ? `border-color:${RED}` : ''}">${esc(l.result)}</pre>`;
    if (!l.depth) h += `<div class="dh">Cargo</div>${lnk('context', `context window ${S.context.percent}% →`)}`;
    if (kids.length) h += '<div class="dh">Launched probes</div>' + kids.map(k => `<div>${lnk(`lane:${k.key}`, `${k.label} · ${k.state}`)}</div>`).join('');
    h += `<div class="dh">Calls (${calls.length}, newest first)</div><div class="list">${calls.slice(0, 80).map(c => callRow(c)).join('')}</div>`;
    return [l.label, h];
  }
  function dHome() {
    const ms = S.markers.filter(m => m.kind === 'prompt' || m.kind === 'turn-complete').reverse();
    return ['Home relay', `<div class="big" style="color:${ICE}">⌒ Home relay</div><div class="muted">prompts arrive from here; replies go back when a turn completes</div><div class="dh">Prompts and replies</div>` + ms.map(m => `<div class="entry"><div class="top"><b style="color:${m.kind === 'prompt' ? ICE : CYAN}">${m.kind === 'prompt' ? '▸ prompt' : '✓ reply / turn complete'}</b><span class="muted">${clock(m.time)}</span></div><div class="muted">${esc(m.kind === 'prompt' ? m.detail.text : `turn ${m.detail.turn}`)}</div></div>`).join('')];
  }
  function dKind(k) {
    const calls = S.calls.filter(c => c.kind === k).reverse();
    const esp = sim.errorsSincePrompt()[k] || 0;
    return [`${INFO[k].name}`, `<div class="big" style="color:${K[k].c}">${K[k].g} ${INFO[k].name}</div><div class="muted">${K[k].phen} · tools ${INFO[k].tools.join(', ')}</div>` + kv([['calls', calls.length], ['errors (all)', calls.filter(c => c.error).length], ['since prompt', esp ? `<b style="color:${RED}">✕ ${esp}</b>` : 0], ['running', calls.filter(c => c.status === 'running').length]]) + `<div class="dh">Calls (newest first)</div><div class="list">${calls.slice(0, 80).map(c => callRow(c)).join('')}</div>`];
  }
  function dMcp() { const [, body] = dKind('other'); return ['MCP github comet', body]; }
  function dErrors(key) {
    const errs = S.errors.filter(c => locKey(c) === key).reverse();
    return [`Errors · ${key}`, `<div class="big" style="color:${RED}">✕ ${errs.length} errors here</div><div class="dh">Scars (newest first)</div>` + errs.map(c => `<div class="errbox"><div class="code">${lnk(`call:${c.id}`, `${c.error.code} · ${c.id} ${c.tool}`)}</div><div class="msg">${esc(c.error.message)}</div><div class="hint">hint: ${esc(c.error.hint)}</div><div class="next">${clock(c.endedAt)} · lane ${lnk(`lane:${c.lane}`, c.laneLabel)}<br>${nextAfterError(c)}</div></div>`).join('')];
  }
  function parseOpen(s) { const i = s.indexOf(':'); return i < 0 ? { type: s, id: null } : { type: s.slice(0, i), id: s.slice(i + 1) }; }
  function renderDetail(keepScroll) {
    const top = dStack[dStack.length - 1];
    if (!top) { $('#detail').hidden = true; selected = null; return; }
    const { type, id } = top;
    const fn = { call: dCall, file: dFile, context: dContext, terminal: dTerminal, plan: dPlan, host: dHost, lane: dLane, home: dHome, kind: dKind, mcp: dMcp, errors: dErrors, task: dPlan }[type];
    if (!fn) return;
    const [title, body] = fn(id);
    const b = $('#d-body'), sc = b.scrollTop;
    $('#d-title').textContent = title;
    b.innerHTML = body;
    if (keepScroll) b.scrollTop = sc;
    $('#detail').hidden = false;
    $('#d-back').style.visibility = dStack.length > 1 ? 'visible' : 'hidden';
    selected = { type: type === 'task' ? 'plan' : type, id };
  }
  function open(spec) {
    const sel = typeof spec === 'string' ? parseOpen(spec) : spec;
    dStack.push(sel);
    if (dStack.length > 30) dStack.shift();
    renderDetail(false);
    $('#d-body').scrollTop = 0;
  }
  function closeDetail() { dStack = []; renderDetail(); }
  $('#d-close').addEventListener('click', closeDetail);
  $('#d-back').addEventListener('click', () => { dStack.pop(); renderDetail(); });
  document.addEventListener('click', e => { const el = e.target.closest('[data-open]'); if (el) { e.preventDefault(); open(el.dataset.open); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { const el = e.target.closest && e.target.closest('[data-open]'); if (el && el.tagName !== 'BUTTON') { e.preventDefault(); open(el.dataset.open); return; } }
    if (e.key === 'Escape') { if (!$('#detail').hidden) closeDetail(); else if (inspectT != null) goLive(); }
    if (e.key === ' ' && (e.target === document.body || e.target === chart || e.target === tl)) { e.preventDefault(); togglePause(); }
  });
  // make SVG/divs with data-open focusable
  function focusables() { for (const el of document.querySelectorAll('[data-open]:not(button)')) if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); } }

  // ---------------------------------------------------------------- interactions: chart
  function pick(sx, sy) {
    let best = null, bd = 1e9;
    for (const h of hits) { const d = Math.hypot(h.x - sx, h.y - sy); if (d <= h.r + 3) { const score = d - h.prio * 4; if (score < bd) { bd = score; best = h; } } }
    if (best) return best;
    for (const s of segs) for (const p of s.pts) { const d = Math.hypot(p.x - sx, p.y - sy); if (d < 6 && d < bd) { bd = d; best = { sel: s.sel, label: s.label }; } }
    return best;
  }
  let down = null;
  chart.addEventListener('mousedown', e => { down = { x: e.offsetX, y: e.offsetY, px: view.px, py: view.py, moved: false }; });
  window.addEventListener('mousemove', e => {
    if (down) {
      const r = chart.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      if (Math.hypot(x - down.x, y - down.y) > 4) { down.moved = true; chart.classList.add('panning'); }
      if (down.moved) { view.px = down.px - (x - down.x) / view.s; view.py = down.py - (y - down.y) / view.s; }
    }
  });
  window.addEventListener('mouseup', e => {
    if (down && !down.moved && e.target === chart) { const h = pick(e.offsetX, e.offsetY); if (h) { dStack = []; open(h.sel); } }
    down = null; chart.classList.remove('panning');
  });
  chart.addEventListener('mousemove', e => {
    if (down && down.moved) { $('#tip').hidden = true; return; }
    const h = pick(e.offsetX, e.offsetY);
    hover = h;
    const tip = $('#tip');
    if (h) { tip.hidden = false; tip.textContent = `${h.label}\n(click for detail)`; tip.style.left = `${Math.min(e.offsetX + 14, chart._w - 330)}px`; tip.style.top = `${e.offsetY + 14}px`; chart.style.cursor = 'pointer'; }
    else { tip.hidden = true; chart.style.cursor = ''; }
  });
  chart.addEventListener('mouseleave', () => { $('#tip').hidden = true; });
  chart.addEventListener('wheel', e => {
    e.preventDefault();
    const wx = WX(e.offsetX), wy = WY(e.offsetY);
    view.zoom = clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), 0.45, 6);
    view.s = Math.min(view.W / 1260, view.H / 1040) * view.zoom;
    view.px = wx - (e.offsetX - view.W / 2) / view.s; view.py = wy - (e.offsetY - view.H / 2) / view.s;
  }, { passive: false });
  function kbTargets() { return hits.filter(h => h.prio >= 2).slice().sort((a, b) => a.x - b.x || a.y - b.y); }
  chart.addEventListener('keydown', e => {
    const list = kbTargets();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { kbIndex = (kbIndex + 1) % list.length; e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { kbIndex = (kbIndex - 1 + list.length) % list.length; e.preventDefault(); }
    else if (e.key === 'Enter' && list[kbIndex]) { dStack = []; open(list[kbIndex].sel); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') view.zoom = clamp(view.zoom * 1.2, 0.45, 6);
    else if (e.key === '-') view.zoom = clamp(view.zoom / 1.2, 0.45, 6);
    else if (e.key === '0') fit();
  });
  function fit() { view.zoom = 1; view.px = 0; view.py = 0; }
  $('#fit').addEventListener('click', fit);

  // ---------------------------------------------------------------- interactions: timeline, controls
  function tlTime(x) { const [start, end, x0, x1] = tl._range || [0, 0, 0, 1]; return clamp(start + (x - x0) / (x1 - x0) * (end - start), Math.max(start, S.session.startedAt), end); }
  function setInspect(t) { if (t >= liveT - 300) { goLive(); return; } inspectT = t; updateMode(); }
  function goLive() { inspectT = null; updateMode(); }
  function updateMode() {
    const m = $('#mode'), b = $('#banner');
    if (inspectT == null) { m.className = 'ctl mode live'; m.textContent = '● LIVE'; b.hidden = true; }
    else { m.className = 'ctl mode insp'; m.textContent = `◼ INSPECTING ${clock(inspectT)} · ⟲ live`; b.hidden = false; b.innerHTML = `<span title="The chart replays the route from this moment; side panels stay live">◼ INSPECTING ${clock(inspectT)} · replay</span><button id="golive">⟲ Return to live</button>`; }
  }
  $('#banner').addEventListener('click', e => { if (e.target.id === 'golive') goLive(); });
  $('#mode').addEventListener('click', () => { if (inspectT != null) goLive(); else setInspect(liveT - 60000); });
  tl.addEventListener('mousedown', e => {
    const [, , x0] = tl._range || [0, 0, 0];
    if (e.offsetX < x0) return;
    const er = (tl._errs || []).find(q => Math.abs(q.x - e.offsetX) < 6 && e.offsetY > tl._h - 52);
    if (er) { setInspect(er.c.endedAt - 400); dStack = []; open({ type: 'call', id: er.c.id }); return; }
    dragging = true; setInspect(tlTime(e.offsetX));
  });
  window.addEventListener('mousemove', e => { if (dragging) { const r = tl.getBoundingClientRect(); setInspect(tlTime(e.clientX - r.left)); } });
  window.addEventListener('mouseup', () => { dragging = false; });
  tl.addEventListener('dblclick', goLive);
  tl.addEventListener('mousemove', e => {
    const er = (tl._errs || []).find(q => Math.abs(q.x - e.offsetX) < 6 && e.offsetY > tl._h - 52);
    const mk = (tl._marks || []).find(q => Math.abs(q.x - e.offsetX) < 5 && e.offsetY < 30);
    tl.title = er ? `${er.c.error.code} · ${er.c.tool} · ${clock(er.c.endedAt)} (click to open)` : mk ? `${mk.m.label} · ${clock(mk.m.time)}` : `drag to inspect ${clock(tlTime(e.offsetX))}`;
  });
  tl.addEventListener('keydown', e => {
    const t = inspectT ?? liveT;
    if (e.key === 'ArrowLeft') { setInspect(t - 15000); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setInspect(t + 15000); e.preventDefault(); }
    else if (e.key === 'Home') setInspect(Math.max(S.session.startedAt, liveT - TL.win));
    else if (e.key === 'End') goLive();
  });
  function togglePause() { if (sim.running) sim.pause(); else { sim.start(); lastTickPerf = performance.now(); } $('#pause').textContent = sim.running ? '❚❚ Pause' : '▶ Resume'; $('#pause').classList.toggle('on', !sim.running); }
  $('#pause').addEventListener('click', togglePause);
  for (const b of document.querySelectorAll('.spd')) b.addEventListener('click', () => { sim.setSpeed(Number(b.dataset.speed)); for (const o of document.querySelectorAll('.spd')) o.classList.toggle('on', o === b); });

  // legend
  if (window.innerWidth < 1500) $('#legend').open = false;
  $('#legend-body').innerHTML =KINDS.map(k => `<div class="row"><b style="color:${K[k].c}">${K[k].g}</b>${INFO[k].name}: ${K[k].phen}</div>`).join('') +
    `<div class="row"><b style="color:${RED}">✕</b>error: supernova + lasting scar with code</div><div class="row"><b style="color:${ICE}">↻</b>retry: dashed return path</div><div class="hint">wheel zoom · drag pan · click anything<br>focus chart: ←/→ cycle, Enter open</div>`;

  // ---------------------------------------------------------------- loop
  let lastFrame = performance.now(), hudAt = 0, detailAt = 0, lastVersion = '';
  function frame(now) {
    const dtReal = now - lastFrame; lastFrame = now;
    if (sim.running) liveT = Math.max(liveT, S.now + Math.min(260 * sim.speed, (now - lastTickPerf) * sim.speed));
    else liveT = Math.max(liveT, S.now);
    if (inspectT != null && sim.running && !dragging) { inspectT += dtReal * sim.speed; if (inspectT >= liveT - 200) goLive(); }
    const T = inspectT ?? liveT;
    try { drawChart(T, now); drawTimeline(T, liveT); } catch (err) { console.error(err); }
    if (now - hudAt > 500) {
      hudAt = now; renderHUD(); focusables(); if (inspectT != null) updateMode();
      const version = `${S.calls.length}|${S.errors.length}|${S.lanes.map(l => l.state).join('')}|${S.calls.filter(c => c.status === 'running').length}`;
      if (!$('#detail').hidden && (version !== lastVersion || now - detailAt > 3000)) { renderDetail(true); detailAt = now; }
      lastVersion = version;
    }
    requestAnimationFrame(frame);
  }
  resize();
  renderHUD(); focusables();
  sim.start();
  requestAnimationFrame(frame);
  window.__galaxy = { sim, open, setInspect, goLive, fit, view, get hits() { return hits; } };
})();
