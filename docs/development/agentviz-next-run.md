# AgentViz execution record

State: prepared, not launched. Baseline: `2a3025b`. The requested workspace/name/ID changes are pending. No AgentBoard root or child card has been allocated by this planning session.

The executable schedule is `workflows/agentviz-next.plan.json`, named **AgentViz: find and follow sessions** in **Run a Plan**. `ORCHESTRATION.md` is the product brief. Use `workflows/checks.json` for named acceptance commands. Native plan steps and model review supply scheduling, acceptance and integration; the former manual orchestrator launch route is superseded.

| Outcome | Status | Board ID | Delivered commit | Acceptance evidence |
| --- | --- | --- | --- | --- |
| S01 workspace and saved names | Implemented, awaiting board review | 8a7300 (plan card a40b39) | `0808321` | `npm test` 31/31, `npm run check` exit 0; see S01 below |
| S02 navigation filters | Implemented, awaiting board review | 153bc7 (plan card a40b39) | `14273a5` | `npm test` 50/50, `npm run check` exit 0, headless Edge 17/17; see S02 below |
| S03 complete catalogue lookup | Implemented, awaiting board review | 6e5778 (plan card a40b39) | `6977d3e` | `npm test` 63/63, `npm run check` exit 0; see S03 below |
| S04 agent lanes | Implemented, awaiting board review | c15df0 (plan card a40b39) | See `git log` on `task/c15df0` (commit titled "feat: show main and subagent lanes (S04)") | `npm test` 71/71, `npm run check` exit 0, local sample 24 families; see S04 below |
| S05 explicit task progress | Implemented, awaiting board review | d5e522 (plan card a40b39) | See `git log` on `task/d5e522` (commit titled "feat: show progress from explicit agent task lists (S05)") | `npm test` 83/83, `npm run check` exit 0; no local list records exist, see S05 below |
| S06 file footprint | Implemented, awaiting board review | b43ef6 (plan card a40b39) | See `git log` on `task/b43ef6` (commit titled "feat: show a file activity footprint (S06)") | `npm test` 95/95, `npm run check` exit 0, local sample 40 + 40 transcripts; Codex not covered locally, see S06 below |
| S07 AgentBoard entry command | Implemented, awaiting board review | aaa089 (plan card a40b39) | See `git log` on `task/aaa089` (commit titled "feat: add a narrow entry command for another extension (S07)") | `npm test` 102/102, `npm run check` exit 0, VS Code host run 13/13 checks; no AgentBoard caller exists, see S07 below |
| S08 reliability and cost | Implemented, awaiting board review | 5df10f (plan card a40b39) | See `git log` on `task/5df10f` (commit titled "fix: harden the combined view and record its cost (S08)") | `npm test` 117/117, `npm run check` exit 0, synthetic benchmark of 3,471 transcripts; not run in a webview, see S08 below |
| S09 Windows acceptance | Implemented, awaiting board review | 72183c (plan card a40b39) | See `git log` on `task/72183c` (commit titled "test: make Windows acceptance repeatable (S09)") | `npm test` 123/123, `npm run check` exit 0, `npm run host` 31 checks (32 with `--clipboard`), `npm run browser` 11/11; Linux, VSCodium and a live AgentBoard caller unverified, see S09 below |
| S10 review and local package | Pending | Not allocated | None | Not run |

Next action: open AgentBoard's **Run a Plan** picker in this workspace, select **AgentViz: find and follow sessions**, inspect the preview and choose Run. This record does not imply that the run is already approved or executing.

For each actual delivery append its owner/worktree, dependency commits, exact checks and exit results, review card/verdict, integration commit, blockers and next action. Keep the current next action concise enough for a replacement orchestrator to resume without replaying chat history.

## S01: Identify workspaces and saved session names

Owner: card `8a7300`, branch `task/8a7300`, AgentBoard worktree. Dependency commit: `66a3d6e`. Code commit: `0808321`. Review and integration: pending, done by the board.

### Observed source shapes (2026-11-12, native Windows, keys and counts only)

No title, path or payload value was printed or saved. The inspection scripts were temporary and are not committed.

| Provider | Source | Shape | Rule used |
| --- | --- | --- | --- |
| Claude | Transcript records, anywhere in the file | `{type:"custom-title", customTitle, sessionId}` and `{type:"ai-title", aiTitle, sessionId}` | Latest custom title wins; otherwise latest generated title |
| Claude | Any early record | top-level `cwd` string | First `cwd` in the first 64 KB is the workspace |
| Codex | `<codexRoot>/session_index.jsonl` | `{id, thread_name, updated_at}`, all strings, appended | Last line written for an ID wins; ID compared without case |
| Codex | Rollout `session_meta` record | `payload.cwd`, `payload.id` | `cwd` is the workspace; `payload.id` equals the UUID in the file name |

Counts behind those rules: in the 60 newest Claude transcripts, 1,210 custom and 543 generated title records, repeated through each file (latest seen at line 3,056), so a header preview is not enough. In the 80 newest, every title `sessionId` equalled the file name, and no subagent transcript had a title. The Codex index had 1,023 lines for 519 IDs (192 IDs repeated, one `updated_at` out of order). In the 80 newest rollouts all 80 file-name IDs equalled `session_meta.id`; 15 were in the index; none of 34 child rollouts were. Rollouts hold no title record: `thread_settings_applied` has no name key.

### What changed

- `src/transcript.js`: `sessionTitle` (one line, 80 characters, control and direction-override characters removed), `workspaceIdentity` (opaque `ws:` key), `UNNAMED_SESSION`.
- `src/sessions.js`: discovery adds `workspaceKey`, `workspaceLabel`, `name`, `nameSource` (`custom`, `generated`, `index`, `none`). `project`, `id` and the full `sessionId` are unchanged. Claude titles are scanned incrementally per transcript; the Codex index is opened read-only.
- `src/extension.js`: the message whitelist is one function that re-cleans those fields. First selection matches an open folder by directory key instead of basename.
- Workspace keys: Windows drive and UNC paths ignore case and separator style; every other path is compared exactly, so `/home/dev/Example` and `/home/dev/example` stay separate. Nothing launches Linux.
- Labels: directory name, plus one parent on a collision, plus a key fragment if still equal. Never a drive, root or more than two segments.

### Checks (run in the worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `npm test` before the implementation | exit 1: 31 tests, 21 pass, 10 fail (the new S01 tests) |
| `npm test` at `0808321` | exit 0: 31 tests, 31 pass, 0 fail |
| `npm run check` at `0808321` | exit 0 |

Regressions added (12): in `test/sessions.test.js`, Claude custom/generated precedence; late rename past the 64 KB preview with a split UTF8 write, quoted and nested decoys and a rewrite; Codex index lookup with repeats and corrupt lines; missing and corrupt metadata for both providers; hostile titles; duplicate basenames with Windows and POSIX case rules; read-only discovery. In `test/transcript.test.js`, title cleaning and workspace identity. In `test/extension.test.js`, the exact whitelist with private sentinels, and folder matching by directory. The read-only test passed before the change too; it guards the behaviour and does not prove a fix.

Local compatibility sample (counts only, real roots, read-only): 80 of 3,582 sessions returned in 574 ms, then 481 ms on a repeat. Sources: Claude 33 custom, 13 generated, 3 none, 16 unnamed children; Codex 5 index, 10 none. 34 workspaces with 34 distinct labels, none unknown, no label with a drive or root, no control characters, longest name 57.

### Gaps and limits

- The webview receives the new fields but `media/app.js` does not display them yet. That is S02; nothing was verified in a browser or a VS Code host in this step.
- Names and workspaces are read only for the sessions returned under the existing 80 session cap. Labels are disambiguated within that returned set, so a label can change as sessions enter or leave it; keys do not. S03 owns lookup before the cap.
- "Last index line wins" matches the appended file but was not checked against Codex source. One real line was out of `updated_at` order.
- Codex child rollouts and Claude subagent transcripts have no stored title and show `Unnamed session`.
- Disclosed limits: a title record over 64 KB is ignored; at most 256 MB of Claude transcript is scanned for titles per discovery, with a warning and continuation on later refreshes; only the newest 8 MB of the Codex index is read, with a warning; a first record over 64 KB leaves the workspace unknown.
- Scan positions are cached in memory per transcript path. A rewrite that keeps the same size and modified time is not detected until the file grows.
- Linux and VSCodium were not run. The Linux path rule is covered by unit tests on Windows only.

Next action at the end of S01: board review of `task/8a7300`, then S02 (now done, below).

## S02: Add workspace, name and ID filtering

Owner: card `153bc7`, branch `task/153bc7`, AgentBoard worktree. Dependency commit: `f8d0d20` (S01 integrated). Code commit: `14273a5`. Review and integration: pending, done by the board.

### What changed

- `src/webview.js`: a labelled search region in this order: Project / workspace, Session name, Session ID (optional), Clear filters, Session. Below it, a followed-session bar: project, name, full ID, Copy ID, provider. All native controls, no `tabindex`. The CSP is unchanged.
- `media/view.js`: pure functions `filterSessions`, `navigate`, `workspaceChoices`, `idLabels`, `sessionLabel`, plus `demoCatalogue` and `demoIdentity`. The heading now reads workspace, name, full ID, provider.
- `media/app.js`: the controller. Filters run in the view over the catalogue the host sends.
- `media/style.css`: the filter grid (four columns, two under 850px, one under 480px), the bar, wrapping for long IDs and names.
- `src/extension.js` was not touched. No new host message.

### Behaviour

