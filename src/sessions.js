'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { createHash } = require('node:crypto');
const { createSession, applyRecord, projectName, sessionTitle, workspaceIdentity, UNNAMED_SESSION } = require('./transcript');
const { readDetail } = require('./detail');

// WARNING: these are disclosed history/list limits, not claims of complete coverage.
const SESSION_LIMIT = 80;
const MAX_LINE = 4 * 1024 * 1024;
const READ_BUDGET = 8 * 1024 * 1024;
const CHUNK = 256 * 1024;
const HEAD_PREVIEW = 64 * 1024;
const TITLE_LINE = 64 * 1024;
const TITLE_SCAN_BUDGET = 256 * 1024 * 1024;
const INDEX_LIMIT = 8 * 1024 * 1024;
const METADATA_CACHE_LIMIT = 20000;
// WARNING: disclosed lookup limit; at most this many transcripts are opened for their project per discovery call.
const HEAD_PASS = 1500;
const TITLE_MARKER = Buffer.from('-title"');
const UNKNOWN_WORKSPACE_KEY = 'ws:unknown';
const UNKNOWN_WORKSPACE_LABEL = 'Unknown workspace';
// Host-only scan positions and the latest cleaned titles, keyed by transcript path. Nothing here is sent to the view.
const metadataCache = new Map();

// WARNING: disclosed plausibility window (S08). A record dated before 2000 or more than a day after this
// machine's clock is counted as malformed: one such record would otherwise stretch the time axis and make a
// session read as recently active for good.
const EARLIEST_TIME = Date.UTC(2000, 0, 1);
const CLOCK_SLACK = 24 * 60 * 60 * 1000;
function usableTime(value) {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= EARLIEST_TIME && time <= Date.now() + CLOCK_SLACK;
}

class TranscriptReader {
  constructor(provider, id) {
    this.provider = provider;
    this.id = id;
    this.reset();
  }

  reset() {
    this.state = createSession(this.provider, this.id);
    this.offset = 0;
    // Byte position where `tail` starts: every record is applied with its own position, so a later click can read
    // that one line again (src/detail.js checks what it finds there before using it).
    this.lineStart = 0;
    this.tail = '';
    this.decoder = new StringDecoder('utf8');
    this.skipping = false;
    this.anchor = Buffer.alloc(0);
    this.prefix = Buffer.alloc(0);
  }

  consume(text) {
    const lines = (this.tail + text).split('\n');
    this.tail = lines.pop();
    for (const line of lines) {
      const position = this.lineStart;
      const bytes = Buffer.byteLength(line, 'utf8');
      this.lineStart += bytes + 1;
      if (this.skipping) { this.skipping = false; continue; }
      if (bytes > MAX_LINE) { this.state.oversizedLines++; continue; }
      if (!line.trim()) continue;
      let record;
      try { record = JSON.parse(line); } catch { this.state.invalidLines++; continue; }
      // A line that parses but is not a record object is malformed too.
      if (!record || typeof record !== 'object' || Array.isArray(record)) { this.state.invalidLines++; continue; }
      if (record.timestamp !== undefined && !usableTime(record.timestamp)) {
        this.state.invalidLines++;
        if (typeof record.timestamp !== 'string') continue;
        // Counted, and kept out of the activity. What the record says without a time (working directory,
        // session metadata) is still read.
        record = { ...record, timestamp: undefined };
      }
      this.state.position = position;
      try { applyRecord(this.state, record); } catch { this.state.invalidLines++; }
    }
    if (Buffer.byteLength(this.tail, 'utf8') > MAX_LINE) {
      if (!this.skipping) this.state.oversizedLines++;
      this.lineStart += Buffer.byteLength(this.tail, 'utf8');
      this.tail = '';
      this.skipping = true;
    }
  }

