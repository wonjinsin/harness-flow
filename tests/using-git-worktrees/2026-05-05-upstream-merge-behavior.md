# Test: `using-git-worktrees` skill (upstream-merged body)

## Setup

| Field | Value |
|---|---|
| Date | 2026-05-05 (initial run + same-day re-verification in a fresh session) |
| Repo | `/Users/WonjinSin/Documents/project/harness-flow` |
| Branch at start | `master` |
| HEAD | `f45176a` |
| SKILL.md source | upstream `superpowers/skills/using-git-worktrees/SKILL.md` (body), harness-flow original frontmatter (`name`, `description`) preserved |
| `EnterWorktree` available | listed as a deferred tool in the Claude Code session |

## Step-by-step trace

### Step 0 — Detect existing isolation

Commands run from `harness-flow` root:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
BRANCH=$(git branch --show-current)
git rev-parse --show-superproject-working-tree
```

Result:

- `GIT_DIR == GIT_COMMON == /Users/WonjinSin/Documents/project/harness-flow/.git`
- `BRANCH = master`
- Submodule check: empty (not in a submodule)

Conclusion: **plain checkout, not in a linked worktree.** Proceed to Step 1.

### Step 1a — Native worktree tool (`EnterWorktree`)

This step gave different results across two sessions on the same day. The difference is the source of an important finding (see below).

#### First session — refused

Call:

```
EnterWorktree(name: "worktree-skill-test")
```

Result:

```
Cannot create a worktree: not in a git repository and no WorktreeCreate hooks
are configured. Configure WorktreeCreate/WorktreeRemove hooks in settings.json
to use worktree isolation with other VCS systems.
```

Even though `git rev-parse --is-inside-work-tree` returned `true` and `.git/` was a real directory, the call was rejected. Session-start metadata in that session reported `Is a git repository: false`, indicating `EnterWorktree` reads a session-level cached signal rather than re-checking git state at call time.

#### Second session (fresh restart) — succeeded

Same call, this time with session-start metadata correctly reporting `Is a git repository: true`:

```
EnterWorktree(name: "verify-rerun")
→ Created worktree at /Users/WonjinSin/Documents/project/harness-flow/.claude/worktrees/verify-rerun
  on branch worktree-verify-rerun. The session is now working in the worktree.
