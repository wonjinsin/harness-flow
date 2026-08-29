---
name: implement
description: Use when executing settled code work in the current session from an agreed small-change brief, an approved implementation plan, or a confirmed bug-fix brief.
---

# Implement

Execute settled code work **inline**, then start the review gate with **one initial
fresh-context whole-branch review** and own bounded revisions through the integration
decision. Dispatch a subagent for a task
only when a fresh subagent context clearly helps — never for parallelism.

## Before you start

Accept one of these inputs:

- **Agreed small-change brief** — goal, acceptance checks, and boundaries.
- **Approved implementation plan** — its tasks and settled requirements.
- **Confirmed bug-fix brief** — reproducer, root-cause evidence, minimal correction,
  boundaries, and acceptance checks.

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
   The user-selected base merge in Closeout is the sole exception.
4. Prepare dependencies when needed and run the project's existing baseline suite.
   A failure already named by a confirmed bug-fix brief is expected evidence; any
   unexpected baseline failure must stop implementation. Report the evidence and
   return to `harness-flow:systematic-debugging` before proceeding.
5. For a confirmed bug-fix brief, record current `HEAD` as `ATTEMPT_BASE`
   immediately before its first Red cycle.

## Default: implement inline

Work the input in the current session, on the session's model:

1. Load `test-driven-development` and implement each logical task Red → Green → Refactor.
   For a confirmed bug-fix brief, turn its reproducer into the first failing test.
2. Run the formatter before each task or brief commit when applicable, inspect its
   writes, and confirm they remain inside the settled boundaries. Run the targeted
   tests after formatting. For a plan, commit each task separately; for a
   small-change or bug-fix brief, commit once its acceptance checks pass.
3. After the last task, run the full suite + format check + typecheck once. The
   final format check must not write files. When the project exposes only a
   mutating formatter, run it before the relevant commit and use the clean-tree
   check as final format verification.
4. If a formatter writes after the intended commit, inspect that delta immediately,
   rerun the relevant test, include it in task or brief finalization, commit it,
   rerun the final checks, and require a clean worktree. Unknown or user-owned
   writes stop the workflow for user direction.

Do not pause between tasks to check in — execute the whole input. Stop only for a
blocker you cannot resolve or genuine ambiguity.

## Option: isolate a task in a subagent (sequential, no parallelism)

When a fresh, clean context would clearly help — a long plan is filling your own
context, or a task benefits from unbiased implementation — dispatch ONE
general-purpose subagent for that task:

- Pass the current work item's settled input as its prompt inline (no extra brief
  files, no ledger).
- Immediately before dispatch, resolve current `HEAD` as `EXPECTED_HEAD` and pass
  it with the stable checkout identity. Before editing, the subagent must run
  `git rev-parse --show-toplevel`, `git rev-parse --git-dir`,
  `git symbolic-ref -q --short HEAD`, and resolve HEAD, then compare every value,
  including current HEAD against `EXPECTED_HEAD`.
  A checkout identity mismatch must stop before any edit or commit and report the
  observed values.
- Give it the files to touch and the interfaces it must honor (derive these from
  the input and codebase), plus "TDD, one commit;
  comments state only what the code cannot — design history belongs in the commit
  message, not in code."
- When it returns, verify its commit landed on the current session branch before
  continuing. If a wrong-checkout commit still occurred, stop, report both checkout
  identities and the commit SHA, and wait for user direction. Never mutate the
  other checkout as an automatic repair.

**Pick a model tier for the dispatch — and set it explicitly.** Use the least
powerful model that fits, to conserve cost and speed:

- Mechanical task (isolated function, clear spec, 1–2 files) → cheap/fast model.
- Integration or judgment task (multi-file coordination, pattern matching,
  debugging) → standard model.
- Architecture or broad design task → the most capable model.

An omitted tier inherits the session default, which is usually the most expensive
model — always name the tier on dispatch. But the cheapest models routinely take
2–3× the turns on multi-step work and can cost more overall, so use a standard tier
as the floor for anything non-trivial.

This is the only subagent isolation on the build path — optional and sequential.

## Before the final review: completeness check

Inline execution has no external gate against silently dropping work, so verify it
yourself first against the actual diff (`git diff "$BASE_SHA"..HEAD`):

- Plan → every declared **Touches** file changed, every acceptance box holds, and
  all source requirements and inherited constraints are satisfied.
- Small-change brief → every acceptance check holds and the diff stays inside its
  boundaries.
- Bug-fix brief → the reproducer failed for the expected reason before the change,
  now passes, the root cause is corrected, and every acceptance check holds.

Missing work returns to implementation. A failed bug-fix verification must not
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

## Always: one initial whole-branch review, then bounded fix verification

