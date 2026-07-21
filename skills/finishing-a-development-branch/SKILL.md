---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup. Based on superpowers(https://github.com/obra/superpowers).
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Detect environment → Present options → Execute choice → Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**

```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

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
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
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

Then: Cleanup worktree (Step 6), then delete branch:

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
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**If `GIT_DIR == GIT_COMMON`:** Normal repo, no worktree to clean up. Done.

**If `.harness-flow/worktree-owner` contains `manual-git-worktree`, or the
worktree path is under `.worktrees/` or `worktrees/`:** harness-flow created
this worktree — we own cleanup. The marker covers the sibling-directory default.

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune  # Self-healing: clean up any stale registrations
```

**Otherwise:** The host environment (harness) owns this workspace. Do NOT remove it. If your platform provides a workspace-exit tool, use it. Otherwise, leave the workspace in place.

## Quick Reference

| Option           | Merge | Push | Keep Worktree | Cleanup Branch |
| ---------------- | ----- | ---- | ------------- | -------------- |
| 1. Merge locally | ✓     | -    | -             | ✓              |
| 2. Create PR     | -     | ✓    | ✓             | -              |
| 3. Keep as-is    | -     | -    | ✓             | -              |
| 4. Discard       | -     | -    | -             | ✓ (force)      |

## Common Mistakes

**Skipping test verification**

- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**

- **Problem:** "What should I do next?" is ambiguous
- **Fix:** Present exactly 4 structured options (or 2 for detached HEAD)

**Cleaning up worktree for Option 2**

- **Problem:** Remove worktree user needs for PR iteration
- **Fix:** Only cleanup for Options 1 and 4

**Deleting branch before removing worktree**

- **Problem:** `git branch -d` fails because worktree still references the branch
- **Fix:** Merge first, remove worktree, then delete branch

**Running git worktree remove from inside the worktree**

- **Problem:** Command fails silently when CWD is inside the worktree being removed
- **Fix:** Always `cd` to main repo root before `git worktree remove`

**Cleaning up harness-owned worktrees**

- **Problem:** Removing a worktree the harness created causes phantom state
- **Fix:** Only clean up worktrees with the harness-flow ownership marker or
  paths under `.worktrees/` or `worktrees/`

**No confirmation for discard**

- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation

## Red Flags

**Never:**

- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request
- Remove a worktree before confirming merge success
- Clean up worktrees you didn't create (provenance check)
- Run `git worktree remove` from inside the worktree

**Always:**

- Verify tests before offering options
- Detect environment before presenting menu
- Present exactly 4 options for named branches or 2 host-safe options for detached HEAD
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only
- `cd` to main repo root before worktree removal
- Run `git worktree prune` after removal
