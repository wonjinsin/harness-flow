---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback.
---

# Using Git Worktrees

Work in an isolated workspace. Detect existing isolation first, then prefer your
harness's native tool, then fall back to manual git. Never fight the harness.

## Step 0: Detect existing isolation

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
```

If `GIT_DIR != GIT_COMMON` AND `git rev-parse --show-superproject-working-tree`
is empty → already in a linked worktree, skip to Step 2. (A non-empty
superproject means a submodule; treat it as a normal repo.)

Otherwise you are in a normal checkout. Unless the user already stated a
preference, ask before creating a worktree; if they decline, work in place and
skip to Step 2.

## Step 1: Create the workspace

**1a. Native tool (preferred).** If your harness has a worktree tool
(`EnterWorktree`, `WorktreeCreate`, a `/worktree` command, a `--worktree` flag),
use it and skip to Step 2 — it handles placement, branch, and cleanup. Using
`git worktree add` when a native tool exists creates state the harness can't see.

**1b. Manual git fallback** — only if no native tool:

```bash
BRANCH_NAME="feat/short-slug"                    # lowercase ascii, unsafe runs → -
git check-ref-format --branch "$BRANCH_NAME"     # validate; refuse empty/invalid
git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" && { echo "exists"; exit 1; }

# Default to a sibling directory outside the repo, so no .gitignore edit is needed.
LOCATION="../$(basename "$PWD")-${BRANCH_NAME//\//-}"
# If you instead pick a project-local dir, it MUST be ignored — verify, else use
# the sibling. Never edit/commit .gitignore on the current branch to make room.
git check-ignore -q -- "$LOCATION" 2>/dev/null || true
test ! -e "$LOCATION"

git worktree add "$LOCATION" -b "$BRANCH_NAME"
cd "$LOCATION"

# Ownership marker — finishing-a-development-branch uses it to clean up only the
# worktrees we created, in a self-ignored dir:
mkdir -p .harness-flow && printf '*\n' > .harness-flow/.gitignore
printf 'manual-git-worktree\n' > .harness-flow/worktree-owner
```

If `git worktree add` fails on a sandbox permission error, tell the user and work
in the current directory instead.

## Step 2: Setup & baseline

Install deps with the project's tool (`npm install` / `cargo build` / `pip install
-r requirements.txt` / `go mod download`), then run the test suite. If the baseline
fails, report and ask before proceeding.
