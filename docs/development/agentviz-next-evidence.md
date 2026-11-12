# AgentViz acceptance evidence (S09 and S10)

The release evidence from S10 is the first section. The S09 acceptance evidence follows it unchanged.

## S10 release evidence

Taken 2026-11-12 on native Windows 11, Node v26.7.0, VS Code 1.146.0, Microsoft Edge 157 headless, in the worktree of card `05f15f` (branch `task/05f15f`, based on `e56805a`). All data is synthetic. No real transcript, title, path or ID was read, printed or saved in this step.

### Receipts

Six separate receipts. None is derived from another.

| Check | Command | Result | Receipt (local, git-ignored) |
| --- | --- | --- | --- |
| unit | `npm test` | exit 0: 127 tests, 127 pass, 0 fail, 0 skipped | `artifacts/s10/unit-run.txt` |
| syntax | `npm run check` | exit 0 | `artifacts/s10/syntax-run.txt` |
| package | `npm run package` | exit 0: `agent-viz-0.1.0.vsix`, 11 entries, 57,480 bytes | `artifacts/s10/package-run.txt` |
| package contents | `npm run package:check -- --receipt=artifacts/s10/vsix-check.json` | exit 0 | `artifacts/s10/vsix-check.json`, `artifacts/s10/package-check-run.txt` |
| host | `npm run host` | exit 0: VS Code 1.146.0, 31 checks passed, 1 optional not run (clipboard), 35.8 s | `artifacts/host/extension-host-result.json`, `artifacts/s10/host-run.txt` |
| browser | `npm run browser` | exit 0: 11 of 11 checks | `artifacts/browser/browser-check.json`, `artifacts/s10/browser-run.txt` |

The host and browser runs were taken before the README was rewritten. They ran the same seven `src/` and `media/` files that are in the package: those seven checksums below were identical in the packages built before and after the rewrite. The README is not loaded by the extension.

### What is in the VSIX

Read from the built archive by `test/vsix-check.js`, not from the packaging tool's own listing.

| Bytes | SHA-256 | File |
| --- | --- | --- |
| 2,011 | `00bf653bd702d68d084990cae8486bcbfdb0a543a0b4c91870fc69b8ddab1c61` | `extension/package.json` |
| 12,827 | `dc5a08b9587a354f335f1227f55d0d35baab7128d43c36369188ab38951fcf4e` | `extension/readme.md` |
| 13,482 | `0f63b31f2bbfefeebacef324f03ea21a099477e36fc527cdf447d9a0a929eda5` | `extension/media/app.js` |
| 15,192 | `d14065a1f0c8dd5871891767aa8fa09fa19f5f8d57b4c2c6d1128ab73c7cb20a` | `extension/media/style.css` |
| 46,554 | `fc113f39d3e319e1e9a640fc217cba7f1efe1efa594126a5f0bdf3bb88b9220c` | `extension/media/view.js` |
| 15,705 | `369c6689f039f914819c544c0a7decd04d40cdeba1dd1df4e6890ad89c175605` | `extension/src/extension.js` |
| 37,198 | `49c12e3b31cf312725422f8b33299001995a65392eafa6f9819b38554201ad82` | `extension/src/sessions.js` |
| 30,788 | `ae854dbd6d8effc9b1e05d585561e01dab44f9f39d0f6a9d65178a96b2f9b557` | `extension/src/transcript.js` |
| 3,137 | `31c2b63c63a7489d982e3661bbc96d6e7404450ed8a7a27613e7589144985859` | `extension/src/webview.js` |
| 1,760 | `e24f70197666f8fb1ef239fa2f484d012aaf170a7ae5009792ebf0aee666ae34` | `extension.vsixmanifest` (written by the tool) |
| 409 | `c16b37087f3cf18f81565c028e70da4c1c692e7fb50c01c9a8df39f916b790f6` | `[Content_Types].xml` (written by the tool) |

Archive checksum of the build inspected here: SHA-256 `55eb24c712e6813efd58d4127cc2b74fa1c54a9a2f914cc5a80fe40bfb82ad3c`.

The per-file checksums are for this Windows checkout, where Git writes text files with CRLF line endings. A checkout with another line-ending setting packages the same text with different bytes, and so different checksums.

**The archive checksum is not reproducible.** Two builds three seconds apart from the same files gave different archive checksums, because the archive stores build times. The board's own `package` check builds again, so the VSIX left in the worktree will carry another archive checksum. The per-file checksums above are the stable identity. `npm run package:check` prints both for whatever VSIX is present.

The check held for:

