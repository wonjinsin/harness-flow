# Example Workflow (subagent-driven-development)

A full worked example of the per-group dispatch loop, the final
whole-branch review (with every group's brief and the severity floor),
and the fix→verify-fix loop.

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

[Verify commits on feature branch. No group reviewer — ledger line:
 "Group 1: complete (commits a1b2c3d..b2c3d4e, no group review — final nets)"]

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

[Ledger: "Group 2: complete (commits e4f5a6b..c7d8e9f, no group review — final nets)"]

...

[After all groups]
[Run review-package IMPLEMENTATION_BASE HEAD; dispatch final code-reviewer
 (model: opus — most capable; sonnet if every group was cheap-tier)
 with the package path, every group's brief path + global constraints,
 the severity-floor block, and the finding-class block
 (see SKILL.md: Final Review Nets Every Group)]

Final reviewer: Spec ⚠️ (Group 2): progress cadence "every 100 items" not
  verifiable from diff alone.
  Issues (Important, class: impl-fix): Task 2.3 passes the interval as the
  string "100" from config into the reporter (type contract says number —
  propagates into arithmetic downstream).

[⚠️ item: you verify cadence yourself from the plan — confirmed implemented.
 Record HEAD as FIX_BASE; dispatch ONE fix subagent
 (model: haiku — mechanical, named finding) with the complete findings list]
Fixer: Coerced interval at the config boundary, typed the reporter param.
  Re-ran the 3 tests covering the reporter — 3/3 passing.

[Run review-package FIX_BASE HEAD; dispatch verify-fix re-review
 (./task-reviewer-prompt.md, model: sonnet);
 ledger "final: reviewCycles 1"]
Verify-fix: Open finding resolved (hunk cited), no new defects.
  Fix quality: Approved.

[Surface claude-md-revise candidates, then proceed to finishing]

Done!
```
