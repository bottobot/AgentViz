'use strict';
// S09: the synthetic source folder used by the VS Code host run (test/extension-host.js) and the browser
// inspection (test/browser-check.js). Every transcript is invented. Private parts of the records carry PRIVATE_
// sentinels (see test/resilience-fixture.js), so a page drawn from them can be searched for leaks.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const fx = require('./resilience-fixture');

const CLAUDE_ID = 'aaaaaaaa-1111-4222-8333-444444444444';
const TWIN_ID = 'aaaaaaaa-1111-4222-8333-999999999999';
const CODEX_ID = '0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
const OLD_ID = 'bbbbbbbb-2222-4333-8444-555555555555';
const GONE_ID = 'cccccccc-3333-4444-8555-666666666666';
const BIG_ID = 'dddddddd-4444-4555-8666-777777777777';
const HOSTILE_ID = 'eeeeeeee-5555-4666-8777-888888888888';
const CHILD_ID = 'synthchild01';
const TITLE = 'Synthetic checkout fix';
const RENAMED = 'Synthetic checkout fix, renamed';
const HOSTILE_TITLE = '<img src=x onerror=alert(1)> "Synthetic" & hostile';
const BIG = { calls: 10500, children: 24, childCalls: 2000 };

// The catalogue ID the host gives a transcript: its provider and a hash of its path.
const catalogueId = (provider, file) => `${provider}:${createHash('sha256').update(file).digest('hex').slice(0, 20)}`;

