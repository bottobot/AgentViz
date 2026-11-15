# AgentViz handoff

First written 11 November 2026 at the end of an AgentBoard research session. The **State** section was last rewritten on 15 November 2026. Read **State** first. Everything from "What Robert has decided" down is the original research handoff, kept as history.

## What this workspace is for

A live picture of what coding-agent sessions (Claude Code, Codex and others) are doing while they run, shown in its own VS Code tab.

Why (Robert): long-horizon tasks are complex and hard to keep track of. Reading walls of text is not user-friendly. That is the part he wants to improve.

## State

Updated 15 November 2026, after the tidy-up that is Phase 0 of the roadmap. **The roadmap is `docs/ROADMAP.md`**: what is built, a freshness rating for every document here, and the next phases.

Everything built so far is on `feat/first-activity-view`. `origin` holds it up to `05af8e5` (15 November), which includes the tidy-up (`37c7567`), the Station Observatory files (`bb0334e`) and card `fac574` (`6574c02`). Those were pushed when AgentBoard finished card `fac574`. The refreshed plan and brief are one local commit after that, not pushed.

`agent-viz-0.2.0.vsix`, built from `05af8e5`, was installed in Robert's normal VS Code on 15 November 2026, at his request, replacing `0.1.0`. `code --list-extensions` shows `agentviz-local.agent-viz@0.2.0`. It has not been used on a real session yet. Nothing is published. Nothing was changed in AgentBoard.

The lists below are deliberately separate. "Implemented" is not "verified".

### Implemented

- **Find a session by project, then name, then ID** (S01 to S03). Project is the transcript's recorded working directory. Name is the provider's saved title, else `Unnamed session`. ID is full or partial. Filters run over every transcript before the list is cut to 80. The followed session never switches on its own.
- **Workspace scope** (`b047fc1`): by default only sessions recorded in an open workspace folder, or below it, are listed. `agentviz.scope: all` lists everything. A project is the workspace loaded in the VS Code window (Robert, 2026-11-15): all listed sessions belong to one project named after the `.code-workspace` file, or after the folder when the window holds a single folder. This replaces one entry per open folder (`6574c02`).
- **Version `0.3.0`** (15 November 2026) holds the three changes below. Checked on the task branch: `npm test` 151 of 151, `npm run check` exit 0, `npm run browser` 12 of 12, `npm run host` 31 checks in VS Code 1.146.0 (1 unverified: clipboard). The host and browser checks run with `agentviz.sessions: all` on past fixtures, so live-only listing is proven by unit tests and by one run on Robert's real sessions (6 live in the workspace, 12 on the machine, equal to the 12 running Claude processes), not in a real VS Code window. `0.3.0` is not installed; `0.2.0` still is.
- **Live sessions only** (Robert, 2026-11-15): by default only running sessions are listed; `agentviz.sessions: all` lists past ones. Claude: `runningClaudeSessions` in `src/sessions.js` reads `<claudeRoot>/sessions/<pid>.json` (pid and sessionId only) and checks the process. Codex has no such record, so it uses "written in the last 10 minutes" (`LIVE_WINDOW`). Known gaps: an idle Codex session drops out after 10 minutes; a Claude session run under another account folder (`~/.claude-accounts/*`) is recorded there and is not seen as running. Subagent transcripts are lanes, not rows. The unit-test hosts and `test/host-runner.js` set `sessions: all` because their fixtures are past sessions.
- **One row per transcript** (2026-11-15): a transcript that sits under two paths is listed once. AgentBoard hard-links each worktree session into the main folder's Claude project folder; 110 of 475 local sessions were listed twice. `oneRowPerFile` in `src/sessions.js` keeps the path that sorts first and records the others as `links`, so the family reader still finds subagent transcripts beside either path.
- **Agent lanes** (S04): the followed session and its subagents on one time axis.
- **Task list progress** (S05) from the agent's own list records.
- **File activity footprint** (S06) from structured file tools.
- **Details on click** (`7fc2ca4`): the calls behind a station, lane, file or bar, and one call read again from the transcript on request.
- **Sidebar icon and Settings button** (`ce423dd`).
- **`agentviz.openSession`** (S07): a command another extension can call with `{ provider, sessionId }`.
- **Hardening** (S08), **repeatable acceptance** (S09: `npm run host`, `npm run browser`) and **release packaging** by allow-list (S10: `npm run package:check`).
- **Tidy-up** (15 November): one filter request format between the view and the host, one host runner, the finished parallel plan file moved to `workflows/archive/`, `package-check` added to `workflows/checks.json`, version `0.2.0`.

