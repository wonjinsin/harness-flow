---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements. Based on superpowers(https://github.com/obra/superpowers).
---

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history. This keeps the reviewer focused on the work product, not your thought process, and preserves your own context for continued work.

**Core principle:** Review early, review often.

## When to Request Review

**Mandatory:**

- After completing major feature
- Before merge to main
- At the final whole-branch gate in subagent-driven development

**Optional but valuable:**

- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs and prepare one review artifact:**

Resolve the directory containing this loaded `SKILL.md` as `REVIEW_SKILL_DIR` —
the project CWD is not the skill directory. Then:

```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)

"$REVIEW_SKILL_DIR/../subagent-driven-development/scripts/review-package" \
  "$BASE_SHA" "$HEAD_SHA"
```

The script prints `wrote <path>: N commit(s), M bytes`. Use the `<path>` it
names as `{DIFF_FILE}` — do not pass the whole line.

**2. Dispatch code reviewer subagent:**

On Claude Code, use Task/Agent with `general-purpose` and fill `code-reviewer.md`.
On Codex direct `spawn_agent`, use `task_name: "final_review"`, pass the filled
template as `message`, and set `fork_turns: "none"`. Do not add unsupported
`model`, `profile`, or `agent_type`. Select the advisory review tier from SDD's
complexity rules and ask Codex to use the least powerful model that fits,
without claiming an exact-model guarantee.

**Placeholders:**

- `{DESCRIPTION}` - Brief summary of what you built
- `{PLAN_OR_REQUIREMENTS}` - What it should do
- `{BASE_SHA}` - Starting commit
- `{HEAD_SHA}` - Ending commit
- `{DIFF_FILE}` - Absolute path printed by the review-package script

**3. Act on feedback:**

- Fix Critical issues immediately
- Fix Important issues before proceeding
- Note Minor issues for later
- Push back if reviewer is wrong (with reasoning)

## Example

```
[Just completed Task 2: Add verification function]

You: Let me request code review before proceeding.

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[Dispatch code reviewer subagent]
  DESCRIPTION: Added verifyIndex() and repairIndex() with 4 issue types
  PLAN_OR_REQUIREMENTS: Task 2 from docs/harness-flow/plans/deployment-plan.md
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent returns]:
  Strengths: Clean architecture, real tests
  Issues:
    Important: Missing progress indicators
    Minor: Magic number (100) for reporting interval
  Assessment: Ready to proceed

You: [Fix progress indicators]
[Continue to Task 3]
```

## Integration with Workflows

**Subagent-Driven Development:**

- SDD intentionally has no task/group-boundary reviewer.
- Run one final whole-branch review after all groups and `plan-audit` pass.
- The SDD skill's final-review loop owns fixes and verify-fix re-reviews.

**Executing Plans:**

- Review after each task or at natural checkpoints
- Get feedback, apply, continue

**Ad-Hoc Development:**

- Review before merge
- Review when stuck

## Red Flags

**Never:**

- Skip review because "it's simple"
- Ignore Critical issues
- Proceed with unfixed Important issues
- Argue with valid technical feedback

**If reviewer wrong:**

- Push back with technical reasoning
- Show code/tests that prove it works
- Request clarification

See template at: [code-reviewer.md](code-reviewer.md)
