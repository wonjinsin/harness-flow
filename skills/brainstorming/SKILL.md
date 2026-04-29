---
name: brainstorming
description: Run as the harness intake step after router emits clarify, plan, or resume. Drives a tight Q&A loop when the request lacks signal (clarify route), grounds questions in a scoped codebase peek (~10 Read/Grep/Glob calls) so questions reflect what actually exists, then classifies into one of four downstream routes (prd-trd, prd-only, trd-only, tasks-only) while absorbing Gate 1 user approval before any artifact is created. Never proposes implementation solutions or writes specs — its product is the route payload PLUS exploration_findings that prd-writer/trd-writer/task-writer consume in place of re-exploring the codebase themselves.
model: sonnet
---

# Brainstorming

## Purpose

Brainstorming is the harness's **intake skill**. It owns three responsibilities:

1. **Clarify the request** — when router routes `clarify`, drive a tight Q&A loop until the request has enough signal to classify and to draft. Phase A runs in one of two modes:
   - **Intake** (default) — the request already names an intent and target; fill the remaining fields one per turn.
   - **Explore** — the request is still at the idea stage; diverge briefly to map the _problem space_, then converge into intake.
2. **Ground in the codebase** — once intent and target are pinned (Phase A1.6), run a scoped codebase peek (~10 Read/Grep/Glob calls) to verify the target exists, surface code-visible constraints (existing schemas, auth flows, function signatures), and feed the rest of Phase A with concrete questions. The findings are emitted as `exploration_findings` so writers don't re-explore the same ground.
3. **Classify into a route** — pick `prd-trd` / `prd-only` / `trd-only` / `tasks-only`, then absorb **Gate 1** (user approval before artifact creation).

The skill never proposes implementation solutions, never writes specs, and never drafts code. **Explore mode may surface direction-mapping options (problem-space categories, high-level shape) but never implementation options** — that boundary is what keeps brainstorming separate from `prd-writer` / `trd-writer`. Its product is a route payload + exploration_findings bundle that downstream writers can trust.