`README.md` is the description of current behaviour, privacy, launch steps and limits.

### Verified (15 November 2026, native Windows 11, synthetic data, on `05af8e5`)

| Check | Command | Result |
| --- | --- | --- |
| unit | `npm test` | 145 of 145 pass |
| syntax | `npm run check` | exit 0 |
| package | `npm run package` | `agent-viz-0.2.0.vsix`, 13 entries: 11 product files plus 2 written by the tool |
| package contents | `npm run package:check` | exit 0: exact inclusion set, no local path inside, files equal the checkout |
| host | `npm run host` | exit 0: VS Code 1.146.0, 31 checks in the real webview, 1 optional check not run (clipboard) |
| browser | `npm run browser` | 12 of 12 on `05af8e5`. Earlier the same day, on the tidied code before card `fac574` was merged, one run in six reported 11 of 12; which check failed was not captured, and it did not recur |

The unit count fell from 163 to 145 because 18 tests covered the code that was removed (the second request format and the second runner). No remaining test was weakened.

Each receipt is separate. The host receipt comes from a real VS Code run, not from the unit tests. The evidence of 12 November, with per-file checksums for the `0.1.0` build, is in `docs/development/agentviz-next-evidence.md`. The step by step record is `docs/development/agentviz-next-run.md`.

### Not verified

- Linux, VSCodium, remote and web hosts.
- A live call from AgentBoard. No caller exists there.
- Screen reader output, high contrast themes, contrast of graphics.
- A real task list record of either provider: none was found on this machine on 12 November, so progress is tested on synthetic records only and read "Unavailable" for real sessions then. Not rechecked since.
- Structured Codex file edits: local Codex sessions use program text inside `exec`, so their footprint reads empty.
- The installed `0.2.0` on real sessions. It is installed in the normal VS Code profile; nobody has opened it there yet. The host check runs the checkout, and `package:check` proves the packaged files equal it.
- The copy to clipboard in the default host run (it passed once in S09 with `--clipboard`).
- The cause of the one failed browser run above.

### Deferred

- Subagent task lists and subagent file footprints are parsed but not passed to the view. The panels say "not loaded". The fix is in `src/sessions.js`, where lanes are built.
- An AgentBoard button that calls `agentviz.openSession`. That is a change in the AgentBoard project.
- Plain words for common commands ("running tests"), replay or scrubbing, more account folders, other providers.
- A search box inside the project selector. Less pressing since the workspace scope became the default.
- Sending the once-a-second message only when something changed. Measured at 86 ms per message at full retention; left alone.

### Known limits recorded by the S10 review, not changed

All are in the README limits.

- A session ID is the transcript file name, shown as is. A file name holding a direction-override or zero-width character would display misleadingly. Names and labels are cleaned; IDs are not, so a copied ID still matches the file.
- The same folder recorded in two spellings (`C:\Work\app` and `/c/Work/app`, or with `..`) is two projects.
- Name search is literal: two spaces do not match one, and `istanbul` does not find `İstanbul`.
- Saved names lose zero-width joiners, so some joined emoji show as separate ones.

### Decisions waiting for you

1. **Use it.** `0.2.0` is installed. Reload VS Code, open AgentViz from the activity bar, and follow a real session for a few days. Note what you look at and what is missing.
2. **Launch the Station Observatory plan.** You chose the Station Observatory on 12 November. Its prototype, research, brief and plan are in Git since 15 November (`bb0334e`), and the plan and brief were refreshed the same day for details on click, the eight concept pages and the data research. In AgentBoard: **Run a Plan**, **Station Observatory: inspectable session world**. Eleven steps; it builds a prototype on synthetic data and ends with a written spec for wiring it to real data.
3. **Data sources.** The research of 14 November (`docs/research/2026-11-14-provider-sdk-architecture.md`) recommends testing Codex App Server, then Claude's session utilities. Not started. It may fix the empty Codex file activity.
4. **Task progress** reads "Unavailable" for real sessions on this PC (recorded 12 November, not rechecked). No fix is known.
5. **Push.** One local commit, the plan refresh, is not on `origin`.

