# AgentViz handoff

First written 11 November 2026 at the end of an AgentBoard research session. The **State** section was rewritten on 12 November 2026 at the end of the run "AgentViz: find and follow sessions" (step S10). Read **State** first. Everything from "What Robert has decided" down is the original research handoff, kept as history.

## What this workspace is for

A live picture of what coding-agent sessions (Claude Code, Codex and others) are doing while they run, shown in its own VS Code tab.

Why (Robert): long-horizon tasks are complex and hard to keep track of. Reading walls of text is not user-friendly. That is the part he wants to improve.

## State

The run **AgentViz: find and follow sessions** (`workflows/agentviz-next.plan.json`, plan card `a40b39`) has run all ten steps. S01 to S09 are integrated on the plan branch `task/a40b39` (head `e56805a`). S10, the release step, is delivered on `task/05f15f` and waits for the board's review and integration. Nothing was published, pushed, installed in the normal editor profile or changed in AgentBoard. Those are yours to decide.

The three lists below are deliberately separate. "Implemented" is not "verified".

### Implemented

- **Find a session by project, then name, then ID** (S01 to S03). Project is the transcript's recorded working directory. Name is the provider's saved title, else `Unnamed session`. ID is full or partial. Filters run over every transcript before the list is cut to 80. The followed session never switches on its own.
- **Agent lanes** (S04): the followed session and its subagents on one time axis.
- **Task list progress** (S05) from the agent's own list records.
- **File activity footprint** (S06) from structured file tools.
- **`agentviz.openSession`** (S07): a command another extension can call with `{ provider, sessionId }`.
- **Hardening** (S08): five defects fixed, covering stale answers, bad dates, malformed lines and bad settings.
- **Repeatable acceptance** (S09): `npm run host` and `npm run browser`, plus a light-theme contrast fix.
- **Release packaging** (S10): the VSIX ignore file is now an allow-list, `npm run package:check` inspects a built VSIX, and `README.md` describes the current product.

`README.md` is the description of current behaviour, privacy, launch steps and limits.

### Verified (12 November 2026, native Windows 11, synthetic data)

| Check | Command | Result |
| --- | --- | --- |
| unit | `npm test` | 127 of 127 pass |
| syntax | `npm run check` | exit 0 |
| package | `npm run package` | `agent-viz-0.1.0.vsix`, 11 entries: 9 product files plus 2 written by the tool |
| package contents | `npm run package:check` | exit 0: exact inclusion set, no local path inside, files equal the checkout |
| host | `npm run host` | exit 0: VS Code 1.146.0, 31 checks in the real webview, 1 optional check not run (clipboard) |
| browser | `npm run browser` | exit 0: Edge 157 headless, 11 of 11 |

Each receipt is separate. The host receipt comes from a real VS Code run, not from the unit tests. Detail and per-file checksums: `docs/development/agentviz-next-evidence.md`. Step by step record: `docs/development/agentviz-next-run.md`.

Earlier steps also read real local transcripts, counts only, to check names, projects, lanes and footprints (S01, S03, S04, S06). No real transcript was read in S08 to S10.

### Not verified

- Linux, VSCodium, remote and web hosts.
- A live call from AgentBoard. No caller exists there.
- Screen reader output, high contrast themes, contrast of graphics.
- A real task list record of either provider: none exists on this machine, so progress was tested on synthetic records only.
- Structured Codex file edits: local Codex sessions use program text inside `exec`, so their footprint reads empty.
- The packaged VSIX installed in an editor. The host check runs the checkout, and `package:check` proves the packaged files equal it.
- The copy to clipboard in the default host run (it passed once in S09 with `--clipboard`).

### Deferred

- Subagent task lists and subagent file footprints are parsed but not passed to the view. The panels say "not loaded". The fix is in `src/sessions.js`, where lanes are built.
- An AgentBoard button that calls `agentviz.openSession`. That is a change in the AgentBoard project.
- Replay or scrubbing, more account folders, other providers.
- A search box inside the project selector (947 projects on this machine make a long list).
- Sending the once-a-second message only when something changed. Measured at 86 ms per message at full retention; left alone.

### Review findings from S10

One material finding, fixed: the VSIX ignore file was a deny-list, so a stray file in the checkout (a `.claude` settings file, a copied transcript, notes) would have shipped. Reproduced on synthetic files, fixed with an allow-list and a test that builds a real package beside such files.

One finding fixed in passing: the old README shipped inside the VSIX and named the planning files.

Findings recorded and not changed (none breaks the product contract; all are in the README limits):

- A session ID is the transcript file name, shown as is. A file name holding a direction-override or zero-width character would display misleadingly. Names and labels are cleaned; IDs are not, so a copied ID still matches the file.
- The same folder recorded in two spellings (`C:\Work\app` and `/c/Work/app`, or with `..`) is two projects.
- Name search is literal: two spaces do not match one, and `istanbul` does not find `İstanbul`.
- Saved names lose zero-width joiners, so some joined emoji show as separate ones.

### Decisions waiting for you

1. **Merge.** The plan branch is one commit behind `feat/first-activity-view` (`1b8819e`, the parallel-plan preparation). That commit edits one line each of `README.md` and `HANDOFF.md`, which this step rewrote, so expect a conflict there. Take this branch's version of both.
2. **Version.** The package is still `0.1.0`, the same number as the first slice's build. Bump it before installing if you want to tell the two apart.
3. **Install, push, publish.** Not done.

### Where the earlier history is

The first slice is `docs/development/2026-11-11-first-slice.md`. The plan's brief is `ORCHESTRATION.md`. The format audit is `docs/development/2026-11-11-orchestration-format-audit.md`.

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
