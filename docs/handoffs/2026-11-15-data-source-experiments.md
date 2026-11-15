# AgentViz: test official provider interfaces as data sources

Prepared 15 November 2026. This is the brief for the Run a Plan file `workflows/data-source-experiments.plan.json`. Every step of that plan reads this first. Nothing here has been run.

## Objective

Find out, by experiment, whether two official read interfaces give AgentViz better data than reading transcript files:

- **Codex App Server**, history reads only.
- **Claude Agent SDK session utilities**: listing sessions and reading their messages.

"Better" means it closes a known gap or removes parser maintenance, without losing coverage and without side effects. The plan changes nothing in the product. Its outcome is evidence, a verdict for each interface, and a drafted next step.

The recommendation being tested is in `docs/research/2026-11-14-provider-sdk-architecture.md`. That research read documentation and help text and tested nothing.

## Why now

Four gaps in the current view cannot be closed from transcripts on this machine (`HANDOFF.md`, "Not verified" and "Deferred"):

| Gap | State today |
|---|---|
| Codex file activity | Reads empty. Local Codex sessions edit files through program text inside `exec`, which the reader counts and never parses. |
| End times with live events | The host keeps a call's recorded end time (`event.at.finished`, `src/transcript.js`). Live events sent to the view carry no end time. Codex parents record no end for a child. |
| Claude context usage | Unavailable. |
| Task list progress | "Unavailable" for real sessions (recorded 12 November 2026, not rechecked). |

The Station Observatory build needs durations for its waterfall, so this result feeds its production bridge.

## What this plan does not do

- **No live observation.** Watching a running session needs a real agent run, which spends model usage, and a second client on one runtime. The last step drafts that experiment as prose. Nothing runs it.
- **No contact with Robert's own running Codex.** No daemon command, no control socket, no shared runtime.
- **No product change.** Nothing in `src/`, `media/`, `test/`, `package.json` or `package-lock.json`. No new dependency in the extension.
- **No other provider.** Gemini, Copilot and Grok wait until they are used.

## Hard rules for every step

1. **No model usage.** Never start a turn, send a prompt or input, resume or fork a thread or session, or call the SDK's `query()`.
2. **No credentials.** Never log in or out. Never read, copy or print an auth file, token or API key. Never pass `--startup-sign-out` to Codex.
3. **Never write under the real Codex home or the real Claude config folder.** Every experiment runs against a temporary home under the system temp folder, named `agentviz-ds-*`, selected through the environment variable the survey step confirmed.
4. **Codex App Server runs only as a stdio child** started by the step's own script. No `daemon` subcommand, no `proxy`, no TCP or WebSocket listener, no port.
5. **Real data is limited and stays private.** A step may copy at most the number of real transcripts set by the plan's `real_samples` value (default 3; 0 means none) per provider into a temp home. Copy transcript files only: Codex `rollout-*.jsonl`; a Claude session `.jsonl` with its `subagents` folder. Never copy auth files, configuration, SQLite state or the Codex session index. Anything printed, saved or committed about real data is key names, value types and counts. Never a real title, path, prompt, argument, output or ID.
6. **An SDK is installed only in a temp folder outside the repository**, with `npm install --ignore-scripts` at an exact version. It is never added to `package.json`.
7. **Stop only the processes you started**, by PID, and confirm they have exited. Remove every temp home at the end.
8. **A blocker is a finding.** If an interface needs a login, needs the network, or will not use the temp home, record the exact message and stop that branch. Do not touch the real home to get further.
9. **Empty is not negative.** A comparison that produced no rows is reported as "did not run", with the reason. It is never reported as "no differences".
10. **Run a Plan worker.** Do not open cards, request plan approval or call finish self. Subagents only `opus` at effort `medium` or `haiku` at effort `max`. Never call something passed unless you ran it.

## Questions to answer

### Codex App Server, history reads

| # | Question |
|---|---|
| C1 | Does a server started on a temp home list and read rollouts it did not write? |
| C2 | Which read methods does the installed version have, and which are free of side effects? Hash every file in the temp home before and after each call. |
| C3 | For one tool call: identity, kind, status, exit code, start, end, duration. What does the server give that `src/transcript.js` does not, and the reverse? |
| C4 | Are file edits reported as structured records with a path? In particular the edits a real session made through program text inside `exec`. |
| C5 | Child threads: the parent link, and whether a child's end is recorded. |
| C6 | Plan or task list items. Token and context usage. |
| C7 | Paging, kinds of record it leaves out, an unknown thread, history across a compaction. |
| C8 | Cost: time and memory to list and read the threads. |

