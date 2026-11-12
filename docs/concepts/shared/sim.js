/* AgentViz concept build-outs: shared simulated session.
 *
 * One synthetic Claude Code session that keeps working while a page is open. Every concept page loads this file
 * with a plain <script src="../shared/sim.js"></script> and reads the same data, so the concepts can be compared
 * and later combined. No dependency, no network, works from file://.
 *
 *   const sim = AgentVizSim.create({ seed: 7, speed: 1, history: 14 });  // history = minutes pre-filled
 *   sim.on('start', call => ...)   a tool call began (status 'running')
 *   sim.on('end', call => ...)     a call finished (status 'success' | 'error'); same object, now complete
 *   sim.on('marker', m => ...)     prompt, turn complete, compaction, context file loaded
 *   sim.on('lane', lane => ...)    a subagent lane was created or changed state
 *   sim.on('tasks', list => ...)   the agent's own task list changed
 *   sim.on('tick', state => ...)   about 4x a second, for clocks and decay
 *   sim.start(); sim.pause(); sim.setSpeed(2); sim.state (live snapshot, see bottom of file)
 *
 * Simulated. R9 of the brief: the back end is decided later. The data is richer than today's transcript reader
 * (tool inputs, outputs, error codes, token sizes, diffs) on purpose, so the views can show what a user would want
 * to drill into. Times are real wall-clock milliseconds.
 */
