---
name: pr-creator
description: Use when creating a pull request - the user asks to "create a PR", "open a pull request", "make/put up a PR", or implement hands off finished branch work for GitHub review or merge.
---

# PR Creator

## Overview

Create a GitHub PR whose body follows the repository's own PULL_REQUEST_TEMPLATE when one exists, or this skill's bundled fallback template when none does.

**Core principle:** The PR body describes the actual diff, not the commit messages. Read `git diff <base>...HEAD` before writing a word of the body.

**Announce at start:** "I'm using the pr-creator skill to create this PR."

## Workflow

### Step 1: Preflight

```bash
git status --short              # uncommitted changes?
git branch --show-current       # current branch
git rev-parse --verify 'HEAD^{commit}'
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

- Resolve the current `HEAD` once and call it `PUBLISH_HEAD`. A managed handoff
  from `implement` includes `PASSED_REVIEW_HEAD`; require `PUBLISH_HEAD` to equal
  it, or stop and return control for a new final review. For a standalone PR,
  the preflight current `HEAD` is `PUBLISH_HEAD`; it makes no claim that an
  earlier managed review covers that commit. Preserve the resolved SHA as a
  literal value; do not rely on a shell variable surviving another tool call.
- Uncommitted changes exist → stop and ask the user (commit / stash / leave out). A PR is outward-facing; never silently decide what ships.
- Empty current branch (detached HEAD) → stop. Preserve the HEAD SHA and direct
  Codex App users to **Create branch** or **Hand off to local**; otherwise ask
  the user to create a named branch before PR creation.
- On the base branch itself → stop and ask which branch to PR.
- Base branch: default branch of `origin` (`gh repo view --json defaultBranchRef` when available, else main/master detection above).

### Step 2: Find the repo's template

Check in GitHub's lookup order — first hit wins:

```bash
ls .github/PULL_REQUEST_TEMPLATE.md .github/pull_request_template.md \
   PULL_REQUEST_TEMPLATE.md docs/PULL_REQUEST_TEMPLATE.md 2>/dev/null
ls .github/PULL_REQUEST_TEMPLATE/ 2>/dev/null   # multi-template directory
```

- One file found → that is the body's structure.
- Multi-template directory → pick the template matching the change type (bugfix/feature/etc.); ambiguous → ask the user.
- Nothing found → use the fallback template at `references/pr-template.md` (relative to this skill).

### Step 3: Read the change

```bash
git log <base>..HEAD --oneline
git diff <base>...HEAD
```

The diff is the source of truth for the body. Commit messages are hints, not content.

### Step 4: Compose the body

The final body is: the template's headings, in the template's order, each filled with real content from Step 3.

- Replace every HTML comment / placeholder with actual content — the created PR contains zero `<!-- -->` markers.
- Checklist items: check only what is actually true of this diff (e.g. leave "Tests added" unchecked when the diff adds none). An unchecked box is honest; a falsely checked one misleads reviewers.
- Testing section: state only commands you ran in this session and their observed output. Run the verification now if you haven't.
- Language: English title and body. Title in the repo's commit-message style (e.g. conventional commits if the log uses them).

### Step 5: Push and create

Immediately before any push and again immediately before `gh pr create`, repeat
`git status --short` and resolve `HEAD`. Stop if the tree is dirty or `HEAD`
differs from `PUBLISH_HEAD`.

Push the local branch every time with a normal, non-forced update. A non-fast-
forward rejection means the remote branch moved; stop rather than overwrite it.
Immediately before `gh pr create`, resolve the remote branch tip with
`git ls-remote` and require the remote branch tip to equal `PUBLISH_HEAD`. After
creation, resolve the PR's `headRefOid` and require `headRefOid` to equal
`PUBLISH_HEAD` before reporting success.
Any missing or mismatched value stops the workflow and reports the unsafe PR when
one was created.

```bash
git push origin "<PUBLISH_HEAD>:refs/heads/<branch>"
git ls-remote --exit-code origin "refs/heads/<branch>"
gh pr create --base <base> --title "<title>" --body-file <tmp-file> --assignee @me
gh pr view <PR-URL> --json headRefOid --jq .headRefOid
```

Replace `<PUBLISH_HEAD>` with the verified commit SHA and `<branch>` with the
validated branch name before execution. Never leave either placeholder or use an
unset shell variable in the refspec; an empty source before `:` deletes a remote
branch. The raw-SHA push intentionally omits `-u` because no local branch ref is
the refspec source.

Write the body to a temp file and pass `--body-file` — inline `--body "$(cat <<EOF ...)"` breaks on quoting and is hard to review.

Report the PR URL to the user. If `gh` is missing, unauthenticated, or there is no remote → report exactly what's blocking and stop; don't retry workarounds.

## Quick Reference

| Situation | Action |
| --- | --- |
| Repo template exists | Fill it: same headings, same order, comments replaced |
| Multiple templates in `.github/PULL_REQUEST_TEMPLATE/` | Pick by change type, ask if unclear |
| No template anywhere | Use `references/pr-template.md` |
| Managed reviewed HEAD changed | Stop and require a new final review |
| Managed remote branch tip changed | Stop; never force-push over it |
| Uncommitted changes | Ask the user before anything else |
| Branch needs publishing | Push with a normal, non-forced update |
| No remote / no `gh` auth | Report the blocker, stop |

## Common Mistakes

- **Body written from commit messages only** — commits say what the author typed, the diff says what changed. Read the diff.
- **HTML comments left in the body** — reviewers see raw `<!-- -->` noise. Replace every placeholder.
- **Checklist boxes checked to look complete** — check only verified-true items.
- **Fabricated "Testing" claims** — if you didn't run it this session, don't claim it.
- **`--body` with inline heredoc** — quoting bugs corrupt the body. Always `--body-file`.
- **PR created from the base branch** — verify current branch in Step 1.
