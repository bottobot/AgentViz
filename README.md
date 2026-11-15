# AgentViz

A live picture of what your Claude Code and Codex sessions are doing, in its own VS Code editor tab.

A long agent run is hard to follow as a wall of text. AgentViz reads the transcripts that Claude Code and Codex already write on your machine and draws them: where the work went, which subagents ran and when, how far the agent's own task list has got, which files it touched, and what happened over the last thirty minutes.

It reads local files only. It makes no network requests, uses no model tokens, installs no hooks, starts no server and opens no port.

![The AgentViz tab showing the built-in synthetic example session](https://raw.githubusercontent.com/bottobot/AgentViz/feat/first-activity-view/docs/images/agentviz-example.png)

*The built-in example session. Every name in it is synthetic.*

Status: version 0.3.0, a preview. Verified on Windows 11 with desktop VS Code. Linux and VSCodium are not verified. It is not in the VS Code Marketplace; install it from the release file. See [Limits](#limits).

## Contents

- [What it shows](#what-it-shows)
- [Install](#install)
- [Use](#use)
- [Settings](#settings)
- [Finding a session](#finding-a-session)
- [Reading the view](#reading-the-view)
- [Sources and privacy](#sources-and-privacy)
- [Opening a session from another extension](#opening-a-session-from-another-extension)
- [Run from source](#run-from-source)
- [Development checks and packaging](#development-checks-and-packaging)
- [Limits](#limits)
- [Licence](#licence)

## What it shows

- **Where the work went.** A map of six fixed stations (files, edits, shell, network, agents, memory) with a count of the calls made to each, and a red dot after a tool error.
- **Agent lanes.** The session and its subagents on one time axis, so you can see what ran in parallel and what ended.
- **Task list progress.** Completed of total and the current item, taken from the agent's own task list.
- **File activity.** Reads and edits per file, with a flag on files edited three or more times.
- **Activity over time.** The last thirty minutes as a strip of bars, with marks for prompts, errors and compactions.
- **Context window.** How full it is, when the source reports it.
- **Details on click.** Click a station, a lane, a file or a bar to list the calls behind it, then one call to read its input, output, timing and tokens from the transcript.
- **An example session.** Synthetic data, so you can explore the view, or show it to someone, without showing real activity.

It follows both Claude Code and Codex sessions, and it never switches session on its own.

## Install

Requires desktop VS Code 1.96 or newer. Nothing else: the extension has no runtime dependencies and needs no compilation.

1. Download `agent-viz-0.3.0.vsix` from the [latest release](https://github.com/bottobot/AgentViz/releases/latest).
2. In VS Code, open the Extensions view, choose **...** at its top, then **Install from VSIX...**, and pick the file. Or run this in a terminal:

   ```powershell
   code --install-extension agent-viz-0.3.0.vsix
   ```

3. Reload the window when VS Code asks.

Good to know:

- The extension's identifier is `agentviz-local.agent-viz`. It is not in the Marketplace, so it does not update itself. To update, install a newer VSIX over it.
- It runs on your own machine, beside the editor's interface. In a remote window it still reads the transcripts on the local machine.
- It is switched off in a workspace you have not trusted (Restricted Mode).
- To remove it, uninstall **AgentViz** in the Extensions view. It writes no files of its own; the only thing it stores is the ID of the session you last followed, in VS Code's own workspace storage.

You can also build the VSIX yourself: see [Development checks and packaging](#development-checks-and-packaging).

## Use

1. Click the AgentViz icon in the activity bar, then **Open Activity**. Or run **AgentViz: Open Activity** from the Command Palette. The view opens as an editor tab.
2. Pick a session in the **Session** list. By default the list holds the sessions that are running now in the workspace open in this window. Start a Claude Code or Codex session in that folder and it appears within about ten seconds, or press **Refresh**.
3. Watch. The view updates about once per second while the tab is visible.
4. Click a station, a lane, a file or a bar to see the calls behind it. Escape closes the details panel.

If the list is empty:

- **Show example** shows the synthetic example session. **Return to live** goes back.
- To see sessions that have ended, set `agentviz.sessions` to `all`.
- To see sessions from every project on the machine, set `agentviz.scope` to `all`.

The gear in the AgentViz sidebar, and **Settings** in the tab, open these settings.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `agentviz.sessions` | `live` | `live` lists only sessions that are running now. `all` lists past sessions too. |
| `agentviz.scope` | `workspace` | `workspace` lists only sessions recorded in a folder of the open workspace, or below one. `all` lists every session in the configured folders. With no folder open, every session is listed. |
| `agentviz.claudeRoot` | empty | The Claude configuration folder. Empty means the `.claude` folder in your home folder. |
| `agentviz.codexRoot` | empty | The Codex configuration folder. Empty means the `.codex` folder in your home folder. |

The two folder settings are machine settings: set them in your user settings, not in a workspace. [Sources and privacy](#sources-and-privacy) says exactly what is read from each folder and how "running now" is decided.

## Finding a session

The filters are, in order: **Project / workspace**, **Session name**, **Session ID (optional)**, then the **Session** list.

- **Project** is the working directory recorded in the transcript. Two directories with the same name stay separate and get longer labels. **All projects** removes the filter.
- **Name** is the title the provider saved: a Claude custom title, else a Claude generated title, else the Codex thread name. A session with none reads `Unnamed session`. Prompts are never used as a name.
- **ID** matches the full session ID or any part of it.
- Name and ID ignore case and surrounding spaces, and both apply inside the chosen project.
- Each entry reads `project › name · ID · provider · time`. Sessions with the same name are told apart by project and ID.
- The bar under the filters names the followed session with its full ID. **Copy ID** copies it.
- Escape empties a filter. **Clear filters** resets all three.

Filters run over every transcript found, before the list is cut to the 80 most recently written matches. So an old project or an old ID can be found. The status line says how many sessions exist, how many match, and what is still being read.

The followed session never changes on its own. If a filter hides it, it stays followed and the bar says it is hidden. If it is renamed, gets new activity or drops out of the newest 80, only its label changes. If its transcript is deleted, it stays named and is reported as missing.

## Reading the view

- **Where the work went.** Six fixed stations: files, edits, shell, network, agents, memory. Thicker spokes mean more recorded calls. A red dot marks tool errors since the last user prompt. Unknown tools count as Other.
- **Agent lanes.** The followed session first, its subagents indented under it, on one time axis. A lane shows an end only where the source recorded one; otherwise it says "No end recorded". Codex parents do not record a child's end.
- **Task list progress.** Completed of total, plus the current item, from the agent's own task list (`TodoWrite`, `TaskCreate`/`TaskUpdate`/`TaskList`, Codex `update_plan`). It is the agent's plan, not measured project completion. With no list record it reads "Unavailable"; tool activity is never used to estimate progress.
- **File activity.** Reads and edits per file from structured file tools, twelve files ranked, with `EDITED 3+ TIMES` after three recorded edits. Labels are at most the last two path segments.
- **Activity over time.** Thirty minutes, one bar per thirty seconds. Height is call volume, colour is the dominant kind, red ticks are tool errors, dots are prompts, turn ends and compactions.
- **Context window.** Shown only when the source reports usage and capacity. Claude context is currently unavailable.
- **Details on click.** Click a station (or its total), a Recent activity row, a lane name, a file or a bar. A panel on the right lists the calls behind it, newest first; choose one to read it from the transcript: the tool and its full input, its output, start, finish and duration, the model, the token counts, the prompt that started the turn and the agent's messages around it. Long texts are cut at 24,000 characters and the panel says by how much. Escape or Close shuts the panel and removes its text from the page.

One counting rule applies everywhere: totals cover the followed session plus the subagent lanes shown, over loaded, retained history. Each call counts once, in the lane of the agent that made it. Starting a subagent counts in the parent's lane. The headings state the scope.

Quiet means no transcript records for thirty seconds. It is not a process health check. Turn complete means the source recorded a completed turn, not that the project is finished.

## Sources and privacy

AgentViz reads the `projects` folder inside your local `.claude` directory and the `sessions` folder plus `session_index.jsonl` inside your local `.codex` directory. To tell which Claude sessions are running it also reads the process ID and session ID from the `sessions` folder inside `.claude`, and nothing else from it.

Only live sessions are listed (`agentviz.sessions`: `live`, the default). A Claude session is live while its Claude Code process is running. Codex keeps no such record, so a Codex session is live while its transcript was written in the last 10 minutes; the same rule applies to Claude when the `sessions` folder is absent. A Claude session run from another configuration folder (another account) is not seen as running. A subagent is a lane of its session, not a row in the list. A session you are following stays followed after it ends. Set `agentviz.sessions` to `all` to list past sessions too. The machine settings `agentviz.claudeRoot` and `agentviz.codexRoot` point it at other configuration folders. By default (`agentviz.scope`: `workspace`) it lists only sessions whose recorded working folder is an open workspace folder or below it, so worktrees under the workspace count and other projects do not. A project is the workspace loaded in the VS Code window: every one of those sessions belongs to one project, named after the `.code-workspace` file (or after the folder, when the window holds a single folder and no workspace file). A transcript that sits on disk under two paths (a hard link, which AgentBoard makes for worktree sessions) is listed once. A session you open by ID stays followed wherever it is. Set `agentviz.scope` to `all` to list every session. With no folder open, every session is listed. No credentials, configuration files or environment variables are read.

The view receives: opaque project keys with short labels, saved session names, session IDs, tool categories, safe tool names, file labels of at most two path segments, hostnames, a command's first word, task list labels, timestamps and outcomes. The live view does not receive prompts, reasoning, code, command arguments, tool output, file contents, patch bodies, full paths, or URL paths and queries. Those are read only when you open one call in the details panel: the host reads that call's records again from the transcript at the positions it noted (checking they still hold that call), sends them once, and keeps nothing. Encrypted reasoning is never read.

Names, project labels, file labels and hostnames are still real. Treat screenshots of real sessions accordingly.

The extension makes no network requests, uses no model tokens, installs no hooks, starts no server, opens no port and writes no transcript files. The view is plain SVG, CSS and JavaScript under a content security policy that allows scripts by nonce only. There are no runtime dependencies.

The selected transcript is read incrementally about once per second while the tab is visible. Folders are listed about every ten seconds or on **Refresh**. Hiding the tab pauses all reading; closing it stops it.

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

## Run from source

Running the extension from a checkout needs no compilation and no installed dependency.

1. Clone the repository and open the folder in VS Code.
2. Press F5 and select **Run AgentViz**. This opens an Extension Development Host.
3. In that window, click the AgentViz icon in the activity bar, or run **AgentViz: Open Activity** from the Command Palette.
4. Choose a project, type part of a name or an ID, then pick a session. **Show example** shows the synthetic example.

The code is plain JavaScript: `src/` is the extension host (finding sessions, reading transcripts), `media/` is the view (SVG, CSS and JavaScript in a webview), and `test/` holds the checks below.

## Development checks and packaging

Node 22 or newer is needed only for the tests and the packaging tool.

```powershell
npm ci --ignore-scripts
npm test                 # unit: Node tests on synthetic transcripts
npm run check            # syntax of the production files
npm run host             # real VS Code host, isolated temporary profile, synthetic sources
npm run browser          # headless Edge or Chrome at 1280, 600 and 360 px
npm run package          # builds agent-viz-0.3.0.vsix
npm run package:check    # lists the VSIX contents and checksums; fails on anything unexpected
```

Each check proves only what it names. `npm test` does not prove the extension works in VS Code; `npm run host` does that, and opens a VS Code window for about 40 seconds. `npm run host` and `npm run browser` write receipts under `artifacts/`, which is not committed.

To install the package you built: **Extensions: Install from VSIX** and choose `agent-viz-0.3.0.vsix`. The package uses a local publisher identifier (`agentviz-local`). Installing it is your decision; no check here installs it.

The VSIX holds eleven product files: `package.json`, this README, five files in `src/`, three in `media/` and the icon in `resources/`. `.vscodeignore` is an allow-list, so a new file in the checkout stays out until it is allowed. The archive's own checksum changes with every build because it stores build times; the per-file checksums printed by `npm run package:check` do not.

The packaging dependency overrides minimatch to a fixed upstream release series because VSCE 4.1.0 otherwise resolves a version flagged by npm audit. Development packages are not in the VSIX.

## Limits

Not verified: Linux, VSCodium, remote and web hosts, screen reader output, high contrast themes, and a live call from AgentBoard.

Provider coverage on the development machine:

- No real task list record of either provider was found there, so task list progress is tested on synthetic records only and reads "Unavailable" for those sessions.
- Local Codex sessions edit files through program text inside `exec`, which is never parsed. Their file activity reads "No file paths are recorded". Structured Codex `apply_patch` is tested on synthetic records only.
- Task lists and file activity of subagent lanes are not loaded yet. The panels say so. Lane calls are counted in the stations and the strip.

Disclosed limits, each stated in the view when reached:

- 80 sessions returned per lookup, after filtering.
- 10000 events retained per transcript; 24 subagent lanes; 2000 events per lane.
- 8 MB of the followed transcript and 24 MB of subagent transcripts read per pass, with a loading state.
- 1500 first project reads and 256 MB of saved-name reading per lookup. A first name search across thousands of large transcripts can take tens of seconds; matches appear as it goes.
- Records above 4 MB are skipped and counted. Damaged lines are counted.
- A record dated before 2000, or more than a day after this machine's clock, is counted as malformed and adds no activity.
- The newest 8 MB of the Codex name index is read. A title record above 64 KB is ignored.

Other limits:

- Transcript formats are undocumented and may change. Unknown record types are skipped.
- A 64 KB preview supplies the project. A larger first record leaves the project as "Unknown workspace".
- Rewrite detection compares the first and last 4 KB previously read. Edits wholly between those samples can be missed; Refresh rereads the selected transcript from the beginning.
- Projects are compared as recorded. The same folder written as `C:\Work\app` and `/c/Work/app`, or reached through a link, is two projects.
- A session ID is the transcript's file name and is shown as it is. Names and labels have control and direction-override characters removed; IDs do not.
- Name search matches the cleaned title literally, including the text `Unnamed session`.
- Subagent transcripts have no saved title and read `Unnamed session`.
- Shell errors are detected from structured error fields and explicit exit codes; unknown result formats can miss errors. A Codex exec wrapper is counted once.
- Symbolic links met during folder discovery are not followed.

Replay controls, automatic discovery of additional account folders and an AgentBoard button remain for later work. No borrowed source code is included.

## Licence

No open-source licence has been granted yet: `package.json` says `UNLICENSED`. You may read the code and install the released package for your own use. Ask before reusing the code elsewhere.

Problems and ideas: [open an issue](https://github.com/bottobot/AgentViz/issues).
