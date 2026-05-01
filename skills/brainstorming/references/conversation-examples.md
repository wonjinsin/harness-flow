# Brainstorming — Conversation Examples

Additional dialogue patterns referenced from `SKILL.md`. The trd-only auth-refactor case is kept inline in the skill body; this file holds the rest.

## Good — explore path, ideation → A1.6 → intake → prd-only

> User: "I want to build something with AI but I'm not sure what to do."
> Brainstorming: [A1(a) yields no intent or target → A1.5 picks A-explore]
> Brainstorming: "What problem are you trying to solve? Any of these broad directions appeal to you — automating everyday tasks / data analysis / content generation?"
> User: "Probably the everyday automation side. Something like email replies."
> Brainstorming: "For email replies — would it be an assistant that drafts replies to incoming mail, or would it go all the way to auto-sending?"
> User: "Just drafting, not auto-sending."
> Brainstorming: [A1(a) re-extract: intent=add (new tool), target=email-reply draft assistant — both pinned. Confirms convergence.]
> Brainstorming: "Sounds like we're building an email-reply draft assistant. Let me pin down the rest."
> [Next turn: runs A1.6 — Glob `src/email/**`, `src/integrations/**` → no existing email module; Grep `gmail|smtp|imap` → no hits. files_visited=[], key_findings=["no existing email integration in repo — greenfield"], code_signals=[], open_questions=[]]
> Brainstorming: "For scope — start with a single mail client integration (e.g. Gmail), or do you need multi-client support? (There's no existing mail integration in the code, so this would be built from scratch.)"
> User: "Gmail only."
> Brainstorming: "Confirmed — add (new tool) email-reply draft assistant on Gmail, subsystem scope. Let me pick a route now."
> User: "ok"
> Brainstorming: "Recommend **prd-only** (PRD → Tasks). Estimated 3 files (greenfield), no security signals. Proceed?"
> User: "Yes."
> Brainstorming: [updates ROADMAP/STATE, writes `.planning/{id}/brainstorming.md`, ends with `## Status: prd-only` + `## Path: .planning/{id}/brainstorming.md` + "Proceeding to prd-writer."]

## Good — intake path with A1.6 grounded refinement

> User: "Could you look at the rate limiter? It's in middleware/rateLimiter.ts."
> Brainstorming: [A1(a) extracts: intent=fix-or-refactor (ambiguous), target=middleware/rateLimiter.ts. A1.5 picks A-intake.]
> [Runs A1.6 — Read `middleware/rateLimiter.ts:1-80` → finds `keyByIp(req)` keying logic. Grep for `rateLimiter` callers → 3 hits in `routes/auth.ts`, `routes/api.ts`, `routes/webhook.ts`. files_visited=["middleware/rateLimiter.ts:1-80", "routes/{auth,api,webhook}.ts"], key_findings=["rateLimiter keys requests by IP only via keyByIp()", "called from 3 route files"], code_signals=[], open_questions=["does the change apply to all 3 callers or only some?"]]
> Brainstorming: "This reads as one of two things — are you fixing a bug, or restructuring the code while keeping the same behaviour? (The code uses IP-based keying, so if shared-NAT users are getting blocked that sounds like a fix; if it's just cleanup, that's a refactor.)"
> User: "It's a fix. One user on a shared NAT is blocking everyone else."
> Brainstorming: "Got it. It's called from three places — `routes/auth.ts`, `routes/api.ts`, `routes/webhook.ts`. Should all three get the same new key policy, or should auth be more strict?"
> User: "All three the same."
> Brainstorming: "Confirmed — fix rate limiter (IP→user-aware), `middleware/rateLimiter.ts` + 3 callers, subsystem. Let me pick a route now."
> User: "ok"
> Brainstorming: "Recommend **prd-only** (PRD → Tasks). Estimated 4 files. Proceed?"
> User: "yes"
> Brainstorming: [updates ROADMAP/STATE, writes `.planning/{id}/brainstorming.md`, ends with `## Status: prd-only` + `## Path: .planning/{id}/brainstorming.md` + "Proceeding to prd-writer."]
>
> Note how A1.6 turned a vague "could you look at the rate limiter?" into a question grounded in actual call sites. Without the peek, brainstorming would have asked "how far does the impact reach?" — which the user can't precisely answer without rereading the codebase themselves.

