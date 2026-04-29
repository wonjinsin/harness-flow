# Brainstorming — 대화 예시

`SKILL.md` 에서 참조하는 추가 대화 패턴. trd-only 인증 리팩토링 케이스는 스킬 본문에 인라인으로 유지; 이 파일에는 나머지가 있다.

## 좋은 예 — explore 경로, 아이디어 단계 → A1.6 → intake → prd-only

> User: "AI로 뭔가 만들어보고 싶은데 뭘 할지 모르겠어"
> Brainstorming: [A1(a) 결과 intent / target 둘 다 비어 있음 → A1.5 가 A-explore 선택]
> Brainstorming: "어떤 문제를 풀고 싶으세요? 일상 작업 자동화 / 데이터 분석 / 콘텐츠 생성 같은 큰 방향 중 끌리는 게 있나요?"
> User: "음, 일상 자동화 쪽인 듯. 이메일 답장 같은 거"
> Brainstorming: "이메일 답장이라면 — 받은 메일에 초안을 만들어주는 보조인지, 자동 발송까지 가는 건지?"
> User: "초안만 만들어주는 거"
> Brainstorming: [A1(a) 재추출: intent=add (신규 도구), target=이메일 답장 초안 보조 — 둘 다 잡힘. 수렴 확인.]
> Brainstorming: "그러면 결국 이메일 답장 초안 보조 도구를 만드는 방향이네요. 이제 나머지 디테일 잡아갈게요."
> [다음 턴: A1.6 실행 — Glob `src/email/**`, `src/integrations/**` → 기존 메일 모듈 없음; Grep `gmail|smtp|imap` → 히트 없음. files_visited=[], key_findings=["repo 에 기존 메일 통합 없음 — greenfield"], code_signals=[], open_questions=[]]
> Brainstorming: "범위는 — 단일 메일 클라이언트 통합(예: Gmail)으로 시작할까요, 여러 클라이언트 지원이 필요한가요? (현재 코드에 메일 통합이 없어서 처음부터 짓는 그림입니다.)"
> User: "Gmail 만"
> Brainstorming: "확인 — add (신규 도구) 이메일 답장 초안 보조 (Gmail), subsystem 범위. 이제 경로를 고르겠습니다."
> User: "ok"
> Brainstorming: "**prd-only** (PRD → Tasks) 추천. 예상 3파일 (greenfield), 보안 신호 없음. 진행할까요?"
> User: "네"
> Brainstorming: [확정, `{"outcome": "prd-only", ..., "exploration_findings": {...}}` emit]

## 좋은 예 — intake 경로 + A1.6 grounded refinement

> User: "rate limiter 좀 손봐주세요. middleware/rateLimiter.ts 에 있어요"
> Brainstorming: [A1(a) 추출: intent=fix-or-refactor (모호), target=middleware/rateLimiter.ts. A1.5 가 A-intake 선택.]
> [A1.6 실행 — Read `middleware/rateLimiter.ts:1-80` → `keyByIp(req)` keying 로직 발견. Grep `rateLimiter` 호출자 → `routes/auth.ts`, `routes/api.ts`, `routes/webhook.ts` 3 hits. files_visited=["middleware/rateLimiter.ts:1-80", "routes/{auth,api,webhook}.ts"], key_findings=["rateLimiter 가 keyByIp() 로 IP 기반 keying", "3개 라우트 파일에서 호출"], code_signals=[], open_questions=["변경이 3개 호출자 모두에 적용되나, 일부만인가?"]]
> Brainstorming: "intent 가 두 가지로 읽히는데 — 버그를 고치는 건가요, 동작은 같지만 구조를 바꾸는 건가요? (코드 보니 IP 기반 keying 인데 NAT 사용자 이슈가 떠올랐다면 fix, 그냥 정리라면 refactor)"
> User: "fix 입니다. 공유 NAT 에서 한 명이 다 막아버려요"
> Brainstorming: "이해했어요. `routes/auth.ts`, `routes/api.ts`, `routes/webhook.ts` 세 곳에서 호출 중인데 — 셋 다 같은 키 정책으로 가나요, auth 만 더 엄격하게?"
> User: "셋 다 동일하게"
> Brainstorming: "확인 — fix rate limiter (IP→user-aware), `middleware/rateLimiter.ts` + 3 callers, subsystem. 이제 경로를 고르겠습니다."
> User: "ok"
> Brainstorming: "**prd-only** (PRD → Tasks) 추천. 예상 4파일. 진행할까요?"
> User: "네"
> Brainstorming: [확정, `{"outcome": "prd-only", ..., "exploration_findings": {...}}` emit]
>
> A1.6 가 모호한 "rate limiter 손봐주세요" 를 실제 호출 지점에 ground 된 질문으로 바꿨음에 주목. peek 없이는 brainstorming 이 "어디까지 영향이 가나요?" 를 물었을 텐데 — 사용자도 코드를 다시 안 읽고는 정확히 답할 수 없는 질문.

