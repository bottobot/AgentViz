'use strict';
// Inspects a built VSIX: what is in it, its checksum, and whether anything other than the product files or any
// local path got in. Run by `npm run package:check` after `npm run package`. Node builtins only.
//   node test/vsix-check.js [file.vsix] [--receipt=<file.json>]
// Exit 0 only when the archive was read and every check held. A missing or unreadable archive is a failure,
// never a pass. This says nothing about the extension working in VS Code; see `npm run host`.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

// The whole product. Anything else in the archive fails the check until it is listed here on purpose.
const PRODUCT = ['extension/package.json', 'extension/readme.md', 'extension/media/app.js', 'extension/media/style.css', 'extension/media/view.js', 'extension/resources/agentviz.svg',
  'extension/src/extension.js', 'extension/src/sessions.js', 'extension/src/transcript.js', 'extension/src/webview.js'];
// Written by the packaging tool itself.
const ENVELOPE = ['[Content_Types].xml', 'extension.vsixmanifest'];

// Reads a zip's central directory and inflates each entry. Stored and deflated entries only, no zip64.
function readArchive(buffer) {
  let end = -1;
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 22 - 65535); at--) if (buffer.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  if (end === -1) throw new Error('not a zip archive (no end record)');
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('damaged zip directory');
    const method = buffer.readUInt16LE(at + 10);
    const packed = buffer.readUInt32LE(at + 20);
    const size = buffer.readUInt32LE(at + 24);
    const nameLength = buffer.readUInt16LE(at + 28);
    const local = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + buffer.readUInt16LE(at + 30) + buffer.readUInt16LE(at + 32);
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`damaged zip entry (${name})`);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + packed);
    if (method !== 0 && method !== 8) throw new Error(`unsupported zip method ${method} (${name})`);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    if (data.length !== size) throw new Error(`size mismatch (${name})`);
    entries.push({ name, data });
  }
  return entries;
}

// Local paths that must never be in a package: this machine's home folder and user name in a path, in either
// separator style. Compared without case.
function privateNeedles(home = os.homedir(), user = os.userInfo().username) {
  const needles = new Set();
  if (home && home.length > 3) for (const form of [home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')]) needles.add(form.toLowerCase());
  if (user) for (const form of [`\\users\\${user}`, `/users/${user}`, `\\\\users\\\\${user}`, `/home/${user}`]) needles.add(form.toLowerCase());
  return [...needles];
}

// entries: [{ name, data }]. Returns { files, problems }; an empty `problems` is the only pass.
function judge(entries, needles = privateNeedles()) {
  const problems = [];
  const names = entries.map(entry => entry.name);
  const lower = names.map(name => name.toLowerCase());
  for (const name of names) if (![...PRODUCT, ...ENVELOPE].includes(name)) problems.push(`unexpected file in the package: ${name}`);
  for (const name of [...PRODUCT, ...ENVELOPE]) if (!names.includes(name)) problems.push(`missing from the package: ${name}`);
  if (new Set(lower).size !== lower.length) problems.push('the package holds the same path twice');
  for (const entry of entries) {
    const text = entry.data.toString('utf8').toLowerCase();
    for (const needle of needles) if (text.includes(needle)) problems.push(`a local path of this machine is inside ${entry.name}`);
  }
  const manifest = entries.find(entry => entry.name === 'extension/package.json');
  if (manifest) {
    try {
      const value = JSON.parse(manifest.data.toString('utf8'));
      if (value.dependencies && Object.keys(value.dependencies).length) problems.push('package.json declares runtime dependencies');
      if (value.main !== './src/extension.js') problems.push('package.json main is not ./src/extension.js');
    } catch { problems.push('package.json in the package is not readable JSON'); }
  }
  return { files: entries.map(entry => ({ name: entry.name, bytes: entry.data.length, sha256: createHash('sha256').update(entry.data).digest('hex') })), problems: [...new Set(problems)] };
}

// A package built before a later edit is stale. `checkout` is the folder the package claims to come from.
function staleFiles(entries, checkout) {
  const stale = [];
  for (const name of PRODUCT) {
    const entry = entries.find(candidate => candidate.name === name);
    const source = path.join(checkout, name === 'extension/readme.md' ? 'README.md' : name.slice('extension/'.length));
    let current = null;
    try { current = fs.readFileSync(source); } catch { /* reported below as differing */ }
    if (entry && !(current && entry.data.equals(current))) stale.push(`${name} differs from the checkout; build the package again`);
  }
  return stale;
}

function inspect(file, checkout) {
  const buffer = fs.readFileSync(file);
  const entries = readArchive(buffer);
  const result = judge(entries);
  if (checkout) result.problems.push(...staleFiles(entries, checkout));
  return { file: path.basename(file), bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'), ...result, passed: result.problems.length === 0 };
}

function main(argv) {
  const root = path.join(__dirname, '..');
  const named = argv.find(arg => !arg.startsWith('--'));
  const { name, version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const file = named ? path.resolve(named) : path.join(root, `${name}-${version}.vsix`);
  const receipt = (argv.find(arg => arg.startsWith('--receipt=')) || '').slice(10);
  // An old receipt must not stand in for this run.
  if (receipt) fs.rmSync(receipt, { force: true });
  const result = inspect(file, root);
  for (const entry of result.files) console.log(`${String(entry.bytes).padStart(8)}  ${entry.sha256.slice(0, 16)}  ${entry.name}`);
  console.log(`${result.file}: ${result.files.length} files, ${result.bytes} bytes`);
  console.log(`sha256 ${result.sha256}`);
  for (const problem of result.problems) console.log(`FAIL ${problem}`);
  console.log(result.passed ? 'PASS inclusion set, local-path scan and match with this checkout. Not checked here: that the extension runs (npm run host).' : 'FAIL');
  if (receipt) {
    fs.mkdirSync(path.dirname(path.resolve(receipt)), { recursive: true });
    fs.writeFileSync(receipt, JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
  }
  return result.passed ? 0 : 1;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`FAIL ${error.code === 'ENOENT' ? 'no VSIX found; run npm run package first' : error.message}`); process.exitCode = 1; }
}

module.exports = { readArchive, judge, inspect, staleFiles, privateNeedles, PRODUCT, ENVELOPE };