// Both provider settings name `root`: Claude transcripts go under root/projects, Codex under root/sessions.
// `fillers` newer sessions push the old one outside the returned list when there are enough of them.
// `big` adds a family at full retention: more calls than the view keeps and as many subagents as it shows.
function writeFixture(root, { fillers = 60, big = true } = {}) {
  const now = Date.now();
  const minutes = n => now - n * 60000;
  const files = {};
  const put = (file, text, modified) => { fx.write(file, text); fs.utimesSync(file, modified / 1000, modified / 1000); return file; };
  const calls = (id, from, count, options = {}) => { let text = ''; for (let n = 0; n < count; n++) text += fx.claudeCall(id, from + n * 2000, `${options.agentId || id.slice(0, 4)}-${n}`, { ...options, tool: ['Read', 'Edit', 'Bash'][n % 3] }); return text; };

  // A session with a task list and two subagents, one of them linked by the parent's own Agent call.
  const todos = fx.line({ type: 'assistant', timestamp: fx.stamp(minutes(10)), sessionId: CLAUDE_ID, message: { content: [{ type: 'tool_use', id: 'todo-1', name: 'TodoWrite', input: { todos: [
    { content: 'Synthetic step: reproduce the fault', status: 'completed', activeForm: 'PRIVATE_TASK' }, { content: 'Synthetic step: change the handler', status: 'in_progress', activeForm: 'PRIVATE_TASK' },
    { content: 'Synthetic step: run the checks', status: 'pending', activeForm: 'PRIVATE_TASK' }] } }] } })
    + fx.line({ type: 'user', timestamp: fx.stamp(minutes(10) + 300), sessionId: CLAUDE_ID, message: { content: [{ type: 'tool_result', tool_use_id: 'todo-1', content: 'PRIVATE_OUTPUT' }] } });
  const spawn = fx.line({ type: 'assistant', timestamp: fx.stamp(minutes(9)), sessionId: CLAUDE_ID, message: { content: [{ type: 'tool_use', id: 'spawn-1', name: 'Agent', input: { description: 'PRIVATE_TASK', prompt: 'PRIVATE_PROMPT', subagent_type: 'synthetic-worker' } }] } })
    + fx.line({ type: 'user', timestamp: fx.stamp(minutes(9) + 500), sessionId: CLAUDE_ID, toolUseResult: { status: 'async_launched', isAsync: true, agentId: CHILD_ID, prompt: 'PRIVATE_PROMPT' }, message: { content: [{ type: 'tool_result', tool_use_id: 'spawn-1', content: 'PRIVATE_OUTPUT' }] } });
  files.claude = put(fx.claudeFile(root, 'synthetic-alpha', CLAUDE_ID), fx.claudeHead(CLAUDE_ID, minutes(12), 'C:\\Synthetic\\Alpha') + fx.claudeTitle(CLAUDE_ID, TITLE) + calls(CLAUDE_ID, minutes(11), 9) + todos + spawn, minutes(1));
  files.child = put(fx.claudeChildFile(root, 'synthetic-alpha', CLAUDE_ID, CHILD_ID), fx.claudeHead(CLAUDE_ID, minutes(9), 'C:\\Synthetic\\Alpha', CHILD_ID) + calls(CLAUDE_ID, minutes(8), 4, { agentId: CHILD_ID }), minutes(1));
  fs.writeFileSync(files.child.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'synthetic-worker', toolUseId: 'spawn-1', description: 'PRIVATE_TASK', finished: true }));
  put(fx.claudeChildFile(root, 'synthetic-alpha', CLAUDE_ID, 'synthchild02'), fx.claudeHead(CLAUDE_ID, minutes(7), 'C:\\Synthetic\\Alpha', 'synthchild02') + calls(CLAUDE_ID, minutes(6), 3, { agentId: 'synthchild02' }), minutes(1));
  // The same saved name in another directory that shares the basename.
  files.twin = put(fx.claudeFile(root, 'other-alpha', TWIN_ID), fx.claudeHead(TWIN_ID, minutes(20), 'C:\\Other\\Alpha') + fx.claudeTitle(TWIN_ID, TITLE) + calls(TWIN_ID, minutes(19), 3), minutes(2));
  files.codex = put(fx.codexFile(root, CODEX_ID), fx.codexHead(CODEX_ID, minutes(15), 'C:\\Synthetic\\Beta') + fx.codexCall(minutes(14), 'x-1') + fx.codexCall(minutes(13), 'x-2', { failed: true }), minutes(3));
  files.index = fx.write(path.join(root, 'session_index.jsonl'), fx.line({ id: CODEX_ID, thread_name: 'Synthetic deploy review', updated_at: fx.stamp(minutes(15)) }));
  files.gone = put(fx.claudeFile(root, 'synthetic-gamma', GONE_ID), fx.claudeHead(GONE_ID, minutes(25), 'C:\\Synthetic\\Gamma') + fx.claudeTitle(GONE_ID, 'Synthetic short lived') + calls(GONE_ID, minutes(24), 2), minutes(4));
  // A saved name that would be markup if it were ever written into the page as HTML.
  files.hostile = put(fx.claudeFile(root, 'synthetic-docs', HOSTILE_ID), fx.claudeHead(HOSTILE_ID, minutes(27), 'C:\\Synthetic\\Docs') + fx.claudeTitle(HOSTILE_ID, HOSTILE_TITLE) + calls(HOSTILE_ID, minutes(26), 2), minutes(6));
  // Five sessions and two subagent transcripts so far.
  let total = 5 + 2;
  if (big) {
    const step = Math.floor(27 * 60000 / BIG.calls);
    let text = fx.claudeHead(BIG_ID, minutes(29), 'C:\\Synthetic\\Large') + fx.claudeTitle(BIG_ID, 'Synthetic large family');
    for (let n = 0; n < BIG.calls; n++) text += fx.claudeCall(BIG_ID, minutes(28) + n * step, `big-${n}`, { tool: ['Read', 'Edit', 'Bash'][n % 3], failed: n % 97 === 0 });
    files.big = put(fx.claudeFile(root, 'synthetic-large', BIG_ID), text, minutes(5));
    for (let child = 0; child < BIG.children; child++) {
      const agent = `bigchild${String(child).padStart(2, '0')}`;
      let own = fx.claudeHead(BIG_ID, minutes(28), 'C:\\Synthetic\\Large', agent);
      for (let n = 0; n < BIG.childCalls; n++) own += fx.claudeCall(BIG_ID, minutes(27) + n * 700, `${agent}-${n}`, { agentId: agent });
      put(fx.claudeChildFile(root, 'synthetic-large', BIG_ID, agent), own, minutes(5));
    }
    total += 1 + BIG.children;
  }
  for (let n = 0; n < fillers; n++) {
    const id = fx.uuid(1000 + n);
    put(fx.claudeFile(root, 'synthetic-filler', id), fx.claudeHead(id, minutes(40 + n), 'C:\\Synthetic\\Filler') + fx.claudeTitle(id, `Synthetic filler ${n}`, 'ai-title') + calls(id, minutes(39 + n), 1), minutes(10 + n));
  }
  const days = 3 * 24 * 60;
  files.old = put(fx.claudeFile(root, 'synthetic-archive', OLD_ID), fx.claudeHead(OLD_ID, minutes(days + 5), 'C:\\Synthetic\\Archive') + fx.claudeTitle(OLD_ID, 'Synthetic archive audit') + calls(OLD_ID, minutes(days + 4), 5), minutes(days));
  total += fillers + 1;
  const ids = {};
  for (const [name, file] of Object.entries(files)) if (name !== 'index') ids[name] = catalogueId(name === 'codex' ? 'codex' : 'claude', file);
  return { files, ids, total };
}

module.exports = { CLAUDE_ID, TWIN_ID, CODEX_ID, OLD_ID, GONE_ID, BIG_ID, HOSTILE_ID, CHILD_ID, TITLE, RENAMED, HOSTILE_TITLE, BIG, catalogueId, writeFixture };
