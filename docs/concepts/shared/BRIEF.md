# Brief for every concept build-out

AgentViz is a VS Code extension that shows a live picture of a local Claude Code or Codex session. Today's main
picture is the **stations map** (`media/view.js`, function `map` and `render`): six fixed category stations
(Files, Edits, Shell, Network, Agents, Memory) on spokes around a hub that counts tool calls, plus side panels.

We are exploring **radically different ways to show the same idea**: a session doing work, moving data between
processes, and where that data ends up and in what condition. Each concept is its own standalone page. The user
will later pick the best parts of several concepts and combine them, so make yours distinct and excellent.

## Hard rules

1. **Not the stations map.** No ring of category nodes around a central hub, no spokes, no concentric orbits.
   Your concept's own metaphor and layout must be clearly different from it and from the other concepts listed
   in your task.
2. **Standalone and offline.** One folder `docs/concepts/<your-folder>/` with `index.html` (plus your own .js/.css
   if you like). Opens by double-clicking `index.html` (file://). No build step, no npm package, no CDN, no web
   fonts, no network. Plain HTML, CSS, JavaScript, SVG and/or canvas.
3. **Data comes from the shared simulator.** Load it with `<script src="../shared/sim.js"></script>` and use
   `AgentVizSim.create({ seed: 7, history: 30 })`, then `.start()`. Read the header comment and the code of
   `docs/concepts/shared/sim.js` to learn the data model (calls, flow hops, nodes, lanes, markers, tasks, files,
   context, errors). **Do not edit anything in `docs/concepts/shared/`** (other agents use it at the same time).
   If you need a derived value, compute it in your page.
4. **Your folder only.** Do not touch `src/`, `media/`, `test/`, other concept folders, or git (no commits).
5. **Your own color scheme**, the one given in your task. Use color richly and on purpose: colors must encode
   meaning (kind of work, condition, destination), not just decorate. Errors must also be marked by shape or text,
   not color alone.

## What every build-out must show (R5, R6)

- **Live movement.** The session keeps working while the page is open. When a call starts and ends, its data
  visibly travels: each `flow` hop (`from` node to `to` node, with `what`, `tokens`, `bytes`) is animated from
  where it comes from to where it ends up. Size, speed or shape should reflect how much data moved.
- **Different kinds of information processed differently.** Reads, edits, shell commands, web fetches, subagent
  work, plan updates and other tools must each look and behave differently in your metaphor (not just a
  different color on the same dot).
- **Where data ends up.** Destinations are first-class: context window, files on disk, terminal, task list,
  subagent lanes, reply. The user can see what accumulated where.
- **Condition.** Success, running, error, retry (`retryOf`, `attempt`), and cause chains (`causedBy`) are visible.
  Error codes (`error.code`), messages and hints are readable.

## Detail parity with the stations map (R7): show at least all of this

Everything the current view shows, somewhere in your page (main view, side panel, overlay or drill-down):

- Session identity: project, session name, id, provider, model, branch, status (recent activity / quiet /
  turn complete), time since last record, turn number.
- Count of calls per kind (all seven, including Other), total calls, the kind active right now, and **errors per
  kind since the last prompt** (`sim.errorsSincePrompt()`), plus total tool errors.
- Context window: percent used with amber at 70% and red at 90%, its history over time, compactions, and the
  **context files** loaded into it (`state.context.files`).
- Task list progress: completed of total, in progress, not started, each item with its status history.
- File footprint: per file reads, edits, failed calls, lines added/removed, files edited 3+ times marked hot.
- Recent activity with similar consecutive events folded (×N).
- Agent lanes: main plus every subagent, nesting (depth / parent), start, end, state (running, completed,
  failed), calls, errors, tokens, task text and final result.
- Activity over the last 30 minutes with error ticks and markers for prompts, turn completes and compactions.

## Drill-down (A3): the information the user really wants

Clicking (and keyboard: Tab + Enter) on anything leads to its detail:

- **A call:** tool, label, lane, target, input arguments, start time, duration, status, error code + message +
  hint, output summary, output preview lines, exit code, test results (passed/failed + failing names), diff
  (+/− and hunk lines), tokens in/out, context % after, every flow hop, references (files, URLs, lanes, tasks),
  what caused it (`causedBy`, clickable) and what it caused (calls whose `causedBy` is this id), retries.
- **A destination or source:** a file (every call that touched it, in order, with diffs and failures), the context
  window (what filled it, biggest contributors, compactions, context files), the terminal (commands and exit
  codes), the task list, a web host (fetches and status), a subagent lane (its calls, brief, result).
- **An error:** code, message, hint, which call, which lane, what happened next (retry? fixed?).

Detail can be richer than the stations map; it must never be poorer.

## Controls every page has

Pause / resume, speed (for example 0.5x, 1x, 2x, 4x), and a way to tell "live" from "inspecting a moment".
Respect `prefers-reduced-motion` by toning motion down (data still updates). The page should look good at
1600×1000 and still work at 1280×800.

## Verify before you report

Run, from the repository root:

    node docs/concepts/shared/check.js docs/concepts/<your-folder>/index.html --wait 6
    node docs/concepts/shared/check.js docs/concepts/<your-folder>/index.html --wait 3 --eval "<JS that opens a drill-down, e.g. document.querySelector('...').click(); 'clicked'>"

It reports console errors and saves two screenshots under `artifacts/concepts/<your-folder>/`. Open the PNGs with
the Read tool and look at them. Fix every console error, iterate on the visuals until they are genuinely good,
readable, and clearly show live movement and drill-down. Exit code 0 and `"changed": true` are required.

## Report back (short)

1. Folder and files created.
2. Two or three sentences: what the concept shows and how.
3. How each kind of work is treated differently, in one line each.
4. Main interactions (what to click to drill down).
5. Verification: the exact check commands you ran, their exit codes, and the screenshot paths.
6. Anything that does not work yet.
