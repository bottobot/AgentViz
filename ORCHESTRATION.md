# AgentViz next phase implementation plan

**Goal:** Make long coding sessions easy to find by project or workspace, then session name, then session ID, and easy to follow through truthful activity, agent lanes, task progress and file activity.

**Execution:** In AgentBoard, choose Run a Plan and select `AgentViz: find and follow sessions` from `workflows/agentviz-next.plan.json`. That schema compliant file is the executable schedule. This Markdown is the supporting product brief; it does not instruct workers to create cards or submit another orchestrator plan.

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
    - Inspect the integrated changes against the product contract and record material findings. AgentBoard's native model review independently reviews each step, including this release; no additional review card is needed.
    - Run `unit`, `syntax` and `package`. Inspect the actual VSIX inclusion set and checksum; omit transcripts, private source metadata, ignored evidence, development dependencies and orchestration material. Do not manufacture a green host receipt from Node unit test results.
    - Update current behavior, source coverage, launch instructions, evidence locations and remaining limitations. Record child/review card IDs, delivered commits and the final integration commit in the execution record.
    - Accept when prior outcomes are accepted and this release is ready for native review, required checks have completed, a local VSIX exists, and the handoff clearly distinguishes implemented, verified and deferred work. Leave publication, normal profile installation, remote push and cross project caller changes unexecuted.

## Run a Plan

Open AgentBoard in this workspace, choose **Run a Plan**, select **AgentViz: find and follow sessions**, inspect the preview and choose Run. The file is `workflows/agentviz-next.plan.json`. It declares ten steps, explicit sequential dependencies, named checks and `review: model`. Account, model, effort and permission values use the board's current defaults and preview; no obsolete provider alias is pinned here.

Run approval and scheduling come from this native plan flow. Do not create a separate root orchestrator, call `board.js plan`, allocate extra cards, or use the former caps/policy proposal. Plan runs refuse manual add/adopt/plan operations. The plan schema has no caps or policy fields; this file does not pretend to apply custom limits. The declared ten steps and existing board limits bound the work.

## Acceptance and integration

The JSON file's step IDs are the dependency keys; AgentBoard resolves them to actual card IDs. Each step reads its named outcome above, works in its declared files, adds meaningful regressions and runs `unit` and `syntax` from `workflows/checks.json`. The release also runs `package`. The board supplies native model review and integrates accepted dependency changes into the plan branch before starting dependent work. Do not manually merge into the main checkout or push.

A passed existing suite is not proof of a new feature. Require behavior specific regression evidence and a review of the delivered diff. GUI checks and live source compatibility remain separately evidenced outcomes. Do not replace missing receipts with assumptions. The files under workflows are excluded from the production VSIX.

## Continuity and recovery

Maintain `docs/development/agentviz-next-run.md` with actual native step/card identity, source and delivery commits, commands/results, review state, evidence locations, blockers and next action. Update only your own outcome during implementation; the final handoff reconciles all prior outcomes. Real board state and Git history remain authoritative. Do not claim an allocation, interrupted command, pending check or unreadable artifact is a delivered result.

On resume, inspect Git status/log, this brief, the native plan card and your existing step state before editing. Reuse the interrupted step through AgentBoard's own controls and preserve a user paused run. Do not duplicate the workflow or create an independent coordinator. Follow the native generated worker prompt when blocked: report the concrete blocker and preserved evidence rather than silently reducing acceptance.

The run ends with reviewed local changes and a local package. Leave Finish, remote push, normal profile installation, publication and cross project caller changes to separately authorized app controls. This preparation does not launch the workflow.
