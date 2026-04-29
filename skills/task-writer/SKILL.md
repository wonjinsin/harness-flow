---
name: task-writer
description: Run as the final planning step before execution — after trd-writer (prd-trd or trd-only routes), after prd-writer (prd-only route), or directly after brainstorming (tasks-only route). Drafts `.planning/{session_id}/TASKS.md` — the executor's only source of truth. Each task is a PR-sized unit a fresh subagent can complete without clarification, with PRD/TRD vocabulary preserved verbatim because the evaluator greps on it. Reads `.planning/{session_id}/brainstorming.md` (and PRD.md / TRD.md when present) as authoritative ground; only verifies file existence and decomposition seams within a ~10-call budget. Runs in an isolated subagent.
model: opus
---

# Task Writer

## Purpose

Produce **`TASKS.md`** — the executor's only source of truth. Every session ends here regardless of tier. The `parallel-task-executor` reads it, the `evaluator` gates on it, and each per-task subagent receives a task block from it in place of PRD/TRD context.

See `../../harness-contracts/output-contract.md` for the terminal-message conventions, error taxonomy, and shared anti-patterns. See `../../harness-contracts/payload-contract.md` for dispatch-prompt conventions.

The dispatch prompt is short. On the prd-trd route: `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md, .planning/{id}/PRD.md (if exists), and .planning/{id}/TRD.md."` On the prd-only route: `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md. No TRD for this route."` On the tasks-only route: `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md. No PRD or TRD will exist for this route."` A Gate 2 re-dispatch appends a `Revision note from user: {note}` line — Step 1 watches for it.

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## Why this exists

Per-task subagents do not have PRD/TRD in context — they only see the task text from TASKS.md. Preserving PRD/TRD vocabulary verbatim is therefore correctness, not style: the evaluator greps for PRD acceptance terms, and rephrasing breaks the trace.

Sessions arrive in four shapes; output shape is identical (branch is input-driven, not classification-based):

| Shape | PRD.md present | TRD.md present | Acceptance grounds in | Task shape comes from |
|---|---|---|---|---|
| PRD + TRD | yes | yes | PRD Acceptance criteria | TRD Affected surfaces, Interfaces, Data model |
| PRD only | yes | no | PRD Acceptance criteria | Step 2 exploration |
| TRD only | no | yes | TRD Interfaces & contracts, Risks | TRD Affected surfaces |
| neither | no | no | `## Brainstorming output` `acceptance` or `## Request` | Step 2 exploration |

Resolve which files exist by reading the route in `brainstorming.md` `## Recommendation` and checking the filesystem — do not rely solely on prompt wording.

## Procedure

### Step 1 — Read `brainstorming.md` and upstream docs

Read `.planning/{session_id}/brainstorming.md` end-to-end. Expected structure:

```markdown
# Brainstorming — {session_id}

## Request
"{verbatim user request}"

## A1.6 findings
- files visited: ...
- key findings: ...
- code signals: ...
- open questions: ...

## Brainstorming output
- intent: ...
- target: ...
- scope: ...
- constraints: ...
- acceptance: ...

## Recommendation
- route: {prd-trd|prd-only|trd-only|tasks-only}
- estimated files: ...
- user approved: yes
```

Then, based on the route in `## Recommendation`, read what exists on disk:

- **prd-trd** → read `.planning/{session_id}/PRD.md` and `.planning/{session_id}/TRD.md`.
- **prd-only** → read `.planning/{session_id}/PRD.md`.
- **trd-only** → read `.planning/{session_id}/TRD.md`.
- **tasks-only** → no upstream docs; ground in `brainstorming.md` only.

If a declared upstream file is missing, emit the error terminal message.

Extract:

- PRD: Goal, every Acceptance criterion (→ task `Acceptance:` bullets), Non-goals, Constraints.
- TRD: Affected surfaces (→ task `Files:`), Interfaces & contracts (→ `Acceptance:` for API-shaped tasks), Risks (→ Notes).
- `## Brainstorming output` (no PRD): `acceptance`, `constraints`.
- `## Request` alone (no upstream docs): action verb + object.
- `## A1.6 findings`: `files visited` provides the initial `Files:` set and decomposition seams; `code signals` flag where Notes need risk callouts; `open questions` may surface in task Notes if blocking. If the body reads `(skipped — no resolvable target)`, switch to full-mode exploration in Step 2.

