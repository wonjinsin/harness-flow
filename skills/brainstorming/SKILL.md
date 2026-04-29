---
name: brainstorming
description: Run as the harness intake step after router emits clarify, plan, or resume. Drives a tight Q&A loop only when the request lacks signal (clarify route), then classifies into one of four downstream routes (prd-trd, prd-only, trd-only, tasks-only) and absorbs Gate 1 user approval before any artifact is created. Never proposes solutions, writes specs, or reads the codebase beyond minimum target disambiguation — its only product is the route payload that prd-writer/trd-writer/task-writer can trust.
---

# Brainstorming

## Purpose

Brainstorming is the harness's **intake skill**. It owns two responsibilities:

1. **Clarify the request** — when router routes `clarify`, drive a tight Q&A loop until the request has enough signal to classify and to draft.
2. **Classify into a route** — pick `prd-trd` / `prd-only` / `trd-only` / `tasks-only`, then absorb **Gate 1** (user approval before artifact creation).

The skill never proposes solutions, never writes specs, and never drafts code. Its product is a single route payload that downstream writers (`prd-writer` / `trd-writer` / `task-writer`) can trust.

## Execution mode

Main context — see `../../harness-contracts/execution-modes.md`. Brainstorming runs inline because the Q&A and classification phases need live user dialogue.

## Input

Runs in the main thread with live conversation context. Payload from router:

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `request`: the user's original turn, verbatim, any language
- `route`: `"clarify"` | `"plan"` | `"resume"` — mirror of `router.output.outcome`. Determines whether the Q&A phase runs.
- `resume`: `true` when `route == "resume"` (Step 0 short-circuits)

## Output

Every run ends with **one** terminal payload. The final message is a single JSON object whose `outcome` field carries the route name (or terminal signal).

**Route outcome** — `outcome` is the route name (`prd-trd`, `prd-only`, `trd-only`, or `tasks-only`):

```json
{
  "outcome": "prd-trd",
  "session_id": "2026-04-19-...",
  "request": "...",
  "brainstorming_output": {
    "intent": "add|fix|refactor|migrate|remove|other",
    "target": "...",
    "scope_hint": "single-file|subsystem|multi-system",
    "constraints": ["..."],
    "acceptance": "..."
  }
}
```

`brainstorming_output` may be `null` when router handed off `plan` directly and the Q&A phase was skipped.

**Pivot** — user turned away mid-intake:

```json
{ "outcome": "pivot", "session_id": "...", "reason": "..." }
```

**Casual re-classified** — user was asking a question, not requesting work:

```json
{ "outcome": "exit-casual", "session_id": "...", "reason": "..." }
```

Session files are written only on route outcomes (see B5/B7 in `references/procedure.md`). `STATE.md` `Last activity` is updated on every outcome. ROADMAP is untouched on `pivot` / `exit-casual`.

## Process flow

1. **Step 0** — resume short-circuit (skip everything if previously classified).
2. **Phase A** — clarify (only if `route == "clarify"`).
3. **Phase B** — classify + Gate 1 user approval.

## Procedure summary

| Phase | Step | One-line description |
| --- | --- | --- |
| Step 0 | resume | Short-circuit if ROADMAP already has `Complexity:` and `brainstorming` is `[x]`. |
| Phase A | A1 | Extract from request first; flag multi-subsystem scope before asking fields. |
| Phase A | A2 | Ask one missing field per turn, MC-preferred, in user's language. |
| Phase A | A3 | Early exit on "just start" / "skip" — proceed with whatever is filled. |
| Phase A | A4 | Confirm fills as standalone message; next turn moves to Phase B. |
| Phase B | B1 | Detect path signals (`auth/`, `migrations/`, …) + multilingual keyword signals. |
| Phase B | B2 | Single integer N = best-guess modified + new files. |
| Phase B | B3 | Tier rule: any signal → prd-trd; else by intent + N. |
| Phase B | B4 | tasks-only candidate must pass 4 self-checks; any fail → prd-only. |
| Phase B | B5 | Gate 1 — present recommendation as standalone message; wait. |
| Phase B | B6 | Accept / route-override / file-count override (one recompute) / pivot. |
| Phase B | B7 | Write `Complexity:` + check `brainstorming` row in ROADMAP, update STATE, emit payload. |

See `references/procedure.md` for the full Q&A protocol.

## Conversation shape

**Good — clarify path, full intake into trd-only:**

> User: "make the auth code better"
> Brainstorming: "What kind of change are you thinking? (fix a bug / refactor for clarity / improve performance / migrate to something new)"
> User: "refactor for clarity"
> Brainstorming: "Which part — session handling, password reset, JWT issuance, or broader?"
> User: "session handling"
> Brainstorming: "Scope: contained to the session module, or will it ripple into callers?"
> User: "just the module"
> Brainstorming: "Got it — refactor session handling, subsystem-scoped. Now picking a route."
> User: "ok"
> Brainstorming: "Recommend **trd-only** (TRD → Tasks). Estimated 3 files, no security signals. Proceed?"
> User: "yes"
> Brainstorming: [commits ROADMAP, emits `{"outcome": "trd-only", ...}`]

See `references/conversation-examples.md` for additional dialogue patterns (plan-path signal promotion, tasks-only demotion, user override, multi-project decomposition, and bad-pattern counter-examples).

## Edge cases

See `references/edge-cases.md` for pivot, casual reclassification, ambiguous answers, conflicting signals, intent-freeform handling, and other corner cases.

## Required next skill

The next skill depends on `outcome` (full payload contract: `../../harness-contracts/payload-contract.md` § "brainstorming → *"):

- `outcome == "prd-trd"` or `"prd-only"` → **REQUIRED SUB-SKILL:** Use harness-flow:prd-writer
  Payload: `{ session_id, request, brainstorming_outcome: <outcome>, brainstorming_output }`
- `outcome == "trd-only"` → **REQUIRED SUB-SKILL:** Use harness-flow:trd-writer
  Payload: `{ session_id, request, brainstorming_outcome: "trd-only", brainstorming_output, prd_path: null }`
- `outcome == "tasks-only"` → **REQUIRED SUB-SKILL:** Use harness-flow:task-writer
  Payload: `{ session_id, request, brainstorming_output, prd_path: null, trd_path: null }`
- `outcome == "pivot"` or `"exit-casual"` → flow terminates. Report to the user and stop.

## Out of scope

- File ownership: see `../../harness-contracts/file-ownership.md`. Brainstorming writes only the `Complexity:` line + brainstorming row in `ROADMAP.md`, and `Current Position` + `Last activity` in `STATE.md`. Anything else is out of scope.
- Propose solutions, approaches, or tradeoffs — that's `prd-writer` / `trd-writer`.
- Write specs, design docs, plans, or any code.
- Read the codebase beyond minimum needed to disambiguate a target name (≤ 2 tool calls; otherwise ask the user). No file-count estimation via codebase scan.
- Estimate LOC or test coverage.
- Promote tier at runtime based on actual diff.
- Dispatch the next agent directly — main thread reads the "Required next skill" section below.
- Re-ask questions the user already answered.
- Re-invoke router — if pivot warrants a new session, end the skill; router fires next turn.
- More than one file-count recomputation in B6 — beyond that, accept the user's value.
- Mirror non-English in skill internals (route names, signal list, field names stay English; user-facing prompts mirror the user's language).
