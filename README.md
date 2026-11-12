# AgentViz

A live picture of local Claude Code and Codex sessions in a separate VS Code editor tab.

The next batch is available in AgentBoard's **Run a Plan** list as **AgentViz: find and follow sessions**, from `workflows/agentviz-next.plan.json`. It starts with project/workspace, session name and session ID filtering. `ORCHESTRATION.md` supplies the product brief, and `docs/development/agentviz-next-run.md` tracks the prepared, not launched state. These planned features are not part of the current first slice yet.

The first version provides a session picker, a fixed stations map, category counts, a context meter when the source reports one, a thirty minute activity strip, and folded recent events. An example session lets you explore the view without displaying real session activity.

## Run during development

Requires desktop VS Code 1.96 or newer. Node 22 or newer is needed for the development packaging tool.

1. Open this workspace in VS Code.
2. Press F5 and select **Run AgentViz**. This opens an Extension Development Host.
3. In that window, run **AgentViz: Open Activity** from the Command Palette.
4. Pick a local session. Use **Show example** to inspect the synthetic example.

There is no compilation or dependency installation required to run the extension. The development dependencies are used to package a VSIX.

## Sources and privacy

AgentViz reads the projects folder inside your local `.claude` directory and the sessions folder inside your local `.codex` directory. Use the machine settings `agentviz.claudeRoot` and `agentviz.codexRoot` for other configuration folders. No configuration files, credentials or environment variables are read by AgentViz.

Discovery scans transcript metadata and lists the 80 most recently modified sessions, including child transcripts as separate entries. An already selected session stays available if newer sessions move it outside the list. The selected transcript is read incrementally about once per second while the tab is visible. New sessions are discovered about every ten seconds or on Refresh. Closing the tab stops polling.

The webview receives tool categories, safe names, file names with at most two path parts, hostnames, timestamps and outcomes. Prompt text, thinking text, code, command arguments, full source paths, URL paths and queries, and tool output are excluded. Labels still reveal project names, file names and hostnames, so treat screenshots of real sessions accordingly.

The extension makes no network requests, uses no model tokens, installs no hooks, starts no server, opens no port and writes no transcript files. The view uses plain SVG and local CSS and JavaScript. There are no runtime dependencies.

## Opening a session from another extension

Another extension in the same VS Code window can open AgentViz on one local session with the command `agentviz.openSession`. It is not in the Command Palette. **AgentViz: Open Activity** (`agentviz.open`) is unchanged and ignores any argument.

The IDs below are synthetic.

```js
const result = await vscode.commands.executeCommand('agentviz.openSession', {
  provider: 'claude',                                  // 'claude' or 'codex'
  sessionId: 'aaaaaaaa-1111-4222-8333-444444444444'    // the provider's full session ID
});
// { ok: true, provider: 'claude', sessionId: 'aaaaaaaa-1111-4222-8333-444444444444' }

await vscode.commands.executeCommand('agentviz.openSession', { provider: 'codex', sessionId: '0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee' });
```

The argument is exactly `{ provider, sessionId }`:

- `provider` is the string `claude` or `codex`.
- `sessionId` is 1 to 128 letters, digits, `_` or `-`. For Claude it is the transcript's session ID (or a subagent's agent ID). For Codex it is the thread ID at the end of the rollout file name. Case is ignored.
- Any other field, type or character is refused. There is no way to pass a file path, a folder or a filter.

The session is looked up in the configured source folders, across all transcripts and not only the 80 listed, so an older session can be addressed. The transcript path always comes from that folder listing.

The command resolves to one of:

| Result | Meaning |
| --- | --- |
| `{ ok: true, provider, sessionId }` | The tab is open (created or reused) and follows that session. The view fills in on its next refresh. |
| `{ ok: false, reason: 'invalid-argument' }` | The argument was not a valid address. Nothing was looked up. |
| `{ ok: false, reason: 'not-found' }` | No transcript of that provider has that ID. A fragment of an ID does not match. |
| `{ ok: false, reason: 'source-unavailable' }` | The session was not found and that provider's folder is missing or unreadable. |
| `{ ok: false, reason: 'superseded' }` | A newer call, or a change to the source settings, arrived while this one was looking. |

A refused call opens no tab and leaves an open tab on its current session. The command shows no message of its own; the caller decides what to tell the user. Calling it twice opens one tab. If one ID exists in two transcripts of a provider, a session's own transcript is preferred to a subagent's, then the most recently written. The result never contains a path, a name or a project.

A caller should check that the extension `agentviz-local.agent-viz` is installed before offering the action. No AgentBoard caller exists yet; adding one is a change in that project.

## Reading the view

The six stations stay in fixed positions: files, edits, shell, network, agents and memory. Thicker spokes mean more recorded calls. A station with recent activity is highlighted. A red station dot marks tool errors since the last user prompt. Unknown tool types count as Other.

Each activity bar covers a fixed thirty second interval. Height indicates call volume, color indicates the dominant category, red ticks indicate tool errors, and dots indicate user prompts, turn boundaries or compactions. Empty intervals remain visible. The strip covers the last thirty minutes; category counts cover the loaded, retained history.

Quiet means no transcript records for thirty seconds. It is not a process health check. Turn complete means the source recorded a completed turn, not that the whole project is finished. Context is unavailable unless a source provides usage and capacity. Claude context is currently unavailable.

## Development checks and packaging

```powershell
npm ci --ignore-scripts
npm test
npm run check
npm run package
```

Packaging creates `agent-viz-0.1.0.vsix` in the workspace. To try that package in your normal VS Code installation, use **Extensions: Install from VSIX**. The package uses a local publisher identifier and is not published to a marketplace.

The unit tests use synthetic transcripts. `test/extension-host.js` runs inside VS Code's extension test host to check command activation, a single editor tab, closure and reopening. With `AGENTVIZ_HOST_FIXTURE` set to an empty folder that an isolated profile's `agentviz.claudeRoot` and `agentviz.codexRoot` point at, it also checks `agentviz.openSession` on synthetic transcripts; the header of that file gives the launch arguments. The retained development evidence is in the ignored artifacts folder.

The packaging dependency overrides minimatch to a fixed upstream release series because VSCE 4.1.0 otherwise resolves a version flagged by npm audit. These packages are excluded from the VSIX.

## Limits of the first slice

Transcript formats are undocumented and may change. Unknown record types are skipped. Damaged JSON lines are counted and reported. Records above 4 MB are skipped with a visible warning. Each refresh reads at most 8 MB, with a loading state while earlier history catches up. At most 10000 normalized events are retained per selected session, and omitted history is disclosed. The map and strip use those retained events.

A 64 KB header preview supplies session picker project names. A large first record can leave the project name unavailable until the session is selected. Symbolic links encountered during directory discovery are not followed. Rewrite detection compares the first and last 4 KB previously read. Edits wholly between those samples can be missed; Refresh rereads the selected transcript from the beginning.

Shell errors are detected from structured error fields and explicit exit codes; unknown result formats can miss errors. A Codex exec wrapper can contain multiple nested tools. AgentViz counts the recorded outer call once and uses the inner tool names only for its category.

Subagent lanes, todo progress, file footprint, AgentBoard card links, replay controls, automatic discovery of additional account folders, and Linux verification remain for later slices. No borrowed source code is included; the initial direction comes from the research and handoff already in this workspace.