  // `limit` caps the bytes read by this call; the rest is read on later calls and `loading` says so.
  async read(file, limit = READ_BUDGET) {
    const handle = await fs.open(file, 'r');
    try {
      const stat = await handle.stat();
      const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      if (this.identity !== identity || stat.size < this.offset || (stat.size === this.offset && this.mtime !== stat.mtimeMs)) this.reset();
      // shortcut: rewrite checks sample the first and last 4 KB read; Refresh rereads edits wholly between samples.
      for (const [expected, position] of [[this.prefix, 0], [this.anchor, this.offset - this.anchor.length]]) {
        if (!expected.length) continue;
        const check = Buffer.alloc(expected.length);
        const { bytesRead } = await handle.read(check, 0, check.length, position);
        if (bytesRead !== check.length || !check.equals(expected)) { this.reset(); break; }
      }
      this.identity = identity;
      this.mtime = stat.mtimeMs;
      const target = Math.min(stat.size, this.offset + Math.max(0, Math.min(READ_BUDGET, limit)));
      const buffer = Buffer.alloc(Math.min(CHUNK, target - this.offset));
      while (this.offset < target) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, target - this.offset), this.offset);
        if (!bytesRead) break;
        if (this.prefix.length < 4096) this.prefix = Buffer.concat([this.prefix, buffer.subarray(0, Math.min(4096 - this.prefix.length, bytesRead))]);
        this.offset += bytesRead;
        this.anchor = Buffer.from(Buffer.concat([this.anchor, buffer.subarray(0, bytesRead)]).subarray(-4096));
        this.consume(this.decoder.write(buffer.subarray(0, bytesRead)));
      }
      this.state.loading = this.offset < stat.size;
      this.state.bytesRead = this.offset;
      this.state.fileBytes = stat.size;
      return this.state;
    } finally { await handle.close(); }
  }
}

// WARNING: disclosed family limits (S04); each one is reported in the view when it is reached.
const FAMILY_LIMIT = 24;                      // subagent lanes followed at once, most recently written first
const FAMILY_POOL = 200;                      // newest Claude subagent transcripts whose link records are checked
const LANE_EVENTS = 2000;                     // newest events sent per subagent lane
const FAMILY_READ_BUDGET = 24 * 1024 * 1024;  // subagent transcript bytes read per pass
const META_LIMIT = 64 * 1024;
const ROOT_LANE = 'main';
const END_STATES = { completed: 'completed', failed: 'failed', stopped: 'stopped', killed: 'stopped' };
const agentKey = value => typeof value === 'string' && /^[\w-]{1,80}$/.test(value) ? value : '';

// Follows one selected session and the subagent transcripts that verifiably belong to it (S04).
// Source mapping, verified on local data 2026-11-12:
//   Claude: children are <session>/subagents/**/agent-<agentId>.jsonl. Each child record carries the session ID
//     and its own agent ID. agent-<agentId>.meta.json holds agentType, toolUseId (the parent's Agent call),
//     parentAgentId (set when another subagent started it) and finished. The parent's result record holds
//     toolUseResult.agentId; background agents end with a task notification in the parent transcript.
//   Codex: a child rollout names its parent in session_meta.payload.source.subagent.thread_spawn.parent_thread_id.
//     The parent records no child thread ID at spawn and no end, so a Codex lane has no parent-reported end.
// A lane holds only what the child's own transcript recorded. The parent's spawn call stays in the parent's lane.
// Same constructor and read(file) as TranscriptReader; the result is the selected session's state plus `family`.
class FamilyReader {
  constructor(provider, id) {
    this.provider = provider;
    this.id = id;
    this.main = new TranscriptReader(provider, id);
    this.children = new Map();
    this.metas = new Map();
    this.listing = null;
    this.planFile = '';
    this.plan = null;
  }

  async meta(session) {
    const known = this.metas.get(session.file);
    if (known?.finished) return known;
    let meta = { type: '', call: '', parent: '', finished: false };
    let handle;
    try {
      handle = await fs.open(session.file.replace(/\.jsonl$/, '.meta.json'), 'r');
      const buffer = Buffer.alloc(META_LIMIT);
      const { bytesRead } = await handle.read(buffer, 0, META_LIMIT, 0);
      const value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
      // Only these four fields are kept. The description beside them is task text and is never read out.
      if (value && typeof value === 'object') meta = { type: [...sessionTitle(value.agentType)].slice(0, 40).join(''), call: typeof value.toolUseId === 'string' ? value.toolUseId : '', parent: agentKey(value.parentAgentId), finished: value.finished === true };
    } catch { /* A missing or half-written link record leaves the child linked by its own records only. */ }
    finally { if (handle) await handle.close(); }
    this.metas.set(session.file, meta);
    return meta;
  }

