---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements.
---

# Requesting Code Review

Dispatch a fresh-context reviewer subagent over a git range. The reviewer gets a
crafted prompt and the diff — never your session history — so it judges the work
product, not your thought process, and your own context stays free.

## When

- Before merging a branch, or after a major feature.
- The final whole-branch gate in `implement`.
- Optional but useful: when stuck (fresh eyes), or after a complex bugfix.

## How

**1. Pick the range.**

```bash
BASE_SHA=$(git rev-parse origin/main)   # or the branch point
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch the reviewer.** Fill `code-reviewer.md` and dispatch on the most
capable available model (a review is the one place that cost is worth it):

- **Claude Code:** Task/Agent with `general-purpose`.
- **Codex:** direct `spawn_agent` with `task_name: "final_review"`, the filled
  template as `message`, and `fork_turns: "none"`. Omit unsupported `model` /
  `profile` / `agent_type`; ask for the most capable model without claiming an
  exact-model guarantee.

Placeholders: `{DESCRIPTION}` (what you built), `{PLAN_OR_REQUIREMENTS}` (what it
should do), `{BASE_SHA}`, `{HEAD_SHA}`. The reviewer runs `git diff` over the range
itself.

**3. Act on feedback.** Fix Critical and Important before proceeding; note Minor for
later. Push back with reasoning (code/tests that prove it) if the reviewer is wrong.

## In `implement`

The `implement` chain runs **one final whole-branch review** after all tasks —
there is no per-task or group-boundary reviewer. The `implement` skill's final-review
loop owns the fixes and the verify-fix re-reviews; this skill just dispatches.

See the template: [code-reviewer.md](code-reviewer.md).
