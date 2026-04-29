---
name: prd-writer
description: Use when a session needs its PRD.md drafted. Runs inside the prd-writer agent's isolated context — main conversation history is NOT available. Produces a single `.planning/{session_id}/PRD.md` from the input payload alone, then emits a one-line path + outcome.
---

# PRD Writer

## Purpose

Produce **`PRD.md`** — the product-level spec that downstream writers expand into design or tasks. One PRD per session, one format regardless of the session's tier. Written by a solo-developer lens: enough signal to make implementation decisions, no corporate ceremony.

This skill is loaded by the `prd-writer` agent inside an isolated context. You cannot see the main conversation — the **payload is your entire input**. If the payload is thin, investigate the codebase with Read/Grep/Glob; do not invent requirements.

## Why this exists

Separating PRD authoring from the main thread lets the writer spend context freely on code reading, and makes `PRD.md` the single source of truth for "what are we building" — downstream writers reference it, evaluator checks against it. Solo-dev scope means no stakeholder negotiation, metrics dashboards, or rollout plans — the document should be read in under 2 minutes.

**Tier-independent**: the main thread routes between phases by classification, but PRD content does not branch on it. One shape, always.

## Input payload

You receive this object from the dispatching main thread. Treat every field as authoritative and self-sufficient:

- `session_id`: `"YYYY-MM-DD-{slug}"` — determines the output folder.
- `request`: the user's original turn, verbatim. **Read it carefully for tone and nuance** the structured fields drop.
- `brainstorming_outcome`: the route brainstorming emitted (`"prd-trd"` or `"prd-only"`). Required — used in Step 5 to evaluate downstream `when:` expressions for `next`. If absent or any other value, emit `error` (the upstream contract is violated).
- `brainstorming_output` *(optional)*: `{intent, target, scope_hint, constraints[], acceptance}` — may be missing if router handed off `plan` directly.

If `brainstorming_output` is null, recover intent from the verb in `request` (same heuristic brainstorming uses for the plan-direct path: first-verb rule, default `add`).

## Output

The final message is always a single JSON object tagged by `outcome`. The `next` field is resolved in Step 5 below.

**done** — normal completion. File written to `.planning/{session_id}/PRD.md`:

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "next": "trd-writer" }
```

`next` is `"trd-writer"` when `brainstorming_outcome == "prd-trd"`, `"task-writer"` when `brainstorming_outcome == "prd-only"`. See Step 5.

**error** — payload defect, file conflict, or unrecoverable exploration gap:

```json
{ "outcome": "error", "session_id": "2026-04-19-...", "reason": "PRD.md already exists at <path>", "next": null }
```

The file path is deterministic from `session_id`; the main thread reconstructs it. If a file already exists at the target path, emit `error` — **never overwrite**. Re-generation is the main thread's call: it deletes the file first, then re-dispatches.

Never emit prose alongside the JSON. The main thread treats the final message as a machine-readable status line.

## Procedure

### Step 1 — Read the payload

Re-read `request` in full. Extract intent, target, and visible constraints from the payload. Note what is missing — anything you cannot answer from the payload alone becomes a candidate for Step 2 exploration or Open questions.

### Step 2 — Scoped codebase exploration (budget-capped)

You have a **tool-call budget of roughly 15 Read/Grep/Glob calls** for this phase. The goal is to ground the PRD in the actual codebase — not to audit it. Stop as soon as the question is answered.

Target-directed: use `target` (if present) to locate the file/module first, then decide exploration width:

- `scope_hint: multi-system` → expand to direct callers and sibling modules.
- Otherwise → stay within the target file/module.

Stop exploring when you can answer:

1. Where does the change land? (file/directory level)
2. What existing code/concepts does it interact with?
3. Are there constraints visible in the code (existing schemas, auth flows, config shape) that shape requirements?

Do not read unrelated files for context. Do not write summaries of what you read — only what's relevant to the PRD.

If the request is genuinely unknowable from code (e.g., pure UX decision, external integration), skip this step and note it in Open questions.

### Step 3 — Draft the PRD using the template

See `## PRD.md template` below for the exact structure. Fill each section — the placeholder ranges (e.g., "1–3 sentences") are sanity checks, not quotas.

**Writing rules**:

- Mirror the user's language in content (Korean request → Korean PRD body; headers stay English for machine-parseability).
- **Use concrete nouns the user wrote** — if they said "login page", don't rephrase to "authentication surface". Downstream (task-writer, evaluator) greps on user vocabulary; paraphrasing breaks traceability between PRD, TASKS, and validation.
- Acceptance criteria are checkboxes, each independently verifiable.
- **Don't restate the user's request as Goal verbatim.** Goal is the *outcome* — the thing you can later verify. If the request is "add 2FA to login" and Goal just echoes that, Acceptance criteria end up empty because "success" was never separated from "the ask". Goal should read as "after this change, X is true".
- Open questions are explicit — "assume X" is fine when you make a defensible call, but tag it `(assumed)`.

**Anti-patterns** (do not do):

- Engineering approach detail (which library, what interface). That's TRD/TASKS.
- Estimates in person-hours, sprints, or story points. Solo-dev project.
- "Nice to have" lists. If it's not in Goal or Acceptance, it's a Non-goal.

### Step 4 — Write the file

Create `.planning/{session_id}/` if it doesn't exist. Write `PRD.md`.

If the file already exists, halt and emit `{"outcome": "error", "session_id": "...", "reason": "PRD.md already exists at <path>", "next": null}`. Regeneration is the main thread's call — it deletes the old file first, then re-dispatches.

### Step 5 — Resolve `next` and emit

