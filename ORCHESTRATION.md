# AgentViz next phase implementation plan

**Goal:** Make long coding sessions easy to find by project or workspace, then session name, then session ID, and easy to follow through truthful activity, agent lanes, task progress and file activity.

**Execution:** One AgentBoard root orchestrator coordinates native board child cards. This document is its coordinating record. AgentBoard does not automatically expand this Markdown into a dependency graph. Use the board's own cards, checks, review and recovery mechanisms.

**Architecture:** Extend the current Node builtin transcript adapters and plain SVG webview. Keep source collection in the extension host and send only approved display metadata and normalized events to the view. Retain a separate VS Code extension and the existing read only data flow.

**Tech stack:** CommonJS JavaScript, Node builtins, VS Code webviews, plain CSS and SVG, Node's test runner. Keep the current lockfile and zero runtime dependencies.

**Sources:** The user's requests on 11 November 2026, `HANDOFF.md`, `README.md`, `docs/development/2026-11-11-first-slice.md`, and `docs/research/2026-11-11-live-agent-visualizers-report.md`. The user's workspace/name/ID filtering requirement supersedes the first slice's ID oriented picker. The later research section describing a separate tab takes precedence over earlier card sketches.

## Starting point

The first slice is committed as `2a3025b`. It already discovers Claude and Codex transcripts, incrementally reads a selected session, draws the stations map and activity strip, and provides an example mode. The current picker shows a project basename, provider, eight ID characters and a time. It does not read saved session titles or provide filtering. Those requested changes have not been implemented.

The recorded first slice evidence is 20 passing Node tests, production syntax checks, a real transcript compatibility sample, browser inspection, a Windows VS Code host lifecycle check and a local VSIX. Recheck the current checkout before relying on that baseline. Do not rebuild completed foundations or assume an ignored artifact exists in a new worktree.

## Product contract

Use the transcript's recorded working directory as the initial project/workspace grouping. Associate it with a VS Code workspace folder only when the relationship is proven. Do not invent a `.code-workspace` association or collapse different directories merely because their basenames match. Keep absolute paths in the host; send opaque workspace keys and short, disambiguated labels to the view.

The navigation order is project/workspace, session name, session ID. Provide an All projects choice, a project/workspace selector, a case insensitive name search and an optional full or partial ID filter. Name and ID filters intersect within the chosen project. Make the full ID available for identification and copying, rather than searching only the visible eight character prefix. Keep stable source identity across renames. Duplicate titles must remain distinguishable.

Use stored provider titles. For Claude, inspect `custom-title.customTitle` and `ai-title.aiTitle`, including records appended after the header; custom titles take precedence. Verify Codex's current local title/index format before using it. Do not start an app server, generate titles with a model, or use raw prompts as a fallback. Use the literal fallback `Unnamed session` when a provider title is absent or unreadable. Name metadata is now explicitly allowed in the view; prompts, reasoning, command arguments, tool output, code and URL paths or queries remain excluded.

Do not let the current global 80 session limit make older projects or requested IDs impossible to find. Discover project groups and apply host filtering before limiting returned sessions. Disclose any retained history or lookup limits. A session changing its name, receiving new activity or moving down the recent list must not silently switch the selected session.

Preserve honest meaning: Quiet is absence of recent records, a completed turn is not project completion, tool counts are not percentage progress, and unknown context is unavailable. Every visible total must describe which source, agents and retained interval it covers.

## Boundaries

Work in this AgentViz checkout and AgentBoard managed worktrees for this repository. AgentBoard's sibling source checkout is a read only reference. Use native Windows for development and verification. Do not start WSL, modify another project, install an extension in the normal editor profile, publish, push or deploy as part of this run.

Reuse the existing adapters, renderer, settings, tests and package script. Add a file only for a clear responsibility, not a speculative service layer. Preserve the CSP, safe DOM text handling, keyboard access, contrast, reduced motion, error reporting, UTF8 handling and disclosed history limits. Do not add hooks, ports, servers, databases, telemetry, model summaries or credentials. Read only the named local metadata needed for the task, and use synthetic data in committed fixtures and shared screenshots.

