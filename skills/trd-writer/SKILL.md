---
name: trd-writer
description: Run after prd-writer (prd-trd route) or directly after brainstorming (trd-only route). Drafts `.planning/{session_id}/TRD.md` — Affected surfaces with concrete file/function names, Interfaces & contracts, Data model, Risks. Code-shape level: distinct from PRD's outcome framing and TASKS's step-by-step instructions. Reads `.planning/{session_id}/brainstorming.md` (and PRD.md when present) as authoritative ground; only verifies and digs into interfaces within a ~10-call budget. One TRD per session; runs in an isolated subagent.
model: sonnet
---

# TRD Writer

## Purpose

Produce **`TRD.md`** — the technical design that bridges PRD-level outcomes (what) and TASKS-level steps (how). One TRD per session, one shape regardless of whether an upstream PRD exists. Solo-developer lens: enough detail to make the implementation trajectory obvious, nothing more. A reader should finish in under 3 minutes.

See `../../harness-contracts/output-contract.md` for the terminal-message conventions, error taxonomy, and shared anti-patterns. See `../../harness-contracts/payload-contract.md` for dispatch-prompt conventions.

The dispatch prompt is short. On the prd-trd route: `"Draft TRD for session {id}. Read .planning/{id}/brainstorming.md and PRD.md."` On the trd-only route: `"Draft TRD for session {id}. Read .planning/{id}/brainstorming.md. No PRD will exist for this route."` A Gate 2 re-dispatch appends a `Revision note from user: {note}` line — Step 1 watches for it.

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## Why this exists

TRD answers "what will actually change in code and why this shape?" — distinct from PRD's outcome-framed requirements and TASKS's step-by-step instructions. The only branch is §1 (Context): with PRD it cites the upstream goal; without PRD it states the technical motivation directly. Body shape is identical, so downstream doesn't care which upstream fed the TRD.

## Procedure

### Step 1 — Read `brainstorming.md` (and PRD if present)

Read `.planning/{session_id}/brainstorming.md` end-to-end and treat every section as authoritative ground. Expected structure:

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
- route: {prd-trd|trd-only|...}
- estimated files: ...
- user approved: yes
```

Determine route from `## Recommendation`:

- **`prd-trd`** → also read `.planning/{session_id}/PRD.md` end-to-end. Treat its Goal, Acceptance criteria, and Constraints as hard inputs — the TRD must satisfy them, not re-derive them. If the file is missing/unreadable, emit the error terminal message per `../../harness-contracts/output-contract.md`.
- **`trd-only`** → no PRD exists; technical motivation comes directly from `## Request` and `## Brainstorming output`.

(Always check for PRD.md existence rather than rely on the prompt wording — the route in `brainstorming.md` is canonical.)

Map sections to TRD inputs:

- `## A1.6 findings` — verify-first ground for Step 2. `files visited` and `key findings` are the change surface; `code signals` informs Risks (auth/migration/schema concerns must surface in §7 Risks); `open questions` flags things brainstorming could not resolve — promote relevant ones to TRD Open questions. If the body reads `(skipped — no resolvable target)`, switch to full-mode exploration in Step 2.
- `## Brainstorming output` — `target` and `constraints` shape Affected surfaces and §7 Risks.

If the dispatch prompt contains a line `Revision note from user: {note}`, this is a Gate 2 re-dispatch — the user reviewed the previous TRD and asked for a correction. **Anchor on the note**: which section does the correction touch (Affected surfaces, Interfaces, Data model, Risks)? Treat the rest of the doc as basically right; surgically address what the note flagged.

Note what is missing from `brainstorming.md` + PRD — that's the candidate set for Step 2 verification or Open questions.

### Step 2 — Scoped codebase exploration (budget-capped, verify-first)

Tool budget: **~10 Read/Grep/Glob calls when `## A1.6 findings` has content, ~25 when the section is `(skipped — no resolvable target)`**. The findings already encode brainstorming's main-thread peek — re-running it would waste tokens and risk inconsistent reads. The smaller cap when findings are present is enough because TRD's job is mostly to dig into interfaces brainstorming surfaced, not re-discover the change surface.

