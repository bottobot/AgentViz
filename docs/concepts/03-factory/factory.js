/* AgentViz concept 03: Conveyor Factory.
 * A side-view factory floor. Every tool call is an item whose shape tells the kind of work; it rides belts,
 * rails, a crane and a side line through one machine per kind, and ends up on a warehouse shelf (files), in the
 * context silo, on the terminal printer's tape, on the production board (task list), in a sub-factory annex
 * (subagent lane), at the shipping dock (reply), or in the red QC reject bin (errors).
 * Data: docs/concepts/shared/sim.js (read only). No dependencies, works from file://.
 */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const sim = AgentVizSim.create({ seed: 7, history: 30 });
  const S = sim.state;
  const KINDS = sim.kinds;
  const KI = sim.kindInfo;
  const reduce = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reduce) document.body.classList.add('reduced');

  // ---------- vocabulary ----------
  const KCOL = { files: '#d9b47c', edits: '#a8703d', shell: '#2e7479', network: '#5e9fd8', agents: '#6d8234', memory: '#e9c53c', other: '#8f7bb6' };
  const KITEM = { files: 'box of paper sheets', edits: 'welded crate', shell: 'barrel', network: 'parcel, flown in and craned down', agents: 'sealed container to an annex', memory: 'clipboard for the board', other: 'odd-shaped package' };
  const MACH = {
    files: { x: 405, name: 'SCANNER', sub: 'READ · GREP · GLOB' },
    edits: { x: 520, name: 'PRESS / WELDER', sub: 'EDIT · WRITE' },
    shell: { x: 635, name: 'FURNACE', sub: 'BASH' },
    network: { x: 750, name: 'LOADING CRANE', sub: 'FETCH · SEARCH' },
    memory: { x: 865, name: 'STAMPING DESK', sub: 'PLAN UPDATES' },
    other: { x: 980, name: 'ODD-JOB BENCH', sub: 'MCP · NOTEBOOK' },
    agents: { x: 1095, name: 'DISPATCH CHUTE', sub: 'TASK → ANNEX' }
  };
  const STATUS_COL = { pending: 'QUEUED', in_progress: 'ON THE LINE', completed: 'DONE' };
  const SILO = { x: 234, w: 88, top: 104, bottom: 498 };
  const BIN = { x: 112, y: 486, floor: 'lower' };
  const SLOT = { x0: 354, y0: 362, w: 87, h: 36 };
  const HOST_X = [400, 530, 870, 1000, 1125];
  const LEVEL = { A: 240, B: 332, C: 574 };

  // ---------- small helpers ----------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const pad = n => String(n).padStart(2, '0');
  const hms = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const ago = ms => ms < 1500 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)}s ago` : ms < 3600000 ? `${Math.floor(ms / 60000)}m ${pad(Math.floor(ms % 60000 / 1000))}s ago` : `${Math.floor(ms / 3600000)}h ago`;
  const dur = ms => ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
  const tok = n => { n = Number(n) || 0; return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n)); };
  const size = n => n == null ? '—' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;
  const base = p => String(p).split('/').pop();
  const trunc = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const wrap = (text, n, max) => {
    const words = String(text || '').split(/\s+/); const lines = []; let line = '';
    for (const word of words) { if ((line + ' ' + word).trim().length > n && line) { lines.push(line); line = word; } else line = (line + ' ' + word).trim(); }
    if (line) lines.push(line);
    if (lines.length > max) { lines.length = max; lines[max - 1] = trunc(lines[max - 1] + '…', n); }
    return lines;
  };
  const pctClass = p => p >= 90 ? 'crit' : p >= 70 ? 'warn' : '';
  const callById = id => sim.callById(id);
  const laneOf = key => sim.laneByKey(key);
  const kindName = k => KI[k] ? KI[k].name : k;

  // ---------- item shapes: the kind of work is the shape ----------
  function shape(kind, o = {}) {
    const c = KCOL[kind] || '#ccc'; const N = '#1b2f5e';
    let s;
    switch (kind) {
      case 'files': s = `<rect x="-8" y="-14" width="13" height="11" fill="#fff" stroke="${N}" stroke-width=".9" transform="rotate(-9)"/><rect x="-3" y="-15" width="13" height="11" fill="#fff" stroke="${N}" stroke-width=".9" transform="rotate(7)"/><path d="M-6 -11h6M-6 -8h5" stroke="${N}" stroke-width=".6"/><rect x="-11" y="-5" width="22" height="14" fill="${c}" stroke="${N}" stroke-width="1.4"/><path d="M-11 -5l-2 -4M11 -5l2 -4" stroke="${N}" stroke-width="1.1"/>`; break;
      case 'edits': s = `<rect x="-11" y="-10" width="22" height="20" fill="${c}" stroke="${N}" stroke-width="1.4"/><path d="M-11 -3.5h22M-11 3.5h22" stroke="${N}" stroke-width=".7"/><path d="M-10 9L10 -9" stroke="${N}" stroke-width="1"/><path d="M6 -9l1.4 3 3.2-1-1.5 3 3 1.6-3.2.8 1 3.2-3-1.5-1.6 3-.8-3.2-3.3.6 2.1-2.5-2.6-2.2 3.3-.2z" fill="#f26b1d" stroke="#fff" stroke-width=".5"/>`; break;
      case 'shell': s = `<rect x="-9" y="-12" width="18" height="24" rx="4" fill="${c}" stroke="${N}" stroke-width="1.4"/><path d="M-9 -5h18M-9 5h18" stroke="#f26b1d" stroke-width="2"/><ellipse cx="0" cy="-11" rx="7" ry="1.6" fill="none" stroke="#fff" stroke-width=".8" opacity=".7"/><circle cx="3.5" cy="-11" r="1.1" fill="#fff"/>`; break;
      case 'network': s = `<path d="M-4 -8q4 -7 8 0" fill="none" stroke="${N}" stroke-width="1.2"/><rect x="-10" y="-8" width="20" height="16" rx="1" fill="${c}" stroke="${N}" stroke-width="1.4"/><path d="M0 -8v16M-10 0h20" stroke="#fff" stroke-width="2.4"/><path d="M0 -8v16M-10 0h20" stroke="${N}" stroke-width=".5"/>`; break;
      case 'agents': s = `<rect x="-14" y="-9" width="28" height="18" rx="1" fill="${c}" stroke="${N}" stroke-width="1.4"/><path d="M-9 -9v18M-4 -9v18M1 -9v18M6 -9v18" stroke="rgba(0,0,0,.28)" stroke-width="1"/><path d="M-14 -9h28" stroke="${N}" stroke-width="2.2"/><circle cx="10" cy="1" r="3.2" fill="#f26b1d" stroke="${N}" stroke-width="1"/><path d="M10 -1v4" stroke="${N}" stroke-width="1"/>`; break;
      case 'memory': s = `<rect x="-8" y="-11" width="16" height="22" rx="1.5" fill="${c}" stroke="${N}" stroke-width="1.3"/><rect x="-5.5" y="-7" width="11" height="15" fill="#fff"/><rect x="-4" y="-13" width="8" height="4" rx="1" fill="${N}"/><path d="M-3.5 -3h7M-3.5 0h7M-3.5 3h5" stroke="${N}" stroke-width=".8"/><path d="M-4 -4.5l1 1 2-2" stroke="#f26b1d" stroke-width="1" fill="none"/>`; break;
      default: s = `<path d="M-12 3L-7 -9L4 -10L12 -2L8 9L-6 10Z" fill="${c}" stroke="${N}" stroke-width="1.4" stroke-linejoin="round"/><path d="M-7 -9L8 9M4 -10L-6 10" stroke="#fff" stroke-width="1.1" opacity=".8"/><circle cx="0" cy="0" r="2" fill="${N}"/>`;
    }
    if (o.err) s += `<path d="M-8 -8L8 8M8 -8L-8 8" stroke="#fff" stroke-width="5"/><path d="M-8 -8L8 8M8 -8L-8 8" stroke="#d7262b" stroke-width="3"/>`;
    if (o.retry) s += `<g transform="translate(-2,-21) rotate(-6)"><rect x="-17" y="-5" width="36" height="9" rx="1" fill="#ffd23f" stroke="${N}" stroke-width=".6"/><text x="1" y="1.8" font-size="6.4" font-weight="800" text-anchor="middle" style="fill:${N}">ATTEMPT ${o.retry}</text></g>`;
    return s;
  }
  const icon = (kind, px = 18, o) => `<svg class="ic" viewBox="-16 -17 32 32" width="${px}" height="${px}" aria-hidden="true">${shape(kind, o)}</svg>`;
  function scaleFor(hop) {
    const v = hop && (hop.tokens || (hop.bytes ? hop.bytes / 4 : 0));
    if (!v) return 0.72;
    return Math.max(0.65, Math.min(1.8, 0.55 + (Math.log10(v + 1) - 1) * 0.35));
  }

  // ---------- layout: where each node lives on the floor ----------
  const fileList = () => S.nodes.filter(n => n.group === 'disk').map(n => n.label);
  function fileSlot(path) { const i = fileList().indexOf(path); if (i < 0 || i >= 20) return null; return { x: SLOT.x0 + (i % 4) * SLOT.w, y: SLOT.y0 + Math.floor(i / 4) * SLOT.h, i }; }
  const hostList = () => S.nodes.filter(n => n.group === 'web');
  function hostPos(id) { const i = hostList().findIndex(n => n.id === id); return { x: HOST_X[i] ?? 1125, y: 24 }; }
  const siloTop = () => SILO.bottom - Math.min(100, S.context.percent) / 100 * (SILO.bottom - SILO.top);
  function annexLayout() {
    const subs = S.lanes.filter(l => l.depth === 1);
    const shown = subs.slice(-5);
    const map = new Map();
    shown.forEach((l, i) => {
      const x = 14 + i * 228;
      map.set(l.key, { x, y: 598, w: 222, h: 56, lane: l });
      const kids = S.lanes.filter(k => k.parent === l.key);
      const kid = kids[kids.length - 1];
      if (kid) map.set(kid.key, { x: x + 16, y: 662, w: 206, h: 52, lane: kid, more: kids.length - 1 });
    });
    return { map, hidden: subs.length - shown.length, total: subs.length };
  }
  function resolve(id, call, role) {
    const sub = call && call.lane !== 'main';
    if (id.startsWith('tool:')) {
      const kind = id.slice(5);
      if (sub) { const a = annexLayout().map.get(call.lane); return a ? { x: a.x + a.w - 34, y: a.y + 36, floor: 'base', annex: call.lane } : { x: 1172, y: 574, floor: 'base' }; }
      return { x: MACH[kind].x, y: 216, floor: 'upper', portC: kind === 'agents' ? 1172 : undefined };
    }
    if (id.startsWith('lane:')) { const key = id.slice(5); const a = annexLayout().map.get(key); return a ? { x: a.x + 22, y: a.y + 36, floor: 'base', annex: key } : { x: 1172, y: 574, floor: 'base' }; }
    if (id === 'model') return { x: 162, y: 216, floor: 'upper' };
    if (id === 'user') return { x: 58, y: 216, floor: 'upper' };
    if (id === 'context') return role === 'from' ? { x: 304, y: 240, floor: 'upper', port: 341 } : { x: 278, y: Math.max(SILO.top + 8, siloTop() - 4), floor: 'upper', port: 341, entry: [[341, 86], [278, 86]] };
    if (id === 'terminal') return { x: 749, y: 400, floor: 'lower' };
    if (id === 'plan') return { x: 899, y: 372, floor: 'lower' };
    if (id === 'answer') return { x: 1060, y: 500, floor: 'lower' };
    if (id.startsWith('file:')) { const slot = fileSlot(id.slice(5)); return slot ? { x: slot.x + 43, y: slot.y + 20, floor: 'lower' } : { x: 526, y: 450, floor: 'lower' }; }
    if (id.startsWith('web:') || id.startsWith('mcp:')) { const p = hostPos(id); return { x: p.x, y: 30, floor: 'sky' }; }
    if (id.startsWith('ctxfile:')) return { x: 278, y: 520, floor: 'upper' };
    return { x: 600, y: 332, floor: 'lower' };
  }
  function route(a, b) {
    if (a.annex && a.annex === b.annex) { const yb = a.y + 2; return [[a.x, a.y], [a.x, yb], [b.x, yb], [b.x, b.y]]; }
    if (a.floor === 'sky') return [[a.x, a.y], [750, 24], [750, 66], [b.x, 66], [b.x, b.y]];
    if (b.floor === 'sky') return [[a.x, a.y], [a.x, 66], [750, 66], [750, 24], [b.x, b.y]];
    const L = (a.floor === 'base' || b.floor === 'base') ? 'C' : (a.floor === 'upper' && b.floor === 'upper') ? 'A' : 'B';
    const Y = LEVEL[L];
    const px = d => (L === 'C' && d.portC) || d.port || d.x;
    const pts = [[a.x, a.y]];
    if (px(a) !== a.x) pts.push([px(a), a.y]);
    pts.push([px(a), Y], [px(b), Y]);
    if (b.entry) pts.push(...b.entry);
    else if (px(b) !== b.x) pts.push([px(b), b.y]);
    pts.push([b.x, b.y]);
    return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  }

  // ---------- the static plant ----------
  function machineSvg(kind) {
    const m = MACH[kind]; const x = m.x; const L = x - 46; const R = x + 46;
    let d = '';
    switch (kind) {
      case 'files': d = `<rect x="${L}" y="120" width="92" height="128" rx="3" class="m-body"/>
        <rect x="${x - 34}" y="136" width="68" height="38" rx="2" fill="#1b2f5e"/>
        <path class="screen-line" d="M${x - 28} 146h40M${x - 28} 153h52M${x - 28} 160h30M${x - 28} 167h46" stroke="#8fc3ff" stroke-width="2"/>
        <rect x="${x - 30}" y="192" width="60" height="54" class="mouth"/>
        <rect x="${x - 34}" y="186" width="68" height="7" fill="#1b2f5e"/>
        <rect class="beam" x="${x - 30}" y="196" width="60" height="3" fill="#ff4d1f"/>`; break;
      case 'edits': d = `<rect x="${L + 12}" y="186" width="68" height="60" class="mouth"/>
        <rect x="${L}" y="120" width="13" height="128" class="m-frame"/><rect x="${R - 13}" y="120" width="13" height="128" class="m-frame"/>
        <rect x="${L}" y="120" width="92" height="22" class="m-frame"/>
        <g class="ram"><rect x="${x - 5}" y="142" width="10" height="30" fill="#8b959f" stroke="#1b2f5e"/><rect x="${x - 22}" y="172" width="44" height="13" fill="#1b2f5e"/></g>
        <path class="sparks" d="M${x + 22} 236l3-8 2 7 6-6-3 8 8-1-7 4 6 5-8-2-1 7-3-7-6 4 4-7-8-2z" fill="#ffd23f" stroke="#f26b1d"/>`; break;
      case 'shell': d = `<path d="M${L} 248V156Q${L} 120 ${x} 120Q${R} 120 ${R} 156V248Z" class="m-body"/>
        <rect x="${x - 30}" y="192" width="60" height="54" rx="2" class="mouth"/>
        <path class="flame" d="M${x - 26} 246q4-22 9-8q3-18 9-2q4-20 9 0q5-16 9 2q5-12 8 8z" fill="#f26b1d"/>
        <path class="flame" d="M${x - 18} 246q4-14 7-4q3-11 7 0q4-12 7 0q3-8 6 4z" fill="#ffd23f"/>
        <path d="M${x - 30} 236h60" stroke="#1b2f5e" stroke-width="1.4" stroke-dasharray="4 3"/>
        <circle cx="${x - 18}" cy="160" r="11" fill="#fff" stroke="#1b2f5e" stroke-width="1.4"/>
        <rect class="needle" x="${x - 19}" y="151" width="2" height="9" fill="#d7262b"/>
        <rect x="${x + 2}" y="150" width="26" height="22" rx="2" fill="#1b2f5e"/><text x="${x + 15}" y="164" font-size="7" text-anchor="middle" style="fill:#fff;font-weight:800">PSI</text>`; break;
      case 'network': d = `<rect x="${L + 2}" y="66" width="7" height="182" class="m-frame"/><rect x="${R - 9}" y="66" width="7" height="182" class="m-frame"/>
        <rect x="${L + 2}" y="66" width="7" height="182" fill="url(#hz)" opacity=".55"/><rect x="${R - 9}" y="66" width="7" height="182" fill="url(#hz)" opacity=".55"/>
        <rect x="${x - 30}" y="186" width="60" height="60" class="mouth-open"/>
        <rect x="${x - 15}" y="60" width="30" height="11" rx="2" fill="#1b2f5e"/>
        <g class="hook"><path d="M${x} 71V146" stroke="#1b2f5e" stroke-width="1.4"/><path d="M${x - 6} 146h12l-3 6a4 4 0 1 1 -6 0" fill="none" stroke="#1b2f5e" stroke-width="2"/></g>
        <text x="${x}" y="182" class="m-sub">FROM OUTSIDE</text>
        <rect x="${L}" y="238" width="92" height="10" fill="#f26b1d" stroke="#1b2f5e"/>`; break;
      case 'memory': d = `<rect x="${L + 6}" y="126" width="80" height="9" class="m-frame"/><rect x="${R - 14}" y="126" width="8" height="100" class="m-frame"/>
        <rect x="${x - 30}" y="186" width="60" height="40" class="mouth-open"/>
        <g class="stamp"><rect x="${x - 3}" y="135" width="6" height="44" fill="#8b959f" stroke="#1b2f5e"/><rect x="${x - 13}" y="178" width="26" height="9" rx="1" fill="#1b2f5e"/><circle cx="${x}" cy="137" r="5" fill="#f26b1d" stroke="#1b2f5e"/></g>
        <rect x="${x + 18}" y="218" width="18" height="6" rx="1" fill="#d7262b" opacity=".75"/>
        <rect x="${L}" y="226" width="92" height="8" class="m-frame"/><rect x="${L + 6}" y="234" width="5" height="14" fill="#1b2f5e"/><rect x="${R - 11}" y="234" width="5" height="14" fill="#1b2f5e"/>`; break;
      case 'other': d = `<rect x="${x - 30}" y="186" width="60" height="40" class="mouth-open"/>
        <rect x="${L}" y="226" width="92" height="8" class="m-frame"/><rect x="${L + 6}" y="234" width="5" height="14" fill="#1b2f5e"/><rect x="${R - 11}" y="234" width="5" height="14" fill="#1b2f5e"/>
        <rect x="${x + 20}" y="196" width="20" height="30" fill="#1b2f5e"/>
        <g class="arm"><path d="M${x + 30} 198L${x + 4} 150L${x - 18} 172" fill="none" stroke="#f26b1d" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M${x + 30} 198L${x + 4} 150L${x - 18} 172" fill="none" stroke="#1b2f5e" stroke-width="1" /><circle cx="${x + 4}" cy="150" r="4" fill="#1b2f5e"/><path d="M${x - 22} 168l-4 8M${x - 16} 176l-4 6" stroke="#1b2f5e" stroke-width="2"/></g>
        <circle cx="${x + 30}" cy="198" r="5" fill="#f26b1d" stroke="#1b2f5e"/>`; break;
      case 'agents': d = `<path d="M${L} 122H${R}L${x + 20} 196H${x - 20}Z" class="m-body"/>
        <rect class="flap" x="${x - 20}" y="196" width="40" height="5" fill="#1b2f5e"/>
        <rect x="${x - 30}" y="204" width="60" height="42" class="mouth-open"/>
        <rect x="${R}" y="206" width="${1158 - R}" height="12" fill="#8b959f" stroke="#5d6771"/>
        <text x="${x}" y="150" class="m-sub" style="fill:#fff!important">SEALED</text><text x="${x}" y="160" class="m-sub" style="fill:#fff!important">CONTAINERS</text>`; break;
    }
    return `<g class="machine m-${kind}" id="mach-${kind}" data-sel="machine:${kind}" tabindex="0" role="button" aria-label="${m.name} machine for ${kindName(kind)} calls">
      ${d}
      <rect x="${L}" y="102" width="92" height="16" rx="2" class="m-plate"/>
      <circle class="lamp" cx="${L + 8}" cy="110" r="3.4"/>
      <text x="${x + 4}" y="113.5" class="m-plate-t">${m.name}</text>
      ${kind === 'network' ? '' : `<text x="${x}" y="${kind === 'agents' ? 132 : kind === 'edits' ? 133 : 131}" class="m-sub" ${kind === 'edits' || kind === 'memory' || kind === 'other' ? '' : 'style="fill:#fff!important"'}>${m.sub}</text>`}
    </g>`;
  }

  function scene() {
    const s = [];
    s.push(`<defs>
      <pattern id="hz" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#f26b1d"/><rect width="5" height="10" fill="#1b2f5e"/></pattern>
      <pattern id="hzr" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#d7262b"/><rect width="5" height="10" fill="#fff"/></pattern>
      <pattern id="speck" width="23" height="23" patternUnits="userSpaceOnUse"><circle cx="3" cy="5" r=".8" fill="#bcc1c6"/><circle cx="14" cy="11" r=".6" fill="#b4b9bf"/><circle cx="9" cy="19" r=".7" fill="#c3c7cb"/><circle cx="20" cy="3" r=".5" fill="#b9bec3"/></pattern>
      <pattern id="grain" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".9" fill="rgba(27,47,94,.22)"/><circle cx="5.5" cy="5" r=".7" fill="rgba(27,47,94,.15)"/></pattern>
      <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b"/><feFlood flood-color="#ff9a52" flood-opacity=".9"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#1b2f5e"/></marker>
      <clipPath id="siloClip"><rect x="${SILO.x}" y="${SILO.top}" width="${SILO.w}" height="${SILO.bottom - SILO.top}"/></clipPath>
    </defs>`);
    // sky, building, floors
    s.push(`<rect x="-900" y="-900" width="3000" height="944" fill="#eef2f5"/><rect x="-900" y="44" width="900" height="700" fill="#c9cdd1"/><rect x="1200" y="44" width="900" height="700" fill="#c9cdd1"/>
      <path d="M0 44V30l40-6 60 8 80-10 60 9V44z" fill="#dfe5ea"/>
      <rect x="0" y="56" width="1200" height="664" fill="var(--wall)"/><rect x="0" y="56" width="1200" height="664" fill="url(#speck)"/>
      <rect x="0" y="557" width="1200" height="163" fill="var(--base)"/><rect x="0" y="557" width="1200" height="163" fill="url(#speck)"/>
      <rect x="0" y="300" width="1200" height="14" class="slab"/><rect x="0" y="300" width="1200" height="2" fill="#9aa1a8"/>
      <rect x="0" y="545" width="1200" height="12" class="slab"/><rect x="0" y="545" width="1200" height="2" fill="#9aa1a8"/>
      <text x="18" y="72" class="floor-t">LEVEL 1 · PRODUCTION LINE</text>
      <text x="18" y="328" class="floor-t">LEVEL 0 · STORAGE</text>
      <text x="18" y="569" class="floor-t halo">BASEMENT · SUB-FACTORY ANNEX WING</text>
      <rect x="0" y="44" width="12" height="676" class="wall-side"/><rect x="1188" y="44" width="12" height="676" class="wall-side"/>
      <rect x="0" y="44" width="1200" height="8" fill="#1b2f5e"/><rect x="0" y="52" width="1200" height="4" fill="url(#hz)"/>
      <rect x="732" y="44" width="36" height="12" fill="#eef2f5"/><path d="M732 44l-8-6M768 44l8-6" stroke="#1b2f5e" stroke-width="2"/><text x="750" y="41" font-size="6.5" text-anchor="middle" style="font-weight:800;fill:#3d5791">ROOF HATCH</text>
      <rect x="0" y="158" width="12" height="90" fill="#3c4650"/><rect x="0" y="152" width="14" height="6" fill="url(#hz)"/>`);
    // sky: brand plate
    s.push(`<rect x="14" y="8" width="186" height="26" rx="2" fill="#1b2f5e"/><text x="24" y="20" font-size="9" style="fill:#fff;font-weight:800;letter-spacing:.14em">AGENTVIZ WORKS</text><text id="plateProj" x="24" y="30" font-size="7.5" style="fill:#ffb27a;font-weight:600"></text>
      <text x="212" y="17" font-size="7.5" style="font-weight:800;letter-spacing:.06em;fill:#3d5791">OUTSIDE SUPPLIERS →</text><text x="212" y="28" font-size="7" style="fill:#3d5791">web hosts · parcels fly in</text>`);
    // lower floor: QC + reject bin
    s.push(`<text x="18" y="357" class="zone-t">QC · REJECT BIN</text>
      <g id="binHit" data-sel="bin" tabindex="0" role="button" aria-label="Reject bin: all errors">
        <path d="M24 440H204L194 540H34Z" fill="#d7262b" stroke="#1b2f5e" stroke-width="1.6"/>
        <rect x="27" y="446" width="174" height="9" fill="url(#hzr)" opacity=".9"/>
        <text x="114" y="478" font-size="10" text-anchor="middle" style="fill:#fff;font-weight:900;letter-spacing:.14em">REJECT BIN</text>
      </g>
      <path d="M196 314v40" stroke="#1b2f5e" stroke-width="2"/><rect x="186" y="324" width="34" height="5" fill="url(#hzr)"/><text x="203" y="321" font-size="6.5" text-anchor="middle" style="font-weight:900;fill:#d7262b">QC</text>`);
    // warehouse frame
    s.push(`<text x="354" y="357" class="zone-t">WAREHOUSE · ONE SHELF PER FILE</text><text x="702" y="357" font-size="7" text-anchor="end" style="fill:#3d5791">glow = edited 3+ times</text>
      <rect x="350" y="360" width="352" height="184" class="zone"/>`);
    // printer
    s.push(`<g data-sel="terminal" tabindex="0" role="button" aria-label="Terminal printer: commands and exit codes">
        <rect x="710" y="362" width="78" height="30" rx="3" fill="#f26b1d" stroke="#1b2f5e" stroke-width="1.5"/>
        <rect x="718" y="368" width="34" height="9" fill="#1b2f5e"/><text x="735" y="375" font-size="6" text-anchor="middle" class="mono" style="fill:#8fc3ff">TTY</text>
        <circle id="printLamp" cx="776" cy="372" r="3" fill="#9aa3ab" stroke="#1b2f5e"/>
        <rect x="716" y="389" width="66" height="4" fill="#1b2f5e"/>
      </g>
      <text x="710" y="357" class="zone-t">TERMINAL</text>`);
    // production board
    s.push(`<text x="800" y="357" class="zone-t" id="boardTitle">PRODUCTION BOARD</text>
      <g data-sel="plan" tabindex="0" role="button" aria-label="Production board: the task list">
        <rect x="798" y="362" width="202" height="180" fill="#f7f5ee" stroke="#1b2f5e" stroke-width="1.4"/>
        <path d="M865.3 364V540M932.6 364V540" stroke="#8193bd" stroke-dasharray="3 2"/>
        <text x="831" y="373" font-size="7" text-anchor="middle" style="font-weight:800;letter-spacing:.08em">QUEUED</text>
        <text x="899" y="373" font-size="7" text-anchor="middle" style="font-weight:800;letter-spacing:.08em;fill:#f26b1d">ON THE LINE</text>
        <text x="966" y="373" font-size="7" text-anchor="middle" style="font-weight:800;letter-spacing:.08em">DONE</text>
      </g>`);
    // shipping dock
    s.push(`<text x="1008" y="357" class="zone-t">SHIPPING DOCK · REPLY</text>
      <g data-sel="dock" tabindex="0" role="button" aria-label="Shipping dock: replies to the user">
        <rect x="1006" y="362" width="146" height="182" fill="rgba(255,255,255,.3)" stroke="#1b2f5e" stroke-dasharray="4 3"/>
        <rect x="1114" y="372" width="36" height="158" fill="#c3c8cd" stroke="#1b2f5e"/>
        <path d="M1114 384h36M1114 396h36M1114 408h36M1114 420h36M1114 432h36M1114 444h36M1114 456h36" stroke="#8b959f"/>
        <rect x="1114" y="372" width="36" height="7" fill="url(#hz)"/>
        <text x="1132" y="520" font-size="7" text-anchor="middle" style="font-weight:800">OUT →</text>
        <rect x="1006" y="530" width="146" height="14" fill="#8b959f" stroke="#5d6771"/>
      </g>`);
    // basement side line and shaft
    s.push(`<rect x="14" y="584" width="1172" height="6" class="belt"/><path d="M14 585H1186" class="belt-run belt-rev"/>
      <rect x="1160" y="262" width="26" height="326" fill="#c3c8cd" stroke="#1b2f5e"/><rect x="1160" y="262" width="4" height="326" fill="url(#hz)"/><rect x="1182" y="262" width="4" height="326" fill="url(#hz)"/>
      <text x="1173" y="420" font-size="7" text-anchor="middle" transform="rotate(90 1173 420)" style="font-weight:800;letter-spacing:.12em">SIDE LINE ↓ TO ANNEX WING</text>`);
    // overhead return rail (level 0 ceiling)
    let hangers = ''; for (let x = 240; x <= 1150; x += 70) hangers += `<path d="M${x} 314V344" class="hanger"/>`;
    s.push(`${hangers}<path d="M214 345H1158" class="rail"/><path d="M214 343H1158" class="belt-run" style="stroke-width:1.4"/>`);
    // silo (spans both floors)
    let bands = ''; for (let y = 160; y < 498; y += 56) bands += `<path d="M228 ${y}H328" class="silo-band"/>`;
    s.push(`<g id="silo" data-sel="context" tabindex="0" role="button" aria-label="Context silo: the context window">
        <path d="M228 102L278 72L328 102V540H228Z" class="silo-shell"/>
        <rect x="${SILO.x}" y="${SILO.top}" width="${SILO.w}" height="${SILO.bottom - SILO.top}" fill="#f5f6f7"/>
        <g clip-path="url(#siloClip)"><rect id="siloFill" x="${SILO.x}" y="${SILO.top}" width="${SILO.w}" height="${SILO.bottom - SILO.top}"/><rect x="${SILO.x}" y="${SILO.top}" width="${SILO.w}" height="${SILO.bottom - SILO.top}" fill="url(#grain)"/></g>
        ${bands}
        <path d="M228 ${SILO.bottom - 0.7 * (SILO.bottom - SILO.top)}H328" class="th-line" stroke="#f0a316"/><text x="231" y="${SILO.bottom - 0.7 * (SILO.bottom - SILO.top) - 2}" font-size="7" style="font-weight:800;fill:#b87800">70%</text>
        <path d="M228 ${SILO.bottom - 0.9 * (SILO.bottom - SILO.top)}H328" class="th-line" stroke="#d7262b"/><text x="231" y="${SILO.bottom - 0.9 * (SILO.bottom - SILO.top) - 2}" font-size="7" style="font-weight:800;fill:#d7262b">90%</text>
        <path d="M228 498H328" stroke="#1b2f5e" stroke-width="1.4"/>
        <g id="siloRam"><rect x="276" y="60" width="4" height="46" fill="#5d6771"/><rect x="236" y="104" width="84" height="12" fill="#1b2f5e"/><path d="M236 116h84" stroke="#f26b1d" stroke-width="2"/></g>
        <rect id="siloHatch" x="262" y="538" width="32" height="5" fill="#f26b1d" stroke="#1b2f5e"/>
        <rect x="246" y="80" width="64" height="13" rx="2" fill="#1b2f5e"/><text x="278" y="89.5" font-size="7.5" text-anchor="middle" style="fill:#fff;font-weight:800;letter-spacing:.08em">CONTEXT SILO</text>
      </g>`);
    // bucket elevator into the silo top
    s.push(`<path d="M336 346V86M346 346V86" stroke="#5d6771" stroke-width="1.4"/><path d="M341 346V86" class="bucket-run"/><path d="M336 86H300" stroke="#5d6771" stroke-width="1.4"/>`);
    // intake dock and dispatch office (upper floor left)
    s.push(`<text x="18" y="102" class="zone-t">INTAKE DOCK</text><rect x="14" y="238" width="90" height="10" fill="#8b959f" stroke="#5d6771"/>
      <g data-sel="office" tabindex="0" role="button" aria-label="Dispatch office: the model and session">
        <rect x="108" y="96" width="112" height="152" fill="#f4f6f8" stroke="#1b2f5e" stroke-width="1.6"/>
        <rect x="108" y="96" width="112" height="15" fill="#1b2f5e"/><text x="164" y="106.5" font-size="7.5" text-anchor="middle" style="fill:#fff;font-weight:800;letter-spacing:.1em">DISPATCH OFFICE</text>
        <rect x="116" y="118" width="96" height="40" fill="#cfe3f5" stroke="#1b2f5e"/><path d="M164 118v40" stroke="#1b2f5e"/>
      </g>`);
    // chimney for the furnace (behind the machines)
    s.push(`<g id="chimney"><rect x="649" y="6" width="14" height="114" fill="#8b959f" stroke="#1b2f5e"/><rect x="646" y="4" width="20" height="5" fill="#1b2f5e"/><rect x="649" y="44" width="14" height="12" fill="#5d6771"/>
      <g class="smoke"><circle cx="656" cy="2" r="4" fill="#b8bfc6"/><circle cx="656" cy="2" r="5" fill="#c6ccd2"/><circle cx="656" cy="2" r="3.5" fill="#b0b8c0"/></g></g>`);
    // machines
    for (const kind of ['files', 'edits', 'shell', 'network', 'memory', 'other', 'agents']) s.push(machineSvg(kind));
    // gantry rail
    s.push(`<path d="M300 66H1186" class="rail"/><path d="M300 64H1186" stroke="#8b959f" stroke-width="1"/>`);
    for (let x = 320; x < 1186; x += 110) s.push(`<path d="M${x} 56V66" class="hanger"/>`);
    // main belt (passes in front of the silo)
    let rollers = ''; for (let x = 228; x < 1184; x += 24) rollers += `<circle cx="${x}" cy="256" r="2.4" class="roller"/>`;
    s.push(`<rect x="214" y="250" width="972" height="11" rx="3" class="belt"/>${rollers}<path d="M216 251H1184" class="belt-run"/>`);
    // dynamic layers
    s.push('<g id="g-hosts"></g><g id="g-intake"></g><g id="g-office"></g><g id="g-silo"></g><g id="g-mlabels"></g><g id="g-bin"></g><g id="g-shelves"></g><g id="g-printer"></g><g id="g-board"></g><g id="g-dock"></g><g id="g-annex"></g><g id="g-parked"></g><g id="g-links"></g><g id="g-items"></g><g id="g-fx"></g>');
    return s.join('\n');
  }

  const floor = $('floor');
  floor.innerHTML = scene();
  const layer = id => $(id);

  // ---------- render cache ----------
  const cache = {};
  function setG(id, html) { if (cache[id] === html) return; cache[id] = html; layer(id).innerHTML = html; }

  // ---------- derived facts ----------
  function lastRecordTime() {
    let t = S.session.startedAt;
    for (let i = S.calls.length - 1; i >= Math.max(0, S.calls.length - 5); i--) { const c = S.calls[i]; t = Math.max(t, c.endedAt || c.startedAt); }
    const m = S.markers[S.markers.length - 1]; if (m) t = Math.max(t, m.time);
    return t;
  }
  function sessionStatus() {
    if (S.session.status === 'complete') return { key: 'complete', text: 'turn complete' };
    return S.now - lastRecordTime() < 15000 ? { key: 'active', text: 'recent activity' } : { key: 'quiet', text: 'quiet' };
  }
  const running = () => S.calls.filter(c => c.status === 'running');
  function activeCall() { const r = running(); return r.find(c => c.lane === 'main') || r[r.length - 1] || null; }
  function errorsTotal() { const out = {}; for (const e of S.errors) out[e.kind] = (out[e.kind] || 0) + 1; return out; }
  function aftermath(c) {
    const retries = S.calls.filter(x => x.retryOf === c.id);
    const follow = S.calls.filter(x => x.causedBy === c.id && x.retryOf !== c.id);
    const fixedBy = retries.find(x => x.status === 'success');
    let verdict;
    if (fixedBy) verdict = `Fixed by attempt ${fixedBy.attempt} (${fixedBy.id})`;
    else if (retries.some(x => x.status === 'running')) verdict = 'Retry running now';
    else if (retries.length) verdict = 'Retry also failed';
    else {
      const later = c.target && S.calls.find(x => x.startedAt > c.startedAt && x.kind === c.kind && x.lane === c.lane && x.target && x.target.value === c.target.value && x.status === 'success');
      verdict = later ? `Same work later succeeded (${later.id})` : follow.length ? 'Follow-up work, no retry' : 'Open: no retry yet';
    }
    return { retries, follow, fixedBy, verdict, fixed: Boolean(fixedBy) || /succeeded/.test(verdict) };
  }
  const prompts = () => S.markers.filter(m => m.kind === 'prompt');

  // ---------- dynamic renders ----------
  function renderHosts() {
    const counts = {};
    for (const c of S.calls) for (const h of c.flow) if (h.from.startsWith('web:') || h.from.startsWith('mcp:')) { const e = counts[h.from] || (counts[h.from] = { n: 0, err: 0 }); e.n++; }
    for (const c of S.errors) if (c.kind === 'network' || c.kind === 'other') { const id = hostIdForCall(c); if (id) (counts[id] || (counts[id] = { n: 0, err: 0 })).err++; }
    setG('g-hosts', hostList().map(n => {
      const p = hostPos(n.id); const e = counts[n.id] || { n: 0, err: 0 }; const w = 120;
      return `<g data-sel="host:${esc(n.id)}" tabindex="0" role="button" aria-label="Supplier ${esc(n.label)}: ${e.n} deliveries">
        <rect x="${p.x - w / 2}" y="6" width="${w}" height="28" rx="2" fill="#fff" stroke="#1b2f5e"/>
        <rect x="${p.x - w / 2}" y="6" width="4" height="28" fill="${n.id.startsWith('mcp') ? KCOL.other : KCOL.network}"/>
        <text x="${p.x - w / 2 + 8}" y="17" font-size="7.5" style="font-weight:700">${esc(trunc(n.label, 24))}</text>
        <text x="${p.x - w / 2 + 8}" y="28" font-size="7">${e.n} deliveries${e.err ? ` · <tspan style="fill:#d7262b;font-weight:800">✖ ${e.err}</tspan>` : ''}</text>
      </g>`;
    }).join(''));
  }
  function hostIdForCall(c) {
    if (c.kind === 'other') return 'mcp:github';
    if (c.target && c.target.type === 'url') { try { return `web:${new URL(c.target.value).host}`; } catch (e) { return null; } }
    return null;
  }

  function renderIntake() {
    const p = prompts().slice(-1)[0];
    const lines = wrap(p ? p.detail.text : 'Waiting for a work order', 17, 4);
    setG('g-intake', `<g data-sel="intake" tabindex="0" role="button" aria-label="Intake dock: user prompts">
      <rect x="18" y="108" width="84" height="98" fill="#fff" stroke="#1b2f5e" stroke-width="1.3"/>
      <rect x="18" y="108" width="84" height="14" fill="#f26b1d"/>
      <text x="22" y="118" font-size="7.5" style="fill:#fff;font-weight:800;letter-spacing:.06em">WORK ORDER T${S.session.turn}</text>
      ${lines.map((l, i) => `<text x="22" y="${134 + i * 11}" font-size="7.6">${esc(l)}</text>`).join('')}
      <text x="22" y="200" font-size="6.8" style="fill:#3d5791">${p ? `${hms(p.time)} · ${p.detail.tokens} tok` : ''}</text>
      <path d="M50 206v8" stroke="#1b2f5e"/>
    </g>`);
  }

  function renderOffice() {
    const st = sessionStatus(); const a = activeCall();
    const lamp = st.key === 'active' ? '#f26b1d' : st.key === 'complete' ? '#1b2f5e' : '#9aa3ab';
    setG('g-office', `<g pointer-events="none">
      <circle cx="140" cy="138" r="9" fill="#fff" stroke="#1b2f5e"/><path d="M134 146q6-12 12 0" fill="#1b2f5e"/><circle cx="140" cy="134" r="3.5" fill="#1b2f5e"/>
      <rect x="170" y="124" width="36" height="28" fill="#1b2f5e"/><path d="M174 132h20M174 138h26M174 144h14" stroke="#8fc3ff" stroke-width="1.6"/>
      <circle cx="${206}" cy="${172}" r="5" fill="${lamp}" stroke="#1b2f5e" class="${st.key === 'active' ? 'lamp-run' : ''}"/>
      <text x="114" y="175" font-size="7.5" style="font-weight:800">MODEL</text>
      <text x="114" y="186" font-size="7.5">${esc(S.session.model.replace('claude-', ''))}</text>
      <text x="114" y="198" font-size="7.5">turn ${S.session.turn} · ${esc(st.text)}</text>
      <text x="114" y="210" font-size="7" style="fill:#3d5791">${a ? `sending: ${esc(trunc(a.tool, 16))}` : 'no call on the line'}</text>
      <text x="114" y="222" font-size="7" style="fill:#3d5791">in ${tok(S.tokens.input)} · out ${tok(S.tokens.output)}</text>
    </g>`);
  }

  function renderSilo() {
    const p = S.context.percent; const cls = pctClass(p);
    const fill = $('siloFill');
    fill.style.transform = `scaleY(${Math.max(0.002, Math.min(1, p / 100))})`;
    fill.setAttribute('class', cls);
    const top = siloTop();
    const sacks = S.context.files.map((f, i) => {
      const x = 236 + i * 21.5; const short = base(f.path).replace('.md', '');
      return `<g transform="translate(${x},502)"><title>${esc(f.path)} · ${f.tokens} tok · ${esc(f.why)}</title><path d="M2 34q-3-18 3-27l-2-5h14l-2 5q6 9 3 27z" fill="#e8dcc2" stroke="#1b2f5e" stroke-width=".9"/><path d="M5 7h10" stroke="#a8703d" stroke-width="1.6"/><text x="10" y="22" font-size="5.6" text-anchor="middle" style="font-weight:800">${esc(trunc(short.toUpperCase(), 7))}</text><text x="10" y="29" font-size="5" text-anchor="middle">${tok(f.tokens)}</text></g>`;
    }).join('');
    const col = cls === 'crit' ? '#d7262b' : cls === 'warn' ? '#b87800' : '#1b2f5e';
    setG('g-silo', `<g pointer-events="none">
      <path d="M${SILO.x} ${top}H${SILO.x + SILO.w}" stroke="${col}" stroke-width="1.6"/>
      <text x="278" y="168" font-size="22" text-anchor="middle" class="halo" style="font-weight:900;fill:${col}">${p.toFixed(0)}%</text>
      <text x="278" y="181" font-size="7.5" text-anchor="middle" class="halo">${tok(S.context.used)} / ${tok(S.context.capacity)} tok</text>
      <text x="278" y="192" font-size="7.5" text-anchor="middle" class="halo" style="font-weight:700;fill:${col}">${cls === 'crit' ? '✖ CRITICAL ≥90%' : cls === 'warn' ? '⚠ WARNING ≥70%' : 'level ok'}</text>
      <text x="278" y="236" font-size="7" text-anchor="middle" class="halo">⇣ ${S.context.compactions} compaction${S.context.compactions === 1 ? '' : 's'}</text>
      ${sacks}
    </g>`);
  }

  function renderMachineLabels() {
    const since = sim.errorsSincePrompt(); const act = new Set(running().filter(c => c.lane === 'main').map(c => c.kind));
    for (const id of parked.keys()) { const c = callById(id); if (c && c.lane === 'main') act.add(c.kind); }
    for (const k of KINDS) { const el = $(`mach-${k}`); if (el) el.classList.toggle('active', act.has(k)); }
    $('chimney').classList.toggle('shell-hot', act.has('shell'));
    setG('g-mlabels', KINDS.map(k => {
      const x = MACH[k].x; const e = since[k] || 0;
      return `<g pointer-events="none"><text x="${x}" y="276" font-size="8.5" text-anchor="middle" style="font-weight:800">${S.counts[k]} ${kindName(k).toLowerCase()}</text>
        ${e ? `<rect x="${x - 34}" y="281" width="68" height="12" rx="2" fill="#d7262b"/><text x="${x}" y="290" font-size="7.5" text-anchor="middle" style="fill:#fff;font-weight:800">✖ ${e} since prompt</text>` : `<text x="${x}" y="290" font-size="7" text-anchor="middle" style="fill:#3d5791">no rejects since prompt</text>`}</g>`;
    }).join(''));
  }

  const pendingBin = new Set();
  function renderBin() {
    const errs = S.errors.filter(e => !pendingBin.has(e.id));
    const tags = errs.slice(-8).reverse();
    const tagSvg = tags.map((e, i) => {
      const x = 18 + (i % 4) * 49; const y = 364 + Math.floor(i / 4) * 30; const after = aftermath(e);
      return `<g data-sel="error:${e.id}" tabindex="0" role="button" aria-label="Error ${esc(e.error.code)} on ${esc(e.tool)}">
        <path d="M${x + 22} ${y - 4}V${y}" stroke="#1b2f5e"/>
        <rect x="${x}" y="${y}" width="46" height="25" rx="2" fill="#fff" stroke="#d7262b" stroke-width="1.6" transform="rotate(${(i % 3) - 1} ${x + 23} ${y})"/>
        <text x="${x + 23}" y="${y + 9.5}" font-size="7.6" text-anchor="middle" style="font-weight:900;fill:#d7262b">✖ ${esc(trunc(e.error.code, 10))}</text>
        <text x="${x + 23}" y="${y + 17}" font-size="6.2" text-anchor="middle">${esc(trunc(e.tool, 12))} · ${e.id}</text>
        <text x="${x + 23}" y="${y + 23.2}" font-size="5.8" text-anchor="middle" style="font-weight:700;fill:${after.fixed ? '#1b2f5e' : after.retries.length ? '#b87800' : '#d7262b'}">${after.fixed ? '✔ fixed' : after.retries.some(r => r.status === 'running') ? '↻ retrying' : 'open'}</text>
      </g>`;
    }).join('');
    const pile = errs.slice(-7).map((e, i) => `<g transform="translate(${46 + i * 22},${436 - (i % 2) * 4}) rotate(${(i * 23) % 40 - 20}) scale(.7)">${shape(e.kind, { err: true })}</g>`).join('');
    const since = sim.errorsSincePrompt(); const sinceN = Object.values(since).reduce((a, b) => a + b, 0);
    setG('g-bin', `<path d="M18 360H214" stroke="#1b2f5e" stroke-width="1.5"/>${tagSvg}<g pointer-events="none">${pile}
      <text x="114" y="500" font-size="20" text-anchor="middle" style="fill:#fff;font-weight:900">${errs.length}</text>
      <text x="114" y="514" font-size="8" text-anchor="middle" style="fill:#fff;font-weight:700">rejected · ${sinceN} since prompt</text></g>`);
  }

  const shelfFlash = new Map();
  function renderShelves() {
    const files = fileList();
    setG('g-shelves', files.slice(0, 20).map((path, i) => {
      const x = SLOT.x0 + (i % 4) * SLOT.w; const y = SLOT.y0 + Math.floor(i / 4) * SLOT.h;
      const f = S.files[path] || { reads: 0, edits: 0, failed: 0, added: 0, removed: 0 };
      const hot = f.edits >= 3; const fresh = (shelfFlash.get(path) || 0) > performance.now();
      let icons = ''; let ix = x + 4;
      for (let n = 0; n < Math.min(f.reads, 4); n++, ix += 8) icons += `<rect x="${ix}" y="${y + 24}" width="7" height="6" fill="${KCOL.files}" stroke="#1b2f5e" stroke-width=".6"/>`;
      for (let n = 0; n < Math.min(f.edits, 4); n++, ix += 8) icons += `<rect x="${ix}" y="${y + 23}" width="7" height="7" fill="${KCOL.edits}" stroke="#1b2f5e" stroke-width=".6"/><path d="M${ix} ${y + 30}l7-7" stroke="#1b2f5e" stroke-width=".5"/>`;
      for (let n = 0; n < Math.min(f.failed, 2); n++, ix += 8) icons += `<rect x="${ix}" y="${y + 24}" width="7" height="6" fill="#fff" stroke="#d7262b"/><path d="M${ix + 1} ${y + 25}l5 4M${ix + 6} ${y + 25}l-5 4" stroke="#d7262b" stroke-width="1.1"/>`;
      return `<g class="shelf ${hot ? 'hot' : ''} ${fresh ? 'fresh' : ''}" data-sel="file:${esc(path)}" tabindex="0" role="button" aria-label="Shelf ${esc(path)}: ${f.reads} reads, ${f.edits} edits, ${f.failed} failed${hot ? ', hot' : ''}">
        <rect x="${x}" y="${y}" width="83" height="33" class="shelf-bg"/>
        <title>${esc(path)}</title>
        <text x="${x + 3}" y="${y + 9}" class="shelf-name">${esc(trunc(base(path), 17))}</text>
        <text x="${x + 3}" y="${y + 18}" class="shelf-meta">${f.reads} read · ${f.edits} edit${f.failed ? ` · <tspan style="fill:#d7262b;font-weight:800">✖${f.failed}</tspan>` : ''}</text>
        ${f.added || f.removed ? `<text x="${x + 80}" y="${y + 29}" class="shelf-meta" text-anchor="end"><tspan style="fill:#1d6b3a">+${f.added}</tspan> <tspan style="fill:#d7262b">−${f.removed}</tspan></text>` : ''}
        ${hot ? `<rect x="${x + 59}" y="${y + 2}" width="22" height="9" rx="1" fill="#f26b1d"/><text x="${x + 70}" y="${y + 9}" font-size="6.5" text-anchor="middle" style="fill:#fff;font-weight:900">HOT</text>` : ''}
        ${icons}
        <rect x="${x}" y="${y + 31}" width="83" height="2.5" fill="#5d6771"/>
      </g>`;
    }).join('') + (files.length > 20 ? `<text x="700" y="541" font-size="7" text-anchor="end">+${files.length - 20} more files</text>` : ''));
  }

  function renderPrinter() {
    const shells = S.calls.filter(c => c.kind === 'shell');
    const recent = shells.slice(-8).reverse();
    const runningNow = recent.some(c => c.status === 'running');
    $('printLamp').setAttribute('fill', runningNow ? '#ffd23f' : '#9aa3ab');
    const tape = recent.map((c, i) => {
      const y = 404 + i * 17; const cmd = c.target ? c.target.value : c.tool;
      const st = c.status === 'running' ? '<tspan style="fill:#f26b1d;font-weight:800">▶ run</tspan>' : c.status === 'error' ? `<tspan style="fill:#d7262b;font-weight:900">✖ ${esc(c.error.code)}</tspan>` : '<tspan style="fill:#1b2f5e">✔ 0</tspan>';
      return `<g data-sel="call:${c.id}"><text x="722" y="${y}" font-size="6.6" class="mono">$ ${esc(trunc(cmd, 17))}</text><text x="778" y="${y + 8}" font-size="6.6" text-anchor="end" class="mono">${c.lane !== 'main' ? '<tspan style="fill:#6d8234">annex </tspan>' : ''}${st}</text></g>`;
    }).join('');
    const h = Math.min(146, 8 + recent.length * 17);
    setG('g-printer', `<path d="M719 393h60v${h}l-5 3-5-3-5 3-5-3-5 3-5-3-5 3-5-3-5 3-5-3-5 3-5-3-5 3z" fill="#fff" stroke="#1b2f5e" stroke-width=".8"/>${tape}`);
  }

  // production board: persistent cards so they can slide between columns
  const cards = new Map();
  function renderBoard() {
    const items = S.tasks.items; const g = layer('g-board');
    const done = items.filter(t => t.status === 'completed').length;
    $('boardTitle').textContent = `PRODUCTION BOARD · ${done}/${items.length} DONE`;
    const cols = { pending: [], in_progress: [], completed: [] };
    for (const t of items) (cols[t.status] || cols.pending).push(t);
    const seen = new Set();
    Object.entries(cols).forEach(([status, list], ci) => list.forEach((t, ri) => {
      seen.add(t.id);
      let el = cards.get(t.id);
      if (!el) { el = document.createElementNS(NS, 'g'); el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); g.appendChild(el); cards.set(t.id, el); el.style.transform = `translate(${801 + ci * 67.3}px, ${380 + ri * 32}px)`; }
      el.setAttribute('class', `card st-${t.status}`);
      el.setAttribute('data-sel', `task:${t.id}`);
      el.setAttribute('aria-label', `Task ${t.id}: ${t.label}, ${t.status}`);
      el.style.transform = `translate(${801 + ci * 67.3}px, ${380 + Math.min(ri, 4) * 32}px)`;
      const lines = wrap(t.label, 15, 2);
      const mark = t.status === 'completed' ? '<text x="56" y="9" font-size="8" text-anchor="end" style="font-weight:900">✔</text>' : t.status === 'in_progress' ? '<text x="56" y="9" font-size="8" text-anchor="end" style="font-weight:900;fill:#f26b1d">▶</text>' : '';
      const html = `<rect class="card-bg" width="62" height="29" rx="1.5"/><rect width="62" height="3" fill="${KCOL.memory}"/><text x="3" y="10" style="font-weight:800">#${esc(t.id)}</text>${mark}${lines.map((l, i) => `<text x="3" y="${18 + i * 8}">${esc(l)}</text>`).join('')}`;
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
    }));
    for (const [id, el] of cards) if (!seen.has(id)) { el.remove(); cards.delete(id); }
  }

  function renderDock() {
    const turns = S.markers.filter(m => m.kind === 'turn-complete');
    const shown = turns.slice(-8);
    const crates = shown.map((m, i) => {
      const x = 1012 + (i % 4) * 25; const y = 506 - Math.floor(i / 4) * 24;
      return `<g transform="translate(${x},${y})"><rect width="23" height="22" fill="#f6efe0" stroke="#1b2f5e"/><path d="M0 7h23M0 15h23" stroke="#a8703d" stroke-width=".7"/><text x="11.5" y="13.5" font-size="7" text-anchor="middle" style="font-weight:900">T${m.detail.turn}</text></g>`;
    }).join('');
    const st = sessionStatus();
    setG('g-dock', `<g pointer-events="none">${crates}
      <text x="1012" y="376" font-size="7.5" style="font-weight:700">${turns.length} replies shipped</text>
      <text x="1012" y="387" font-size="7" style="fill:#3d5791">${st.key === 'complete' ? 'turn complete · reply sent' : 'turn in progress'}</text>
      ${turns.length ? `<text x="1012" y="398" font-size="7" style="fill:#3d5791">last ${hms(turns[turns.length - 1].time)}</text>` : ''}</g>`);
  }

  function renderAnnexes() {
    const { map, hidden, total } = annexLayout();
    let out = '';
    if (!total) out += `<text x="300" y="640" font-size="9" style="fill:#3d5791">No subagent annexes yet: a sealed container from the dispatch chute opens one.</text>`;
    for (const [key, a] of map) {
      const l = a.lane; const calls = S.calls.filter(c => c.lane === key);
      const st = l.state; const runningNow = calls.some(c => c.status === 'running');
      const lamp = st === 'running' ? `<circle cx="${a.x + a.w - 11}" cy="${a.y + 11}" r="5" fill="#f26b1d" stroke="#1b2f5e" class="lamp-run"/>` : st === 'failed' ? `<text x="${a.x + a.w - 6}" y="${a.y + 14}" font-size="9" text-anchor="end" style="fill:#d7262b;font-weight:900">✖ FAILED</text>` : `<text x="${a.x + a.w - 6}" y="${a.y + 14}" font-size="8" text-anchor="end" style="font-weight:900">✔ DONE</text>`;
      const minis = calls.slice(-9).map((c, i) => `<g data-sel="call:${c.id}" transform="translate(${a.x + 16 + i * 17},${a.y + 38}) scale(.5)"><title>${esc(c.tool)} ${esc(c.label)} · ${c.status}</title>${shape(c.kind, { err: c.status === 'error' })}</g>`).join('');
      out += `<g class="annex state-${st}" data-sel="lane:${key}" tabindex="0" role="button" aria-label="Annex ${esc(l.label)}, ${st}">
        <rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" rx="2" class="annex-bg"/>
        <rect x="${a.x}" y="${a.y}" width="${a.w}" height="3" fill="url(#hz)"/>
        ${l.depth > 1 ? `<path d="M${a.x + 6} ${a.y}V${a.y - 8}" stroke="#1b2f5e" stroke-width="2" stroke-dasharray="2 2"/>` : `<path d="M${a.x + 22} ${a.y}V${590}" stroke="#5d6771" stroke-width="3"/>`}
        <text x="${a.x + 6}" y="${a.y + 13}" font-size="8" style="font-weight:800">${l.depth > 1 ? '↳ ' : ''}ANNEX · ${esc(trunc(l.label, 20))}</text>
        <text x="${a.x + 6}" y="${a.y + 23}" font-size="6.8" style="fill:#3d5791">${esc(l.agentType)} · ${esc(l.model.replace('claude-', ''))} · depth ${l.depth} · ${l.calls} calls · <tspan style="${l.errors ? 'fill:#d7262b;font-weight:800' : ''}">✖ ${l.errors}</tspan> · ${tok(l.tokens)} tok</text>
        ${lamp}
        <rect x="${a.x + 6}" y="${a.y + 46}" width="${a.w - 12}" height="4" fill="#8b959f"/>
        <rect x="${a.x + a.w - 46}" y="${a.y + 27}" width="24" height="19" fill="${runningNow ? '#f26b1d' : '#c99a7a'}" stroke="#1b2f5e"/><text x="${a.x + a.w - 34}" y="${a.y + 39}" font-size="5.5" text-anchor="middle" style="fill:#fff;font-weight:800">MINI</text>
        ${minis}
        ${a.more ? `<text x="${a.x + a.w - 6}" y="${a.y + a.h - 3}" font-size="6.5" text-anchor="end">+${a.more} more nested</text>` : ''}
      </g>`;
    }
    if (hidden > 0) out += `<g data-sel="lanes" tabindex="0" role="button" aria-label="All annexes"><rect x="1050" y="563" width="104" height="13" rx="2" fill="#1b2f5e"/><text x="1102" y="572.5" font-size="7.2" text-anchor="middle" style="fill:#fff;font-weight:700">+${hidden} earlier annexes ▸</text></g>`;
    else if (total) out += `<g data-sel="lanes" tabindex="0" role="button" aria-label="All annexes"><rect x="1080" y="563" width="74" height="13" rx="2" fill="#1b2f5e"/><text x="1117" y="572.5" font-size="7.2" text-anchor="middle" style="fill:#fff;font-weight:700">all lanes ▸</text></g>`;
    setG('g-annex', out);
  }

  // parked items: a call that is inside its machine right now
  const parked = new Map();
  function park(call) {
    if (parked.has(call.id) || call.status !== 'running') return;
    const d = resolve(`tool:${call.kind}`, call, 'to');
    const sub = call.lane !== 'main';
    const el = document.createElementNS(NS, 'g');
    el.setAttribute('class', 'parked');
    el.setAttribute('data-sel', `call:${call.id}`);
    el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${call.tool} in process`);
    el.setAttribute('transform', `translate(${d.x},${d.y})`);
    el.innerHTML = `<g transform="scale(${sub ? 0.55 : 1})">${shape(call.kind, { retry: call.attempt > 1 ? call.attempt : 0 })}</g>${sub ? '' : `<g class="proc-tag" transform="translate(0,-26)"><rect x="-24" y="-6" width="48" height="10" rx="1" fill="#f26b1d" stroke="#1b2f5e" stroke-width=".6"/><text y="1.6" font-size="6.4" text-anchor="middle" style="fill:#fff;font-weight:900">IN PROCESS</text></g>`}`;
    layer('g-parked').appendChild(el);
    parked.set(call.id, el);
    dirty = true;
  }
  function unpark(call) { const el = parked.get(call.id); if (el) { el.remove(); parked.delete(call.id); dirty = true; } }

  // ---------- flights ----------
  const flights = new Set();
  function fly(markup, pts, opts = {}) {
    return new Promise(resolveFn => {
      if (flights.size > 70 || document.hidden || pts.length < 2) return resolveFn();
      const el = document.createElementNS(NS, 'g');
      el.setAttribute('class', 'item');
      if (opts.sel) el.setAttribute('data-sel', opts.sel);
      el.innerHTML = markup;
      layer('g-items').appendChild(el);
      const lens = []; let total = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
      let v = reduce ? 6 : (opts.v || 0.9);
      if (!reduce && total / v > 1800) v = total / 1800;
      const f = { el, pts, lens, total, d: 0, v, resolve: resolveFn, sky: opts.sky, scale: opts.scale || 1 };
      if (f.sky) { f.drone = el.querySelector('.drone'); f.cable = el.querySelector('.cable'); f.trolley = el.querySelector('.trolley'); }
      flights.add(f); place(f);
    });
  }
  function place(f) {
    let d = Math.min(f.d, f.total); let i = 0;
    while (i < f.lens.length - 1 && d > f.lens[i]) { d -= f.lens[i]; i++; }
    const a = f.pts[i]; const b = f.pts[i + 1] || a; const t = f.lens[i] ? Math.min(1, d / f.lens[i]) : 1;
    const x = a[0] + (b[0] - a[0]) * t; const y = a[1] + (b[1] - a[1]) * t;
    f.el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    if (f.sky) {
      const inSky = y < 58;
      f.drone.setAttribute('visibility', inSky ? 'visible' : 'hidden');
      f.trolley.setAttribute('visibility', inSky ? 'hidden' : 'visible');
      f.cable.setAttribute('visibility', inSky ? 'hidden' : 'visible');
      if (!inSky) { f.trolley.setAttribute('y', (62 - y).toFixed(1)); f.cable.setAttribute('y1', (66 - y).toFixed(1)); f.cable.setAttribute('y2', (-8 * f.scale).toFixed(1)); }
    }
  }
  function itemMarkup(kind, scale, o = {}) {
    let s = '';
    if (o.sky) s += `<line class="cable" x1="0" x2="0" y1="0" y2="0" stroke="#1b2f5e" stroke-width="1.2"/><rect class="trolley" x="-10" y="0" width="20" height="8" fill="#1b2f5e"/>
      <g class="drone"><path d="M-14 -${10 * scale + 8}h28" stroke="#1b2f5e" stroke-width="2"/><ellipse class="rotor" cx="-14" cy="-${10 * scale + 10}" rx="7" ry="1.6" fill="#5d6771"/><ellipse class="rotor" cx="14" cy="-${10 * scale + 10}" rx="7" ry="1.6" fill="#5d6771"/><rect x="-5" y="-${10 * scale + 10}" width="10" height="5" rx="2" fill="#f26b1d" stroke="#1b2f5e"/><path d="M-3 -${10 * scale + 5}L0 -${9 * scale}M3 -${10 * scale + 5}L0 -${9 * scale}" stroke="#1b2f5e" stroke-width=".8"/></g>`;
    s += `<g transform="scale(${scale.toFixed(2)})">${o.custom || shape(kind, o)}</g>`;
    if (o.label) s += `<text class="item-label" y="${(13 * scale + 8).toFixed(1)}">${esc(trunc(o.label, 24))}</text>`;
    return s;
  }
  async function flyHop(call, hop, o = {}) {
    const a = o.fromDesc || resolve(hop.from, call, 'from');
    const b = resolve(hop.to, call, 'to');
    const pts = route(a, b);
    const sub = call.lane !== 'main' && (a.annex || b.annex);
    const sc = scaleFor(hop) * (sub && a.annex === b.annex ? 0.6 : 1);
    const sky = a.floor === 'sky' || b.floor === 'sky';
    const norm = (sc - 0.65) / 1.15;
    await fly(itemMarkup(call.kind, sc, { sky, label: hop.what + (hop.tokens ? ` · ${tok(hop.tokens)} tok` : hop.bytes ? ` · ${size(hop.bytes)}` : ''), err: o.err, retry: call.attempt > 1 ? call.attempt : 0 }), pts, { sel: `call:${call.id}`, v: 0.95 - 0.3 * norm, sky, scale: sc });
    arrive(hop.to, b);
  }
  function arrive(id, d) {
    if (id.startsWith('file:')) { shelfFlash.set(id.slice(5), performance.now() + 900); dirty = true; setTimeout(() => { dirty = true; }, 950); }
    const color = id === 'context' ? '#3d5791' : id.startsWith('file:') ? '#f26b1d' : id.startsWith('lane:') ? KCOL.agents : '#f26b1d';
    puff(d.x, d.y, color);
  }
  function puff(x, y, color) {
    if (reduce) return;
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('cx', x); el.setAttribute('cy', y); el.setAttribute('r', 8); el.setAttribute('class', 'puff'); el.setAttribute('stroke', color);
    layer('g-fx').appendChild(el); setTimeout(() => el.remove(), 800);
  }
  function stampFx(x, y, text, color) {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('text-anchor', 'middle'); el.setAttribute('class', 'stamp-fx'); el.setAttribute('style', `fill:${color}`);
    el.textContent = text; layer('g-fx').appendChild(el); setTimeout(() => el.remove(), 2500);
  }

  // per-call animation chains: start hops, then park, then end hops (in order even when the call is fast)
  const chains = new Map();
  const startHops = new Map();
  function enqueue(call, fn) {
    const p = (chains.get(call.id) || Promise.resolve()).then(fn).catch(error => setTimeout(() => { throw error; }));
    chains.set(call.id, p);
    p.then(() => { if (chains.get(call.id) === p) chains.delete(call.id); });
  }
  sim.on('start', call => {
    startHops.set(call.id, call.flow.length);
    const hops = call.flow.slice();
    enqueue(call, async () => {
      for (let i = 0; i < hops.length; i++) {
        const fromDesc = i === 0 && call.retryOf && call.lane === 'main' ? BIN : undefined;
        if (fromDesc) stampFx(BIN.x, 420, `↻ ATTEMPT ${call.attempt} back on the line`, '#b87800');
        await flyHop(call, hops[i], { fromDesc });
      }
      park(call);
    });
    dirty = true;
  });
  sim.on('end', call => {
    const n = startHops.get(call.id) ?? 0; startHops.delete(call.id);
    const hops = call.flow.slice(n);
    if (call.status === 'error') pendingBin.add(call.id);
    enqueue(call, async () => {
      unpark(call);
      if (call.status === 'error') {
        const d = resolve(`tool:${call.kind}`, call, 'to');
        stampFx(d.x, d.y - 34, `✖ QC REJECT ${call.error.code}`, '#d7262b');
        if (call.lane === 'main') await fly(itemMarkup(call.kind, 1, { err: true, label: `${call.error.code} → reject bin` }), route(d, BIN), { sel: `error:${call.id}`, v: 0.8 });
        pendingBin.delete(call.id); dirty = true;
        puff(BIN.x, BIN.y - 40, '#d7262b');
      }
      for (const hop of hops) await flyHop(call, hop, { err: call.status === 'error' });
      dirty = true;
    });
    dirty = true;
  });
  sim.on('marker', m => {
    if (m.kind === 'prompt') {
      fly(itemMarkup('memory', 1.1, { custom: '<rect x="-11" y="-8" width="22" height="16" fill="#fff" stroke="#1b2f5e" stroke-width="1.3"/><rect x="-11" y="-8" width="22" height="5" fill="#f26b1d"/><path d="M-7 0h14M-7 4h10" stroke="#1b2f5e"/>', label: `work order T${m.detail.turn || S.session.turn}` }), [[-20, 216], [58, 216], [58, 230], [162, 230], [162, 216]], { sel: 'intake', v: 0.5 });
      stampFx(60, 96, 'NEW WORK ORDER', '#f26b1d');
    } else if (m.kind === 'turn-complete') {
      const a = resolve('model'); const b = resolve('answer');
      fly(itemMarkup('edits', 1.3, { custom: '<rect x="-11" y="-10" width="22" height="20" fill="#f6efe0" stroke="#1b2f5e" stroke-width="1.4"/><path d="M-11 -3h22M-11 4h22" stroke="#a8703d"/><text y="2.5" font-size="6" text-anchor="middle" style="font-weight:900">REPLY</text>', label: `reply · turn ${m.detail.turn}` }), route(a, b), { sel: 'dock', v: 0.7 }).then(() => { puff(b.x, b.y, '#1b2f5e'); dirty = true; });
    } else if (m.kind === 'compaction') {
      const silo = $('silo'); silo.classList.remove('compacting'); void silo.getBBox(); silo.classList.add('compacting');
      setTimeout(() => silo.classList.remove('compacting'), 1900);
      stampFx(278, 240, `COMPACTED ${tok(m.detail.before)}→${tok(m.detail.after)}`, '#f26b1d');
    } else if (m.kind === 'context-file') {
      fly(itemMarkup('memory', 1, { custom: '<path d="M-8 12q-3-14 3-20l-2-4h14l-2 4q6 6 3 20z" fill="#e8dcc2" stroke="#1b2f5e"/>', label: base(m.detail.path) }), [[278, 60], [278, 515]], { sel: 'context', v: 0.6 });
    }
    dirty = true;
  });
  sim.on('lane', () => { dirty = true; });
  sim.on('tasks', () => { dirty = true; });
  sim.on('tick', () => { dirty = true; });

  // ---------- selection, cause links ----------
  let current = null; const back = [];
  function homeOf(c) {
    if (!c) return null;
    if (c.status === 'running') return resolve(`tool:${c.kind}`, c, 'to');
    if (c.status === 'error') { const i = S.errors.slice(-8).reverse().findIndex(e => e.id === c.id); return i >= 0 ? { x: 18 + (i % 4) * 49 + 23, y: 364 + Math.floor(i / 4) * 30 + 12 } : BIN; }
    const last = c.flow[c.flow.length - 1];
    return last ? resolve(last.to, c, 'to') : resolve(`tool:${c.kind}`, c, 'to');
  }
  function renderLinks() {
    let out = '';
    if (current && (current.startsWith('call:') || current.startsWith('error:'))) {
      const c = callById(current.split(':')[1]);
      if (c) {
        const me = homeOf(c);
        const line = (a, b, label) => {
          if (!a || !b) return '';
          const mx = (a.x + b.x) / 2; const my = Math.min(a.y, b.y) - 40;
          return `<path d="M${a.x} ${a.y}Q${mx} ${my} ${b.x} ${b.y}" class="link-line" marker-end="url(#arr)"/><g class="link-tag" transform="translate(${mx},${(a.y + b.y) / 4 + my / 2})"><rect x="-30" y="-7" width="60" height="11" rx="2"/><text y="1.5" text-anchor="middle">${esc(label)}</text></g>`;
        };
        if (c.causedBy) { const p = callById(c.causedBy); if (p) out += line(homeOf(p), me, `cause ${p.id}`); }
        for (const k of S.calls.filter(x => x.causedBy === c.id).slice(0, 4)) out += line(me, homeOf(k), `${k.retryOf === c.id ? 'retry' : 'led to'} ${k.id}`);
        out += `<circle cx="${me.x}" cy="${me.y}" r="17" fill="none" stroke="#f26b1d" stroke-width="2.5" stroke-dasharray="4 3"/><g class="link-tag" transform="translate(${me.x},${me.y - 22})"><rect x="-26" y="-7" width="52" height="11" rx="2" style="fill:#f26b1d"/><text y="1.5" text-anchor="middle">TRACK ${c.id}</text></g>`;
      }
    }
    setG('g-links', `<g pointer-events="none">${out}</g>`);
  }

  // ---------- side panel: foreman's board ----------
  function renderForeman() {
    const since = sim.errorsSincePrompt(); const tot = errorsTotal(); const a = activeCall();
    const totalCalls = KINDS.reduce((n, k) => n + S.counts[k], 0);
    const sinceAll = Object.values(since).reduce((x, y) => x + y, 0);
    const items = S.tasks.items; const done = items.filter(t => t.status === 'completed').length; const prog = items.filter(t => t.status === 'in_progress').length;
    const html = `<h3>FOREMAN'S BOARD</h3>
      <table class="fb"><thead><tr><th></th><th>Line</th><th class="n">Calls</th><th class="n">✖ since prompt</th><th class="n">✖ total</th></tr></thead><tbody>
      ${KINDS.map(k => `<tr data-sel="machine:${k}" tabindex="0" class="${a && a.kind === k ? 'active' : ''}"><td>${icon(k, 18)}</td><td>${kindName(k)} <small>${MACH[k].name.toLowerCase()}</small></td><td class="n">${S.counts[k]}</td><td class="n ${since[k] ? 'err' : 'dim'}">${since[k] ? `✖ ${since[k]}` : '—'}</td><td class="n ${tot[k] ? '' : 'dim'}">${tot[k] || 0}</td></tr>`).join('')}
      <tr class="total"><td></td><td>All lines</td><td class="n">${totalCalls}</td><td class="n ${sinceAll ? 'err' : ''}">${sinceAll}</td><td class="n">${S.errors.length}</td></tr>
      </tbody></table>
      <div class="fb-meta"><span>Active now: ${a ? `<span class="act">${kindName(a.kind)} · ${esc(trunc(a.label, 26))}</span>` : '<b>idle</b>'}</span>
      <span>Tasks <b>${done}/${items.length}</b> done · ${prog} on line · ${items.length - done - prog} queued</span>
      <span>Tokens in <b>${tok(S.tokens.input)}</b> · out <b>${tok(S.tokens.output)}</b> · cache <b>${tok(S.tokens.cacheRead)}</b></span>
      <span>Context <b style="color:${p2c(S.context.percent)}">${S.context.percent.toFixed(1)}%</b> · ${S.lanes.length - 1} subagents</span></div>`;
    if (cache.foreman !== html && !$('foreman').contains(document.activeElement)) { cache.foreman = html; $('foreman').innerHTML = html; }
  }
  const p2c = p => p >= 90 ? '#d7262b' : p >= 70 ? '#b87800' : '#1b2f5e';

  // ---------- dispatch ledger: recent activity folded ×N ----------
  function renderLedger() {
    if ($('ledger').hidden) return;
    const ev = [];
    for (const c of S.calls.slice(-160)) ev.push({ t: c.startedAt, key: `${c.lane}|${c.tool}|${c.label}|${c.status}`, sel: `call:${c.id}`, c });
    for (const m of S.markers.slice(-30)) ev.push({ t: m.time, key: `m|${m.kind}`, sel: m.kind === 'prompt' ? 'intake' : m.kind === 'turn-complete' ? 'dock' : 'context', m });
    ev.sort((a, b) => b.t - a.t);
    const folded = [];
    for (const e of ev) { const prev = folded[folded.length - 1]; if (prev && prev.key === e.key) prev.n++; else folded.push({ ...e, n: 1 }); if (folded.length >= 60) break; }
    const html = `<ul class="ledger">${folded.map(e => {
      if (e.m) return `<li class="mk" data-sel="${e.sel}" tabindex="0"><span>${e.m.kind === 'prompt' ? '▼' : e.m.kind === 'turn-complete' ? '✔' : e.m.kind === 'compaction' ? '⇣' : '◍'}</span><span class="lbl">${esc(e.m.label)}${e.n > 1 ? `<span class="x">×${e.n}</span>` : ''}</span><span class="t">${ago(S.now - e.t)}</span></li>`;
      const c = e.c; const st = c.status === 'error' ? ` · ✖ ${esc(c.error.code)}` : c.status === 'running' ? ' · running' : '';
      return `<li class="${c.status === 'error' ? 'err' : ''}" data-sel="${e.sel}" tabindex="0">${icon(c.kind, 18, { err: c.status === 'error' })}<span class="lbl">${c.lane !== 'main' ? '<b>annex</b> · ' : ''}${esc(c.label)}${c.target && c.kind !== 'memory' ? ` <span class="hint">${esc(trunc(c.target.value, 34))}</span>` : ''}${st}${c.attempt > 1 ? ` <span class="pill retry">ATTEMPT ${c.attempt}</span>` : ''}${e.n > 1 ? `<span class="x">×${e.n}</span>` : ''}</span><span class="t">${ago(S.now - e.t)}</span></li>`;
    }).join('')}</ul>`;
    if (cache.ledger !== html && !$('ledger').contains(document.activeElement)) { cache.ledger = html; $('ledger').innerHTML = `<h3>DISPATCH LEDGER · recent, repeats folded</h3>${html}`; }
  }

  // ---------- top bar ----------
  function renderTop() {
    const st = sessionStatus(); const s = S.session;
    const html = [
      `<span class="chip"><i>project</i><b>${esc(s.project)}</b></span>`,
      `<span class="chip"><i>session</i><b>${esc(s.name)}</b></span>`,
      `<span class="chip" title="${esc(s.id)}"><i>id</i>${esc(s.id.slice(0, 12))}…</span>`,
      `<span class="chip"><i>${esc(s.provider)}</i>${esc(s.model)}</span>`,
      `<span class="chip"><i>branch</i>${esc(s.branch)}</span>`,
      `<span class="chip st-${st.key}"><i>status</i><b>${esc(st.text)}</b></span>`,
      `<span class="chip"><i>last record</i>${ago(S.now - lastRecordTime())}</span>`,
      `<span class="chip"><i>turn</i><b>${s.turn}</b></span>`
    ].join('');
    if (cache.top !== html) { cache.top = html; $('ident').innerHTML = html; }
    $('plateProj').textContent = `${s.project} · ${trunc(s.name, 34)}`;
  }

  // ---------- shift log ----------
  let lastShift = 0;
  function renderShift(force) {
    const now = performance.now(); if (!force && now - lastShift < 900) return; lastShift = now;
    const svg = $('shiftSvg'); const W = svg.clientWidth || 1200; const H = svg.clientHeight || 150;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const span = 30 * 60000; const t0 = S.now - span;
    const gx = 176; const gr = 40; const top = 26; const bottom = H - 18; const pw = W - gx - gr; const ph = bottom - top;
    const X = t => gx + (t - t0) / span * pw;
    const bins = Array.from({ length: 30 }, () => ({ total: 0, k: {} }));
    for (const c of S.calls) if (c.startedAt >= t0) { const i = Math.min(29, Math.floor((c.startedAt - t0) / 60000)); bins[i].total++; bins[i].k[c.kind] = (bins[i].k[c.kind] || 0) + 1; }
    const max = Math.max(4, ...bins.map(b => b.total));
    const bw = pw / 30;
    let s = `<rect x="${gx}" y="${top}" width="${pw}" height="${ph}" fill="#f7f8f6" stroke="#c3c9d3"/>`;
    for (const f of [0.5, 1]) s += `<path d="M${gx} ${bottom - f * ph}H${gx + pw}" stroke="#d3d8e0" stroke-dasharray="2 3"/><text x="${gx - 4}" y="${bottom - f * ph + 3}" font-size="8" text-anchor="end">${Math.round(max * f)}</text>`;
    bins.forEach((b, i) => {
      let y = bottom; const x = gx + i * bw + 1.5;
      for (const k of KINDS) { const n = b.k[k] || 0; if (!n) continue; const h = n / max * ph; y -= h; s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${h.toFixed(1)}" fill="${KCOL[k]}" stroke="#1b2f5e" stroke-width=".4"/>`; }
    });
    // context % line with 70/90 guides (right axis)
    const cy = p => bottom - p / 100 * ph;
    s += `<path d="M${gx} ${cy(70)}H${gx + pw}" stroke="#f0a316" stroke-dasharray="5 3" stroke-width=".9"/><path d="M${gx} ${cy(90)}H${gx + pw}" stroke="#d7262b" stroke-dasharray="5 3" stroke-width=".9"/>`;
    s += `<text x="${gx + pw + 4}" y="${cy(70) + 3}" font-size="7.5" style="fill:#b87800;font-weight:700">70%</text><text x="${gx + pw + 4}" y="${cy(90) + 3}" font-size="7.5" style="fill:#d7262b;font-weight:700">90%</text><text x="${gx + pw + 4}" y="${bottom}" font-size="7.5">ctx 0</text>`;
    const pts = S.context.samples.filter(p => p.time >= t0).map(p => `${X(p.time).toFixed(1)},${cy(p.percent).toFixed(1)}`);
    if (pts.length > 1) s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#1b2f5e" stroke-width="1.6" stroke-linejoin="round"/>`;
    // markers
    for (const m of S.markers) {
      if (m.time < t0) continue; const x = X(m.time).toFixed(1);
      if (m.kind === 'prompt') s += `<path d="M${x} ${top - 4}V${bottom}" stroke="#1b2f5e" stroke-width="1.6"/><path d="M${x - 4} ${top - 10}h8l-4 6z" fill="#1b2f5e"/><text x="${+x + 5}" y="${top - 4}" font-size="8" style="font-weight:800">P${m.detail.text ? prompts().indexOf(m) + 1 : ''}</text>`;
      else if (m.kind === 'turn-complete') s += `<path d="M${x} ${top}V${bottom}" stroke="#3d5791" stroke-width="1.2" stroke-dasharray="3 2"/><text x="${x}" y="${top - 13}" font-size="9" text-anchor="middle" style="font-weight:900;fill:#3d5791">✔</text>`;
      else if (m.kind === 'compaction') s += `<path d="M${x} ${top - 6}V${bottom}" stroke="#f26b1d" stroke-width="2.4"/><text x="${+x + 4}" y="${top - 13}" font-size="8" style="font-weight:900;fill:#f26b1d">⇣ compacted</text>`;
    }
    // error ticks
    for (const e of S.errors) { const t = e.endedAt || e.startedAt; if (t < t0) continue; const x = X(t); s += `<g transform="translate(${x.toFixed(1)},${top + 6})" data-sel="error:${e.id}"><title>${esc(e.error.code)} · ${esc(e.tool)}</title><rect x="-5" y="-5" width="10" height="10" fill="#fff" opacity=".01"/><path d="M-3.5 -3.5L3.5 3.5M3.5 -3.5L-3.5 3.5" stroke="#d7262b" stroke-width="2.2"/></g>`; }
    // minute hit areas
    bins.forEach((b, i) => { s += `<rect x="${(gx + i * bw).toFixed(1)}" y="${top + 14}" width="${bw.toFixed(1)}" height="${ph - 14}" fill="transparent" data-sel="minute:${Math.round(t0 + i * 60000)}"><title>${b.total} calls</title></rect>`; });
    // axis
    for (const [lab, t] of [['−30m', t0], ['−20m', t0 + 600000], ['−10m', t0 + 1200000], ['now', S.now]]) s += `<text x="${X(t)}" y="${H - 5}" font-size="8" text-anchor="${lab === 'now' ? 'end' : lab === '−30m' ? 'start' : 'middle'}">${lab}</text>`;
    // legend
    s += `<text x="12" y="20" font-size="10" style="font-weight:900;letter-spacing:.14em">SHIFT LOG</text><text x="12" y="31" font-size="8" style="fill:#3d5791">items per minute · last 30 min</text>`;
    KINDS.forEach((k, i) => { const x = 12 + (i % 2) * 80; const y = 44 + Math.floor(i / 2) * 15; const n = bins.reduce((a, b) => a + (b.k[k] || 0), 0); s += `<rect x="${x}" y="${y - 7}" width="9" height="9" fill="${KCOL[k]}" stroke="#1b2f5e" stroke-width=".5"/><text x="${x + 13}" y="${y + 1}" font-size="8.5">${kindName(k)} ${n}</text>`; });
    const ly = 44 + 4 * 15;
    s += `<path d="M12 ${ly - 3}h12" stroke="#1b2f5e" stroke-width="1.6"/><text x="28" y="${ly}" font-size="8">context %</text><path d="M92 ${ly - 6}l5 5M97 ${ly - 6}l-5 5" stroke="#d7262b" stroke-width="2"/><text x="101" y="${ly}" font-size="8">error</text>`;
    s += `<text x="12" y="${ly + 13}" font-size="8"><tspan style="font-weight:900">▼</tspan> prompt  <tspan style="fill:#3d5791;font-weight:900">✔</tspan> turn  <tspan style="fill:#f26b1d;font-weight:900">⇣</tspan> compaction</text>`;
    svg.innerHTML = s;
  }

  // ---------- inspection sheets ----------
  const link = (sel, text) => `<a href="#" data-sel="${esc(sel)}">${text}</a>`;
  const kv = rows => `<dl class="kv">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const sec = (title, body) => body ? `<div class="sec"><h4>${esc(title)}</h4>${body}</div>` : '';
  const pill = c => c.status === 'error' ? `<span class="pill bad">✖ ${esc(c.error.code)}</span>` : c.status === 'running' ? '<span class="pill run">▶ RUNNING</span>' : '<span class="pill ok">✔ OK</span>';
  function nodeSel(id) {
    if (id.startsWith('file:')) return id; if (id.startsWith('lane:')) return id; if (id.startsWith('tool:')) return `machine:${id.slice(5)}`;
    if (id.startsWith('web:') || id.startsWith('mcp:')) return `host:${id}`;
    return { context: 'context', terminal: 'terminal', plan: 'plan', model: 'office', user: 'intake', answer: 'dock' }[id] || (id.startsWith('ctxfile:') ? 'context' : 'office');
  }
  function nodeName(id, call) {
    if (id.startsWith('tool:')) { const k = id.slice(5); return call && call.lane !== 'main' ? `annex mini ${MACH[k].name.toLowerCase()}` : `${MACH[k].name.toLowerCase()} (${kindName(k)})`; }
    if (id.startsWith('file:')) return `shelf ${id.slice(5)}`;
    if (id.startsWith('lane:')) { const l = laneOf(id.slice(5)); return `annex ${l ? l.label : id.slice(5)}`; }
    if (id.startsWith('web:')) return `supplier ${id.slice(4)}`;
    return { context: 'context silo', terminal: 'terminal printer', plan: 'production board', model: 'dispatch office (model)', user: 'intake dock', answer: 'shipping dock', 'mcp:github': 'supplier MCP github' }[id] || id;
  }
  const callLine = c => `<li>${icon(c.kind, 16, { err: c.status === 'error' })}${link(`call:${c.id}`, `${esc(c.tool)} ${c.id}`)} <span class="hint">${esc(trunc(c.label, 40))}</span> ${pill(c)}${c.attempt > 1 ? ` <span class="pill retry">ATTEMPT ${c.attempt}</span>` : ''} <span class="t">${hms(c.startedAt)}</span></li>`;
  const head = (kind, ty, title, stampHtml) => `<div class="wo-head">${kind ? icon(kind, 30) : ''}<div><div class="ty">${ty}</div><h2>${title}</h2></div>${stampHtml || ''}</div>`;
  const stampFor = c => c.status === 'error' ? '<span class="stamp bad">REJECTED</span>' : c.status === 'running' ? '<span class="stamp run">IN PROCESS</span>' : '<span class="stamp ok">PASSED QC</span>';
  function fmtVal(v) { return typeof v === 'string' ? esc(v) : esc(JSON.stringify(v)); }
  function chartSvg(samples, t0, t1, marks) {
    const W = 360; const H = 110; const X = t => 4 + (t - t0) / Math.max(1, t1 - t0) * (W - 30); const Y = p => H - 6 - p / 100 * (H - 14);
    let s = `<path d="M4 ${Y(70)}H${W - 26}" stroke="#f0a316" stroke-dasharray="4 3"/><path d="M4 ${Y(90)}H${W - 26}" stroke="#d7262b" stroke-dasharray="4 3"/><text x="${W - 24}" y="${Y(70) + 3}" font-size="8" fill="#b87800">70%</text><text x="${W - 24}" y="${Y(90) + 3}" font-size="8" fill="#d7262b">90%</text>`;
    s += `<polyline fill="none" stroke="#1b2f5e" stroke-width="1.5" points="${samples.map(p => `${X(p.time).toFixed(1)},${Y(p.percent).toFixed(1)}`).join(' ')}"/>`;
    for (const m of marks) s += `<path d="M${X(m.time)} 4V${H - 4}" stroke="#f26b1d" stroke-width="2"/>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${s}</svg>`;
  }

  function sheetCall(c) {
    const lane = laneOf(c.lane); const after = c.status === 'error' ? aftermath(c) : null;
    const caused = S.calls.filter(x => x.causedBy === c.id); const retries = S.calls.filter(x => x.retryOf === c.id);
    const chain = []; let p = c.causedBy && callById(c.causedBy); while (p && chain.length < 8) { chain.push(p); p = p.causedBy && callById(p.causedBy); }
    const tgt = c.target ? (c.target.type === 'file' ? link(`file:${c.target.value}`, esc(c.target.value)) : c.target.type === 'agent' ? esc(c.target.value) : c.target.type === 'url' ? link(`host:${hostIdForCall(c)}`, esc(c.target.value)) : c.target.type === 'plan' ? link('plan', esc(c.target.value)) : `<code>${esc(c.target.value)}</code>`) : '—';
    const o = c.output || {};
    const tests = o.tests ? `${o.tests.passed} passed · <b class="${o.tests.failed ? 'del' : ''}">${o.tests.failed} failed</b> · ${o.tests.skipped} skipped${o.tests.failures.length ? `<br>failing: ${o.tests.failures.map(esc).join(', ')}` : ''}` : '';
    let html = head(c.kind, `WORK ORDER · ${kindName(c.kind).toUpperCase()} · ${KITEM[c.kind].toUpperCase()}`, `${esc(c.tool)} <small>#${c.id}</small>`, stampFor(c));
    html += sec('Order', kv([
      ['Label', esc(c.label)],
      ['Lane', lane ? `${link(`lane:${lane.key}`, esc(lane.label))} <span class="hint">${lane.role}, depth ${lane.depth}</span>` : esc(c.lane)],
      ['Target', `${c.target ? `<span class="hint">${esc(c.target.type)}</span> ` : ''}${tgt}`],
      ['Started', `${hms(c.startedAt)} <span class="hint">${ago(S.now - c.startedAt)}</span>`],
      ['Duration', c.endedAt ? dur(c.endedAt - c.startedAt) : `running ${dur(S.now - c.startedAt)} (planned ${dur(c.duration)})`],
      ['Status', `${pill(c)}`],
      ['Attempt', `${c.attempt}${c.retryOf ? ` · retry of ${link(`call:${c.retryOf}`, c.retryOf)}` : ''}${retries.length ? ` · retried by ${retries.map(r => link(`call:${r.id}`, r.id)).join(', ')}` : ''}`]
    ]));
    html += sec('Input arguments', `<pre>${Object.entries(c.input || {}).map(([k, v]) => `${esc(k)}: ${fmtVal(v)}`).join('\n') || '(none)'}</pre>`);
    if (c.error) html += sec('QC rejection', `<div class="errbox"><span class="code">${esc(c.error.code)}</span><b>${esc(c.error.name)}</b><br>${esc(c.error.message)}<br><span class="hint">Hint: ${esc(c.error.hint)}</span><br><b>Next:</b> ${esc(after.verdict)}</div>`);
    if (c.output) html += sec('Output', kv([
      ['Summary', esc(o.summary || '—')],
      o.exitCode !== undefined && c.kind === 'shell' ? ['Exit code', o.exitCode === 0 ? '0' : `<b class="del">${o.exitCode ?? 'none'}</b>`] : null,
      o.status ? ['HTTP status', String(o.status)] : null,
      o.lines != null ? ['Lines', String(o.lines)] : null,
      o.bytes != null ? ['Bytes', size(o.bytes)] : null,
      tests ? ['Tests', tests] : null
    ]) + (o.preview && o.preview.length ? `<pre>${o.preview.map(esc).join('\n')}</pre>` : ''));
    if (c.diff) html += sec('Diff', `<b class="add">+${c.diff.added}</b> <b class="del">−${c.diff.removed}</b>${c.diff.hunks.map(h => `<pre>@@ line ${h.at} @@\n${h.lines.map(l => `<span class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}">${esc(l)}</span>`).join('\n')}</pre>`).join('')}`);
    html += sec('Weight', kv([['Tokens in', tok(c.tokens.in)], ['Tokens out', tok(c.tokens.out)], ['Context after', c.contextAfter ? `<b style="color:${p2c(c.contextAfter.percent)}">${c.contextAfter.percent}%</b> (${tok(c.contextAfter.used)} tok)` : '—']]));
    html += sec(`Conveyor route · ${c.flow.length} hops`, `<ol class="hops">${c.flow.map(h => `<li>${link(nodeSel(h.from), esc(nodeName(h.from, c)))} → ${link(nodeSel(h.to), esc(nodeName(h.to, c)))} · ${esc(h.what)}${h.tokens ? ` · ${tok(h.tokens)} tok` : ''}${h.bytes ? ` · ${size(h.bytes)}` : ''}</li>`).join('')}</ol>`);
    if (c.refs.length) html += sec('References', `<ul class="rows">${c.refs.map(r => `<li><span class="hint">${esc(r.role)}</span> ${r.type === 'file' ? link(`file:${r.value}`, esc(r.value)) : r.type === 'lane' ? link(`lane:${r.value}`, esc((laneOf(r.value) || {}).label || r.value)) : r.type === 'task' ? link(`task:${r.value}`, `task ${esc(r.value)}`) : r.type === 'url' ? `${esc(r.title || '')} <code>${esc(r.value)}</code>` : esc(r.value)}</li>`).join('')}</ul>`);
    html += sec('Tracking labels (cause chain)', kv([
      ['Caused by', c.causedBy ? `${link(`call:${c.causedBy}`, c.causedBy)} ${callById(c.causedBy) ? `<span class="hint">${esc(callById(c.causedBy).tool)} · ${esc(callById(c.causedBy).label)}</span>` : ''}` : 'prompt / plan (no earlier call)'],
      ['Chain to root', chain.length ? chain.map(x => link(`call:${x.id}`, `${x.id} ${esc(x.tool)}`)).join(' ← ') : '—'],
      ['Caused', caused.length ? caused.map(x => `${link(`call:${x.id}`, x.id)} <span class="hint">${esc(x.tool)}${x.retryOf === c.id ? ' (retry)' : ''}</span>`).join(', ') : '—']
    ]));
    return html;
  }
  function sheetError(c) {
    const a = aftermath(c); const lane = laneOf(c.lane);
    let html = head(c.kind, 'QC REJECT TAG', `<span style="background:#d7262b;padding:0 5px">${esc(c.error.code)}</span> ${esc(c.error.name)}`, '<span class="stamp bad">REJECTED</span>');
    html += sec('Defect', `<div class="errbox"><span class="code">${esc(c.error.code)}</span>${esc(c.error.message)}<br><span class="hint">Hint: ${esc(c.error.hint)}</span></div>`);
    html += sec('Where', kv([['Call', `${link(`call:${c.id}`, `${esc(c.tool)} ${c.id}`)} <span class="hint">${esc(c.label)}</span>`], ['Lane', lane ? link(`lane:${lane.key}`, esc(lane.label)) : esc(c.lane)], ['Target', esc(c.target ? c.target.value : '—')], ['At', `${hms(c.endedAt || c.startedAt)} · ${ago(S.now - (c.endedAt || c.startedAt))}`], ['Attempt', String(c.attempt)]]));
    html += sec('What happened next', `<p style="margin:0 0 4px"><b>${esc(a.verdict)}</b></p>${a.retries.length ? `<ul class="rows">${a.retries.map(callLine).join('')}</ul>` : ''}${a.follow.length ? `<div class="hint">Follow-up work:</div><ul class="rows">${a.follow.map(callLine).join('')}</ul>` : ''}`);
    return html;
  }
  function sheetFile(path) {
    const f = S.files[path] || { reads: 0, edits: 0, failed: 0, added: 0, removed: 0, lines: (S.nodes.find(n => n.id === `file:${path}`) || {}).lines };
    const calls = sim.callsForFile(path);
    let html = head('files', 'WAREHOUSE SHELF · FILE ON DISK', esc(path), f.edits >= 3 ? '<span class="stamp run">HOT</span>' : '');
    html += sec('Shelf stock', kv([['Reads', String(f.reads)], ['Edits', String(f.edits)], ['Failed calls', f.failed ? `<b class="del">✖ ${f.failed}</b>` : '0'], ['Lines changed', `<b class="add">+${f.added}</b> <b class="del">−${f.removed}</b>`], ['Lines now', String(f.lines ?? '—')], ['Hot', f.edits >= 3 ? 'yes, edited 3+ times' : 'no'], ['Last touched', f.lastTouched ? `${hms(f.lastTouched)} · ${ago(S.now - f.lastTouched)}` : 'never']]));
    html += sec(`Every call that touched it · ${calls.length}`, calls.length ? `<ul class="rows">${calls.map(c => callLine(c) + (c.diff ? `<li style="border:0"><pre style="width:100%">@@ ${c.diff.hunks[0].at} @@ +${c.diff.added} −${c.diff.removed}\n${c.diff.hunks[0].lines.map(esc).join('\n')}</pre></li>` : '') + (c.error ? `<li style="border:0"><span class="del">✖ ${esc(c.error.code)}: ${esc(c.error.message)}</span></li>` : '')).join('')}</ul>` : '<p class="hint">Not touched yet.</p>');
    return html;
  }
  function sheetContext() {
    const ctx = S.context; const cls = pctClass(ctx.percent);
    const contrib = new Map();
    for (const smp of ctx.samples) if (smp.delta > 0) { const key = smp.callId || smp.why; const e = contrib.get(key) || { why: smp.why, callId: smp.callId, tokens: 0 }; e.tokens += smp.delta; contrib.set(key, e); }
    const top = [...contrib.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 10);
    const byTool = new Map(); for (const smp of ctx.samples) if (smp.delta > 0) { const k = smp.why.replace(/^Loaded .*/, 'Context files'); byTool.set(k, (byTool.get(k) || 0) + smp.delta); }
    const compactions = S.markers.filter(m => m.kind === 'compaction');
    let html = head(null, 'SILO GAUGE · CONTEXT WINDOW', `${ctx.percent.toFixed(1)}% full`, cls ? `<span class="stamp ${cls === 'crit' ? 'bad' : 'run'}">${cls === 'crit' ? 'CRITICAL' : 'WARNING'}</span>` : '<span class="stamp ok">LEVEL OK</span>');
    html += sec('Level', `<div class="meter"><i class="${cls}" style="width:${Math.min(100, ctx.percent)}%"></i><b style="left:70%"></b><b style="left:90%"></b></div>` + kv([['Used', `${ctx.used.toLocaleString()} of ${ctx.capacity.toLocaleString()} tokens`], ['Thresholds', 'amber at 70%, red at 90%'], ['Compactions', String(ctx.compactions)]]));
    html += sec('Fill level over the session', chartSvg(ctx.samples, S.session.startedAt, S.now, compactions));
    html += sec('Biggest single loads', `<ul class="rows">${top.map(e => `<li><b>${tok(e.tokens)}</b> ${e.callId ? link(`call:${e.callId}`, esc(e.why)) : esc(e.why)}</li>`).join('')}</ul>`);
    html += sec('What filled it, by source', `<ul class="rows">${[...byTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `<li><b>${tok(v)}</b> ${esc(k)}</li>`).join('')}</ul>`);
    html += sec('Compactions (dump and compress)', compactions.length ? `<ul class="rows">${compactions.map(m => `<li><span class="t">${hms(m.time)}</span> ${esc(m.label)}</li>`).join('')}</ul>` : '<p class="hint">None yet. At 92% the silo is dumped and compressed.</p>');
    html += sec('Context files (sacks at the silo floor)', `<ul class="rows">${ctx.files.map(f => `<li><b>${esc(f.path)}</b> ${tok(f.tokens)} tok <span class="hint">${esc(f.why)} · loaded ${hms(f.loadedAt)}</span></li>`).join('')}</ul>`);
    return html;
  }
  function sheetTerminal() {
    const shells = S.calls.filter(c => c.kind === 'shell').slice().reverse();
    let html = head('shell', 'TERMINAL PRINTER · PAPER TAPE', `${shells.length} commands`, '');
    html += sec('Commands and exit codes, newest first', `<ul class="rows">${shells.map(c => `<li>${link(`call:${c.id}`, `<code>$ ${esc(c.target.value)}</code>`)} ${c.status === 'running' ? '<span class="pill run">▶ running</span>' : c.status === 'error' ? `<span class="pill bad">exit ${esc(c.output && c.output.exitCode != null ? c.output.exitCode : c.error.code)}</span>` : '<span class="pill ok">exit 0</span>'} ${c.output && c.output.tests ? `<span class="hint">tests ${c.output.tests.passed}/${c.output.tests.passed + c.output.tests.failed}</span>` : ''} ${c.lane !== 'main' ? `<span class="hint">annex ${esc(c.laneLabel)}</span>` : ''} ${c.attempt > 1 ? `<span class="pill retry">ATTEMPT ${c.attempt}</span>` : ''}<span class="t">${hms(c.startedAt)} · ${c.endedAt ? dur(c.endedAt - c.startedAt) : ''}</span></li>`).join('')}</ul>`);
    return html;
  }
  function sheetPlan(focus) {
    const items = S.tasks.items; const done = items.filter(t => t.status === 'completed').length; const prog = items.filter(t => t.status === 'in_progress').length;
    let html = head('memory', 'PRODUCTION BOARD · TASK LIST', `${done} of ${items.length} done`, '');
    html += sec('Progress', kv([['Completed', String(done)], ['On the line', String(prog)], ['Queued', String(items.length - done - prog)], ['Updated', S.tasks.updatedAt ? `${hms(S.tasks.updatedAt)} · ${ago(S.now - S.tasks.updatedAt)}` : '—'], ['Source', esc(S.tasks.source)]]));
    html += sec('Job cards and their history', items.map(t => `<div style="margin:4px 0;padding:4px 6px;border:1px solid ${t.id === focus ? '#f26b1d' : '#c6ccd8'};${t.id === focus ? 'background:#fff3e8' : ''}"><b>#${esc(t.id)} ${esc(t.label)}</b> <span class="pill ${t.status === 'completed' ? 'ok' : t.status === 'in_progress' ? 'run' : ''}">${STATUS_COL[t.status] || esc(t.status)}</span><ul class="rows">${t.history.map(h => `<li><span class="t">${hms(h.time)}</span> → ${esc(STATUS_COL[h.status] || h.status)} by ${link(`call:${h.callId}`, h.callId)}</li>`).join('')}</ul></div>`).join(''));
    return html;
  }
  function sheetHost(id) {
    const node = S.nodes.find(n => n.id === id) || { label: id };
    const calls = S.calls.filter(c => c.flow.some(h => h.from === id) || hostIdForCall(c) === id);
    let html = head(id.startsWith('mcp') ? 'other' : 'network', 'OUTSIDE SUPPLIER · WEB HOST', esc(node.label), '');
    html += sec(`Deliveries and status · ${calls.length}`, calls.length ? `<ul class="rows">${calls.slice().reverse().map(c => `<li>${link(`call:${c.id}`, `${esc(c.tool)} ${c.id}`)} <code>${esc(trunc(c.target.value, 48))}</code> ${c.status === 'error' ? `<span class="pill bad">${esc(c.error.code)}</span>` : c.status === 'running' ? '<span class="pill run">in flight</span>' : `<span class="pill ok">${c.output && c.output.status ? c.output.status : 'OK'}</span>`} ${c.output && c.output.bytes ? `<span class="hint">${size(c.output.bytes)}</span>` : ''}<span class="t">${hms(c.startedAt)}</span></li>`).join('')}</ul>` : '<p class="hint">No deliveries from this supplier yet.</p>');
    const searches = S.calls.filter(c => c.tool === 'WebSearch');
    if (!id.startsWith('mcp') && searches.length) html += sec('Web searches (no single host)', `<ul class="rows">${searches.slice(-6).reverse().map(callLine).join('')}</ul>`);
    return html;
  }
  function sheetLane(key) {
    const l = laneOf(key); if (!l) return '<p>Unknown lane</p>';
    const calls = S.calls.filter(c => c.lane === key); const kids = S.lanes.filter(k => k.parent === key);
    let html = head('agents', l.depth ? `SUB-FACTORY ANNEX · DEPTH ${l.depth}` : 'MAIN FACTORY', esc(l.label), l.state === 'failed' ? '<span class="stamp bad">FAILED</span>' : l.state === 'running' ? '<span class="stamp run">RUNNING</span>' : '<span class="stamp ok">COMPLETED</span>');
    html += sec('Annex record', kv([['Role', `${esc(l.role)} · ${esc(l.agentType)}`], ['Model', esc(l.model)], ['Depth', String(l.depth)], ['Parent', l.parent ? link(`lane:${l.parent}`, esc((laneOf(l.parent) || {}).label || l.parent)) : '—'], ['Started', hms(l.startedAt)], ['Ended', l.endedAt ? `${hms(l.endedAt)} · ran ${dur(l.endedAt - l.startedAt)}` : 'still running'], ['State', esc(l.state)], ['Calls', String(l.calls)], ['Errors', l.errors ? `<b class="del">✖ ${l.errors}</b>` : '0'], ['Tokens', tok(l.tokens)]]));
    if (l.task) html += sec('Brief (sealed in the container)', `<pre>${esc(l.task)}</pre>`);
    if (l.result) html += sec('Final result', `<pre>${esc(l.result)}</pre>`);
    if (kids.length) html += sec('Nested annexes', `<ul class="rows">${kids.map(k => `<li>${link(`lane:${k.key}`, esc(k.label))} <span class="hint">${esc(k.state)}</span></li>`).join('')}</ul>`);
    html += sec(`Its mini belt · ${calls.length} calls`, `<ul class="rows">${calls.slice(-40).reverse().map(callLine).join('')}</ul>`);
    return html;
  }
  function sheetLanes() {
    let html = head('agents', 'ANNEX WING · ALL LANES', `${S.lanes.length} lanes`, '');
    html += sec('Lanes (main + subagents)', `<ul class="rows">${S.lanes.map(l => `<li>${'&nbsp;&nbsp;'.repeat(l.depth)}${l.depth ? '↳ ' : ''}${link(`lane:${l.key}`, esc(l.label))} <span class="pill ${l.state === 'failed' ? 'bad' : l.state === 'running' ? 'run' : 'ok'}">${esc(l.state)}</span> <span class="hint">${l.calls} calls · ✖ ${l.errors} · ${tok(l.tokens)} tok</span><span class="t">${hms(l.startedAt)}</span></li>`).join('')}</ul>`);
    return html;
  }
  function sheetMachine(k) {
    const calls = S.calls.filter(c => c.kind === k); const since = sim.errorsSincePrompt()[k] || 0; const errs = calls.filter(c => c.status === 'error');
    const doneCalls = calls.filter(c => c.endedAt); const avg = doneCalls.length ? doneCalls.reduce((a, c) => a + c.endedAt - c.startedAt, 0) / doneCalls.length : null;
    const run = calls.filter(c => c.status === 'running');
    let html = head(k, `MACHINE · ${kindName(k).toUpperCase()} LINE`, MACH[k].name, run.length ? '<span class="stamp run">RUNNING</span>' : '');
    html += sec('Line report', kv([['Item shape', esc(KITEM[k])], ['Tools', esc(KI[k].tools.join(', '))], ['Calls', String(calls.length)], ['✖ since prompt', since ? `<b class="del">${since}</b>` : '0'], ['✖ total', String(errs.length)], ['Running now', run.length ? run.map(c => link(`call:${c.id}`, `${esc(c.label)} ${c.id}`)).join(', ') : 'none'], ['Avg duration', dur(avg)], ['Tokens in', tok(calls.reduce((a, c) => a + c.tokens.in, 0))]]));
    html += sec('Recent items through this machine', `<ul class="rows">${calls.slice(-20).reverse().map(callLine).join('')}</ul>`);
    return html;
  }
  function sheetBin() {
    const errs = S.errors.slice().reverse();
    let html = head(null, 'QC · REJECT BIN', `${errs.length} rejected items`, '<span class="stamp bad">QC</span>');
    const since = sim.errorsSincePrompt();
    html += sec('Since the last prompt, per kind', kv(KINDS.map(k => [kindName(k), since[k] ? `<b class="del">✖ ${since[k]}</b>` : '0'])));
    html += sec('Every reject tag, newest first', `<ul class="rows">${errs.map(e => { const a = aftermath(e); return `<li>${icon(e.kind, 16, { err: true })}${link(`error:${e.id}`, `<b class="del">${esc(e.error.code)}</b>`)} ${esc(e.tool)} ${e.id} <span class="hint">${esc(e.laneLabel)}</span> <span class="pill ${a.fixed ? 'ok' : 'bad'}">${esc(a.fixed ? 'fixed' : a.verdict)}</span><span class="t">${hms(e.endedAt)}</span></li>`; }).join('')}</ul>`);
    return html;
  }
  function sheetDock() {
    const ps = prompts(); const turns = S.markers.filter(m => m.kind === 'turn-complete');
    let html = head(null, 'SHIPPING DOCK · REPLIES TO THE USER', `${turns.length} shipped`, '');
    html += sec('Turns', `<ul class="rows">${ps.slice().reverse().map((p, i) => { const n = ps.length - i; const end = turns.find(t => t.detail.turn === n); const next = ps[n]; const inTurn = S.calls.filter(c => c.startedAt >= p.time && (!next || c.startedAt < next.time)); const errs = inTurn.filter(c => c.status === 'error').length; return `<li><b>T${n}</b> ${esc(p.detail.text)} <span class="hint">${inTurn.length} calls · ✖ ${errs}</span> ${end ? `<span class="pill ok">shipped ${hms(end.time)}</span>` : '<span class="pill run">in production</span>'}</li>`; }).join('')}</ul>`);
    return html;
  }
  function sheetIntake() {
    const ps = prompts();
    let html = head(null, 'INTAKE DOCK · WORK ORDERS FROM THE USER', `${ps.length} prompts`, '');
    html += sec('Work orders, newest first', `<ul class="rows">${ps.slice().reverse().map((p, i) => `<li><b>T${ps.length - i}</b> ${esc(p.detail.text)} <span class="hint">${p.detail.tokens} tok</span><span class="t">${hms(p.time)}</span></li>`).join('')}</ul>`);
    return html;
  }
  function sheetOffice() {
    const s = S.session; const st = sessionStatus();
    let html = head(null, 'DISPATCH OFFICE · SESSION', esc(s.name), `<span class="stamp ${st.key === 'active' ? 'run' : 'ok'}">${esc(st.text.toUpperCase())}</span>`);
    html += sec('Identity', kv([['Project', esc(s.project)], ['Session', esc(s.name)], ['Id', `<code>${esc(s.id)}</code>`], ['Provider', esc(s.provider)], ['Model', esc(s.model)], ['Branch', esc(s.branch)], ['Directory', esc(s.cwd)], ['Status', esc(st.text)], ['Last record', ago(S.now - lastRecordTime())], ['Turn', String(s.turn)], ['Started', hms(s.startedAt)]]));
    html += sec('Tokens', kv([['Input', tok(S.tokens.input)], ['Output', tok(S.tokens.output)], ['Cache read', tok(S.tokens.cacheRead)]]));
    return html;
  }
  function sheetMinute(t) {
    const calls = S.calls.filter(c => c.startedAt >= t && c.startedAt < t + 60000);
    let html = head(null, 'SHIFT LOG · ONE MINUTE', `${hms(t)} – ${hms(t + 60000)}`, '');
    html += sec(`${calls.length} items started`, calls.length ? `<ul class="rows">${calls.map(callLine).join('')}</ul>` : '<p class="hint">Nothing on the line in this minute.</p>');
    const ms = S.markers.filter(m => m.time >= t && m.time < t + 60000);
    if (ms.length) html += sec('Markers', `<ul class="rows">${ms.map(m => `<li><span class="t">${hms(m.time)}</span> ${esc(m.label)}</li>`).join('')}</ul>`);
    return html;
  }
  function buildSheet(sel) {
    const i = sel.indexOf(':'); const type = i < 0 ? sel : sel.slice(0, i); const arg = i < 0 ? '' : sel.slice(i + 1);
    switch (type) {
      case 'call': { const c = callById(arg); return c ? sheetCall(c) : '<p>Call not found.</p>'; }
      case 'error': { const c = callById(arg); return c && c.error ? sheetError(c) : c ? sheetCall(c) : '<p>Not found.</p>'; }
      case 'file': return sheetFile(arg);
      case 'context': return sheetContext();
      case 'terminal': return sheetTerminal();
      case 'plan': return sheetPlan();
      case 'task': return sheetPlan(arg);
      case 'host': return sheetHost(arg);
      case 'lane': return sheetLane(arg);
      case 'lanes': return sheetLanes();
      case 'machine': return sheetMachine(arg);
      case 'bin': return sheetBin();
      case 'dock': return sheetDock();
      case 'intake': return sheetIntake();
      case 'office': return sheetOffice();
      case 'minute': return sheetMinute(Number(arg));
      default: return '<p>Nothing here.</p>';
    }
  }
  let lastSheet = 0;
  function renderSheet(force) {
    if (!current || $('sheet').hidden) return;
    const now = performance.now(); if (!force && now - lastSheet < 1000) return; lastSheet = now;
    const body = buildSheet(current);
    const html = `<div class="sheet-nav">${back.length ? '<button type="button" data-act="back">◂ Back</button>' : ''}<button type="button" data-act="close">✕ Close</button><span class="live-note">${sim.running ? 'live sheet · updates every second' : 'frozen · paused'}</span></div><div class="sheet">${body}</div>`;
    if (cache.sheet === html) return;
    if (!force && $('sheet').contains(document.activeElement) && document.activeElement !== document.body) return;
    const scroll = $('sheet').scrollTop;
    cache.sheet = html; $('sheet').innerHTML = html;
    if (!force) $('sheet').scrollTop = scroll; else $('sheet').scrollTop = 0;
  }
  function showTab(tab) {
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    $('ledger').hidden = tab !== 'ledger'; $('sheet').hidden = tab !== 'sheet';
    cache.ledger = null; dirty = true;
  }
  function select(sel, push = true) {
    if (push && current && current !== sel) back.push(current);
    if (back.length > 30) back.shift();
    current = sel; showTab('sheet'); renderSheet(true); renderLinks();
  }
  window.factory = { select, sim };

  // ---------- events ----------
  document.addEventListener('click', ev => {
    const act = ev.target.closest('[data-act]');
    if (act) { ev.preventDefault(); if (act.dataset.act === 'back') { const prev = back.pop(); if (prev) select(prev, false); } else { current = null; back.length = 0; showTab('ledger'); renderLinks(); } return; }
    const tab = ev.target.closest('.tabs button');
    if (tab) { if (tab.dataset.tab === 'sheet' && !current) select('office'); else showTab(tab.dataset.tab); return; }
    const hit = ev.target.closest('[data-sel]');
    if (hit) { ev.preventDefault(); select(hit.getAttribute('data-sel')); }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const hit = ev.target.closest && ev.target.closest('[data-sel]');
    if (hit && (hit.getAttribute('tabindex') != null || hit.tagName === 'A')) { ev.preventDefault(); select(hit.getAttribute('data-sel')); }
  });
  $('pause').addEventListener('click', () => {
    if (sim.running) sim.pause(); else { sim.start(); lastT = performance.now(); }
    const paused = !sim.running;
    document.body.classList.toggle('paused', paused);
    $('pause').textContent = paused ? 'Resume' : 'Pause'; $('pause').setAttribute('aria-pressed', String(paused));
    $('mode').textContent = paused ? 'INSPECTING' : 'LIVE'; $('mode').className = `mode ${paused ? 'paused' : 'live'}`;
    $('frozen').hidden = !paused; $('frozenAt').textContent = `frozen at ${hms(S.now)}`;
    cache.sheet = null; dirty = true;
  });
  for (const b of document.querySelectorAll('[data-speed]')) b.addEventListener('click', () => {
    sim.setSpeed(Number(b.dataset.speed));
    for (const o of document.querySelectorAll('[data-speed]')) o.classList.toggle('on', o === b);
  });
  // fill the floor box: extend the sky upward (or the yard sideways) instead of letterboxing
  function fitFloor() {
    const box = $('floorWrap'); const W = box.clientWidth; const H = box.clientHeight;
    if (!W || !H) return;
    if (H / W > 720 / 1200) { const extra = Math.min(300, H / (W / 1200) - 720); floor.setAttribute('viewBox', `0 ${-extra.toFixed(1)} 1200 ${(720 + extra).toFixed(1)}`); floor.setAttribute('preserveAspectRatio', 'xMidYMax meet'); }
    else { const vw = W / (H / 720); floor.setAttribute('viewBox', `${(-(vw - 1200) / 2).toFixed(1)} 0 ${vw.toFixed(1)} 720`); floor.setAttribute('preserveAspectRatio', 'xMidYMid meet'); }
  }
  fitFloor();
  window.addEventListener('resize', () => { fitFloor(); renderShift(true); });

  // ---------- main loop ----------
  let dirty = true; let lastT = performance.now();
  function renderAll() {
    renderTop(); renderHosts(); renderIntake(); renderOffice(); renderSilo(); renderMachineLabels(); renderBin(); renderShelves();
    renderPrinter(); renderBoard(); renderDock(); renderAnnexes(); renderLinks(); renderForeman(); renderLedger(); renderShift(); renderSheet();
  }
  function frame(t) {
    const dt = Math.min(100, t - lastT); lastT = t;
    if (sim.running) { const step = dt * sim.speed; for (const f of [...flights]) { f.d += f.v * step; if (f.d >= f.total) { f.el.remove(); flights.delete(f); f.resolve(); } else place(f); } }
    if (dirty) { dirty = false; renderAll(); }
    requestAnimationFrame(frame);
  }
  // running calls left over from the pre-filled history sit in their machines
  for (const c of running()) park(c);
  renderAll(); renderShift(true);
  sim.start();
  requestAnimationFrame(frame);
})();
