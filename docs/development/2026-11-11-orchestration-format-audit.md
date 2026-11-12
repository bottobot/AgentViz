# AgentViz Run a Plan format audit

Date: 11 November 2026. Scope: discovery, schema, dependency expansion and generated prompts for this workflow against the current local AgentBoard source. This audit supersedes the earlier manual orchestrator recommendation, which did not satisfy the requested Run a Plan entry point.

## Verdict

The correct executable artifact is `workflows/agentviz-next.plan.json`. It is discoverable as **AgentViz: find and follow sessions** by AgentBoard's **Run a Plan** loader. The file contains ten known outcomes, explicit dependencies, named checks and native model review. `ORCHESTRATION.md` remains a supporting product brief, with incompatible manual launch instructions removed.

## Findings and corrections

| Finding | Correction |
| --- | --- |
| A Markdown coordinating record is not a Run a Plan workflow. | Create the native JSON plan and validate both its schema and the actual plan loader. |
| The current picker enumerates JSON files directly under workflows, except checks.json. The caps/policy files therefore produced invalid plan rows. | Remove those obsolete proposals from workflows. Keep one valid executable plan plus the check catalogue. |
| Native workflow dependencies use step IDs; manual board add requests use actual card IDs. These are different contracts. | Put native step IDs in each JSON after list. Let AgentBoard resolve and schedule them. |
| Plan runs refuse manual add, adopt and plan operations. | Remove the second root approval and manual dispatch protocol from the brief and generated worker instructions. |
| Caps/policy are not fields in the Run a Plan schema. | Omit unsupported fields and use the board's current preview/default limits. The workflow declares ten bounded outcomes. |
| Existing tests alone cannot establish that a new behavior works. | Keep feature specific regressions and evidence requirements in each goal, unit/syntax checks, release packaging checks and native model review. |
| Dated account/model aliases can make import fail. | Leave account/model/effort selection to currently available board defaults and preview. |

## Validation

Validate against the current `docs/agents/schemas/plan.schema.json` using Python's Draft 2020-12 JSON Schema validator. Independently load fresh `src/plan.ts` in memory through AgentBoard's installed compiler and exercise `findPlanFiles`, `loadPlanFile`, `validatePlanFile`, `planPreview` and `stepPrompt` against this workspace.

Acceptance requires one usable picker entry, ten expanded steps, valid unique IDs, an acyclic dependency chain, existing named checks, bounded text fields, existing source files and usable generated prompts. Negative probes with an unknown field, dangling dependency and missing check name must be rejected. Model and permission validation is also exercised with synthetic Claude and Codex profiles; that is not a live sign in check.

The authoritative sources are `src/plan.ts`, `docs/agents/schemas/plan.schema.json` and `docs/agents/README.md` in the sibling AgentBoard checkout. Local receipts are retained in ignored `artifacts/agentviz-plan-validation.json`. AgentBoard source and its installed extension are not modified.

## Effectiveness and remaining limits

The native JSON format fits this batch because the outcomes and dependencies are known. The board owns card creation, review and dependency integration, removing a manual coordinator and duplicate approval bookkeeping. Shared files are protected by the sequential dependency chain. The execution record retains evidence and continuation notes; native board state remains authoritative for scheduling.

Schema and loader checks do not prove a GUI preview in the installed extension, signed in model availability, successful future workers or end to end delivery. The workflow has not been launched. Run a Plan performs live account/model and capacity validation before execution. Installation, publication, remote push and cross project caller changes remain outside the batch.
