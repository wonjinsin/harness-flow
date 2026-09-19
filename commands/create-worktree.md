---
description: Create a task worktree inside the current repository
argument-hint: <branch-name> [--base <base-branch-name>]
---

Create a Git worktree using these arguments: $ARGUMENTS

- If the arguments do not match the declared interface, stop before changing repository state and show the expected usage.
- Use `<branch-name>` as the new branch name.
- If `--base` is provided, use its value as the base branch.
- If `--base` is omitted, detect and use the repository's base branch.
- Derive `<worktree-name>` from `<branch-name>` by replacing each `/` with `-`.
- Create the worktree at `<repository root>/.worktrees/<worktree-name>`.
- Choose and run the appropriate Git operations for the current repository state.
