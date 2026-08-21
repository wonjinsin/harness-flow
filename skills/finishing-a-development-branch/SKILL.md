---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work.
---

# Finishing a Development Branch

Verify tests → detect environment → present options → execute choice → clean up.

## The Process

### Step 0: Require a Clean State

```bash
STATUS=$(git status --short)
```

If status is non-empty, separate chain-owned paths from pre-existing user changes.
`PENDING_COMMIT` from `llm-md-revise` identifies candidate paths, not permission to
commit them. Ask whether to commit only reviewed chain-owned changes or preserve the
workspace and stop; never stash, delete, or bundle user changes. Re-run status after
any commit. **Do not present integration options while status is non-empty.**

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:** report the failure count and relevant output, then stop. Merge/PR
options remain unavailable until the suite passes.

**If tests pass:** Continue to Step 2.

### Step 2: Detect Environment

**Determine workspace state before presenting options:**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
STATUS=$(git status --short)
```

This determines which menu to show and how cleanup works:

| State                                  | Menu                         | Cleanup                         |
| -------------------------------------- | ---------------------------- | ------------------------------- |
| `GIT_DIR == GIT_COMMON` (normal repo)  | Standard 4 options           | No worktree to clean up         |
| `GIT_DIR != GIT_COMMON`, named branch  | Standard 4 options           | Provenance-based (see Step 6)   |
| `GIT_DIR != GIT_COMMON`, detached HEAD | Host handoff, 2 options | No cleanup (externally managed) |

Before leaving the feature worktree for Options 1 or 4, record its canonical
`FEATURE_WORKTREE_PATH`. Step 6 receives this explicit path; it never infers the
cleanup target from its later CWD.

### Step 3: Determine Base Branch

```bash
# Resolve the branch name first; merge-base returns a SHA, not a branch name.
BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
if [ -z "$BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then
  BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null)
fi
if [ -z "$BASE_BRANCH" ]; then
  git show-ref --verify --quiet refs/heads/main && BASE_BRANCH=main
  [ -n "$BASE_BRANCH" ] || { git show-ref --verify --quiet refs/heads/master && BASE_BRANCH=master; }
fi
MERGE_BASE=$(git merge-base HEAD "$BASE_BRANCH")
```

Or ask: "This branch split from main - is that correct?"

### Step 4: Present Options

**Normal repo and named-branch worktree — present exactly these 4 options:**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Detached HEAD — present exactly these 2 options:**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Preserve the commits and hand off via the host's **Create branch** or **Hand off to local** control
2. Keep this detached workspace as-is

Which option?
```

**Don't add explanation** - keep options concise.

### Step 5: Execute Choice

#### Option 1: Merge Locally

Ask merge style if not specified: regular or squash.

```bash
# Capture the cleanup target before changing worktree.
FEATURE_WORKTREE_PATH=$(cd "$(git rev-parse --show-toplevel)" && pwd -P)
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
if ! MAIN_STATUS=$(git -C "$MAIN_ROOT" status --porcelain); then
  echo "cannot inspect integration target; preserve both worktrees" >&2
  exit 1
fi
if [ -n "$MAIN_STATUS" ]; then
  echo "integration target is dirty; preserve user changes and stop" >&2
  exit 1
fi
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull

git merge <feature-branch>            # regular merge
# OR
git merge --squash <feature-branch>   # squash merge
git commit -m "<message summarizing the branch>"

# Verify tests on merged result
<test command>

# Only after merge succeeds: cleanup worktree (Step 6), then delete branch
```

Then: Cleanup worktree (Step 6), then delete branch (worktree first — `git branch -d`
fails while a worktree still references the branch):

```bash
git branch -d <feature-branch>   # regular merge
# OR
git branch -D <feature-branch>   # squash merge requires -D — git treats the
                                 # squashed commit as unrelated to <feature-branch>
```

#### Option 2: Push and Create PR

```bash
# PR creator performs preflight, pushes if needed, and creates the PR.
# Invoke harness-flow:pr-creator here; do not stop after a bare push.
```