- Name and ID match case insensitively as a substring, after trimming. They intersect with the chosen project. The ID filter searches the complete ID, not the visible prefix.
- Each session reads `workspace › name · ID · provider · time`. The ID shows eight characters, or more when another listed ID shares them, so duplicate names stay distinct.
- **Excluded selection: preserved, explicitly.** If the filters hide the followed session, the host keeps following it and the view keeps showing it. The bar still names its project, name and full ID and adds "Hidden by the current filters. Still followed until you choose another session." The Session list shows a placeholder, "Followed session is hidden by these filters", not the first match. Nothing is sent to the host. Only choosing a listed session moves the selection.
- With no matches the Session list is disabled and says so; the status line gives the count and points to Clear filters.
- A snapshot is drawn only when its provider and ID equal the selected entry. Otherwise the view shows the selected identity with "Loading history".
- Background refreshes never write the inputs. An option list with the same sessions in the same order is updated in place, not rebuilt.
- Escape empties the focused filter. Clear filters resets all three and moves focus to the name search.
- Copy ID uses `navigator.clipboard`, then `execCommand('copy')`, then selects the ID and asks for Ctrl+C. The status never says "copied" unless a copy call succeeded.
- Example mode with a host: the bar and heading name the synthetic example, never the real selection; the filters still act on the real list; choosing a session returns to live. Without a host the page runs on a six-session synthetic catalogue.
- Saved through `setState`: `example`, `workspaceKey` (opaque), `workspaceLabel`, and the name and ID filter text, each cut to 200 characters. Restored values are type checked and the key must match the `ws:` pattern. No catalogue, selection or activity is saved. A saved project that is not in the current list stays chosen and is labelled "(not in the current list)".

### Checks (worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `npm test` with the new tests, before the implementation | exit 1: 50 tests, 31 pass, 19 fail (all 19 are the new S02 tests) |
| `npm test` at `14273a5` | exit 0: 50 tests, 50 pass, 0 fail |
| `npm run check` at `14273a5` | exit 0 |
| `node browser-evidence.js <worktree> <outDir>` (ad hoc, headless Microsoft Edge over the DevTools protocol, isolated profile) | exit 0: 17 of 17 checks |

Regressions added (19). In `test/view.test.js` (7): filter intersection with case and whitespace; exact and partial IDs past eight characters; duplicate names; project choices and equal labels; excluded selection and clearing; heading order, hostile title and the loading state; the example catalogue. In `test/navigation.test.js` (12), which runs the real `media/app.js` against the markup from `src/webview.js` on a stand-in DOM: labels and control order; filters together; excluded selection; mismatched snapshot; focus and typed text across refreshes; Clear and Escape; Copy ID with both fallbacks; hostile text; example mode; no-host mode; persistence; narrow-viewport style rules. `test/navigation-fixture.js` holds the synthetic catalogue.

### Evidence

Screenshots, a DOM extract, the result file and the script are in `artifacts/s02/` of the main checkout and of this worktree. That folder is git-ignored, so it is local only. All data in it is synthetic.

The Edge run covered, with real key events: Tab order (Refresh, example, project, name, ID, Session, Copy ID); accessible names; typed name search; an ID fragment past eight characters excluding the selection; ArrowDown selecting a match; Enter on Copy ID with the clipboard read back as the full ID; Escape; Clear filters; no matches; no horizontal scroll and all controls inside the viewport at 360px and 600px; hostile titles as text with zero `img` elements; focus, text and caret kept across three refreshes; no console errors or CSP violations.

### Gaps and limits

- Not run in a VS Code webview or development host. The Edge page loads the same HTML, CSS and scripts from `file:` URLs with a stand-in for the VS Code API. Clipboard access inside a real webview is unverified; the fallbacks exist for that case. S09 owns host acceptance.
- Filters only see the sessions the host lists, still capped at 80. The status line says "listed". An older project or ID cannot be found yet. S03 owns lookup before the cap.
- The host cannot be told to stop following a session, so an excluded selection is preserved, not cleared.
- After a selection change, one host message already in flight can show the previous session for one refresh. It is shown under its own label, never under the new one.
- The stand-in DOM test proves controller logic, not layout. The style test checks that the narrow rules exist; the measured layout evidence is the Edge run, which is not part of `npm test`.
- Contrast and screen reader output were not measured. Linux and VSCodium were not run.
- The option time is still a clock time without a date.

Next action at the end of S02: board review of `task/153bc7`, then S03 (now done, below).

## S03: Make discovery and selection cover the requested project

Owner: card `6e5778`, branch `task/6e5778`, AgentBoard worktree. Dependency commit: `ac51695` (S02 integrated). Code commit: `6977d3e`. Review and integration: pending, done by the board.

### What changed

- `src/sessions.js`: `discoverSessions(roots, options)` is the host query contract. `options` is a number (the old cap) or `{ limit, query: { workspaceKey, name, id }, keep, walk }`. Order of work: list every transcript, read the project of each, build the project groups, filter by project and ID, filter by saved name, then cut to `limit`. It returns `sessions`, `kept`, `workspaces`, `total`, `matched`, `limit`, `pending`, `warnings`, plus host-only `all`, `walk` and `cost`.
- `src/extension.js`: takes numbered `query` messages (and a query with `ready`), cleans them, and answers with `lookup: { seq, total, matched, limit, pendingNames, pendingWorkspaces, missing }`, a whitelisted `workspaces` list and the followed session as `selected`. `select` is checked against every session of the current source, not the returned list.
- `media/app.js`: every filter change asks the host. The project selector uses the host groups. The status line states lookup, limit and unread parts.
- `media/view.js`, `src/webview.js` and `media/style.css` were not touched. The states use the existing status line, picker placeholder and identity bar.

### Behaviour

- **Filtering precedes the cap.** A project, a full or partial ID, or a saved name is matched over all sessions. Only the matches are cut to 80, newest first. `matched` and `total` are never cut.
- **Project groups are independent of the list.** Every project found is listed with its session count, whatever the filters or cap. Labels are disambiguated across all projects, so they no longer shift as sessions enter or leave the recent 80.
- **Names are read only when needed.** Without a name filter, only the returned sessions and the followed one have their titles read. A name filter reads titles for every candidate, at most 256 MB per call, and continues on the next one-second pass.
- **Stale answers.** The view numbers its requests. The host drops a lookup whose filters, source or selection changed while it ran, and asks again. The view drops any answer that does not carry its newest number. A request numbered at or below the newest is ignored by the host.
- **Followed session.** It is looked up by its stable ID on every lookup (`keep`) and sent on its own, so a rename, new activity or moving out of the returned list changes nothing but its label. The transcript reader is not recreated on an ordinary refresh. A deleted transcript stays named, is reported as "no longer in the source folders", is not read and is not replaced by another session. If the same file returns it is followed again.
- **Restored selection.** A saved selection is found in the whole source, so an older session is restored after a reload.
- **Visible states** (status line under the filters): "Looking up sessions…" until the current request is answered; "N sessions found. Showing the 80 most recently written. Choose a project or narrow the search to reach older ones."; "M of N sessions match."; "Still reading saved names in K sessions; more matches may appear."; "Still reading projects for K sessions."; "No sessions match yet." while names are unread. The same limits are also host warnings.
- Unchanged: malformed and oversized record counts, sampled rewrite recovery, partial UTF8 and pending JSON in `TranscriptReader`. Its code was not edited and its seven tests pass.

### Measurements (2026-11-12, real local roots, read-only, counts and timings only)

No title, label, path or ID was printed or saved. The scripts were temporary and are not committed.

| Step | Result |
| --- | --- |
| Folder listing, 3,600 transcripts | about 0.6 s |
| Opening every transcript for its first records, uncached | 2.5 s, 220 MB |
| All Claude transcripts (what a full name read covers) | 7.2 GB |
| New code, first three calls (1,500 project reads per call) | 1.6 s, 1.9 s, 1.8 s; pending projects 2,097, 597, 0 |
| Ordinary refresh after that, fresh listing | 0.5 to 0.9 s, 0 to 4 transcripts opened (the ones being written) |
| New filter on a reused listing (one project, or a full ID) | 38 ms, 1 match of 3,598, 0 to 2 opened |
| Oldest session: in the recent 80? found by full ID? | no; yes |
| Name search over all projects, cold | 28 calls of 256 MB, about 42 s in total, pending count falling to 0 |
| Same name search again | 38 ms, nothing reread |
| Projects found | 947, all labels distinct, none with a drive or root |

These are the reason for the two caches. Before this step each 10-second scan opened all 80 listed transcripts. Covering all 3,600 that way would cost about 2.5 s per scan, so a transcript whose size and modified time are unchanged is not opened. A new filter within 10 seconds reuses the folder listing (0.6 s saved per keystroke). Nothing else is cached.

### Checks (worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `npm test` with the new tests on the previous sources (`ac51695`) | exit 1: 63 tests, 50 pass, 13 fail (all 13 are the new S03 tests) |
| `npm test` at `6977d3e` | exit 0: 63 tests, 63 pass, 0 fail |
| `npm run check` at `6977d3e` | exit 0 |

Regressions added (13).

- `test/sessions.test.js` (5, real files in a temporary folder): a project older than 85 newer sessions, with groups, counts, duplicate basenames and a cap smaller than the matches; full ID, partial ID past eight characters, names of both providers outside the recent list, intersection and no matches; rename and deletion with `kept`; read cost (no reopen when unchanged, only appended bytes, names read once, reused and stale listings); pending projects and names completing over calls with no byte read twice.
- `test/extension.test.js` (4): query cleaning, `keep`, listing reuse, late and repeated request numbers, whitelisted groups and private sentinels; lookups overtaken by newer filters and by a new source; following an older session by ID, unknown IDs, rename, reordering, deletion and return with one reader; a restored older selection.
- `test/navigation.test.js` (4): numbered trimmed requests and the query sent with `ready`; stale answers dropped and the lookup state shown; host project groups with equal labels; the followed session outside the answer, limit, unread and deleted states.
- The S02 navigation harness now includes a stand-in host that answers each request. The 12 S02 tests are otherwise unchanged and pass.

