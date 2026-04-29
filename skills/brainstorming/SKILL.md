---
name: brainstorming
description: Run as the harness intake step after router emits clarify, plan, or resume. Drives a tight Q&A loop when the request lacks signal (clarify route), grounds questions in a scoped codebase peek (~10 Read/Grep/Glob calls) so questions reflect what actually exists, then classifies into one of four downstream routes (prd-trd, prd-only, trd-only, tasks-only) while absorbing Gate 1 user approval before any artifact is created. Never proposes implementation solutions or writes specs — on route approval it writes `.planning/{session_id}/brainstorming.md` (the verify-first ground prd-writer/trd-writer/task-writer consume in place of re-exploring the codebase themselves) and ends with a short markdown status note pointing at the file.
model: opus
---

# Brainstorming

## Purpose

Brainstorming is the harness's **intake skill**. It owns three responsibilities:

1. **Clarify the request** — when router routes `clarify`, drive a tight Q&A loop until the request has enough signal to classify and to draft. Phase A runs in one of two modes:
   - **Intake** (default) — the request already names an intent and target; fill the remaining fields one per turn.
   - **Explore** — the request is still at the idea stage; diverge briefly to map the _problem space_, then converge into intake.
2. **Ground in the codebase** — once intent and target are pinned (Phase A1.6), run a scoped codebase peek (~10 Read/Grep/Glob calls) to verify the target exists, surface code-visible constraints (existing schemas, auth flows, function signatures), and feed the rest of Phase A with concrete questions. The findings are recorded under `## A1.6 findings` in `brainstorming.md` so writers don't re-explore the same ground.
3. **Classify into a route** — pick `prd-trd` / `prd-only` / `trd-only` / `tasks-only`, absorb **Gate 1** (user approval before artifact creation), then write `.planning/{session_id}/brainstorming.md` as the authoritative handoff to downstream writers.

The skill never proposes implementation solutions, never writes specs, and never drafts code. **Explore mode may surface direction-mapping options (problem-space categories, high-level shape) but never implementation options** — that boundary is what keeps brainstorming separate from `prd-writer` / `trd-writer`. Its product is `brainstorming.md` (Request + A1.6 findings + Brainstorming output + Recommendation) that downstream writers can trust.

