---
name: implement
description: Use when executing an approved task plan in the current session. Triggers on "execute/run this plan", "implement the plan", or a plan file with task contracts being handed over for execution.
---

# Implement

Execute an approved task plan **inline**, then get **one fresh-context review**.
Dispatch a subagent only when clean isolation helps — never for parallelism.

**Required input: an approved task plan** whose tasks state Delivers, Touches,
Blocked by, and acceptance criteria. A spec or design is not executable input;
invoke `writing-plans` to normalize it before continuing.

## Before you start

Scan the plan once for conflicts — tasks that contradict each other or the
constraints, or anything the plan mandates that a reviewer would flag (a test that
asserts nothing, duplicated logic). Raise them as one batched question before
implementing; if the scan is clean, proceed without comment.

## Default: implement inline

Work the plan in the current session, on the session's model:

1. Load `test-driven-development` and implement each task Red → Green → Refactor.
2. One commit per task, on the feature branch.
3. After the last task, run the full suite + formatter/typecheck once.

Do not pause between tasks to check in — execute the whole plan. Stop only for a
blocker you cannot resolve or genuine ambiguity.

## Option: isolate a task in a subagent (sequential, no parallelism)

When a fresh, clean context would clearly help — a long plan is filling your own
context, or a task benefits from unbiased implementation — dispatch ONE
general-purpose subagent for that task:

- Pass the plan's task section as its prompt inline (no brief files, no ledger).
- Give it the files to touch, the interfaces it must honor (derive these from the
  plan and the codebase — the plan does not pre-compute them), and "TDD, one commit;
  comments state only what the code cannot — design history belongs in the commit
  message, not in code."
- When it returns, verify its commit landed on the feature branch before continuing.

**Choose and state an explicit model tier:** cheap for mechanical 1–2-file work,
standard for non-trivial integration/debugging, and most capable for broad
architecture. Never omit the tier; standard is the floor for non-trivial work.

This is the only isolation on the build path — optional and sequential.

## Before the final review: completeness check

Inline execution has no external gate against silently dropping a task, so verify
it yourself first. For every task in the plan, confirm against the actual diff
(`git diff <base>..HEAD`) that its declared **Touches** files were changed and its
**acceptance** boxes hold. A task whose files are untouched was dropped — go back
and implement it before reviewing. Do not run the final review on a partial branch.

## Always: one final review, then focused fix verification

After all tasks are done, record the branch-point `BASE_SHA` and current
`REVIEWED_HEAD`, then request one fresh-context `full-review` via
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

## Then

Surface `llm-md-revise` candidates if the session produced durable learnings,
then use `finishing-a-development-branch`.
