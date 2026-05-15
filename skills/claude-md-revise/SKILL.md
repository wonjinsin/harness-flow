---
name: claude-md-revise
description: Use when finishing a development branch and the session contained user corrections, "always/never" rules, project-specific facts, anti-patterns, or external-system references worth persisting. Also use when the user explicitly says "remember this in CLAUDE.md", "add this to project memory", or repeats the same correction twice. Do NOT use for code conventions visible by reading the code, one-off task state, or personal preferences unrelated to this project.
---

# claude-md-revise

## Overview

Surface session-derived knowledge worth persisting to project `CLAUDE.md` or project `rules/*.md`, then apply it as scoped, per-candidate diffs the user approves one at a time.

**Core principle:** If a future Claude could derive it by reading the code, it does NOT belong in CLAUDE.md. Only persist what the project state cannot tell on its own.

**Announce at start:** "I'm using the claude-md-revise skill to surface CLAUDE.md update candidates from this session."

## When to Use

- About to invoke `finishing-a-development-branch` and the session had real corrections, conventions, or external constraints
- User said "remember this", "add to project memory", "persist this in CLAUDE.md"
- User repeated the same correction 2+ times (signal of a real rule, not a one-off)
- A non-obvious external fact came up (deadline, owner, deprecated path, external system)

**Do NOT use for:**

- Code conventions visible by reading the code (formatting, naming, file layout)
- Anything `git log` / `git blame` would tell
- One-off task state ("the bug we just fixed")
- Personal preferences unrelated to this project (those go to `~/.claude/CLAUDE.md` — propose, don't write)

## The Process

### Step 1: Gather Inputs

1. **Current session context** — primary source.
2. **Transcript fallback** — if the session is long and context may have compacted, the original messages live on disk:

   ```bash
   slug=$(pwd | sed 's|/|-|g')
   ls -t ~/.claude/projects/$slug/*.jsonl | head -1
   ```

   Read the most-recent JSONL. Each line is a JSON object with a `type` field. Many internal types (`attachment`, `system`, `file-history-snapshot`, `permission-mode`, etc.) are interleaved with the conversation — filter to `type == "user"` or `type == "assistant"` before reading content.

3. **Existing CLAUDE.md and rules files** — read all of these for context (so you can skip candidates already covered):
   - **Project scope (editable with user approval):** every `CLAUDE.md` from `pwd` upward to repo root, plus any `*.md` under `<project>/rules/` if that directory exists.
   - **User scope (read-only — propose, do not edit):** `~/.claude/CLAUDE.md` and every `*.md` under `~/.claude/rules/`.

   Anything under `~/.claude/` is user-owned. Read it to avoid restating, but never write to it directly — surface a proposal and let the user apply it themselves.

### Step 2: Identify Candidates

Categorize what came up in the session:

| Category | Example | Qualifies? |
|---|---|---|
| Rule | "we use bun, never npm" | ✓ if confidence ≥ medium |
| Fact | "merge freeze starts 2026-05-15" | ✓ — convert relative dates to absolute |
| Anti-pattern | "don't run hooks that call LLM" | ✓ if user explicitly corrected |
| Reference | "bugs tracked in Linear INGEST" | ✓ |
| Code convention | "we use TypeScript" (visible in package.json) | ✗ — derive don't document |
| Task state | "the auth bug we fixed today" | ✗ — git history owns it |

### Step 3: Filter Against Existing Files

For each candidate, scan all CLAUDE.md and `rules/*.md` files gathered in Step 1 (project scope and user scope). Skip candidates already covered (even with different wording). Don't restate.

### Step 4: Present Diffs One-by-One

For each surviving candidate, present:

```
[N/M] <Category> · confidence <high|medium|low>
Evidence: "<verbatim user quote>"
Target: <file path> · <section>

Proposed edit:
  - <old text or insertion point>
  + <new text>

Apply? (a)pprove / (e)dit / (r)eject / (d)efer
```

**Forbidden:** Bulk-approving multiple candidates with one prompt. One decision per candidate.

### Step 5: Apply and Suggest Commit

Use the Edit tool per approved candidate. After all approved edits applied, summarize what changed and suggest:

```
CLAUDE.md updated with N entries. Suggested commit:
  git add <files>
  git commit -m "docs(CLAUDE.md): persist session learnings"

Run now, or bundle with other work?
```

Do NOT auto-run the commit.

## Quick Reference

| Signal in session | Action |
|---|---|
| "we only use X" / "always X, never Y" | Strong candidate — Rule |
| Same correction repeated 2+ times | Strong candidate — Rule (high confidence) |
| One-time "let's do it this way" | Defer unless user re-confirms |
| External system mentioned | Candidate — Reference |
| Deadline / freeze date / stakeholder ask | Candidate — Fact (absolute date) |
| User explained existing code | NOT a candidate |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Bundling multiple candidates into one approval | One candidate = one decision |
| Restating existing CLAUDE.md content | Filter against current files in Step 3 |
| Adding code conventions visible from the code | Skip — derive don't document |
| Modifying any file under `~/.claude/` directly (CLAUDE.md, `rules/*.md`) | Never — propose, let user write themselves |
| Writing without showing the diff first | User must see exact diff before approving |
| Auto-committing | Suggest only — commit decision is the user's |
| Saving relative dates ("Thursday") | Always convert to absolute dates ("2026-05-15") |
| Adding to root CLAUDE.md when a subdirectory CLAUDE.md is more appropriate | Place rules at the narrowest applicable scope |

## Red Flags — STOP

- About to write to a file the user did not approve → STOP
- About to modify any file under `~/.claude/` (CLAUDE.md or `rules/*.md`) → STOP, propose to user instead
- About to add 5+ lines of code-derivable info → STOP, the project state already says this
- About to "auto-commit" without asking → STOP
- About to bundle 3 candidates into one approval prompt → STOP, present individually