When findings present (verify-first mode):

- Confirm `files visited` paths and the function/class names in `key findings` still exist and match.
- Spend remaining budget reading the actual function signatures, request/response shapes, and shared abstractions referenced — these are the TRD's substance and brainstorming's peek typically did not record them in detail.
- Walk outward to direct callers / sibling modules ONLY for surfaces brainstorming did not visit.
- If a finding is wrong, record the correction in Open questions and pick a defensible default marked `(assumed)`.

When findings are skipped (full mode, ~25 calls): locate the primary file/module using, in order, `target` from `## Brainstorming output` (if present), the PRD's subject (if PRD exists), or the first noun-phrase in `## Request`. Then decide width — `scope: multi-system` → walk outward to direct callers, sibling modules, and any shared abstractions the change touches; otherwise stay within the target file/module and its immediate dependencies.

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

Create `.planning/{session_id}/` if needed. Write `TRD.md`. If the file already exists, halt and emit the error terminal message per `../../harness-contracts/output-contract.md`.

### Step 5 — Terminal message

End your turn with a short markdown block. On success:

```markdown
## Status
done

## Path
.planning/{session_id}/TRD.md
```

On error:

```markdown
## Status
error

## Reason
{short cause}
```

## Required next skill

On `## Status: done`, the **main thread runs Gate 2** before dispatching anything: it surfaces the written `TRD.md` path (and any Open questions inside it) to the user with a prompt like:

> "Wrote `.planning/{session_id}/TRD.md`. Review and let me know — approve to continue, or tell me what to revise."

Three branches (full contract: `../../harness-contracts/payload-contract.md` § "User review gates"):

- **approve** → main thread dispatches **task-writer** with prompt `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md, .planning/{id}/PRD.md (if exists), and .planning/{id}/TRD.md."` (Task-writer checks PRD.md existence itself — the route in `brainstorming.md` disambiguates.)
- **revise** → main thread deletes `.planning/{session_id}/TRD.md` and re-dispatches **trd-writer** with the original prompt plus a `Revision note from user: {note}` line. Step 1 detects the line and anchors on the note.
- **abort** → main thread updates `STATE.md` `Last activity` and stops.

On `## Status: error` → flow terminates immediately (no Gate 2). Main thread reports the reason and stops.

## Anti-patterns

TRD-specific (additional to those in `../../harness-contracts/output-contract.md`):

- **No step-by-step task lists.** Sequencing is task-writer's job. TRD describes the shape of the change; the steps to get there belong in TASKS.
- **No re-stating PRD acceptance criteria verbatim.** Reference them by section (e.g., "see PRD §Acceptance criteria #2"). Duplicating invites drift, and the evaluator greps the original PRD vocabulary anyway.

## Edge cases

- **PRD exists but is thin/incomplete**: still authoritative; gaps become Open questions in the TRD. Do not "fix" the PRD from inside this skill — main-thread decision.
- **Request references files that don't exist**: investigate with Glob. If truly absent, add an Open question rather than inventing structure.
- **Exploration surfaces `auth/` / `security/` / `migrations/` concerns**: §7 of the template needs an entry no matter how small the change feels — elision is the silent failure mode (entry can be "accepted: behavior-preserving").
- **No PRD and very thin brainstorming.md**: trd-only route with a one-sentence `## Request` and skipped `## A1.6 findings` — upstream likely mis-routed. Best-effort TRD; flag thinness as Open question.
- **>2 open questions after drafting**: note them and emit `done`. task-writer surfaces blocking questions; do not self-escalate.

## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill = `TRD.md` row — create only; `brainstorming.md` and `PRD.md` are upstream read-only; source code untouched).
- Do not invoke other agents or skills. Do not dispatch task-writer — the 'Required next skill' section above describes how the main thread does it.
- Do not modify source code, even if you spot bugs. Note them in Open questions if load-bearing.
- Tool budget: **~10 Read/Grep/Glob calls when `## A1.6 findings` has content** (verify-first + interface deepening), **~25 when it reads `(skipped — no resolvable target)`** (full design-deep mode). If you need more than the applicable cap, halt and emit `error` with a `## Reason`.
