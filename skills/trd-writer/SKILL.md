---
name: trd-writer
description: Use when a session needs its TRD.md drafted. Runs inside the trd-writer agent's isolated context — main conversation history is NOT available. Produces a single `.planning/{session_id}/TRD.md` from the input payload (plus the upstream PRD, if one exists), then emits a one-line path + outcome.
---

# TRD Writer

## Purpose

Produce **`TRD.md`** — the technical design that bridges PRD-level outcomes (what) and TASKS-level steps (how, step by step). One TRD per session, one format regardless of whether an upstream PRD exists. Solo-developer lens: enough detail to make the implementation trajectory obvious, nothing more. A reader should finish the TRD in under 3 minutes.

This skill is loaded by the `trd-writer` agent inside an isolated context. The **payload is your entire input** — you cannot see the main conversation. If `prd_path` is set in the payload, the PRD file is also authoritative input. Beyond those, investigate the codebase with Read/Grep/Glob; do not invent architecture.

## Why this exists

TRD is the one document that answers "what will actually change in code and why this shape?" — distinct from the PRD's outcome-framed requirements and the TASKS list's step-by-step instructions.

Sessions arrive in two shapes — `prd_path` set (PRD already fixed goal/acceptance/constraints, TRD expands them into concrete approach) or `prd_path: null` (technical-by-nature change, TRD is the first artifact). **Output shape is identical.** The only branch is Section 1 (Context), which reads slightly differently with or without a PRD citation; downstream doesn't care which upstream fed the TRD.

The main thread reasons in tiers (A/B/C/D) when dispatching writers — this skill does not. The only branch here is an input-driven null check on `prd_path`.

## Input payload

You receive this object from the main thread. Treat every field as authoritative:

- `session_id`: `"YYYY-MM-DD-{slug}"` — determines the output folder.
- `request`: the user's original turn, verbatim. **Read it carefully for tone and nuance** the structured fields drop.
- `prd_path` *(optional)*: `".planning/{session_id}/PRD.md"` if a PRD was produced upstream, `null` otherwise.
- `brainstorming_output` *(optional)*: `{intent, target, scope_hint, constraints[], acceptance}` — may be absent when the router went straight to classifier.

If `prd_path` is set but the file is unreadable or missing, halt and emit `{"outcome": "error", "session_id": "...", "reason": "PRD declared in payload but <path> not found"}`. Do not proceed by guessing — the payload is a contract from the main thread.

## Output

The final message is always a single JSON object tagged by `outcome`.

**done** — normal completion. File written to `.planning/{session_id}/TRD.md`:

```json
{ "outcome": "done", "session_id": "2026-04-19-..." }
```

**error** — payload defect, missing PRD, file conflict, or unrecoverable exploration gap:

```json
{ "outcome": "error", "session_id": "2026-04-19-...", "reason": "TRD.md already exists at <path>" }
```

The file path is deterministic from `session_id`; the main thread reconstructs it. If a file already exists at the target path, emit `error` — **never overwrite**. Re-generation is the main thread's call: it deletes the file first, then re-dispatches.

Never emit prose alongside the JSON. The main thread treats the final message as a machine-readable status line.

## Procedure

### Step 1 — Read the payload (and PRD if present)

Re-read `request` in full. If `prd_path` is set, read the PRD end-to-end and treat its Goal, Acceptance criteria, and Constraints as hard inputs — the TRD must satisfy them, not re-derive them. Extract target and visible constraints from the payload. Note what is missing — anything you cannot answer from payload + PRD alone becomes a candidate for Step 2 exploration or Open questions.

If `prd_path` is set and the file is missing/unreadable, emit the `error` outcome above and stop.

### Step 2 — Scoped codebase exploration (budget-capped)

You have a **tool-call budget of roughly 25 Read/Grep/Glob calls** for this phase. TRD decisions require seeing actual function signatures, existing abstractions, and data shapes — deeper than just locating where the change lands — which is why the budget is larger than a pure scope-locating pass would need. Stop as soon as the design question is answered.

