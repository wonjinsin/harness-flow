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
`TO_SHA` commits, and `PRIOR_REPORT` (all earlier complete reports in order, or
`None` for initial and standalone reviews). Separate raw reports with `Earlier
report N` headings; the bounded loop supplies at most two.

A managed initial review passes its pinned `BASE_SHA` as `FROM_SHA`. A managed
incremental review passes `LAST_REVIEWED_SHA` as `FROM_SHA`. Both pass the current
committed `HEAD` as `TO_SHA`. Never recompute a caller-supplied range.

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
`git status --porcelain`, and a non-empty `FROM_SHA..TO_SHA` diff. Stop instead of
silently reviewing a stale, partial, dirty, invalid, or empty package.

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
`{REQUIREMENTS}`, `{FROM_SHA}`, `{TO_SHA}`, and `{PRIOR_REPORT}`. Dispatch exactly
one general-purpose reviewer on the harness's mid-tier model. Use fresh-context on
every invocation; do not resume a previous reviewer or pass implementation-session
history.

- **Claude Code:** Task/Agent with `general-purpose`, `model: sonnet` or the current
  mid-tier equivalent.
- **Codex:** `spawn_agent` with the unique `task_name:
  "final_review_<unused-ordinal>_<TO_SHA-prefix>"`, `fork_turns: "none"`, and the
  filled prompt. Choose an unused ordinal, omit unsupported model/profile fields,
  and request the mid-tier model.

The reviewer reads every changed file's diff separately and proves `N/N` coverage.
The optional prior report asks the same reviewer function to verify earlier
blocking findings while reviewing the new range; it does not create another mode,
finding ledger, or persistent reviewer state.

## Validate and return

After the reviewer returns, repeat every snapshot check and compare it with the
preflight values. If repository state changed, invalidate the report, surface the
observed change, and never revert it automatically.

A valid report contains `Review complete: yes | no`, the exact reviewed range,
`Reviewed files: N/N` when complete, `Blocking findings: none | finding list`, and
a plain-language explanation when the review is not complete.

Timeouts, empty responses, malformed output, incomplete coverage, stale ranges,
or detected repository mutation are not approval. Return `Review complete: no`
with a plain-language explanation; do not classify the reason with a status code.
When the fields are consistent, return the report unchanged. The caller decides
whether to stop, fix the blocking findings, or request another review.
