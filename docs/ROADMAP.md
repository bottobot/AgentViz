# AgentViz roadmap

Written 14 November 2026, revised 15 November 2026. Based on a read of every document in the repository **and** of the documents that exist only in the main folder and are not in Git yet (listed below). Checked against the code after the 15 November tidy-up.

## The short version

1. The working extension is in good shape: find a session, follow it, click for details. Version `0.2.0`.
2. **You already chose the look**: on 12 November you picked the Station Observatory and asked for it to become "something quite substantial". A prototype, a research report, a brief and an eleven-step plan exist for it.
3. **None of that Station Observatory work is in Git.** It sits in the main folder as untracked files. That is the first thing to fix.
4. After that, two tracks can run side by side: build the Station Observatory "session world", and test better data sources (the 14 November research).

## Where the extension is today

Checked on 15 November 2026: `npm test` 145 of 145, `npm run check` exit 0, `npm run host` 31 checks in real VS Code 1.146.0, `npm run package` and `npm run package:check` exit 0 for `agent-viz-0.2.0.vsix`. `npm run browser` passed 12 of 12 in five runs out of six; the first run reported 11 of 12 and the failing check was not captured. Detail: `HANDOFF.md`.

Built and working (Windows 11, desktop VS Code):

- Find a session by project, saved name and ID. By default only sessions of the open workspace are listed.
- Stations map, agent lanes, task list progress, file footprint, 30-minute activity strip.
- Details on click: the calls behind a station, lane, file or bar, read again from the transcript on request.
- Sidebar icon, Settings button, and `agentviz.openSession` for another extension to call.
- Local VSIX packaging by allow-list, with a contents check.

Not in the main branch yet: card `fac574` (one project entry per open folder), one commit on its own branch.

## Work that is only in the main folder, not in Git

Seen on 15 November 2026. A new worktree does not contain any of it, and one accident would lose it.

| File | What it is |
| --- | --- |
| `docs/ui-exploration/station.html`, `station.css`, `station.js`, `verify-station.py` | The Station Observatory prototype you chose |
| `docs/ui-exploration/PLAN.md`, `VERIFICATION.md`, `index.html` (edited) | Record your choice and the prototype's checks |
| `docs/research/2026-11-12-session-visualization-paradigms.md` | Research: eight ways to show a live session, including 3D and packets |
| `docs/handoffs/2026-11-12-station-observatory-next-phase.md` | The brief for building the session world |
| `workflows/station-observatory-world.plan.json` | The eleven-step plan for it. No trace in Git that it was launched |
| `docs/research/2026-11-14-provider-sdk-architecture.md` | Research: official provider interfaces as data sources |
| `workflows/agentviz-next.plan.json` moved to `workflows/archive/` | The finished serial plan, archived after its run |

## Document ratings

Scale: **10** = matches the code and Git state today and you can act on it. **1** = describes a state that no longer exists. The score is freshness; "Use it for" is relevance.

Scores are as of 15 November, after the tidy-up rewrote or corrected several of them. "Main folder" marks a file that is not in Git.

