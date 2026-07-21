---
name: implement
description: Use when executing an approved implementation plan or spec in the current session.
---

# Implement

Execute a plan or spec **inline**, then get **one fresh-context review**. Dispatch
a subagent for a task only when clean isolation clearly helps — never for parallelism.

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
  plan and the codebase — the plan does not pre-compute them), and "TDD, one commit."
- When it returns, verify its commit landed on the feature branch before continuing.

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

This is the only isolation on the build path — optional and sequential.

## Before the final review: completeness check

Inline execution has no external gate against silently dropping a task, so verify
it yourself first. For every task in the plan, confirm against the actual diff
(`git diff <base>..HEAD`) that its declared **Touches** files were changed and its
**acceptance** boxes hold. A task whose files are untouched was dropped — go back
and implement it before reviewing. Do not run the final review on a partial branch.

## Always: one final review

After all tasks are done, dispatch a fresh-context reviewer via
`requesting-code-review` over the whole branch, on the most capable available model
(the final review is the one place that cost is worth it). Route its findings by the
reviewer's `class` tag:

- The plan/spec itself is wrong → stop and escalate to the human.
- Implementation defects → fix them (inline, or one fix subagent), then re-review.
  Cap at 3 re-reviews; if it still fails, escalate.

Fixing Critical/Important findings is required; Minor is optional.

## Then

Surface `llm-md-revise` candidates if the session produced durable learnings,
then use `finishing-a-development-branch`.