  // Which transcripts of the current listing belong to the selected session, and under which parent.
  async members(file, files) {
    const members = [];
    const ids = new Set();
    let found = 0;
    let unchecked = 0;
    let rootIsChild = false;
    if (this.provider === 'claude') {
      const marker = `${path.sep}subagents${path.sep}`;
      const at = file.lastIndexOf(marker);
      rootIsChild = at !== -1 && path.basename(file).startsWith('agent-');
      const base = rootIsChild ? file.slice(0, at + marker.length) : file.slice(0, -'.jsonl'.length) + marker;
      const pool = files.filter(session => session.provider === 'claude' && session.file !== file && session.file.startsWith(base) && path.basename(session.file).startsWith('agent-'));
      for (const session of pool) ids.add(session.sessionId);
      const checked = pool.slice(0, FAMILY_POOL);
      unchecked = pool.length - checked.length;
      const metas = new Map();
      for (const session of checked) metas.set(session.sessionId, await this.meta(session));
      for (const session of checked) {
        // Walk up the recorded parents. A repeat or an unknown parent stops the walk; nothing is guessed.
        const seen = new Set([session.sessionId]);
        let at = session.sessionId;
        let reaches = !rootIsChild;
        let cycle = false;
        for (;;) {
          const up = metas.get(at).parent;
          if (!up) break;
          if (rootIsChild && up === this.id) { reaches = true; break; }
          if (seen.has(up)) { cycle = true; break; }
          if (!metas.has(up)) break;
          seen.add(up);
          at = up;
        }
        if (!reaches || (rootIsChild && cycle)) continue;
        const declared = metas.get(session.sessionId).parent;
        const direct = declared && declared !== this.id ? declared : '';
        members.push({ file: session.file, key: session.sessionId, sessionId: session.sessionId, modified: session.modified, parent: cycle ? '' : direct, known: !cycle, meta: metas.get(session.sessionId) });
      }
      found = rootIsChild ? members.length : pool.length;
    } else {
      const root = this.id.toLowerCase();
      const byParent = new Map();
      for (const session of files) {
        if (session.provider !== 'codex') continue;
        ids.add(session.sessionId.toLowerCase());
        if (session.parentId && session.file !== file) byParent.set(session.parentId, [...(byParent.get(session.parentId) || []), session]);
      }
      const visited = new Set([root]);
      const queue = [root];
      while (queue.length) {
        const parent = queue.shift();
        for (const session of byParent.get(parent) || []) {
          const key = session.sessionId.toLowerCase();
          if (visited.has(key)) continue;
          visited.add(key);
          queue.push(key);
          members.push({ file: session.file, key, sessionId: session.sessionId, modified: session.modified, parent: parent === root ? '' : parent, known: true, declared: parent, meta: null });
        }
      }
      found = members.length;
    }
    members.sort((a, b) => b.modified - a.modified || a.key.localeCompare(b.key));
    const shown = members.slice(0, FAMILY_LIMIT);
    return { members: shown, files: new Set(shown.map(member => member.file)), ids, found, unchecked, rootIsChild };
  }