### Evidence

- Tests and their fixtures are in `test/`. All fixture data is synthetic.
- Measurements are the table above. There are no screenshots for this step.

### Gaps and limits

- **Not run in a browser or a VS Code host.** The new states are proven by the controller tests on a stand-in DOM only. S09 owns host acceptance.
- A cold name search across all projects took about 42 s here. Matches and a falling "still reading" count appear during it. Each pass holds the refresh loop for 0.3 to 12 s, so activity updates pause for that long.
- The first project read takes three passes (about 5 s here). Until it ends, a project filter cannot see unread sessions; the status line gives the count.
- Disclosed limits: 80 returned sessions; 1,500 first project reads per call; 256 MB of title reading per call; the S01 limits (64 KB title record, 64 KB first-record preview, 8 MB Codex index) still apply.
- A filter typed within 10 seconds of the last folder listing does not see a transcript created since then. The next listing (at most 10 s later, or Refresh) does.
- A transcript rewritten to a larger size is treated as appended to, so its project and earlier titles can be stale until it shrinks or is replaced. A same-size rewrite with the same modified time is not detected. Both follow from not reopening unchanged files.
- A deleted followed session still shows "Loading history" in the activity area, next to the correct "no longer in the source folders" note and warning. That text is in `media/view.js`, outside this step.
- The name filter matches the literal `Unnamed session`, as in S02.
- 947 projects make a long selector here; there is no search inside it.
- Subagent transcripts are read for names although none had a title in the S01 sample. Skipping them would roughly halve the cold name search; not done, because the sample is not proof.
- Linux and VSCodium were not run.

Next action at the end of S03: board review of `task/6e5778`, then S04 (now done, below).

## S04: Show main and subagent lanes

Owner: card `c15df0`, branch `task/c15df0`, AgentBoard worktree. Dependency commit: `95e5ca1` (S03 integrated). Code commit: the commit on this branch titled "feat: show main and subagent lanes (S04)". Review and integration: pending, done by the board.

### Observed source mapping (2026-11-12, native Windows, keys and counts only)

No ID, label, path, prompt or payload value was printed or saved. The probe scripts were temporary and are not committed.

| Provider | Fact | Source | Counts behind it |
| --- | --- | --- | --- |
| Claude | Child transcript location | `<project>/<sessionId>/subagents/agent-<agentId>.jsonl`, and `subagents/workflows/<run>/agent-<agentId>.jsonl` for workflow agents | 1,218 plain and 384 workflow files |
| Claude | Child names its session and itself | every child record has `sessionId` (the parent session) and `agentId` (equal to the file name) | 148 of 150 newest children; 2 had no records |
| Claude | Link record | `agent-<agentId>.meta.json`: `agentType`, `toolUseId`, `parentAgentId`, `finished`, `spawnDepth` (plus `description`, never read out) | present for 341 of 341 children in 40 sessions |
| Claude | Parent's spawn | `Agent` tool call; its result record has `toolUseResult.agentId` and `status` `async_launched` or `completed` | 242 of 242 `meta.toolUseId` values matched a main-transcript call and the same agent ID |
| Claude | Nested child | `meta.parentAgentId` names another child; `meta.toolUseId` is a call in that child's transcript | 8 of 8 |
| Claude | End of a background agent | text starting `<task-notification>` with `<task-id>` and `<status>` (`completed`, `failed`, `stopped`), repeated in `queue-operation`, `attachment` and `user` records | 244 of 256 background agents had at least two copies; 12 had none |
| Claude | End of a waited-for agent | the result record itself: `status: completed`, or `is_error` with no agent ID | 10 completed, 7 failed |
| Claude | Workflow agents | no `toolUseId` and no agent ID in the main transcript | 90 of 90 |
| Codex | Child names its parent | `session_meta.payload.source.subagent.thread_spawn.parent_thread_id` in the child's first record; also `depth`, `agent_nickname`, `agent_role` | 54 children in 200 rollouts, 7 at depth 2; every parent rollout was found by ID |
| Codex | Forked child | `forked_from_id` equals the parent; 22 of 45 repeat the parent's `session_meta`; copied calls keep the parent's call IDs | 47 of 56 sampled lanes held copied calls |
| Codex | Parent's spawn | `spawn_agent` call whose output is `{task_name}`: no child thread ID | 145 of 146 |
| Codex | Parent's record of a child | `event_msg.sub_agent_activity {agent_thread_id, kind}`, rare | 15 records |
| Codex | End of a child | **not recorded by the parent.** The child's own `task_complete` / `turn_aborted` are turn ends | 439 started, 396 complete, 52 aborted in children |

### What changed

- `src/transcript.js`: each transcript keeps a host-only `lifecycle` (spawns by call ID, agents by agent ID, the first end notice per agent), `startedAt`, and for children `parent`. A task notification delivered as a user record is no longer counted as a user prompt.
- `src/sessions.js`: `FamilyReader` (same constructor and `read` as `TranscriptReader`). It reads the followed session, finds its subagent transcripts in the existing folder listing, reads each incrementally and returns the session state plus `family: { lanes, found, limit, eventLimit, notes }`. Discovery marks Codex children and workflow agents as `child`. `TranscriptReader.read` takes an optional byte limit.
- `src/extension.js`: one `FamilyReader` per followed session, given the host-only list of source files. Nothing else changed in the host; the catalogue whitelist is untouched.
- `media/view.js`: `familyLanes`, `familyEvents`, `laneCounts`, `laneFacts`, `laneAxis` and an "Agent lanes" panel between the stations and the strip. The example session has a synthetic family.
- `media/style.css`: lane rows, indent by depth, end marks, narrow layout. No inline styles; the CSP is unchanged.
- `media/app.js` and `src/webview.js` were not touched.

### Behaviour

- **Counting rule (one definition everywhere).** The family is the followed session plus the subagent lanes loaded for it. Stations, the two totals, the recent list, the lanes and the strip all cover that family. Each call counts once, in the lane of the agent that made it. Starting a subagent is a call in the parent's lane, never in the child's. The headings and footer state the scope ("MAIN + 3 SUBAGENT LANES" or "FOLLOWED SESSION ONLY").
- **Links are only what is recorded.** Claude: folder location plus the child's own `sessionId`, then `meta.parentAgentId` for nesting. Codex: the child's own `parent_thread_id`. A child whose records name another session is left out and counted in a note.
- **One time axis.** From the first to the last time any lane recorded. Main first, children under their parent in order of first record, indented by depth.
- **Boundaries.** Start is the child's first record, or "Launch recorded by parent" when there is no child transcript. End is a parent-recorded report with its time ("Completed/Failed/Stopped … (reported to parent)"). `finished` without a time reads "Marked finished; end time not recorded". Otherwise "No end recorded" with the last record time. A duration is shown only between two recorded times. A dashed end mark means "last record", a solid one a recorded end.
- **Deduplication.** Repeated spawn results and repeated end notices change nothing; the first notice wins. A call ID the parent also holds (forked history) is not counted in the child; the lane says how many were left out. A repeated lane key is drawn once.
- **Cycles and missing parents.** Parent walks stop at a repeat or an unknown parent. Such lanes go under the followed session and say "Parent lane not loaded". A Codex loop terminates through a visited set.
- **Missing child files.** A child the parent recorded with no transcript gets a lane saying "Transcript not found (deleted, moved or not written yet)", with the parent's launch time and no calls.
- **Following a subagent.** Its own descendants are shown; a note says its parent and siblings are not.
- **Selection and cleanup.** A new selection, Refresh or a source change drops the reader and all its child readers. Children that leave the listing are dropped. No file handle is held between reads. An unchanged, fully read child is not reopened (one `stat` per child per pass).
- A child's task text arrives as a "Task received" marker, not a prompt.

### Disclosed limits

- 24 subagent lanes, most recently written first; the note gives "N of M" and says totals cover the lanes shown.
- 2,000 newest events per subagent lane; omitted counts are shown per lane and in the notice.
- 200 newest Claude subagent link records checked per listing; 64 KB per link record.
- 24 MB of subagent transcript read per pass; lanes still loading say "Loading history".
- Membership is recomputed per folder listing (every 10 s), so a new child appears up to 10 s late and can briefly show as "not found".
- Copied-call detection uses the parent's retained calls (latest 10,000 events).

### Checks (worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `npm test` with the new and changed tests on the previous sources (`95e5ca1`, extracted with `git archive`) | 71 tests, 55 pass, 16 fail: the 8 new S04 tests, plus the 8 existing host tests, whose test double now provides `FamilyReader` |
| `npm test` on this branch | exit 0: 71 tests, 71 pass, 0 fail |
| `npm run check` on this branch | exit 0 |
| Local compatibility sample (temporary script, real roots, read-only, real `FamilyReader` and view) | exit 0; see below |

Regressions added (8). `test/family.test.js` (7): parent lifecycle capture with repeated metadata, failure and notice-is-not-a-prompt; a Claude family with nested, overlapping, workflow and missing children, attribution, lifecycle, one counting rule and privacy sentinels; repeated reads, reopen cost and appended child work; missing files, cycles, unknown parents, foreign transcripts and a deleted child; selection change, a followed subagent and the lane limit; a Codex family with a forked child, nesting, a missing child and a parent loop; lane facts, the shared axis, hostile labels and the single-lane state. `test/extension.test.js` (1): the host passes the source list, forwards lanes, starts a new reader on selection and stops on disposal.

