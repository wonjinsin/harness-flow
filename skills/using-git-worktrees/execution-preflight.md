# Execution Preflight

Run immediately before the first code change on a planless feature or bug-fix path:

1. Record `START_HEAD=$(git rev-parse HEAD)`, current branch, resolved base branch,
   and pre-existing status.
2. Proceed only on a clean, named, non-base branch. If the checkout is detached,
   on the base branch, or has pre-existing changes, offer `using-git-worktrees`.
3. If isolation is declined, record that merge/PR closeout and immutable review may
   be unavailable; never bundle pre-existing user changes.
4. Before review, commit only chain-owned changes and use `START_HEAD..HEAD` as the
   immutable range.

Complete when the baseline tuple and workspace decision are recorded.
