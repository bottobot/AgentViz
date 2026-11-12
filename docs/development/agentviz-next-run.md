# AgentViz execution record

State: prepared, not launched. Baseline: `2a3025b`. The requested workspace/name/ID changes are pending. No AgentBoard root or child card has been allocated by this planning session.

The executable schedule is `workflows/agentviz-next.plan.json`, named **AgentViz: find and follow sessions** in **Run a Plan**. `ORCHESTRATION.md` is the product brief. Use `workflows/checks.json` for named acceptance commands. Native plan steps and model review supply scheduling, acceptance and integration; the former manual orchestrator launch route is superseded.

| Outcome | Status | Board ID | Delivered commit | Acceptance evidence |
| --- | --- | --- | --- | --- |
| S01 workspace and saved names | Implemented, awaiting board review | 8a7300 (plan card a40b39) | `0808321` | `npm test` 31/31, `npm run check` exit 0; see S01 below |
| S02 navigation filters | Pending | Not allocated | None | Not run |
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

Next action: board review of `task/8a7300`, then S02.