Defer Linux/VSCodium verification, remote machines, replay/scrubbing, game worlds, 3D, new cloud providers, account autodiscovery and changes inside AgentBoard. An AgentViz command that can be called by AgentBoard is in scope; modifying AgentBoard to call it is a separate project change.

## Steps

1. **S01: Identify workspaces and saved session names.** Owner: metadata worker. Depends on: none. Own: `src/sessions.js`, `src/transcript.js`, `src/extension.js`, `test/sessions.test.js`, `test/transcript.test.js`, `test/extension.test.js` and a focused metadata fixture if needed.
    - Inspect only local schema keys needed to establish title and working directory sources. Record the observed formats without saving real titles or payloads. Retain the current `project` field until all existing callers are accounted for; add catalogue fields `workspaceKey`, `workspaceLabel`, `name`, `nameSource` and keep `sessionId` complete.
    - Write failing tests for Claude custom/generated precedence, late rename, verified Codex title lookup, missing and corrupt metadata, duplicate basenames and stable identity. Windows path comparisons may ignore case; a Linux path stored in a transcript must retain its case semantics without launching Linux.
    - Extend discovery and the host message whitelist. Keep title text short, strip controls and escape it at the display boundary. Return `Unnamed session` on a missing title. Metadata lookup must not change CLI state or credentials.
    - Accept when both providers carry tested workspace/name/ID metadata to the webview, private payload sentinels stay absent, and `unit` and `syntax` pass. Return source shape notes, changed files, commit and check results.

2. **S02: Add workspace, name and ID filtering.** Owner: navigation worker. Depends on: S01 accepted and integrated. Own: `media/app.js`, `media/view.js`, `media/style.css`, `src/webview.js`, `test/view.test.js` and a focused browser/controller test.
    - Consume S01's catalogue fields. Add labelled project/workspace selection, name search and optional ID search. Match names and IDs case insensitively; trim surrounding whitespace. Display workspace first, then name, then ID, with provider as supporting detail. Include a usable full ID copy action.
    - Test intersection of filters, duplicate names, exact and partial IDs beyond the first eight characters, no matches, clearing filters, malicious title text, example mode, keyboard operation and a narrow viewport. Use the current catalogue as the first navigation test boundary; S03 supplies complete host lookup coverage before this milestone is considered delivered.
    - Clear or explicitly preserve selection when filters exclude it; never display another session under the selected label. Preserve input focus and typed text during background refreshes. Persist only nonsecret UI preferences through the existing webview state mechanism.
    - Accept when the requested navigation order works on synthetic provider data and `unit` and `syntax` pass. Return screenshots or DOM evidence, commit and exact behavior on an excluded selection.

3. **S03: Make discovery and selection cover the requested project.** Owner: discovery worker. Depends on: S02 accepted and integrated. Own: `src/sessions.js`, `src/extension.js`, `media/app.js`, related existing tests and a focused catalogue test if needed.
    - Complete the host query contract used by the filters. Return project groups independently of the recent session response cap; filter project/name/ID before limiting matches. Cache metadata only where measurements show repeated unnecessary reads. Do not reread every full transcript once per second.
    - Test a selected project older than 80 newer sessions, a matching full ID outside the recent list, duplicate workspace labels, a rename, deletion, no matches and stale query/configuration responses arriving out of order. Validate IDs against the current source generation and keep the selected source stable during ordinary refreshes.
    - Preserve malformed record counts, sampled rewrite recovery, partial UTF8 and pending JSON behavior. Show a visible lookup/loading/limit state instead of silently returning an incomplete global list.
    - Accept when S01 through S03 meet the whole product navigation contract, the discovery tests prove filtering precedes truncation, and `unit` and `syntax` pass. This is the first releaseable checkpoint.