After all tasks and any pre-review instruction revision settle, reuse the
immutable preflight `BASE_SHA` and record the current `REVIEWED_HEAD`. Pass the exact `BASE_SHA`
as `BASE_SHA` and `REVIEWED_HEAD` as `HEAD_SHA`, then request one
fresh-context `full-review` via `requesting-code-review` over that immutable range
on a mid-tier model (measured:
with the template's severity floor it holds at large-diff scale — the top-tier
premium buys nothing here). The review preflight must reject any current HEAD
that no longer equals `REVIEWED_HEAD`. Route the validated `Gate status` before
changing code:

- `incomplete` → stop and escalate with the missing evidence.
- `plan-escalate` → stop and escalate to the human.
- `pass` → the review passes; Minor findings remain optional.
- `impl-fix` → batch all Critical/Important implementation fixes, use
  TDD, run the relevant checks and full suite, then make one fix commit so
  `FIXED_HEAD` is immutable.

After an `impl-fix` batch, request a focused `verify-fix` over
`REVIEWED_HEAD..FIXED_HEAD`, passing the prior report, unchanged requirements,
and exact test evidence. Resume the same reviewer when supported; otherwise use
a fresh mid-tier reviewer with only that verify package. A complete report with
all prior findings resolved and no new Critical/Important issue has Gate status
`pass` and passes. Other statuses follow the same decision table above.

Maintain a finding ledger across verify turns. Pass only unresolved,
not-verifiable, and newly introduced Critical/Important IDs as active findings
for the next fix delta. Carry resolved IDs forward unchanged; never ask a later
delta to re-prove them.

Use another whole-branch `full-review` instead of `verify-fix` only when the fix
is not attributable to the reported findings or makes a semantic expansion by
changing a public API, schema or migration, security or authorization behavior,
or dependencies. That whole-branch `full-review` consumes the same limit below.
A verify report that marks this semantic expansion `incomplete` may request the
full-review when budget remains. Other `incomplete` reports, any
`plan-escalate`, or exhausted budget escalate to the human.

Allow at most two post-fix reviewer turns. Every post-fix dispatch —
`full-review` or `verify-fix` — counts toward the same limit. For another fix
round, advance `REVIEWED_HEAD` to the commit just reviewed, batch fixes again,
test, commit a new `FIXED_HEAD`, and spend the second turn. Never restart an
unbounded whole-branch loop.

## Closeout handoff

After final review passes, record its reviewed head as `PASSED_REVIEW_HEAD`. Do
not invoke `llm-md-revise` again or change the source checkout before integration.
The selected integration sequence is the only authorized closeout mutation. The
PR sequence publishes the reviewed SHA; the base-merge sequence includes its
approved base-branch switch, merge, and conflict recovery. Before
offering integration, require a clean worktree and verify that current `HEAD` equals `PASSED_REVIEW_HEAD`;
otherwise stop and require a new final review.

1. Detect the repository's base branch from `origin`'s default branch; fall back to
   `main`, then `master`. Do not guess another branch.
2. Ask exactly whether to **create a pull request** or **merge into the detected
   base branch**. Do not add keep, discard, branch deletion, or worktree cleanup
   choices.
   After the user selects a path and immediately before executing it, repeat the
   clean-worktree check and verify `HEAD` still equals `PASSED_REVIEW_HEAD`. Any
   mismatch stops integration and requires a new final review.
3. Pull request → invoke `harness-flow:pr-creator`, passing
   `PASSED_REVIEW_HEAD` for its execution-time guard.
4. Base merge:
   - Record the current named branch as `SOURCE_BRANCH`, the detected local base
     branch as `BASE_BRANCH`, and its current commit as `BASE_HEAD`.
   - Only after the user selects this path, switch to the detected base branch.
     If it is missing, checked out in another worktree, or cannot be switched to
     cleanly, stop; never operate on another checkout.
   - Verify the branch is `BASE_BRANCH`, `HEAD == BASE_HEAD`, and the worktree is
     clean. Merge exactly `PASSED_REVIEW_HEAD`, never the moving source-branch name.
     Verify the merge result descends from `PASSED_REVIEW_HEAD` before success.
   - On conflict, make no resolution edit. Run `git merge --abort`, verify
     `HEAD == BASE_HEAD` and a clean worktree, then switch back to `SOURCE_BRANCH`
     and verify `HEAD == PASSED_REVIEW_HEAD`. If any recovery check fails, stop
     for user direction; never reset or clean.
   - Conflict resolution is new source-branch implementation work: resolve, test,
     commit, and obtain a new final review before another merge attempt.
   Never delete the source branch or clean up a worktree automatically.

If HEAD is detached, the working tree is dirty, or the current branch already is
the base branch, report that state instead of pretending either integration action
is valid. Resolve it only with the user's direction.
