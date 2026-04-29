---
name: doc-updater
description: Use after the harness evaluator node passes and a session's code changes need to be reflected into project docs (CHANGELOG.md, README.md, CLAUDE.md, docs/**/*.md). Use when running as the doc-updater terminal node in the harness flow.
---

# Doc Updater

Reflect session code changes into project docs. Runs in the `doc-updater` agent's isolated context.

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## When NOT to use

- Outside the harness flow (call `evaluator` first; doc-updater assumes its gate has passed).
- When the user wants README translation or version bumps — those belong to a human.
- When the diff is empty: that means upstream produced no changes worth documenting; emit `error`, not `done`.

## Input

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `tasks_path`: `".planning/{session_id}/TASKS.md"`
- `diff_command` *(optional)*: defaults to `git diff HEAD`
- `project_root` *(optional)*: defaults to CWD

## Output

Single JSON object, no prose alongside.

```json
{ "outcome": "done", "session_id": "..." }
{ "outcome": "error", "session_id": "...", "reason": "<one line>" }
```

## Procedure

1. **Read context** — parse `tasks_path` (heading, Description, `[Result]` per task), run `diff_command`. Missing TASKS.md or empty diff → `error`.

2. **CHANGELOG.md (unconditional)** — create with [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) skeleton if absent. Find `## [Unreleased]` (insert if missing). Classify each task into `Added` / `Changed` / `Fixed` / `Security` / `Deprecated` / `Removed`. Security-relevant diffs (auth, crypto, input validation, secrets, RBAC) double-emit under `Security`. Ambiguous → prefer `Added > Changed > Fixed`. One bullet per task: `- {imperative one-liner} (TASKS.md: task-{id})`.

3. **README.md / CLAUDE.md / docs/\*\*/\*.md** — for each file that exists, identify sections semantically touched by the diff. Apply a small edit (≤20 lines): update existing section (with line number) or append new `## {heading}` at file end. If the diff demands a top-to-bottom rewrite, record as `not applied — structural rewrite required` and skip (≤20 lines keeps each doc edit reviewable as a single hunk; structural rewrites belong to a human, not silent chunking).

4. **findings.md** — write `.planning/{session_id}/findings.md`:

   ```markdown
   # Doc Impact Findings — {session_id}

   ## Scanned
   - README.md ✓
   - ...

   ## Changes applied
   ### CHANGELOG.md
   - [x] Added: ... (TASKS.md: task-3)
   ### README.md
   - [x] Section "Features" (line 12) — ...
   ### docs/api.md
   - (no impact)

   ## Not applied
   - docs/architecture.md — structural rewrite required
   ```

   Omit `## Not applied` if empty.

5. **Emit** — doc-updater is the terminal node — emit `{outcome, session_id}` (or `{outcome, session_id, reason}` on error).

## Required next skill

doc-updater is the terminal node — the harness flow ends here. Report a brief summary to the user (CHANGELOG entries added, files updated) and stop.

## Constraints

- File ownership: see `../../harness-contracts/file-ownership.md`. Doc-updater writes `CHANGELOG.md`, `findings.md`, and ≤20-line edits to `README.md` / `CLAUDE.md` / `docs/**/*.md`. Locale variants (e.g., `README.ko.md`) are out of scope.
- Ignore generated/vendored paths: `dist/`, `node_modules/`, `*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `go.sum`.
- Tasks with `[Result: skipped]` are excluded from CHANGELOG.
- No translation, version bumps, or new doc files beyond the four targets — record skipped variants under `## Not applied`.
- No user questions. Ambiguity → record in `## Not applied` and continue.
- `not applied` never escalates to `error` — only unrecoverable infra failures do (permission denied, disk full, corrupted CHANGELOG).

## Common Mistakes

- **Translating README** — out of scope. README.ko.md or other locale variants belong to a human translator; record under `## Not applied` and continue.
- **Version bumping** — out of scope. Version semantics are a release decision, not a doc-impact decision.
- **Escalating `not applied` to `error`** — `not applied` is a normal outcome (recorded in findings.md). Only unrecoverable infra failures (permission denied, disk full, corrupted CHANGELOG) become `error`.

## Tools

`Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash` (for `git diff`).
