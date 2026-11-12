'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { createHash } = require('node:crypto');
const { createSession, applyRecord, projectName } = require('./transcript');

// WARNING: these are disclosed history/list limits, not claims of complete coverage.
const SESSION_LIMIT = 80;
const MAX_LINE = 4 * 1024 * 1024;
const READ_BUDGET = 8 * 1024 * 1024;
const CHUNK = 256 * 1024;

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

async function discoverSessions({ claudeRoot, codexRoot }, limit = SESSION_LIMIT) {
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
          files.push({ id: `${provider}:${createHash('sha256').update(file).digest('hex').slice(0, 20)}`, sessionId: id, file, provider, modified: stat.mtimeMs, project: '', child: path.basename(folder) === 'subagents' });
        } catch (error) {
          if (error.code !== 'ENOENT') warnings.push(`${provider} transcript metadata could not be read (${error.code || 'unknown'}).`);
        }
      }
    }
  }
  await walk(path.join(claudeRoot, 'projects'), 'claude', true);
  await walk(path.join(codexRoot, 'sessions'), 'codex', true);
  files.sort((a, b) => b.modified - a.modified || a.id.localeCompare(b.id));
  const sessions = files.slice(0, limit);
  if (files.length > limit) warnings.push(`Showing the ${limit} most recently written sessions of ${files.length}.`);
  for (const session of sessions) {
    let handle;
    try {
      handle = await fs.open(session.file, 'r');
      // WARNING: metadata preview only; a large first record can leave a project label unavailable.
      const buffer = Buffer.alloc(64 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      for (const line of buffer.subarray(0, bytesRead).toString('utf8').split('\n')) {
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        const cwd = record.type === 'session_meta' ? record.payload?.cwd : record.cwd;
        if (typeof cwd === 'string') { session.project = projectName(cwd); break; }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') warnings.push(`A session label could not be read (${error.code || 'unknown'}).`);
    } finally { if (handle) await handle.close(); }
  }
  return { sessions, warnings: [...new Set(warnings)], total: files.length };
}

module.exports = { TranscriptReader, discoverSessions, SESSION_LIMIT };
