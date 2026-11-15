# Beyond the stations: live session visualization paradigms

12 November 2026. Research and design proposals for AgentViz, following Robert's selection of the animated Station Observatory. No production UI or telemetry changes are made by this report.

## Recommendation

Evolve the existing stations into a **stable map of sessions and subagents**, with event-triggered signals travelling along explicitly typed connections. Add two investigative lenses: **follow one call** and **slice through time**. Keep the current inspector for exact inputs, outputs and errors.

Use shallow 3D to reveal hierarchy and expansion, rather than making users navigate a constantly rearranging galaxy. An optional orbit view is reasonable; the initial camera should remain familiar and a Home action should restore it. This is a design hypothesis to test, not a claim that 3D is inherently easier to understand.

The previous research report rejected 3D and moving force layouts. It correctly identified clutter and ambiguous meaning, but its blanket rejection is too restrictive for the substantial, dedicated visual experience now requested. The next experiment should make depth carry a specific meaning: nested sessions in the relationship view, or time in the temporal view. Do not give the same axis both meanings at once.

## Eight useful paradigms

### 1. Session constellation: a graph that unfolds where you are looking

**What it looks like:** The main session is an island. Its children appear as smaller connected islands. Opening an island unfolds its six tool stations; collapsing it restores the compact session node. Unselected siblings remain visible as context.

**What you can do:** Pin a session, expand its children, select a delegation, focus its neighborhood, and return using a breadcrumb. Pin two sessions to reveal their shared resources. Show delegation, actual messages and common-resource associations as different edge types.

