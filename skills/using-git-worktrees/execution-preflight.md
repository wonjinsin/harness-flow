# Execution Preflight

Run immediately before the first code change on a planless feature or bug-fix path.

## 1. Freeze the baseline

Record `START_HEAD=$(git rev-parse HEAD)`, current branch, resolved base branch,
and the exact pre-existing status.

## 2. Choose one workspace path

A workspace is **eligible** only when it is clean, on a named branch, and not on
the base branch. Proceed normally when it is eligible.

A detached checkout, the base branch, or a checkout that has pre-existing changes
is **ineligible**. Before editing, present exactly two choices:

1. **Isolate** with `using-git-worktrees`.
2. **Limited in-place** execution with the restrictions below.

If isolation is accepted, create the workspace and re-run this preflight there. If
the new workspace is still ineligible, stop before editing. If isolation is declined,
enter `AWAIT_RESTRICTION_ACCEPTANCE`, not `LIMITED_IN_PLACE`. Ask whether the user
accepts every restriction below as a separate decision. Until all restrictions are
accepted, do not edit. Only after the user declines isolation and separately accepts
the restrictions may the state enter `LIMITED_IN_PLACE`; do not interpret refusal as
normal eligibility.

The `planless` rows in `scripts/workspace-contract.js` are the executable decision
matrix for these transitions.

## 3. Eligible path

- Make chain-owned edits and follow the calling skill's TDD and verification rules.
- Before review, commit only chain-owned changes and use `START_HEAD..HEAD` as the
  immutable range.
- After a completed trivial self-review or reviewer state is `PASS`, invoke
  `finishing-a-development-branch`.

## 4. `LIMITED_IN_PLACE` path

This path exists only after the user explicitly declines isolation and accepts the
limitations:

- Edit only chain-owned paths that do not overlap a pre-existing changed path. If a
  required edit overlaps a pre-existing changed path, stop before editing.
- Preserve the starting branch/ref and all pre-existing changes. The chain must not stage, commit, stash, reset, clean, push, merge, or create a PR.
- Run applicable tests and inspect the chain-owned working diff. The working diff is
  evidence, not an immutable approval package; do not invoke report-only review as
  though it were one.
- If isolation was declined, report the working diff, test evidence, and exact status,
  then stop without merge/PR claims. Do not invoke `finishing-a-development-branch`.

Complete when the baseline, workspace decision, and applicable closeout path are
recorded.
