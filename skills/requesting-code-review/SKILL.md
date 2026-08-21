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

One invocation normally dispatches one reviewer turn. The sole exception is one
same-package retry after an `OPERATIONAL` failure. The reviewer is report-only and
a standalone invocation never fixes or finishes work; a controller such as
`implement` owns later action.

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
  active `PRIOR_FINDINGS`, the carry-forward `RESOLVED_FINDINGS` ledger, the
  original `PLAN_OR_REQUIREMENTS`, and `TEST_EVIDENCE`. Review only
  `REVIEWED_HEAD..FIXED_HEAD` plus the named active findings.

Each package is an immutable commit range. Verify both SHAs. If either is
invalid, stop and report the bad range. Run `git status --porcelain`; if the
worktree is dirty, stop because those changes would be silently excluded —
never commit or stash them. Run `git diff --quiet` for the selected range; if
the diff is empty, stop and report that there is nothing to review. Do not
dispatch a reviewer for an invalid, partial, or empty package.

For both modes, provide `TEST_EVIDENCE`: tested commit SHA, each command, exit
status, and pass/fail/skip summary. A skip names its reason. The tested commit SHA
must equal `HEAD_SHA` for full-review or `FIXED_HEAD` for verify-fix; stale or
missing evidence stops dispatch until it is refreshed.

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

The snapshot covers current commit, symbolic/detached HEAD, worktree/index plus
index flags, untracked and ignored path membership, refs, local repository
config, and remote configuration. Tool-level read-only protection is mandatory.
The tool policy must deny writes, network, secret/credential reads, and agent
dispatch while allowing bounded repository inspection. Use native restrictions
when the harness can enforce them. If it cannot enforce them, dispatch in an
isolated disposable checkout
that has no write-capable access to the active checkout, its refs, or remotes;
do not dispatch against the active checkout with prompt-only protection. The
caller owns setup and cleanup of that isolation. Prompt rules remain mandatory
defense in depth because tool policies vary by harness.

**2. Dispatch the reviewer.** Fill `code-reviewer.md` and use the harness's
mid-tier model without confidence suppression. Claude Code uses a general-purpose
Task/Agent; Codex uses direct `spawn_agent` with `task_name: "final_review"`, the
prompt as `message`, and `fork_turns: "none"` (omit unsupported model/profile/type
fields). For verify-fix, resume the same reviewer when supported; otherwise send
the complete package to a fresh mid-tier reviewer.

Full-review placeholders: `{DESCRIPTION}`, `{PLAN_OR_REQUIREMENTS}`,
`{TEST_EVIDENCE}`, `{BASE_SHA}`, `{HEAD_SHA}`. Verify-fix also receives
`{PRIOR_FINDINGS}`, `{RESOLVED_FINDINGS}`, `{REVIEWED_HEAD}`, and `{FIXED_HEAD}`.
Later verify turns keep only active Critical/Important IDs and carry resolved IDs
unchanged. Each reviewer freezes the changed-file list, reads each diff once, and
proves `N/N` coverage.

**3. Validate and classify.** After the reviewer returns, repeat every snapshot check
and classify exactly:

| State | Meaning |
|---|---|
| `PASS` | Complete report, valid evidence, no Critical/Important findings |
| `ACTIONABLE` | Complete report with findings for the controller |
| `OPERATIONAL` | Timeout or empty response only |
| `CONTRACT` | Scope/coverage/evidence failure |
| `MALFORMED` | Unparseable report or missing required fields |

Repository mutation is `CONTRACT`: stop, surface it, and never auto-revert. Only
`OPERATIONAL` may be retried once with the same immutable package. No other state
retries here; only `PASS` is approval. Return the state and report without acting
on findings.

## In `implement`

The `implement` chain runs **one final whole-branch review** after all tasks —
there is no per-task or group-boundary reviewer. The `implement` skill's final-review
loop owns fixes and decides whether to request a `verify-fix`; this skill still
normally dispatches one report-only turn, with only the bounded operational retry
defined above.

See the template: [code-reviewer.md](code-reviewer.md).
