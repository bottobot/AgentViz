# AgentViz handoff

Written 11 November 2026, at the end of an AgentBoard research session. Read this first, then `docs/research/2026-11-11-live-agent-visualizers-report.md`.

## What this workspace is for

A live picture of what coding-agent sessions (Claude Code, Codex and others) are doing while they run, shown in its own VS Code tab.

Why (Robert): long-horizon tasks are complex and hard to keep track of. Reading walls of text is not user-friendly. That is the part he wants to improve.

## State

Development started on 11 November 2026. The workspace now has a Git repository, a standalone VS Code extension, Claude and Codex transcript adapters, and a stations map with an activity strip. The initial implementation uses Windows as its verification target and reads local transcripts directly. See `README.md` for running and checking it, and `docs/development/2026-11-11-first-slice.md` for the first slice's scope. The research and original decisions below remain historical context.

The next development batch is `workflows/agentviz-next.parallel.plan.json`, listed by AgentBoard's **Run a Plan** picker as **AgentViz: parallel find and follow sessions**. `ORCHESTRATION.md` is its supporting product brief. The JSON file supplies the schedule, dependencies, checks and native model review. Its first priority is the user's requested navigation order: project/workspace, session name, session ID, with filtering. Those changes are pending. `docs/development/agentviz-next-parallel-run.md` records that no run has started. The corrected format audit is in `docs/development/2026-11-11-orchestration-format-audit.md`.

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