- **Inclusion set.** Exactly the nine product files and the tool's two. No test, fixture, document, evidence, workflow, board, lockfile, workspace or settings file. No `node_modules`.
- **Transcripts and private source metadata.** No `.jsonl` file. No file's contents hold this machine's home folder or a `Users\<name>` path in any separator style.
- **Development dependencies.** `package.json` in the package declares no `dependencies`; nothing from `node_modules` is included. Its `devDependencies` field names the packaging tool and is metadata only.
- **Orchestration material.** None. The shipped README no longer names the plan files (see the second finding).
- **Not stale.** Each packaged product file equals the file in the checkout, byte for byte.

### Review of the integrated changes

Method: the product contract in `ORCHESTRATION.md` was read against `src/extension.js`, `src/sessions.js`, `media/app.js`, the navigation part of `media/view.js` and `src/webview.js`. Then a temporary script ran the real `discoverSessions` on 45 synthetic transcripts built to be awkward. The script and its folder were temporary and are not committed.

| Case | What happened |
| --- | --- |
| One ID in two project folders, same saved name | Two entries with different catalogue IDs, told apart by project. An ID filter in upper case with spaces around it finds both. |
| IDs where one is a prefix of another, differing after eight characters | A fragment from past the eighth character finds only the longer one. |
| File names as IDs: spaces, `'`, `&`, 200 characters, upper case, dots | Listed and filterable. `*` and `.*` in the ID filter match nothing: the filter is literal. |
| `C:\Work\Mixed`, `c:/work/mixed/`, `C:\Work\Mixed\` | One project, three sessions. |
| `/home/dev/Mixed` and `/home/dev/mixed` | Two projects. |
| `\\srv\share\Mixed` and `//srv/share/Mixed` | Two projects (the second is read as a POSIX path). |
| Seven different directories named `Mixed` or `mixed` | Seven distinct labels: a parent segment, then a key fragment. |
| `C:`, `C:\`, `/` | `Root folder`, with a key fragment where two differ. |
| A blank working directory | `Unknown workspace`, selectable as its own project. |
| A directory literally named `Unknown workspace` | Labelled `Work/Unknown workspace`; not merged with the unknown group. |
| A directory named `<img src=x onerror=1>` | Kept as text; the view escapes it. |
| A directory name of 300 characters; one starting with a direction override | Label cut to 80 characters; the override removed. |
| Titles: markup, 500 characters, line breaks and tabs, a direction override, only spaces | Kept as text; cut to 80; one line; override removed; `Unnamed session`. |
| Title records with an object, a list or no title | Ignored; `Unnamed session`. |
| A prompt whose text is a title record | Not read as a title. A name search for it finds nothing. |
| A custom title later set to empty | Falls back to the generated title. |
| Codex index: an ID in another case, a `__proto__` ID, markup in a name | Matched without case; ignored; kept as text. |
| A bogus project key | No matches; nothing thrown. |
| Any path of the fixture in the returned catalogue | None. |

### Findings

**1. Material, fixed: the VSIX could ship stray private files.** `.vscodeignore` listed what to leave out. Anything not listed was packaged. Reproduced on synthetic files (`artifacts/s10/deny-list-leak.txt`): with the old file, the packaging tool listed `.claude/settings.local.json`, `session-copy.jsonl`, `src/captured-transcript.jsonl`, `notes.md` and `media/screenshot.png` for inclusion. The checkout was clean at the time, so no real file shipped; the next stray one would have.

Fix: `.vscodeignore` now ignores everything and allows back `package.json`, `README.md`, `src/*.js` and the three `media` files. The old exclusions stay, after the allow rules, with `.claude/**`, `**/*.jsonl`, `**/*.vsix` and `**/.env*` added.

Regression: `test/package.test.js` builds a real package in a temporary folder seeded with 23 synthetic stray files and requires exactly the product set. It failed on the old file (`artifacts/s10/baseline-before-change.txt`). Note on that baseline: the tool refused the `.env` stray outright, so the test failed at the build; the leak list above is the direct evidence for the other files.

**2. Fixed: the shipped README named planning material.** `README.md` is packaged. The old one described the release as planned and named `workflows/agentviz-next.plan.json` and `ORCHESTRATION.md`. It is rewritten for the current product. Regression: a test that fails on the old README (`artifacts/s10/readme-test-on-old-readme.txt`).

**3. Recorded, not changed.** None breaks the product contract. All are in the README limits.

- A session ID is the transcript's file name and reaches the view as it is. A file name holding a direction-override or zero-width character would display misleadingly; one of 200 characters is shown whole. Names and labels are cleaned; IDs are not, so a copied ID still equals the file name. It is escaped wherever it is written as markup. Changing this means editing `src/extension.js`, outside this step's files.
- One folder recorded in two spellings is two projects: `C:\Work\app` against `/c/Work/app`, a path holding `..`, or a UNC path written with forward slashes.
- Name search is literal on the cleaned title. Two spaces do not match one. `istanbul` does not find `İstanbul`, though `İSTANBUL` does.
- Saved names lose zero-width joiners with the other invisible characters, so some joined emoji show as their parts.
- The catalogue's legacy `project` field (a directory base name, unused by the view when a session is identified) is cleaned of control characters only.

**4. Carried forward from earlier steps, still open.** Subagent task lists and file footprints do not reach the view (S05, S06). A deleted followed session still reads "Loading history" in the activity area (S03). Both are stated in the view or the README.

### New in `test/`

- `test/vsix-check.js` (`npm run package:check`): reads a built VSIX with Node builtins, lists each file with its checksum, and fails on an unexpected or missing file, a duplicate path, a local path inside any file, runtime dependencies, or a file that differs from the checkout. A missing or unreadable VSIX is a failure.
- `test/package.test.js` (part of `npm test`): four tests.

### Not verified in S10

- **The packaged VSIX installed in an editor.** Not installed anywhere, by instruction. The host check runs the checkout; `package:check` shows the packaged files equal it.
- **The clipboard.** The host run was the default one; its optional clipboard check did not run.
- Everything S09 lists as not verified below. Nothing in S10 closes any of it.
- `package:check` is not in `workflows/checks.json`; this step does not own that file. Run it by hand after `package`.

## S09 acceptance evidence

Taken 2026-11-12 on native Windows 11, Node v26.7.0, VS Code 1.146.0 (commit `69047191fc42`), Microsoft Edge 157.0.4341.42 headless. All source data is synthetic. No real transcript, title, path or ID was read, printed or saved.

### S09 receipts

Four separate receipts. Each command was run in the worktree of card `72183c`.

| Check | Command | Result | Receipt (local, git-ignored) |
| --- | --- | --- | --- |
| unit | `npm test` | exit 0: 123 tests, 123 pass, 0 fail | `artifacts/s09/unit-run.txt` |
| syntax | `npm run check` | exit 0 | `artifacts/s09/syntax-run.txt` |
| host | `npm run host` | exit 0: 31 checks passed, 1 optional check not run (clipboard), 36.7 s | `artifacts/host/extension-host-result.json`, `artifacts/s09/host-run.txt`, `artifacts/host/shots/` |
| host, with clipboard | `npm run host -- --clipboard` | exit 0: 32 checks passed, 0 not run, 38.4 s | `artifacts/s09/host-result-with-clipboard.json` |
| browser | `npm run browser` | exit 0: 11 of 11 checks | `artifacts/browser/browser-check.json`, `artifacts/s09/browser-run.txt`, eight screenshots in `artifacts/browser/` |

The `artifacts` folder is not committed. To get the receipts again, run the commands; each run deletes its old receipt first, so a stale file cannot stand in for a new run.

## What a host run does

`test/host-runner.js` (run by `npm run host`):

1. Finds `Code.exe` (or takes `AGENTVIZ_VSCODE`, with no fallback if that is wrong) and verifies it from the install's own `product.json` and `package.json`: it must be VS Code, at or above `engines.vscode`. It is not started for this.
2. Makes a new folder under the system temporary folder holding the profile, the extensions folder, an empty workspace and the source folder. It refuses any folder that is, holds or sits in a normal editor profile.
3. Starts the development host with `--user-data-dir`, `--extensions-dir`, `--disable-extensions` and a debugging port on a free local port. The profile's settings point both source settings at the synthetic folder.
4. Waits for exit, at most 240 s (`--timeout=<seconds>`).
5. Fails unless: exit code 0, a result file exists and is a readable record, `passed` is true, every one of the 31 required checks is named in it, nothing other than the optional clipboard check is listed as not run, and the result names the VS Code version that was verified.
6. Stops only processes whose command line carries this run's own folder, then removes the folder.

`test/extension-host.js` runs inside that host. It writes 93 synthetic transcripts (two providers, a family with two subagents, a family at full retention with 24 subagents, 60 fillers, one session three days old), then drives the **real webview** over the debugging port: it sets the real controls, sends real key presses, and reads the real page.

## Host checks (31 required, 1 optional)

| Area | Checked in the real host and webview |
| --- | --- |
| Open, reuse, close, reopen | One editor; a second open reuses it; it closes; it reopens. |
| Page loads under its policy | Policy is `default-src 'none'; style-src 'self' https://*.vscode-cdn.net; script-src 'nonce-…'; connect-src 'none'; base-uri 'none'; form-action 'none'`. Both scripts carry the nonce. No inline style in the body. The list, the total (93) and the limit (80) arrive through the real message channel. |
| Workspace selection | Projects are offered with counts; two directories named `Alpha` get different labels; choosing a project three days old lists its one session, which is outside the returned 80; the followed session stays followed and says it is hidden; choosing the match follows and draws it. |
| Name filter | Case and surrounding spaces are ignored; two sessions with the same saved name are both listed and told apart; name and project intersect; a saved name that is markup is found and shown as text, with no element made from it. |
| Full ID filter | The full ID in upper case finds the session outside the returned 80; so do its last 12 characters; name and ID intersect. |
| No matches | The list is disabled and says so; the status line points to Clear filters; the followed session stays named and drawn. |
| Renamed sessions | A custom title appended to the followed Claude transcript appears on an ordinary pass, without Refresh; the ID and the picker entry do not move. A newer line in the Codex index renames that session; it is found by the new name; the followed session does not move. |
| Family lanes | Main session plus two subagent lanes, scope `MAIN + 2 SUBAGENT LANES`. |
| Selected child | A subagent transcript is found by its ID and followed; the bar and the caption say `Claude Code · subagent`; the note says its parent and siblings are not shown; only its own 4 calls are counted. |
| Example and real | Live reads `LOCAL SESSION`; the example reads `SYNTHETIC EXAMPLE`, the bar ends `synthetic example`, the note starts `Example data only.`, and the bar carries the example's ID, not the real one; back to live restores the real session. |
| Keyboard focus | Real Tab presses: Refresh, Show example, project, name, ID, Session, Copy ID. Each has a solid outline of 2 device pixels at 3.64:1 against the background. Typed keys filter the list; Escape empties the field and keeps focus. |
| Accessible names | Every control, the four landmarks, every graphic and gauge has a name; one `h1`; `lang="en"`; both live regions present. |
| Contrast, Dark Modern | 135 pieces of text measured, lowest 6.08:1, none below WCAG AA. |
| Contrast, Light Modern | 135 measured, lowest 4.78:1, none below AA **after the fix below**. |
| Source failures | A missing Codex folder is reported in the view and the Claude session stays followed; with both folders missing the list says `No local sessions found`, both are reported, and no name, ID or project of the old source is left on the page; both come back when the settings are restored. |
| Deleted followed session | It stays named, is reported as no longer in the source folders, and is not replaced by another session. |
| Private text | After every state above, none of the nine `PRIVATE_` sentinels, no drive or share path and no transcript file name is in the page. |
| Console and policy | Nothing reported by the page. Control: a script without the nonce is blocked, and that violation does arrive on the channel that was checked. |
| Entry command (9 checks) | Invalid arguments and unknown IDs are refused and open nothing; a Claude session opens the editor; a duplicate call keeps one editor; a Codex session reuses it; the Command Palette command is unchanged; a missing source is reported; a session outside the returned 80 reopens a closed editor. **The real view shows the addressed session each time** (three sessions). |
| Copy ID (optional) | With `--clipboard`: the status reads `Session ID copied.` and the system clipboard holds the full ID. The previous clipboard text is put back. Skipped by default because it overwrites the clipboard. |