**Reference:** The maintained [3d-force-graph project](https://vasturiano.github.io/3d-force-graph/) supplies examples of click-to-focus, expand/collapse, fixed node positions, dynamic updates and custom geometries. Those are implementation primitives; the island interaction above is our proposed adaptation.

**Best question:** Which agents belong to this task, and where is their activity concentrated?

**Main constraint:** A shared filename does not prove communication or collaboration. Use explicit parent IDs for hierarchy, and opaque resource identities for associations. Expand only the selected neighborhood; do not create one visible node for every historical event.

### 2. Packet journeys: select a route and inspect its traffic

**What it looks like:** A request leaves an agent for a tool or service; a separately recorded result travels back. Errors leave persistent markers. An edge carries the count of observed calls even when no particles are moving.

**What you can do:** Select an edge to see its traffic, select an event to spotlight its participants, or choose Follow this call. Pause the visual journey while the live event buffer continues collecting. Inspect a stationary call card rather than having to catch a tiny moving dot.

**References:** [3d-force-graph's on-demand particle example](https://github.com/vasturiano/3d-force-graph/blob/master/example/emit-particles/index.html) supports one-shot emissions. [Hubble's service map](https://docs.cilium.io/en/stable/observability/hubble/hubble-ui/) combines observed service dependencies with individual flow events below the map.

**Best question:** What did this agent ask for, which service handled it, and what came back?

**Main constraint:** These are application-event tokens, not literal captured network packets. Do not animate return traffic without a correlated result. Particle travel speed is presentation, not measured latency. A route is not a network capture simply because it is drawn like one.

### 3. Explodable process map: system shape versus individual calls

**What it looks like:** At a distance, a station or tool is one node with a count. Expanding it exposes the individual calls, repeated attempts and their outcomes. The same selection survives switching between the compact and detailed views.

**What you can do:** Open “Shell: 18 calls,” isolate the two failures, expand one retry sequence, then collapse it without losing your place.

**Reference:** [Langfuse agent graphs](https://langfuse.com/docs/observability/features/agent-graphs) explicitly distinguish Aggregated, one node per step name, from Expanded, one node per call. It also documents graphs inferred from observation timings and nesting.

**Best question:** Is this one operation, repeated work, or a long chain of different actions?

**Main constraint:** Name grouping is useful compression, not proof of identical semantics. Mark inferred topology as inferred. Our event inspector should always retain individual IDs underneath an aggregate.

### 4. Actor sequence diagram: who told whom, and when?

**What it looks like:** The parent session, child agents, tools and services have lanes. Horizontal arrows show task dispatch, call, reply and handoff. The same participants remain highlighted in the spatial map.

**What you can do:** Select a delegation to follow its child activity, inspect the reply, and identify an unfinished exchange. Switch from the world to the sequence view without changing the selected event.

**Reference:** [Stately Inspector](https://stately.ai/docs/inspector) accepts actor creation, actor-to-actor communication and snapshot-change events, from which it can generate real-time sequence diagrams. State-machine diagrams require a machine definition as well.

**Best question:** What exchange preceded this behavior? Which work is awaiting a recorded response?

**Main constraint:** Silence is not a recorded waiting state. A lifecycle diagram must represent observable states such as running, ended, missing or unknown; it must not invent internal reasoning states.

### 5. Trace waterfall: time and concurrency made explicit

**What it looks like:** A compact timeline below the world gives each session a lane and each timed call a span. Parallel work overlaps. Recorded errors mark precise locations rather than turning the entire agent red forever.

**What you can do:** Brush an interval, isolate a slow call, compare siblings, and jump from a span to the same event's payload inspector. A causal link can connect work across traces without pretending it is a parent-child relationship.

**References:** [OpenTelemetry's model](https://opentelemetry.io/docs/specs/otel/overview/) distinguishes span parentage, timestamps, events and links. [Jaeger's feature documentation](https://www.jaegertracing.io/docs/2.dev/features/) describes selectable trace timelines and alternate graph views. The Jaeger page is development documentation, not a pinned release promise.

**Best question:** Which operations overlapped, and where was elapsed time spent?

**Main constraint:** Exact spans need actual start and end timestamps. Time between adjacent log entries is not a defensible duration measurement. Aggregate A-to-B and B-to-C edges do not establish that one execution travelled A-to-B-to-C.

### 6. Activity ecology: follow an agent through the artifacts it touches

**What it looks like:** Files and tools form a navigable landscape. An agent's recent activity leaves a fading trail. An artifact can be selected to reveal which recorded sessions touched it, with errors and unfinished work kept visible after ordinary activity fades.

**What you can do:** Follow one agent, isolate one file's history, or reveal recent overlap between two agents. Turn camera following off without losing selection.

**References:** [Gource](https://gource.io/) visualizes repository activity as contributors working on an animated tree; its [controls](https://github.com/acaudwell/Gource/wiki/Controls) include tracking, seeking and pause-and-inspect. Its documentation also notes that updates may be delayed while actors move.

**Best question:** Where has this agent been working, and what keeps getting revisited?

**Main constraint:** Borrow the trails, not delayed truth. Apply incoming data immediately; animate a visual echo afterward. Reading a file does not establish ownership, contribution or contention.

### 7. Software campus: zoom from projects to sessions to tools

**What it looks like:** Projects are campuses, sessions are buildings, and stations appear when a building opens. Busy APIs and common resources can occupy shared infrastructure between sessions.

**What you can do:** Open a roof to reveal the session's activity in place, isolate one project's neighborhood, or inspect which sessions used a service during a selected interval.

**References:** [ExplorViz](https://explorviz.dev/1-about/) combines software landscapes and 3D cities. Its [runtime walkthrough](https://explorviz.dev/2-getting-started/) demonstrates OpenTelemetry data and an example updated every ten seconds with aggregated behavior.

**Best question:** Where should I look across many projects and simultaneous sessions?

**Main constraint:** It is a later scale-up direction. Architecture can become decoration; keep building geometry constant unless height or area has a stated metric. The documented aggregation interval is not proof of per-event live playback. Borrow the visual metaphor without adopting its deployment stack.

### 8. Temporal peel: pull history out of the live world

**What it looks like:** In a dedicated time mode, activity rises into trails above fixed stations. A horizontal plane selects a moment. Parent/child lifetimes become strands; error points remain visible in the volume.

**What you can do:** Peel backward from an error, brush an interval, show only one agent's trail, or pin two moments as side-by-side snapshots. Return to the newest state with one action.

**Reference:** The [TimeLighting author manuscript](https://repositum.tuwien.at/bitstream/20.500.12708/208533/3/Filipov-2024-IEEE%20Transactions%20on%20Visualization%20and%20Computer%20Graphics-am.pdf) presents continuous temporal networks using a space-time cube, projected trajectories, aging and guidance to interesting intervals. It reports case studies and qualitative expert evaluation. The peel gesture is our design proposal, not a claimed feature of that paper.

**Best question:** How did the system arrive at this state?

**Main constraint:** This is the most experimental option. Overlapping trails and time direction can be confusing. Supply a flat projection and precise event list alongside the volume; do not equate the movement of a layout with meaningful work.

## The interaction system that ties these together

The recommendation is one shared dataset and selection model, with several lenses, rather than eight independent dashboards.

| Action | Spatial response | Exact evidence |
|---|---|---|
| Select a session | Highlight its island and children | Session identity, source status, observed parentage |
| Select a station | Highlight its tools and routes | Recorded calls, outcomes and timestamps |
| Select an edge | Show its participants; dim other routes | Edge type and the records supporting it |
| Select a resource | Highlight sessions that touched it | Matching resource identity and per-agent events |
| Select an error | Keep a persistent marker; highlight known related work | Failure event, correlated call/result and safe detail |
| Pin a moment | Freeze the viewed state while ingestion continues | Selected source time, arrival time where available, pending-new-events count |
| Return to live | Restore following newest events | Clear Live status and last received time |

[Rerun's timeline model](https://rerun.io/docs/concepts/timelines) and [playback controls](https://rerun.io/docs/howto/visualization/control-the-viewer) are useful references for synchronized views and distinct paused, playing and following-newest modes. Arrival time and event time must remain distinct. Rerun's Python ViewerClient is marked experimental; this is a behavioral reference, not a dependency recommendation.

Proposed edge vocabulary:

- **Delegated to:** source-recorded parent/subagent relationship.
- **Called / returned:** a correlated invocation and result.
- **Sent message:** an explicitly observed inter-session message.
- **Touched the same resource:** an association, visually distinct from communication.
- **Unknown relationship:** disconnected or clearly marked unknown; never silently attached to the parent as fact.

Use a stable default layout, explicit camera movement and pinned landmarks. Evidence on preserving a mental map is task-dependent: an [orientation study](https://doi.org/10.1007/978-3-642-36763-2_42) supports benefits for navigation, whereas an [animation versus small-multiples study](https://doi.org/10.1109/tvcg.2010.78) reports different results for its comprehension tasks. Neither establishes that desktop 3D is universally superior. Test both orientation and debugging, and compare moments side by side when animation makes comparison harder.

## What the current repository can actually support

Inspected at checkout `9840479`, with the existing station prototype still uncommitted. This inventory concerns the current code, not the older 11 November snapshot.

| Capability | Current evidence | Consequence |
|---|---|---|
| Session family | `src/sessions.js` returns lanes with `parentKey`, `parentKnown`, start/end metadata and missing/unreadable flags | Build an evidence-based parent/subagent constellation now; retain unknown and missing states |
| Tool activity | `src/transcript.js` records call ID, start timestamp, category, safe label and outcome | Event-triggered pulses and category/resource inspection are practical |
| Tool duration | `finishTool()` updates outcome without retaining completion timestamp | Exact latency spans and duration-scaled animations need a schema/parser change |
| File footprint | Structured file arguments yield opaque identities and short labels; current UI aggregates file activity | Useful for file-resource views; cross-agent per-event joins still require exposing appropriate associations |
| Subagent file/task data | README says task lists and file activity of subagent lanes are not loaded | Do not promise a complete shared-file or shared-plan network yet |
| Inputs and outputs | Current webview contract excludes raw payloads, command arguments, contents and patch bodies | Synthetic detail works today; real payload inspection needs an explicit local detail/redaction contract |
| Cross-session communication | Parentage exists; a complete arbitrary message-link graph is not established by this inspection | Do not draw conversational arrows solely from nearby timestamps |

**Coverage warning:** Current following is bounded to 24 subagent lanes, with 2,000 retained events per lane and 10,000 per transcript. Preserve the existing omission/loading disclosures. A spatial map must not imply that the visible neighborhood is the entire session family when collection is bounded.

No server, database or model-generated summary is necessary for a first version. The existing event parser, family information and local webview can supply the initial map. A graph rendering library is worth considering only if genuine 3D camera and picking behavior is selected; keep the SVG implementation as the baseline for comparison.

## Proposed next experiment

### First: connected session islands

Extend the synthetic prototype to one parent and three child sessions, each with expandable stations. Include an explicit delegation, a returned result, a missing child transcript and an unrelated session. Stable positions, focus-on-selection, breadcrumbs and an optional orbit view make the spatial behavior reviewable.

### Second: follow a call through the map

Show a correlated request/result pair, an API failure followed by an explicitly linked retry, and overlapping work in two children. Selecting a call pins its inspector while new activity continues to be collected. A compact waterfall provides exact time where the sample has it. Keep decorative flight time independent of measured operation duration.

### Third: compare temporal views

Use the same sample to compare a flat timeline, two pinned snapshots and a shallow 3D time-slice view. This tests whether the novel representation actually helps rather than merely appearing novel.

Suggested review tasks: identify who spawned a child; find the response to one request; distinguish a shared-file association from an actual message; explain an error's recorded preceding events; return from history to live. Include 1, 6 and 24 visible sessions. Record task accuracy, wrong inferences and time to find evidence, as well as visual preference. Performance and usability targets remain unmeasured.

## Research method and limits

Two Exa research passes each requested 25 search-result slots, for 50 total slots before deduplication. These are not 50 unique validated sources. The spatial pass fetched 10 pages; the trace/interaction pass fetched nine unique pages, with one repeat fetch. Six key documentation pages were independently reread during synthesis. Secondary search results were excluded from the claims above.

Primary evidence includes maintained project documentation, executable example source and original research. The external tools and demonstrations were not installed, benchmarked or user-tested in this task. The novelty lies in adapting and combining these techniques for session activity; no claim is made that any proposed interaction is unprecedented. All proposed AgentViz behavior is explicitly a design adaptation, separate from what the cited projects implement.
