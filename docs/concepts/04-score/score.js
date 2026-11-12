/* Session Score: the session as an orchestral score written live.
 * Time runs left to right; each agent lane is an instrument section; each kind of work is an instrument line
 * with its own notation. The right margin is the conductor's summary (where the data ended up).
 */
(function () {
  'use strict';

  const sim = AgentVizSim.create({ seed: 7, history: 30 });
  const S = sim.state;
  const KINDS = sim.kinds;
  const T0 = S.session.startedAt;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = sel => document.querySelector(sel);

  // ---------- helpers ----------
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const f1 = v => Math.round(v * 10) / 10;
  const base = p => String(p || '').split('/').pop();
  const short = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const fmtT = t => { const d = new Date(t); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, '0')).join(':'); };
  const fmtDur = ms => ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} m ${Math.round(ms % 60000 / 1000)} s`;
  const fmtAgo = ms => ms < 1500 ? 'just now' : ms < 60000 ? `${Math.round(ms / 1000)} s ago` : `${Math.floor(ms / 60000)} m ${Math.round(ms % 60000 / 1000)} s ago`;
  const fmtK = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));
  const ROMAN = n => { let s = ''; for (const [v, r] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += r; n -= v; } return s || '0'; };
  const TEMPI = ['Allegro', 'Andante con moto', 'Moderato', 'Vivace', 'Allegretto', 'Presto'];
  const lk = (key, text, cls = '') => `<button class="lk ${cls}" data-open="${esc(key)}">${esc(text)}</button>`;
  const statusSym = s => s === 'success' ? '✓' : s === 'error' ? '✗' : s === 'running' ? '◔' : s === 'completed' ? '✓' : s === 'failed' ? '✗' : '·';
  const pill = s => `<span class="pill ${esc(s)}">${statusSym(s)} ${esc(s)}</span>`;

  // The instrumentation: one instrument line per kind of work.
  const KIND = {
    files: { inst: 'Violins', abbr: 'Vln.', role: 'Read', clef: '\u{1D11E}', notation: 'Quarter notes on the strings staff. Pitch = which file; note head size and stem weight = tokens; Grep/Glob sound as chords (one head per file matched).' },
    edits: { inst: 'Horns', abbr: 'Hn.', role: 'Edit', clef: '\u{1D122}', notation: 'Accented notes with a dynamic for the size of the change (p…fff). A crescendo hairpin grows while the edit runs. Write is a whole note (new file).' },
    network: { inst: 'Flutes', abbr: 'Fl.', role: 'Network', clef: '\u{1D11E}', notation: 'A beamed woodwind phrase that spans the fetch and arrives on a fermata. WebFetch is slurred, WebSearch is staccato.' },
    shell: { inst: 'Timpani', abbr: 'Timp.', role: 'Shell', clef: '\u{1D125}', notation: 'A percussion hit followed by a drum roll for as long as the command runs; the exit is marked at the end of the roll.' },
    agents: { inst: 'Harp', abbr: 'Hp.', role: 'Agents', clef: '', notation: 'A cue note: "div." opens a new section (staff entrance with a bracket), "tutti" brings its report back.' },
    memory: { inst: 'Rehearsal', abbr: 'Reh.', role: 'Plan', clef: '', notation: 'Rehearsal marks above the main system: each plan change is a boxed mark (a new list, or an item changing status).' },
    other: { inst: 'Celesta', abbr: 'Cel.', role: 'Other', clef: '', notation: 'An ornament: a trill held for the length of the call (MCP and other tools).' }
  };
  const KIND_ORDER = ['files', 'edits', 'network', 'shell', 'agents', 'memory', 'other'];
  const STAVE = { tempo: { h: 26 }, memory: { h: 32 }, files: { h: 58, lines: 5 }, edits: { h: 70, lines: 5 }, network: { h: 62, lines: 5 }, shell: { h: 50, lines: 1 }, agents: { h: 46, lines: 1 }, other: { h: 44, lines: 1 } };
  const STAFF_ORDER = ['files', 'edits', 'network', 'shell', 'agents', 'other'];

  // ---------- view state ----------
  const ZOOMS = [10, 16, 24, 32, 46, 64];
  let zoom = 2;
  let pps = ZOOMS[zoom];
  const X = t => (t - T0) / 1000 * pps;
  const RULER = 32, LOOK = 120;
  let N = 200; // names column
  let live = true, inspectAt = 0;
  let dispNow = S.now, lastTickNow = S.now, lastTickReal = performance.now();
  let scoreDirty = true, marginDirty = true, renderedAnchor = -Infinity, renderedW = 0;
  let notePos = new Map(), growEls = [], systems = [], laneSys = new Map(), totalH = 400;
  let tx = 0;
  const startHops = new Map();
  const pendingFlights = [];
  const flights = [];
  let lastMargin = 0, lastOverview = 0, lastHeader = 0, lastPanel = 0;

  const wrap = $('#score-wrap'), svg = $('#score'), ov = $('#overview'), margin = $('#margin'), flightsSvg = $('#flights');

  // ---------- derived data ----------
  const diskOrder = () => S.nodes.filter(n => n.group === 'disk').map(n => n.label);
  function pitchOf(path) { const i = diskOrder().indexOf(path); return i < 0 ? 4 : (i * 5) % 9; }
  function fileOfCall(c) { const ref = c.refs.find(r => r.type === 'file' && (r.role === 'read' || r.role === 'wrote')); return ref ? ref.value : c.target && c.target.type === 'file' ? c.target.value : null; }
  const laneOf = key => sim.laneByKey(key);
  const laneIndex = key => S.lanes.findIndex(l => l.key === key) + 1;
  const laneShort = l => l ? l.label.split(' ')[0] : 'lane';
  function endHops(c) { const n = startHops.has(c.id) ? startHops.get(c.id) : 1; return c.flow.slice(n); }
  function destLabel(to, c) {
    if (to === 'context' || to === `lane:${c.lane}`) return 'ctx';
    if (to.startsWith('lane:')) return '→' + laneShort(laneOf(to.slice(5)));
    if (to.startsWith('file:')) return base(to.slice(5));
    if (to === 'terminal') return 'term.';
    if (to === 'plan') return 'plan';
    if (to === 'answer') return 'reply';
    return to;
  }
  function lyricOf(c) {
    if (c.status === 'error') return c.error.code;
    if (c.status === 'running') return '…';
    const tos = [...new Set(endHops(c).map(h => h.to).filter(t => !t.startsWith('tool:')))].map(t => destLabel(t, c));
    let text = [...new Set(tos)].join(' · ');
    if (c.kind === 'network' && c.target && c.target.type === 'url') text = `${hostOf(c.target.value).replace(/^(www|developer|code)\./, '')} → ${text}`;
    return text;
  }
  const hostOf = url => { try { return new URL(url).host; } catch { return String(url); } };
  function headR(c) { const t = c.tokens.in + c.tokens.out; if (!t) return 3.1; return 2.6 + 1.2 * clamp(Math.log10(t) - 1.6, 0, 2.2); }
  function stemW(c) { const t = c.tokens.in + c.tokens.out; return 0.9 + clamp(t / 1400, 0, 2.1); }
  function dynOf(c) { if (!c.diff) return ''; const n = c.diff.added + c.diff.removed; if (c.tool === 'Write') return 'fff'; return n < 6 ? 'p' : n < 14 ? 'mf' : n < 26 ? 'f' : n < 60 ? 'ff' : 'fff'; }
  function dynOfPct(p) { return p < 15 ? 'pp' : p < 30 ? 'p' : p < 45 ? 'mp' : p < 60 ? 'mf' : p < 70 ? 'f' : p < 90 ? 'ff' : 'fff'; }
  function lastPromptTime() { const m = [...S.markers].reverse().find(x => x.kind === 'prompt'); return m ? m.time : T0; }
  function promptNumber(m) { return S.markers.filter(x => x.kind === 'prompt' && x.seq <= m.seq).length; }
  function lastRecord() { let t = T0; const c = S.calls[S.calls.length - 1]; if (c) t = Math.max(t, c.endedAt || c.startedAt); for (const r of sim.runningCalls()) t = Math.max(t, r.startedAt); const m = S.markers[S.markers.length - 1]; if (m) t = Math.max(t, m.time); return t; }
  function spawnedLane(c) {
    const ref = c.refs.find(r => r.type === 'lane' && r.role === 'spawned');
    if (ref) return laneOf(ref.value);
    if (c.label !== 'Working with agents') return null;
    return S.lanes.find(l => l.parent === c.lane && c.target && l.label === c.target.value && Math.abs(l.startedAt - c.startedAt) < 200) || null;
  }
  function nextAfterError(c) {
    const retries = S.calls.filter(x => x.retryOf === c.id);
    const fixed = retries.find(x => x.status === 'success');
    const caused = S.calls.filter(x => x.causedBy === c.id && x.retryOf !== c.id);
    if (fixed) return { text: `Fixed by retry (attempt ${fixed.attempt}) ✓`, call: fixed, ok: true, retries, caused };
    if (retries.length) return { text: retries.some(r => r.status === 'running') ? 'Retry running…' : 'Retried, still failing', call: retries[retries.length - 1], ok: false, retries, caused };
    if (caused.length) return { text: `Followed up by ${caused[0].tool} (${caused[0].label})`, call: caused[0], ok: null, retries, caused };
    return { text: 'Not retried', call: null, ok: false, retries, caused };
  }

  // ---------- SVG primitives ----------
  const head = (x, y, r, cls = '') => `<ellipse class="head ${cls}" cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r * 1.3)}" ry="${f1(r * 0.9)}" transform="rotate(-22 ${f1(x)} ${f1(y)})"/>`;
  const xHead = (x, y, r) => `<circle class="xh-ring" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r + 3.2)}"/><path class="xh" d="M${f1(x - r)},${f1(y - r)}L${f1(x + r)},${f1(y + r)}M${f1(x - r)},${f1(y + r)}L${f1(x + r)},${f1(y - r)}"/>`;
  const hit = (x, y, w, h) => `<rect class="hit hl" x="${f1(x)}" y="${f1(y)}" width="${f1(Math.max(8, w))}" height="${f1(h)}" rx="2"/>`;
  const fermata = (x, y) => `<path class="ferm" d="M${f1(x - 5)},${f1(y)}A5,5 0 0 1 ${f1(x + 5)},${f1(y)}"/><circle class="ferm-d" cx="${f1(x)}" cy="${f1(y - 1.4)}" r="1.1"/>`;
  const pY = (st, p) => st.top + 20 - p * 2.5;
  function noteWrap(c, inner) {
    const aria = `${c.tool}: ${c.label}${c.target ? ' ' + c.target.value : ''}, ${c.status}${c.error ? ' ' + c.error.code : ''}`;
    const tip = `${c.tool} · ${c.label}\n${c.target ? c.target.value + '\n' : ''}${fmtT(c.startedAt)} · ${c.endedAt ? fmtDur(c.endedAt - c.startedAt) : 'running'} · ${c.status}${c.error ? '\n' + c.error.code + ': ' + c.error.message : ''}\n(click for the programme note)`;
    return `<g class="note k-${c.kind} s-${c.status}" data-open="call:${c.id}" tabindex="0" role="button" aria-label="${esc(aria)}"><title>${esc(tip)}</title>${inner}</g>`;
  }
  // interval packer for text rows
  function packer(rows) {
    const used = Array.from({ length: rows }, () => []);
    return (x, w) => { for (let i = 0; i < rows; i++) if (!used[i].some(([a, b]) => x < b + 3 && x + w > a - 3)) { used[i].push([x, x + w]); return i; } return -1; };
  }
  const textW = (s, fs) => String(s).length * fs * 0.5 + 2;

  // ---------- note renderers, one per kind ----------
  function growLine(x0, y) { growEls.push({ g: 'x2' }); return `<line class="grow-l grow" data-g="x2" data-x0="${f1(x0)}" x1="${f1(x0)}" y1="${f1(y)}" x2="${f1(x0)}" y2="${f1(y)}"/>`; }

  function drawFiles(c, st, ly) {
    const x0 = X(c.startedAt), x1 = c.endedAt ? X(c.endedAt) : x0;
    const r = headR(c);
    const search = c.tool !== 'Read';
    let pitches = [pitchOf(fileOfCall(c))];
    if (search) { const cited = [...new Set(c.refs.filter(x => x.type === 'file').map(x => pitchOf(x.value)))].slice(0, 4); pitches = cited.length ? cited : [4]; }
    const ys = pitches.map(p => pY(st, p));
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    let s = hit(x0 - 7, st.top - 12, Math.max(16, x1 - x0 + 14), 46);
    if (c.status === 'running') s += growLine(x0 + r, ys[0]) + head(x0, ys[0], r, 'hollow');
    else if (c.status === 'error') { if (x1 - x0 > 8) s += `<line class="ext" x1="${f1(x0)}" y1="${f1(ys[0])}" x2="${f1(x1)}" y2="${f1(ys[0])}"/>`; s += xHead(x0, ys[0], r + 0.6); }
    else {
      if (x1 - x0 > r * 2.8) s += `<line class="ext" x1="${f1(x0 + r)}" y1="${f1(ys[0])}" x2="${f1(x1)}" y2="${f1(ys[0])}"/>`;
      for (const y of ys) s += head(x0, y, r);
      const up = pitches.reduce((a, b) => a + b, 0) / pitches.length < 4;
      const sx = up ? x0 + r * 1.2 - 0.5 : x0 - r * 1.2 + 0.5;
      s += up ? `<line class="stem" stroke-width="${f1(stemW(c))}" x1="${f1(sx)}" y1="${f1(yMax)}" x2="${f1(sx)}" y2="${f1(yMin - 15)}"/>` : `<line class="stem" stroke-width="${f1(stemW(c))}" x1="${f1(sx)}" y1="${f1(yMin)}" x2="${f1(sx)}" y2="${f1(yMax + 15)}"/>`;
    }
    if (search) s += `<text class="tiny" x="${f1(x0 - 5)}" y="${f1(st.top - 5)}">${c.tool.toLowerCase()}</text>`;
    notePos.set(c.id, { x: x0, y: ys[0], st });
    return noteWrap(c, s + ly(x0, [st.top + 31, st.top + 41]));
  }

  function drawEdits(c, st, ly) {
    const x0 = X(c.startedAt);
    const r = headR(c) + 0.3;
    const y = pY(st, pitchOf(fileOfCall(c)));
    let s = hit(x0 - 7, st.top - 13, 18, 60);
    const ay = st.top - 7;
    s += c.tool === 'MultiEdit' ? `<path class="accent" d="M${f1(x0 - 4)},${f1(ay + 3)}L${f1(x0)},${f1(ay - 4)}L${f1(x0 + 4)},${f1(ay + 3)}"/>` : `<path class="accent" d="M${f1(x0 - 5)},${f1(ay - 3)}L${f1(x0 + 5)},${f1(ay)}L${f1(x0 - 5)},${f1(ay + 3)}"/>`;
    if (c.status === 'running') {
      s += head(x0, y, r, 'hollow');
      const hy = st.top + 28;
      growEls.push({ g: 'hp' });
      s += `<path class="accent grow" data-g="hp" data-x0="${f1(x0)}" data-y="${f1(hy)}" d="M${f1(x0)},${f1(hy)}L${f1(x0)},${f1(hy)}"/>`;
    } else if (c.status === 'error') s += xHead(x0, y, r + 0.4);
    else {
      if (c.tool === 'Write') s += head(x0, y, r + 0.6, 'whole');
      else {
        s += head(x0, y, r);
        const up = y > st.top + 10;
        const sx = up ? x0 + r * 1.2 - 0.5 : x0 - r * 1.2 + 0.5;
        s += `<line class="stem" stroke-width="${f1(stemW(c))}" x1="${f1(sx)}" y1="${f1(y)}" x2="${f1(sx)}" y2="${f1(up ? y - 16 : y + 16)}"/>`;
      }
      s += `<text class="dyn" x="${f1(x0 - 5)}" y="${f1(st.top + 33)}">${dynOf(c)}</text>`;
    }
    notePos.set(c.id, { x: x0, y, st });
    return noteWrap(c, s + ly(x0, [st.top + 44, st.top + 54]));
  }

  function hostIndex(c) { const v = c.target ? c.target.value : ''; let h = 0; for (const ch of hostOf(v)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 2; }
  function drawNetwork(c, st, ly, nowT) {
    const x0 = X(c.startedAt);
    const expW = Math.max(16, c.duration / 1000 * pps);
    const xEnd = c.endedAt ? X(c.endedAt) : X(nowT);
    const n = clamp(Math.round(expW / 12) + 1, 2, 6);
    const b = hostIndex(c);
    const contour = [b, b + 1, b + 3, b + 2, b + 4, b + 5];
    const pts = [];
    for (let i = 0; i < n; i++) { const x = x0 + expW * (i / (n - 1)); if (c.status !== 'running' || x <= xEnd + 0.5) pts.push({ x, y: pY(st, contour[i]) }); }
    const r = 2.9;
    let s = hit(x0 - 6, st.top - 16, expW + 14, 52);
    const err = c.status === 'error';
    pts.forEach((p, i) => { if (err && i === pts.length - 1) s += xHead(p.x, p.y, r + 0.5); else s += head(p.x, p.y, r, c.status === 'running' && i === pts.length - 1 ? 'hollow' : ''); });
    const stemLen = 13;
    const tops = pts.map(p => ({ x: p.x + r * 1.2 - 0.5, y: p.y - stemLen }));
    pts.forEach((p, i) => { if (!(err && i === pts.length - 1)) s += `<line class="stem" stroke-width="1" x1="${f1(tops[i].x)}" y1="${f1(p.y)}" x2="${f1(tops[i].x)}" y2="${f1(tops[i].y)}"/>`; });
    if (pts.length > 1) {
      const a = tops[0], z = tops[err ? Math.max(0, tops.length - 2) : tops.length - 1];
      const ty = Math.min(a.y, z.y);
      if (z !== a) s += `<path class="beam" d="M${f1(a.x - .5)},${f1(ty)}L${f1(z.x + .5)},${f1(ty)}L${f1(z.x + .5)},${f1(ty + 2.6)}L${f1(a.x - .5)},${f1(ty + 2.6)}Z"/>`;
      tops.forEach((t, i) => { if (!(err && i === tops.length - 1) && t !== a) s += `<line class="stem" stroke-width="1" x1="${f1(t.x)}" y1="${f1(t.y)}" x2="${f1(t.x)}" y2="${f1(ty)}"/>`; });
      if (c.tool === 'WebSearch') for (const p of pts) s += `<circle class="beam" cx="${f1(p.x)}" cy="${f1(p.y + 5.5)}" r="1"/>`;
      else { const yl = Math.max(...pts.map(p => p.y)) + 7; const l = pts[pts.length - 1]; s += `<path class="accent" d="M${f1(pts[0].x)},${f1(pts[0].y + 5)}Q${f1((pts[0].x + l.x) / 2)},${f1(yl + 6)} ${f1(l.x)},${f1(l.y + 5)}"/>`; }
      if (c.status === 'success') { const t = tops[tops.length - 1]; s += fermata(t.x - 1, Math.min(ty, t.y) - 3); }
    }
    if (c.status === 'running') { const l = pts[pts.length - 1]; s += growLine(l.x + 4, l.y); }
    notePos.set(c.id, { x: x0, y: pts[0] ? pts[0].y : st.top + 10, st, xEnd: pts.length ? pts[pts.length - 1].x : x0 });
    return noteWrap(c, s + ly(x0, [st.top + 33, st.top + 43]));
  }

  function drawShell(c, st, ly, cmdPk) {
    const x0 = X(c.startedAt), x1 = c.endedAt ? X(c.endedAt) : x0 + 6;
    const y = st.top;
    let s = hit(x0 - 6, y - 16, Math.max(18, x1 - x0 + 16), 36);
    s += `<path class="tri" d="M${f1(x0 - 4.5)},${f1(y + 3.5)}L${f1(x0 + 4.5)},${f1(y + 3.5)}L${f1(x0)},${f1(y - 4.5)}Z"/>`;
    const cmd = c.target ? c.target.value : '';
    const ct = short(cmd, 26); if (cmdPk(x0 - 4, textW(ct, 9)) === 0) s += `<text class="cmd" x="${f1(x0 - 4)}" y="${f1(y - 9)}">${esc(ct)}</text>`;
    if (c.status === 'running') { growEls.push({ g: 'w' }); s += `<rect class="roll grow" data-g="w" data-x0="${f1(x0 + 6)}" x="${f1(x0 + 6)}" y="${f1(y - 4)}" width="0" height="8"/>`; }
    else {
      s += `<rect class="roll" x="${f1(x0 + 6)}" y="${f1(y - 4)}" width="${f1(Math.max(0, x1 - x0 - 6))}" height="8"/>`;
      if (c.status === 'error') s += xHead(x1 + 5, y, 4);
      else { const t = c.output && c.output.tests; s += `<path class="accent" d="M${f1(x1 + 2)},${f1(y - 3)}L${f1(x1 + 8)},${f1(y)}L${f1(x1 + 2)},${f1(y + 3)}"/>${t ? `<text class="tiny" x="${f1(x1 + 11)}" y="${f1(y + 3)}">${t.passed}✓</text>` : ''}`; }
    }
    notePos.set(c.id, { x: x0, y, st, xEnd: x1 });
    return noteWrap(c, s + ly(x0, [y + 16, y + 26]));
  }

  function drawAgents(c, st, ly) {
    const x0 = X(c.startedAt), x1 = c.endedAt ? X(c.endedAt) : x0;
    const y = st.top;
    const spawn = c.label === 'Working with agents';
    let s = hit(x0 - 6, y - 16, 120, 36);
    if (c.status === 'running') s += growLine(x0 + 3, y) + head(x0, y, 2.6, 'hollow');
    else if (c.status === 'error') s += xHead(x0, y, 3.4);
    else { s += head(x0, y, 2.6); s += `<line class="stem" stroke-width="1" x1="${f1(x0 + 2.8)}" y1="${f1(y)}" x2="${f1(x0 + 2.8)}" y2="${f1(y - 11)}"/>`; if (x1 - x0 > 6) s += `<line class="ext" x1="${f1(x0 + 3)}" y1="${f1(y)}" x2="${f1(x1)}" y2="${f1(y)}"/>`; }
    const who = c.target ? c.target.value : 'agent';
    s += `<text class="cue-t" x="${f1(x0 + 6)}" y="${f1(y - 7)}">${spawn ? 'div. → ' : 'tutti ← '}${esc(short(who, 24))}</text>`;
    notePos.set(c.id, { x: x0, y, st });
    return noteWrap(c, s + ly(x0, [y + 16, y + 26]));
  }

  function drawOther(c, st, ly) {
    const x0 = X(c.startedAt), x1 = c.endedAt ? X(c.endedAt) : x0 + 8;
    const y = st.top;
    let s = hit(x0 - 6, y - 18, Math.max(20, x1 - x0 + 12), 36);
    s += `<text class="tr" x="${f1(x0 - 4)}" y="${f1(y - 8)}">tr</text>`;
    if (c.status === 'running') { s += head(x0, y, 3, 'hollow'); growEls.push({ g: 'w' }); s += `<rect class="trill grow" data-g="w" data-x0="${f1(x0 + 8)}" x="${f1(x0 + 8)}" y="${f1(y - 15)}" width="0" height="7"/>`; }
    else {
      s += `<rect class="trill" x="${f1(x0 + 8)}" y="${f1(y - 15)}" width="${f1(Math.max(4, x1 - x0 - 8))}" height="7"/>`;
      s += c.status === 'error' ? xHead(x0, y, 3.6) : head(x0, y, headR(c)) + `<line class="stem" stroke-width="${f1(stemW(c))}" x1="${f1(x0 - headR(c) * 1.2 + .5)}" y1="${f1(y)}" x2="${f1(x0 - headR(c) * 1.2 + .5)}" y2="${f1(y + 13)}"/>`;
    }
    notePos.set(c.id, { x: x0, y, st });
    return noteWrap(c, s + ly(x0, [y + 18, y + 28]));
  }

  function rehearsalText(c, letters) {
    const inp = c.input || {};
    if (c.status === 'error') return `✗ ${c.error.code}`;
    if (inp.create) return `${letters.get(c.id) || 'A'} · ${inp.create.length} tasks`;
    if (inp.id) return `№${inp.id} ${inp.status === 'completed' ? '✓ done' : inp.status === 'in_progress' ? '▸ in progress' : inp.status || ''}`;
    return 'plan';
  }
  function drawMemory(c, st, pack, letters) {
    const x0 = X(c.startedAt);
    const text = rehearsalText(c, letters);
    const w = textW(text, 9.5) + 8;
    let row = pack(x0, w); if (row < 0) row = 1;
    const y = st.y + 3 + row * 14;
    const s = `<rect class="reh${c.status === 'running' ? ' run' : ''}" x="${f1(x0)}" y="${f1(y)}" width="${f1(w)}" height="12.5" rx="1"/><text class="reh-t" x="${f1(x0 + 4)}" y="${f1(y + 9.5)}">${esc(text)}</text>`;
    notePos.set(c.id, { x: x0 + 4, y: y + 6, st });
    return noteWrap(c, s);
  }

  // ---------- layout + render of the score ----------
  function stavesFor(lane, laneCalls) {
    if (lane.key === 'main') return ['tempo', 'memory', ...STAFF_ORDER];
    const kinds = new Set(laneCalls.map(c => c.kind));
    const list = kinds.has('memory') ? ['memory'] : [];
    for (const k of STAFF_ORDER) if (kinds.has(k) || k === 'files') list.push(k);
    return list;
  }
  function lanesInRange(t0, t1) {
    const visible = l => l.key === 'main' || (l.startedAt <= t1 && (l.endedAt ?? Infinity) >= t0);
    const out = [laneOf('main')];
    const walk = key => { for (const l of S.lanes.filter(x => x.parent === key).sort((a, b) => a.startedAt - b.startedAt)) { if (visible(l)) out.push(l); walk(l.key); } };
    walk('main');
    return out.filter(Boolean);
  }
  const currentAnchor = () => live ? dispNow : inspectAt;
  const viewW = () => wrap.clientWidth - N;

  function renderScore() {
    scoreDirty = false;
    const W = wrap.clientWidth; renderedW = W;
    N = W < 1100 ? 176 : 200;
    const VW = W - N;
    const anchor = currentAnchor(); renderedAnchor = anchor;
    const nowT = dispNow;
    const t0 = anchor - (VW - LOOK) / pps * 1000 - 20000, t1 = anchor + LOOK / pps * 1000 + 20000;
    const lanes = lanesInRange(anchor - (VW - LOOK) / pps * 1000 - 1500, anchor + LOOK / pps * 1000);
    const allByLane = new Map();
    for (const c of S.calls) { if (!allByLane.has(c.lane)) allByLane.set(c.lane, []); allByLane.get(c.lane).push(c); }
    notePos = new Map(); growEls = []; systems = []; laneSys = new Map();
    let y = RULER + 8;
    for (const lane of lanes) {
      const sys = { lane, y, staves: [] };
      if (lane.depth) y += 18;
      sys.top = y;
      for (const k of stavesFor(lane, allByLane.get(lane.key) || [])) {
        const g = STAVE[k];
        sys.staves.push({ kind: k, y, h: g.h, lines: g.lines || 0, top: y + (g.lines === 5 ? 18 : g.lines === 1 ? 22 : 0) });
        y += g.h;
      }
      sys.h = y - sys.y; sys.bottom = y;
      systems.push(sys); laneSys.set(lane.key, sys);
      y += 16;
    }
    totalH = Math.max(y + 10, wrap.clientHeight);
    const xT0 = X(t0), xT1 = X(t1);
    let c = '';
    c += `<rect id="future" class="future" x="${f1(X(nowT))}" y="0" width="${f1(xT1 - X(nowT) + 4000)}" height="${totalH}"/>`;
    // ruler: times and bar numbers (a bar = 10 seconds)
    const barMs = 10000;
    const labelEvery = pps < 14 ? 6 : pps < 20 ? 3 : pps < 40 ? 2 : 1;
    for (let t = Math.ceil(t0 / barMs) * barMs; t <= t1; t += barMs) {
      const x = X(t); const bar = Math.floor((t - T0) / barMs) + 1;
      c += `<line class="ruler-tick" x1="${f1(x)}" y1="18" x2="${f1(x)}" y2="${bar % labelEvery === 0 ? 26 : 22}"/>`;
      if (bar % labelEvery === 0) c += `<text class="ruler-t" x="${f1(x + 3)}" y="14">${fmtT(t)}</text>`;
      c += `<text class="ruler-m" x="${f1(x + 2)}" y="${RULER - 1}">${bar}</text>`;
    }
    // systems: staves, barlines, entrances, exits
    for (const sys of systems) {
      const l = sys.lane;
      const sx0 = Math.max(X(l.startedAt), xT0), sx1 = l.endedAt ? Math.min(X(l.endedAt), xT1) : xT1;
      if (sx1 <= sx0) continue;
      for (const st of sys.staves) {
        if (st.lines === 5) for (let i = 0; i < 5; i++) c += `<line class="sl" x1="${f1(sx0)}" y1="${f1(st.top + i * 5)}" x2="${f1(sx1)}" y2="${f1(st.top + i * 5)}"/>`;
        else if (st.lines === 1) c += `<line class="sl" x1="${f1(sx0)}" y1="${f1(st.top)}" x2="${f1(sx1)}" y2="${f1(st.top)}"/>`;
        if (st.lines) for (let t = Math.ceil(Math.max(t0, l.startedAt) / barMs) * barMs; X(t) <= sx1; t += barMs) {
          const x = X(t);
          c += st.lines === 5 ? `<line class="bar" x1="${f1(x)}" y1="${f1(st.top)}" x2="${f1(x)}" y2="${f1(st.top + 20)}"/>` : `<line class="bar" x1="${f1(x)}" y1="${f1(st.top - 6)}" x2="${f1(x)}" y2="${f1(st.top + 6)}"/>`;
        }
      }
      const yTop = sys.staves[0] ? sys.staves[0].y + 8 : sys.top, yBot = sys.bottom - 8;
      if (l.depth && X(l.startedAt) >= xT0) {
        const ex = X(l.startedAt);
        c += `<g class="mk" data-open="lane:${esc(l.key)}" tabindex="0" role="button" aria-label="${esc(l.label)} enters"><path class="bracket" d="M${f1(ex - 6)},${f1(yTop)}L${f1(ex - 6)},${f1(yBot)}"/><path class="bracket-hook" d="M${f1(ex - 7.5)},${f1(yTop)}Q${f1(ex - 2)},${f1(yTop)} ${f1(ex + 1)},${f1(yTop - 5)}M${f1(ex - 7.5)},${f1(yBot)}Q${f1(ex - 2)},${f1(yBot)} ${f1(ex + 1)},${f1(yBot + 5)}"/>
          <text class="enters" x="${f1(ex + 2)}" y="${f1(sys.y + 12)}">${ROMAN(laneIndex(l.key))}. ${esc(l.label)} — enters (${esc(l.agentType)} · ${esc(l.model.replace('claude-', ''))})</text></g>`;
      }
      if (l.endedAt && X(l.endedAt) <= xT1) {
        const ex = X(l.endedAt); const failed = l.state === 'failed';
        let bars = '';
        for (const st of sys.staves) if (st.lines) { const a = st.lines === 5 ? st.top : st.top - 7, b = st.lines === 5 ? st.top + 20 : st.top + 7; bars += `<line class="dbl" x1="${f1(ex - 4)}" y1="${f1(a)}" x2="${f1(ex - 4)}" y2="${f1(b)}"/><line class="dbl-thick" x1="${f1(ex)}" y1="${f1(a)}" x2="${f1(ex)}" y2="${f1(b)}"/>`; }
        c += `<g class="mk" data-open="lane:${esc(l.key)}" tabindex="0" role="button" aria-label="${esc(l.label)} ends ${l.state}">${hit(ex - 6, yTop, 12, yBot - yTop)}${bars}<text class="end-t${failed ? ' failed' : ''}" x="${f1(ex + 6)}" y="${f1(yTop + 6)}">${failed ? '✗ failed' : '✓ completed'}</text><text class="end-r" x="${f1(ex + 6)}" y="${f1(yTop + 17)}">${esc(short(l.result, 46))}</text></g>`;
      }
    }
    // markers: movements (prompts), fine (turn complete), dal segno (compaction), context files
    const main = laneSys.get('main');
    const tempoSt = main.staves.find(s => s.kind === 'tempo');
    const mainStaffTop = main.staves[1].y, mainBottom = main.bottom - 6;
    const tempoPack = packer(2);
    for (const m of S.markers) {
      if (m.time < t0 || m.time > t1) continue;
      const x = X(m.time);
      if (m.kind === 'prompt') {
        const num = promptNumber(m);
        const text = `“${m.detail.text}”`;
        const head2 = `${ROMAN(num)}. ${TEMPI[(num - 1) % TEMPI.length]}`;
        const w = textW(head2 + text, 11.5) + 14;
        let row = tempoPack(x + 4, w); if (row < 0) row = 0;
        c += `<g class="mk" data-open="marker:${m.id}" tabindex="0" role="button" aria-label="Movement ${num}: prompt ${esc(m.detail.text)}">${hit(x - 5, RULER, 10, totalH - RULER)}<line class="dbl" x1="${f1(x - 2)}" y1="${RULER + 4}" x2="${f1(x - 2)}" y2="${f1(systems[systems.length - 1].bottom)}"/><line class="dbl" x1="${f1(x + 1.5)}" y1="${RULER + 4}" x2="${f1(x + 1.5)}" y2="${f1(systems[systems.length - 1].bottom)}"/><text x="${f1(x + 5)}" y="${f1(tempoSt.y + 11 + row * 12)}"><tspan class="tempo-n">${esc(head2)}</tspan><tspan class="tempo" dx="5">${esc(text)}</tspan></text></g>`;
      } else if (m.kind === 'turn-complete') {
        let row = tempoPack(x - 10, 34); if (row < 0) row = 1;
        c += `<g class="mk" data-open="marker:${m.id}" tabindex="0" role="button" aria-label="Turn complete">${hit(x - 8, mainStaffTop, 14, mainBottom - mainStaffTop)}<line class="dbl" x1="${f1(x - 4)}" y1="${f1(mainStaffTop + 18)}" x2="${f1(x - 4)}" y2="${f1(mainBottom)}"/><line class="dbl-thick" x1="${f1(x)}" y1="${f1(mainStaffTop + 18)}" x2="${f1(x)}" y2="${f1(mainBottom)}"/>${fermata(x - 2, mainStaffTop + 14)}<text class="fine" x="${f1(x - 10)}" y="${f1(tempoSt.y + 11 + row * 12)}">Fine</text></g>`;
      } else if (m.kind === 'compaction') {
        const lbl = `D.S. — ${fmtK(m.detail.before)} → ${fmtK(m.detail.after)}`;
        let row = tempoPack(x - 6, textW(lbl, 10) + 16); if (row < 0) row = 1;
        const sy = tempoSt.y + 6 + row * 12;
        c += `<g class="mk" data-open="marker:${m.id}" tabindex="0" role="button" aria-label="${esc(m.label)}">${segno(x, sy)}<text class="segno-t" x="${f1(x + 8)}" y="${f1(sy + 4)}">${esc(lbl)}</text><line class="dbl" stroke-dasharray="3 3" x1="${f1(x)}" y1="${f1(sy + 8)}" x2="${f1(x)}" y2="${f1(mainBottom)}" style="stroke: var(--k-edits)"/></g>`;
      } else if (m.kind === 'context-file') {
        const lbl = `+ ${base(m.detail.path)} (${fmtK(m.detail.tokens)})`;
        const row = tempoPack(x + 4, textW(lbl, 9.5));
        if (row >= 0) c += `<g class="mk" data-open="context" tabindex="0" role="button" aria-label="${esc(m.label)}"><text class="instr" x="${f1(x + 4)}" y="${f1(tempoSt.y + 11 + row * 12)}">${esc(lbl)}</text></g>`;
      }
    }
    // notes
    const visCalls = S.calls.filter(x => x.startedAt <= t1 && (x.endedAt ?? nowT) >= t0);
    const letters = new Map(); let li = 0;
    for (const x of S.calls) if (x.kind === 'memory' && x.input && x.input.create) letters.set(x.id, String.fromCharCode(65 + (li++ % 26)));
    for (const sys of systems) {
      const laneCalls = visCalls.filter(x => x.lane === sys.lane.key);
      for (const st of sys.staves) {
        if (st.kind === 'tempo') continue;
        const list = laneCalls.filter(x => x.kind === st.kind);
        if (st.kind === 'memory') { const pk = packer(2); for (const x of list) c += drawMemory(x, st, pk, letters); continue; }
        // lyrics: errors claim space first, then destinations
        const pk = packer(2); const rows = new Map();
        const fs = 9;
        for (const x of [...list.filter(q => q.status === 'error'), ...list.filter(q => q.status !== 'error')]) { const text = lyricOf(x); if (!text) continue; const r = pk(X(x.startedAt) - 3, textW(text, fs)); rows.set(x.id, { r: x.status === 'error' && r < 0 ? 0 : r, text }); }
        const cmdPk = packer(1);
        for (const x of list) {
          const ly = (lx, ys) => { const info = rows.get(x.id); if (!info || info.r < 0) return ''; return `<text class="lyr${x.status === 'error' ? ' err' : x.status === 'running' ? ' run' : ''}" x="${f1(lx - 3)}" y="${f1(ys[info.r])}">${esc(info.text)}</text>`; };
          if (st.kind === 'files') c += drawFiles(x, st, ly);
          else if (st.kind === 'edits') c += drawEdits(x, st, ly);
          else if (st.kind === 'network') c += drawNetwork(x, st, ly, nowT);
          else if (st.kind === 'shell') c += drawShell(x, st, ly, cmdPk);
          else if (st.kind === 'agents') c += drawAgents(x, st, ly);
          else c += drawOther(x, st, ly);
        }
      }
    }
    // cue lines: a "div." note points down to the section it opens
    for (const x of visCalls) {
      if (x.kind !== 'agents' || x.label !== 'Working with agents') continue;
      const lane = spawnedLane(x); const p = notePos.get(x.id); const sys = lane && laneSys.get(lane.key);
      if (!p || !sys) continue;
      const tx2 = X(lane.startedAt) - 6;
      c += `<path class="cue-line" d="M${f1(p.x)},${f1(p.y + 3)}C${f1(p.x)},${f1((p.y + sys.top) / 2)} ${f1(tx2)},${f1((p.y + sys.top) / 2)} ${f1(tx2)},${f1(sys.top + 4)}"/>`;
    }
    // slurs (causedBy) and repeats (retries)
    for (const x of visCalls) {
      const b = notePos.get(x.id);
      if (x.causedBy) {
        const a = notePos.get(x.causedBy);
        if (a && b) {
          const cause = sim.callById(x.causedBy);
          const ax = (a.xEnd ?? a.x) + 4, bx = b.x - 4; const dx = bx - ax;
          const d = Math.abs(a.y - b.y) < 4 ? `M${f1(ax)},${f1(a.y - 6)}C${f1(ax + dx * .3)},${f1(a.y - 20)} ${f1(bx - dx * .3)},${f1(b.y - 20)} ${f1(bx)},${f1(b.y - 6)}` : `M${f1(ax)},${f1(a.y)}C${f1(ax + Math.max(20, dx * .5))},${f1(a.y)} ${f1(bx - Math.max(20, dx * .5))},${f1(b.y)} ${f1(bx)},${f1(b.y)}`;
          c += `<g class="slur-g" data-open="chain:${x.id}" tabindex="0" role="button" aria-label="${esc(`${cause.tool} led to ${x.tool}`)}"><title>${esc(`Slur: ${cause.tool} (${cause.status}) led to ${x.tool} ${x.label}`)}</title><path class="hitp" d="${d}"/><path class="slur${cause.status === 'error' ? ' from-err' : ''}" d="${d}"/></g>`;
        }
      }
      if (x.retryOf && b) {
        const a = notePos.get(x.retryOf);
        c += repeatSigns(a, b, x);
      }
    }
    // playhead
    c += `<g id="ph" transform="translate(${f1(X(nowT))},0)"><line class="ph-line" x1="0" y1="${RULER - 2}" x2="0" y2="${totalH}"/><rect class="ph-box" x="-17" y="${RULER - 15}" width="34" height="13" rx="2"/><text class="ph-text" x="0" y="${RULER - 5}" text-anchor="middle">now</text></g>`;

    // names column (fixed)
    let n = `<rect class="names-bg" x="0" y="0" width="${N}" height="${totalH}"/><line class="names-edge" x1="${N - .5}" y1="0" x2="${N - .5}" y2="${totalH}"/>`;
    n += `<text class="ruler-t" x="10" y="14">time · bar = 10 s</text>`;
    for (const sys of systems) {
      const l = sys.lane; const ind = 8 + l.depth * 12;
      const failed = l.state === 'failed';
      const ttl = `${ROMAN(laneIndex(l.key))}. ${l.label}`;
      const meta = l.key === 'main' ? `${S.session.model.replace('claude-', '')} · ${l.calls} calls` : `${l.agentType} · ${l.state === 'running' ? 'playing' : l.state} · ${l.calls} calls${l.errors ? ` · ${l.errors}✗` : ''}`;
      const ty = l.depth ? sys.y + 11 : sys.y + 10;
      n += `<g class="mk" data-open="lane:${esc(l.key)}" tabindex="0" role="button" aria-label="Lane ${esc(l.label)}"><text class="lane-name${failed ? ' failed' : ''}" x="${ind + 8}" y="${ty}">${esc(short(ttl, 24 - l.depth * 2))}</text><text class="lane-meta" x="${ind + 8}" y="${ty + 11}">${esc(short(meta, 34))}</text></g>`;
      const top = sys.staves[0].y + (l.key === 'main' ? 26 : 6), bot = sys.bottom - 4;
      n += `<path class="bracket" d="M${ind},${top}L${ind},${bot}"/><path class="bracket-hook" d="M${ind - 1.5},${top}Q${ind + 5},${top} ${ind + 8},${top - 6}M${ind - 1.5},${bot}Q${ind + 5},${bot} ${ind + 8},${bot + 6}"/>`;
      for (const st of sys.staves) {
        if (st.kind === 'tempo') continue;
        const k = KIND[st.kind];
        const ny = st.lines === 5 ? st.top + 13 : st.lines === 1 ? st.top + 4 : st.y + 18;
        n += `<g class="mk" data-open="kind:${st.kind}@${esc(l.key)}" tabindex="0" role="button" aria-label="${esc(k.inst)}, ${esc(k.role)}"><text class="inst k-${st.kind}" x="${N - 40}" y="${ny}" text-anchor="end">${esc(k.abbr)} <tspan class="role">${esc(k.role)}</tspan></text></g>`;
        if (st.lines === 5) { for (let i = 0; i < 5; i++) n += `<line class="sl" x1="${N - 36}" y1="${st.top + i * 5}" x2="${N}" y2="${st.top + i * 5}"/>`; n += `<text class="clef${k.clef === '\u{1D122}' ? ' small' : ''}" x="${N - 34}" y="${k.clef === '\u{1D122}' ? st.top + 17 : st.top + 21}">${k.clef}</text>`; }
        else if (st.lines === 1) { n += `<line class="sl" x1="${N - 36}" y1="${st.top}" x2="${N}" y2="${st.top}"/>`; if (st.kind === 'shell') n += `<path d="M${N - 30},${st.top - 6}V${st.top + 6}M${N - 25},${st.top - 6}V${st.top + 6}" stroke="currentColor" stroke-width="2.4"/>`; }
      }
    }
    const active = document.activeElement;
    const focusKey = active && svg.contains(active) && active.getAttribute('data-open');
    svg.setAttribute('height', totalH);
    svg.setAttribute('viewBox', `0 0 ${W} ${totalH}`);
    svg.innerHTML = `<defs>
        <pattern id="roll" width="6" height="8" patternUnits="userSpaceOnUse"><path d="M0.5,7.5L5.5,0.5" stroke="#4b2e1b" stroke-width="1.2"/></pattern>
        <pattern id="trill" width="8" height="7" patternUnits="userSpaceOnUse"><path d="M0,4Q2,0.5 4,4T8,4" stroke="#4d5b69" stroke-width="1.2" fill="none"/></pattern>
      </defs><g id="content" transform="translate(${f1(tx)},0)">${c}</g><g id="names">${n}</g>`;
    if (focusKey) { const el = svg.querySelector(`[data-open="${CSS.escape(focusKey)}"]`); if (el) el.focus({ preventScroll: true }); }
    growNodes = [...svg.querySelectorAll('.grow')];
    contentG = svg.querySelector('#content'); phG = svg.querySelector('#ph'); futureR = svg.querySelector('#future');
  }
  let growNodes = [], contentG = null, phG = null, futureR = null;

  function segno(x, y) {
    return `<path class="segno" d="M${f1(x + 4)},${f1(y - 4)}C${f1(x + 2)},${f1(y - 7)} ${f1(x - 4)},${f1(y - 6)} ${f1(x - 3)},${f1(y - 2)}C${f1(x - 2)},${f1(y + 1)} ${f1(x + 4)},${f1(y)} ${f1(x + 3)},${f1(y + 4)}C${f1(x + 2)},${f1(y + 7)} ${f1(x - 3)},${f1(y + 7)} ${f1(x - 4)},${f1(y + 4)}"/><path class="segno" d="M${f1(x - 5)},${f1(y + 6)}L${f1(x + 5)},${f1(y - 6)}"/><circle class="segno-d" cx="${f1(x - 4)}" cy="${f1(y - 1)}" r="1.1"/><circle class="segno-d" cx="${f1(x + 4)}" cy="${f1(y + 1)}" r="1.1"/>`;
  }
  function repeatSigns(a, b, x) {
    let s = '';
    const span = st => st.lines === 5 ? [st.top, st.top + 20] : [st.top - 7, st.top + 7];
    const voltaY = st => (st.lines === 5 ? st.top : st.top) - 14;
    if (a) {
      const [t, bt] = span(a.st); const rx = a.x - 11;
      s += `<line class="rep-thick" x1="${f1(rx)}" y1="${f1(t)}" x2="${f1(rx)}" y2="${f1(bt)}"/><line class="rep-thin" x1="${f1(rx + 3)}" y1="${f1(t)}" x2="${f1(rx + 3)}" y2="${f1(bt)}"/><circle class="rep-dot" cx="${f1(rx + 6)}" cy="${f1((t + bt) / 2 - 3)}" r="1.1"/><circle class="rep-dot" cx="${f1(rx + 6)}" cy="${f1((t + bt) / 2 + 3)}" r="1.1"/>`;
      const vy = voltaY(a.st) - 4;
      s += `<path class="volta" d="M${f1(a.x - 6)},${f1(vy + 6)}V${f1(vy)}H${f1(a.x + 22)}"/><text class="volta-t" x="${f1(a.x - 3)}" y="${f1(vy + 8)}">1.</text>`;
    }
    const [t, bt] = span(b.st); const ex = (b.xEnd ?? b.x) + (b.st.kind === 'shell' ? 26 : 10);
    s += `<circle class="rep-dot" cx="${f1(ex - 6)}" cy="${f1((t + bt) / 2 - 3)}" r="1.1"/><circle class="rep-dot" cx="${f1(ex - 6)}" cy="${f1((t + bt) / 2 + 3)}" r="1.1"/><line class="rep-thin" x1="${f1(ex - 3)}" y1="${f1(t)}" x2="${f1(ex - 3)}" y2="${f1(bt)}"/><line class="rep-thick" x1="${f1(ex)}" y1="${f1(t)}" x2="${f1(ex)}" y2="${f1(bt)}"/>`;
    const vy = voltaY(b.st) - 4;
    s += `<path class="volta" d="M${f1(b.x - 6)},${f1(vy + 6)}V${f1(vy)}H${f1(ex)}"/><text class="volta-t" x="${f1(b.x - 3)}" y="${f1(vy + 8)}">${x.attempt}.</text>`;
    return `<g class="slur-g" data-open="call:${x.id}" tabindex="0" role="button" aria-label="Retry, attempt ${x.attempt}"><title>Repeat: attempt ${x.attempt} of ${esc(x.tool)} after the failed note</title>${s}</g>`;
  }

  // ---------- per-frame motion ----------
  function updateNow() {
    if (sim.running) {
      const est = lastTickNow + (performance.now() - lastTickReal) * sim.speed;
      dispNow = Math.max(dispNow, Math.min(est, lastTickNow + 320 * sim.speed));
    }
  }
  function positionScore() {
    const anchor = currentAnchor();
    tx = N + viewW() - LOOK - X(anchor);
    if (contentG) contentG.setAttribute('transform', `translate(${f1(tx)},0)`);
    const xn = X(dispNow);
    if (phG) phG.setAttribute('transform', `translate(${f1(xn)},0)`);
    if (futureR) futureR.setAttribute('x', f1(xn));
    for (const el of growNodes) {
      const x0 = +el.dataset.x0; const g = el.dataset.g;
      if (g === 'x2') el.setAttribute('x2', f1(Math.max(x0, xn)));
      else if (g === 'w') el.setAttribute('width', f1(Math.max(0, xn - x0)));
      else if (g === 'hp') { const y = +el.dataset.y; const x1 = Math.max(x0, xn); const o = clamp((x1 - x0) / 10, 0, 4); el.setAttribute('d', `M${f1(x1)},${f1(y - o)}L${f1(x0)},${f1(y)}L${f1(x1)},${f1(y + o)}`); }
    }
  }

  // ---------- flights: data travelling to where it ends up ----------
  function elCenter(el) { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width && !r.height) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function marginTarget(sel) {
    const el = margin.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect(); const mr = margin.getBoundingClientRect();
    if (r.bottom < mr.top + 4 || r.top > mr.bottom - 4) return null;
    return { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2, el };
  }
  function scoreXY(x, y) { const r = svg.getBoundingClientRect(); const wr = wrap.getBoundingClientRect(); const sx = r.left + tx + x, sy = r.top + y; if (sx < wr.left + N - 10 || sx > wr.right + 20 || sy < wr.top - 10 || sy > wr.bottom + 10) return null; return { x: sx, y: sy }; }
  function anchorOf(node, call) {
    if (!node) return null;
    if (node.startsWith('tool:')) { const p = notePos.get(call.id); return p ? scoreXY(p.x, p.y) : null; }
    if (node === 'model' || node === `lane:${call.lane}`) { const sys = laneSys.get(call.lane); if (!sys) return null; const r = svg.getBoundingClientRect(); return { x: r.left + N - 70, y: r.top + sys.y + 14 }; }
    if (node.startsWith('lane:')) { const sys = laneSys.get(node.slice(5)); if (sys) { const r = svg.getBoundingClientRect(); return { x: r.left + N - 70, y: r.top + sys.y + 14 }; } return marginTarget('#d-lanes'); }
    if (node === 'context' || node.startsWith('ctxfile:')) return marginTarget('#d-context');
    if (node.startsWith('file:')) return marginTarget(`[data-file="${CSS.escape(node.slice(5))}"]`) || marginTarget('#d-files');
    if (node === 'terminal') return marginTarget('#d-terminal');
    if (node === 'plan') return marginTarget('#d-plan');
    if (node === 'answer') return marginTarget('#d-reply');
    if (node.startsWith('web:') || node.startsWith('mcp:')) return marginTarget('#d-web');
    if (node === 'user') return elCenter($('#title'));
    return null;
  }
  const destClass = node => node === 'context' ? 'context' : node.startsWith('file:') ? 'files' : node === 'terminal' ? 'terminal' : node === 'plan' ? 'plan' : node.startsWith('lane:') ? 'lanes' : node === 'answer' ? 'reply' : node.startsWith('web:') || node.startsWith('mcp:') ? 'web' : null;
  const COLORS = { context: '#1c4870', files: '#a86a12', terminal: '#4b2e1b', plan: '#67641a', lanes: '#6b3768', reply: '#2a1b11', web: '#2b6656' };
  const KCOLORS = { files: '#1c4870', edits: '#a86a12', shell: '#4b2e1b', network: '#2b6656', agents: '#6b3768', memory: '#67641a', other: '#4d5b69' };
  function glyphFor(dest, size, color) {
    const s = size;
    if (dest === 'context') return `<ellipse cx="0" cy="0" rx="${f1(s * 1.25)}" ry="${f1(s * .85)}" transform="rotate(-22)" fill="${color}"/><line x1="${f1(s * 1.1)}" y1="0" x2="${f1(s * 1.1)}" y2="${f1(-s * 3)}" stroke="${color}" stroke-width="1.4"/>`;
    if (dest === 'files') return `<path d="M${f1(-s * .8)},${f1(-s)}H${f1(s * .4)}L${f1(s * .8)},${f1(-s * .6)}V${f1(s)}H${f1(-s * .8)}Z" fill="#fbf7ec" stroke="${color}" stroke-width="1.6"/><line x1="${f1(-s * .5)}" y1="0" x2="${f1(s * .5)}" y2="0" stroke="${color}"/>`;
    if (dest === 'terminal') return `<rect x="${f1(-s)}" y="${f1(-s * .7)}" width="${f1(s * 2)}" height="${f1(s * 1.4)}" fill="${color}"/><path d="M${f1(-s * .6)},${f1(-s * .3)}L${f1(-s * .2)},0L${f1(-s * .6)},${f1(s * .3)}" stroke="#fbf7ec" fill="none"/>`;
    if (dest === 'plan') return `<rect x="${f1(-s)}" y="${f1(-s * .75)}" width="${f1(s * 2)}" height="${f1(s * 1.5)}" fill="#fbf7ec" stroke="${color}" stroke-width="1.6"/>`;
    if (dest === 'lanes') return `<path d="M${f1(s * .5)},${f1(-s * 1.2)}H${f1(-s * .4)}V${f1(s * 1.2)}H${f1(s * .5)}" fill="none" stroke="${color}" stroke-width="2.4"/>`;
    if (dest === 'web') return `<path d="M${f1(-s)},${f1(s * .4)}Q0,${f1(-s * 1.4)} ${f1(s)},${f1(s * .4)}" fill="none" stroke="${color}" stroke-width="2"/>`;
    return `<circle r="${f1(s * .8)}" fill="${color}"/>`;
  }
  function launch(hop, call, delay) {
    const a = anchorOf(hop.from, call), b = anchorOf(hop.to, call);
    const dest = destClass(hop.to);
    if (!b) return 0;
    if (reduced || !a) { setTimeout(() => arrive(hop, b), delay); return 0; }
    if (Math.hypot(a.x - b.x, a.y - b.y) < 6) return 0;
    const amount = hop.tokens || (hop.bytes ? hop.bytes / 4 : 40);
    const size = 2.6 + 1.9 * Math.log10(amount + 1);
    const dur = (650 + 230 * Math.log10(amount + 1)) / Math.sqrt(Math.max(.5, sim.speed));
    const color = dest ? COLORS[dest] : KCOLORS[call.kind] || '#2a1b11';
    if (flights.length > 46) return 0;
    const g = document.createElementNS(NS, 'g');
    const lift = Math.min(160, Math.hypot(b.x - a.x, b.y - a.y) * .35);
    const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - lift;
    g.innerHTML = `<path class="trail" stroke="${color}" d="M${f1(a.x)},${f1(a.y)}Q${f1(cx)},${f1(cy)} ${f1(b.x)},${f1(b.y)}"/><g class="gl">${glyphFor(dest || 'note', size, color)}${amount >= 600 ? `<text class="lbl" x="${f1(size + 4)}" y="-4" fill="${color}">${esc(short(hop.what, 22))}</text>` : ''}</g>`;
    g.style.opacity = '0';
    flightsSvg.appendChild(g);
    flights.push({ g, gl: g.querySelector('.gl'), trail: g.querySelector('.trail'), a, b, cx, cy, start: performance.now() + delay, dur, hop });
    return dur;
  }
  function arrive(hop, b) {
    const dest = destClass(hop.to); if (!dest) return;
    const el = b && b.el ? b.el.closest('.dest, .row') || b.el : margin.querySelector(`#d-${dest}`);
    if (!el) return;
    el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 450);
  }
  function animateFlights(now) {
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      const t = (now - f.start) / f.dur;
      if (t < 0) continue;
      if (t >= 1) { f.g.remove(); flights.splice(i, 1); arrive(f.hop, f.b); continue; }
      const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = (1 - e) * (1 - e) * f.a.x + 2 * (1 - e) * e * f.cx + e * e * f.b.x;
      const y = (1 - e) * (1 - e) * f.a.y + 2 * (1 - e) * e * f.cy + e * e * f.b.y;
      f.gl.setAttribute('transform', `translate(${f1(x)},${f1(y)})`);
      f.g.style.opacity = String(t > .85 ? (1 - t) / .15 : Math.min(1, t * 6));
    }
  }
  function flyPhase(call, hops) {
    let delay = 0;
    for (const hop of hops) { const d = launch(hop, call, delay); delay += d * .85; }
  }
  function processPending() {
    while (pendingFlights.length) {
      const p = pendingFlights.shift();
      if (p.type === 'start') flyPhase(p.call, p.call.flow.slice(0, startHops.get(p.call.id) ?? 1));
      else if (p.type === 'end') flyPhase(p.call, endHops(p.call));
      else if (p.type === 'marker') {
        const m = p.marker;
        if (m.kind === 'prompt') flyPhase({ id: '-', lane: 'main', kind: 'memory' }, [{ from: 'user', to: 'context', what: 'prompt', tokens: m.detail.tokens }]);
        if (m.kind === 'turn-complete') flyPhase({ id: '-', lane: 'main', kind: 'memory' }, [{ from: 'model', to: 'answer', what: 'reply', tokens: 400 }]);
        if (m.kind === 'context-file' || m.kind === 'compaction') { const el = margin.querySelector('#d-context'); if (el) { el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 600); } }
      }
    }
  }

  // ---------- events ----------
  sim.on('tick', () => { lastTickNow = S.now; lastTickReal = performance.now(); marginDirty = true; });
  sim.on('start', c => { startHops.set(c.id, c.flow.length); scoreDirty = true; marginDirty = true; pendingFlights.push({ type: 'start', call: c }); });
  sim.on('end', c => { scoreDirty = true; marginDirty = true; pendingFlights.push({ type: 'end', call: c }); });
  sim.on('marker', m => { scoreDirty = true; marginDirty = true; pendingFlights.push({ type: 'marker', marker: m }); });
  sim.on('lane', () => { scoreDirty = true; marginDirty = true; });
  sim.on('tasks', () => { marginDirty = true; });

  // ---------- header ----------
  function sessionStatus() {
    if (S.session.status === 'complete') return ['turn complete', 'complete'];
    return dispNow - lastRecord() < 15000 ? ['recent activity', 'active'] : ['quiet', 'quiet'];
  }
  function renderHeader() {
    const s = S.session;
    $('#work').textContent = s.name;
    $('#worksub').textContent = `A session score for ${s.project} · in ${ROMAN(Math.max(1, s.turn))} movements so far`;
    const [st, cls] = sessionStatus();
    const rows = [['Session', s.id.slice(0, 13) + '…'], ['Provider', s.provider], ['Model', s.model], ['Branch', s.branch], ['Status', `<span class="status-${cls}">${st}</span>`], ['Last record', fmtAgo(dispNow - lastRecord())], ['Turn', ROMAN(Math.max(1, s.turn)) + ` (${s.turn})`], ['Clock', fmtT(dispNow)]];
    $('#ident').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${k === 'Status' ? v : esc(v)}</dd></div>`).join('');
    const mode = $('#mode');
    mode.className = 'mode ' + (live ? (sim.running ? 'live' : 'paused') : 'inspect');
    $('#mode-text').textContent = live ? (sim.running ? 'Live · a tempo' : 'Live · paused (tacet)') : `Inspecting ${fmtT(inspectAt)} · ad lib.`;
    document.body.classList.toggle('inspecting', !live);
  }

  // ---------- margin: the conductor's summary ----------
  function kindGlyph(kind) {
    const c = KCOLORS[kind];
    const st = '<g stroke="#c4a984" stroke-width=".6">' + [3, 6, 9, 12].map(y => `<line x1="0" x2="26" y1="${y}" y2="${y}"/>`).join('') + '</g>';
    const inner = {
      files: `<ellipse cx="9" cy="10.5" rx="3.4" ry="2.4" transform="rotate(-22 9 10.5)" fill="${c}"/><line x1="12" y1="10.5" x2="12" y2="0" stroke="${c}" stroke-width="1.2"/>`,
      edits: `<path d="M6,1L13,3L6,5" fill="none" stroke="${c}" stroke-width="1.2"/><ellipse cx="10" cy="9" rx="3.4" ry="2.4" transform="rotate(-22 10 9)" fill="${c}"/><text x="15" y="16" font-size="7" font-style="italic" font-weight="bold" fill="${c}">ff</text>`,
      network: `<g fill="${c}"><ellipse cx="5" cy="12" rx="2.6" ry="1.9"/><ellipse cx="12" cy="9" rx="2.6" ry="1.9"/><ellipse cx="19" cy="6" rx="2.6" ry="1.9"/></g><path d="M7,12V2M14,9V2M21,6V2M7,2H21" stroke="${c}" stroke-width="1.1" fill="none"/><path d="M17,1A3,3 0 0 1 23,1" fill="none" stroke="${c}"/>`,
      shell: `<path d="M2,10L8,10L5,5Z" fill="${c}"/><rect x="9" y="6" width="15" height="5" fill="none" stroke="${c}" stroke-width=".7"/><path d="M10,11L13,6M14,11L17,6M18,11L21,6" stroke="${c}"/>`,
      agents: `<path d="M5,2V14" stroke="${c}" stroke-width="2.4"/><path d="M5,2Q9,2 11,0M5,14Q9,14 11,16" stroke="${c}" fill="none"/><text x="12" y="11" font-size="7" font-style="italic" fill="${c}">div.</text>`,
      memory: `<rect x="3" y="3" width="14" height="10" fill="#fbf7ec" stroke="${c}" stroke-width="1.2"/><text x="6.5" y="11" font-size="8" font-weight="bold" fill="${c}">A</text>`,
      other: `<text x="1" y="8" font-size="8" font-style="italic" font-weight="bold" fill="${c}">tr</text><path d="M9,5Q11,2 13,5T17,5T21,5T25,5" stroke="${c}" fill="none"/><ellipse cx="5" cy="12" rx="2.8" ry="2" fill="${c}"/>`
    }[kind];
    return `<svg class="glyph" viewBox="0 0 26 16" aria-hidden="true">${st}${inner}</svg>`;
  }
  function filePitchGlyph(path) {
    const p = pitchOf(path); const y = 13 - p * 1.25;
    return `<svg class="glyph" viewBox="0 0 26 16" aria-hidden="true"><g stroke="#c4a984" stroke-width=".6">${[3, 5.5, 8, 10.5, 13].map(v => `<line x1="0" x2="26" y1="${v}" y2="${v}"/>`).join('')}</g><ellipse cx="13" cy="${f1(y)}" rx="2.6" ry="1.8" transform="rotate(-22 13 ${f1(y)})" fill="#a86a12"/></svg>`;
  }
  function contextHistorySvg(w, h, minutes) {
    const tEnd = dispNow, tStart = tEnd - minutes * 60000;
    const xs = t => (t - tStart) / (tEnd - tStart) * w, ys = p => h - 4 - p / 100 * (h - 8);
    const samples = S.context.samples.filter(s => s.time >= tStart);
    let pts = samples.map(s => `${f1(xs(s.time))},${f1(ys(s.percent))}`);
    if (samples.length) pts.push(`${f1(w)},${f1(ys(S.context.percent))}`);
    let s = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" aria-label="Context window history" role="img">`;
    s += `<line x1="0" x2="${w}" y1="${f1(ys(70))}" y2="${f1(ys(70))}" stroke="#c4870b" stroke-dasharray="3 3" stroke-width=".8"/><line x1="0" x2="${w}" y1="${f1(ys(90))}" y2="${f1(ys(90))}" stroke="#a3132c" stroke-dasharray="3 3" stroke-width=".8"/>`;
    s += `<text x="${w - 2}" y="${f1(ys(70) - 2)}" font-size="8" text-anchor="end" fill="#c4870b" font-style="italic">70% ff</text><text x="${w - 2}" y="${f1(ys(90) - 2)}" font-size="8" text-anchor="end" fill="#a3132c" font-style="italic">90% fff</text>`;
    if (pts.length > 1) s += `<polygon points="${f1(xs(samples[0].time))},${h} ${pts.join(' ')} ${w},${h}" fill="#1c4870" opacity=".1"/><polyline points="${pts.join(' ')}" fill="none" stroke="#1c4870" stroke-width="1.3"/>`;
    for (const m of S.markers) if (m.time >= tStart && m.kind === 'compaction') { const x = xs(m.time); s += `<line x1="${f1(x)}" x2="${f1(x)}" y1="4" y2="${h}" stroke="#a86a12" stroke-dasharray="2 2"/><text x="${f1(x + 2)}" y="10" font-size="10" fill="#a86a12" font-weight="bold">𝄋</text>`; }
    for (const m of S.markers) if (m.time >= tStart && m.kind === 'prompt') { const x = xs(m.time); s += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${h - 8}" y2="${h}" stroke="#2a1b11"/>`; }
    return s + '</svg>';
  }
  function hairpinMeter(pct, w) {
    const h = 26, px = clamp(pct, 0, 100) / 100 * w;
    const col = pct >= 90 ? '#a3132c' : pct >= 70 ? '#c4870b' : '#1c4870';
    const half = x => 1 + (x / w) * (h / 2 - 2);
    return `<svg viewBox="0 0 ${w} ${h + 10}" width="100%" height="${h + 10}" role="img" aria-label="Context ${pct}% used">
      <polygon points="0,${h / 2} ${f1(px)},${f1(h / 2 - half(px))} ${f1(px)},${f1(h / 2 + half(px))}" fill="${col}" opacity=".85"/>
      <path d="M${w},1L0,${h / 2}L${w},${h - 1}" fill="none" stroke="#2a1b11" stroke-width="1.2"/>
      <line x1="${f1(w * .7)}" x2="${f1(w * .7)}" y1="0" y2="${h + 2}" stroke="#c4870b" stroke-width="1.2"/><line x1="${f1(w * .9)}" x2="${f1(w * .9)}" y1="0" y2="${h + 2}" stroke="#a3132c" stroke-width="1.2"/>
      <text x="${f1(w * .7)}" y="${h + 10}" font-size="8.5" text-anchor="middle" fill="#c4870b">70</text><text x="${f1(w * .9)}" y="${h + 10}" font-size="8.5" text-anchor="middle" fill="#a3132c">90</text>
      <text x="2" y="${h + 10}" font-size="8.5" fill="#8a735d" font-style="italic">pp</text><text x="${w - 2}" y="${h + 10}" font-size="8.5" fill="#8a735d" text-anchor="end" font-style="italic">fff</text></svg>`;
  }
  function foldedActivity(limit) {
    const recent = S.calls.slice(-80).reverse();
    const out = [];
    for (const c of recent) {
      const prev = out[out.length - 1];
      const key = `${c.lane}|${c.tool}|${c.target ? c.target.value : ''}|${c.status}`;
      if (prev && prev.key === key) { prev.n++; prev.ids.push(c.id); continue; }
      out.push({ key, c, n: 1, ids: [c.id] });
      if (out.length >= limit) break;
    }
    return out;
  }
  function renderMargin() {
    marginDirty = false;
    const st = margin.scrollTop;
    const focusKey = document.activeElement && margin.contains(document.activeElement) ? document.activeElement.getAttribute('data-open') : null;
    const ctx = S.context; const pct = ctx.percent;
    const files = Object.values(S.files).sort((a, b) => b.lastTouched - a.lastTouched);
    const shells = S.calls.filter(c => c.kind === 'shell');
    const lastShell = [...shells].reverse().find(c => c.status !== 'running');
    const tasks = S.tasks.items;
    const done = tasks.filter(t => t.status === 'completed').length, prog = tasks.filter(t => t.status === 'in_progress').length;
    const runningLanes = S.lanes.filter(l => l.depth && l.state === 'running').length;
    const webCalls = S.calls.filter(c => c.kind === 'network' || c.kind === 'other');
    const turns = S.markers.filter(m => m.kind === 'turn-complete').length;
    const lastFile = files[0];
    let h = '';
    h += `<section><h2>Where it went <small>destinations</small></h2><div class="dests">
      <button id="d-context" class="dest d-context" data-open="context"><span class="dn">Context</span><span class="dv">${pct}%</span><span class="ds">${fmtK(ctx.used)} tokens</span></button>
      <button id="d-files" class="dest d-files" data-open="files"><span class="dn">Files</span><span class="dv">${files.length}</span><span class="ds">${lastFile ? esc(base(lastFile.path)) : '—'}</span></button>
      <button id="d-terminal" class="dest d-terminal" data-open="terminal"><span class="dn">Terminal</span><span class="dv">${shells.length}</span><span class="ds">${lastShell ? (lastShell.status === 'error' ? '✗ ' + esc(lastShell.error.code) : 'exit 0') : '—'}</span></button>
      <button id="d-plan" class="dest d-plan" data-open="plan"><span class="dn">Task list</span><span class="dv">${done}/${tasks.length}</span><span class="ds">${prog} in progress</span></button>
      <button id="d-lanes" class="dest d-lanes" data-open="lanes"><span class="dn">Lanes</span><span class="dv">${S.lanes.length}</span><span class="ds">${runningLanes} playing</span></button>
      <button id="d-web" class="dest d-web" data-open="web"><span class="dn">Web · MCP</span><span class="dv">${webCalls.length}</span><span class="ds">sources</span></button>
      <button id="d-reply" class="dest d-reply" data-open="reply"><span class="dn">Reply</span><span class="dv">${turns}</span><span class="ds">turns done</span></button>
      <button class="dest" data-open="errors" style="color:var(--crimson)"><span class="dn">Wrong notes</span><span class="dv">${S.errors.length}</span><span class="ds">tool errors</span></button>
    </div></section>`;
    const dyn = dynOfPct(pct);
    h += `<section><h2>Dynamics <small>context window</small></h2>
      <button class="dynrow" data-open="context"><span class="dynmark ${pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : ''}">${dyn}</span><span style="flex:1">${hairpinMeter(pct, 250)}<span class="dynmeta">${pct}% · ${fmtK(ctx.used)} of ${fmtK(ctx.capacity)} · ${ctx.compactions} compaction${ctx.compactions === 1 ? '' : 's'} (𝄋)</span></span></button>
      ${contextHistorySvg(340, 54, 30)}
      <ul class="ctx-files">${ctx.files.map(f => `<li><button class="lk" data-open="context">${esc(f.path)}</button><span class="meta" style="color:var(--ink-3);font-size:10.5px">${fmtK(f.tokens)} · ${fmtT(f.loadedAt)}</span></li>`).join('') || '<li class="muted">No context files yet</li>'}</ul></section>`;
    const esp = sim.errorsSincePrompt();
    const running = sim.runningCalls();
    const sounding = new Set(running.map(c => c.kind));
    h += `<section><h2>Instrumentation <small>calls · errors since prompt</small></h2><table class="kinds"><tbody>${KIND_ORDER.map(k => `<tr class="${sounding.has(k) ? 'sounding' : ''}" data-open="kind:${k}" tabindex="0"><td>${kindGlyph(k)}</td><td><span class="k-${k}">${KIND[k].role}</span> <span class="i">${KIND[k].inst}${sounding.has(k) ? ' · sounding' : ''}</span></td><td class="n">${S.counts[k]}</td><td class="e">${esp[k] ? `✗ ${esp[k]}` : ''}</td></tr>`).join('')}</tbody></table>
      <div class="totals"><span>Total <b>${S.calls.length}</b> calls</span><span>Now: <b>${running.length ? esc(running.map(c => KIND[c.kind].role).filter((v, i, a) => a.indexOf(v) === i).join(', ')) : 'tacet'}</b></span><span class="bad">✗ ${S.errors.length} tool errors</span></div></section>`;
    h += `<section><h2>Programme <small>task list</small></h2><div class="prog-sum">${done} of ${tasks.length} completed · ${prog} in progress · ${tasks.length - done - prog} not started</div><ul class="rows">${tasks.map(t => `<li><button class="row" data-open="plan"><span class="st-${t.status}">${t.status === 'completed' ? '●' : t.status === 'in_progress' ? '◐' : '○'}</span><span class="grow">No. ${esc(t.id)} ${esc(t.label)}</span><span class="hist" title="${esc(t.history.map(x => `${fmtT(x.time)} ${x.status}`).join('\n'))}">${t.history.map(x => x.status === 'completed' ? '●' : x.status === 'in_progress' ? '◐' : '○').join('')}</span></button></li>`).join('') || '<li class="muted">No plan yet</li>'}</ul></section>`;
    h += `<section><h2>Motifs <small>files · R reads · E edits</small></h2><ul class="rows">${files.slice(0, 12).map(f => `<li><button class="row" data-open="file:${esc(f.path)}" data-file="${esc(f.path)}">${filePitchGlyph(f.path)}<span class="grow">${esc(f.path)}</span>${f.edits >= 3 ? '<span class="hot">hot</span>' : ''}<span class="meta">R${f.reads} E${f.edits}${f.failed ? ` <span class="bad">✗${f.failed}</span>` : ''} <span class="good">+${f.added}</span> <span class="bad" style="font-weight:normal">−${f.removed}</span></span></button></li>`).join('')}</ul>${files.length > 12 ? `<button class="lk" data-open="files">all ${files.length} files…</button>` : ''}</section>`;
    h += `<section><h2>Sections <small>agent lanes</small></h2><ul class="rows">${S.lanes.map(l => `<li><button class="row lane-row" style="--d:${l.depth}" data-open="lane:${esc(l.key)}"><span class="${l.state === 'failed' ? 'bad' : l.state === 'completed' ? 'good' : ''}">${statusSym(l.state === 'running' ? 'running' : l.state)}</span><span class="grow">${ROMAN(laneIndex(l.key))}. ${esc(l.label)}</span><span class="meta">${l.calls} calls${l.errors ? ` <span class="bad">✗${l.errors}</span>` : ''} · ${fmtK(l.tokens)} tok · ${fmtT(l.startedAt)}${l.endedAt ? '–' + fmtT(l.endedAt) : '–'}</span></button></li>`).join('')}</ul></section>`;
    h += `<section><h2>Wrong notes <small>${S.errors.length} tool errors</small></h2><ul class="rows">${[...S.errors].reverse().slice(0, 6).map(c => { const nx = nextAfterError(c); return `<li><button class="row err" data-open="error:${c.id}"><span>✗</span><span class="grow"><b>${esc(c.error.code)}</b> ${esc(c.tool)} · ${esc(laneShort(laneOf(c.lane)))}</span><span class="meta ${nx.ok ? 'good' : ''}">${esc(short(nx.text, 26))}</span></button></li>`; }).join('') || '<li class="muted">None yet</li>'}</ul></section>`;
    h += `<section><h2>Recent passages <small>similar folded ×N</small></h2><ul class="rows">${foldedActivity(12).map(e => `<li><button class="row${e.c.status === 'error' ? ' err' : ''}" data-open="call:${e.c.id}"><span class="k-${e.c.kind}">${statusSym(e.c.status)}</span><span class="grow"><span class="k-${e.c.kind}">${esc(e.c.tool)}</span> ${esc(short(e.c.target ? base(e.c.target.value) : e.c.label, 34))}${e.c.lane !== 'main' ? ` <i style="color:var(--k-agents)">(${esc(laneShort(laneOf(e.c.lane)))})</i>` : ''}</span>${e.n > 1 ? `<span class="x">×${e.n}</span>` : ''}<span class="meta">${fmtT(e.c.startedAt)}</span></button></li>`).join('')}</ul></section>`;
    margin.innerHTML = h;
    margin.scrollTop = st;
    if (focusKey) { const el = margin.querySelector(`[data-open="${CSS.escape(focusKey)}"]`); if (el) el.focus({ preventScroll: true }); }
  }

  // ---------- condensed score (overview) ----------
  const OV_SPAN = 30 * 60000;
  let ovGeom = null;
  function renderOverview() {
    const W = ov.clientWidth, H = ov.clientHeight || 70;
    const tEnd = dispNow, tStart = tEnd - OV_SPAN;
    const L = 48, R = 10;
    const xo = t => L + (t - tStart) / OV_SPAN * (W - L - R);
    ovGeom = { tStart, L, R, W };
    let s = '';
    const rowY = i => 14 + i * ((H - 22) / KIND_ORDER.length);
    KIND_ORDER.forEach((k, i) => { s += `<line x1="${L}" x2="${W - R}" y1="${f1(rowY(i) + 2)}" y2="${f1(rowY(i) + 2)}" stroke="#dccbaa" stroke-width=".6"/><text x="${L - 4}" y="${f1(rowY(i) + 5)}" font-size="7.5" text-anchor="end" fill="${KCOLORS[k]}">${KIND[k].role}</text>`; });
    for (let m = 0; m <= 30; m += 5) { const x = xo(tEnd - m * 60000); s += `<text x="${f1(x)}" y="${H - 1}" font-size="8" text-anchor="middle" fill="#8a735d">${m ? `−${m}m` : 'now'}</text>`; }
    const pts = S.context.samples.filter(p => p.time >= tStart).map(p => `${f1(xo(p.time))},${f1(H - 10 - p.percent / 100 * (H - 22))}`);
    if (pts.length > 1) s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#1c4870" stroke-width="1" opacity=".3"/>`;
    for (const c of S.calls) {
      if ((c.endedAt || dispNow) < tStart) continue;
      const i = KIND_ORDER.indexOf(c.kind); const x = xo(c.startedAt);
      const w = Math.max(1.2, ((c.endedAt || dispNow) - c.startedAt) / OV_SPAN * (W - L - R));
      s += `<rect x="${f1(x)}" y="${f1(rowY(i) - .5)}" width="${f1(w)}" height="5" fill="${KCOLORS[c.kind]}" opacity="${c.lane === 'main' ? .9 : .5}"/>`;
      if (c.status === 'error') s += `<path d="M${f1(x - 2.5)},2.5L${f1(x + 2.5)},7.5M${f1(x - 2.5)},7.5L${f1(x + 2.5)},2.5" stroke="#a3132c" stroke-width="1.6"/>`;
    }
    let lastNum = -1e9;
    for (const m of S.markers) {
      if (m.time < tStart) continue; const x = xo(m.time);
      if (m.kind === 'prompt') { const num = ROMAN(promptNumber(m)); s += `<line x1="${f1(x - 1)}" x2="${f1(x - 1)}" y1="10" y2="${H - 10}" stroke="#2a1b11" opacity=".7"/><line x1="${f1(x + 1)}" x2="${f1(x + 1)}" y1="10" y2="${H - 10}" stroke="#2a1b11" opacity=".7"/>`; if (x - lastNum > num.length * 5 + 8) { lastNum = x; s += `<text x="${f1(x + 3)}" y="9" font-size="8.5" font-weight="bold" fill="#2a1b11">${num}</text>`; } }
      else if (m.kind === 'turn-complete') s += `<line x1="${f1(x)}" x2="${f1(x)}" y1="12" y2="${H - 10}" stroke="#2a1b11" stroke-width="2.2"/><path d="M${f1(x - 3.5)},10A3.5,3.5 0 0 1 ${f1(x + 3.5)},10" fill="none" stroke="#2a1b11"/>`;
      else if (m.kind === 'compaction') s += `<text x="${f1(x - 3)}" y="10" font-size="10" font-weight="bold" fill="#a86a12">S</text><line x1="${f1(x)}" x2="${f1(x)}" y1="12" y2="${H - 10}" stroke="#a86a12" stroke-dasharray="2 2"/>`;
    }
    // the window currently shown in the score
    const anchor = currentAnchor(); const vs = anchor - (viewW() - LOOK) / pps * 1000, ve = anchor + LOOK / pps * 1000;
    const wx0 = Math.max(L, xo(vs)), wx1 = Math.min(W - R, xo(ve));
    s += `<rect x="${f1(wx0)}" y="1" width="${f1(Math.max(3, wx1 - wx0))}" height="${H - 11}" fill="${live ? 'rgba(43,102,86,.10)' : 'rgba(168,106,18,.16)'}" stroke="${live ? '#2b6656' : '#a86a12'}" stroke-width="1.3"/>`;
    if (!live) s += `<line x1="${f1(xo(dispNow))}" x2="${f1(xo(dispNow))}" y1="0" y2="${H - 10}" stroke="#1c4870" stroke-width="1.4"/>`;
    ov.setAttribute('viewBox', `0 0 ${W} ${H}`);
    ov.innerHTML = s;
  }
  function ovTime(clientX) { const r = ov.getBoundingClientRect(); const g = ovGeom; return g.tStart + clamp((clientX - r.left - g.L) / (g.W - g.L - g.R), 0, 1) * OV_SPAN; }
  function inspectCentered(t) {
    const span = viewW() / pps * 1000;
    const a = t + span / 2 - LOOK / pps * 1000;
    if (a >= dispNow - 500) return goLive();
    live = false; inspectAt = Math.max(T0, a); scoreDirty = true; renderHeader();
  }
  function goLive() { live = true; scoreDirty = true; renderHeader(); }
  let ovDrag = false;
  ov.addEventListener('pointerdown', e => { ovDrag = true; ov.setPointerCapture(e.pointerId); inspectCentered(ovTime(e.clientX)); });
  ov.addEventListener('pointermove', e => { if (ovDrag) inspectCentered(ovTime(e.clientX)); });
  ov.addEventListener('pointerup', () => { ovDrag = false; });

  // ---------- drill-down: programme notes ----------
  const panel = $('#panel'), panelBody = $('#panel-body');
  let panelKey = null; const history = [];
  function nodeLink(id) {
    if (!id) return '';
    if (id === 'context') return lk('context', 'Context window');
    if (id.startsWith('file:')) return lk(id, id.slice(5));
    if (id === 'terminal') return lk('terminal', 'Terminal');
    if (id === 'plan') return lk('plan', 'Task list');
    if (id === 'answer') return lk('reply', 'Reply to user');
    if (id.startsWith('lane:')) { const l = laneOf(id.slice(5)); return lk(id, l ? l.label : id); }
    if (id.startsWith('web:') || id.startsWith('mcp:')) return lk(id.startsWith('web:') ? id : 'web:' + id, id.replace(/^web:/, ''));
    if (id.startsWith('tool:')) { const k = id.slice(5); return `<span class="k-${k}">${KIND[k] ? KIND[k].role + ' tool' : k}</span>`; }
    if (id.startsWith('ctxfile:')) return lk('context', id.slice(8));
    if (id === 'model') return 'Model (main)';
    if (id === 'user') return 'User prompt';
    return esc(id);
  }
  const callLink = (c, text) => c ? `${lk('call:' + c.id, text || `${c.tool} · ${c.label}`, c.status === 'error' ? 'bad' : '')} <span class="muted">${statusSym(c.status)} ${fmtT(c.startedAt)}</span>` : '—';
  const dl = rows => `<dl>${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  const val = v => typeof v === 'string' ? esc(v) : esc(JSON.stringify(v));
  const gotoBtn = t => `<button class="btn small" data-goto="${t}">Show in score</button>`;
  function diffHtml(diff) {
    if (!diff) return '';
    return `<div><span style="color:#2b6656">+${diff.added}</span> <span style="color:var(--crimson)">−${diff.removed}</span></div>${(diff.hunks || []).map(hk => `<pre><span class="at">@@ line ${hk.at} @@</span>\n${hk.lines.map(line => `<span class="${line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : ''}">${esc(line)}</span>`).join('\n')}</pre>`).join('')}`;
  }
  function errorBox(c) {
    const nx = nextAfterError(c);
    return `<div class="errbox"><div class="code">✗ ${esc(c.error.code)} — ${esc(c.error.name || '')}</div><div>${esc(c.error.message)}</div><div class="muted">Hint: ${esc(c.error.hint || '—')}</div>
      <div style="margin-top:4px"><b>What happened next:</b> ${nx.ok ? '<span style="color:#2b6656">' : ''}${esc(nx.text)}${nx.ok ? '</span>' : ''}${nx.call ? ' — ' + callLink(nx.call) : ''}</div>
      ${nx.retries.length ? `<div>Retries: ${nx.retries.map(r => callLink(r, `attempt ${r.attempt}`)).join(', ')}</div>` : ''}</div>`;
  }
  function callDetail(c) {
    const k = KIND[c.kind];
    const lane = laneOf(c.lane);
    const dur = (c.endedAt || dispNow) - c.startedAt;
    const caused = S.calls.filter(x => x.causedBy === c.id);
    const retries = S.calls.filter(x => x.retryOf === c.id);
    const o = c.output || {};
    let h = `<div class="kicker k-${c.kind}">${esc(k.inst)} · ${esc(k.role)}</div><h1>${esc(c.tool)} — ${esc(c.label)}</h1><div>${pill(c.status)} ${c.attempt > 1 ? `<span class="pill">attempt ${c.attempt}</span>` : ''} ${gotoBtn(c.startedAt)}</div>`;
    if (c.error) h += errorBox(c);
    h += `<h3>The call</h3>` + dl([
      ['Lane', lk('lane:' + c.lane, lane ? `${ROMAN(laneIndex(c.lane))}. ${lane.label}` : c.lane)],
      ['Target', c.target ? `<i>${esc(c.target.type)}</i> ${c.target.type === 'file' ? lk('file:' + (fileOfCall(c) || c.target.value), c.target.value) : c.target.type === 'url' ? lk('web:' + hostOf(c.target.value), c.target.value) : c.target.type === 'agent' && spawnedLane(c) ? lk('lane:' + spawnedLane(c).key, c.target.value) : esc(c.target.value)}` : '—'],
      ['Started', fmtT(c.startedAt)],
      ['Duration', c.endedAt ? fmtDur(dur) : `${fmtDur(dur)} so far (running)`],
      ['Status', pill(c.status)],
      ['Tokens', `in ${c.tokens.in} · out ${c.tokens.out}`],
      ['Context after', c.contextAfter ? `${c.contextAfter.percent}% (${fmtK(c.contextAfter.used)})` : c.status === 'running' ? '—' : 'not counted (subagent lane)'],
      ['Notation', `<span class="muted">${esc(k.notation)}</span>`]
    ]);
    h += `<h3>Input arguments</h3>` + dl(Object.entries(c.input || {}).map(([kk, v]) => [kk, `<code>${val(v)}</code>`]));
    h += `<h3>Output</h3>` + (c.status === 'running' ? '<div class="muted">Still sounding…</div>' : dl([
      ['Summary', esc(o.summary || '—')],
      o.exitCode !== undefined ? ['Exit code', o.exitCode === null ? 'none' : String(o.exitCode)] : null,
      o.status ? ['HTTP status', String(o.status)] : null,
      o.lines ? ['Lines', String(o.lines)] : null,
      o.bytes ? ['Bytes', fmtK(o.bytes)] : null,
      o.tests ? ['Tests', `<span style="color:#2b6656">${o.tests.passed} passed</span> · <span style="color:var(--crimson)">${o.tests.failed} failed</span> · ${o.tests.skipped} skipped${o.tests.failures.length ? `<br>Failing: ${o.tests.failures.map(esc).join(', ')}` : ''}`] : null
    ]) + (o.preview ? `<pre>${o.preview.map(esc).join('\n')}</pre>` : ''));
    if (c.diff) h += `<h3>Diff</h3>` + diffHtml(c.diff);
    h += `<h3>Flow — every hop</h3><ol>${c.flow.map((hop, i) => `<li>${nodeLink(hop.from)} → ${nodeLink(hop.to)} · <i>${esc(hop.what)}</i>${hop.tokens ? ` · ${fmtK(hop.tokens)} tok` : ''}${hop.bytes ? ` · ${fmtK(hop.bytes)} B` : ''}${i < (startHops.get(c.id) ?? 1) ? ' <span class="muted">(at start)</span>' : ''}</li>`).join('')}</ol>`;
    h += `<h3>References</h3>${c.refs.length ? `<ul>${c.refs.map(r => `<li><i>${esc(r.role)}</i> ${r.type === 'file' ? lk('file:' + r.value, r.value) : r.type === 'lane' ? lk('lane:' + r.value, (laneOf(r.value) || {}).label || r.value) : r.type === 'url' ? lk('web:' + hostOf(r.value), r.title ? `${r.title} (${r.value})` : r.value) : r.type === 'task' ? lk('plan', `task ${r.value}`) : esc(r.value)}</li>`).join('')}</ul>` : '<div class="muted">None</div>'}`;
    h += `<h3>Cause and effect (slurs)</h3>` + dl([
      ['Caused by', c.causedBy ? callLink(sim.callById(c.causedBy)) : '<span class="muted">nothing recorded</span>'],
      ['Led to', caused.length ? caused.map(x => callLink(x)).join('<br>') : '<span class="muted">nothing yet</span>'],
      ['Retry of', c.retryOf ? callLink(sim.callById(c.retryOf)) : '—'],
      ['Retried by', retries.length ? retries.map(x => callLink(x, `attempt ${x.attempt}`)).join('<br>') : '—']
    ]) + (c.causedBy || caused.length ? `<div style="margin-top:4px">${lk('chain:' + c.id, 'Show the whole chain')}</div>` : '');
    return h;
  }
  function fileDetail(path) {
    const f = S.files[path] || { path, reads: 0, edits: 0, failed: 0, added: 0, removed: 0, touches: [], lines: '?' };
    const calls = sim.callsForFile(path);
    let h = `<div class="kicker">Motif · file on disk</div><h1>${esc(path)}</h1>` + dl([
      ['Pitch', `${filePitchGlyph(path)} <span class="muted">this file's note on the strings and horns staves</span>`],
      ['Lines', String(f.lines)], ['Reads', String(f.reads)], ['Edits', String(f.edits) + (f.edits >= 3 ? ' <span class="pill error">hot</span>' : '')], ['Failed calls', f.failed ? `<span style="color:var(--crimson)">${f.failed}</span>` : '0'], ['Lines changed', `<span style="color:#2b6656">+${f.added}</span> <span style="color:var(--crimson)">−${f.removed}</span>`]
    ]);
    h += `<h3>Every call that touched it (${calls.length})</h3>`;
    h += calls.map(c => `<div style="margin:6px 0">${callLink(c)} <span class="muted">· ${esc(laneShort(laneOf(c.lane)))}</span>${c.error ? `<div style="color:var(--crimson)">✗ ${esc(c.error.code)}: ${esc(c.error.message)}</div>` : ''}${c.diff ? diffHtml(c.diff) : c.output && c.output.summary ? `<div class="muted">${esc(c.output.summary)}</div>` : ''}</div>`).join('') || '<div class="muted">No calls</div>';
    return h;
  }
  function contextDetail() {
    const ctx = S.context;
    const contrib = new Map();
    for (const s of ctx.samples) if (s.delta > 0) { const k = s.why; const e = contrib.get(k) || { why: k, tokens: 0, n: 0, callId: s.callId }; e.tokens += s.delta; e.n++; contrib.set(k, e); }
    const top = [...contrib.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 10);
    const max = top[0] ? top[0].tokens : 1;
    const big = ctx.samples.filter(s => s.callId && s.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 8);
    let h = `<div class="kicker">Destination · context window</div><h1>Context window — <i>${dynOfPct(ctx.percent)}</i></h1>` + dl([
      ['Used', `${ctx.percent}% · ${fmtK(ctx.used)} of ${fmtK(ctx.capacity)} tokens`], ['Level', ctx.percent >= 90 ? '<b style="color:var(--crimson)">red — over 90%</b>' : ctx.percent >= 70 ? '<b style="color:var(--amber)">amber — over 70%</b>' : 'below amber (70%)'], ['Compactions', String(ctx.compactions)]
    ]);
    h += `<h3>History (30 min)</h3>${contextHistorySvg(450, 90, 30)}`;
    h += `<h3>What filled it (by reason)</h3><table>${top.map(e => `<tr><td>${esc(e.why)}</td><td>${e.n}×</td><td style="width:40%"><span class="bar-in" style="width:${f1(e.tokens / max * 70)}%"></span> ${fmtK(e.tokens)}</td></tr>`).join('')}</table>`;
    h += `<h3>Biggest single contributors</h3><ol>${big.map(s => `<li>${callLink(sim.callById(s.callId))} · +${fmtK(s.delta)}</li>`).join('')}</ol>`;
    h += `<h3>Compactions (dal segno)</h3>${S.markers.filter(m => m.kind === 'compaction').map(m => `<div>𝄋 ${fmtT(m.time)} — ${esc(m.label)}</div>`).join('') || '<div class="muted">None yet</div>'}`;
    h += `<h3>Context files</h3><table>${ctx.files.map(f => `<tr><td>${esc(f.path)}</td><td>${fmtK(f.tokens)}</td><td class="muted">${esc(f.why)} · ${fmtT(f.loadedAt)}</td></tr>`).join('')}</table>`;
    h += `<h3>Recent fills</h3><ol>${ctx.samples.slice(-12).reverse().map(s => `<li>${fmtT(s.time)} ${s.delta >= 0 ? '+' : ''}${fmtK(s.delta)} · ${s.callId ? lk('call:' + s.callId, s.why) : esc(s.why)} → ${s.percent}%</li>`).join('')}</ol>`;
    return h;
  }
  function terminalDetail() {
    const shells = S.calls.filter(c => c.kind === 'shell').reverse();
    return `<div class="kicker">Destination · terminal</div><h1>Terminal — timpani part</h1><div>${shells.length} commands · ${shells.filter(c => c.status === 'error').length} failed</div>
      <table><tr><th>Time</th><th>Command</th><th>Lane</th><th>Exit</th><th>Dur.</th></tr>${shells.map(c => `<tr><td>${fmtT(c.startedAt)}</td><td>${lk('call:' + c.id, c.target.value, c.status === 'error' ? 'bad' : '')}${c.attempt > 1 ? ` <i>(attempt ${c.attempt})</i>` : ''}</td><td>${esc(laneShort(laneOf(c.lane)))}</td><td>${c.status === 'running' ? '◔' : c.status === 'error' ? `<b style="color:var(--crimson)">✗ ${esc(c.error.code)}</b>` : 'exit 0'}</td><td>${c.endedAt ? fmtDur(c.endedAt - c.startedAt) : '…'}</td></tr>`).join('')}</table>`;
  }
  function planDetail() {
    const items = S.tasks.items; const done = items.filter(t => t.status === 'completed').length, prog = items.filter(t => t.status === 'in_progress').length;
    return `<div class="kicker">Destination · task list</div><h1>Programme — the task list</h1><div>${done} of ${items.length} completed · ${prog} in progress · ${items.length - done - prog} not started · source ${esc(S.tasks.source)}</div>
      ${items.map(t => `<h3>No. ${esc(t.id)} — ${esc(t.label)} <span class="st-${t.status}">(${esc(t.status)})</span></h3><ol>${t.history.map(x => `<li>${fmtT(x.time)} <span class="st-${x.status}">${esc(x.status)}</span> · ${lk('call:' + x.callId, 'by ' + (sim.callById(x.callId) || {}).tool)}</li>`).join('')}</ol>`).join('')}
      <h3>Plan calls (rehearsal marks)</h3><ol>${S.calls.filter(c => c.kind === 'memory').reverse().slice(0, 30).map(c => `<li>${callLink(c, `${c.tool}: ${c.output ? c.output.summary : 'running'}`)}</li>`).join('')}</ol>`;
  }
  function webDetail(host) {
    const calls = S.calls.filter(c => c.kind === 'network' || c.kind === 'other');
    const hostOfCall = c => c.target && c.target.type === 'url' ? hostOf(c.target.value) : c.kind === 'other' ? 'mcp:github' : 'web search';
    const groups = new Map(); for (const c of calls) { const k = hostOfCall(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    const sel = host ? host.replace(/^web:/, '') : null;
    let h = `<div class="kicker">Source · web hosts and MCP (woodwinds, celesta)</div><h1>${sel ? esc(sel) : 'Web and MCP sources'}</h1>`;
    for (const [k, list] of groups) {
      if (sel && k !== sel) continue;
      h += `<h3>${esc(k)} — ${list.length} call${list.length === 1 ? '' : 's'}</h3><table>${list.reverse().map(c => `<tr><td>${fmtT(c.startedAt)}</td><td>${lk('call:' + c.id, c.tool + (c.target ? ' ' + short(c.target.value, 46) : ''), c.status === 'error' ? 'bad' : '')}</td><td>${c.status === 'error' ? `<b style="color:var(--crimson)">✗ ${esc(c.error.code)}</b>` : c.status === 'running' ? '◔' : c.output && c.output.status ? 'HTTP ' + c.output.status : '✓'}</td></tr>`).join('')}</table>`;
    }
    if (sel) h += `<div style="margin-top:6px">${lk('web', 'All sources')}</div>`;
    return h;
  }
  function laneDetail(key) {
    const l = laneOf(key); if (!l) return '<div class="muted">Unknown lane</div>';
    const calls = S.calls.filter(c => c.lane === key);
    const kids = S.lanes.filter(x => x.parent === key);
    const parent = l.parent ? laneOf(l.parent) : null;
    return `<div class="kicker">Section · ${l.depth ? 'subagent lane' : 'main lane'}</div><h1>${ROMAN(laneIndex(key))}. ${esc(l.label)}</h1><div>${pill(l.state)} ${gotoBtn(l.startedAt)}</div>` + dl([
      ['Role', esc(l.role)], ['Agent type', esc(l.agentType)], ['Model', esc(l.model)], ['Parent', parent ? lk('lane:' + parent.key, parent.label) : '—'], ['Depth', String(l.depth)],
      ['Started', fmtT(l.startedAt)], ['Ended', l.endedAt ? `${fmtT(l.endedAt)} (${fmtDur(l.endedAt - l.startedAt)})` : 'still playing'], ['Calls', String(l.calls)], ['Errors', l.errors ? `<b style="color:var(--crimson)">${l.errors}</b>` : '0'], ['Tokens', fmtK(l.tokens)],
      ['Brief (task)', l.task ? `<i>${esc(l.task)}</i>` : '—'], ['Final result', l.result ? esc(l.result) : '<span class="muted">not yet</span>'],
      ['Child lanes', kids.length ? kids.map(x => lk('lane:' + x.key, x.label)).join(', ') : '—']
    ]) + `<h3>Its calls (${calls.length})</h3><ol>${calls.slice(-60).reverse().map(c => `<li>${callLink(c)}${c.error ? ` <b style="color:var(--crimson)">${esc(c.error.code)}</b>` : ''}</li>`).join('')}</ol>`;
  }
  function kindDetail(spec) {
    const [kind, laneKey] = spec.split('@');
    const k = KIND[kind];
    const calls = S.calls.filter(c => c.kind === kind && (!laneKey || c.lane === laneKey));
    const esp = sim.errorsSincePrompt();
    return `<div class="kicker k-${kind}">Instrument line</div><h1>${esc(k.inst)} — ${esc(k.role)}</h1><div>${kindGlyph(kind)} <span class="muted">${esc(k.notation)}</span></div>` + dl([
      ['Lane', laneKey ? lk('lane:' + laneKey, (laneOf(laneKey) || {}).label || laneKey) : 'all lanes'], ['Calls', String(calls.length)], ['Errors', String(calls.filter(c => c.status === 'error').length)], ['Since prompt', esp[kind] ? `<b style="color:var(--crimson)">✗ ${esp[kind]}</b>` : '0 errors'], ['Tools', esc(sim.kindInfo[kind].tools.join(', '))]
    ]) + `<h3>Recent notes</h3><ol>${calls.slice(-40).reverse().map(c => `<li>${callLink(c)}${c.error ? ` <b style="color:var(--crimson)">${esc(c.error.code)}</b>` : ''}</li>`).join('')}</ol>`;
  }
  function markerDetail(id) {
    const m = S.markers.find(x => x.id === id); if (!m) return '';
    if (m.kind === 'prompt') {
      const num = promptNumber(m);
      const next = S.markers.find(x => x.kind === 'prompt' && x.seq > m.seq);
      const calls = S.calls.filter(c => c.startedAt >= m.time && (!next || c.startedAt < next.time));
      const by = {}; for (const c of calls) by[c.kind] = (by[c.kind] || 0) + 1;
      const errs = calls.filter(c => c.status === 'error');
      const fine = S.markers.find(x => x.kind === 'turn-complete' && x.seq > m.seq && (!next || x.seq < next.seq));
      return `<div class="kicker">Movement ${ROMAN(num)} · user prompt</div><h1>${ROMAN(num)}. ${TEMPI[(num - 1) % TEMPI.length]}</h1><p style="font-size:15px;font-style:italic">“${esc(m.detail.text)}”</p><div>${gotoBtn(m.time)}</div>` + dl([
        ['Time', fmtT(m.time)], ['Prompt tokens', String(m.detail.tokens)], ['Turn', String(num)], ['Calls', `${calls.length} — ${KIND_ORDER.filter(k => by[k]).map(k => `${KIND[k].role} ${by[k]}`).join(', ')}`], ['Errors', errs.length ? errs.map(c => lk('error:' + c.id, c.error.code, 'bad')).join(', ') : '0'], ['Fine (turn complete)', fine ? fmtT(fine.time) + ` · ${fmtDur(fine.time - m.time)}` : 'still playing']
      ]);
    }
    if (m.kind === 'compaction') return `<div class="kicker">Dal segno · compaction</div><h1>𝄋 Context compacted</h1>` + dl([['Time', fmtT(m.time)], ['Before', fmtK(m.detail.before)], ['After', fmtK(m.detail.after)], ['Freed', fmtK(m.detail.before - m.detail.after)]]) + `<div style="margin-top:6px">${lk('context', 'Open the context window')}</div>`;
    if (m.kind === 'turn-complete') return `<div class="kicker">Fine · turn complete</div><h1>Turn ${m.detail.turn} complete</h1>` + dl([['Time', fmtT(m.time)], ['Reply', lk('reply', 'Reply to user')]]);
    return `<div class="kicker">${esc(m.kind)}</div><h1>${esc(m.label)}</h1>` + dl([['Time', fmtT(m.time)]]);
  }
  function chainDetail(id) {
    const c = sim.callById(id); if (!c) return '';
    const up = []; let p = c; const seen = new Set();
    while (p && p.causedBy && !seen.has(p.causedBy)) { seen.add(p.causedBy); p = sim.callById(p.causedBy); if (p) up.unshift(p); }
    const down = []; const walk = (x, d) => { for (const y of S.calls.filter(q => q.causedBy === x.id)) { down.push([y, d]); if (d < 4) walk(y, d + 1); } }; walk(c, 1);
    return `<div class="kicker">Slur · cause chain</div><h1>Why ${esc(c.tool)} happened</h1>
      <h3>Caused by (oldest first)</h3><ol>${up.map(x => `<li>${callLink(x)}${x.error ? ` <b style="color:var(--crimson)">${esc(x.error.code)}</b>` : ''}</li>`).join('') || '<li class="muted">Nothing earlier</li>'}</ol>
      <h3>This note</h3><div>${callLink(c)}</div>
      <h3>Led to</h3><ul>${down.map(([x, d]) => `<li style="margin-left:${(d - 1) * 14}px">${callLink(x)}</li>`).join('') || '<li class="muted">Nothing yet</li>'}</ul>`;
  }
  function errorDetail(id) {
    const c = sim.callById(id); if (!c || !c.error) return callDetail(c);
    return `<div class="kicker" style="color:var(--crimson)">Wrong note · tool error</div><h1>${esc(c.error.code)}</h1>${errorBox(c)}` + dl([['Call', callLink(c)], ['Lane', lk('lane:' + c.lane, (laneOf(c.lane) || {}).label)], ['Kind', `${KIND[c.kind].inst} · ${KIND[c.kind].role}`], ['When', fmtT(c.startedAt)], ['Target', esc(c.target ? c.target.value : '—')]]) + `<div style="margin-top:6px">${gotoBtn(c.startedAt)}</div>`;
  }
  function errorsDetail() {
    const esp = sim.errorsSincePrompt();
    return `<div class="kicker" style="color:var(--crimson)">Wrong notes</div><h1>${S.errors.length} tool errors</h1>` + dl(KIND_ORDER.map(k => [KIND[k].role, `${S.errors.filter(c => c.kind === k).length} total · ${esp[k] || 0} since last prompt`])) + `<h3>All errors (newest first)</h3><ol>${[...S.errors].reverse().map(c => `<li>${lk('error:' + c.id, c.error.code, 'bad')} ${esc(c.tool)} · ${esc(laneShort(laneOf(c.lane)))} · ${fmtT(c.startedAt)} — <i>${esc(nextAfterError(c).text)}</i></li>`).join('')}</ol>`;
  }
  function filesDetail() {
    const files = Object.values(S.files).sort((a, b) => b.lastTouched - a.lastTouched);
    return `<div class="kicker">Destination · files on disk</div><h1>Motifs — file footprint</h1><table><tr><th>File</th><th>R</th><th>E</th><th>✗</th><th>+/−</th></tr>${files.map(f => `<tr><td>${lk('file:' + f.path, f.path)}${f.edits >= 3 ? ' <span class="pill error">hot</span>' : ''}</td><td>${f.reads}</td><td>${f.edits}</td><td>${f.failed || ''}</td><td><span style="color:#2b6656">+${f.added}</span> <span style="color:var(--crimson)">−${f.removed}</span></td></tr>`).join('')}</table>`;
  }
  function lanesDetail() { return `<div class="kicker">Destination · agent lanes</div><h1>Sections</h1><ol>${S.lanes.map(l => `<li style="margin-left:${l.depth * 14}px">${lk('lane:' + l.key, `${ROMAN(laneIndex(l.key))}. ${l.label}`)} ${pill(l.state)} <span class="muted">${l.calls} calls · ${l.errors} errors · ${fmtK(l.tokens)} tok</span></li>`).join('')}</ol>`; }
  function replyDetail() { const t = S.markers.filter(m => m.kind === 'turn-complete'); return `<div class="kicker">Destination · reply to user</div><h1>Replies</h1><div>${t.length} turns completed. The session's answer goes back to the user at each Fine.</div><ol>${t.reverse().map(m => `<li>${lk('marker:' + m.id, `Turn ${m.detail.turn} — ${fmtT(m.time)}`)}</li>`).join('')}</ol>`; }
  function sessionDetail() {
    const s = S.session; const [st] = sessionStatus();
    return `<div class="kicker">Title page · session</div><h1>${esc(s.name)}</h1>` + dl([['Project', esc(s.project)], ['Session id', esc(s.id)], ['Provider', esc(s.provider)], ['Model', esc(s.model)], ['Branch', esc(s.branch)], ['Working dir', esc(s.cwd)], ['Status', esc(st)], ['Started', fmtT(s.startedAt)], ['Last record', fmtAgo(dispNow - lastRecord())], ['Turn', String(s.turn)], ['Tokens', `in ${fmtK(S.tokens.input)} · out ${fmtK(S.tokens.output)} · cache read ${fmtK(S.tokens.cacheRead)}`], ['Calls', String(S.calls.length)], ['Tool errors', String(S.errors.length)]]) +
      `<h3>How to read this score</h3><ul><li>Each <b>system</b> is an agent lane; subagents enter with a bracket and end with a double bar.</li><li>Each <b>staff</b> is one kind of work (see the instrument names on the left).</li><li><b style="color:var(--crimson)">✗ crimson X noteheads</b> are errors, with the code beneath; <b>1./2. voltas and repeat signs</b> are retries; <b>slurs</b> link a cause to its effect.</li><li><b>Lyrics</b> under each note say where the result went. The margin is the conductor's summary.</li></ul>`;
  }
  function detailFor(key) {
    const [type, ...rest] = key.split(':'); const arg = rest.join(':');
    switch (type) {
      case 'call': { const c = sim.callById(arg); return c ? callDetail(c) : ''; }
      case 'error': return errorDetail(arg);
      case 'file': return fileDetail(arg);
      case 'context': return contextDetail();
      case 'terminal': return terminalDetail();
      case 'plan': return planDetail();
      case 'web': return webDetail(arg || null);
      case 'lane': return laneDetail(arg);
      case 'lanes': return lanesDetail();
      case 'kind': return kindDetail(arg);
      case 'marker': return markerDetail(arg);
      case 'chain': return chainDetail(arg);
      case 'errors': return errorsDetail();
      case 'files': return filesDetail();
      case 'reply': return replyDetail();
      case 'session': return sessionDetail();
      default: return '';
    }
  }
  function openDetail(key, push = true) {
    if (push && panelKey && panelKey !== key) history.push(panelKey);
    panelKey = key;
    panelBody.innerHTML = detailFor(key);
    panelBody.scrollTop = 0;
    panel.classList.add('open'); panel.setAttribute('aria-hidden', 'false');
    $('#panel-back').style.visibility = history.length ? 'visible' : 'hidden';
    lastPanel = performance.now();
  }
  function refreshPanel() { if (!panelKey) return; const st = panelBody.scrollTop; const focusKey = document.activeElement && panelBody.contains(document.activeElement) ? document.activeElement.getAttribute('data-open') : null; panelBody.innerHTML = detailFor(panelKey); panelBody.scrollTop = st; if (focusKey) { const el = panelBody.querySelector(`[data-open="${CSS.escape(focusKey)}"]`); if (el) el.focus({ preventScroll: true }); } }
  function closePanel() { panel.classList.remove('open'); panel.setAttribute('aria-hidden', 'true'); panelKey = null; history.length = 0; }
  $('#panel-close').addEventListener('click', closePanel);
  $('#panel-back').addEventListener('click', () => { const k = history.pop(); if (k) openDetail(k, false); });

  // ---------- interaction ----------
  let dragged = false;
  document.addEventListener('click', e => {
    if (dragged) { dragged = false; return; }
    const g = e.target.closest('[data-goto]');
    if (g) { inspectCentered(+g.dataset.goto); return; }
    const el = e.target.closest('[data-open]');
    if (el) { e.preventDefault(); openDetail(el.getAttribute('data-open')); }
  });
  document.addEventListener('keydown', e => {
    const t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute && t.getAttribute('data-open') && t.tagName !== 'BUTTON') { e.preventDefault(); openDetail(t.getAttribute('data-open')); return; }
    if (e.key === 'Escape') { closePanel(); return; }
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT')) return;
    if (e.key === ' ') { e.preventDefault(); togglePause(); }
    else if (e.key === 'l' || e.key === 'L' || e.key === 'End') goLive();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const a = currentAnchor() + (e.key === 'ArrowLeft' ? -5000 : 5000); if (a >= dispNow) goLive(); else { live = false; inspectAt = Math.max(T0, a); scoreDirty = true; renderHeader(); } }
  });
  // drag or shift+wheel on the score scrolls in time
  let drag = null;
  wrap.addEventListener('pointerdown', e => { if (e.button !== 0) return; drag = { x: e.clientX, a: currentAnchor(), moved: false, id: e.pointerId }; });
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 5) return;
    if (!drag.moved) { drag.moved = true; wrap.classList.add('dragging'); }
    const a = drag.a - dx / pps * 1000;
    if (a >= dispNow) { if (!live) goLive(); } else { live = false; inspectAt = Math.max(T0, a); }
    renderHeader();
  });
  window.addEventListener('pointerup', () => { if (drag && drag.moved) { dragged = true; setTimeout(() => { dragged = false; }, 50); } drag = null; wrap.classList.remove('dragging'); });
  wrap.addEventListener('wheel', e => {
    const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!e.shiftKey && !horiz) return;
    e.preventDefault();
    const d = (horiz ? e.deltaX : e.deltaY) / pps * 1000 * 1.5;
    const a = currentAnchor() + d;
    if (a >= dispNow) goLive(); else { live = false; inspectAt = Math.max(T0, a); renderHeader(); }
  }, { passive: false });

  function togglePause() {
    if (sim.running) sim.pause(); else { sim.start(); lastTickNow = S.now; lastTickReal = performance.now(); }
    $('#pause-btn').textContent = sim.running ? 'Pause' : 'Resume';
    $('#pause-btn').setAttribute('aria-pressed', String(!sim.running));
    renderHeader();
  }
  $('#pause-btn').addEventListener('click', togglePause);
  $('#live-btn').addEventListener('click', goLive);
  for (const b of document.querySelectorAll('#speed button')) b.addEventListener('click', () => { sim.setSpeed(+b.dataset.speed); for (const o of document.querySelectorAll('#speed button')) o.classList.toggle('on', o === b); });
  const setZoom = z => { zoom = clamp(z, 0, ZOOMS.length - 1); pps = ZOOMS[zoom]; scoreDirty = true; };
  $('#zoom-in').addEventListener('click', () => setZoom(zoom + 1));
  $('#zoom-out').addEventListener('click', () => setZoom(zoom - 1));
  window.addEventListener('resize', () => { scoreDirty = true; });

  // ---------- main loop ----------
  function frame() {
    const now = performance.now();
    updateNow();
    const anchor = currentAnchor();
    const hasRunningPhrase = live && sim.runningCalls().some(c => c.kind === 'network');
    if (scoreDirty || Math.abs(anchor - renderedAnchor) > 9000 || wrap.clientWidth !== renderedW || (hasRunningPhrase && now - lastPhrase > 400)) { if (hasRunningPhrase) lastPhrase = now; renderScore(); }
    positionScore();
    processPending();
    animateFlights(now);
    if (marginDirty && now - lastMargin > 500) { lastMargin = now; renderMargin(); }
    if (now - lastOverview > 1000 || ovDrag) { lastOverview = now; renderOverview(); }
    if (now - lastHeader > 500) { lastHeader = now; renderHeader(); }
    if (panelKey && now - lastPanel > 1000) { lastPanel = now; refreshPanel(); }
    requestAnimationFrame(frame);
  }
  let lastPhrase = 0;
  renderHeader();
  renderMargin();
  sim.start();
  lastTickNow = S.now; lastTickReal = performance.now();
  requestAnimationFrame(frame);
  // test hook for headless checks
  window.__score = { sim, openDetail, goLive, inspectCentered };
})();
