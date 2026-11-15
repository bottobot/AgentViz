# AgentViz UI exploration

Design study started 11 November 2026. Reviewable mock-ups completed 12 November 2026.

## Recommendation

**Selected direction, 12 November 2026:** Robert chose to develop Station landscape into a substantial animated, inspectable experience. The new `station.html` prototype implements landscape -> station -> resource -> event inspection, with synthetic inputs, outputs, API responses, error messages, patches, shell output, agent handoffs and plan updates. It has playback, a time scrubber, speed, an optional flat map, keyboard controls and reduced-motion support. Open it directly in a browser alongside `station.css` and `station.js`.

This follow-up uses a separate 42-call synthetic story with two errors, rather than the original gallery's fixed 76-call comparison snapshot. The moving signals, counters, resource lists and detail payloads all derive from the same example event list. No real session data or network calls are involved. The current extension's privacy boundary is unchanged; showing real inputs and outputs would require a separate explicit design decision about sensitive data.

Original recommendation before that selection: start with **Activity desk** as the everyday default. It puts the latest event, errors and context ahead of the visualization. **Station landscape** is the strongest candidate for a distinctive optional view. **Session filmstrip** is useful when understanding sequence matters enough to justify replay work.

These are design hypotheses, not results from user testing. The deliverable is a choice of directions, not a decision to ship all three.

## Open and compare

Open `index.html` in this directory directly in a desktop browser. No installation, server, build or network connection is needed. `mockups.css` must stay beside it. The gallery contains all three mock-ups, navigation between them, comparison notes and review tasks.

Working interactions:

- Activity desk: expand the shell-error disclosure.
- Station landscape: expand the plain-text category totals.
- Session filmstrip: select 14:18, 14:22 or 14:28; native radio controls also support arrow keys. Both the cursor and the historical detail panel change.

The session identifier, category totals, labels and times are invented. The isometric scene is an SVG drawing with a fixed perspective, not a 3D engine. The filmstrip is a three-keyframe demonstration, not a replay implementation. The station selection, discovery and live updates are not wired into these mock-ups.

## Shared scenario and data contract

The latest snapshot is an invented Codex session for AgentViz at 14:28, with a last record four seconds earlier. All options show 76 retained calls, one tool error recorded at 14:22, and 66% source-reported context usage. Category totals are Files 30, Edits 22, Shell 15, Network 3, Agents 3, Memory 3 and Other 0. The later successful shell call does not establish that the earlier error was resolved.

The filmstrip also shows two hypothetical earlier snapshots: 48 calls and zero errors at 14:18; 58 calls and one error at 14:22. The listed category totals sum to each snapshot's total. Historical context is unavailable in both, rather than borrowing the latest value. The category bands illustrate activity intervals; they do not encode exact event durations or a complete backing event fixture.

Grounding: the current `README.md`, `media/view.js` and `media/app.js` expose a session picker, seven tool categories including Other, retained-history counts, source-reported context, a thirty-minute activity strip and folded recent events. Current behavior distinguishes quiet, turn-complete and loading states. The pending orchestration work already lists project/name/ID filters and later capabilities. This exploration does not claim those features have shipped.

## The alternatives

| | 01 Activity desk | 02 Station landscape | 03 Session filmstrip |
|---|---|---|---|
| Main question | What is happening, and what needs a look? | Where is the activity concentrated? | What happened before and after this moment? |
| Visual structure | Summary above category bars and recent events | Six isometric stations around a session, with a text inspector | Category lanes, time cursor and selected-moment inspector |
| Interest | Calm, editorial hierarchy | A recognizable spatial identity | Change and sequence become explorable |
| Usability advantage | Exact values and errors are immediately readable | Stable locations help repeat users orient | Can revisit an error without losing its position in history |
| Main risk | Dashboard density | Depth or connectors mistaken for data meaning | Historical state mistaken for current state |
| Mitigation | Reveal event detail progressively | Equal-height stations, explicit numbers, plain-text equivalent | Prominent timestamp and Historical label; explicit return to latest |
| Relative effort | Small: existing data, new layout | Medium: SVG arrangement, station selection and keyboard focus | Largest: retained-event filtering, selection state and temporal data rules |

### 01 Activity desk

Keep the latest-event sentence and error count at the top. Give context a labeled meter, then place category counts and recent activity next to each other. Use the timeline as supporting context. On narrow panels, stack the two columns and retain session identity in the header. The mock-up's session rail is just the selected-session context; a production picker must remain accessible when the rail collapses.

