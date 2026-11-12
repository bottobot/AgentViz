# S01 receipt: workspaces and saved session names (parallel plan)

Card `5c588b`, branch `task/5c588b`, AgentBoard worktree. Plan card `6e96a7`. Base: `a9f9799`. Written 12 November 2026.

## Headline

- **`unit` does not pass in this worktree: 135 of 136.** The one failure is on the base commit and outside this step's files. See Blocked.
- The catalogue fields were already implemented by the earlier serial run (`0808321`, later extended by `6977d3e`). This step kept that work, checked it against the frozen interface and the local source shapes, and added what was missing.
- New in this step: the host now accepts the frozen query message. Before, it ignored it.
- Not done here: the top-level `queryRequestId` in the state message. See Gaps.

## What was found on arrival

`git status` clean, head `a9f9799`. The branch already holds the serial run's S01 to S10. Checked against this step's outcome:

| Required | State on arrival | Where |
| --- | --- | --- |
| Catalogue fields `workspaceKey`, `workspaceLabel`, `name`, `nameSource`, whole `sessionId`, `project` kept | Present | `catalogueEntry` in `src/extension.js`, `discoverSessions` in `src/sessions.js` |
| Claude custom over generated, late rename | Present, tested | `scanTitles` in `src/sessions.js`; `test/sessions.test.js` |
| Codex title from the session index | Present, tested | `readCodexIndex` in `src/sessions.js` |
| Missing and corrupt metadata give `Unnamed session` | Present, tested | `test/sessions.test.js` |
| Duplicate basenames, Windows case folding, Linux case kept | Present, tested | `workspaceIdentity` in `src/transcript.js`, `workspaceLabels` in `src/sessions.js` |
| Titles short, controls stripped, cleaned again at the host boundary | Present, tested | `sessionTitle` in `src/transcript.js` |
| Lookup changes no CLI state | Present, tested | `test/sessions.test.js` ("leaves provider folders byte-for-byte untouched") |
| Frozen query `{type:"query", requestId, workspaceKey, name, sessionId}` | **Missing.** Only `{seq, id}` was read; a frozen query was dropped | fixed here |
| State carries `queryRequestId` | **Missing** | not fixed here, see Gaps |
| State carries `workspaces: [{key, label}]` | Present, with an extra `count` | `workspaceEntry` in `src/extension.js` |

`src/sessions.js` and `src/transcript.js` needed no change.

## Source shapes observed (keys and counts only)

Probe run on this machine on 12 November 2026, read only, from a script kept outside the repository. It printed record types, key names, value types and counts. No title, path or payload was printed or saved.

Claude, newest 200 transcripts under the projects folder (88 of them subagent transcripts):

- `{type: "custom-title", customTitle: string, sessionId: string}`: 3,039 records. No other key.
- `{type: "ai-title", aiTitle: string, sessionId: string}`: 1,591 records. No other key.
- Both are whole top-level lines and repeat through a file, so the last one of each kind is the current one.
- 86 transcripts held a title record. None of the 88 subagent transcripts did.
- No `summary` record was found in the sample.
- Working directory: top-level `cwd` string, present in 199 of 200. The first one was never later than line 7. All 199 were Windows drive paths. The one without `cwd` shows as `Unknown workspace`.
- Longest title seen: 61 characters. The display limit is 80.

Codex:

- `session_index.jsonl` in the Codex folder: 1,025 lines, all parsed, all exactly `{id: string, thread_name: string, updated_at: string}`.
- 521 distinct IDs; 192 IDs repeat. The last line for an ID is used, which matches append-on-rename.
- Every `id` is UUID shaped and equals the ID in the rollout file name: 114 of the newest 200 rollouts had an index line. The rest have no stored name and show as `Unnamed session`.
- Longest `thread_name` seen: 71 characters.
- Every one of the 200 rollouts starts with a `session_meta` record that fits in the 64 KB preview, with `payload.cwd` as a string. All were Windows drive paths.
- `payload.id` and `payload.session_id` both exist. The catalogue keeps using the ID in the file name.
- The folder also holds SQLite files (`state_5.sqlite`, `thread_history_1.sqlite` and others). They were listed by name only and not opened. Whether they hold titles is unknown.

Observed but outside this step: 55 of the 200 rollouts carry a top-level `payload.parent_thread_id`, with `payload.source` as an object. The lane code (S04) reads `payload.source.subagent.thread_spawn.parent_thread_id`. Whether the nested key is still written was not checked.

