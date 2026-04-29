---
name: task-writer
description: Use when a planning session needs an executable TASKS list drafted in an isolated subagent context, with or without upstream PRD/TRD.
---

# Task Writer

## Purpose

Produce **`TASKS.md`** — the executor's only source of truth. Every session ends here regardless of tier. The `parallel-task-executor` reads it, the `evaluator` gates on it, and each per-task subagent receives a task block from it in place of PRD/TRD context.

See `../../harness-contracts/output-contract.md` for the payload schema, output JSON, error taxonomy, and shared anti-patterns.

This skill receives `session_id`, `request` (always present), optional `prd_path`, optional `trd_path`, and optional `brainstorming_output`. If `prd_path`, `trd_path`, **and** `brainstorming_output` are all null and `request` has no actionable verb, emit `error`.

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## Why this exists

Per-task subagents do not have PRD/TRD in context — they only see the task text from TASKS.md. Preserving PRD/TRD vocabulary verbatim is therefore correctness, not style: the evaluator greps for PRD acceptance terms, and rephrasing breaks the trace.

Sessions arrive in four shapes; output shape is identical (branch is input-driven, not classification-based):

| Shape | `prd_path` | `trd_path` | Acceptance grounds in | Task shape comes from |
|---|---|---|---|---|
| PRD + TRD | set | set | PRD Acceptance criteria | TRD Affected surfaces, Interfaces, Data model |
| PRD only | set | null | PRD Acceptance criteria | Step 2 exploration |
| TRD only | null | set | TRD Interfaces & contracts, Risks | TRD Affected surfaces |
| neither | null | null | `brainstorming_output.acceptance` or `request` | Step 2 exploration |

## Procedure

### Step 1 — Read the payload and upstream docs

Re-read `request` in full. Read PRD (if `prd_path`) and TRD (if `trd_path`) end-to-end. Extract:

- PRD: Goal, every Acceptance criterion (→ task `Acceptance:` bullets), Non-goals, Constraints.
- TRD: Affected surfaces (→ task `Files:`), Interfaces & contracts (→ `Acceptance:` for API-shaped tasks), Risks (→ Notes).
- `brainstorming_output` (no PRD): `acceptance`, `constraints[]`.
- `request` alone (no upstream docs): action verb + object.

If a declared upstream file is missing, emit `error`.

### Step 2 — Scoped codebase exploration (budget-capped)

Tool budget: **~20 Read/Grep/Glob calls**. Spend depends on upstream docs:

- **TRD present**: verify files in TRD Affected surfaces exist (Glob); resolve line ranges (Read). Confirming, not re-exploring.
- **PRD only**: locate the primary module from PRD subject, walk outward enough for accurate `Files:`. Shallower than TRD-writer Step 2 — only need *which files change*.
- **Neither**: from scratch. First noun-phrase in `request`, grep occurrences, map the change surface.

Stop when you can answer: (1) which files are created/modified/tested? (2) are there natural seams where independent subagents could each own one task? (drives DAG shape) (3) does the codebase expose patterns to follow (test location, module boundaries)?

Greenfield with no analog: pick a defensible path, put uncertainty in Notes. Budget exhausted without resolving: halt and emit `error`.

### Step 3 — Decompose into tasks

One task = one PR-sized unit a fresh subagent can complete in one execution without clarification.

Split: two files with no shared context; config/migration that must land before dependent code; refactor + behavior change in one commit. Don't split: a new file and its test; a function and its single caller (unless clearly different subsystems).

3–8 tasks is healthy. <3 means bundled; >8 means over-split. When ≤2 files change, 1 task is often correct — do not manufacture structure.

IDs: `task-1`, `task-2`, ... in topological order. Evaluator and executor reference by ID; renaming breaks state tracking.

### Step 4 — Write each task

See `references/template.md` for the template + Self-Review checklist, and `references/example.md` for a worked example.

**Writing rules**:

- Mirror the user's language in prose; field names (`Depends:`, `Files:`, `Acceptance:`, `Notes:`) and code identifiers stay English.
- **Use PRD/TRD vocabulary verbatim.** If PRD says "2FA", don't write "second-factor". If TRD says `issueSession`, don't write `createSession`. Code identifiers in backticks; wrap conceptual terms in `**bold**` on first occurrence per task — those are the evaluator's grep targets.
- **No placeholders.** "TBD", "similar to task N", "add error handling", "handle edge cases" are plan failures.
- **Acceptance is externally verifiable**: "`issueSession` is called only after TOTP verification passes" works; "implementation is correct" doesn't.
- **Every Acceptance bullet cites its source** in parens: `(PRD §Acceptance criteria)`, `(TRD §Interfaces & contracts)`, or `(request)`.
- **Notes is for non-obvious constraints only.** Omit the field entirely otherwise.

Task-writer-specific anti-patterns (additional to `../../harness-contracts/output-contract.md`): no implementation steps (the subagent decides); no bundling unrelated surfaces; no duplicated Acceptance bullets across tasks (each criterion lives in exactly one task — TRD Risks are the exception); no `(assumed)` on Acceptance (use Notes).

### Step 5 — Write the file

Create `.planning/{session_id}/` if missing. Write `TASKS.md`. If the file already exists, emit `error`.

Before writing Self-Review, actually perform each check and only `[x]` boxes you can honestly certify. Unchecked signals a known gap for the evaluator; checking falsely is worse than missing a task.

### Step 6 — Emit

Emit the final JSON as your entire final message. Task-writer's `done` example (shape defined in `../../harness-contracts/output-contract.md`):

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "path": ".planning/2026-04-19-.../TASKS.md" }
```

## Required next skill

When this skill emits `outcome: "done"` (full payload contract: `../../harness-contracts/payload-contract.md` § "task-writer → parallel-task-executor"):

- **REQUIRED SUB-SKILL:** Use harness-flow:parallel-task-executor
  Payload: `{ session_id }` — the executor reads `.planning/{session_id}/TASKS.md` from disk directly, so `path` is not threaded through.

On `outcome: "error"`: flow terminates. Report to the user and stop.

## Edge cases

- **PRD Acceptance with no natural home task**: don't invent a dummy task. Add to the closest existing task with PRD citation. If genuinely no task touches the surface, leave the Self-Review box *unchecked* — a legitimate signal for the evaluator.
- **TRD Risk applies across multiple tasks**: repeat in each affected task's Notes. Exception to "each item in exactly one task" since subagents only see their own task.
- **DAG cycle**: do not write the file. Emit `error`.
- **Wide-reach refactor with only `request`**: spend Step 2 budget on Glob to enumerate call sites, not Read on each. One task with 8 paths is fine if the refactor is uniform.
- **One PRD criterion maps to three tasks**: split into per-task sub-claims, each citing the same PRD section.

## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill = `TASKS.md` row — create only; PRD/TRD are upstream read-only; source code untouched). Note: parallel-task-executor will later append `[Result]` blocks to this file; do not pre-allocate them.
- Do not invoke other agents or skills. Do not dispatch the executor — the 'Required next skill' section above dispatches downstream.
- Do not modify source code, even if you spot bugs. Note them in Notes if load-bearing.
- Tool budget: ~20 Read/Grep/Glob calls. If you need more, halt and emit `error` with a `reason`.
