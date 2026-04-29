# Rendered TRD example (upstream PRD present)

Given the session from prd-writer's example (`2026-04-19-add-2fa-login`) with `.planning/2026-04-19-add-2fa-login/PRD.md` already present:

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

This example sits at the **lower end** of every range — single-file-module change, four bullets in Approach, four Affected surfaces entries, two Risks, zero Open questions. Sessions with `scope_hint: multi-system` typically grow Affected surfaces and Interfaces first (a subsystem-crossing change exposes more contracts), then Risks.

The no-PRD case differs only in §1 (Context) wording — the TRD body shape is identical.
