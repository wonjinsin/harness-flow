# Parallel Review

Use this reference only for a large review surface. Keep the caller's immutable
range, risk classification, correction-turn limit, and single returned report.

## Assign and dispatch

Partition the frozen manifest into two non-empty, disjoint groups. Keep each
behavior's implementation, related tests, and required documentation together.
Keep rename source and destination together. Balance by changed content and
coupling rather than file count. Do not split a file's hunks between reviewers.
If two cohesive groups cannot be formed, or fewer than three reviewer slots can
run concurrently, use a single reviewer for the entire manifest and explain why.
Do not queue three serial reviews or lower the pinned risk tier.

Dispatch two detail reviewers and one integration reviewer using the shared
`code-reviewer.md` template. Give all three the same inline requirements, commit
range, verification evidence, risk metadata, complete prior reports, and full
frozen manifest. Fill `REVIEW_ASSIGNMENT` with one of these scopes:

- **Detail A / Detail B:** list the assigned group's exact paths. Review every
  hunk in those files through both review stages, including implementation,
  tests, comments, and documentation. Inspect needed interactions outside the
  group, but list only fully reviewed assigned paths as coverage. Verify prior
  blockers touching the group; the integration reviewer owns all prior blockers.
- **Integration:** assign the entire manifest. Read every changed file's diff
  directly. Check every requirement and acceptance criterion, verification
  sufficiency, and every earlier blocker against the resulting tree. Focus the
  quality stage on cross-file behavior, interfaces, compatibility, security,
  migrations, and concurrency. The detail reviewers own exhaustive local quality
  checks. Do not wait for or rely on detail reports to perform this inspection.

All assignments use fresh context and the pinned model tier. Start all three
before waiting for any report; each also batches independent tool reads. Use a
different unused ordinal for each native dispatch name. Reviewers never delegate.
If dispatch fails partway, stop outstanding reviewers, wait for their termination,
and return an incomplete report after postflight; do not treat partial work as a
single-review fallback.

## Validate and combine

Wait until every reviewer has finished or confirmed termination before postflight.
Apply the main skill's before/after snapshot comparison once around the entire
group, not once per reviewer. Do not let the caller edit or finalize the checkout
while a reviewer remains active.

Validate each report's range, required fields, assignment completion, exact
reviewed paths, and prior verification. The two detail assignments must be
disjoint; the set union of their reviewed paths must equal the frozen manifest.
The integration review must independently cover that manifest and every earlier
blocker. Do not sum file counts: duplicate paths cannot compensate for omissions.
A path counts only when all its required diff hunks were reviewed. Derive the
combined `N/N` from unique paths and preserve per-assignment coverage as evidence.

A timeout, missing or malformed report, incomplete assignment, range mismatch,
execution failure, or detected mutation makes the combined `Review complete: no`.
Preserve all available findings and new high-risk signals even in incomplete
reports, so the caller can apply its existing escalation rule. Explain missing
evidence without inventing a pass or retrying review inside this invocation.

Combine and deduplicate findings by underlying defect, preserving distinct
consequences, evidence, corrections, and the highest severity. Silence from another
reviewer does not refute a finding. For conflicting conclusions that cannot be
reconciled from the supplied evidence, keep both with their evidence and mark
`Review complete: no`; do not approve by majority vote. Do not perform a full serial
re-review during aggregation or fix findings here.

Return one report in the shared template's format with only `Review complete` and
`Blocking findings` as decision fields. Use full-manifest coverage, the integration
reviewer's prior verification, and a concise explanation of each assignment's
coverage. Include all blockers and non-blocking findings; a complete report with
blockers remains complete and leaves correction decisions to the caller.