4. **S04: Show main and subagent lanes.** Owner: hierarchy worker. Depends on: S03 accepted and integrated. Own: `src/sessions.js`, `src/transcript.js`, `src/extension.js`, `media/view.js`, `media/style.css` and their focused tests.
    - Derive parent/child relationships only from verified metadata and provider lifecycle events. Use one shared time axis with main first and children indented. Label unavailable lifecycle boundaries honestly; do not manufacture exact durations from gaps.
    - Follow child transcripts only for the selected session family. Deduplicate repeated metadata/calls, protect against cycles and missing parents, and disclose any child history or discovery limits. A parent recording a spawn must not be counted as the child's own tool work.
    - Test nested and overlapping children, missing child files, repeated parent metadata, child failure/completion, selection changes and cleanup. Define whether station totals include the family and apply the same definition to lanes and the strip.
    - Accept when lanes show a synthetic family and a sanitized local compatibility sample with consistent attribution and `unit` and `syntax` pass. Return the observed source mapping and evidence limits.

5. **S05: Show progress from explicit agent task lists.** Owner: progress worker. Depends on: S04 accepted and integrated. Own: `src/transcript.js`, `media/view.js`, `media/style.css` and focused parser/view tests.
    - Read verified Claude todo/task records and Codex plan update records already present in transcripts. Keep task ID, status, a bounded display label and source attribution; never infer completion from activity volume. If a provider has no supported list, show progress unavailable.
    - Render completed/total plus current explicit item. Test replacement lists, updates, duplicate records, compaction, an ended turn with open tasks, absent lists and hostile label text. A task label is allowed only in the progress area and must not bring along tool payloads or prompts.
    - Keep main and child progress distinct unless the source explicitly provides a shared list. Say that task list progress is the agent's own plan, not independently measured project completion.
    - Accept when tests cover both supported provider forms or explicitly prove and document a provider's unavailable state, and `unit` and `syntax` pass. Return the verified schemas and any provider coverage gap without inventing support.

6. **S06: Show a file activity footprint.** Owner: footprint worker. Depends on: S05 accepted and integrated. Own: `src/transcript.js`, `media/view.js`, `media/style.css` and focused parser/view tests.
    - Retain only safe file identity and short display labels from structured file tools. Show read/edit counts, a small ranked list and a marker after three recorded edits. Distinguish two different files with the same short label using an opaque key.
    - Do not parse arbitrary shell output or publish full paths, file contents, patch bodies or code. Test repeated edits, duplicate calls, failed calls, Windows/UNC/Unix path forms, missing paths, retained history truncation and child attribution.
    - State that the footprint covers recognized structured file tools and retained history. Keep the current empty state when no paths are available.
    - Accept when the footprint and station totals agree under the documented counting rule, privacy sentinels remain absent, and `unit` and `syntax` pass.

7. **S07: Provide a narrow AgentBoard entry point.** Owner: integration worker. Depends on: S06 accepted and integrated. Own: `src/extension.js`, `package.json`, focused host tests and `README.md`.
    - Let an extension command accept a validated provider and session ID so another extension can open AgentViz on a specific local session. Preserve the existing no argument Command Palette behavior. Resolve the target through the current catalogue/query path; never accept an arbitrary file path from command input.
    - Test both providers, absent/unknown IDs, unavailable source, malicious arguments, duplicate command execution and an already open panel. Reuse S03's exact ID lookup so an older session can be addressed.
    - Describe the command contract with synthetic examples. Do not alter the sibling AgentBoard checkout, install either extension or claim a live AgentBoard button was tested. If there is no current AgentBoard caller, record that seam as pending work in that project.
    - Accept when the command's actual VS Code host test passes, `unit` and `syntax` pass, and the source scope stays inside AgentViz.

8. **S08: Check resilience and cost of the combined view.** Owner: reliability worker. Depends on: S07 accepted and integrated. Own: targeted fixes in the current host/adapters/view, focused tests and the execution evidence record.
    - Measure discovery and append reads on representative synthetic histories. Record file/event/child counts, bytes read, elapsed time and responsiveness. Keep caps visible. Fix measured problems with the existing architecture; do not add a worker service or dependency on speculation.
    - Exercise partial writes, invalid timestamps, malformed/oversized records, replacement, sampled rewrites, source/configuration changes during reads, stale query responses, hidden panels, disposal and repeated reopen. Confirm updates do not reset filters or leak obsolete source metadata.
    - Probe the final host message for prompt, reasoning, command, output, raw path and secret sentinels. Inspect the CSP and package resource roots. Demonstrate Refresh recovering an edit between rewrite samples and keep that limitation documented.
    - Accept when focused regressions and `unit` and `syntax` pass, measured evidence is recorded, and no material unresolved correctness or privacy finding is hidden by a benchmark cap.

