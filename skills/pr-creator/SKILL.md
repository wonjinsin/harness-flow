---
name: pr-creator
description: Use when the user asks to create or open a pull request for finished branch work.
---

# PR Creator

Create a GitHub PR for finished work. The actual diff is the source of truth for
the title and body; commit messages are supporting context only.

**Announce at start:** "I'm using the pr-creator skill to create this PR."

## Workflow

1. Inspect the repository state and use `origin`'s default branch as the base.
   Require a clean working tree and a named branch other than the base branch.
   If uncommitted changes exist, stop and ask the user how to handle them. If the
   checkout is detached or on the base branch, stop and explain what is needed.
2. Treat the current `HEAD` as the publication snapshot. If the working tree or
   `HEAD` changes before the push or PR creation, stop. Report a blocker when
   `origin` or authenticated GitHub tooling is unavailable.
3. Read the complete change set the PR will display for the selected base and
   snapshot. Follow the repository's PR template and conventions. When multiple
   templates could apply, ask which to use; when none exists, use
   `references/pr-template.md`.
4. Preserve the selected template's headings and order. Fill each applicable
   section with facts from the diff, remove HTML placeholders, mark checkboxes
   only when true, and claim only verification commands run in this session and
   their observed results. Use a body file so shell quoting cannot alter content.
5. Publish the exact publication snapshot under the named branch with a normal,
   non-forced push. Stop on rejection or when the remote branch moved; never
   overwrite it. Require the remote branch head to match the publication snapshot
   immediately before PR creation.
6. Create the PR against the selected base. Confirm the created PR's head matches
   the publication snapshot and confirm its base and URL before reporting success.
   If any value is missing or mismatched, report the unsafe result and stop.
