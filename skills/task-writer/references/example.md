# Rendered TASKS.md example (PRD + TRD both present)

Given the session from trd-writer's example (`2026-04-19-add-2fa-login`) with `.planning/2026-04-19-add-2fa-login/PRD.md` and `.planning/2026-04-19-add-2fa-login/TRD.md` already present:

````markdown
# TASKS — Add 2FA to login page

Session: 2026-04-19-add-2fa-login
Created: 2026-04-19
PRD: PRD.md
TRD: TRD.md

## Goal

Gate session issuance behind a **TOTP** check so that password-only compromise is insufficient to sign in. Preserve the existing password flow for users who have not yet enrolled.

## Architecture

A short-lived **intermediate token** (JWT, 5-minute TTL) is issued after password verification; the real session is only issued after the TOTP code is verified against the intermediate token. Rate limiting keys by intermediate-token id, not IP. Enrollment discovery is a UI-only banner on the landing page.

## Conventions

- Task IDs are stable (`task-1`, `task-2`, ...). Evaluator and executor reference by ID.
- A task is complete when every `Acceptance:` checkbox is satisfied with evidence.
- **Bold terms** are quoted verbatim from PRD/TRD. Do not rename them in code, tests, or commit messages.

---

### task-1 — Issue intermediate token from `/auth/login` on password success

**Depends:** (none)
**Files:**
- Modify: `src/auth/login.ts`
- Modify: `src/auth/session.ts` (expose `issueSession(userId)`)
- Test: `tests/auth/login.test.ts`

**Acceptance:**
- [ ] `/auth/login` success response returns `{ intermediate_token, expires_at }` instead of a session. (TRD §Interfaces & contracts)
- [ ] The **intermediate token** is a JWT signed with the existing session key, carries `pending_2fa: true`, and has a 5-minute TTL. (TRD §Approach)
- [ ] `issueSession(userId)` is exported from `src/auth/session.ts` for `totp.ts` to call. (TRD §Affected surfaces)
- [ ] Existing login tests updated: password-only success no longer yields a session. (PRD §Acceptance criteria)

**Notes:** Do not remove the old session-issuance path yet — `task-2` will call `issueSession` from the TOTP verify endpoint, and the old tests need to pass against the new contract before that lands.

---

### task-2 — Add `POST /auth/totp/verify` endpoint

**Depends:** task-1
**Files:**
- Create: `src/auth/totp.ts`
- Test: `tests/auth/totp.test.ts`

**Acceptance:**
- [ ] `POST /auth/totp/verify` consumes `{ intermediate_token, code }` and returns `{ session }` on success. (TRD §Interfaces & contracts)
- [ ] Verification uses `otplib` with default ±1 step window. (TRD §Dependencies, §Risks)
- [ ] On success, `issueSession(userId)` is called exactly once; the `jti` is marked consumed in the LRU (size 10k, TTL 5min). (TRD §Risks "Intermediate token replay")
- [ ] On rate-limit, response is `{ error: "rate_limited", retry_after_seconds }` and status 429. (TRD §Interfaces & contracts)
- [ ] Rate limit: 3 attempts per 30 seconds per **intermediate-token-id** (not IP). (PRD §Acceptance criteria, TRD §Approach)

**Notes:** Rate limit key is the `jti`, not the user id — the PRD criterion explicitly calls out shared-NAT false positives. Don't substitute IP even if it's simpler.

---

### task-3 — Render TOTP enrollment banner on landing page

**Depends:** (none)
**Files:**
- Modify: `src/pages/landing.tsx`
- Test: `tests/pages/landing.test.tsx`

**Acceptance:**
- [ ] Banner renders when `user.totp_enrolled === false`, not otherwise. (TRD §Approach)
- [ ] Banner failing to render does not break login. (TRD §Approach — "separable from the auth flow")

**Notes:** UI-only change; no backend coupling. Independent of task-1 and task-2 — can run in parallel.

---

## Self-Review

Performed by task-writer before emitting. Evaluator re-checks these claims.

- [x] Every PRD Acceptance criterion maps to at least one task's Acceptance bullet (or is deferred to Non-goals).
- [x] Every TRD Risks entry is referenced in the Notes of the task that creates the risk (or explicitly accepted as out-of-scope for this session).
- [x] No placeholder strings: "TBD", "similar to task N", "handle edge cases", "add error handling", "write tests for the above".
- [x] PRD/TRD vocabulary consistency: terms used in one task appear in the same form across all other tasks (no `TOTP` → `2FA` drift).
- [x] DAG is acyclic; no task depends transitively on itself.
- [x] No orphan task: every task is reachable from the set of root tasks (`Depends: (none)`), and every task either has a dependent or is a natural leaf.
````

Three tasks, DAG width 2 (task-1 and task-3 root, task-2 depends on task-1). Executor dispatches task-1 and task-3 in parallel, then task-2 after task-1 resolves.

The no-doc cases (TRD-only, PRD-only, neither) keep the same shape — just a smaller task count and Self-Review items about PRD/TRD trivially pass when there's nothing to map.
