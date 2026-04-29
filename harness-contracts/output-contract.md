# Writer output contract

Single source of truth for the writer family (`prd-writer`, `trd-writer`, `task-writer`). Replaces the per-skill `references/contract.md` files that previously duplicated these rules. Each writer's `SKILL.md` references this file for payload, output shape, error taxonomy, and shared anti-patterns; the writer keeps only its own concrete output example inline.

## Isolated context

Every writer runs inside its own subagent context. **The main conversation history is NOT available** — the input is only the payload (and any upstream files it cites). The split exists so the writer can spend context freely on code reading without polluting the main thread; it also means the writer cannot recover from a thin payload by recalling earlier turns. If the payload is thin, investigate the codebase with Read/Grep/Glob; do not invent requirements, architecture, or file structure.

See `execution-modes.md` for the full execution-mode contract.

## Input payload

Common fields, all authoritative:

- `session_id`: `"YYYY-MM-DD-{slug}"` — determines the output folder.
- `request`: the user's original turn, verbatim. Read for tone and nuance the structured fields drop.
- `brainstorming_outcome` *(prd-writer, trd-writer)*: the route brainstorming emitted (`"prd-trd"`, `"prd-only"`, `"trd-only"`). Required where listed; absent-or-other-value is `error`.
- `brainstorming_output` *(optional)*: `{intent, target, scope_hint, constraints[], acceptance}` — may be absent when router routed `plan` directly.
- `exploration_findings` *(optional)*: `{files_visited[], key_findings[], code_signals[], open_questions[]}` produced by brainstorming's scoped codebase peek. **When present, treat as authoritative ground.** Step 2 becomes verify-first: confirm the findings still hold, then expand only into surfaces brainstorming did not visit. Do not re-explore territory already covered. Schema in `payload-contract.md` § Session-wide fields.
- `prd_path` *(trd-writer, task-writer)*: `".planning/{session_id}/PRD.md"` if PRD exists upstream, else `null`.
- `trd_path` *(task-writer)*: `".planning/{session_id}/TRD.md"` if TRD exists upstream, else `null`.
- `revision_note` *(optional)*: present only when the main thread re-dispatched this writer after a Gate 2 revise. A short string carrying the user's correction. When present, prioritise addressing it over re-deriving the doc from scratch — the previous version was close, just wrong on this axis.

If a `*_path` is set but the file is unreadable or missing, halt with `error` and `reason: "<doc> declared in payload but <path> not found"`. Do not guess.

## Output JSON

The final message is always one JSON object — no prose alongside. The main thread treats it as a machine-readable status line.

**done** — file written. Shape (path varies per writer; each `SKILL.md` carries the concrete example):

```json
{ "outcome": "done", "session_id": "<id>", "path": ".planning/<id>/<ARTIFACT>.md" }
```

`prd-writer` additionally echoes `brainstorming_outcome` in this object so the main thread can pick the next skill without re-reading the route.

**error** — payload defect, file conflict, missing upstream, or unrecoverable exploration gap:

```json
{ "outcome": "error", "session_id": "<id>", "reason": "<short cause>" }
```

Output is consumed by the main thread to construct the next skill's payload.

The output path is deterministic from `session_id`; the main thread reconstructs it. If the target file already exists, emit `error` — **never overwrite**. Regeneration is the main thread's call: it deletes the old file first, then re-dispatches.

## Error taxonomy — when to emit `error` vs `done`

Emit `error` when:

- A required payload field is absent or has an unexpected value (e.g., `brainstorming_outcome` not in the allowed set).
- A declared upstream file (`prd_path`, `trd_path`) is set but missing or unreadable.
- The target output file already exists.
- Step 2 exploration exhausts its tool budget without resolving the change surface.
- The task DAG (task-writer) contains a cycle.
- For task-writer only: `prd_path`, `trd_path`, and `brainstorming_output` are all null AND `request` has no actionable verb.

Emit `done` (with Open questions noted in the file body) when:

- Drafting completed and >2 Open questions remain. Do not self-escalate; the next writer or evaluator surfaces blocking questions.
- The PRD/TRD is thin but readable. Treat it as authoritative and record gaps in your own Open questions.

## Solo-dev anti-patterns

Apply across all three writers:

- **No person-hours, sprints, or story points.** Solo project; estimates are noise.
- **No library-choice theater.** No pro/con tables for well-known picks. State the choice and a one-line rationale, or omit.
- **No rephrasing user vocabulary.** If the user said "login page", do not rewrite as "authentication surface". If PRD says "2FA", do not rewrite as "second-factor". Downstream (task-writer, evaluator) greps on this vocabulary; paraphrasing breaks traceability between PRD, TRD, TASKS, and validation.
- **No "nice to have" lists.** If it's not in Goal/Acceptance, it's a Non-goal.
- **Mirror the user's language in body content.** Korean request → Korean body. Headers, field names, code identifiers, file paths stay English for machine parseability.