## Browser checks (11)

`test/browser-check.js` (run by `npm run browser`). The page is the markup from `src/webview.js` with the real stylesheet and scripts under its own policy. Its data comes from the real `src/extension.js` and adapters reading a synthetic folder; the script carries messages between the two.

| Check | Result |
| --- | --- |
| Example page with no host | Labelled synthetic in the heading, the bar and the note. |
| Live page | Labelled `LOCAL SESSION`; the bar and heading name the followed session. |
| Tab order and focus ring | Seven controls in order, each with a 2 px solid outline at 10.62:1; Shift+Tab goes back. |
| Keyboard only | Type a name, type part of an ID, choose with ArrowDown, Enter on Copy ID, Escape, Enter on Clear filters, Space on the example switch and back. |
| No matches | Stated; the followed session stays. |
| Markup as a saved name | Shown as text in the bar and the heading; no element made. |
| Accessible names from the browser's own accessibility tree | 4 buttons, 2 lists, 2 search fields, 3 landmarks, 6 graphics and gauges, all named. |
| Contrast | Live, no matches and example states at 1280, 600 and 360 px: 125 to 159 pieces of text each, lowest 6.61:1. |
| Layout | No sideways scroll and every control inside the viewport at 1280, 600 and 360 px; a focus ring inside the viewport for every control at 600 and 360. |
| Private text | No sentinel, path or transcript name in the page. |
| Console and policy | Nothing reported; the same control as in the host. |

