# Brainstorming — Conversation Examples

Additional dialogue patterns referenced from `SKILL.md`. The trd-only auth-refactor case is kept inline in the skill body; this file holds the rest.

## Good — explore path, ideation → A1.6 → intake → prd-only

> User: "AI로 뭔가 만들어보고 싶은데 뭘 할지 모르겠어"
> Brainstorming: [A1(a) yields no intent or target → A1.5 picks A-explore]
> Brainstorming: "어떤 문제를 풀고 싶으세요? 일상 작업 자동화 / 데이터 분석 / 콘텐츠 생성 같은 큰 방향 중에 끌리는 게 있나요?"
> User: "음, 일상 자동화 쪽인 듯. 이메일 답장 같은 거"
> Brainstorming: "이메일 답장이라면 — 받은 메일에 초안을 만들어주는 보조인지, 자동 발송까지 가는 건지?"
> User: "초안만 만들어주는 거"
> Brainstorming: [A1(a) re-extract: intent=add (new tool), target=이메일 답장 초안 보조 — both pinned. Confirms convergence.]
> Brainstorming: "Sounds like we're building an email-reply draft assistant. Let me pin down the rest."
> [Next turn: runs A1.6 — Glob `src/email/**`, `src/integrations/**` → no existing email module; Grep `gmail|smtp|imap` → no hits. files_visited=[], key_findings=["no existing email integration in repo — greenfield"], code_signals=[], open_questions=[]]
> Brainstorming: "범위는 — 단일 메일 클라이언트 통합(예: Gmail)으로 시작할까요, 여러 클라이언트 지원이 필요한가요? (현재 코드에 메일 통합이 없어서 처음부터 짓는 그림입니다.)"
> User: "Gmail 만"
> Brainstorming: "확인 — add (new tool) email-reply draft assistant on Gmail, subsystem 범위. 이제 경로를 고르겠습니다."
> User: "ok"
> Brainstorming: "Recommend **prd-only** (PRD → Tasks). Estimated 3 files (greenfield), no security signals. Proceed?"
> User: "네"
> Brainstorming: [updates ROADMAP/STATE, writes `.planning/{id}/brainstorming.md`, ends with `## Status: prd-only` + `## Path: .planning/{id}/brainstorming.md` + "Proceeding to prd-writer."]

## Good — intake path with A1.6 grounded refinement

> User: "rate limiter 좀 손봐주세요. middleware/rateLimiter.ts 에 있어요"
> Brainstorming: [A1(a) extracts: intent=fix-or-refactor (ambiguous), target=middleware/rateLimiter.ts. A1.5 picks A-intake.]
> [Runs A1.6 — Read `middleware/rateLimiter.ts:1-80` → finds `keyByIp(req)` keying logic. Grep for `rateLimiter` callers → 3 hits in `routes/auth.ts`, `routes/api.ts`, `routes/webhook.ts`. files_visited=["middleware/rateLimiter.ts:1-80", "routes/{auth,api,webhook}.ts"], key_findings=["rateLimiter keys requests by IP only via keyByIp()", "called from 3 route files"], code_signals=[], open_questions=["does the change apply to all 3 callers or only some?"]]
> Brainstorming: "intent 가 두 가지로 읽히는데 — 버그를 고치는 건가요, 동작은 같지만 구조를 바꾸는 건가요? (코드 보니 IP 기반 keying 인데 NAT 사용자 이슈가 떠올랐다면 fix, 그냥 정리라면 refactor)"
> User: "fix 입니다. 공유 NAT 에서 한 명이 다 막아버려요"
> Brainstorming: "이해했어요. `routes/auth.ts`, `routes/api.ts`, `routes/webhook.ts` 세 곳에서 호출 중인데 — 셋 다 같은 키 정책으로 가나요, auth 만 더 엄격하게?"
> User: "셋 다 동일하게"
> Brainstorming: "확인 — fix rate limiter (IP→user-aware), `middleware/rateLimiter.ts` + 3 callers, subsystem. 이제 경로를 고르겠습니다."
> User: "ok"
> Brainstorming: "Recommend **prd-only** (PRD → Tasks). Estimated 4 files. Proceed?"
> User: "yes"
> Brainstorming: [updates ROADMAP/STATE, writes `.planning/{id}/brainstorming.md`, ends with `## Status: prd-only` + `## Path: .planning/{id}/brainstorming.md` + "Proceeding to prd-writer."]
>
> Note how A1.6 turned a vague "rate limiter 손봐주세요" into a question grounded in actual call sites. Without the peek, brainstorming would have asked "어디까지 영향이 가나요?" — which the user can't precisely answer without rereading the codebase themselves.

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

> User: "AI로 뭔가 만들어보고 싶어"
> Brainstorming: "OpenAI API vs Anthropic API vs 로컬 Ollama 중 어디로 갈까요?" ← implementation choice; that's prd-writer / trd-writer's job. Stay in problem-space ("어떤 문제를 풀고 싶으세요?") until intent + target are pinned, then hand off.

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