  async read(file, context = {}) {
    const main = await this.main.read(file);
    const files = Array.isArray(context.files) ? context.files : [];
    // Membership is worked out once per folder listing, not once per second.
    if (this.listing !== files || this.planFile !== file) {
      this.plan = await this.members(file, files);
      this.listing = files;
      this.planFile = file;
    }
    const plan = this.plan;
    let remaining = FAMILY_READ_BUDGET;
    for (const member of plan.members) {
      let child = this.children.get(member.file);
      if (!child) this.children.set(member.file, child = { reader: new TranscriptReader(this.provider, member.sessionId), size: -1, mtime: -1, state: null, error: '' });
      try {
        // An unchanged, fully read child is not opened again.
        const stat = await fs.stat(member.file);
        child.error = '';
        if (child.state && !child.state.loading && stat.size === child.size && stat.mtimeMs === child.mtime) continue;
        if (remaining <= 0) continue;
        const before = child.reader.offset;
        child.state = await child.reader.read(member.file, remaining);
        remaining -= Math.max(0, child.reader.offset - before);
        child.size = stat.size;
        child.mtime = stat.mtimeMs;
      } catch (error) { child.error = error.code || 'unknown'; }
    }
    // Readers of transcripts that left the family are dropped; no file handle outlives a read.
    for (const known of this.children.keys()) if (!plan.files.has(known)) this.children.delete(known);

    const owner = this.provider === 'claude' ? (plan.rootIsChild ? main.parent : this.id) : '';
    let foreign = 0;
    const kept = plan.members.filter(member => {
      const recorded = this.children.get(member.file).state?.parent;
      // The child's own records must agree with the link that put it in this family.
      const agrees = !recorded || (this.provider === 'claude' ? !owner || recorded === owner : recorded.toLowerCase() === member.declared);
      if (!agrees) foreign++;
      return agrees;
    });
    const byKey = new Map(kept.map(member => [member.key, member]));
    const stateOf = key => key === ROOT_LANE ? main : this.children.get(byKey.get(key).file).state;
    // Host only (details on click): which transcript and state each lane the view was sent came from.
    this.sources = new Map([[ROOT_LANE, { file, state: main }], ...kept.map(member => [member.key, { file: member.file, state: this.children.get(member.file).state }])]);
    const lanes = new Map();
    for (const member of kept) {
      const child = this.children.get(member.file);
      const state = child.state;
      const parentKey = member.parent && byKey.has(member.parent) ? member.parent : ROOT_LANE;
      const parentState = stateOf(parentKey);
      const spawn = parentState?.lifecycle.agents.get(member.key) || (member.meta?.call && parentState?.lifecycle.spawns.get(member.meta.call)) || null;
      const notice = parentState?.lifecycle.notices.get(member.key) || main.lifecycle.notices.get(member.key) || null;
      // A call ID the parent also holds is the parent's own call (copied history), not the child's work.
      const own = state ? state.events.filter(event => !parentState?.calls.has(event.id)) : [];
      const events = own.slice(-LANE_EVENTS).map(event => ({ id: event.id, time: event.time, kind: event.kind === 'prompt' ? 'handoff' : event.kind, label: event.kind === 'prompt' ? 'Task received' : event.label, outcome: event.outcome }));
      lanes.set(member.key, {
        key: member.key, parentKey, parentKnown: member.known && (!member.parent || byKey.has(member.parent)), depth: 1, role: 'subagent',
        label: member.meta?.type || state?.agentLabel || 'Subagent', link: spawn ? 'spawn' : 'records',
        start: state?.startedAt ? { time: state.startedAt, source: 'own' } : spawn ? { time: spawn.launched, source: 'parent' } : { time: null, source: '' },
        end: lifecycleEnd(notice, spawn, member.meta), status: state?.status || 'unknown', updatedAt: state?.updatedAt || 0, events,
        omitted: (state?.droppedEvents || 0) + own.length - events.length, duplicates: state ? state.events.length - own.length : 0,
        invalidLines: state?.invalidLines || 0, oversizedLines: state?.oversizedLines || 0,
        loading: !child.error && (!state || state.loading === true), missing: child.error === 'ENOENT', unreadable: Boolean(child.error) && child.error !== 'ENOENT'
      });
    }
    // A child the parent recorded, with no transcript anywhere in the listing, still gets a lane that says so.
    let missing = 0;
    for (const key of [ROOT_LANE, ...byKey.keys()]) {
      const state = stateOf(key);
      if (!state) continue;
      for (const [agent, spawn] of state.lifecycle.agents) {
        if (plan.ids.has(agent) || lanes.has(agent) || agent === this.id.toLowerCase()) continue;
        missing++;
        if (lanes.size >= FAMILY_LIMIT) continue;
        lanes.set(agent, {
          key: agent, parentKey: key, parentKnown: true, depth: 1, role: 'subagent', label: 'Subagent', link: 'spawn',
          start: { time: spawn.launched, source: 'parent' }, end: lifecycleEnd(state.lifecycle.notices.get(agent), spawn, null), status: 'unknown', updatedAt: 0, events: [],
          omitted: 0, duplicates: 0, invalidLines: 0, oversizedLines: 0, loading: false, missing: true, unreadable: false
        });
      }
    }
    // Main first, then each child under its parent in order of its first recorded time.
    const ordered = [{ key: ROOT_LANE, parentKey: '', parentKnown: true, depth: 0, role: plan.rootIsChild || main.parent ? 'subagent' : 'main', label: '', link: '',
      start: { time: main.startedAt || null, source: main.startedAt ? 'own' : '' }, end: { state: 'open', time: null }, status: main.status, updatedAt: main.updatedAt,
      omitted: main.droppedEvents, duplicates: 0, invalidLines: main.invalidLines, oversizedLines: main.oversizedLines, loading: main.loading === true, missing: false, unreadable: false }];
    const placed = new Set([ROOT_LANE]);
    const place = (parentKey, depth) => {
      const below = [...lanes.values()].filter(lane => lane.parentKey === parentKey && !placed.has(lane.key))
        .sort((a, b) => (a.start.time ?? Infinity) - (b.start.time ?? Infinity) || a.key.localeCompare(b.key));
      for (const lane of below) {
        if (placed.has(lane.key)) continue;
        placed.add(lane.key);
        lane.depth = depth;
        ordered.push(lane);
        place(lane.key, depth + 1);
      }
    };
    place(ROOT_LANE, 1);
    for (const lane of lanes.values()) if (!placed.has(lane.key)) ordered.push({ ...lane, parentKey: ROOT_LANE, parentKnown: false, depth: 1 });

    const notes = [];
    if (plan.rootIsChild || main.parent) notes.push('The followed session is itself a subagent. Its parent and sibling agents are not shown here.');
    if (plan.found > plan.members.length) notes.push(`Following the ${plan.members.length} most recently written of ${plan.found} subagent transcripts. Totals cover the lanes shown.`);
    if (plan.unchecked) notes.push(`Only the newest ${FAMILY_POOL} subagent transcripts were checked for links.`);
    if (missing) notes.push(`${missing} subagent${missing === 1 ? '' : 's'} recorded by a parent ${missing === 1 ? 'has' : 'have'} no transcript in the source folders.`);
    if (foreign) notes.push(`${foreign} transcript${foreign === 1 ? '' : 's'} in the subagent folder name${foreign === 1 ? 's' : ''} another session and ${foreign === 1 ? 'is' : 'are'} not shown.`);
    return { ...main, loading: main.loading === true || ordered.some(lane => lane.loading), family: { lanes: ordered, found: plan.found, limit: FAMILY_LIMIT, eventLimit: LANE_EVENTS, notes } };
  }

