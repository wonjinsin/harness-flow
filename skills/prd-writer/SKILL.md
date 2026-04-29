---
name: prd-writer
description: Run after brainstorming on the prd-trd or prd-only route. Drafts `.planning/{session_id}/PRD.md` — Goal, Acceptance criteria, Non-goals, Constraints, Open questions. Outcome-framed ("after this change, X is true"), not engineering-detailed — that's TRD/TASKS. Reads `.planning/{session_id}/brainstorming.md` as authoritative ground; only verifies and fills gaps within a small ~5-call budget. One PRD per session; runs in an isolated subagent.
model: sonnet
---

# PRD Writer

## Purpose

Produce **`PRD.md`** — the product-level spec downstream writers expand into design or tasks. One PRD per session, one shape regardless of tier. Solo-developer lens: enough signal to make implementation decisions, no corporate ceremony. A reader should finish in under 2 minutes.

See `../../harness-contracts/output-contract.md` for the terminal-message conventions, error taxonomy, and shared anti-patterns. See `../../harness-contracts/payload-contract.md` for dispatch-prompt conventions.

The dispatch prompt is short — typically `"Draft PRD for session {id}. Read .planning/{id}/brainstorming.md."` All planning context lives inside `brainstorming.md`. A Gate 2 re-dispatch appends a `Revision note from user: {note}` line to the prompt — Step 1 watches for it.

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## Procedure

### Step 1 — Read `brainstorming.md`

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
- route: {prd-trd|prd-only|...}
- estimated files: ...
- user approved: yes
```

Map sections to PRD inputs:

- `## Request` — verbatim user request; mirror its language and concrete nouns.
- `## A1.6 findings` — the verify-first ground for Step 2. `files visited` and `key findings` are the change surface; `code signals` informs Constraints (auth/migration/schema signals must surface there); `open questions` are pre-existing user-facing gaps — promote relevant ones to PRD Open questions verbatim. If the body reads `(skipped — no resolvable target)`, switch to full-mode exploration in Step 2.
- `## Brainstorming output` — `intent`, `target`, `scope`, `constraints`, `acceptance`. Drives Goal and Acceptance framing. If absent or thin, recover intent from the verb in `## Request` (first-verb rule, default `add`).
- `## Recommendation` — confirms the route is `prd-trd` or `prd-only`. The main thread already knows the route; do not echo it back.

If the dispatch prompt contains a line `Revision note from user: {note}`, this is a Gate 2 re-dispatch — the user reviewed the previous PRD and asked for a correction. **Anchor on the note**: which section does the correction touch (Goal, Acceptance, Constraints, Non-goals)? Treat the rest of the doc as basically right and surgically address what the note flagged. Do not re-derive from scratch.

Note what is missing from `brainstorming.md` — that's the candidate set for Step 2 verification or Open questions.

### Step 2 — Scoped codebase exploration (budget-capped, verify-first)

Tool budget: **~5 Read/Grep/Glob calls when `## A1.6 findings` has content, ~15 when the section is `(skipped — no resolvable target)`**. The findings already encode brainstorming's main-thread peek — re-running it would waste tokens and risk inconsistent reads.

When findings present (verify-first mode):

- Confirm `files visited` paths/symbols still exist and the `key findings` claims match the code. Discrepancies become Open questions, not silent overrides.
- Spend remaining budget only on surfaces brainstorming did NOT visit but the PRD needs — typically test files, sibling configs, or one caller for `scope: multi-system`.
- If a finding is wrong, record the correction in Open questions; do not silently rewrite — the user reviewed those findings.

When findings are skipped (full mode, ~15 calls): use `target` from `## Brainstorming output` (if present) to locate the file/module first, then decide width — `scope: multi-system` → direct callers and sibling modules; otherwise stay within the target file/module.

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

Create `.planning/{session_id}/` if it doesn't exist. Write `PRD.md`. If the file already exists, halt and emit the error terminal message per `../../harness-contracts/output-contract.md`.

### Step 5 — Terminal message

End your turn with a short markdown block. On success:

```markdown
## Status
done

## Path
.planning/{session_id}/PRD.md
```

On error:

```markdown
## Status
error

## Reason
{short cause}
```

The main thread reads `## Status` to decide next dispatch; `## Path` is what it surfaces to the user at Gate 2. The route (`prd-trd` vs `prd-only`) is already known to the main thread from `brainstorming.md` — do not echo it.

## Required next skill

On `## Status: done`, the **main thread runs Gate 2** before dispatching anything: it surfaces the written `PRD.md` path (and any Open questions inside it) to the user with a prompt like:

> "Wrote `.planning/{session_id}/PRD.md`. Review and let me know — approve to continue, or tell me what to revise."

Three branches (full contract: `../../harness-contracts/payload-contract.md` § "User review gates"):

- **approve** → main thread dispatches the next skill per the route recorded in `brainstorming.md`:
  - `prd-trd` route → dispatch **trd-writer** with prompt `"Draft TRD for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md."`
  - `prd-only` route → dispatch **task-writer** with prompt `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md. No TRD for this route."`
- **revise** → main thread deletes `.planning/{session_id}/PRD.md` and re-dispatches **prd-writer** with the original prompt plus a `Revision note from user: {note}` line. Step 1 detects the line and anchors on the note rather than redrafting from scratch.
- **abort** → main thread updates `STATE.md` `Last activity` and stops; no further skill is dispatched.

On `## Status: error` → flow terminates immediately (no Gate 2). Main thread reports the reason to the user and stops.

## Anti-patterns

PRD-specific (additional to those in `../../harness-contracts/output-contract.md`):

- **No engineering approach detail.** Library choice, interface signatures, data shapes — that's TRD/TASKS. PRD says what becomes true after the change; TRD says what changes in code.

## Edge cases

- **Request references files that don't exist**: investigate with Glob to confirm. If truly absent, add an Open question rather than inventing structure.
- **User requested one feature but `## Brainstorming output` implies multiple**: brainstorming.md is authoritative (brainstorming may have scoped down). If the mismatch is large, add an Open question.
- **Signals matched `auth/` or `security/`**: Constraints section *must* have an entry — downstream phases cannot recover security requirements from code alone, and skipped constraints fail silently.
- **>2 open questions after drafting**: note them and emit `done`. The next writer surfaces blocking questions; do not self-escalate.

## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill = `PRD.md` row — create only; `brainstorming.md` is upstream read-only; ROADMAP/STATE are read-or-skip; source code untouched).
- Do not invoke other agents or skills. Do not dispatch trd-writer or task-writer — the 'Required next skill' section above describes how the main thread does it.
- Do not modify source code, even if you spot bugs. Note them in Open questions if load-bearing.
- Tool budget: **~5 Read/Grep/Glob calls when `## A1.6 findings` has content** (verify-first), **~15 when it reads `(skipped — no resolvable target)`** (full scope-locating mode). Brainstorming already paid the main-thread peek when findings are present — re-doing it wastes tokens and risks inconsistent reads. If you need more than the applicable cap, halt and emit `error` with a `## Reason` describing the exhaustion (typical cause: findings are stale or the request grew beyond what brainstorming scoped).