Synthetic rollouts only show how the server presents records we invented. Whether real sessions carry structured file changes (C4) can only be answered from real samples, so that part runs only when `real_samples` is above 0.

### Claude session utilities

| # | Question |
|---|---|
| L1 | Do the functions read a temp config folder? How is the folder chosen? |
| L2 | Discovery: the same sessions as `discoverSessions` finds? Sessions recorded in a worktree below a workspace folder? Subagent transcripts? |
| L3 | Names: which field holds the saved title? Does any name or summary field ever carry prompt text? The fixture has a session with no saved title whose first prompt carries a `PRIVATE_` sentinel. AgentViz never uses a prompt as a name. |
| L4 | Messages against events: tool calls, results, errors and timestamps. After a compaction, are the earlier records still returned? |
| L5 | Nested agents: parent links and each agent's own history. |
| L6 | Task list records. Usage and context figures. |
| L7 | Does calling these functions start a process, open a network connection, need credentials or write a file? |
| L8 | Cost: time and memory for the fixture, and for the real samples when allowed. |

## The fixture

Synthetic and deterministic, with fixed timestamps. Build it with the helpers in `test/resilience-fixture.js` where they fit (require that file; do not edit it). Private parts carry `PRIVATE_` sentinels.

**Codex** (rollout files under `sessions/`, plus a session index):

- A main thread with a shell command that succeeds, one that fails with a non-zero exit code, a structured `apply_patch` naming two files, an edit made through program text inside `exec`, a web call, a plan update, a compaction, a completed turn and an aborted turn.
- Two child threads of it, one nested under the other, linked by the fields the lane code reads.
- A thread with a saved name in the index and one without.
- A rollout with a damaged line and an oversized record.

**Claude** (transcripts under `projects/`):

- A session with a custom title, one with only a generated title, and one with neither whose first prompt carries a sentinel.
- Tool calls: a file read, an edit, a shell command that succeeds and one that fails, a web fetch, a task list write.
- A compaction with records before and after it.
- Two subagents, one nested, with their link records, one ended by a task notification.
- Two sessions recorded in a worktree below one workspace folder.

## The steps

| Step | What it does | Starts a server or installs an SDK? |
|---|---|---|
| `survey` | Establishes exact method names, signatures and environment variables from the installed tools and the published package. | No. It generates the Codex schema and unpacks the SDK package to read it. |
| `harness` | Shared code: temp homes, side-effect hashing, private-safe reporting, the fixture, the baseline from the product's own readers, the comparison. | No. |
| `codex-history` | Runs Codex App Server on a temp home and answers C1 to C8. | Yes, a stdio child. |
| `claude-history` | Runs the session utilities on a temp config folder and answers L1 to L8. | Yes, the SDK in a temp folder. |
| `verdict` | Reruns both, writes the report and a verdict for each interface, drafts the live experiment. | Reruns the two scripts. |

`survey` and `harness` run side by side. `codex-history` and `claude-history` run side by side after both.

## Where results go

- `experiments/data-sources/`: the scripts and a README. Not part of the product; the VSIX allow-list leaves it out.
- `docs/development/data-sources/<step>.md`: one receipt per step.
- `docs/research/data-source-experiments.md`: the report and verdicts.
- `artifacts/data-sources/`: generated schema, baseline and raw results. Ignored by Git.

## Acceptance

- Every question C1 to C8 and L1 to L8 has an answer with its evidence, or is marked "not tested" with the reason.
- Every side-effect claim rests on a before and after hash of the temp home.
- No real title, path, prompt, argument, output or ID is in any committed file or receipt.
- `npm test` and `npm run check` pass unchanged. Nothing in the product changed.
- No process started by the plan is left running, and no temp home is left behind.
- The report gives one verdict per interface: adopt behind an adapter, keep transcripts only, or cannot tell without a live test.

## Local facts on 15 November 2026

Read from the installed tools, not from documentation: `codex-cli 0.167.2`, Claude Code `2.1.325`, Node `v26.7.0`. `codex app-server --help` lists the subcommands `daemon`, `proxy`, `generate-ts` and `generate-json-schema`, and the options `--print-startup-config` and `--startup-sign-out`. Recheck them; versions move.