  // Details on click: one event of one lane the last read sent, read again from its transcript. The lane key and
  // event ID come from the view and are only looked up here; the file always comes from this reader's own listing.
  async detail(lane, id) {
    const source = this.sources?.get(lane);
    if (!source?.state) return { ok: false, reason: 'not-found' };
    const state = source.state;
    let event = state.calls.get(id);
    for (let index = state.events.length - 1; !event && index >= 0; index--) if (state.events[index].id === id) event = state.events[index];
    if (!event) return { ok: false, reason: 'not-found' };
    return readDetail(this.provider, source.file, event);
  }
}

// An end is stated only where the source recorded one. `finished` is a recorded flag without a time.
function lifecycleEnd(notice, spawn, meta) {
  if (notice) return { state: END_STATES[notice.status] || 'ended', time: notice.time };
  if (spawn?.ended) return { state: spawn.failed ? 'failed' : 'completed', time: spawn.reported };
  if (meta?.finished) return { state: 'finished', time: null };
  return { state: 'open', time: null };
}

// Lists every transcript file with its stat. Nothing is opened here.
async function walkSources({ claudeRoot, codexRoot }) {
  const files = [];
  const warnings = [];
  async function walk(folder, provider, root = false, nested = false) {
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); }
    catch (error) {
      warnings.push(`${provider === 'claude' ? 'Claude' : 'Codex'} ${root && error.code === 'ENOENT' ? 'sessions folder not found' : `folder could not be read (${error.code || 'unknown'})`}.`);
      return;
    }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(file, provider, false, nested || entry.name === 'subagents');
      else if (entry.isFile() && entry.name.endsWith('.jsonl') && (provider === 'claude' || entry.name.startsWith('rollout-'))) {
        try {
          const stat = await fs.stat(file);
          const id = provider === 'codex' ? entry.name.match(/([0-9a-f-]{36})\.jsonl$/i)?.[1] || entry.name.slice(8, -6) : entry.name.replace(/^agent-/, '').slice(0, -6);
          files.push({ id: `${provider}:${createHash('sha256').update(file).digest('hex').slice(0, 20)}`, sessionId: id, file, provider, modified: stat.mtimeMs, size: stat.size, identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`, project: '', child: nested });
        } catch (error) {
          if (error.code !== 'ENOENT') warnings.push(`${provider} transcript metadata could not be read (${error.code || 'unknown'}).`);
        }
      }
    }
  }
  await walk(path.join(claudeRoot, 'projects'), 'claude', true);
  await walk(path.join(codexRoot, 'sessions'), 'codex', true);
  files.sort((a, b) => b.modified - a.modified || a.id.localeCompare(b.id));
  return { files, warnings };
}

const needle = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

// The host query contract (S03). `options` is a number (the response cap) or
// { limit, query: { workspaceKey, name, id }, keep: [catalogue ids], walk, headBudget, titleBudget }.
// Order of work: list every transcript, group all of them by project, filter by project and ID, then by name,
// and only then cut the matches to `limit`. `workspaces`, `total` and `matched` are never cut.
// `keep` names sessions (the followed one) whose current metadata is returned in `kept` whatever the filters say.
// `walk` is a previous result's `walk`; passing it back answers a new query without listing the folders again.
// `pending` counts sessions whose project or saved name has not been read yet; they are read on later calls.
async function discoverSessions(roots, options = {}) {
  const settings = typeof options === 'number' ? { limit: options } : options || {};
  const limit = Number.isInteger(settings.limit) && settings.limit >= 0 ? settings.limit : SESSION_LIMIT;
  const query = { workspaceKey: typeof settings.query?.workspaceKey === 'string' ? settings.query.workspaceKey : '', name: needle(settings.query?.name), id: needle(settings.query?.id) };
  const keep = new Set(Array.isArray(settings.keep) ? settings.keep : []);
  const walked = settings.walk || await walkSources(roots);
  const files = walked.files;
  const warnings = [...walked.warnings];
  const cost = { files: files.length, walked: !settings.walk, opened: 0, bytesRead: 0 };
  const budget = { heads: settings.headBudget ?? HEAD_PASS, remaining: settings.titleBudget ?? TITLE_SCAN_BUDGET, cost };
  const pending = { workspaces: 0, names: 0 };
  const entries = new Map();
  const unreadable = new Set();
  async function metadata(session, titles) {
    if (unreadable.has(session)) return null;
    try {
      const entry = await readMetadata(session, budget, titles);
      if (entry) entries.set(session, entry);
      return entry;
    } catch (error) {
      metadataCache.delete(session.file);
      entries.delete(session);
      unreadable.add(session);
      if (error.code !== 'ENOENT') warnings.push(`A session label could not be read (${error.code || 'unknown'}).`);
      return null;
    }
  }

  // 1. Project of every session: one small read per transcript, remembered until that transcript changes.
  const kept = files.filter(session => keep.has(session.id));
  for (const session of [...kept, ...files]) if (!entries.has(session)) await metadata(session, false);
  const identities = new Map();
  const counts = new Map();
  for (const session of files) {
    const entry = entries.get(session);
    if (!entry && !unreadable.has(session)) { session.workspaceKey = undefined; pending.workspaces++; continue; }
    const identity = workspaceIdentity(entry?.cwd);
    session.project = identity ? projectName(entry.cwd) : '';
    // Host only: the parent thread a Codex rollout names in its own first record (S04).
    session.parentId = entry?.parent || '';
    if (session.parentId) session.child = true;
    session.workspaceKey = identity ? identity.key : UNKNOWN_WORKSPACE_KEY;
    if (identity && !identities.has(identity.key)) identities.set(identity.key, identity);
    counts.set(session.workspaceKey, (counts.get(session.workspaceKey) || 0) + 1);
  }
  const labels = workspaceLabels(identities);
  for (const session of files) session.workspaceLabel = labels.get(session.workspaceKey) || UNKNOWN_WORKSPACE_LABEL;
  const workspaces = [...counts].map(([key, count]) => ({ key, label: labels.get(key) || UNKNOWN_WORKSPACE_LABEL, count }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));

  // 2. Project and ID filters need nothing more from disk.
  const candidates = files.filter(session => (!query.workspaceKey || session.workspaceKey === query.workspaceKey) && (!query.id || session.sessionId.toLowerCase().includes(query.id)));
  const threadNames = [...candidates, ...kept].some(session => session.provider === 'codex') ? await readCodexIndex(roots.codexRoot, warnings, cost) : new Map();
  const named = new Set();
  async function name(session) {
    if (named.has(session)) return;
    named.add(session);
    const entry = await metadata(session, true);
    const indexed = session.provider === 'codex' ? threadNames.get(session.sessionId.toLowerCase()) : '';
    session.nameSource = entry?.custom ? 'custom' : entry?.generated ? 'generated' : indexed ? 'index' : 'none';
    session.name = entry?.custom || entry?.generated || indexed || UNNAMED_SESSION;
    session.nameComplete = Boolean(entry?.complete);
  }
  for (const session of kept) await name(session);

  // 3. A name filter reads saved names for every candidate before anything is cut. Without one, only the
  // returned sessions need their names, so older transcripts are not read at all.
  let matches = candidates;
  if (query.name) {
    matches = [];
    for (const session of candidates) {
      await name(session);
      if (session.name.toLowerCase().includes(query.name)) matches.push(session);
      // Unread names can add a match or, after a rename, remove one, so they are counted either way.
      if (!session.nameComplete && !unreadable.has(session)) pending.names++;
    }
  }
  const sessions = matches.slice(0, limit);
  for (const session of sessions) await name(session);

  if (matches.length > limit) warnings.push(`Showing the ${limit} most recently written sessions of ${matches.length}${query.workspaceKey || query.name || query.id ? ' that match' : ''}.`);
  if (pending.workspaces) warnings.push(`Projects are still being read for ${pending.workspaces} sessions. They are filled in over the next refreshes.`);
  if (pending.names) warnings.push(`Saved names are still being read in ${pending.names} sessions. More matches may appear over the next refreshes.`);
  else if (sessions.some(session => !session.nameComplete && !unreadable.has(session))) warnings.push('Some session names are still being read. They are filled in over the next refreshes.');
  if (metadataCache.size > METADATA_CACHE_LIMIT) {
    const listed = new Set(files.map(session => session.file));
    for (const file of metadataCache.keys()) if (!listed.has(file)) metadataCache.delete(file);
  }
  return { sessions, kept, warnings: [...new Set(warnings)], total: files.length, matched: matches.length, limit, workspaces, pending, all: files, walk: walked, cost };
}

// Verified local shape (2026-11-12): <codexRoot>/session_index.jsonl holds appended lines {id, thread_name, updated_at}.
// An ID can repeat after a rename; the last line written for it is used. Nothing else in the Codex folder is opened for names.
async function readCodexIndex(codexRoot, warnings, cost) {
  const names = new Map();
  let handle;
  try {
    handle = await fs.open(path.join(codexRoot, 'session_index.jsonl'), 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) throw Object.assign(new Error('not a file'), { code: 'EISDIR' });
    const { size } = stat;
    // WARNING: disclosed lookup limit; only the newest part of an oversized index is read.
    const start = Math.max(0, size - INDEX_LIMIT);
    const buffer = Buffer.alloc(size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    cost.bytesRead += bytesRead;
    const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n');
    if (start > 0) {
      lines.shift();
      warnings.push('The Codex session name index is large; names of the oldest sessions may be unavailable.');
    }
    for (const line of lines) {
      if (!line.trim()) continue;
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      if (record && typeof record.id === 'string' && typeof record.thread_name === 'string') names.set(record.id.toLowerCase(), sessionTitle(record.thread_name));
    }
  } catch (error) {
    if (error.code !== 'ENOENT') warnings.push(`Codex session names could not be read (${error.code || 'unknown'}).`);
  } finally { if (handle) await handle.close(); }
  return names;
}

// Working directory comes from the first records. Claude titles can be appended anywhere, so a transcript is
// scanned once and afterwards only for newly appended bytes; a replaced or shortened file is scanned again.
// Measured 2026-11-12 on 3,600 local transcripts: opening each one for its first records took about 2.5 s, so a
// transcript whose size and modified time match the remembered ones is not opened at all. Titles are read only
// when `titles` is set. Returns null when the first read is put off to a later call by the per-call budget.
async function readMetadata(session, budget, titles) {
  const replaced = (known, identity, size, mtime) => known.identity !== identity || size < known.size || (size === known.size && mtime !== known.mtime);
  let entry = metadataCache.get(session.file);
  if (entry && !replaced(entry, session.identity, session.size, session.modified)) {
    const wantHead = !entry.headDone && entry.headSize !== session.size;
    const wantTitles = titles && session.provider === 'claude' && entry.offset < session.size;
    // Nothing to read, or this call's allowance for names is spent: the transcript is not opened.
    if (!wantHead && (!wantTitles || budget.remaining <= 0)) {
      entry.size = session.size;
      entry.mtime = session.modified;
      entry.complete = session.provider !== 'claude' || entry.offset >= session.size;
      return entry;
    }
  } else if (!entry && !titles && budget.heads <= 0) return null;
  const handle = await fs.open(session.file, 'r');
  try {
    budget.cost.opened++;
    const stat = await handle.stat();
    const identity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    // Checked against the open file, not the listing: a listing reused for a new query can be a few seconds old.
    if (!entry || replaced(entry, identity, stat.size, stat.mtimeMs)) {
      entry = { identity, offset: 0, size: 0, headSize: -1, cwd: '', parent: '', headDone: false, custom: '', generated: '', carry: Buffer.alloc(0), skipping: false };
      metadataCache.set(session.file, entry);
    }
    if (!entry.headDone && entry.headSize !== stat.size) {
      // WARNING: metadata preview only; a large first record can leave a workspace unavailable.
      const head = Buffer.alloc(Math.min(HEAD_PREVIEW, stat.size));
      const { bytesRead } = await handle.read(head, 0, head.length, 0);
      budget.heads--;
      budget.cost.bytesRead += bytesRead;
      for (const line of head.subarray(0, bytesRead).toString('utf8').split('\n')) {
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        const cwd = record?.type === 'session_meta' ? record.payload?.cwd : record?.cwd;
        if (typeof cwd === 'string' && cwd.trim()) {
          entry.cwd = cwd;
          const parent = record.type === 'session_meta' ? record.payload.source?.subagent?.thread_spawn?.parent_thread_id : '';
          entry.parent = typeof parent === 'string' && /^[\w-]{1,80}$/.test(parent) ? parent.toLowerCase() : '';
          break;
        }
      }
      entry.headDone = !!entry.cwd || bytesRead >= HEAD_PREVIEW;
      entry.headSize = stat.size;
    }
    if (titles && session.provider === 'claude') {
      const target = Math.min(stat.size, entry.offset + Math.max(0, budget.remaining));
      const buffer = Buffer.alloc(Math.min(CHUNK, target - entry.offset));
      while (entry.offset < target) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, target - entry.offset), entry.offset);
        if (!bytesRead) break;
        entry.offset += bytesRead;
        budget.remaining -= bytesRead;
        budget.cost.bytesRead += bytesRead;
        scanTitles(entry, buffer.subarray(0, bytesRead));
      }
    }
    entry.size = stat.size;
    entry.mtime = stat.mtimeMs;
    entry.complete = session.provider !== 'claude' || entry.offset >= stat.size;
    return entry;
  } finally { await handle.close(); }
}

// Verified local shape (2026-11-12): {type:'custom-title', customTitle, sessionId} and {type:'ai-title', aiTitle, sessionId}
// are whole top-level records, repeated through the file. Only complete lines containing the marker are parsed,
// so prompt and tool records are never decoded here. An incomplete last line waits for its newline.
function scanTitles(entry, chunk) {
  const data = entry.carry.length ? Buffer.concat([entry.carry, chunk]) : chunk;
  entry.carry = Buffer.alloc(0);
  let start = 0;
  if (entry.skipping) {
    const newline = data.indexOf(10);
    if (newline === -1) return;
    entry.skipping = false;
    start = newline + 1;
  }
  const end = data.lastIndexOf(10);
  if (end >= start) {
    let position = start;
    while ((position = data.indexOf(TITLE_MARKER, position)) !== -1 && position < end) {
      const lineStart = data.lastIndexOf(10, position) + 1;
      const lineEnd = data.indexOf(10, position);
      // WARNING: a title record longer than TITLE_LINE is ignored; observed title records are far smaller.
      if (lineEnd - lineStart <= TITLE_LINE) {
        let record;
        try { record = JSON.parse(data.subarray(lineStart, lineEnd).toString('utf8')); } catch { record = null; }
        if (record?.type === 'custom-title' && typeof record.customTitle === 'string') entry.custom = sessionTitle(record.customTitle);
        else if (record?.type === 'ai-title' && typeof record.aiTitle === 'string') entry.generated = sessionTitle(record.aiTitle);
      }
      position = lineEnd + 1;
    }
    start = end + 1;
  }
  if (data.length - start > TITLE_LINE) entry.skipping = true;
  else entry.carry = Buffer.from(data.subarray(start));
}

// Short labels: the directory name, then one parent when names collide, then a fragment of the opaque key.
// Labels never contain a drive, a root or more than two segments.
function workspaceLabels(identities) {
  const labels = new Map([[UNKNOWN_WORKSPACE_KEY, UNKNOWN_WORKSPACE_LABEL]]);
  const collisions = () => {
    const seen = new Map();
    for (const [key, label] of labels) seen.set(label.toLowerCase(), [...(seen.get(label.toLowerCase()) || []), key]);
    return [...seen.values()].filter(keys => keys.length > 1).flat().filter(key => key !== UNKNOWN_WORKSPACE_KEY);
  };
  const parts = identity => identity.segments.slice(identity.windows && /^[a-z]:$/i.test(identity.segments[0] || '') ? 1 : 0).map(sessionTitle).filter(Boolean);
  for (const [key, identity] of identities) labels.set(key, sessionTitle(parts(identity).at(-1) || '') || 'Root folder');
  for (const key of collisions()) labels.set(key, sessionTitle(parts(identities.get(key)).slice(-2).join('/')) || 'Root folder');
  for (const key of collisions()) labels.set(key, `${[...labels.get(key)].slice(0, 70).join('')} \u00b7 ${key.slice(3, 9)}`);
  return labels;
}

module.exports = { TranscriptReader, FamilyReader, discoverSessions, SESSION_LIMIT, FAMILY_LIMIT, LANE_EVENTS };
