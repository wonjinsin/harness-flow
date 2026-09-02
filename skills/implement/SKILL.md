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
3. After commit, pin current `HEAD` as `TO_SHA`; require `HEAD == TO_SHA` and a clean
   worktree, then run the full suite + format check + typecheck once. Record each exact
   command, exit status, and concise result. The final format check must not write files.
   Run a mutating formatter before commit and use the clean-tree check for final proof.
4. Before and after those commands, require the same `TO_SHA` and clean worktree;
   package records as `VERIFICATION_EVIDENCE`. If a formatter writes, inspect the delta, rerun
   the relevant test, commit controller-owned work, and restart verification at the new
   `TO_SHA`. Unknown or user-owned writes stop for user direction.

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

Before pinning the review range, invoke `harness-flow:llm-md-revise` when the session
produced durable candidates. Settle every candidate and approved edit, including its
commit decision. Approved instruction edits must be committed so the final review includes them;
an approved but uncommitted edit stops. Skip when nothing qualifies and require a clean
worktree. After `llm-md-revise`, if `HEAD` differs from the verified `TO_SHA`, rerun
final verification at the new clean commit and replace `VERIFICATION_EVIDENCE`.

## Bounded review loop

Before the initial review, classify and pin `RISK_LEVEL` plus `RISK_BASIS` from the
requirements and complete `BASE_SHA..HEAD` diff using `requesting-code-review`'s risk
signals. Never downgrade before approval; upgrade when a high-risk signal appears.

Require committed output and a clean worktree. For initial review, pass immutable
`BASE_SHA` as `FROM_SHA`, current `HEAD` as `TO_SHA`, settled requirements, SHA-bound
`VERIFICATION_EVIDENCE`, pinned risk, and `PRIOR_REPORT: None`.

Handle each returned report from its evidence:

Before any decision branch, inspect a `standard` report for a concrete new high-risk signal,
regardless of its `Review complete` value. Confirm it in requirements or diff; upgrade to
`high` and request one fresh `BASE_SHA..TO_SHA` review with unchanged requirements and evidence. Do not spend a correction review turn. Unconfirmed signals stop.

- Any other `Review complete: no` → stop and surface its plain-language explanation.
- A complete report with `Blocking findings: none` → record that report's
  `TO_SHA` as `APPROVED_SHA` and leave the loop.
- A complete report with blocking findings → validate every blocking finding against
  the settled requirements, resulting tree, all relevant tests, and acceptance criteria.
  A blocker is disputed only when it is factually
  false, contradicts a settled requirement, or its correction would violate an
  acceptance criterion; preference or low confidence is not enough. For a disputed
  blocker, do not change code, dismiss the finding, or approve the range. Stop and
  surface the exact finding, rebuttal evidence, and correction consequence for user
  direction. If all blockers are valid but two correction review turns have already
  been spent, stop and surface the validated findings. Otherwise record the report's
  `TO_SHA` as `LAST_REVIEWED_SHA`, append its whole report to the bounded
  `PRIOR_REPORT` history under `Earlier report N`, then batch every valid finding,
  follow TDD, run the relevant checks, commit the correction, then regenerate full `VERIFICATION_EVIDENCE` at the
  clean committed `TO_SHA`.
  For `standard`, request the next fresh review with `LAST_REVIEWED_SHA` as
  `FROM_SHA`; for `high`, use `BASE_SHA` so the most-capable reviewer rechecks the
  full resulting branch. Pass current `HEAD` as `TO_SHA`, unchanged requirements,
  fresh `VERIFICATION_EVIDENCE`, pinned risk, and `PRIOR_REPORT`.

Allow at most two correction review turns after the initial review. Each review
inspects exactly one immutable range; the initial range covers the settled branch,
standard later ranges cover only committed corrections, while high-risk later
ranges cover the full resulting branch. Never invoke `implement` recursively or
restart an unbounded review loop.

## Finish

After the loop records `APPROVED_SHA`, do not change the source checkout. Only
then read [finish-reviewed-change.md](finish-reviewed-change.md) and pass that
exact SHA to its finalization procedure. Any intervening source change requires
a new review.
