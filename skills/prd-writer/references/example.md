# Rendered PRD example

Reference for the kind of concreteness expected at each section. Given the request `"Add 2FA to login page"` and a `brainstorming.md` whose `## Brainstorming output` lists intent: add, target: login page, scope: subsystem, constraints: (none), acceptance: (open):

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

This example is ~34 lines including blanks and sits at the **lower end** of every range — single Goal bullet, three Non-goals, four Acceptance checkboxes, one Constraint, zero Open questions. Sessions with `scope_hint: multi-system` typically grow Constraints and Open questions first; other sections expand within their ranges, not beyond.
