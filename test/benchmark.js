'use strict';
// S08 cost measurement on synthetic histories. Not part of `npm test`; run it by hand:
//   node test/benchmark.js [output.json] [--small]
// It writes invented transcripts to a temporary folder, runs the real discovery, readers, host and view over
// them, prints counts, bytes and timings, and removes the folder. It reads nothing outside that folder.
// Every cap that shaped a number is printed beside it (see `caps` in the result).
const fs = require('node:fs');
const path = require('node:path');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { discoverSessions, FamilyReader, SESSION_LIMIT, FAMILY_LIMIT, LANE_EVENTS } = require('../src/sessions');
const { MAX_EVENTS } = require('../src/transcript');
const view = require('../media/view');
const fx = require('./resilience-fixture');

const small = process.argv.includes('--small');
const output = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const SIZE = small
  ? { projects: 20, perProject: 5, children: 2, codex: 40, bulk: 4, bulkMb: 2, mainMb: 6, familyChildren: 6, childMb: 0.5 }
  : { projects: 300, perProject: 7, children: 1, codex: 1000, bulk: 40, bulkMb: 5, mainMb: 64, familyChildren: 30, childMb: 2 };
const T0 = Date.parse('2026-11-01T00:00:00Z');
const ms = value => Math.round(value * 10) / 10;

// The longest stretch the event loop was held, in ms, while `work` ran: the host's responsiveness to messages.
async function timed(work) {
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  const start = performance.now();
  const value = await work();
  const elapsed = performance.now() - start;
  await new Promise(resolve => setTimeout(resolve, 5));
  delay.disable();
  return { value, elapsed: ms(elapsed), longestBlock: ms(delay.max / 1e6) };
}

function bigTranscript(file, megabytes, sessionId, cwd, agentId, prefix) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const handle = fs.openSync(file, 'w');
  fs.writeSync(handle, fx.claudeHead(sessionId, T0, cwd, agentId));
  let bytes = 0;
  let calls = 0;
  while (bytes < megabytes * 1024 * 1024) {
    let chunk = '';
    for (let index = 0; index < 200; index++, calls++) {
      chunk += fx.claudeCall(sessionId, T0 + calls * 1000, `${prefix}-${calls}`, { agentId, filler: 200 + (calls % 5) * 150, failed: calls % 37 === 0, tool: ['Read', 'Edit', 'Bash', 'WebFetch'][calls % 4] });
      if (!agentId && calls % 500 === 0) chunk += fx.claudeTitle(sessionId, `Synthetic big session ${calls}`);
    }
    bytes += fs.writeSync(handle, chunk);
  }
  fs.closeSync(handle);
  return calls;
}

