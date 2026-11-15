# AgentViz parallel revision execution record

Corrected 15 November 2026 from Git history. The earlier text of this file said the parallel plan was "prepared, not launched". That was true when it was written and stopped being true the same day.

## What happened

The parallel plan (**AgentViz: parallel find and follow sessions**, now `workflows/archive/agentviz-next.parallel.plan.json`) was launched on 12 November 2026 under plan card `6e96a7`, after the serial run `a40b39` had already delivered all ten outcomes. Its three starting tasks ran on top of that finished work. No later task ran.

| Task | Card | Commits | Outcome |
| --- | --- | --- | --- |
| metadata (S01) | `5c588b` | `f225e43`, record `23585bc` | The fields already existed. It added a second, "frozen" filter request format on the host. Receipt: `agentviz-next/metadata.md`. |
| filters (S02) | `280712` | `67d8ed5`, record `a7f4bf0` | The filter UI already existed. It taught the view to speak both request formats. Receipt: `agentviz-next/filters.md`. |
| host-harness (P01) | `0fb23c` | `20642f2`, record `487d186` | A second host runner beside `test/host-runner.js`. Receipt: `agentviz-next/host-harness.md`. |
| discovery and the seven tasks after it | none | none | Not run. The serial run had delivered them. |

All three reached `task/6e96a7` (metadata and filters by the merges `9840479` and `830a496`, the harness commits directly) and from there `feat/first-activity-view`.

This table is read from `git log`. The board's own card records were not read for it.

## What was done about it on 15 November 2026

The join task that would have finished the frozen format never ran, so the code carried two request formats and two host runners. Both leftovers were removed:

- The frozen request format is gone from `src/extension.js` and `media/app.js`. The view and the host speak the one `{ seq, workspaceKey, name, id }` form again. The tests that only covered the frozen form were removed; the three in `test/app.test.js` and the one in `test/metadata.test.js` that cover behaviour of the one remaining form were kept and now ask in that form.
- `test/run-extension-host.cjs` and its test were deleted. `npm run host` (`test/host-runner.js`) is the one runner.
- The parallel plan file moved to `workflows/archive/`, so **Run a Plan** no longer offers it. `test/plan-parallel.test.js` reads the archived file. The serial plan file was left where Git has it: in the main folder it had already been moved to `workflows/archive/` after its run finished, as a change that is not committed, and that change is not this card's to make.

Nothing in this plan is pending. Do not launch it again: its outcomes are delivered.
