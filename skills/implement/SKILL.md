---
name: implement
description: Use when code changes are ready to execute because requirements and acceptance criteria are settled.
---

# Implement

Implement settled work in the current checkout.

## Before you start

Accept one settled implementation input. It contains the desired change, scope and constraints,
acceptance criteria, optional ordered tasks, and optional reproducer plus confirmed
root-cause evidence.

If a missing detail would materially change the implementation, ask one or two
settling questions. Otherwise proceed without reopening settled decisions or
routine check-ins. Preserve unrelated existing work and stay inside scope.

## Work

1. Load `harness-flow:test-driven-development` and implement each behavior Red → Green → Refactor.
   For a confirmed bug, turn the reproducer into the first failing test.
2. Make the smallest change that satisfies the settled requirements. Follow
   ordered tasks when provided.
3. Run focused tests throughout. Run applicable formatting, typechecking, build
   checks, and the relevant full test suite once at the end.
4. Check the result against every acceptance criterion and inspect changed files
   for unintended work.
5. After verification succeeds, create a Conventional Commit for the completed
   change.

Do not claim completion while relevant checks fail. Fix failures caused by the
change. If a requirement conflict, unrelated existing failure, environment
problem, user-owned change collision, or invalidated root-cause hypothesis blocks
confident completion, stop and report the exact evidence. Return an invalidated
root-cause hypothesis to `harness-flow:systematic-debugging` instead of layering
on a speculative fix.

When blocked, stop after reporting the evidence; do not list the `Next` actions.

## Finish

Report what changed, verification commands and results, and any remaining limits.

## Next

These are separate next actions, not steps owned by `implement`:

1. Use `harness-flow:requesting-code-review` to review the completed change.
2. After review and any accepted corrections, use `harness-flow:llm-md-revise` to
   capture durable project guidance.