### Local compatibility sample (2026-11-12, counts only)

3,621 transcripts listed. The 12 newest families of each provider were read to the end with the real reader and drawn with the real view.

| | Claude | Codex |
| --- | --- | --- |
| Families / child lanes | 12 / 94 | 12 / 56 |
| Station total equals sum of lanes, no call ID in two lanes | 12 of 12 | 12 of 12 |
| Snapshots containing a path-like string | 0 | 0 |
| Lanes with a recorded end and time | 80 (79 completed, 1 failed) | 0 (parents do not record one) |
| Lanes with no recorded end | 14 | 56 |
| Lanes linked by a parent's spawn record / by the child's own records only | 89 / 5 | 3 / 53 |
| Lanes with calls copied from the parent, not counted | 2 | 47 |
| Nested lanes (depth 2) | 0 in this sample | 7 |
| Slowest first load / unchanged re-read | 1.2 s / 69 ms | 59 s / 1.5 s (see gaps) |

One Claude family exceeded the lane limit and one had parent-recorded children without transcripts; both notes appeared.

### Evidence

- `artifacts/s04/` in this worktree (git-ignored, local only): `lanes-synthetic.html` and `lanes-synthetic-desktop.png` (the synthetic example family drawn by the real view and stylesheet, headless Edge, 1280 px), `lanes-synthetic.txt` (lane facts and the three equal totals), `local-compatibility-sample.txt` (the counts above).
- Tests and synthetic fixtures are in `test/family.test.js`.

### Gaps and limits

- **Not run in a VS Code host.** The panel was drawn in headless Edge from static HTML only. The narrow screenshot was not captured; the narrow rule is in the stylesheet and untested in a browser. S09 owns host acceptance.
- **Codex ends are unavailable.** Every Codex lane reads "No end recorded", with its own last turn state when it has one.
- **Background Claude agents with no notice** (12 of 256) and all workflow agents show no end, or "Marked finished; end time not recorded".
- **Large Codex families load slowly.** The slowest took 59 s to load fully (8 MB per transcript and 24 MB of children per pass) and its "unchanged" re-read was 1.5 s because it was still loading after 40 passes. Activity updates pause during each pass. S08 owns cost.
- Nested Claude lanes were verified on 8 real link records in the probe and on synthetic data, but none fell in the 12-family sample.
- A lane beyond the 24-lane limit is not read, so its calls are in no total. The note says so.
- A forked child of a parent with more than 10,000 retained events can count copied calls older than that.
- Copied prompts in a forked Codex child appear as "Task received" markers. Markers are not counted as calls.
- `agentType` (Claude) and the Codex nickname or role are shown as lane labels, cleaned and cut to 40 characters. They are stored provider metadata, not prompts; `description` and `agent_path` are never read out.
- The status pill still describes the followed session's own turn; "Quiet" now uses the latest record of any lane.
- Contrast and screen reader output were not measured. Linux and VSCodium were not run.

Next action at the end of S04: board review of `task/c15df0`, then S05 (now done, below).

## S05: Show progress from explicit agent task lists

Owner: card `d5e522`, branch `task/d5e522`, AgentBoard worktree. Dependency commit: `b233c9e` (S04 integrated). Code commit: the commit on this branch titled "feat: show progress from explicit agent task lists (S05)". Review and integration: pending, done by the board.

### Headline: no supported list record exists in the local transcripts

The local sources hold **no** structured task list record of either provider. The parsers below are therefore built from the providers' published tool definitions and tested on synthetic records only. They have not been run against a real list record.

### What the local sources hold (2026-11-12, native Windows, names and counts only)

No label, path, prompt or payload value was printed or saved. The probe scripts were temporary and are not committed.

| Provider | Looked for | Scanned | Found |
| --- | --- | --- | --- |
| Claude | `TodoWrite`, `TaskCreate`, `TaskUpdate` tool calls | 2,407 of 2,416 transcripts in the default folder (6.2 GB, September to November 2026; 9 over 80 MB skipped) | 0 |
| Claude | the same, in the other local account folders | 1,190 of 1,192 transcripts | 0 |
| Claude | any `"todos":[` key | the same 2,407 | 0 |
| Codex | `update_plan` as a structured `function_call` or `custom_tool_call` | 1,191 of 1,209 rollouts (6.0 GB; 18 over 80 MB skipped) | 0 |
| Codex | `plan_update` event, `todo_list` item | the same 1,191 | 0 |
| Codex | the text `tools.update_plan(` inside an `exec` call's program text | the same 1,191 | 3 calls, all in main rollouts |

The probe did run: the same call pattern found `TaskStop` calls in 73 Claude transcripts and `followup_task` calls in 94 Codex rollouts, and 1,052 of the 1,190 account transcripts held some tool call.

Why Claude has none: the published page says the task tools are on by default only for Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 and earlier models; newer models need an opt-in. The local sessions use newer models.

The three Codex calls: the argument is a JavaScript object literal (not strict JSON) in a program that also calls other tools. Their output is a list of text parts that does not say which nested call was accepted. No separate plan record follows. Program text is not a record of an accepted plan, so it is **counted and not read**.

### Schemas used (provider definitions, read 2026-11-12)

| Form | Source of the definition | Fields read | Fields never read |
| --- | --- | --- | --- |
| Claude `TodoWrite` | `code.claude.com/docs/en/agent-sdk/typescript` (`TodoWriteInput`) | `todos[].content`, `todos[].status` (`pending`, `in_progress`, `completed`). Whole list on every call. No IDs, so the ID is the position | `activeForm` |
| Claude `TaskCreate` | same page (`TaskCreateInput`, `TaskCreateOutput`) and `.../agent-sdk/todo-tracking` | input `subject`; result `task.id` | `description`, `activeForm`, `metadata` |
| Claude `TaskUpdate` | same (`TaskUpdateInput`, `TaskUpdateOutput`) | input `taskId` (also `id`, `task_id`, the documented near misses), `status` (adds `deleted`), `subject`; result `success` | `description`, `owner`, `metadata`, `addBlocks`, `addBlockedBy`, `error` |
| Claude `TaskList` | same (`TaskListOutput`) | result `tasks[].id`, `subject`, `status`. Whole list | `owner`, `blockedBy` |
| Codex `update_plan` | `openai/codex`, `codex-rs/protocol/src/plan_tool.rs` (`UpdatePlanArgs`) | `plan[].step`, `plan[].status` (`pending`, `in_progress`, `completed`). Whole list, position as ID | `explanation` |

The envelopes around them are the ones verified on local data in S01 to S04 for other tools: a `tool_use` part in an assistant record, `toolUseResult` on the answering user record, a Codex `function_call` with JSON `arguments` and its `function_call_output`.

### What changed

- `src/transcript.js`: each transcript state has `progress` (null until a list record is accepted): `{ source, items: [{ id, status, label }], omitted, unread, unmatched, unreadable, updatedAt }`. `source` is `claude-todos`, `claude-tasks`, `codex-plan`, or empty when only unread code calls were seen. Host-only bookkeeping (`tasks`) is not serialised.
- `media/view.js`: `progressFacts` and a "Task list progress" panel under the context window. The example session has synthetic lists.
- `media/style.css`: the panel, bar, current item and subagent rows. No inline styles; the CSP is unchanged.
- `test/progress.test.js`: new.
- Not touched: `src/sessions.js`, `src/extension.js`, `media/app.js`, `src/webview.js`. The followed session's `progress` reaches the view through the existing snapshot spread.

### Behaviour

- **Only accepted records count.** A list call is held until its result record arrives. An error result, `success: false` or a missing result changes nothing. A Codex call counts only after its output record, and not if that output reports a failure.
- **Replacement lists** (`TodoWrite`, `update_plan`, `TaskList`) replace the whole list. **Task records** build one list by task ID: create adds `pending`; update changes status or label; `deleted` removes.
- **Duplicates.** A call ID is applied once. A repeated older record cannot bring back an older list.
- **Compaction and turn end** do not change the list. An ended or interrupted turn with open items reads "The last turn ended with N listed items still open."
- **Absent list.** "Unavailable", with the supported forms named and "Tool activity is not used to estimate progress." An explicit empty list reads "The recorded list is empty", not unavailable.
- **Rendered:** completed/total as text and a bar, counts in progress and not started, up to three current items with their IDs, the source form and last list record time, and "This is the agent's own plan, not independently measured project completion."
- **Labels.** One line, 80 characters, control and direction-override characters removed (`sessionTitle`), escaped at the display boundary. They appear only inside the progress area; a test removes that area and checks no label is left.
- **Statuses** outside the three known words are shown as "a status this view does not recognise" and never counted as completed.
- **Main and subagent lists are separate.** No merged total exists. The panel lists each subagent lane's own list under its lane name when the lane carries one. No source field marking a shared list was found, so none is treated as shared.
- **Disclosed counts:** items past 200 per list ("not shown or counted"); updates naming a task this transcript did not create; list records that could not be read; Codex code calls that named the plan tool.

### Checks (worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `node --test test/progress.test.js` with the first 11 new tests on the previous sources (`b233c9e`, extracted with `git archive`) | exit 1: 11 tests, 0 pass, 11 fail |
| `npm test` on this branch | exit 0: 83 tests, 83 pass, 0 fail |
| `npm run check` on this branch | exit 0 |

