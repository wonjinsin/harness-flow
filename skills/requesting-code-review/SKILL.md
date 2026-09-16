---
name: requesting-code-review
description: Use when tasks or major features are complete, before merging, or when the user explicitly asks for a code review of a branch, diff, or recent changes.
---

# Requesting Code Review

Dispatch fresh-context, report-only review over one immutable commit range.
One invocation returns one report and stops. It never fixes code, repeats a review,
or finishes a branch; a caller such as `implement` owns those decisions.

## Input

Every package contains settled `REQUIREMENTS` copied inline, exact `FROM_SHA` and
`TO_SHA` commits, `VERIFICATION_EVIDENCE`, `RISK_LEVEL`, `RISK_BASIS`, and
`PRIOR_REPORT` (all earlier complete reports in order, or `None` for initial and
standalone reviews). Separate raw reports with `Earlier report N` headings; the
bounded loop supplies at most two.

A managed caller must supply `VERIFICATION_EVIDENCE`: verified commit equal to `TO_SHA`;
`PRE_CHECK` recording `HEAD == TO_SHA` and a clean worktree; each check's exact command,
exit status, and concise observed result; and `POST_CHECK` recording `HEAD == TO_SHA`
and a clean worktree. A standalone caller may pass `None`; absence never means pass.

A managed initial review passes pinned `BASE_SHA` as `FROM_SHA`. Standard incremental
correction passes `LAST_REVIEWED_SHA` as `FROM_SHA`; high-risk correction passes
`BASE_SHA` as `FROM_SHA` for full-range review. All pass committed `HEAD` as `TO_SHA`;
never recompute a caller-supplied range.

Classify `RISK_LEVEL` as `high` when requirements or the resulting diff touch
authentication, authorization, cryptography, secret handling, migration or durable
schema, data loss, concurrency or transactions, public compatibility boundaries,
multiple coupled subsystems, or a large review surface whose size or spread limits complete
cross-file reasoning. Otherwise use `standard`. Record concrete paths and trigger as
`RISK_BASIS`; a managed loop may upgrade to `high` but never downgrade before approval.

For standalone review, honor the requested range or base; otherwise use `origin`'s
default branch, then `main`, then `master`. Pin the branch point and committed head:

```bash
TO_SHA=$(git rev-parse --verify 'HEAD^{commit}')
FROM_SHA=$(git merge-base <base-ref> "$TO_SHA")
git rev-parse --verify "$FROM_SHA^{commit}"
```

Review committed branch work even when the base moved. Report empty ranges as nothing
to review; uncommitted changes are outside this contract.

## Preflight

Verify both SHAs resolve to commits. Require current `HEAD == TO_SHA`, an empty
`git status --porcelain`, and a non-empty `FROM_SHA..TO_SHA` diff. For a managed
package, require its verified commit to equal `TO_SHA` and both `PRE_CHECK` and
`POST_CHECK` to record that same clean state; mismatched or missing evidence stops
dispatch. Stop instead of reviewing a stale, partial, dirty, invalid, or empty package.

Before dispatch, snapshot repository state. Hash config and remote output to avoid
printing embedded credentials:

```bash
git rev-parse --verify 'HEAD^{commit}'
git symbolic-ref -q HEAD
git status --porcelain=v2 --branch --untracked-files=all --ignored=matching
git for-each-ref --format='%(refname) %(objectname)'
git ls-files --stage --debug | git hash-object --stdin
git config --local --list | git hash-object --stdin
git remote -v | git hash-object --stdin
git diff --quiet "$FROM_SHA" "$TO_SHA" # exit 1 confirms a non-empty diff
```

Capture every command and pipeline exit status with pipefail or its equivalent.
For `git diff --quiet`, exit 1 means the required non-empty diff, exit 0 means an
empty range, and any other status is an error. Stop on any other snapshot failure.
Run independent snapshot commands in parallel; inspect every result before dispatch.
Set `GIT_OPTIONAL_LOCKS=0` to prevent index refreshes during inspection.
Do not overlap either snapshot with review execution.

Use native read-only controls when available. Otherwise the report-only prompt and
before/after snapshot provide detection, not fail-closed isolation: ignored-file
contents are not covered. If a caller requires fail-closed isolation, do not
dispatch without an enforcing control.

## Dispatch

Freeze the changed-file manifest with
`git diff --name-only -z --no-renames --diff-filter=ACDMRTUXB FROM_SHA..TO_SHA`.
Preserve exact paths when decoding NUL-delimited output; disabling rename detection
keeps both old and new paths in coverage. Stop on failed or truncated output.

For a large review surface whose size or spread limits cross-file reasoning,
load [parallel-review.md](parallel-review.md) to assign three concurrent reviewers.
Otherwise use one reviewer with a `single` assignment covering the entire manifest.
High risk alone does not require three reviewers.

Fill the single template in [code-reviewer.md](code-reviewer.md) with
the input fields, `{REVIEW_MODEL}`, and `{REVIEW_ASSIGNMENT}` (role, frozen manifest,
assigned paths, and scope). Each reviewer uses the pinned risk tier:
`standard` uses the harness's mid-tier model; `high` uses its most-capable available
model. Use fresh-context on every invocation;
do not resume a previous reviewer or pass implementation-session history.

- **Claude Code:** Task/Agent with `general-purpose` and the selected tier.
- **Codex:** `spawn_agent` with the unique `task_name:
  "final_review_<unused-ordinal>_<TO_SHA-prefix>"`, `fork_turns: "none"`, and the
  filled prompt. Omit unsupported model/profile fields; request the selected tier.

## Validate and return

After all reviewers finish, repeat every snapshot check and compare it with the
preflight values. If repository state changed, invalidate the report, surface the
observed change, and never revert it automatically.

A single or combined report contains `Review complete: yes | no`, exact range, `Reviewed files: N/N`,
exact reviewed paths, prior verification, `Blocking findings: none | finding list`,
and an explanation when incomplete. Require the reviewed path set to equal the
frozen manifest, not just matching counts. A `standard`
report naming a new high-risk signal with `Review complete: yes` is malformed; return `Review complete: no` and explain.

Timeouts, empty responses, malformed output, incomplete coverage, stale ranges,
or detected repository mutation are not approval. Return `Review complete: no`
with a plain-language explanation; do not classify the reason with a status code.
Return a valid single report unchanged; combine parallel reports using the reference.
The caller owns fixes and further reviews.
