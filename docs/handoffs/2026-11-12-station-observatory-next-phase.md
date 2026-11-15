# AgentViz: expand Station Observatory into an inspectable session world

Prepared 12 November 2026 for AgentBoard's **Load handoff**. This is the implementation brief, not an executable Run a Plan JSON file. Loading it fills the prompt box; it does not launch work.

## Objective

Expand the existing animated Station Observatory into a substantial, user-friendly way to inspect coding-agent sessions as activity arrives. Preserve the station design Robert likes. Add connected sessions and subagents, event-triggered request/result signals, deeper inspection and synchronized time navigation. Explore meaningful 3D interaction while retaining a readable fixed view.

Work in **AgentViz**, not the AgentBoard extension:

`C:\Users\rober\Documents\Dev Stuff\utilities\AgentViz`

The first deliverable is a richer working prototype using synthetic data. The production integration stage must explicitly reconcile the real event schema, privacy boundary and provider limitations; do not silently present synthetic payloads as live data.

## What Robert actually requested

Robert selected the improved Station Observatory and said:

> "I really want to build the station out to be something quite substantial."

> "I want to be able to click on things like error messages, or API calls, or outputs, or inputs. Just give me a variety of stuff that will really help us figure out what it's doing. Tool calls, you know, all that kind of stuff. We really want to visualize the heck out of this."

After trying the prototype, Robert said he liked it and asked for research into novel ways to interact with live session data, including:

> "maybe in 3D? You know, like a little node network where we see the little packets or information going to their places, and maybe how they connect to other sessions, like sub-agents."

The latest instruction was to turn that research into a handoff document in the handoff folder for loading into AgentBoard.

**Confirmed direction:** expand the station experience, make activity inspectable, show tool calls and their evidence, and explore session/subagent connections.

**Proposed design choices, not separately approved requirements:** session islands, optional orbit camera, a temporal peel, exact numbers of demo agents, and a particular graph library. Use the research to make a concrete, reviewable implementation; do not treat every research alternative as a feature to ship.

## First actions and continuity

1. Check `git status --short`, `git log -3 --oneline` and the actual source files before changing anything. At handoff creation HEAD was `9840479` on `feat/first-activity-view`; this is a historical observation, not a required branch or merge target.
2. Open `docs/ui-exploration/station.html` from the main checkout and exercise playback and the Network station's API error. Read its HTML, CSS and JavaScript.
3. Read the new research report and the current `README.md`. The older `ORCHESTRATION.md` describes a prior batch and contains stale starting-state assumptions. Do not relaunch that batch to build features already present.
4. **Carry forward the existing uncommitted work.** At this handoff, `station.html`, `station.css`, `station.js`, `verify-station.py` and the new research report were untracked; the exploration plan, gallery and verification document were modified. A newly created Git worktree will not automatically contain those files. Secure the intended source snapshot before allocating new worktrees. Do not overwrite or recreate the prototype from the old committed gallery.
5. Preserve unrelated work: the removed `workflows/agentviz-next.plan.json` and untracked `workflows/archive/` were present before this handoff. Do not reset, delete, stage or restore them as part of this task.

All relative paths in this document are relative to the main AgentViz checkout above. If the task uses a new worktree, copy or integrate the required source snapshot deliberately and record its origin.

## Read these sources

| File | Purpose |
|---|---|
| `docs/ui-exploration/station.html` | Selected working visual prototype; start here |
| `docs/ui-exploration/station.css` | Isometric stations, inspector and responsive layouts |
| `docs/ui-exploration/station.js` | Deterministic example events, animation, selection, payload details and playback |
| `docs/ui-exploration/verify-station.py` | Existing browser self-check; reuse and extend |
| `docs/research/2026-11-12-session-visualization-paradigms.md` | Eight paradigms, primary references, data constraints and recommended experiments |
| `docs/ui-exploration/PLAN.md` | User's selected direction and original alternatives |
| `docs/ui-exploration/VERIFICATION.md` | Actual prototype verification and limitations |
| `README.md`, `HANDOFF.md` | Current product contract and previous development state; revalidate dated claims |
| `src/transcript.js`, `src/sessions.js` | Real event normalization and session-family data |
| `media/view.js`, `media/app.js`, `media/style.css`, `src/webview.js` | Production rendering, interaction, styling and webview boundary |

## What already exists

The standalone prototype has six stations: Files, Edits, Shell, Network, Agents and Memory. Its 42-call synthetic story contains file reads and patches, shell tests, a failed test, an HTTP 429 response, successful API responses, agent review findings and plan updates.

Implemented interactions:

- Play/pause, restart, speed, timeline scrubber and optional signal animation.
- Clickable SVG stations and equivalent keyboard-accessible category buttons.
- Station -> resource -> call -> input/output inspection.
- Error-only filtering, previous/next event navigation, resource follow-through and Escape dismissal.
- An optional flat map, reduced-motion behavior and narrow layouts.

Prior checks passed using installed Python Playwright and Edge: animation and playback, consistent totals, six stations, resource inspection, payloads, keyboard focus, errors, speed, empty states, reduced motion, narrow layouts, and absence of JavaScript errors/network requests. Chrome headless failed to launch on this machine, so Edge was used. These checks did not verify live transcript integration, a packaged extension or user usability.

The current production code already includes project/name/ID session selection, agent lanes, task-list progress, file footprint and `agentviz.openSession`. Do not rebuild those foundations.

## Recommended design

Keep one shared selection and time model behind the different views.

### A. Connected session islands

Represent a session as a stable compact island. Expanding it reveals its tool stations and explicitly linked child agents. Keep neighboring sessions visible at lower detail. Provide focus, collapse, breadcrumbs and Home/reset camera. An optional orbit view may add real 3D exploration, but the default should remain easy to orient in.

Use the following edge types distinctly:

- Delegation: source-recorded parent/subagent relationship.
- Invocation/result: a correlated tool request and response.
- Message: an explicitly recorded inter-session communication.
- Shared resource: an association based on resource identity, not a claim that agents communicated.
- Unknown: missing or uncertain relationships remain visibly unknown.

### B. Follow one call

Emit a signal when a relevant event is recorded. Animate requests and returns separately where the sample or real source supports both. Selecting a call highlights its participants and known related events; other traffic becomes visually secondary. Selecting an edge opens its event ledger.

Do not require users to click moving particles. Provide stable route hit targets and stationary event cards. Preserve exact call IDs under aggregated counts. Errors stay inspectable after their animation ends. A later success must not erase an earlier failure or establish a retry relationship without supporting data.

### C. Live and historical inspection

Keep ingestion distinct from the time being viewed. During inspection, new events can accumulate without replacing the selected evidence. Show a new-events count and a clear Return to live action. The map, selected event and timeline must refer to the same viewed moment.

Compare a compact waterfall, two pinned snapshots and an experimental shallow 3D time-slice view using the same synthetic dataset. Use exact start/end times only where recorded. If depth means time in this mode, do not simultaneously use it to mean hierarchy.

### D. Detail panel

Retain readable input/output and error inspection. Include tool name, call identity, session/agent identity, timestamps, status, related resource and duration when known. Support APIs, commands, edits, file reads, handoffs and plan updates. Keep empty, omitted and unavailable data distinguishable.

## Truth and privacy requirements

- A moving signal represents an application event, not a captured network packet. Decorative travel time is not measured operation latency.
- Do not infer messages, causality, completion, internal reasoning or process health from visual proximity or silence.
- Preserve `parentKnown`, missing/unreadable children, loading states and retention-limit disclosures.
- The production view currently excludes raw prompts, reasoning, code, arguments, tool output, contents and patch bodies. Synthetic payloads do not authorize exposing those fields automatically. Define an explicit local inspection/redaction contract before changing that boundary; keep sensitive data out of exported evidence and screenshots.
- Do not send local session content to a hosted visualization product. The references below are design sources, not destinations for user data.

## Real data gaps to resolve before integration

| Need | Present state | Required handling |
|---|---|---|
| Parent/subagent topology | Family lanes expose parent keys, known/unknown parentage and lifecycle metadata | Reuse those facts; retain missing and uncertain nodes |
| Exact tool durations | `finishTool()` currently changes outcome without retaining an end timestamp | Extend the normalized contract if available in source; otherwise show unknown duration |
| Per-call resource links | File identity is captured host-side; the view receives an aggregate footprint | Expose approved opaque associations without full paths |
| Shared resources across children | Subagent file/task data is not currently loaded into the corresponding panels | Extend joins deliberately; do not compare shortened filenames as identity |
| Arbitrary inter-agent messages | Complete correlated message edges are not established by current inspection | Add adapters only for known source formats; unknown remains unknown |
| Real payload details | Deliberately excluded from the webview today | Separate local detail handling and explicit content policy |

Coverage warning: the inspected implementation follows up to 24 subagent lanes, 2,000 retained events per lane and 10,000 per transcript. Recheck current constants and expose omissions; these are collection limits, not promises that every session has been observed.

## Suggested work sequence