### Where the earlier history is

The first slice is `docs/development/2026-11-11-first-slice.md`. The brief for the ten-step run is `ORCHESTRATION.md`. Its parallel plan file is in `workflows/archive/`. Its serial plan file is still tracked as `workflows/agentviz-next.plan.json`; in the main folder it was already moved to `workflows/archive/` after the run finished, as a change that is not committed. The format audit is `docs/development/2026-11-11-orchestration-format-audit.md`. The three receipts of the partly run parallel plan are in `docs/development/agentviz-next/`.

## What Robert has decided

1. **Not inside AgentBoard's cards.** "It's too much information visually. It needs to be like a separate tab." (11 November 2026)
2. **Probably its own extension.** "Maybe it's not something that's integrated into AgentBoard. But its own extension that hooks into AgentBoard and any other sessions." He then asked for this workspace. He said "maybe", so confirm before building (see Open decisions).
3. **lot-map is the visualization he saw and liked** (https://github.com/alexeyw/lot-map): a radial map where each tool call sends a pulse from the centre to a fixed station (files, shell, network, agents, memory).

## Original open decisions

The first development slice uses a separate extension, direct local Claude and Codex transcript reading, Windows verification, and the map and activity strip. These defaults were presented when development started. AgentBoard integration, subagent lanes and Linux verification remain outside this slice.

1. **Own extension, confirmed?** The research report recommended starting as a tab inside AgentBoard and lifting it out later (section 4a). Creating this workspace points the other way. Ask which he wants.
2. **Which sessions?** Every Claude Code and Codex session on the machine, or AgentBoard's cards plus whatever else is running?
3. **Which editors and machines?** AgentBoard runs in VS Code on Windows 11 and in VSCodium on Linux (lilguy). Does AgentViz need both from the start?
4. **What goes in the first version?** The report's suggestion: the stations map, sub-agent lanes and the activity strip (see the sketch below).
5. **How it connects to AgentBoard.** Read AgentBoard's files, or have AgentBoard open the tab for a card (a command with the card's id), or both.

## What the research found

Twenty-seven open-source visualizers were read (code and screenshots; none was installed or run). Full detail is in the report. The short version:

- No tool is worth adopting whole. Most show only who is busy right now.
- Seven ideas are worth taking. In build order:
  1. **Activity strip:** a row of small bars over time; height is how many tool calls, colour is the kind of work, with marks for prompts, compactions, sub-agent starts and errors. Gaps show silence.
  2. **Where the work went:** counts per kind of work (files, edits, shell, web, agents), the current one lit, a red badge after an error. This is lot-map's map as a row; in a tab the radial map itself fits.
  3. **Context meter:** amber at 70%, red at 90%.
  4. **Sub-agent lanes:** one row per agent on a shared time axis, children indented under the parent.
  5. **Progress from the agent's own todo list:** "3 of 8 · current item". The only real answer to "how far along" in the whole survey.
  6. **Files footprint:** files and folders touched, reads and edits counted, a flag on files edited three or more times.
  7. **Plain words and folded rows:** "running tests" instead of the raw command; repeated similar events folded into one row.
- Leave out: pixel offices and other worlds, 3D, force-directed graphs, anything that needs a server, database or open port, and model-written summaries of events (they spend tokens).

Sketch of the tab (from the report, section 4a):

```
┌ Activity: <session or card title> ─────────────────────────────────────┐
│  [session ▾]                                context ▮▮▮▮▮▮▯▯▯ 66%     │
│                                                                        │
│   stations map (lot-map style)        │  lanes: main and sub-agents    │
│   fixed positions, thicker spokes     │  main      ████░░█████▌        │
│   where the work went, red dot on     │   ↳ Explore   █████ ✓          │
│   errors                              │   ↳ fixer         ██████▌      │
│                                                                        │
│  ▂▂▃▅▅▅▂ ▂▅▅▇▇▅▃▇▇█▇▃  ▃▅│▂▅▇▇▅▃   whole-run activity strip        now │
│                                                                        │
│  files touched                        │  3 of 8 · current todo item    │
│  src/board.ts   ✎ 7 ▤ 12 ████████     │  folded event rows             │
└────────────────────────────────────────────────────────────────────────┘
```

