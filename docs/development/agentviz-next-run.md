# AgentViz execution record

State: prepared, not launched. Baseline: `2a3025b`. The requested workspace/name/ID changes are pending. No AgentBoard root or child card has been allocated by this planning session.

The executable schedule is `workflows/agentviz-next.plan.json`, named **AgentViz: find and follow sessions** in **Run a Plan**. `ORCHESTRATION.md` is the product brief. Use `workflows/checks.json` for named acceptance commands. Native plan steps and model review supply scheduling, acceptance and integration; the former manual orchestrator launch route is superseded.

| Outcome | Status | Board ID | Delivered commit | Acceptance evidence |
| --- | --- | --- | --- | --- |
| S01 workspace and saved names | Implemented, awaiting board review | 8a7300 (plan card a40b39) | `0808321` | `npm test` 31/31, `npm run check` exit 0; see S01 below |
| S02 navigation filters | Implemented, awaiting board review | 153bc7 (plan card a40b39) | `14273a5` | `npm test` 50/50, `npm run check` exit 0, headless Edge 17/17; see S02 below |
| S03 complete catalogue lookup | Pending | Not allocated | None | Not run |
| S04 agent lanes | Pending | Not allocated | None | Not run |
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

Next action: board review of `task/153bc7`, then S03.
