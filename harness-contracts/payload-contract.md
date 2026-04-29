# Harness payload contract

Single source of truth for what flows between skills. The harness uses a two-tier model:

- **Planning artifacts** flow through **files** in `.planning/{session_id}/`. Downstream writers Read upstream files via the Read tool; dispatch prompts shrink to bare-minimum context (session_id, request, paths to read).
- **Execution status** flows through **markdown in the conversation**. Each skill's terminal message uses standard section headers (`## Status`, `## Path`, `## Reason`, …) so the main thread can decide what to dispatch next without parsing prose.

This file documents every edge so all three sources of truth (skill terminal messages, "Required next skill" sections, main-thread dispatch logic) can be checked against one place.

## Node graph

```
                      router
                        │
                        ▼ (clarify | plan | resume)
                   brainstorming
                        │
       ┌────────────────┼─────────────────┬──────────────┐
       ▼                ▼                 ▼              ▼
   (prd-trd)        (prd-only)        (trd-only)     (tasks-only)
       │                │                 │              │
       ▼                ▼                 ▼              ▼
   prd-writer       prd-writer        trd-writer     task-writer
       │                │                 │              │
       ▼                ▼                 │              │
   trd-writer       task-writer ──────────┤              │
       │                │                 ▼              │
       └───────┬────────┴───────────► task-writer ◄──────┘
               ▼
       parallel-task-executor
               │
               ▼ (done)
           evaluator
               │
               ▼ (pass)
          doc-updater
               │
               ▼ (terminal)
              END
```

Non-pass terminals: `router → casual` (plain prose, no markdown headers), `brainstorming → pivot|exit-casual`, `*-writer → error`, `executor → blocked|failed|error`, `evaluator → escalate|error`. Each ends the session — main thread reports to the user and stops.

## Planning artifacts

The handoff between skills is anchored by files. Each downstream writer reads upstream files directly; the dispatch prompt only names the session and which files to consult.

| File | Owner | Read by |
|---|---|---|
| `.planning/{session_id}/brainstorming.md` | `brainstorming` (Phase B7, after Gate 1 approval) | `prd-writer`, `trd-writer`, `task-writer` |
| `.planning/{session_id}/PRD.md` | `prd-writer` | `trd-writer`, `task-writer` |
| `.planning/{session_id}/TRD.md` | `trd-writer` | `task-writer` |
| `.planning/{session_id}/TASKS.md` | `task-writer` | `parallel-task-executor`, `evaluator`, `doc-updater` |

`brainstorming.md` carries forward what used to live in dispatch payloads as session-wide fields. Its mandatory sections — `## Request`, `## A1.6 findings`, `## Brainstorming output`, `## Recommendation` — give writers the verbatim request, the verify-first exploration ground, the intent/target/scope/constraints/acceptance, and the route. Writers treat every section as authoritative.

If brainstorming's scoped codebase peek did not run (router routed `plan` directly with no resolvable target), the `## A1.6 findings` body is `- (skipped — no resolvable target)`. Writers see the explicit "skipped" marker and switch to full-mode exploration.

## Per-edge handoff

