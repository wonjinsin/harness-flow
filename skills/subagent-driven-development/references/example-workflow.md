# Example Workflow (subagent-driven-development)

A full worked example of the per-group dispatch loop, review gating, the
fix→re-review loop, and the final whole-branch review.

```
You: I'm using Subagent-Driven Development to execute this plan.

[Read plan file once: docs/harness-flow/plans/feature-plan.md]
[Create todos for all groups]

Group 1: Hook installation (Tasks 1.1, 1.2)

[Run task-brief for Group 1; dispatch implementer
 (model: haiku — cheap: both tasks touch 1-2 files, complete spec)
 with brief + report paths + context]

Implementer: "Before I begin - should the hook be installed at user or system level?"

You: "User level (~/.config/harness-flow/hooks/)"

Implementer: "Got it. Implementing now..."
[Later] Implementer:
  - Task 1.1: Implemented install-hook command, 5/5 tests passing, committed
    (self-review: found I missed --force flag, added it before committing)
  - Task 1.2: Added config validation for the hook manifest, 4/4 tests passing, committed
  - Group verification: ran the full suite once — 9/9 passing

[Group 1 tier is cheap → review gated, no reviewer dispatch.
 Ledger line: "Group 1: review skipped (cheap)"]

Group 2: Recovery modes (Tasks 2.1, 2.2, 2.3)

[Run task-brief for Group 2; dispatch implementer
 (model: sonnet — standard: Task 2.3's integration work pulls the group up)
 with brief + report paths + context]

Implementer: [No questions, proceeds]
Implementer:
  - Task 2.1: Added verify mode, 4/4 tests passing, committed
  - Task 2.2: Added repair mode, 5/5 tests passing, committed
  - Task 2.3: Wired progress reporting into both modes, 3/3 tests passing, committed
  - Group verification: ran the full suite once — 12/12 passing

[Group 2 is standard tier and not the last group → run review-package,
 dispatch group reviewer (model: sonnet — standard: mid-tier reviewer floor)
 with the printed path]
Group reviewer: Spec ❌ (Task 2.3):
  - Missing: Progress cadence (spec says "report every 100 items")
  - Extra: Added --json flag (not requested)
  Issues (Important, class: impl-fix): Magic number (100)

[Dispatch fix subagent
 (model: haiku — cheap: mechanical fix, named findings)
 with all findings]
Fixer: Removed --json flag, fixed the progress interval, extracted
  PROGRESS_INTERVAL constant. Re-ran the 3 tests covering Task 2.3 — 3/3 passing.

[Re-review — verify-fix variant: open findings verbatim + fix-diff package
 (review-package FIX_BASE HEAD); ledger "Group 2: reviewCycles 1"]
Group reviewer: All findings resolved, no new defects in the fix diff.
  Task quality: Approved.

[Mark Group 2 complete: ledger line
 "Group 2: complete (commits e4f5a6b..c7d8e9f, review clean)"]

...

Group 5 (last group): review gated regardless of tier —
 ledger line "Group 5: review skipped (last group)"

[After all groups]
[Dispatch final code-reviewer
 (model: opus — most capable; sonnet if every group was cheap-tier)
 listing skipped groups: "Groups 1 and 5 had no dedicated review — cover
 spec compliance and quality for them; briefs: <paths>"]
Final reviewer: All requirements met, ready to merge

[Surface claude-md-revise candidates, then proceed to finishing]

Done!
```
