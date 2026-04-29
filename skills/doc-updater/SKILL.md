---
name: doc-updater
description: Use after `evaluator` passes. Reflect the session's code changes into `CHANGELOG.md` (unconditional), `README.md`, `CLAUDE.md`, `docs/**/*.md`. Writes `.planning/{session_id}/findings.md` as audit log. No user confirmation — evaluator already gated, doc edits are git-revertable.
---

# Doc Updater

Reflect session code changes into project docs. Runs in the `doc-updater` agent's isolated context.

## Input

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `tasks_path`: `".planning/{session_id}/TASKS.md"`
- `diff_command` *(optional)*: defaults to `git diff HEAD`
- `project_root` *(optional)*: defaults to CWD

## Output

Single JSON object, no prose alongside. `next` is always `null` — `doc-updater` is the terminal node (no downstream edge in `harness-flow.yaml`):

```json
{ "outcome": "done", "session_id": "...", "next": null }
{ "outcome": "error", "session_id": "...", "reason": "<one line>", "next": null }
```

## Procedure

1. **Read context** — parse `tasks_path` (heading, Description, `[Result]` per task), run `diff_command`. Missing TASKS.md or empty diff → `error`.

2. **CHANGELOG.md (unconditional)** — create with [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) skeleton if absent. Find `## [Unreleased]` (insert if missing). Classify each task into `Added` / `Changed` / `Fixed` / `Security` / `Deprecated` / `Removed`. Security-relevant diffs (auth, crypto, input validation, secrets, RBAC) double-emit under `Security`. Ambiguous → prefer `Added > Changed > Fixed`. One bullet per task: `- {imperative one-liner} (TASKS.md: task-{id})`.

3. **README.md / CLAUDE.md / docs/\*\*/\*.md** — for each file that exists, identify sections semantically touched by the diff. Apply a small edit (≤20 lines): update existing section (with line number) or append new `## {heading}` at file end. If the diff demands a top-to-bottom rewrite, record as `not applied — structural rewrite required` and skip.

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
   - (영향 없음)

   ## Not applied
   - docs/architecture.md — structural rewrite required
   ```

   Omit `## Not applied` if empty.

5. **Emit** `{outcome, session_id, next: null}`. The lookup per `using-harness § Core loop` finds no candidate (no node in `harness-flow.yaml` has `doc-updater` in its `depends_on`), so `next` is always `null`.

## Constraints

- Ignore generated/vendored paths: `dist/`, `node_modules/`, `*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `go.sum`.
- Tasks with `[Result: skipped]` are excluded from CHANGELOG.
- No translation (e.g., `README.ko.md`), version bumps, or new doc files beyond the four targets — record skipped variants under `## Not applied`.
- No user questions. Ambiguity → record in `## Not applied` and continue.
- `not applied` never escalates to `error` — only unrecoverable infra failures do (permission denied, disk full, corrupted CHANGELOG).

## Tools

`Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash` (for `git diff`).
