---
name: trd-writer
description: Use when a planning session needs a TRD drafted in an isolated subagent context, with or without an upstream PRD.
---

# TRD Writer

## Purpose

Produce **`TRD.md`** — the technical design that bridges PRD-level outcomes (what) and TASKS-level steps (how). One TRD per session, one shape regardless of whether an upstream PRD exists. Solo-developer lens: enough detail to make the implementation trajectory obvious, nothing more. A reader should finish in under 3 minutes.

See `../../harness-contracts/output-contract.md` for the payload schema, output JSON, error taxonomy, and shared anti-patterns.

This skill receives `session_id`, `request`, optional `prd_path` (set when PRD exists upstream, else `null`), `brainstorming_outcome` (`"prd-trd"` or `"trd-only"` — required), and optional `brainstorming_output`.

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## Why this exists

TRD answers "what will actually change in code and why this shape?" — distinct from PRD's outcome-framed requirements and TASKS's step-by-step instructions. The only branch is §1 (Context): with PRD it cites the upstream goal; without PRD it states the technical motivation directly. Body shape is identical, so downstream doesn't care which upstream fed the TRD.

## Procedure

### Step 1 — Read the payload (and PRD if present)

Re-read `request` in full. If `prd_path` is set, read the PRD end-to-end and treat its Goal, Acceptance criteria, and Constraints as hard inputs — the TRD must satisfy them, not re-derive them. Extract target and visible constraints. Note what is missing — anything you cannot answer from payload + PRD becomes Step 2 exploration or Open questions.

If `prd_path` is set and the file is missing/unreadable, emit the `error` outcome per `../../harness-contracts/output-contract.md`.

### Step 2 — Scoped codebase exploration (budget-capped)

Tool budget: **~25 Read/Grep/Glob calls**. TRD decisions need actual function signatures, existing abstractions, and data shapes — deeper than a scope-locating pass — which is why the budget is larger. Stop as soon as the design question is answered.

Target-directed: locate the primary file/module using, in order, `brainstorming_output.target` (if present), the PRD's subject (if `prd_path` set), or the first noun-phrase in `request`. Then decide width:

- `scope_hint: multi-system` → walk outward to direct callers, sibling modules, and any shared abstractions the change touches.
- Otherwise → stay within the target file/module and its immediate dependencies.

Stop when you can answer: (1) what concretely changes in code (file-level, with function/class names visible)? (2) what existing interfaces does it consume or expose? (3) what data flows through, in what shape? (4) what else in the codebase depends on the surfaces you're touching?

If genuinely design-unknowable from code (e.g., new external integration with no local analog), note it in Open questions and pick a defensible default marked `(assumed)`.

### Step 3 — Draft the TRD using the template

See `references/template.md` for the exact structure and `references/example.md` for a worked example with PRD present. Fill each section — placeholder ranges are sanity checks.

**Writing rules**:

- Mirror the user's language in body content; headers stay English.
- Use concrete nouns from the PRD (if present) or user request — paraphrasing breaks downstream traceability.
- Approach describes **the shape of the solution**, not a sequence of implementation steps. Step sequencing is task-writer's job.
- Interfaces & contracts are concrete: function signatures, request/response shapes, event names. Omit only if truly nothing changes.
- Risks are specific: "rate limiter keyed by IP misses shared-NAT users" beats "may have security issues".
- Tag assumptions in Open questions with `(assumed)`.

TRD-specific anti-patterns (in addition to `../../harness-contracts/output-contract.md`): no step-by-step task lists (that's TASKS); no re-stating PRD acceptance criteria verbatim — reference them by section.

### Step 4 — Write the file

Create `.planning/{session_id}/` if needed. Write `TRD.md`. If the file already exists, halt and emit `error` per `../../harness-contracts/output-contract.md`.

### Step 5 — Emit

Emit the final JSON as your entire final message. TRD-writer's `done` example (shape defined in `../../harness-contracts/output-contract.md`):

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "path": ".planning/2026-04-19-.../TRD.md" }
```

## Required next skill

When this skill emits `outcome: "done"`:

- **REQUIRED SUB-SKILL:** Use harness-flow:task-writer
  Payload: `{ session_id, request, prd_path, trd_path, brainstorming_output }`

On `outcome: "error"`: flow terminates. Report to the user and stop.

## Edge cases

- **PRD exists but is thin/incomplete**: still authoritative; gaps become Open questions in the TRD. Do not "fix" the PRD from inside this skill — main-thread decision.
- **Request references files that don't exist**: investigate with Glob. If truly absent, add an Open question rather than inventing structure.
- **Exploration surfaces `auth/` / `security/` / `migrations/` concerns**: §7 of the template needs an entry no matter how small the change feels — elision is the silent failure mode (entry can be "accepted: behavior-preserving").
- **No PRD and very thin request**: if `prd_path` null, `request` one sentence, `brainstorming_output` null, upstream likely mis-routed. Best-effort TRD; flag thinness as Open question.
- **>2 open questions after drafting**: note them and emit `done`. task-writer surfaces blocking questions; do not self-escalate.

## Boundaries

- Writes only to `.planning/{session_id}/TRD.md`. Do not touch PRD.md, ROADMAP.md, or STATE.md — PRD is upstream read-only.
- Do not invoke other agents or skills. Do not dispatch task-writer — the 'Required next skill' section above dispatches downstream.
- Do not modify source code, even if you spot bugs. Note them in Open questions if load-bearing.
- Tool budget: ~25 Read/Grep/Glob calls. If you need more, halt and emit `error` with a `reason`.
