# S02 receipt: workspace, name and ID filtering (parallel plan)

> **Since this receipt (15 November 2026):** the frozen request form it added to `media/app.js` was removed, because no host ever answered in it. The README test it reports as failing passes. Three of its tests are kept in `test/app.test.js`. See `../agentviz-next-parallel-run.md`.

Card 280712, branch `task/280712`, plan card 6e96a7. Written 2026-11-12. Code commit: `67d8ed5`.

## Starting state found

The worktree did not start from the pre-S01 baseline the plan assumes. `git log` shows the earlier serial run
already merged here: S01 (`0808321`), S02 (`14273a5`), S03 (`6977d3e`) through S10 (`31c593e`). The filter UI,
its markup, styles, view helpers and controller tests already existed and were kept.

That earlier work uses a different wire form from the frozen Parallel interface contract:

| | Existing host and tests | Frozen contract |
|---|---|---|
| Request | `{type: "query", seq, workspaceKey, name, id}` | `{type: "query", requestId, workspaceKey, name, sessionId}` |
| Acknowledgement | `lookup.seq` | `queryRequestId` |
| Project groups | `{key, label, count}` | `{key, label}` |
| Followed session | separate `selected` entry | `selectedId` only |

The old form is asserted exactly by `test/navigation.test.js`, `test/extension.test.js` and
`test/resilience.test.js`, and implemented by `src/extension.js`. None of those are in this step's writable files.

## What changed

Only `media/app.js` and the new `test/app.test.js`. `media/view.js`, `media/style.css`, `src/webview.js` and
`test/view.test.js` needed no change.

- **Both forms, chosen by the host.** The page starts in the older form. The first state message that carries a
  nonnegative integer `queryRequestId` switches it to the frozen form for the rest of the page's life. From then
  on it sends the frozen query message and accepts an answer only when `queryRequestId` equals the last
  `requestId` it sent (zero before any query). After the switch, an answer without a usable number is dropped.
- **Saved filters.** Filters restored from webview state are sent again in the frozen form as soon as the host is
  recognised. The unfiltered first answer is not shown as their result.
- **Excluded selection.** The page remembers the last catalogue entry it saw for the followed session, because a
  frozen answer has no separate `selected` entry.
- **No invented totals.** A frozen answer has no source total and its list is already filtered. The page then
  says `N sessions listed.`, `N sessions match.` or `No sessions match. Clear filters to see every session.`,
  and shows `All projects` and project labels without counts unless the host sends them.
- **Legacy snapshots.** A catalogue entry without `workspaceKey`, `workspaceLabel`, `name` or `sessionId` gets
  `ws:unknown`, the old `project` text or `Unknown workspace`, `Unnamed session`, and its `id`. Before this it
  rendered the word `undefined`. Malformed entries, project groups and a non-list `warnings` are skipped.

## Exact behaviour on an excluded selection

The selection is preserved, never cleared and never replaced.

- The identity bar keeps the followed session's project, name, full ID and provider, with the note
  `Hidden by the current filters. Still followed until you choose another session.`
- The session picker shows the placeholder `Followed session is hidden by these filters` (or
  `No sessions match these filters`, disabled, when nothing matches). Its value is empty; it does not fall
  through to the first match.
- The activity below stays that session's own. A snapshot is drawn only when its ID and provider equal the
  followed session's.
- No `select` message is sent by filtering or clearing. Only choosing a listed session moves the selection.
- If the host names a followed ID the page has never seen an entry for, the identity bar is hidden and no
  activity is drawn; no other session's name is used.

## Regressions added (`test/app.test.js`, 9 tests)

Run against the previous `media/app.js` (`git show HEAD:media/app.js`), 8 failed and 1 passed. The one that
passed, "a followed session the page has never been told about…", records behaviour that already held.

1. Frozen query message: exact keys, trimmed values, rising `requestId`, typed text untouched.
2. Project, name and ID intersect; duplicate names stay two rows; partial ID past character eight; full ID;
   row order workspace, name, ID, provider.
3. Stale answers dropped; wait shown; focus and typed text kept through refreshes and a rename; bad
   acknowledgement numbers rejected.
4. Saved filters asked again in the frozen form, once.
5. Excluded selection, no matches, wrong-session snapshot, Clear filters, choosing a listed session.
6. Unknown followed ID is not given another session's name.
7. Hostile title as text only, Escape key, full ID copy, example mode, persisted keys only.
8. Malformed groups and entries skipped.
9. Legacy snapshot without the new fields; older request form kept for that host.

Coverage that already existed and still passes: `test/view.test.js` (filter helpers, labels, heading order,
hostile text, example catalogue) and `test/navigation.test.js` (older form controller, toolbar labels and order,
copy fallbacks, narrow viewport stylesheet rules).

## Checks run

| Command | Result |
|---|---|
| `node --test test/app.test.js` | 9 pass, 0 fail |
| `npm test` (unit) | **FAIL: 140 tests, 139 pass, 1 fail** |
| `npm run check` (syntax) | pass, exit 0 |
| `npm run browser` | PASSED, Edg/157.0.4341.42, 11 of 11 checks |

The one `npm test` failure is not from this step. It failed the same way before any edit (131 tests, 130 pass,
1 fail): `test/package.test.js`, "the README that ships in the package describes this release and carries no
orchestration material", message `the shipped README does not mention workflows/`. `README.md` and that test
are outside this step's files, so it was left alone.

## Evidence

- DOM evidence: the assertions in `test/app.test.js` on the stand-in DOM built from the real toolbar markup.
- Screenshots and receipt from `npm run browser`, in `artifacts/browser/` (ignored by git, synthetic data):
  `live-1280.png`, `live-600.png`, `live-360.png`, `hidden-selection-1280.png`, `no-matches-1280.png`,
  `hostile-name-1280.png`, `example-1280.png`, `example-360.png`, `browser-check.json`.
  `hidden-selection-1280.png` and `live-360.png` were opened and looked at.

## Gaps and unverified

- **Blocked: `unit` cannot pass from this step.** See the README failure above.
- **The frozen form is not exercised against a real host.** No host in this checkout sends `queryRequestId`.
  `src/extension.js` still speaks the older form, so the live extension, the browser check and the
  screenshots all cover the older form only. The frozen form is proven on the stand-in host in
  `test/app.test.js` alone.
- **The page cannot send the frozen message first.** Doing so breaks exact assertions in tests this step may
  not edit. The join step (S03) must make the host answer with `queryRequestId`, then can drop the older form.
- Under the frozen form a followed session that is filtered out keeps its last seen name; a rename is not
  shown until it is listed again. The contract has no field for it.
- Under the frozen form the page cannot disclose a host cap or unread names; the contract has no field for
  them. With the existing `lookup` object present these notes still appear.
- No VS Code host run (`npm run host`) was made for this step. Real clipboard and VS Code theme colours are
  not covered by the browser check.
