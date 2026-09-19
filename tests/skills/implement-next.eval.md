# Implement Next behavioral evaluations

Use fresh contexts with the selected checkout's skills.

## 1. Completed settled work

### Prompt

Work read-only in the selected checkout. Read `skills/implement/SKILL.md` and
apply it to this simulated state:

A settled small change is complete. Its focused tests, relevant full suite,
formatting, typechecking, and acceptance checks passed. Simulate that the required
Conventional Commit succeeds, then report the completion and continue according
to the skill.

### Acceptance

- Reports the change and verification without inventing results.
- Lists `harness-flow:requesting-code-review` first.
- Lists `harness-flow:llm-md-revise` second, after review and accepted corrections.
- Does not execute either next action.
- Creates a Conventional Commit after successful verification.
- Does not introduce branch, worktree, SHA, PR, merge, or finalization requirements.

## 2. Blocked verification

### Prompt

Work read-only in the selected checkout. Read `skills/implement/SKILL.md` and
apply it to this simulated state:

The code change is complete, but the relevant full test suite fails in an
unrelated pre-existing area and the available evidence cannot prove the change
safe. Report the result and what happens next. Do not edit or dispatch agents.

### Acceptance

- Does not claim completion.
- Reports the exact blocker and available evidence.
- Does not offer review or instruction revision as if the implementation passed.
- Does not invent repository cleanup or finalization work.

## Evidence — 2026-09-19

- Type: technique, with normal completion and blocked-verification variation.
- Baseline: the prior skill forced repository preflight, commits, SHA-bound
  verification, mandatory instruction revision, a bounded review loop, and
  finalization even when the user requested implementation only.
- Candidate: completed case reported the supplied checks without inventing
  commands, created the required Conventional Commit, then listed review before
  instruction revision and dispatched neither.
  The first blocked variation avoided a false completion but introduced legacy
  repository-lifecycle details; one boundary sentence was added. A fresh retry
  stopped after the blocker evidence and omitted all `Next` actions. Review found
  that the memory skill's broad trigger could still auto-match after review; the
  trigger now requires the user's choice, and a fresh completion sample presented
  both actions without executing either.
