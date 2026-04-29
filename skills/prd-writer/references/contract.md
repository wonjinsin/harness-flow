# Writer contract — payload, output, errors, anti-patterns

Shared by `prd-writer`, `trd-writer`, `task-writer`. Every writer is loaded inside its own subagent context.

## Isolated context

You run inside the writer agent's isolated context. **The main conversation history is NOT available** — your input is only the payload (and any upstream files it cites). The split exists so the writer can spend context freely on code reading without polluting the main thread; it also means you cannot recover from a thin payload by recalling earlier turns. If the payload is thin, investigate the codebase with Read/Grep/Glob; do not invent requirements, architecture, or file structure.

## Input payload

Common fields, all authoritative:

- `session_id`: `"YYYY-MM-DD-{slug}"` — determines the output folder.
- `request`: the user's original turn, verbatim. Read for tone and nuance the structured fields drop.
- `brainstorming_outcome` *(prd-writer, trd-writer)*: the route brainstorming emitted (`"prd-trd"`, `"prd-only"`, `"trd-only"`). Required where listed; absent-or-other-value is `error`.
- `brainstorming_output` *(optional)*: `{intent, target, scope_hint, constraints[], acceptance}` — may be absent when router routed `plan` directly.
- `prd_path` *(trd-writer, task-writer)*: `".planning/{session_id}/PRD.md"` if PRD exists upstream, else `null`.
- `trd_path` *(task-writer)*: `".planning/{session_id}/TRD.md"` if TRD exists upstream, else `null`.

If a `*_path` is set but the file is unreadable or missing, halt with `error` and `reason: "<doc> declared in payload but <path> not found"`. Do not guess.

## Output JSON

The final message is always one JSON object — no prose alongside. The main thread treats it as a machine-readable status line.

**done** — file written:

```json
{ "node_id": "prd-writer", "outcome": "done", "session_id": "2026-04-19-...", "brainstorming_outcome": "prd-trd", "path": ".planning/2026-04-19-.../PRD.md", "next": "<resolved-by-step-5-or-6>" }
```

**error** — payload defect, file conflict, missing upstream, or unrecoverable exploration gap:

```json
{ "node_id": "prd-writer", "outcome": "error", "session_id": "2026-04-19-...", "reason": "<short cause>", "next": null }
```

`node_id` is required: the Stop hook dispatcher (`hooks/dispatch-next.js`) reads this field to identify which node just emitted, then computes the next node from `harness-flow.yaml`. `brainstorming_outcome` is echoed back so the dispatcher can evaluate downstream `when:` expressions without re-reading the original payload.

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
