---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements. Also use when the user explicitly asks for a code review of a branch, diff, or recent changes.
---

# Requesting Code Review

Dispatch a report-only reviewer subagent over an immutable git range. A
`full-review` starts in fresh context; a managed `verify-fix` may resume that
reviewer with only the prior report and fix package. The reviewer never receives
the implementation session history.

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

**1. Select the mode and freeze its range.**

- `full-review` — default for standalone requests and the initial final review.
  Resolve the target base ref from the request or branch metadata, then pin the
  actual branch point and committed HEAD:

```bash
HEAD_SHA=$(git rev-parse --verify 'HEAD^{commit}')
BASE_SHA=$(git merge-base <base-ref> "$HEAD_SHA")
git rev-parse --verify "$BASE_SHA^{commit}"
git status --porcelain
git diff --quiet "$BASE_SHA" "$HEAD_SHA"
```

- `verify-fix` — managed callers only. Freeze the previous reviewed commit as
  `REVIEWED_HEAD` and the committed fix as `FIXED_HEAD`; include
  `PRIOR_FINDINGS`, the original `PLAN_OR_REQUIREMENTS`, and `TEST_EVIDENCE`.
  Review only `REVIEWED_HEAD..FIXED_HEAD` plus the named prior findings.

Each package is an immutable commit range. Verify both SHAs. If either is
invalid, stop and report the bad range. Run `git status --porcelain`; if the
worktree is dirty, stop because those changes would be silently excluded —
never commit or stash them. Run `git diff --quiet` for the selected range; if
the diff is empty, stop and report that there is nothing to review. Do not
dispatch a reviewer for an invalid, partial, or empty package.

**2. Dispatch exactly one reviewer turn.** Fill the matching template in
`code-reviewer.md` and dispatch on a
**mid-tier model** — the tier is the spec, not a specific model name: map it to
your harness's own middle tier (e.g. Claude Code → `sonnet`; Codex → its
mid-tier equivalent). Measured: paired with the template's severity floor it
catches discovery-class defects at large-diff scale, so the top-tier premium
buys nothing here. Do not compensate with confidence filters or finding
suppression; cost control lives in model tier and output shape, not in dropped
findings.

- **Claude Code full-review:** Task/Agent with `general-purpose`, `model: sonnet`.
- **Codex full-review:** direct `spawn_agent` with `task_name: "final_review"`, the filled
  template as `message`, and `fork_turns: "none"`. Omit unsupported `model` /
  `profile` / `agent_type`; ask for its mid-tier model in the message without
  claiming an exact-model guarantee.
- **verify-fix:** resume the same reviewer when the harness supports it, keeping
  reviewer independence while avoiding a cold start and whole-branch reread.
  Codex uses `followup_task` with the original reviewer target. If resume is not
  available, dispatch a new mid-tier general-purpose reviewer with the complete
  verify-fix package and no implementation-session history.

Full-review placeholders: `{DESCRIPTION}`, `{PLAN_OR_REQUIREMENTS}`,
`{BASE_SHA}`, `{HEAD_SHA}`. Verify-fix placeholders: `{PLAN_OR_REQUIREMENTS}`,
`{PRIOR_FINDINGS}`, `{TEST_EVIDENCE}`, `{REVIEWED_HEAD}`, `{FIXED_HEAD}`. The
reviewer runs the single bounded diff named by its mode.

**3. Validate and return the report.** After the reviewer returns, re-run
`git rev-parse --verify 'HEAD^{commit}'` and `git status --porcelain`. If repo
state changed, the report is invalid: stop, surface the mutation, and never
revert it automatically. A timeout, empty response, malformed report, or report
missing a required field is not approval; return it as an incomplete review.
Do not act on findings inside this skill. The caller decides whether to stop,
fix, or request another review.

## In `implement`

The `implement` chain runs **one final whole-branch review** after all tasks —
there is no per-task or group-boundary reviewer. The `implement` skill's final-review
loop owns fixes and decides whether to request a `verify-fix`; this skill still
dispatches only one report-only reviewer turn per invocation.

See the template: [code-reviewer.md](code-reviewer.md).