Screenshots (synthetic titles only): `example-1280`, `example-360`, `live-1280`, `live-600`, `live-360`, `hidden-selection-1280`, `no-matches-1280`, `hostile-name-1280`. Host screenshots: `host-dark-family`, `host-light`, `host-example`, `host-no-matches`, `host-source-failure`, `host-large-family`.

## Defect found and fixed

**Station colours failed contrast on light themes.** The first host run measured 13 text items between 1.77:1 and 2.10:1 on Light Modern: the station numbers and counts in the map, and the `EDITED 3+ TIMES` marker. The seven station colours were fixed values chosen for dark backgrounds.

Fix: `media/style.css` gives light themes (`body.vscode-light`, `body.vscode-high-contrast-light`) a darker set, six lines. After it the lowest ratio on Light Modern is 4.78:1.

Regressions: the host check `webview: contrast in the default light theme` (required; failed on the first run, passes now) and the unit test `station colours reach WCAG AA as text on dark and on light backgrounds` (fails on the previous stylesheet: `artifacts/s09/baseline-before-change.txt`).

**Scope note for the reviewer.** `media/style.css` is outside the files listed for this card. The change is the smallest one that makes the required contrast check pass; nothing else in `media/` or `src/` changed.

A second defect was in the new runner itself: a result file holding `null` was judged a pass. The unit test `only a complete passing result…` caught it before the runner was used for a receipt.