Why brainstorming owns codebase exploration (and writers don't re-do it): the user is in the room here. A finding that surfaces a wrong assumption ("you said `issueSession` but I see `createSession` — same thing?") can be resolved live in one turn. The same finding inside an isolated subagent becomes an Open question the user discovers only after PRD/TRD/TASKS are all written. Spending ~10 tool calls in main context up-front saves three independent rediscoveries downstream and catches mismatches at the cheapest moment.

## Execution mode

Main context — see `../../harness-contracts/execution-modes.md`. Brainstorming runs inline because the Q&A and classification phases need live user dialogue.

## Input

Runs in the main thread with live conversation context. Dispatch prompt fields from router:

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `request`: the user's original turn, verbatim, any language
- `route`: `"clarify"` | `"plan"` | `"resume"` — mirror of router's `## Status`. Determines whether the Q&A phase runs.
- `resume`: `true` when `route == "resume"` (Step 0 short-circuits)

## Terminal message

Every run ends with a short markdown block. See `../../harness-contracts/output-contract.md` for the shared section grammar.

**Route outcome** — Phase B7 writes `.planning/{session_id}/brainstorming.md` first, then ends the turn with:

```markdown
## Status

{prd-trd|prd-only|trd-only|tasks-only}

## Path

.planning/{session_id}/brainstorming.md

Proceeding to {next-skill}.
```

The file is the handoff. Its mandatory structure:

```markdown
# Brainstorming — {session_id}

## Request

"{user's verbatim request}"

## A1.6 findings

- files visited: {file:line, ...}
- key findings:
  - {finding 1}
  - {finding 2}
- code signals: {signal-1, signal-2}
- open questions:
  - {question 1}

## Brainstorming output

- intent: {add|fix|refactor|migrate|remove|other}
- target: {short phrase}
- scope: {single-file|subsystem|multi-system}
- constraints:
  - {constraint 1}
- acceptance: {one sentence}

## Recommendation

- route: {prd-trd|prd-only|trd-only|tasks-only}
- estimated files: {N}
- user approved: yes
```

If A1.6 was skipped (router routed `plan` with no resolvable target, or the request had no local analog), the `## A1.6 findings` header still appears with the body `- (skipped — no resolvable target)`. Writers see the explicit "skipped" marker and switch to full-mode exploration.

**Pivot** — user turned away mid-intake. No file is written. Prose explanation, then:

```markdown
## Status

pivot

## Reason

{short cause}
```

**Casual re-classified** — user was asking a question, not requesting work. No file is written. Prose explanation, then:

```markdown
## Status

exit-casual

## Reason

{short cause}
```

`brainstorming.md` is written only on route outcomes (see B5/B7 in `references/procedure.md`). `STATE.md` `Last activity` is updated on every terminal status. ROADMAP is untouched on `pivot` / `exit-casual`.

## Procedure

Step 0 (resume short-circuit) → **Phase A** (only when `route == "clarify"`) → **Phase B** (always). Phase A picks A-intake or A-explore based on whether intent + target are extractable; either way A1.6 fires once both are pinned, before A2.

| Phase   | Step      | One-line description                                                                                              |
| ------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| Step 0  | resume    | Short-circuit if `.planning/{id}/brainstorming.md` exists with `user approved: yes` (ROADMAP marker is fallback). |
| Phase A | A1        | Extract from request first; flag multi-subsystem scope before asking fields.                                      |
| Phase A | A1.5      | Pick mode — A-explore (no intent + target) vs A-intake (fields partially fillable).                               |
| Phase A | A-explore | Diverge with open or direction-mapping questions until intent + target stabilise.                                 |
| Phase A | A1.6      | Scoped codebase peek (~10 Read/Grep/Glob) — verify target, gather code-visible constraints.                       |
| Phase A | A2        | Ask one missing field per turn, MC-preferred, in user's language. Reference A1.6 findings.                        |
| Phase A | A3        | Early exit on "just start" / "skip" — proceed with whatever is filled.                                            |
| Phase A | A4        | Confirm fills as standalone message; next turn moves to Phase B.                                                  |
| Phase B | B1        | Detect path + multilingual keyword signals. A1.6 code signals feed `code_signals`.                                |
| Phase B | B2        | Single integer N = best-guess modified + new files.                                                               |
| Phase B | B3        | Tier rule: any signal → prd-trd; else by intent + N.                                                              |
| Phase B | B4        | tasks-only candidate must pass 4 self-checks; any fail → prd-only.                                                |
| Phase B | B5        | Gate 1 — present recommendation as standalone message; wait.                                                      |
| Phase B | B6        | Accept / route-override / file-count override (one recompute) / pivot.                                            |
| Phase B | B7        | Update ROADMAP + STATE, write `.planning/{id}/brainstorming.md`, end turn with markdown status.                   |

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
> Brainstorming: [updates ROADMAP/STATE, writes `.planning/{id}/brainstorming.md`, ends with `## Status: trd-only` + `## Path: .planning/{id}/brainstorming.md` + "Proceeding to trd-writer."]

A1.6 grounds the question ("issuance + cookie are coupled — split or not?") in real code, surfacing a decision the user can make live instead of leaving it as an Open question for the writer to flag later.

`references/conversation-examples.md` covers more patterns: explore → A1.6 → intake (ideation), intake + grounded refinement, plan-path signal promotion, tasks-only demotion, user override, multi-project decomposition, anti-patterns.

## Edge cases

See `references/edge-cases.md` for pivot, casual reclassification, ambiguous answers, conflicting signals, intent-freeform handling, and other corner cases.

## Required next skill

The next skill depends on the `## Status` value of the terminal message (full per-edge handoff: `../../harness-contracts/payload-contract.md` § "brainstorming → \*"). All writer dispatches read `.planning/{session_id}/brainstorming.md` from disk — the dispatch prompt itself stays minimal.

- `## Status: prd-trd` or `prd-only` → **REQUIRED SUB-SKILL:** Use harness-flow:prd-writer
  Dispatch: `Task(prd-writer, prompt: "Draft PRD for session {id}. Read .planning/{id}/brainstorming.md.")`
- `## Status: trd-only` → **REQUIRED SUB-SKILL:** Use harness-flow:trd-writer
  Dispatch: `Task(trd-writer, prompt: "Draft TRD for session {id}. Read .planning/{id}/brainstorming.md. No PRD will exist for this route.")`
- `## Status: tasks-only` → **REQUIRED SUB-SKILL:** Use harness-flow:task-writer
  Dispatch: `Task(task-writer, prompt: "Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md. No PRD or TRD will exist for this route.")`
- `## Status: pivot` or `exit-casual` → flow terminates. No file written. Report to the user and stop.

## Out of scope

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill writes `Complexity:` + brainstorming row in `ROADMAP.md`, `Current Position` + `Last activity` in `STATE.md`, and `.planning/{session_id}/brainstorming.md`).
- **Specific** solutions, approaches, or implementation tradeoffs — that's `prd-writer` / `trd-writer`. Explore mode may name problem-space _shape_ categories ("push / email / in-app") but never implementation choices (libraries, architectures, file structure).
- Writing specs, design docs, or any code.
- Codebase exploration beyond A1.6's ~10-call budget. If even target disambiguation needs more, record `constraint: deliberately-wide-scope` and proceed — the request likely belongs on prd-trd.
- Modifying source code, even when A1.6 surfaces a bug. Log under `## A1.6 findings` → open questions.
- LOC / test-coverage estimation; runtime tier promotion based on actual diff.
- Dispatching the next agent — main thread reads "Required next skill" below.
- Re-asking questions the user already answered; re-invoking router (router fires next turn on pivot).
- More than one file-count recomputation in B6.
- Non-English in skill internals (route names, signal list, field names stay English; user-facing prompts mirror user's language).
