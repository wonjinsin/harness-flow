# Harness payload contract

Single source of truth for what flows between skills. Each skill emits its own JSON status (defined in that skill's `SKILL.md`); the **main thread** constructs the downstream skill's payload by combining the emission with session-wide context fields. This file documents every edge so all three sources of truth (skill emissions, "Required next skill" sections, main-thread dispatch logic) can be checked against one place.

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

Non-pass terminals: `router → casual` (no JSON, inline reply), `brainstorming → pivot|exit-casual`, `*-writer → error`, `executor → blocked|failed|error`, `evaluator → escalate|error`. Each ends the session — main thread reports to the user and stops.

## Session-wide fields

The main thread carries these forward across the chain. They are not part of any single skill's emission.

| Field | Source | Lifetime |
|---|---|---|
| `session_id` | router (Step 3) | Whole session |
| `request` | user's original turn, captured at router | Whole session |
| `brainstorming_output` | brainstorming emission `brainstorming_output` | From brainstorming onward |
| `brainstorming_outcome` | brainstorming emission `outcome` (`prd-trd`/`prd-only`/`trd-only`/`tasks-only`) | From brainstorming onward |
| `exploration_findings` | brainstorming emission `exploration_findings` | From brainstorming onward |

`exploration_findings` shape — emitted by brainstorming after its scoped codebase peek, then carried forward into every writer's payload so writers can verify rather than re-explore:

```json
{
  "files_visited": ["src/auth/session.ts:42", "src/auth/middleware.ts"],
  "key_findings": [
    "issueSession() in src/auth/session.ts currently issues without TOTP check",
    "middleware reads Bearer token only — no MFA hook"
  ],
  "code_signals": ["auth/", "schema:session"],
  "open_questions": ["Should refresh tokens be revoked on TOTP enable?"]
}
```

May be `null` when brainstorming was skipped (router routed `plan` directly with no Q&A) or when the request had no resolvable target. Writers fall back to their own (smaller) Step 2 budget when null.

## Per-edge payloads

Each entry: **emission** (what the upstream skill writes) → **payload** (what the main thread sends downstream). Renames and additions are called out explicitly so drift is detectable.

### router → brainstorming

- Trigger: emission `outcome ∈ {clarify, plan, resume}`. (`casual` ends inline; no downstream.)
- Emission: `{ outcome, session_id }`.
- Payload: `{ session_id, request, route, resume? }`.
  - `route` = emission `outcome`. Renamed because `brainstorming` uses `route` semantically (the requested intake mode), reserving `outcome` for its own emission.
  - `resume` = `true` iff emission `outcome == "resume"`; absent otherwise.
  - `request` = the user's verbatim turn (session-wide).

### brainstorming → prd-writer

- Trigger: emission `outcome ∈ {prd-trd, prd-only}` AND Gate 2 user approval (see "User review gates" below).
- Emission: `{ outcome, session_id, request, brainstorming_output, exploration_findings }`.
- Payload: `{ session_id, request, brainstorming_outcome, brainstorming_output, exploration_findings }`.
  - `brainstorming_outcome` = emission `outcome`. Renamed so prd-writer's own `outcome` field can carry its terminal status without collision.

### brainstorming → trd-writer

- Trigger: emission `outcome == "trd-only"` AND Gate 2 user approval.
- Emission: same shape as above.
- Payload: `{ session_id, request, brainstorming_outcome: "trd-only", brainstorming_output, exploration_findings, prd_path: null }`.

### brainstorming → task-writer

- Trigger: emission `outcome == "tasks-only"` AND Gate 2 user approval.
- Emission: same shape as above.
- Payload: `{ session_id, request, brainstorming_output, exploration_findings, prd_path: null, trd_path: null }`.

### prd-writer → trd-writer

- Trigger: prd-writer emission `outcome: "done"` AND `brainstorming_outcome: "prd-trd"` AND Gate 2 user approval.
- Emission: `{ outcome, session_id, brainstorming_outcome, path }`.
- Payload: `{ session_id, request, prd_path, brainstorming_outcome: "prd-trd", brainstorming_output, exploration_findings }`.
  - `prd_path` = emission `path` (rename: the writer reports its written file; downstream consumes it as the upstream PRD).

### prd-writer → task-writer

- Trigger: prd-writer emission `outcome: "done"` AND `brainstorming_outcome: "prd-only"` AND Gate 2 user approval.
- Emission: same as above.
- Payload: `{ session_id, request, prd_path, trd_path: null, brainstorming_output, exploration_findings }`.

### trd-writer → task-writer

- Trigger: trd-writer emission `outcome: "done"` AND Gate 2 user approval.
- Emission: `{ outcome, session_id, path }`.
- Payload: `{ session_id, request, prd_path, trd_path, brainstorming_output, exploration_findings }`.
  - `trd_path` = emission `path`. `prd_path` is whatever the trd-writer received (may be `null` for trd-only routes).

### task-writer → parallel-task-executor

- Trigger: task-writer emission `outcome: "done"` AND Gate 2 user approval.
- Emission: `{ outcome, session_id, path }`.
- Payload: `{ session_id }`.
  - The executor reads `.planning/{session_id}/TASKS.md` from disk; it does not need `path` in the payload.

### parallel-task-executor → evaluator

- Trigger: executor emission `outcome: "done"`. (`blocked`/`failed`/`error` terminate.)
- Emission: `{ outcome, session_id }`.
- Payload: `{ session_id, tasks_path, rules_dir?, diff_command? }`.
  - `tasks_path` = `.planning/{session_id}/TASKS.md` (deterministic; main thread constructs).
  - `rules_dir`, `diff_command` come from main-thread configuration; both are optional.

### evaluator → doc-updater

- Trigger: evaluator emission `outcome: "pass"`. (`escalate`/`error` terminate.)
- Emission: `{ outcome, session_id }` (plus optional `reason` on non-pass).
- Payload: `{ session_id, tasks_path, diff_command? }`.

### doc-updater (terminal)

- Emission: `{ outcome, session_id }` (plus `reason` on `error`).
- No downstream — the harness reports to the user and stops.

## User review gates

Two explicit user-facing gates exist in the chain. Both are owned by the **main thread** — no skill writes them; the main thread holds the user reply between an upstream emission and the downstream dispatch.

- **Gate 1 — route approval** (after `brainstorming` Phase B5). The user accepts / overrides the recommended route and (optionally) the file-count estimate. Detailed flow lives in `skills/brainstorming/SKILL.md` Phase B; brainstorming itself drives the message and waits for the reply, then emits the route payload only after acceptance.
- **Gate 2 — spec review** (after each writer emits `outcome: "done"`). The main thread surfaces the written file path and any Open questions to the user, then waits for one of:
  - **approve** — main thread dispatches the next skill per the upstream's `## Required next skill` section.
  - **revise** — main thread deletes the written file (`.planning/{session_id}/<ARTIFACT>.md`) and re-dispatches the same writer with a `revision_note` field appended to the payload (`{...original_payload, revision_note: "<user's correction>"}`). Writers MUST honour `revision_note` when present.
  - **abort** — main thread updates `STATE.md` `Last activity` with the abort reason and stops; no further skill is dispatched.

Gate 2 fires after `prd-writer`, `trd-writer`, and `task-writer` `done` emissions. It does not fire on `error` (those terminate immediately) or after `parallel-task-executor` (executor results go to evaluator, not user — the user already approved the plan at the TASKS gate).

Each writer's `## Required next skill` section names its specific Gate 2 prompt and the next skill to dispatch on approval.

## Conventions

- **Skill `outcome` is universal.** Every skill's emission has an `outcome` field naming its terminal state. The next skill receives any *payload* the main thread builds; it never reads the upstream's `outcome` directly under that name.
- **Path → typed name on rename.** When a writer emits `path`, the downstream payload renames it to `prd_path` / `trd_path` so receivers can tell which document they are getting at field-name level (the receiver may have multiple upstream docs).
- **`null` is preferred over absent fields** for documents that are conceptually expected but not produced this session (e.g., `prd_path: null` on the trd-only route). This lets receivers branch on `payload.prd_path === null` rather than `'prd_path' in payload`.

## See also

- `execution-modes.md` — Subagent vs Main context contract.
- `output-contract.md` — Writer-family payload/output/error shape.
- Each skill's `## Required next skill` section — the per-skill view of the same edges.