## 좋은 예 — plan 경로 (Phase A 스킵), 신호 승격

> Router output: `{outcome: "plan", request: "로그인에 2FA 추가", session_id: "..."}`
> Brainstorming: [Phase A 스킵; B1 이 `auth/` + `keyword:login` 히트]
> Brainstorming: "**prd-trd** (PRD → TRD → Tasks) 추천. 예상 4파일, `auth/` 를 건드림 (보안 민감). 진행할까요?"
> User: "좋아"
> Brainstorming: [확정, `{"outcome": "prd-trd", ...}` emit]

## 좋은 예 — tasks-only 자기검증 실패 후 prd-only 로 강등

> 요청: "로그인의 세션 만료 버그 수정"
> intent: fix, N=2 — tasks-only 후보 → B1 이 `auth/` 히트 → prd-only 승격
> Brainstorming: "처음엔 tasks-only 수정으로 보였는데 `auth/` 를 건드립니다 — 대신 **prd-only** (PRD → Tasks) 추천. 2파일. 진행할까요, prd-trd 로 승격할까요?"

## 좋은 예 — 유저 경로 번복

> Brainstorming: "prd-only 추천…"
> User: "아니 그냥 tasks-only 로, 한 줄짜리야"
> Brainstorming: "알겠습니다 — tasks-only, 유저 번복. 설계 건너뛰고 task-writer 로 진행."
> [`user_overrode: true` 로 확정]

## 좋은 예 — 필드 파기 전에 다중 프로젝트를 잡아냄

> User: "리드 / 딜 / 리포팅 / 이메일 통합 / 모바일 앱이 있는 완전한 CRM 을 만들자"
> Brainstorming: "이건 여러 서브 프로젝트로 보입니다: 리드/딜 관리, 리포팅, 이메일 통합, 모바일 앱. 한 세션은 하나의 일관된 조각을 소유해야 합니다 — 어떤 것부터 시작하시겠어요?"

## 나쁜 예 — 질문 폭격

> Brainstorming: "다음을 알려주세요: (1) intent, (2) target, (3) scope, (4) constraints, (5) acceptance — 다섯 개 다 부탁합니다."

## 나쁜 예 — 접근법 제안

> Brainstorming: "세 가지 방법이 있습니다: A) 이름만 바꾸기 B) 함수 추출 C) 전면 재작성. 뭐가 좋을까요?"

## 나쁜 예 — explore 모드가 구현으로 넘어감

> User: "AI로 뭔가 만들어보고 싶어"
> Brainstorming: "OpenAI API / Anthropic API / 로컬 Ollama 중에 어디로 갈까요?" ← 구현 선택; prd-writer / trd-writer 의 몫. intent + target 이 잡힐 때까지 문제 공간에 머물 것 ("어떤 문제를 풀고 싶으세요?").

## 나쁜 예 — 요청에 이미 있는 걸 되묻기

> User 요청: "fix the login timeout bug in src/auth/session.ts"
> Brainstorming: "어떤 종류의 변경인가요?"
> (intent / target / scope 가 요청에 다 있음 — A1.6 돌리고 acceptance 또는 경로 추천으로)

## 나쁜 예 — A1.6 가 솔루션을 디자인하려 함

> User: "로그인에 2FA 추가"
> [A1.6 실행 — 그런데 기존 auth 표면 위치 파악 대신 TOTP 라이브러리를 읽고 구현 접근법을 비교하기 시작]
> Brainstorming: "otplib 와 speakeasy 가 옵션인데 어느 쪽이 나으시겠어요?" ← 구현 선택, prd-writer / trd-writer 의 몫. A1.6 는 "어디 떨어지고 + 기존에 뭐가 있나" 만 답해야 함; 라이브러리 선택은 하류 단계.

## 나쁜 예 — 사용자가 반박할 때 A1.6 발견을 silent 로 덮어쓰기

> Brainstorming: [A1.6 가 `issueSession()` 발견; key_findings 기록]
> User: "내가 말한 건 `createSession` 인데, 보고 있는 거 말고"
> Brainstorming: [사용자 주장에 맞게 key_findings 를 silent 로 덮어씀] ← 코드와 사용자가 다른 말을 하면 그건 open_question 이지 silent edit 아니다. 사용자가 틀렸을 수 있고, writer 가 그 불일치 존재를 알아야 함.

## 나쁜 예 — 조용한 확정 (Gate 1 은 반드시 명시적)

> Brainstorming: [유저에게 묻지 않고 ROADMAP 에 쓰기]

## 나쁜 예 — 유저 번복에 반박

> User: "그냥 tasks-only 로"
> Brainstorming: "확실한가요? auth/ 를 건드려서 prd-trd 를 권장하는데, 재고해 주시겠어요?" ← 유저가 이미 결정함; `user_overrode: true` 기록하고 진행
