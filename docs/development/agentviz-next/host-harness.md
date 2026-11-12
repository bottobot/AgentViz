# P01 receipt: isolated Windows host harness

Card `0fb23c`, branch `task/0fb23c`, parent plan card `6e96a7`. Taken 2026-11-12 on native Windows 11, Node v26.7.0.

## What was added

| File | Purpose |
| --- | --- |
| `test/run-extension-host.cjs` | Launcher for the existing host suite `test/extension-host.js`. |
| `test/run-extension-host.test.js` | Its dedicated regressions. Starts no editor. |
| `docs/development/agentviz-next/host-harness.md` | This receipt. |

Nothing else was changed: no production file, `package.json`, `workflows/checks.json`, shared ledger or `test/extension-host.js`.

## Runner

```
node test/run-extension-host.cjs [--keep] [--timeout=<seconds>] [--clipboard] [--receipt=<file>]
```

Exit codes: 0 passed, 1 failed, 2 unverified (not native Windows, or no usable VS Code). There is no npm script for it, because `package.json` is outside this task.

What one run does, in order:

1. Removes the receipt of any earlier run.
2. Reads the source revision from Git: commit, branch and uncommitted files. If Git cannot answer, the run fails.
3. Off native Windows, stops as unverified without looking for anything.
4. Locates `Code.exe` (per-user install, then Program Files; `AGENTVIZ_VSCODE` overrides and is then the only candidate) and verifies it from the install's own product and package records against `engines.vscode`. It is not started to be verified.
5. Creates a new `agentviz-host-*` folder under the system temporary folder holding the profile, extensions folder, workspace, synthetic source folder and result path. It refuses a folder that overlaps a normal editor profile.
6. Starts VS Code with `--user-data-dir` and `--extensions-dir` inside that folder and `--disable-extensions`. Both AgentViz source settings point at the empty synthetic folder; the suite writes its own synthetic transcripts there.
7. Waits for the process to exit (default limit 240 s), then for the suite's explicit result file.
8. Fails when the result is missing, older than the launch, unreadable, not a record, failed, missing a required check, names another VS Code version, or the exit code is not 0.
9. Stops only the child it started and processes that carry this run's folder on their command line.
10. Removes the run folder (unless `--keep`) and writes the receipt.

The launch arguments, isolation check, verdict rules, required check list and stop rule are reused from `test/host-runner.js`, not copied. So the required list follows whatever the integrated host suite later declares there. The runner adds the source revision, the wait for the explicit result, the stale-result rule and the receipt.

The normal editor profile is never named on the command line and never written. The runner also records whether the normal profile's `settings.json` changed in time or size during the run, as an observation.

## Dedicated regressions

`node --test test/run-extension-host.test.js`: 8 tests, 8 pass, 0 skipped on Windows. They use invented install folders, invented Git answers and a stand-in Node process.

| Test | Covers |
| --- | --- |
| executable selection is platform guarded and verified | No lookup off Windows; install order; too-old install passed over; explicit override is the only candidate; another program refused. |
| the source revision is read from Git | Clean, dirty, no answer, not a commit ID, unreadable status never read as clean. |
| a missing, stale, unreadable, failed or incomplete result is a failure | Every verdict rule, including a passing record with a failing exit code and an optional check listed as unverified. |
| a run uses new isolated folders and waits for the explicit result | New empty run folder; leftover result removed; late result waited for; failed result; stale result; program that cannot start; folders outside the run refused; stop only asked for this run's folder. |
| a run folder that would sit in a normal editor profile is refused | Refused and not left behind. |
| a hung host is stopped, and only the process this run started | Real timeout and stop; a bystander process of another run survives. Skipped off Windows. |
| cleanup removes this run's folder and refuses everything else | Neighbour run, other prefix, temp root, home, checkout and normal profile paths refused. |
| without a usable host the run is reported unverified | Exit 2 off Windows and with a missing executable; old receipt replaced; receipt still names the source revision. |

## Baseline calibration

One real run of `node test/run-extension-host.cjs`.

| Item | Value |
| --- | --- |
| Result | PASSED, exit 0 |
| Source revision | `20642f2a652c765e2ed2a9ed2d98c8d4b959aad6`, branch `task/0fb23c`, no uncommitted files |
| What that revision is | Baseline `a9f9799` plus the runner and its test only. `src/`, `media/` and `test/extension-host.js` are identical to `a9f9799`. |
| VS Code | 1.146.0 (commit `69047191fc42`), per-user install |
| Checks | 31 of 31 required passed, 0 failed |
| Not run | `webview: Copy ID reaches the clipboard` (optional; needs `--clipboard`, which overwrites the clipboard) |
| Time | 49.8 s |
| Result freshness | Written during the run (`staleResult: false`) |
| Normal profile | `settings.json` unchanged during the run |
| Processes stopped after exit | 0 |
| Run folder removed | yes |
| Receipt written | 2026-11-12T11:55:16Z |

Receipt (local, git-ignored): `artifacts/host/run-extension-host-receipt.json`, SHA-256 `066782A1EF36345AAD830363927C3549B2534E69BFBD445716F1A50AB468F9B2`. Screenshots with synthetic titles: `artifacts/host/shots/`.

Scope: this calibrates the runner against the host suite as it stood at that revision. It does not accept any feature added later. The final Windows acceptance task must run the runner again on the integrated revision.

The suite itself reported one finding, unchanged from the earlier evidence: with a family at full retention the view blocks for up to 278 ms on each once-a-second message of 6,467,019 bytes.

The console output of the calibration run was not captured: the shell could not open the log file, while the runner itself ran to the end. The figures above are read from the receipt the runner wrote.

## Checks

| Check | Command | Result |
| --- | --- | --- |
| syntax | `npm run check` | exit 0 |
| runner syntax | `node --check test/run-extension-host.cjs` | exit 0 |
| unit | `npm test` | exit 1: 139 tests, 138 pass, 1 fail |

The one failing unit test is `the README that ships in the package describes this release and carries no orchestration material` in `test/package.test.js`. It fails at the baseline `a9f9799` without this task's files: `README.md` line 7 names `workflows/agentviz-next.parallel.plan.json`, which that test forbids. Both files are outside this task, so it was left alone. It needs a decision from whoever owns `README.md`.

## Not verified

- Linux, VSCodium, VS Code Insiders and a system-wide install: not run. Off Windows the runner reports unverified.
- The clipboard check: not run.
- A real hung or crashed VS Code: the stop rule ran against a stand-in process only. The calibration needed no stop.
- Staleness is judged by the result file's modification time against the launch time. The suite does not echo a run token, and `test/extension-host.js` is outside this task.
- Features after `20642f2`: not covered.

## Next action

The Windows acceptance task reruns `node test/run-extension-host.cjs` on the integrated revision and decides whether to add an npm script and a `workflows/checks.json` entry for it.