Target-directed: locate the primary file/module first using, in order: `brainstorming_output.target` (if present), the PRD's subject (if `prd_path` set), or — as a last resort when both are absent — the first noun-phrase in `request` (e.g., `"Extract the auth middleware into its own package"` → `auth middleware`). Then decide exploration width:

- `scope_hint: multi-system` → walk outward to direct callers, sibling modules, and any shared abstractions the change touches.
- Otherwise → stay within the target file/module and its immediate dependencies.

Stop exploring when you can answer:

1. What concretely changes in code? (file-level, with function/class names visible)
2. What existing interfaces does it consume or expose?
3. What data flows through the change, and in what shape?
4. What else in the codebase depends on the surfaces you're touching?

If the request is genuinely design-unknowable from code alone (e.g., new external integration with no local analog), note it in Open questions and pick a defensible default marked `(assumed)`.

### Step 3 — Draft the TRD using the template

See `## TRD.md template` below for the exact structure. Fill each section — the placeholder ranges (e.g., "1–3 sentences") are sanity checks, not quotas.

**Writing rules**:

- Mirror the user's language in content (Korean request → Korean TRD body; headers stay English for machine-parseability).
- **Use concrete nouns from the PRD (if present) or user request.** If the PRD says "2FA screen", don't rephrase to "second-factor surface". Downstream (task-writer, evaluator) greps on this vocabulary; paraphrasing breaks traceability.
- Approach describes **the shape of the solution**, not a sequence of implementation steps. Step sequencing is task-writer's job.
- Interfaces & contracts are concrete: function signatures, request/response shapes, event names. Omit only if truly not adding/changing any.
- Risks are specific: "rate limiter keyed by IP misses shared-NAT users" beats "may have security issues".
- Open questions are explicit — "assume X" is fine when you make a defensible call, but tag it `(assumed)`.

**Anti-patterns** (do not do):

- Step-by-step task lists. That's TASKS.md.
- Re-stating the PRD's acceptance criteria verbatim. Reference them by section, don't duplicate.
- Library-choice theater (pro/con tables for well-known picks). State the choice and one-line rationale.
- Estimates in person-hours, sprints, or story points. Solo-dev project.

### Step 4 — Write the file

Create `.planning/{session_id}/` if it doesn't exist. Write `TRD.md`.

If the file already exists, halt and emit `{"outcome": "error", "session_id": "...", "reason": "TRD.md already exists at <path>"}`. Regeneration is the main thread's call — it deletes the old file first, then re-dispatches.

### Step 5 — Emit

Count the items under "Open questions". Emit the final JSON. That is your entire final message.

## TRD.md template

Err on the side of brevity — a reader should finish the TRD in under 3 minutes. If a section wants to grow beyond its range, that's usually a signal to split an Open question out, not to pad. Sections 4–6 (Interfaces, Data model, Dependencies) may legitimately be `N/A — <one-line reason>` when the change has none; do not pad them with unrelated content.

```markdown
# TRD — {one-line title from PRD or request}

Session: {session_id}
Created: {ISO date}
PRD: {relative path to PRD.md, or "(none)"}

## 1. Context

{1–3 sentences. If PRD exists, summarize the goal in TRD-relevant terms and
 cite the relevant PRD sections by heading name (not section number — headings
 are stable, numbering is positional and silently breaks if the PRD template
 is reordered). If no PRD, state the technical motivation drawn from the
 user request.}

## 2. Approach

{2–5 bullets describing the shape of the solution — the key design decisions,
 not implementation steps. Each bullet should answer "why this shape".}

- {Decision 1 + one-line rationale}
- {Decision 2 + one-line rationale}

## 3. Affected surfaces

{Files/modules that will be created or modified. Group by subsystem if
 crossing boundaries. 1-line note per entry on what changes.}

- `path/to/file.ext` — {what changes}
- `path/to/other.ext` — {what changes}

## 4. Interfaces & contracts

{Concrete signatures, request/response shapes, event names, CLI flags —
 anything that forms a contract with code outside this change. Use code
 blocks for signatures. "N/A — <reason>" if truly nothing added/changed.}

## 5. Data model

{Schemas, tables, persisted structures, message formats — any durable shape.
 "N/A — <reason>" if no persistence or schema change.}

## 6. Dependencies

{External libraries, services, feature flags, other in-flight work this
 depends on. "N/A — <reason>" if self-contained.}

## 7. Risks

{Specific failure modes and how the design mitigates or accepts them.
 Every auth/security/migration concern surfaced during exploration needs an
 entry — downstream phases (task-writer, evaluator) cannot recover those
 requirements from code alone, so a skipped risk fails silently.}

- {Risk 1}: {mitigation or explicit acceptance}
- {Risk 2}: {mitigation or explicit acceptance}

## 8. Open questions

{Every unresolved design decision that affects implementation. Empty if none.
 Format: "- Q: … (impact: …)".}
```