Each entry: **trigger** (what the upstream skill's terminal message looks like) → **dispatch prompt** (what the main thread sends downstream).

### router → brainstorming

- Trigger: `router` ends with `## Status: clarify | plan | resume`. (`casual` ends inline; no downstream.)
- Dispatch:
  ```
  Skill(brainstorming, args: "session_id={id} request={text} route={status} resume={true|false}")
  ```
- `route` carries the router's terminal status name. `resume=true` only when status is `resume`.
- brainstorming runs in main context (Skill, not Task).

### brainstorming → prd-writer

- Trigger: `.planning/{session_id}/brainstorming.md` exists with `## Recommendation` route `prd-trd` or `prd-only`. Gate 1 approval is already absorbed inside brainstorming Phase B6 before B7 writes the file.
- Dispatch:
  ```
  Task(prd-writer, prompt: "Draft PRD for session {id}. Read .planning/{id}/brainstorming.md as authoritative ground.")
  ```

### brainstorming → trd-writer (trd-only route)

- Trigger: `## Recommendation` route is `trd-only`.
- Dispatch:
  ```
  Task(trd-writer, prompt: "Draft TRD for session {id}. Read .planning/{id}/brainstorming.md. No PRD will exist for this route.")
  ```

### brainstorming → task-writer (tasks-only route)

- Trigger: `## Recommendation` route is `tasks-only`.
- Dispatch:
  ```
  Task(task-writer, prompt: "Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md. No PRD or TRD will exist for this route.")
  ```

### prd-writer → trd-writer (prd-trd route, after Gate 2 approve)

- Trigger: prd-writer ends with `## Status: done` and brainstorming.md route is `prd-trd`.
- Dispatch:
  ```
  Task(trd-writer, prompt: "Draft TRD for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md.")
  ```

### prd-writer → task-writer (prd-only route, after Gate 2 approve)

- Trigger: prd-writer ends with `## Status: done` and brainstorming.md route is `prd-only`.
- Dispatch:
  ```
  Task(task-writer, prompt: "Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md. No TRD for this route.")
  ```

### trd-writer → task-writer (after Gate 2 approve)

- Trigger: trd-writer ends with `## Status: done`.
- Dispatch:
  ```
  Task(task-writer, prompt: "Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md, .planning/{id}/PRD.md (if exists), and .planning/{id}/TRD.md.")
  ```

Writers should always check for `PRD.md` existence on disk rather than rely on the dispatch prompt. The `## Recommendation` route in `brainstorming.md` disambiguates.

### task-writer → parallel-task-executor (after Gate 2 approve)

- Trigger: task-writer ends with `## Status: done`.
- Dispatch:
  ```
  Skill(parallel-task-executor, args: "session_id={id}")
  ```
- parallel-task-executor runs in main context (Skill, not Task). It reads `.planning/{session_id}/TASKS.md` from disk.

### parallel-task-executor → evaluator

- Trigger: executor ends with `## Status: done`. (`blocked` / `failed` / `error` terminate the session.)
- Dispatch:
  ```
  Task(evaluator, prompt: "Evaluate session {id}. Read .planning/{id}/TASKS.md and the diff.")
  ```

### evaluator → doc-updater

- Trigger: evaluator ends with `## Status: pass`. (`escalate` / `error` terminate.)
- Dispatch:
  ```
  Task(doc-updater, prompt: "Reflect session {id} into docs. Read .planning/{id}/TASKS.md.")
  ```

### doc-updater (terminal)

- No downstream — the harness reports to the user and stops.

## User review gates

Two explicit user-facing gates exist in the chain. Both are owned by the **main thread** — no skill writes them; the main thread holds the user reply between an upstream terminal message and the downstream dispatch.

- **Gate 1 — route approval** (inside `brainstorming` Phase B6, before B7). The user accepts / overrides the recommended route and (optionally) the file-count estimate. Detailed flow lives in `skills/brainstorming/SKILL.md` Phase B; brainstorming itself drives the message and waits for the reply, then writes `brainstorming.md` only after acceptance.
- **Gate 2 — spec review** (after each writer ends with `## Status: done`). The main thread reads the writer's `## Path`, surfaces it (and any Open questions in the file body) to the user, then waits for one of:
  - **approve** — main thread dispatches the next skill per the edge rules above.
  - **revise** — main thread deletes the written file (`.planning/{session_id}/<ARTIFACT>.md`) and re-dispatches the same writer with an extra `Revision note from user: {note}` line in the dispatch prompt:
    ```
    Task(prd-writer, prompt: "Draft PRD for session {id}. Read .planning/{id}/brainstorming.md. Revision note from user: {note}")
    ```
    Writers MUST honour the revision note when present.
  - **abort** — main thread updates `STATE.md` `Last activity` with the abort reason and stops; no further skill is dispatched.

Gate 2 fires after `prd-writer`, `trd-writer`, and `task-writer` `done` terminals. It does not fire on `error` (those terminate immediately) or after `parallel-task-executor` (executor results go to evaluator, not user — the user already approved the plan at the TASKS gate).

Each writer's `## Required next skill` section names its specific Gate 2 prompt and the next skill to dispatch on approval.

## Conventions

- **Standard markdown sections.** Every skill's terminal message uses these section headers consistently:
  - `## Status` — required. Single line value drawn from the skill's terminal vocabulary (`done`, `error`, `clarify`, `plan`, `resume`, `pivot`, `exit-casual`, `pass`, `escalate`, `blocked`, `failed`).
  - `## Path` — when a file was written (writers, brainstorming).
  - `## Reason` — when status is `error`, `escalate`, `blocked`, `failed`, `pivot`, `exit-casual`, etc.
  - `## Session` — only the first message that introduces a `session_id` (router).
  - Skill-specific sections may be added (e.g., parallel-task-executor's `## Tasks` block, doc-updater's `## Updated` block) — defined in each `SKILL.md`.
- **Files own the planning content; messages own the status.** Writers' actual output is the file at `## Path`. The terminal message is purely a status signal for the main thread; it never duplicates artifact content.
- **Dispatch prompts stay minimal.** Pass `session_id` and the paths to read; do not inline content the downstream skill can Read from disk. This keeps the main-thread context lean and makes `brainstorming.md` the single rehydration point for every writer.
- **`null` is implicit when a file is absent.** A writer that expects a PRD checks `.planning/{session_id}/PRD.md` directly; absence means the route did not produce one. Dispatch prompts call out the absence in prose (e.g., "No PRD will exist for this route") for human readers.

## See also

- `execution-modes.md` — Subagent vs Main context contract.
- `output-contract.md` — Writer handoff contract (what writers Read, Write, and emit as terminal message).
- `file-ownership.md` — Per-file create/update/read rights including `brainstorming.md`.
- Each skill's `## Required next skill` section — the per-skill view of the same edges.
