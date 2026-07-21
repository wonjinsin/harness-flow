---
name: using-git-worktrees
description: Use when starting feature work that needs isolation from current workspace or before executing implementation plans - ensures an isolated workspace exists via native tools or git worktree fallback. Based on superpowers(https://github.com/obra/superpowers).
---

# Using Git Worktrees

## Overview

Ensure work happens in an isolated workspace. Prefer your platform's native worktree tools. Fall back to manual git worktrees only when no native tool is available.

**Core principle:** Detect existing isolation first. Then use native tools. Then fall back to git. Never fight the harness.

**Announce at start:** "I'm using the using-git-worktrees skill to set up an isolated workspace."

## Step 0: Detect Existing Isolation

**Before creating anything, check if you are already in an isolated workspace.**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

**Submodule guard:** `GIT_DIR != GIT_COMMON` is also true inside git submodules. Before concluding "already in a worktree," verify you are not in a submodule:

```bash
# If this returns a path, you're in a submodule, not a worktree — treat as normal repo
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**If `GIT_DIR != GIT_COMMON` (and not a submodule):** You are already in a linked worktree. Skip to Step 2 (Project Setup). Do NOT create another worktree.

Report with branch state:
- On a branch: "Already in isolated workspace at `<path>` on branch `<name>`."
- Detached HEAD: "Already in isolated workspace at `<path>` (detached HEAD, externally managed). Branch creation needed at finish time."

**If `GIT_DIR == GIT_COMMON` (or in a submodule):** You are in a normal repo checkout.

Has the user already indicated their worktree preference in your instructions? If not, ask for consent before creating a worktree:

> "Would you like me to set up an isolated worktree? It protects your current branch from changes."

Honor any existing declared preference without asking. If the user declines consent, work in place and skip to Step 2.

## Step 1: Create Isolated Workspace

**You have two mechanisms. Try them in this order.**

### 1a. Native Worktree Tools (preferred)

The user has asked for an isolated workspace (Step 0 consent). Do you already have a way to create a worktree? It might be a tool with a name like `EnterWorktree`, `WorktreeCreate`, a `/worktree` command, or a `--worktree` flag. If you do, use it and skip to Step 2.

Native tools handle directory placement, branch creation, and cleanup automatically. Using `git worktree add` when you have a native tool creates phantom state your harness can't see or manage.

Only proceed to Step 1b if you have no native worktree tool available.

### 1b. Git Worktree Fallback

**Only use this if Step 1a does not apply** — you have no native worktree tool available. Create a worktree manually using git.

#### Branch Name

Choose a deterministic branch name from the approved task, for example
`feat/oauth-refresh` or `fix/codex-hook-deny`. Normalize to lowercase ASCII,
replace unsafe runs with `-`, then validate before creating anything:

```bash
BRANCH_NAME="fix/codex-hook-deny"
git check-ref-format --branch "$BRANCH_NAME"
git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" && {
  echo "branch already exists: $BRANCH_NAME" >&2
  exit 1
}
```

If task intent cannot produce an unambiguous name, ask the user. Never run
`git worktree add` with an empty or unvalidated `BRANCH_NAME`.

#### Directory Selection

Follow this priority order. Explicit user preference always beats observed
filesystem state. Whichever branch you land on, set both `LOCATION` (the
selected directory) and `LOCATION_KIND` (`project-local` or `sibling`) — the
create step below branches on `LOCATION_KIND`.

1. **Check your instructions for a declared worktree directory preference.** If the user has already specified one, use it without asking.

2. **Check for an existing, ignored project-local worktree directory:**
   ```bash
   ls -d .worktrees 2>/dev/null     # Preferred (hidden)
   ls -d worktrees 2>/dev/null      # Alternative
   ```
   A found directory is usable only when that exact selected path is ignored.
   If both are usable, `.worktrees` wins. Set `LOCATION_KIND="project-local"`.

3. **If there is no other guidance available**, default to a sibling directory
   outside the repository: `../<repo-name>-<branch-slug>`, where
   `<branch-slug>` replaces `/` in the validated branch name with `-`. This
   avoids changing the user's current branch merely to add a worktree ignore
   rule. Set `LOCATION_KIND="sibling"`.

#### Safety Verification (project-local directories only)

**MUST verify the exact selected project-local directory is ignored:**

```bash
git check-ignore -q -- "$LOCATION"
```

**If NOT ignored:** Do not edit or commit `.gitignore` on the current branch.
Choose the sibling-directory default instead, or ask the user for an explicit
location.

**Why critical:** Prevents accidentally committing worktree contents to repository.

#### Create the Worktree

```bash
# Project-local LOCATION contains multiple worktrees; sibling LOCATION is the
# complete target path. Resolve and verify the final path does not exist.
if [ "$LOCATION_KIND" = "project-local" ]; then
  path="$LOCATION/$BRANCH_NAME"
