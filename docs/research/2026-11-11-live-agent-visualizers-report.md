# Live agent visualizers: what is worth taking for AgentBoard

Date: 11 November 2026. This report analyses the 27 repos listed in `docs/research/2026-11-11-live-agent-visualizers.md` and answers two questions: how useful is each one's visualization, and which ideas could AgentBoard take to show what a long task is doing while it runs. Nothing in the extension was changed.

## 1. Verdict

- **Yes, there are ideas worth taking: seven of them.** Five can be drawn from files AgentBoard already writes, with no new hooks and no model tokens.
- **No repo is worth adopting whole.** Most answer "who is busy right now" and nothing else. Not one shows how far along a task is, except by reading the agent's own todo list.
- **The useful ideas are small strips, counts and lanes, not offices, villages or graphs.** The 15 "world" visualizers carry about as much information as AgentBoard's live dot and `doing:` line already do.
- **Best single source of ideas: lot-map** (the one you saw). Its radial picture does not fit a 280 px card, but nearly everything it encodes does once it is unrolled into rows.
- **Build first: an activity strip plus tool-category counts** (ideas 1 and 2 below). It is the cheapest change and answers the question the board is weakest at: "what has this task been doing for the last half hour?"
- **Where it goes: a separate tab, not the card** (Robert, 11 November 2026: the card would carry too much). Section 4a covers the tab and whether it should be its own extension. The card sketches in section 4 show the content; read them as rows of that tab.

## 2. How the repos were judged

A long task raises seven questions. A visualization is useful to the degree it answers them without reading text.

| # | Question | AgentBoard today |
|---|---|---|
| Q1 | Is it alive, stuck, or waiting for me? | Good: live dot, `Quiet`, `Waiting on N`, `Repeating tool xN` chips |
| Q2 | What is it doing right now? | `doing: <tool + argument> · <secs>` line |
| Q3 | How far along is it? | Nothing while it runs (Done when and Checks apply at the end; a master run shows `N running · N done`) |
| Q4 | What has it done so far, and in what order? | Timeline in the drawer: the last 20 events as text lines |
| Q5 | Where in the code has it been? | Nothing |
| Q6 | Who is working (sub-agents, children)? | Flat sub-agent list; children under a master run row |
| Q7 | Is it going wrong? | `Repeating tool` chip, checks, `Context window N% full` in the drawer |

Q3, Q4 and Q5 are the gaps. They are also the questions the surveyed tools answer least often.

**How the evidence was gathered.** All 27 repos were shallow-cloned and read; none was installed or run. For each one the README, the code that collects events and the code that draws were read, and the screenshots in the repo were looked at. Demo videos and most GIFs were not viewed. Scores are judgements from code and still images, not from use.

## 3. What AgentBoard already has to draw from

This decides what is cheap. Facts from the code on `main` at `a8c7af1`:

- **Events file** (`.agentboard/events/<id>.jsonl`, written by `hook/hook.js`): one line per hook event with the time, the event name, the tool name, `desc` (the tool plus the first 80 characters of its main argument, such as `Edit src/board.ts` or `Bash npm test`), a hash of the call, and the sub-agent's id and type. Events kept: SessionStart, UserPromptSubmit, PostToolUse, PermissionRequest, Notification, Stop, StopFailure, SubagentStart and SubagentStop (`src/board.ts:2124-2137`).
- **Not recorded:** when a tool call starts (no PreToolUse line), so a call's length can only be estimated from the gap to the next event. The agent's own todo list is not read at all (no match for `TodoWrite`, `TaskCreate`, `TaskUpdate` or `update_plan` in `src`, `hook`, `media` or `wrapper`).
- **Sub-agents:** id, type, description, steps, current action, model, effort and `parentId` (`src/sessions.ts:397-414`). The card lists them flat (`media/board.js:826-838`).
- **Context:** the main session's context percentage (`context.json`), shown only in the drawer.
- **Other providers:** Codex sends the same hook shape as Claude. Grok and Antigravity events carry the tool name only.
- **Drawing:** the board is plain DOM with no framework, no canvas and no SVG; the only chart-like element is `<meter>`. The whole card list is rebuilt on each update, at most once per 500 ms (`media/board.js:1249-1254`). So a drawing must be a pure function of the events, cheap to rebuild, with no animation state of its own. lot-map works exactly this way: its whole map is one SVG string built from the current state (`hooks/map.ts:756`).

