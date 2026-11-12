# Live agent visualizers: survey for AgentBoard

Date: 11 November 2026. Purpose: a starting list for studying how open-source tools show coding agents (Claude Code, Codex and others) at work, so AgentBoard can borrow the best visual ideas. Live views are the target. Replay tools are listed separately, only for their visual ideas.

Star counts and dates come from `gh repo view` on 2026-11-11 at about 23:00 UTC. Licenses were not checked: the `licenseInfo` field came back empty for every repo, which is more likely a query problem than 27 unlicensed repos. Confirm the license before reusing any code.

## How this list was found

- GitHub repo search with `gh search repos` (sorted by stars), across terms such as "claude code visualize", "agents office", "observability" and "pixel agents".
- Web and YouTube searches; Show HN, SourcePulse and ecosyste.ms listings; the awesome-claude-code README (only partly read).
- Three parallel search agents: GitHub names, social and video mentions, and curated lists.

Gaps: Reddit, X and YouTube were reached only through web search, not searched directly. Repos that never mention "Claude" in their name or description may be missing. Star counts from aggregator sites were ignored in favour of `gh`.

## Live visualizers (the target)

| Stars | Repo | Created | Lang | Visual idea (from its own description) |
|---:|---|---|---|---|
| 10,164 | [pixel-agents-hq/pixel-agents](https://github.com/pixel-agents-hq/pixel-agents) | 2026-02-08 | TypeScript | Pixel-art office; each agent is a character at a desk. VS Code extension. The original of many forks. |
| 2,463 | [777genius/agent-teams-ai](https://github.com/777genius/agent-teams-ai) | 2026-02-21 | TypeScript | Kanban board of an agent team: agents create tasks, message each other, you watch the board. (Formerly `claude_agent_teams_ui`.) |
| 1,779 | [patoles/agent-flow](https://github.com/patoles/agent-flow) | 2026-03-21 | TypeScript | Live node graph: agents, subagents and tool calls as connected nodes that branch and group. VS Code extension or `npx agent-flow-app`. [Screenshot](https://res.cloudinary.com/dxlvclh9c/image/upload/v1773924941/screenshot_e7yox3.png), [demo video](https://www.youtube.com/watch?v=Ud6eDrFN-TA). |
| 1,567 | [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability) | 2025-07-13 | Python | Hook events streamed to a web dashboard; a live event feed across many agents. |
| 1,238 | [Ataraxy-Labs/opensessions](https://github.com/Ataraxy-Labs/opensessions) | 2026-03-19 | Rust | tmux sidebar listing agent sessions (Amp, Claude Code, Codex, OpenCode) with per-thread status. |
| 1,172 | [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) | 2026-03-05 | TypeScript | Real-time monitoring dashboard for Claude Code and Codex, SQLite-backed. |
| 1,162 | [furkankly/zoetrope](https://github.com/furkankly/zoetrope) | 2026-08-18 | Rust | Live flow graph of one session, in the terminal or in the browser (the same binary compiled to WASM: [zoetrope.furkankly.dev](https://zoetrope.furkankly.dev)). |
| 716 | [simple10/agents-observe](https://github.com/simple10/agents-observe) | 2026-03-26 | TypeScript | Observability dashboard: parent/subagent hierarchy, filtering, token stats. Installed as a Claude Code plugin. |
| 615 | [paulrobello/claude-office](https://github.com/paulrobello/claude-office) | 2026-01-22 | TypeScript | Pixel-art office simulation with animated agent characters. |
| 411 | [alexeyw/lot-map](https://github.com/alexeyw/lot-map) | 2026-11-09 | TypeScript | **The one Robert saw.** Radial live map in a pane beside the chat: every tool call, model step, hook, skill and subagent sends a pulse from the centre to its "station" (memory, files, shell, web, agents). Claude Code plugin; terminal (text only, needs 144 columns) and desktop app. Fastest growth on this list (411 stars in 2 days). |
| 398 | [Charonyuu/whatsmyagentdoing](https://github.com/Charonyuu/whatsmyagentdoing) | 2026-10-23 | JavaScript | Every Claude Code and Codex agent on the machine, live, in a little office. Machine-wide, not per session. |
| 356 | [W17ant/Claude-Office](https://github.com/W17ant/Claude-Office) | 2026-03-17 | TypeScript | Pixel-art virtual office of agents working in real time. |
| 185 | [FulAppiOS/Agent-Quest](https://github.com/FulAppiOS/Agent-Quest) | 2026-04-17 | TypeScript | Fantasy village; each agent is a villager. Monitors Claude Code and Codex across terminals. |
| 134 | [JamsusMaximus/codemap](https://github.com/JamsusMaximus/codemap) | 2025-12-19 | TypeScript | Pixel-art agents moving through a hotel (Claude Code and Cursor). |
| 80 | [chojs23/lazyagent](https://github.com/chojs23/lazyagent) | 2026-04-12 | Go | Terminal and browser view of what Claude, Codex and OpenCode agents are doing. |
| 58 | [rolandal/pixel-agents-standalone](https://github.com/rolandal/pixel-agents-standalone) | 2026-03-13 | TypeScript | Pixel Agents as a standalone web app, no VS Code needed. |
| 28 | [Ryder-Sun/Realm](https://github.com/Ryder-Sun/Realm) | 2026-02-23 | TypeScript | Real-time 3D visualization of Claude Code activity. |
| 21 | [honorstudio/claude-ville](https://github.com/honorstudio/claude-ville) | 2026-02-17 | JavaScript | Isometric village dashboard for agents, teams and swarms. |
| 14 | [sebyul2/backstage](https://github.com/sebyul2/backstage) | 2026-03-06 | JavaScript | Gather Town-style pixel office in the browser (localhost:7777); Claude Code plugin. |
| 2 | [kounetsuman/zashiki](https://github.com/kounetsuman/zashiki) | 2026-08-12 | TypeScript | "Orchestration cockpit": many sessions on one screen. |
| 1 | [ilomon10/tagconn](https://github.com/ilomon10/tagconn) | 2026-09-25 | TypeScript | 2D office; sessions and subagents as characters. |
| 1 | [takattowo/claude-code-devtools](https://github.com/takattowo/claude-code-devtools) | 2026-05-10 | TypeScript | Local web app: live tool-call timeline and context inspector. |
| 0 | [YehudaLevi/pixelagents](https://github.com/YehudaLevi/pixelagents) | 2026-07-05 | HTML | Zero-dependency, local-first take on the pixel office. Small enough to read in one sitting. |
| 0 | [mathiasolofsson87/Claude-agents-office](https://github.com/mathiasolofsson87/Claude-agents-office) | 2026-11-06 | TypeScript | Pixel-art office in a Claude Code pane; each running subagent gets a portrait at its desk. |

## Replay and history tools (study the visuals only)

| Stars | Repo | Created | Lang | Visual idea |
|---:|---|---|---|---|
| 4,038 | [matt1398/claude-devtools](https://github.com/matt1398/claude-devtools) | 2026-02-07 | TypeScript | DevTools-style inspector for session logs: tool calls, tokens. |
| 1,397 | [cosmtrek/mindwalk](https://github.com/cosmtrek/mindwalk) | 2026-07-09 | Go | Replays a session on a 3D map of the codebase: shows where the agent looked and how far its footprint spread. |
| 360 | [Entelligence-AI/agentplay](https://github.com/Entelligence-AI/agentplay) | 2026-10-14 | Python | Session replay as a map plus a timeline. |

## Seen only in videos or listings (repo not confirmed)

Cubefarm (3D "software factory" of agents at desks), Agent Standup (sessions as a live video call), Gander (all agents on one pixel office floor), coucou (visual approval of agent actions), Skyborne, Roundtable. Videos: [Pixel Agents walkthrough](https://www.youtube.com/watch?v=KtG5Ez7KujE), [Pixel Agents VS Code extension](https://www.youtube.com/watch?v=dLmk2SqZXYo), [Gander short](https://www.youtube.com/shorts/EkFqwGF-N-s).

## Visual families

1. **Spatial metaphor (office, village, hotel, dungeon):** pixel-agents and its forks, claude-office, Agent-Quest, codemap, claude-ville, whatsmyagentdoing. Strong at "who is busy right now"; weak at showing what each agent is doing.
2. **Graph (nodes and edges):** agent-flow, zoetrope. Shows branching, subagent trees and tool-call chains. Closest to "agents in circles, grouped like nodes".
3. **Radial stations:** lot-map. One hub and fixed destinations (files, shell, web, memory, agents); activity is a pulse along a spoke. Very readable at a glance, and fixed positions build muscle memory.
4. **Dashboard, feed or board:** disler observability, agents-observe, Agent Monitor, agent-teams-ai, opensessions. Dense and searchable, but not glanceable.
5. **Codebase map:** mindwalk, Realm. Puts activity on the shape of the repository.

## Questions for the research session

- **Data source:** which tools read hook events and which tail session JSONL files? AgentBoard already has events; what is the minimum event set each visual needs?
- **Scope:** one session (lot-map, zoetrope) or every agent on the machine (whatsmyagentdoing, opensessions)? AgentBoard spans many sessions and two agent types (Claude and Codex).
- **Rendering:** canvas, SVG, WebGL or terminal text? What do lot-map's radial layout and agent-flow's graph layout cost to draw with 20+ live agents?
- **Hierarchy:** how do agent-flow and agents-observe show parent and subagent relationships, and how does that scale?
- **Licensing:** confirm each license before copying code; ideas and layouts are free to study.
- **Safety:** several of these install hooks on every tool call. Review the code before installing any of them on this PC.