Regressions added (12, all in `test/progress.test.js`): no list means no progress whatever the tool activity; `TodoWrite` replacement, refused and unanswered calls, empty list; Task create, update, rename, delete, near-miss keys, unsuccessful updates, unknown task, missing ID and `TaskList`; Codex `update_plan` replacement, call without output, failed call, bad arguments and the code-call count; duplicates for all three forms; compaction and an ended turn with open items; hostile and oversized labels, unknown statuses, unsafe IDs and the 200 item cut; the progress area (completed/total, current item, source, disclaimer, labels nowhere else); the unavailable state for both providers; separate main and subagent lists; the real host reader forwarding a list from a file across an appended result; the example list and stylesheet rules. The twelfth (host reader) was added after the baseline run; it needs `progress` and fails without it for the same reason.

### Evidence

`artifacts/s05/` in this worktree (git-ignored, local only, synthetic data): `progress-synthetic.html` and `progress-synthetic-desktop.png` (example session, real view and stylesheet, headless Edge, 1280 px), `progress-unavailable.html` and `progress-unavailable-desktop.png`, `progress-ended-turn.html`, and `progress-synthetic.txt` (the panel text for four states).

### Provider coverage gaps

- **Claude:** supported forms are implemented from the published definitions; **zero local records**, so real-record compatibility is unverified. With the local models the panel reads "Unavailable" for every real Claude session.
- **Codex:** the structured `update_plan` call is implemented from the published definition; **zero local records**. The only local form (3 calls) is program text inside `exec`, which is not read. Every real local Codex session reads "Unavailable", three of them with the code-call note.
- No local compatibility sample was possible for this step. That differs from S01 to S04.

### Other gaps and limits

- **Subagent lists do not reach the view in the host.** The parser builds `progress` for every transcript, and the view draws `lane.progress`, but lane objects are built in `src/sessions.js`, which this step does not own. Until a later step adds `progress` to the lane there, the panel says "Task lists of the N subagent lanes are not loaded in this view." The separate-lists test uses synthetic lanes.
- When one user record answers several calls, `toolUseResult` is not attributed (as in S04). A `TaskCreate` answered that way is counted as unreadable.
- A `TaskUpdate` whose result has no `success` field is applied if the result is not an error.
- Task records written to a task list by another session are unknown here until a `TaskList` result is recorded; updates to them are counted as unmatched.
- Whether a Claude list survives compaction in the product was not observed; the transcript is append-only and the list is kept.
- Not run in a VS Code host. The narrow layout was not verified: headless Edge would not render below about 500 px, so that screenshot was discarded. S09 owns host acceptance.
- Contrast and screen reader output were not measured. Linux and VSCodium were not run.

Next action at the end of S05: board review of `task/d5e522`, then S06 (now done, below).

## S06: Show a file activity footprint

Owner: card `b43ef6`, branch `task/b43ef6`, AgentBoard worktree. Dependency commit: `82dbee6` (S05 integrated). Code commit: the commit on this branch titled "feat: show a file activity footprint (S06)". Review and integration: pending, done by the board.

### Headline

The footprint works on real Claude transcripts and agrees with the stations in every sampled session. **Two gaps:** every local Codex session reads "No file paths are recorded", because local Codex edits are program text inside `exec`; and subagent footprints are built by the parser but do not reach the view through the host yet.

### Counting rule (one definition, stated in the panel)

- Every recorded call counts once at its station, whatever its outcome. This is the S04 rule, unchanged.
- A Files or Edits call either named a file through a recognized structured argument, or it did not.
- **Files station = named read calls + Files calls naming no file. Edits station = named edit calls + Edits calls naming none.** Both sides are taken from the same retained events, so they cannot drift.
- Per file: reads and edits are named calls not recorded as failed. A failed call is listed as failed. A call still waiting for its result counts as recorded.
- A patch call naming several files is one call at the station and one edit for each distinct file.
- The marker "EDITED 3+ TIMES" appears at three recorded, not failed, edits of one file.
- A footprint belongs to one transcript. The followed session and each subagent lane are shown apart and never added together in the list.

### Recognized structured file tools

| Tool | Argument read | Counts as |
| --- | --- | --- |
| `Read`, `read_file`, `view_image` | `file_path`, `filePath` or `path` | read |
| `Edit`, `Write`, `MultiEdit`, `edit_file`, `write_file` | the same keys | edit |
| `NotebookEdit` | `notebook_path` | edit |
| `apply_patch` (Codex custom or function call) | header lines `*** Update File:`, `*** Add File:`, `*** Delete File:`, `*** Move to:` at the start of a line | edit, per distinct file |

Never read for file names: shell commands and their output, `exec` program text, tool results, file contents, patch bodies, prompts. `Grep`, `Glob` and listings name a folder or pattern, so they count as Files calls naming no single file.

### What changed

- `src/transcript.js`: `fileIdentity(path, cwd)`, `fileFootprint(events)`, `FOOTPRINT_FILES` (12). Each transcript state has an enumerable computed `footprint`: `{ files: [{ key, label, reads, edits, failed, shared }], total, reads, edits, readCalls, editCalls, unnamedReads, unnamedEdits, failedCalls, limit }`. It is computed from the retained events when a snapshot is taken. File identity rides on events as a host-only, non-enumerable field; events sent to the view still have exactly five fields. The recorded working directory is kept host-only to resolve relative paths.
- `media/view.js`: `footprintFacts` and a "File activity" panel under Task list progress. The example session has a synthetic footprint counted from its own events.
- `media/style.css`: the panel, list, marker, narrow and high-contrast rules. No inline styles; the CSP is unchanged.
- `test/footprint.test.js`: new.
- Not touched: `src/sessions.js`, `src/extension.js`, `media/app.js`, `src/webview.js`. The followed session's `footprint` reaches the view through the existing snapshot spread.

### Behaviour