else
  path="$LOCATION"
fi
test ! -e "$path"

git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"

# Record manual-worktree ownership in a self-ignored marker. The finishing
# skill uses this marker to clean up sibling worktrees without touching
# host-managed workspaces.
mkdir -p .harness-flow
printf '*\n' > .harness-flow/.gitignore
printf 'manual-git-worktree\n' > .harness-flow/worktree-owner
```

**Sandbox fallback:** If `git worktree add` fails with a permission error (sandbox denial), tell the user the sandbox blocked worktree creation and you're working in the current directory instead. Then run setup and baseline tests in place.

## Step 2: Project Setup

Auto-detect and run appropriate setup:

```bash
# Node.js
if [ -f package.json ]; then npm install; fi

# Rust
if [ -f Cargo.toml ]; then cargo build; fi

# Python
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi

# Go
if [ -f go.mod ]; then go mod download; fi
```

## Step 3: Verify Clean Baseline

Run tests to ensure workspace starts clean:

```bash
# Use project-appropriate command
npm test / cargo test / pytest / go test ./...
```

**If tests fail:** Report failures, ask whether to proceed or investigate.

**If tests pass:** Report ready.

### Report

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

## Quick Reference

| Situation | Action |
|-----------|--------|
| Already in linked worktree | Skip creation (Step 0) |
| In a submodule | Treat as normal repo (Step 0 guard) |
| Native worktree tool available | Use it (Step 1a) |
| No native tool | Git worktree fallback (Step 1b) |
| `.worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| Both exist | Use `.worktrees/` |
| Neither exists | Default to sibling path outside repository |
| Selected directory not ignored | Use sibling path; do not edit current branch |
| Permission error on create | Sandbox fallback, work in place |
| Tests fail during baseline | Report failures + ask |
| No package.json/Cargo.toml | Skip dependency install |

## Common Mistakes

### Fighting the harness

- **Problem:** Using `git worktree add` when the platform already provides isolation
- **Fix:** Step 0 detects existing isolation. Step 1a defers to native tools.

### Skipping detection

- **Problem:** Creating a nested worktree inside an existing one
- **Fix:** Always run Step 0 before creating anything

### Skipping ignore verification

- **Problem:** Worktree contents get tracked, pollute git status
- **Fix:** Always use `git check-ignore` before creating project-local worktree

### Assuming directory location

- **Problem:** Creates inconsistency, violates project conventions
- **Fix:** Follow priority: explicit instructions > ignored project-local directory > sibling default

### Proceeding with failing tests

- **Problem:** Can't distinguish new bugs from pre-existing issues
- **Fix:** Report failures, get explicit permission to proceed

## Red Flags

**Never:**
- Create a worktree when Step 0 detects existing isolation
- Use `git worktree add` when you have a native worktree tool (e.g., `EnterWorktree`). This is the #1 mistake — if you have it, use it.
- Skip Step 1a by jumping straight to Step 1b's git commands
- Create a project-local worktree without checking the exact selected path
- Use an empty, invalid, or already-existing branch name
- Skip baseline test verification
- Proceed with failing tests without asking

**Always:**
- Run Step 0 detection first
- Prefer native tools over git fallback
- Follow directory priority: explicit instructions > ignored project-local directory > sibling default
- Verify directory is ignored for project-local
- Auto-detect and run project setup
- Verify clean test baseline