Production interaction: choosing a category filters the event list and exposes a clear reset; opening an error reveals the safe normalized event metadata. Preserve folded events rather than dumping a transcript into the dashboard. Map the light prototype palette to VS Code theme variables, including high-contrast themes.

### 02 Station landscape

Use fixed positions and a fixed camera. The latest station gets a clear text marker as well as a highlight. Tool errors stay visible in both the scene and inspector. Station heights have no quantitative meaning. No concentric circles are required.

Production interaction: selecting or focusing a station changes the inspector; the same operation must be possible from a plain category list. Keep Other in the text totals and expose it when nonzero. Stack the inspector below the map in narrow views; prioritize the readable list if map labels become too small. Avoid orbit controls, automatic camera movement or mandatory animation. The prototype already has no continuous motion.

### 03 Session filmstrip

Interpret the optional “4D” direction as **activity plus time**, not literal four-dimensional geometry. Show the whole retained time window while the cursor determines the selected moment's details. Later activity remains visible as context; the selected snapshot's counts include only events at or before that time.

Production interaction: replace the three illustrative keyframes with a keyboard-accessible time control and event stepping. Show the selected timestamp in historical mode and a Return to latest action. Reuse the normalized retained events for category counts and errors. Do not invent historical context readings: the current top-level session context is insufficient evidence of past usage. Either retain timestamped usage records in a separate change or show Unavailable. Disclose when dropped history prevents earlier replay.

## States every chosen direction needs

| State | Required presentation |
|---|---|
| No selection / no discovered sessions | Clear picker or refresh action and Show example option |
| Loading history | Loading label; totals explicitly partial |
| Quiet | Last record age; no claim that the process is stopped |
| Turn complete | Source-reported turn completion; no claim the project is finished |
| Context absent | Unavailable with a short explanation; never zero or an estimated percentage |
| Malformed, oversized or omitted records | Existing warning and retention-limit disclosures remain visible |
| Tool error | Text and symbol alongside color; later successes do not erase it |
| Historical moment | Timestamp and historical label; clear return to latest |

These state rules are planned behavior, not additional screens in this first comparison gallery. Preserve the existing privacy boundary: no prompt text, thinking, command arguments, code or tool output. Real safe labels can still reveal file or project names. Never infer causal agent relationships from the map's decorative connectors.

## Review method

Review the three options in different orders across reviewers. Use the same latest snapshot and ask each person to:

1. Identify the latest recorded action and source session.
2. Locate the error and explain whether it is known to be resolved.
3. Read the context usage and distinguish it from task completion.
4. Identify the most-used category and its count.
5. For the filmstrip, visit 14:22 and return to the latest snapshot.

Record time to answer, incorrect interpretations, confidence from 1 to 5, and which view they would leave open beside their editor. Interest and usability are separate questions. A provisional target is correct answers to tasks 1–4 within 15 seconds each, no confusion between historical and latest state, and completion using keyboard alone. These targets have not been measured with users.

Choose the default based on reliable comprehension first. If the landscape attracts interest but causes errors, keep it optional and preserve the desk's text inspector. Do not commit to all three merely because they are shown here.

## Implementation boundary after selection

No extension source, dependencies, test fixtures, exports or runtime configuration were changed for this exploration. The new files live under `docs/`, which the existing VSIX exclusions already omit.

For a selected production direction, the expected reach is `media/view.js` for markup, `media/style.css` for layout and themes, `media/app.js` for UI state and controls, and `test/view.test.js` for rendering behavior. Review `src/webview.js` for the webview shell and CSP if new assets are introduced. Keep the existing message contract and sanitization. Replay with historical context could additionally touch `src/transcript.js` and its tests; make that a separate explicit scope decision. Update README behavior descriptions after implementing the chosen option.

Validate with the existing unit and syntax checks, then the VS Code extension host at normal and narrow panel widths, high contrast, keyboard navigation and reduced motion. A standalone browser mock-up does not prove extension integration or real-session behavior.

## Verification of this deliverable

The gallery was opened directly from disk in Chrome and all three desktop mock-ups were visually inspected. The shell-error disclosure opened correctly. Radio selection and keyboard arrow navigation displayed exactly one corresponding historical panel and returned to the latest snapshot. No HTTP or HTTPS resource requests were observed. Responsive checks and final artifact checks are recorded in `VERIFICATION.md`.

No real-session integration, full replay engine, user usability study, screen-reader audit, or VS Code theme validation was performed. Those remain part of selecting and implementing a direction, rather than evidence for this mock-up deliverable.