## Measurement: the once-a-second message in the real webview

This was the open cost question from S08. Followed session: 10,500 calls in the main transcript and 24 subagents of 2,000 calls each, so the view holds its maximum (10,000 main events plus 24 lanes of 2,000).

| | Value |
| --- | --- |
| Events in one message | 58,000 |
| Message size | 6.47 MB of JSON |
| Messages received in 8 s | 8 |
| Time in the page's message handler | median 86 ms, longest 114 ms |
| Long tasks in the webview | 8 (one per message), longest 114 ms |

The view is busy for about a tenth of each second at the limit and stays usable. No change was made. Two runs gave 83 to 86 ms median and 98 to 114 ms longest.

## Observations, not changed

- The policy's style source in a real webview is `'self' https://*.vscode-cdn.net`. That is VS Code's own value. S08 read it from a stand-in and recorded "no wildcard"; scripts are still allowed by nonce only.
- VS Code's frame around the page logs `Unrecognized feature: 'local-network-access'.` once per webview. It comes from the editor, not the page, and is the only message set aside.
- A deleted followed session stays in the Session list as its own entry (by design in S03) and the activity area still reads "Loading history".
- At 1280 px the map panel stretches to the height of the right column and leaves a large empty area under the station totals (`artifacts/browser/live-1280.png`).
- Two subagent lanes whose agent IDs share their first eight characters show the same ID fragment (`synthchi` in the fixture).
- The followed session's notice repeats "Showing the 80 most recently written sessions of 93", which the status line already says.

## Not verified

- **Linux, VSCodium, remote and web hosts.** Not run. The runner reports the host as unverified and exits 2 off Windows.
- **A live AgentBoard caller.** The entry command was called from the test inside the same extension host. No AgentBoard button exists yet.
- **Screen reader output.** Names and roles were computed, not listened to.
- **High contrast themes and any theme other than Dark Modern and Light Modern.** The light set also applies to high contrast light; not measured there.
- **Contrast of graphics.** Only text was measured. Bars, dots and lines were not. Text in disabled controls and decorative marks is skipped and counted.
- **A narrow webview inside VS Code.** The host window gave the page about 850 px (two-column filter layout). 600 and 360 px were checked in the browser only.
- **Real transcripts.** None were read in this step. Earlier steps hold the local compatibility samples.
- **The clipboard in the default run.** Verified once with `--clipboard`; the default host check does not touch it.
- **Console messages of the later webviews.** The console check covers the first webview, which hosts all the view checks. The two webviews opened by the entry command checks were not included in it.
- **A Codex subagent** was not followed in the host. The selected child is a Claude subagent.
- The runner starts a visible VS Code window. It was not run on a locked or headless session.
