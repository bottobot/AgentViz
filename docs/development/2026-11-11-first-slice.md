# AgentViz first working slice

The handoff and research establish the purpose: make the activity of long coding sessions readable in its own VS Code tab. This implementation starts as a separate extension in this workspace. Windows is the first verification target. Claude Code and Codex transcripts are the initial sources. AgentBoard integration and Linux verification follow after the core view works.

## Design

Use plain CommonJS JavaScript, Node builtins and the VS Code webview API. There are no runtime dependencies, servers, databases, model calls or hooks. A contributed command opens one editor tab. A session picker lists recently modified transcripts from the user's local Claude projects and Codex sessions folders. Optional machine settings select alternate configuration roots.

The host discovers paths without following symbolic links. It polls while the tab is open, reads appended bytes of selected transcripts and resets on replacement or observed truncation. It compares the first and last 4 KB previously read to detect common rewrites that regrow between polls. Mutations wholly between these samples require Refresh, which rereads the selected transcript. Partial UTF8 sequences and unfinished JSON lines wait for subsequent bytes. Unknown record types are skipped. Malformed complete records are counted and reported. Scan and history limits are visible in the UI and documentation; the view never implies full history when a limit applies.

Adapters normalize Claude tool_use/tool_result records and Codex response_item calls/results into one event list. User turns, completed turns and compactions produce markers. Context is shown only when the source provides both usage and capacity; no guessed percentages. Provider duplicate records must not double count tool calls. A quiet transcript means no recent writes, not proof that its process stopped.

The webview gets sanitized events and session names only. Prompt text, tool output, command arguments, code, URLs with paths or queries, and full source paths stay out of messages and HTML. Tool labels use safe names, file labels use their last two path parts, and network labels use a hostname only. Messages from the webview select only IDs already in the discovered list. A restrictive CSP and local resource roots protect the tab.

The display consists of a fixed stations map, category totals, a fixed time bucket activity strip with visible silence, and a folded recent event list. A clearly marked synthetic example makes the visual reviewable without exposing private sessions. Source failures and absence of sessions have usable empty states. Follow on append, selection, reload, disposal, keyboard controls, theme colors and reduced motion must work.

## Acceptance checks

1. Both transcript formats produce tool starts, outcomes and lifecycle markers without leaking payload text.
2. Appended, partial, malformed, truncated and replaced JSONL files do not break updates or silently fabricate counts.
3. Only the selected source is parsed; discovery errors and any history limits are visible.
4. Map and timeline use the same event counts. Timeline bucket positions stay fixed as new events arrive.
5. Opening the command creates one tab, switching sessions changes its contents, and closing it stops background polling.
6. Unit tests, a real local transcript probe, browser visual inspection, a VS Code extension host smoke test and VSIX packaging establish separate evidence.

## Implementation plan

1. Write failing parser and incremental read tests using synthetic fixtures. Implement src/transcript.js and src/sessions.js, then run those tests. Keep labels content free and count parse failures.
2. Write failing view tests for totals, timeline buckets, empty state and escaped HTML. Implement media/view.js as a pure renderer, media/app.js as the message/controller layer, and media/style.css for the layout.
3. Implement src/extension.js with one webview, validated selection messages, asynchronous refresh and complete disposal. Add README instructions and the development launch configuration.
4. Run tests and syntax checks, exercise real transcripts without printing payloads, inspect the rendered example in a browser, run the local VS Code extension host, and package a local VSIX. Record what each check covers and any gaps.

## Deliberate limits

No task completion percentage is inferred from tool counts. Subagent lanes, todo progress, file footprint, AgentBoard card links, replay controls and multi account autodiscovery are outside this first slice. Parent and child metadata is retained where available so later work does not need to reinterpret the source. The first slice lists the 80 most recently modified transcripts and retains 10000 normalized events per selected session; both limits must be disclosed in the UI.

## Verification on 11 November 2026

All four implementation steps are complete for this slice.

The 20 Node tests cover provider adapters, content free labels, duplicate calls, fixed time buckets, escaping, incremental writes, partial UTF8 and JSON, malformed timestamps, oversized lines, history limits, truncation and replacement, sampled rewrite detection, source configuration races, validated selection and polling disposal. Syntax checks pass for all production JavaScript files.

A read only probe discovered more than 3500 local transcripts in under one second and parsed one recently modified Claude transcript and one Codex transcript. Neither selected file reported malformed or oversized records. Only aggregate counts were retained as evidence. This is a source compatibility sample, not verification of every archived session or provider version.

The emitted example was rendered and visually inspected in Chrome. Both SVG views loaded; desktop and a 420 pixel emulated viewport had no horizontal overflow. The example toggle and empty state worked, and the browser reported no console errors. A desktop screenshot is retained locally in the ignored artifacts folder. This does not establish physical device behavior or every VS Code theme.

The real Windows VS Code 1.146.0 extension host passed command activation, editor creation, reuse of one panel, closure and reopening after disposal. It used an isolated test profile and synthetic source folders. The host smoke test does not automate a real session's full interactive history.

A local VSIX is produced with only the extension's production files and README. Development dependencies, transcripts, research, tests and artifacts are excluded. The extension has not been published or installed in the user's normal VS Code profile. npm audit reported zero vulnerabilities after overriding the packaging tool's minimatch dependency to its fixed release series.
