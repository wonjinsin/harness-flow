---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements. Also use when the user explicitly asks for a code review of a branch, diff, or recent changes.
---

# Requesting Code Review

Dispatch a fresh-context reviewer subagent over a git range. The reviewer gets a
crafted prompt and the diff — never your session history — so it judges the work
product, not your thought process, and your own context stays free.

## Contract

One invocation dispatches exactly one reviewer turn and returns its report. The
reviewer is report-only: it never edits code or changes git state. A standalone
invocation returns the report and stops; it does not fix, re-review, or finish a
development branch. A controller such as `implement` owns any later action.

## When

- Before merging a branch, or after a major feature.
- The final whole-branch gate in `implement`.
- Optional but useful: when stuck (fresh eyes), or after a complex bugfix.

## How

**1. Freeze and preflight the range.** Resolve the target base ref from the
request or branch metadata, then pin the actual branch point and committed HEAD:

```bash
HEAD_SHA=$(git rev-parse --verify 'HEAD^{commit}')
BASE_SHA=$(git merge-base <base-ref> "$HEAD_SHA")
git rev-parse --verify "$BASE_SHA^{commit}"
git status --porcelain
git diff --quiet "$BASE_SHA" "$HEAD_SHA"
```

The review package is an immutable commit range. If either SHA is invalid, stop
and report the bad range. If the worktree is dirty, stop because those changes
would be silently excluded; never commit or stash them. If the diff is empty,
stop and report that there is nothing to review. Do not dispatch a reviewer for
an invalid, partial, or empty package.

**2. Dispatch the reviewer.** Fill `code-reviewer.md` and dispatch on a
**mid-tier model** — the tier is the spec, not a specific model name: map it to
your harness's own middle tier (e.g. Claude Code → `sonnet`; Codex → its
mid-tier equivalent). Measured: paired with the template's severity floor it
catches discovery-class defects at large-diff scale, so the top-tier premium
buys nothing here. Do not compensate with confidence filters or finding
suppression; cost control lives in model tier and output shape, not in dropped
findings.

- **Claude Code:** Task/Agent with `general-purpose`, `model: sonnet`.
- **Codex:** direct `spawn_agent` with `task_name: "final_review"`, the filled
  template as `message`, and `fork_turns: "none"`. Omit unsupported `model` /
  `profile` / `agent_type`; ask for its mid-tier model in the message without
  claiming an exact-model guarantee.

Placeholders: `{DESCRIPTION}` (what you built), `{PLAN_OR_REQUIREMENTS}` (what it
should do), `{BASE_SHA}`, `{HEAD_SHA}`. The reviewer runs `git diff` over the range
itself.

**3. Return the report.** Do not act on findings inside this skill. The caller
decides whether to stop, fix, or request another review.

## In `implement`

The `implement` chain runs **one final whole-branch review** after all tasks —
there is no per-task or group-boundary reviewer. The `implement` skill's final-review
loop owns the fixes and the verify-fix re-reviews; this skill just dispatches.

See the template: [code-reviewer.md](code-reviewer.md).