## 4. The seven ideas, in the order I would build them

Each idea names what it answers, where it was seen, what data it needs and how big it is. None spends model tokens: all are drawn from files the hooks already write.

### Idea 1. Activity strip on the card (answers Q4, Q1, Q7)

A thin strip under the `doing:` line. Each cell is a fixed slice of time (for example 30 seconds, last 30 minutes). Cell height is how many tool calls happened; colour is the dominant kind of work (read or search, edit, shell or test, web, sub-agents). Marks above the strip show your prompts, compactions and sub-agent starts. An error is a red tick. An empty stretch is a visible gap.

```
 ›        ⑂           ◇        ›                      marks: prompt, sub-agent, compaction
▂▂▃▃▃▅▅▅▂  ▂▅▅▅▇▇▅▃▃▇▇▇█▇▇▃   ▃▅▅│▂▂▂▅▇▇▇▅▃▂▂        height = calls, colour = kind of work
└ reading ┘└── editing ──┘ gap  ✕ └ tests ┘      now
```

- **What you see at a glance:** the shape of the run. Exploring, then editing, then verifying looks different from thirty minutes of reading, and both look different from silence.
- **Seen in:** mindwalk (160 cells coloured by dominant action, the best version), disler's "Live Pulse" (60 cells), agent-flow's scrubber dots, zoetrope's and agentplay's timelines.
- **Data:** time and tool name per event. Already on disk for Claude and Codex; works by tool name alone for Grok and Antigravity.
- **Two lessons from the sources.** mindwalk divides the run into a fixed number of cells, so every bar moves when an event arrives; use fixed time slices instead. zoetrope indexes its timeline by event, not by clock, so a busy minute gets room and dead air is squeezed; for the whole-run strip in the drawer, collapse long silences into a gap mark.
- **Size:** small. About 60 rectangles per card.

### Idea 2. "Where the work went" row (answers Q2, Q4, Q7)

lot-map's ten stations unrolled into one row of icons with counts. The kind of work in use now is lit. A red badge stays on a category after an error until your next prompt. `×3` shows calls running side by side.

```
▤ files 41   ✎ edits 12   ❯ shell 9   ⌕ web 3   ⑂ agents ×2   ✕1
```

- **Seen in:** lot-map ("worn spokes": a spoke grows thicker the more its station is used; error dot that stays until your next message; fixed positions so the eye learns where to look). Agent-Quest, claude-ville, tagconn and Realm use the same mapping as places in a world.
- **Data:** tool name plus `desc`. lot-map's `classify` function (`hooks/map.ts:187-260`, MIT) is the reference: it sorts shell commands into files, network or shell by the command's name, and already handles PowerShell names. AgentBoard's `desc` holds enough of the command to do the same.
- **Size:** small. Shares its classifier with idea 1, so build them together.

### Idea 3. Context meter on the card (answers Q7)

Move `Context window N% full` from the drawer to a thin meter on the card: amber at 70%, red at 90%, and a compaction mark on the activity strip.

- **Seen in:** lot-map (ring around the centre), pixel-agents, whatsmyagentdoing, Agent-Quest, W17ant/Claude-Office, tagconn, and agentplay (a line that drops at each compaction).
- **Data:** already collected for the main session. The existing `<meter>` element can draw it.
- **Size:** very small.

### Idea 4. Sub-agent lanes in the drawer (answers Q6, Q4)

Replace the flat sub-agent list with one row per agent on a shared time axis: a bar from start to stop, a tick per tool call, the current action at the right end, children indented under their parent.

```
main            ████░░██████████░░░░░░████▌  Bash npm test
 ↳ Explore          ███████ ✓
 ↳ ab-fixer               ██████████▌        Edit src/x.ts
 ↳ ab-test-gate                  ░░░██ ✕
                10:02      10:10      10:18  now
```

- **Seen in:** agent-flow's timeline panel (rows of blocks coloured idle, thinking, tool, error, complete), agents-observe (a lane of dots per agent, `↳` prefix and a colour per sub-agent), paulrobello/claude-office (a Gantt of agent lifespans), zoetrope (a tree with status, current tool and tool count on each node), lazyagent (an indented tree).
- **Data:** SubagentStart and SubagentStop times, the agent id on each tool event and `parentId`. All on disk. The same picture works for a master run and its child cards.
- **Why lanes and not a node graph:** see section 6.
- **Size:** medium.