```

`git worktree list` confirmed:

```
/Users/WonjinSin/Documents/project/harness-flow                                 f45176a [master]
/Users/WonjinSin/Documents/project/harness-flow/.claude/worktrees/verify-rerun  f45176a [worktree-verify-rerun]
```

Observations:

- Worktree placement: **`<repo-root>/.claude/worktrees/<name>/`**. The `.claude/worktrees/` directory resolves relative to the repository root, not the caller's CWD — this answers the prior open question of (A) root-relative vs (B) CWD-relative vs (C) home-relative as **(A) root-relative**.
- Branch auto-naming: `worktree-<name>` (the tool prefixes the user-supplied name with `worktree-`).
- Session CWD switches into the new worktree automatically.
- Step 0 commands run inside the new worktree report `GIT_DIR != GIT_COMMON` and a non-submodule path, so the skill's existing-isolation detection correctly recognizes EnterWorktree-created worktrees.
- Calling `EnterWorktree` again while already inside a worktree is rejected with `Already in a worktree session. Use ExitWorktree to leave it before entering another.` — the harness enforces non-nesting at the tool level, in addition to the skill's Step 0.
- `ExitWorktree(action: "remove")` cleanly removed the worktree directory and the auto-created branch when the worktree had no uncommitted changes.

### Step 1b — Git fallback (re-verified)

The CWD-relative path bug observed in the first session was reproduced again in the second session, after Step 1a was confirmed working.

Re-test from a subdirectory:

```bash
cd /Users/WonjinSin/Documents/project/harness-flow/skills
git worktree add .worktrees/sub-bug-recheck -b worktree-test/sub-bug-recheck
```

`git worktree list` after creation:

```
/Users/WonjinSin/Documents/project/harness-flow                                    f45176a [master]
/Users/WonjinSin/Documents/project/harness-flow/skills/.worktrees/sub-bug-recheck  f45176a [worktree-test/sub-bug-recheck]
```

Worktree placed at `<repo>/skills/.worktrees/...`, **not** at `<repo>/.worktrees/...`. The skill's own statement that the default is `.worktrees/` "at the project root" does not match the actual command behavior when the caller's CWD is a subdirectory. `.gitignore`'s unanchored `.worktrees/` rule still matches the subdirectory location, so the misplaced worktree is silently ignored — no `git status` warning.

### Step 3 / Step 4 — Project setup and baseline tests

Skipped intentionally for both sessions. The verification target was placement and isolation behavior; running `npm install` against the parent project would have been a destructive side effect outside the test's scope.

## Findings

1. **`EnterWorktree` is fully usable when the session correctly recognizes the repo.** Placement is deterministic at `<repo-root>/.claude/worktrees/<name>/`; the answer to the prior plan's A/B/C question is **(A) root-relative**.
2. **`EnterWorktree`'s "is this a git repo?" decision is captured at session start.** If the session begins outside a git repo, or the harness's startup metadata otherwise reports the directory as non-git, the tool refuses for the lifetime of that session even though git itself works fine. The observed workaround is a session restart from inside the repo.
3. **The harness enforces non-nesting at the tool layer.** Calling `EnterWorktree` again from inside an existing worktree returns an explicit error, complementing (not replacing) the skill's Step 0 detection.
4. **Step 0 detection in the merged skill works correctly.** `GIT_DIR != GIT_COMMON` plus the submodule guard correctly classify a normal checkout, an `EnterWorktree`-created linked worktree, and a submodule.
5. **The Step 1b CWD-relative bug is real and reproducible.** From `harness-flow/skills/`, the manual `git worktree add .worktrees/<name>` command lands at `<repo>/skills/.worktrees/<name>` — the path is interpreted relative to the caller's CWD, not the repo root.
6. **`.gitignore`'s default rule masks the placement bug.** The unanchored `.worktrees/` pattern matches the misplaced subdirectory location, so the user gets no `git status` warning.
7. **Sibling-of-repo placement is not native to either path.** Neither `EnterWorktree` (places under `<repo>/.claude/worktrees/`) nor the Step 1b default (`<cwd>/.worktrees/`) places worktrees outside the repo. Achieving sibling-of-repo placement requires an explicit patch to the skill.

## Conclusions

The straight upstream merge fixes several real issues — Step 0 detection, submodule guard, the priority of declared user preferences, and sandbox-error fallback. With a session that correctly recognizes the git repo, Step 1a (`EnterWorktree`) also works as designed and produces deterministic, root-relative placement.

It does **not**, however, fix the original concern: invoking the Step 1b fallback from a subdirectory still creates the worktree in the wrong place, and `.gitignore`'s default rule hides the bug from `git status`.

If the desired behavior is sibling-of-repo placement that is invariant to the caller's CWD, a follow-up patch to the skill is needed. Minimal change in Step 1b:

```bash
ROOT=$(git rev-parse --show-toplevel)
REPO=$(basename "$ROOT")
WORKTREE_BASE="$(dirname "$ROOT")/${REPO}-worktree"   # sibling-of-repo
path="$WORKTREE_BASE/$BRANCH_NAME"
mkdir -p "$WORKTREE_BASE"
git worktree add "$path" -b "$BRANCH_NAME"
cd "$path"
```

This places the worktree at `<parent>/<repo>-worktree/<branch>/` regardless of CWD, removes the need for `.gitignore` entries (the path is outside the repo), and aligns with the layout Archon uses (`~/.archon/workspaces/<owner>/<repo>/worktrees/<branch>`).

Note that with a working `EnterWorktree`, Step 1a will be taken in most sessions and Step 1b fires only when (i) the harness has no native worktree tool, or (ii) `EnterWorktree` refuses (e.g., non-git or stale session metadata). The Step 1b patch therefore matters most as a safety net, but it is the path the user originally tripped over and remains worth fixing.

## Recommended next steps

1. Decide whether to keep `.worktrees/`-inside-repo (upstream Step 1b default, status quo after this merge) or adopt sibling-of-repo (user preference) for the fallback.
2. If sibling, patch Step 1b's directory selection and path construction in `skills/using-git-worktrees/SKILL.md` accordingly.
3. Decide whether the skill should also nudge users to ensure `EnterWorktree` is usable (e.g., a Common-Mistake entry: "if `EnterWorktree` reports non-git, restart the session from inside the repo"). The session-start cache caused the wasted Step 1a in the first session; a one-line note would prevent recurrence.
4. Update `.gitignore` policy: if `.worktrees/`-inside-repo remains the Step 1b default, switch the recommended rule from `.worktrees/` to `/.worktrees/` (anchored) so an accidentally subdirectory-scoped worktree surfaces as untracked rather than being silently ignored.