## Where the data can come from

**1. Session transcripts (covers every session, needs no hooks).**

- Claude Code: `~/.claude/projects/**/*.jsonl`, with sub-agents under `<session>/subagents/`.
- Codex: `~/.codex/sessions/**/rollout-*.jsonl`.
- The formats are undocumented and change. Skip unknown records; never fail on one.
- Working examples to read: zoetrope (`docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `src/provider/`), agent-flow (`extension/src/transcript-parser.ts`, `codex-rollout-parser.ts`, `subagent-watcher.ts`), and AgentBoard's own `src/sessions.ts` and `src/codex.ts`.

**2. AgentBoard's events file (covers AgentBoard's cards only).**

- `.agentboard/events/<task id>.jsonl` in the workspace AgentBoard runs in, written by AgentBoard's `hook/hook.js`.
- One line per hook event: time, event name, tool name, `desc` (the tool plus the first 80 characters of its main argument), a hash of the call, and the sub-agent's id and type.
- Events: SessionStart, UserPromptSubmit, PostToolUse, PermissionRequest, Notification, Stop, StopFailure, SubagentStart, SubagentStop.
- Limits: no line when a tool call starts, so durations are estimates; the agent's todo list is not recorded; sessions that are not AgentBoard's are ignored on purpose.

**Suggested shape.** One plain event list, for example `{ time, session, agent, parent, kind, label, outcome }`. Each source is a small adapter that produces it. The drawing is a pure function from that list to SVG, with no state of its own. lot-map works this way (its map is one SVG string, `hooks/map.ts`), and it keeps the picture cheap to redraw and easy to test.

## Constraints carried over from AgentBoard

- **Simplicity first.** Add a dependency only when a few lines cannot do the job.
- **No model tokens.** Everything is drawn from files already on disk.
- **No server, port or database.** Read files and watch them.
- **Labels are names, never content.** Show a file's last two path parts, a host, a command's name. lot-map's README sets out this rule well.
- **Borrowed code keeps its attribution.** Ideas and layouts are free to use. The one piece worth adapting is lot-map's command classifier (`classify` in `hooks/map.ts`, MIT; it already handles PowerShell). If any code is copied, name the source repo, file, commit and licence. Do not copy from agent-teams-ai (AGPL-3.0) or from the five repos with no licence file (disler, opensessions, codemap, claude-ville, backstage).
- **Do not install the surveyed tools on this PC without reading them first.** Several hook every tool call, open ports or call outside services (report, section 8).

## Suggested first steps

1. Settle the open decisions with Robert.
2. `git init`, a minimal VS Code extension that opens one webview tab, and a command to open it.
3. A transcript adapter for Claude Code that follows one live session and produces the event list.
4. The activity strip and the counts row from that list. Check it against a real running session.
5. Then the stations map, lanes, and a Codex adapter.

## Where things are

- **This folder:** `C:\Users\rober\Documents\Dev Stuff\utilities\AgentViz`
- **Research report:** `docs/research/2026-11-11-live-agent-visualizers-report.md` (scores for all 27 repos, the seven ideas, licences, safety notes).
- **The survey it is based on:** `docs/research/2026-11-11-live-agent-visualizers.md` (the repo list with links).
- **AgentBoard:** `C:\Users\rober\Documents\Dev Stuff\AgentBoard`. The report was written on branch `task/d9a0b1` (commit `c35e6ad`) and had not been merged into `main` when this was written; the copy here is the same text.
- **The 27 cloned repos** were in a temporary folder that will not survive. Clone again when needed, for reading only: `git clone --depth 1 https://github.com/<owner>/<repo>`. The three to read first are `alexeyw/lot-map`, `furkankly/zoetrope` and `cosmtrek/mindwalk`.
