---
name: task-writer
description: Run as the final planning step before execution — after trd-writer (prd-trd or trd-only routes), after prd-writer (prd-only route), or directly after brainstorming (tasks-only route). Drafts `.planning/{session_id}/TASKS.md` — the executor's only source of truth. Each task is a PR-sized unit a fresh subagent can complete without clarification, with PRD/TRD vocabulary preserved verbatim because the evaluator greps on it. Consumes brainstorming's `exploration_findings` as authoritative ground; only verifies file existence and decomposition seams within a ~10-call budget. Runs in an isolated subagent.
model: opus
---

# Task Writer

## Purpose

Produce **`TASKS.md`** — the executor's only source of truth. Every session ends here regardless of tier. The `parallel-task-executor` reads it, the `evaluator` gates on it, and each per-task subagent receives a task block from it in place of PRD/TRD context.

See `../../harness-contracts/output-contract.md` for the payload schema, output JSON, error taxonomy, and shared anti-patterns.

This skill receives `session_id`, `request` (always present), optional `prd_path`, optional `trd_path`, optional `brainstorming_output`, optional `exploration_findings` (brainstorming's codebase peek — when present, the authoritative starting point), and optional `revision_note` (only when re-dispatched after a Gate 2 revise — see Step 1). If `prd_path`, `trd_path`, **and** `brainstorming_output` are all null and `request` has no actionable verb, emit `error`.

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
- `exploration_findings` (when present): `files_visited` provides the initial `Files:` set and decomposition seams; `code_signals` flag where Notes need risk callouts; `open_questions` may surface in task Notes if blocking.

If `revision_note` is present, this is a Gate 2 re-dispatch. **Anchor on the note**: which task or facet does the correction touch (a missing task, wrong `Files:` set, wrong DAG ordering, missing acceptance bullet)? Treat the rest of TASKS.md as basically right; surgically address what the note flagged without re-decomposing from scratch.

If a declared upstream file is missing, emit `error`.

### Step 2 — Scoped codebase exploration (budget-capped, verify-first)

Tool budget: **~10 Read/Grep/Glob calls when `exploration_findings` (or TRD with Affected surfaces) is present, ~20 when neither is present**. Brainstorming's peek and TRD's Affected surfaces already encode where the change lands — task-writer's Step 2 is mostly confirmation and decomposition, not discovery.

Spend depends on what's available (most → least information):

- **TRD present**: verify files in TRD Affected surfaces exist (Glob); resolve line ranges (Read). Confirming, not re-exploring. `exploration_findings` overlaps but TRD is more authoritative when both exist.
- **`exploration_findings` present, no TRD**: start from `files_visited` as the Files: floor; grep for callers/tests not yet visited to confirm decomposition seams.
- **PRD only, no findings**: locate the primary module from PRD subject, walk outward enough for accurate `Files:`. Shallower than TRD-writer Step 2 — only need *which files change*.
- **Neither**: from scratch (~20 cap). First noun-phrase in `request`, grep occurrences, map the change surface.

Stop when you can answer: (1) which files are created/modified/tested? (2) are there natural seams where independent subagents could each own one task? (drives DAG shape) (3) does the codebase expose patterns to follow (test location, module boundaries)?

Greenfield with no analog: pick a defensible path, put uncertainty in Notes. Budget exhausted without resolving: halt and emit `error`.

### Step 3 — Decompose into tasks

One task = one PR-sized unit a fresh subagent can complete in one execution without clarification.

Split: two files with no shared context; config/migration that must land before dependent code; refactor + behavior change in one commit. Don't split: a new file and its test; a function and its single caller (unless clearly different subsystems).

3–8 tasks is healthy for sessions touching multiple files or subsystems. <3 means bundled or under-decomposed; >8 means over-split.

**Exception, takes precedence**: when the entire change is ≤2 files, 1 task is often correct — do not manufacture structure. A 1-file change with no natural subdivision is one task, not split into "task-1: edit" / "task-2: write test" which only serializes trivially. The 3–8 heuristic assumes substantial scope; trivial scope skips the heuristic.

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

### Step 5 — Write the file

Create `.planning/{session_id}/` if missing. Write `TASKS.md`. If the file already exists, emit `error`.

Before writing Self-Review, actually perform each check and only `[x]` boxes you can honestly certify. Unchecked signals a known gap for the evaluator; checking falsely is worse than missing a task.

### Step 6 — Emit

Emit the final JSON as your entire final message. Task-writer's `done` example (shape defined in `../../harness-contracts/output-contract.md`):

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "path": ".planning/2026-04-19-.../TASKS.md" }
```

## Required next skill

On `outcome: "done"`, the **main thread runs Gate 2** before dispatching the executor: it surfaces the written `TASKS.md` path and a one-line summary (e.g., "5 tasks, DAG depth 2, touches 4 files") to the user with a prompt like:

> "Wrote `.planning/{session_id}/TASKS.md`. Review and let me know — approve to execute, or tell me what to revise. Execution will dispatch subagents to make code changes."

Three branches (full contract: `../../harness-contracts/payload-contract.md` § "User review gates"). This is the last gate before code changes hit disk, so the prompt explicitly flags that.

- **approve** → **REQUIRED SUB-SKILL:** Use harness-flow:parallel-task-executor
  Payload: `{ session_id }` — the executor reads `.planning/{session_id}/TASKS.md` from disk directly, so `path` is not threaded through.
- **revise** → main thread deletes `.planning/{session_id}/TASKS.md` and re-dispatches **task-writer** with the original payload + `revision_note: "<user's correction>"`. Step 1 detects the field and anchors on the note.
- **abort** → main thread updates `STATE.md` `Last activity` and stops.

On `outcome: "error"` → flow terminates immediately (no Gate 2). Main thread reports the reason and stops.

## Anti-patterns

Task-writer-specific (additional to those in `../../harness-contracts/output-contract.md`):

- **No implementation steps.** The subagent decides how. The task says what surface to change and what passes acceptance.
- **No bundling unrelated surfaces.** Two changes that touch different files for different reasons are two tasks.
- **No duplicated Acceptance bullets across tasks.** Each criterion lives in exactly one task. TRD Risks are the documented exception — a Risk applies to multiple tasks, so it repeats in each affected task's Notes.
- **No `(assumed)` tag on Acceptance.** If you must assume to write a criterion, the criterion belongs in Notes, not Acceptance — Acceptance is what the executor and evaluator hold the work to.

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
- Tool budget: **~10 Read/Grep/Glob calls when `exploration_findings` or TRD Affected surfaces is present** (verify-first), **~20 when neither is present** (full mode). Task-writer's job is to confirm files exist (Glob) and locate decomposition seams — it does not redo TRD's design work or brainstorming's main-thread peek. If you need more than the applicable cap, halt and emit `error` with a `reason`.
