# AgentViz concepts: eight new ways to show the stations map idea

Built 2026-11-12. Eight separate, working views of one live session. Each shows how the session moves data
between processes, where the data ends up, and in what condition (error codes, outputs, context files,
references). None of them reuses the stations map layout. They are meant to be mined: pick the best parts later.

## How to open

- **All of them:** double-click `docs/concepts/index.html`. It is a launcher with one card per concept.
- **One of them:** double-click `docs/concepts/<folder>/index.html`.
- Any desktop Edge or Chrome works from disk. No install, no server, no build, no network.
- The reference stations map is in VS Code: F5 → Run AgentViz → `AgentViz: Open Activity` → Show example.

Every page has Pause, speed 0.5x–4x, and a Live / Inspecting indicator. Click anything to drill down
(Tab + Enter works too). Esc closes or returns to live.

## The eight concepts

| Folder | Concept | What it shows | Colors |
|---|---|---|---|
| `01-circuit` | Circuit Board | A PCB. The model is a CPU; each tool kind is its own chip; files are flash chips; context is a capacitor bank that discharges on compaction. Data runs as pulses on copper traces. Errors scorch the part and leave a code tag; retries are jumper wires. Logic-analyzer timeline. | Solder-mask green, copper, gold, scorch red |
| `02-watershed` | Token Watershed | Data is water, left to right: springs (prompt, context files, disk, web) → river features per tool → reservoirs (context lake, file reservoirs, terminal pool, task terraces). Stream width = tokens moving now. Errors are silt buoys; retries loop upstream. | Dusk indigo, glacial teal, lavender, ochre |
| `03-factory` | Conveyor Factory | Side view of a factory. Each call is an item shaped by kind, riding belts through its machine to shelves (files), a silo (context), a printer (terminal), a job board (tasks) or a subagent annex. Errors go to a reject bin with a stamped code. | Concrete grey, safety orange, blueprint navy |
| `04-score` | Session Score | A live orchestral score. Lanes are instrument sections, each kind its own notation; duration = call time; slurs = cause links; crimson X notes = errors with codes; repeat signs = retries. Glyphs fly to a margin summary. Light theme. | Cream paper, ink, crimson, ochre, prussian blue |
| `05-cell` | Living Cell | A cell under a microscope. Nucleus = model; membrane = context window; organelles = tools; files are colonies outside; subagents bud off as daughter cells; errors are viruses with code tags that retries engulf. | Plum, bioluminescent magenta and lime |
| `06-galaxy` | Code Galaxy | A star chart organized by where data lives: files are stars grouped by folder. The agent is a craft flying between them with a trail; subagents are probes. Edits flare stars; errors are supernova scars. Zoom, pan, scrub the flight recorder to replay. | Black space, ice blue, violet nebula, crimson |
| `07-console` | Mixing Console | A studio desk. One channel strip per tool kind and per subagent, with meters, clip LEDs (error codes), mute/solo filters. A patch bay draws every data hop as a cable. Context is the master bus. Rewinding the tape rewinds the whole desk. | Aluminium, walnut, primary-color cables, LED |
| `08-departures` | Departures Hall | Every call is a flight on split-flap Departures / Arrivals boards, plus a route map: Disk continent, Context mega-airport, Terminal, Plan tower, Web region, subagent airfields. Errors divert to a NOTAM; retries fly a go-around. | Matte black, signage yellow, off-white |

All eight carry at least the stations map's detail: counts per kind (all seven, including Other), errors per
kind since the last prompt, active kind, context % with amber 70 / red 90 and its history, task list progress,
file footprint (reads, edits, failed, hot files), folded recent activity, agent lanes with nesting, and a
30-minute activity strip with error ticks and prompt / turn / compaction markers. Drill-downs add what the map
lacks: tool input, output preview, exit codes, test results, diffs, tokens, every flow hop, references, cause
chains and retries.

## Data

All pages run one simulated session, `shared/sim.js` (seed 7, 30 minutes of history, then live at about one call a
second). The data is richer than today's transcript reader on purpose: tool inputs, outputs and diffs. The
current view's privacy rule (names only) is not applied here; that is a back-end decision for later.

## Files

- `index.html`: launcher.
- `shared/sim.js`: the simulated session (the data contract every concept reads).
- `shared/BRIEF.md`: the brief each concept was built against.
- `shared/check.js`: opens a page in headless Edge or Chrome and reports console errors, plus whether it moved.
  Usage: `node docs/concepts/shared/check.js docs/concepts/01-circuit/index.html --wait 6`.
- `0N-*/`: one folder per concept, each with `index.html` plus its own `.js` and `.css`.

## Verification

On 2026-11-12, `check.js` ran on all eight pages with 30 minutes of history. Every run exited 0 with no console
errors, and the two screenshots differed (the page moved). Each builder also ran a drill-down click check and a
1280×800 check. Screenshots are in `artifacts/concepts/<folder>/` (ignored by git).

Not done: no user testing, no VS Code webview integration, no screen-reader audit.

## Known rough edges

- 01: three daughterboard sockets; extra running subagents route through the socket controller. The header gets
  cut off at 1280 wide.
- 02: subagent streams sometimes cover valley labels.
- 03: small floor labels at 1280 wide; only the 5 newest annexes are drawn.
- 04: labels crowd when short shell calls and retries cluster; hover tooltips can reset on redraw.
- 05: labels crowd when the cell is small; inspecting a moment does not rewind the cell.
- 06: labels overlap in the test folder; inspecting replays the chart only, not the side panels.
- 07: the lowest patch-bay row gets crowded; cables are not reachable with Tab.
- 08: map labels crowd when all 12 airfields are used; with reduced motion on, planes that are still running
  keep circling.
