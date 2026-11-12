# AgentViz execution record

State: prepared, not launched. Baseline: `2a3025b`. The requested workspace/name/ID changes are pending. No AgentBoard root or child card has been allocated by this planning session.

The executable schedule is `workflows/agentviz-next.plan.json`, named **AgentViz: find and follow sessions** in **Run a Plan**. `ORCHESTRATION.md` is the product brief. Use `workflows/checks.json` for named acceptance commands. Native plan steps and model review supply scheduling, acceptance and integration; the former manual orchestrator launch route is superseded.

| Outcome | Status | Board ID | Delivered commit | Acceptance evidence |
| --- | --- | --- | --- | --- |
| S01 workspace and saved names | Implemented, awaiting board review | 8a7300 (plan card a40b39) | `0808321` | `npm test` 31/31, `npm run check` exit 0; see S01 below |
| S02 navigation filters | Implemented, awaiting board review | 153bc7 (plan card a40b39) | `14273a5` | `npm test` 50/50, `npm run check` exit 0, headless Edge 17/17; see S02 below |
| S03 complete catalogue lookup | Implemented, awaiting board review | 6e5778 (plan card a40b39) | `6977d3e` | `npm test` 63/63, `npm run check` exit 0; see S03 below |
| S04 agent lanes | Implemented, awaiting board review | c15df0 (plan card a40b39) | See `git log` on `task/c15df0` (commit titled "feat: show main and subagent lanes (S04)") | `npm test` 71/71, `npm run check` exit 0, local sample 24 families; see S04 below |
| S05 explicit task progress | Pending | Not allocated | None | Not run |
| S06 file footprint | Pending | Not allocated | None | Not run |
| S07 AgentBoard entry command | Pending | Not allocated | None | Not run |
| S08 reliability and cost | Pending | Not allocated | None | Not run |
| S09 Windows acceptance | Pending | Not allocated | None | Not run |
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

Next action: board review of `task/c15df0`, then S05.