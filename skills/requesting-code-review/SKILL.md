---
name: requesting-code-review
description: Use when tasks or major features are complete, before merging, or when the user explicitly asks for a code review of a branch, diff, or recent changes.
---

# Requesting Code Review

Dispatch one fresh-context, report-only reviewer over one immutable commit range.
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

For a standalone request, honor a user-supplied commit range or base branch. When
neither is supplied, detect the base from `origin`'s default branch, then `main`,
then `master`; pin the branch point and current committed head:

```bash
TO_SHA=$(git rev-parse --verify 'HEAD^{commit}')
FROM_SHA=$(git merge-base <base-ref> "$TO_SHA")
git rev-parse --verify "$FROM_SHA^{commit}"
```

This reviews the current branch's committed work even when the base branch moved.
If the range is empty, report that there is nothing to review. Uncommitted changes
are outside this contract.

## Preflight

Verify both SHAs resolve to commits. Require current `HEAD == TO_SHA`, an empty
`git status --porcelain`, and a non-empty `FROM_SHA..TO_SHA` diff. For a managed
package, require its verified commit to equal `TO_SHA` and both `PRE_CHECK` and
`POST_CHECK` to record that same clean state; mismatched or missing evidence stops
dispatch. Stop instead of reviewing a stale, partial, dirty, invalid, or empty package.

Before dispatch, capture this repository-state snapshot. Hash config and remote
output so credentials embedded in URLs are not printed:

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

Use native read-only controls when available. Otherwise the report-only prompt and
before/after snapshot provide detection, not fail-closed isolation: ignored-file
contents are not covered. If a caller requires fail-closed isolation, do not
dispatch without an enforcing control.

## Dispatch

Fill the single template in [code-reviewer.md](code-reviewer.md) with
`{REQUIREMENTS}`, `{VERIFICATION_EVIDENCE}`, `{FROM_SHA}`, `{TO_SHA}`, and
`{RISK_LEVEL}`, `{RISK_BASIS}`, `{REVIEW_MODEL}`, and `{PRIOR_REPORT}`. Dispatch
exactly one general-purpose reviewer: `standard` uses the harness's mid-tier model;
`high` uses its most-capable available model. Use fresh-context on every invocation;
do not resume a previous reviewer or pass implementation-session history.

- **Claude Code:** Task/Agent with `general-purpose`; select the current mid-tier
  equivalent for `standard` and most-capable equivalent for `high`.
- **Codex:** `spawn_agent` with the unique `task_name:
  "final_review_<unused-ordinal>_<TO_SHA-prefix>"`, `fork_turns: "none"`, and the
  filled prompt. Choose an unused ordinal, omit unsupported model/profile fields,
  and request the selected risk-based tier.

The reviewer reads every changed file's diff separately and proves `N/N` coverage.
The optional prior report asks the same reviewer function to verify earlier
blocking findings while reviewing the new range; it does not create another mode,
finding ledger, or persistent reviewer state.

## Validate and return

After the reviewer returns, repeat every snapshot check and compare it with the
preflight values. If repository state changed, invalidate the report, surface the
observed change, and never revert it automatically.

A valid report contains `Review complete: yes | no`, exact range, `Reviewed files: N/N`,
`Blocking findings: none | finding list`, and an explanation when incomplete. A `standard`
report naming a new high-risk signal with `Review complete: yes` is malformed; return `Review complete: no` and explain.

Timeouts, empty responses, malformed output, incomplete coverage, stale ranges,
or detected repository mutation are not approval. Return `Review complete: no`
with a plain-language explanation; do not classify the reason with a status code.
When the fields are consistent, return the report unchanged. The caller decides
whether to stop, fix the blocking findings, or request another review.