Why brainstorming owns codebase exploration (and writers don't re-do it): the user is in the room here. A finding that surfaces a wrong assumption ("you said `issueSession` but I see `createSession` — same thing?") can be resolved live in one turn. The same finding inside an isolated subagent becomes an Open question the user discovers only after PRD/TRD/TASKS are all written. Spending ~10 tool calls in main context up-front saves three independent rediscoveries downstream and catches mismatches at the cheapest moment.

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
  },
  "exploration_findings": {
    "files_visited": ["src/auth/session.ts:42", "src/auth/middleware.ts"],
    "key_findings": [
      "issueSession() in src/auth/session.ts currently issues without TOTP check",
      "middleware reads Bearer token only — no MFA hook"
    ],
    "code_signals": ["auth/", "schema:session"],
    "open_questions": ["Should refresh tokens be revoked on TOTP enable?"]
  }
}
```

`brainstorming_output` may be `null` when router handed off `plan` directly and the Q&A phase was skipped. `exploration_findings` may be `null` when the request had no resolvable target to explore (pure UX decision, external integration with no local analog) — writers fall back to their own Step 2 budget in that case.

**Pivot** — user turned away mid-intake:

```json
{ "outcome": "pivot", "session_id": "...", "reason": "..." }
```

**Casual re-classified** — user was asking a question, not requesting work:

```json
{ "outcome": "exit-casual", "session_id": "...", "reason": "..." }
```

Session files are written only on route outcomes (see B5/B7 in `references/procedure.md`). `STATE.md` `Last activity` is updated on every outcome. ROADMAP is untouched on `pivot` / `exit-casual`.

## Procedure

Step 0 (resume short-circuit) → **Phase A** (only when `route == "clarify"`) → **Phase B** (always). Phase A picks A-intake or A-explore based on whether intent + target are extractable; either way A1.6 fires once both are pinned, before A2.

| Phase   | Step      | One-line description                                                                               |
| ------- | --------- | -------------------------------------------------------------------------------------------------- |
| Step 0  | resume    | Short-circuit if ROADMAP already has `Complexity:` and `brainstorming` is `[x]`.                   |
| Phase A | A1        | Extract from request first; flag multi-subsystem scope before asking fields.                       |
| Phase A | A1.5      | Pick mode — A-explore (no intent + target) vs A-intake (fields partially fillable).                |
| Phase A | A-explore | Diverge with open or direction-mapping questions until intent + target stabilise.                  |
| Phase A | A1.6      | Scoped codebase peek (~10 Read/Grep/Glob) — verify target, gather code-visible constraints.        |
| Phase A | A2        | Ask one missing field per turn, MC-preferred, in user's language. Reference A1.6 findings.         |
| Phase A | A3        | Early exit on "just start" / "skip" — proceed with whatever is filled.                             |
| Phase A | A4        | Confirm fills as standalone message; next turn moves to Phase B.                                   |
| Phase B | B1        | Detect path + multilingual keyword signals. A1.6 findings feed `code_signals`.                     |
| Phase B | B2        | Single integer N = best-guess modified + new files.                                                |
| Phase B | B3        | Tier rule: any signal → prd-trd; else by intent + N.                                               |
| Phase B | B4        | tasks-only candidate must pass 4 self-checks; any fail → prd-only.                                 |
| Phase B | B5        | Gate 1 — present recommendation as standalone message; wait.                                       |
| Phase B | B6        | Accept / route-override / file-count override (one recompute) / pivot.                             |
| Phase B | B7        | Update ROADMAP + STATE, emit payload (incl. `exploration_findings`).                               |

Full Q&A protocol: `references/procedure.md`.

## Conversation shape

**Good — clarify path with A1.6 grounded refinement → trd-only:**

> User: "make the auth code better"
> Brainstorming: "What kind of change? (fix bug / refactor for clarity / improve perf / migrate)"
> User: "refactor for clarity"
> Brainstorming: "Which part — session handling, password reset, JWT issuance, or broader?"
> User: "session handling"
> [A1.6: Read `session.ts` + Grep callers → 4 callers in `auth/{login,logout,refresh,middleware}`. Findings: `issueSession()` at session.ts:42 mixes issuance with cookie-setting; signal `auth/`.]
> Brainstorming: "코드 보니 발급 로직과 쿠키 세팅이 한 함수에 섞여 있어요. 이번 리팩토링에서 둘을 분리할까요, 발급 쪽만 정리할까요?"
> User: "분리해줘"
> Brainstorming: "Scope: session 모듈 안에서만, 4개 호출자 시그니처는 유지?"
> User: "그대로"
> Brainstorming: "확인 — refactor session handling (issuance/cookie 분리), subsystem. 경로 추천하겠습니다."
> User: "ok"
> Brainstorming: "Recommend **trd-only**. Estimated 3 files, touches `auth/`. Proceed?"
> User: "yes"
> Brainstorming: [commits, emits `{"outcome": "trd-only", ..., "exploration_findings": {...}}`]

A1.6 grounds the question ("issuance + cookie are coupled — split or not?") in real code, surfacing a decision the user can make live instead of leaving it as an Open question for the writer to flag later.

`references/conversation-examples.md` covers more patterns: explore → A1.6 → intake (ideation), intake + grounded refinement, plan-path signal promotion, tasks-only demotion, user override, multi-project decomposition, anti-patterns.

## Edge cases

See `references/edge-cases.md` for pivot, casual reclassification, ambiguous answers, conflicting signals, intent-freeform handling, and other corner cases.

## Required next skill

The next skill depends on `outcome` (full payload contract: `../../harness-contracts/payload-contract.md` § "brainstorming → \*"):

- `outcome == "prd-trd"` or `"prd-only"` → **REQUIRED SUB-SKILL:** Use harness-flow:prd-writer
  Payload: `{ session_id, request, brainstorming_outcome: <outcome>, brainstorming_output }`
- `outcome == "trd-only"` → **REQUIRED SUB-SKILL:** Use harness-flow:trd-writer
  Payload: `{ session_id, request, brainstorming_outcome: "trd-only", brainstorming_output, prd_path: null }`
- `outcome == "tasks-only"` → **REQUIRED SUB-SKILL:** Use harness-flow:task-writer
  Payload: `{ session_id, request, brainstorming_output, prd_path: null, trd_path: null }`
- `outcome == "pivot"` or `"exit-casual"` → flow terminates. Report to the user and stop.

## Out of scope

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill writes only `Complexity:` + brainstorming row in `ROADMAP.md`, `Current Position` + `Last activity` in `STATE.md`).
- **Specific** solutions, approaches, or implementation tradeoffs — that's `prd-writer` / `trd-writer`. Explore mode may name problem-space *shape* categories ("push / email / in-app") but never implementation choices (libraries, architectures, file structure).
- Writing specs, design docs, or any code.
- Codebase exploration beyond A1.6's ~10-call budget. If even target disambiguation needs more, record `constraint: deliberately-wide-scope` and proceed — the request likely belongs on prd-trd.
- Modifying source code, even when A1.6 surfaces a bug. Log in `exploration_findings.open_questions`.
- LOC / test-coverage estimation; runtime tier promotion based on actual diff.
- Dispatching the next agent — main thread reads "Required next skill" below.
- Re-asking questions the user already answered; re-invoking router (router fires next turn on pivot).
- More than one file-count recomputation in B6.
- Non-English in skill internals (route names, signal list, field names stay English; user-facing prompts mirror user's language).
