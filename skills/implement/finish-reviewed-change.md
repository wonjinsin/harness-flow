# Finish a Reviewed Change

Read this file only after the bounded review loop records an immutable
`APPROVED_SHA`. Do not invoke instruction revision again or change the source
checkout before finalization.

## Preflight and choice

1. Detect the base branch from `origin`'s default branch; fall back to `main`,
   then `master`. Do not guess another branch.
2. Require a named source branch, a clean worktree, and `HEAD == APPROVED_SHA`.
   If the current branch is already the base branch, report that neither normal
   integration path is valid and wait for user direction.
3. Ask exactly whether to create a pull request or merge into the detected base
   branch. Do not add branch deletion, worktree cleanup, discard, or keep choices.
4. Immediately after the user chooses and before any mutation, repeat the clean
   worktree check and verify `HEAD == APPROVED_SHA`. Any mismatch requires a new
   review before finalization.

## Pull request

Invoke `harness-flow:pr-creator` and pass the same `APPROVED_SHA` as its managed
publication guard.

## Base merge

1. Record the current named branch as `SOURCE_BRANCH`, the detected local base
   branch as `BASE_BRANCH`, and its current commit as `BASE_HEAD`.
2. Only after the user selected this path, switch to `BASE_BRANCH`. If it is
   missing, checked out elsewhere, or cannot be switched to cleanly, stop.
3. Verify the branch is `BASE_BRANCH`, `HEAD == BASE_HEAD`, and the worktree is
   clean. Merge exactly `APPROVED_SHA`, never the moving source-branch name.
4. Verify the merge result descends from `APPROVED_SHA` before reporting success.

On conflict, make no resolution edit. Run `git merge --abort`, verify
`HEAD == BASE_HEAD` and a clean worktree, switch back to `SOURCE_BRANCH`, and
verify `HEAD == APPROVED_SHA`. If recovery fails, stop for user direction.
Conflict resolution is new implementation work: resolve it on the source branch,
test, commit, and obtain a new review before another merge attempt.

Never delete the source branch or clean up a worktree automatically.
