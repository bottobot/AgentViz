# AgentViz acceptance evidence (S09)

Taken 2026-11-12 on native Windows 11, Node v26.7.0, VS Code 1.146.0 (commit `69047191fc42`), Microsoft Edge 157.0.4341.42 headless. All source data is synthetic. No real transcript, title, path or ID was read, printed or saved.

## Receipts

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
