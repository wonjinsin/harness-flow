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
BRANCH_NAME="${BRANCH_NAME:-feat/short-slug}"       # lowercase ascii, unsafe runs → -
git check-ref-format --branch "$BRANCH_NAME"         # refuse empty/invalid
git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" && { echo "exists"; exit 1; }

# Anchor to the repository root even when invoked from a nested directory.
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_PARENT=$(dirname "$REPO_ROOT")
LOCATION="$REPO_PARENT/$(basename "$REPO_ROOT")-${BRANCH_NAME//\//-}"
case "$LOCATION" in "$REPO_ROOT"|"$REPO_ROOT"/*) echo "location is inside repo" >&2; exit 1;; esac
test ! -e "$LOCATION" || { echo "location exists" >&2; exit 1; }
printf 'Worktree: %s\n' "$LOCATION"
```

The default is always a sibling directory, so do not edit `.gitignore`.

```bash
git worktree add "$LOCATION" -b "$BRANCH_NAME"
cd "$LOCATION"

# Explicit ownership marker used by finishing-a-development-branch.
mkdir -p .harness-flow && printf '*\n' > .harness-flow/.gitignore
printf 'manual-git-worktree\n' > .harness-flow/worktree-owner
```

If `git worktree add` fails on a sandbox permission error, tell the user and work
in the current directory instead.

## Step 2: Setup & baseline

Install deps with the project's tool (`npm install` / `cargo build` / `pip install
-r requirements.txt` / `go mod download`), then run the test suite. If the baseline
fails, report and ask before proceeding.
