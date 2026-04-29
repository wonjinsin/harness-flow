# Writer handoff contract

Single source of truth for the writer family (`prd-writer`, `trd-writer`, `task-writer`). Replaces the per-skill `references/contract.md` files that previously duplicated these rules. Each writer's `SKILL.md` references this file for what to read, what to write, terminal-message shape, error taxonomy, and shared anti-patterns; the writer keeps only its own concrete artifact example inline.

## Isolated context

Every writer runs inside its own subagent context. **The main conversation history is NOT available** — the input is only the dispatch prompt and any upstream files it cites. The split exists so the writer can spend context freely on code reading without polluting the main thread; it also means the writer cannot recover from a thin dispatch prompt by recalling earlier turns. If the prompt is thin, investigate the upstream files and the codebase with Read/Grep/Glob; do not invent requirements, architecture, or file structure.

See `execution-modes.md` for the full execution-mode contract.

## What writers Read

Every writer's Step 1 is the same: Read `.planning/{session_id}/brainstorming.md` and treat all sections as authoritative.

`brainstorming.md` is the ground truth that used to live in dispatch payloads. Its sections map as follows:

- `## Request` — the user's verbatim turn. Read for tone and nuance the structured fields drop.
- `## A1.6 findings` — the verify-first exploration ground (files visited, key findings, code signals, open questions). **When the body is real content, treat as authoritative.** Step 2 becomes verify-first: confirm the findings still hold, then expand only into surfaces brainstorming did not visit. Do not re-explore territory already covered.
  - When the body is `- (skipped — no resolvable target)`, switch to full-mode exploration.
- `## Brainstorming output` — `intent`, `target`, `scope`, `constraints`, `acceptance`. These drive the spec.
- `## Recommendation` — `route`, `estimated files`, `user approved`. Determines whether a PRD/TRD upstream exists on disk.

Additional files to Read per writer:

- **prd-writer** — only `brainstorming.md`.
- **trd-writer** — `brainstorming.md`, plus `.planning/{session_id}/PRD.md` when the route is `prd-trd`. For `trd-only`, no PRD exists.
- **task-writer** — `brainstorming.md`, plus `.planning/{session_id}/PRD.md` (if exists) and `.planning/{session_id}/TRD.md` (if exists). Always check existence on disk; do not rely on the dispatch prompt's prose hints.

The dispatch prompt may also include a `Revision note from user: {note}` line (only present when the main thread re-dispatched after a Gate 2 revise). When present, prioritise addressing the revision note over re-deriving the doc from scratch — the previous version was close, just wrong on this axis.

If a file declared by the route is unreadable or missing when expected, halt with `error` and `## Reason: <doc> declared by route but <path> not found`. Do not guess.

## What writers Write

Each writer creates exactly one file at a deterministic path:

- `prd-writer` → `.planning/{session_id}/PRD.md`
- `trd-writer` → `.planning/{session_id}/TRD.md`
- `task-writer` → `.planning/{session_id}/TASKS.md`

The output path is deterministic from `session_id`; the main thread already knows it. **Never overwrite.** If the target file already exists when the writer starts, halt with `error`. Regeneration is the main thread's call: it deletes the old file first, then re-dispatches.

The artifact's body shape is documented in each writer's `SKILL.md` (sections, fields, examples). Anti-patterns common to all three writers live below.

## Terminal message

After writing the artifact (or detecting an unrecoverable problem), the writer ends its turn with a short markdown block. This is the only thing the main thread reads from the conversation; the planning content lives in the file.

**done** — file written:

```markdown
## Status
done

## Path
.planning/{session_id}/{ARTIFACT}.md
```

**error** — input defect, file conflict, missing upstream, or unrecoverable exploration gap:

```markdown
## Status
error

## Reason
{short cause}
```

The terminal message carries no additional fields. The next skill receives only a minimal dispatch prompt (session id and paths to Read); it does not consume anything from the writer's terminal message besides the status itself. `## Path` is informational for the user and Gate 2 readability.

## Error taxonomy — when to emit `error` vs `done`

Emit `## Status: error` when:

- A required upstream file declared by the route is missing or unreadable (e.g., `prd-trd` route but `PRD.md` absent when trd-writer runs).
- The target output file already exists.
- Step 2 exploration exhausts its tool budget without resolving the change surface.
- The task DAG (task-writer) contains a cycle.
- For task-writer only: no PRD, no TRD, no actionable `## Brainstorming output`, AND `## Request` has no actionable verb.
- `brainstorming.md` itself is missing or malformed (no `## Recommendation` block, route not in the allowed set, etc.).

Emit `## Status: done` (with Open questions noted in the file body) when:

- Drafting completed and >2 Open questions remain. Do not self-escalate; the next writer or evaluator surfaces blocking questions.
- The PRD/TRD is thin but readable. Treat it as authoritative and record gaps in your own Open questions.

## Solo-dev anti-patterns

Apply across all three writers:

- **No person-hours, sprints, or story points.** Solo project; estimates are noise.
- **No library-choice theater.** No pro/con tables for well-known picks. State the choice and a one-line rationale, or omit.
- **No rephrasing user vocabulary.** If the user said "login page", do not rewrite as "authentication surface". If PRD says "2FA", do not rewrite as "second-factor". Downstream (task-writer, evaluator) greps on this vocabulary; paraphrasing breaks traceability between PRD, TRD, TASKS, and validation.
- **No "nice to have" lists.** If it's not in Goal/Acceptance, it's a Non-goal.
- **Mirror the user's language in body content.** Korean request → Korean body. Headers, field names, code identifiers, file paths stay English for machine parseability.
