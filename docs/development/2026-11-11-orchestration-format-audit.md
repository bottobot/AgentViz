# AgentViz Run a Plan format audit

> **Since this audit (15 November 2026):** the parallel plan was launched after all, in part, and its plan file is now in `workflows/archive/`. See `agentviz-next-parallel-run.md`. The findings about the plan file format still hold.

Date: 11 November 2026. Scope: discovery, schema, dependency expansion and generated prompts for this workflow against the current local AgentBoard source. This audit supersedes the earlier manual orchestrator recommendation, which did not satisfy the requested Run a Plan entry point.

## Verdict

Updated 12 November 2026 for parallel execution. The revised artifact is `workflows/agentviz-next.parallel.plan.json`, discoverable as **AgentViz: parallel find and follow sessions**. It contains eleven tasks: the original ten outcomes plus independent Windows harness preparation. `ORCHESTRATION.md` supplies the product and interface contract. The original `workflows/agentviz-next.plan.json` is preserved for the already allocated serial run; it is not the optimized replacement.

## Findings and corrections

| Finding | Correction |
| --- | --- |
| A Markdown coordinating record is not a Run a Plan workflow. | Create the native JSON plan and validate both its schema and the actual plan loader. |
| The current picker enumerates JSON files directly under workflows, except checks.json. The caps/policy files therefore produced invalid plan rows. | Remove obsolete proposals. Both remaining workflow entries are valid: the active run's original file and the separate parallel revision. |
| Native workflow dependencies use step IDs; manual board add requests use actual card IDs. These are different contracts. | Put native step IDs in each JSON after list. Let AgentBoard resolve and schedule them. |
| Plan runs refuse manual add, adopt and plan operations. | Remove the second root approval and manual dispatch protocol from the brief and generated worker instructions. |
| Caps/policy are not fields in the Run a Plan schema. | Omit unsupported fields and use the board's current limits. The revised graph has three independent starting tasks; actual running concurrency still depends on available slots. |
| A chain of after edges serialized independent work. Shared test directory scopes and a shared writable ledger also prevented safe overlap. | Start metadata, UI filtering and host harness preparation independently against a frozen contract. Join metadata and UI for discovery, then let command integration overlap progress work. Give every task exact writable files and its own receipt; only handoff consolidates the ledger. |
| Existing tests alone cannot establish that a new behavior works. | Keep feature specific regressions and evidence requirements in each goal, unit/syntax checks, release packaging checks and native model review. |
| Dated account/model aliases can make import fail. | Leave account/model/effort selection to currently available board defaults and preview. |

## Validation

Validate against the current `docs/agents/schemas/plan.schema.json` using Python's Draft 2020-12 JSON Schema validator. Independently load fresh `src/plan.ts` in memory through AgentBoard's installed compiler and exercise `findPlanFiles`, `loadPlanFile`, `validatePlanFile`, `planPreview` and `stepPrompt` against this workspace.

Acceptance requires a usable parallel picker entry, eleven expanded tasks, valid unique IDs, an acyclic graph, three initially eligible workers, correct join gates, existing checks, bounded fields and usable generated prompts. Every unordered task pair must have disjoint declared writable paths, including parent directory overlaps. Native queue probes must show that accepted dependency joins release downstream work while Review alone does not. Negative probes with an unknown field, cycle, dangling dependency and missing check name must fail. Synthetic profile checks are not live sign in checks.

The authoritative sources are `src/plan.ts`, `src/queue.ts`, `src/board.ts`, `docs/agents/schemas/plan.schema.json` and `docs/agents/README.md` in the sibling AgentBoard checkout. Receipts are retained in ignored `artifacts/agentviz-parallel-plan-validation.json`. `test/plan-parallel.test.js` guards parallel eligibility, join gates and file ownership; it can read the archived workflow after native completion. AgentBoard source and its installed extension are not modified.

## Effectiveness and remaining limits

The native JSON format fits this batch because the outcomes and dependencies are known. AgentBoard follows the explicit graph and respects capacity; it does not infer or remove unnecessary dependencies. The previous plan overconstrained that graph. The revised graph preserves order for shared parser/renderer changes and for final acceptance, while exposing disjoint branches. Its longest dependency chain has eight tasks instead of the original ten; this is a structural comparison, not a measured speedup. Three workers can be eligible together, subject to capacity and review activity.

The native Run flow captures dependencies, prompts and IDs when allocating a run. Changing the saved file does not change existing cards. Run a40b39 was already active on the serial graph, with S01 complete and S02 started when inspected. The replacement has a distinct filename so archiving the old run cannot remove it. Its live queue was not edited, paused, restarted or duplicated by this change.

Schema, ownership and queue probes do not prove elapsed runtime, worker compliance with declared ownership, live GUI acceptance or successful end to end delivery. The parallel revision has not been launched. Existing board state remains authoritative for the old run, and app controls are needed to transition it without losing completed work. Installation, publication and cross project caller changes remain outside the prepared development batch.