## Example 1 — rendered TRD (upstream PRD present)

Given the session from prd-writer's example (`2026-04-19-add-2fa-login`) with payload `{prd_path: ".planning/2026-04-19-add-2fa-login/PRD.md"}`:

````markdown
# TRD — Add 2FA to login page

Session: 2026-04-19-add-2fa-login
Created: 2026-04-19
PRD: PRD.md

## 1. Context

Extends the existing password login flow with a TOTP check before session issuance. Satisfies PRD's Goal and Acceptance criteria. Exclusions (SMS, recovery flow) per PRD's Non-goals.

## 2. Approach

- Intermediate short-lived token (JWT, TTL 5 min) issued after password verification, carrying `pending_2fa: true`. Rationale: keeps session issuance atomic on 2FA success without holding server-side pending-login state.
- TOTP verification endpoint consumes the intermediate token, issues the real session on success. Rationale: single place to enforce "no session before 2FA".
- Rate limit on the TOTP endpoint (3 attempts / 30s / intermediate-token-id). Rationale: PRD acceptance criterion; keying by token (not IP) avoids shared-NAT false positives.
- Enrollment banner is a UI-only change on the landing page, gated on `user.totp_enrolled == false`. Rationale: separable from the auth flow; failing to render doesn't block login.

## 3. Affected surfaces

- `src/auth/login.ts` — password check now returns intermediate token instead of session.
- `src/auth/totp.ts` — new module: verify endpoint, rate-limit, session issuance on success.
- `src/auth/session.ts` — expose `issueSession(userId)` for totp.ts to call.
- `src/pages/landing.tsx` — enrollment banner conditional render.

## 4. Interfaces & contracts

```ts
// POST /auth/login — success response (changed)
{ intermediate_token: string, expires_at: ISO8601 }

// POST /auth/totp/verify — new
// request
{ intermediate_token: string, code: string }
// response (success)
{ session: Session }
// response (rate-limited)
{ error: "rate_limited", retry_after_seconds: number }
```

## 5. Data model

No schema change. Intermediate token is stateless JWT signed with existing session key; `user.totp_secret` and `user.totp_enrolled` columns already exist.

## 6. Dependencies

- `otplib` (already in `package.json`) for TOTP verification.
- No new services, no feature flags.

## 7. Risks

- **Intermediate token replay**: token is single-use — verify endpoint marks `jti` as consumed in an in-memory LRU (size 10k, TTL 5min). Acceptable loss on process restart since TTL is already short.
- **Clock skew breaks TOTP**: `otplib` default window is ±1 step (30s). Document this; no change.

## 8. Open questions

(none)
````

Note: this example sits at the **lower end** of every range — single-file-module change, four bullets in Approach, four Affected surfaces entries, two Risks, zero Open questions. Sessions with `scope_hint: multi-system` typically grow Affected surfaces and Interfaces first (a subsystem-crossing change exposes more contracts), then Risks; other sections expand within their ranges, not beyond. The no-PRD variant below replaces Section 1 with a technical-motivation paragraph and typically grows Approach too, since the design rationale has no PRD to lean on.

## Example 2 — rendered TRD (no upstream PRD)

Given request `"Extract the auth middleware into its own package so we can share it with the admin API"` and payload `{prd_path: null, brainstorming_output: {scope_hint: "multi-system"}}`:

````markdown
# TRD — Extract auth middleware to shared package

Session: 2026-04-19-extract-auth-middleware
Created: 2026-04-19
PRD: (none)

