---
name: requesting-code-review
description: Use when tasks or major features are complete, before merging, or when the user explicitly asks for a code review of a branch, diff, or recent changes.
---

# Requesting Code Review

Dispatch a report-only reviewer subagent over an immutable git range. A
`full-review` starts in fresh context; a managed `verify-fix` may resume that
reviewer. Resume retains that reviewer's own review context and adds the prior
report and fix package; it never receives the implementation session history.

## Contract

One invocation dispatches exactly one reviewer turn and returns its report. The
reviewer is instructed to be report-only; native controls enforce that contract
when available, while the fallback below detects only its stated scope. A standalone
invocation returns the report and stops; it does not fix, re-review, or finish a
development branch. A controller such as `implement` owns any later action.

## When

- Before merging a branch, or after a major feature.
- The initial whole-branch turn of the final review gate in `implement`.
- Optional but useful: when stuck (fresh eyes), or after a complex bugfix.

## How

**1. Select the mode and freeze its range.**

- `full-review` — default for standalone requests and the initial whole-branch
  review. A managed `full-review` receives supplied `BASE_SHA` and `HEAD_SHA`
  from its controller. Verify those exact commits; the skill must not replace
  either with a freshly resolved merge-base or current HEAD. Resolve the current `HEAD`
  separately and require it to equal the supplied `HEAD_SHA`; a mismatch makes
  the review Incomplete before dispatch.

  A standalone `full-review` has no caller-owned range. Resolve the target base
  ref from the request or branch metadata, then pin the actual branch point and
  committed HEAD:

```bash
HEAD_SHA=$(git rev-parse --verify 'HEAD^{commit}')
BASE_SHA=$(git merge-base <base-ref> "$HEAD_SHA")
git rev-parse --verify "$BASE_SHA^{commit}"
git status --porcelain
git diff --quiet "$BASE_SHA" "$HEAD_SHA"
```

- `verify-fix` — managed callers only. Freeze the previous reviewed commit as
  `REVIEWED_HEAD` and the committed fix as `FIXED_HEAD`; include
  active `PRIOR_FINDINGS`, the carry-forward `RESOLVED_FINDINGS` ledger, the
  original `PLAN_OR_REQUIREMENTS`, and `TEST_EVIDENCE`. Review only
  `REVIEWED_HEAD..FIXED_HEAD` plus the named active findings.

Each package is an immutable commit range. Verify both SHAs. If either is
invalid, stop and report the bad range. For any managed package, resolve current
HEAD and require it to equal the package's ending SHA (`HEAD_SHA` or
`FIXED_HEAD`). Run `git status --porcelain`; if the worktree is dirty, stop
because those changes would be silently excluded — never commit or stash them.
Run `git diff --quiet` for the selected range; if the diff is empty, stop and
report that there is nothing to review. Do not dispatch a reviewer for an
invalid, partial, stale, or empty package.

Before dispatch, capture a repository-state snapshot with these read-only
checks. Hash config and remote output so credentials embedded in URLs are not
printed:

```bash
git rev-parse --verify 'HEAD^{commit}'
git symbolic-ref -q HEAD
git status --porcelain=v2 --branch --untracked-files=all --ignored=matching
git for-each-ref --format='%(refname) %(objectname)'
git ls-files --stage --debug | git hash-object --stdin
git config --local --list | git hash-object --stdin
git remote -v | git hash-object --stdin
```

Capture every command and pipeline exit status, using pipefail or an equivalent
when needed. Any snapshot command or pipeline failure makes the review Incomplete;
do not dispatch when the preflight snapshot is incomplete.

The snapshot covers current commit, symbolic/detached HEAD, worktree/index plus
index flags, untracked and ignored path membership—but not ignored-file contents—
refs, local repository config, and remotes. Use native read-only restrictions when available. If the
harness cannot enforce them, use a detection-based fallback: keep the
report-only prompt, preferably use a disposable checkout without remotes, and
compare the captured snapshot before and after the turn. Do not claim that this
fallback is hard isolation. It is not fail-closed outside the listed snapshot
scope. If the caller requires fail-closed isolation, do not dispatch without an
enforcing control; return an Incomplete review. Any detected mutation invalidates
the report.

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

Before dispatch, freeze the requirements by copying their exact text inline as
`PLAN_OR_REQUIREMENTS`; never pass only a file path, especially for an ignored
plan or spec. Full-review placeholders: `{DESCRIPTION}`, `{PLAN_OR_REQUIREMENTS}`,
`{BASE_SHA}`, `{HEAD_SHA}`. Verify-fix placeholders: `{PLAN_OR_REQUIREMENTS}`,
`{PRIOR_FINDINGS}`, `{RESOLVED_FINDINGS}`, `{TEST_EVIDENCE}`,
`{REVIEWED_HEAD}`, `{FIXED_HEAD}`. For later verify turns, pass only unresolved,
not-verifiable, and new Critical/Important IDs as active findings; carry already
resolved IDs in the resolved ledger without asking the reviewer to re-evaluate
them against a newer delta. The reviewer freezes the bounded range's changed-file
list, reads each listed file's diff exactly once in a separate result, and proves
coverage with an `N/N` count. This adds cheap read calls but avoids truncating one
aggregate diff and repeating the whole review.

**3. Validate and return the report.** After the reviewer returns, repeat and
compare every snapshot check exactly against its preflight value. If repository
state changed, the report is invalid: stop, surface the mutation, and never
revert it automatically. A timeout, empty response, malformed report, or report
missing a required field is not approval; return it as an incomplete review.

Validate `Gate status` against the report evidence before returning it:

- `incomplete` — review execution is Incomplete, coverage is not `N/N`, or an
  active finding is Not-verifiable.
- `plan-escalate` — at least one active Critical/Important finding has that class.
- `impl-fix` — execution is complete and at least one active Critical/Important
  implementation finding is unresolved or newly reported.
- `pass` — execution is complete, coverage is `N/N`, all active findings are
  resolved, and no new Critical/Important issue exists. Minor findings do not
  block this status.

Apply precedence in that order: `incomplete` → `plan-escalate` → `impl-fix` →
`pass`.

A claimed status inconsistent with those fields is malformed, not a second
opinion: return an Incomplete review. Do not act on findings inside this skill;
the caller decides whether to stop, fix, or request another review.

## In `implement`

The `implement` chain starts its gate with **one initial whole-branch review**
after all tasks and any approved pre-review instruction revision — there is no
per-task or group-boundary reviewer. The `implement` skill owns fixes and may
request bounded `verify-fix` or semantic-expansion `full-review` turns; this
skill still dispatches only one report-only reviewer turn per invocation.

See the template: [code-reviewer.md](code-reviewer.md).