async function main() {
  const root = fx.tempRoot('bench');
  const claudeRoot = path.join(root, 'claude');
  const codexRoot = path.join(root, 'codex');
  const result = { date: new Date().toISOString(), node: process.version, platform: process.platform, scale: small ? 'small' : 'full',
    caps: { returnedSessions: SESSION_LIMIT, retainedEventsPerTranscript: MAX_EVENTS, subagentLanes: FAMILY_LIMIT, eventsSentPerLane: LANE_EVENTS,
      mainBytesPerPass: 8 * 1024 * 1024, childBytesPerPass: 24 * 1024 * 1024, projectReadsPerCall: 1500, titleBytesPerCall: 256 * 1024 * 1024, recordBytes: 4 * 1024 * 1024 } };
  try {
    // 1. A catalogue: many small transcripts in many projects, some large ones, a Codex index.
    const made = await timed(async () => {
      let files = 0;
      let bytes = 0;
      let n = 0;
      for (let project = 0; project < SIZE.projects; project++) {
        const cwd = `C:\\PRIVATE_PATH\\work\\group-${project % 10}\\project-${project % 250}`;
        for (let index = 0; index < SIZE.perProject; index++) {
          const id = fx.uuid(++n);
          let text = fx.claudeHead(id, T0 + n * 60000, cwd);
          for (let call = 0; call < 6; call++) text += fx.claudeCall(id, T0 + n * 60000 + call * 1000, `c${n}-${call}`, { filler: 300 });
          if (n % 3) text += fx.claudeTitle(id, `Synthetic task ${n % 50}`, n % 2 ? 'custom-title' : 'ai-title');
          bytes += text.length; files++;
          fx.write(fx.claudeFile(claudeRoot, `p-${project}`, id), text);
          for (let child = 0; child < SIZE.children && index === 0; child++) {
            const agent = `ag${n}x${child}`;
            const childText = fx.claudeHead(id, T0 + n * 60000, cwd, agent) + fx.claudeCall(id, T0 + n * 60000 + 5, `k${n}-${child}`, { agentId: agent, filler: 300 });
            bytes += childText.length; files++;
            fx.write(fx.claudeChildFile(claudeRoot, `p-${project}`, id, agent), childText);
          }
        }
      }
      let index = '';
      for (let codex = 0; codex < SIZE.codex; codex++) {
        const id = fx.uuid(900000 + codex);
        let text = fx.codexHead(id, T0 + codex * 45000, `/PRIVATE_PATH/home/dev/repo-${codex % 40}`, codex % 9 === 8 ? fx.uuid(900000 + codex - 1) : '');
        for (let call = 0; call < 6; call++) text += fx.codexCall(T0 + codex * 45000 + call * 1000, `x${codex}-${call}`, { filler: 300 });
        bytes += text.length; files++;
        fx.write(fx.codexFile(codexRoot, id, `2026/11/${String(1 + codex % 28).padStart(2, '0')}`), text);
        if (codex % 4 === 0) index += fx.line({ id, thread_name: `Synthetic thread ${codex % 30}`, updated_at: fx.stamp(T0 + codex) });
      }
      fx.write(path.join(codexRoot, 'session_index.jsonl'), index);
      for (let bulk = 0; bulk < SIZE.bulk; bulk++) {
        const id = fx.uuid(700000 + bulk);
        const file = fx.claudeFile(claudeRoot, `p-bulk-${bulk % 5}`, id);
        bigTranscript(file, SIZE.bulkMb, id, `D:\\PRIVATE_PATH\\bulk\\project-${bulk % 5}`, '', `b${bulk}`);
        bytes += fs.statSync(file).size; files++;
      }
      return { files, bytes };
    });
    // 2. One large family: a main transcript past the retained-event cap and more children than the lane cap.
    const familyId = fx.uuid(800000);
    const familyCwd = 'C:\\PRIVATE_PATH\\work\\family-project';
    const mainFile = fx.claudeFile(claudeRoot, 'p-family', familyId);
    const mainCalls = bigTranscript(mainFile, SIZE.mainMb, familyId, familyCwd, '', 'm');
    let childCalls = 0;
    const childFiles = [];
    for (let child = 0; child < SIZE.familyChildren; child++) {
      const agent = `fam${String(child).padStart(3, '0')}`;
      const file = fx.claudeChildFile(claudeRoot, 'p-family', familyId, agent);
      childCalls += bigTranscript(file, SIZE.childMb, familyId, familyCwd, agent, `f${child}`);
      fs.writeFileSync(file.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'synthetic-worker', toolUseId: `m-${child}`, description: 'PRIVATE_TASK', finished: child % 2 === 0 }));
      childFiles.push(file);
    }
    const familyBytes = fs.statSync(mainFile).size + childFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
    result.fixture = { catalogueFiles: made.value.files + 1 + childFiles.length, catalogueBytes: made.value.bytes + familyBytes, writeMs: made.elapsed,
      family: { mainBytes: fs.statSync(mainFile).size, mainCalls, children: childFiles.length, childBytes: familyBytes - fs.statSync(mainFile).size, childCalls } };

    // 3. Discovery: first calls until every project is read, then a refresh, a filter and a name search.
    const roots = { claudeRoot, codexRoot };
    const discovery = { firstCalls: [] };
    let found;
    for (let call = 0; call < 20; call++) {
      const run = await timed(() => discoverSessions(roots, found ? { walk: undefined } : {}));
      found = run.value;
      discovery.firstCalls.push({ ms: run.elapsed, longestBlockMs: run.longestBlock, opened: found.cost.opened, bytesRead: found.cost.bytesRead, pendingProjects: found.pending.workspaces });
      if (!found.pending.workspaces) break;
    }
    discovery.total = found.total;
    discovery.returned = found.sessions.length;
    discovery.projects = found.workspaces.length;
    discovery.children = found.all.filter(session => session.child).length;
    const refresh = await timed(() => discoverSessions(roots, {}));
    discovery.unchangedRefresh = { ms: refresh.elapsed, longestBlockMs: refresh.longestBlock, opened: refresh.value.cost.opened, bytesRead: refresh.value.cost.bytesRead };
    const oldest = found.all.at(-1);
    const byId = await timed(() => discoverSessions(roots, { query: { id: oldest.sessionId }, walk: found.walk }));
    discovery.fullIdOnReusedListing = { ms: byId.elapsed, matched: byId.value.matched, inRecentList: found.sessions.includes(oldest), opened: byId.value.cost.opened, bytesRead: byId.value.cost.bytesRead };
    const byProject = await timed(() => discoverSessions(roots, { query: { workspaceKey: oldest.workspaceKey }, walk: found.walk }));
    discovery.projectOnReusedListing = { ms: byProject.elapsed, matched: byProject.value.matched, opened: byProject.value.cost.opened, bytesRead: byProject.value.cost.bytesRead };
    const names = { calls: [] };
    for (let call = 0; call < 200; call++) {
      const run = await timed(() => discoverSessions(roots, { query: { name: 'synthetic task 7' }, walk: found.walk }));
      names.calls.push({ ms: run.elapsed, longestBlockMs: run.longestBlock, opened: run.value.cost.opened, bytesRead: run.value.cost.bytesRead, pendingNames: run.value.pending.names, matched: run.value.matched });
      if (!run.value.pending.names) break;
    }
    discovery.coldNameSearch = { calls: names.calls.length, ms: ms(names.calls.reduce((sum, call) => sum + call.ms, 0)), bytesRead: names.calls.reduce((sum, call) => sum + call.bytesRead, 0),
      opened: names.calls.reduce((sum, call) => sum + call.opened, 0), longestBlockMs: Math.max(...names.calls.map(call => call.longestBlockMs)), matched: names.calls.at(-1).matched, pendingAtEnd: names.calls.at(-1).pendingNames };
    const again = await timed(() => discoverSessions(roots, { query: { name: 'synthetic task 7' }, walk: found.walk }));
    discovery.warmNameSearch = { ms: again.elapsed, opened: again.value.cost.opened, bytesRead: again.value.cost.bytesRead, matched: again.value.matched };
    result.discovery = discovery;

    // 4. Following the family: passes until fully read, an unchanged pass, an appended pass.
    const listing = (await discoverSessions(roots, {})).all;
    const followed = listing.find(session => session.file === mainFile);
    const reader = new FamilyReader('claude', followed.sessionId);
    const passes = [];
    let snapshot;
    for (let pass = 0; pass < 400; pass++) {
      const before = reader.main.offset + [...reader.children.values()].reduce((sum, child) => sum + child.reader.offset, 0);
      const run = await timed(() => reader.read(mainFile, { files: listing }));
      snapshot = run.value;
      const after = reader.main.offset + [...reader.children.values()].reduce((sum, child) => sum + child.reader.offset, 0);
      passes.push({ ms: run.elapsed, longestBlockMs: run.longestBlock, bytesRead: after - before });
      if (!snapshot.loading) break;
    }
    const sum = key => passes.reduce((total, pass) => total + pass[key], 0);
    const lanes = snapshot.family.lanes;
    const follow = { firstLoad: { passes: passes.length, ms: ms(sum('ms')), bytesRead: sum('bytesRead'), slowestPassMs: Math.max(...passes.map(pass => pass.ms)), longestBlockMs: Math.max(...passes.map(pass => pass.longestBlockMs)), stillLoading: snapshot.loading },
      mainEventsRetained: snapshot.events.length, mainEventsDropped: snapshot.droppedEvents, lanes: lanes.length - 1, childrenFound: snapshot.family.found,
      laneEventsSent: lanes.slice(1).reduce((total, lane) => total + lane.events.length, 0), laneEventsOmitted: lanes.slice(1).reduce((total, lane) => total + lane.omitted, 0), notes: snapshot.family.notes.length };
    const idle = [];
    for (let pass = 0; pass < 5; pass++) idle.push(await timed(() => reader.read(mainFile, { files: listing })));
    follow.unchangedPass = { ms: ms(idle.reduce((total, run) => total + run.elapsed, 0) / idle.length), longestBlockMs: Math.max(...idle.map(run => run.longestBlock)), bytesRead: 0 };
    let appended = '';
    for (let call = 0; call < 50; call++) appended += fx.claudeCall(familyId, T0 + (mainCalls + call) * 1000, `append-${call}`, { filler: 400 });
    fs.appendFileSync(mainFile, appended);
    fs.appendFileSync(childFiles.at(-1), fx.claudeCall(familyId, T0 + 5, 'append-child', { agentId: `fam${String(SIZE.familyChildren - 1).padStart(3, '0')}`, filler: 400 }));
    const offset = reader.main.offset;
    const grow = await timed(() => reader.read(mainFile, { files: listing }));
    snapshot = grow.value;
    follow.appendPass = { ms: grow.elapsed, longestBlockMs: grow.longestBlock, mainBytesAppended: Buffer.byteLength(appended), mainBytesRead: reader.main.offset - offset, recordsAppended: 101 };
    result.follow = follow;

    // 5. What one pass sends and what the view does with it.
    const sent = await timed(async () => JSON.stringify({ type: 'state', snapshot }));
    const message = JSON.parse(sent.value);
    const drawn = await timed(async () => view.render(message.snapshot, { now: T0 + mainCalls * 1000, identity: { workspaceLabel: 'family-project', name: 'Synthetic', sessionId: familyId, provider: 'claude' }, warnings: [] }));
    const leaked = fx.SENTINELS.filter(word => sent.value.includes(word) || drawn.value.includes(word));
    result.message = { bytes: Buffer.byteLength(sent.value), serializeMs: sent.elapsed, events: message.snapshot.events.length + message.snapshot.family.lanes.slice(1).reduce((total, lane) => total + lane.events.length, 0),
      renderMs: drawn.elapsed, htmlBytes: Buffer.byteLength(drawn.value), sentinelsFound: leaked };
    result.memory = { heapUsedMb: ms(process.memoryUsage().heapUsed / 1048576), rssMb: ms(process.memoryUsage().rss / 1048576) };
  } finally { fx.remove(root); }
  const text = JSON.stringify(result, null, 2);
  if (output) { fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); fs.writeFileSync(output, text + '\n'); }
  console.log(text);
  if (result.message?.sentinelsFound.length) { console.error('Private sentinels reached the message or the page.'); process.exitCode = 1; }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