9. **S09: Make Windows acceptance repeatable.** Owner: validation worker, with exclusive use of the GUI lane. Depends on: S08 accepted and integrated. Own: `test/extension-host.js`, a small repeatable test launcher only if needed, related package scripts/check catalogue entries and `docs/development/agentviz-next-evidence.md`.
    - Run a fresh VS Code development host using an isolated profile and synthetic source directories. Check open/reuse/close/reopen, workspace selection, name and full ID filtering, renamed sessions, a selected child, the AgentBoard entry command, no matches and source failures.
    - Inspect the emitted UI in a real browser at desktop and narrow widths. Check keyboard focus, accessible names, contrast, example/real distinction and absence of console/CSP errors. Use synthetic titles in screenshots.
    - If a reusable host runner is added, make it locate and verify the executable, fail on a missing or failed result, avoid the normal editor profile, and stop only the process it started. Add its check to `workflows/checks.json` only after the command actually works.
    - Accept when `unit`, `syntax`, the actual host run and browser inspection all have separate receipts. Mark unavailable environments as unverified and keep the milestone open instead of asserting those checks passed.

10. **S10: Independently review, package and hand off.** Owner: release worker; an independent board review card checks the result. Depends on: S09 accepted and integrated. Own: `README.md`, `HANDOFF.md`, `docs/development/agentviz-next-evidence.md`, the execution record and packaging metadata only if needed.
    - Have a reviewer who did not implement the relevant change inspect the integrated diff against this contract. Include adversarial workspace/name/ID cases and the previous first slice regressions. Fix reproduced material findings through the appropriate worker and repeat only affected checks.
    - Run `unit`, `syntax` and `package`. Inspect the actual VSIX inclusion set and checksum; omit transcripts, private source metadata, ignored evidence, development dependencies and orchestration material. Do not manufacture a green host receipt from Node unit test results.
    - Update current behavior, source coverage, launch instructions, evidence locations and remaining limitations. Record child/review card IDs, delivered commits and the final integration commit in the execution record.
    - Accept when all ten outcomes are reviewed, required checks have completed, a local VSIX exists, and the handoff clearly distinguishes implemented, verified and deferred work. Leave publication, normal profile installation, remote push and cross project caller changes unexecuted.

## Dispatch and acceptance

Use `workflows/agentviz-next.caps.json` and `workflows/agentviz-next.policy.json`. The proposed limits are four open cards, 32 total cards, depth two and two automatic follow ups. Ten delivery outcomes plus independent reviews leave room for bounded repairs. These are coordination limits, not a dollar or token budget. Do not silently increase them or create a fresh run to evade them.

S01 through S10 are logical labels. In `board.js add --after`, use actual returned six hexadecimal character card IDs. Record the mapping as soon as allocation succeeds. A queued allocation is not evidence that a worker session ran.

Run one implementation worker at a time across the shared parser, host and renderer files. Read only review and evidence preparation may overlap when their source commit is fixed. Every child receives a bounded packet: its one outcome above, current dependency commits, allowed files, common privacy/runtime boundaries, exact check names, and required final evidence. Do not paste the whole research survey or private transcripts into every packet. No extra coordinator is needed for this dependency chain; split a stuck outcome into bounded child work only within the approved depth/capacity.

Each implementation card uses a native completion rule with `commands: ["unit", "syntax"]`, a concrete `goal`, and a `doneWhen` describing that outcome in fewer than 1000 characters. The release card also names `package`. Use `--rule-file` with that single rule object. Check names come from `workflows/checks.json`; they are not arbitrary shell text. Passing the current suite alone does not prove a new feature: require a regression that failed before the change and acceptance evidence tied to the requested behavior.

