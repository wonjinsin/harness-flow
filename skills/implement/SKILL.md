---
name: implement
description: Use when executing settled code work in the current session from an agreed small-change brief, an approved implementation plan or spec, or a confirmed bug-fix brief.
---

# Implement

Execute settled code work **inline**, then get **one fresh-context review** and
own revisions through the integration decision. Dispatch a subagent for a task
only when a fresh subagent context clearly helps — never for parallelism.

## Before you start

Accept one of these inputs:

- **Agreed small-change brief** — goal, acceptance checks, and boundaries.
- **Approved implementation plan or spec** — its tasks or settled requirements.
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
2. Detect `BASE_REF` from `origin`'s default branch; fall back to `main`, then
   `master`. Pin its immutable merge-base as `BASE_SHA` **before the first code
   change**, verify it resolves to a commit, and reuse that SHA for completeness
   checks and final review. If the current branch is already the base branch, say
   **before editing** that the final PR/base-merge choice will be unavailable.
   Continue only when the user already chose the current checkout or confirms it.
   Do not create or switch a branch or worktree.
3. Prepare dependencies when needed and run the project's existing baseline suite.
   A failure already named by a confirmed bug-fix brief is expected evidence; any
   unexpected baseline failure must stop implementation. Report the evidence and
   return to `harness-flow:systematic-debugging` before proceeding.

## Default: implement inline

Work the input in the current session, on the session's model:

1. Load `test-driven-development` and implement each logical task Red → Green → Refactor.
   For a confirmed bug-fix brief, turn its reproducer into the first failing test.
2. Commit each plan task separately. For a brief, commit once its acceptance checks pass.
3. After the last task, run the full suite + formatter/typecheck once.

Do not pause between tasks to check in — execute the whole plan. Stop only for a
blocker you cannot resolve or genuine ambiguity.

## Option: isolate a task in a subagent (sequential, no parallelism)

When a fresh, clean context would clearly help — a long plan is filling your own
context, or a task benefits from unbiased implementation — dispatch ONE
general-purpose subagent for that task:

- Pass the current work item's settled input as its prompt inline (no extra brief
  files, no ledger).
- Give it the files to touch and the interfaces it must honor (derive these from
  the input and codebase), plus "TDD, one commit;
  comments state only what the code cannot — design history belongs in the commit
  message, not in code."
- When it returns, verify its commit landed on the current session branch before continuing.

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

- Plan → every declared **Touches** file changed and every acceptance box holds.
- Small-change brief → every acceptance check holds and the diff stays inside its
  boundaries.
- Bug-fix brief → the reproducer failed for the expected reason before the change,
  now passes, the root cause is corrected, and every acceptance check holds.

Missing work returns to implementation. Failed bug-fix verification returns to
`harness-flow:systematic-debugging` with the new evidence. Do not request final
review or offer integration for partial or failing work.

## Always: one final review, then focused fix verification

After all tasks are done, reuse the immutable preflight `BASE_SHA` and record the
current `REVIEWED_HEAD`, then request one fresh-context `full-review` via
`requesting-code-review` over that whole range on a mid-tier model (measured:
with the template's severity floor it holds at large-diff scale — the top-tier
premium buys nothing here). Route the report before changing code:

- `Review execution: Incomplete` → stop and escalate with the missing evidence.
- Any `plan-escalate` → stop and escalate to the human.
- No Critical/Important findings → the review passes.
- `impl-fix` findings → batch all Critical/Important implementation fixes, use
  TDD, run the relevant checks and full suite, then make one fix commit so
  `FIXED_HEAD` is immutable. Minor findings remain optional.

After an `impl-fix` batch, request a focused `verify-fix` over
`REVIEWED_HEAD..FIXED_HEAD`, passing the prior report, unchanged requirements,
and exact test evidence. Resume the same reviewer when supported; otherwise use
a fresh mid-tier reviewer with only that verify package. A complete report with
all prior findings resolved and no new Critical/Important issue passes.

Maintain a finding ledger across verify turns. Pass only unresolved,
not-verifiable, and newly introduced Critical/Important IDs as active findings
for the next fix delta. Carry resolved IDs forward unchanged; never ask a later
delta to re-prove them.

Use another whole-branch `full-review` instead of `verify-fix` only when the fix
is not attributable to the reported findings or changes a public API, schema or
migration, security or authorization behavior, or dependencies. A verify report
that marks this semantic expansion Incomplete may request that full-review when
budget remains. Other Incomplete reports, any `plan-escalate`, or exhausted
budget escalate to the human.

Allow at most two post-fix reviewer turns. Every post-fix dispatch —
`full-review` or `verify-fix` — counts toward the same limit. For another fix
round, advance `REVIEWED_HEAD` to the commit just reviewed, batch fixes again,
test, commit a new `FIXED_HEAD`, and spend the second turn. Never restart an
unbounded whole-branch loop.

## Closeout handoff

Only after final review passes:

1. Invoke `harness-flow:llm-md-revise` when the session produced durable
   candidates. Settle every candidate and any approved edit, including its commit
   decision, before continuing. Skip it when nothing qualifies.
2. Detect the repository's base branch from `origin`'s default branch; fall back to
   `main`, then `master`. Do not guess another branch.
3. Ask exactly whether to **create a pull request** or **merge into the detected
   base branch**. Do not add keep, discard, branch deletion, or worktree cleanup
   choices.
4. Pull request → invoke `harness-flow:pr-creator`.
5. Base merge → perform the explicit user-approved local merge, verify its result,
   and stop. Never delete the source branch or clean up a worktree automatically.

If HEAD is detached, the working tree is dirty, or the current branch already is
the base branch, report that state instead of pretending either integration action
is valid. Resolve it only with the user's direction.