| Score | Document | Why | Use it for |
|:-:|---|---|---|
| 10 | `README.md` | Matches the code. | The description of the product. Source of truth. |
| 10 | `HANDOFF.md` | State section rewritten 15 November. Lower half is history. | Current state, what is verified, what is deferred. |
| 10 | `workflows/checks.json` | Every command works. `package-check` added. | Running the checks. |
| 10 | `docs/research/2026-11-14-provider-sdk-architecture.md` (main folder) | One day old. Nothing in it has been acted on. | The data-source track: Codex App Server first, then Claude session utilities. |
| 9 | `docs/development/agentviz-next-parallel-run.md` | Corrected 15 November from Git. | What the parallel plan really did. |
| 8 | `docs/research/2026-11-12-session-visualization-paradigms.md` (main folder) | Direction is current. Two rows of its data table predate details on click. | The design of the session world. |
| 8 | `docs/ui-exploration/station.html` and its three files (main folder) | The chosen prototype. Synthetic data, not wired to the extension. | The starting point of the next build. |
| 8 | `docs/ui-exploration/PLAN.md` (main folder version) | Records your choice of 12 November. The committed version is older and does not. | The decision, and the state rules table. |
| 7 | `docs/handoffs/2026-11-12-station-observatory-next-phase.md` (main folder) | Written before details on click, the workspace scope and the eight concepts. Says real payloads are excluded; a local way to read them now exists. | The brief for the next build. Needs a short refresh. |
| 7 | `workflows/station-observatory-world.plan.json` (main folder) | Ready to run. Same three things are missing from it as from the brief. | Launching the next build after a refresh. |
| 7 | `docs/ui-exploration/VERIFICATION.md` (main folder version) | Adds the prototype's checks. | What was tested on the prototype. |
| 7 | `docs/concepts/README.md`, `docs/concepts/index.html` | Accurate. Built after your choice, as eight alternatives to mine for parts. None is the chosen direction. | Ideas for the lenses of the session world. |
| 6 | `docs/research/2026-11-11-live-agent-visualizers-report.md` | Six of its seven ideas are built. Its advice against 3D and moving layouts was overruled by your choice. | Licence and safety notes on the 27 tools. |
| 6 | `docs/development/agentviz-next-run.md` | Per-step truth for S01 to S10. Header still says S10 awaits review. | Transcript formats of both providers, and every known limit. |
| 6 | `docs/ui-exploration/index.html` | Still opens. The main folder version links the prototype. | Opening the mock-ups. |
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

One filter request format, one host runner, the finished parallel plan archived, stale documents corrected, version `0.2.0`, `package-check` in the check list. Detail in `HANDOFF.md`.

### Phase 1: put the main-folder work into Git (small, do first)

Commit the files in the table above. Until then the chosen prototype and two research reports have no backup, and every card that needs them has to copy them by hand, which is what step one of the Station Observatory plan does.

This needs a decision from you only because the files are in your main folder, where a card does not commit.

### Phase 2: install and use it (your decision)

Install `agent-viz-0.2.0.vsix` in your normal VS Code and use it on real work for a few days. Nearly all verification so far is on synthetic data, and the packaged file has never been installed. This can run alongside everything below.

### Phase 3: the Station Observatory session world (the main build)

What you asked for on 12 November: the stations you like, plus connected sessions and subagents, signals that travel when a call happens, click-through to inputs, outputs and errors, time navigation, and an optional 3D view. The plan builds it as a prototype on synthetic data first, in eleven steps with five lenses built in parallel (islands, call journeys, time, inspector, 3D), then an audit, then a written spec for wiring it to real data.

Refresh the brief and the plan before launching. Three things changed after they were written:

- **Details on click exists in the product.** The plan asks a step to propose a way to read real inputs and outputs locally. That is built (`src/detail.js`). The step should describe and extend it, not design it again.
- **The eight concept pages exist.** They show call journeys, time and inspection in eight styles. The lens steps should mine them.
- **The data research exists.** See Phase 4. It bears on the plan's "real data" step.

### Phase 4: better data sources (can run beside Phase 3)

From the 14 November research. Keep reading transcripts; add official interfaces where they give more:

1. **Codex App Server, history first.** Compare its history reads with what the transcript reader produces. Read only, no agent run.
2. **Codex App Server, live.** Two clients on one isolated runtime: does watching change anything?
3. **Claude session utilities.** Compare with the current discovery, and prove no prompt text becomes a session name.

Why it matters now: App Server reports file changes and command durations as structured records. That is the likely fix for the two gaps the transcript reader cannot close on this machine, **empty Codex file activity** and **no exact call durations**, and the session world's waterfall needs durations.

### Phase 5: wire the session world to real data

After you have reviewed the prototype. Fed by the plan's own data spec and by Phase 4. It includes the gaps already known in the current view:

- Subagent task lists and file footprints reach the view (needed for "touched the same file" links).
- End times are kept for tool calls.
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

1. **Commit the main-folder files** (Phase 1). Say the word and a card can do it, or commit them yourself.
2. **Install `0.2.0`** in your normal VS Code (Phase 2)?
3. **Station Observatory plan:** refresh it first (recommended, small), or launch it as written?
4. **Task progress reads "Unavailable"** for real sessions on this PC (recorded 12 November, not rechecked): accept that for now? The data research does not solve it.
