---
name: requesting-code-review
description: Use when tasks or major features are complete, before merging, or when the user explicitly asks for a code review of a branch, diff, or recent changes.
---

# Requesting Code Review

Fresh-context, report-only review over one immutable commit range.
One invocation returns one report and stops. It never fixes code, repeats a review,
or finishes a branch.

## Input

Packages contain `REQUIREMENTS` copied inline, exact `FROM_SHA`/`TO_SHA` commits,
`VERIFICATION_EVIDENCE`, `RISK_LEVEL`, `RISK_BASIS`, and `PRIOR_REPORT`:
all earlier complete reports in order, separated by `Earlier report N` headings (at most two),
or `None` for initial/standalone reviews.

A managed caller must supply `VERIFICATION_EVIDENCE`: verified commit equal to `TO_SHA`;
`PRE_CHECK` recording `HEAD == TO_SHA` and a clean worktree; each check's exact command,
exit status, and concise observed result; and `POST_CHECK` recording `HEAD == TO_SHA`
and a clean worktree. A standalone caller may pass `None`; absence never means pass.

A managed initial review passes pinned `BASE_SHA` as `FROM_SHA`. Standard incremental
correction passes `LAST_REVIEWED_SHA` as `FROM_SHA`; high-risk correction passes
`BASE_SHA` as `FROM_SHA` for full-range review. All pass committed `HEAD` as `TO_SHA`;
never recompute a caller-supplied range.

Classify `RISK_LEVEL` as `high` when requirements or the resulting diff touch
authentication, authorization, cryptography, secret handling, migration or durable
schema, data loss, concurrency or transactions, public compatibility boundaries,
multiple coupled subsystems, or a large review surface whose size or spread limits complete
cross-file reasoning. Otherwise use `standard`. Record concrete paths and trigger as
`RISK_BASIS`; a managed loop may upgrade to `high` but never downgrade before approval.

For standalone review, honor the requested range/base; otherwise use `origin`'s
default, then `main`, then `master`. Pin the branch point and head:

```bash
TO_SHA=$(git rev-parse --verify 'HEAD^{commit}')
FROM_SHA=$(git merge-base <base-ref> "$TO_SHA")
git rev-parse --verify "$FROM_SHA^{commit}"
```

Review committed branch work even when the base moved. Empty ranges have nothing
to review; uncommitted changes are excluded.

## Preflight

Verify both SHAs resolve to commits. Require current `HEAD == TO_SHA`, an empty
`git status --porcelain --untracked-files=all --ignore-submodules=none`, and a non-empty `FROM_SHA..TO_SHA` diff. For a managed
package, require its verified commit to equal `TO_SHA` and both `PRE_CHECK` and
`POST_CHECK` to record that same clean state; mismatched or missing evidence stops
dispatch. Stop instead of reviewing a stale, partial, dirty, invalid, or empty package.

Before dispatch, snapshot repository state; hash config/remotes to hide credentials:

```bash
git rev-parse --verify 'HEAD^{commit}'
git symbolic-ref -q HEAD
git status --porcelain=v2 --branch --untracked-files=all --ignored=matching --ignore-submodules=none
git for-each-ref --format='%(refname) %(objectname)'
git ls-files --stage --debug | git hash-object --stdin
git config --local --list | git hash-object --stdin
git remote -v | git hash-object --stdin
git diff --quiet --ignore-submodules=none "$FROM_SHA" "$TO_SHA" # exit 1 confirms a non-empty diff
```

Capture every command and pipeline exit status using pipefail or equivalent.
For `git diff --quiet`, exit 1 confirms a non-empty diff; 0 means empty, others error.
Snapshot command/pipeline failures stop dispatch.
Run independent snapshot commands in parallel; inspect every result before dispatch.
Set `GIT_OPTIONAL_LOCKS=0` to prevent index refreshes during inspection.
Do not overlap either snapshot with review execution.

