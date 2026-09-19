---
description: Create a task worktree inside the current repository
argument-hint: <request> [branch: <base-branch>]
---

Create a Git worktree for this request: $ARGUMENTS

- Derive a concise new branch and worktree name from the request.
- If a branch is provided, use it as the base for the new branch.
- If no branch is provided, detect and use the repository's base branch.
- Create the worktree at `<repository root>/.worktrees/<worktree-name>`.
- Choose and run the appropriate Git operations for the current repository state.
