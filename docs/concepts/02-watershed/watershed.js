/* AgentViz concept 02: Token Watershed.
 * Data is water. Springs (sources) on the left, tool workings (processes) in the middle, basins (sinks) on the right.
 * SVG draws the terrain, channels and clickable features; a canvas overlay animates water (ambient particles and
 * one visible surge per flow hop). All data comes from ../shared/sim.js.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const $ = sel => document.querySelector(sel);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtK = n => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)); };
  const hhmmss = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const ago = ms => ms < 1500 ? 'just now' : ms < 60000 ? Math.round(ms / 1000) + ' s ago' : Math.floor(ms / 60000) + ' m ' + Math.round((ms % 60000) / 1000) + ' s ago';
  const dur = ms => ms == null ? '—' : ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';
  const f1 = n => n.toFixed(1);
  const shortPath = p => { if (p.length <= 18) return p; const parts = p.split('/'); const two = parts.slice(-2).join('/'); return two.length <= 20 ? two : parts[parts.length - 1]; };
  const baseName = p => p.split('/').pop();
  function lrng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const RMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
  let reduced = RMQ.matches;
  document.body.classList.toggle('reduced', reduced);
  if (RMQ.addEventListener) RMQ.addEventListener('change', e => { reduced = e.matches; document.body.classList.toggle('reduced', reduced); });

  // ---------------------------------------------------------------- data
  const sim = AgentVizSim.create({ seed: 7, history: 30 });
  const S = sim.state;
  const KINDS = sim.kinds;
  const KM = {
    files: { name: 'Files', feature: 'calm channel', tools: 'Read · Grep · Glob', desc: 'Reads seep from the disk wells and drift down a slow, calm, meandering channel into the context lake.' },
    edits: { name: 'Edits', feature: 'waterwheel mill', tools: 'Edit · Write · MultiEdit', desc: 'Mist from the lake turns the mill wheel, which pushes water back into a file reservoir on disk.' },
    shell: { name: 'Shell', feature: 'rapids & waterfall', tools: 'Bash', desc: 'Commands run fast and foaming down the rapids and over a waterfall into the terminal pool; output climbs back to the lake.' },
    network: { name: 'Network', feature: 'rain clouds', tools: 'WebFetch · WebSearch', desc: 'Distant hosts are rain clouds; pages fall as rain into the catch basin and are summarised into the lake.' },
    agents: { name: 'Agents', feature: 'tributary valleys', tools: 'Task', desc: 'A brief floats off as a paper boat into its own valley (subagent lane); the report rejoins the river downstream.' },
    memory: { name: 'Memory', feature: 'sluice gate', tools: 'TodoWrite · TaskUpdate', desc: 'The sluice gate lifts and water steps, lock by lock, into the terraced plan pond.' },
    other: { name: 'Other', feature: 'side canal', tools: 'MCP · NotebookEdit', desc: 'A straight, man-made canal with locks for MCP servers and other tools.' }
  };
  const COL = { files: '#4fd1c5', edits: '#8ef5b0', shell: '#bfe6ff', network: '#8aa2ff', agents: '#b48cff', memory: '#f0a6ca', other: '#a9c7a0', prompt: '#f3dfa8', reply: '#7fe8e0', ctx: '#dfe7ff' };
  const GOLD = '#f6d68b', SILT = '#d0603f', SAND = '#e9dcc0', MIST = '#c9b8f0', AMBER = '#f0a33a', RED = '#ff5a4f';
  const hopVol = h => h.tokens ? h.tokens : h.bytes ? h.bytes / 10 : 12; // raw bytes count a tenth of a token: they are condensed before they reach the lake
  const hopUnit = h => h.tokens ? `${fmtK(h.tokens)} tok` : h.bytes ? `${fmtK(h.bytes)} B` : 'request';
  const nodeLabel = id => { const n = sim.node(id); return n ? n.label : id; };
  const lastPromptTime = () => { const m = [...S.markers].reverse().find(x => x.kind === 'prompt'); return m ? m.time : 0; };

  function glyph(kind, size = 14) {
    const c = COL[kind] || SAND;
    const inner = {
      files: `<circle cx="7" cy="7" r="4" fill="${c}"/>`,
      edits: `<path d="M3 2.5 L11 7 L3 11.5 L5.5 7 Z" fill="${c}"/>`,
      shell: `<path d="M1 9 L4.5 5 L7.5 9.5 L13 3.5" stroke="${c}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
      network: `<path d="M4 1.5 L3 7 M7.5 2.5 L6.5 9 M11 1.5 L10 7" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><path d="M2 12 H12" stroke="${c}" stroke-opacity=".6"/>`,
      agents: `<path d="M1.5 9 H12.5 L10.5 12 H3.5 Z M7 1.5 L7 8.5 L11.5 8 Z" fill="${c}"/>`,
      memory: `<rect x="3.5" y="3.5" width="7" height="7" fill="${c}"/>`,
      other: `<path d="M7 1.5 L12.5 7 L7 12.5 L1.5 7 Z" fill="${c}"/>`
    }[kind] || `<circle cx="7" cy="7" r="4" fill="${c}"/>`;
    return `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 14 14" aria-hidden="true">${inner}</svg>`;
  }

  // ---------------------------------------------------------------- layout (viewBox 1200 x 720)
  const VW = 1200, VH = 720;
  const P = {
    user: { x: 110, y: 322 }, model: { x: 252, y: 330 }, rejoin: { x: 884, y: 628 },
    feat: { network: { x: 480, y: 120 }, files: { x: 470, y: 198 }, other: { x: 604, y: 262 }, edits: { x: 470, y: 334 }, memory: { x: 470, y: 416 }, shell: { x: 470, y: 494 }, agents: { x: 470, y: 568 } },
    terminal: { x: 842, y: 540 }, plan: { x: 1004, y: 586 }, reply: { x: 1194, y: 12 }, replyFrom: { x: 1168, y: 62 }, mistFrom: { x: 962, y: 70 }
  };
  const LAKE = { x0: 924, x1: 1194, y0: 54, y1: 356 };
  const LAKE_D = 'M 944 66 C 990 46, 1140 44, 1178 64 C 1198 110, 1196 300, 1180 338 C 1150 362, 990 366, 946 346 C 922 300, 920 112, 944 66 Z';
  const lakeY = pct => LAKE.y1 - clamp(pct, 0, 100) / 100 * (LAKE.y1 - LAKE.y0);

  const diskFiles = () => S.nodes.filter(n => n.group === 'disk').map(n => n.label);
  const ctxNodes = () => S.nodes.filter(n => n.group === 'contextfile');
  const webNodes = () => S.nodes.filter(n => n.group === 'web');
  function wellPos(path) { const list = diskFiles(); const i = Math.max(0, list.indexOf(path)); const gap = Math.min(22, 300 / Math.max(1, list.length - 1)); return { x: 120, y: 404 + i * gap }; }
  function resRect(path) { const list = diskFiles(); const i = Math.max(0, list.indexOf(path)); const col = i % 3, row = Math.floor(i / 3); return { x: 932 + col * 87, y: 380 + row * 30, w: 82, h: 26 }; }
  const resPos = path => { const r = resRect(path); return { x: r.x + 10, y: r.y + 2 }; };
  function ctxPos(path) { const list = ctxNodes().map(n => n.label); const i = Math.max(0, list.indexOf(path)); return { x: 124, y: 62 + i * 40 }; }
  function cloudPos(id) { if (id === 'mcp:github') return { x: 742, y: 44 }; const list = webNodes().filter(n => n.id !== 'mcp:github').map(n => n.id); const i = Math.max(0, list.indexOf(id)); return { x: 292 + i * 112, y: 38 }; }
  const visibleLanes = () => S.lanes.filter(l => l.depth > 0).slice(-4);
  function valley(key) {
    const list = visibleLanes(); const i = list.findIndex(l => l.key === key); if (i < 0) return null;
    const lane = list[i]; const y = 618 + i * 26; const hx = 514 + (lane.depth - 1) * 36; const mx = 852;
    const cx0 = hx + 112; const step2 = (mx - cx0 - 170) / 6;
    return { lane, y, head: { x: hx, y }, mouth: { x: mx, y }, camp: { x: cx0, y }, kx: kind => ({ x: cx0 + 26 + KINDS.indexOf(kind) * step2, y }) };
  }

  // resolve a node id to a point, given the role it plays in a hop and the call that made the hop
  function pos(id, role, hop, call) {
    const sub = call && call.lane && call.lane !== 'main';
    if (id === 'user') return P.user;
    if (id === 'model') return P.model;
    if (id === 'answer') return P.reply;
    if (id === 'plan') return P.plan;
    if (id === 'context') return role === 'from' ? (hop.to === 'answer' ? P.replyFrom : P.mistFrom) : { x: 938, y: 200 };
    if (id === 'terminal') return role === 'from' ? { x: 892, y: 538 } : P.terminal;
    if (id.startsWith('tool:')) {
      const kind = id.slice(5);
      if (sub) { const v = valley(call.lane); return v ? v.kx(kind) : null; }
      if (kind === 'agents') {
        if (role === 'to' && hop.from.startsWith('lane:')) return P.rejoin;
        if (role === 'from' && !hop.to.startsWith('lane:')) return P.rejoin;
      }
      return P.feat[kind];
    }
    if (id.startsWith('file:')) { const path = id.slice(5); return role === 'from' ? wellPos(path) : resPos(path); }
    if (id.startsWith('ctxfile:')) return ctxPos(id.slice(8));
    if (id.startsWith('web:') || id.startsWith('mcp:')) { const c = cloudPos(id); return { x: c.x, y: c.y + 14 }; }
    if (id.startsWith('lane:')) {
      const key = id.slice(5); const v = valley(key); if (!v) return null;
      if (call && key === call.lane) return v.camp;
      const other = role === 'from' ? hop.to : hop.from;
      if (other === 'tool:agents') return role === 'to' ? v.head : v.mouth;
      return v.camp;
    }
    return null;
  }

  // ---------------------------------------------------------------- geometry
  function cubic(a, c1, c2, b, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push({ x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y }); }
    return pts;
  }
  function roundedPoly(poly, r) {
    const out = [poly[0]];
    for (let i = 1; i < poly.length - 1; i++) {
      const a = poly[i - 1], p = poly[i], b = poly[i + 1];
      const d1 = Math.hypot(p.x - a.x, p.y - a.y) || 1, d2 = Math.hypot(b.x - p.x, b.y - p.y) || 1; const rr = Math.min(r, d1 / 2, d2 / 2);
      const s = { x: p.x - (p.x - a.x) / d1 * rr, y: p.y - (p.y - a.y) / d1 * rr }, e = { x: p.x + (b.x - p.x) / d2 * rr, y: p.y + (b.y - p.y) / d2 * rr };
      out.push(s); for (let k = 1; k <= 6; k++) { const t = k / 6, u = 1 - t; out.push({ x: u * u * s.x + 2 * u * t * p.x + t * t * e.x, y: u * u * s.y + 2 * u * t * p.y + t * t * e.y }); }
    }
    out.push(poly[poly.length - 1]);
    // densify straight runs so the drawn path stays smooth
    const dense = [out[0]];
    for (let i = 1; i < out.length; i++) { const a = dense[dense.length - 1], b = out[i]; const d = Math.hypot(b.x - a.x, b.y - a.y); const n = Math.ceil(d / 14); for (let k = 1; k <= n; k++) dense.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); }
    return dense;
  }
  function measure(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); return cum; }
  function wobble(pts, amp, freq) {
    const cum = measure(pts); const n = pts.length - 1; const out = [pts[0]];
    for (let i = 1; i < n; i++) { const a = pts[i - 1], b = pts[i + 1]; const tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; const taper = Math.sin(Math.PI * i / n); const o = amp * taper * Math.sin(cum[i] * freq); out.push({ x: pts[i].x - ty / l * o, y: pts[i].y + tx / l * o }); }
    out.push(pts[n]); return out;
  }
  function geom(a, b, style, kind) {
    let pts;
    if (style === 'rain') pts = cubic(a, { x: a.x, y: a.y + 40 }, { x: b.x, y: b.y - 40 }, b, 26);
    else if (style === 'mist') { const cy = Math.min(a.y, b.y) - 34; pts = cubic(a, { x: a.x - 60, y: cy }, { x: b.x + 90, y: cy }, b, 44); }
    else if (style === 'fall') { const lip = { x: b.x - 18, y: b.y - 32 }; const dx = lip.x - a.x; pts = cubic(a, { x: a.x + dx * 0.5, y: a.y }, { x: lip.x - dx * 0.4, y: lip.y }, lip, 38); pts.push({ x: b.x - 15, y: b.y - 20 }, { x: b.x - 13, y: b.y - 8 }, { x: b.x - 12, y: b.y }); }
    else if (style === 'canal') { const mx = a.x + (b.x - a.x) * 0.45; pts = roundedPoly([a, { x: mx, y: a.y }, { x: mx, y: b.y }, b], 16); }
    else {
      const dx = b.x - a.x;
      if (dx > 30) pts = cubic(a, { x: a.x + dx * 0.5, y: a.y }, { x: b.x - dx * 0.5, y: b.y }, b, 44);
      else pts = cubic(a, { x: a.x + 50, y: a.y + (b.y - a.y) * 0.2 }, { x: b.x - 50, y: b.y }, b, 44);
    }
    if (kind === 'shell' && style !== 'fall' && style !== 'mist') pts = wobble(pts, 2.4, 0.42);
    if (kind === 'shell' && style === 'fall') { const head = wobble(pts.slice(0, 39), 2.4, 0.42); pts = head.concat(pts.slice(39)); }
    if (kind === 'files' && style === 'curve') pts = wobble(pts, 3.2, 0.045);
    const cum = measure(pts);
    return { pts, cum, len: cum[cum.length - 1] || 1, d: 'M' + pts.map(p => f1(p.x) + ' ' + f1(p.y)).join(' L') };
  }
  function pointAt(g, f) {
    const target = clamp(f, 0, 1) * g.len; const cum = g.cum; let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
    const a = g.pts[lo], b = g.pts[hi]; const seg = (cum[hi] - cum[lo]) || 1; const t = (target - cum[lo]) / seg;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  // ---------------------------------------------------------------- channels (persistent streams)
  const TAU = 30000; // sim ms: how fast "flowing right now" fades
  const channels = new Map();
  let geomKey = '';
  function styleOf(ch) {
    const f = ch.from, t = ch.to;
    if (f.startsWith('web:') || f.startsWith('mcp:')) return 'rain';
    if (f === 'context' && t !== 'answer') return 'mist';
    if (t === 'terminal') return 'fall';
    if (ch.kind === 'other' && ch.scope === 'main') return 'canal';
    return 'curve';
  }
  function channelFor(call, hop, kindOverride) {
    const scope = call.lane || 'main'; const key = `${scope}|${hop.from}>${hop.to}`;
    let ch = channels.get(key);
    if (!ch) {
      ch = { key, scope, from: hop.from, to: hop.to, kind: kindOverride || call.kind, request: !(hop.tokens || hop.bytes), total: 0, recent: 0, at: 0, hops: [], sample: { hop: { from: hop.from, to: hop.to }, call: { lane: scope, kind: kindOverride || call.kind } }, el: null, g: null };
      ch.style = styleOf(ch);
      channels.set(key, ch); geomKey = '';
    }
    if (hop.tokens || hop.bytes) ch.request = false;
    return ch;
  }
  const recentNow = ch => ch.recent * Math.exp(-(Math.max(0, S.now - ch.at)) / TAU);
  function addHop(call, hop, t, kindOverride) {
    const ch = channelFor(call, hop, kindOverride); const v = hopVol(hop);
    ch.recent = ch.recent * Math.exp(-(Math.max(0, t - ch.at)) / TAU) + v; ch.at = Math.max(ch.at, t); ch.total += v;
    ch.hops.push({ callId: call.id || null, t, v, what: hop.what || '', unit: hopUnit(hop), err: call.status === 'error' });
    if (ch.hops.length > 80) ch.hops.shift();
    return ch;
  }
  function resolveGeom(ch) {
    const { hop, call } = ch.sample;
    const a = pos(ch.from, 'from', hop, call); let b = pos(ch.to, 'to', hop, call);
    if (!a || !b) return null;
    if (ch.to === 'context') b = { x: 938, y: 84 + clamp(a.y, 0, VH) / VH * 250 };
    return geom(a, b, ch.style, ch.kind);
  }
  function refreshGeometry() {
    const key = diskFiles().join(',') + '|' + visibleLanes().map(l => l.key).join(',') + '|' + channels.size;
    if (key === geomKey) return false;
    geomKey = key;
    for (const ch of channels.values()) { ch.g = resolveGeom(ch); ensureChannelEl(ch); }
    return true;
  }

  // ---------------------------------------------------------------- seed from history (no surges)
  const shown = new Map(); // call id -> hops already drawn
  for (const call of S.calls) {
    call.flow.forEach((hop, i) => addHop(call, hop, i === 0 || !call.endedAt ? call.startedAt : call.endedAt));
    shown.set(call.id, call.flow.length);
  }
  for (const m of S.markers) seedMarker(m, false);
  function seedMarker(m, live) {
    const main = { lane: 'main', id: null, status: 'success' };
    const hops = [];
    if (m.kind === 'prompt') { const v = m.detail.tokens || 200; hops.push([{ from: 'user', to: 'model', what: 'prompt text', tokens: v }, 'prompt'], [{ from: 'model', to: 'context', what: 'prompt into context', tokens: v }, 'prompt']); }
    if (m.kind === 'turn-complete') hops.push([{ from: 'context', to: 'answer', what: 'reply text', tokens: 400 }, 'reply']);
    if (m.kind === 'context-file') hops.push([{ from: `ctxfile:${m.detail.path}`, to: 'context', what: m.detail.path, tokens: m.detail.tokens }, 'ctx']);
    hops.forEach(([hop, kind], i) => { const ch = addHop(main, hop, m.time, kind); if (live) spawnSurge(ch, main, hop, i * 700, kind); });
  }

  // ---------------------------------------------------------------- SVG terrain
  const map = $('#map'), overlay = $('#overlay');
  function buildTerrain() {
    const r = lrng(11);
    let stars = '';
    for (let i = 0; i < 110; i++) { const s = r(); stars += `<circle cx="${(r() * VW).toFixed(0)}" cy="${(r() * 190).toFixed(0)}" r="${(0.35 + s * 0.9).toFixed(2)}" fill="#efe6ff" opacity="${(0.12 + s * 0.5).toFixed(2)}"/>`; }
    const ridge1 = 'M0 168 L70 128 L130 150 L200 104 L270 140 L340 112 L430 146 L510 98 L590 136 L670 108 L750 142 L830 116 L910 150 L1000 112 L1080 138 L1200 100 L1200 230 L0 230 Z';
    const ridge2 = 'M0 210 C120 170, 200 196, 300 178 C420 160, 520 200, 640 182 C760 166, 860 204, 980 186 C1080 172, 1150 194, 1200 184 L1200 260 L0 260 Z';
    const cloud = (id, label) => {
      const c = cloudPos(id);
      return `<g class="cloud" id="cl-${esc(id.replace(/[^a-z0-9]/gi, '_'))}" data-open="host:${esc(id)}" tabindex="0" role="button" aria-label="Web source ${esc(label)}">
        <g class="puff" fill="#3a2f72" stroke="rgba(201,184,240,.35)"><ellipse cx="${c.x}" cy="${c.y + 2}" rx="27" ry="10"/><circle cx="${c.x - 10}" cy="${c.y - 3}" r="9"/><circle cx="${c.x + 6}" cy="${c.y - 7}" r="11"/></g>
        <g class="rainlines" stroke="${COL.network}" stroke-width="1.3" stroke-linecap="round">${[-14, -5, 4, 13].map((dx, k) => `<line x1="${c.x + dx}" y1="${c.y + 14}" x2="${c.x + dx - 2}" y2="${c.y + 22}" style="animation-delay:${k * 0.15}s"/>`).join('')}</g>
        <text class="lbl" x="${c.x}" y="${c.y - 18}" text-anchor="middle" font-size="9">${esc(label)}</text>
        <text class="lbl dimtext cloudtxt" data-cloud="${esc(id)}" x="${c.x}" y="${c.y + 33}" text-anchor="middle" font-size="8.5"></text></g>`;
    };
    const F = P.feat;
    const featG = (kind, inner) => { const p = F[kind]; return `<g class="feat" id="feat-${kind}" data-open="kind:${kind}" tabindex="0" role="button" aria-label="${KM[kind].name}: ${KM[kind].feature}">
        <circle class="glow" cx="${p.x}" cy="${p.y}" r="30" fill="url(#gGlow-${kind})"/>${inner}
        <text class="lbl" x="${p.x}" y="${p.y + 28}" text-anchor="middle" font-size="10.5" font-weight="600">${KM[kind].name} · ${KM[kind].feature}</text>
        <text class="lbl dimtext feattxt" data-kind="${kind}" x="${p.x}" y="${p.y + 40}" text-anchor="middle" font-size="9.5"></text></g>`; };
    const fp = F;
    const features = [
      featG('network', `<ellipse cx="${fp.network.x}" cy="${fp.network.y}" rx="22" ry="7" fill="${COL.network}" fill-opacity=".28" stroke="${COL.network}" stroke-opacity=".7"/><g class="rainlines" stroke="${COL.network}" stroke-width="1.4" stroke-linecap="round">${[-12, -4, 4, 12].map((dx, k) => `<line x1="${fp.network.x + dx}" y1="${fp.network.y - 18}" x2="${fp.network.x + dx - 2}" y2="${fp.network.y - 9}" style="animation-delay:${k * 0.13}s"/>`).join('')}</g>`),
      featG('files', `<ellipse cx="${fp.files.x}" cy="${fp.files.y}" rx="30" ry="9" fill="${COL.files}" fill-opacity=".25" stroke="${COL.files}" stroke-opacity=".75"/><path d="M${fp.files.x - 18} ${fp.files.y - 2} h14 M${fp.files.x - 2} ${fp.files.y + 2} h18 M${fp.files.x - 12} ${fp.files.y + 5} h10" stroke="#fff" stroke-opacity=".35" stroke-linecap="round"/>`),
      featG('other', `<rect x="${fp.other.x - 22}" y="${fp.other.y - 8}" width="44" height="16" rx="2" fill="${COL.other}" fill-opacity=".22" stroke="${COL.other}"/><path d="M${fp.other.x - 8} ${fp.other.y - 11} v22 M${fp.other.x + 8} ${fp.other.y - 11} v22" stroke="${SAND}" stroke-width="2"/>`),
      featG('edits', `<g class="wheel"><circle cx="${fp.edits.x}" cy="${fp.edits.y}" r="15" fill="none" stroke="${COL.edits}" stroke-width="2"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => { const rad = a * Math.PI / 180; const x1 = fp.edits.x + Math.cos(rad) * 4, y1 = fp.edits.y + Math.sin(rad) * 4, x2 = fp.edits.x + Math.cos(rad) * 19, y2 = fp.edits.y + Math.sin(rad) * 19; return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${COL.edits}" stroke-width="2.2" stroke-linecap="square"/>`; }).join('')}<circle cx="${fp.edits.x}" cy="${fp.edits.y}" r="3.5" fill="${SAND}"/></g>`),
      featG('memory', `<rect x="${fp.memory.x - 20}" y="${fp.memory.y - 12}" width="4" height="24" fill="${SAND}" opacity=".8"/><rect x="${fp.memory.x + 16}" y="${fp.memory.y - 12}" width="4" height="24" fill="${SAND}" opacity=".8"/><rect class="gate" x="${fp.memory.x - 16}" y="${fp.memory.y - 8}" width="32" height="16" fill="${COL.memory}" fill-opacity=".5" stroke="${COL.memory}"/><path d="M${fp.memory.x - 16} ${fp.memory.y + 10} h32" stroke="${COL.memory}" stroke-dasharray="3 2"/>`),
      featG('shell', `<g fill="#2b2357" stroke="rgba(233,220,192,.35)"><path d="M${fp.shell.x - 22} ${fp.shell.y + 6} l6 -10 l7 10 z"/><path d="M${fp.shell.x - 6} ${fp.shell.y + 7} l7 -13 l8 13 z"/><path d="M${fp.shell.x + 10} ${fp.shell.y + 6} l6 -9 l6 9 z"/></g><g class="foam" stroke="${COL.shell}" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M${fp.shell.x - 26} ${fp.shell.y - 6} q4 -4 8 0 q4 4 8 0"/><path d="M${fp.shell.x + 2} ${fp.shell.y - 10} q4 -4 8 0 q4 4 8 0"/></g>`),
      featG('agents', `<path d="M${fp.agents.x - 22} ${fp.agents.y} C ${fp.agents.x - 6} ${fp.agents.y}, ${fp.agents.x} ${fp.agents.y - 10}, ${fp.agents.x + 20} ${fp.agents.y - 12} M${fp.agents.x - 6} ${fp.agents.y} C ${fp.agents.x + 2} ${fp.agents.y}, ${fp.agents.x + 6} ${fp.agents.y + 10}, ${fp.agents.x + 20} ${fp.agents.y + 12}" stroke="${COL.agents}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M${fp.agents.x - 4} ${fp.agents.y - 1} h10 l-2 3 h-6 z M${fp.agents.x + 1} ${fp.agents.y - 8} v7 l4 -1 z" fill="${SAND}"/>`)
    ].join('');
    const glowDefs = KINDS.map(k => `<radialGradient id="gGlow-${k}"><stop offset="0" stop-color="${COL[k]}" stop-opacity=".9"/><stop offset="1" stop-color="${COL[k]}" stop-opacity="0"/></radialGradient>`).join('');
    map.innerHTML = `<defs>
        <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0a27"/><stop offset=".35" stop-color="#191442"/><stop offset="1" stop-color="#231a4e"/></linearGradient>
        <linearGradient id="gLake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fe6df" stop-opacity=".5"/><stop offset="1" stop-color="#16526d" stop-opacity=".9"/></linearGradient>
        <linearGradient id="gValley" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1f5c" stop-opacity=".9"/><stop offset="1" stop-color="#150f36" stop-opacity=".9"/></linearGradient>
        <radialGradient id="gModel"><stop offset="0" stop-color="#9ff3ee"/><stop offset=".55" stop-color="#4b8fc0" stop-opacity=".7"/><stop offset="1" stop-color="#6a4bc4" stop-opacity="0"/></radialGradient>
        <radialGradient id="gSpring"><stop offset="0" stop-color="${COL.prompt}"/><stop offset="1" stop-color="${COL.prompt}" stop-opacity="0"/></radialGradient>
        ${glowDefs}
        <filter id="fSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
        <clipPath id="clipLake"><path d="${LAKE_D}"/></clipPath>
      </defs>
      <rect width="${VW}" height="${VH}" fill="url(#gSky)"/>
      <g>${stars}</g>
      <path d="${ridge1}" fill="#211946" opacity=".75"/><path d="${ridge2}" fill="#1a1440" opacity=".8"/>
      <ellipse cx="420" cy="300" rx="260" ry="40" fill="${MIST}" opacity=".05" filter="url(#fSoft)"/>
      <ellipse cx="760" cy="430" rx="240" ry="36" fill="${MIST}" opacity=".05" filter="url(#fSoft)"/>
      <rect x="498" y="600" width="388" height="114" rx="16" fill="#0f0c2a" opacity=".55"/>
      <text class="cap" x="16" y="16">SPRINGS · SOURCES</text>
      
      <text class="cap" x="1060" y="80" text-anchor="middle">CONTEXT LAKE</text>
      <text class="cap" x="860" y="598" text-anchor="end">SUBAGENT VALLEYS</text>
      <text class="cap" x="932" y="374">FILE RESERVOIRS (DISK)</text>
      <text class="cap" x="16" y="392">DISK WELLS · READS</text>
      <text class="cap" x="16" y="42">GLACIER · CONTEXT FILES</text>
      <g id="valleys"></g>
      <g id="lake">
        <path d="${LAKE_D}" fill="#0b0a24" stroke="rgba(233,220,192,.35)" stroke-width="2"/>
        <g clip-path="url(#clipLake)"><g id="strata"></g><path id="lakeSurface" fill="none" stroke-width="2"/></g>
        <path d="M934 ${lakeY(70)} H1192" stroke="${AMBER}" stroke-dasharray="5 4" stroke-opacity=".8"/><path d="M934 ${lakeY(90)} H1192" stroke="${RED}" stroke-dasharray="5 4" stroke-opacity=".8"/>
        <text class="lbl" x="1188" y="${lakeY(70) - 3}" text-anchor="end" font-size="8.5" fill="${AMBER}" style="fill:${AMBER}">70% amber</text>
        <text class="lbl" x="1188" y="${lakeY(90) - 3}" text-anchor="end" font-size="8.5" style="fill:${RED}">90% red</text>
        <g id="lakeText"></g>
        <path d="${LAKE_D}" fill="transparent" stroke="none" data-open="context" tabindex="0" role="button" aria-label="Context lake" id="lakeHit"/>
      </g>
      <g id="chReq"></g><g id="chData"></g>
      <g id="springs">
        <g class="feat" data-open="user" tabindex="0" role="button" aria-label="User prompt spring">
          <circle cx="${P.user.x}" cy="${P.user.y}" r="16" fill="url(#gSpring)" opacity=".5"/>
          <circle class="spring-ring" cx="${P.user.x}" cy="${P.user.y}" r="14" fill="none" stroke="${COL.prompt}"/>
          <circle class="spring-ring" style="animation-delay:1.6s" cx="${P.user.x}" cy="${P.user.y}" r="14" fill="none" stroke="${COL.prompt}"/>
          <circle cx="${P.user.x}" cy="${P.user.y}" r="5" fill="${COL.prompt}"/>
          <text class="lbl" x="${P.user.x}" y="${P.user.y - 22}" text-anchor="middle" font-size="10.5" font-weight="600">User prompt spring</text>
          <text class="lbl dimtext" id="userTxt" x="${P.user.x}" y="${P.user.y + 30}" text-anchor="middle" font-size="9.5"></text></g>
        <g class="feat" data-open="model" tabindex="0" role="button" aria-label="Model confluence">
          <circle cx="${P.model.x}" cy="${P.model.y}" r="30" fill="url(#gModel)"/>
          <circle cx="${P.model.x}" cy="${P.model.y}" r="12" fill="none" stroke="#9ff3ee" stroke-opacity=".7"/>
          <text class="lbl" x="${P.model.x}" y="${P.model.y - 34}" text-anchor="middle" font-size="10.5" font-weight="600">Model · confluence</text>
          <text class="lbl dimtext" id="modelTxt" x="${P.model.x}" y="${P.model.y + 44}" text-anchor="middle" font-size="9.5"></text></g>
        <g id="glacier"></g>
        <g id="wells"></g>
      </g>
      <g id="clouds">${webNodes().map(n => cloud(n.id, n.id === 'mcp:github' ? 'MCP github' : n.label)).join('')}</g>
      <g id="features">${features}</g>
      <g class="feat" data-open="terminal" tabindex="0" role="button" aria-label="Terminal pool">
        <ellipse cx="${P.terminal.x}" cy="${P.terminal.y}" rx="52" ry="14" fill="${COL.shell}" fill-opacity=".18" stroke="${COL.shell}" stroke-opacity=".6"/>
        <ellipse cx="${P.terminal.x}" cy="${P.terminal.y}" rx="30" ry="7" fill="none" stroke="${COL.shell}" stroke-opacity=".25"/>
        <text class="lbl" x="${P.terminal.x + 14}" y="${P.terminal.y + 4}" text-anchor="middle" font-size="10" font-weight="600">Terminal pool</text>
        <g id="termTxt"></g></g>
      <g class="feat" data-open="reply" tabindex="0" role="button" aria-label="Reply outflow">
        <text class="lbl" x="1192" y="24" text-anchor="end" font-size="10" font-weight="600" id="replyTxt">Reply outflow ▸</text></g>
      <g id="reservoirs"></g>
      <g id="terraces"></g>`;
    overlay.innerHTML = `<defs><filter id="oGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g id="traceG"></g><g id="retries"></g><g id="buoys"></g>`;
  }
  buildTerrain();

  function ensureChannelEl(ch) {
    if (!ch.el) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `ch k-${ch.kind} s-${ch.style}${ch.request ? ' req' : ''}`);
      g.setAttribute('data-open', 'channel:' + ch.key);
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', ch.request ? '-1' : '0');
      g.setAttribute('aria-label', `Stream from ${nodeLabel(ch.from)} to ${nodeLabel(ch.to)}`);
      g.innerHTML = '<title></title><path class="bank"/><path class="water"/><path class="shim"/><path class="hit"/>';
      (ch.request ? $('#chReq') : $('#chData')).appendChild(g);
      ch.el = g;
      g.querySelector('.water').setAttribute('stroke', COL[ch.kind] || SAND);
    }
    if (!ch.request && ch.el.classList.contains('req')) { ch.el.classList.remove('req'); $('#chData').appendChild(ch.el); ch.el.setAttribute('tabindex', '0'); }
    const d = ch.g ? ch.g.d : '';
    ch.el.style.display = ch.g ? '' : 'none';
    for (const p of ch.el.querySelectorAll('path')) p.setAttribute('d', d);
  }
  function updateChannels(hl) {
    for (const ch of channels.values()) {
      if (!ch.el || !ch.g) continue;
      const r = recentNow(ch);
      const w = ch.request ? 0.9 + Math.min(2.4, Math.sqrt(r) / 4) : 1.2 + Math.min(13, Math.sqrt(r) * 0.2);
      const bed = (ch.request ? 1.4 : 3) + Math.min(7, Math.log10(1 + ch.total) * 1.2);
      const [title, bank, water, shim, hit] = ch.el.children;
      bank.setAttribute('stroke-width', f1(Math.max(bed, w + 4)));
      water.setAttribute('stroke-width', f1(w));
      water.setAttribute('stroke-opacity', ch.request ? '0.5' : f1(0.32 + 0.6 * Math.min(1, r / 300)));
      shim.setAttribute('stroke-width', f1(Math.max(0.7, w * 0.32)));
      shim.style.display = r > 20 && !reduced ? '' : 'none';
      hit.setAttribute('stroke-width', f1(Math.max(9, w + 4)));
      title.textContent = `${nodeLabel(ch.from)} → ${nodeLabel(ch.to)} · ${KM[ch.kind] ? KM[ch.kind].name : ch.kind} · now ${fmtK(r)} · total ${fmtK(ch.total)}`;
      ch.el.classList.toggle('dim', Boolean(hl && hl.keys && !hl.keys.has(ch.key)));
    }
  }

  // ---------------------------------------------------------------- dynamic SVG groups
  function setHTML(el, html) {
    if (!el || el._html === html) return;
    const active = document.activeElement; const ref = active && el.contains(active) ? active.getAttribute('data-open') : null;
    el.innerHTML = html; el._html = html;
    if (ref) { const again = el.querySelector(`[data-open="${CSS.escape(ref)}"]`); if (again) again.focus({ preventScroll: true }); }
  }
  const fileStats = path => S.files[path] || { reads: 0, edits: 0, failed: 0, added: 0, removed: 0, touches: [] };
  function failedByKind(path) {
    const out = { files: 0, edits: 0 };
    for (const c of sim.callsForFile(path)) if (c.status === 'error' && out[c.kind] != null) out[c.kind]++;
    return out;
  }
  function renderWells() {
    setHTML($('#wells'), diskFiles().map(path => {
      const p = wellPos(path); const f = fileStats(path); const fail = failedByKind(path).files;
      return `<g class="well" data-open="file:${esc(path)}" tabindex="0" role="button" aria-label="Disk well ${esc(path)}: ${f.reads} reads">
        <circle class="ring" cx="${p.x}" cy="${p.y}" r="6.5"/><circle cx="${p.x}" cy="${p.y}" r="${f1(2 + Math.min(3.5, f.reads * 0.35))}" fill="${COL.files}" opacity="${f.reads ? f1(Math.min(1, 0.4 + f.reads * 0.07)) : '0.15'}"/>
        <text class="lbl" x="${p.x - 11}" y="${p.y + 3}" text-anchor="end" font-size="9.5">${esc(shortPath(path))}</text>
        <text class="lbl dimtext" x="${p.x + 10}" y="${p.y + 3}" font-size="8.5">${f.reads ? f.reads + 'r' : ''}</text>
        ${fail ? `<text class="lbl silttext" x="${p.x + 10 + (f.reads ? 16 : 0)}" y="${p.y + 3}" font-size="8.5">✕${fail}</text>` : ''}</g>`;
    }).join(''));
  }
  function renderGlacier() {
    setHTML($('#glacier'), ctxNodes().map(n => {
      const p = ctxPos(n.label); const loaded = S.context.files.find(f => f.path === n.label);
      return `<g class="glacier" data-open="ctxfile:${esc(n.label)}" tabindex="0" role="button" aria-label="Context file ${esc(n.label)} ${loaded ? 'loaded' : 'not loaded'}">
        <polygon points="${p.x - 11},${p.y + 8} ${p.x - 2},${p.y - 10} ${p.x + 4},${p.y - 2} ${p.x + 8},${p.y - 7} ${p.x + 13},${p.y + 8}" fill="${COL.ctx}" fill-opacity="${loaded ? 0.75 : 0.15}" stroke="${COL.ctx}" stroke-opacity=".6"/>
        <text class="lbl" x="${p.x - 16}" y="${p.y + 2}" text-anchor="end" font-size="9.5">${esc(shortPath(n.label))}</text>
        <text class="lbl dimtext" x="${p.x - 16}" y="${p.y + 12}" text-anchor="end" font-size="8">${loaded ? fmtK(n.tokens) + ' tok · melted in' : 'frozen · not loaded'}</text></g>`;
    }).join(''));
  }
  function renderReservoirs() {
    setHTML($('#reservoirs'), diskFiles().map(path => {
      const r = resRect(path); const f = fileStats(path); const fail = failedByKind(path).edits;
      const fill = f.edits ? Math.min(1, 0.18 + f.edits * 0.12 + (f.added + f.removed) / 260) : 0;
      const hot = f.edits >= 3; const wh = fill * (r.h - 4);
      return `<g class="res${hot ? ' hot' : ''}" data-open="file:${esc(path)}" tabindex="0" role="button" aria-label="File reservoir ${esc(path)}: ${f.edits} edits${hot ? ', hot' : ''}">
        <rect class="tank" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="5"/>
        <rect class="tankwater" x="${r.x + 2}" y="${f1(r.y + r.h - 2 - wh)}" width="${r.w - 4}" height="${f1(wh)}" rx="3" fill="${COL.edits}" fill-opacity=".38"/>
        ${fail ? `<rect x="${r.x + 2}" y="${r.y + r.h - 5}" width="${r.w - 4}" height="3" fill="${SILT}"/>` : ''}
        <text class="lbl" x="${r.x + 4}" y="${r.y + 10}" font-size="8.5">${esc(baseName(path))}</text>
        <text class="lbl dimtext" x="${r.x + 4}" y="${r.y + 21}" font-size="8">${f.edits ? `×${f.edits} +${f.added} −${f.removed}` : 'dry'}</text>
        ${hot ? `<text class="lbl goldtext" x="${r.x + r.w - 3}" y="${r.y + 21}" text-anchor="end" font-size="8">HOT</text>` : ''}
        ${fail ? `<text class="lbl silttext" x="${r.x + r.w - 3}" y="${r.y + 10}" text-anchor="end" font-size="8">✕${fail}</text>` : ''}</g>`;
    }).join(''));
  }
  function renderValleys() {
    setHTML($('#valleys'), visibleLanes().map(l => {
      const v = valley(l.key); const y = v.y, x0 = v.head.x, x1 = v.mouth.x;
      let top = `M${x0} ${y - 8}`, bot = '';
      for (let x = x0 + 20; x <= x1; x += 20) top += ` Q${x - 10} ${y - 8 - 3 * Math.sin(x / 23)} ${x} ${y - 9 + 2 * Math.sin(x / 31)}`;
      for (let x = x1 - 20; x >= x0; x -= 20) bot += ` Q${x + 10} ${y + 8 + 3 * Math.sin(x / 19)} ${x} ${y + 9 - 2 * Math.sin(x / 29)}`;
      const d = `${top} L${x1} ${y + 9}${bot} Z`;
      const stTxt = l.state === 'failed' ? '✕ FAILED' : l.state === 'running' ? '◌ running' : '✓ done';
      return `<g class="valley ${l.state}" data-open="lane:${esc(l.key)}" tabindex="0" role="button" aria-label="Subagent valley ${esc(l.label)}, ${l.state}">
        <path class="band" d="${d}" fill="url(#gValley)"/>
        ${l.state === 'failed' ? `<path d="${d}" fill="${SILT}" fill-opacity=".14"/>` : ''}
        <text class="lbl" x="${x0 + 4}" y="${y + 3}" font-size="9" font-weight="600">${'↳'.repeat(Math.max(0, l.depth - 1))}${esc(l.label)}</text>
        <text class="lbl ${l.state === 'failed' ? 'silttext' : 'dimtext'}" x="${x1 - 4}" y="${y + 3}" text-anchor="end" font-size="8.5">${stTxt} · ${l.calls} calls${l.errors ? ` · ⚠${l.errors}` : ''} · ${fmtK(l.tokens)} tok</text></g>`;
    }).join(''));
  }
  function renderTerraces() {
    const items = S.tasks.items; const done = items.filter(i => i.status === 'completed').length;
    let html = `<text class="cap" x="1004" y="${P.plan.y - 12}">TASK TERRACES · ${done}/${items.length}</text>`;
    if (!items.length) html += `<text class="lbl dimtext" x="1010" y="${P.plan.y + 12}" font-size="9.5">No plan yet</text>`;
    items.slice(0, 5).forEach((it, i) => {
      const x = 1004 + i * 10, y = P.plan.y - 2 + i * 26, w = 188 - i * 10, h = 22;
      const fill = it.status === 'completed' ? COL.files : it.status === 'in_progress' ? COL.memory : SAND;
      const op = it.status === 'completed' ? 0.42 : it.status === 'in_progress' ? 0.3 : 0.07;
      const word = it.status === 'completed' ? '✓ done' : it.status === 'in_progress' ? '◌ in progress' : '· not started';
      const maxChars = Math.floor((w - 70) / 4.9);
      const label = it.label.length > maxChars ? it.label.slice(0, maxChars - 1) + '…' : it.label;
      html += `<g class="terrace ${it.status}" data-open="plan" tabindex="0" role="button" aria-label="Task ${esc(it.id)} ${esc(it.label)}: ${it.status}">
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" fill-opacity="${op}" stroke="${it.status === 'completed' ? GOLD : fill}" stroke-opacity="${it.status === 'pending' ? 0.35 : 0.8}" ${it.status === 'pending' ? 'stroke-dasharray="3 3"' : ''}/>
        <text class="lbl" x="${x + 5}" y="${y + 14}" font-size="9">${esc(it.id)}. ${esc(label)}</text>
        <text class="lbl ${it.status === 'completed' ? 'goldtext' : 'dimtext'}" x="${x + w - 4}" y="${y + 14}" text-anchor="end" font-size="8.5">${word}</text></g>`;
    });
    setHTML($('#terraces'), html);
  }
  function renderTerminal() {
    const shells = S.calls.filter(c => c.kind === 'shell').slice(-3).reverse();
    setHTML($('#termTxt'), shells.map((c, i) => {
      const cmd = c.target ? c.target.value : ''; const cut = cmd.length > 24 ? cmd.slice(0, 23) + '…' : cmd;
      const res = c.status === 'running' ? '◌ running' : c.status === 'error' ? `✕ ${c.error.code}` : `✓ exit ${c.output && c.output.exitCode != null ? c.output.exitCode : 0}`;
      return `<text class="lbl mono ${i ? 'dimtext' : ''}" x="790" y="${566 + i * 11}" font-size="8.8">$ ${esc(cut)}</text><text class="lbl mono ${c.status === 'error' ? 'silttext' : c.status === 'running' ? 'goldtext' : 'dimtext'}" x="992" y="${566 + i * 11}" text-anchor="end" font-size="8.8">${esc(res)}</text>`;
    }).join(''));
  }
  // context lake: strata by contributor since the last compaction
  const STRATA = [['base', 'compacted summary', '#7c6fb8'], ['ctx', 'context files', COL.ctx], ['prompt', 'prompts', COL.prompt], ['files', 'reads', COL.files], ['shell', 'shell output', COL.shell], ['network', 'web pages', COL.network], ['agents', 'subagent reports', COL.agents], ['memory', 'plan', COL.memory], ['other', 'other tools', COL.other], ['edits', 'edit results', COL.edits], ['reply', 'replies', COL.reply]];
  function lakeStrata() {
    const comp = [...S.markers].reverse().find(m => m.kind === 'compaction');
    const since = comp ? comp.time : -Infinity;
    const sums = Object.fromEntries(STRATA.map(s => [s[0], 0]));
    if (comp) sums.base = comp.detail.after || 0;
    for (const s of S.context.samples) {
      if (s.time < since || (comp && s.time === since && s.delta > 0 && s.used === comp.detail.after)) continue;
      let cat = 'other';
      if (s.callId) { const c = sim.callById(s.callId); cat = c ? c.kind : 'other'; }
      else if (/prompt/i.test(s.why)) cat = 'prompt'; else if (/^Loaded/.test(s.why)) cat = 'ctx'; else if (/Reply/.test(s.why)) cat = 'reply';
      sums[cat] = (sums[cat] || 0) + Math.max(0, s.delta);
    }
    const total = Object.values(sums).reduce((a, b) => a + b, 0) || 1;
    const scale = S.context.used / total;
    return STRATA.map(([k, label, color]) => ({ k, label, color, tokens: sums[k] * scale })).filter(s => s.tokens > 0);
  }
  let dispPct = S.context.percent, drainUntil = 0;
  function renderLake() {
    const strata = lakeStrata(); let y = LAKE.y1; let html = '';
    let labels = '';
    for (const s of strata) {
      const h = s.tokens / S.context.capacity * (LAKE.y1 - LAKE.y0); y -= h;
      html += `<rect x="${LAKE.x0}" y="${f1(y)}" width="${LAKE.x1 - LAKE.x0}" height="${f1(h + 0.6)}" fill="${s.color}" fill-opacity="${s.k === 'base' ? 0.5 : 0.48}"><title>${esc(s.label)}: ${fmtK(s.tokens)} tokens</title></rect><line x1="${LAKE.x0}" x2="${LAKE.x1}" y1="${f1(y)}" y2="${f1(y)}" stroke="#0b0a24" stroke-opacity=".5"/>`;
      if (h >= 9) labels += `<text x="1176" y="${f1(y + h / 2 + 3)}" text-anchor="end" font-size="8.5" class="lbl" style="fill:#fff;opacity:.85">${esc(s.label)} ${fmtK(s.tokens)}</text>`;
    }
    html = `<g id="strataInner">${html}<rect x="${LAKE.x0}" y="${LAKE.y0}" width="${LAKE.x1 - LAKE.x0}" height="${LAKE.y1 - LAKE.y0}" fill="url(#gLake)" opacity=".18"/>${labels}</g>`;
    const strataEl = $('#strata'); setHTML(strataEl, html);
    const pct = S.context.percent; const state = pct >= 90 ? 'RED' : pct >= 70 ? 'AMBER' : 'calm';
    const col = pct >= 90 ? RED : pct >= 70 ? AMBER : SAND;
    const biggest = strata.filter(s => s.k !== 'base').sort((a, b) => b.tokens - a.tokens).slice(0, 3);
    setHTML($('#lakeText'), `<text class="lbl" x="1040" y="122" text-anchor="middle" font-size="34" font-weight="700" style="fill:${col}">${pct.toFixed(1)}%</text>
      <text class="lbl" x="1040" y="137" text-anchor="middle" font-size="10" style="fill:${col}">${state === 'calm' ? 'level calm' : state === 'AMBER' ? '▲ AMBER · above 70%' : '▲▲ RED · above 90%'}</text>
      <text class="lbl" x="1040" y="160" text-anchor="middle" font-size="9.5">${fmtK(S.context.used)} / ${fmtK(S.context.capacity)} tokens · drained ×${S.context.compactions}</text>
      <text class="lbl dimtext" x="1040" y="172" text-anchor="middle" font-size="9">biggest: ${biggest.map(s => `${s.label} ${fmtK(s.tokens)}`).join(' · ')}</text>
      ${drainUntil > anim ? `<text class="lbl goldtext" x="1040" y="186" text-anchor="middle" font-size="11">⇣ COMPACTING · lake draining</text>` : ''}`);
  }
  function renderFeatureText() {
    const esp = sim.errorsSincePrompt(); const running = sim.runningCalls();
    const activeKinds = new Set(running.filter(c => c.lane === 'main').map(c => c.kind));
    for (const k of KINDS) {
      const el = map.querySelector(`.feattxt[data-kind="${k}"]`); const n = S.counts[k]; const e = esp[k] || 0;
      const txt = `${n} calls${e ? ` · ⚠ ${e} since prompt` : ''}${activeKinds.has(k) ? ' · flowing' : ''}`;
      if (el.textContent !== txt) el.textContent = txt;
      el.classList.toggle('silttext', Boolean(e)); el.classList.toggle('dimtext', !e);
      $('#feat-' + k).classList.toggle('on', activeKinds.has(k) || (k === 'agents' && S.lanes.some(l => l.depth && l.state === 'running')));
    }
    const runningNet = running.filter(c => c.kind === 'network');
    for (const n of webNodes()) {
      const calls = S.calls.filter(c => (c.kind === 'network' || c.kind === 'other') && callHost(c) === n.id);
      const last = calls[calls.length - 1];
      const el = map.querySelector(`.cloudtxt[data-cloud="${CSS.escape(n.id)}"]`);
      const txt = calls.length ? `${calls.length} fetch${calls.length > 1 ? 'es' : ''}${last && last.status === 'error' ? ' · ✕ ' + last.error.code : last && last.status === 'success' ? ' · ' + (last.output.status || 'ok') : ''}` : 'no rain yet';
      if (el && el.textContent !== txt) { el.textContent = txt; el.classList.toggle('silttext', Boolean(last && last.status === 'error')); }
      const cl = $('#cl-' + n.id.replace(/[^a-z0-9]/gi, '_'));
      if (cl) cl.classList.toggle('on', runningNet.some(c => callHost(c) === n.id) || running.some(c => c.kind === 'other' && n.id === 'mcp:github'));
    }
    const prompts = S.markers.filter(m => m.kind === 'prompt').length;
    $('#userTxt').textContent = `turn ${S.session.turn} · ${prompts} prompts`;
    $('#modelTxt').textContent = `in ${fmtK(S.tokens.input)} · out ${fmtK(S.tokens.output)} tok`;
    const turns = S.markers.filter(m => m.kind === 'turn-complete').length;
    $('#replyTxt').textContent = `Reply outflow · ${turns} turns ▸`;
  }
  function callHost(c) {
    if (c.kind === 'other') return 'mcp:github';
    const hop = c.flow.find(h => h.from.startsWith('web:')); if (hop) return hop.from;
    if (c.target && c.target.type === 'url') { const m = /https?:\/\/([^/]+)/.exec(c.target.value); if (m) return 'web:' + m[1]; }
    return null;
  }

  // spots on the map where errors and retries are drawn
  function spotOf(c) {
    if (c.lane !== 'main') { const v = valley(c.lane); return v ? v.kx(c.kind) : null; }
    if (c.kind === 'agents') return P.rejoin;
    if (c.kind === 'shell') return { x: 700, y: 516 };
    return P.feat[c.kind];
  }
  function spiral() { let d = ''; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 4.2, r = 2 + t * 11; d += (i ? ' L' : 'M') + f1(Math.cos(a) * r) + ' ' + f1(Math.sin(a) * r * 0.42); } return d; }
  const SPIRAL = spiral();
  function renderBuoys() {
    const since = lastPromptTime();
    let list = S.errors.filter(c => c.startedAt >= since);
    const old = S.errors.filter(c => c.startedAt < since).slice(-Math.max(0, 3 - list.length));
    list = old.concat(list).slice(-9);
    const perSpot = new Map();
    const html = list.map(c => {
      const s = spotOf(c); if (!s) return '';
      const key = `${Math.round(s.x)},${Math.round(s.y)}`; const idx = perSpot.get(key) || 0; perSpot.set(key, idx + 1);
      const x = s.x + 40 + idx * 10, y = s.y - 14 - idx * 17;
      const fix = fixOf(c); const isOld = c.startedAt < since;
      const label = `${c.error.code}${fix ? (fix.status === 'success' ? ' · fixed' : ' · retry ✕') : ''}`;
      const w = label.length * 5.4 + 10;
      return `<g class="buoy${isOld ? ' old' : ''}" data-open="error:${c.id}" tabindex="0" role="button" aria-label="Error ${esc(c.error.code)} in ${esc(c.tool)}: ${esc(c.error.message)}" transform="translate(${f1(x)} ${f1(y)})">
        <title>${esc(c.error.code)} · ${esc(c.error.name)} · ${esc(c.tool)} (${c.id})</title>
        <ellipse cx="0" cy="8" rx="15" ry="5.5" fill="${SILT}" fill-opacity=".35"/>
        <path class="whirl" d="${SPIRAL}" transform="translate(0 8)" fill="none" stroke="${SILT}" stroke-width="1.3"/>
        <g class="bob"><path d="M-5 6 L5 6 L3 -3 L-3 -3 Z" fill="${SILT}" stroke="#ffd2c2" stroke-width=".8"/><rect x="-3" y="0" width="6" height="2" fill="#ffd2c2"/><line x1="0" y1="-3" x2="0" y2="-10" stroke="#ffd2c2"/>
          <rect x="4" y="-19" width="${f1(w)}" height="13" rx="3" fill="#2a1430" stroke="${SILT}"/>
          <text x="${f1(4 + w / 2)}" y="-9.5" text-anchor="middle" font-size="9" class="mono" style="fill:#ffc2ad;font-weight:700">${esc(label)}</text></g></g>`;
    }).join('');
    setHTML($('#buoys'), html);
  }
  function fixOf(c) { const r = S.calls.filter(k => k.retryOf === c.id); return r.length ? r[r.length - 1] : null; }
  function renderRetries() {
    const since = Math.min(lastPromptTime(), S.now - 8 * 60000);
    const list = S.calls.filter(c => c.retryOf && c.startedAt >= since);
    // one eddy per spot: the newest retry, labelled with how many retries happened there
    const bySpot = new Map();
    for (const c of list) { const s = spotOf(c); if (!s) continue; const key = `${Math.round(s.x)},${Math.round(s.y)}`; const e = bySpot.get(key) || { s, calls: [] }; e.calls.push(c); bySpot.set(key, e); }
    setHTML($('#retries'), [...bySpot.values()].map(({ s, calls }) => {
      const c = calls[calls.length - 1]; const okN = calls.filter(k => k.status === 'success').length;
      const x = s.x - 28, y = s.y - 14;
      const col = c.status === 'error' ? SILT : c.status === 'running' ? MIST : GOLD;
      // an eddy: water leaves the working, loops back upstream (left) and re-enters
      const d = `M${x + 14} ${y + 6} C ${x} ${y + 16}, ${x - 34} ${y + 10}, ${x - 30} ${y - 4} C ${x - 26} ${y - 16}, ${x - 4} ${y - 14}, ${x + 6} ${y - 6}`;
      return `<g class="retry" data-open="call:${c.id}" tabindex="0" role="button" aria-label="Retry attempt ${c.attempt} of ${esc(c.tool)}, ${c.status}">
        <title>Retry: ${esc(c.label)} attempt ${c.attempt} (${c.status}) · retry of ${c.retryOf}</title>
        <path d="${d}" stroke="${col}"/><path d="M${x + 6} ${y - 6} l-7 -3 m7 3 l-3 6" stroke="${col}" stroke-width="1.6" fill="none"/>
        <text class="lbl" x="${x - 8}" y="${y - 18}" text-anchor="middle" font-size="8.5" style="fill:${col}">↺ ${calls.length > 1 ? `${calls.length} retries · ${okN} ✓` : `retry #${c.attempt} ${c.status === 'success' ? '✓' : c.status === 'error' ? '✕' : '◌'}`}</text></g>`;
    }).join(''));
  }

  // ---------------------------------------------------------------- highlight / traced current
  function chainOf(id) {
    const root = sim.callById(id); if (!root) return [];
    const set = new Map([[root.id, root]]);
    let c = root;
    while (c && c.causedBy && !set.has(c.causedBy)) { const p = sim.callById(c.causedBy); if (!p) break; set.set(p.id, p); c = p; }
    if (root.retryOf && !set.has(root.retryOf)) { const p = sim.callById(root.retryOf); if (p) set.set(p.id, p); }
    const q = [root.id];
    while (q.length) { const cur = q.shift(); for (const k of S.calls) if ((k.causedBy === cur || k.retryOf === cur) && !set.has(k.id)) { set.set(k.id, k); q.push(k.id); } }
    return [...set.values()].sort((a, b) => a.seq - b.seq);
  }
  function highlightFor(ref) {
    if (!ref) return null;
    const [type, ...rest] = ref.split(':'); const id = rest.join(':');
    const keys = new Set(); const pick = fn => { for (const ch of channels.values()) if (fn(ch)) keys.add(ch.key); };
    if (type === 'call' || type === 'error') { const chain = chainOf(id); for (const c of chain) for (const h of c.flow) keys.add(`${c.lane}|${h.from}>${h.to}`); return { keys, chain, focus: id }; }
    if (type === 'file') pick(ch => ch.from === 'file:' + id || ch.to === 'file:' + id);
    else if (type === 'context') pick(ch => ch.to === 'context' || ch.from === 'context');
    else if (type === 'terminal') pick(ch => ch.to === 'terminal' || ch.from === 'terminal');
    else if (type === 'plan') pick(ch => ch.to === 'plan' || ch.kind === 'memory');
    else if (type === 'host') pick(ch => ch.from === id || (id === 'mcp:github' && ch.kind === 'other'));
    else if (type === 'kind') pick(ch => ch.kind === id);
    else if (type === 'lane') pick(ch => ch.scope === id || ch.from === 'lane:' + id || ch.to === 'lane:' + id);
    else if (type === 'ctxfile') pick(ch => ch.from === 'ctxfile:' + id);
    else if (type === 'user') pick(ch => ch.kind === 'prompt');
    else if (type === 'reply') pick(ch => ch.to === 'answer');
    else if (type === 'model') pick(ch => ch.from === 'model' || ch.to === 'model');
    else if (type === 'channel') keys.add(id);
    else return null;
    return { keys, chain: null };
  }
  function renderTrace(hl) {
    if (!hl || !hl.chain) { setHTML($('#traceG'), ''); return; }
    let html = ''; const badges = [];
    hl.chain.forEach((c, i) => {
      for (const h of c.flow) { const ch = channels.get(`${c.lane}|${h.from}>${h.to}`); if (ch && ch.g) html += `<path class="trace" d="${ch.g.d}" stroke-width="${c.id === hl.focus ? 3.2 : 2}" stroke-opacity="${c.id === hl.focus ? 1 : 0.7}"/>`; }
      const s = spotOf(c); if (s) badges.push({ s, i, c });
    });
    const perSpot = new Map();
    for (const { s, i, c } of badges) {
      const key = `${Math.round(s.x)},${Math.round(s.y)}`; const idx = perSpot.get(key) || 0; perSpot.set(key, idx + 1);
      const x = s.x - 26 - idx * 22, y = s.y - 20;
      const col = c.status === 'error' ? SILT : GOLD;
      html += `<g data-open="call:${c.id}" role="button" tabindex="0" aria-label="Chain step ${i + 1}: ${esc(c.tool)}"><circle cx="${x}" cy="${y}" r="8.5" fill="#1a1238" stroke="${col}" stroke-width="${c.id === hl.focus ? 2.4 : 1.3}"/><text x="${x}" y="${y + 3.2}" text-anchor="middle" font-size="9" style="fill:${col};font-weight:700">${i + 1}</text><title>${i + 1}. ${esc(c.tool)} · ${esc(c.label)} · ${c.status}</title></g>`;
    }
    setHTML($('#traceG'), html);
  }

  // ---------------------------------------------------------------- canvas water
  const fx = $('#fx'); const cx = fx.getContext('2d');
  let view = { s: 1, ox: 0, oy: 0, dpr: 1 };
  function resize() {
    const w = fx.clientWidth, h = fx.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    fx.width = Math.max(1, Math.round(w * dpr)); fx.height = Math.max(1, Math.round(h * dpr));
    const s = Math.min(w / VW, h / VH); view = { s, ox: (w - VW * s) / 2, oy: (h - VH * s) / 2, dpr };
  }
  window.addEventListener('resize', () => { resize(); renderHistory(); });
  resize();

  let anim = 0; // animation clock (ms); frozen while paused
  const surges = [], ambient = [], ripples = [];
  let surgeHits = [];
  const BASE_DUR = { files: 2100, edits: 1300, shell: 750, network: 1400, agents: 2300, memory: 1700, other: 1500, prompt: 1900, reply: 1500, ctx: 2400 };
  const AMB_SPEED = { files: 0.03, edits: 0.06, shell: 0.17, network: 0.09, agents: 0.045, memory: 0.05, other: 0.055, prompt: 0.06, reply: 0.07, ctx: 0.035 };
  function spawnSurge(ch, call, hop, delay, kindOverride) {
    if (!ch) return;
    const kind = kindOverride || ch.kind; const len = ch.g ? ch.g.len : 400;
    const durMs = BASE_DUR[kind] * Math.sqrt(len / 380) / Math.sqrt(Math.max(0.5, sim.speed));
    const v = hopVol(hop);
    surges.push({ ch, callId: call.id, kind, v, unit: hopUnit(hop), what: hop.what || '', err: call.status === 'error', req: !(hop.tokens || hop.bytes), rain: ch.style === 'rain', start: anim + delay, dur: Math.max(500, durMs), arrived: false });
    if (surges.length > 140) surges.splice(0, surges.length - 140);
  }
  function ripple(p, color, maxR = 18, rings = 1) { if (!p || reduced) return; for (let i = 0; i < rings; i++) ripples.push({ x: p.x, y: p.y, color, start: anim + i * 180, dur: 1100, maxR }); }
  function emitHops(call) {
    const from = shown.get(call.id) || 0; const hops = call.flow.slice(from); shown.set(call.id, call.flow.length);
    hops.forEach((hop, i) => { const ch = addHop(call, hop, S.now); refreshGeometry(); spawnSurge(ch, call, hop, i * 520); });
  }
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  function drawShape(kind, p, r, color, s) {
    cx.save(); cx.translate(p.x, p.y);
    if (s.err && !s.req) {
      cx.rotate(0); cx.strokeStyle = SILT; cx.lineWidth = 2.4; cx.fillStyle = rgba(SILT, 0.35);
      cx.beginPath(); cx.arc(0, 0, r + 2, 0, Math.PI * 2); cx.fill();
      cx.beginPath(); cx.moveTo(-r, -r); cx.lineTo(r, r); cx.moveTo(r, -r); cx.lineTo(-r, r); cx.stroke();
      cx.restore(); return;
    }
    cx.fillStyle = color; cx.strokeStyle = color;
    switch (kind) {
      case 'edits': cx.rotate(p.ang); cx.beginPath(); cx.moveTo(r * 1.4, 0); cx.lineTo(-r, -r); cx.lineTo(-r * 0.3, 0); cx.lineTo(-r, r); cx.closePath(); cx.fill(); break;
      case 'shell': cx.rotate(p.ang); cx.beginPath(); cx.ellipse(0, 0, r * 2.2, r * 0.7, 0, 0, Math.PI * 2); cx.fill(); cx.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 3; i++) { cx.beginPath(); cx.arc(-r * 2 - i * 4 + Math.random() * 3, (Math.random() - 0.5) * r * 2.4, 1.1, 0, 7); cx.fill(); } break;
      case 'network':
        if (s.rain) { cx.lineWidth = 1.6; cx.lineCap = 'round'; for (const dx of [-r, 0, r]) { cx.beginPath(); cx.moveTo(dx, -r * 2.2); cx.lineTo(dx - 1, r * 0.6); cx.stroke(); } }
        else { cx.beginPath(); cx.arc(0, 0, r, 0, 7); cx.fill(); }
        break;
      case 'agents': cx.rotate(p.ang); cx.beginPath(); cx.moveTo(-r * 1.4, 0); cx.lineTo(r * 1.4, 0); cx.lineTo(r, r * 0.7); cx.lineTo(-r, r * 0.7); cx.closePath(); cx.fill(); cx.beginPath(); cx.moveTo(0, -r * 1.5); cx.lineTo(0, 0); cx.lineTo(r * 0.9, -r * 0.2); cx.closePath(); cx.fillStyle = SAND; cx.fill(); break;
      case 'memory': cx.fillRect(-r, -r, r * 2, r * 2); cx.strokeStyle = 'rgba(255,255,255,.6)'; cx.lineWidth = 0.8; cx.strokeRect(-r, -r, r * 2, r * 2); break;
      case 'other': cx.rotate(Math.PI / 4); cx.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); break;
      case 'prompt': case 'reply': case 'ctx': cx.beginPath(); cx.arc(0, 0, r, 0, 7); cx.fill(); cx.lineWidth = 1; cx.beginPath(); cx.arc(0, 0, r + 3, 0, 7); cx.stroke(); break;
      default: cx.beginPath(); cx.arc(0, 0, r, 0, 7); cx.fill();
    }
    cx.restore();
  }

  function draw(dt) {
    const { s, ox, oy, dpr } = view;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, fx.width, fx.height);
    cx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    const running = sim.running;
    // ambient particles: rate follows how much is flowing right now
    if (running && !reduced) {
      for (const ch of channels.values()) {
        if (!ch.g || ch.request || ch.style === 'mist') continue;
        const r = recentNow(ch); if (r < 8) continue;
        const rate = Math.min(5, Math.sqrt(r) / 9); // per second
        if (Math.random() < rate * dt / 1000 && ambient.length < 280) ambient.push({ ch, f: 0, spd: (AMB_SPEED[ch.kind] || 0.05) / ch.g.len, size: 0.9 + Math.min(2.2, Math.sqrt(r) / 30), j: Math.random() * 6.28 });
      }
    }
    for (let i = ambient.length - 1; i >= 0; i--) {
      const a = ambient[i]; if (running) a.f += a.spd * dt;
      if (a.f >= 1 || !a.ch.g) { ambient.splice(i, 1); continue; }
      let f = a.f; if (a.ch.kind === 'memory') { const steps = 6; const k = Math.floor(f * steps); const fr = f * steps - k; f = (k + Math.min(1, fr * 2.2)) / steps; }
      const p = pointAt(a.ch.g, f); const col = COL[a.ch.kind] || SAND;
      const alpha = 0.6 * Math.sin(Math.PI * a.f);
      if (a.ch.kind === 'shell' || a.ch.style === 'rain') {
        const jit = a.ch.kind === 'shell' ? Math.sin(anim / 40 + a.j) * 1.6 : 0;
        cx.strokeStyle = rgba(col, alpha); cx.lineWidth = a.size * 0.8; cx.beginPath();
        cx.moveTo(p.x - Math.cos(p.ang) * 5, p.y - Math.sin(p.ang) * 5 + jit); cx.lineTo(p.x, p.y + jit); cx.stroke();
      } else if (a.ch.kind === 'memory') { cx.fillStyle = rgba(col, alpha); cx.fillRect(p.x - a.size, p.y - a.size, a.size * 2, a.size * 2); }
      else { cx.fillStyle = rgba(col, alpha); cx.beginPath(); cx.arc(p.x, p.y, a.size, 0, 7); cx.fill(); }
    }
    // surges: one per flow hop, sized by volume, shaped by kind
    surgeHits = [];
    for (let i = surges.length - 1; i >= 0; i--) {
      const su = surges[i]; const g = su.ch.g; if (!g) { surges.splice(i, 1); continue; }
      const t = (anim - su.start) / su.dur; if (t < 0) continue;
      const col = su.err ? SILT : su.req ? MIST : (COL[su.kind] || SAND);
      if (t >= 1) {
        if (!su.arrived) {
          su.arrived = true; const end = g.pts[g.pts.length - 1];
          if (su.ch.to === 'terminal') ripple(end, COL.shell, 20, 3);
          else if (su.err) ripple(end, SILT, 22, 2);
          else if (!su.req) ripple(end, col, 10 + Math.min(20, Math.sqrt(su.v) / 3), su.ch.to === 'context' ? 2 : 1);
        }
        if (t > 1.15 || reduced && t > 1.6) surges.splice(i, 1);
        continue;
      }
      if (reduced) { cx.strokeStyle = rgba(col.startsWith('#') ? col : SAND, 0.6 * (1 - t)); cx.lineWidth = 3; cx.beginPath(); g.pts.forEach((p, k) => k ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y)); cx.stroke(); const p = pointAt(g, 1); surgeHits.push({ x: p.x, y: p.y, callId: su.callId }); continue; }
      let f = su.kind === 'memory' ? (() => { const steps = 5; const k = Math.floor(t * steps); const fr = t * steps - k; return (k + Math.min(1, fr * 2)) / steps; })() : su.kind === 'files' ? t : 1 - Math.pow(1 - t, 1.6);
      const r = su.req ? 2.2 : 2.6 + Math.min(8, Math.sqrt(su.v) / 7);
      // trail
      for (let k = 6; k >= 1; k--) { const q = pointAt(g, f - k * 0.018); cx.fillStyle = rgba(col.startsWith('#') ? col : SAND, 0.09 * (7 - k)); cx.beginPath(); cx.arc(q.x, q.y, r * (1 - k * 0.1), 0, 7); cx.fill(); }
      const p = pointAt(g, f);
      if (su.kind === 'shell' && !su.req) { p.y += (Math.random() - 0.5) * 2.4; }
      cx.shadowColor = col; cx.shadowBlur = su.req ? 4 : 12;
      drawShape(su.req ? 'default' : su.kind, p, r, col, su);
      cx.shadowBlur = 0;
      if (!su.req && (su.v >= 300 || su.kind === 'edits')) {
        const label = su.kind === 'edits' && /^[+]/.test(su.what) ? su.what.replace(' lines', '') : su.unit;
        cx.font = '600 9.5px "Segoe UI", system-ui, sans-serif'; cx.lineWidth = 3; cx.strokeStyle = 'rgba(17,13,44,.9)'; cx.fillStyle = su.err ? '#ffb39c' : SAND;
        cx.strokeText(label, p.x + r + 4, p.y - r - 2); cx.fillText(label, p.x + r + 4, p.y - r - 2);
      }
      surgeHits.push({ x: p.x, y: p.y, callId: su.callId });
    }
    // ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i]; const t = (anim - rp.start) / rp.dur; if (t < 0) continue; if (t >= 1) { ripples.splice(i, 1); continue; }
      cx.strokeStyle = rgba(rp.color, 0.7 * (1 - t)); cx.lineWidth = 1.4; cx.beginPath(); cx.ellipse(rp.x, rp.y, rp.maxR * t + 2, (rp.maxR * t + 2) * 0.45, 0, 0, 7); cx.stroke();
    }
    // lake: level eases toward the real value (a compaction visibly drains it), surface waves
    const target = S.context.percent; if (running) dispPct += (target - dispPct) * Math.min(1, dt / 600);
    const inner = $('#strataInner');
    if (inner && target > 0) { const k = dispPct / target; inner.setAttribute('transform', `translate(0 ${LAKE.y1}) scale(1 ${f1(k * 1000) / 1000}) translate(0 ${-LAKE.y1})`); }
    const ly = lakeY(dispPct); let d = `M${LAKE.x0} ${f1(ly)}`;
    for (let x = LAKE.x0; x <= LAKE.x1; x += 10) d += ` L${x} ${f1(ly + (reduced ? 0 : Math.sin(x / 17 + anim / 700) * 1.6 + Math.sin(x / 7 - anim / 400) * 0.6))}`;
    const surf = $('#lakeSurface'); surf.setAttribute('d', d); surf.setAttribute('stroke', target >= 90 ? RED : target >= 70 ? AMBER : '#bff6f2');
    if (drainUntil > anim && !reduced) { // whirlpool at the drain
      cx.strokeStyle = rgba(GOLD, 0.6); cx.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { cx.beginPath(); for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI * 3 + anim / 300 + k * 2.1; const rr = 3 + i * 0.7; const x = 1060 + Math.cos(a) * rr, y = 330 + Math.sin(a) * rr * 0.4; i ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.stroke(); }
    }
  }

  // ---------------------------------------------------------------- sim events
  sim.on('start', call => {
    emitHops(call);
    const s = spotOf(call); if (s) ripple(s, COL[call.kind], 14);
  });
  sim.on('end', call => {
    emitHops(call);
    if (call.status === 'error') { const s = spotOf(call); if (s) ripple(s, SILT, 26, 3); }
    dirty = true;
  });
  sim.on('marker', m => {
    seedMarker(m, true); refreshGeometry();
    if (m.kind === 'compaction') { drainUntil = anim + 4500; dispPct = Math.max(dispPct, (m.detail.before / S.context.capacity) * 100); }
    dirty = true;
  });
  sim.on('lane', () => { dirty = true; });
  sim.on('tasks', () => { dirty = true; });

  // ---------------------------------------------------------------- side panel
  const TABS = [['overview', 'Overview'], ['activity', 'Activity'], ['files', 'Files'], ['lanes', 'Lanes'], ['tasks', 'Tasks']];
  let tab = 'overview';
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('');
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; for (const x of $('#tabs').children) x.setAttribute('aria-selected', String(x.dataset.tab === tab)); $('#panel').scrollTop = 0; renderPanel(); });

  const link = (ref, text) => `<a href="#" data-open="${esc(ref)}">${text}</a>`;
  const stHTML = c => c.status === 'running' ? '<span class="st running">◌ running</span>' : c.status === 'error' ? `<span class="st error">✕ ${esc(c.error.code)}</span>` : '<span class="st success">✓ ok</span>';
  const callLink = c => link('call:' + c.id, `${esc(c.tool)} <small style="color:var(--mist2)">${c.id}</small>`);
  const callRow = c => `<li><span class="t">${hhmmss(c.startedAt)}</span>${glyph(c.kind, 12)}<span class="grow">${callLink(c)} ${esc(c.target ? c.target.value : c.label)}${c.lane !== 'main' ? ` <span class="chip">${esc(c.laneLabel)}</span>` : ''}${c.attempt > 1 ? ` <span class="chip">attempt ${c.attempt}</span>` : ''}</span>${stHTML(c)}</li>`;

  function sparkline(w, h, from) {
    const pts = S.context.samples.filter(s => s.time >= from); if (pts.length < 2) return '';
    const t0 = from, t1 = S.now; const X = t => (t - t0) / (t1 - t0) * w, Y = p => h - p / 100 * h;
    const d = pts.map((s, i) => `${i ? 'L' : 'M'}${f1(X(s.time))} ${f1(Y(s.percent))}`).join(' ');
    const comps = S.markers.filter(m => m.kind === 'compaction' && m.time >= from).map(m => `<line x1="${f1(X(m.time))}" x2="${f1(X(m.time))}" y1="0" y2="${h}" stroke="${MIST}" stroke-dasharray="2 2"/>`).join('');
    return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Context level history"><line x1="0" x2="${w}" y1="${Y(70)}" y2="${Y(70)}" stroke="${AMBER}" stroke-dasharray="3 3" stroke-opacity=".7"/><line x1="0" x2="${w}" y1="${Y(90)}" y2="${Y(90)}" stroke="${RED}" stroke-dasharray="3 3" stroke-opacity=".7"/>${comps}<path d="${d} L${w} ${h} L0 ${h} Z" fill="#5fd8d2" fill-opacity=".15"/><path d="${d}" fill="none" stroke="#5fd8d2" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }
  function ctxBar() { const p = S.context.percent; const cls = p >= 90 ? 'red' : p >= 70 ? 'amber' : ''; return `<div class="bar ${cls}"><i style="width:${p}%"></i><span class="tick" style="left:70%"></span><span class="tick" style="left:90%"></span></div>`; }
  function overviewHTML() {
    const esp = sim.errorsSincePrompt(); const running = sim.runningCalls(); const active = running.filter(c => c.lane === 'main').map(c => c.kind);
    const p = S.context.percent; const word = p >= 90 ? '<span style="color:var(--red)">▲▲ RED</span>' : p >= 70 ? '<span style="color:var(--amber)">▲ AMBER</span>' : '<span class="note">calm</span>';
    const total = S.calls.length;
    return `<h3>Context lake</h3>
      <div style="display:flex;align-items:baseline;gap:10px"><span class="big" style="color:${p >= 90 ? RED : p >= 70 ? AMBER : SAND}">${p.toFixed(1)}%</span>${word}<span class="note">${fmtK(S.context.used)} / ${fmtK(S.context.capacity)} · ${S.context.compactions} compaction${S.context.compactions === 1 ? '' : 's'} · ${link('context', 'open lake')}</span></div>
      ${ctxBar()}${sparkline(360, 40, S.now - 30 * 60000)}
      <div class="note">Context files: ${S.context.files.map(f => link('ctxfile:' + f.path, esc(f.path)) + ` (${fmtK(f.tokens)})`).join(', ') || 'none yet'}</div>
      <h3>Workings · calls by kind</h3>
      ${KINDS.map(k => `<div class="krow${active.includes(k) ? ' active' : ''}" data-open="kind:${k}" tabindex="0" role="button">${glyph(k)}<span>${KM[k].name} <span class="feat-name">· ${KM[k].feature}</span>${active.includes(k) ? ' <span class="flowing">● flowing now</span>' : ''}</span><span class="cnt">${S.counts[k]}</span><span class="err" title="Errors since the last prompt">${esp[k] ? '⚠ ' + esp[k] : ''}</span></div>`).join('')}
      <div class="kv" style="margin-top:8px"><span>Total calls</span><span><b>${total}</b></span><span>Tool errors</span><span><b style="color:#ff8a66">${S.errors.length}</b> total · ${Object.values(esp).reduce((a, b) => a + b, 0)} since last prompt</span>
      <span>Active now</span><span>${active.length ? active.map(k => KM[k].name).join(', ') : running.length ? 'subagents only' : 'still water (idle)'}</span>
      <span>Running</span><span>${running.map(c => callLink(c)).join(', ') || '—'}</span>
      <span>Tokens</span><span>in ${fmtK(S.tokens.input)} · out ${fmtK(S.tokens.output)} · cache ${fmtK(S.tokens.cacheRead)}</span></div>
      <h3>How to read the map</h3>
      <p class="note">Springs on the left are sources, workings in the middle process data, basins on the right hold what ended up there. Stream width = tokens or bytes moving right now (sand banks show the total ever moved). Each flow hop sends one surge down its exact path. Red-ochre silt, whirlpools and buoys mark errors; gold loops are retries. Click anything.</p>`;
  }
  function activityHTML() {
    const events = S.calls.slice(-160).map(c => ({ t: c.startedAt, c })).concat(S.markers.slice(-40).map(m => ({ t: m.time, m }))).sort((a, b) => b.t - a.t);
    const out = [];
    for (const e of events) {
      const sig = e.c ? `${e.c.lane}|${e.c.tool}|${e.c.label}|${e.c.status}|${e.c.error ? e.c.error.code : ''}` : `m|${e.m.kind}|${e.m.label}`;
      const last = out[out.length - 1];
      if (last && last.sig === sig) { last.n++; continue; }
      out.push({ sig, e, n: 1 }); if (out.length >= 60) break;
    }
    return `<h3>Recent activity · similar steps folded</h3><ul class="list">${out.map(({ e, n }) => {
      if (e.m) { const ref = e.m.kind === 'prompt' ? 'user' : e.m.kind === 'compaction' ? 'context' : e.m.kind === 'turn-complete' ? 'reply' : 'ctxfile:' + (e.m.detail.path || ''); return `<li><span class="t">${hhmmss(e.t)}</span><span class="grow" style="color:var(--gold)">${link(ref, esc(e.m.label))}</span>${n > 1 ? `<span class="fold">×${n}</span>` : ''}</li>`; }
      const c = e.c;
      return `<li><span class="t">${hhmmss(e.t)}</span>${glyph(c.kind, 12)}<span class="grow">${callLink(c)} ${esc(c.label)}${c.lane !== 'main' ? ` <span class="chip">${esc(c.laneLabel)}</span>` : ''}</span>${n > 1 ? `<span class="fold">×${n}</span>` : ''}${stHTML(c)}</li>`;
    }).join('')}</ul>`;
  }
  function filesHTML() {
    const rows = Object.values(S.files).sort((a, b) => b.lastTouched - a.lastTouched);
    return `<h3>File footprint</h3><table><thead><tr><th>File</th><th class="n">Reads</th><th class="n">Edits</th><th class="n">Failed</th><th class="n">+/−</th></tr></thead><tbody>${rows.map(f => `<tr><td>${link('file:' + f.path, esc(f.path))}${f.edits >= 3 ? ' <span class="hot">HOT</span>' : ''}</td><td class="n">${f.reads}</td><td class="n">${f.edits}</td><td class="n" style="color:${f.failed ? '#ff8a66' : 'inherit'}">${f.failed ? '✕' + f.failed : 0}</td><td class="n"><span style="color:var(--edits)">+${f.added}</span> <span style="color:#ff9b85">−${f.removed}</span></td></tr>`).join('')}</tbody></table>
      <p class="note">HOT = edited 3 or more times. Reads come from the disk wells (left); edits fill the reservoirs (right).</p>`;
  }
  function laneTree() { const out = []; const walk = (parent, depth) => { for (const l of S.lanes.filter(x => (x.parent || null) === parent)) { out.push(l); walk(l.key, depth + 1); } }; walk(null, 0); return out; }
  function laneCard(l, full) {
    return `<div class="lane-card ${l.state}" style="margin-left:${l.depth * 14}px"><div style="display:flex;justify-content:space-between;gap:8px">${link('lane:' + l.key, `${l.depth ? '↳ ' : ''}<b>${esc(l.label)}</b>`)}<span class="st ${l.state}">${l.state === 'failed' ? '✕ failed' : l.state === 'running' ? '◌ running' : '✓ completed'}</span></div>
      <div class="kv" style="margin-top:4px"><span>Role / depth</span><span>${l.role} · depth ${l.depth}${l.parent ? ` · parent ${link('lane:' + l.parent, esc((sim.laneByKey(l.parent) || {}).label || l.parent))}` : ''}</span><span>Agent / model</span><span>${esc(l.agentType)} · ${esc(l.model)}</span><span>Started</span><span>${hhmmss(l.startedAt)}</span><span>Ended</span><span>${l.endedAt ? hhmmss(l.endedAt) + ' (' + dur(l.endedAt - l.startedAt) + ')' : '—'}</span><span>Calls / errors</span><span>${l.calls} / <span style="color:${l.errors ? '#ff8a66' : 'inherit'}">${l.errors}</span></span><span>Tokens</span><span>${fmtK(l.tokens)}</span>
      ${l.task ? `<span>Task</span><span>${esc(l.task)}</span>` : ''}${full || l.result ? `<span>Result</span><span>${esc(l.result || '—')}</span>` : ''}</div></div>`;
  }
  function lanesHTML() { return `<h3>Agent lanes · main and every valley</h3>${laneTree().map(l => laneCard(l, false)).join('')}`; }
  function tasksHTML() {
    const items = S.tasks.items; const done = items.filter(i => i.status === 'completed').length; const prog = items.filter(i => i.status === 'in_progress').length;
    return `<h3>Task terraces</h3><div class="kv"><span>Completed</span><span><b>${done}</b> of ${items.length}</span><span>In progress</span><span>${prog}</span><span>Not started</span><span>${items.length - done - prog}</span><span>Updated</span><span>${S.tasks.updatedAt ? hhmmss(S.tasks.updatedAt) : '—'}</span></div>
      ${items.map(it => `<div class="lane-card"><div style="display:flex;justify-content:space-between"><b>${esc(it.id)}. ${esc(it.label)}</b><span class="st ${it.status}">${it.status.replace('_', ' ')}</span></div><div style="margin-top:4px">${it.history.map(h => `<span class="chip">${hhmmss(h.time)} ${esc(h.status.replace('_', ' '))} · ${link('call:' + h.callId, h.callId)}</span>`).join('')}</div></div>`).join('') || '<p class="note">No plan yet.</p>'}`;
  }
  function renderPanel() {
    const html = tab === 'overview' ? overviewHTML() : tab === 'activity' ? activityHTML() : tab === 'files' ? filesHTML() : tab === 'lanes' ? lanesHTML() : tasksHTML();
    setHTML($('#panel'), html);
  }

  // ---------------------------------------------------------------- drawer (drill-down)
  let current = null; const stack = [];
  let inspectT = null;
  function openRef(ref, push = true) {
    if (!ref) return;
    if (ref.startsWith('moment:')) inspectT = Number(ref.slice(7));
    if (current && push && current !== ref) stack.push(current);
    current = ref;
    const dr = $('#drawer'); dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false');
    $('#dbody').scrollTop = 0; $('#dbody')._html = null;
    renderDrawer(); updateDynamic(true); renderHistory(); updateMode();
  }
  function closeDrawer() { current = null; stack.length = 0; inspectT = null; const dr = $('#drawer'); dr.classList.remove('open'); dr.setAttribute('aria-hidden', 'true'); updateDynamic(true); renderHistory(); updateMode(); }
  $('#dclose').addEventListener('click', closeDrawer);
  $('#dback').addEventListener('click', () => { const prev = stack.pop(); if (prev) { current = null; openRef(prev, false); } else closeDrawer(); });

  function kvRows(rows) { return `<div class="kv">${rows.filter(Boolean).map(([k, v]) => `<span>${esc(k)}</span><span>${v}</span>`).join('')}</div>`; }
  function nodeRef(id) {
    if (id.startsWith('file:')) return 'file:' + id.slice(5);
    if (id === 'context') return 'context'; if (id === 'terminal') return 'terminal'; if (id === 'plan') return 'plan';
    if (id.startsWith('web:') || id.startsWith('mcp:')) return 'host:' + id; if (id.startsWith('tool:')) return 'kind:' + id.slice(5);
    if (id.startsWith('lane:')) return 'lane:' + id.slice(5); if (id.startsWith('ctxfile:')) return 'ctxfile:' + id.slice(8);
    if (id === 'user') return 'user'; if (id === 'model') return 'model'; if (id === 'answer') return 'reply'; return null;
  }
  const nodeLink = id => { const r = nodeRef(id); return r ? link(r, esc(nodeLabel(id))) : esc(nodeLabel(id)); };
  const refLink = r => r.type === 'file' ? link('file:' + r.value, esc(r.value)) : r.type === 'lane' ? link('lane:' + r.value, esc((sim.laneByKey(r.value) || {}).label || r.value)) : r.type === 'url' ? `${esc(r.title || '')} <code>${esc(r.value)}</code>` : r.type === 'task' ? link('plan', 'task ' + esc(r.value)) : esc(r.value);
  function targetLink(c) {
    if (!c.target) return '—';
    const t = c.target;
    if (t.type === 'file') return `file · ${link('file:' + (c.refs.find(r => r.type === 'file') || t).value, esc(t.value))}`;
    if (t.type === 'command') return `command · ${link('terminal', '<code>' + esc(t.value) + '</code>')}`;
    if (t.type === 'url') { const h = callHost(c); return `url · ${h ? link('host:' + h, esc(t.value)) : esc(t.value)}`; }
    if (t.type === 'agent') { const lr = c.refs.find(r => r.type === 'lane'); return `agent · ${lr ? link('lane:' + lr.value, esc(t.value)) : esc(t.value)}`; }
    if (t.type === 'plan') return `plan · ${link('plan', esc(t.value))}`;
    return `${esc(t.type)} · <code>${esc(t.value)}</code>`;
  }
  function diffHTML(diff) {
    if (!diff) return '';
    return `<h3>Diff · <span style="color:var(--edits)">+${diff.added}</span> <span style="color:#ff9b85">−${diff.removed}</span></h3>${diff.hunks.map(h => `<pre><span class="hunk">@@ line ${h.at} @@</span>\n${h.lines.map(l => `<span class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}">${esc(l)}</span>`).join('\n')}</pre>`).join('')}`;
  }
  function nextAfterError(c) {
    const retries = S.calls.filter(k => k.retryOf === c.id); const caused = S.calls.filter(k => k.causedBy === c.id && k.retryOf !== c.id);
    const fixed = retries.find(k => k.status === 'success');
    const verdict = fixed ? `<b style="color:var(--teal)">Fixed</b> by ${callLink(fixed)} (attempt ${fixed.attempt})` : retries.length ? (retries.some(k => k.status === 'running') ? '<b style="color:var(--gold)">Retry running</b>' : '<b style="color:#ff8a66">Retried, still failing</b>') : caused.length ? 'Followed up (no direct retry)' : 'No retry yet';
    return `<h3>What happened next</h3><p>${verdict}</p>${retries.length ? `<div class="note">Retries:</div><ul class="list">${retries.map(callRow).join('')}</ul>` : ''}${caused.length ? `<div class="note">Calls caused by this error:</div><ul class="list">${caused.map(callRow).join('')}</ul>` : ''}`;
  }
  function callDetail(c) {
    const caused = S.calls.filter(k => k.causedBy === c.id); const retries = S.calls.filter(k => k.retryOf === c.id);
    const parent = c.causedBy ? sim.callById(c.causedBy) : null; const retryOf = c.retryOf ? sim.callById(c.retryOf) : null;
    const o = c.output || {};
    const ancestors = []; let a = parent; while (a && ancestors.length < 8) { ancestors.push(a); a = a.causedBy ? sim.callById(a.causedBy) : null; }
    return `<h2>${glyph(c.kind, 18)} ${esc(c.tool)} <small>${c.id}</small></h2><p class="sub">${esc(c.label)} · ${stHTML(c)}</p>
      ${kvRows([['Kind', `${link('kind:' + c.kind, KM[c.kind].name)} · ${KM[c.kind].feature}`], ['Lane', link('lane:' + c.lane, esc(c.laneLabel)) + (c.depth ? ` · depth ${c.depth}` : '')], ['Target', targetLink(c)], ['Started', hhmmss(c.startedAt)], ['Duration', c.endedAt ? dur(c.endedAt - c.startedAt) : `${dur(S.now - c.startedAt)} so far (planned ${dur(c.duration)})`], ['Status', stHTML(c)], ['Attempt', `${c.attempt}${retryOf ? ` · retry of ${callLink(retryOf)}` : ''}`], ['Tokens', `in ${fmtK(c.tokens.in)} · out ${fmtK(c.tokens.out)}`], ['Context after', c.contextAfter ? `${c.contextAfter.percent}% (${fmtK(c.contextAfter.used)} tokens)` : '—']])}
      ${c.error ? `<div class="errbox"><b class="code">${esc(c.error.code)}</b> · ${esc(c.error.name)}<div>${esc(c.error.message)}</div><div class="note">Hint: ${esc(c.error.hint)}</div><div style="margin-top:4px">${link('error:' + c.id, 'Open error detail ▸')}</div></div>` : ''}
      <h3>Input arguments</h3><pre>${esc(Object.entries(c.input).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n') || '(none)')}</pre>
      <h3>Output</h3>${c.output ? kvRows([['Summary', esc(o.summary || '—')], o.exitCode !== undefined ? ['Exit code', `<code>${o.exitCode === null ? 'none' : o.exitCode}</code>`] : null, o.status ? ['HTTP status', String(o.status)] : null, o.lines != null ? ['Lines', String(o.lines)] : null, o.bytes != null ? ['Bytes', fmtK(o.bytes)] : null, o.tests ? ['Tests', `<span style="color:var(--teal)">${o.tests.passed} passed</span> · <span style="color:${o.tests.failed ? '#ff8a66' : 'inherit'}">${o.tests.failed} failed</span> · ${o.tests.skipped} skipped${o.tests.failures.length ? '<br>Failing: ' + o.tests.failures.map(n => `<code>${esc(n)}</code>`).join(', ') : ''}`] : null]) + (o.preview ? `<pre>${esc(o.preview.join('\n'))}</pre>` : '') : '<p class="note">Still running: no output yet.</p>'}
      ${diffHTML(c.diff)}
      <h3>Flow hops · where the water went</h3><ul class="list">${c.flow.map((h, i) => `<li><span class="t">${i + 1}</span><span class="grow">${nodeLink(h.from)} → ${nodeLink(h.to)} · ${esc(h.what || '')}</span><span class="t">${link('channel:' + c.lane + '|' + h.from + '>' + h.to, hopUnit(h))}</span></li>`).join('')}</ul>
      <h3>References</h3>${c.refs.length ? `<ul class="list">${c.refs.map(r => `<li><span class="chip">${esc(r.role || '')}</span><span class="grow">${esc(r.type)} · ${refLink(r)}</span></li>`).join('')}</ul>` : '<p class="note">None.</p>'}
      <h3>Cause chain · traced in gold on the map</h3>
      ${ancestors.length ? `<div class="note">Caused by (nearest first):</div><ul class="list">${ancestors.map(callRow).join('')}</ul>` : '<p class="note">Not caused by an earlier call.</p>'}
      ${caused.length ? `<div class="note">This call caused:</div><ul class="list">${caused.map(callRow).join('')}</ul>` : '<p class="note">Has not caused later calls.</p>'}
      ${retries.length ? `<div class="note">Retries of this call:</div><ul class="list">${retries.map(callRow).join('')}</ul>` : ''}`;
  }
  function errorDetail(c) {
    return `<h2 style="color:#ffb39c">⚠ ${esc(c.error.code)}</h2><p class="sub">${esc(c.error.name)}</p>
      <div class="errbox"><div>${esc(c.error.message)}</div><div class="note" style="margin-top:4px">Hint: ${esc(c.error.hint)}</div></div>
      ${kvRows([['Call', `${callLink(c)} · ${esc(c.label)}`], ['Kind', `${link('kind:' + c.kind, KM[c.kind].name)} · ${KM[c.kind].feature}`], ['Lane', link('lane:' + c.lane, esc(c.laneLabel))], ['Target', targetLink(c)], ['When', `${hhmmss(c.startedAt)} → ${c.endedAt ? hhmmss(c.endedAt) : '…'}`], ['Attempt', String(c.attempt)], c.causedBy ? ['Caused by', callLink(sim.callById(c.causedBy))] : null, c.output && c.output.exitCode != null ? ['Exit code', String(c.output.exitCode)] : null])}
      ${c.output && c.output.tests && c.output.tests.failed ? `<h3>Failing tests</h3><pre>${esc(c.output.tests.failures.join('\n'))}</pre>` : ''}
      ${c.output && c.output.preview ? `<h3>Output</h3><pre>${esc(c.output.preview.join('\n'))}</pre>` : ''}
      ${nextAfterError(c)}`;
  }
  function fileDetail(path) {
    const f = fileStats(path); const calls = sim.callsForFile(path); const fb = failedByKind(path);
    return `<h2>${glyph('edits', 18)} ${esc(baseName(path))}</h2><p class="sub"><code>${esc(path)}</code> · well (reads) and reservoir (edits)</p>
      ${kvRows([['Reads', String(f.reads)], ['Edits', `${f.edits}${f.edits >= 3 ? ' · <span class="hot">HOT</span>' : ''}`], ['Failed calls', `<span style="color:${f.failed ? '#ff8a66' : 'inherit'}">${f.failed}</span> (reads ${fb.files}, edits ${fb.edits})`], ['Lines', `<span style="color:var(--edits)">+${f.added}</span> <span style="color:#ff9b85">−${f.removed}</span> · now ~${f.lines || (sim.node('file:' + path) || {}).lines || '?'} lines`], ['Last touched', f.lastTouched ? hhmmss(f.lastTouched) : 'never']])}
      <h3>Every call that touched it · in order</h3>${calls.length ? calls.map(c => `<div class="lane-card${c.status === 'error' ? ' failed' : ''}"><div style="display:flex;justify-content:space-between;gap:6px"><span>${glyph(c.kind, 12)} <span class="t" style="color:var(--mist2);font:11px var(--mono)">${hhmmss(c.startedAt)}</span> ${callLink(c)}</span>${stHTML(c)}</div><div class="note">${esc(c.output ? c.output.summary : c.label)}${c.lane !== 'main' ? ` · ${esc(c.laneLabel)}` : ''}</div>${c.error ? `<div class="note" style="color:#ffb39c">${esc(c.error.message)}</div>` : ''}${c.diff ? `<pre>${c.diff.hunks.map(h => `<span class="hunk">@@ ${h.at} @@</span>\n` + h.lines.map(l => `<span class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}">${esc(l)}</span>`).join('\n')).join('\n')}</pre>` : ''}</div>`).join('') : '<p class="note">Never touched in this session.</p>'}`;
  }
  function contextDetail() {
    const strata = lakeStrata(); const comps = S.markers.filter(m => m.kind === 'compaction');
    const comp = comps[comps.length - 1]; const since = comp ? comp.time : 0;
    const top = S.calls.filter(c => c.lane === 'main' && c.endedAt && c.endedAt >= since).sort((a, b) => (b.tokens.in + b.tokens.out) - (a.tokens.in + a.tokens.out)).slice(0, 10);
    return `<h2>Context lake</h2><p class="sub">The model's context window. Water level = percent used.</p>
      <div style="display:flex;align-items:baseline;gap:10px"><span class="big">${S.context.percent.toFixed(1)}%</span><span class="note">${fmtK(S.context.used)} of ${fmtK(S.context.capacity)} tokens · amber at 70%, red at 90%</span></div>${ctxBar()}
      <h3>Level over the last 30 minutes</h3>${sparkline(360, 70, S.now - 30 * 60000)}
      <h3>What fills it now · strata since last compaction</h3><table><tbody>${strata.slice().reverse().map(s => `<tr><td><span class="chip" style="background:${s.color};color:#111;border:none">&nbsp;</span> ${esc(s.label)}</td><td class="n">${fmtK(s.tokens)}</td><td class="n">${(s.tokens / S.context.capacity * 100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>
      <h3>Biggest contributors</h3><ul class="list">${top.map(c => `<li>${glyph(c.kind, 12)}<span class="grow">${callLink(c)} ${esc(c.target ? c.target.value : c.label)}</span><span class="t">${fmtK(c.tokens.in + c.tokens.out)} tok</span></li>`).join('') || '<li class="note">Nothing yet</li>'}</ul>
      <h3>Compactions (lake drained) · ${comps.length}</h3><ul class="list">${comps.map(m => `<li><span class="t">${hhmmss(m.time)}</span><span class="grow">${esc(m.label)}</span></li>`).join('') || '<li class="note">None yet</li>'}</ul>
      <h3>Context files (glacier melt)</h3><ul class="list">${S.context.files.map(f => `<li><span class="t">${hhmmss(f.loadedAt)}</span><span class="grow">${link('ctxfile:' + f.path, esc(f.path))} · ${esc(f.why)}</span><span class="t">${fmtK(f.tokens)}</span></li>`).join('') || '<li class="note">None loaded</li>'}</ul>`;
  }
  function terminalDetail() {
    const shells = S.calls.filter(c => c.kind === 'shell').slice().reverse();
    return `<h2>${glyph('shell', 18)} Terminal pool</h2><p class="sub">Every command that went over the waterfall, newest first.</p>
      ${shells.map(c => { const o = c.output || {}; return `<div class="lane-card${c.status === 'error' ? ' failed' : ''}"><div style="display:flex;justify-content:space-between;gap:6px"><code>$ ${esc(c.target.value)}</code>${stHTML(c)}</div><div class="note">${hhmmss(c.startedAt)} · ${callLink(c)} · ${esc(c.laneLabel)} · ${c.endedAt ? dur(c.endedAt - c.startedAt) : 'running'} · exit ${o.exitCode != null ? o.exitCode : c.status === 'running' ? '…' : 'none'}${c.attempt > 1 ? ` · attempt ${c.attempt}` : ''}</div>${o.tests ? `<div class="note">tests: ${o.tests.passed} passed · ${o.tests.failed} failed${o.tests.failures.length ? ' (' + o.tests.failures.map(esc).join(', ') + ')' : ''}</div>` : ''}${c.error ? `<div class="note" style="color:#ffb39c">${esc(c.error.message)}</div>` : ''}</div>`; }).join('') || '<p class="note">No commands yet.</p>'}`;
  }
  function planDetail() { const mem = S.calls.filter(c => c.kind === 'memory').slice(-15).reverse(); return `<h2>${glyph('memory', 18)} Task terraces</h2><p class="sub">The agent's own task list (${esc(S.tasks.source)}).</p>${tasksHTML()}<h3>Sluice gate calls</h3><ul class="list">${mem.map(callRow).join('')}</ul>`; }
  function hostDetail(id) {
    const calls = S.calls.filter(c => callHost(c) === id).reverse();
    const searches = id !== 'mcp:github' ? S.calls.filter(c => c.tool === 'WebSearch').slice(-5).reverse() : [];
    return `<h2>${glyph(id === 'mcp:github' ? 'other' : 'network', 18)} ${esc(id === 'mcp:github' ? 'MCP github' : nodeLabel(id))}</h2><p class="sub">${id === 'mcp:github' ? 'MCP server · rains into the side canal' : 'Web host · a rain cloud over the catch basin'}</p>
      ${kvRows([['Fetches', String(calls.length)], ['Failed', String(calls.filter(c => c.status === 'error').length)]])}
      <h3>Fetches and status</h3><ul class="list">${calls.map(c => `<li><span class="t">${hhmmss(c.startedAt)}</span><span class="grow">${callLink(c)} ${esc(c.target ? c.target.value : '')}</span>${c.status === 'success' ? `<span class="st success">${(c.output && c.output.status) || 'ok'}</span>` : stHTML(c)}</li>`).join('') || '<li class="note">No fetches from this host yet.</li>'}</ul>
      ${searches.length ? `<h3>Web searches (no single host)</h3><ul class="list">${searches.map(callRow).join('')}</ul>` : ''}`;
  }
  function laneDetail(key) {
    const l = sim.laneByKey(key); if (!l) return '<p>Unknown lane.</p>';
    const calls = S.calls.filter(c => c.lane === key).slice().reverse(); const kids = S.lanes.filter(x => x.parent === key);
    const spawn = S.calls.find(c => c.kind === 'agents' && c.refs.some(r => r.type === 'lane' && r.value === key && r.role === 'spawned'));
    return `<h2>${glyph('agents', 18)} ${esc(l.label)}</h2><p class="sub">${l.depth ? 'Subagent valley' : 'Main river'} · ${esc(l.agentType)}</p>${laneCard(l, true)}
      ${l.task ? `<h3>Brief</h3><pre>${esc(l.task)}</pre>` : ''}${l.depth ? `<h3>Final result</h3><pre>${esc(l.result || '(still running)')}</pre>` : ''}
      ${spawn ? `<p class="note">Spawned by ${callLink(spawn)} at ${hhmmss(spawn.startedAt)}</p>` : ''}
      ${kids.length ? `<h3>Nested valleys</h3>${kids.map(k => laneCard(k, false)).join('')}` : ''}
      <h3>Calls in this lane · ${calls.length}</h3><ul class="list">${calls.slice(0, 60).map(callRow).join('')}</ul>`;
  }
  function kindDetail(k) {
    const calls = S.calls.filter(c => c.kind === k).slice().reverse(); const esp = sim.errorsSincePrompt()[k] || 0; const errs = S.errors.filter(c => c.kind === k).slice().reverse();
    return `<h2>${glyph(k, 18)} ${KM[k].name} · ${KM[k].feature}</h2><p class="sub">${esc(KM[k].tools)}</p><p class="note">${esc(KM[k].desc)}</p>
      ${kvRows([['Calls', String(S.counts[k])], ['Errors since prompt', `<span style="color:${esp ? '#ff8a66' : 'inherit'}">${esp}</span>`], ['Errors total', String(errs.length)], ['Running', String(calls.filter(c => c.status === 'running').length)]])}
      ${errs.length ? `<h3>Errors</h3><ul class="list">${errs.slice(0, 10).map(c => `<li><span class="t">${hhmmss(c.startedAt)}</span><span class="grow">${link('error:' + c.id, '<b>' + esc(c.error.code) + '</b>')} ${esc(c.error.message)}</span></li>`).join('')}</ul>` : ''}
      <h3>Calls · newest first</h3><ul class="list">${calls.slice(0, 50).map(callRow).join('')}</ul>`;
  }
  function ctxfileDetail(path) {
    const node = sim.node('ctxfile:' + path) || {}; const loaded = S.context.files.find(f => f.path === path);
    return `<h2>${glyph('memory', 18)} ${esc(path)}</h2><p class="sub">Context file · glacier</p>${kvRows([['State', loaded ? 'melted into the lake (loaded)' : 'frozen (not loaded yet)'], ['Tokens', fmtK(node.tokens || 0)], ['Why', esc(loaded ? loaded.why : '—')], ['Loaded at', loaded ? hhmmss(loaded.loadedAt) : '—']])}<p>${link('context', 'Open the context lake ▸')}</p>`;
  }
  function userDetail() { const ps = S.markers.filter(m => m.kind === 'prompt').slice().reverse(); return `<h2>User prompt spring</h2><p class="sub">Turn ${S.session.turn}</p><ul class="list">${ps.map(m => `<li><span class="t">${hhmmss(m.time)}</span><span class="grow">${esc(m.detail.text)}</span><span class="t">${m.detail.tokens} tok</span></li>`).join('')}</ul>`; }
  function replyDetail() { const ts = S.markers.filter(m => m.kind === 'turn-complete').slice().reverse(); return `<h2>Reply outflow</h2><p class="sub">Each completed turn sends a reply out of the lake.</p><ul class="list">${ts.map(m => `<li><span class="t">${hhmmss(m.time)}</span><span class="grow">${esc(m.label)} · turn ${m.detail.turn}</span></li>`).join('') || '<li class="note">No turns completed yet.</li>'}</ul>`; }
  function modelDetail() { const ss = S.session; const running = sim.runningCalls(); return `<h2>Model confluence</h2><p class="sub">Where the prompt and every request start.</p>${kvRows([['Project', esc(ss.project)], ['Session', esc(ss.name)], ['Id', `<code>${esc(ss.id)}</code>`], ['Provider / model', `${esc(ss.provider)} · ${esc(ss.model)}`], ['Branch', esc(ss.branch)], ['Directory', `<code>${esc(ss.cwd)}</code>`], ['Started', hhmmss(ss.startedAt)], ['Turn', String(ss.turn)], ['Tokens', `in ${fmtK(S.tokens.input)} · out ${fmtK(S.tokens.output)} · cache read ${fmtK(S.tokens.cacheRead)}`]])}<h3>Running now</h3><ul class="list">${running.map(callRow).join('') || '<li class="note">Nothing running.</li>'}</ul>`; }
  function channelDetail(key) {
    const ch = channels.get(key); if (!ch) return '<p>Unknown stream.</p>';
    const calls = ch.hops.slice().reverse().slice(0, 40);
    return `<h2>${glyph(KM[ch.kind] ? ch.kind : 'files', 18)} Stream</h2><p class="sub">${nodeLink(ch.from)} → ${nodeLink(ch.to)}</p>
      ${kvRows([['Kind', KM[ch.kind] ? `${link('kind:' + ch.kind, KM[ch.kind].name)} · ${KM[ch.kind].feature}` : esc(ch.kind)], ['Lane', ch.scope === 'main' ? 'main' : link('lane:' + ch.scope, esc((sim.laneByKey(ch.scope) || {}).label || ch.scope))], ['Flowing now', `${fmtK(recentNow(ch))} (decays over ~30 s)`], ['Total moved', fmtK(ch.total) + ' tokens-equivalent'], ['Hops', String(ch.hops.length)]])}
      <h3>Hops down this stream · newest first</h3><ul class="list">${calls.map(h => { const c = h.callId ? sim.callById(h.callId) : null; return `<li><span class="t">${hhmmss(h.t)}</span><span class="grow">${c ? callLink(c) : 'marker'} · ${esc(h.what)}</span><span class="t" style="color:${h.err ? '#ff8a66' : 'inherit'}">${esc(h.unit)}${h.err ? ' ✕' : ''}</span></li>`; }).join('')}</ul>`;
  }
  function momentDetail(t) {
    const w = 30000; const calls = S.calls.filter(c => c.startedAt <= t + w && (c.endedAt || S.now) >= t - w);
    const sample = S.context.samples.reduce((best, s) => s.time <= t ? s : best, S.context.samples[0]);
    const marks = S.markers.filter(m => Math.abs(m.time - t) <= w);
    const vol = {}; for (const c of calls) for (const h of c.flow) vol[c.kind] = (vol[c.kind] || 0) + hopVol(h);
    return `<h2>Moment ${hhmmss(t)}</h2><p class="sub">Inspecting ±30 s · ${Math.round((S.now - t) / 60000)} min ago · the map keeps flowing live</p>
      <p><button type="button" data-live="1">Return to live</button></p>
      ${kvRows([['Context then', sample ? `${sample.percent}% (${fmtK(sample.used)} tokens)` : '—'], ['Calls', String(calls.length)], ['Errors', String(calls.filter(c => c.status === 'error').length)]])}
      <h3>Flow volume by kind</h3><div>${KINDS.filter(k => vol[k]).map(k => `<span class="chip">${glyph(k, 10)} ${KM[k].name} ${fmtK(vol[k])}</span>`).join('') || '<span class="note">Still water.</span>'}</div>
      ${marks.length ? `<h3>Markers</h3><ul class="list">${marks.map(m => `<li><span class="t">${hhmmss(m.time)}</span><span class="grow">${esc(m.label)}</span></li>`).join('')}</ul>` : ''}
      <h3>Calls in this moment</h3><ul class="list">${calls.slice().reverse().map(callRow).join('') || '<li class="note">None</li>'}</ul>`;
  }
  function detailHTML(ref) {
    const i = ref.indexOf(':'); const type = i < 0 ? ref : ref.slice(0, i); const id = i < 0 ? '' : ref.slice(i + 1);
    switch (type) {
      case 'call': { const c = sim.callById(id); return c ? callDetail(c) : '<p>Unknown call.</p>'; }
      case 'error': { const c = sim.callById(id); return c && c.error ? errorDetail(c) : c ? callDetail(c) : '<p>Unknown error.</p>'; }
      case 'file': return fileDetail(id);
      case 'context': return contextDetail();
      case 'terminal': return terminalDetail();
      case 'plan': return planDetail();
      case 'host': return hostDetail(id);
      case 'lane': return laneDetail(id);
      case 'kind': return kindDetail(id);
      case 'ctxfile': return ctxfileDetail(id);
      case 'user': return userDetail();
      case 'reply': return replyDetail();
      case 'model': return modelDetail();
      case 'channel': return channelDetail(id);
      case 'moment': return momentDetail(Number(id));
      default: return '<p>Nothing here.</p>';
    }
  }
  const CRUMB = { call: 'Call', error: 'Error', file: 'File', context: 'Context lake', terminal: 'Terminal pool', plan: 'Task terraces', host: 'Source cloud', lane: 'Agent lane', kind: 'Working', ctxfile: 'Context file', user: 'Spring', reply: 'Outflow', model: 'Model', channel: 'Stream', moment: 'Inspecting a moment' };
  function renderDrawer() {
    if (!current) return;
    const type = current.split(':')[0];
    $('#dcrumb').textContent = `${CRUMB[type] || type} · drill-down`;
    $('#dback').style.visibility = stack.length ? 'visible' : 'hidden';
    const body = $('#dbody'); const top = body.scrollTop; setHTML(body, detailHTML(current)); body.scrollTop = top;
  }

  // ---------------------------------------------------------------- header
  function lastRecord() { let t = S.session.startedAt; const lc = S.calls[S.calls.length - 1]; if (lc) t = Math.max(t, lc.endedAt || lc.startedAt); const lm = S.markers[S.markers.length - 1]; if (lm) t = Math.max(t, lm.time); for (const c of sim.runningCalls()) t = Math.max(t, c.startedAt); return t; }
  function renderHeader() {
    const ss = S.session; const since = S.now - lastRecord();
    const status = ss.status === 'complete' ? ['complete', '✓ turn complete'] : since < 30000 ? ['recent', '● recent activity'] : ['quiet', '○ quiet'];
    const active = sim.runningCalls().filter(c => c.lane === 'main').map(c => KM[c.kind].name);
    setHTML($('#ident'), `<b>${esc(ss.project)}</b><span>${esc(ss.name)}</span><code title="${esc(ss.id)}">${esc(ss.id.slice(0, 13))}…</code><span>${esc(ss.provider)} · ${esc(ss.model)}</span><span>⎇ ${esc(ss.branch)}</span><span class="pill ${status[0]}">${status[1]}</span><span>last record ${ago(since)}</span><span>turn ${ss.turn}</span><span>active: <b>${active.join(', ') || 'none'}</b></span>`);
  }
  function updateMode() {
    const m = $('#mode');
    if (inspectT != null) { m.className = 'mode inspect'; m.textContent = `INSPECTING ${hhmmss(inspectT)} · back to live`; m.setAttribute('tabindex', '0'); m.setAttribute('role', 'button'); }
    else if (!sim.running) { m.className = 'mode paused'; m.textContent = '❚❚ PAUSED'; m.removeAttribute('tabindex'); m.setAttribute('role', 'status'); }
    else { m.className = 'mode live'; m.textContent = 'LIVE'; m.removeAttribute('tabindex'); m.setAttribute('role', 'status'); }
  }
  $('#mode').addEventListener('click', () => { if (inspectT != null) closeDrawer(); });
  $('#mode').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && inspectT != null) { e.preventDefault(); closeDrawer(); } });

  // ---------------------------------------------------------------- history band
  function smooth(pts) {
    if (!pts.length) return '';
    let d = `M${f1(pts[0].x)},${f1(pts[0].y)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += `C${f1(p1.x + (p2.x - p0.x) / 6)},${f1(p1.y + (p2.y - p0.y) / 6)} ${f1(p2.x - (p3.x - p1.x) / 6)},${f1(p2.y - (p3.y - p1.y) / 6)} ${f1(p2.x)},${f1(p2.y)}`;
    }
    return d;
  }
  let histCursor = null;
  function renderHistory() {
    const svg = $('#hist'); const w = Math.max(300, svg.clientWidth), h = Math.max(90, svg.clientHeight);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const now = S.now, span = 30 * 60000, t0 = now - span, L = 70, R = 16;
    const X = t => L + (t - t0) / span * (w - L - R);
    const ctxTop = 6, ctxH = Math.round(h * 0.24), sTop = ctxTop + ctxH + 8, axisY = h - 16, sH = axisY - sTop - 8;
    const bins = 60, bw = span / bins; const vol = KINDS.map(() => new Array(bins).fill(0));
    for (const c of S.calls) {
      if ((c.endedAt || now) < t0) continue; const ki = KINDS.indexOf(c.kind);
      c.flow.forEach((hop, i) => { const t = i === 0 || !c.endedAt ? c.startedAt : c.endedAt; if (t < t0) return; const b = Math.min(bins - 1, Math.floor((t - t0) / bw)); vol[ki][b] += hopVol(hop); });
    }
    const totals = new Array(bins).fill(0).map((_, b) => KINDS.reduce((a, k, ki) => a + vol[ki][b], 0));
    const maxT = Math.max(2000, ...totals); const yc = sTop + sH / 2;
    const tops = KINDS.map(() => []), bots = KINDS.map(() => []);
    for (let b = 0; b < bins; b++) {
      const x = X(t0 + (b + 0.5) * bw); const H = Math.sqrt(totals[b] / maxT) * sH; let y = yc - H / 2;
      KINDS.forEach((k, ki) => { const hh = totals[b] ? H * vol[ki][b] / totals[b] : 0; tops[ki].push({ x, y }); y += hh; bots[ki].push({ x, y }); });
    }
    let out = `<rect x="${L}" y="0" width="${w - L - R}" height="${h}" fill="transparent" data-band="1"/>`;
    out += `<text x="8" y="${ctxTop + ctxH / 2 + 4}">lake level</text><text x="8" y="${yc + 4}">flow by kind</text><text x="8" y="${axisY + 4}">events</text>`;
    // context ribbon
    const cy = p => ctxTop + ctxH - p / 100 * ctxH;
    const samples = S.context.samples.filter(s => s.time >= t0);
    out += `<rect x="${L}" y="${ctxTop}" width="${w - L - R}" height="${ctxH}" fill="rgba(201,184,240,.05)" rx="3"/>`;
    out += `<line x1="${L}" x2="${w - R}" y1="${cy(70)}" y2="${cy(70)}" stroke="${AMBER}" stroke-dasharray="3 3" stroke-opacity=".6"/><line x1="${L}" x2="${w - R}" y1="${cy(90)}" y2="${cy(90)}" stroke="${RED}" stroke-dasharray="3 3" stroke-opacity=".6"/>`;
    if (samples.length > 1) { const d = samples.map((s, i) => `${i ? 'L' : 'M'}${f1(X(s.time))} ${f1(cy(s.percent))}`).join(' ') + ` L${f1(X(now))} ${f1(cy(S.context.percent))}`; out += `<path d="${d} L${f1(X(now))} ${ctxTop + ctxH} L${f1(X(samples[0].time))} ${ctxTop + ctxH} Z" fill="#5fd8d2" fill-opacity=".18"/><path d="${d}" fill="none" stroke="#5fd8d2" stroke-width="1.4"/>`; }
    // streams
    out += `<line x1="${L}" x2="${w - R}" y1="${yc}" y2="${yc}" stroke="rgba(201,184,240,.12)"/>`;
    KINDS.forEach((k, ki) => {
      if (!vol[ki].some(v => v > 0)) return;
      const top = tops[ki], bot = bots[ki].slice().reverse();
      out += `<path d="${smooth(top)} L${f1(bot[0].x)},${f1(bot[0].y)} ${smooth(bot).slice(1).replace(/^[^C]*/, '')} Z" fill="${COL[k]}" fill-opacity=".62" stroke="${COL[k]}" stroke-width=".6"><title>${KM[k].name}: ${fmtK(vol[ki].reduce((a, b) => a + b, 0))} in 30 min</title></path>`;
    });
    // axis
    for (let m = 0; m <= 30; m += 5) { const x = X(now - m * 60000); out += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${axisY - 4}" y2="${axisY + 2}" stroke="rgba(201,184,240,.35)"/><text x="${f1(x)}" y="${h - 2}" text-anchor="middle" font-size="9">${m ? '−' + m + 'm' : 'now'}</text>`; }
    if (S.session.startedAt > t0) { const x = X(S.session.startedAt); out += `<line x1="${f1(x)}" x2="${f1(x)}" y1="0" y2="${axisY}" stroke="rgba(233,220,192,.35)" stroke-dasharray="2 3"/><text x="${f1(x - 4)}" y="${sTop + 10}" text-anchor="end" font-size="9">session start ▸</text>`; }
    // markers
    for (const m of S.markers) {
      if (m.time < t0 || m.kind === 'context-file') continue; const x = X(m.time);
      const [col, tag, ref] = m.kind === 'prompt' ? [GOLD, 'P', 'user'] : m.kind === 'compaction' ? [MIST, 'C', 'context'] : [SAND, '✓', 'reply'];
      out += `<g data-open="${ref}" tabindex="-1"><title>${hhmmss(m.time)} · ${esc(m.label)}</title><line x1="${f1(x)}" x2="${f1(x)}" y1="${ctxTop}" y2="${axisY}" stroke="${col}" stroke-opacity=".55" ${m.kind === 'turn-complete' ? 'stroke-dasharray="2 3"' : ''}/><rect x="${f1(x - 6)}" y="${sTop - 6}" width="12" height="11" rx="2" fill="#140f34" stroke="${col}"/><text x="${f1(x)}" y="${sTop + 3}" text-anchor="middle" font-size="8.5" style="fill:${col};font-weight:700">${tag}</text></g>`;
    }
    // context file loads on the ribbon
    for (const m of S.markers) if (m.kind === 'context-file' && m.time >= t0) out += `<g data-open="ctxfile:${esc(m.detail.path)}"><title>${esc(m.label)}</title><path d="M${f1(X(m.time))} ${ctxTop + 2} l3 4 l-3 4 l-3 -4 z" fill="${COL.ctx}"/></g>`;
    // error ticks (shape + colour)
    for (const c of S.errors) { const t = c.endedAt || c.startedAt; if (t < t0) continue; const x = X(t); out += `<g data-open="error:${c.id}"><title>${hhmmss(t)} · ${esc(c.error.code)} · ${esc(c.tool)}</title><path d="M${f1(x)} ${axisY - 7} l4 7 h-8 z" fill="${SILT}" stroke="#ffc2ad" stroke-width=".6"/></g>`; }
    // inspect cursor
    const ct = inspectT != null ? inspectT : histCursor;
    if (ct != null && ct >= t0) { const x = X(ct); out += `<line x1="${f1(x)}" x2="${f1(x)}" y1="0" y2="${h}" stroke="${GOLD}" stroke-width="1.5"/><text x="${f1(x + 4)}" y="${ctxTop + 10}" font-size="9.5" style="fill:${GOLD};font-weight:700">${hhmmss(ct)}</text>`; }
    svg.innerHTML = out;
    svg._geo = { L, R, w, t0, span };
  }
  const histSvg = $('#hist');
  histSvg.addEventListener('click', e => {
    if (e.target.closest('[data-open]')) return;
    const g = histSvg._geo; if (!g) return; const r = histSvg.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * g.w;
    if (x < g.L) return; const t = g.t0 + (x - g.L) / (g.w - g.L - g.R) * g.span;
    openRef('moment:' + Math.round(Math.min(S.now, t)));
  });
  histSvg.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); histCursor = clamp((histCursor ?? S.now) + (e.key === 'ArrowLeft' ? -30000 : 30000), S.now - 30 * 60000, S.now); renderHistory(); }
    if (e.key === 'Enter') { e.preventDefault(); openRef('moment:' + Math.round(histCursor ?? S.now)); }
  });
  $('#hlegend').innerHTML = KINDS.map(k => `<span>${glyph(k, 11)}${KM[k].name}</span>`).join('') + `<span style="color:${GOLD}">P prompt</span><span>✓ turn</span><span style="color:${MIST}">C compaction</span><span style="color:#ff8a66">▲ error</span>`;

  // ---------------------------------------------------------------- controls and input
  $('#pause').addEventListener('click', togglePause);
  function togglePause() { if (sim.running) sim.pause(); else sim.start(); $('#pause').textContent = sim.running ? 'Pause' : 'Resume'; $('#pause').setAttribute('aria-pressed', String(!sim.running)); updateMode(); }
  for (const b of document.querySelectorAll('[data-speed]')) b.addEventListener('click', () => { sim.setSpeed(Number(b.dataset.speed)); for (const x of document.querySelectorAll('[data-speed]')) x.setAttribute('aria-pressed', String(x === b)); });
  document.addEventListener('click', e => {
    const live = e.target.closest('[data-live]'); if (live) { e.preventDefault(); closeDrawer(); return; }
    const el = e.target.closest('[data-open]'); if (!el) return;
    e.preventDefault(); openRef(el.getAttribute('data-open'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && current) { closeDrawer(); return; }
    const el = e.target.closest && e.target.closest('[data-open]');
    if (el && (e.key === 'Enter' || e.key === ' ') && el.tagName !== 'A' && el.tagName !== 'BUTTON') { e.preventDefault(); openRef(el.getAttribute('data-open')); return; }
    if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !/INPUT|TEXTAREA/.test(e.target.tagName)) togglePause();
  });
  // clicking a moving particle opens the call it belongs to
  $('#mapwrap').addEventListener('click', e => {
    const r = fx.getBoundingClientRect(); const x = (e.clientX - r.left - view.ox) / view.s, y = (e.clientY - r.top - view.oy) / view.s;
    let best = null, bd = 13;
    for (const h of surgeHits) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd && h.callId) { bd = d; best = h; } }
    if (best) { e.stopPropagation(); e.preventDefault(); openRef('call:' + best.callId); }
  }, true);

  // ---------------------------------------------------------------- update loop
  let dirty = true, lastUi = 0, lastHist = 0;
  function updateDynamic(force) {
    refreshGeometry();
    const hl = highlightFor(current);
    updateChannels(hl);
    renderWells(); renderGlacier(); renderReservoirs(); renderValleys(); renderTerraces(); renderTerminal(); renderLake(); renderFeatureText();
    renderBuoys(); renderRetries(); renderTrace(hl); renderHeader(); renderPanel(); renderDrawer();
    dirty = false;
  }
  let lastFrame = performance.now();
  function loop(now) {
    const dt = Math.min(100, now - lastFrame); lastFrame = now;
    if (sim.running) anim += dt;
    draw(sim.running ? dt : 0);
    if (now - lastUi > 400 || dirty) { lastUi = now; updateDynamic(); }
    if (now - lastHist > 1500) { lastHist = now; renderHistory(); }
    requestAnimationFrame(loop);
  }
  refreshGeometry();
  updateDynamic(true);
  renderHistory();
  sim.start();
  updateMode();
  requestAnimationFrame(loop);
  window.watershed = { sim, openRef, closeDrawer, channels };
})();
