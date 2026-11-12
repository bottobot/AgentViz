/* AgentViz concept 01: Circuit Board.
 * The session is a printed circuit board seen from above. The model is the CPU, every tool kind is its own
 * component, files are a bank of memory chips on the right edge, the context window is a capacitor bank that
 * charges and discharges, the terminal is a debug UART, subagents are daughterboards in sockets.
 * Data moves as glowing pulses along copper traces. Data: ../shared/sim.js (do not edit).
 */
(function () {
  'use strict';

  const sim = AgentVizSim.create({ seed: 7, history: 30 });
  const S = sim.state;
  const KINDS = sim.kinds;
  const KI = sim.kindInfo;
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NS = 'http://www.w3.org/2000/svg';
  const WINDOW = 30 * 60000;
  const HOT_EDITS = 3;
  const $ = sel => document.querySelector(sel);

  // ---------- helpers ----------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad2 = n => String(n).padStart(2, '0');
  const fmtT = t => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
  const fmtDur = ms => ms == null ? '-' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`;
  const fmtAgo = ms => ms < 1500 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)}s ago` : `${Math.floor(ms / 60000)}m ${pad2(Math.round(ms % 60000 / 1000))}s ago`;
  const fmtK = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
  const fmtB = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1000 ? `${(n / 1000).toFixed(1)} kB` : `${n} B`;
  const short = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const nodeLabel = id => { const n = sim.node(id); return n ? n.label : id; };
  const hostOf = url => { try { return new URL(url).host; } catch (e) { return null; } };

  // ---------- layout (viewBox 1200 x 760) ----------
  const TX = 600, TW = 160;
  const T = {
    network: { y: 30, h: 70, ref: 'U5', part: 'RF MODULE', role: 'NETWORK', chip: [656, 70] },
    files: { y: 116, h: 78, ref: 'U2', part: 'SENSE ADC', role: 'FILES', chip: [644, 158] },
    edits: { y: 210, h: 84, ref: 'U3', part: 'WRITE DRIVER', role: 'EDITS', chip: [633, 252] },
    shell: { y: 310, h: 100, ref: 'U4', part: 'REGULATOR+RELAY', role: 'SHELL', chip: [678, 344] },
    agents: { y: 426, h: 70, ref: 'U6', part: 'SOCKET CTRL', role: 'AGENTS', chip: [637, 464] },
    memory: { y: 512, h: 60, ref: 'U7', part: 'EEPROM', role: 'PLAN', chip: [636, 543] },
    other: { y: 588, h: 64, ref: 'J5', part: 'EXPANSION', role: 'OTHER', chip: [656, 618] }
  };
  const KIDX = Object.fromEntries(KINDS.map((k, i) => [k, i]));
  const CPU = { x: 200, y: 72, w: 224, h: 224 };
  const CTX = { x: 190, y: 340, w: 352, h: 142 };
  const PLAN = { x: 330, y: 494, w: 232, h: 120 };
  const TERM = { x: 330, y: 628, w: 232, h: 120 };
  const NSLOT = 3;
  const slotBox = s => ({ x: 812, y: 296 + s * 150, w: 120, h: 140 });
  const FILEX = 966, READBUS = 940, WRITEBUS = 950, FILE_STEP = 42;
  const HOSTS = S.nodes.filter(n => n.group === 'web' && n.id.startsWith('web:'));
  const hostBox = i => ({ x: 192 + (i % 2) * 204, y: 8 + Math.floor(i / 2) * 26, w: 196, h: 20 });
  const ANT = { x: 690, y: 22 };
  const CTXFILES = S.nodes.filter(n => n.group === 'contextfile');
  const ctxIdx = id => Math.max(0, CTXFILES.findIndex(n => n.id === id));
  const romBox = i => ({ x: 22, y: 178 + i * 62, w: 112, h: 46 });
  const fileList = () => S.nodes.filter(n => n.group === 'disk').map(n => n.label);
  const fileCy = path => { const i = fileList().indexOf(path); return 26 + Math.max(0, i) * FILE_STEP + FILE_STEP / 2; };

  // ---------- subagent sockets ----------
  const slotOf = new Map();            // lane key -> slot index
  const slotLane = new Array(NSLOT).fill(null); // slot -> depth-1 lane key
  const slotInserted = new Array(NSLOT).fill(-1e9);
  const slotFlash = new Array(NSLOT).fill(-1e9);
  function rootLane(lane) { let l = lane; while (l && l.depth > 1) l = sim.laneByKey(l.parent); return l; }
  function assignSlot(lane) {
    if (!lane || lane.depth === 0 || slotOf.has(lane.key)) return;
    if (lane.depth > 1) { const r = rootLane(lane); if (r && slotOf.has(r.key)) slotOf.set(lane.key, slotOf.get(r.key)); return; }
    let best = slotLane.indexOf(null);
    if (best < 0) {
      let oldest = Infinity;
      slotLane.forEach((key, s) => { const l = sim.laneByKey(key); if (l && l.state !== 'running' && (l.endedAt || 0) < oldest) { oldest = l.endedAt || 0; best = s; } });
    }
    if (best < 0) return; // all sockets busy: the lane talks through the socket controller
    const prev = slotLane[best];
    if (prev) for (const [k, s] of [...slotOf]) if (s === best) slotOf.delete(k);
    slotLane[best] = lane.key; slotOf.set(lane.key, best); slotInserted[best] = animNow;
  }

  // ---------- ports and routing ----------
  function rid(id) {
    if (id.startsWith('lane:')) { const key = id.slice(5); if (key === 'main') return 'model'; const s = slotOf.get(key); return s == null ? 'tool:agents' : `slot:${s}`; }
    return id;
  }
  function port(id, peer, src) {
    const pk = peer.startsWith('tool:') ? peer.slice(5) : null;
    if (id === 'model') return { x: CPU.x + CPU.w + 4, y: ({ network: 92, files: 140, shell: 196, other: 250 })[pk] ?? 270, d: 'R' };
    if (id === 'user') return { x: 50, y: 110, d: 'R' };
    if (id === 'answer') return { x: 240, y: 742, d: 'U' };
    if (id === 'context') {
      if (peer === 'user') return { x: CTX.x - 4, y: CTX.y + 14, d: 'L' };
      if (peer.startsWith('ctxfile:')) return { x: CTX.x - 4, y: CTX.y + 36 + ctxIdx(peer) * 20, d: 'L' };
      if (peer === 'terminal') return { x: 300, y: CTX.y + CTX.h + 4, d: 'D' };
      if (peer === 'answer') return { x: 240, y: CTX.y + CTX.h + 4, d: 'D' };
      if (pk) return { x: CTX.x + CTX.w + 4, y: CTX.y + 10 + KIDX[pk] * 18 + (src ? 7 : 0), d: 'R' };
      return null;
    }
    if (id === 'terminal') {
      if (peer === 'context') return { x: TERM.x - 4, y: TERM.y + 62, d: 'L' };
      if (peer === 'tool:shell') return { x: TERM.x + TERM.w + 4, y: TERM.y + 14, d: 'R' };
      return { x: TERM.x + TERM.w + 4, y: TERM.y + 108, d: 'R' };
    }
    if (id === 'plan') return { x: PLAN.x + PLAN.w + 4, y: T.memory.y + T.memory.h - 14, d: 'R' };
    if (id === 'mcp:github') return { x: 670, y: 756, d: 'U' };
    if (id.startsWith('ctxfile:')) { const b = romBox(ctxIdx(id)); return { x: b.x + b.w + 4, y: b.y + b.h / 2, d: 'R' }; }
    if (id.startsWith('file:')) return { x: FILEX - 4, y: fileCy(id.slice(5)) + (peer === 'tool:edits' ? 5 : -5), d: 'L' };
    if (id.startsWith('slot:')) { const b = slotBox(+id.slice(5)); const k = pk ? KIDX[pk] : peer === 'terminal' ? 7 : 4; return { x: b.x - 16, y: b.y + 14 + k * 15 + (src ? 0 : 5), d: 'L' }; }
    if (id.startsWith('tool:')) {
      const k = id.slice(5), b = T[k];
      const inY = k === 'network' ? b.y + 40 : b.y + 18;
      if (peer === 'model') return { x: TX - 4, y: inY, d: 'L' };
      if (peer === 'context') return { x: TX - 4, y: src ? b.y + b.h - 12 : inY, d: 'L' };
      if (peer === 'terminal') return { x: TX - 4, y: b.y + b.h - 16, d: 'L' };
      if (peer === 'plan') return { x: TX - 4, y: b.y + b.h - 14, d: 'L' };
      if (peer.startsWith('file:')) return { x: TX + TW + 4, y: b.y + (k === 'edits' ? 26 : 22), d: 'R' };
      if (peer.startsWith('slot:')) return { x: TX + TW + 4, y: b.y + b.h - 14 - (src ? 0 : 6), d: 'R' };
      if (peer === 'mcp:github') return { x: 670, y: b.y + b.h + 4, d: 'D' };
      return { x: TX + TW + 4, y: b.y + b.h / 2, d: 'R' };
    }
    return null;
  }
  function midFor(a, b) {
    const ka = a.startsWith('tool:') ? a.slice(5) : null, kb = b.startsWith('tool:') ? b.slice(5) : null;
    if (a === 'model') return ({ network: 520, files: 500, shell: 470, other: 586 })[kb];
    if (a === 'context' && kb) return 552 + KIDX[kb] * 4 + 2;
    if (b === 'context' && ka) return 552 + KIDX[ka] * 4;
    if (b === 'context' && a.startsWith('ctxfile:')) return 146 + ctxIdx(a) * 5;
    if (a === 'user') return 170;
    if (a.startsWith('file:') || b.startsWith('file:')) return (ka === 'edits' || kb === 'edits') ? WRITEBUS : READBUS;
    if (a.startsWith('slot:') || b.startsWith('slot:')) { const s = +(a.startsWith('slot:') ? a : b).slice(5); const k = ka || kb; const kk = k ? KIDX[k] : 7; return 772 + ((kk * 5 + s * 3) % 14); }
    if (a === 'tool:shell' && b === 'terminal') return 580;
    if (a === 'tool:memory' && b === 'plan') return 580;
    return undefined;
  }
  const STUB = 8;
  const stepPt = (p, n) => p.d === 'L' ? [p.x - n, p.y] : p.d === 'R' ? [p.x + n, p.y] : p.d === 'U' ? [p.x, p.y - n] : [p.x, p.y + n];
  function routePts(a, b, m) {
    const a1 = stepPt(a, STUB), b1 = stepPt(b, STUB);
    const ah = a.d === 'L' || a.d === 'R', bh = b.d === 'L' || b.d === 'R';
    const pts = [[a.x, a.y], a1];
    if (ah && bh) { const xm = m ?? (a1[0] + b1[0]) / 2; pts.push([xm, a1[1]], [xm, b1[1]]); } else if (!ah && !bh) { const ym = m ?? (a1[1] + b1[1]) / 2; pts.push([a1[0], ym], [b1[0], ym]); } else if (ah) pts.push([b1[0], a1[1]]); else pts.push([a1[0], b1[1]]);
    pts.push(b1, [b.x, b.y]);
    const out = [];
    for (const p of pts) { const q = out[out.length - 1]; if (q && Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01) continue; out.push(p); }
    const res = [out[0]];
    for (let i = 1; i < out.length - 1; i++) { const p = res[res.length - 1], q = out[i], r = out[i + 1]; if ((Math.abs(p[0] - q[0]) < 0.01 && Math.abs(q[0] - r[0]) < 0.01) || (Math.abs(p[1] - q[1]) < 0.01 && Math.abs(q[1] - r[1]) < 0.01)) continue; res.push(q); }
    res.push(out[out.length - 1]);
    return res;
  }
  function chamfer(pts, c) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
      const k = Math.min(c, l1 / 2, l2 / 2);
      if (k < 0.5) { out.push([x, y]); continue; }
      out.push([x - (x - px) / l1 * k, y - (y - py) / l1 * k], [x + (nx - x) / l2 * k, y + (ny - y) / l2 * k]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function polyInfo(pts) { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum, len: cum[cum.length - 1] }; }
  function pointAt(info, d) {
    const { pts, cum, len } = info; d = clamp(d, 0, len);
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1, f = (d - cum[i - 1]) / seg;
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, a: Math.atan2(y1 - y0, x1 - x0) };
  }

  const traces = new Map(); // key -> { key, info, d, el, uses: [callId], warmAt }
  const drawnD = new Map();  // d -> path element (dedupe identical geometry)
  let traceLayer, viaLayer;
  function traceFor(fromId, toId) {
    const a = rid(fromId), b = rid(toId);
    if (a === b) return null;
    const key = `${a}>${b}`;
    let tr = traces.get(key); if (tr) return tr;
    const pa = port(a, b, true), pb = port(b, a, false);
    if (!pa || !pb) return null;
    const raw = routePts(pa, pb, midFor(a, b));
    const pts = chamfer(raw, 5);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
    tr = { key, info: polyInfo(pts), d, uses: [], warmAt: -1e9, errAt: -1e9 };
    let shared = drawnD.get(d);
    if (!shared) {
      el('path', { class: 'trace-under', d }, traceLayer);
      const p = el('path', { class: 'trace', d }, traceLayer);
      const hit = el('path', { class: 'trace-hit', d, 'data-sel': `trace:${key}` }, traceLayer);
      shared = { p, hit, keys: [key] };
      drawnD.set(d, shared);
      // vias where a long middle run changes layer
      for (let i = 1; i < raw.length - 2; i++) {
        const [x0, y0] = raw[i], [x1, y1] = raw[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (len > 46 && i > 1 && i < raw.length - 2) {
          for (const f of [12 / len, 1 - 12 / len]) { const vx = x0 + (x1 - x0) * f, vy = y0 + (y1 - y0) * f; el('circle', { class: 'via-ring', cx: vx, cy: vy, r: 3.1 }, viaLayer); el('circle', { class: 'via-hole', cx: vx, cy: vy, r: 1.3 }, viaLayer); }
        }
      }
    } else shared.keys.push(key);
    tr.shared = shared;
    traces.set(key, tr);
    return tr;
  }

  // ---------- static board ----------
  const svg = $('#board');
  function defs() {
    return `<defs>
      <radialGradient id="maskG" cx="44%" cy="40%" r="78%"><stop offset="0" stop-color="#145a35"/><stop offset=".55" stop-color="#0e4428"/><stop offset="1" stop-color="#072616"/></radialGradient>
      <pattern id="pourP" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#1a6a40" stroke-width="1.1"/></pattern>
      <pattern id="weave" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="none"/><circle cx="1.5" cy="1.5" r=".35" fill="#0a301c"/></pattern>
      <linearGradient id="goldG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc8a"/><stop offset=".5" stop-color="#d4a537"/><stop offset="1" stop-color="#9c721c"/></linearGradient>
      <linearGradient id="chipG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2d2e"/><stop offset=".5" stop-color="#151717"/><stop offset="1" stop-color="#0a0b0b"/></linearGradient>
      <linearGradient id="metalG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9edf0"/><stop offset=".45" stop-color="#aab2b8"/><stop offset=".55" stop-color="#c5ccd1"/><stop offset="1" stop-color="#7d868d"/></linearGradient>
      <linearGradient id="copperG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0a25c"/><stop offset=".5" stop-color="#c8763a"/><stop offset="1" stop-color="#8a4a1e"/></linearGradient>
      <linearGradient id="dbG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17643b"/><stop offset="1" stop-color="#0b3a22"/></linearGradient>
      <linearGradient id="ribbonG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c33"/><stop offset=".06" stop-color="#c33"/><stop offset=".06" stop-color="#b8bdc2"/><stop offset="1" stop-color="#9aa1a7"/></linearGradient>
      <pattern id="ribbonP" width="4" height="10" patternUnits="userSpaceOnUse"><rect width="4" height="10" fill="none"/><line x1="3.5" y1="0" x2="3.5" y2="10" stroke="#6d747a" stroke-width=".8"/></pattern>
      <radialGradient id="canG" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#f3f5f6"/><stop offset=".6" stop-color="#a9b1b7"/><stop offset="1" stop-color="#5f676d"/></radialGradient>
      <radialGradient id="lensG" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#7a5a2a"/><stop offset=".5" stop-color="#2a1a0a"/><stop offset="1" stop-color="#0a0604"/></radialGradient>
      <radialGradient id="dieG"><stop offset="0" stop-color="#fff2c4"/><stop offset=".4" stop-color="#ffb53a"/><stop offset="1" stop-color="#ff8a00" stop-opacity="0"/></radialGradient>
      <radialGradient id="halo"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".95"/><stop offset=".35" stop-color="#ffb53a" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a1a" stop-opacity="0"/></radialGradient>
      <radialGradient id="haloRed"><stop offset="0" stop-color="#ffd0c8" stop-opacity=".95"/><stop offset=".35" stop-color="#e0402f" stop-opacity=".6"/><stop offset="1" stop-color="#b3261e" stop-opacity="0"/></radialGradient>
      <radialGradient id="scorchG"><stop offset="0" stop-color="#050101" stop-opacity=".95"/><stop offset=".4" stop-color="#1e0703" stop-opacity=".9"/><stop offset=".68" stop-color="#6e1a0f" stop-opacity=".55"/><stop offset="1" stop-color="#b3261e" stop-opacity="0"/></radialGradient>
      <radialGradient id="heatG"><stop offset="0" stop-color="#ffb347" stop-opacity=".75"/><stop offset=".5" stop-color="#ff6a00" stop-opacity=".3"/><stop offset="1" stop-color="#ff4400" stop-opacity="0"/></radialGradient>
      <radialGradient id="smokeG"><stop offset="0" stop-color="#d5d5d0" stop-opacity=".6"/><stop offset="1" stop-color="#8a8a86" stop-opacity="0"/></radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="glowW" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#000" flood-opacity=".55"/></filter>
      <clipPath id="boardClip"><rect x="4" y="4" width="1192" height="752" rx="16"/></clipPath>
      <clipPath id="termClip"><rect x="${TERM.x + 32}" y="${TERM.y + 6}" width="${TERM.w - 38}" height="${TERM.h - 12}"/></clipPath>
    </defs>`;
  }
  const silk = (x, y, text, cls = '', extra = '') => `<text class="silk ${cls}" x="${x}" y="${y}" ${extra}>${esc(text)}</text>`;
  const passive = (x, y, rot = 0, body = '#2a2d2e') => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-5" y="-2" width="10" height="4" fill="${body}"/><rect x="-6" y="-2.2" width="2.6" height="4.4" class="pad"/><rect x="3.4" y="-2.2" width="2.6" height="4.4" class="pad"/></g>`;
  const toolAttrs = (k, b) => `id="tool-${k}" class="tool" data-sel="tool:${k}" tabindex="0" role="button" aria-label="${KI[k].name} component (${b.ref} ${b.part}). Open its calls and errors."`;
  const rings = (x, y, w, h) => `<rect class="focus-ring" x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/><rect class="active-ring" x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="4"/>`;

  function toolArt(k, b) {
    const y = b.y;
    let s = '';
    if (k === 'network') {
      s += `<path d="M690 44V22H680V8H670V22H660V8H650V22H640V8H630V22H620V8H612" fill="none" stroke="url(#goldG)" stroke-width="2.4" stroke-linejoin="miter"/>`;
      s += silk(704, 16, 'ANT1', 'small');
      s += `<rect x="614" y="45" width="84" height="48" rx="3" fill="url(#metalG)" stroke="#5f676d" filter="url(#shadow)"/><rect x="618" y="49" width="76" height="40" rx="2" fill="none" stroke="#e8ecef" stroke-width=".8" opacity=".7"/>`;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) s += `<circle cx="${625 + i * 12}" cy="${57 + j * 9}" r="1.3" fill="#6b7379"/>`;
      s += `<text x="621" y="88" font-size="7" fill="#3b4247" font-weight="700">RF-2G4 SHIELD</text>`;
    } else if (k === 'files') {
      for (let i = 0; i < 7; i++) { const p = 136 + i * 7; s += `<rect x="612" y="${p}" width="5" height="2.6" class="pad"/><rect x="671" y="${p}" width="5" height="2.6" class="pad"/><rect x="${621 + i * 7}" y="127" width="2.6" height="5" class="pad"/><rect x="${621 + i * 7}" y="184" width="2.6" height="5" class="pad"/>`; }
      s += `<rect x="616" y="131" width="56" height="54" rx="2" fill="url(#chipG)" stroke="#000"/><circle cx="621" cy="136" r="1.6" fill="#555"/>`;
      s += `<circle cx="644" cy="158" r="14" fill="url(#lensG)" stroke="url(#goldG)" stroke-width="2"/><circle cx="644" cy="158" r="5" fill="#120a04" stroke="#7a5a2a" stroke-width=".6"/><circle cx="640" cy="154" r="2" fill="#fff" opacity=".35"/>`;
      s += passive(688, 136, 90) + passive(688, 178, 90);
      s += `<text x="619" y="183" font-size="6" fill="#6f7676">ADC16</text>`;
    } else if (k === 'edits') {
      for (let i = 0; i < 6; i++) { const p = 232 + i * 7.6; s += `<rect x="609" y="${p}" width="5" height="2.6" class="pad"/><rect x="652" y="${p}" width="5" height="2.6" class="pad"/>`; }
      s += `<rect x="614" y="228" width="38" height="48" rx="2" fill="url(#chipG)" stroke="#000"/><circle cx="619" cy="233" r="1.5" fill="#555"/><text x="618" y="258" font-size="7.5" fill="#7d8585" font-weight="700">WR</text><text x="618" y="267" font-size="6" fill="#6f7676">DRV</text>`;
      for (let i = 0; i < 3; i++) {
        const fy = 225 + i * 22;
        for (let j = 0; j < 7; j++) s += `<rect x="${662 + j * 5}" y="${fy - 2}" width="2" height="3" class="pad"/><rect x="${662 + j * 5}" y="${fy + 16}" width="2" height="3" class="pad"/>`;
        s += `<rect id="flash${i}" x="659" y="${fy}" width="40" height="17" rx="1.5" fill="url(#chipG)" stroke="#000"/><text x="663" y="${fy + 11}" font-size="6" fill="#7d8585">FLASH ${i}</text>`;
      }
    } else if (k === 'shell') {
      s += `<rect x="612" y="323" width="40" height="40" rx="1" fill="url(#metalG)" stroke="#5f676d" filter="url(#shadow)"/>`;
      for (let i = 0; i < 7; i++) s += `<rect x="${614 + i * 5.4}" y="325" width="2.4" height="36" fill="#8a9298" opacity=".8"/>`;
      s += `<rect x="618" y="362" width="28" height="14" fill="url(#chipG)" stroke="#000"/><text x="621" y="372" font-size="6" fill="#7d8585">7805</text>`;
      for (let i = 0; i < 3; i++) s += `<rect x="${622 + i * 8}" y="376" width="3" height="11" class="pad"/>`;
      s += `<rect x="656" y="323" width="44" height="42" rx="2" fill="#121416" stroke="#000" filter="url(#shadow)"/><rect x="662" y="331" width="13" height="22" fill="none" stroke="#e9ecef" stroke-width=".9"/><path d="M662 353L675 331" stroke="#e9ecef" stroke-width=".9"/><path d="M682 352L695 338M680 352h4M695 338v-6" stroke="#e9ecef" stroke-width=".9" fill="none"/><text x="681" y="362" font-size="6.5" fill="#e9ecef">K1</text>`;
      s += `<circle id="shellChargeBg" cx="684" cy="390" r="15" fill="none" stroke="#2a3a2f" stroke-width="2.5"/><circle id="shellCharge" cx="684" cy="390" r="15" fill="none" stroke="#ffb53a" stroke-width="2.5" stroke-dasharray="0 200" transform="rotate(-90 684 390)" filter="url(#glow)"/>`;
      s += `<circle cx="684" cy="390" r="11" fill="url(#canG)" stroke="#5f676d"/><path d="M675.5 383a11 11 0 0 0 0 14" stroke="#2b2f33" stroke-width="3.5" fill="none"/><path d="M679 385l10 10M689 385l-10 10" stroke="#6d757c" stroke-width=".8"/>`;
      s += silk(666, 404, 'C21', 'small', 'text-anchor="end"');
    } else if (k === 'agents') {
      s += `<rect x="612" y="440" width="50" height="50" rx="2" fill="#1b1d1e" stroke="#3a3d40"/>`;
      for (let i = 0; i < 6; i++) s += `<rect x="${619 + i * 6.4}" y="441.5" width="2.4" height="3" class="pad"/><rect x="${619 + i * 6.4}" y="485.5" width="2.4" height="3" class="pad"/><rect x="613.5" y="${447 + i * 6.4}" width="3" height="2.4" class="pad"/><rect x="657.5" y="${447 + i * 6.4}" width="3" height="2.4" class="pad"/>`;
      s += `<path d="M622 446H656V484H618V450Z" fill="url(#chipG)" stroke="#000"/><circle cx="637" cy="452" r="1.8" fill="#444"/><text x="622" y="470" font-size="6.5" fill="#7d8585">SOCK</text><text x="622" y="478" font-size="6.5" fill="#7d8585">CTRL</text>`;
      for (let i = 0; i < NSLOT; i++) s += `<circle id="sockled${i}" cx="676" cy="${448 + i * 14}" r="4" fill="#3b2a12" stroke="#000" stroke-width=".6"/>${silk(684, 451 + i * 14, `S${i + 1}`, 'small')}`;
    } else if (k === 'memory') {
      for (let i = 0; i < 4; i++) s += `<rect x="${619 + i * 10}" y="526" width="3.5" height="6" class="pad"/><rect x="${619 + i * 10}" y="554" width="3.5" height="6" class="pad"/>`;
      s += `<rect x="614" y="531" width="44" height="24" rx="2" fill="url(#chipG)" stroke="#000"/><path d="M614 538a5 5 0 0 1 0 10" fill="#050505"/><text x="622" y="546" font-size="6.5" fill="#7d8585">24C02</text>`;
      for (let i = 0; i < 8; i++) s += `<rect id="bit${i}" x="${666 + (i % 4) * 9}" y="${531 + Math.floor(i / 4) * 13}" width="6.5" height="7" rx="1" fill="#3b2a12" stroke="#000" stroke-width=".5"/>`;
    } else if (k === 'other') {
      s += `<rect x="612" y="604" width="88" height="26" rx="1.5" fill="#151718" stroke="#000" filter="url(#shadow)"/>`;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) s += `<rect id="hp${i}_${j}" x="${616 + i * 10.6}" y="${608 + j * 10}" width="5" height="5" class="pad"/>`;
      s += `<path d="M645 646H695V760H645Z" fill="url(#ribbonG)"/><path d="M645 646H695V760H645Z" fill="url(#ribbonP)" opacity=".7"/><rect x="640" y="632" width="60" height="15" rx="1" fill="#2a2d30" stroke="#000"/>`;
      s += silk(703, 724, 'CABLE', 'small dim') + silk(703, 733, 'MCP github', 'small dim');
    }
    return s;
  }

  function buildBoard() {
    let s = defs();
    s += `<rect x="0" y="0" width="1200" height="760" fill="#020a05"/>`;
    s += `<rect x="4" y="4" width="1192" height="752" rx="16" fill="url(#maskG)" stroke="#d9b04a" stroke-width="1.2" stroke-opacity=".55"/>`;
    s += `<g clip-path="url(#boardClip)"><rect x="4" y="4" width="1192" height="752" fill="url(#weave)" opacity=".5"/>`;
    // ground pour islands
    for (const [x, y, w, h] of [[16, 430, 170, 54], [436, 300, 104, 30], [780, 120, 140, 160], [1010, 724, 180, 28], [312, 300, 120, 34]]) s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#pourP)" opacity=".5"/>`;
    s += '</g>';
    // mounting holes, fiducials
    for (const [x, y] of [[22, 22], [1178, 22], [22, 738], [1178, 738]]) s += `<circle cx="${x}" cy="${y}" r="9" fill="url(#goldG)"/><circle cx="${x}" cy="${y}" r="5" fill="#020a05"/>`;
    for (const [x, y] of [[176, 24], [776, 742], [1180, 380]]) s += `<circle cx="${x}" cy="${y}" r="3.6" fill="url(#goldG)"/><circle cx="${x}" cy="${y}" r="6.5" fill="none" stroke="#0a2a18" stroke-width="2"/>`;
    s += `<g id="traces"></g><g id="vias"></g>`;
    s += silk(38, 30, 'AGENTVIZ', 'gold mid') + silk(38, 41, 'SESSION BOARD', 'gold small') + silk(38, 51, 'REV 7 · 2-LAYER', 'small dim');

    // J1 prompt in
    s += `<g id="j1" data-sel="user" tabindex="0" role="button" aria-label="J1 prompt input. Open the prompts.">${rings(4, 60, 52, 96)}`;
    s += silk(8, 70, 'J1 PROMPT IN', 'small');
    s += `<rect x="8" y="76" width="36" height="70" rx="2" fill="#18191a" stroke="#000" filter="url(#shadow)"/>`;
    for (let i = 0; i < 6; i++) s += `<rect x="14" y="${81 + i * 10.5}" width="24" height="5" rx="1" class="pad"/>`;
    s += `<circle id="j1led" cx="50" cy="82" r="3.4" fill="#3b2a12" stroke="#000" stroke-width=".6"/><g class="dyn" id="dyn-user"></g></g>`;

    // boot roms
    s += silk(22, 170, 'BOOT ROMS · CONTEXT FILES', 'small');
    CTXFILES.forEach((n, i) => {
      const b = romBox(i);
      s += `<g id="rom${i}" data-sel="${esc(n.id)}" tabindex="0" role="button" aria-label="Context file ${esc(n.label)}.">${rings(b.x - 4, b.y - 4, b.w + 8, b.h + 8)}<g class="dyn" id="dyn-rom${i}"></g></g>`;
    });

    // power / token rails
    s += `<g id="pwr" data-sel="overview" tabindex="0" role="button" aria-label="Token power rails. Open the session overview.">${rings(14, 488, 170, 244)}`;
    s += silk(20, 500, 'PWR · TOKEN RAILS', 'small');
    s += `<rect x="22" y="508" width="40" height="30" rx="2" fill="#18191a" stroke="#000"/><circle cx="42" cy="523" r="9" fill="#0a0a0a" stroke="#555"/><circle cx="42" cy="523" r="3" fill="url(#goldG)"/>`;
    s += `<rect x="72" y="510" width="30" height="26" rx="6" fill="#2b2f2f" stroke="#000"/><path d="M76 523c3-8 6 8 9 0s6 8 9 0s5 8 6 0" stroke="#c8763a" stroke-width="1.4" fill="none"/>${silk(78, 546, 'L1', 'small')}`;
    s += `<rect x="112" y="512" width="44" height="22" rx="1.5" fill="url(#chipG)" stroke="#000"/><text x="117" y="526" font-size="6.5" fill="#7d8585">PMIC</text>`;
    for (let i = 0; i < 4; i++) s += `<rect x="${116 + i * 10}" y="534" width="3" height="4" class="pad"/><rect x="${116 + i * 10}" y="508" width="3" height="4" class="pad"/>`;
    [['TOKENS IN', 'railIn', 566], ['TOKENS OUT', 'railOut', 608], ['CACHE READ', 'railCache', 650]].forEach(([label, id, y]) => {
      s += silk(22, y - 6, label, 'small dim') + `<text id="${id}" class="silk mid amber" x="176" y="${y - 6}" text-anchor="end">0</text>`;
      s += `<rect x="22" y="${y}" width="154" height="9" rx="2" fill="#0a2a18"/><rect id="${id}Bar" x="22" y="${y}" width="10" height="9" rx="2" fill="url(#copperG)"/>`;
    });
    s += `<rect x="22" y="680" width="154" height="44" rx="3" fill="#050b07" stroke="#1d3a28"/>${silk(30, 694, 'TURN', 'small dim')}<text id="turnSeg" x="30" y="718" font-size="22" font-weight="700" fill="#ffb53a" filter="url(#glow)">00</text><text id="turnSub" class="silk small dim" x="170" y="694" text-anchor="end"></text><text id="turnSub2" class="silk small dim" x="170" y="716" text-anchor="end"></text>`;
    s += '</g>';

    // CPU
    {
      const { x, y, w, h } = CPU;
      s += `<g id="cpu" data-sel="model" tabindex="0" role="button" aria-label="Model chip. Open the model and session detail.">${rings(x - 6, y - 6, w + 12, h + 12)}`;
      s += silk(x, y - 6, 'U1  MODEL · MAIN LANE', 'small');
      const n = 22, in0 = 24, st = (w - 2 * in0) / (n - 1);
      for (let i = 0; i < n; i++) { const p = in0 + i * st; s += `<rect x="${x + p - 2}" y="${y}" width="4" height="13" class="pad"/><rect x="${x + p - 2}" y="${y + h - 13}" width="4" height="13" class="pad"/><rect x="${x}" y="${y + p - 2}" width="13" height="4" class="pad"/><rect x="${x + w - 13}" y="${y + p - 2}" width="13" height="4" class="pad"/>`; }
      s += `<rect x="${x + 11}" y="${y + 11}" width="${w - 22}" height="${h - 22}" rx="3" fill="url(#chipG)" stroke="#000" filter="url(#shadow)"/><circle cx="${x + 22}" cy="${y + 22}" r="3.2" fill="#3a3f44"/>`;
      s += `<rect x="${x + 34}" y="${y + 34}" width="${w - 68}" height="${h - 68}" rx="8" fill="url(#metalG)" stroke="#5f676d"/>`;
      s += `<rect id="cpuDie" x="${x + 40}" y="${y + 40}" width="${w - 80}" height="${h - 80}" rx="6" fill="url(#dieG)" opacity=".15"/>`;
      s += `<text x="${x + w / 2}" y="${y + 84}" text-anchor="middle" font-size="17" font-weight="800" fill="#2a3036" letter-spacing="2">MODEL</text>`;
      s += `<text id="cpuModel" x="${x + w / 2}" y="${y + 102}" text-anchor="middle" font-size="9" fill="#2f363c"></text>`;
      s += `<text id="cpuState" x="${x + w / 2}" y="${y + 128}" text-anchor="middle" font-size="10" font-weight="700" fill="#5a3a06"></text>`;
      s += `<text id="cpuSub" x="${x + w / 2}" y="${y + 146}" text-anchor="middle" font-size="8" fill="#3b4247"></text>`;
      s += `<text id="cpuSub2" x="${x + w / 2}" y="${y + 160}" text-anchor="middle" font-size="8" fill="#3b4247"></text>`;
      for (const [px, py, r] of [[x - 12, y + 30, 90], [x - 12, y + h - 30, 90], [x + 40, y + h + 12, 0], [x + w - 40, y + h + 12, 0]]) s += passive(px, py, r);
      s += '</g>';
      // memory bus CPU -> context bank (decorative, 8 lines)
      for (let i = 0; i < 8; i++) s += `<path d="M${x + 62 + i * 14} ${y + h + 1}V${CTX.y - 4}" stroke="#c8763a" stroke-width="1.6" opacity=".55" fill="none"/>`;
      s += silk(x + 62, CTX.y - 8, '', 'small');
    }

    // web hosts strip (RF channels)
    HOSTS.forEach((n, i) => {
      const b = hostBox(i);
      s += `<g id="host${i}" data-sel="${esc(n.id)}" tabindex="0" role="button" aria-label="Web host ${esc(n.label)}. Open its fetches.">${rings(b.x - 2, b.y - 2, b.w + 4, b.h + 4)}<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" fill="none" stroke="#eef0e4" stroke-width=".8" opacity=".55"/><path d="M${b.x + 9} ${b.y + 15}l4-10l4 10M${b.x + 13} ${b.y + 5}v11" stroke="#d9b04a" stroke-width="1.1" fill="none"/>${silk(b.x + 21, b.y + 9, `RX CH${i + 1}`, 'small dim')}${silk(b.x + 21, b.y + 17.5, short(n.label, 25), 'small')}<g class="dyn" id="dyn-host${i}"></g></g>`;
    });

    // context capacitor bank
    {
      const { x, y, w, h } = CTX;
      s += `<g id="ctxbank" data-sel="context" tabindex="0" role="button" aria-label="Context window capacitor bank. Open what filled it.">${rings(x - 4, y - 4, w + 8, h + 8)}`;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#0a301c" stroke="#eef0e4" stroke-width=".8" stroke-opacity=".5"/>`;
      s += silk(x + 8, y + 13, 'C1-C20 CONTEXT BANK', 'small') + `<text id="ctxCap" class="silk small dim" x="${x + 8}" y="${y + 23}"></text>`;
      s += `<text id="ctxPct" class="silk big" x="${x + w - 8}" y="${y + 18}" text-anchor="end">0%</text><text id="ctxComp" class="silk small dim" x="${x + w - 8}" y="${y + 28}" text-anchor="end"></text>`;
      for (let i = 0; i < 20; i++) {
        const cx = x + 26 + (i % 10) * 33.5, cy = y + 46 + Math.floor(i / 10) * 36;
        s += `<g id="cap${i}"><circle cx="${cx}" cy="${cy}" r="15" fill="none" stroke="#062014" stroke-width="2.6"/><circle class="capArc" cx="${cx}" cy="${cy}" r="15" fill="none" stroke="#ffb53a" stroke-width="2.6" stroke-dasharray="0 100" transform="rotate(-90 ${cx} ${cy})"/>`;
        s += `<circle cx="${cx}" cy="${cy}" r="11.5" fill="url(#canG)" stroke="#5d656c"/><path d="M${cx - 8.2} ${cy - 8}a11.5 11.5 0 0 0 0 16" stroke="#2b2f33" stroke-width="3.4" fill="none"/>`;
        s += `<circle class="capFill" cx="${cx}" cy="${cy}" r="8" fill="#ffb53a" opacity="0"/><path d="M${cx - 4.5} ${cy - 4.5}l9 9M${cx + 4.5} ${cy - 4.5}l-9 9" stroke="#6d757c" stroke-width=".8"/></g>`;
      }
      for (const [pct, i] of [[70, 14], [90, 18]]) {
        const tx = x + 26 + ((i % 10) - 0.5) * 33.5, ty = y + 46 + 36;
        s += `<path d="M${tx} ${ty - 18}V${ty + 18}" stroke="${pct === 90 ? '#ff7a6a' : '#ffcf6a'}" stroke-width="1" stroke-dasharray="2 2"/>${silk(tx + 2, ty + 25, `${pct}%`, `small ${pct === 90 ? 'red' : 'amber'}`)}`;
      }
      s += `<path id="ctxSpark" d="" fill="none" stroke="#ffb53a" stroke-width="1.3"/><path id="ctxSparkFill" d="" fill="#ffb53a" opacity=".12"/>`;
      s += silk(x + 8, y + h - 6, '30 MIN', 'small dim');
      s += '</g>';
    }

    // task LEDs
    s += `<g id="plan" data-sel="plan" tabindex="0" role="button" aria-label="Task list LEDs. Open the task list.">${rings(PLAN.x - 4, PLAN.y - 4, PLAN.w + 8, PLAN.h + 8)}<rect x="${PLAN.x}" y="${PLAN.y}" width="${PLAN.w}" height="${PLAN.h}" rx="4" fill="none" stroke="#eef0e4" stroke-width=".8" stroke-opacity=".5"/>${silk(PLAN.x + 8, PLAN.y + 12, 'D1-D6 TASK LEDS', 'small')}<g class="dyn" id="dyn-plan"></g></g>`;

    // terminal UART
    s += `<g id="term" data-sel="terminal" tabindex="0" role="button" aria-label="Debug UART terminal. Open commands and exit codes.">${rings(TERM.x - 4, TERM.y - 4, TERM.w + 8, TERM.h + 8)}`;
    s += silk(TERM.x, TERM.y - 3, 'J4 DEBUG UART · TERMINAL', 'small');
    ['GND', 'RX', 'TX', '3V3'].forEach((p, i) => { s += `<rect x="${TERM.x + 4}" y="${TERM.y + 10 + i * 26}" width="14" height="14" fill="#141516" stroke="#000"/><rect x="${TERM.x + 8}" y="${TERM.y + 14 + i * 26}" width="6" height="6" class="pad"/>${silk(TERM.x + 4, TERM.y + 32 + i * 26, p, 'small dim')}`; });
    s += `<rect x="${TERM.x + 28}" y="${TERM.y + 2}" width="${TERM.w - 30}" height="${TERM.h - 4}" rx="3" fill="#020805" stroke="#2a4a35"/>`;
    s += `<g clip-path="url(#termClip)"><g id="termLines"></g></g><circle id="termLed" cx="${TERM.x + TERM.w - 8}" cy="${TERM.y + 9}" r="2.6" fill="#3b2a12"/></g>`;

    // J2 reply out
    s += `<g id="j2" data-sel="answer" tabindex="0" role="button" aria-label="J2 reply output. Open the replies.">${rings(200, 728, 80, 32)}<rect x="206" y="742" width="68" height="16" rx="1.5" fill="#18191a" stroke="#000"/>`;
    for (let i = 0; i < 6; i++) s += `<rect x="${211 + i * 10.5}" y="746" width="5" height="10" rx="1" class="pad"/>`;
    s += `<circle id="j2led" cx="284" cy="748" r="3.4" fill="#3b2a12" stroke="#000" stroke-width=".6"/>${silk(196, 740, 'J2 REPLY OUT', 'small', 'text-anchor="end"')}<g class="dyn" id="dyn-answer"></g></g>`;

    // tool components
    for (const k of KINDS) {
      const b = T[k];
      s += `<g ${toolAttrs(k, b)}>${rings(TX - 6, b.y - 2, TW + 12, b.h + 4)}`;
      s += `<rect x="${TX}" y="${b.y}" width="${TW}" height="${b.h}" rx="4" fill="none" stroke="#eef0e4" stroke-width=".6" stroke-opacity=".28"/>`;
      s += silk(TX + 3, b.y + 9, `${b.ref} ${b.part}`, 'small') + silk(TX + TW - 12, b.y + 9, b.role, 'small gold', 'text-anchor="end"');
      s += `<circle class="run-led" cx="${TX + TW - 5}" cy="${b.y + 6}" r="3.2"/>`;
      s += toolArt(k, b);
      s += `<g class="dyn" id="dyn-${k}"></g></g>`;
    }

    // clock
    s += `<g id="clock" data-sel="overview" tabindex="0" role="button" aria-label="Session clock. Open the session overview.">${rings(784, 20, 148, 96)}`;
    s += `<rect x="790" y="28" width="46" height="18" rx="9" fill="url(#metalG)" stroke="#5f676d" filter="url(#shadow)"/><text x="799" y="40" font-size="7" fill="#3b4247" font-weight="700">32.768</text>${silk(842, 38, 'Y1 SIM CLOCK', 'small')}`;
    s += `<text id="clockT" class="silk big amber" x="790" y="68">--:--:--</text><text id="clockSub" class="silk small dim" x="790" y="82"></text><text id="clockSub2" class="silk small dim" x="790" y="94"></text><text id="clockSub3" class="silk small" x="790" y="107"></text></g>`;
    s += silk(933, 132, 'RD', 'small dim', 'text-anchor="end"') + silk(953, 132, 'WR', 'small dim');
    s += silk(800, 288, 'J6-J8 AGENT SOCKETS', 'small');

    // sockets
    for (let i = 0; i < NSLOT; i++) {
      const b = slotBox(i);
      s += `<g id="slot${i}" data-sel="agents" tabindex="0" role="button" aria-label="Agent socket ${i + 1}.">${rings(b.x - 18, b.y - 2, b.w + 22, b.h + 4)}`;
      s += `<rect x="${b.x - 14}" y="${b.y + 6}" width="10" height="${b.h - 12}" rx="1.5" fill="#141617" stroke="#000"/>`;
      for (let j = 0; j < 14; j++) s += `<rect x="${b.x - 12}" y="${b.y + 12 + j * 8.8}" width="6" height="2.2" class="pad"/>`;
      s += `<g class="dyn" id="dyn-slot${i}"></g></g>`;
    }

    // files bank
    s += silk(FILEX, 18, 'U20-U36 FILES ON DISK (FLASH)', 'small');
    s += `<g id="files"></g>`;
    s += `<g id="overlay"></g><g id="jumpers"></g><g id="probe"></g><g id="pulses"></g><g id="fx"></g>`;
    svg.innerHTML = s;
    traceLayer = $('#traces'); viaLayer = $('#vias');
  }

  // ---------- files bank (built incrementally so focus survives updates) ----------
  const fileGroups = new Map();
  function ensureFileGroups() {
    const host = $('#files');
    for (const path of fileList()) {
      if (fileGroups.has(path)) continue;
      const cy = fileCy(path), x = FILEX;
      const g = el('g', { 'data-sel': `file:${path}`, tabindex: '0', role: 'button', 'aria-label': `File ${path}. Open every call that touched it.` }, host);
      let s = `<rect class="focus-ring" x="${x - 6}" y="${cy - 16}" width="${1196 - x + 4}" height="32" rx="4"/><g class="heat"></g>`;
      for (const dy of [-5, 5]) s += `<rect x="${x - 4}" y="${cy + dy - 1.3}" width="5" height="2.6" class="pad"/><rect x="${x + 35}" y="${cy + dy - 1.3}" width="5" height="2.6" class="pad"/>`;
      s += `<rect class="fbody" x="${x}" y="${cy - 11}" width="36" height="22" rx="1.5" fill="url(#chipG)" stroke="#000"/><circle cx="${x + 4}" cy="${cy - 7}" r="1.2" fill="#555"/><rect class="fburn" x="${x}" y="${cy - 11}" width="36" height="22" rx="1.5" fill="#ffd27a" opacity="0"/>`;
      s += `<g class="dyn"></g>`;
      g.innerHTML = s;
      fileGroups.set(path, g);
      // pre-route its read and write traces
      traceFor(`file:${path}`, 'tool:files'); traceFor('tool:edits', `file:${path}`);
    }
  }

  // ---------- pulses, timers and effects (animation time) ----------
  let animNow = 0;
  const pulses = [];
  const timers = [];
  const fx = [];
  const later = (ms, fn) => timers.push({ at: animNow + ms, fn });
  const STYLE_SPEED = { stream: 360, burst: 760, square: 520, wave: 300, ring: 260, bits: 470, diamond: 420 };
  function styleFor(kind, hop) {
    if (kind === 'files') return 'stream';
    if (kind === 'edits') return 'burst';
    if (kind === 'shell') return hop.from === 'tool:shell' || hop.from === 'terminal' ? 'square' : 'stream';
    if (kind === 'network') return 'wave';
    if (kind === 'agents') return 'ring';
    if (kind === 'memory') return 'bits';
    return 'diamond';
  }
  function makePulse(style, size, err, label, callId) {
    const layer = $('#pulses');
    const g = el('g', { 'data-sel': `call:${callId}` }, layer);
    el('circle', { r: (size * 2.5).toFixed(1), fill: err ? 'url(#haloRed)' : 'url(#halo)' }, g);
    const rot = el('g', {}, g);
    const core = err ? '#ffb0a4' : '#fff4d0';
    if (style === 'burst') el('rect', { x: -size * 2.4, y: -size * 0.75, width: size * 4.8, height: size * 1.5, rx: size * 0.75, fill: err ? '#ff8a7a' : '#fffaf0' }, rot);
    else if (style === 'square') el('rect', { x: -size * 0.75, y: -size * 0.75, width: size * 1.5, height: size * 1.5, fill: core }, rot);
    else if (style === 'ring') { el('circle', { r: size * 1.1, fill: 'none', stroke: core, 'stroke-width': 1.8 }, rot); el('circle', { r: size * 0.35, fill: core }, rot); }
    else if (style === 'bits') for (let i = 0; i < 5; i++) el('rect', { x: -7 + i * 3, y: -1.4, width: 2.2, height: 2.8, fill: i % 2 ? '#ffb53a' : '#fff4d0' }, rot);
    else if (style === 'diamond') el('rect', { x: -size * 0.7, y: -size * 0.7, width: size * 1.4, height: size * 1.4, transform: 'rotate(45)', fill: core }, rot);
    else el('circle', { r: Math.max(1.2, size * 0.7), fill: core }, rot);
    if (label) { const t = el('text', { class: `pulse-label${err ? ' err' : ''}`, x: size + 4, y: -size - 2 }, g); t.textContent = label; }
    g.style.display = 'none';
    return { g, rot };
  }
  function addPulse(tr, opts) {
    if (pulses.length > 220) { const old = pulses.shift(); old.g.remove(); }
    const { g, rot } = makePulse(opts.style, opts.size, opts.err, opts.label, opts.callId);
    pulses.push({ tr, g, rot, t0: animNow + opts.delay, dur: opts.dur, style: opts.style, wiggle: opts.style === 'wave' && !reduced });
  }
  function playHop(call, hop, delay) {
    const err = /error|failure/i.test(hop.what || '');
    const amount = hop.tokens || (hop.bytes ? hop.bytes / 4 : 0);
    const size = clamp(1.7 + Math.log10(amount + 10) * 1.15, 2, 7.2);
    const label = hop.tokens ? `${fmtK(hop.tokens)} tok` : hop.bytes ? fmtB(hop.bytes) : '';
    if (hop.from.startsWith('web:')) return radio(call, hop, delay, size, label);
    const tr = traceFor(hop.from, hop.to); if (!tr) return 0;
    tr.uses.push(call.id); if (tr.uses.length > 60) tr.uses.shift();
    const style = styleFor(call.kind, hop);
    const speed = STYLE_SPEED[style] * (reduced ? 3 : 1);
    const dur = clamp(tr.info.len / speed * 1000, reduced ? 160 : 300, 1800);
    later(delay, () => { tr.warmAt = animNow; if (err) tr.errAt = animNow; });
    if (style === 'stream' && !reduced) {
      const n = clamp(Math.round(Math.log2(amount + 2)), 2, 11);
      for (let i = 0; i < n; i++) addPulse(tr, { style, size: i === 0 ? size * 0.75 : clamp(size * 0.45, 1.6, 3), err, label: i === 0 ? label : '', callId: call.id, delay: delay + i * 75, dur });
      later(delay + dur + (n - 1) * 75, () => arrive(call, hop, err));
      return dur + (n - 1) * 75;
    }
    if (style === 'square' && !reduced) {
      for (let i = 0; i < 3; i++) addPulse(tr, { style, size: i === 0 ? size * 0.8 : size * 0.55, err, label: i === 0 ? label : '', callId: call.id, delay: delay + i * 110, dur });
      later(delay + dur + 220, () => arrive(call, hop, err));
      return dur + 220;
    }
    addPulse(tr, { style, size, err, label, callId: call.id, delay, dur });
    later(delay + dur, () => arrive(call, hop, err));
    return dur;
  }
  function playHops(call, hops, delay0 = 0) {
    let delay = delay0, i = 0;
    while (i < hops.length) {
      const group = [hops[i]];
      while (i + group.length < hops.length && hops[i + group.length].to === hops[i].to) group.push(hops[i + group.length]);
      let maxDur = 0;
      for (const hop of group) maxDur = Math.max(maxDur, playHop(call, hop, delay));
      delay += maxDur * 0.95;
      i += group.length;
    }
    return delay;
  }
  // radio: web pages arrive as wavefronts from the host label to the antenna
  function radio(call, hop, delay, size, label) {
    const i = HOSTS.findIndex(n => n.id === hop.from);
    const b = hostBox(Math.max(0, i));
    const sx = b.x + b.w - 4, sy = b.y + b.h / 2;
    const dist = Math.hypot(ANT.x - sx, ANT.y - sy);
    const ang = Math.atan2(ANT.y - sy, ANT.x - sx);
    const n = reduced ? 1 : clamp(Math.round(size), 3, 6);
    const dur = reduced ? 400 : 1100;
    for (let k = 0; k < n; k++) {
      const path = el('path', { fill: 'none', stroke: '#ffe2a0', 'stroke-width': 1.6, opacity: 0, filter: 'url(#glow)', 'data-sel': `call:${call.id}` }, $('#fx'));
      fx.push({ t0: animNow + delay + k * 140, dur, el: path, update(p) {
        const r = 6 + p * dist, a0 = ang - 0.42, a1 = ang + 0.42;
        path.setAttribute('d', `M${sx + r * Math.cos(a0)} ${sy + r * Math.sin(a0)}A${r} ${r} 0 0 1 ${sx + r * Math.cos(a1)} ${sy + r * Math.sin(a1)}`);
        path.setAttribute('opacity', (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) * 0.8).toFixed(2));
      } });
    }
    if (label) {
      const t = el('text', { class: 'pulse-label', x: sx + 6, y: sy - 6, opacity: 0 }, $('#fx')); t.textContent = `${label} rx`;
      fx.push({ t0: animNow + delay, dur: dur + 600, el: t, update(p) { t.setAttribute('opacity', (1 - p).toFixed(2)); } });
    }
    later(delay + dur + (n - 1) * 140, () => { toolKick.network = animNow; antKick = animNow; });
    return dur + (n - 1) * 140;
  }
  const toolKick = {};
  let antKick = -1e9, ctxKick = -1e9, planKick = -1e9, j1Kick = -1e9, j2Kick = -1e9, termKick = -1e9, memKick = -1e9, hdrKick = -1e9;
  const burnAt = new Map();
  function arrive(call, hop, err) {
    const to = rid(hop.to);
    if (to === 'context') ctxKick = animNow;
    else if (to.startsWith('file:')) burnAt.set(to.slice(5), animNow);
    else if (to.startsWith('slot:')) slotFlash[+to.slice(5)] = animNow;
    else if (to === 'plan') planKick = animNow;
    else if (to === 'answer') j2Kick = animNow;
    else if (to === 'terminal') termKick = animNow;
    else if (to.startsWith('tool:')) { toolKick[to.slice(5)] = animNow; if (to === 'tool:memory') memKick = animNow; if (to === 'tool:other') hdrKick = animNow; }
    if (to === 'tool:edits' && !err) { /* the write driver charges its flash bank */ }
  }
  function smoke(x, y, red) {
    if (reduced) return;
    for (let i = 0; i < 5; i++) {
      const c = el('circle', { cx: x, cy: y, r: 4, fill: 'url(#smokeG)', opacity: 0 }, $('#fx'));
      const dx = (Math.random() - 0.5) * 18;
      fx.push({ t0: animNow + i * 160, dur: 2600, el: c, update(p) { c.setAttribute('cx', x + dx * p); c.setAttribute('cy', y - p * 46); c.setAttribute('r', 4 + p * 14); c.setAttribute('opacity', (p < 0.1 ? p * 6 : 0.6 * (1 - p)).toFixed(2)); } });
    }
    spark(x, y, red);
  }
  function spark(x, y, red) {
    const pts = []; let px = x, py = y;
    for (let i = 0; i < 6; i++) { pts.push(`${px.toFixed(1)} ${py.toFixed(1)}`); px += (Math.random() - 0.3) * 12; py += (Math.random() - 0.5) * 14; }
    const p = el('path', { d: `M${pts.join('L')}`, fill: 'none', stroke: red ? '#ff8a7a' : '#fff6d0', 'stroke-width': 1.8, filter: 'url(#glow)', opacity: 0 }, $('#fx'));
    fx.push({ t0: animNow, dur: reduced ? 250 : 520, el: p, update(t) { p.setAttribute('opacity', (Math.random() > 0.3 ? 1 - t : 0.2).toFixed(2)); } });
    if (reduced) return;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 18;
      const c = el('circle', { cx: x, cy: y, r: 1.2, fill: red ? '#ff9a7a' : '#ffd27a' }, $('#fx'));
      fx.push({ t0: animNow, dur: 500, el: c, update(t) { c.setAttribute('cx', x + Math.cos(a) * v * t); c.setAttribute('cy', y + Math.sin(a) * v * t + t * t * 8); c.setAttribute('opacity', (1 - t).toFixed(2)); } });
    }
  }
  function discharge() {
    const { x, y, w } = CTX;
    const p = el('path', { fill: 'none', stroke: '#fff', 'stroke-width': 2, filter: 'url(#glow)' }, $('#fx'));
    const t = el('text', { class: 'silk mid amber', x: x + w / 2, y: y + 66, 'text-anchor': 'middle', opacity: 0 }, $('#fx')); t.textContent = 'COMPACTED - DISCHARGE';
    fx.push({ t0: animNow, dur: reduced ? 600 : 1500, el: p, update(q) {
      let d = `M${x + 10} ${y + 64}`; for (let i = 1; i <= 16; i++) d += `L${x + 10 + i * (w - 20) / 16} ${y + 64 + (Math.random() - 0.5) * 22}`;
      p.setAttribute('d', d); p.setAttribute('opacity', (1 - q).toFixed(2)); t.setAttribute('opacity', (q < 0.2 ? q * 5 : 1 - q).toFixed(2));
    }, done() { t.remove(); } });
  }

  // ---------- events from the simulator ----------
  const startHops = new Map();
  let lastRecord = 0;
  function bumpRecord(t) { if (t > lastRecord) lastRecord = t; }
  for (const c of S.calls) { bumpRecord(c.startedAt); if (c.endedAt) bumpRecord(c.endedAt); }
  for (const m of S.markers) bumpRecord(m.time);

  sim.on('start', call => {
    bumpRecord(call.startedAt);
    startHops.set(call.id, call.flow.length);
    playHops(call, call.flow.slice());
    if (call.kind === 'shell') termAdd(`$ ${call.target ? call.target.value : call.tool}${call.lane !== 'main' ? `   [${short(call.laneLabel, 14)}]` : ''}`, 'cmd', call.id);
  });
  sim.on('end', call => {
    bumpRecord(call.endedAt);
    const n0 = startHops.has(call.id) ? startHops.get(call.id) : call.flow.findIndex(h => h.from.startsWith('tool:') || h.from.startsWith('file:') || h.from.startsWith('web:') || h.from.startsWith('lane:') || h.from === 'mcp:github');
    startHops.delete(call.id);
    let pre = 0;
    if (call.kind === 'shell') {
      const b = T.shell; spark(678, 344, call.status === 'error'); shellDischarge = animNow; pre = 180;
      const out = call.output || {};
      for (const line of (out.preview || []).slice(0, 4)) termAdd(`  ${line}`, /✖|fail [1-9]|Error/.test(line) ? 'bad' : '', call.id);
      termAdd(call.status === 'error' ? `⚠ ${call.error.code}  ${short(call.error.message, 40)}` : `exit 0  ${short(out.summary || '', 36)}`, call.status === 'error' ? 'bad' : 'ok', call.id);
      void b;
    }
    playHops(call, call.flow.slice(Math.max(0, n0)), pre);
    if (call.status === 'error') {
      const [cx, cy] = T[call.kind].chip;
      later(pre + 120, () => smoke(cx, cy, true));
      if (call.kind === 'edits' && call.target) { const fy = fileCy(call.target.value); later(300, () => smoke(FILEX + 18, fy, true)); }
    }
    if (call.retryOf) later(200, () => jumperKick.set(call.id, animNow));
    dirty = true;
  });
  sim.on('marker', m => {
    bumpRecord(m.time);
    if (m.kind === 'prompt') { j1Kick = animNow; const tr = traceFor('user', 'context'); if (tr) { addPulse(tr, { style: 'burst', size: 5, err: false, label: `prompt ${m.detail.tokens || ''} tok`, callId: 'marker', delay: 0, dur: 900 }); later(900, () => { ctxKick = animNow; }); } }
    if (m.kind === 'turn-complete') { const tr = traceFor('context', 'answer'); if (tr) { addPulse(tr, { style: 'burst', size: 5.5, err: false, label: 'reply', callId: 'marker', delay: 0, dur: 1000 }); later(1000, () => { j2Kick = animNow; }); } }
    if (m.kind === 'compaction') discharge();
    if (m.kind === 'context-file') { const tr = traceFor(`ctxfile:${m.detail.path}`, 'context'); if (tr) { addPulse(tr, { style: 'stream', size: 4.5, err: false, label: `${fmtK(m.detail.tokens)} tok`, callId: 'marker', delay: 0, dur: 900 }); later(900, () => { ctxKick = animNow; }); } }
    dirty = true;
  });
  sim.on('lane', lane => { assignSlot(lane); dirty = true; });
  sim.on('tasks', () => { planKick = animNow; dirty = true; });
  let dirty = true;
  sim.on('tick', () => { dirty = true; });
  let shellDischarge = -1e9;
  const jumperKick = new Map();

  // ---------- terminal ----------
  const termLines = [];
  let termShift = 0;
  function termAdd(text, cls, callId) { termLines.push({ text, cls, callId }); if (termLines.length > 40) termLines.shift(); termShift = reduced ? 0 : 1; renderTerm(); }
  function seedTerminal() {
    for (const c of S.calls.filter(c => c.kind === 'shell').slice(-4)) {
      termLines.push({ text: `$ ${c.target.value}`, cls: 'cmd', callId: c.id });
      if (c.status === 'running') continue;
      for (const line of ((c.output && c.output.preview) || []).slice(0, 3)) termLines.push({ text: `  ${line}`, cls: /✖|fail [1-9]/.test(line) ? 'bad' : '', callId: c.id });
      termLines.push(c.status === 'error' ? { text: `⚠ ${c.error.code}  ${short(c.error.message, 40)}`, cls: 'bad', callId: c.id } : { text: `exit 0  ${short(c.output.summary || '', 36)}`, cls: 'ok', callId: c.id });
    }
  }
  function renderTerm() {
    const lines = termLines.slice(-10);
    $('#termLines').innerHTML = lines.map((l, i) => `<text class="termline ${l.cls}" x="${TERM.x + 34}" y="${TERM.y + 14 + i * 11}" data-sel="call:${l.callId}">${esc(short(l.text, 40))}</text>`).join('');
  }

  // ---------- derived data ----------
  function errorsByKind() { const o = {}; for (const c of S.errors) o[c.kind] = (o[c.kind] || 0) + 1; return o; }
  function lastPromptTime() { const m = [...S.markers].reverse().find(x => x.kind === 'prompt'); return m ? m.time : 0; }
  function sessionStatus() {
    const age = S.now - lastRecord;
    if (!sim.running) return { text: 'PAUSED', cls: 'quiet', quiet: true };
    if (S.session.status === 'complete') return { text: 'TURN COMPLETE', cls: 'done', quiet: age >= 30000 };
    if (age >= 30000) return { text: 'QUIET', cls: 'quiet', quiet: true };
    return { text: 'RECENT ACTIVITY', cls: '', quiet: false };
  }
  function activeKind() {
    const st = sessionStatus();
    if (st.quiet || S.session.status !== 'active') return null;
    const run = sim.runningCalls().filter(c => c.lane === 'main');
    if (run.length) return run[run.length - 1].kind;
    const last = S.calls[S.calls.length - 1];
    return last ? last.kind : null;
  }
  const callsCausedBy = id => S.calls.filter(c => c.causedBy === id);
  const retriesOf = id => S.calls.filter(c => c.retryOf === id);
  function foldedActivity(limit = 22) {
    const ev = [];
    for (const c of S.calls.slice(-160)) ev.push({ t: c.startedAt, kind: c.kind, label: c.label, tool: c.tool, status: c.status, id: c.id, lane: c.lane, laneLabel: c.laneLabel, code: c.error && c.error.code });
    for (const m of S.markers.slice(-40)) ev.push({ t: m.time, kind: 'marker', label: m.label, tool: m.kind, status: m.kind, id: null, lane: 'main' });
    ev.sort((a, b) => b.t - a.t);
    const out = [];
    for (const e of ev) {
      const p = out[out.length - 1];
      if (p && p.kind === e.kind && p.label === e.label && p.status === e.status && p.lane === e.lane && p.tool === e.tool) { p.count++; p.ids.push(e.id); continue; }
      if (out.length >= limit) break;
      out.push({ ...e, count: 1, ids: [e.id] });
    }
    return out;
  }
  function ctxAt(t) { let v = null; for (const s of S.context.samples) { if (s.time > t) break; v = s; } return v; }

  // ---------- per-tick board rendering ----------
  function renderTools(espNow, ebk, act) {
    const running = sim.runningCalls();
    const lp = lastPromptTime();
    for (const k of KINDS) {
      const b = T[k], g = $(`#tool-${k}`);
      g.classList.toggle('is-active', act === k);
      g.classList.toggle('is-running', running.some(c => c.kind === k));
      let s = `<text class="silk big" x="${TX + TW - 3}" y="${b.y + 30}" text-anchor="end">${S.counts[k]}</text><text class="silk small dim" x="${TX + TW - 3}" y="${b.y + 39}" text-anchor="end">CALLS</text>`;
      if (act === k) s += `<text class="silk small amber" x="${TX + TW - 3}" y="${b.y + 48}" text-anchor="end">ACTIVE</text>`;
      const errs = S.errors.filter(c => c.kind === k);
      // scorch marks: newest few, bright if since the last prompt
      errs.slice(-3).forEach(c => {
        const [cx, cy] = b.chip; const h = hash(c.id);
        const fresh = c.startedAt >= lp;
        s += `<circle cx="${(cx + (h - 0.5) * 22).toFixed(1)}" cy="${(cy + (hash(c.id + 'y') - 0.5) * 16).toFixed(1)}" r="${(10 + h * 7).toFixed(1)}" fill="url(#scorchG)" opacity="${fresh ? 0.95 : 0.4}" data-sel="error:${c.id}"/>`;
      });
      // error tags: errors since prompt count, latest code
      let ty = b.y + (act === k ? 52 : 44);
      if (espNow[k]) { s += errTag(TX + TW - 54, ty, `${espNow[k]} SINCE P`, null, false, 54); ty += 12; }
      const last = errs[errs.length - 1];
      if (last && ty + 10 < b.y + b.h + 2) s += errTag(TX + TW - 54, ty, last.error.code, last.id, last.startedAt < lp, 54);
      // jumpers: retries rerouted around the scorched part
      const retries = S.calls.filter(c => c.kind === k && c.retryOf).slice(-2);
      retries.forEach((c, j) => {
        // a bodge wire that reroutes around the scorched part: out of the block into the channel and back
        const x0 = TX + 5, y0 = b.y + 13 + j * 4, y1 = b.y + b.h - 5 - j * 4, bx = TX - 22 - j * 9;
        const d = `M${x0} ${y0}C${bx} ${y0 - 4} ${bx} ${y1 + 4} ${x0} ${y1}`;
        const ok = c.status === 'success', run = c.status === 'running';
        const kick = jumperKick.get(c.id); const glow = kick != null && animNow - kick < 1600;
        const tip = ok ? '#d9b04a' : run ? '#ffb53a' : '#d0352a';
        s += `<g data-sel="call:${c.id}"><title>Retry ${c.id} (attempt ${c.attempt}) of ${c.retryOf}: ${c.status}</title><path d="${d}" fill="none" stroke="#000" stroke-width="3.6" opacity=".5" transform="translate(1.5 2)"/><path d="${d}" fill="none" stroke="${glow ? '#ffe2a0' : '#efe6cc'}" stroke-width="2.2"/><circle cx="${x0}" cy="${y0}" r="2.3" fill="#c9ced2"/><circle cx="${x0}" cy="${y1}" r="2.3" fill="#c9ced2"/><circle cx="${bx + 6}" cy="${(y0 + y1) / 2}" r="2.6" fill="${tip}" stroke="#000" stroke-width=".5"/></g>`;
      });
      $(`#dyn-${k}`).innerHTML = s;
    }
    // socket LEDs and EEPROM bits
    for (let i = 0; i < NSLOT; i++) { const l = slotLane[i] && sim.laneByKey(slotLane[i]); $(`#sockled${i}`).setAttribute('fill', !l ? '#3b2a12' : l.state === 'running' ? '#ffb53a' : l.state === 'failed' ? '#d0352a' : '#d9b04a'); }
  }
  function errTag(x, y, text, id, old, w) {
    return `<g class="errtag${old ? ' old' : ''}" ${id ? `data-sel="error:${id}"` : ''}><rect x="${x}" y="${y}" width="${w}" height="10" rx="1.5"/><path d="M${x + 5} ${y + 1.6}l3.6 6.6h-7.2z"/><text x="${x + 11}" y="${y + 7.6}">${esc(short(text, 10))}</text></g>`;
  }
  function renderFiles(lp) {
    ensureFileGroups();
    for (const [path, g] of fileGroups) {
      const f = S.files[path];
      const cy = fileCy(path), x = FILEX;
      const hot = f && f.edits >= HOT_EDITS;
      g.querySelector('.heat').innerHTML = hot ? `<ellipse cx="${x + 18}" cy="${cy}" rx="34" ry="20" fill="url(#heatG)"/>` : '';
      let s = `<text class="silk${f ? '' : ' dim'}" x="${x + 44}" y="${cy - 2}" font-size="9.5">${esc(short(path, 28))}</text>`;
      if (f) {
        const parts = [`R${f.reads}`, `W${f.edits}`];
        if (f.added || f.removed) parts.push(`+${f.added} −${f.removed}`);
        s += `<text class="silk small${f ? '' : ' dim'}" x="${x + 44}" y="${cy + 8}">${parts.join('  ')}${f.failed ? '' : ''}</text>`;
        if (f.failed) {
          s += `<circle cx="${x + 26}" cy="${cy + 3}" r="9" fill="url(#scorchG)" opacity=".9"/>`;
          s += `<text class="silk small red" x="${x + 44 + parts.join('  ').length * 4.6 + 6}" y="${cy + 8}">✖${f.failed} FAIL</text>`;
        }
        if (hot) s += `<g><rect x="${1196 - 30}" y="${cy - 10}" width="26" height="10" rx="2" fill="#2a1200" stroke="#ff9a3a"/><text x="${1196 - 17}" y="${cy - 2.4}" text-anchor="middle" font-size="7" font-weight="700" fill="#ffb347">HOT</text></g>`;
        const wr = f.edits ? clamp(0.06 + f.edits * 0.05, 0, 0.3) : 0;
        g.querySelector('.fbody').setAttribute('fill', wr ? '#3a2a12' : 'url(#chipG)');
      } else s += `<text class="silk small dim" x="${x + 44}" y="${cy + 8}">untouched</text>`;
      g.querySelector('.dyn').innerHTML = s;
      g.classList.toggle('touched', !!f);
      void lp;
    }
  }
  function renderHosts() {
    HOSTS.forEach((n, i) => {
      const b = hostBox(i);
      const calls = hostCalls(n.label);
      const errs = calls.filter(c => c.status === 'error').length;
      $(`#dyn-host${i}`).innerHTML = `<text class="silk small ${calls.length ? 'amber' : 'dim'}" x="${b.x + b.w - 5}" y="${b.y + 9}" text-anchor="end">${calls.length} rx</text>${errs ? `<text class="silk small red" x="${b.x + b.w - 5}" y="${b.y + 17.5}" text-anchor="end">⚠${errs}</text>` : ''}`;
    });
  }
  function hostCalls(host) {
    return S.calls.filter(c => c.kind === 'network' && (c.flow.some(h => h.from === `web:${host}`) || (c.target && c.target.type === 'url' && hostOf(c.target.value) === host)));
  }
  function renderRoms() {
    CTXFILES.forEach((n, i) => {
      const b = romBox(i);
      const loaded = S.context.files.find(f => f.path === n.label);
      let s = '';
      if (loaded) {
        for (let j = 0; j < 8; j++) s += `<rect x="${b.x + 8 + j * 13}" y="${b.y + 3}" width="4" height="6" class="pad"/><rect x="${b.x + 8 + j * 13}" y="${b.y + b.h - 9}" width="4" height="6" class="pad"/>`;
        s += `<rect x="${b.x}" y="${b.y + 8}" width="${b.w}" height="${b.h - 16}" rx="2" fill="url(#chipG)" stroke="#000" filter="url(#shadow)"/><path d="M${b.x} ${b.y + 18}a5 5 0 0 1 0 10" fill="#050505"/>`;
        s += `<text x="${b.x + 8}" y="${b.y + 20}" font-size="7.5" fill="#d9dcd2">${esc(short(n.label, 20))}</text><text x="${b.x + 8}" y="${b.y + 31}" font-size="7" fill="#ffcf6a">${fmtK(n.tokens)} tok · ${fmtT(loaded.loadedAt)}</text>`;
      } else {
        s += `<rect x="${b.x}" y="${b.y + 8}" width="${b.w}" height="${b.h - 16}" rx="2" fill="none" stroke="#eef0e4" stroke-dasharray="3 3" opacity=".5"/><text class="silk small dim" x="${b.x + 8}" y="${b.y + 21}">${esc(short(n.label, 20))}</text><text class="silk small dim" x="${b.x + 8}" y="${b.y + 31}">DNP · not loaded</text>`;
      }
      $(`#dyn-rom${i}`).innerHTML = s;
    });
  }
  function renderPlan() {
    const items = S.tasks.items;
    const done = items.filter(t => t.status === 'completed').length, prog = items.filter(t => t.status === 'in_progress').length;
    let s = `<text class="silk small ${done === items.length && items.length ? 'gold' : 'amber'}" x="${PLAN.x + PLAN.w - 8}" y="${PLAN.y + 12}" text-anchor="end">${done}/${items.length} DONE · ${prog} RUN · ${items.length - done - prog} WAIT</text>`;
    items.slice(0, 6).forEach((t, i) => {
      const y = PLAN.y + 28 + i * 15.5;
      const fill = t.status === 'completed' ? '#d9b04a' : t.status === 'in_progress' ? '#ffb53a' : 'none';
      const glyph = t.status === 'completed' ? '✔' : t.status === 'in_progress' ? '▶' : '○';
      s += `<g data-sel="task:${esc(t.id)}"><circle cx="${PLAN.x + 14}" cy="${y - 3}" r="4.5" fill="${fill}" stroke="${t.status === 'pending' ? '#a9b8a8' : '#000'}" ${t.status === 'in_progress' ? 'filter="url(#glow)" class="blinkled"' : ''}/>`;
      s += `<text class="silk small ${t.status === 'completed' ? 'gold' : t.status === 'in_progress' ? 'amber' : 'dim'}" x="${PLAN.x + 24}" y="${y}">${glyph} ${esc(short(t.label, 30))}</text></g>`;
    });
    if (!items.length) s += silk(PLAN.x + 10, PLAN.y + 34, 'No task list yet', 'small dim');
    $('#dyn-plan').innerHTML = s;
  }
  function renderSlots() {
    for (let i = 0; i < NSLOT; i++) {
      const b = slotBox(i);
      const g = $(`#slot${i}`);
      const key = slotLane[i];
      const lane = key && sim.laneByKey(key);
      if (!lane) {
        g.setAttribute('data-sel', 'agents'); g.setAttribute('aria-label', `Agent socket ${i + 1}, empty. Open all agent lanes.`);
        $(`#dyn-slot${i}`).innerHTML = `<rect x="${b.x}" y="${b.y + 4}" width="${b.w}" height="${b.h - 8}" rx="5" fill="none" stroke="#eef0e4" stroke-dasharray="4 3" opacity=".35"/>${silk(b.x + 10, b.y + 20, `J${6 + i} SLOT ${i + 1}`, 'small dim')}${silk(b.x + 10, b.y + 32, 'EMPTY', 'small dim')}`;
        continue;
      }
      g.setAttribute('data-sel', `lane:${lane.key}`); g.setAttribute('aria-label', `Subagent board ${lane.label}, ${lane.state}. Open its lane.`);
      const run = lane.state === 'running', fail = lane.state === 'failed';
      const led = run ? '#ffb53a' : fail ? '#d0352a' : '#d9b04a';
      const dur = (lane.endedAt || S.now) - lane.startedAt;
      let s = `<g class="db" filter="url(#shadow)"><rect x="${b.x}" y="${b.y + 3}" width="${b.w}" height="${b.h - 6}" rx="5" fill="url(#dbG)" stroke="${run ? '#ffb53a' : '#2d7a4e'}" stroke-width="${run ? 1.3 : 1}"/></g>`;
      for (let j = 0; j < 14; j++) s += `<rect x="${b.x - 3}" y="${b.y + 12 + j * 8.8}" width="7" height="2.4" class="pad"/>`;
      s += `<circle cx="${b.x + b.w - 7}" cy="${b.y + b.h - 10}" r="3" fill="url(#goldG)"/><circle cx="${b.x + b.w - 7}" cy="${b.y + b.h - 10}" r="1.4" fill="#020a05"/>`;
      s += `<text class="silk" x="${b.x + 8}" y="${b.y + 16}" font-weight="700">${esc(short(lane.label, 17))}</text>`;
      s += `<text class="silk small dim" x="${b.x + 8}" y="${b.y + 26}">${esc(short(`${lane.agentType} · ${lane.model.replace('claude-', '')}`, 22))}</text>`;
      s += `<circle cx="${b.x + b.w - 9}" cy="${b.y + 13}" r="4.2" fill="${led}" ${run ? 'filter="url(#glow)" class="blinkled"' : ''} stroke="#000" stroke-width=".6"/>`;
      // mini chip and its own traces
      s += `<path id="mini${i}" d="M${b.x + 40} ${b.y + 40}H${b.x + 62}V${b.y + 48}H${b.x + 110}M${b.x + 40} ${b.y + 56}H${b.x + 54}V${b.y + 62}H${b.x + 104}" fill="none" stroke="#c8763a" stroke-width="1.2" opacity=".85"/>`;
      s += `<rect x="${b.x + 8}" y="${b.y + 33}" width="32" height="30" rx="1.5" fill="url(#chipG)" stroke="#000"/><text x="${b.x + 12}" y="${b.y + 46}" font-size="6.5" fill="#8a9292">SA${lane.depth}</text><text x="${b.x + 12}" y="${b.y + 56}" font-size="6" fill="#6f7676">${esc(lane.key.slice(3, 9))}</text>`;
      if (fail) s += `<circle cx="${b.x + 24}" cy="${b.y + 48}" r="16" fill="url(#scorchG)"/>`;
      s += `<text class="silk small ${run ? 'amber' : fail ? 'red' : 'gold'}" x="${b.x + 8}" y="${b.y + 76}">${run ? '▶ RUNNING' : fail ? '⚠ FAILED' : '✔ DONE'} ${fmtDur(dur)}</text>`;
      s += `<text class="silk small" x="${b.x + 8}" y="${b.y + 87}">${lane.calls}c · ${lane.errors}e · ${fmtK(lane.tokens)} tok</text>`;
      const task = lane.task || '';
      s += `<text class="silk small dim" x="${b.x + 8}" y="${b.y + 98}">${esc(short(task, 23))}</text>`;
      if (lane.result) s += `<text class="silk small ${fail ? 'red' : 'gold'}" x="${b.x + 8}" y="${b.y + 109}">${esc(short(lane.result, 23))}</text>`;
      s += `<text class="silk small dim" x="${b.x + 8}" y="${b.y + 120}">from ${esc(lane.parent === 'main' ? 'main' : short((sim.laneByKey(lane.parent) || {}).label || lane.parent, 9))} · ${fmtT(lane.startedAt)}</text>`;
      if (fail) s += errTag(b.x + 8, b.y + 125, 'AGENT_FAILED', (S.calls.filter(c => c.kind === 'agents' && c.status === 'error' && c.input && c.input.result_of === lane.key)[0] || {}).id, false, 64);
      // nested mezzanine boards (depth 2+) ride above the board's own traces
      const kids = S.lanes.filter(l => l.depth > 1 && slotOf.get(l.key) === i);
      kids.slice(-1).forEach(k => {
        const mx = b.x + 50, my = b.y + 29;
        const kr = k.state === 'running', kf = k.state === 'failed';
        s += `<g data-sel="lane:${k.key}" filter="url(#shadow)"><rect x="${mx}" y="${my}" width="58" height="40" rx="3" fill="#1d7a48" stroke="${kr ? '#ffb53a' : '#38a06a'}"/>`;
        for (const [sx, sy] of [[mx + 4, my + 4], [mx + 54, my + 4], [mx + 4, my + 36], [mx + 54, my + 36]]) s += `<circle cx="${sx}" cy="${sy}" r="2" fill="#c9ced2"/>`;
        s += `<text class="silk small" x="${mx + 8}" y="${my + 12}" font-weight="700">${esc(short(k.label, 10))}</text><text class="silk small dim" x="${mx + 8}" y="${my + 22}">depth ${k.depth}</text><text class="silk small ${kr ? 'amber' : kf ? 'red' : 'gold'}" x="${mx + 8}" y="${my + 32}">${kr ? 'RUN' : kf ? 'FAIL' : 'DONE'} · ${k.calls}c</text><circle cx="${mx + 50}" cy="${my + 12}" r="3" fill="${kr ? '#ffb53a' : kf ? '#d0352a' : '#d9b04a'}"/></g>`;
      });
      s += `<circle id="miniDot${i}" r="2.2" fill="#fff4d0" filter="url(#glow)" opacity="0"/>`;
      $(`#dyn-slot${i}`).innerHTML = s;
    }
  }
  function renderPower() {
    const t = S.tokens; const max = Math.max(t.input, t.output, t.cacheRead, 1);
    for (const [id, v] of [['railIn', t.input], ['railOut', t.output], ['railCache', t.cacheRead]]) { $(`#${id}`).textContent = fmtK(v); $(`#${id}Bar`).setAttribute('width', (6 + 148 * v / max).toFixed(1)); }
    $('#turnSeg').textContent = pad2(S.session.turn);
    $('#turnSub').textContent = `${S.markers.filter(m => m.kind === 'prompt').length} PROMPTS`;
    $('#turnSub2').textContent = `${S.markers.filter(m => m.kind === 'turn-complete').length} REPLIES`;
  }
  function renderClock(st) {
    $('#clockT').textContent = fmtT(S.now);
    $('#clockSub').textContent = `LAST RECORD ${fmtAgo(S.now - lastRecord)}`;
    $('#clockSub2').textContent = `TURN ${S.session.turn} · SPEED ${sim.speed}x`;
    const c = $('#clockSub3'); c.textContent = st.text; c.setAttribute('class', `silk small ${st.cls === 'done' ? 'gold' : st.quiet ? 'dim' : 'amber'}`);
  }
  function renderCPU(act) {
    $('#cpuModel').textContent = S.session.model;
    const run = sim.runningCalls().filter(c => c.lane === 'main');
    $('#cpuState').textContent = run.length ? `CALLING ${run[0].tool.toUpperCase()}` : S.session.status === 'complete' ? 'IDLE · TURN DONE' : 'THINKING';
    $('#cpuSub').textContent = `${S.calls.length} CALLS · ${S.errors.length} ERR`;
    $('#cpuSub2').textContent = act ? `ACTIVE: ${KI[act].name.toUpperCase()}` : 'NO ACTIVE KIND';
  }
  function renderCtxStatic() {
    const c = S.context;
    $('#ctxPct').textContent = `${c.percent.toFixed(1)}%`;
    $('#ctxPct').setAttribute('class', `silk big ${c.percent >= 90 ? 'red' : c.percent >= 70 ? 'amber' : ''}`);
    $('#ctxCap').textContent = `${fmtK(c.used)} / ${fmtK(c.capacity)} tok · 10k per cap`;
    $('#ctxComp').textContent = `${c.compactions} COMPACTION${c.compactions === 1 ? '' : 'S'} · ${c.files.length} FILES`;
    // sparkline over the last 30 minutes
    const { x, y, w, h } = CTX; const sx = x + 52, sw = w - 60, sy = y + h - 4, sh = 18;
    const t1 = S.now, t0 = t1 - WINDOW;
    const pts = c.samples.filter(s => s.time >= t0).map(s => [sx + (s.time - t0) / WINDOW * sw, sy - s.percent / 100 * sh]);
    if (pts.length) {
      const d = `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}L${sx + sw} ${pts[pts.length - 1][1].toFixed(1)}`;
      $('#ctxSpark').setAttribute('d', d); $('#ctxSparkFill').setAttribute('d', `${d}L${sx + sw} ${sy}L${pts[0][0].toFixed(1)} ${sy}Z`);
      $('#ctxSpark').setAttribute('stroke', c.percent >= 90 ? '#ff7a6a' : c.percent >= 70 ? '#ffcf6a' : '#ffb53a');
    }
  }
  function renderHeader(st, act) {
    const ss = S.session;
    const esp = sim.errorsSincePrompt();
    const espN = Object.values(esp).reduce((a, b) => a + b, 0);
    $('#identity').innerHTML = [
      `<span class="chip status ${st.cls}">${st.text}</span>`,
      `<span class="chip"><em>last</em>${fmtAgo(S.now - lastRecord)}</span>`,
      `<span class="chip"><em>turn</em>${ss.turn}</span>`,
      espN ? `<span class="chip" style="border-color:#d0352a;color:#ffb0a4" title="Tool errors since the last prompt">⚠ ${espN}</span>` : '',
      `<span class="chip"><em>project</em>${esc(ss.project)}</span>`,
      `<span class="chip short" title="${esc(ss.name)}"><em>session</em>${esc(ss.name)}</span>`,
      `<span class="chip"><em>${esc(ss.provider)}</em>${esc(ss.model)}</span>`,
      `<span class="chip"><em>branch</em>${esc(ss.branch)}</span>`,
      `<span class="chip" title="${esc(ss.id)}"><em>id</em>${esc(ss.id.slice(0, 12))}…</span>`
    ].join('');
  }
  function renderAll() {
    const st = sessionStatus(), act = activeKind();
    const esp = sim.errorsSincePrompt(), ebk = errorsByKind(), lp = lastPromptTime();
    renderHeader(st, act); renderTools(esp, ebk, act); renderFiles(lp); renderHosts(); renderRoms(); renderPlan(); renderSlots(); renderPower(); renderClock(st); renderCPU(act); renderCtxStatic();
    renderProbe();
    updateMode();
  }

  // ---------- per-frame live updates ----------
  let ctxShown = S.context.percent;
  function updateLive() {
    // caps charge
    const target = S.context.percent;
    ctxShown += (target - ctxShown) * (reduced ? 1 : 0.08);
    const used = ctxShown / 100 * 200000;
    const kick = clamp(1 - (animNow - ctxKick) / 500, 0, 1);
    for (let i = 0; i < 20; i++) {
      const f = clamp((used - i * 10000) / 10000, 0, 1);
      const g = document.getElementById(`cap${i}`);
      const col = i >= 18 ? '#ff5a45' : i >= 14 ? '#ff9a2a' : '#ffb53a';
      const arc = g.children[1], fill = g.children[4];
      arc.setAttribute('stroke-dasharray', `${(f * 94.25).toFixed(1)} 100`); arc.setAttribute('stroke', col);
      fill.setAttribute('opacity', (f * 0.85 + (f > 0 && f < 1 ? kick * 0.4 : 0)).toFixed(2)); fill.setAttribute('fill', col);
    }
    // cpu die
    const run = sim.runningCalls();
    const mainRun = run.some(c => c.lane === 'main');
    const thinking = sim.running && S.session.status === 'active' && !mainRun;
    $('#cpuDie').setAttribute('opacity', (thinking ? 0.32 + 0.22 * Math.sin(animNow / 260) : mainRun ? 0.55 : 0.1).toFixed(2));
    // shell charge ring: fills while a command runs, then discharges
    const sh = run.filter(c => c.kind === 'shell');
    let frac = 0;
    if (sh.length) { const c = sh[0]; frac = clamp((S.now - c.startedAt) / (c.duration || 1), 0, 1); }
    else frac = clamp(1 - (animNow - shellDischarge) / 400, 0, 1);
    $('#shellCharge').setAttribute('stroke-dasharray', `${(frac * 94.25).toFixed(1)} 200`);
    $('#shellCharge').setAttribute('stroke', frac > 0.9 ? '#fff1c9' : '#ffb53a');
    // LEDs
    const blink = (t, ms) => animNow - t < ms;
    $('#j1led').setAttribute('fill', blink(j1Kick, 1200) ? '#ffb53a' : '#3b2a12');
    $('#j2led').setAttribute('fill', blink(j2Kick, 1500) ? '#d9b04a' : S.session.status === 'complete' ? '#8a6a1a' : '#3b2a12');
    $('#termLed').setAttribute('fill', blink(termKick, 400) || (sh.length && Math.sin(animNow / 70) > 0) ? '#ffb53a' : '#3b2a12');
    // EEPROM bits show the task states; flicker while being written
    const items = S.tasks.items;
    for (let i = 0; i < 8; i++) {
      const t = items[i];
      let fill = !t ? '#2a2012' : t.status === 'completed' ? '#d9b04a' : t.status === 'in_progress' ? (Math.sin(animNow / 220) > 0 ? '#ffb53a' : '#5a3a10') : '#3b2a12';
      if (blink(memKick, 700) && !reduced) fill = Math.random() > 0.5 ? '#fff1c9' : '#3b2a12';
      document.getElementById(`bit${i}`).setAttribute('fill', fill);
    }
    // expansion header pin scan
    const hk = animNow - hdrKick;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) document.getElementById(`hp${i}_${j}`).setAttribute('fill', hk < 900 && Math.floor(hk / 90) % 8 === i ? '#fff1c9' : 'url(#goldG)');
    // flash bank glow on writes
    const ek = clamp(1 - (animNow - (toolKick.edits || -1e9)) / 900, 0, 1);
    for (let i = 0; i < 3; i++) document.getElementById(`flash${i}`).setAttribute('fill', ek > 0 && i === Math.floor(animNow / 120) % 3 ? '#7a4a12' : 'url(#chipG)');
    // antenna glow
    const ant = document.querySelector('#tool-network path');
    if (ant) ant.setAttribute('stroke', blink(antKick, 600) || run.some(c => c.kind === 'network') && Math.sin(animNow / 150) > 0.3 ? '#fff1c9' : 'url(#goldG)');
    // file burn flashes
    for (const [path, t] of burnAt) {
      const g = fileGroups.get(path); if (!g) continue;
      const p = (animNow - t) / 1800;
      const r = g.querySelector('.fburn');
      if (p >= 1) { r.setAttribute('opacity', 0); burnAt.delete(path); continue; }
      r.setAttribute('fill', p < 0.15 ? '#ffffff' : '#ff9a3a'); r.setAttribute('opacity', (p < 0.15 ? 0.95 : 0.8 * (1 - p)).toFixed(2));
    }
    // traces warm up as data passes
    for (const tr of traces.values()) {
      const warm = animNow - tr.warmAt < 1400, er = animNow - tr.errAt < 2200;
      const p = tr.shared.p;
      const cls = `trace${warm ? ' warm' : ''}${er ? ' err' : ''}`;
      if (p.getAttribute('class') !== cls) p.setAttribute('class', cls);
    }
    // daughterboard boot slide and mini traces
    for (let i = 0; i < NSLOT; i++) {
      const g = document.getElementById(`dyn-slot${i}`);
      const p = clamp((animNow - slotInserted[i]) / 600, 0, 1);
      g.setAttribute('transform', p < 1 && !reduced ? `translate(${(1 - p) * (1 - p) * 40} 0)` : '');
      const lane = slotLane[i] && sim.laneByKey(slotLane[i]);
      const dot = document.getElementById(`miniDot${i}`), path = document.getElementById(`mini${i}`);
      if (dot && path && lane) {
        const live = lane.state === 'running' && !reduced;
        const flash = clamp(1 - (animNow - slotFlash[i]) / 700, 0, 1);
        if (live || flash > 0) {
          const L = path.getTotalLength(); const pt = path.getPointAtLength(((animNow / 6) % L));
          dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y); dot.setAttribute('opacity', live ? 1 : flash);
        } else dot.setAttribute('opacity', 0);
      }
    }
    // tool kick glow
    for (const k of KINDS) { const g = document.getElementById(`tool-${k}`); const on = animNow - (toolKick[k] || -1e9) < 450; if (g.classList.contains('kick') !== on) g.classList.toggle('kick', on); }
    // blinking leds
    for (const n of document.querySelectorAll('.blinkled')) n.setAttribute('opacity', reduced ? 1 : (0.55 + 0.45 * Math.sin(animNow / 180)).toFixed(2));
  }

  function updatePulses() {
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const t = (animNow - p.t0) / p.dur;
      if (t < 0) { p.g.style.display = 'none'; continue; }
      if (t >= 1) { p.g.remove(); pulses.splice(i, 1); continue; }
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const eased = p.style === 'burst' ? t * t * (3 - 2 * t) : 0.25 * t + 0.75 * e;
      const pt = pointAt(p.tr.info, eased * p.tr.info.len);
      let x = pt.x, y = pt.y;
      if (p.wiggle) { const w = Math.sin(eased * p.tr.info.len / 5) * 3.2; x += -Math.sin(pt.a) * w; y += Math.cos(pt.a) * w; }
      p.g.style.display = '';
      p.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      if (p.style === 'burst' || p.style === 'bits') p.rot.setAttribute('transform', `rotate(${(pt.a * 180 / Math.PI).toFixed(0)})`);
    }
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= animNow) { const t = timers[i]; timers.splice(i, 1); t.fn(); }
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i]; const p = (animNow - f.t0) / f.dur;
      if (p < 0) continue;
      if (p >= 1) { f.el.remove(); if (f.done) f.done(); fx.splice(i, 1); continue; }
      f.update(p);
    }
  }

  // ---------- selection / probe ----------
  let sel = null;          // e.g. 'call:c12', 'tool:files', 'moment:1712345'
  const history = [];
  function select(id, push = true) {
    if (id === 'overview') id = null;
    if (push && sel !== id) history.push(sel);
    sel = id;
    document.querySelectorAll('#board .selected').forEach(n => n.classList.remove('selected'));
    if (sel) { const n = svg.querySelector(`[data-sel="${CSS.escape(sel)}"]`); if (n && n.tagName === 'g') n.classList.add('selected'); }
    renderProbe(); renderInspector(true); drawTimeline(); drawScope(); updateMode();
  }
  function selectedCall() { if (!sel) return null; const [t, id] = [sel.split(':')[0], sel.slice(sel.indexOf(':') + 1)]; return (t === 'call' || t === 'error') ? sim.callById(id) : null; }
  function causeChain(call) { const out = []; let c = call; const seen = new Set(); while (c && c.causedBy && !seen.has(c.id) && out.length < 6) { seen.add(c.id); c = sim.callById(c.causedBy); if (c) out.push(c); } return out; }
  function renderProbe() {
    const layer = $('#probe');
    let s = '';
    let call = selectedCall();
    if (!call && sel && sel.startsWith('trace:')) { const tr = traces.get(sel.slice(6)); if (tr) s += `<path class="probe-path" d="${tr.d}"/>`; }
    if (call) {
      const chain = [call, ...causeChain(call)];
      chain.forEach((c, ci) => {
        c.flow.forEach((hop, hi) => {
          const tr = hop.from.startsWith('web:') ? null : traceFor(hop.from, hop.to);
          if (!tr) return;
          s += `<path class="probe-path${ci ? ' anc' : ''}" d="${tr.d}"/>`;
          if (hi === 0) { const p = pointAt(tr.info, tr.info.len * 0.5); const tag = `${ci ? `CAUSE ${ci}` : 'PROBE'} ${c.id}`; s += `<g class="probe-tag" data-sel="call:${c.id}"><rect x="${(p.x - 2).toFixed(1)}" y="${(p.y - 15).toFixed(1)}" width="${tag.length * 5.2 + 6}" height="11" rx="2"/><text x="${(p.x + 1).toFixed(1)}" y="${(p.y - 6.5).toFixed(1)}">${tag}</text></g>`; }
        });
      });
      // what it caused
      for (const c of callsCausedBy(call.id).slice(0, 4)) { const hop = c.flow[0]; const tr = hop && traceFor(hop.from, hop.to); if (tr) s += `<path class="probe-path anc" d="${tr.d}" style="stroke:#ffe2a0"/>`; }
    }
    layer.innerHTML = s;
  }

  // ---------- inspector ----------
  const insp = $('#insp');
  let inspKey = '', inspAt = 0;
  const L = (id, text) => `<button class="lnk" data-sel="${esc(id)}">${esc(text)}</button>`;
  const st = s => `<span class="st ${esc(s)}">${esc(String(s).replace('_', ' '))}</span>`;
  const callLink = c => c ? `${L(`call:${c.id}`, `${c.id} ${c.tool}`)} ${st(c.status)}` : '-';
  const dl = rows => `<dl>${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const nodeLink = id => {
    if (id.startsWith('file:')) return L(id, id.slice(5));
    if (id.startsWith('lane:')) { const l = sim.laneByKey(id.slice(5)); return L(id, l ? l.label : id); }
    if (id.startsWith('tool:')) return L(id, `${T[id.slice(5)].ref} ${KI[id.slice(5)].name}`);
    if (['context', 'terminal', 'plan', 'answer', 'user', 'model'].includes(id) || id.startsWith('web:') || id.startsWith('ctxfile:')) return L(id, nodeLabel(id));
    return esc(nodeLabel(id));
  };
  function callRow(c) { return `<li>${callLink(c)} <span class="muted">${esc(short(c.label, 34))} · ${fmtT(c.startedAt)}${c.lane !== 'main' ? ` · ${esc(c.laneLabel)}` : ''}</span>${c.error ? ` <b class="err-n">${esc(c.error.code)}</b>` : ''}${c.diff ? ` <span class="muted">+${c.diff.added} −${c.diff.removed}</span>` : ''}</li>`; }
  function nextAfterError(c) {
    const r = retriesOf(c.id);
    if (r.length) return r.map(x => `Retried as ${callLink(x)} (attempt ${x.attempt})${x.status === 'success' ? ' — <b>fixed</b>' : x.status === 'error' ? ' — failed again' : ' — running'}`).join('<br>');
    const caused = callsCausedBy(c.id);
    if (caused.length) return `Led to ${caused.map(callLink).join(', ')}`;
    const later = S.calls.find(x => x.seq > c.seq && x.tool === c.tool && x.target && c.target && x.target.value === c.target.value && x.status === 'success');
    if (later) return `Same target succeeded later in ${callLink(later)}`;
    return 'Not retried (yet).';
  }
  function viewCall(c) {
    const out = c.output || {};
    let h = `<h2>${esc(c.tool)} — ${esc(c.label)}</h2><div class="sub">${st(c.status)} ${esc(KI[c.kind].name)} · ${esc(T[c.kind].ref)} ${esc(T[c.kind].part)}</div>`;
    if (c.error) h += `<div class="errbox"><b>⚠ ${esc(c.error.code)}</b> ${esc(c.error.name || '')}<br>${esc(c.error.message)}<br><span class="hint">Hint: ${esc(c.error.hint || '-')}</span><br><span class="muted">Next:</span> ${nextAfterError(c)}</div>`;
    h += dl([
      ['call id', esc(c.id)], ['lane', L(`lane:${c.lane}`, c.laneLabel) + (c.depth ? ` <span class="muted">depth ${c.depth}</span>` : '')],
      ['target', c.target ? `${esc(c.target.type)}: ${c.target.type === 'file' ? L(`file:${c.target.value}`, c.target.value) : esc(c.target.value)}` : '-'],
      ['started', fmtT(c.startedAt)], ['duration', c.endedAt ? fmtDur(c.endedAt - c.startedAt) : `running ${fmtDur(S.now - c.startedAt)} (planned ${fmtDur(c.duration)})`],
      ['attempt', `${c.attempt}${c.retryOf ? ` · retry of ${callLink(sim.callById(c.retryOf))}` : ''}`],
      ['tokens', `in ${fmtK(c.tokens.in)} · out ${fmtK(c.tokens.out)}`],
      ['context after', c.contextAfter ? `${c.contextAfter.percent}% (${fmtK(c.contextAfter.used)} tok)` : '-'],
      out.exitCode !== undefined ? ['exit code', out.exitCode === null ? 'none' : esc(out.exitCode)] : null,
      out.status ? ['HTTP status', esc(out.status)] : null
    ]);
    h += `<h3>Input arguments</h3><pre>${esc(Object.entries(c.input || {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n') || '(none)')}</pre>`;
    h += `<h3>Output</h3>${dl([['summary', esc(out.summary || '-')], out.lines != null ? ['lines', esc(out.lines)] : null, out.bytes != null ? ['bytes', fmtB(out.bytes)] : null])}`;
    if (out.preview && out.preview.length) h += `<pre>${esc(out.preview.join('\n'))}</pre>`;
    if (out.tests) h += `<h3>Tests</h3>${dl([['passed', esc(out.tests.passed)], ['failed', `<b class="${out.tests.failed ? 'err-n' : ''}">${out.tests.failed}</b>`], ['skipped', esc(out.tests.skipped)], ['failing', out.tests.failures.length ? out.tests.failures.map(esc).join('<br>') : 'none']])}`;
    if (c.diff) h += `<h3>Diff · +${c.diff.added} −${c.diff.removed}</h3>${c.diff.hunks.map(hk => `<pre><span class="muted">@@ line ${hk.at} @@</span>\n${hk.lines.map(l => `<span class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}">${esc(l)}</span>`).join('\n')}</pre>`).join('')}`;
    h += `<h3>Flow hops (${c.flow.length})</h3><ul>${c.flow.map((f, i) => `<li>${i + 1}. ${nodeLink(f.from)} → ${nodeLink(f.to)} <span class="muted">${esc(f.what || '')}${f.tokens ? ` · ${fmtK(f.tokens)} tok` : ''}${f.bytes ? ` · ${fmtB(f.bytes)}` : ''}</span></li>`).join('')}</ul>`;
    if (c.refs.length) h += `<h3>References</h3><ul>${c.refs.map(r => `<li>${esc(r.role || '')} ${r.type === 'file' ? L(`file:${r.value}`, r.value) : r.type === 'lane' ? L(`lane:${r.value}`, (sim.laneByKey(r.value) || {}).label || r.value) : r.type === 'url' && hostOf(r.value) && HOSTS.some(n => n.label === hostOf(r.value)) ? L(`web:${hostOf(r.value)}`, r.value) : r.type === 'task' ? L(r.value === 'list' ? 'plan' : `task:${r.value}`, `task ${r.value}`) : esc(r.value)} <span class="muted">${esc(r.type)}${r.title ? ` · ${esc(r.title)}` : ''}</span></li>`).join('')}</ul>`;
    const chain = causeChain(c);
    h += `<h3>Cause chain (probe)</h3>`;
    h += chain.length ? `<ul>${chain.map((x, i) => `<li>CAUSE ${i + 1}: ${callLink(x)} <span class="muted">${esc(short(x.label, 30))}</span></li>`).join('')}</ul>` : '<div class="muted">Not caused by an earlier call.</div>';
    const caused = callsCausedBy(c.id), retries = retriesOf(c.id);
    h += `<h3>What it caused</h3>${caused.length ? `<ul>${caused.map(callRow).join('')}</ul>` : '<div class="muted">Nothing yet.</div>'}`;
    if (retries.length) h += `<h3>Retries</h3><ul>${retries.map(callRow).join('')}</ul>`;
    return h;
  }
  function viewError(c) {
    return `<h2>⚠ ${esc(c.error.code)} — ${esc(c.error.name || '')}</h2><div class="errbox"><b>${esc(c.error.message)}</b><br><span class="hint">Hint: ${esc(c.error.hint || '-')}</span></div>${dl([
      ['call', callLink(c)], ['tool', esc(c.tool)], ['lane', L(`lane:${c.lane}`, c.laneLabel)], ['target', esc(c.target ? c.target.value : '-')], ['when', fmtT(c.startedAt)], ['since prompt', c.startedAt >= lastPromptTime() ? 'yes' : 'no (older)'], ['what next', nextAfterError(c)]
    ])}<p>${L(`call:${c.id}`, 'Open the full call →')}</p>`;
  }
  function viewTool(k) {
    const calls = S.calls.filter(c => c.kind === k);
    const errs = calls.filter(c => c.status === 'error');
    const esp = sim.errorsSincePrompt()[k] || 0;
    const run = calls.filter(c => c.status === 'running');
    const behave = { files: 'Reads arrive as a steady stream of small pulses from the flash bank through the sense ADC into the context bank.', edits: 'Edits leave the context bank as one fast burst that burns into a file chip (white flash, then a warm tint).', shell: 'The regulator charges C21 while the command runs, sparks at the relay when it ends, then a square-wave train runs to the UART.', network: 'Pages arrive from the RF channel strip as radio wavefronts into the antenna, then a wavy pulse charges the context bank.', agents: 'The socket controller drives a ring pulse into a daughterboard socket; the subagent board lights and runs its own mini traces.', memory: 'Plan writes are bit patterns into the EEPROM; its 8 bit LEDs mirror the task states and flicker on write.', other: 'MCP data rides up the ribbon cable into the expansion header; the pins scan as it arrives.' }[k];
    return `<h2>${T[k].ref} ${T[k].part} — ${KI[k].name}</h2><div class="sub">${esc(behave)}</div>${dl([
      ['tools', esc(KI[k].tools.join(', '))], ['calls', calls.length], ['running now', run.length ? run.map(callLink).join(', ') : 'none'], ['errors since prompt', `<b class="${esp ? 'err-n' : ''}">${esp}</b>`], ['errors total', errs.length], ['retries', calls.filter(c => c.retryOf).length]
    ])}${errs.length ? `<h3>Errors</h3><ul>${errs.slice(-12).reverse().map(c => `<li>${L(`error:${c.id}`, `⚠ ${c.error.code}`)} ${callLink(c)} <span class="muted">${fmtT(c.startedAt)}</span></li>`).join('')}</ul>` : ''}<h3>Recent calls</h3><ul>${calls.slice(-25).reverse().map(callRow).join('')}</ul>`;
  }
  function viewFile(path) {
    const f = S.files[path];
    const calls = sim.callsForFile(path).concat(S.calls.filter(c => c.target && c.target.value !== path && c.target.type === 'file' && c.refs.some(r => r.value === path))).filter((c, i, a) => a.indexOf(c) === i).sort((a, b) => a.seq - b.seq);
    let h = `<h2>${esc(path)}</h2><div class="sub">Memory chip on the files bank${f && f.edits >= HOT_EDITS ? ` · <span class="hot">HOT: edited ${f.edits} times</span>` : ''}</div>`;
    h += dl([['reads', f ? f.reads : 0], ['edits', f ? f.edits : 0], ['failed calls', f ? `<b class="${f.failed ? 'err-n' : ''}">${f.failed}</b>` : 0], ['lines', f ? `+${f.added} −${f.removed} (now ~${f.lines})` : '-'], ['last touched', f ? fmtT(f.lastTouched) : 'never']]);
    h += `<h3>Every call that touched it (${calls.length})</h3>`;
    h += calls.length ? calls.map(c => `<div style="margin:6px 0;border-left:2px solid ${c.status === 'error' ? '#d0352a' : c.kind === 'edits' ? '#ff9a3a' : '#c8763a'};padding-left:8px">${callLink(c)} <span class="muted">${fmtT(c.startedAt)} · ${esc(c.laneLabel)}</span>${c.error ? `<div class="err-n">⚠ ${esc(c.error.code)}: ${esc(c.error.message)}</div>` : ''}${c.diff ? `<pre>${c.diff.hunks.map(hk => `@@ ${hk.at} @@ +${c.diff.added} −${c.diff.removed}\n${hk.lines.map(l => `<span class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}">${esc(l)}</span>`).join('\n')}`).join('\n')}</pre>` : c.output ? `<div class="muted">${esc(c.output.summary || '')}</div>` : ''}</div>`).join('') : '<div class="muted">No calls yet.</div>';
    return h;
  }
  function viewContext() {
    const c = S.context;
    const t0 = (([...S.markers].reverse().find(m => m.kind === 'compaction') || {}).time) || 0;
    const by = new Map();
    for (const s of c.samples) if (s.time >= t0 && s.delta > 0) { const k = s.why; by.set(k, (by.get(k) || 0) + s.delta); }
    const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const byKind = {}; for (const call of S.calls) if (call.lane === 'main' && call.endedAt && call.endedAt >= t0) byKind[call.kind] = (byKind[call.kind] || 0) + call.tokens.in + call.tokens.out;
    const pct = c.percent;
    return `<h2>Context window — capacitor bank</h2><div class="sub">20 caps × 10k tokens. Amber from 70%, red from 90%. Compaction discharges the bank.</div>
      <div class="bar"><i class="${pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : ''}" style="width:${pct}%"></i><span class="tick" style="left:70%"></span><span class="tick" style="left:90%"></span></div>
      ${dl([['used', `${pct}% · ${fmtK(c.used)} / ${fmtK(c.capacity)} tok`], ['compactions', c.compactions], ['samples', c.samples.length]])}
      <h3>Biggest contributors since last compaction</h3><table><tr><th>source</th><th class="num">tokens</th></tr>${top.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmtK(v)}</td></tr>`).join('')}</table>
      <h3>By kind (main lane)</h3><table>${KINDS.filter(k => byKind[k]).map(k => `<tr><td>${L(`tool:${k}`, KI[k].name)}</td><td class="num">${fmtK(byKind[k])}</td></tr>`).join('')}</table>
      <h3>Context files (boot ROMs)</h3><ul>${c.files.map(f => `<li>${L(`ctxfile:${f.path}`, f.path)} <span class="muted">${fmtK(f.tokens)} tok · ${fmtT(f.loadedAt)} · ${esc(f.why)}</span></li>`).join('') || '<li class="muted">none</li>'}</ul>
      <h3>Compactions</h3><ul>${S.markers.filter(m => m.kind === 'compaction').map(m => `<li>${fmtT(m.time)} ${esc(m.label)}</li>`).join('') || '<li class="muted">none yet</li>'}</ul>`;
  }
  function viewTerminal() {
    const calls = S.calls.filter(c => c.kind === 'shell');
    return `<h2>J4 debug UART — terminal</h2><div class="sub">Every command, its exit code and lane.</div><table><tr><th>call</th><th>command</th><th>exit</th><th>time</th></tr>${calls.slice(-40).reverse().map(c => `<tr><td>${L(`call:${c.id}`, c.id)}</td><td>${esc(short(c.target.value, 30))}${c.lane !== 'main' ? `<br><span class="muted">${esc(c.laneLabel)}</span>` : ''}</td><td>${c.status === 'running' ? st('running') : c.status === 'error' ? `<b class="err-n">⚠ ${esc(c.error.code)}</b>` : '0'}</td><td>${fmtT(c.startedAt)} <span class="muted">${fmtDur(c.endedAt ? c.endedAt - c.startedAt : null)}</span></td></tr>`).join('')}</table>`;
  }
  function viewTasks(only) {
    const items = S.tasks.items;
    const done = items.filter(t => t.status === 'completed').length, prog = items.filter(t => t.status === 'in_progress').length;
    const list = only ? items.filter(t => t.id === only) : items;
    return `<h2>${only ? `Task ${esc(only)}` : 'Task list'}</h2><div class="sub">${done} of ${items.length} completed · ${prog} in progress · ${items.length - done - prog} not started · source ${esc(S.tasks.source)}</div>${list.map(t => `<h3>${esc(t.id)}. ${esc(t.label)}</h3>${st(t.status)}<ul>${t.history.map(hh => `<li>${fmtT(hh.time)} → ${st(hh.status)} by ${callLink(sim.callById(hh.callId))}</li>`).join('')}</ul>`).join('')}${only ? `<p>${L('plan', 'All tasks →')}</p>` : ''}`;
  }
  function viewHost(host) {
    const calls = hostCalls(host);
    return `<h2>${esc(host)}</h2><div class="sub">RF channel — pages arrive as radio waves into the antenna.</div>${dl([['fetches', calls.length], ['errors', calls.filter(c => c.status === 'error').length]])}<table><tr><th>call</th><th>status</th><th>size</th><th>time</th></tr>${calls.slice().reverse().map(c => `<tr><td>${L(`call:${c.id}`, `${c.id} ${c.tool}`)}<br><span class="muted">${esc(short(c.target.value, 40))}</span></td><td>${c.status === 'error' ? `<b class="err-n">⚠ ${esc(c.error.code)}</b>` : c.status === 'running' ? st('running') : esc((c.output && c.output.status) || 200)}</td><td>${c.output && c.output.bytes ? fmtB(c.output.bytes) : '-'}<br><span class="muted">${fmtK(c.tokens.in)} tok</span></td><td>${fmtT(c.startedAt)}</td></tr>`).join('')}</table>`;
  }
  function laneLine(l) { return `<li><span>${' '.repeat(l.depth)}${L(`lane:${l.key}`, l.label)} ${st(l.state)} <span class="muted">${l.calls} calls · ${l.errors} err · ${fmtK(l.tokens)} tok</span></span><span class="muted">${fmtT(l.startedAt)}${l.endedAt ? `–${fmtT(l.endedAt)}` : ''}</span></li>`; }
  function viewLane(key) {
    const l = sim.laneByKey(key); if (!l) return '<h2>Lane not found</h2>';
    const calls = S.calls.filter(c => c.lane === key);
    const kids = S.lanes.filter(x => x.parent === key);
    return `<h2>${esc(l.label)}</h2><div class="sub">${esc(l.role)} · ${l.depth ? `daughterboard in socket ${slotOf.has(key) ? slotOf.get(key) + 1 : '(controller, all sockets busy)'}` : 'the CPU itself'}</div>${dl([
      ['state', st(l.state)], ['agent type', esc(l.agentType)], ['model', esc(l.model)], ['depth', l.depth], ['parent', l.parent ? L(`lane:${l.parent}`, (sim.laneByKey(l.parent) || {}).label || l.parent) : '-'],
      ['started', fmtT(l.startedAt)], ['ended', l.endedAt ? fmtT(l.endedAt) : '-'], ['duration', fmtDur((l.endedAt || S.now) - l.startedAt)], ['calls', l.calls], ['errors', `<b class="${l.errors ? 'err-n' : ''}">${l.errors}</b>`], ['tokens', fmtK(l.tokens)]
    ])}${l.task ? `<h3>Task brief</h3><pre>${esc(l.task)}</pre>` : ''}${l.result ? `<h3>Final result</h3><pre>${esc(l.result)}</pre>` : ''}${kids.length ? `<h3>Child lanes</h3><ul class="lanes">${kids.map(laneLine).join('')}</ul>` : ''}<h3>Calls (${calls.length})</h3><ul>${calls.slice(-40).reverse().map(callRow).join('')}</ul>`;
  }
  function viewAgents() { return `<h2>U6 socket controller — agent lanes</h2><div class="sub">Main plus every subagent; boards plug into sockets J6–J8, nested ones ride on top as mezzanines.</div><ul class="lanes">${S.lanes.map(laneLine).join('')}</ul>${S.lanes.filter(l => l.depth).map(l => `<h3>${esc(l.label)}</h3><div class="muted">${esc(l.task)}</div>${l.result ? `<div>${esc(l.result)}</div>` : ''}`).join('')}`; }
  function viewCtxFile(path) {
    const n = CTXFILES.find(x => x.label === path); const loaded = S.context.files.find(f => f.path === path);
    const info = loaded || n || {};
    return `<h2>${esc(path)}</h2><div class="sub">Boot ROM — a context file loaded into the context bank.</div>${dl([['tokens', fmtK(info.tokens || 0)], ['loaded', loaded ? fmtT(loaded.loadedAt) : 'not loaded (DNP)'], ['why', esc(loaded ? loaded.why : '-')]])}`;
  }
  function viewMarkers(kind, title) { return `<h2>${title}</h2><ul>${S.markers.filter(m => m.kind === kind).slice().reverse().map(m => `<li>${fmtT(m.time)} ${esc(m.label)}${m.detail && m.detail.tokens ? ` <span class="muted">${m.detail.tokens} tok</span>` : ''}</li>`).join('') || '<li class="muted">none yet</li>'}</ul>`; }
  function viewModel() {
    const ss = S.session; const st2 = sessionStatus();
    return `<h2>U1 Model — ${esc(ss.model)}</h2>${dl([['project', esc(ss.project)], ['session', esc(ss.name)], ['id', esc(ss.id)], ['provider', esc(ss.provider)], ['branch', esc(ss.branch)], ['cwd', esc(ss.cwd)], ['status', esc(st2.text)], ['turn', ss.turn], ['last record', fmtAgo(S.now - lastRecord)], ['tokens', `in ${fmtK(S.tokens.input)} · out ${fmtK(S.tokens.output)} · cache read ${fmtK(S.tokens.cacheRead)}`]])}<p>${L('lane:main', 'Main lane calls →')}</p>`;
  }
  function viewTrace(key) {
    const tr = traces.get(key); if (!tr) return '<h2>Trace</h2>';
    const [a, b] = key.split('>');
    const calls = [...new Set(tr.uses)].map(id => sim.callById(id)).filter(Boolean).reverse();
    return `<h2>Trace ${esc(nodeLabel(a))} → ${esc(nodeLabel(b))}</h2><div class="sub">${Math.round(tr.info.len)} mm of copper. Calls that sent data along it, newest first.</div><ul>${calls.slice(0, 30).map(callRow).join('') || '<li class="muted">No data has crossed it yet.</li>'}</ul>`;
  }
  function viewMoment(t) {
    const running = S.calls.filter(c => c.startedAt <= t && (c.endedAt || S.now) >= t);
    const near = S.calls.filter(c => Math.abs(c.startedAt - t) < 25000).sort((a, b) => a.startedAt - b.startedAt);
    const cs = ctxAt(t); const marks = S.markers.filter(m => Math.abs(m.time - t) < 90000);
    const prompt = [...S.markers].reverse().find(m => m.kind === 'prompt' && m.time <= t);
    return `<h2>Moment ${fmtT(t)}</h2><div class="sub">Inspecting a moment (${fmtAgo(S.now - t)}). The board keeps running; press Back to live.</div>${dl([['context', cs ? `${cs.percent}% (${fmtK(cs.used)} tok)` : '-'], ['prompt in force', prompt ? esc(prompt.detail.text || prompt.label) : '-'], ['running then', running.length ? running.map(callLink).join('<br>') : 'nothing (model thinking or idle)']])}<h3>Calls within 25 s</h3><ul>${near.map(callRow).join('') || '<li class="muted">none</li>'}</ul><h3>Markers within 90 s</h3><ul>${marks.map(m => `<li>${fmtT(m.time)} ${esc(m.label)}</li>`).join('') || '<li class="muted">none</li>'}</ul>`;
  }
  function viewOverview() {
    const esp = sim.errorsSincePrompt(), ebk = errorsByKind(), act = activeKind(), st2 = sessionStatus();
    const ss = S.session;
    const items = S.tasks.items; const done = items.filter(t => t.status === 'completed').length, prog = items.filter(t => t.status === 'in_progress').length;
    const files = Object.values(S.files).sort((a, b) => (b.edits * 3 + b.reads) - (a.edits * 3 + a.reads));
    const pct = S.context.percent;
    return `<h2>${esc(ss.project)} — ${esc(ss.name)}</h2><div class="sub">Board at rest. Click any part to probe it.</div>
      ${dl([['id', esc(ss.id)], ['provider / model', `${esc(ss.provider)} · ${esc(ss.model)}`], ['branch', esc(ss.branch)], ['status', `${esc(st2.text)} · last record ${fmtAgo(S.now - lastRecord)}`], ['turn', ss.turn], ['active kind', act ? L(`tool:${act}`, KI[act].name) : 'none']])}
      <h3>Components · calls per kind</h3><table><tr><th>kind</th><th>part</th><th class="num">calls</th><th class="num">err since prompt</th><th class="num">err total</th></tr>${KINDS.map(k => `<tr class="kindrow ${act === k ? 'activek' : ''}"><td>${L(`tool:${k}`, KI[k].name)}</td><td class="muted">${T[k].ref}</td><td class="num">${S.counts[k]}</td><td class="num ${esp[k] ? 'err-n' : ''}">${esp[k] || 0}</td><td class="num">${ebk[k] || 0}</td></tr>`).join('')}<tr><td><b>Total</b></td><td></td><td class="num"><b>${S.calls.length}</b></td><td class="num">${Object.values(esp).reduce((a, b) => a + b, 0)}</td><td class="num"><b>${S.errors.length}</b></td></tr></table>
      <h3>Context bank</h3><div class="bar"><i class="${pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : ''}" style="width:${pct}%"></i><span class="tick" style="left:70%"></span><span class="tick" style="left:90%"></span></div><div>${L('context', `${pct}% used`)} · ${S.context.compactions} compactions · files: ${S.context.files.map(f => L(`ctxfile:${f.path}`, f.path)).join(', ')}</div>
      <h3>Tasks · ${done}/${items.length} done · ${prog} in progress · ${items.length - done - prog} not started</h3><ul>${items.map(t => `<li>${st(t.status)} ${L(`task:${t.id}`, t.label)} <span class="muted">${t.history.length} changes</span></li>`).join('') || '<li class="muted">none</li>'}</ul>
      <h3>Agent lanes</h3><ul class="lanes">${S.lanes.map(laneLine).join('')}</ul>
      <h3>File footprint</h3><table><tr><th>file</th><th class="num">R</th><th class="num">W</th><th class="num">fail</th><th class="num">+/−</th></tr>${files.map(f => `<tr><td>${L(`file:${f.path}`, short(f.path, 26))} ${f.edits >= HOT_EDITS ? '<span class="hot">HOT</span>' : ''}</td><td class="num">${f.reads}</td><td class="num">${f.edits}</td><td class="num ${f.failed ? 'err-n' : ''}">${f.failed}</td><td class="num">+${f.added}/−${f.removed}</td></tr>`).join('')}</table>
      <h3>Recent activity (folded)</h3><ul>${foldedActivity().map(e => `<li>${e.id ? L(`call:${e.id}`, `${e.tool}`) : `<b>${esc(e.tool)}</b>`} <span class="${e.status === 'error' ? 'err-n' : 'muted'}">${esc(short(e.label, 38))}${e.code ? ` ⚠ ${esc(e.code)}` : ''}</span>${e.count > 1 ? ` <span class="fold">×${e.count}</span>` : ''} <span class="muted">${fmtT(e.t)}${e.lane !== 'main' ? ` · ${esc(e.laneLabel || '')}` : ''}</span></li>`).join('')}</ul>`;
  }
  function inspectorHTML() {
    if (!sel) return viewOverview();
    const i = sel.indexOf(':'); const t = i < 0 ? sel : sel.slice(0, i), v = i < 0 ? '' : sel.slice(i + 1);
    const back = `<div class="back">${L('__back', '← Back')} · ${L('overview', 'Overview')}</div>`;
    let body;
    if (t === 'call') { const c = sim.callById(v); body = c ? viewCall(c) : '<h2>Call not found</h2>'; }
    else if (t === 'error') { const c = sim.callById(v); body = c && c.error ? viewError(c) : '<h2>No error</h2>'; }
    else if (t === 'tool') body = viewTool(v);
    else if (t === 'file') body = viewFile(v);
    else if (t === 'context') body = viewContext();
    else if (t === 'terminal') body = viewTerminal();
    else if (t === 'plan') body = viewTasks();
    else if (t === 'task') body = viewTasks(v);
    else if (t === 'web') body = viewHost(v);
    else if (t === 'lane') body = v === 'main' ? viewLane('main') : viewLane(v);
    else if (t === 'agents') body = viewAgents();
    else if (t === 'ctxfile') body = viewCtxFile(v);
    else if (t === 'user') body = viewMarkers('prompt', 'J1 prompt input — prompts');
    else if (t === 'answer') body = viewMarkers('turn-complete', 'J2 reply output — turns completed');
    else if (t === 'model') body = viewModel();
    else if (t === 'mcp') body = `<h2>MCP github</h2>${S.calls.filter(c => c.kind === 'other').reverse().map(callRow).join('')}`;
    else if (t === 'trace') body = viewTrace(v);
    else if (t === 'moment') body = viewMoment(+v);
    else body = viewOverview();
    return back + body;
  }
  function renderInspector(force) {
    const now = performance.now();
    if (!force && now - inspAt < 1000) return;
    inspAt = now;
    const html = inspectorHTML();
    if (html === inspKey) return;
    inspKey = html;
    const top = insp.scrollTop;
    insp.innerHTML = html;
    if (!force) insp.scrollTop = top; else insp.scrollTop = 0;
    $('#probeMode').textContent = sel ? `PROBE ▸ ${short(sel, 30)}` : 'FREE RUN';
  }

  // ---------- scope canvas (inspector header) ----------
  function fitCanvas(cv) { const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height)); if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; } const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, h }; }
  function drawScope() {
    const { ctx, w, h } = fitCanvas($('#scopeCanvas'));
    ctx.fillStyle = '#030b06'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(80,140,100,.18)'; ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, h); ctx.stroke(); }
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke(); }
    const t1 = S.now, t0 = t1 - WINDOW; const tx = t => (t - t0) / WINDOW * w;
    // CH1: context %
    const ay = v => h - 8 - v / 100 * (h * 0.55);
    ctx.strokeStyle = 'rgba(255,90,70,.5)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(0, ay(90)); ctx.lineTo(w, ay(90)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,90,.45)'; ctx.beginPath(); ctx.moveTo(0, ay(70)); ctx.lineTo(w, ay(70)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#ffb53a'; ctx.lineWidth = 1.6; ctx.shadowColor = '#ffb53a'; ctx.shadowBlur = 6; ctx.beginPath();
    let first = true; for (const s of S.context.samples) { if (s.time < t0) continue; const x = tx(s.time), y = ay(s.percent); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.shadowBlur = 0;
    // CH2: digital, filtered by selection
    let filter = () => true, label = 'all calls';
    const call = selectedCall();
    if (sel) {
      const [t, v] = [sel.split(':')[0], sel.slice(sel.indexOf(':') + 1)];
      if (t === 'tool') { filter = c => c.kind === v; label = KI[v].name; }
      else if (t === 'file') { filter = c => c.refs.some(r => r.value === v) || (c.target && c.target.value === v); label = short(v, 24); }
      else if (t === 'lane') { filter = c => c.lane === v; label = `lane ${short((sim.laneByKey(v) || {}).label || v, 18)}`; }
      else if (t === 'web') { const set = new Set(hostCalls(v)); filter = c => set.has(c); label = v; }
      else if (t === 'terminal') { filter = c => c.kind === 'shell'; label = 'shell'; }
      else if (call) { filter = c => c.kind === call.kind; label = `${KI[call.kind].name} (selected ${call.id})`; }
    }
    const dy0 = 30, dy1 = 16;
    ctx.strokeStyle = '#d9b04a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, dy0);
    for (const c of S.calls) {
      if (!filter(c)) continue; const e = c.endedAt || t1; if (e < t0) continue;
      const x0 = tx(c.startedAt), x1 = Math.max(x0 + 1.5, tx(e));
      ctx.lineTo(x0, dy0); ctx.lineTo(x0, dy1); ctx.lineTo(x1, dy1); ctx.lineTo(x1, dy0);
    }
    ctx.lineTo(w, dy0); ctx.stroke();
    for (const c of S.calls) { if (!filter(c) || c.status !== 'error' || (c.endedAt || t1) < t0) continue; const x = tx(c.endedAt || t1); ctx.strokeStyle = '#ff5a45'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 3, dy1 - 6); ctx.lineTo(x + 3, dy1); ctx.moveTo(x + 3, dy1 - 6); ctx.lineTo(x - 3, dy1); ctx.stroke(); }
    // cursors
    const cur = call ? [call.startedAt, call.endedAt] : sel && sel.startsWith('moment:') ? [+sel.slice(7)] : [];
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    for (const t of cur) if (t) { ctx.beginPath(); ctx.moveTo(tx(t), 0); ctx.lineTo(tx(t), h); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.font = '10px Consolas, monospace'; ctx.fillStyle = '#ffcf6a'; ctx.fillText(`CH1 CONTEXT ${S.context.percent}%`, 6, h - 10 - (h * 0.55));
    ctx.fillStyle = '#f6dc8a'; ctx.fillText(`CH2 ${label}`, 6, 11);
    ctx.fillStyle = '#a9b8a8'; ctx.textAlign = 'right'; ctx.fillText('30 min → now', w - 6, 11); ctx.textAlign = 'left';
  }

  // ---------- logic analyzer timeline ----------
  let hits = [];
  let cursorIdx = -1;
  function drawTimeline() {
    const cv = $('#timeline');
    const { ctx, w, h } = fitCanvas(cv);
    const LW = 150, R = 54, top = 14, axis = 16;
    const ctxH = Math.max(22, h * 0.15), markH = 14;
    const rowH = (h - top - axis - ctxH - markH) / KINDS.length;
    const t1 = S.now, t0 = t1 - WINDOW;
    const tx = t => LW + (t - t0) / WINDOW * (w - LW - R);
    ctx.fillStyle = '#040c07'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#071a0f'; ctx.fillRect(0, 0, LW, h);
    // grid
    for (let m = 0; m <= 30; m++) { const x = tx(t0 + m * 60000); ctx.strokeStyle = m % 5 ? 'rgba(60,110,80,.12)' : 'rgba(90,150,110,.3)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, h - axis); ctx.stroke(); }
    ctx.font = '10px Consolas, monospace'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6dc8a'; ctx.fillText('LA-7  LOGIC ANALYZER · 30 MIN', 8, 7);
    const esp = sim.errorsSincePrompt(), ebk = errorsByKind(), act = activeKind();
    // marker row
    const my = top;
    ctx.fillStyle = '#a9b8a8'; ctx.fillText('MARKERS  P T C F', 8, my + markH / 2);
    // kinds
    hits = [];
    const selCall = selectedCall();
    const chain = selCall ? new Set([selCall.id, ...causeChain(selCall).map(c => c.id), ...callsCausedBy(selCall.id).map(c => c.id)]) : new Set();
    KINDS.forEach((k, i) => {
      const y0 = top + markH + i * rowH, base = y0 + rowH - 3, high = y0 + 3;
      ctx.fillStyle = act === k ? '#ffb53a' : '#eef0e4';
      ctx.fillText(`D${i} ${T[k].ref} ${KI[k].name.toUpperCase()}`, 8, y0 + rowH / 2);
      ctx.fillStyle = '#a9b8a8'; ctx.textAlign = 'right'; ctx.fillText(`${S.counts[k]}`, LW - 46, y0 + rowH / 2);
      if (esp[k]) { ctx.fillStyle = '#ff7a6a'; ctx.fillText(`⚠${esp[k]}`, LW - 22, y0 + rowH / 2); }
      ctx.fillStyle = '#6d8a76'; ctx.fillText(`${ebk[k] || 0}e`, LW - 4, y0 + rowH / 2); ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(200,118,58,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(LW, base); ctx.lineTo(w - R, base); ctx.stroke();
      for (const c of S.calls) {
        if (c.kind !== k) continue;
        const e = c.endedAt || t1; if (e < t0) continue;
        const x0 = tx(Math.max(t0, c.startedAt)), x1 = Math.max(x0 + 2, tx(e));
        const hi = c.lane === 'main' ? high : high + (base - high) * 0.45;
        const col = c.status === 'running' ? '#ffb53a' : c.status === 'error' ? '#ff5a45' : '#d9a24a';
        ctx.fillStyle = c.status === 'error' ? 'rgba(208,53,42,.35)' : c.status === 'running' ? 'rgba(255,181,58,.35)' : 'rgba(200,118,58,.22)';
        ctx.fillRect(x0, hi, x1 - x0, base - hi);
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0, base); ctx.lineTo(x0, hi); ctx.lineTo(x1, hi); ctx.lineTo(x1, base); ctx.stroke();
        if (c.status === 'error') { ctx.strokeStyle = '#ff5a45'; ctx.lineWidth = 1.8; const cx = x1 + 1, cy = y0 + 2; ctx.beginPath(); ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy + 6); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx - 3, cy + 6); ctx.stroke(); }
        if (c.retryOf) { ctx.fillStyle = '#f1e9d2'; ctx.font = 'bold 8px Consolas, monospace'; ctx.fillText('R', x0 - 7, hi + 3); ctx.font = '10px Consolas, monospace'; }
        if (chain.has(c.id)) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = c.id === (selCall && selCall.id) ? 2 : 1; ctx.strokeRect(x0 - 2, hi - 2, x1 - x0 + 4, base - hi + 4); }
        hits.push({ x0: x0 - 2, x1: x1 + 2, y0: y0, y1: y0 + rowH, id: c.id, t: c.startedAt });
      }
    });
    // cause links on the timeline
    if (selCall) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
      const pos = id => { const hh = hits.find(x => x.id === id); return hh ? [hh.x0 + 2, (hh.y0 + hh.y1) / 2] : null; };
      for (const c of [selCall, ...causeChain(selCall), ...callsCausedBy(selCall.id)]) { if (!c.causedBy) continue; const a = pos(c.causedBy), b = pos(c.id); if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.bezierCurveTo((a[0] + b[0]) / 2, a[1], (a[0] + b[0]) / 2, b[1], b[0], b[1]); ctx.stroke(); } }
      ctx.setLineDash([]);
    }
    // context analog channel
    const cy0 = top + markH + KINDS.length * rowH, cy1 = cy0 + ctxH;
    const ay = v => cy1 - 2 - v / 100 * (ctxH - 4);
    ctx.fillStyle = '#ffcf6a'; ctx.fillText(`A0 CONTEXT ${S.context.percent}%`, 8, (cy0 + cy1) / 2);
    ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(255,190,90,.4)'; ctx.beginPath(); ctx.moveTo(LW, ay(70)); ctx.lineTo(w - R, ay(70)); ctx.stroke(); ctx.strokeStyle = 'rgba(255,90,70,.5)'; ctx.beginPath(); ctx.moveTo(LW, ay(90)); ctx.lineTo(w - R, ay(90)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#ffb53a'; ctx.lineWidth = 1.4; ctx.beginPath(); let f = true;
    for (const s of S.context.samples) { if (s.time < t0) continue; const x = tx(s.time), y = ay(s.percent); if (f) { ctx.moveTo(x, y); f = false; } else ctx.lineTo(x, y); }
    ctx.stroke();
    // markers
    for (const m of S.markers) {
      if (m.time < t0) continue; const x = tx(m.time);
      const spec = { prompt: ['#ffffff', 'P', []], 'turn-complete': ['#d9b04a', 'T', [3, 3]], compaction: ['#ff7a3a', 'C', [1, 2]], 'context-file': ['#a9b8a8', 'F', null] }[m.kind];
      if (!spec) continue;
      if (spec[2]) { ctx.strokeStyle = spec[0]; ctx.lineWidth = m.kind === 'prompt' ? 1.2 : 1; ctx.setLineDash(spec[2]); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(x, my + markH); ctx.lineTo(x, cy1); ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]); }
      ctx.fillStyle = spec[0]; ctx.fillRect(x - 5, my + 1, 10, markH - 3); ctx.fillStyle = '#040c07'; ctx.font = 'bold 9px Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText(spec[1], x, my + markH / 2); ctx.textAlign = 'left'; ctx.font = '10px Consolas, monospace';
    }
    // axis
    ctx.fillStyle = '#a9b8a8';
    for (let m = 0; m <= 30; m += 5) { const x = tx(t0 + m * 60000); ctx.textAlign = 'center'; ctx.fillText(m === 30 ? 'now' : `-${30 - m}m`, x, h - axis / 2); }
    ctx.textAlign = 'left';
    // now edge / cursor
    const live = !sel && sim.running;
    ctx.fillStyle = live ? '#ffb53a' : '#ffffff'; ctx.font = 'bold 10px Consolas, monospace'; ctx.fillText(live ? '● LIVE' : sim.running ? '▮▮ HOLD' : 'PAUSED', w - R + 4, top + 8); ctx.font = '10px Consolas, monospace';
    if (sel && sel.startsWith('moment:')) { const x = tx(+sel.slice(7)); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, h - axis); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fillRect(x - 28, h - axis, 56, axis); ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.fillText(fmtT(+sel.slice(7)), x, h - axis / 2); ctx.textAlign = 'left'; }
    if (cursorIdx >= 0 && document.activeElement === cv) { const sorted = hits.slice().sort((a, b) => a.t - b.t); const hh = sorted[clamp(cursorIdx, 0, sorted.length - 1)]; if (hh) { ctx.strokeStyle = '#ffe2a0'; ctx.setLineDash([2, 2]); ctx.strokeRect(hh.x0 - 1, hh.y0 + 1, hh.x1 - hh.x0 + 2, hh.y1 - hh.y0 - 2); ctx.setLineDash([]); } }
    drawTimeline.tx = tx; drawTimeline.inv = x => t0 + (x - LW) / (w - LW - R) * WINDOW; drawTimeline.LW = LW;
  }
  $('#timeline').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = hits.filter(hh => x >= hh.x0 && x <= hh.x1 && y >= hh.y0 && y <= hh.y1).sort((a, b) => (a.x1 - a.x0) - (b.x1 - b.x0))[0];
    if (hit) select(`call:${hit.id}`);
    else if (x > drawTimeline.LW) select(`moment:${Math.round(drawTimeline.inv(x))}`);
  });
  $('#timeline').addEventListener('keydown', e => {
    const sorted = hits.slice().sort((a, b) => a.t - b.t);
    if (!sorted.length) return;
    if (cursorIdx < 0) cursorIdx = sorted.length - 1;
    if (e.key === 'ArrowLeft') { cursorIdx = Math.max(0, cursorIdx - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { cursorIdx = Math.min(sorted.length - 1, cursorIdx + 1); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { select(`call:${sorted[cursorIdx].id}`); e.preventDefault(); return; }
    else if (e.key === 'Escape') { backToLive(); return; }
    else return;
    drawTimeline();
  });
  $('#timeline').addEventListener('focus', () => drawTimeline());

  // ---------- interaction ----------
  function activate(target) {
    const n = target.closest('[data-sel]'); if (!n) return false;
    const id = n.getAttribute('data-sel');
    if (id === '__back') { const prev = history.pop(); select(prev === undefined ? null : prev, false); return true; }
    if (id === 'call:marker') return true;
    select(id);
    return true;
  }
  svg.addEventListener('click', e => activate(e.target));
  svg.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-sel]')) { e.preventDefault(); activate(e.target); } });
  insp.addEventListener('click', e => { if (e.target.closest('.lnk')) activate(e.target); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.target.closest('#timeline')) backToLive(); });
  function backToLive() { sel = null; history.length = 0; if (!sim.running) togglePause(); select(null, false); }
  $('#backLive').addEventListener('click', backToLive);
  function togglePause() {
    if (sim.running) sim.pause(); else sim.start();
    $('#pause').textContent = sim.running ? 'Pause' : 'Resume'; $('#pause').setAttribute('aria-pressed', String(!sim.running));
    updateMode(); drawTimeline();
  }
  $('#pause').addEventListener('click', togglePause);
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { sim.setSpeed(+b.dataset.speed); document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b)); dirty = true; }));
  function updateMode() {
    const m = $('#mode');
    if (!sim.running) { m.className = 'mode paused'; m.textContent = 'PAUSED'; }
    else if (sel) { m.className = 'mode hold'; m.textContent = sel.startsWith('moment:') ? `HOLD @ ${fmtT(+sel.slice(7))}` : `HOLD · ${short(sel.replace(/^call:/, ''), 18)}`; }
    else { m.className = 'mode live'; m.textContent = 'LIVE'; }
    $('#backLive').hidden = !sel && sim.running;
  }

  // ---------- boot ----------
  buildBoard();
  for (const l of S.lanes.slice().sort((a, b) => a.startedAt - b.startedAt)) assignSlot(l);
  // pre-route every static trace so the board reads as a finished layout
  for (const k of ['network', 'files', 'shell', 'other']) traceFor('model', `tool:${k}`);
  for (const k of ['network', 'files', 'agents', 'other']) traceFor(`tool:${k}`, 'context');
  for (const k of ['edits', 'memory', 'agents']) traceFor('context', `tool:${k}`);
  traceFor('tool:shell', 'terminal'); traceFor('terminal', 'context'); traceFor('tool:memory', 'plan'); traceFor('user', 'context'); traceFor('context', 'answer'); traceFor('mcp:github', 'tool:other');
  for (const n of CTXFILES) traceFor(n.id, 'context');
  for (let s = 0; s < NSLOT; s++) { const id = `slot:${s}`; for (const k of ['files', 'edits', 'shell', 'agents']) { traceFor(id, `tool:${k}`); traceFor(`tool:${k}`, id); } traceFor('terminal', id); }
  ensureFileGroups();
  seedTerminal(); renderTerm();
  // calls already running when the page opened: play their request hops
  for (const c of sim.runningCalls()) { startHops.set(c.id, c.flow.length); playHops(c, c.flow.slice()); }
  sim.start();
  renderAll(); renderInspector(true); drawTimeline(); drawScope();

  let lastT = performance.now(), lastTick = 0;
  function frame(t) {
    const dt = Math.min(100, t - lastT); lastT = t;
    if (sim.running) { const sp = sim.speed; animNow += dt * (sp < 1 ? sp : 1 + (sp - 1) * 0.45); }
    updatePulses(); updateLive();
    if (dirty && t - lastTick > 240) { dirty = false; lastTick = t; renderAll(); drawTimeline(); drawScope(); renderInspector(false); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => { drawTimeline(); drawScope(); });
  window.circuit = { sim, select, get sel() { return sel; } };
})();
