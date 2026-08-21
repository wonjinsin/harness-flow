---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback.
---

# Using Git Worktrees

Work in an isolated workspace. Detect existing isolation first, then prefer your
harness's native tool, then fall back to manual git. Never fight the harness.

## Step 0: Detect existing isolation

The caller selects `optional` mode by default or `required-execution` mode for an
approved-plan handoff. Record status, whether HEAD names a branch, and whether that
branch is the resolved base branch, in addition to the isolation check:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
```

If `GIT_DIR != GIT_COMMON` AND `git rev-parse --show-superproject-working-tree`
is empty, the checkout is a linked worktree. In `optional` mode, skip to Step 2.
In `required-execution` mode, reuse it only when it is **clean, named, non-base**.
A dirty, detached, or base-branch linked worktree does not satisfy isolation:
create another workspace or stop before editing. A non-empty superproject means a
submodule; treat it as a normal checkout.

Otherwise you are in a normal checkout. In `optional` mode, ask before creating a
worktree unless the user already stated a preference; if they decline, work in place.
In `required-execution` mode, an ineligible checkout must create another workspace
or stop. `scripts/workspace-contract.js` is the executable state matrix.

## Step 1: Create the workspace

**1a. Native tool (preferred).** If your harness has a worktree tool
(`EnterWorktree`, `WorktreeCreate`, a `/worktree` command, a `--worktree` flag),
use it and skip to Step 2 — it handles placement, branch, and cleanup. Using
`git worktree add` when a native tool exists creates state the harness can't see.

**1b. Manual git fallback** — only if no native tool:

```bash
set -e
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
set -e
git worktree add "$LOCATION" -b "$BRANCH_NAME"
cd "$LOCATION"

# Private provenance used by finishing-a-development-branch. Never put this in
# the tracked workspace, and never overwrite a pre-existing file or symlink.
WORKTREE_PATH=$(pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
OWNER_FILE=$(git rev-parse --git-path harness-flow/worktree-owner)
OWNER_DIR=$(dirname "$OWNER_FILE")
if [ -L "$OWNER_DIR" ] || { [ -e "$OWNER_DIR" ] && [ ! -d "$OWNER_DIR" ]; }; then
  echo "worktree provenance collision: unsafe parent; preserve the worktree" >&2
  exit 1
fi
if [ ! -e "$OWNER_DIR" ]; then
  mkdir -m 700 "$OWNER_DIR" # atomic: a concurrent entry makes mkdir fail under set -e
fi
node - "$OWNER_FILE" "$WORKTREE_PATH" "$GIT_COMMON" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [ownerFile, worktreePath, gitCommon] = process.argv.slice(2);
const parent = fs.lstatSync(path.dirname(ownerFile));
if (parent.isSymbolicLink() || !parent.isDirectory()) {
  throw new Error('worktree provenance parent is not a real directory');
}
const { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants;
if (!Number.isInteger(O_NOFOLLOW)) {
  throw new Error('safe no-follow creation is unsupported');
}
const fd = fs.openSync(ownerFile, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
try {
  fs.writeFileSync(fd, `manual-git-worktree\n${worktreePath}\n${gitCommon}\n`);
  fs.fsyncSync(fd);
} finally {
  fs.closeSync(fd);
}
NODE
```

If `git worktree add` fails on a sandbox permission error, tell the user and work
in the current directory instead. If provenance creation fails, preserve the new
worktree, report its path, and stop; do not guess ownership or remove it.

## Step 2: Setup & baseline

Install deps with the project's tool (`npm install` / `cargo build` / `pip install
-r requirements.txt` / `go mod download`), then run the test suite. If the baseline
fails, report and ask before proceeding.