Perform the next-node lookup per `using-harness § Core loop` steps 3–5 against this skill's outgoing edges in `harness-flow.yaml`. Candidates: `trd-writer`, `task-writer` (both `depends_on` includes `prd-writer`, both have `trigger_rule: one_success`). Substitute `$brainstorming.output.outcome` with the `brainstorming_outcome` field from the payload, then evaluate each candidate's `when:` in flow.yaml order:

| `outcome` | `brainstorming_outcome` | trd-writer `when:` matches? | task-writer `when:` matches? | First match → `next` |
|---|---|---|---|---|
| `done` | `prd-trd` | yes | yes | `trd-writer` |
| `done` | `prd-only` | no | yes | `task-writer` |
| `error` | (any) | no (no edge handles `error`) | no | `null` |

Count the items under "Open questions". Emit the final JSON with the resolved `next`. That is your entire final message.

## PRD.md template

Err on the side of brevity — a reader should finish the PRD in under 2 minutes. If a section wants to grow beyond its range, that's usually a signal to split an Open question out, not to pad.

```markdown
# PRD — {one-line title from request}

Session: {session_id}
Created: {ISO date}

## 1. Problem

{1–3 sentences. Why we are doing this. User-perceivable, not implementation-framed.}

## 2. Goal

{1–3 bullets, each a verifiable outcome after the change.}

- {Outcome bullet 1}
- {Outcome bullet 2}

## 3. Non-goals

{1–4 explicit exclusions — things that could reasonably be scoped in but are not.}

- {Explicit exclusion 1}
- {Explicit exclusion 2}

## 4. Users & scenarios

{One short paragraph — who is affected and in what moment. Add personas only if
 multiple user types behave differently.}

## 5. Acceptance criteria

{2–6 checkboxes. Each must be independently verifiable.}

- [ ] {Verifiable condition 1}
- [ ] {Verifiable condition 2}
- [ ] ...

## 6. Constraints

{Enumerate every signal hit (`auth/` → security, `migrations/` → backward-compat)
 with a 1-line rationale. Empty only if no signals matched.}

## 7. Open questions

{Every unresolved decision that affects the spec. Empty if none.
 Format: "- Q: … (impact: …)".}
```

## Example — rendered PRD

Reference for the kind of concreteness expected at each section. Given the request `"Add 2FA to login page"` and payload `{brainstorming_output: {intent: "add", target: "login page", scope_hint: "subsystem", constraints: [], acceptance: null}}`:

````markdown
# PRD — Add 2FA to login page

Session: 2026-04-19-add-2fa-login
Created: 2026-04-19

## 1. Problem

The login page currently requires only a single factor (password). After credential theft there is no additional defense — a leaked credential alone grants entry.

## 2. Goal

- A 2FA code check must pass before a session is issued on successful login.

## 3. Non-goals

- SMS-based 2FA (TOTP only).
- 2FA recovery/reset flow (separate session).
- Force-logout of existing active sessions.

## 4. Users & scenarios

A returning user passes password verification on the login screen, is routed to a 2FA entry screen, enters a 6-digit TOTP, and is redirected home with a session issued. Users without 2FA configured flow through the existing path but see an enrollment banner after landing.

## 5. Acceptance criteria

- [ ] After password verification passes, the user is routed to the 2FA screen (no direct session issuance).
- [ ] A correct TOTP code issues a session and redirects to home.
- [ ] Three consecutive incorrect codes trigger a 30-second rate-limit.
- [ ] Users without 2FA configured flow through the existing path; an enrollment banner appears after landing.

## 6. Constraints

- **Security** (`path:auth/`, `keyword:login`): reuse the existing session cookie/JWT issuance path, but **no session issuance before 2FA passes**. Intermediate state is held only in a short-lived token (TTL ≤ 5 min).

## 7. Open questions

(none)
````

Note: the example is ~34 lines including blanks and sits at the **lower end** of every range — single Goal bullet, three Non-goals, four Acceptance checkboxes, one Constraint, zero Open questions. Sessions with `scope_hint: multi-system` typically grow Constraints and Open questions first; other sections expand within their ranges, not beyond.

## Edge cases

- **Request references files that don't exist**: investigate with Glob to confirm. If truly absent, add an Open question rather than inventing structure.
- **User requested one feature but payload implies multiple**: treat the payload as authoritative (brainstorming may have scoped it down). If the mismatch is large (e.g., request mentions 3 features, payload target covers 1), add an Open question.
- **Signals matched `auth/` or `security/`**: Constraints section *must* have an entry — downstream phases (trd-writer/task-writer, evaluator) cannot recover security requirements from code alone, and skipped constraints fail silently. Never elide, no matter how small the change feels.
- **Request in non-English language**: body in user's language, headers / field names in English. This keeps the file machine-parseable while staying readable for the user.
- **>2 open questions after drafting**: note them in the PRD's Open questions section and proceed to emit `done` — the next writer (trd-writer or task-writer) re-reads the PRD and surfaces blocking questions. Do not self-escalate; scope decisions stay with the main thread.

## Boundaries

- Writes only to `.planning/{session_id}/PRD.md`. **Do not touch ROADMAP.md or STATE.md** — the main thread owns those after receiving your return value.
- Do not invoke other agents or skills. You are an endpoint.
- Do not dispatch trd-writer or task-writer. The main thread follows harness-flow.yaml.
- Do not modify source code, even if you spot bugs during exploration. Note them in Open questions if load-bearing.
- Tool budget: ~15 Read/Grep/Glob calls total for Step 2. If you need more, something is wrong with the payload — halt and emit `error` with a `reason` describing the exhaustion.
