---
name: implement
description: Use when code changes are ready to execute because requirements and acceptance criteria are settled.
---

# Implement

Execute settled code work **inline**, own a bounded review/correction loop, then
hand the approved commit to finalization. Load optional protocols only when needed.

## Before you start

Accept one settled implementation input; its source and request classification
belong to the caller. It contains the desired change, scope and constraints,
acceptance criteria, optional ordered tasks, and optional reproducer plus confirmed
root-cause evidence.

Scan the input once for conflicts, missing acceptance criteria, or anything a
reviewer would reject. Recover a missing detail with one or two settling questions;
do not bounce the user back to an earlier skill. If the input is clean, proceed.

## Current checkout preflight

Before the first code change:

1. Run `git status --short --branch`. If staged, unstaged, or untracked paths contain
   any pre-existing uncommitted user changes, preserve them exactly and stop for
   user direction. Continue only after `git status --porcelain` is empty; never
   stash, reset, clean, stage, commit, or discard the user's work yourself.
2. Record checkout identity with `git rev-parse --show-toplevel`,
   `git rev-parse --git-dir`, `git symbolic-ref -q --short HEAD`, and
   `git rev-parse --verify 'HEAD^{commit}'`. If the branch query is empty, a
   detached HEAD is detected. Before the first code change, the controller must stop
   and require user direction. Reuse the recorded top-level path, git dir, and
   branch as stable checkout identity.
3. Detect `BASE_REF` from `origin`'s default branch; fall back to `main`, then
   `master`. Pin its immutable merge-base as `BASE_SHA` **before the first code
   change**, verify it resolves to a commit, and reuse that SHA for completeness
   checks and final review. If the current branch is already the base branch, say
   **before editing** that the final PR/base-merge choice will be unavailable.
   Continue only when the user already chose the current checkout or confirms it.
   Before the integration choice, do not create or switch a branch or worktree.
   The user-selected base merge during finalization is the sole exception.
4. Prepare dependencies when needed and run the project's existing baseline suite.
   A failure already named by the settled reproducer is expected evidence; any
   unexpected baseline failure must stop implementation. Report the evidence and
   return to `harness-flow:systematic-debugging` before proceeding.
5. With a reproducer and confirmed root cause, record current `HEAD` as
   `ATTEMPT_BASE` immediately before its first Red cycle.

## Default: implement inline

Work the input in the current session, on the session's model:

1. Load `test-driven-development` and implement each logical task Red → Green → Refactor.
   When the input includes a reproducer, turn it into the first failing test.
2. Run the formatter before each task or final commit when applicable, inspect its
   writes, and confirm they remain inside the settled boundaries. Run the targeted
   tests after formatting. Commit each ordered task separately; without ordered
   tasks, commit once the acceptance criteria pass.
3. After the last task, run the full suite + format check + typecheck once. The
   final format check must not write files. When the project exposes only a
   mutating formatter, run it before the relevant commit and use the clean-tree
   check as final format verification.
4. If a formatter writes after the intended commit, inspect that delta immediately,
   rerun the relevant test, include it in task or work finalization, commit it,
   rerun the final checks, and require a clean worktree. Unknown or user-owned
   writes stop the workflow for user direction.

Do not pause between tasks to check in — execute the whole input. Stop only for a
blocker you cannot resolve or genuine ambiguity.

## Optional task isolation

Only when one task clearly benefits from fresh task isolation, read
[task-isolation.md](task-isolation.md). Do not load it for ordinary implementation.

## Before the final review: completeness check

Verify completeness against the actual diff (`git diff "$BASE_SHA"..HEAD`):

- Every ordered task is complete, including its declared files and inherited
  constraints.
- Every acceptance criterion holds and the diff stays inside the settled scope.
- When the input includes a reproducer and root-cause evidence, the reproducer
  failed for the expected reason before the change, now passes, and the confirmed
  cause is corrected.

Missing work returns to implementation. A failed root-cause correction must not
remain under the next hypothesis. Confirm every commit in `ATTEMPT_BASE..HEAD`
belongs only to this attempt, then create normal revert commit(s); remove any
uncommitted delta only when it is current-attempt controller-authored work. Rerun
the baseline and require a clean worktree before returning the new evidence to
`harness-flow:systematic-debugging`. Never reset, rebase, or amend history. Mixed
ownership or a revert conflict stops for user direction. Do not request final
review or offer integration for partial or failing work.

After completeness holds and before pinning the review range, invoke
`harness-flow:llm-md-revise` when the session produced durable candidates. Settle
every candidate and any approved edit, including its commit decision. Approved
instruction edits must be committed so the final review includes them. If the
user leaves an approved edit uncommitted, stop before review. Skip this step when
nothing qualifies, and require a clean worktree before continuing.

## Bounded review loop

Require committed output and a clean worktree. For the initial review, pass the
immutable `BASE_SHA` as `FROM_SHA`, current `HEAD` as `TO_SHA`, the settled
requirements, and `PRIOR_REPORT: None` to `requesting-code-review`.

Handle each returned report mechanically:

- `Review complete: no` → stop and surface its plain-language explanation.
- A complete report with `Blocking findings: none` → record that report's
  `TO_SHA` as `APPROVED_SHA` and leave the loop.
- A complete report with blocking findings → if two correction review turns have
  already been spent, stop and surface the remaining findings. Otherwise record
  the report's `TO_SHA` as `LAST_REVIEWED_SHA` and append its whole report to the
  bounded `PRIOR_REPORT` history under `Earlier report N`. Batch every blocking
  finding, follow TDD, run the relevant checks and full suite, commit the
  correction, and require a clean worktree.
  Request the next fresh review with `LAST_REVIEWED_SHA` as `FROM_SHA`, current
  `HEAD` as `TO_SHA`, unchanged requirements, and `PRIOR_REPORT`.

Allow at most two correction review turns after the initial review. Each review
inspects exactly one immutable range; the initial range covers the settled branch,
and later ranges cover only committed corrections. Never invoke `implement`
recursively or restart an unbounded review loop.

## Finish

After the loop records `APPROVED_SHA`, do not change the source checkout. Only
then read [finish-reviewed-change.md](finish-reviewed-change.md) and pass that
exact SHA to its finalization procedure. Any intervening source change requires
a new review.