(function (root) {
  'use strict';

  // ---------- seeded randomness ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---------- the world the session works in ----------
  const KINDS = ['files', 'edits', 'shell', 'network', 'agents', 'memory', 'other'];
  const KIND_INFO = {
    files: { name: 'Files', verb: 'reads', tools: ['Read', 'Grep', 'Glob'] },
    edits: { name: 'Edits', verb: 'writes', tools: ['Edit', 'Write', 'MultiEdit'] },
    shell: { name: 'Shell', verb: 'runs', tools: ['Bash'] },
    network: { name: 'Network', verb: 'fetches', tools: ['WebFetch', 'WebSearch'] },
    agents: { name: 'Agents', verb: 'delegates', tools: ['Task'] },
    memory: { name: 'Memory', verb: 'plans', tools: ['TodoWrite', 'TaskUpdate'] },
    other: { name: 'Other', verb: 'uses', tools: ['mcp__github__get_issue', 'NotebookEdit'] }
  };

  const FILES = [
    { path: 'src/extension.js', lines: 412, lang: 'js' }, { path: 'src/transcript.js', lines: 640, lang: 'js' },
    { path: 'src/sessions.js', lines: 780, lang: 'js' }, { path: 'src/webview.js', lines: 74, lang: 'js' },
    { path: 'media/view.js', lines: 568, lang: 'js' }, { path: 'media/app.js', lines: 390, lang: 'js' },
    { path: 'media/style.css', lines: 520, lang: 'css' }, { path: 'test/view.test.js', lines: 210, lang: 'js' },
    { path: 'test/transcript.test.js', lines: 188, lang: 'js' }, { path: 'test/sessions.test.js', lines: 700, lang: 'js' },
    { path: 'package.json', lines: 58, lang: 'json' }, { path: 'README.md', lines: 230, lang: 'md' },
    { path: 'docs/ui-exploration/PLAN.md', lines: 103, lang: 'md' }
  ];
  const CONTEXT_FILES = [
    { path: '~/.claude/CLAUDE.md', tokens: 2100, why: 'User instructions, loaded at session start' },
    { path: 'CLAUDE.md', tokens: 1400, why: 'Project instructions, loaded at session start' },
    { path: '.claude/memory/MEMORY.md', tokens: 620, why: 'Memory index, loaded at session start' },
    { path: '.claude/skills/run/SKILL.md', tokens: 1800, why: 'Skill loaded on demand' }
  ];
  const HOSTS = [
    { host: 'code.visualstudio.com', path: '/api/references/vscode-api', title: 'VS Code API reference' },
    { host: 'developer.mozilla.org', path: '/en-US/docs/Web/API/ResizeObserver', title: 'ResizeObserver - MDN' },
    { host: 'nodejs.org', path: '/api/test.html', title: 'Test runner | Node.js docs' },
    { host: 'github.com', path: '/microsoft/vscode/issues/201843', title: 'Webview CSP blocks inline style' }
  ];
  const ERRORS = {
    shell: [
      { code: 'EXIT 1', name: 'Test failure', message: 'node --test: 2 of 41 tests failed', hint: 'view.test.js > renders lanes: expected 3 rows, got 2' },
      { code: 'EXIT 2', name: 'Syntax error', message: 'SyntaxError: Unexpected token \')\' at media/view.js:212', hint: 'An edit left an unbalanced parenthesis' },
      { code: 'EXIT 127', name: 'Command not found', message: 'vsce: command not found', hint: 'Use npx @vscode/vsce' },
      { code: 'TIMEOUT', name: 'Timed out', message: 'Command exceeded 120000 ms and was stopped', hint: 'The host runner waited for a window that never opened' }
    ],
    files: [
      { code: 'ENOENT', name: 'File not found', message: 'ENOENT: no such file or directory, open \'src/session.js\'', hint: 'The file is src/sessions.js' },
      { code: 'EISDIR', name: 'Is a directory', message: 'EISDIR: illegal operation on a directory, read', hint: 'Path pointed at test/' }
    ],
    edits: [
      { code: 'NO_MATCH', name: 'String not found', message: 'old_string was not found in the file', hint: 'The file changed since it was read' },
      { code: 'NOT_UNIQUE', name: 'String not unique', message: 'old_string matches 3 places; add context or use replace_all', hint: 'Widen the match' },
      { code: 'NOT_READ', name: 'File not read', message: 'File has not been read yet. Read it first before writing to it.', hint: 'Read before Write' }
    ],
    network: [
      { code: 'HTTP 404', name: 'Not found', message: 'GET returned 404 Not Found', hint: 'Page moved' },
      { code: 'HTTP 429', name: 'Rate limited', message: 'GET returned 429 Too Many Requests', hint: 'Retry later' }
    ],
    agents: [{ code: 'AGENT_FAILED', name: 'Subagent failed', message: 'Subagent ended with an error: tests still failing', hint: 'See the subagent lane' }],
    memory: [{ code: 'INVALID_ID', name: 'Unknown task', message: 'TaskUpdate named task 9, which does not exist', hint: 'Not counted in the list' }],
    other: [{ code: 'MCP_ERROR', name: 'MCP server error', message: 'github: 401 Bad credentials', hint: 'Token expired' }]
  };
  const TEST_NAMES = ['renders lanes', 'folds repeats', 'counts errors since prompt', 'keeps privacy note', 'context meter amber at 70', 'footprint matches stations', 'example session renders'];
  const SNIPPETS = {
    js: ['function laneFacts(lane, at = clock) {', '  const { calls, errors } = laneCounts(lane.events);', '  if (lane.missing) facts.push(\'Transcript not found\');', '  return facts;', '}', 'const escape = value => String(value ?? \'\');', 'for (const event of events) {', '  if (event.outcome === \'error\') errors++;'],
    css: ['.station.active .station-ring {', '  stroke: var(--accent);', '  stroke-width: 3;', '}', '@media (max-width: 720px) {', '  .workspace-grid { grid-template-columns: 1fr; }'],
    json: ['{', '  "name": "agent-viz",', '  "engines": { "vscode": "^1.96.0" },', '  "scripts": { "test": "node --test test/*.test.js" }'],
    md: ['## Open and compare', 'Open `index.html` in this directory directly in a desktop browser.', '- Activity desk: expand the shell-error disclosure.', '| State | Required presentation |']
  };

  // Places data lives or passes through. Every hop of every call names two of these.
  //   source: data comes from here; process: transforms data; sink: data ends up here; store: both.
  function baseNodes() {
    const nodes = [
      { id: 'user', type: 'source', group: 'user', label: 'User prompt' },
      { id: 'model', type: 'process', group: 'model', label: 'Model (main)' },
      { id: 'context', type: 'store', group: 'context', label: 'Context window' },
      { id: 'terminal', type: 'sink', group: 'terminal', label: 'Terminal' },
      { id: 'plan', type: 'store', group: 'plan', label: 'Task list' },
      { id: 'answer', type: 'sink', group: 'answer', label: 'Reply to user' }
    ];
    for (const kind of KINDS) nodes.push({ id: `tool:${kind}`, type: 'process', group: 'tool', kind, label: KIND_INFO[kind].name });
    for (const file of FILES) nodes.push({ id: `file:${file.path}`, type: 'store', group: 'disk', label: file.path, lines: file.lines });
    for (const file of CONTEXT_FILES) nodes.push({ id: `ctxfile:${file.path}`, type: 'source', group: 'contextfile', label: file.path, tokens: file.tokens });
    for (const host of HOSTS) nodes.push({ id: `web:${host.host}`, type: 'source', group: 'web', label: host.host });
    nodes.push({ id: 'mcp:github', type: 'source', group: 'web', label: 'MCP github' });
    return nodes;
  }

  function create(options = {}) {
    const random = rng(options.seed ?? 7);
    const pick = list => list[Math.floor(random() * list.length)];
    const between = (min, max) => Math.round(min + random() * (max - min));
    const listeners = {};
    const emit = (type, payload) => { for (const fn of listeners[type] || []) { try { fn(payload); } catch (error) { setTimeout(() => { throw error; }); } } };
    let speed = options.speed ?? 1;
    let clock = 0; // simulated now (ms), advances in real time * speed once started
    let timer = null;
    let lastReal = 0;
    let seq = 0;
    let replaying = true;

    const CAPACITY = 200000;
    const state = {
      session: { id: 'sim-7f3a9c2e-41d0-4b8a-9e55-2c6d1f0a8b13', provider: 'claude', model: 'claude-opus-5-5', project: 'AgentViz', name: 'Rework the stations map', cwd: 'C:/Users/dev/AgentViz', startedAt: 0, status: 'active', turn: 0, branch: 'feat/concepts' },
      nodes: baseNodes(),
      calls: [],          // every tool call, oldest first (main and subagent lanes)
      markers: [],        // prompts, turn ends, compactions, context-file loads
      lanes: [],          // main + subagents
      files: {},          // path -> { path, reads, edits, failed, added, removed, lastTouched, touches: [callId] }
      tasks: { source: 'claude-tasks', items: [], updatedAt: 0 },
      context: { used: 0, capacity: CAPACITY, percent: 0, samples: [], compactions: 0, files: [] },
      counts: Object.fromEntries(KINDS.map(kind => [kind, 0])),
      errors: [],         // calls that ended in error, newest last
      tokens: { input: 0, output: 0, cacheRead: 0 },
      get now() { return clock; }
    };
    const node = id => state.nodes.find(entry => entry.id === id);
    const ensureNode = (id, extra) => { if (!node(id)) state.nodes.push({ id, ...extra }); return id; };

    // ---------- context accounting ----------
    function addContext(tokens, why, callId) {
      state.context.used = Math.max(0, state.context.used + tokens);
      if (state.context.used > CAPACITY * 0.92) {
        const before = state.context.used;
        state.context.used = Math.round(CAPACITY * 0.28);
        state.context.compactions++;
        marker('compaction', `Context compacted ${Math.round(before / 1000)}k to ${Math.round(state.context.used / 1000)}k tokens`, { before, after: state.context.used });
      }
      state.context.percent = Math.round(state.context.used / CAPACITY * 1000) / 10;
      state.context.samples.push({ time: clock, used: state.context.used, percent: state.context.percent, delta: tokens, why, callId });
      if (state.context.samples.length > 2000) state.context.samples.shift();
    }

    function marker(kind, label, detail = {}) {
      const entry = { id: `m${++seq}`, seq, time: clock, kind, label, detail, lane: 'main' };
      state.markers.push(entry);
      emit('marker', entry);
      return entry;
    }

    // ---------- lanes ----------
    function lane(key, label, parent, depth, task) {
      const entry = { key, label, parent, depth, role: depth ? 'subagent' : 'main', task: task || '', agentType: depth ? pick(['Explore', 'general-purpose', 'verifier']) : 'main', model: depth ? pick(['claude-opus-5-5', 'claude-haiku-5-5']) : 'claude-opus-5-5', state: 'running', startedAt: clock, endedAt: null, calls: 0, errors: 0, tokens: 0, result: '' };
      state.lanes.push(entry);
      ensureNode(`lane:${key}`, { type: 'process', group: 'lane', label: `${label} (subagent)`, lane: key });
      emit('lane', entry);
      return entry;
    }

    // ---------- calls ----------
    // A call: who made it, what it was asked, what moved where, what came back, and in what condition.
    function call(laneKey, kind, spec) {
      const owner = state.lanes.find(entry => entry.key === laneKey) || state.lanes[0];
      const id = `c${++seq}`;
      const entry = {
        id, seq, lane: owner.key, laneLabel: owner.label, depth: owner.depth, kind, tool: spec.tool, label: spec.label,
        target: spec.target || null,          // { type: 'file'|'command'|'url'|'query'|'agent'|'plan'|'pattern', value }
        input: spec.input || {},              // tool arguments as shown to a user (summarised, no secrets)
        status: 'running', startedAt: clock, endedAt: null, duration: spec.duration,
        causedBy: spec.causedBy || null,      // id of an earlier call whose result led to this one
        flow: spec.flow || [],                // hops: [{ from: nodeId, to: nodeId, what, tokens?, bytes? }]
        output: null, error: null, tokens: { in: 0, out: 0 }, contextAfter: null,
        refs: spec.refs || [],                // [{ type: 'file'|'url'|'lane'|'task'|'contextfile', value, role: 'read'|'wrote'|'cited'|'spawned' }]
        diff: null, attempt: spec.attempt || 1, retryOf: spec.retryOf || null
      };
      entry._finish = spec.finish;
      state.calls.push(entry);
      state.counts[kind]++;
      owner.calls++;
      emit('start', entry);
      return entry;
    }

    function finish(entry) {
      const result = entry._finish ? entry._finish(entry) : {};
      delete entry._finish;
      entry.endedAt = clock;
      entry.status = result.error ? 'error' : 'success';
      entry.output = result.output || null;
      entry.error = result.error || null;
      entry.diff = result.diff || null;
      entry.tokens = { in: result.tokensIn ?? between(40, 400), out: result.tokensOut ?? between(20, 160) };
      if (result.flow) entry.flow.push(...result.flow);
      if (result.refs) entry.refs.push(...result.refs);
      const owner = state.lanes.find(laneEntry => laneEntry.key === entry.lane);
      if (owner) owner.tokens += entry.tokens.in + entry.tokens.out;
      state.tokens.input += entry.tokens.in; state.tokens.output += entry.tokens.out; state.tokens.cacheRead += between(800, 4000);
      if (entry.lane === 'main') addContext(entry.tokens.in + entry.tokens.out, `${entry.tool} result`, entry.id);
      entry.contextAfter = { used: state.context.used, percent: state.context.percent };
      if (entry.status === 'error') { state.errors.push(entry); if (owner) owner.errors++; }
      emit('end', entry);
    }

    function touch(path, field, callId, extra = {}) {
      const file = state.files[path] || (state.files[path] = { path, reads: 0, edits: 0, failed: 0, added: 0, removed: 0, lastTouched: 0, touches: [], lines: (FILES.find(f => f.path === path) || {}).lines || 100 });
      if (field) file[field]++;
      file.added += extra.added || 0; file.removed += extra.removed || 0;
      file.lastTouched = clock; file.touches.push(callId);
      if (extra.added || extra.removed) file.lines += (extra.added || 0) - (extra.removed || 0);
    }

    // ---------- call builders, one per kind of work ----------
    const fileRef = path => ({ type: 'file', value: path });
    function readFile(laneKey, path, opts = {}) {
      const file = FILES.find(entry => entry.path === path) || { path, lines: 120, lang: 'js' };
      const missing = opts.fail;
      const offset = random() < 0.4 ? between(1, Math.max(1, file.lines - 120)) : 1;
      const limit = offset > 1 ? 120 : Math.min(file.lines, 2000);
      return call(laneKey, 'files', {
        tool: 'Read', label: `Reading ${path}`, target: { type: 'file', value: missing ? path.replace('sessions', 'session') : path },
        input: { file_path: missing ? path.replace('sessions', 'session') : path, offset, limit }, duration: between(150, 700), causedBy: opts.causedBy,
        flow: [{ from: laneKey === 'main' ? 'model' : `lane:${laneKey}`, to: 'tool:files', what: 'read request' }],
        refs: [{ ...fileRef(path), role: 'read' }],
        finish: entry => {
          if (missing) { touch(path, 'failed', entry.id); return { error: { ...ERRORS.files[0] }, output: { summary: 'No content returned', lines: 0, bytes: 0 }, flow: [{ from: 'tool:files', to: laneKey === 'main' ? 'context' : `lane:${laneKey}`, what: 'error text', tokens: 40 }] }; }
          const lines = Math.min(limit, file.lines - offset + 1);
          const tokens = Math.round(lines * 11.5);
          touch(path, 'reads', entry.id);
          const snippet = SNIPPETS[file.lang] || SNIPPETS.js;
          return { tokensIn: tokens, output: { summary: `${lines} lines (${offset}-${offset + lines - 1})`, lines, bytes: lines * 42, preview: snippet.slice(0, 5).map((text, index) => `${offset + index}\t${text}`) },
            flow: [{ from: `file:${path}`, to: 'tool:files', what: `${lines} lines`, bytes: lines * 42 }, { from: 'tool:files', to: laneKey === 'main' ? 'context' : `lane:${laneKey}`, what: `${path} text`, tokens }] };
        }
      });
    }

    function search(laneKey, pattern, opts = {}) {
      const glob = random() < 0.3;
      return call(laneKey, 'files', {
        tool: glob ? 'Glob' : 'Grep', label: 'Searching files', target: { type: 'pattern', value: glob ? '**/*.test.js' : pattern },
        input: glob ? { pattern: '**/*.test.js' } : { pattern, path: 'src', output_mode: 'content', '-n': true }, duration: between(120, 500), causedBy: opts.causedBy,
        flow: [{ from: laneKey === 'main' ? 'model' : `lane:${laneKey}`, to: 'tool:files', what: 'search pattern' }],
        finish: () => {
          const hits = FILES.filter(() => random() < 0.35).slice(0, 5);
          const tokens = 60 + hits.length * 90;
          return { tokensIn: tokens, output: { summary: `${hits.length * between(1, 4)} matches in ${hits.length} files`, lines: hits.length * 3, bytes: hits.length * 300, preview: hits.map(hit => `${hit.path}:${between(10, hit.lines)}: ${(SNIPPETS[hit.lang] || SNIPPETS.js)[0]}`) },
            refs: hits.map(hit => ({ ...fileRef(hit.path), role: 'cited' })),
            flow: [...hits.map(hit => ({ from: `file:${hit.path}`, to: 'tool:files', what: 'matching lines', bytes: 300 })), { from: 'tool:files', to: laneKey === 'main' ? 'context' : `lane:${laneKey}`, what: 'match list', tokens }] };
        }
      });
    }

    function edit(laneKey, path, opts = {}) {
      const tool = opts.tool || (random() < 0.15 ? 'MultiEdit' : 'Edit');
      return call(laneKey, 'edits', {
        tool, label: `Editing ${path}`, target: { type: 'file', value: path }, causedBy: opts.causedBy, attempt: opts.attempt, retryOf: opts.retryOf,
        input: { file_path: path, old_string: `${(SNIPPETS[(FILES.find(f => f.path === path) || {}).lang] || SNIPPETS.js)[between(0, 3)]}`, new_string: '…', replace_all: false }, duration: between(100, 400),
        flow: [{ from: laneKey === 'main' ? 'context' : `lane:${laneKey}`, to: 'tool:edits', what: 'replacement text' }],
        refs: [{ ...fileRef(path), role: 'wrote' }],
        finish: entry => {
          if (opts.fail) { touch(path, 'failed', entry.id); return { error: { ...pick(ERRORS.edits) }, output: { summary: 'File unchanged' } }; }
          const added = between(1, 24); const removed = between(0, 14); const at = between(10, 400);
          touch(path, 'edits', entry.id, { added, removed });
          const snippet = SNIPPETS[(FILES.find(f => f.path === path) || {}).lang] || SNIPPETS.js;
          return { diff: { added, removed, hunks: [{ at, lines: [`-${snippet[1]}`, `+${snippet[1].replace('const', 'let')}`, `+${snippet[2]}`, ` ${snippet[3]}`] }] },
            output: { summary: `Updated ${path}: +${added} -${removed}` }, flow: [{ from: 'tool:edits', to: `file:${path}`, what: `+${added} -${removed} lines`, bytes: (added + removed) * 40 }] };
        }
      });
    }

    function writeFile(laneKey, path, opts = {}) {
      ensureNode(`file:${path}`, { type: 'store', group: 'disk', label: path, lines: 0 });
      if (!FILES.find(f => f.path === path)) FILES.push({ path, lines: 0, lang: path.split('.').pop() });
      return call(laneKey, 'edits', {
        tool: 'Write', label: `Editing ${path}`, target: { type: 'file', value: path }, causedBy: opts.causedBy, input: { file_path: path, content: '(new file)' }, duration: between(150, 400),
        flow: [{ from: laneKey === 'main' ? 'context' : `lane:${laneKey}`, to: 'tool:edits', what: 'file content' }], refs: [{ ...fileRef(path), role: 'wrote' }],
        finish: entry => { const added = between(30, 140); touch(path, 'edits', entry.id, { added }); return { diff: { added, removed: 0, hunks: [{ at: 1, lines: ['+// new file'] }] }, output: { summary: `Created ${path} (${added} lines)` }, flow: [{ from: 'tool:edits', to: `file:${path}`, what: `${added} new lines`, bytes: added * 40 }] }; }
      });
    }

    function shell(laneKey, command, opts = {}) {
      const isTest = /test/.test(command);
      const label = isTest ? 'Running tests' : /build|package|vsce/.test(command) ? 'Building' : `Running ${command.split(' ')[0]}`;
      return call(laneKey, 'shell', {
        tool: 'Bash', label, target: { type: 'command', value: command }, causedBy: opts.causedBy, attempt: opts.attempt, retryOf: opts.retryOf,
        input: { command, description: opts.description || label, timeout: 120000 }, duration: isTest ? between(2500, 6500) : between(600, 2500),
        flow: [{ from: laneKey === 'main' ? 'model' : `lane:${laneKey}`, to: 'tool:shell', what: 'command line' }],
        finish: () => {
          const total = 41;
          if (opts.fail) {
            const error = { ...(opts.error || (isTest ? ERRORS.shell[0] : pick(ERRORS.shell.slice(1)))) };
            const failedTests = isTest ? 2 : 0;
            return { error, tokensIn: between(500, 1400), output: { exitCode: Number(error.code.split(' ')[1]) || null, summary: error.message, lines: between(30, 90), bytes: between(2000, 9000), tests: isTest ? { passed: total - failedTests, failed: failedTests, skipped: 0, failures: TEST_NAMES.slice(0, failedTests) } : null, preview: isTest ? [`✖ ${TEST_NAMES[0]} (12ms)`, '  AssertionError: expected 3 rows, got 2', `✖ ${TEST_NAMES[1]} (3ms)`, `ℹ tests ${total}`, `ℹ fail ${failedTests}`] : [error.message] },
              flow: [{ from: 'tool:shell', to: 'terminal', what: 'stdout + stderr', bytes: 6000 }, { from: 'terminal', to: laneKey === 'main' ? 'context' : `lane:${laneKey}`, what: 'failure output', tokens: 900 }] };
          }
          return { tokensIn: between(150, 700), output: { exitCode: 0, summary: isTest ? `${total} tests passed` : 'Completed', lines: between(5, 40), bytes: between(300, 3000), tests: isTest ? { passed: total, failed: 0, skipped: 0, failures: [] } : null, preview: isTest ? [`✔ ${TEST_NAMES[0]} (11ms)`, `✔ ${TEST_NAMES[2]} (4ms)`, `ℹ tests ${total}`, `ℹ pass ${total}`, 'ℹ fail 0'] : ['> agent-viz@0.1.0 check', 'ok'] },
            flow: [{ from: 'tool:shell', to: 'terminal', what: 'stdout', bytes: 1200 }, { from: 'terminal', to: laneKey === 'main' ? 'context' : `lane:${laneKey}`, what: 'command output', tokens: 300 }] };
        }
      });
    }

    function fetchWeb(laneKey, opts = {}) {
      const site = pick(HOSTS);
      const searchCall = random() < 0.35;
      return call(laneKey, 'network', {
        tool: searchCall ? 'WebSearch' : 'WebFetch', label: searchCall ? 'Searching the web' : `Fetching ${site.host}`, target: { type: searchCall ? 'query' : 'url', value: searchCall ? 'vscode webview retainContextWhenHidden memory' : `https://${site.host}${site.path}` },
        input: searchCall ? { query: 'vscode webview retainContextWhenHidden memory' } : { url: `https://${site.host}${site.path}`, prompt: 'What does this say about webview state?' }, duration: between(900, 3200), causedBy: opts.causedBy,
        flow: [{ from: laneKey === 'main' ? 'model' : `lane:${laneKey}`, to: 'tool:network', what: searchCall ? 'query' : 'URL' }],
        finish: () => {
          if (opts.fail) return { error: { ...pick(ERRORS.network) }, output: { summary: 'No page content' }, flow: [{ from: 'tool:network', to: 'context', what: 'error', tokens: 30 }] };
          const tokens = between(900, 3800);
          return { tokensIn: tokens, output: { summary: searchCall ? '8 results' : `${site.title}: summarised`, bytes: between(20000, 140000), status: 200, preview: [site.title, `https://${site.host}${site.path}`, 'Webview state is kept with getState/setState…'] },
            refs: [{ type: 'url', value: `https://${site.host}${site.path}`, role: 'cited', title: site.title }],
            flow: [{ from: `web:${site.host}`, to: 'tool:network', what: 'HTML page', bytes: 80000 }, { from: 'tool:network', to: laneKey === 'main' ? 'context' : `lane:${laneKey}`, what: 'page summary', tokens }] };
        }
      });
    }

    function planUpdate(laneKey, change, opts = {}) {
      return call(laneKey, 'memory', {
        tool: state.tasks.items.length ? 'TaskUpdate' : 'TodoWrite', label: 'Updating plan', target: { type: 'plan', value: change.label || 'task list' }, causedBy: opts.causedBy,
        input: change, duration: between(60, 200), flow: [{ from: 'context', to: 'tool:memory', what: 'plan change' }],
        finish: entry => {
          if (change.create) state.tasks.items = change.create.map((label, index) => ({ id: String(index + 1), label, status: 'pending', updatedAt: clock, history: [{ time: clock, status: 'pending', callId: entry.id }] }));
          if (change.id) { const item = state.tasks.items.find(task => task.id === change.id); if (item) { item.status = change.status; item.updatedAt = clock; item.history.push({ time: clock, status: change.status, callId: entry.id }); } }
          state.tasks.updatedAt = clock;
          emit('tasks', state.tasks);
          return { tokensIn: 40, output: { summary: change.create ? `${change.create.length} items added` : `Item ${change.id} → ${change.status}` }, refs: [{ type: 'task', value: change.id || 'list', role: 'wrote' }], flow: [{ from: 'tool:memory', to: 'plan', what: change.create ? 'new items' : `status ${change.status}` }] };
        }
      });
    }

    function other(laneKey, opts = {}) {
      return call(laneKey, 'other', {
        tool: 'mcp__github__get_issue', label: 'mcp__github__get_issue', target: { type: 'query', value: 'issue #42' }, input: { owner: 'example', repo: 'agent-viz', issue_number: 42 }, duration: between(400, 1500),
        flow: [{ from: 'model', to: 'tool:other', what: 'MCP request' }],
        finish: () => opts.fail ? { error: { ...ERRORS.other[0] }, output: { summary: 'No issue returned' } } : { tokensIn: 600, output: { summary: 'Issue #42: Stations map hides errors from subagents', preview: ['#42 Stations map hides errors from subagents', 'opened by a teammate · 3 comments'] }, refs: [{ type: 'url', value: 'https://github.com/example/agent-viz/issues/42', role: 'cited', title: 'Issue #42' }], flow: [{ from: 'mcp:github', to: 'tool:other', what: 'issue JSON', bytes: 4200 }, { from: 'tool:other', to: 'context', what: 'issue text', tokens: 600 }] }
      });
    }

    // ---------- the script: a looping, randomised coding session ----------
    // Each step is a function that schedules calls. Steps run one after another; subagents run alongside.
    const queue = [];           // { at, run } timed actions
    const later = (delay, run) => queue.push({ at: clock + delay / 1, run });
    const running = new Set();
    function begin(entry, then) { running.add(entry); later(entry.duration, () => { running.delete(entry); finish(entry); if (then) then(entry); }); return entry; }

    // The main lane works one call at a time: each step starts after the previous one finished, plus a think gap.
    // A step's make() returns a call, or nothing for an instant action (prompt, spawn of a subagent, marker).
    const steps = [];
    let idle = true;
    function pump() {
      const step = steps.shift();
      if (!step) { idle = true; return; }
      idle = false;
      queue.push({ at: clock + step.delay, run: () => { const entry = step.make(); if (entry && entry.status === 'running' && !running.has(entry)) begin(entry, pump); else pump(); } });
    }
    function main(delay, make) { steps.push({ delay: delay + Math.round(random() * 900), make }); if (idle) pump(); }
    function act(delay, run) { main(delay, () => { run(); return null; }); }

    function subagent(label, taskText, depth, parent, steps, outcome, nested) { act(200, () => spawnNow(label, taskText, depth, parent, steps, outcome, nested)); }
    function spawnNow(label, taskText, depth, parent, steps, outcome, nested) {
      {
        const spawn = begin(call(parent, 'agents', { tool: 'Task', label: 'Working with agents', target: { type: 'agent', value: label }, input: { description: label, subagent_type: 'general-purpose', prompt: taskText }, duration: 400,
          flow: [{ from: parent === 'main' ? 'context' : `lane:${parent}`, to: 'tool:agents', what: 'task brief', tokens: 350 }],
          finish: () => ({ output: { summary: `Started ${label}` }, refs: [{ type: 'lane', value: key, role: 'spawned' }], flow: [{ from: 'tool:agents', to: `lane:${key}`, what: 'task brief', tokens: 350 }] }) }));
        const key = `sa-${(seq + 1000).toString(16)}`;
        const sub = lane(key, label, parent, depth, taskText);
        if (nested) queue.push({ at: clock + 1800, run: () => spawnNow(nested.label, nested.task, depth + 1, key, nested.steps, nested.outcome) });
        let at = 500;
        for (const step of steps) { const wait = at; at += step.gap || between(1200, 2600); queue.push({ at: clock + wait, run: () => { const entry = begin(step.make(key, spawn.id)); if (step.after) step.after(entry); } }); }
        queue.push({ at: clock + at + 1500, run: () => {
          sub.state = outcome === 'failed' ? 'failed' : 'completed'; sub.endedAt = clock; sub.result = outcome === 'failed' ? 'Tests still failing after 2 attempts' : `${label}: found ${between(3, 9)} call sites, all covered`;
          emit('lane', sub);
          const back = call(parent, 'agents', { tool: 'Task', label: 'Waiting for agents', target: { type: 'agent', value: label }, input: { result_of: key }, duration: 200, causedBy: spawn.id,
            flow: [{ from: `lane:${key}`, to: 'tool:agents', what: 'final report', tokens: 1200 }],
            finish: () => outcome === 'failed' ? { error: { ...ERRORS.agents[0] }, tokensIn: 700, output: { summary: sub.result }, flow: [{ from: 'tool:agents', to: parent === 'main' ? 'context' : `lane:${parent}`, what: 'failure report', tokens: 700 }] }
              : { tokensIn: 1200, output: { summary: sub.result, preview: [sub.result, 'Files: src/transcript.js, media/view.js'] }, refs: [{ type: 'lane', value: key, role: 'cited' }], flow: [{ from: 'tool:agents', to: parent === 'main' ? 'context' : `lane:${parent}`, what: 'subagent report', tokens: 1200 }] } });
          begin(back);
        } });
      }
    }

    let round = 0;
    function prompt() {
      round++;
      state.session.turn = round;
      const asks = ['Show errors from subagents on the map', 'Make the lanes readable at narrow widths', 'Add a context-file list to the side panel', 'Fix the failing lane test and package'];
      const text = asks[(round - 1) % asks.length];
      marker('prompt', `User prompt: ${text}`, { text, tokens: between(40, 220) });
      addContext(between(300, 900), 'User prompt', null);
      if (round === 1) for (const file of CONTEXT_FILES.slice(0, 3)) { state.context.files.push({ ...file, loadedAt: clock }); addContext(file.tokens, `Loaded ${file.path}`, null); marker('context-file', `Loaded ${file.path}`, file); }
    }

    function scenario() {
      const target = pick(['media/view.js', 'src/transcript.js', 'media/app.js', 'src/sessions.js']);
      const testFile = target.startsWith('media') ? 'test/view.test.js' : target.includes('transcript') ? 'test/transcript.test.js' : 'test/sessions.test.js';
      act(400, prompt);
      let lastRead = null;
      // plan
      if (!state.tasks.items.length || state.tasks.items.every(item => item.status === 'completed')) main(600, () => planUpdate('main', { create: ['Read the current renderer', `Change ${target}`, 'Run the test suite', 'Package the extension'] }));
      const open = () => state.tasks.items.find(item => item.status !== 'completed');
      main(500, () => { const item = open(); return planUpdate('main', { id: item ? item.id : '1', status: 'in_progress', label: item ? item.label : '' }); });
      // explore
      main(700, () => search('main', 'laneFacts|familyLanes'));
      main(500, () => (lastRead = readFile('main', target)));
      main(400, () => readFile('main', testFile));
      if (random() < 0.25) main(500, () => readFile('main', 'src/sessions.js', { fail: true }));
      if (random() < 0.3 && round > 1 && state.context.files.length < 4) act(100, () => { const file = CONTEXT_FILES[3]; state.context.files.push({ ...file, loadedAt: clock }); addContext(file.tokens, `Loaded ${file.path}`, null); marker('context-file', `Loaded ${file.path}`, file); });
      // subagent explores in parallel
      if (random() < 0.5) subagent(pick(['Explore call sites', 'Map renderer', 'Audit privacy']), 'Find every place the renderer reads lane facts and report file:line', 1, 'main', [
        { make: key => search(key, 'laneFacts') }, { make: key => readFile(key, 'media/view.js') }, { make: key => readFile(key, 'src/transcript.js') }, { make: key => readFile(key, 'test/view.test.js') }
      ], 'completed');
      if (random() < 0.4) main(800, () => fetchWeb('main', { fail: random() < 0.25 }));
      if (random() < 0.2) main(500, () => other('main', { fail: random() < 0.4 }));
      main(500, () => { const item = open(); return planUpdate('main', { id: item ? item.id : '1', status: 'completed', label: item ? item.label : '' }); });
      // edit
      main(900, () => edit('main', target, { causedBy: lastRead && lastRead.id }));
      if (random() < 0.3) { let bad; main(400, () => (bad = edit('main', target, { fail: true }))); main(500, () => readFile('main', target, { causedBy: bad && bad.id })); main(400, () => edit('main', target, { attempt: 2, retryOf: bad && bad.id, causedBy: bad && bad.id })); }
      main(500, () => edit('main', 'media/style.css'));
      if (random() < 0.35) main(400, () => writeFile('main', `test/${target.split('/')[1].replace('.js', '')}-lanes.test.js`));
      // test, maybe fail and fix
      const failing = random() < 0.55;
      let testRun;
      main(700, () => (testRun = shell('main', 'npm test', { fail: failing, description: 'Run the unit tests' })));
      if (failing) {
        main(600, () => readFile('main', testFile, { causedBy: testRun && testRun.id }));
        if (random() < 0.5) {
          subagent(pick(['Fix failing test', 'Test runner']), 'Make test/view.test.js pass without changing the rule', 1, 'main', [
            { make: key => readFile(key, testFile) }, { make: key => edit(key, testFile) }, { make: (key) => shell(key, 'node --test test/view.test.js', { fail: random() < 0.4 }) },
            { make: key => shell(key, 'node --test test/view.test.js') }
          ], random() < 0.2 ? 'failed' : 'completed',
          // a nested checker, started by the fixing subagent itself
          random() < 0.6 ? { label: 'Checker', task: 'Verify the fix independently', steps: [{ make: key => shell(key, 'npm run check') }, { make: key => readFile(key, target) }], outcome: 'completed' } : null);
        }
        main(900, () => edit('main', target, { causedBy: testRun && testRun.id }));
        main(800, () => shell('main', 'npm test', { attempt: 2, retryOf: testRun && testRun.id, causedBy: testRun && testRun.id }));
      }
      main(400, () => { const item = open(); return planUpdate('main', { id: item ? item.id : '1', status: 'completed', label: item ? item.label : '' }); });
      if (random() < 0.4) { const fail = random() < 0.35; let pack; main(800, () => (pack = shell('main', fail ? 'vsce package' : 'npx @vscode/vsce package', { fail, error: ERRORS.shell[2] }))); if (fail) main(600, () => shell('main', 'npx @vscode/vsce package', { attempt: 2, retryOf: pack && pack.id, causedBy: pack && pack.id })); }
      if (random() < 0.3) main(500, () => shell('main', 'npm run check', { fail: random() < 0.3, error: ERRORS.shell[1] }));
      if (random() < 0.15) main(500, () => shell('main', 'npm run host', { fail: true, error: ERRORS.shell[3] }));
      main(500, () => edit('main', 'README.md'));
      act(900, () => { marker('turn-complete', 'Turn complete', { turn: round }); addContext(between(200, 600), 'Reply to user', null); state.session.status = 'complete'; });
      act(between(6000, 16000), () => { state.session.status = 'active'; scenario(); });
    }

    // ---------- engine ----------
    function advanceTo(target) {
      // Run every queued action due at or before target, in time order.
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        if (!queue.length || queue[0].at > target) break;
        const next = queue.shift();
        clock = Math.max(clock, next.at);
        next.run();
      }
      clock = target;
    }

    function setup() {
      const startReal = Date.now();
      const history = (options.history ?? 12) * 60000;
      clock = startReal - history;
      state.session.startedAt = clock;
      lane('main', 'Main session', null, 0, '');
      scenario();
      replaying = true;
      advanceTo(startReal);
      replaying = false;
    }

    function frame() {
      const nowReal = Date.now();
      const delta = (nowReal - lastReal) * speed;
      lastReal = nowReal;
      advanceTo(clock + delta);
      emit('tick', state);
    }

    setup();
    const api = {
      state,
      kinds: KINDS,
      kindInfo: KIND_INFO,
      on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return api; },
      off(type, fn) { listeners[type] = (listeners[type] || []).filter(entry => entry !== fn); return api; },
      start() { if (!timer) { lastReal = Date.now(); timer = setInterval(frame, 250); } return api; },
      pause() { clearInterval(timer); timer = null; return api; },
      get running() { return Boolean(timer); },
      setSpeed(value) { speed = Math.max(0.1, Math.min(10, Number(value) || 1)); return api; },
      get speed() { return speed; },
      get replaying() { return replaying; },
      node, // look up a node by id
      callById: id => state.calls.find(entry => entry.id === id) || null,
      laneByKey: key => state.lanes.find(entry => entry.key === key) || null,
      callsForFile: path => state.calls.filter(entry => entry.refs.some(ref => ref.type === 'file' && ref.value === path) || (entry.target && entry.target.value === path)),
      runningCalls: () => [...running].filter(entry => entry.status === 'running'),
      // Events since the last prompt with errors, per kind (the stations map's error dot rule).
      errorsSincePrompt() { const lastPrompt = [...state.markers].reverse().find(m => m.kind === 'prompt'); const since = lastPrompt ? lastPrompt.time : 0; const out = {}; for (const entry of state.errors) if (entry.startedAt >= since) out[entry.kind] = (out[entry.kind] || 0) + 1; return out; }
    };
    return api;
  }

  const api = { create, KINDS, KIND_INFO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AgentVizSim = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