## 1. Context

The auth middleware in `src/auth/middleware.ts` is duplicated in the upcoming admin API. Extracting it to `packages/auth-middleware` lets both consumers depend on one source. No behavior change intended.

## 2. Approach

- New workspace package `packages/auth-middleware`, exports the middleware factory and its dependency interface. Rationale: interface-based export lets each consumer inject its own session store and logger.
- Main app and admin API both import from the package; no code in `src/auth/middleware.ts` after extraction. Rationale: avoid drift by removing the original rather than leaving a shim.
- Session store stays in the main app (not extracted). Rationale: store implementation is app-specific (Redis schema, key prefix); only the middleware contract is shared.

## 3. Affected surfaces

- `packages/auth-middleware/` — new package (src/index.ts, package.json, tsconfig.json).
- `src/auth/middleware.ts` — deleted after extraction.
- `src/server.ts` — import path changes from `./auth/middleware` to `@internal/auth-middleware`.
- `pnpm-workspace.yaml` — add new package to workspace.
- `tsconfig.base.json` — path alias for `@internal/auth-middleware`.

## 4. Interfaces & contracts

```ts
// packages/auth-middleware/src/index.ts
export interface SessionStore {
  get(token: string): Promise<Session | null>;
}
export interface AuthMiddlewareOptions {
  store: SessionStore;
  logger?: { warn: (msg: string, meta?: object) => void };
}
export function createAuthMiddleware(opts: AuthMiddlewareOptions): Middleware;
```

## 5. Data model

N/A — extraction is behavior-preserving, no persisted shape changes.

## 6. Dependencies

- No new external deps. Package depends only on `express` types (devDep).

## 7. Risks

- **Import-path churn** (`path:auth/`): one main app module currently imports the middleware; bad extraction breaks server boot. Mitigation: typecheck + boot smoke test in the same task batch as the move.
- **Admin API not yet consuming**: extraction is "build the shared form now, use it next session". Risk is over-design for an imagined second consumer. Mitigation: keep the interface minimal (only what the current main-app call site needs); admin API can PR additions when it actually lands.

## 8. Open questions

- Q: Should the package publish to the internal registry now or stay workspace-only? (impact: admin API will live in a different repo; workspace-only means we revisit at that point. (assumed): workspace-only for now.)
````

~62 lines. One or two open questions is common when there's no upstream PRD, since scope was never pre-resolved.

## Edge cases

- **PRD exists but is thin/incomplete**: still treat it as authoritative; gaps become Open questions in the TRD. Do not "fix" the PRD from inside this skill — that's a main-thread decision.
- **Request references files that don't exist**: investigate with Glob to confirm. If truly absent, add an Open question rather than inventing structure.
- **Exploration surfaces `auth/` / `security/` / `migrations/` concerns**: the template's §7 rule applies regardless of how small the change feels — elision is the silent failure mode, so make the call explicit (even if the entry is "accepted: change is behavior-preserving").
- **No PRD and very thin request**: if `prd_path` is null, `request` is one sentence, and `brainstorming_output` is null, the upstream likely mis-routed. Proceed with best-effort TRD and flag the thinness as an Open question — the main thread decides whether to loop back.
- **Request in non-English language**: body in user's language, headers / field names / code identifiers in English. This keeps the file machine-parseable while staying readable for the user.
- **>2 open questions after drafting**: note them in the TRD's Open questions section and proceed to emit `done` — task-writer re-reads the TRD and surfaces blocking questions. Do not self-escalate; scope decisions stay with the main thread.

## Boundaries

- Writes only to `.planning/{session_id}/TRD.md`. **Do not touch PRD.md, ROADMAP.md, or STATE.md** — you are a downstream reader of PRD.md only, and the main thread owns the others.
- Do not invoke other agents or skills. You are an endpoint.
- Do not dispatch task-writer. The main thread follows harness-flow.yaml.
- Do not modify source code, even if you spot bugs during exploration. Note them in Open questions if load-bearing.
- Tool budget: ~25 Read/Grep/Glob calls total for Step 2. If you need more, something is wrong with the payload — halt and emit `error` with a `reason` describing the exhaustion.