No Linux path exists in the local sample. Linux case handling is proven on synthetic records only.

## Changes

- `src/extension.js`: `frozenQuery` and `isFrozen` added. The `query` and `ready` handlers accept the frozen form beside the earlier one. A `floor` request number replaces the comparison with the current query, so a first request numbered 0 is heard.
- `test/metadata.test.js`: new, five tests.

Behaviour of the frozen query:

- `requestId` must be a nonnegative safe integer. `workspaceKey`, `name` and `sessionId` must be strings. `workspaceKey` must be empty, `ws:unknown` or `ws:` plus 20 hex characters.
- Anything else rejects the whole message. Nothing is repaired and no lookup starts.
- `name` and `sessionId` are cut to 200 characters, then passed to discovery as `name` and `id`.
- A request numbered at or below the last accepted one is ignored. `ready` restarts the numbering.
- The earlier `{seq, id}` form behaves as before.
- Acknowledged in `lookup.seq`, as before.

## Regressions added

All in `test/metadata.test.js`. All five fail on the base `src/extension.js` and pass after the change (run both ways, output below).

1. The frozen query reaches discovery with the whole session ID; late and repeated request numbers change nothing.
2. Fourteen malformed frozen queries start no lookup and are not acknowledged; over-long filter text is cut.
3. A reloaded view restarts numbering; a malformed query beside `ready` is dropped; the earlier form still works.
4. A catalogue worked out for request 1 is never acknowledged as request 2.
5. End to end, real discovery and real host whitelist over synthetic files of both providers: custom over generated, late rename with unchanged ID and workspace, Codex index rename, missing and corrupt titles, same Windows directory in two spellings, same basename on another drive, two Linux directories differing only in case, duplicate titles, exact catalogue keys, no private sentinel or path in any message, no file created.

Test 5 covers behaviour that existed before this step. It failed before only because it asks through the frozen query.

## Checks run

| Command | Result |
| --- | --- |
| `npm test` on the base, before any change | exit 1: 131 tests, 130 pass, 1 fail (the README test below) |
| `node --test test/metadata.test.js` with base `src/extension.js` | exit 1: 5 tests, 0 pass, 5 fail |
| `node --test test/metadata.test.js` after the change | exit 0: 5 tests, 5 pass |
| `npm test` after the change | **exit 1: 136 tests, 135 pass, 1 fail** (the same README test) |
| `npm run check` after the change | exit 0 |
| `git diff --check` | exit 0 |

Not run: `host`, `browser`, `package`. They are not this step's checks. Nothing was verified in a real VS Code window.

## Blocked

`unit` fails on the base commit, before and after this step:

- Test: "the README that ships in the package describes this release and carries no orchestration material" (`test/package.test.js:54`).
- Message: `the shipped README does not mention workflows/`.
- Cause: the merge `a9f9799` added one paragraph to `README.md` that names `workflows/agentviz-next.parallel.plan.json`, `ORCHESTRATION.md`, "Run a Plan" and "not launched". The test forbids each of those in the packaged README.
- Not fixed here: `README.md` and `test/package.test.js` are outside this step's files, and the two concurrent steps see the same failure.
- Fix: delete that paragraph from `README.md`. `HANDOFF.md` already says the same thing.

## Gaps

- **`queryRequestId` is not in the state message.** `test/resilience.test.js` (helper near line 603) pins the exact fields of a host message, and that file belongs to the joining discovery step. Adding the field was tried and failed that test. To finish: add `queryRequestId` beside `lookup` in the `postMessage` call in `src/extension.js` and add the key to that test's list. Until then the acknowledgement is `lookup.seq`, holding the same number.
- `workspaces` entries carry `count` beside `key` and `label`. Kept because the current view may read it.
- The earlier `{seq, id}` query form is still accepted. The joining step decides when to retire it.
- A reloaded view that sends `ready` while an older pass is mid-read can receive one message built for the old filters with `lookup.seq` 0. This existed before; it lasts until the next pass.
- Title limits are unchanged and disclosed in code: 64 KB per title record, 64 KB first-record preview, 8 MB of the Codex index.
- Codex SQLite stores were not inspected.

## Evidence

- Code commit: `f225e43`.
- Tests: `test/metadata.test.js`.
- Probe output: in this card's session only. The probe script is not committed.

Next action: board review. Then the README fix above, by whoever owns `README.md`.