- **Identity.** An opaque key `f:` plus 20 hex characters of a hash of the normalized path. Windows drive and UNC paths ignore case and separator style, and the `\\?\` prefixes; every other absolute path is POSIX and compared exactly. `.` and `..` are resolved. A relative path is joined to the recorded working directory; with none recorded it is its own identity and is not guessed to be an absolute one.
- **Label.** At most the last two path segments, each cleaned like a saved title and cut to 40 characters. No drive, root, server or deeper folder. Escaped at the display boundary.
- **Same label, different file.** Both rows stay, and each shows six characters of its key. `shared` is worked out across all retained files, not only the listed ones.
- **Ranked list.** By edits, then reads, then failed, then label. Twelve files are sent; the panel says how many more are counted but not listed.
- **Duplicates.** A repeated call record is counted once (existing call-ID rule).
- **Missing or unusable paths** (absent, empty, not a string, over 2,048 characters, containing a control character) name no file. They stay in the station count and in "named no single file".
- **Retention.** Counts follow the retained 10,000 events exactly. The panel says how many earlier events are outside retained history.
- **Empty state.** "No file paths are recorded in the retained history of this transcript." The generic event labels ("Reading files", "Editing files") are unchanged.
- **Coverage statement**, always shown: recognized structured file tools, retained history of this transcript, shell and program text not seen, labels are two segments.
- **Mismatch guard.** If a footprint does not add up to the events it is shown with, the panel says so.

### Checks (worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `node --test test/footprint.test.js` with the 12 new tests, before the implementation | exit 1: 12 tests, 0 pass, 12 fail |
| `npm test` on this branch | exit 0: 95 tests, 95 pass, 0 fail |
| `npm run check` on this branch | exit 0 |

Regressions added (12, all in `test/footprint.test.js`): repeated reads and edits, ranking and the three-edit marker; duplicate call records for both providers; failed and pending calls, and a call that fails later; Windows, UNC, long-path-prefix, relative and Unix forms, case rules and hostile labels; two files with one label and the key fragment; missing and unusable paths, searches, shell and program text, and the empty state; patch headers, body decoys, a multi-file patch and the JSON-argument form; retention truncation and the twelve-file list; child attribution in the parser and separate lanes in the view, including "not loaded"; agreement with the station totals, the stated rule and the mismatch guard; the real host reader forwarding a footprint from a file with five-field events and no working directory; the example footprint, family-wide agreement and the stylesheet rules. Each test checks the `PRIVATE_` sentinels (paths above two segments, file bodies, patch bodies, code, commands, output) are absent from the state and the page.

### Local compatibility sample (2026-11-12, counts only, read-only)

No label, key, path or payload was printed or saved. The scripts were temporary and are not committed. The 40 newest transcripts under 40 MB of each provider were read to the end with the real `TranscriptReader` and checked with the real view.

| | Claude | Codex |
| --- | --- | --- |
| Transcripts read / unreadable | 40 / 0 | 40 / 0 |
| With at least one named file | 38 | 0 |
| Distinct files | 468 | 0 |
| Named read calls / named edit calls | 466 / 812 | 0 / 0 |
| Files calls naming no file / Edits calls naming none | 304 / 0 | 5 / 196 |
| Failed named calls | 1 | 0 |
| Listed files with the three-edit marker / sharing a label | 94 / 8 | 0 / 0 |
| Transcripts where footprint and stations disagree | 0 | 0 |
| Labels with a drive, root or more than two segments; malformed keys; snapshots with extra event or path fields | 0; 0; 0 | 0; 0; 0 |

Codex call shapes in those 40 rollouts (names and booleans only): 196 `exec` calls whose program text calls `tools.apply_patch(`, none with a patch header at the start of a line; 5 `exec` calls calling `tools.view_image(`. No structured `apply_patch`, `read_file` or `view_image` call.

### Evidence

`artifacts/s06/` in this worktree (git-ignored, local only): `footprint-synthetic.html` and `footprint-synthetic-desktop.png` (example session, real view and stylesheet, headless Edge, 1280 px), `footprint-synthetic.txt` (the panel text and the main-lane sums), `local-compatibility-sample.txt` (the counts above).

### Gaps and limits

- **Codex is not covered on this machine.** Local Codex edits and image reads are JavaScript program text inside `exec`. That text is not a structured file argument, so it is counted as "named no file" and never parsed, as in S05. The structured `apply_patch` parser is tested on synthetic records only.
- **Subagent footprints do not reach the view in the host.** The parser builds one per transcript and the view draws `lane.footprint`, but lanes are built in `src/sessions.js`, which this step does not own. Until a later step adds `footprint: fileFootprint(own)` to the lane there, the panel says "File activity of the N subagent lanes is not loaded in this view" and that the stations also count those lanes. So with subagent lanes, the list covers the main lane while the Files and Edits stations cover the family; the panel's "Of its N Files calls" line is for the main lane only. Child attribution is tested in the parser and with synthetic lanes.
- When that wiring is added, a lane sends only its newest 2,000 events while its footprint would cover all of its own retained events; the mismatch guard is not applied to lane lines.
- The existing event labels ("Reading src/a.js") were not changed. They still take the last two segments without the new cleaning, and a shell event still shows the command's first word.
- A relative path recorded before any working directory, and a Git Bash form such as `/c/Users/...`, get a different key from the same file's Windows path.
- Windows case folding uses JavaScript lower-casing, not the file system's own table. Symlinks, junctions and 8.3 short names are not resolved; nothing touches the disk.
- A file that was moved or renamed is two files. A deleted file is listed as edited.
- "Read" means a read call was recorded, not that the whole file was read. A failed result recorded as text without an error flag counts as a read or edit.
- The key is a truncated hash of a local path. It is opaque but could be matched by someone who already knows the path.
- Not run in a VS Code host. Drawn in headless Edge at 1280 px only; the narrow rule is in the stylesheet and untested in a browser. S09 owns host acceptance.
- Contrast and screen reader output were not measured. Linux and VSCodium were not run.

Next action at the end of S06: board review of `task/b43ef6`, then S07 (now done, below).

## S07: Provide a narrow AgentBoard entry point

Owner: card `aaa089`, branch `task/aaa089`, AgentBoard worktree. Dependency commit: `42dd96c` (S06 integrated). Code commit: the commit on this branch titled "feat: add a narrow entry command for another extension (S07)". Review and integration: pending, done by the board.

### Headline

`agentviz.openSession` works in a real VS Code host on synthetic sessions of both providers. **No AgentBoard caller exists**, so no AgentBoard button was tested; that seam is pending work in the AgentBoard project.

### What changed

- `src/extension.js`: a second command, `agentviz.openSession`, with `cleanTarget` (argument check) and `openSession` (lookup). The panel body moved unchanged into `openPanel`; the `select` message and the command share one `choose` function. `agentviz.open` takes no argument and ignores one.
- `package.json`: activation event `onCommand:agentviz.openSession`. The command is not contributed, so it is not in the Command Palette.
- `README.md`: the command contract with synthetic examples.
- `test/extension.test.js`: seven new tests; the host stand-in now records panels and reveals and can start without a panel.
- `test/extension-host.js`: entry command checks, run only with a synthetic source folder.
- Not touched: `src/sessions.js`, `src/transcript.js`, `media/`, `src/webview.js`. No new webview message.

### Contract

- Argument: exactly `{ provider: 'claude' | 'codex', sessionId }`. `sessionId` is 1 to 128 characters of `A-Z a-z 0-9 _ -`. Any other key, type or character is `invalid-argument`, decided before anything is looked up.
- Lookup: `discoverSessions(roots, { query: { id }, headBudget: 0, titleBudget: 0 })`, the S03 query path. The folders are listed afresh. The exact comparison (provider, full ID, case ignored) runs over the uncut listing, so the 80 session cap does not apply. The transcript path comes only from that listing.
- Result: `{ ok: true, provider, sessionId }`, or `{ ok: false, reason }` with `invalid-argument`, `not-found`, `source-unavailable` or `superseded`. No path, name, project or error text.
- A refused call opens no panel and does not change an open one.
- A panel that is open is reused and revealed. A session the panel has not listed yet makes it list the folders again, so it is not shown as missing.
- Duplicates: the newest call wins; an older one still looking answers `superseded`. The same address again does not reload the session.
- A source setting changed during the lookup answers `superseded`.
- One ID in two transcripts of a provider: a non-subagent transcript first, then the most recently written.
- `source-unavailable` is reported only when the session is not found and discovery warned that this provider's folder is missing or unreadable, or discovery itself failed.

### AgentBoard seam (pending in that project)

The sibling checkout was read only, at `1d4dbf9`. A search of its `src` for `agentviz` and `agent-viz`, ignoring case, found 0 matches; the same search for `executeCommand` found 31 in 6 files, so the search did run. Nothing there calls AgentViz. Pending there: check that `agentviz-local.agent-viz` is installed, map a card to `{ provider, sessionId }`, call the command and handle the four refusal reasons. Nothing was changed, installed or run in AgentBoard.

### Checks (worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `node --test test/extension.test.js` with the new tests on the previous sources (`42dd96c`, extracted with `git archive`) | exit 1: 16 tests, 9 pass, 7 fail (all 7 are the new S07 tests) |
| `npm test` on this branch | exit 0: 102 tests, 102 pass, 0 fail |
| `npm run check` on this branch | exit 0 |
| `Code.exe --extensionDevelopmentPath=<worktree> --extensionTestsPath=<worktree>\test\extension-host.js --user-data-dir=<temp profile> --extensions-dir=<temp folder> --disable-extensions --disable-workspace-trust --skip-welcome --skip-release-notes --new-window <empty folder>`, with `AGENTVIZ_HOST_FIXTURE=<temp fixture folder>` and the profile's `settings.json` pointing both roots at it | exit 0; result file `passed: true`, 13 checks, `notRun` empty, VS Code reports version 1.146.0 |

Regressions added (7, all in `test/extension.test.js`): both providers and a session older than the returned list, on a new and on an open panel, with the provider as part of the address; absent, unknown and partial IDs with and without a panel; an unavailable source (missing folder, unreadable folder, failing discovery) without leaking the cause; 40 malicious arguments (paths, traversal, patterns, extra fields, wrong types, a throwing getter and proxy) that never reach discovery, plus the Command Palette command ignoring an argument; duplicate and out-of-order executions; an open panel that has not listed the session, a setting changed mid-lookup, and reopening a closed panel; real transcript files of both providers through the real `discoverSessions`, with the target outside the 80 returned and a missing Codex folder.

Host run checks (13): the five existing ones (activation, editor opened, reuse, close, reopen), then invalid arguments refused, unknown ID opens nothing, Claude session opens the editor, duplicate execution keeps one editor, Codex session reuses the open editor, no-argument command unchanged, unavailable source reported, reopen after disposal.

### Evidence

`artifacts/s07/` in this worktree (git-ignored, local only, synthetic data): `extension-host-result.json` (the host run receipt) and `baseline-before-change.txt` (the failing run on the previous sources). The host run used a temporary profile, extensions folder and fixture folder outside the repository; the normal editor profile was not used and no extension was installed.

### Gaps and limits

- **No live AgentBoard button was tested**, and no cross-extension call from a second extension: the host test calls the command from the test runner inside the same extension host.
- The host run observes the command's result and the editor tab count. Which session the webview then shows is proven by the unit tests on the host message, not in the real webview. S09 owns that.
- The host test was not run on the previous sources; the failing baseline is the unit run above.
- Each call lists every source folder again (about 0.6 s for 3,600 transcripts in the S03 measurement). It reads no transcript contents. Not measured again here.
- `source-unavailable` depends on the wording of two discovery warnings. The real-file test fails if that wording changes.
- With one provider folder missing, an unknown ID of the other provider is `not-found`. With the folder present but one subfolder unreadable, a session inside it is reported `source-unavailable`, and a truly absent ID is too.
- The command shows no message to the user on a refusal. The caller must.
- A Codex child's subagent status is not read by the lookup, so the tie-break between two transcripts with one ID may not know a Codex child. No such duplicate was observed.
- The command is reachable by any extension in the window and by a keybinding with arguments. It can only select a session already in the configured source folders.
- Linux and VSCodium were not run.

Next action at the end of S07: board review of `task/aaa089`, then S08 (now done, below).

## S08: Check resilience and cost of the combined view

Owner: card `5df10f`, branch `task/5df10f`, AgentBoard worktree. Dependency commit: `9c8d2a0` (S07 integrated). Code commit: the commit on this branch titled "fix: harden the combined view and record its cost (S08)". Review and integration: pending, done by the board.

### Headline

Five defects were found by the new tests and fixed, each with a regression that fails on the previous sources. Cost on a synthetic history of 3,471 transcripts is bounded and every cap that shaped a number is shown in the view. No private sentinel reached a host message or the page. **Not measured:** the cost of the per-second message inside a real webview (S09).

**Scope note for the reviewer.** The card lists `test/` and this record as the work area. The step also says "fix measured problems", so the fixes below are small edits in `src/extension.js`, `src/sessions.js` and `src/transcript.js` (about 30 lines added, 4 removed). Nothing in `media/`, `README.md` or `package.json` changed.

### Findings and fixes

| # | Finding (how it was exercised) | Fix | Regression in `test/resilience.test.js` |
| --- | --- | --- | --- |
| 1 | **Stale answer.** A filter request that arrived while a transcript was being read was answered with the previous list under the new request number. The view accepts an answer by that number, so it could show "No sessions match" or the old matches until the next pass. | `src/extension.js`: the host remembers which request the catalogue answers. A message is numbered for the newest request only when it answers it; otherwise it carries 0 and the view drops it. | "filters asked while a transcript is being read…" |
| 2 | **Reloaded view not answered.** A `ready` from a reloaded view that arrived during a pass did not ask for a new lookup; the old list stood for up to 10 s. Seen once fix 1 was in place (the test timed out). | `src/extension.js`: `ready` marks the lookup and the folder listing as due. | second half of the same test |
| 3 | **One bad date faked activity.** A record dated in year 9999 made the session read "Last record 0s ago / Recent activity" for good and stretched the time axis; the largest valid date put `NaN` in the page. A string that is not a date dropped the record without counting it. | `src/sessions.js`: a timestamp must be a date from 2000 to one day after this machine's clock. Otherwise the record is counted as malformed and adds no activity; its working directory and session metadata are still read. | "records with unusable timestamps…" |
| 4 | **Uncounted malformed lines.** A line holding valid JSON that is not a record (`null`, `123`, a string, an array, `true`) was skipped without being counted. | `src/sessions.js`: counted as malformed. | "malformed and oversized records…" |
| 5 | **Unbounded marker ID.** A prompt, turn-end or compaction marker used the record's `uuid`, `id` or `turn_id` as is. A corrupt record could put megabytes, or an object, into an event ID sent every second. Not a realistic secret path; a bound was missing. | `src/transcript.js`: the ID is used only when it is text of at most 160 characters; otherwise the marker falls back to its time. | "hostile shapes inside well-formed records…" |
| 6 | **Error every second.** A source setting holding a non-text value (a hand-edited settings file: a number, list, object, `true`) made each one-second pass raise "AgentViz could not refresh (ERR_INVALID_ARG_TYPE)". | `src/extension.js`: anything that is not non-blank text means the default folder. | "a source setting that is not usable text…" |

Rows 1 and 2 are one defect in the headline count (the same stale-answer path).

### What was exercised and held without a change

All on real files in a temporary folder, through the real adapters. The host tests run the real `src/extension.js` on a stand-in for the VS Code API.

- **Partial writes.** A record cut inside a multi-byte character, a complete record without its newline, and one byte per write with a read after each: one event, nothing counted as malformed. A write cut off for good is one malformed record and the next record applies.
- **Oversized records.** A complete 5 MB record and one still being written with no newline: each counted once, nothing of them kept, later records apply.
- **Replacement.** Written again under the same name, cut short in place, removed while followed and returned: no old event, task label, footprint, lane or child reader survives. A failed read reports only an error code.
- **Sampled rewrites.** A same-length edit wholly between the first and last 4 KB, followed by an append, is **missed** on ordinary passes. **Refresh recovers it** (the Read becomes an Edit and the footprint follows). The same edit inside the first 4 KB is caught on the next pass. The test also checks that `README.md` still states this limitation.
- **Source change during a read and during a lookup.** Nothing of the old source (IDs, names, project labels, warnings) is in any later message. The old reader is dropped. An old catalogue ID cannot be selected and the entry command answers `not-found` for an old session.
- **Hidden panel.** No folder listing, no read and no message while hidden, with 60 s of host clock passing. On return the same filters and followed session are answered, and what was written meanwhile is read.
- **Disposal and reopen.** Closing during a read and during a lookup: no message, no error, timer cleared, three listeners disposed, no further work. 25 reopen cycles: one panel and one timer per cycle, a new script nonce each time, the followed session restored, only that view's own filters applied, a second open reveals the panel.
- **Filters across updates.** The real `media/app.js` connected to the real host: after new activity, a rename of the followed session and two new sessions, the typed name, the chosen project and the focus are untouched, the inputs were never written, no `select` was sent, and the list shows the rename and the new match only.
- **Obsolete source text in the view.** After a source change the page holds no name, ID or project of the old source, with one deliberate exception: the user's own chosen project filter stays chosen and reads "Work/storefront (not in the current list)" until Clear filters. This is the S02 rule, now recorded as the only leftover.

### Privacy probe of the final host message

Real host, real adapters, one Claude family and one Codex family, with `PRIVATE_` sentinels in prompts, reasoning, commands, command descriptions, tool output, file contents, patch bodies, URL paths, queries and credentials, working directories, source folder names, link-record descriptions, task active forms and index extras. Every message of the run was checked (selection, a filter, a missing session, Refresh).

- 0 of 9 sentinels in any message or in the page drawn from it.
- No drive, UNC, home or temporary folder path, and no transcript or link file name.
- Every field name at every level matches a fixed list in the test; a field added later fails until it is listed.
- Longest text anywhere in a message: at most 200 characters.
- Labels that did get through, all of them: the generic ones ("Running a command", "Searching files", and so on), the last two path segments of a file or search path ("Reading src/checkout.js", "Reading storefront/src"), a host name ("Fetching example.org"), a command's first word ("Running curl"), and an MCP tool's own name.

### CSP and package resource roots

- Panel options: `enableScripts: true`, `localResourceRoots` is the `media` folder only, no `retainContextWhenHidden`.
- Policy: `default-src 'none'; style-src <webview source>; script-src 'nonce-…'; connect-src 'none'; base-uri 'none'; form-action 'none'`. No `unsafe-inline`, `unsafe-eval`, wildcard or remote scheme. Two script tags, both external and carrying the nonce; a new nonce per panel.
- `media/` holds exactly `app.js`, `view.js`, `style.css`. No network call, code evaluation, browser storage, inline style, inline handler or remote URL in them; no `url()` or `@import` in the stylesheet. The page drawn from live and example data has none either.
- `src/` requires only Node builtins, its own files and `vscode`; it writes no file, starts no process and opens no socket.
- `npx --no-install vsce ls --no-dependencies` lists 9 files: `package.json`, `README.md`, the four `src` files and the three `media` files. No test, fixture, document or workflow file. `package.json` has no `dependencies`.

### Cost on a synthetic history (2026-11-12, Windows 11, Node v26.7.0)

`node test/benchmark.js artifacts/s08/benchmark.json`. It writes the fixture to a temporary folder and removes it afterwards. Three runs after the fixes; ranges are across those runs. One run before the fixes is in `benchmark-before.json` and falls inside the same ranges.

Fixture: 3,471 transcripts, 369 MB, 296 projects, 441 subagent transcripts. That is 2,100 small Claude sessions, 300 small children, 1,000 Codex rollouts with an index, 40 Claude transcripts of 5 MB, and one family: a 64 MB main transcript (55,400 calls) with 30 children of 2.1 MB each (54,000 calls).

| Step | Files / events | Bytes read | Elapsed |
| --- | --- | --- | --- |
| Discovery, first three calls (cold) | 1,556 / 1,516 / 471 opened; projects unread 1,971, then 471, then 0 | 281 MB / 90 MB / 2.8 MB | 1.6 to 1.9 s / 1.4 to 1.9 s / 0.6 to 0.7 s |
| Ordinary refresh, fresh folder listing | 3,471 listed, 0 opened | 30 KB (Codex index) | 0.33 to 0.39 s |
| Full ID of the oldest session, reused listing | 1 match, outside the recent 80, 1 opened | 6.5 KB | 15 to 28 ms |
| One project, reused listing | 16 matches, 15 opened | 87 KB | 26 to 33 ms |
| Name search, cold | 2,384 opened, 28 matches, 1 call | 14 MB | 1.7 to 1.9 s |
| Name search, repeated | 0 opened | 30 KB | 17 to 21 ms |
| Following the family, first load | 9 passes; 10,000 of 55,401 main events kept; 24 of 30 lanes | 121 MB | 1.0 to 1.4 s of work; slowest pass 0.28 to 0.35 s |
| Pass with nothing new | 25 files checked, 0 opened | 0 | 6 to 11 ms |
| Pass after an append (101 records) | 2 files | 56,910 in the main transcript, exactly what was appended, plus the child's record | 7 to 15 ms |
| One host message at full retention | 53,225 events (10,000 main, 43,224 in lanes) | 5.5 MB of JSON | 20 to 27 ms to serialise |
| Drawing that message with the real view, in Node | 52 KB of HTML | | 41 to 65 ms |

- **Responsiveness.** Longest stretch the host's event loop was held in any phase: 9 to 42 ms. The Windows timer step is about 16 ms, so values under that are at the floor of the measurement. A pass does not hold a message or a keystroke longer than that.
- **Pacing.** The first cold discovery calls read far more than the project previews because the 80 returned sessions are the large ones here and their names are read whole. In the host, the family's 9 passes are one second apart, so the first load takes about 9 s on the clock while "Loading history" is shown.
- **Memory.** Benchmark process at the end, fixture writing included: 82 to 122 MB heap, 242 to 273 MB resident.

Caps that shaped these numbers, each stated in the view when reached (test "every cap that shapes the view…"): 80 returned sessions; 10,000 retained events per transcript; 24 subagent lanes; 2,000 events sent per lane; 8 MB of the followed transcript and 24 MB of subagent transcripts per pass; 1,500 first project reads and 256 MB of name reading per lookup; 4 MB per record. The benchmark prints the same list beside its results.

No cost fix was made. Nothing measured here needs one, and the one open cost question (first gap below) was not measured where it matters.

### Checks (worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `node --test test/resilience.test.js` with the new tests on the previous sources (`9c8d2a0`, extracted with `git archive`) | exit 1: 15 tests, 10 pass, 5 fail (the regressions for rows 1 and 2, 3, 4, 5 and 6) |
| `npm test` on this branch | exit 0: 117 tests, 117 pass, 0 fail |
| `npm run check` on this branch | exit 0 |
| `node --test test/resilience.test.js`, four times in a row | exit 0 each time, about 1.7 s |
| `node test/benchmark.js artifacts/s08/benchmark.json` | exit 0, three times; 0 sentinels in the message and the page |
| `npx --no-install vsce ls --no-dependencies` | exit 0: 9 files |

Regressions added (15, all in `test/resilience.test.js`): pieces of a record; unusable timestamps; malformed and oversized records; hostile record shapes; replacement, truncation and removal; Refresh and the rewrite samples; filters asked during a read; a source changed during a read or a lookup; a non-text source setting; a hidden panel; closing and reopening; filters across updates and a new source; the host message probe; the webview policy and package roots; visible caps. Ten of them pass on the previous sources too: they guard behaviour that was already right and do not prove a fix. The fix in row 2 has no separate failing run on the previous sources, because that test already fails there at row 1.

New test support, with no behaviour of its own: `test/resilience-fixture.js` (synthetic records and the host stand-in), `test/navigation-harness.js` (the DOM stand-in moved out of `test/navigation.test.js`, whose 16 tests are otherwise unchanged), `test/benchmark.js` (not part of `npm test`).

### Evidence

- `test/resilience.test.js`, `test/benchmark.js` and their fixtures. All data is synthetic.
- `artifacts/s08/` in this worktree (git-ignored, local only): `benchmark.json`, `benchmark-run1.json`, `benchmark-run2.json` (after the fixes), `benchmark-before.json` (before), `baseline-before-change.txt` (the failing run on the previous sources), `package-file-list.txt`.

### Gaps and limits

- **Not run in a webview or a VS Code host.** The page side is the real `media/app.js` on a stand-in DOM and the real view in Node. S09 owns host and browser acceptance.
- **The per-second message is large and its webview cost is unmeasured.** At full retention the host sends 5.5 MB every second, changed or not, and the view rebuilds its page from it. Serialising and drawing took under 0.1 s in Node. Transfer into the webview, parsing there and the DOM update were not measured. If S09 sees a slow tab on a large family, the fix is to send only when something changed plus a small clock tick; that needs a view change and was not made on speculation.
- **No real transcripts were read in this step.** The numbers are for the synthetic fixture. The S03 and S04 records hold the real-folder timings (a 42 s cold name search over 7.2 GB; a 59 s load of a large Codex family); nothing here changes those.
- **The timestamp window uses this machine's clock.** A transcript written on a machine whose clock runs more than a day ahead would have its records counted as malformed. `README.md` does not mention the window yet; the view shows the count. Pending for S10, which owns the README.
- **The rewrite sample limitation stands**, as documented in the README: an edit wholly between the first and last 4 KB read is missed until Refresh, or until the file shrinks or is replaced.
- **Label policy, restated.** A file or search path contributes its last two segments to an event label. For a shallow path that includes a parent folder name. A call ID and a file name are shown cut to 160 characters.
- **A closed panel stays in the extension's subscription list** until the extension is deactivated: 29 entries after 27 panels in the stand-in. Its timer and listeners are released. Whether VS Code keeps anything large alive through it was not measured.
- After a request arrives mid-pass, that pass's message is dropped by the view, so one activity update is skipped (about one second).
- The first selection of a reopened panel with no saved choice is the newest session that matches the view's filters. Only an explicit choice is restored.
- The longest-block figures are from Node's event loop monitor at 1 ms resolution on Windows; they bound host responsiveness, not the webview's.
- Contrast and screen reader output were not measured. Linux and VSCodium were not run.

Next action at the end of S08: board review of `task/5df10f`, then S09 (now done, below).

## S09: Make Windows acceptance repeatable

Owner: card `72183c`, branch `task/72183c`, AgentBoard worktree. Dependency commit: `a03ac6a` (S08 integrated). Code commit: the commit on this branch titled "test: make Windows acceptance repeatable (S09)". Review and integration: pending, done by the board.

### Headline

The host run and the browser inspection are now two repeatable commands, each with its own receipt, and both pass on this machine. The host run drives the **real webview**, which closes the "not run in a VS Code host" gap recorded by S02 to S08. One product defect was found and fixed (station colours on light themes). **The milestone stays open for:** Linux and VSCodium, a live AgentBoard caller, and screen reader output. Full detail: `docs/development/agentviz-next-evidence.md`.

**Scope note for the reviewer.** `media/style.css` is outside the files listed for this card. Six lines were added there because the required light theme contrast check failed without them. Nothing else in `media/` or `src/` changed.

### What changed

- `test/host-runner.js` (new, `npm run host`): locates and verifies `Code.exe` from its install records, makes a temporary profile and source folder, starts the host, judges the result, stops only its own processes, removes its folder.
- `test/extension-host.js`: from 13 to 32 checks. It now writes a 93-transcript synthetic source and drives the real webview over the window's debugging port. A failed check is recorded and the run goes on.
- `test/browser-check.js` (new, `npm run browser`): headless Edge or Chrome, real key presses, the real host code behind the page, 1280, 600 and 360 px.
- `test/cdp.js`, `test/page-probes.js`, `test/acceptance-fixture.js` (new): the protocol client, the in-page measurements (contrast, focus ring, names, layout, view state) and the shared synthetic source. No dependency was added.
- `test/host-runner.test.js` (new, part of `npm test`): six tests.
- `package.json`: scripts `host` and `browser`. `workflows/checks.json`: checks `host` and `browser`, added after both commands passed.
- `media/style.css`: darker station colours for light themes.

### Checks (worktree, PowerShell 7, Node v26.7.0)

| Command | Result |
| --- | --- |
| `npm test` | exit 0: 123 tests, 123 pass, 0 fail |
| `npm run check` | exit 0 |
| `npm run host` | exit 0: VS Code 1.146.0, 31 checks passed, 1 optional not run (clipboard), 36.7 s |
| `npm run host -- --clipboard` | exit 0: 32 checks passed, 0 not run, 38.4 s |
| `npm run browser` | exit 0: Edge 157 headless, 11 of 11 checks |
| First host run, before the stylesheet change | exit 1: light theme contrast failed, 13 text items at 1.77:1 to 2.10:1 |
| `node --test --test-name-pattern="station colours" test/host-runner.test.js` on the previous stylesheet | 0 pass, 1 fail ("Light themes have their own station colours") |

Regressions added (6 unit tests in `test/host-runner.test.js`): the executable is verified with no silent fallback; a run never uses a normal profile or a folder outside its own; only a complete passing result from the verified executable counts (missing, unreadable, `null`, failed, incomplete, not-run, wrong version, bad exit code, timeout); a stand-in host showing that missing and failed results fail and that a leftover process of the run is stopped while a bystander process is not; the browser is taken as given; station colours reach AA on dark and light. The first five fail before the runner exists; the `null` case failed against the runner's first draft and caught a real hole. The host and browser checks themselves are the regressions for the acceptance behaviour and are not part of `npm test`.

### Results in short

- Host, all in the real webview: open, reuse, close, reopen; workspace selection reaching a project outside the returned 80; name filter with duplicate names; full and partial ID beyond the list; no matches; a Claude and a Codex rename with the selection unmoved; family lanes; a selected subagent; example against real; Tab order and focus rings; accessible names; contrast on Dark Modern (lowest 6.08:1) and Light Modern (lowest 4.78:1); a missing source folder, both missing, and a deleted followed session; no private sentinel or path in the page; no console or policy errors, with a control that proves a violation would be seen; the entry command, with the view showing each addressed session.
- Browser: example and live labels; keyboard-only use; accessible names from the browser's accessibility tree; contrast (lowest 6.61:1) and layout at three widths; markup in a saved name shown as text.
- **S08's open cost question is answered.** At full retention (58,000 events, 6.47 MB per message) the real webview spends a median of 86 ms, at most 114 ms, on each once-a-second message. No change was made.

### Evidence

- `docs/development/agentviz-next-evidence.md`: every check, the measurements, observations and what is unverified.
- In this worktree, git-ignored and local only, synthetic data: `artifacts/host/extension-host-result.json` and `artifacts/host/shots/` (6 screenshots of the host window); `artifacts/browser/browser-check.json` and 8 screenshots; `artifacts/s09/` (`unit-run.txt`, `syntax-run.txt`, `host-run.txt`, `browser-run.txt`, `host-result-with-clipboard.json`, `baseline-before-change.txt`).

### Gaps and limits

- **Unverified, milestone open:** Linux, VSCodium, remote and web hosts; a live AgentBoard caller; screen reader output; high contrast themes and themes other than the two defaults; contrast of graphics (text only was measured).
- Narrow widths (600 and 360 px) were checked in the browser, not inside VS Code, where the page had about 850 px.
- Copy ID reaching the clipboard is checked only with `--clipboard`, because it overwrites the clipboard. It passed once.
- The host check opens a visible VS Code window for about 40 seconds and needs a desktop session. It uses a debugging port on a free local port of that one isolated window; the product itself still opens no port.
- A Codex subagent was not followed in the host. No real transcript was read in this step.
- Observations left unchanged (in the evidence file): the empty area under the map at desktop width; equal ID fragments for subagents whose IDs share eight characters; the deleted session staying in the list; the real style source of a webview containing VS Code's own host pattern, which the S08 record did not show.
- `README.md` does not mention `npm run host` or `npm run browser`. Pending for S10, which owns the README.

Next action: board review of `task/72183c`, then S10.