Inspect `show <id> --last 20`, the actual diff, commit and check receipt before accepting a child. A review reply must say accepted or list concrete reproduced defects and evidence gaps. A reviewer remains read only; use the owning worker for fixes. Integrate accepted commits into the root's authorized worktree before opening a dependent implementation. Do not reuse a passed check receipt from an older commit after changing covered code.

## Run startup

In the AgentViz workspace, create an AgentBoard task with its Orchestrator option enabled. Give it this launch instruction:

```text
Develop AgentViz according to ORCHESTRATION.md in this checkout. Act as the AgentBoard root orchestrator. Read the current Git state, ORCHESTRATION.md, docs/development/2026-11-11-orchestration-format-audit.md and docs/development/agentviz-next-run.md. Preserve the existing first slice. Resolve your actual board identity, accounts, models and capabilities, propose the supplied caps/policy through board.js plan, and end that planning turn for AgentBoard's root approval. After approval, use native board child cards, complete S01 through S10 with their evidence gates, and maintain the durable execution record. Do not execute the work as one oversized chat task or silently substitute an unsupported runtime.
```

The bound orchestrator resolves its current CLI with native PowerShell and checks that it exists:

```powershell
$agentVizBoard = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.agentboard\board.js'
if (-not (Test-Path -LiteralPath $agentVizBoard)) { throw 'AgentBoard CLI is unavailable' }
node $agentVizBoard show self
node $agentVizBoard capabilities
node $agentVizBoard models --json
node $agentVizBoard accounts --json
node $agentVizBoard plan --caps-file workflows/agentviz-next.caps.json --policy-file workflows/agentviz-next.policy.json
```

Use only currently advertised signed in accounts, runtimes, model IDs and effort values. Prefer the user's available Luna equivalent at maximum effort for suitable worker packets, if the board advertises it; select a supported stronger reviewer when needed. Resolve this at launch rather than hardcoding a dated model alias. AgentBoard's current capabilities decide unattended provider support. If a requested route is unavailable, report it instead of quietly switching providers.

The root approval gate comes from AgentBoard's own orchestrator protocol, documented in its `docs/orchestrator/BRIEF.md` and `docs/agents/README.md`. Writing this plan has not requested that approval, created cards or launched workers. At execution time, approval happens once for the concrete root proposal; ordinary decisions and repairs within its scope do not need repeated permission requests.

## Continuity and recovery

Maintain `docs/development/agentviz-next-run.md` after each allocation, accepted delivery, integration, failure or scope change. Record logical outcome, actual card ID, owning worktree, status, source commit, delivered commit, check command/exit/result, review verdict, blockers and next action. Keep logs and screenshots under ignored `artifacts/` and store concise evidence references and conclusions in the durable record. Never copy real transcript bodies or secrets into the record.

On resume, first inspect Git status/log, the execution record, `show self`, `list --mine --all`, relevant `show` results and queued `receive` messages. Confirm the current card/session binding. Reconcile actual files and receipts with prior claims. Resume the existing owned card where possible; do not duplicate a finished or still running outcome. A missing artifact in a new worktree is a missing receipt, not proof that the implementation failed.

Use `wait --mine --timeout 60` for a bounded observation window; a timeout means no new state, not success or failure. Preserve a user paused run. A permission wait, interrupted command, failed launch or pending check remains unresolved. Read the actual failure before attributing it to a provider or environment. After two unsuccessful fix follow ups, split or replan the work within the remaining approved capacity; after three identical failure signatures, change the approach instead of repeating it.

Close only cards belonging to this run. Do not claim unrelated work, impersonate card IDs, edit board state files directly or discard worktrees. Use board supported resume/stop/cancel/handoff operations when needed. If a true blocker remains, record a reproducible failure, preserved work and the exact missing input; continue independent authorized work.

After all descendants are accepted and integrated, request delivery readiness with `ready` and provide the local handoff. AgentBoard's `finish self` route can trigger merge, push and cleanup. Do not call it while it would violate this run's local only policy; leave that external finishing action to separately authorized app controls. `noSync` is not proof that every hook or finish path suppresses synchronization.
