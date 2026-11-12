'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { createHash } = require('node:crypto');
const { createSession, applyRecord, projectName, sessionTitle, workspaceIdentity, UNNAMED_SESSION } = require('./transcript');

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

class TranscriptReader {
  constructor(provider, id) {
    this.provider = provider;
    this.id = id;
    this.reset();
  }

  reset() {
    this.state = createSession(this.provider, this.id);
    this.offset = 0;
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
      if (this.skipping) { this.skipping = false; continue; }
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE) { this.state.oversizedLines++; continue; }
      if (!line.trim()) continue;
      let record;
      try { record = JSON.parse(line); } catch { this.state.invalidLines++; continue; }
      if (record?.timestamp !== undefined && typeof record.timestamp !== 'string') { this.state.invalidLines++; continue; }
      try { applyRecord(this.state, record); } catch { this.state.invalidLines++; }
    }
    if (Buffer.byteLength(this.tail, 'utf8') > MAX_LINE) {
      if (!this.skipping) this.state.oversizedLines++;
      this.tail = '';
      this.skipping = true;
    }
  }

  async read(file) {
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
      const target = Math.min(stat.size, this.offset + READ_BUDGET);
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

// Lists every transcript file with its stat. Nothing is opened here.
async function walkSources({ claudeRoot, codexRoot }) {
  const files = [];
  const warnings = [];
  async function walk(folder, provider, root = false) {
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); }
    catch (error) {
      warnings.push(`${provider === 'claude' ? 'Claude' : 'Codex'} ${root && error.code === 'ENOENT' ? 'sessions folder not found' : `folder could not be read (${error.code || 'unknown'})`}.`);
      return;
    }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(file, provider);
      else if (entry.isFile() && entry.name.endsWith('.jsonl') && (provider === 'claude' || entry.name.startsWith('rollout-'))) {
        try {
          const stat = await fs.stat(file);
          const id = provider === 'codex' ? entry.name.match(/([0-9a-f-]{36})\.jsonl$/i)?.[1] || entry.name.slice(8, -6) : entry.name.replace(/^agent-/, '').slice(0, -6);
          files.push({ id: `${provider}:${createHash('sha256').update(file).digest('hex').slice(0, 20)}`, sessionId: id, file, provider, modified: stat.mtimeMs, size: stat.size, identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`, project: '', child: path.basename(folder) === 'subagents' });
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
      entry = { identity, offset: 0, size: 0, headSize: -1, cwd: '', headDone: false, custom: '', generated: '', carry: Buffer.alloc(0), skipping: false };
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
        if (typeof cwd === 'string' && cwd.trim()) { entry.cwd = cwd; break; }
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

module.exports = { TranscriptReader, discoverSessions, SESSION_LIMIT };
