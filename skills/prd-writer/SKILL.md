---
name: prd-writer
description: Run after brainstorming emits prd-trd or prd-only. Drafts `.planning/{session_id}/PRD.md` — Goal, Acceptance criteria, Non-goals, Constraints, Open questions. Outcome-framed ("after this change, X is true"), not engineering-detailed — that's TRD/TASKS. Consumes brainstorming's `exploration_findings` as authoritative ground; only verifies and fills gaps within a small ~5-call budget. One PRD per session; runs in an isolated subagent.
model: sonnet
---

# PRD Writer

## Purpose

Produce **`PRD.md`** — the product-level spec downstream writers expand into design or tasks. One PRD per session, one shape regardless of tier. Solo-developer lens: enough signal to make implementation decisions, no corporate ceremony. A reader should finish in under 2 minutes.

See `../../harness-contracts/output-contract.md` for the payload schema, output JSON, error taxonomy, and shared anti-patterns.

This skill receives `session_id`, `request`, `brainstorming_outcome` (`"prd-trd"` or `"prd-only"` — required), optional `brainstorming_output`, optional `exploration_findings` (brainstorming's codebase peek — when present, the authoritative starting point), and optional `revision_note` (only when re-dispatched after a Gate 2 revise — see Step 1). If `brainstorming_output` is null, recover intent from the verb in `request` (first-verb rule, default `add`).

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## Procedure

### Step 1 — Read the payload

Re-read `request` in full. Extract intent, target, and visible constraints from the payload.

If `revision_note` is present, this is a Gate 2 re-dispatch — the user reviewed the previous PRD and asked for a correction. **Anchor on the note**: which section does the correction touch (Goal, Acceptance, Constraints, Non-goals)? Treat the rest of the doc as basically right and surgically address what the note flagged. Do not re-derive from scratch.

If `exploration_findings` is present, treat it as **authoritative ground**:

- `files_visited` and `key_findings` are the change surface — Step 2 should only verify these are still accurate, not re-discover them.
- `code_signals` informs Constraints (auth/migration/schema signals must surface in the Constraints section).
- `open_questions` are pre-existing user-facing gaps — promote relevant ones to PRD Open questions verbatim.

Note what is missing from payload + findings — that's the candidate set for Step 2 verification or Open questions.

### Step 2 — Scoped codebase exploration (budget-capped, verify-first)

Tool budget: **~5 Read/Grep/Glob calls when `exploration_findings` is present, ~15 when absent**. The findings already encode brainstorming's main-thread peek — re-running it would waste tokens and risk inconsistent reads.

When findings present (verify-first mode):

- Confirm `files_visited` paths/symbols still exist and the `key_findings` claims match the code. Discrepancies become Open questions, not silent overrides.
- Spend remaining budget only on surfaces brainstorming did NOT visit but the PRD needs — typically test files, sibling configs, or one caller for `scope_hint: multi-system`.
- If a finding is wrong, record the correction in your Open questions; do not silently rewrite — the user reviewed those findings.

When findings absent (full mode, ~15 calls): use `target` (if present) to locate the file/module first, then decide width — `scope_hint: multi-system` → direct callers and sibling modules; otherwise stay within the target file/module.

Stop when you can answer: (1) where does the change land? (2) what existing code/concepts does it interact with? (3) are there code-visible constraints (existing schemas, auth flows, config shape) that shape requirements?

If the request is genuinely unknowable from code (pure UX decision, external integration), skip this step and note it in Open questions.

### Step 3 — Draft the PRD using the template

See `references/template.md` for the exact structure and `references/example.md` for a worked example. Fill each section — placeholder ranges (e.g., "1-3 sentences") are sanity checks, not quotas.

**Writing rules**:

- Mirror the user's language in body content; headers stay English.
- Use concrete nouns the user wrote — paraphrasing breaks PRD ↔ TASKS ↔ evaluator traceability.
- Acceptance criteria are checkboxes, each independently verifiable.
- Don't restate the user's request as Goal verbatim. Goal is the *outcome* — "after this change, X is true" — not the ask.
- Tag assumptions in Open questions with `(assumed)`.

### Step 4 — Write the file

Create `.planning/{session_id}/` if it doesn't exist. Write `PRD.md`. If the file already exists, halt and emit `error` per `../../harness-contracts/output-contract.md`.

### Step 5 — Emit the final JSON

Emit a single JSON object as your entire final message. PRD-writer's `done` example (path varies per writer; shape defined in `../../harness-contracts/output-contract.md`):

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "brainstorming_outcome": "prd-trd", "path": ".planning/2026-04-19-.../PRD.md" }
```

Required fields:

- `outcome: "done" | "error"`.
- `session_id`.
- `brainstorming_outcome` — echo it back from the payload (the main thread reads it to pick the next skill).
- `path: ".planning/{session_id}/PRD.md"` on `done`.
- `reason: "<short>"` on `error`.

## Required next skill

On `outcome: "done"`, the **main thread runs Gate 2** before dispatching anything: it surfaces the written `PRD.md` path (and any Open questions inside it) to the user with a prompt like:

> "Wrote `.planning/{session_id}/PRD.md`. Review and let me know — approve to continue, or tell me what to revise."

Three branches (full contract: `../../harness-contracts/payload-contract.md` § "User review gates"):

- **approve** → dispatch the next skill per `brainstorming_outcome`:
  - `"prd-trd"` → **REQUIRED SUB-SKILL:** Use harness-flow:trd-writer
    Payload: `{ session_id, request, prd_path, brainstorming_outcome: "prd-trd", brainstorming_output, exploration_findings }` — `prd_path` is constructed from this skill's `path`.
  - `"prd-only"` → **REQUIRED SUB-SKILL:** Use harness-flow:task-writer
    Payload: `{ session_id, request, prd_path, trd_path: null, brainstorming_output, exploration_findings }`
- **revise** → main thread deletes `.planning/{session_id}/PRD.md` and re-dispatches **prd-writer** with the original payload + `revision_note: "<user's correction>"`. Step 1 detects the field and anchors on the note rather than redrafting from scratch.
- **abort** → main thread updates `STATE.md` `Last activity` and stops; no further skill is dispatched.

On `outcome: "error"` → flow terminates immediately (no Gate 2). Main thread reports the reason to the user and stops.

## Anti-patterns

PRD-specific (additional to those in `../../harness-contracts/output-contract.md`):

- **No engineering approach detail.** Library choice, interface signatures, data shapes — that's TRD/TASKS. PRD says what becomes true after the change; TRD says what changes in code.

## Edge cases

- **Request references files that don't exist**: investigate with Glob to confirm. If truly absent, add an Open question rather than inventing structure.
- **User requested one feature but payload implies multiple**: payload is authoritative (brainstorming may have scoped down). If the mismatch is large, add an Open question.
- **Signals matched `auth/` or `security/`**: Constraints section *must* have an entry — downstream phases cannot recover security requirements from code alone, and skipped constraints fail silently.
- **>2 open questions after drafting**: note them and emit `done`. The next writer surfaces blocking questions; do not self-escalate.

## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill = `PRD.md` row — create only; ROADMAP/STATE are read-or-skip; source code untouched).
- Do not invoke other agents or skills. Do not dispatch trd-writer or task-writer — the 'Required next skill' section above dispatches downstream.
- Do not modify source code, even if you spot bugs. Note them in Open questions if load-bearing.
- Tool budget: **~5 Read/Grep/Glob calls when `exploration_findings` is present** (verify-first), **~15 when absent** (full scope-locating mode). Brainstorming already paid the main-thread peek when findings are present — re-doing it wastes tokens and risks inconsistent reads. If you need more than the applicable cap, halt and emit `error` with a `reason` describing the exhaustion (typical cause: findings are stale or the request grew beyond what brainstorming scoped).
