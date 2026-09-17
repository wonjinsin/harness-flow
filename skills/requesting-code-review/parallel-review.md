# Concurrent Review Assignments

Small and medium changes use a single reviewer with the complete rubric. For a
large review surface whose size or spread limits complete cross-file reasoning,
use two detail reviewers and one integration reviewer concurrently when the
files can be divided into cohesive groups. High risk alone does not require
three reviewers. Preserve the caller's immutable range, risk tier, reasoning
effort, correction-turn limit, and single returned report.

## Assign and dispatch

Freeze two non-empty, disjoint detail groups whose union is the full manifest.
Keep closely coupled implementation and tests together where practical. Use
stable global indices into the packet's ordered manifest, never shard-local
indices. Record the controller's `assignments` before dispatch:

| Role | File assignment | Required `checksCompleted` |
| --- | --- | --- |
| `detail_a` | First detail group | All 20 checks in the `detail and single` fragment. |
| `detail_b` | Second detail group | All 20 checks in the `detail and single` fragment. |
| `integration` | The entire manifest | All 12 checks in the `integration` fragment. |
| `single` | The entire manifest | All 20 checks in the `detail and single` fragment. |

All receive the full frozen manifest and the same inline requirements, commit
range, prepared evidence, verification evidence, risk metadata, and prior reports.
Every reviewer reads every complete diff section. Detail reviewers inspect every
hunk and both review stages for assigned paths, including every part of each
nondeleted assigned file's resulting content. Integration independently inspects
every changed file directly, every requirement, and every earlier blocker against
the resulting tree; do not wait for detail reports. Single owns the entire change.
Inspect needed cross-group and unchanged interactions. A defect outside an
assignment must still be reported if noticed. No check is optional.

Integration and single supply exact earlier blocker text plus evidence for every
prior blocker. Details supply a unique exact-text subset for relevant prior
blockers. No prior reports means an empty prior-verification list, not missing
test evidence. All assignments use fresh context, the same pinned model tier and
reasoning effort, the shared `code-reviewer.md` prompt and JSON schema, and their
complete fragment from `review-checks.md`. Copy exact check names into
`checksCompleted`; put no prose in that array. Use a different unused ordinal for
each native dispatch name. Reviewers never delegate.

Start all three before waiting for any report. If fewer than three reviewer slots
can run concurrently, or no cohesive two-group partition exists, use a single
reviewer with every check and disclose the fallback. Do not queue three serial
reviews or lower the model tier or reasoning effort to meet a timing target.
If dispatch fails partway, stop outstanding reviewers, wait for termination, and
return incomplete after postflight; partial work is not a single-review fallback.

## Validate and combine

Apply this section to parallel and single reviews. Wait until every reviewer has
finished or confirmed termination before postflight. Repeat the main skill's
repository snapshots once around the entire group. Verify the prepared packet
digest still matches. Do not allow edits or finalization while any reviewer remains
active.

Use `scripts/combine-reviews.js` with a JSON input containing the complete parsed
`packet` object, `reports` as report objects or JSON file paths, `assignments`,
the pinned `riskLevel`, every exact earlier blocker text in `priorFindings`,
`transport: "native"`, and the reader's `maxBytes`. Report file paths resolve from
the input file's directory. Store controller-created files outside the checkout.
The combiner derives the complete section set from the packet. If supplied,
`expectedSections` must match that set. Fully inlined evidence uses explicit
`transport: "inline"` with no section indices; omitting transport is an error.
Single may omit `assignments` or supply exactly `{ "single": [all file indices] }`.
Parallel requires exactly the three role keys above; detail sets must be disjoint
and cover the whole manifest, and integration must list every file index.

For example, a two-file packet without prior findings uses this controller input
construction; replace paths, assignments, and risk with the frozen invocation:

```javascript
const fs = require('node:fs');
const packet = JSON.parse(fs.readFileSync('/absolute/review/packet.json', 'utf8'));
const input = {
  packet,
  reports: ['detail-a.json', 'detail-b.json', 'integration.json'],
  assignments: { detail_a: [0], detail_b: [1], integration: [0, 1] },
  riskLevel: 'high',
  priorFindings: [],
  transport: 'native',
  maxBytes: 24000,
};
fs.writeFileSync('/absolute/review/combine-input.json', JSON.stringify(input));
```

Then run `node <skill-dir>/scripts/combine-reviews.js /absolute/review/combine-input.json`
and inspect the complete output and exit status: 0 means structurally complete,
1 means incomplete, and 2 means input could not be processed. Always check findings
and postflight before approval. Preserve all available raw reports on
failure; do not manufacture a clean report when parsing fails.

The combiner validates exact range and digest, role and check sets, each detail
report's exact assigned file indices, integration's or single's full manifest,
every reviewer's complete section indices, and required prior verification.
Do not sum file counts: duplicate paths cannot compensate for omissions. Map
validated indices back to exact paths. Keep per-role evidence. These attestations
validate report structure; they cannot prove that a model inspected the source
correctly or establish unchanged defect recall.

A timeout, missing/malformed response, incomplete assignment, stale range, required
execution failure, or detected mutation makes the combined `Review complete: no`.
Preserve available findings and new high-risk signals even in incomplete reports.
A standard-risk review exposing new high-risk evidence remains incomplete for the
caller's escalation rule. Missing evidence must never become approval.

Combine exact duplicate finding records at their highest severity. Preserve distinct
consequences, corrections, and uncertain duplicates verbatim. Silence from another
reviewer does not refute a finding. The caller checks supplied findings for conflicting
conclusions; if their evidence cannot reconcile them, keep both and set
`Review complete: no`. Do not approve by majority vote or perform a full serial re-review.
Do not dispatch an additional aggregation model. Structural validation and formatting
are deterministic; no new analysis pass is needed to rewrite the reports.

Return one report with only `Review complete` and `Blocking findings` as decision
fields. Include strengths, all blocking and non-blocking findings, exact range and
reviewed paths, prior verification, and each assignment's coverage. A complete report
may contain blockers; correction and further review remain the caller's responsibility.
