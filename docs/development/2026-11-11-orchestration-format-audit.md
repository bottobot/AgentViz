# AgentViz orchestration format audit

Date: 11 November 2026. Scope: the format and execution contract for this AgentViz plan, checked against the local AgentBoard 0.8.15 source and agent documentation. This is not a whole repository audit or a live orchestrator run.

## Verdict

The native format is effective as a coordinating contract when a bound root explicitly opens cards, records their IDs, observes real check receipts and reviews their changes. Markdown alone is not an executable workflow graph, a test harness or a security boundary. Keep the native mechanisms and make the document harder to misread; another orchestration framework is unnecessary.

## Findings and changes

| Finding | Evidence | Applied optimization |
| --- | --- | --- |
| Heading and indentation sensitivity can change the approved task count. | Fresh source probe: two listed outcomes count as two; adding an unindented owner bullet counts as another outcome. A later `Plan notes` heading replaces the earlier section, leaving one counted item. | One `Steps` section, ten numbered outcomes, all detail bullets indented four spaces, and no nested headings in that section. Validate the actual parser count before handoff. |
| Logical labels are not board dependencies. | `validateRequest` rejects `after: ["S01"]` and accepts a syntactically valid six hexadecimal character card ID. | Keep S01 through S10 as document labels and require the root to record actual returned card IDs before dispatching dependent work. Allocation and a live worker are tracked separately. |
| Broad checks can pass while the requested feature is absent. | Native completion rules name catalogue commands; an existing `npm test` run does not establish coverage of a new requirement. `doneWhen` is text, not an executable assertion. | Provide a real check catalogue, require a regression that failed before each nontrivial change, inspect the task's evidence and diff, and use independent review before acceptance. GUI acceptance remains a separate milestone. |
| Default capacity is generous for this batch and does not create watchers or reviewers automatically. | `DEFAULT_CAPS` allows 600 total cards. Caps are limits, not automatic allocations or execution policies. | Propose four open, 32 total, depth two and two fix follow ups. Serialize writers to shared files, open bounded independent review cards explicitly, and record capacity exhaustion instead of starting a replacement run. |
| Free form instructions do not guarantee recovery after context loss. | The Markdown parser only reports a count and a point estimate. It does not retain ownership, commits, check results or evidence locations. The live board retains runtime state separately. | Add a durable execution record and a resume protocol that reconciles it with Git, live board records, bound session identity and queued messages. Reuse surviving cards instead of duplicating work. |
| Policy and `noSync` are not enforcement for every external action. | The orchestrator brief says policy is copied into prompts, `noSync` depends on hook support, and `finish self` can lead to merge, push and cleanup. | Use an explicit local only policy. Stop at delivery ready with a local package when the app's finish path would push. Do not equate `noSync` with blocked network or automatic safe finishing. |
| Choosing a static workflow file would change the requested execution model. | AgentBoard documents `.plan.json` for predetermined expanded workflows and `ORCHESTRATION.md` for adaptive model coordination. | Deliver native orchestrator material and a launch instruction, with no competing static plan or custom runner. Resolve models/accounts from current advertised capabilities rather than pinning old provider assumptions. |

## Deliverables

`ORCHESTRATION.md` contains the product contract, ten outcomes, file ownership, dependencies, evidence gates, root launch text and continuation protocol. `workflows/checks.json` supplies existing runnable commands. `workflows/agentviz-next.caps.json` and `workflows/agentviz-next.policy.json` use native request fields. `docs/development/agentviz-next-run.md` starts honestly at prepared, not launched.

The run starts with workspace identity and saved names, then filtering, then complete catalogue lookup. Those three outcomes form the first usable checkpoint. Subsequent outcomes add source backed lanes, explicit task progress, a file footprint, a narrow AgentBoard entry command, resilience checks, Windows acceptance and the reviewed local package. The orchestration material and board runtime state are excluded from the extension package.

## Verification

Validation loads the current TypeScript source for `src/orchestrator.ts` through AgentBoard's installed compiler in memory. It does not write or rebuild AgentBoard. Six initial assert based probes reproduced the task counting and dependency behavior and accepted a native caps/policy proposal. The delivered document is checked again with that same source, including its exact task count, valid request fields, matching check names and the prepared execution record.

The reference locations are `C:\Users\rober\Documents\Dev Stuff\AgentBoard\src\orchestrator.ts` (`planSummary`, `validateRequest`, caps and completion validation), `src/checks.ts` (catalogue rules), `docs/agents/README.md` and `docs/orchestrator/BRIEF.md`. The source hash and validation results are retained locally under ignored `artifacts/orchestration-format-audit.json`.

No AgentBoard cards were created and no implementation tasks were launched. This audit does not prove signed in model availability, live approval delivery, check execution inside a future child's worktree, recovery after a real crash, or the installed extension matching this source checkout. The bound root must probe those live conditions when the user starts the run. The existing Git commit and first slice evidence are context, not substitutes for that runtime check.

## Further upstream work

A future change in the AgentBoard project could make the Markdown parser fence aware and reject ambiguous repeated task headings instead of silently replacing the count. It could also distinguish executable acceptance from descriptive completion text in its preview. Those are separate project changes; this audit has not modified AgentBoard or added a parallel parser to AgentViz.
