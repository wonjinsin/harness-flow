---
name: trd-writer
description: Run after prd-writer (prd-trd route) or directly after brainstorming (trd-only route). Drafts `.planning/{session_id}/TRD.md` — Affected surfaces with concrete file/function names, Interfaces & contracts, Data model, Risks. Code-shape level: distinct from PRD's outcome framing and TASKS's step-by-step instructions. Consumes brainstorming's `exploration_findings` (and PRD when present) as authoritative ground; only verifies and digs into interfaces within a ~10-call budget. One TRD per session; runs in an isolated subagent.
model: sonnet
---

# TRD Writer

## Purpose

Produce **`TRD.md`** — the technical design that bridges PRD-level outcomes (what) and TASKS-level steps (how). One TRD per session, one shape regardless of whether an upstream PRD exists. Solo-developer lens: enough detail to make the implementation trajectory obvious, nothing more. A reader should finish in under 3 minutes.

See `../../harness-contracts/output-contract.md` for the payload schema, output JSON, error taxonomy, and shared anti-patterns.

This skill receives `session_id`, `request`, optional `prd_path` (set when PRD exists upstream, else `null`), `brainstorming_outcome` (`"prd-trd"` or `"trd-only"` — required), optional `brainstorming_output`, optional `exploration_findings` (brainstorming's codebase peek — when present, the authoritative starting point), and optional `revision_note` (only when re-dispatched after a Gate 2 revise — see Step 1).

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## Why this exists

TRD answers "what will actually change in code and why this shape?" — distinct from PRD's outcome-framed requirements and TASKS's step-by-step instructions. The only branch is §1 (Context): with PRD it cites the upstream goal; without PRD it states the technical motivation directly. Body shape is identical, so downstream doesn't care which upstream fed the TRD.

## Procedure

### Step 1 — Read the payload (and PRD if present)

Re-read `request` in full. If `prd_path` is set, read the PRD end-to-end and treat its Goal, Acceptance criteria, and Constraints as hard inputs — the TRD must satisfy them, not re-derive them.

If `revision_note` is present, this is a Gate 2 re-dispatch — the user reviewed the previous TRD and asked for a correction. **Anchor on the note**: which section does the correction touch (Affected surfaces, Interfaces, Data model, Risks)? Treat the rest of the doc as basically right; surgically address what the note flagged.

If `exploration_findings` is present, treat it as **authoritative ground**:

- `files_visited` and `key_findings` are the change surface — Step 2 starts from there, only verifying and going deeper into interfaces.
- `code_signals` informs Risks (auth/migration/schema concerns must surface in §7 Risks).
- `open_questions` flags things brainstorming could not resolve — promote relevant ones to TRD Open questions.

Extract target and visible constraints. Note what is missing from payload + PRD + findings — that's the candidate set for Step 2 verification or Open questions.

If `prd_path` is set and the file is missing/unreadable, emit the `error` outcome per `../../harness-contracts/output-contract.md`.

### Step 2 — Scoped codebase exploration (budget-capped, verify-first)

Tool budget: **~10 Read/Grep/Glob calls when `exploration_findings` is present, ~25 when absent**. The findings already encode brainstorming's main-thread peek — re-running it would waste tokens and risk inconsistent reads. The smaller cap when findings are present is enough because TRD's job is mostly to dig into interfaces brainstorming surfaced, not re-discover the change surface.

When findings present (verify-first mode):

- Confirm `files_visited` paths and the function/class names in `key_findings` still exist and match.
- Spend remaining budget reading the actual function signatures, request/response shapes, and shared abstractions referenced — these are the TRD's substance and brainstorming's peek typically did not record them in detail.
- Walk outward to direct callers / sibling modules ONLY for surfaces brainstorming did not visit.
- If a finding is wrong, record the correction in Open questions and pick a defensible default marked `(assumed)`.

When findings absent (full mode, ~25 calls): locate the primary file/module using, in order, `brainstorming_output.target` (if present), the PRD's subject (if `prd_path` set), or the first noun-phrase in `request`. Then decide width — `scope_hint: multi-system` → walk outward to direct callers, sibling modules, and any shared abstractions the change touches; otherwise stay within the target file/module and its immediate dependencies.

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

### Step 4 — Write the file

Create `.planning/{session_id}/` if needed. Write `TRD.md`. If the file already exists, halt and emit `error` per `../../harness-contracts/output-contract.md`.

### Step 5 — Emit

Emit the final JSON as your entire final message. TRD-writer's `done` example (shape defined in `../../harness-contracts/output-contract.md`):

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "path": ".planning/2026-04-19-.../TRD.md" }
```

## Required next skill

On `outcome: "done"`, the **main thread runs Gate 2** before dispatching anything: it surfaces the written `TRD.md` path (and any Open questions inside it) to the user with a prompt like:

> "Wrote `.planning/{session_id}/TRD.md`. Review and let me know — approve to continue, or tell me what to revise."

Three branches (full contract: `../../harness-contracts/payload-contract.md` § "User review gates"):

- **approve** → **REQUIRED SUB-SKILL:** Use harness-flow:task-writer
  Payload: `{ session_id, request, prd_path, trd_path, brainstorming_output, exploration_findings }` — `trd_path` is constructed from this skill's `path`. `prd_path` may be `null` on the trd-only route.
- **revise** → main thread deletes `.planning/{session_id}/TRD.md` and re-dispatches **trd-writer** with the original payload + `revision_note: "<user's correction>"`. Step 1 detects the field and anchors on the note.
- **abort** → main thread updates `STATE.md` `Last activity` and stops.

On `outcome: "error"` → flow terminates immediately (no Gate 2). Main thread reports the reason and stops.

## Anti-patterns

TRD-specific (additional to those in `../../harness-contracts/output-contract.md`):

- **No step-by-step task lists.** Sequencing is task-writer's job. TRD describes the shape of the change; the steps to get there belong in TASKS.
- **No re-stating PRD acceptance criteria verbatim.** Reference them by section (e.g., "see PRD §Acceptance criteria #2"). Duplicating invites drift, and the evaluator greps the original PRD vocabulary anyway.

## Edge cases

- **PRD exists but is thin/incomplete**: still authoritative; gaps become Open questions in the TRD. Do not "fix" the PRD from inside this skill — main-thread decision.
- **Request references files that don't exist**: investigate with Glob. If truly absent, add an Open question rather than inventing structure.
- **Exploration surfaces `auth/` / `security/` / `migrations/` concerns**: §7 of the template needs an entry no matter how small the change feels — elision is the silent failure mode (entry can be "accepted: behavior-preserving").
- **No PRD and very thin request**: if `prd_path` null, `request` one sentence, `brainstorming_output` null, upstream likely mis-routed. Best-effort TRD; flag thinness as Open question.
- **>2 open questions after drafting**: note them and emit `done`. task-writer surfaces blocking questions; do not self-escalate.

## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill = `TRD.md` row — create only; PRD is upstream read-only; source code untouched).
- Do not invoke other agents or skills. Do not dispatch task-writer — the 'Required next skill' section above dispatches downstream.
- Do not modify source code, even if you spot bugs. Note them in Open questions if load-bearing.
- Tool budget: **~10 Read/Grep/Glob calls when `exploration_findings` is present** (verify-first + interface deepening), **~25 when absent** (full design-deep mode). If you need more than the applicable cap, halt and emit `error` with a `reason`.