Use native read-only controls when available. Otherwise the report-only prompt and
before/after snapshot provide detection, not fail-closed isolation: ignored-file
contents are not covered. If a caller requires fail-closed isolation, do not
dispatch without an enforcing control.

## Dispatch

Freeze the manifest:
`git diff --name-only -z --no-renames --ignore-submodules=none --diff-filter=ACDMRTUXB FROM_SHA..TO_SHA`.
Decode NUL-delimited paths exactly; no-renames preserves both endpoints.
Do not let repository configuration hide changed submodules; unsupported evidence
must stop preparation instead of disappearing from the manifest.
Stop on failed or truncated output.

Resolve helpers and schema from the installed skill directory, not the project.
Prepare source evidence once:
`node <skill-dir>/scripts/prepare-review.js --repo <checkout> --from FROM_SHA --to TO_SHA`.
Capture JSON outside the checkout. The helper verifies clean pinned state and
collects independent per-file diffs and resulting text in parallel. Stop on failed,
missing, binary, oversized, or undecodable evidence. Supply its absolute path,
digest, manifest, and the absolute `scripts/read-review-evidence.js` path. Its
`--index` defines complete diff sections and resulting-file parts within
24,000-byte output limits; all readers use the same limit. Every native reviewer
reads every complete diff section. Detail reviewers also read every resulting-file
part for each nondeleted file they own; a single reviewer owns all files.

Small and medium changes use a single reviewer. For a large change whose size or
spread limits cross-file reasoning, use [parallel-review.md](parallel-review.md):
two detail groups and one integration reviewer run concurrently. If three slots
are unavailable or two cohesive, nonempty file groups cannot be formed, use one
full reviewer. Do not split a small change merely to fill reviewer slots.

Fill [code-reviewer.md](code-reviewer.md) with the inputs, `{REVIEW_MODEL}`,
`{REVIEW_ASSIGNMENT}` (role, complete ordered manifest, owned file indices, exact
checks, and scope), and `{REVIEW_EVIDENCE}`. For the assigned role, copy the complete
fragment from [review-checks.md](review-checks.md) into `{REVIEW_CHECKS}`: `detail_a`,
`detail_b`, and `single` use `detail and single`; `integration` uses `integration`.
Supply the JSON report schema; use native enforcement when supported. Each reviewer uses the same pinned risk tier:
`standard` uses the harness's mid-tier model; `high` uses its most-capable available
model. Use fresh-context on every invocation;
do not resume a previous reviewer or pass implementation-session history.

Preserve the selected model and the caller's reasoning effort across assignments.
Distinguish requested from confirmed runtime settings. Do not invent unsupported
dispatch arguments or promise unmeasured speedups.

- **Claude Code:** Task/Agent with `general-purpose` and the selected tier.
- **Codex:** `spawn_agent` with the unique `task_name:
  "final_review_<unused-ordinal>_<TO_SHA-prefix>"`, `fork_turns: "none"`, and the
  filled prompt. Omit unsupported model/profile fields; request the selected tier.

## Validate and return

After all reviewers finish, repeat every snapshot check and compare it with the
preflight values. If repository state changed, invalidate the report, surface the
observed change, and never revert it automatically.

The returned report contains `Review complete: yes | no`, exact range,
`Reviewed files: N/N`, exact paths, prior verification, and
`Blocking findings: none | finding list`. Complete coverage must equal the frozen manifest. A `standard`
report naming a new high-risk signal with `Review complete: yes` is malformed; return `Review complete: no` and explain.

Timeouts, empty responses, malformed output, incomplete coverage, stale ranges,
or detected repository mutation are not approval. Return `Review complete: no`
with a plain-language explanation; do not classify the reason with a status code.
For single and parallel reviews, use `combine-reviews.js` with the full input
contract in [parallel-review.md](parallel-review.md). Structural completeness is
not approval. The caller owns fixes and further reviews.