### Idea 5. Progress from the agent's own todo list (answers Q3)

A bar and one line: `3 of 8 · current: Add the retry test`. This is the only real answer to "how far along" found anywhere in the survey.

- **Seen in:** Claude-Code-Agent-Monitor (a donut with "2/8 complete" and the current item), paulrobello/claude-office and W17ant/Claude-Office (the todo list on a whiteboard), backstage (a kanban fed from the agent's task calls), zashiki (a separate `watching` state: the turn ended but todo items are still open, which tells "paused" from "finished").
- **Data:** not collected today. `hook.js` would need to keep the counts and the current item's first line from the todo tool's input, or the board would read them from the transcript. This is the one idea that needs a hook change.
- **Limit:** it shows nothing when the agent keeps no todo list, and the list is the agent's own estimate, not a measurement.
- **Size:** small to medium.

### Idea 6. Files footprint in the drawer (answers Q5, Q7)

A ranked list of the folders and files the task has touched, reads and edits counted separately, with a flag on files edited three or more times.

```
src/board.ts          ✎ 7  ▤ 12  ███████████  edited 3+ times
media/board.js        ✎ 2  ▤ 5   █████
test/board.test.ts    ✎ 1  ▤ 2   ██
docs/parity/          ▤ 3        █
14 files in 4 folders · 3 edited
```

- **Seen in:** agent-flow ("file attention": reads, edits and agents per file), claude-code-devtools (read, edit, write and error counts per file), paulrobello/claude-office (most-edited files), mindwalk (the whole repo as a map where untouched files stay dark, with "7 files edited 3+ times" as a review line), agentplay (only the 10 most recent nodes are coloured and labelled, a good rule against clutter).
- **Data:** the path in `desc`, already on disk for Read, Edit and Write. File work done through shell commands is missed.
- **A later step, only if the list proves useful:** mindwalk's map, flattened to 2D at folder level from `git ls-files`. It answers "is this task spreading further than it should?" better than any list, because untouched areas are visible. It costs a repo scan and a layout, so it should wait.
- **Size:** small for the list, large for the map.

### Idea 7. Plain words and folded rows (answers Q2, Q4)

- Say `running tests`, `building`, `git push` instead of `Bash npm test…`, and show a pass or fail outcome for test and build commands. Seen in mathiasolofsson87/Claude-agents-office (`describeTool`), W17ant/Claude-Office and Realm.
- Fold runs of similar events in the Timeline into one row: `Read ×6`, `Edit board.ts +2`. Seen in lot-map (`+2` rows) and claude-devtools (`18 thinking, 26 tool calls`).
- **Size:** small; a pure function over data already on disk.

### What the card could look like with ideas 1, 2, 3 and 5

```
┌──────────────────────────────────────────┐
│ ● Refactor the payment retries           │
│ doing: running tests · 12 s              │
│ ▂▂▃▃▅▅▅▂ ▂▅▅▇▇▅▃▃▇▇█▇▇▃  ▃▅│▂▂▅▇▇▅▃  now │
│ ▤ 41  ✎ 12  ❯ 9  ⌕ 3  ⑂ ×2  ✕1           │
│ ▰▰▰▱▱▱▱▱ 3 of 8 · Add the retry test     │
│ context ▮▮▮▮▮▮▯▯▯ 66%                    │
└──────────────────────────────────────────┘
```

Four extra lines answer Q3, Q4 and Q7 without opening the session.

## 4a. Placement: a separate tab, and whether it is a separate extension

Robert's steer after reading the first version (11 November 2026): this is too much for a card. It should be its own tab, and perhaps its own extension that follows AgentBoard's sessions and any other session on the machine.

**What a tab changes.** With an editor tab there is room for the pictures the card could not hold:

```
┌ Activity: Refactor the payment retries ────────────────────────────────┐
│  [card ▾]                                   context ▮▮▮▮▮▮▯▯▯ 66%     │
│                                                                        │
│   stations map (lot-map style)        │  lanes: main and sub-agents    │
│   fixed positions, thicker spokes     │  main      ████░░█████▌        │
│   where the work went, red dot on     │   ↳ Explore   █████ ✓          │
│   errors                              │   ↳ ab-fixer      ██████▌      │
│                                       │                                │
│  ▂▂▃▅▅▅▂ ▂▅▅▇▇▅▃▇▇█▇▃  ▃▅│▂▅▇▇▅▃   whole-run activity strip        now │
│                                                                        │
│  files touched                        │  3 of 8 · Add the retry test   │
│  src/board.ts   ✎ 7 ▤ 12 ████████     │  folded event rows             │
└────────────────────────────────────────────────────────────────────────┘
```

- The radial stations map, ruled out for the card in section 6, fits here.
- The card keeps what it has today, plus at most one way in (a button or command that opens the tab on that card).

**Option A: a tab inside AgentBoard (recommended first).**

- AgentBoard already opens editor tabs (`src/extension.ts:368`, `src/helper-tab.ts:84`), already has the events file, and already parses Claude and Codex transcripts.
- "Other sessions" are partly covered: a session found running becomes a card (`adopted`, `src/board.ts:857`).
- One extension to build, package and check on two machines.

**Option B: its own extension.**

- Reaches every session on the machine, with or without AgentBoard. AgentBoard's hook deliberately ignores sessions that are not its own (`hook/hook.js:134-135`), so the data source would be transcript tailing (`~/.claude/projects`, `~/.codex/sessions`), as zoetrope, whatsmyagentdoing and agent-flow's Codex side do. No hooks needed.
- Costs: a second extension under the two-machine parity rules, and a second copy of the transcript parsers unless they are shared. Transcript formats are undocumented and change (zoetrope's README says so).
- It would know nothing about cards, parents and children, or Done when, unless it also reads AgentBoard's files.
- agent-flow is already this kind of extension (a tab, all Claude and Codex sessions, Apache-2.0). It scored 3 here because its graph drifts, and it configures Claude Code hooks on first open.

**Recommendation.** Build option A, with the drawing code written as one self-contained module that takes a plain list of events (time, agent, kind of work, label, outcome) and knows nothing about cards. Feed it from the events file first; add a transcript reader as a second source when sessions outside AgentBoard matter. If it earns its place, that module lifts out into its own extension with little change. This gets the tab now and keeps option B open, without paying for a second extension before the visual is proven.

## 5. Scorecard: all 27 repos

Score: usefulness for following a long, complex task as it runs, 1 to 5. Nobody scores 5, because nobody shows progress and history and location together. Stars and licences are from the GitHub API on 11 November 2026.

| Repo | Stars | Family | Score | What it is good for | Idea taken |
|---|---:|---|:-:|---|---|
| alexeyw/lot-map | 419 | Radial stations | 4 | Kind of work now, where effort went, errors, context, in one fixed picture | 2, 3, 7 |
| furkankly/zoetrope | 1,162 | Graph (tree) | 4 | Agent tree with status and tool counts; event-indexed timeline you can scrub | 1, 4 |
| cosmtrek/mindwalk | 1,397 | Codebase map (replay) | 4 | Where in the repo the task went and how far it spread | 1, 6 |
| patoles/agent-flow | 1,779 | Graph (force) | 3 | Timeline rows and file attention panels; the graph itself is mostly show | 4, 6 |
| simple10/agents-observe | 716 | Dashboard | 3 | Lane per agent with sub-agent attribution; cost per prompt | 4 |
| hoangsonww/Claude-Code-Agent-Monitor | 1,172 | Dashboard and board | 3 | Todo-progress donut; status columns | 5 |
| matt1398/claude-devtools | 4,038 | Inspector (replay) | 3 | Best compression of a transcript into count summaries | 7 |
| Entelligence-AI/agentplay | 360 | Map and timeline (replay) | 3 | Context lane with compaction drops; "recent 10" rule; retry runs | 3, 6 |
| W17ant/Claude-Office | 356 | Office | 3 | Click-to-inspect card, failed calls in red, context meters | 3, 7 |
| paulrobello/claude-office | 615 | Office | 3 | Whiteboard with the real todo list, agent Gantt, most-edited files | 4, 5, 6 |
| Charonyuu/whatsmyagentdoing | 398 | Office | 3 | Honest states; "No progress" flag after 10 minutes on one tool | (have: Quiet) |
| ilomon10/tagconn | 1 | Office | 3 | Duration flags; zone by command (tests show as "in QA") | 7 |
| FulAppiOS/Agent-Quest | 185 | Village | 3 | Fixed tool-to-place mapping; tokens delegated against tokens returned | 2 |
| JamsusMaximus/codemap | 134 | Hotel | 3 | The only "world" where position means a real folder and file | 6 |
| YehudaLevi/pixelagents | 0 | Office | 3 | Header counters and a rolling event feed beside the office | none new |
| mathiasolofsson87/Claude-agents-office | 0 | Office (pane) | 3 | Role plus plain-words task per sub-agent | 7 |
| 777genius/agent-teams-ai | 2,464 | Board | 3 | "Awaiting you" and "blocked by" pills; a dot that pings only on a real write | (have) |
| kounetsuman/zashiki | 2 | Session list | 3 | `watching` state; count chips for sub-agents, shells and tests | 5 |
| chojs23/lazyagent | 80 | Terminal dashboard | 3 | Indented agent tree; `(+3 -3)` diff size on edit rows | 4 |
| pixel-agents-hq/pixel-agents | 10,164 | Office | 2 | Who needs me; permission bubble that stays until answered | (have) |
| rolandal/pixel-agents-standalone | 58 | Office | 2 | Older fork of pixel-agents | none |
| disler/claude-code-hooks-multi-agent-observability | 1,567 | Dashboard | 2 | Activity density over the last minutes | 1 |
| Ataraxy-Labs/opensessions | 1,238 | Session list | 2 | "Finished while you were away" dot; blocked and stale timers | section 7 |
| takattowo/claude-code-devtools | 1 | Dashboard | 2 | Per-file read, edit and error counts | 6 |
| sebyul2/backstage | 14 | Office | 2 | Verb, file and elapsed time in one bubble; mixes in invented chatter | none |
| Ryder-Sun/Realm | 28 | 3D | 2 | `branch +N/-M` label per session; test pass or fail as an outcome | 7 |
| honorstudio/claude-ville | 21 | Village | 1 | Ambient only | none |

### By family

- **Offices, villages, hotels and 3D worlds (15 repos).** Good at one thing: who is busy and who needs me. Where a character stands usually means the tool class, so a long task looks like the same three spots for an hour. The useful parts of the better ones (W17ant, paulrobello, YehudaLevi) are side panels and whiteboards, not the world. AgentBoard's columns and chips already cover what the world shows.
- **Graphs (agent-flow, zoetrope).** zoetrope's fixed tree is the more useful: nodes never move on their own, each carries status, current tool and tool count, and its timeline is the best in the survey. agent-flow's force layout drifts, needs a large canvas (two agents fill a full screen in its own screenshot) and redraws 60 times a second.
- **Radial stations (lot-map).** The most readable "now" picture: ten fixed stations, a pulse out when a call starts and back when it ends, thicker spokes where the work went, a red dot that stays until your next message, clock hands for long calls, a context ring. Limits: one session, no progress, history of about a minute plus 16 feed rows.
- **Dashboards and feeds (5 repos).** Complete and searchable, but a prettier log. The exceptions are small: agents-observe's lanes, Agent Monitor's todo donut, disler's pulse chart.
- **Boards and session lists (3 repos).** AgentBoard's closest relatives. Their strength is deciding what deserves attention; AgentBoard already has most of those states.
- **Replay tools (3 repos).** mindwalk has the best single visual idea in the survey (the repo as a map that stays dark until touched). Its 3D tilt adds little and hides tiles behind towers.

## 6. What not to take, and why

- **A pixel office or any world.** It needs sprites, a game loop and a canvas, and shows only the current state. Charm, not information.
- **A force-directed node graph.** Positions wander, so the eye cannot learn where things are. AgentBoard's hierarchy is already a list (master row, children, sub-agents); lanes add time to it at far lower cost.
- **The radial map as a picture on the card.** It needs roughly a 450 px square. The side bar is 280 px. In the separate tab (section 4a) it fits and is worth drawing.
- **3D.** Occlusion and WebGL for no extra information.
- **Anything with a server, database, open port or Docker.** AgentBoard reads files and watches them; that is enough for every idea above.
- **Model-written summaries of events** (disler, paulrobello and backstage call a model to describe or chat about events). They spend tokens on bookkeeping, which fails the tokens-per-task test.
- **Scrubbing back through time** (zoetrope, agent-flow, agents-observe). Well made, but it is replay. Worth revisiting after the strip exists.

## 7. Smaller ideas for the attention states

AgentBoard already has `Quiet`, `Waiting on N` and `Repeating tool`. Three refinements came up:

- **Unseen marker** (opensessions): a card that finished or failed while you were not looking keeps a distinct dot until you open it.
- **Pulse on a real write** (agent-teams-ai): the live dot pings only when an event actually arrives, so "session open" and "session producing" look different.
- **Paused with open items** (zashiki): depends on idea 5.

## 8. Answers to the questions in the survey document

- **Data source.** Hooks: pixel-agents, disler, agents-observe, Agent Monitor, lazyagent, both Claude-Office repos, YehudaLevi, codemap, backstage, tagconn, Realm, agent-flow (Claude side). Transcript tailing: zoetrope, opensessions, whatsmyagentdoing, Agent-Quest, claude-ville, rolandal, claude-code-devtools, agent-flow (Codex side), and the three replay tools. Claude Code's in-process plugin API with its own pane: lot-map and mathiasolofsson87. Screen scraping: zashiki. Its own agent runtime: agent-teams-ai.
- **Minimum events per visual.** Strip: time and tool name. Category row: plus the main argument. Lanes: SubagentStart, SubagentStop and the agent id on tool events. Footprint: file path. Progress: the todo tool's input. Exact call durations and lot-map's "pulse out, pulse back": a PreToolUse line, which AgentBoard does not write.
- **Scope.** One session: lot-map, zoetrope, mathiasolofsson87. One project: codemap. Machine-wide: most of the rest. AgentBoard's unit is the card, so per-card drawings fit; no machine-wide view is needed.
- **Rendering cost.** lot-map: one SVG string per update, fixed positions, no layout step; sub-agents are dots circling one station, so 20 agents cost almost nothing but show almost nothing each. agent-flow: a d3-force simulation on a canvas capped at 60 frames a second; it ships a stress scenario of 8 waves of 6 sub-agents and an on-screen frame counter, which says the author needed one. For AgentBoard, strips and lanes of plain rectangles rebuilt with the card are the cheap choice.
- **Hierarchy.** agents-observe: flat lanes with `↳` and a colour per sub-agent; colours repeat when there are many. zoetrope: a layered tree with workflow children nested, plus a minimap once it outgrows the screen. agent-flow: edges between hexagons. lazyagent: an indented tree. For 20 or more agents, the tree and lanes scale; the graphs do not.
- **Licences.** 19 MIT, 2 Apache-2.0 (agent-flow, agentplay), 1 AGPL-3.0 (agent-teams-ai). Five have no licence file: disler, opensessions, codemap, claude-ville and backstage (three of them claim MIT in the README or `package.json` only). Recommendation: take ideas and write our own code. Every idea here is a few dozen lines, so nothing needs to be copied and `THIRD_PARTY_NOTICES.md` stays as it is. The one piece worth adapting is lot-map's command classifier (MIT); if it is adapted, rule 2 applies.
- **Safety.** Nothing was installed. Points to know before installing any of them: W17ant/Claude-Office can answer permission prompts from its page and auto-updates; disler's hooks can send the first 1,000 characters of a payload to a model API and its server allows any origin; the servers of rolandal, claude-ville and Realm are started without a host, so they listen on every network interface (backstage's probably does too), and no login was found in rolandal's; claude-ville reads the Claude credentials file to query usage; agent-flow's `npx` build sends anonymous usage data unless switched off; agent-teams-ai includes Sentry and PostHog. lot-map states that it makes no network requests and keeps names, never content; its classifier was read and matches that, but `register.tsx` was not fully audited.

## 9. Limits of this report

- Nothing was run. Behaviour is described from code, READMEs and still screenshots.
- lot-map, agent-flow and zoetrope were read directly. The other 24 were read by research sub-agents; the screenshots behind the main claims for mindwalk, agentplay, agents-observe and Agent Monitor were then checked by eye. Other details were not re-checked.
- zashiki, tagconn and claude-code-devtools have no screenshots in the repo, and claude-ville's only one is blank; they are judged from code alone.
- The six tools the survey lists as "seen only in videos" were not analysed: no repo to read.
- The CSP on the board allows scripts to set element styles and SVG attributes, which is what these drawings need; that should be confirmed in the first build, not assumed.