1. **Preserve and baseline:** secure the existing prototype in the working source, rerun its checks, and capture current appearance. Confirm file ownership if work is split among agents.
2. **Connected prototype:** add a parent, three children, a missing child transcript and an unrelated session. Implement expansion, typed connections, selection and camera recovery.
3. **Call journey:** implement correlated request/result, explicit retry and concurrent-child examples. Add route inspection and a synchronized timeline without losing current payload inspection.
4. **Time exploration:** compare the ordinary timeline with pinned moments and a shallow time-slice experiment. Keep only interactions that remain understandable.
5. **Production bridge:** after the visual direction is reviewed, map supported real records into the shared model, resolve the data/privacy gaps, then integrate into the VS Code webview. Do not describe prototype behavior as shipped product behavior.

These are logical phases, not a ready-to-import workflow. If using AgentBoard Run a Plan, generate its JSON against the current local schema and validate it. Assign explicit file ownership, preserve shared-state dependencies and use the native review/check mechanisms; do not copy an older incompatible orchestration format.

## Acceptance criteria

- The existing Station Observatory remains the recognizable starting point; its working inspection and accessibility controls are preserved.
- A parent and its children can be expanded, focused and collapsed without a constantly rearranging scene or loss of the selected event.
- Delegation, observed communication and shared-resource association are visually and textually distinct. Missing/unknown links are not fabricated.
- Every visible request/result signal corresponds to an identifiable event. A selected call opens its actual synthetic input/output and, after integration, only the permitted source detail.
- Errors, API calls, shell results, file reads/edits, agent handoffs and plan updates are independently inspectable.
- Historical inspection does not jump when new data arrives. New-event indication and Return to live work; all views agree on selection and time.
- A later success does not remove prior error evidence. Missing durations and payloads are shown as unavailable rather than invented.
- Mouse and keyboard can reach equivalent detail. Escape and focus return work; reduced motion removes nonessential motion; narrow views provide readable alternatives to tiny map labels.
- The prototype has reproducible 1-, 6- and 24-session fixtures. Performance and usability results are measured, not assumed from a small attractive demo.
- Relevant tests, visual evidence, limitations and delivery instructions are recorded. Local prototype success, extension-host success and package installation are reported separately.

## Verification and delivery

Start with `node --check docs/ui-exploration/station.js` and `python docs/ui-exploration/verify-station.py`. The browser check requires the already-installed Python Playwright and Edge on this machine; verify availability on another host.

For production changes, run the relevant tests and the repository's current `npm test`, `npm run check`, `npm run browser` and `npm run host`. For a package deliverable, additionally run `npm run package` and `npm run package:check`. Inspect the actual webview, not only generated HTML. Do not rerun unrelated expensive checks just to validate this Markdown handoff.

Deliver the working files, a reviewable demo entry point, test receipts, a short explanation of what is real versus simulated, and any remaining blockers. Nothing in this handoff requests marketplace publication, normal-profile installation or changes to the AgentBoard codebase.

## Avoid repeating the Windows folder-lock failure

This conversation's original temporary worktree was left locked after its work had merged. Persistent Codex tool helpers had inherited the worktree as their cwd. After Robert explicitly requested cleanup, the matching helpers were stopped and the empty directory was removed and rechecked.

Run long-lived test/browser helpers from a stable main-checkout or scratch cwd, close them with reliable teardown, and do not leave servers or browser automation attached to a disposable worktree. Before Finish, verify owned helpers have exited. Never kill unrelated sessions or a shared app-server indiscriminately. The diagnosis is recorded separately in AgentBoard's `docs/plans/2026-11-12-finish-worktree-tool-lock.md`; that is a follow-up in the AgentBoard project, not part of this UI implementation.

## Research references

Use the full research report for evidence and limits. The most relevant primary sources are:

- [3D Force Graph examples and API](https://vasturiano.github.io/3d-force-graph/): expansion, focus, fixed positions and custom geometry.
- [On-demand particle example](https://github.com/vasturiano/3d-force-graph/blob/master/example/emit-particles/index.html): event-triggered signals.
- [Langfuse agent graphs](https://langfuse.com/docs/observability/features/agent-graphs): aggregated versus individual-call views.
- [Hubble service map](https://docs.cilium.io/en/stable/observability/hubble/hubble-ui/): topology plus event ledger.
- [Stately Inspector](https://stately.ai/docs/inspector): actor interactions and sequence diagrams.
- [Rerun playback controls](https://rerun.io/docs/howto/visualization/control-the-viewer): synchronized paused, playing and following-newest states.
- [OpenTelemetry model](https://opentelemetry.io/docs/specs/otel/overview/): explicit parents, spans and causal links.
- [TimeLighting manuscript](https://repositum.tuwien.at/bitstream/20.500.12708/208533/3/Filipov-2024-IEEE%20Transactions%20on%20Visualization%20and%20Computer%20Graphics-am.pdf): temporal-network research inspiring the time-slice experiment.

No external tool was installed or benchmarked in the research. No graph library has been selected. Borrowing an interaction idea does not require adopting the referenced product or infrastructure.
