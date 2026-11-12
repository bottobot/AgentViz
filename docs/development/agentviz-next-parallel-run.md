# AgentViz parallel revision execution record

Saved parallel revision: prepared, not launched. Original baseline: `2a3025b`. An existing serial run was started through AgentBoard: master `a40b39`, original file `workflows/agentviz-next.plan.json`. When inspected on 12 November, S01 was Done and S02 was Running. Live board records override this observation.

The replacement schedule is `workflows/agentviz-next.parallel.plan.json`, named **AgentViz: parallel find and follow sessions**. `ORCHESTRATION.md` supplies the frozen interface and graph. It starts metadata, UI filtering and harness preparation independently, then joins their required outputs. Workers write separate receipts under `docs/development/agentviz-next/`; handoff alone consolidates this ledger. The original run's allocated graph remains unchanged.

| Outcome | Status | Board ID | Delivered commit | Acceptance evidence |
| --- | --- | --- | --- | --- |
| S01 workspace and saved names | Pending | Not allocated | None | Not run |
| S02 navigation filters | Pending | Not allocated | None | Not run |
| S03 complete catalogue lookup | Pending | Not allocated | None | Not run |
| S04 agent lanes | Pending | Not allocated | None | Not run |
| S05 explicit task progress | Pending | Not allocated | None | Not run |
| S06 file footprint | Pending | Not allocated | None | Not run |
| S07 AgentBoard entry command | Pending | Not allocated | None | Not run |
| S08 reliability and cost | Pending | Not allocated | None | Not run |
| S09 Windows acceptance | Pending | Not allocated | None | Not run |
| S10 review and local package | Pending | Not allocated | None | Not run |
| P01 independent host harness preparation | Pending | Not allocated | None | Not run |

The table above is the saved replacement's allocation template, not a claim that the original run is still unallocated. For the original run inspect master `a40b39`; its S01 card is `8a7300` and its S02 card is `153bc7`. No cards have been created from the replacement by this planning session.

Next action: preserve and reconcile the active original run before choosing a transition through AgentBoard controls. Do not launch the replacement alongside the same unfinished outcomes. Editing the saved graph cannot retroactively parallelize existing cards.

Each replacement worker records its own owner/worktree, dependency commits, exact checks and results, native review state, blockers and next action in its dedicated receipt. The final handoff consolidates these facts and integration commits here. Preserve receipts and review real Git and board state when resuming.
