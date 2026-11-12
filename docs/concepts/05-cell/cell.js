/* AgentViz concept 05 - Living Cell.
 * The session is a cell under a microscope. The model is the nucleus, the membrane is the context window,
 * each tool kind is an organelle with its own behaviour, files are colonies outside, subagents are daughter cells,
 * errors are viruses. Every flow hop is a molecule that travels from its source to its destination.
 */
(() => {
  'use strict';
  const $ = sel => document.querySelector(sel);
  const TAU = Math.PI * 2;
  const RM = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sim = AgentVizSim.create({ seed: 7, history: 30 });
  const S = sim.state;
  const KINDS = sim.kinds;
  const KI = sim.kindInfo;

  // ---------- palette and vocabulary ----------
  const KC = { files: '#b6ff4a', edits: '#ff4fbf', shell: '#52f0dc', network: '#a78bff', agents: '#ffa3d6', memory: '#fff0b8', other: '#8ea3c4' };
  const ORGAN = { files: 'Receptors', edits: 'Golgi body', shell: 'Mitochondrion', network: 'Flagella', agents: 'Mitotic spindle', memory: 'Vacuole', other: 'Lysosome' };
  const BEHAVE = {
    files: 'Receptors on the membrane pull small molecules of file text in from the colonies outside.',
    edits: 'The Golgi body packages replacement text into vesicles and exocytoses them out to file colonies.',
    shell: 'The mitochondrion pulses with energy and releases ions to the terminal crystal, which grows a facet per command.',
    network: 'Flagella reach out to distant host particles and reel the page back along their length.',
    agents: 'The mitotic spindle buds a daughter cell (subagent). It works nearby and fuses its report back.',
    memory: 'The vacuole holds the task list as beads; plan changes arrive as pearls.',
    other: 'The lysosome digests anything else (MCP and misc tools).'
  };
  const MEM = { ok: '#f0b8ff', warn: '#ffae2b', bad: '#ff3048' };
  const memColor = p => (p >= 90 ? MEM.bad : p >= 70 ? MEM.warn : MEM.ok);
  const PROMPT_C = '#ffb3d9';
  const ERR_C = '#ff3048';
  const GLYPH = {
    files: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 17V9M9 9L4 3M9 9l5-6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="4" cy="3" r="1.6" fill="currentColor"/><circle cx="14" cy="3" r="1.6" fill="currentColor"/></svg>',
    edits: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5q6 4 12 0M3 9q6 4 12 0M4 13q5 3 10 0" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/><circle cx="16" cy="13" r="1.8" fill="none" stroke="currentColor"/></svg>',
    shell: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><ellipse cx="9" cy="9" rx="8" ry="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9l2-3 2 6 2-6 2 6 2-6 2 3" stroke="currentColor" stroke-width="1.1" fill="none"/></svg>',
    network: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="4" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 12q2-1 3-4t3-3 4-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>',
    agents: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="6.5" cy="9" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="13.5" cy="9" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    memory: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="8" r="1.7" fill="currentColor"/><circle cx="10" cy="6" r="1.7" fill="currentColor"/><circle cx="11" cy="11" r="1.7" fill="none" stroke="currentColor"/></svg>',
    other: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 2c4 0 7 3 6.5 7S12 16 8.5 16 2 13 2.5 9 5 2 9 2z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="8" r="1.1" fill="currentColor"/><circle cx="11" cy="10" r="1.1" fill="currentColor"/></svg>'
  };

  // ---------- helpers ----------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const clock = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const ago = ms => (ms < 1500 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)}s ago` : `${Math.floor(ms / 60000)}m ${pad(Math.round(ms % 60000 / 1000) % 60)}s ago`);
  const dur = ms => (ms == null || !Number.isFinite(ms) ? '-' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)}m ${Math.round(ms % 60000 / 1000)}s`);
  const ktok = n => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n || 0)));
  const kb = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1000 ? `${(n / 1000).toFixed(1)} kB` : `${n} B`);
  const hash = s => { let h = 2166136261; const str = String(s); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const hr = (s, k = 0) => (hash(`${s}:${k}`) % 100000) / 100000;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const base = p => String(p).split('/').pop();
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
  const hostOf = url => { try { return new URL(url).host; } catch { return null; } };
  const lastPromptTime = () => { for (let i = S.markers.length - 1; i >= 0; i--) if (S.markers[i].kind === 'prompt') return S.markers[i].time; return 0; };

  // ---------- canvas and virtual space ----------
  const VW = 1000, VH = 760;
  const cv = $('#scope'), ctx = cv.getContext('2d');
  let CW = 0, CH = 0, DPR = 1, SC = 1, OX = 0, OY = 0;
  function resize() {
    const r = cv.parentElement.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1; CW = r.width; CH = r.height;
    cv.width = Math.max(1, Math.round(CW * DPR)); cv.height = Math.max(1, Math.round(CH * DPR));
    SC = Math.min(CW / VW, CH / VH); OX = (CW - VW * SC) / 2; OY = (CH - VH * SC) / 2;
    resizeChart(); drawSpark();
  }
  const F = (px, weight = '') => `${weight} ${Math.max(px, 10 / SC).toFixed(1)}px "Segoe UI", system-ui, sans-serif`;
  const FM = (px, weight = '') => `${weight} ${Math.max(px, 9.5 / SC).toFixed(1)}px "Cascadia Code", Consolas, monospace`;

  const sprites = {};
  function sprite(color) {
    if (sprites[color]) return sprites[color];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(color, 0.9)); gr.addColorStop(0.3, rgba(color, 0.35)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (sprites[color] = c);
  }
  function glow(x, y, r, color, a = 1) {
    if (r <= 0 || a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(a, 0, 1);
    ctx.drawImage(sprite(color), x - r, y - r, r * 2, r * 2); ctx.restore();
  }
  function label(text, x, y, opts = {}) {
    ctx.save();
    ctx.font = opts.mono ? FM(opts.size || 10, opts.weight) : F(opts.size || 10, opts.weight);
    ctx.textAlign = opts.align || 'center'; ctx.textBaseline = opts.baseline || 'middle';
    if (opts.bg) {
      const w = ctx.measureText(text).width, h = Math.max(opts.size || 10, 10 / SC) + 5;
      const bx = opts.align === 'left' ? x - 3 : opts.align === 'right' ? x - w - 3 : x - w / 2 - 3;
      ctx.fillStyle = opts.bg; ctx.strokeStyle = opts.border || 'transparent'; ctx.lineWidth = 1 / SC;
      roundRect(bx, y - h / 2, w + 6, h, 3); ctx.fill(); if (opts.border) ctx.stroke();
    }
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.fillStyle = opts.color || '#f6e4f3';
    ctx.fillText(text, x, y); ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // ---------- animation clock (stops when paused) ----------
  let T = 0, paused = false;
  const timers = [];
  const after = (sec, fn) => timers.push({ at: T + sec, fn });

  // ---------- the cell ----------
  const C = { x: 440, y: 388 };
  let R = 140;
  const targetR = () => 138 + 72 * Math.min(1, S.context.percent / 92);
  const NM = 96, mo = new Float32Array(NM), mv = new Float32Array(NM);
  const WA = RM ? 0.25 : 1;
  const wob = a => 1 + WA * (0.02 * Math.sin(3 * a + T * 0.6) + 0.013 * Math.sin(5 * a - T * 0.9 + 1) + 0.016 * Math.sin(2 * a + T * 0.33 + 2));
  function norm(a) { return ((a % TAU) + TAU) % TAU; }
  function memR(a) { a = norm(a); const f = a / TAU * NM; const i = Math.floor(f) % NM, j = (i + 1) % NM, t = f - Math.floor(f); return R * wob(a) + mo[i] * (1 - t) + mo[j] * t; }
  function memPt(a, inset = 0) { const r = memR(a) - inset; return { x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r }; }
  function kick(a, amt) { const c = Math.round(norm(a) / TAU * NM); for (let k = -7; k <= 7; k++) mv[((c + k) % NM + NM) % NM] += amt * Math.exp(-k * k / 10); }
  function stepMem(dt) {
    const steps = Math.ceil(dt / 0.008); const h = dt / Math.max(1, steps);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < NM; i++) { const l = mo[(i + NM - 1) % NM] + mo[(i + 1) % NM] - 2 * mo[i]; mv[i] += (-30 * mo[i] + 90 * l - 4.5 * mv[i]) * h; }
      for (let i = 0; i < NM; i++) mo[i] = clamp(mo[i] + mv[i] * h, -32, 32);
    }
  }
  const cp = (u, v) => ({ x: C.x + u * R, y: C.y + v * R });
  const ORG = { nucleus: [-0.06, 0.03], vacuole: [-0.42, -0.40], golgi: [-0.50, 0.36], mito: [0.40, 0.44], lyso: [-0.10, 0.74], spindle: [0.74, 0.16] };
  const PLASTID = [[0.36, -0.52], [0.04, -0.70], [0.66, -0.28], [0.50, -0.04]];
  const REC_ANG = [150, 168, 186, 204, 222].map(d => d * Math.PI / 180);
  const PIPETTE = { x: 318, y: 74 };
  const ANSWER = { x: 420, y: 28 };
  const CRYSTAL = { x: 465, y: 690 };
  const DKA = { files: Math.PI, edits: 0.75 * Math.PI, shell: 0.25 * Math.PI, network: -0.25 * Math.PI, agents: 0, memory: -0.75 * Math.PI, other: 0.5 * Math.PI };

  // colonies (files on disk) outside the cell, on the left
  const colonies = new Map();
  let colonySlot = 0;
  function colony(path) {
    let c = colonies.get(path);
    if (!c) {
      const i = colonySlot++;
      const ang = (116 + (i % 15) * 8.6) * Math.PI / 180;
      const d = (i % 2 ? 338 : 274) + (i >= 15 ? 58 : 0);
      c = { path, x: C.x + Math.cos(ang) * d, y: C.y + Math.sin(ang) * d, ang, pulse: 0, pulseC: KC.edits, born: T };
      colonies.set(path, c);
    }
    return c;
  }
  for (const n of S.nodes) if (n.group === 'disk') colony(n.id.slice(5));
  const colonyLines = path => (S.files[path] ? S.files[path].lines : (sim.node(`file:${path}`) || {}).lines || 60);
  const colonyR = path => clamp(5 + Math.sqrt(Math.max(10, colonyLines(path))) * 0.62, 6, 26);

  // hosts (web) at the top right
  const hosts = new Map();
  const webNodes = S.nodes.filter(n => n.group === 'web');
  webNodes.forEach((n, i) => {
    const a = (-68 + i * (44 / Math.max(1, webNodes.length - 1))) * Math.PI / 180;
    hosts.set(n.id, { id: n.id, label: n.label, a, x: C.x + Math.cos(a) * 360, y: C.y + Math.sin(a) * 360, ext: 0.14, until: 0, pulse: 0 });
  });
  const hostPos = id => hosts.get(id) || hosts.values().next().value;
  function flagPoint(hostId, s) {
    const h = hostPos(hostId); const b = memPt(h.a);
    const L = Math.max(10, dist(b, h) - 12); const len = L * h.ext * s;
    const dx = (h.x - b.x) / (dist(b, h) || 1), dy = (h.y - b.y) / (dist(b, h) || 1);
    const amp = (3 + 7 * s) * (RM ? 0.3 : 1) * Math.min(1, s * 4);
    const w = Math.sin(len / 20 - T * 5 + (hash(hostId) % 7)) * amp;
    return { x: b.x + dx * len - dy * w, y: b.y + dy * len + dx * w };
  }

  // context-file plastids
  const plastidOrder = [];
  const plastidBorn = {};
  function plastidPos(path) { let i = plastidOrder.indexOf(path); if (i < 0) { plastidOrder.push(path); i = plastidOrder.length - 1; } const p = PLASTID[i % PLASTID.length]; return cp(p[0], p[1]); }
  for (const f of S.context.files) plastidPos(f.path);

  // ---------- daughters (subagent lanes) ----------
  const daughters = new Map();
  function slotHome(slot) { return { x: 785 + (slot >= 3 ? 105 : 0), y: 325 + (slot % 3) * 122 }; }
  function addDaughter(lane, settled) {
    if (daughters.has(lane.key)) return;
    const pd = daughters.get(lane.parent);
    const used = new Set([...daughters.values()].filter(d => d.slot != null).map(d => d.slot));
    let slot = 0; while (used.has(slot)) slot++;
    const d = { key: lane.key, lane, parent: lane.parent, depth: lane.depth, r: lane.depth > 1 ? 25 : 35, x: 0, y: 0, scale: settled ? 1 : 0.35, phase: settled ? 'live' : 'bud', t0: T, endT: null, slot: pd ? null : slot, fallback: slotHome(slot), kinds: new Set(), activeT: {}, ph: hr(lane.key) * TAU };
    for (const c of S.calls) if (c.lane === lane.key) d.kinds.add(c.kind);
    const h = home(d); d.x = h.x; d.y = h.y;
    if (!settled) { const o = budOrigin(d, h); d.x = o.x; d.y = o.y; }
    daughters.set(lane.key, d);
  }
  function home(d) {
    const pd = daughters.get(d.parent);
    if (d.depth > 1 && pd) return { x: Math.min(VW - 34, (pd.hx ?? pd.x) + 92), y: (pd.hy ?? pd.y) + 58 * (hr(d.key, 2) < 0.5 ? 1 : -1) };
    return d.slot != null ? slotHome(d.slot) : d.fallback;
  }
  function parentEdge(d, toward) {
    const pd = daughters.get(d.parent);
    if (pd) { const a = Math.atan2(toward.y - pd.y, toward.x - pd.x); return { x: pd.x + Math.cos(a) * pd.r * pd.scale, y: pd.y + Math.sin(a) * pd.r * pd.scale }; }
    return memPt(Math.atan2(toward.y - C.y, toward.x - C.x));
  }
  const budOrigin = (d, h) => parentEdge(d, h);
  function updateDaughters(dt) {
    for (const d of [...daughters.values()]) {
      const h = home(d); d.hx = h.x; d.hy = h.y;
      const drift = { x: Math.sin(T * 0.5 + d.ph) * 4 * WA, y: Math.cos(T * 0.4 + d.ph) * 5 * WA };
      if (d.phase === 'bud') {
        const t = clamp((T - d.t0) / 1.8, 0, 1); const o = budOrigin(d, h);
        d.x = lerp(o.x, h.x, ease(t)); d.y = lerp(o.y, h.y, ease(t)); d.scale = lerp(0.35, 1, ease(t));
        if (t >= 1) { d.phase = 'live'; }
      } else if (d.phase === 'live') {
        d.x += (h.x + drift.x - d.x) * Math.min(1, dt * 2); d.y += (h.y + drift.y - d.y) * Math.min(1, dt * 2);
        if (d.endT != null && T - d.endT > 2.8) { d.phase = 'fuse'; d.t0 = T; d.fx = d.x; d.fy = d.y; }
      } else if (d.phase === 'fuse') {
        const t = clamp((T - d.t0) / 1.7, 0, 1); const o = parentEdge(d, { x: d.fx, y: d.fy });
        d.x = lerp(d.fx, o.x, ease(t)); d.y = lerp(d.fy, o.y, ease(t)); d.scale = lerp(1, 0.15, ease(t));
        if (t >= 1) {
          const pd = daughters.get(d.parent);
          if (pd) pd.pulse = T; else kick(Math.atan2(d.fy - C.y, d.fx - C.x), 70);
          daughters.delete(d.key);
        }
      }
    }
  }
  function lanePos(key) {
    const d = daughters.get(key);
    if (d) return { x: d.x, y: d.y };
    return memPt(0.1);
  }

  // ---------- tool positions ----------
  function toolHint(kind, call) {
    if (kind === 'files') {
      const file = call.target && call.target.type === 'file' ? call.target.value : null;
      const known = file && colonies.has(file) ? colonies.get(file) : null;
      if (known) { let best = 0, bd = 9; REC_ANG.forEach((a, i) => { const dd = Math.abs(a - known.ang); if (dd < bd) { bd = dd; best = i; } }); return best; }
      return hash(call.id) % REC_ANG.length;
    }
    if (kind === 'network') {
      const url = call.target && call.target.type === 'url' ? hostOf(call.target.value) : null;
      if (url && hosts.has(`web:${url}`)) return `web:${url}`;
      const hop = call.flow.find(h => h.from.startsWith('web:') || h.from.startsWith('mcp:'));
      return hop ? hop.from : null;
    }
    return null;
  }
  function organPos(kind, hint) {
    switch (kind) {
      case 'files': return memPt(REC_ANG[hint ?? 2], 3);
      case 'edits': return cp(...ORG.golgi);
      case 'shell': return cp(...ORG.mito);
      case 'network': return memPt(hint && hosts.has(hint) ? hosts.get(hint).a : -52 * Math.PI / 180, 2);
      case 'agents': return cp(...ORG.spindle);
      case 'memory': return cp(ORG.vacuole[0] + 0.14, ORG.vacuole[1] + 0.16);
      default: return cp(...ORG.lyso);
    }
  }
  function toolPos(kind, lane, hint) {
    if (lane && lane !== 'main') {
      const d = daughters.get(lane);
      if (d) { const a = DKA[kind] ?? 0; return { x: d.x + Math.cos(a) * d.r * d.scale * 0.55, y: d.y + Math.sin(a) * d.r * d.scale * 0.55 }; }
      return memPt(0.1, 4);
    }
    return organPos(kind, hint);
  }
  const anchorFor = call => toolPos(call.kind, call.lane, toolHint(call.kind, call));

  function getter(id, call, seed) {
    if (id === 'model') return call.lane === 'main' ? () => cp(...ORG.nucleus) : () => lanePos(call.lane);
    if (id === 'context') { const a = hr(seed, 1) * TAU, rr = 0.3 + 0.52 * Math.sqrt(hr(seed, 2)); const u = Math.cos(a) * rr, v = Math.sin(a) * rr; return () => cp(u, v); }
    if (id.startsWith('tool:')) { const kind = id.slice(5); return () => toolPos(kind, call.lane, toolHint(kind, call)); }
    if (id.startsWith('file:')) { const c = colony(id.slice(5)); return () => ({ x: c.x, y: c.y }); }
    if (id.startsWith('web:') || id.startsWith('mcp:')) return () => { const h = hostPos(id); return { x: h.x, y: h.y }; };
    if (id.startsWith('ctxfile:')) { const p = id.slice(8); return () => plastidPos(p); }
    if (id.startsWith('lane:')) { const key = id.slice(5); return () => lanePos(key); }
    if (id === 'terminal') return () => ({ x: CRYSTAL.x, y: CRYSTAL.y - 18 });
    if (id === 'plan') return () => cp(...ORG.vacuole);
    if (id === 'answer') return () => ({ ...ANSWER });
    if (id === 'user') return () => ({ ...PIPETTE });
    return () => cp(0, 0);
  }
  // inside the main cell = 'in', on its membrane = 'mem', elsewhere = 'out'
  function where(id, call) {
    if (id === 'context' || id === 'plan' || id.startsWith('ctxfile:')) return 'in';
    if (id === 'model') return call.lane === 'main' ? 'in' : 'out';
    if (id.startsWith('tool:')) { if (call.lane !== 'main') return 'out'; const k = id.slice(5); return k === 'files' || k === 'network' ? 'mem' : 'in'; }
    return 'out';
  }

  // ---------- granules: the cytoplasm is the context window's content ----------
  const granules = [];
  function sampleColor(s) {
    if (s.callId) { const c = sim.callById(s.callId); if (c) return KC[c.kind]; }
    if (/^Loaded/.test(s.why || '')) return '#e8f0ff';
    return PROMPT_C;
  }
  const granuleTarget = () => Math.min(320, Math.round(S.context.used / 650));
  function addGranule(u, v, color, born = T) {
    const a = Math.atan2(v, u); let r = Math.hypot(u, v); if (r > 0.86) r = 0.86;
    granules.push({ u: Math.cos(a) * r, v: Math.sin(a) * r, c: color, s: 0.9 + Math.random() * 1.4, ph: Math.random() * TAU, f: 0.3 + Math.random() * 0.6, born, dying: null });
  }
  (function seedGranules() {
    const lastCompact = [...S.markers].reverse().find(m => m.kind === 'compaction');
    const since = lastCompact ? lastCompact.time : 0;
    const pool = S.context.samples.filter(s => s.time >= since && s.delta > 0);
    const total = pool.reduce((a, s) => a + s.delta, 0) || 1;
    const n = granuleTarget();
    for (let i = 0; i < n; i++) {
      let x = Math.random() * total, chosen = pool[pool.length - 1];
      for (const s of pool) { x -= s.delta; if (x <= 0) { chosen = s; break; } }
      const a = Math.random() * TAU, r = 0.15 + 0.7 * Math.sqrt(Math.random());
      addGranule(Math.cos(a) * r, Math.sin(a) * r, chosen ? sampleColor(chosen) : PROMPT_C, -10);
    }
  })();
  function reconcileGranules() {
    const live = granules.filter(g => !g.dying).length; const target = granuleTarget();
    if (live < target - 2) { const s = S.context.samples[S.context.samples.length - 1]; const a = Math.random() * TAU, r = 0.2 + 0.6 * Math.sqrt(Math.random()); addGranule(Math.cos(a) * r, Math.sin(a) * r, s ? sampleColor(s) : PROMPT_C); }
    else if (live > target + 2 && T - lastExpel > 1.5) { const g = granules.find(x => !x.dying); if (g) g.dying = T; }
    for (let i = granules.length - 1; i >= 0; i--) if (granules[i].dying != null && T - granules[i].dying > 1.2) granules.splice(i, 1);
  }

  // ---------- particles (one per flow hop) ----------
  const parts = [];
  const flowSeen = new Map();
  for (const c of S.calls) flowSeen.set(c.id, c.flow.length);
  function shapeFor(call, hop) {
    const f = hop.from, t = hop.to;
    if (/error/.test(hop.what)) return 'error';
    switch (call.kind) {
      case 'files': return f.startsWith('file:') ? 'chain' : f.startsWith('tool:') ? 'hex' : 'signal';
      case 'edits': return t.startsWith('file:') ? 'vesicle' : 'strand';
      case 'shell': return t === 'terminal' ? 'ions' : f === 'terminal' ? 'shard' : 'spark';
      case 'network': return f.startsWith('web:') ? 'droplet' : f.startsWith('tool:') ? 'droplet' : 'signal';
      case 'agents': return 'capsule';
      case 'memory': return 'bead';
      default: return f.startsWith('mcp:') || f.startsWith('tool:') ? 'blob' : 'signal';
    }
  }
  function partSize(hop) {
    const amt = hop.tokens ? Math.sqrt(hop.tokens) / 5.2 : hop.bytes ? Math.sqrt(hop.bytes) / 36 : 0;
    return clamp(2.4 + amt, 2.4, 15);
  }
  function spawnHop(call, hop, i) {
    const seed = `${call.id}:${i}`;
    const from = getter(hop.from, call, seed), to = getter(hop.to, call, seed);
    const wf = where(hop.from, call), wt = where(hop.to, call);
    const cross = (wf === 'in' && wt === 'out') ? 'to' : (wf === 'out' && wt === 'in') ? 'from' : null;
    const shape = shapeFor(call, hop);
    const size = partSize(hop);
    const net = call.kind === 'network' && call.lane === 'main' && (hop.from.startsWith('web:') || hop.from.startsWith('mcp:')) && hosts.has(hop.from) ? hop.from : null;
    const len = dist(from(), to());
    const d = RM ? 0.55 : (0.8 + len / 380) * (1 + size / 45) * (shape === 'chain' ? 1.15 : 1);
    if (net) { const h = hosts.get(net); h.until = T + d + 0.4; h.ext = Math.max(h.ext, 0.98); }
    const failed = call.status === 'error' && /failure|error/.test(hop.what);
    parts.push({ call, hop, i, shape, from, to, cross, t0: T, dur: d, size, net, kicked: false, failed,
      color: shape === 'error' || failed ? ERR_C : KC[call.kind], bow: (hr(seed, 3) - 0.5) * 0.55, seed: hash(seed) });
  }
  function estDur(call, hop, i) { try { const a = getter(hop.from, call, `${call.id}:${i}`)(), b = getter(hop.to, call, `${call.id}:${i}`)(); return RM ? 0.55 : (0.8 + dist(a, b) / 380) * (1 + partSize(hop) / 45); } catch { return 1; } }
  function launch(call) {
    const seen = flowSeen.get(call.id) || 0; const hops = call.flow.slice(seen); flowSeen.set(call.id, call.flow.length);
    let delay = 0;
    hops.forEach((hop, k) => {
      const idx = seen + k;
      // parallel hops from several files (Grep) leave together; a chain hop waits for the previous one
      const parallel = k > 0 && hops[k - 1].to === hop.to && hops[k - 1].from !== hop.from && hop.from.startsWith('file:');
      if (!parallel && k > 0) delay += estDur(call, hops[k - 1], idx - 1) * 0.85;
      after(delay + (parallel ? k * 0.06 : 0), () => spawnHop(call, hop, idx));
    });
  }
  function partPos(p, t) {
    if (p.net) { const h = hosts.get(p.net); h.ext = Math.max(h.ext, 0.98); return flagPoint(p.net, 1 - t); }
    const a = p.from(), b = p.to();
    let c;
    if (p.cross) {
      const out = p.cross === 'to' ? b : a; const m = memPt(Math.atan2(out.y - C.y, out.x - C.x));
      c = { x: 2 * m.x - (a.x + b.x) / 2, y: 2 * m.y - (a.y + b.y) / 2 };
    } else { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; c = { x: mx - (b.y - a.y) * p.bow, y: my + (b.x - a.x) * p.bow }; }
    const u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }
  function arrive(p) {
    const to = p.hop.to; const end = p.to();
    if (to === 'context') {
      const n = clamp(Math.round((p.hop.tokens || 200) / 650), 1, 10);
      const u = (end.x - C.x) / R, v = (end.y - C.y) / R;
      for (let i = 0; i < n; i++) addGranule(u + (Math.random() - 0.5) * 0.18, v + (Math.random() - 0.5) * 0.18, p.color === ERR_C ? '#ff6b7d' : KC[p.call.kind]);
    } else if (to.startsWith('file:')) {
      const c = colony(to.slice(5)); c.pulse = T; c.pulseC = KC[p.call.kind];
    } else if (to === 'terminal') { crystalFlash = T; }
    else if (to === 'plan') { vacuolePulse = T; }
    else if (to.startsWith('lane:')) { const d = daughters.get(to.slice(5)); if (d) d.pulse = T; }
    else if (to === 'answer') { answerPulse = T; }
    if (p.hop.from.startsWith('file:') && p.call.kind === 'files') { const c = colonies.get(p.hop.from.slice(5)); if (c) { c.pulse = T; c.pulseC = KC.files; } }
  }

  // ---------- markers-driven extra particles: prompts in, replies out ----------
  const signals = []; // free particles not tied to a call
  let answerPulse = -9, vacuolePulse = -9, crystalFlash = -9, lastExpel = -9;
  const vesicles = []; // expelled on compaction
  function promptDrop(m) { signals.push({ kind: 'prompt', m, t0: T, dur: RM ? 0.6 : 2.2, from: () => ({ ...PIPETTE }), to: () => cp(...ORG.nucleus), color: PROMPT_C, size: 6 }); }
  function replySignal(m) {
    signals.push({ kind: 'reply', m, t0: T, dur: RM ? 0.6 : 2.0, from: () => cp(...ORG.nucleus), to: () => ({ ...ANSWER }), color: PROMPT_C, size: 5 });
    if (!RM) for (let k = 0; k < 3; k++) after(k * 0.35, () => signals.push({ kind: 'ring', t0: T, dur: 1.8, at: memPt(-1.75), color: '#ffd1ec' }));
  }
  function expel(m) {
    const live = granules.filter(g => !g.dying);
    const keep = granuleTarget(); const out = live.slice(0, Math.max(0, live.length - keep));
    const cols = out.map(g => g.c);
    for (const g of out) granules.splice(granules.indexOf(g), 1);
    const ang = 2.45; const start = memPt(ang);
    vesicles.push({ t0: T, ang, x: start.x, y: start.y, cols, m, r: 22 + Math.sqrt(cols.length) * 2.6 });
    kick(ang, 160); lastExpel = T;
  }

  // ---------- viruses (errors) ----------
  const viruses = new Map();
  const resolvedBy = id => S.calls.find(c => (c.retryOf === id || c.causedBy === id) && c.status === 'success');
  function addVirus(call, born = T) {
    if (viruses.has(call.id)) return;
    viruses.set(call.id, { call, born, engulf: null, dormant: null, off: hr(call.id, 5) * TAU });
  }
  for (const e of S.errors) if (e.startedAt >= lastPromptTime() && !resolvedBy(e.id)) addVirus(e, -10);
  function checkViruses() {
    for (const v of viruses.values()) {
      if (v.engulf == null && v.dormant == null) { const fix = resolvedBy(v.call.id); if (fix) { v.engulf = T; v.fix = fix; } }
      if ((v.engulf != null && T - v.engulf > 1.8) || (v.dormant != null && T - v.dormant > 3)) viruses.delete(v.call.id);
    }
  }
  function virusPos(v) {
    const a = anchorFor(v.call);
    const r = v.call.lane === 'main' ? 17 : 12;
    return { x: a.x + Math.cos(v.off + T * 0.3 * WA) * r, y: a.y + Math.sin(v.off + T * 0.3 * WA) * r };
  }

  // ---------- shell crystal ----------
  const shellCalls = S.calls.filter(c => c.kind === 'shell');

  // ---------- activity bookkeeping ----------
  const activeT = {};
  sim.on('start', call => {
    launch(call);
    if (call.kind === 'shell') shellCalls.push(call);
    if (call.lane === 'main') activeT[call.kind] = T;
    const d = daughters.get(call.lane); if (d) { d.kinds.add(call.kind); d.activeT[call.kind] = T; }
    if (call.kind === 'network') { const h = toolHint('network', call); if (h && hosts.has(h)) hosts.get(h).until = T + 0.6; }
    dirty = true;
  });
  sim.on('end', call => {
    launch(call);
    if (call.status === 'error') addVirus(call);
    if (call.kind === 'shell') crystalFlash = T;
    dirty = true;
  });
  sim.on('marker', m => {
    if (m.kind === 'prompt') { promptDrop(m); for (const v of viruses.values()) if (v.engulf == null) v.dormant = T; }
    if (m.kind === 'turn-complete') replySignal(m);
    if (m.kind === 'compaction') expel(m);
    if (m.kind === 'context-file') { plastidPos(m.detail.path); plastidBorn[m.detail.path] = T; signals.push({ kind: 'ctxload', t0: T, dur: RM ? 0.5 : 1.6, from: () => ({ ...PIPETTE }), to: () => plastidPos(m.detail.path), color: '#e8f0ff', size: 5, m }); }
    dirty = true;
  });
  sim.on('lane', lane => {
    if (lane.role !== 'subagent') return;
    if (lane.state === 'running') addDaughter(lane, false);
    else { const d = daughters.get(lane.key); if (d && d.endT == null) d.endT = T; }
    dirty = true;
  });
  sim.on('tasks', () => { vacuolePulse = T; dirty = true; });
  for (const lane of S.lanes) if (lane.role === 'subagent' && lane.state === 'running') addDaughter(lane, true);

  // ---------- hit regions ----------
  let hits = [];
  const hit = (id, x, y, r, title, sub, pri = 5) => hits.push({ id, x, y, r, title, sub, pri });
  let hover = null, kbdFocus = null, sel = null;
  let mouse = null;

  // ---------- drawing ----------
  const bokeh = Array.from({ length: 26 }, (_, i) => ({ x: hr('bk', i), y: hr('bk', i + 99), r: 18 + hr('bk', i + 7) * 80, c: ['#ff3fb4', '#b6ff4a', '#ffb3d9', '#a78bff'][i % 4], a: 0.025 + hr('bk', i + 3) * 0.05, s: 0.004 + hr('bk', i + 5) * 0.01 }));
  function drawBackground() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    for (const b of bokeh) {
      const x = ((b.x + T * b.s * WA) % 1.1 - 0.05) * CW, y = (b.y + Math.sin(T * 0.1 + b.r) * 0.02) * CH;
      glow(x, y, b.r * 1.2, b.c, b.a * 2.2);
    }
  }
  function view() { ctx.setTransform(DPR * SC, 0, 0, DPR * SC, DPR * OX, DPR * OY); }

  function drawHosts() {
    const running = sim.runningCalls();
    const searching = running.some(c => c.kind === 'network' && c.lane === 'main' && c.target && c.target.type === 'query');
    for (const h of hosts.values()) {
      const busy = running.some(c => c.kind === 'network' && c.lane === 'main' && toolHint('network', c) === h.id) || T < h.until;
      const target = busy ? 1 : searching ? 0.45 : 0.14;
      h.ext += (target - h.ext) * Math.min(1, dt * 2.6);
      // flagellum
      ctx.save(); ctx.lineCap = 'round';
      const n = 26; let prev = flagPoint(h.id, 0);
      for (let k = 1; k <= n; k++) {
        const s = k / n; const pt = flagPoint(h.id, s);
        ctx.strokeStyle = rgba(KC.network, busy ? 0.85 : 0.5); ctx.lineWidth = (busy ? 2.6 : 1.8) * (1 - s * 0.7);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pt.x, pt.y); ctx.stroke(); prev = pt;
      }
      ctx.restore();
      if (busy) glow(prev.x, prev.y, 12, KC.network, 0.6);
      // host particle (a diatom)
      const fetches = S.calls.filter(c => (c.kind === 'network' && toolHint('network', c) === h.id) || (h.id.startsWith('mcp:') && c.kind === 'other')).length;
      const r = 9 + Math.min(6, fetches);
      glow(h.x, h.y, r * 2.4, KC.network, 0.25 + (busy ? 0.35 : 0));
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(T * 0.15 * WA + h.a);
      ctx.fillStyle = 'rgba(40,20,70,.75)'; ctx.strokeStyle = rgba(h.id.startsWith('mcp:') ? KC.other : KC.network, 0.95); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 0.8; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3); ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); ctx.stroke(); }
      ctx.restore();
      label(h.label, h.x + (h.x > 640 ? 0 : 0), h.y - r - 9, { size: 9.5, color: '#cbbcff', alpha: 0.9 });
      hit(`host:${h.id}`, h.x, h.y, r + 6, `Host particle · ${h.label}`, `${fetches} requests · flagellum ${busy ? 'reaching' : 'resting'}`, 3);
    }
  }

  function drawColonies() {
    for (const c of colonies.values()) {
      const f = S.files[c.path];
      const r = colonyR(c.path);
      const hot = f && f.edits >= 3;
      const pulse = clamp(1 - (T - c.pulse) / 1.2, 0, 1);
      const baseC = f && f.edits ? KC.edits : f && f.reads ? KC.files : '#c9a9d6';
      if (hot) glow(c.x, c.y, r * 3.2 * (1 + 0.08 * Math.sin(T * 5)), KC.edits, 0.65);
      glow(c.x, c.y, r * 2 + pulse * 18, pulse > 0 ? c.pulseC : baseC, 0.18 + pulse * 0.6);
      // a colony: a cluster of round cells
      const n = clamp(Math.round(r / 2.2), 3, 11);
      ctx.save();
      for (let k = 0; k < n; k++) {
        const a = hr(c.path, k) * TAU, rr = k === 0 ? 0 : r * (0.35 + 0.45 * hr(c.path, k + 30));
        const cr = r * (k === 0 ? 0.5 : 0.22 + 0.18 * hr(c.path, k + 60));
        const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr;
        ctx.beginPath(); ctx.arc(x, y, cr * (1 + pulse * 0.15), 0, TAU);
        ctx.fillStyle = rgba(baseC, f ? 0.16 + Math.min(0.3, (f.reads + f.edits) * 0.03) : 0.08);
        ctx.strokeStyle = rgba(baseC, f ? 0.85 : 0.45); ctx.lineWidth = 1;
        ctx.fill(); ctx.stroke();
      }
      if (f && f.failed) { ctx.strokeStyle = ERR_C; ctx.setLineDash([2, 3]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(c.x, c.y, r + 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      ctx.restore();
      label(`${hot ? '✺ ' : ''}${base(c.path)}`, c.x, c.y + r + 9, { size: 9.5, color: hot ? '#ffd6f0' : f ? '#ead7ef' : '#a68aa9', mono: true });
      hit(`file:${c.path}`, c.x, c.y, r + 5, `Colony · ${c.path}`, f ? `${colonyLines(c.path)} lines · R${f.reads} E${f.edits}${f.failed ? ` ✗${f.failed}` : ''} · +${f.added} −${f.removed}${hot ? ' · HOT' : ''}` : `${colonyLines(c.path)} lines · untouched`, 3);
    }
  }

  function drawCrystal() {
    const list = shellCalls.slice(-18);
    const flash = clamp(1 - (T - crystalFlash) / 1.0, 0, 1);
    glow(CRYSTAL.x, CRYSTAL.y - 20, 56 + flash * 20, KC.shell, 0.18 + flash * 0.35);
    ctx.save();
    // base rock
    ctx.fillStyle = 'rgba(30,60,70,.5)'; ctx.strokeStyle = rgba(KC.shell, 0.5); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(CRYSTAL.x, CRYSTAL.y + 2, 34, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
    list.forEach((c, i) => {
      const a = -Math.PI / 2 + (hr(c.id, 1) - 0.5) * 1.9;
      const lines = c.output && c.output.lines ? c.output.lines : 20;
      const L = 16 + Math.min(34, lines * 0.45) + i * 0.6;
      const w = 4 + hr(c.id, 2) * 3.5;
      const ox = CRYSTAL.x + (hr(c.id, 3) - 0.5) * 34, oy = CRYSTAL.y;
      const tip = { x: ox + Math.cos(a) * L, y: oy + Math.sin(a) * L };
      const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
      const sh = { x: ox + Math.cos(a) * L * 0.78, y: oy + Math.sin(a) * L * 0.78 };
      ctx.beginPath(); ctx.moveTo(ox + nx, oy + ny); ctx.lineTo(sh.x + nx, sh.y + ny); ctx.lineTo(tip.x, tip.y); ctx.lineTo(sh.x - nx, sh.y - ny); ctx.lineTo(ox - nx, oy - ny); ctx.closePath();
      const err = c.status === 'error', run = c.status === 'running';
      ctx.fillStyle = err ? 'rgba(40,0,12,.85)' : run ? 'rgba(82,240,220,.06)' : rgba(KC.shell, 0.18 + (i / list.length) * 0.25);
      ctx.strokeStyle = err ? ERR_C : rgba(KC.shell, run ? 0.5 + 0.5 * Math.sin(T * 6) : 0.85);
      ctx.lineWidth = err ? 1.6 : 1; if (run) ctx.setLineDash([3, 2]);
      ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tip.x, tip.y); ctx.strokeStyle = err ? 'rgba(255,48,72,.5)' : 'rgba(220,255,250,.35)'; ctx.lineWidth = 0.6; ctx.stroke();
      if (err) label('!', tip.x, tip.y - 6, { size: 9, color: '#ff8796', weight: '700' });
      if (i === list.length - 1) hit(`call:${c.id}`, tip.x, tip.y, 7, `Newest facet · ${c.input.command}`, `${c.status === 'running' ? 'running' : `exit ${c.output && c.output.exitCode != null ? c.output.exitCode : '?'}`} · ${c.laneLabel}`, 2);
    });
    ctx.restore();
    const last = [...shellCalls].reverse().find(c => c.status !== 'running');
    label(`terminal crystal · ${shellCalls.length} commands`, CRYSTAL.x, CRYSTAL.y + 20, { size: 10, color: '#b7fff4' });
    if (last) label(`last: ${last.input.command} → exit ${last.output && last.output.exitCode != null ? last.output.exitCode : '?'}`, CRYSTAL.x, CRYSTAL.y + 34, { size: 9, color: last.status === 'error' ? '#ff8796' : '#8fd9cf', mono: true });
    hit('terminal', CRYSTAL.x, CRYSTAL.y - 16, 40, 'Terminal crystal', `${shellCalls.length} commands · one facet each`, 4);
  }

  function drawPipette() {
    ctx.save();
    const p = PIPETTE; const pulse = signals.some(s => s.kind === 'prompt' && T - s.t0 < 1);
    ctx.strokeStyle = rgba(PROMPT_C, 0.55); ctx.fillStyle = 'rgba(255,179,217,.06)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p.x - 9, -10); ctx.lineTo(p.x - 9, p.y - 26); ctx.lineTo(p.x - 1.5, p.y); ctx.lineTo(p.x + 1.5, p.y); ctx.lineTo(p.x + 9, p.y - 26); ctx.lineTo(p.x + 9, -10); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (pulse) glow(p.x, p.y, 20, PROMPT_C, 0.6);
    const prompts = S.markers.filter(m => m.kind === 'prompt');
    label(`pipette · user prompt ${prompts.length ? `#${prompts.length}` : ''}`, p.x - 14, p.y + 4, { size: 9.5, align: 'right', color: '#ffc9e4' });
    hit('prompts', p.x, p.y - 18, 16, 'Pipette · user prompts', `${prompts.length} prompts; the stimulus drops into the nucleus`, 3);
    // reply plate
    const replies = S.markers.filter(m => m.kind === 'turn-complete').length;
    const ap = clamp(1 - (T - answerPulse) / 1.5, 0, 1);
    glow(ANSWER.x, ANSWER.y, 16 + ap * 26, PROMPT_C, 0.3 + ap * 0.5);
    ctx.save(); ctx.strokeStyle = rgba(PROMPT_C, 0.7); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.arc(ANSWER.x, ANSWER.y, 9 + ap * 10, 0, TAU); ctx.stroke(); ctx.restore();
    label(`reply · secreted signal ×${replies}`, ANSWER.x - 16, ANSWER.y, { size: 9.5, align: 'right', color: '#ffc9e4' });
    hit('reply', ANSWER.x, ANSWER.y, 14, 'Reply to user · secreted signal', `${replies} turns completed`, 3);
  }

  function cellPath(scale = 1, inset = 0) {
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i < NM; i++) { const a = i / NM * TAU; const r = (memR(a) - inset) * scale; pts.push({ x: C.x + Math.cos(a) * r, y: C.y + Math.sin(a) * r }); }
    const m0 = { x: (pts[0].x + pts[NM - 1].x) / 2, y: (pts[0].y + pts[NM - 1].y) / 2 };
    ctx.moveTo(m0.x, m0.y);
    for (let i = 0; i < NM; i++) { const a = pts[i], b = pts[(i + 1) % NM]; ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); }
    ctx.closePath();
  }

  function drawCell() {
    const p = S.context.percent / 100;
    const mc = memColor(S.context.percent);
    // halo
    glow(C.x, C.y, R * 1.7, mc, 0.12 + p * 0.12);
    // cytoplasm: denser as context fills
    cellPath();
    const g = ctx.createRadialGradient(C.x - R * 0.2, C.y - R * 0.2, R * 0.1, C.x, C.y, R * 1.05);
    g.addColorStop(0, `rgba(255,190,235,${0.05 + p * 0.16})`);
    g.addColorStop(0.7, `rgba(150,60,170,${0.10 + p * 0.22})`);
    g.addColorStop(1, rgba(mc, 0.16 + p * 0.22));
    ctx.fillStyle = g; ctx.fill();
    // granules (what fills the context window)
    ctx.save(); cellPath(); ctx.clip();
    for (const gr of granules) {
      const fade = gr.dying != null ? 1 - (T - gr.dying) / 1.2 : clamp((T - gr.born) / 0.8, 0, 1);
      const x = C.x + (gr.u + 0.025 * Math.sin(T * gr.f + gr.ph) * WA) * R, y = C.y + (gr.v + 0.025 * Math.cos(T * gr.f * 1.3 + gr.ph) * WA) * R;
      ctx.globalAlpha = 0.75 * fade; ctx.fillStyle = gr.c;
      ctx.beginPath(); ctx.arc(x, y, gr.s, 0, TAU); ctx.fill();
    }
    ctx.restore();
    hit('context', C.x, C.y, R, `Cytoplasm · context window ${S.context.percent}%`, `${ktok(S.context.used)} of ${ktok(S.context.capacity)} tokens · ${S.context.compactions} compactions`, 9);
  }

  function drawMembrane() {
    const pc = S.context.percent; const p = pc / 100; const mc = memColor(pc);
    const alarm = pc >= 90 ? 0.5 + 0.5 * Math.sin(T * 6) : 0;
    ctx.save();
    cellPath(); ctx.strokeStyle = rgba(mc, 0.18 + alarm * 0.2); ctx.lineWidth = 10 + p * 10; ctx.stroke();
    cellPath(); ctx.strokeStyle = rgba(mc, 0.9); ctx.lineWidth = 1.8 + p * 3.2; ctx.stroke();
    cellPath(1, 5 + p * 4); ctx.strokeStyle = rgba(mc, 0.35); ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    // context tag on the membrane
    const tp = memPt(1.05, -16);
    label(`membrane = context ${pc}% · ${ktok(S.context.used)}/${ktok(S.context.capacity)}${pc >= 90 ? ' · CRITICAL' : pc >= 70 ? ' · thickening' : ''}`, tp.x - 6, tp.y - 4, { size: 10, align: 'left', color: mc, bg: 'rgba(16,4,22,.7)', border: rgba(mc, 0.5), weight: '600' });
    hit('context', tp.x + 60, tp.y - 4, 22, `Membrane · context window ${pc}%`, `amber at 70%, red at 90% · ${S.context.compactions} compactions`, 4);
  }

  function isActive(kind) { return sim.runningCalls().some(c => c.kind === kind && c.lane === 'main'); }
  function runningCount(kind) { return sim.runningCalls().filter(c => c.kind === kind && c.lane === 'main').length; }
  function organLabel(text, x, y, color, align = 'center') { label(text, x, y, { size: 9.5, color, alpha: 0.85, align }); }

  function drawOrganelles() {
    // plastids = context files (permanent organelles)
    S.context.files.forEach(f => {
      const pos = plastidPos(f.path); const born = plastidBorn[f.path]; const fade = born != null ? clamp((T - born) / 1.2, 0, 1) : 1;
      const rx = (9 + Math.sqrt(f.tokens) / 4.2) * (R / 160), ry = rx * 0.55; const rot = hr(f.path) * Math.PI;
      ctx.save(); ctx.globalAlpha = fade; ctx.translate(pos.x, pos.y); ctx.rotate(rot + Math.sin(T * 0.3 + rot) * 0.1 * WA);
      ctx.fillStyle = 'rgba(232,240,255,.10)'; ctx.strokeStyle = 'rgba(232,240,255,.75)'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(232,240,255,.45)';
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-rx * 0.7, k * ry * 0.45); ctx.lineTo(rx * 0.7, k * ry * 0.45); ctx.stroke(); }
      ctx.restore();
      label(base(f.path), pos.x, pos.y + ry + 7, { size: 9, color: '#dfe8ff', alpha: 0.8 * fade, mono: true });
      hit(`ctxfile:${f.path}`, pos.x, pos.y, rx + 3, `Context file (plastid) · ${f.path}`, `${ktok(f.tokens)} tokens · ${f.why}`, 3);
    });

    // vacuole = task list, beads = tasks
    const vac = cp(...ORG.vacuole); const vr = 0.21 * R; const vp = clamp(1 - (T - vacuolePulse) / 1.2, 0, 1);
    glow(vac.x, vac.y, vr * 1.8, KC.memory, 0.12 + vp * 0.3 + (isActive('memory') ? 0.2 : 0));
    ctx.save(); ctx.fillStyle = 'rgba(255,240,184,.06)'; ctx.strokeStyle = rgba(KC.memory, 0.7); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(vac.x, vac.y, vr * (1 + vp * 0.06), 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
    const items = S.tasks.items;
    items.forEach((it, i) => {
      const a = -Math.PI / 2 + i / Math.max(1, items.length) * TAU + T * 0.08 * WA; const br = vr * 0.55;
      const x = vac.x + Math.cos(a) * br, y = vac.y + Math.sin(a) * br; const r = Math.max(2.6, vr * 0.17);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      if (it.status === 'completed') { ctx.fillStyle = KC.files; ctx.fill(); }
      else if (it.status === 'in_progress') { ctx.fillStyle = '#ff3fb4'; ctx.fill(); glow(x, y, r * 3, '#ff3fb4', 0.4 + 0.3 * Math.sin(T * 4)); }
      else { ctx.strokeStyle = KC.memory; ctx.lineWidth = 1; ctx.stroke(); }
    });
    const done = items.filter(t => t.status === 'completed').length;
    organLabel(`vacuole · tasks ${done}/${items.length}`, vac.x, vac.y - vr - 8, KC.memory);
    hit('tasks', vac.x, vac.y, vr, 'Vacuole · task list', `${done} of ${items.length} done · beads = tasks`, 3);
    hit('kind:memory', vac.x + vr * 0.75, vac.y + vr * 0.75, 7, 'Vacuole gate · Memory tool', `${S.counts.memory} plan updates`, 2);

    // golgi = edits
    const gp = cp(...ORG.golgi); const ga = isActive('edits'); const gs = 0.19 * R;
    glow(gp.x, gp.y, gs * 2, KC.edits, 0.15 + (ga ? 0.35 + 0.15 * Math.sin(T * 8) : 0));
    ctx.save(); ctx.translate(gp.x, gp.y); ctx.rotate(Math.atan2(gp.y - C.y, gp.x - C.x) + Math.PI / 2);
    ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const off = (k - 1.5) * gs * 0.32 + (ga ? Math.sin(T * 8 + k) * 1.2 : 0); const w = gs * (1 - Math.abs(k - 1.5) * 0.18);
      ctx.strokeStyle = rgba(KC.edits, 0.55 + k * 0.1); ctx.lineWidth = Math.max(2.2, gs * 0.16);
      ctx.beginPath(); ctx.moveTo(-w, off - gs * 0.25); ctx.quadraticCurveTo(0, off + gs * 0.25, w, off - gs * 0.25); ctx.stroke();
    }
    ctx.restore();
    organLabel('golgi · edits', gp.x, gp.y + gs + 8, KC.edits);
    hit('kind:edits', gp.x, gp.y, gs, 'Golgi body · Edits', `${S.counts.edits} edits · packages vesicles to colonies`, 3);

    // mitochondrion = shell
    const mp = cp(...ORG.mito); const ma = isActive('shell'); const mw = 0.24 * R, mh = 0.12 * R;
    glow(mp.x, mp.y, mw * 1.6, KC.shell, 0.15 + (ma ? 0.4 + 0.3 * Math.sin(T * 10) : 0));
    ctx.save(); ctx.translate(mp.x, mp.y); ctx.rotate(-0.5);
    ctx.fillStyle = rgba(KC.shell, ma ? 0.18 : 0.08); ctx.strokeStyle = rgba(KC.shell, 0.85); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, 0, mw, mh, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.lineWidth = 1;
    for (let k = 0; k <= 16; k++) { const x = -mw * 0.8 + k / 16 * mw * 1.6; const y = (k % 2 ? 1 : -1) * mh * 0.6; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.strokeStyle = rgba(KC.shell, 0.6); ctx.stroke();
    if (ma && !RM) { const e = ((T * 1.6) % 1) * 1.6 - 0.8; glow(e * mw, 0, mh * 1.4, '#e0fffb', 0.7); }
    ctx.restore();
    organLabel('mitochondrion · shell', mp.x, mp.y + mh + 12, KC.shell);
    hit('kind:shell', mp.x, mp.y, mw * 0.9, 'Mitochondrion · Shell', `${S.counts.shell} commands · releases ions to the terminal`, 3);

    // lysosome = other
    const lp = cp(...ORG.lyso); const la = isActive('other'); const lr = 0.085 * R * (1 + (la ? 0.12 * Math.sin(T * 7) : 0));
    glow(lp.x, lp.y, lr * 2.4, KC.other, 0.15 + (la ? 0.35 : 0));
    ctx.save(); ctx.beginPath();
    for (let k = 0; k <= 12; k++) { const a = k / 12 * TAU; const rr = lr * (1 + 0.15 * Math.sin(a * 3 + T * 2 * WA)); const x = lp.x + Math.cos(a) * rr, y = lp.y + Math.sin(a) * rr; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.fillStyle = rgba(KC.other, 0.25); ctx.strokeStyle = rgba(KC.other, 0.9); ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke();
    ctx.fillStyle = KC.other; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(lp.x + Math.cos(k * 1.7) * lr * 0.45, lp.y + Math.sin(k * 1.7) * lr * 0.45, 1.2, 0, TAU); ctx.fill(); }
    ctx.restore();
    organLabel('lysosome · other', lp.x, lp.y + lr + 8, KC.other);
    hit('kind:other', lp.x, lp.y, lr + 4, 'Lysosome · Other tools', `${S.counts.other} calls (MCP and misc)`, 3);

    // mitotic spindle = agents (budding site)
    const sp = cp(...ORG.spindle); const sa = isActive('agents') || [...daughters.values()].some(d => d.phase === 'bud' && d.parent === 'main');
    ctx.save(); ctx.strokeStyle = rgba(KC.agents, 0.9); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const o of [-4, 4]) { ctx.beginPath(); ctx.moveTo(sp.x - 3, sp.y + o); ctx.lineTo(sp.x + 3, sp.y + o); ctx.stroke(); }
    if (sa) { ctx.lineWidth = 0.8; ctx.strokeStyle = rgba(KC.agents, 0.55); for (let k = -3; k <= 3; k++) { const e = memPt(k * 0.12, 0); ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(e.x, e.y); ctx.stroke(); } glow(sp.x, sp.y, 20, KC.agents, 0.5); }
    ctx.restore();
    organLabel('spindle · agents', sp.x - 2, sp.y + 15, KC.agents);
    hit('kind:agents', sp.x, sp.y, 10, 'Mitotic spindle · Agents', `${S.counts.agents} agent calls · buds daughter cells`, 3);

    // receptors = reads, on the membrane facing the colonies
    const fa = sim.runningCalls().filter(c => c.kind === 'files' && c.lane === 'main');
    REC_ANG.forEach((a, i) => {
      const on = fa.some(c => toolHint('files', c) === i);
      const b = memPt(a, 1); const len = on ? 14 : 8; const tip = { x: b.x + Math.cos(a) * len, y: b.y + Math.sin(a) * len };
      ctx.save(); ctx.strokeStyle = rgba(KC.files, on ? 1 : 0.7); ctx.lineWidth = on ? 2.2 : 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tip.x, tip.y);
      const nx = -Math.sin(a), ny = Math.cos(a);
      ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x + Math.cos(a) * 5 + nx * 5, tip.y + Math.sin(a) * 5 + ny * 5);
      ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x + Math.cos(a) * 5 - nx * 5, tip.y + Math.sin(a) * 5 - ny * 5);
      ctx.stroke(); ctx.restore();
      if (on) glow(tip.x, tip.y, 14, KC.files, 0.6);
      hit('kind:files', tip.x, tip.y, 9, 'Receptor · Read / Grep / Glob', `${S.counts.files} file reads and searches`, 3);
    });
    const rl = memPt(Math.PI, -6 - 0.0);
    organLabel('receptors · read', rl.x + 26, rl.y - 12, KC.files, 'left');
    // flagella label
    const fl = memPt(-0.9, -10);
    organLabel('flagella · web', fl.x + 6, fl.y + 12, KC.network, 'left');
    hit('kind:network', memPt(-0.9).x, memPt(-0.9).y, 10, 'Flagella · Network', `${S.counts.network} fetches and searches`, 4);

    // nucleus = the model
    const np = cp(...ORG.nucleus); const nr = 0.29 * R;
    const thinking = sim.runningCalls().some(c => c.lane === 'main') || S.session.status === 'active';
    glow(np.x, np.y, nr * 2.1, '#ff3fb4', 0.25 + (thinking ? 0.18 * (1 + Math.sin(T * 2.2)) : 0));
    ctx.save();
    const ng = ctx.createRadialGradient(np.x - nr * 0.3, np.y - nr * 0.3, nr * 0.1, np.x, np.y, nr);
    ng.addColorStop(0, 'rgba(255,120,210,.42)'); ng.addColorStop(1, 'rgba(120,20,110,.55)');
    ctx.fillStyle = ng; ctx.strokeStyle = 'rgba(255,90,200,.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let k = 0; k <= 32; k++) { const a = k / 32 * TAU; const rr = nr * (1 + 0.03 * Math.sin(a * 4 + T * 1.3 * WA)); const x = np.x + Math.cos(a) * rr, y = np.y + Math.sin(a) * rr; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,240,.35)'; ctx.lineWidth = 0.9;
    for (let k = 0; k < 5; k++) { const a = hr('chr', k) * TAU + T * 0.05 * WA; ctx.beginPath(); ctx.arc(np.x + Math.cos(a) * nr * 0.35, np.y + Math.sin(a) * nr * 0.35, nr * (0.25 + 0.1 * k), a, a + 1.6); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,220,245,.75)'; ctx.beginPath(); ctx.arc(np.x + nr * 0.2, np.y - nr * 0.15, nr * 0.2, 0, TAU); ctx.fill();
    ctx.restore();
    label('nucleus · model', np.x, np.y + nr * 0.45, { size: 10, color: '#ffe0f4', weight: '600' });
    label(S.session.model, np.x, np.y + nr * 0.45 + 12, { size: 9, color: '#ffc0e6', mono: true, alpha: 0.85 });
    hit('model', np.x, np.y, nr, `Nucleus · ${S.session.model}`, `turn ${S.session.turn} · ${thinking ? 'active' : 'resting'}`, 4);
  }

  function drawDaughters() {
    for (const d of daughters.values()) {
      const lane = d.lane; const r = d.r * d.scale;
      const failed = lane.state === 'failed', done = lane.state === 'completed';
      const rim = failed ? ERR_C : done ? KC.files : KC.agents;
      // neck while budding, bridge while fusing
      if (d.phase === 'bud' || d.phase === 'fuse') {
        const o = parentEdge(d, d); const t = d.phase === 'bud' ? clamp((T - d.t0) / 1.8, 0, 1) : 1 - clamp((T - d.t0) / 1.7, 0, 1);
        ctx.save(); ctx.strokeStyle = rgba(KC.agents, 0.35 * (1 - t * 0.6)); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, r * 1.1 * (1 - t));
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.restore();
      }
      const pulse = d.pulse ? clamp(1 - (T - d.pulse) / 1, 0, 1) : 0;
      glow(d.x, d.y, r * 2.2, rim, 0.2 + pulse * 0.4);
      ctx.save(); ctx.beginPath();
      for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU; const rr = r * (1 + WA * 0.05 * Math.sin(a * 3 + T * 1.4 + d.ph) + (failed ? 0.08 * Math.sin(a * 7) : 0)); const x = d.x + Math.cos(a) * rr, y = d.y + Math.sin(a) * rr; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      const g = ctx.createRadialGradient(d.x, d.y, 1, d.x, d.y, r);
      g.addColorStop(0, failed ? 'rgba(60,0,20,.6)' : 'rgba(255,190,230,.18)'); g.addColorStop(1, failed ? 'rgba(90,0,30,.5)' : 'rgba(255,120,200,.22)');
      ctx.fillStyle = g; ctx.strokeStyle = rgba(rim, 0.9); ctx.lineWidth = 1.6; ctx.fill(); ctx.stroke();
      // mini nucleus + its own organelles
      ctx.fillStyle = 'rgba(255,100,200,.45)'; ctx.beginPath(); ctx.arc(d.x - r * 0.1, d.y, r * 0.28, 0, TAU); ctx.fill();
      for (const k of d.kinds) {
        const a = DKA[k] ?? 0; const x = d.x + Math.cos(a) * r * 0.55, y = d.y + Math.sin(a) * r * 0.55;
        const on = sim.runningCalls().some(c => c.lane === d.key && c.kind === k);
        ctx.fillStyle = KC[k]; ctx.beginPath(); ctx.arc(x, y, on ? 3 : 2, 0, TAU); ctx.fill(); if (on) glow(x, y, 10, KC[k], 0.7);
      }
      ctx.restore();
      if (d.scale > 0.6) {
        label(lane.label, d.x, d.y + r + 9, { size: 10, color: failed ? '#ff8796' : '#ffd0ea', weight: '600' });
        const st = failed ? '✶ failed' : done ? '✓ report ready' : `running · ${lane.calls} calls`;
        label(`${lane.depth > 1 ? `depth ${lane.depth} · ` : ''}${st}${lane.errors ? ` · ✶${lane.errors}` : ''}`, d.x, d.y + r + 21, { size: 9, color: failed ? '#ff8796' : done ? '#d9ff9e' : '#e9b8d6', mono: true });
      }
      hit(`lane:${d.key}`, d.x, d.y, r + 4, `Daughter cell · ${lane.label}`, `${lane.agentType} · ${lane.model} · ${lane.state} · ${lane.calls} calls · ${lane.errors} errors`, 2);
    }
  }

  function drawVesicles() {
    for (let i = vesicles.length - 1; i >= 0; i--) {
      const v = vesicles[i]; const t = (T - v.t0) / 4.5;
      if (t >= 1) { vesicles.splice(i, 1); continue; }
      const d = ease(Math.min(1, t * 1.3)) * 120;
      const x = v.x + Math.cos(v.ang) * d, y = v.y + Math.sin(v.ang) * d; const a = 1 - t;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,174,43,.08)'; ctx.strokeStyle = 'rgba(255,174,43,.8)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, v.r, 0, TAU); ctx.fill(); ctx.stroke();
      v.cols.forEach((c, k) => { const aa = hr('ves', k) * TAU, rr = Math.sqrt(hr('ves', k + 500)) * v.r * 0.85; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr, 1.3, 0, TAU); ctx.fill(); });
      ctx.restore();
      label(`compaction · ${v.m.label.replace('Context compacted ', '')}`, x, y - v.r - 10, { size: 10, color: MEM.warn, alpha: a, weight: '600' });
    }
  }

  function drawParticle(p, pos, t) {
    const prev = partPos(p, Math.max(0, t - 0.03)); const ang = Math.atan2(pos.y - prev.y, pos.x - prev.x);
    const s = p.size; const c = p.color;
    ctx.save();
    switch (p.shape) {
      case 'chain': { // small molecules of file text, a little stream
        const n = clamp(Math.round(s / 1.6), 3, 8);
        for (let k = 0; k < n; k++) { const q = partPos(p, clamp(t - k * 0.035, 0, 1)); ctx.fillStyle = rgba(c, 1 - k / n * 0.7); ctx.beginPath(); ctx.arc(q.x, q.y, 1.8 + (k === 0 ? 0.8 : 0), 0, TAU); ctx.fill(); }
        glow(pos.x, pos.y, 10, c, 0.5); break;
      }
      case 'hex': { glow(pos.x, pos.y, s * 2.6, c, 0.6); ctx.translate(pos.x, pos.y); ctx.rotate(T * 2); ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); } ctx.closePath(); ctx.fillStyle = rgba(c, 0.35); ctx.strokeStyle = c; ctx.lineWidth = 1.3; ctx.fill(); ctx.stroke(); break; }
      case 'strand': { ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); for (let k = 0; k <= 8; k++) { const q = partPos(p, clamp(t - k * 0.012, 0, 1)); const w = Math.sin(k * 1.4 + T * 12) * 2; if (k === 0) ctx.moveTo(q.x + w, q.y - w); else ctx.lineTo(q.x + w, q.y - w); } ctx.stroke(); glow(pos.x, pos.y, 9, c, 0.5); break; }
      case 'vesicle': {
        const r = Math.max(5, s * 1.1); glow(pos.x, pos.y, r * 2.4, c, 0.5);
        ctx.fillStyle = rgba(c, 0.18); ctx.strokeStyle = c; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(pos.x, pos.y, r * (1 + 0.06 * Math.sin(T * 9)), 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = rgba(c, 0.8); ctx.beginPath(); ctx.arc(pos.x - r * 0.3, pos.y - r * 0.2, r * 0.25, 0, TAU); ctx.fill();
        const diff = p.call.diff; if (diff) label(`+${diff.added} −${diff.removed}`, pos.x, pos.y - r - 7, { size: 9, color: '#ffd0ee', mono: true });
        break;
      }
      case 'spark': { glow(pos.x, pos.y, 10, c, 0.8); ctx.fillStyle = '#e8fffc'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 1.8, 0, TAU); ctx.fill(); break; }
      case 'ions': {
        for (let k = 0; k < 6; k++) { const q = partPos(p, clamp(t - k * 0.02, 0, 1)); const jx = (hr(p.seed, k + Math.floor(T * 20)) - 0.5) * 9 * (RM ? 0.3 : 1), jy = (hr(p.seed, k + 50 + Math.floor(T * 20)) - 0.5) * 9 * (RM ? 0.3 : 1); ctx.fillStyle = k % 2 ? '#e8fffc' : c; ctx.beginPath(); ctx.arc(q.x + jx, q.y + jy, 1.6, 0, TAU); ctx.fill(); }
        glow(pos.x, pos.y, 14, c, 0.6); label('+', pos.x + 7, pos.y - 7, { size: 9, color: c }); break;
      }
      case 'shard': { glow(pos.x, pos.y, s * 2.2, c, 0.55); ctx.translate(pos.x, pos.y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(s * 1.2, 0); ctx.lineTo(-s * 0.6, s * 0.55); ctx.lineTo(-s * 0.6, -s * 0.55); ctx.closePath(); ctx.fillStyle = p.failed ? 'rgba(40,0,10,.9)' : rgba(c, 0.4); ctx.strokeStyle = c; ctx.lineWidth = 1.3; ctx.fill(); ctx.stroke(); break; }
      case 'droplet': { glow(pos.x, pos.y, s * 2.3, c, 0.6); ctx.translate(pos.x, pos.y); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(s * 1.3, 0); ctx.quadraticCurveTo(0, s, -s * 0.8, 0); ctx.quadraticCurveTo(0, -s, s * 1.3, 0); ctx.fillStyle = rgba(c, 0.45); ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke(); break; }
      case 'capsule': { const L = Math.max(7, s * 1.3), W = Math.max(3.5, s * 0.55); glow(pos.x, pos.y, L * 1.8, c, 0.55); ctx.translate(pos.x, pos.y); ctx.rotate(ang); roundRect(-L, -W, L * 2, W * 2, W); ctx.fillStyle = rgba(c, 0.35); ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -W); ctx.lineTo(0, W); ctx.stroke(); break; }
      case 'bead': { glow(pos.x, pos.y, 12, c, 0.6); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(pos.x, pos.y, 3.4, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(pos.x - 1, pos.y - 1, 1, 0, TAU); ctx.fill(); break; }
      case 'blob': { glow(pos.x, pos.y, s * 2.4, c, 0.55); ctx.beginPath(); for (let k = 0; k <= 9; k++) { const a = k / 9 * TAU; const rr = s * (0.8 + 0.3 * Math.sin(a * 3 + T * 6)); const x = pos.x + Math.cos(a) * rr, y = pos.y + Math.sin(a) * rr; if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.fillStyle = rgba(c, 0.35); ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke(); break; }
      case 'error': { spiky(pos.x, pos.y, 3.5, 0.8); break; }
      default: { ctx.strokeStyle = rgba(c, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(pos.x, pos.y, 2.5 + Math.sin(T * 10) * 0.6, 0, TAU); ctx.stroke(); glow(pos.x, pos.y, 7, c, 0.4); }
    }
    ctx.restore();
  }

  function spiky(x, y, r, a = 1) {
    ctx.save(); ctx.globalAlpha = a;
    glow(x, y, r * 3, ERR_C, 0.55);
    ctx.beginPath();
    const n = 11;
    for (let k = 0; k <= n * 2; k++) { const ang = k / (n * 2) * TAU + T * 0.6 * WA; const rr = k % 2 ? r : r * 1.65; ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr); }
    ctx.closePath(); ctx.fillStyle = '#14000a'; ctx.strokeStyle = ERR_C; ctx.lineWidth = 1.4; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,48,72,.6)'; ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; const t = (T - p.t0) / p.dur;
      if (t >= 1) { arrive(p); parts.splice(i, 1); continue; }
      const e = ease(clamp(t, 0, 1));
      const pos = partPos(p, e);
      if (p.cross && !p.kicked && e > 0.5) { p.kicked = true; const out = p.cross === 'to' ? p.to() : p.from(); kick(Math.atan2(out.y - C.y, out.x - C.x), p.cross === 'to' ? 45 + p.size * 3 : -30); }
      drawParticle(p, pos, e);
      const amt = p.hop.tokens ? `${ktok(p.hop.tokens)} tokens` : p.hop.bytes ? kb(p.hop.bytes) : '';
      hit(`call:${p.call.id}`, pos.x, pos.y, Math.max(p.size, 6) + 4, `Molecule · ${p.hop.what}`, `${p.call.tool} ${p.call.id} · ${p.hop.from} → ${p.hop.to}${amt ? ` · ${amt}` : ''}`, 1);
    }
    for (let i = signals.length - 1; i >= 0; i--) {
      const s = signals[i]; const t = (T - s.t0) / s.dur;
      if (t >= 1) { if (s.kind === 'reply') answerPulse = T; signals.splice(i, 1); continue; }
      if (s.kind === 'ring') { ctx.save(); ctx.strokeStyle = rgba(s.color, 0.6 * (1 - t)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s.at.x, s.at.y, 8 + t * 60, 0, TAU); ctx.stroke(); ctx.restore(); continue; }
      const a = s.from(), b = s.to(); const e = ease(t);
      const pos = { x: lerp(a.x, b.x, e) + Math.sin(e * 6) * 6 * WA, y: lerp(a.y, b.y, e) };
      glow(pos.x, pos.y, s.size * 3, s.color, 0.7);
      ctx.save(); ctx.fillStyle = rgba(s.color, 0.6); ctx.strokeStyle = s.color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, s.size, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      const txt = s.kind === 'prompt' ? `“${s.m.detail.text}”` : s.kind === 'reply' ? 'reply → user' : `loading ${base(s.m.detail.path)}`;
      label(txt, pos.x + 12, pos.y, { size: 10, align: 'left', color: '#ffd9ee', bg: 'rgba(16,4,22,.75)' });
      hit(s.kind === 'prompt' ? 'prompts' : s.kind === 'reply' ? 'reply' : 'context', pos.x, pos.y, s.size + 6, s.kind === 'prompt' ? 'Stimulus · user prompt' : s.kind === 'reply' ? 'Secreted signal · reply' : 'Context file loading', txt, 1);
    }
  }

  function drawViruses() {
    for (const v of viruses.values()) {
      const pos = virusPos(v);
      let a = 1, r = 6;
      if (v.dormant != null) a = 1 - clamp((T - v.dormant) / 3, 0, 1);
      if (v.engulf != null) {
        const t = clamp((T - v.engulf) / 1.8, 0, 1);
        r = 6 * (1 - t * 0.8); a = 1 - t * 0.7;
        ctx.save(); ctx.strokeStyle = rgba(KC.files, 0.9 * (1 - t * 0.5)); ctx.fillStyle = rgba(KC.files, 0.12); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, lerp(22, 7, ease(t)), 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
        label('↻ immune response', pos.x, pos.y - 24, { size: 9.5, color: KC.files, alpha: 1 - t });
      }
      spiky(pos.x, pos.y, r, a);
      const code = v.call.error ? v.call.error.code : 'ERROR';
      if (a > 0.2) label(`✶ ${code}`, pos.x + 10, pos.y + 11, { size: 9.5, align: 'left', color: '#ffb3bd', bg: 'rgba(20,0,8,.85)', border: 'rgba(255,48,72,.8)', mono: true, alpha: a, weight: '700' });
      hit(`error:${v.call.id}`, pos.x, pos.y, 13, `Virus · ${code}`, `${v.call.tool} in ${v.call.laneLabel} · ${v.call.error ? v.call.error.message : ''}`, 0);
    }
  }

  // signalling pathway: the causedBy chain of the selected call
  function chainOf(id) {
    const set = new Set([id]); let c = sim.callById(id);
    while (c) { const up = c.causedBy || c.retryOf; if (!up || set.has(up)) break; set.add(up); c = sim.callById(up); }
    let grew = true;
    while (grew) { grew = false; for (const k of S.calls) if (!set.has(k.id) && ((k.causedBy && set.has(k.causedBy)) || (k.retryOf && set.has(k.retryOf)))) { set.add(k.id); grew = true; } }
    return [...set].map(x => sim.callById(x)).filter(Boolean).sort((a, b) => a.startedAt - b.startedAt);
  }
  function selectedCallId() { if (!sel) return null; const m = /^(call|error):(.+)$/.exec(sel); return m ? m[2] : null; }
  function drawPathway() {
    const id = selectedCallId(); if (!id) return;
    const chain = chainOf(id); if (chain.length < 2) return;
    const seenAt = {}; const pts = chain.map(c => { const a = anchorFor(c); const k = `${Math.round(a.x / 30)},${Math.round(a.y / 30)}`; const n = seenAt[k] = (seenAt[k] || 0) + 1; const ang = n * 2.4, rr = n > 1 ? 10 + n * 6 : 0; return { x: a.x + Math.cos(ang) * rr, y: a.y + Math.sin(ang) * rr, c }; });
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [[9, 0.12], [2.2, 0.9]]) {
      ctx.strokeStyle = rgba('#d9ff7a', pass[1]); ctx.lineWidth = pass[0];
      if (pass[0] < 3) { ctx.setLineDash([7, 5]); ctx.lineDashOffset = -T * 30; }
      ctx.beginPath(); pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else { const q = pts[i - 1]; const mx = (p.x + q.x) / 2 - (p.y - q.y) * 0.15, my = (p.y + q.y) / 2 + (p.x - q.x) * 0.15; ctx.quadraticCurveTo(mx, my, p.x, p.y); } }); ctx.stroke();
    }
    ctx.restore();
    pts.forEach((p, i) => {
      glow(p.x, p.y, 14, '#d9ff7a', 0.7);
      ctx.save(); ctx.fillStyle = p.c.status === 'error' ? '#14000a' : '#d9ff7a'; ctx.strokeStyle = p.c.status === 'error' ? ERR_C : '#f4ffd6'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      label(`${i + 1}. ${p.c.id} ${p.c.tool}${p.c.status === 'error' ? ` ✶${p.c.error.code}` : p.c.status === 'running' ? ' …' : ' ✓'}`, p.x + 8, p.y + (i % 2 ? 12 : -10), { size: 9.5, align: 'left', color: p.c.status === 'error' ? '#ffb3bd' : '#efffc9', bg: 'rgba(16,4,22,.82)', mono: true });
    });
  }

  function reticle(h, color, spin) {
    const r = h.r + 6;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(h.x, h.y, r, 0, TAU); ctx.stroke();
    const rot = spin && !RM ? T * 0.8 : 0;
    for (let k = 0; k < 4; k++) { const a = rot + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(h.x + Math.cos(a) * (r - 4), h.y + Math.sin(a) * (r - 4)); ctx.lineTo(h.x + Math.cos(a) * (r + 7), h.y + Math.sin(a) * (r + 7)); ctx.stroke(); }
    ctx.restore();
  }
  function drawReticles() {
    const find = id => hits.find(h => h.id === id);
    if (sel) { const s = find(sel) || find(sel.replace(/^call:/, 'error:')); if (s) reticle(s, 'rgba(217,255,122,.9)', false); }
    const hv = hover || (kbdFocus ? find(kbdFocus) : null);
    if (hv) {
      reticle(hv, 'rgba(255,255,255,.85)', true);
      // microscope label
      ctx.save(); ctx.font = F(11, '600'); const w1 = ctx.measureText(hv.title).width; ctx.font = FM(9.5); const w2 = ctx.measureText(hv.sub || '').width; ctx.restore();
      const w = Math.max(w1, w2) + 16, hgt = Math.max(36, 30 / SC);
      let x = hv.x + hv.r + 16, y = hv.y - hgt / 2;
      if (x + w > VW - 4) x = hv.x - hv.r - 16 - w;
      x = clamp(x, 4, VW - w - 4); y = clamp(y, 4, VH - hgt - 4);
      ctx.save(); ctx.fillStyle = 'rgba(14,3,20,.92)'; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; roundRect(x, y, w, hgt, 5); ctx.fill(); ctx.stroke(); ctx.restore();
      label(hv.title, x + 8, y + hgt * 0.33, { size: 11, align: 'left', weight: '600' });
      label(hv.sub || '', x + 8, y + hgt * 0.72, { size: 9.5, align: 'left', mono: true, color: '#d8b9d8' });
    }
  }

  function drawOptics() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.42, CW / 2, CH / 2, Math.max(CW, CH) * 0.75);
    g.addColorStop(0, 'rgba(8,2,12,0)'); g.addColorStop(1, 'rgba(8,2,12,.7)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
    // scale bar
    ctx.fillStyle = 'rgba(255,220,240,.5)'; ctx.fillRect(14, CH - 22, 60, 2);
    ctx.font = '10px "Cascadia Code", Consolas, monospace'; ctx.fillText('50 µm · ×400', 14, CH - 28);
  }

  // ---------- main loop ----------
  let last = performance.now(), dt = 0, dirty = true, frame = 0;
  function loop(now) {
    const raw = Math.min(0.05, (now - last) / 1000); last = now;
    dt = paused ? 0 : raw * Math.sqrt(sim.speed);
    T += dt;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= T) { const t = timers.splice(i, 1)[0]; t.fn(); }
    R += (targetR() - R) * Math.min(1, dt * 1.5);
    if (dt > 0) { stepMem(dt); updateDaughters(dt); reconcileGranules(); checkViruses(); }
    hits = [];
    drawBackground(); view();
    drawHosts(); drawColonies(); drawCrystal(); drawPipette();
    drawVesicles(); drawDaughters();
    drawCell(); drawOrganelles(); drawMembrane();
    drawParticles(); drawViruses(); drawPathway();
    if (mouse) hover = pick(mouse.x, mouse.y);
    drawReticles();
    drawOptics();
    if (frame++ % 3 === 0) drawChart();
    requestAnimationFrame(loop);
  }
  function pick(x, y) {
    let best = null;
    for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d <= h.r) { if (!best || h.pri < best.pri || (h.pri === best.pri && d / h.r < best.q)) best = { ...h, q: d / h.r }; } }
    return best;
  }
  cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); mouse = { x: (e.clientX - r.left - OX) / SC, y: (e.clientY - r.top - OY) / SC }; });
  cv.addEventListener('mouseleave', () => { mouse = null; hover = null; });
  cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(); const h = pick((e.clientX - r.left - OX) / SC, (e.clientY - r.top - OY) / SC); if (h) open(h.id); });

  // keyboard access to canvas targets: invisible focusable buttons that track the hit regions
  const hitlayer = $('#hitlayer'); const hitButtons = new Map();
  const ORDER = ['model', 'context', 'kind:', 'ctxfile:', 'tasks', 'lane:', 'error:', 'file:', 'host:', 'terminal', 'prompts', 'reply'];
  function syncHitButtons() {
    const seen = new Map();
    for (const h of hits) if (!h.id.startsWith('call:') && !seen.has(h.id)) seen.set(h.id, h);
    for (const [id, b] of hitButtons) if (!seen.has(id)) { if (document.activeElement === b) kbdFocus = null; b.remove(); hitButtons.delete(id); }
    const sorted = [...seen.values()].sort((a, b) => ORDER.findIndex(o => a.id.startsWith(o)) - ORDER.findIndex(o => b.id.startsWith(o)));
    let prev = null;
    for (const h of sorted) {
      let b = hitButtons.get(h.id);
      if (!b) {
        b = document.createElement('button'); b.type = 'button';
        b.addEventListener('focus', () => { kbdFocus = h.id; }); b.addEventListener('blur', () => { if (kbdFocus === h.id) kbdFocus = null; });
        b.addEventListener('click', () => open(h.id)); hitButtons.set(h.id, b);
      }
      b.setAttribute('aria-label', `${h.title}. ${h.sub || ''}`);
      const r = h.r * SC; b.style.left = `${OX + h.x * SC - r}px`; b.style.top = `${OY + h.y * SC - r}px`; b.style.width = b.style.height = `${r * 2}px`;
      if (!b.isConnected) { if (prev) prev.after(b); else hitlayer.prepend(b); }
      prev = b;
    }
  }
  setInterval(syncHitButtons, 600);

  // ---------- legend ----------
  $('#legend').innerHTML = KINDS.map(k => `<span class="li" style="--k:${KC[k]}" title="${esc(BEHAVE[k])}"><i class="sw"></i>${KI[k].name} = ${ORGAN[k].toLowerCase()}</span>`).join('') +
    `<span class="full"><span style="color:${MEM.ok}">membrane &lt;70%</span><span style="color:${MEM.warn}">amber ≥70</span><span style="color:${MEM.bad}">red ≥90</span><span class="vir">✶ virus = error</span><span style="color:#d9ff7a">◌ retry engulfs it</span></span>`;

  // ======================================================================
  // Lab notebook panels
  // ======================================================================
  function patch(el, html) {
    if (el._h === html) return;
    const act = document.activeElement; let key = null;
    if (act && el.contains(act)) key = act.getAttribute('data-open') || act.getAttribute('data-key');
    el.innerHTML = html; el._h = html;
    if (key) { const n = el.querySelector(`[data-open="${CSS.escape(key)}"]`) || el.querySelector(`[data-key="${CSS.escape(key)}"]`); if (n) n.focus(); }
  }
  const pctHtml = p => `<b style="color:${memColor(p)}">${p}%</b>`;
  function lastRecordTime() {
    let t = S.session.startedAt;
    const c = S.calls[S.calls.length - 1]; if (c) t = Math.max(t, c.endedAt || c.startedAt);
    for (const k of sim.runningCalls()) t = Math.max(t, k.startedAt);
    const m = S.markers[S.markers.length - 1]; if (m) t = Math.max(t, m.time);
    return t;
  }
  function sessionStatus() {
    const age = S.now - lastRecordTime();
    if (S.session.status === 'complete') return { text: 'turn complete', cls: 'ok' };
    if (age >= 30000) return { text: 'quiet', cls: 'quiet' };
    return { text: 'recent activity', cls: 'run' };
  }
  function activeKind() {
    const run = sim.runningCalls();
    const mainRun = run.filter(c => c.lane === 'main'); const pickC = (mainRun.length ? mainRun : run).slice(-1)[0];
    return pickC ? { kind: pickC.kind, call: pickC } : { kind: null, call: null };
  }

  function renderHeader() {
    const s = S.session; const st = sessionStatus();
    $('#hTitle').innerHTML = `${esc(s.project)} <span class="muted">/</span> <b>${esc(s.name)}</b>`;
    patch($('#hFacts'), [
      ['session id', `<span title="${esc(s.id)}">${esc(s.id.slice(0, 13))}…</span>`],
      ['provider · model', `${esc(s.provider)} · ${esc(s.model)}`],
      ['branch', `⎇ ${esc(s.branch)}`],
      ['status', `<span class="chip ${st.cls}"><span class="dot"></span>${st.text}</span>`],
      ['last record', ago(S.now - lastRecordTime())],
      ['turn', `#${s.turn}`],
      ['observed', `<span class="opt">${dur(S.now - s.startedAt)}</span>`]
    ].map(([k, v], i) => `<div class="${i === 6 || i === 0 ? 'opt' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join(''));
  }

  function renderCounts() {
    const esp = sim.errorsSincePrompt(); const max = Math.max(1, ...KINDS.map(k => S.counts[k]));
    const act = activeKind(); const run = sim.runningCalls();
    const espTotal = Object.values(esp).reduce((a, b) => a + b, 0);
    patch($('#counts'), KINDS.map(k => `<button type="button" class="krow ${act.kind === k ? 'on' : ''}" data-open="kind:${k}" style="--k:${KC[k]}" title="${esc(BEHAVE[k])}">
        <span class="glyph">${GLYPH[k]}</span><span class="kn">${KI[k].name}<small>${ORGAN[k]}</small></span>
        <span class="kbar"><i style="width:${(S.counts[k] / max * 100).toFixed(1)}%"></i></span><span class="kc">${S.counts[k]}</span>
        <span class="ke ${esp[k] ? 'has' : ''}" title="errors since the last prompt">${esp[k] ? `✶${esp[k]}` : '·'}</span></button>`).join('') +
      `<div class="ksum"><span>total <b>${S.calls.length}</b></span><span class="bad">tool errors <b>${S.errors.length}</b></span><span class="bad">since prompt <b>${espTotal}</b></span><span>active now <b style="color:${act.kind ? KC[act.kind] : 'inherit'}">${act.kind ? `${KI[act.kind].name} (${run.length} running)` : 'idle'}</b></span></div>`);
  }

  function renderContext() {
    const c = S.context; const mc = memColor(c.percent);
    patch($('#ctx'), `<div class="ctxbig"><span class="pct" style="color:${mc}">${c.percent}%</span><span class="muted">${ktok(c.used)} / ${ktok(c.capacity)} tokens · ${c.compactions} compaction${c.compactions === 1 ? '' : 's'}</span></div>
      <div class="meter"><i style="width:${Math.min(100, c.percent)}%;background:${mc};box-shadow:0 0 8px ${mc}"></i><b style="left:70%"></b><b style="left:90%"></b></div>
      <div class="tiny">membrane ${c.percent >= 90 ? '<span class="errc">red: critical, compaction near</span>' : c.percent >= 70 ? '<span class="amb">amber: thickening</span>' : 'healthy'} · amber at 70 · red at 90</div>`);
    patch($('#ctxFiles'), `<div class="tiny" style="margin-top:6px">context files (plastids) · ${c.files.length}</div><ul class="ctxfiles">${c.files.map(f => `<li><button type="button" data-open="ctxfile:${esc(f.path)}"><span class="p">${esc(f.path)}</span><span class="t">${ktok(f.tokens)}</span></button></li>`).join('')}</ul>`);
    drawSpark();
  }
  function drawSpark() {
    const el = $('#ctxSpark'); if (!el) return;
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    const d = window.devicePixelRatio || 1; if (el.width !== Math.round(w * d)) { el.width = Math.round(w * d); el.height = Math.round(h * d); }
    const g = el.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    const sm = S.context.samples; if (sm.length < 2) return;
    const t0 = S.session.startedAt, t1 = Math.max(S.now, t0 + 1);
    const X = t => (t - t0) / (t1 - t0) * (w - 2) + 1, Y = p => h - 2 - p / 100 * (h - 6);
    g.strokeStyle = 'rgba(255,174,43,.35)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(0, Y(70)); g.lineTo(w, Y(70)); g.stroke();
    g.strokeStyle = 'rgba(255,48,72,.4)'; g.beginPath(); g.moveTo(0, Y(90)); g.lineTo(w, Y(90)); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(240,184,255,.08)'; g.beginPath(); g.moveTo(X(sm[0].time), h);
    for (const s of sm) g.lineTo(X(s.time), Y(s.percent)); g.lineTo(X(sm[sm.length - 1].time), h); g.fill();
    g.lineWidth = 1.5;
    for (let i = 1; i < sm.length; i++) { g.strokeStyle = memColor(sm[i].percent); g.beginPath(); g.moveTo(X(sm[i - 1].time), Y(sm[i - 1].percent)); g.lineTo(X(sm[i].time), Y(sm[i].percent)); g.stroke(); }
    for (const m of S.markers) if (m.kind === 'compaction') { g.fillStyle = MEM.warn; g.font = '9px Consolas, monospace'; g.fillText('◆', X(m.time) - 3, 9); }
    g.fillStyle = 'rgba(200,170,200,.6)'; g.font = '9px Consolas, monospace'; g.fillText('70', w - 14, Y(70) - 2); g.fillText('90', w - 14, Y(90) - 2);
  }

  const openTasks = new Set();
  $('#tasks').addEventListener('toggle', e => { const k = e.target.getAttribute('data-key'); if (!k) return; if (e.target.open) openTasks.add(k); else openTasks.delete(k); $('#tasks')._h = null; }, true);
  function renderTasks() {
    const items = S.tasks.items; const done = items.filter(t => t.status === 'completed').length, prog = items.filter(t => t.status === 'in_progress').length;
    patch($('#tasks'), items.length ? `<div class="tiny"><span class="okc">${done} of ${items.length} done</span> · <span class="runc">${prog} in progress</span> · ${items.length - done - prog} not started</div>
      <div class="beadbar">${items.map(t => `<span class="bead ${t.status}" title="${esc(t.label)}: ${t.status}"></span>`).join('')}</div>
      ${items.map(t => `<details class="task" data-key="task-${t.id}" ${openTasks.has(`task-${t.id}`) ? 'open' : ''}><summary><span class="bead ${t.status}"></span><span class="lbl">${esc(t.label)}</span><span class="st">${t.status.replace('_', ' ')}</span></summary>
        <ol>${t.history.map(h => `<li>${clock(h.time)} ${h.status.replace('_', ' ')} · <button type="button" class="lnk" data-open="call:${h.callId}">${h.callId}</button></li>`).join('')}</ol></details>`).join('')}` : '<div class="muted">No task list yet.</div>');
  }

  function renderFiles() {
    const list = Object.values(S.files).sort((a, b) => b.lastTouched - a.lastTouched);
    const n = v => `<span class="${v ? '' : 'zero'}">${v}</span>`;
    patch($('#files'), `<div class="fhead"><span>file (colony)</span><span title="reads">R</span><span title="edits">E</span><span title="failed calls">✗</span><span>+/−</span></div>
      <table class="ftable"><tbody>${list.map(f => `<tr><td><button type="button" class="${f.edits >= 3 ? 'hot' : ''}" data-open="file:${esc(f.path)}" title="${esc(f.path)}${f.edits >= 3 ? ' (hot: 3+ edits)' : ''}">
        <span class="fp">${esc(f.path)}</span><span class="r">${n(f.reads)}</span><span class="e">${n(f.edits)}</span><span class="x">${n(f.failed)}</span><span class="pm"><span class="a">+${f.added}</span> <span class="d">−${f.removed}</span></span></button></td></tr>`).join('')}</tbody></table>`);
  }

  function renderLanes() {
    const kids = p => S.lanes.filter(l => l.parent === p);
    const rows = [];
    const walk = (l, prefix) => {
      rows.push(laneRow(l, prefix));
      kids(l.key).sort((a, b) => b.startedAt - a.startedAt).forEach(k => walk(k, prefix + (l.depth ? '  ' : '')));
    };
    const main = S.lanes.find(l => l.key === 'main'); if (main) walk(main, '');
    const running = S.lanes.filter(l => l.role === 'subagent' && l.state === 'running').length;
    $('#laneNote').textContent = `${S.lanes.length - 1} daughters · ${running} alive`;
    patch($('#lanes'), rows.join(''));
  }
  function laneRow(l, prefix) {
    const end = l.endedAt ? `${clock(l.endedAt)} (${dur(l.endedAt - l.startedAt)})` : `running ${dur(S.now - l.startedAt)}`;
    return `<button type="button" class="lane ${l.state}" data-open="lane:${l.key}" style="padding-left:${6 + l.depth * 14}px">
      <span class="ln1">${l.depth ? `<span class="tree">${prefix}└</span>` : ''}<span class="cellic"></span><span class="nm">${esc(l.label)}</span><span class="chip ${l.state === 'failed' ? 'err' : l.state === 'completed' ? 'ok' : 'run'}">${l.state === 'failed' ? '✶ ' : l.state === 'completed' ? '✓ ' : ''}${l.state}</span></span>
      <span class="ln2">depth ${l.depth}${l.parent ? ` · parent ${esc(l.parent === 'main' ? 'main' : (sim.laneByKey(l.parent) || {}).label || l.parent)}` : ''} · ${esc(l.agentType)} · ${l.calls} calls · <span class="${l.errors ? 'errc' : ''}">${l.errors} err</span> · ${ktok(l.tokens)} tok</span>
      <span class="ln2">${clock(l.startedAt)} → ${end}</span>
      ${l.task ? `<span class="ln3">brief: <b>${esc(l.task)}</b></span>` : ''}${l.result ? `<span class="ln3">result: <b>${esc(l.result)}</b></span>` : ''}
    </button>`;
  }

  function activityItems() {
    const items = [];
    for (const c of S.calls.slice(-90)) items.push({ t: c.startedAt, s: c.seq, type: 'call', c, key: `${c.lane}|${c.tool}|${c.label}|${c.status}|${c.error ? c.error.code : ''}` });
    for (const m of S.markers.slice(-24)) items.push({ t: m.time, s: m.seq, type: 'marker', m, key: `m|${m.kind}|${m.label}` });
    items.sort((a, b) => b.t - a.t || b.s - a.s);
    const out = [];
    for (const it of items) { const prev = out[out.length - 1]; if (prev && prev.key === it.key) { prev.n++; continue; } out.push({ ...it, n: 1 }); }
    return out.slice(0, 32);
  }
  function renderActivity() {
    patch($('#activity'), activityItems().map(it => {
      if (it.type === 'marker') {
        const m = it.m; const g = m.kind === 'prompt' ? '▼' : m.kind === 'turn-complete' ? '✓' : m.kind === 'compaction' ? '◆' : '+';
        const col = m.kind === 'prompt' ? PROMPT_C : m.kind === 'turn-complete' ? KC.files : m.kind === 'compaction' ? MEM.warn : '#e8f0ff';
        const target = m.kind === 'prompt' ? 'prompts' : m.kind === 'turn-complete' ? 'reply' : m.kind === 'compaction' ? 'context' : `ctxfile:${m.detail.path}`;
        return `<button type="button" class="act marker" data-open="${esc(target)}" style="--k:${col}"><span class="tm">${clock(m.time)}</span><span class="g">${g}</span><span class="tx">${esc(m.label)}</span><span class="st">${it.n > 1 ? `<span class="x">×${it.n}</span>` : ''}</span></button>`;
      }
      const c = it.c;
      const st = c.status === 'running' ? '<span class="st run">◌ running</span>' : c.status === 'error' ? `<span class="st err">✶ ${esc(c.error.code)}</span>` : `<span class="st ok">✓${c.attempt > 1 ? ` ↻${c.attempt}` : ''}</span>`;
      const tgt = c.target ? (c.target.type === 'file' ? base(c.target.value) : c.target.value) : '';
      return `<button type="button" class="act" data-open="call:${c.id}" style="--k:${KC[c.kind]}" title="${esc(c.tool)} ${esc(c.target ? c.target.value : '')}"><span class="tm">${clock(c.startedAt)}</span><span class="g">●</span><span class="tx">${c.lane !== 'main' ? `<span class="tag">${esc(c.laneLabel)}</span>` : ''}${esc(c.tool)} <small>${esc(tgt)}</small></span><span>${st}${it.n > 1 ? `<span class="x">×${it.n}</span>` : ''}</span></button>`;
    }).join(''));
  }

  function renderPanels() {
    renderHeader(); renderCounts(); renderContext(); renderTasks(); renderFiles(); renderLanes(); renderActivity();
    if (!$('#slide').hidden) renderSlide();
    renderMode();
  }
  setInterval(() => { renderPanels(); }, 450);

  // ======================================================================
  // Specimen slides (drill-down)
  // ======================================================================
  const stack = [];
  function open(id) {
    if (stack[stack.length - 1] !== id) stack.push(id);
    sel = id; $('#slide').hidden = false; renderSlide(true);
    if (id.startsWith('moment:')) { inspectAt = Number(id.slice(7)); renderMode(); }
  }
  function closeSlide() { stack.length = 0; sel = null; $('#slide').hidden = true; $('#slideBody')._h = null; if (inspectAt != null) { inspectAt = null; renderMode(); } }
  $('#slideClose').addEventListener('click', closeSlide);
  $('#slideBack').addEventListener('click', () => { stack.pop(); if (!stack.length) return closeSlide(); sel = stack[stack.length - 1]; if (!sel.startsWith('moment:')) inspectAt = null; renderSlide(true); renderMode(); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b && !b.closest('#hitlayer')) { e.preventDefault(); open(b.getAttribute('data-open')); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#slide').hidden) closeSlide();
    if (e.key === ' ' && e.target === document.body) { e.preventDefault(); togglePause(); }
  });

  function renderSlide(scrollTop) {
    const id = stack[stack.length - 1]; if (!id) return;
    const [type, ...rest] = id.split(':'); const arg = rest.join(':');
    const map = { call: slideCall, error: slideError, file: slideFile, lane: slideLane, kind: slideKind, host: slideHost, ctxfile: slideCtxFile, moment: slideMoment };
    const single = { context: slideContext, terminal: slideTerminal, tasks: slideTasks, model: slideModel, prompts: slidePrompts, reply: slideReply };
    const fn = map[type] || single[id];
    const out = fn ? fn(arg) : { title: 'Specimen', html: `<p class="muted">Nothing here: ${esc(id)}</p>` };
    $('#slideTitle').textContent = `Specimen slide · ${out.title}`;
    $('#slideBack').disabled = stack.length < 2;
    patch($('#slideBody'), out.html);
    if (scrollTop) $('#slideBody').scrollTop = 0;
  }

  const callLink = (id, text) => { const c = sim.callById(id); return `<button type="button" class="lnk" data-open="call:${esc(id)}">${esc(text || (c ? `${id} ${c.tool}` : id))}</button>`; };
  const laneLink = key => { const l = sim.laneByKey(key); return `<button type="button" class="lnk" data-open="lane:${esc(key)}">${esc(l ? l.label : key)}</button>`; };
  const fileLink = p => `<button type="button" class="lnk" data-open="file:${esc(p)}">${esc(p)}</button>`;
  function statusChip(c) {
    if (c.status === 'running') return '<span class="chip run"><span class="dot"></span>running</span>';
    if (c.status === 'error') return `<span class="chip err">✶ ${esc(c.error.code)}</span>`;
    return `<span class="chip ok">✓ success${c.attempt > 1 ? ` · attempt ${c.attempt}` : ''}</span>`;
  }
  function nodeName(id) {
    const special = { context: 'context window (cytoplasm)', model: 'model (nucleus)', terminal: 'terminal (crystal)', plan: 'task list (vacuole)', answer: 'reply (signal)', user: 'user (pipette)' };
    if (special[id]) return special[id];
    if (id.startsWith('tool:')) { const k = id.slice(5); return `${KI[k] ? KI[k].name : k} tool (${(ORGAN[k] || '').toLowerCase()})`; }
    if (id.startsWith('lane:')) { const l = sim.laneByKey(id.slice(5)); return `${l ? l.label : id} (daughter cell)`; }
    if (id.startsWith('file:')) return `${id.slice(5)} (colony)`;
    if (id.startsWith('web:') || id.startsWith('mcp:')) return `${(sim.node(id) || {}).label || id} (host)`;
    return (sim.node(id) || {}).label || id;
  }
  function nodeLinkHtml(id) {
    if (id.startsWith('file:')) return `<button type="button" class="lnk" data-open="${esc(id)}">${esc(nodeName(id))}</button>`;
    if (id.startsWith('lane:')) return `<button type="button" class="lnk" data-open="${esc(id)}">${esc(nodeName(id))}</button>`;
    if (id.startsWith('web:') || id.startsWith('mcp:')) return `<button type="button" class="lnk" data-open="host:${esc(id)}">${esc(nodeName(id))}</button>`;
    if (id.startsWith('tool:')) return `<button type="button" class="lnk" data-open="kind:${esc(id.slice(5))}">${esc(nodeName(id))}</button>`;
    const map = { context: 'context', terminal: 'terminal', plan: 'tasks', model: 'model', answer: 'reply', user: 'prompts' };
    return map[id] ? `<button type="button" class="lnk" data-open="${map[id]}">${esc(nodeName(id))}</button>` : esc(nodeName(id));
  }
  function targetHtml(t) {
    if (!t) return '-';
    if (t.type === 'file') return fileLink(t.value);
    if (t.type === 'url') { const h = hostOf(t.value); return `${h && hosts.has(`web:${h}`) ? `<button type="button" class="lnk" data-open="host:web:${esc(h)}">${esc(h)}</button> · ` : ''}<span>${esc(t.value)}</span>`; }
    if (t.type === 'plan') return `<button type="button" class="lnk" data-open="tasks">${esc(t.value)}</button>`;
    return `<span>${esc(t.type)}: ${esc(t.value)}</span>`;
  }
  function errorBox(c) { return `<div class="virus"><div class="code">${esc(c.error.code)} · ${esc(c.error.name || '')}</div><div class="msg">${esc(c.error.message)}</div>${c.error.hint ? `<div class="hint">${esc(c.error.hint)}</div>` : ''}</div>`; }
  function diffHtml(d) {
    if (!d) return '';
    return `<h4>Diff · <span class="okc">+${d.added}</span> <span class="errc">−${d.removed}</span></h4><pre class="diff">${d.hunks.map(h => `<span class="h">@@ line ${h.at} @@</span>\n${h.lines.map(l => `<span class="${l[0] === '+' ? 'a' : l[0] === '-' ? 'd' : ''}">${esc(l)}</span>`).join('\n')}`).join('\n')}</pre>`;
  }
  function outputHtml(c) {
    const o = c.output; if (!o) return c.status === 'running' ? '<h4>Output</h4><div class="muted">Still running…</div>' : '';
    const facts = [];
    if (o.exitCode !== undefined) facts.push(['exit code', `<span class="${o.exitCode ? 'errc' : 'okc'}">${o.exitCode ?? 'n/a'}</span>`]);
    if (o.status) facts.push(['HTTP status', o.status]);
    if (o.lines != null) facts.push(['lines', o.lines]);
    if (o.bytes != null) facts.push(['bytes', kb(o.bytes)]);
    let tests = '';
    if (o.tests) tests = `<div class="tests" style="margin-top:4px">tests: <b class="okc">${o.tests.passed} passed</b> · <b class="${o.tests.failed ? 'errc' : ''}">${o.tests.failed} failed</b> · ${o.tests.skipped} skipped${o.tests.failures.length ? `<div class="errc tiny">failing: ${o.tests.failures.map(esc).join(', ')}</div>` : ''}</div>`;
    return `<h4>Output</h4><div>${esc(o.summary || '')}</div>${facts.length ? `<dl class="facts" style="margin-top:4px">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}${tests}${o.preview && o.preview.length ? `<pre style="margin-top:5px">${o.preview.map(esc).join('\n')}</pre>` : ''}`;
  }
  function refsHtml(c) {
    if (!c.refs.length) return '';
    return `<h4>References</h4><ul class="list">${c.refs.map(r => {
      let v = esc(r.value);
      if (r.type === 'file') v = fileLink(r.value);
      else if (r.type === 'lane') v = laneLink(r.value);
      else if (r.type === 'task') v = `<button type="button" class="lnk" data-open="tasks">task ${esc(r.value)}</button>`;
      else if (r.type === 'url') { const h = hostOf(r.value); v = `${h && hosts.has(`web:${h}`) ? `<button type="button" class="lnk" data-open="host:web:${esc(h)}">${esc(h)}</button> ` : ''}${esc(r.title || '')} <span class="tiny">${esc(r.value)}</span>`; }
      else if (r.type === 'contextfile') v = `<button type="button" class="lnk" data-open="ctxfile:${esc(r.value)}">${esc(r.value)}</button>`;
      return `<li><span class="tiny">${esc(r.type)} · ${esc(r.role || '')}</span> ${v}</li>`;
    }).join('')}</ul>`;
  }
  function callRow(c, extra = '') {
    const st = c.status === 'running' ? '<span class="runc">◌ running</span>' : c.status === 'error' ? `<span class="errc">✶ ${esc(c.error.code)}</span>` : `<span class="okc">✓</span>`;
    return `<li><span class="tiny">${clock(c.startedAt)}</span> ${callLink(c.id, `${c.id} ${c.tool}`)} ${st}${c.attempt > 1 ? ' <span class="amb">↻ attempt ' + c.attempt + '</span>' : ''} <span class="tiny">${esc(c.lane !== 'main' ? c.laneLabel : '')}</span>${extra}</li>`;
  }
  const head = (kind, eyebrow, title, chip = '') => `<div class="glass"><div class="shead" style="--k:${KC[kind] || PROMPT_C}"><span class="glyph">${GLYPH[kind] || ''}</span><div style="flex:1;min-width:0"><div class="eyebrow">${eyebrow}</div><h3>${title}</h3>${chip}</div></div></div>`;

  function slideCall(id) {
    const c = sim.callById(id); if (!c) return { title: id, html: '<p class="muted">Call not found.</p>' };
    const caused = S.calls.filter(k => k.causedBy === c.id);
    const retries = S.calls.filter(k => k.retryOf === c.id);
    const chain = chainOf(c.id);
    const running = c.status === 'running';
    return { title: `${c.tool} ${c.id}`, html: head(c.kind, `${ORGAN[c.kind]} · ${KI[c.kind].name} · ${c.id}`, `${esc(c.tool)} · ${esc(c.label)}`, statusChip(c)) +
      (c.error ? errorBox(c) : '') +
      (chain.length > 1 ? `<div class="note">Signalling pathway of ${chain.length} linked calls is lit on the specimen.</div>` : '') +
      `<dl class="facts">
        <dt>lane</dt><dd>${laneLink(c.lane)}${c.depth ? ` (depth ${c.depth})` : ''}</dd>
        <dt>target</dt><dd>${targetHtml(c.target)}</dd>
        <dt>started</dt><dd>${clock(c.startedAt)}</dd>
        <dt>duration</dt><dd>${running ? `${dur(S.now - c.startedAt)} so far (planned ${dur(c.duration)})` : dur(c.endedAt - c.startedAt)}</dd>
        <dt>status</dt><dd>${c.status}${c.attempt > 1 ? ` · attempt ${c.attempt}` : ''}</dd>
        <dt>tokens</dt><dd>in ${c.tokens.in} · out ${c.tokens.out}</dd>
        <dt>context after</dt><dd>${c.contextAfter ? `${pctHtml(c.contextAfter.percent)} · ${ktok(c.contextAfter.used)} tokens` : c.lane !== 'main' ? 'subagent context (not main)' : '-'}</dd>
      </dl>
      <h4>Input arguments</h4><pre>${esc(JSON.stringify(c.input, null, 2))}</pre>
      ${outputHtml(c)}${diffHtml(c.diff)}
      <h4>Flow · ${c.flow.length} molecule${c.flow.length === 1 ? '' : 's'} moved</h4>
      <ol class="hops">${c.flow.map(h => `<li>${nodeLinkHtml(h.from)} → ${nodeLinkHtml(h.to)} · <span class="w">${esc(h.what)}</span>${h.tokens ? ` <span class="amt">${ktok(h.tokens)} tok</span>` : ''}${h.bytes ? ` <span class="amt">${kb(h.bytes)}</span>` : ''}</li>`).join('')}</ol>
      ${refsHtml(c)}
      <h4>Cause and effect</h4>
      <dl class="facts"><dt>caused by</dt><dd>${c.causedBy ? callLink(c.causedBy) : 'nothing (own initiative)'}</dd>
      <dt>retry of</dt><dd>${c.retryOf ? callLink(c.retryOf) : '-'}</dd>
      <dt>it caused</dt><dd>${caused.length ? caused.map(k => callLink(k.id)).join(', ') : 'nothing yet'}</dd>
      <dt>retried by</dt><dd>${retries.length ? retries.map(k => `${callLink(k.id)} ${k.status === 'success' ? '<span class="okc">✓</span>' : k.status === 'error' ? '<span class="errc">✶</span>' : '◌'}`).join(', ') : '-'}</dd></dl>
      ${c.error ? `<p><button type="button" class="lnk" data-open="error:${c.id}">open the virus slide (what happened next)</button></p>` : ''}` };
  }

  function slideError(id) {
    const c = sim.callById(id); if (!c || !c.error) return { title: id, html: '<p class="muted">Not an error.</p>' };
    const next = S.calls.filter(k => k.causedBy === c.id || k.retryOf === c.id);
    const fix = next.find(k => k.status === 'success');
    const later = S.calls.filter(k => k.lane === c.lane && k.startedAt > c.startedAt).slice(0, 4);
    return { title: `virus ${c.error.code}`, html: `<div class="glass"><div class="shead"><svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 1l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z" fill="#14000a" stroke="#ff3048"/></svg><div><div class="eyebrow">Pathogen · error on ${esc(ORGAN[c.kind].toLowerCase())}</div><h3>${esc(c.error.code)} · ${esc(c.error.name || '')}</h3></div></div></div>
      ${errorBox(c)}
      <dl class="facts"><dt>which call</dt><dd>${callLink(c.id, `${c.id} ${c.tool} · ${c.label}`)}</dd><dt>lane</dt><dd>${laneLink(c.lane)}</dd><dt>target</dt><dd>${targetHtml(c.target)}</dd><dt>when</dt><dd>${clock(c.startedAt)} · attempt ${c.attempt}</dd>
      <dt>caused by</dt><dd>${c.causedBy ? callLink(c.causedBy) : '-'}</dd></dl>
      <h4>What happened next</h4>
      ${fix ? `<div class="note">Immune response: ${callLink(fix.id)} ${fix.retryOf === c.id ? 'retried' : 'followed up'} and succeeded. Fixed.</div>` : next.length ? '<div class="amb">A follow-up ran but has not succeeded yet.</div>' : '<div class="errc">No retry or follow-up yet. The virus is still attached.</div>'}
      <ul class="list">${next.map(k => callRow(k, k.retryOf === c.id ? ' <span class="tiny">retry</span>' : ' <span class="tiny">caused by this</span>')).join('') || '<li class="muted">none linked</li>'}</ul>
      <h4>Next calls in the same lane</h4><ul class="list">${later.map(k => callRow(k)).join('') || '<li class="muted">none yet</li>'}</ul>` };
  }

  function slideFile(path) {
    const f = S.files[path]; const calls = sim.callsForFile(path);
    const lines = colonyLines(path);
    return { title: base(path), html: head('edits', `Colony · file on disk${f && f.edits >= 3 ? ' · HOT' : ''}`, esc(path)) +
      `<dl class="facts"><dt>lines now</dt><dd>${lines}</dd><dt>reads</dt><dd>${f ? f.reads : 0}</dd><dt>edits</dt><dd>${f ? f.edits : 0}${f && f.edits >= 3 ? ' <span style="color:#ff4fbf">✺ hot (3+ edits)</span>' : ''}</dd>
      <dt>failed calls</dt><dd class="${f && f.failed ? 'errc' : ''}">${f ? f.failed : 0}</dd><dt>lines +/−</dt><dd><span class="okc">+${f ? f.added : 0}</span> <span class="errc">−${f ? f.removed : 0}</span></dd><dt>last touched</dt><dd>${f ? clock(f.lastTouched) : 'never'}</dd></dl>
      <h4>Every call that touched it · ${calls.length}, in order</h4>
      <ul class="list">${calls.map(c => `${callRow(c)}${c.diff ? `<li style="border:0;padding-top:0">${diffHtml(c.diff).replace('<h4>', '<div class="tiny">').replace('</h4>', '</div>')}</li>` : ''}${c.error ? `<li style="border:0;padding-top:0">${errorBox(c)}</li>` : ''}`).join('') || '<li class="muted">untouched so far</li>'}</ul>` };
  }

  function slideLane(key) {
    const l = sim.laneByKey(key); if (!l) return { title: key, html: '<p class="muted">Lane not found.</p>' };
    const calls = S.calls.filter(c => c.lane === key);
    const kids = S.lanes.filter(k => k.parent === key);
    const spawn = S.calls.find(c => c.refs.some(r => r.type === 'lane' && r.value === key && r.role === 'spawned'));
    const kindsUsed = KINDS.filter(k => calls.some(c => c.kind === k));
    return { title: l.label, html: head('agents', l.depth ? `Daughter cell · depth ${l.depth} · ${esc(l.agentType)}` : 'Mother cell · main session', esc(l.label), `<span class="chip ${l.state === 'failed' ? 'err' : l.state === 'completed' ? 'ok' : 'run'}">${l.state}</span>`) +
      `<dl class="facts"><dt>key</dt><dd>${esc(l.key)}</dd><dt>parent</dt><dd>${l.parent ? laneLink(l.parent) : '-'}</dd><dt>model</dt><dd>${esc(l.model)}</dd>
      <dt>started</dt><dd>${clock(l.startedAt)}</dd><dt>ended</dt><dd>${l.endedAt ? `${clock(l.endedAt)} · ${dur(l.endedAt - l.startedAt)}` : `running ${dur(S.now - l.startedAt)}`}</dd>
      <dt>calls</dt><dd>${l.calls}</dd><dt>errors</dt><dd class="${l.errors ? 'errc' : ''}">${l.errors}</dd><dt>tokens</dt><dd>${ktok(l.tokens)}</dd>
      <dt>spawned by</dt><dd>${spawn ? callLink(spawn.id) : '-'}</dd><dt>organelles used</dt><dd>${kindsUsed.map(k => `<span style="color:${KC[k]}">${KI[k].name}</span>`).join(' · ') || '-'}</dd></dl>
      ${l.task ? `<h4>Brief</h4><pre>${esc(l.task)}</pre>` : ''}
      ${l.result ? `<h4>Final result (fused back)</h4><pre class="${l.state === 'failed' ? 'errc' : ''}">${esc(l.result)}</pre>` : ''}
      ${kids.length ? `<h4>Its daughters</h4><ul class="list">${kids.map(k => `<li>${laneLink(k.key)} <span class="tiny">${k.state} · ${k.calls} calls</span></li>`).join('')}</ul>` : ''}
      <h4>Calls · ${calls.length}${key === 'main' ? ' (latest 40)' : ''}</h4><ul class="list">${calls.slice(-40).reverse().map(c => callRow(c)).join('')}</ul>` };
  }

  function slideKind(kind) {
    const calls = S.calls.filter(c => c.kind === kind); const errs = calls.filter(c => c.status === 'error');
    const esp = sim.errorsSincePrompt()[kind] || 0; const run = calls.filter(c => c.status === 'running');
    const tools = {}; for (const c of calls) tools[c.tool] = (tools[c.tool] || 0) + 1;
    return { title: ORGAN[kind], html: head(kind, `Organelle · ${KI[kind].name}`, `${ORGAN[kind]}`) +
      `<p class="muted">${esc(BEHAVE[kind])}</p>
      <dl class="facts"><dt>calls</dt><dd>${calls.length}</dd><dt>running</dt><dd>${run.length}</dd><dt>errors</dt><dd class="${errs.length ? 'errc' : ''}">${errs.length} total · ${esp} since prompt</dd>
      <dt>tools</dt><dd>${Object.entries(tools).map(([t, n]) => `${esc(t)} ×${n}`).join(' · ') || '-'}</dd></dl>
      ${errs.length ? `<h4>Viruses on this organelle</h4><ul class="list">${errs.slice(-6).reverse().map(c => `<li><button type="button" class="lnk" data-open="error:${c.id}">✶ ${esc(c.error.code)}</button> <span class="tiny">${clock(c.startedAt)} · ${esc(c.error.message)}</span></li>`).join('')}</ul>` : ''}
      <h4>Recent calls</h4><ul class="list">${calls.slice(-25).reverse().map(c => callRow(c, c.target ? ` <span class="tiny">${esc(c.target.type === 'file' ? base(c.target.value) : c.target.value)}</span>` : '')).join('') || '<li class="muted">none yet</li>'}</ul>` };
  }

  function slideHost(id) {
    const h = hosts.get(id); const isMcp = id.startsWith('mcp:');
    const host = id.replace(/^web:/, '');
    const calls = S.calls.filter(c => isMcp ? c.kind === 'other' : (c.kind === 'network' && (toolHint('network', c) === id || c.refs.some(r => r.type === 'url' && hostOf(r.value) === host))));
    return { title: h ? h.label : id, html: head(isMcp ? 'other' : 'network', isMcp ? 'Host particle · MCP server' : 'Host particle · web host (reached by flagella)', esc(h ? h.label : id)) +
      `<dl class="facts"><dt>requests</dt><dd>${calls.length}</dd><dt>failed</dt><dd class="errc">${calls.filter(c => c.status === 'error').length}</dd></dl>
      <h4>Fetches and status</h4><ul class="list">${calls.slice().reverse().map(c => callRow(c, ` <span class="tiny">${c.output && c.output.status ? `HTTP ${c.output.status}` : c.error ? esc(c.error.message) : ''} ${esc(c.target ? c.target.value : '')}</span>`)).join('') || '<li class="muted">No requests yet. WebSearch results arrive from whichever host answers.</li>'}</ul>` };
  }

  function slideCtxFile(path) {
    const f = S.context.files.find(x => x.path === path); const m = S.markers.find(x => x.kind === 'context-file' && x.detail.path === path);
    return { title: base(path), html: head('memory', 'Plastid · context file docked in the cell', esc(path)) +
      (f ? `<dl class="facts"><dt>tokens</dt><dd>${f.tokens}</dd><dt>why</dt><dd>${esc(f.why)}</dd><dt>loaded</dt><dd>${clock(f.loadedAt)}</dd><dt>share of context</dt><dd>${(f.tokens / S.context.capacity * 100).toFixed(1)}% of capacity</dd></dl>` : '<p class="muted">Not loaded.</p>') +
      (m ? `<p class="tiny">marker ${esc(m.label)}</p>` : '') + '<p><button type="button" class="lnk" data-open="context">see everything that filled the context window</button></p>' };
  }

  function slideContext() {
    const c = S.context;
    const byKind = {}; const top = [];
    for (const s of c.samples) {
      if (s.delta <= 0) continue;
      const call = s.callId ? sim.callById(s.callId) : null;
      const key = call ? call.tool : /^Loaded/.test(s.why) ? 'Context files' : s.why;
      byKind[key] = (byKind[key] || 0) + s.delta; top.push({ s, call });
    }
    top.sort((a, b) => b.s.delta - a.s.delta);
    const rows = Object.entries(byKind).sort((a, b) => b[1] - a[1]); const max = rows.length ? rows[0][1] : 1;
    const colorOf = k => { const tool = KINDS.find(kd => KI[kd].tools.includes(k)); return tool ? KC[tool] : k === 'Context files' ? '#e8f0ff' : PROMPT_C; };
    const comps = S.markers.filter(m => m.kind === 'compaction');
    return { title: 'context window', html: head('memory', 'Membrane and cytoplasm · context window', `${c.percent}% full · ${ktok(c.used)} of ${ktok(c.capacity)}`, `<span class="chip" style="color:${memColor(c.percent)}">${c.percent >= 90 ? 'red ≥90' : c.percent >= 70 ? 'amber ≥70' : 'healthy'}</span>`) +
      `<p class="muted">Granules in the cytoplasm are coloured by the kind of work that put them there. On compaction the cell expels a vesicle and shrinks.</p>
      <h4>What filled it (all time, by source)</h4><div class="bars">${rows.slice(0, 12).map(([k, v]) => `<span><span class="tiny">${esc(k)}</span><div class="bar" style="--k:${colorOf(k)};width:${(v / max * 100).toFixed(1)}%"></div></span><span class="tiny">${ktok(v)}</span>`).join('')}</div>
      <h4>Biggest single contributors</h4><ul class="list">${top.slice(0, 8).map(({ s, call }) => `<li><span class="tiny">${clock(s.time)} +${ktok(s.delta)}</span> ${call ? callLink(call.id, `${call.id} ${call.tool}`) : esc(s.why)} <span class="tiny">${esc(s.why)}</span></li>`).join('')}</ul>
      <h4>Compactions · ${comps.length}</h4><ul class="list">${comps.map(m => `<li><span class="tiny">${clock(m.time)}</span> <span class="amb">◆ ${esc(m.label)}</span></li>`).join('') || '<li class="muted">none yet</li>'}</ul>
      <h4>Context files (plastids)</h4><ul class="list">${c.files.map(f => `<li><button type="button" class="lnk" data-open="ctxfile:${esc(f.path)}">${esc(f.path)}</button> <span class="tiny">${ktok(f.tokens)} · ${esc(f.why)}</span></li>`).join('')}</ul>` };
  }

  function slideTerminal() {
    const list = shellCalls.slice().reverse();
    return { title: 'terminal', html: head('shell', 'Terminal crystal · one facet per command', `${shellCalls.length} commands`) +
      `<ul class="list">${list.map(c => `<li><span class="tiny">${clock(c.startedAt)}</span> ${callLink(c.id, c.input.command)} ${c.status === 'running' ? '<span class="runc">◌ running</span>' : `<span class="${c.status === 'error' ? 'errc' : 'okc'}">exit ${c.output && c.output.exitCode != null ? c.output.exitCode : c.error ? esc(c.error.code) : '?'}</span>`} <span class="tiny">${dur(c.endedAt ? c.endedAt - c.startedAt : S.now - c.startedAt)} · ${esc(c.laneLabel)}${c.attempt > 1 ? ` · ↻ attempt ${c.attempt}` : ''}</span>
        ${c.output && c.output.tests ? `<div class="tiny">tests ${c.output.tests.passed} passed / <span class="${c.output.tests.failed ? 'errc' : ''}">${c.output.tests.failed} failed</span>${c.output.tests.failures.length ? ` · ${c.output.tests.failures.map(esc).join(', ')}` : ''}</div>` : ''}${c.error ? `<div class="tiny errc">${esc(c.error.message)}</div>` : ''}</li>`).join('')}</ul>` };
  }

  function slideTasks() {
    const items = S.tasks.items; const done = items.filter(t => t.status === 'completed').length;
    return { title: 'task list', html: head('memory', `Vacuole · task list (${esc(S.tasks.source)})`, `${done} of ${items.length} done`) +
      `<ul class="list">${items.map(t => `<li><span class="bead ${t.status}"></span> <b>${esc(t.label)}</b> <span class="tiny">${t.status.replace('_', ' ')}</span><ol class="tiny">${t.history.map(h => `<li>${clock(h.time)} → ${h.status.replace('_', ' ')} · ${callLink(h.callId)}</li>`).join('')}</ol></li>`).join('') || '<li class="muted">No tasks yet.</li>'}</ul>
      <p class="tiny">updated ${S.tasks.updatedAt ? clock(S.tasks.updatedAt) : '-'}</p>` };
  }

  function slideModel() {
    const s = S.session; const st = sessionStatus();
    return { title: 'nucleus', html: head('agents', 'Nucleus · the model', esc(s.model), `<span class="chip ${st.cls}">${st.text}</span>`) +
      `<dl class="facts"><dt>project</dt><dd>${esc(s.project)}</dd><dt>session</dt><dd>${esc(s.name)}</dd><dt>id</dt><dd>${esc(s.id)}</dd><dt>provider</dt><dd>${esc(s.provider)}</dd><dt>branch</dt><dd>${esc(s.branch)}</dd><dt>cwd</dt><dd>${esc(s.cwd)}</dd>
      <dt>turn</dt><dd>${s.turn}</dd><dt>last record</dt><dd>${ago(S.now - lastRecordTime())}</dd><dt>started</dt><dd>${clock(s.startedAt)}</dd>
      <dt>tokens</dt><dd>in ${ktok(S.tokens.input)} · out ${ktok(S.tokens.output)} · cache read ${ktok(S.tokens.cacheRead)}</dd><dt>lanes</dt><dd>${S.lanes.length} (${S.lanes.length - 1} daughters)</dd></dl>` };
  }
  function slidePrompts() {
    const ps = S.markers.filter(m => m.kind === 'prompt').reverse();
    return { title: 'user prompts', html: head('agents', 'Pipette · stimulus from the user', `${ps.length} prompts`) + `<ul class="list">${ps.map(m => `<li><span class="tiny">${clock(m.time)} · ${m.detail.tokens} tok</span> ${esc(m.detail.text)}</li>`).join('')}</ul>` };
  }
  function slideReply() {
    const ts = S.markers.filter(m => m.kind === 'turn-complete').reverse();
    return { title: 'reply', html: head('agents', 'Secreted signal · reply to the user', `${ts.length} turns completed`) + `<ul class="list">${ts.map(m => `<li><span class="tiny">${clock(m.time)}</span> turn ${m.detail.turn} complete</li>`).join('') || '<li class="muted">No reply yet this session.</li>'}</ul>` };
  }
  function slideMoment(t) {
    t = Number(t); const w = 30000; const from = t - w / 2, to = t + w / 2;
    const calls = S.calls.filter(c => c.startedAt >= from && c.startedAt < to);
    const ms = S.markers.filter(m => m.time >= from && m.time < to);
    const sample = [...S.context.samples].reverse().find(s => s.time <= t);
    return { title: `moment ${clock(t)}`, html: head('memory', 'Inspecting a moment on the growth chart', `${clock(from)} – ${clock(to)}`) +
      `<dl class="facts"><dt>context then</dt><dd>${sample ? pctHtml(sample.percent) : '-'}</dd><dt>calls</dt><dd>${calls.length}</dd><dt>errors</dt><dd class="errc">${calls.filter(c => c.status === 'error').length}</dd></dl>
      ${ms.length ? `<h4>Markers</h4><ul class="list">${ms.map(m => `<li><span class="tiny">${clock(m.time)}</span> ${esc(m.label)}</li>`).join('')}</ul>` : ''}
      <h4>Calls started in this window</h4><ul class="list">${calls.map(c => callRow(c)).join('') || '<li class="muted">quiet</li>'}</ul>` };
  }

  // ======================================================================
  // Growth chart (last 30 minutes)
  // ======================================================================
  const gc = $('#growth'), gx = gc.getContext('2d'); let GW = 0, GH = 0, gHover = null, inspectAt = null;
  function resizeChart() { const r = gc.getBoundingClientRect(); const d = window.devicePixelRatio || 1; GW = r.width; GH = r.height; gc.width = Math.max(1, Math.round(GW * d)); gc.height = Math.max(1, Math.round(GH * d)); }
  const G = { l: 40, r: 14, t: 32, b: 22 };
  function chartX(t) { const t1 = S.now, t0 = t1 - 30 * 60000; return G.l + (t - t0) / (t1 - t0) * (GW - G.l - G.r); }
  function drawChart() {
    if (!GW) return;
    const d = window.devicePixelRatio || 1; gx.setTransform(d, 0, 0, d, 0, 0); gx.clearRect(0, 0, GW, GH);
    const t1 = S.now, t0 = t1 - 30 * 60000, bins = 60, bw = (GW - G.l - G.r) / bins, ph = GH - G.t - G.b;
    const counts = Array.from({ length: bins }, () => ({}));
    let max = 4;
    for (const c of S.calls) { if (c.startedAt < t0) continue; const b = Math.min(bins - 1, Math.floor((c.startedAt - t0) / 30000)); counts[b][c.kind] = (counts[b][c.kind] || 0) + 1; }
    for (const b of counts) max = Math.max(max, Object.values(b).reduce((a, v) => a + v, 0));
    // grid
    gx.strokeStyle = 'rgba(255,179,217,.08)'; gx.lineWidth = 1;
    for (let m = 0; m <= 30; m += 5) { const x = chartX(t1 - m * 60000); gx.beginPath(); gx.moveTo(x, G.t); gx.lineTo(x, G.t + ph); gx.stroke(); gx.fillStyle = 'rgba(200,160,200,.55)'; gx.font = '9.5px Consolas, monospace'; gx.textAlign = 'center'; gx.fillText(m === 0 ? 'now' : `−${m}m`, x, GH - 7); }
    if (S.session.startedAt > t0) { const x = chartX(S.session.startedAt); gx.fillStyle = 'rgba(255,255,255,.03)'; gx.fillRect(G.l, G.t, x - G.l, ph); gx.fillStyle = 'rgba(200,160,200,.5)'; gx.textAlign = 'right'; gx.fillText('first record →', x - 4, G.t + 12); }
    // stacked colonies of calls
    counts.forEach((b, i) => {
      let y = G.t + ph; const x = G.l + i * bw + bw * 0.15;
      for (const k of KINDS) { const n = b[k] || 0; if (!n) continue; const h = n / max * (ph - 4); gx.fillStyle = rgba(KC[k], 0.75); gx.fillRect(x, y - h, bw * 0.7, h); y -= h; }
      if (gHover === i || (inspectAt != null && Math.floor((inspectAt - t0) / 30000) === i)) { gx.strokeStyle = inspectAt != null && Math.floor((inspectAt - t0) / 30000) === i ? MEM.warn : 'rgba(255,255,255,.6)'; gx.strokeRect(G.l + i * bw, G.t, bw, ph); }
    });
    gx.fillStyle = 'rgba(200,160,200,.55)'; gx.textAlign = 'left'; gx.font = '9.5px Consolas, monospace'; gx.fillText(`max ${max} calls/30s`, G.l + 4, G.t + 9); gx.textAlign = 'right';
    // context %
    const Y = p => G.t + ph - p / 100 * ph;
    gx.setLineDash([2, 3]); gx.strokeStyle = 'rgba(255,174,43,.3)'; gx.beginPath(); gx.moveTo(G.l, Y(70)); gx.lineTo(GW - G.r, Y(70)); gx.stroke();
    gx.strokeStyle = 'rgba(255,48,72,.35)'; gx.beginPath(); gx.moveTo(G.l, Y(90)); gx.lineTo(GW - G.r, Y(90)); gx.stroke(); gx.setLineDash([]);
    gx.fillStyle = 'rgba(200,160,200,.55)'; gx.fillText('70%', G.l - 4, Y(70) + 3); gx.fillText('90%', G.l - 4, Y(90) + 3);
    const sm = S.context.samples.filter(s => s.time >= t0); gx.lineWidth = 1.6;
    for (let i = 1; i < sm.length; i++) { gx.strokeStyle = memColor(sm[i].percent); gx.beginPath(); gx.moveTo(chartX(sm[i - 1].time), Y(sm[i - 1].percent)); gx.lineTo(chartX(sm[i].time), Y(sm[i].percent)); gx.stroke(); }
    // markers
    gx.textAlign = 'center'; gx.font = '10px "Segoe UI", sans-serif';
    for (const m of S.markers) {
      if (m.time < t0 || m.kind === 'context-file') continue; const x = chartX(m.time);
      const col = m.kind === 'prompt' ? PROMPT_C : m.kind === 'turn-complete' ? KC.files : MEM.warn;
      gx.strokeStyle = rgba(col, 0.5); gx.setLineDash([3, 3]); gx.beginPath(); gx.moveTo(x, G.t - 2); gx.lineTo(x, G.t + ph); gx.stroke(); gx.setLineDash([]);
      gx.fillStyle = col; gx.fillText(m.kind === 'prompt' ? '▼' : m.kind === 'turn-complete' ? '✓' : '◆', x, G.t - 4);
    }
    // error ticks: spiky marks below the axis
    for (const e of S.errors) {
      if (e.startedAt < t0) continue; const x = chartX(e.startedAt), y = G.t + ph + 6;
      gx.beginPath(); for (let k = 0; k <= 12; k++) { const a = k / 12 * TAU; const rr = k % 2 ? 2 : 4.5; gx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      gx.closePath(); gx.fillStyle = '#14000a'; gx.strokeStyle = ERR_C; gx.lineWidth = 1.1; gx.fill(); gx.stroke();
    }
    gx.strokeStyle = 'rgba(255,179,217,.25)'; gx.beginPath(); gx.moveTo(G.l, G.t + ph + 0.5); gx.lineTo(GW - G.r, G.t + ph + 0.5); gx.stroke();
    if (inspectAt != null) { const x = chartX(inspectAt); gx.strokeStyle = MEM.warn; gx.lineWidth = 1.5; gx.beginPath(); gx.moveTo(x, G.t - 4); gx.lineTo(x, G.t + ph + 10); gx.stroke(); }
  }
  function chartBin(e) { const r = gc.getBoundingClientRect(); const x = e.clientX - r.left; const bw = (GW - G.l - G.r) / 60; const i = Math.floor((x - G.l) / bw); return i >= 0 && i < 60 ? i : null; }
  gc.addEventListener('mousemove', e => {
    gHover = chartBin(e); if (gHover == null) { $('#gread').textContent = ''; return; }
    const t0 = S.now - 30 * 60000 + gHover * 30000; const calls = S.calls.filter(c => c.startedAt >= t0 && c.startedAt < t0 + 30000);
    const errs = calls.filter(c => c.status === 'error'); const ms = S.markers.filter(m => m.time >= t0 && m.time < t0 + 30000 && m.kind !== 'context-file');
    const byK = KINDS.filter(k => calls.some(c => c.kind === k)).map(k => `${KI[k].name} ${calls.filter(c => c.kind === k).length}`).join(' · ');
    $('#gread').textContent = `${clock(t0)} · ${calls.length} calls${byK ? ` (${byK})` : ''}${errs.length ? ` · ✶ ${errs.map(c => c.error.code).join(', ')}` : ''}${ms.length ? ` · ${ms.map(m => m.kind).join(', ')}` : ''} · click to inspect`;
  });
  gc.addEventListener('mouseleave', () => { gHover = null; $('#gread').textContent = ''; });
  gc.addEventListener('click', e => { const i = chartBin(e); if (i == null) return; open(`moment:${Math.round(S.now - 30 * 60000 + i * 30000 + 15000)}`); });

  // ---------- controls ----------
  function togglePause() { paused = !paused; if (paused) sim.pause(); else sim.start(); $('#btnPause').textContent = paused ? 'Resume' : 'Pause'; renderMode(); }
  $('#btnPause').addEventListener('click', togglePause);
  document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => { sim.setSpeed(Number(b.dataset.speed)); document.querySelectorAll('.speed button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
  function renderMode() {
    const m = $('#mode');
    if (inspectAt != null) { m.className = 'inspect'; m.textContent = `◉ INSPECTING ${clock(inspectAt)} · back to live`; }
    else if (paused) { m.className = 'inspect'; m.textContent = `❚❚ PAUSED ${clock(S.now)} · resume`; }
    else { m.className = 'live'; m.textContent = `● LIVE ${sim.speed !== 1 ? `${sim.speed}×` : ''}`; }
  }
  $('#mode').addEventListener('click', () => { if (inspectAt != null) { inspectAt = null; if (stack.length && stack[stack.length - 1].startsWith('moment:')) closeSlide(); } if (paused) togglePause(); renderMode(); });

  // ---------- go ----------
  new ResizeObserver(resize).observe($('#stage'));
  new ResizeObserver(() => { resizeChart(); drawSpark(); }).observe($('#chartwrap'));
  resize();
  renderPanels();
  sim.start();
  requestAnimationFrame(loop);
  window.__cell = { sim, open, closeSlide, get hits() { return hits; } };
})();