If the dispatch prompt contains a line `Revision note from user: {note}`, this is a Gate 2 re-dispatch. **Anchor on the note**: which task or facet does the correction touch (a missing task, wrong `Files:` set, wrong DAG ordering, missing acceptance bullet)? Treat the rest of TASKS.md as basically right; surgically address what the note flagged without re-decomposing from scratch.

If `## Recommendation` route is `tasks-only` and `## Request` has no actionable verb and `## Brainstorming output` is empty, emit `error`.

### Step 2 — Scoped codebase exploration (budget-capped, verify-first)

Tool budget: **~10 Read/Grep/Glob calls when `## A1.6 findings` has content (or TRD with Affected surfaces is present), ~20 when neither is present**. Brainstorming's peek and TRD's Affected surfaces already encode where the change lands — task-writer's Step 2 is mostly confirmation and decomposition, not discovery.

Spend depends on what's available (most → least information):

- **TRD present**: verify files in TRD Affected surfaces exist (Glob); resolve line ranges (Read). Confirming, not re-exploring. `## A1.6 findings` overlaps but TRD is more authoritative when both exist.
- **`## A1.6 findings` present, no TRD**: start from `files visited` as the `Files:` floor; grep for callers/tests not yet visited to confirm decomposition seams.
- **PRD only, no findings**: locate the primary module from PRD subject, walk outward enough for accurate `Files:`. Shallower than trd-writer Step 2 — only need *which files change*.
- **Neither (findings skipped, no upstream docs)**: from scratch (~20 cap). First noun-phrase in `## Request`, grep occurrences, map the change surface.

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

### Step 6 — Terminal message

End your turn with a short markdown block. On success:

```markdown
## Status
done

## Path
.planning/{session_id}/TASKS.md
```

On error:

```markdown
## Status
error

## Reason
{short cause}
```

The executor reads `.planning/{session_id}/TASKS.md` from disk directly and does not consume `## Path` — it's included for symmetry with other writers and so the user sees the file location at Gate 2.

## Required next skill

On `## Status: done`, the **main thread runs Gate 2** before dispatching the executor: it surfaces the written `TASKS.md` path and a one-line summary (e.g., "5 tasks, DAG depth 2, touches 4 files") to the user with a prompt like:

> "Wrote `.planning/{session_id}/TASKS.md`. Review and let me know — approve to execute, or tell me what to revise. Execution will dispatch subagents to make code changes."

Three branches (full contract: `../../harness-contracts/payload-contract.md` § "User review gates"). This is the last gate before code changes hit disk, so the prompt explicitly flags that.

- **approve** → main thread runs **parallel-task-executor** as a skill (main context) with `session_id={id}` — the executor reads `.planning/{session_id}/TASKS.md` from disk directly.
- **revise** → main thread deletes `.planning/{session_id}/TASKS.md` and re-dispatches **task-writer** with the original prompt plus a `Revision note from user: {note}` line. Step 1 detects the line and anchors on the note.
- **abort** → main thread updates `STATE.md` `Last activity` and stops.

On `## Status: error` → flow terminates immediately (no Gate 2). Main thread reports the reason and stops.

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
- **Wide-reach refactor with only `## Request`**: spend Step 2 budget on Glob to enumerate call sites, not Read on each. One task with 8 paths is fine if the refactor is uniform.
- **One PRD criterion maps to three tasks**: split into per-task sub-claims, each citing the same PRD section.

## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill = `TASKS.md` row — create only; `brainstorming.md`, `PRD.md`, `TRD.md` are upstream read-only; source code untouched). Note: parallel-task-executor will later append `[Result]` blocks to this file; do not pre-allocate them.
- Do not invoke other agents or skills. Do not dispatch the executor — the 'Required next skill' section above describes how the main thread does it.
- Do not modify source code, even if you spot bugs. Note them in Notes if load-bearing.
- Tool budget: **~10 Read/Grep/Glob calls when `## A1.6 findings` has content or TRD Affected surfaces is present** (verify-first), **~20 when neither is present** (full mode). Task-writer's job is to confirm files exist (Glob) and locate decomposition seams — it does not redo TRD's design work or brainstorming's main-thread peek. If you need more than the applicable cap, halt and emit `error` with a `## Reason`.
