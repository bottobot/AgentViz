# AgentViz roadmap

Written 14 November 2026, last revised 15 November 2026 after Phases 0 and 1 were done, `0.2.0` was installed and the Station Observatory plan was refreshed. Based on a read of every document in the repository, checked against the code.

## The short version

1. The working extension is in good shape: find a session, follow it, click for details. Version `0.2.0` is installed in your normal VS Code. It has not been used on a real session yet.
2. You chose the look on 12 November: the Station Observatory, built out into "something quite substantial". Its prototype, research, brief and eleven-step plan are in Git now, and the plan is refreshed and ready to launch.
3. Two tracks can run side by side from here: build the Station Observatory "session world", and test better data sources (the 14 November research).

## Where the extension is today

Checked on 15 November 2026: `npm test` 145 of 145, `npm run check` exit 0, `npm run host` 31 checks in real VS Code 1.146.0, `npm run package` and `npm run package:check` exit 0 for `agent-viz-0.2.0.vsix`. `npm run browser` 12 of 12. All on `05af8e5`. Earlier the same day one browser run in six reported 11 of 12; the failing check was not captured and it did not recur. Detail: `HANDOFF.md`.

Built and working (Windows 11, desktop VS Code):

- Find a session by project, saved name and ID. By default only sessions of the open workspace are listed, with one project entry per open folder.
- Stations map, agent lanes, task list progress, file footprint, 30-minute activity strip.
- Details on click: the calls behind a station, lane, file or bar, read again from the transcript on request.
- Sidebar icon, Settings button, and `agentviz.openSession` for another extension to call.
- Local VSIX packaging by allow-list, with a contents check.

Still only in the main folder, by choice, and not touched: an edit to `AgentViz.code-workspace`, and the finished serial plan file moved to `workflows/archive/`.

## Document ratings

Scale: **10** = matches the code and Git state today and you can act on it. **1** = describes a state that no longer exists. The score is freshness; "Use it for" is relevance. Scores are as of 15 November 2026.

| Score | Document | Why | Use it for |
|:-:|---|---|---|
| 10 | `README.md` | Matches the code. | The description of the product. Source of truth. |
| 10 | `HANDOFF.md` | State section rewritten 15 November. Lower half is history. | Current state, what is verified, what is deferred. |
| 10 | `workflows/checks.json` | Every command works. `package-check` added. | Running the checks. |
| 10 | `docs/research/2026-11-14-provider-sdk-architecture.md` | One day old. Nothing in it has been acted on. | The data-source track: Codex App Server first, then Claude session utilities. |
| 9 | `workflows/station-observatory-world.plan.json` | Refreshed 15 November. Passes AgentBoard's plan schema; its loader lists it with no error. Not launched. | Launching the next build. |
| 9 | `docs/handoffs/2026-11-12-station-observatory-next-phase.md` | A dated "Updates" section at the top corrects what changed. The body below it is kept as written on 12 November. | The brief for the next build. |
| 9 | `docs/development/agentviz-next-parallel-run.md` | Corrected 15 November from Git. | What the parallel plan really did. |
| 8 | `docs/research/2026-11-12-session-visualization-paradigms.md` | Direction is current. Two rows of its data table predate details on click; the brief's "Updates" section says which. | The design of the session world. |
| 8 | `docs/ui-exploration/station.html` and its three files | The chosen prototype. Synthetic data, not wired to the extension. Its browser check was not rerun on 15 November. | The starting point of the next build. |
| 8 | `docs/ui-exploration/PLAN.md` | Records your choice of 12 November. | The decision, and the state rules table. |
| 7 | `docs/ui-exploration/VERIFICATION.md` | Lists the prototype's checks as run on 12 November. | What was tested on the prototype. |
| 7 | `docs/concepts/README.md`, `docs/concepts/index.html` | Accurate. Built after your choice, as eight alternatives to mine for parts. None is the chosen direction. | Ideas for the lenses of the session world. The brief maps pages to lenses. |
| 6 | `docs/research/2026-11-11-live-agent-visualizers-report.md` | Six of its seven ideas are built. Its advice against 3D and moving layouts was overruled by your choice. | Licence and safety notes on the 27 tools. |
| 6 | `docs/development/agentviz-next-run.md` | Per-step truth for S01 to S10. Header still says S10 awaits review. | Transcript formats of both providers, and every known limit. |
| 6 | `docs/ui-exploration/index.html` | Still opens, and links the prototype. | Opening the mock-ups. |
| 5 | `docs/development/agentviz-next-evidence.md` | Counts, file list and checksums are for the `0.1.0` build. The "Not verified" list is still exact. | The list of gaps. |
| 5 | `docs/concepts/shared/BRIEF.md` | A build brief for finished work. | The data each concept needed. |
| 4 | `docs/development/agentviz-next/metadata.md`, `filters.md`, `host-harness.md` | The code they describe was removed on 15 November. Each now says so at the top. | History. `metadata.md` still holds useful source-format counts. |
| 4 | `docs/research/2026-11-11-live-agent-visualizers.md` | The raw list. The report replaced it. | Repo links. |
| 3 | `ORCHESTRATION.md` | Brief for delivered work. Marked as history at the top. | The product contract section, as a spec for the filters. |
| 3 | `docs/development/2026-11-11-orchestration-format-audit.md` | About the plan file format. | Writing the next Run a Plan file. |
| 2 | `docs/development/2026-11-11-first-slice.md` | The first slice. Everything in it was extended or replaced. | History. |
| 2 | `workflows/agentviz-next.plan.json`, `workflows/archive/agentviz-next.parallel.plan.json` | Executed. | History. Do not launch either again. |