**Do NOT clean up worktree** — user needs it alive to iterate on PR feedback.

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**

```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:

```bash
FEATURE_WORKTREE_PATH=$(cd "$(git rev-parse --show-toplevel)" && pwd -P)
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
```

If this is a linked worktree, run Step 6 from `MAIN_ROOT`, then delete the
feature branch. If this is a normal checkout, first verify status is clean and
switch to the resolved base branch before deleting the old branch:

```bash
test -z "$(git status --short)" || { echo "working tree is dirty" >&2; exit 1; }
cd "$MAIN_ROOT"
git switch <base-branch>  # normal checkout only
git branch -D <feature-branch>
```

#### Detached HEAD choices

Detached workspaces are externally managed. Choice 1 reports the current HEAD
SHA, suggested branch name, and PR title/body, then tells the user to use the
host's **Create branch** or **Hand off to local** control. Choice 2 preserves
the workspace. Do not map these choices onto named-branch Options 1–4, do not
delete commits, and do not remove the host-owned worktree.

### Step 6: Cleanup Workspace

**Only runs for Options 1 and 4.** Options 2 and 3 always preserve the worktree.

```bash
set -e
: "${FEATURE_WORKTREE_PATH:?record feature worktree path before leaving it}"
FEATURE_WORKTREE_PATH=$(cd "$FEATURE_WORKTREE_PATH" && pwd -P)

resolve_git_dir() {
  case "$1" in
    /*) (cd "$1" && pwd -P) ;;
    *) (cd "$FEATURE_WORKTREE_PATH/$1" && pwd -P) ;;
  esac
}
GIT_DIR=$(resolve_git_dir "$(git -C "$FEATURE_WORKTREE_PATH" rev-parse --git-dir)")
GIT_COMMON=$(resolve_git_dir "$(git -C "$FEATURE_WORKTREE_PATH" rev-parse --git-common-dir)")
WORKTREE_PATH=$FEATURE_WORKTREE_PATH

if [ "$GIT_DIR" = "$GIT_COMMON" ]; then
  echo "normal checkout; no linked worktree cleanup"
  exit 0
fi

OWNER_RAW=$(git -C "$FEATURE_WORKTREE_PATH" rev-parse --git-path harness-flow/worktree-owner)
case "$OWNER_RAW" in
  /*) OWNER_FILE=$OWNER_RAW ;;
  *) OWNER_FILE="$FEATURE_WORKTREE_PATH/$OWNER_RAW" ;;
esac
OWNER_DIR=$(dirname "$OWNER_FILE")
if [ -L "$OWNER_DIR" ] || [ ! -d "$OWNER_DIR" ] || [ -L "$OWNER_FILE" ] || [ ! -f "$OWNER_FILE" ]; then
  echo "missing or unsafe private provenance; preserve the worktree" >&2
  exit 1
fi
if ! {
  IFS= read -r OWNER_KIND &&
  IFS= read -r OWNER_PATH &&
  IFS= read -r OWNER_COMMON &&
  {
    OWNER_EXTRA=
    if IFS= read -r OWNER_EXTRA; then
      false
    else
      [ -z "$OWNER_EXTRA" ]
    fi
  }
} < "$OWNER_FILE"; then
  echo "malformed private provenance; preserve the worktree" >&2
  exit 1
fi
if [ "$OWNER_KIND" = "manual-git-worktree" ] \
  && [ "$OWNER_PATH" = "$WORKTREE_PATH" ] \
  && [ "$OWNER_COMMON" = "$GIT_COMMON" ]; then
  :
else
  echo "private provenance mismatch; preserve the worktree" >&2
  exit 1
fi

MAIN_ROOT=$(git -C "$GIT_COMMON/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune
```

Missing, symlinked, malformed, or mismatched provenance is externally managed.
Preserve it and use a native workspace-exit tool when available. Never infer
ownership from repository content, the worktree path, or its name.