## Good — plan path (skip Phase A), signal promotion to prd-trd

> Router terminal: `## Status: plan` + `## Session: {id}` (request "add 2FA to login")
> Brainstorming: [skips Phase A; B1 hits `auth/` + `keyword:login`]
> Brainstorming: "Recommend **prd-trd** (PRD → TRD → Tasks). Estimated 4 files, touches `auth/` (security-sensitive). Proceed?"
> User: "yeah"
> Brainstorming: [updates ROADMAP/STATE, writes `.planning/{id}/brainstorming.md`, ends with `## Status: prd-trd` + `## Path: .planning/{id}/brainstorming.md` + "Proceeding to prd-writer."]

## Good — tasks-only self-check fails, demoted to prd-only

> Request: "fix the expired-session bug in login"
> intent: fix, N=2 — tasks-only candidate → B1 hits `auth/` → promoted to prd-only
> Brainstorming: "Initially looked like a tasks-only fix, but it touches `auth/` — recommending **prd-only** (PRD → Tasks) instead. 2 files. Proceed, or escalate to prd-trd?"

## Good — user overrides route

> Brainstorming: "Recommend prd-only …"
> User: "Nah, just tasks-only, it's one line"
> Brainstorming: "Got it — tasks-only, user override. Skipping design. Proceeding to task-writer."
> [updates ROADMAP/STATE with `user_overrode: true`, writes `.planning/{id}/brainstorming.md`, ends with `## Status: tasks-only` + `## Path: .planning/{id}/brainstorming.md` + "Proceeding to task-writer."]

## Good — catching multi-project scope before drilling into fields

> User: "build a complete CRM — leads, deals, reporting, email integration, and mobile app"
> Brainstorming: "This looks like several distinct sub-projects: leads/deals management, reporting, email integration, mobile app. One session should own one coherent piece — which do you want to start with? The others can be separate sessions."

## Bad — batched questions

> Brainstorming: "I need to know: (1) intent, (2) target, (3) scope, (4) constraints, (5) acceptance criteria. Please provide all five."

## Bad — proposing approaches (not this skill's job)

> Brainstorming: "Here are three approaches: A) rename only, B) extract functions, C) rewrite from scratch. Which do you prefer?"

## Bad — explore mode crossing into implementation

> User: "I want to build something with AI."
> Brainstorming: "OpenAI API vs Anthropic API vs local Ollama — which would you prefer?" ← implementation choice; that's prd-writer / trd-writer's job. Stay in problem-space ("What problem are you trying to solve?") until intent + target are pinned, then hand off.

## Bad — re-asking what the request already said

> User request: "fix the login timeout bug in src/auth/session.ts"
> Brainstorming: "What kind of change is this?"
> (intent, target, and scope are all obvious from the request — A1.6 should run, then jump to acceptance or route recommendation)

## Bad — A1.6 trying to design the solution

> User: "add 2FA to login"
> [Runs A1.6 — but instead of locating existing auth surfaces, starts reading TOTP libraries and comparing implementation approaches]
> Brainstorming: "I see otplib and speakeasy are both options — which would you prefer?" ← implementation choice, that's prd-writer / trd-writer's job. A1.6 should answer "where does this land + what already exists" only; library choice belongs downstream.

## Bad — A1.6 silently rewriting findings when user contradicts

> Brainstorming: [A1.6 finds `issueSession()`; key_findings noted]
> User: "I meant the function called `createSession`, not whatever you're seeing"
> Brainstorming: [silently overwrites key_findings to match user's claim] ← if the code says one thing and the user says another, that's an open_question, not a silent edit. The user might be wrong; the writer needs to know the discrepancy exists.

## Bad — silent commit (Gate 1 must be explicit)

> Brainstorming: [writes ROADMAP without asking user]

## Bad — arguing with user override

> User: "just do tasks-only"
> Brainstorming: "Are you sure? It's touching auth/, I recommend prd-trd. Shall I reconsider?" ← the user has already decided; log `user_overrode: true` and move on