## The plan

### Phase 0: tidy up. Done 15 November 2026

One filter request format, one host runner, the finished parallel plan archived, stale documents corrected, version `0.2.0`, `package-check` in the check list (`37c7567`).

### Phase 1: put the main-folder work into Git. Done 15 November 2026

The Station Observatory prototype, both research reports, the brief and the plan are committed as found (`bb0334e`). New worktrees have them.

### Phase 2: use it (yours)

`agent-viz-0.2.0.vsix` is installed in your normal VS Code. Reload the window, click the AgentViz icon in the activity bar, and follow a real session for a few days. Nearly all verification so far is on synthetic data, so what you notice matters. A copy of the VSIX is in the main folder.

### Phase 3: the Station Observatory session world (the main build, ready to launch)

What you asked for on 12 November: the stations you like, plus connected sessions and subagents, signals that travel when a call happens, click-through to inputs, outputs and errors, time navigation, and an optional 3D view.

The plan builds it as a prototype on synthetic data first: a baseline, a shared model, five lenses built in parallel (islands, call journeys, time, inspector, 3D), integration, an adversarial audit, and a written spec for wiring it to real data. Eleven steps. It changes nothing in `src/`, `media/` or `test/`.

The refresh of 15 November changed five things in the plan:

- The first step no longer copies files from your main folder. They are in Git.
- The "real data" step no longer says end times of tool calls are thrown away. The code has kept them since details on click; they are just not sent with live events yet.
- That step now describes the existing details on click as the inspection contract and lists what is still open, where it used to ask for one to be designed.
- Each lens step opens the concept pages that suit it. The brief has the table.
- The "real data" step and the final step take the 14 November data research into account, marked as untested.

To launch: in AgentBoard, **Run a Plan**, then **Station Observatory: inspectable session world**. The preview checks the account and model names, which were not checked here.

### Phase 4: better data sources (can run beside Phase 3)

From the 14 November research. Keep reading transcripts; add official interfaces where they give more:

1. **Codex App Server, history first.** Compare its history reads with what the transcript reader produces. Read only, no agent run.
2. **Codex App Server, live.** Two clients on one isolated runtime: does watching change anything?
3. **Claude session utilities.** Compare with the current discovery, and prove no prompt text becomes a session name.

Why it matters now: App Server reports file changes and command durations as structured records. That is the likely fix for **empty Codex file activity**, a gap the transcript reader cannot close on this machine.

### Phase 5: wire the session world to real data

After you have reviewed the prototype. Fed by the plan's own data spec and by Phase 4. It includes the gaps already known in the current view:

- Recorded end times travel with live events (needed for the waterfall).
- Subagent task lists and file footprints reach the view (needed for "touched the same file" links).
- A deleted followed session stops reading "Loading history".
- Plain words for common commands ("running tests").

### Phase 6: the AgentBoard button (work in the AgentBoard project)

`agentviz.openSession` is built and tested. Nothing calls it. In AgentBoard: check that AgentViz is installed, map a card to `{ provider, sessionId }`, call the command, handle the four refusals.

### Phase 7: the second machine

Linux and VSCodium (lilguy) have never been run. The host runner exits as unverified off Windows. Screen reader output and high contrast themes sit here too.

### Later

- Other providers (Gemini, Copilot, Grok): each has a structured stream or hooks; add when you use them.
- More account folders.
- Publishing. The package is `private`, `UNLICENSED`, with a local publisher name.

## Decisions that are yours

1. **Launch the Station Observatory plan** (Phase 3)?
2. **Start the data-source experiments** (Phase 4)? They need a plan or a card written first.
3. **Task progress reads "Unavailable"** for real sessions on this PC (recorded 12 November, not rechecked): accept that for now? Nothing researched so far solves it.
4. **Push.** The plan refresh commit is local only. The earlier 15 November commits are on `origin`.
