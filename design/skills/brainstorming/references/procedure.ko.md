# Brainstorming — 전체 절차

`SKILL.md` 에서 참조하는 전체 Q&A 프로토콜. Step 0 → Phase A (A1–A4) → Phase B (B1–B7).

## Step 0 — 재개 숏서킷

`resume: true` 이면 `.planning/{session_id}/brainstorming.md` 를 먼저 확인한다. 파일이 존재하고 `## Recommendation` 아래에 `user approved: yes` 가 있다면 **다시 인테이크하지 않는다** — 파일의 `## Recommendation` 블록에서 경로를 읽어, 표준 경로 터미널 메시지 (`## Status: {route}` + `## Path: .planning/{session_id}/brainstorming.md` + "Proceeding to {next-skill}.") 로 턴을 마친다. 메인 스레드가 SKILL.md 의 "필수 다음 스킬" 마커에 따라 다음 미완료 phase 의 writer 를 dispatch 한다. 근거: 지난 세션에서 이미 결정한 경로를 다시 묻는 건 턴을 낭비하고 신뢰를 깎는다.

폴백: `brainstorming.md` 가 없지만 `.planning/{session_id}/ROADMAP.md` 에 `Complexity: X` 줄 (X ∈ prd-trd / prd-only / trd-only / tasks-only) 이 있고 **동시에** `brainstorming` phase 가 `[x]` 라면, 그 경로로 승인된 세션으로 간주하고, 가용한 상태로부터 `brainstorming.md` 를 작성하며 (`## A1.6 findings` 본문은 `- (skipped — resumed without prior file)` 사용), 경로 터미널 메시지를 emit 한다. 파일 기반 핸드오프 도입 이전에 시작된 세션을 위한 처리.

`resume: true` 인데 분류 기록이 아예 없다면 (예: Gate 1 중간에 끊긴 세션) 정상 진행 — Phase A 는 스킵하고 (router 가 `resume` 으로 분류했다는 건 사전 신호가 충분하다는 뜻) Phase B 부터 시작.

## Phase A — 명확화 (`route == "clarify"` 일 때만)

`route == "plan"` 또는 `route == "resume"` 이면 **Phase A 는 통째로 스킵**하고 B1 부터 시작. Router 가 이미 신호가 충분하다고 판정했으므로 재질의는 작업 중복이다.

### A1 — 추출 후 범위 평가

뭐라도 묻기 전에 순서대로 둘 다:

**(a) 요청에 이미 있는 것부터 채운다.** `request` 를 읽고 actionability 체크리스트 (`intent`, `target`, `scope_hint`, `constraints`, `acceptance`) 에서 이미 확정된 필드를 채운다. **진짜 빈 곳만** 물어본다. 요청에 답이 이미 있는 질문을 다시 던지는 건 명확화 단계의 가장 흔한 실패 패턴이다. 유저가 "refactor the DB layer for clarity" 라고 썼다면 `intent=refactor`, `target=DB layer` 는 이미 찬 상태 — 다시 묻지 않는다.

**(b) 범위 평가 — 한 세션인가 여러 세션인가?** 요청이 독립적인 여러 서브시스템을 기술하면 (예: "채팅·파일 스토리지·결제·분석이 있는 플랫폼 구축"), 필드 질문에 들어가기 **전에 즉시 플래그**한다. 분해 제안:

> "이건 여러 개의 독립된 서브 프로젝트로 보입니다: {리스트}. 한 세션은 하나의 일관된 조각을 소유해야 합니다. 어떤 것부터 시작하시겠어요? 나머지는 별도 세션이 됩니다."

유저가 하나를 고르면 선택된 서브 프로젝트를 작업 `request` 로 다룬다 (B7 에서 `brainstorming.md` 의 `## Request` 에 들어간다). 나머지 서브 프로젝트는 미래 세션이 된다 — 각 세션마다 router 가 새로 돈다.

유저가 다 한 세션에서 처리하자고 고집하면 진행하되 `constraints: ["deliberately-wide-scope"]` 를 기록해서 Phase B 가 prd-trd 쪽으로 기울게 한다.

명백히 단일 범위의 요청은 범위 체크 생략 — "src/auth/session.ts 의 로그인 타임아웃 버그 수정" 같은 요청에 "이게 하나의 프로젝트인가요?" 를 묻지 말 것.

### A1.5 — 모드 선택: explore vs. intake

A1(a) 추출과 A1(b) 범위 평가 후, 어느 서브-페이즈를 먼저 돌릴지 결정:

- **A-intake** (기본): A1(a) 가 `intent` 또는 `target` 중 하나라도 채웠으면 A-explore 를 건너뛰고 **A1.6 (코드베이스 peek) 을 먼저** 돌린 뒤 A2 로 간다. clarify 로 라우팅된 요청 대부분이 여기에 해당 — "make the auth code better" 는 intent 가 흐릿해도 target=auth 는 잡혀 있다.
- **A-explore**: `intent` **와** `target` **둘 다** 요청에서 추출 불가하거나, 유저가 명시적으로 아이디어 단계임을 신호할 때 ("아직 고민 중", "뭘 만들지 모르겠어", "AI 로 뭔가 해보고 싶은데 …", "I'm exploring", "not sure yet") 진입. 전제 자체가 비어 있는데 필드별로 캐묻는 건 유저가 뭘 원하는지 알기도 전에 심문하는 꼴이 된다. explore 가 intent + target 으로 수렴하면 그때 A1.6 이 돌아간다.

모드는 내부 라우팅 결정 — 유저는 모드 존재를 알 필요 없다. 대화는 끊김 없는 한 흐름의 Q&A 처럼 느껴져야 한다.

### A-explore — 발산 후 수렴

목표: **문제 공간**에서 intake 모드가 시작될 만큼 신호를 끌어내는 것. **해결책 제안이 아니다**.

허용되는 프롬프트:

- 동기에 대한 열린 질문 — "어떤 문제가 이걸 시작하게 했어요?" / "What pain point sparked this?"
- 문제 공간 이웃 — "혼자 쓸 거예요, 팀에 배포할 거예요?" / "Internal tool or user-facing?"
- 2–3 개 방향성 MC — 상위 *모양 카테고리*, 구현 NOT:
  - ✓ "알림 시스템이라면 — 푸시 / 이메일 / 인앱 중에 어디?"
  - ✓ "이메일 자동화라면 — 초안만 보조하는 건지, 자동 발송까지 가는 건지?"
  - ✗ "Pub/Sub vs cron vs polling 중에?" — 구현 선택, prd-writer / trd-writer 의 몫.
  - ✗ "Postgres 와 MongoDB 중에 어디?" — 동일.

절차:

1. 턴당 하나의 열린 질문 또는 방향성 MC 를 유저 언어로.
2. 매 응답마다 누적 대화 위에 A1(a) 를 다시 돌린다. `intent` 또는 `target` 이 드러났는가?
3. **둘 다** 어느 정도 안정화되면 (한 줄 요약을 유저가 동의할 만큼) 수렴 확인을 독립 메시지로:
   > "그러면 결국 {intent} {target} 방향이네요. 이제 나머지 디테일 잡아갈게요."
4. 다음 턴부터 **A1.6 (코드베이스 peek) 을 먼저** 돌린 뒤 A2 로 전이 — **explore 에서 이미 다룬 건 다시 묻지 않는다**. 채울 수 있는 필드는 미리 채우고 남은 빈 칸만 묻는다.

3 라운드 정도가 지나도 수렴이 안 되면:

- 직접 묻는다 — "한 방향을 정하기 어렵다면 일단 하나만 골라 시작하고 나머지는 다음 세션으로 미룰까요?"
- 그래도 안 잡히면 가장 구체적이었던 방향을 제안하고 진행. `constraints: ["explore-forced-pick: <방향>"]` 을 기록 — writer 가 토대가 얇음을 알게.

조기 종료 / 피벗은 동일 적용:

- "그냥 시작해줘" / "skip" / "너가 알아서" → A3. 채워진 필드 그대로 Phase B 진입 (얇은 `## Brainstorming output` — STATE 에 기록).
- 무관한 주제로 피벗 → `pivot` 터미널 블록으로 종료 (파일 작성 없음), 다음 턴에 router 가 돈다.

explore 를 같은 스킬에 두기 위한 경계 (이 선을 넘으면 brainstorming → writer 분리가 무너진다):

| 레이어 | Explore 모드 | 범위 밖 (writer 의 몫) |
| --- | --- | --- |
| 문제 공간 | 카테고리, 사용자, 트리거, why-now | — |
| 솔루션 모양 | 어떤 *종류*의 산출물 (도구 / 대시보드 / 파이프라인 / 봇) | — |
| 구현 | — | 라이브러리, 프레임워크, 아키텍처, 파일 구조 |

### A1.6 — 코드베이스 peek

intent + target 이 잡힌 시점에 한 번 돌린다. 요청에 해결 가능한 target 이 없을 때만 (순수 UX 결정, 로컬 아날로그가 없는 신규 외부 통합) 스킵 — A2 로 바로 진행하고, B7 시점에 `brainstorming.md` 의 `## A1.6 findings` 섹션 본문은 `- (skipped — no resolvable target)` 한 줄이 된다.

**Tool budget: ~10 Read/Grep/Glob calls.** 디자인 패스가 아니라 peek. 질문이 풀리는 순간 멈춘다.

이 단계 후 답할 수 있어야 할 것:

1. **target 확인** — 유저가 말한 파일/모듈이 실재하는가? 함수 이름은 실제 식별자인가, 패러프레이즈인가? (패러프레이즈면 두 형태 모두 `key_findings` 에 기록.)
2. **코드 가시 제약 surface** — 기존 schema, auth flow, 다른 코드가 의존하는 공개 인터페이스. A2 의 Q&A 재료가 됨.
3. **신호 탐지** — `auth/`, `migrations/`, `schema.*` 등을 `code_signals` 에 채워 B1 에 공급.
4. **명백한 mismatch 조기 catch** — 유저가 "추가" 라는데 함수가 이미 있음, 또는 "작은 변경" 이라는데 호출자가 12개. A2 에서 질문으로 surface, 조용히 결정 금지.

전형적 사용 패턴: 1–2 Glob/Grep 로 target 위치, 2–4 Read 로 target + 직접 의존성 (관련 라인 범위만), 2–3 Grep 으로 호출자 (`scope_hint` 가 subsystem/multi-system 일 때). budget 다 써도 target 안 잡히면 → 멈추고 한계를 `open_questions` 에 기록, A2 가 사용자에게 직접 묻게 한다.

이 단계는 솔루션 디자인, LOC 추정, 구현 선택지 추천, 파일 수정용이 **아니다** — 전체 경계는 SKILL.md "범위 밖" 참조.

산출: 작업 메모리에 보유하는 A1.6 findings 초안, B7 에서 확정되어 `.planning/{session_id}/brainstorming.md` 의 `## A1.6 findings` 섹션에 기록:

```markdown
## A1.6 findings
- files visited: src/auth/session.ts:42-78, src/auth/middleware.ts
- key findings:
  - issueSession() in src/auth/session.ts:42 — currently issues without TOTP check
  - middleware.ts:18 reads Bearer token only — no MFA hook
- code signals: auth/, schema:session
- open questions:
  - Should refresh tokens be revoked on TOTP enable?
```

`code signals` 는 경로 패턴 + 코드가 가시적으로 관여하는 개념 신호 (auth/login/schema/migration/config/dependency) 둘 다 나열. 여기 `open questions` = **사용자**가 A2 또는 Gate 1 에서 답해야 할 것 — PRD/TRD/TASKS 의 Open questions (작성된 문서의 사람 검토용) 와 구분.

A1.6 후 A2 로 전이.

### A2 — 빈 필드를 한 번에 하나씩 묻는다

**A1.6 발견을 질문에 활용한다.** 질문이 구체적인 코드에 ground 되면 더 잘 꽂힌다: "범위는 어디까지인가요?" 대신 "`issueSession` 이 `login.ts`, `oauth.ts`, `refresh.ts` 에서 호출되는데 — 이번 변경이 셋 다 손봐야 하나요, 아니면 login 만인가요?" 사용자가 같은 턴에 코드 해석을 정정하면서 필드 답도 줄 수 있다. 발견이 답을 이미 보여주는 질문은 건너뛴다 (예: A1.6 에서 호출자 셋이 보이면 "단일 파일인가 서브시스템인가?" 묻지 말 것).

A1.6 open question 항목 중 블로킹인 것은 A2 질문으로 승격 — 사용자는 이를 해결할 가장 싼 자리다.

우선순위 — **첫 번째 빈 필드부터 질문하되, 반드시 A1(a) 를 최신 답변 위에 다시 돌린 뒤에**. 유저 답 하나가 여러 필드를 동시에 채우는 경우가 흔하다 (예: "refactor session handling for clarity" → intent + target + 부분 scope 동시 충족). 매 턴마다 대화 전체를 재추출한 뒤 다음 질문을 고른다. 목록을 위→아래로 맹목적으로 타지 말 것.

1. **intent** — 보통 추론 가능. 애매할 때만: "Sounds like this is about {후보}. Which fits best?" MC: add / fix / refactor / migrate / remove / other. 유저의 동사가 다섯 개 중 어디에도 안 맞으면 `intent: "other"` 로 두고 **함께** `constraints` 에 `"intent-freeform: <동사>"` 를 추가 — Phase B 가 원 동사를 볼 수 있어야 한다.
2. **target** — "코드베이스의 어느 부분에 해당하나요?" 열린 질문, 후보가 보이면 MC.
3. **scope_hint** — "한 곳에 갇힌 변경인가요, 한 서브시스템 내인가요, 아니면 크로스-시스템인가요?" MC: single-file / subsystem / multi-system.
4. **constraints** — 컨텍스트에서 **그럴듯한 제약이 짚어질 때만** 묻는다. 예 (인증 변경 요청): "기존 세션에 대한 하위 호환 요구 있나요?" 막연한 프롬프트로 제약을 낚지 않는다.
5. **acceptance** — "완료 판정 기준이 뭐가 될까요?" 열린 질문.

규칙:

- **턴당 질문 하나.** 묶음 금지. 질문 폭격은 우리가 피하고 싶은 안티패턴이다.
- **가능하면 객관식.** 유저는 MC 를 더 빠르고 정확하게 답한다.
- **유저 언어로 질문.** 스킬 본문·필드명·규칙은 영어로 두되, 유저 대화는 유저 언어를 미러링.
- **질문에도 YAGNI.** 분류와 드래프팅에 필요한 것만 묻는다. 어떤 답이 와도 경로나 writer 의 초안을 바꾸지 않는 질문이면 묻지 말 것.
- **필수 필드 채워지면 중단.** 선택 필드가 비어도 괜찮다.

### A3 — 조기 종료

유저가 "그냥 시작", "일단 가자", "스킵", "너가 알아서" 비슷한 말을 하면 **즉시 중단**하고 현재 채워진 필드로 Phase B 진입. 건너뛴 필드는 `STATE.md` 의 `Last activity` 에 기록해서 하위가 `brainstorming.md` 가 얇음을 알게 한다:

```
Last activity: 2026-04-19 13:44 — brainstorming clarify exit (user-skip); missing: acceptance
```

얇은 파일은 실패가 아니다 — "정확성보다 속도" 라는 유저 신호다. Phase B 와 writer 는 얇은 `## Brainstorming output` 섹션을 만나면 빈 필드가 실제로 블로킹되는 순간에 자기가 좁은 범위로 다시 물어본다.

### A4 — 확인 후 진행

필수 체크리스트가 다 찼으면 **짧은 한 문단으로 확인** — 유저 언어로:

> "확인 — {intent} {target}, {scope_hint}. {constraint 요약이 있다면}. {acceptance 가 있다면}. 이제 경로를 고르겠습니다."

확인 메시지는 **독립된 한 메시지** — 경로 추천을 같이 묶지 않는다. **다음** 유저 턴에서:

- 수락 ("네", "좋아요", 무응답/정정 없음) → Phase B 로 진입 (B1 부터).
- 필드 정정 → A2 의 **그 필드만** 으로 돌아가서 재확인. 수정 ≠ 재시작; 이미 옳게 답한 필드는 다시 묻지 않는다.
- 피벗 또는 질문이었음 드러내기 → `pivot` / `exit-casual` 터미널 블록으로 종료 (엣지 케이스 참조), 파일 작성 없음.

## Phase B — 분류 + Gate 1

### B1 — 신호 탐지

세 종류의 신호:

**(a) 경로 신호 — 리터럴, 언어 무관.** `request`, `target`, `constraints`, 그리고 A1.6 `code signals` (B7 전엔 작업 메모리에 보유) 를 다음 파일 경로 패턴으로 스캔:

- `auth/`, `security/` — 인증·인가
- `schema.*`, `*/schema/` — DB 또는 API 스키마
- `migrations/` — DB 마이그레이션
- `package.json`, `*/package.json` — 의존성·버전 변경
- `config.ts`, `*.config.*` — 전역 설정

경로는 파일시스템 리터럴 — 어떤 언어든 동일하게 매칭. 히트는 `signals_matched: ["path:auth/", ...]` 로 기록. A1.6 가 이미 `code_signals` 에 히트를 기록했다면 재 grep 없이 그대로 카운트.

**(b) 키워드 신호 — 의미론적, 다국어.** 요청이 다음 개념을 의미론적으로 가리키는지: 인증, 로그인, 비밀번호, 세션, DB, 스키마, 마이그레이션, 설정, 의존성. 리터럴 아니라 개념 — "로그인", "認証", "authentification" 모두 auth/login. 히트는 `signals_matched: ["keyword:login", ...]` 로 기록.

**(c) `deliberately-wide-scope` 제약** (Phase A 에서 멀티서브시스템을 발견했는데 유저가 그대로 가자고 한 플래그): **암묵적 prd-trd 신호**. `signals_matched: ["constraint:deliberately-wide-scope"]` 로 기록.

### B2 — 파일 수 추정

정수 하나 N — 수정 + 신규 파일의 베스트-게스. A1.6 에서 어떤 파일을 방문했다면 그 카운트를 floor 로 사용; 아직 방문하지 않은 호출자/테스트만큼 외삽.

Calibration (대략 — 파일 수 자체로는 tier 를 결정하지 않고 nudge 만):

- 오타 / 포맷 / 주석만 → 1
- 단일 서브시스템 버그 수정 → 1–3
- 엔드포인트 하나 또는 페이지 하나 신규 → 2–4
- 여러 레이어 걸친 기능 → 5–12
- 크로스-커팅 마이그레이션 / 프레임워크 교체 → 10–30+

과하게 생각하지 않는다 — B6 에서 유저가 번복 가능. 추정 불가 (Phase A 도 안 돌아서 `target` 없음) → 기본 3, Gate 1 에 low-confidence 표시.

### B3 — 경로 판정

순서대로 적용:

1. `signals_matched` 에 어떤 엔트리든 있으면 → **prd-trd 후보** (파일 수 무관).
2. 그 외, intent 별:
   - `add` / `create` + N ≥ 5 → **prd-trd**
   - `add` / `create` + N < 5 → **prd-only**
   - `refactor` / `migrate` / `remove` → **trd-only**
   - `fix` + N ≤ 2 → **tasks-only 후보** (B4 통과 필요)
   - `other` + `constraints` 에 `intent-freeform` → freeform 동사 파싱: refactor-ish → trd-only, fix-ish → tasks-only 후보, create/add-ish → N ≥ 5 면 prd-trd 아니면 prd-only. 해석 불가 → prd-only.
   - `other` 또는 intent 없음 (freeform 단서도 없음) → **prd-only** (보수적 — 경량 PRD 는 잘못된 경로보다 싸다).

### B4 — tasks-only 자기검증

B3 에서 tasks-only 후보가 나왔을 때만 실행. 네 개 모두 체크:

- [ ] 명백한 버그 수정 / 오타 / 포맷 / 주석 수준인가?
- [ ] 예상 파일 ≤ 2 인가?
- [ ] 보안·아키텍처 신호 매칭 없는가?
- [ ] 요청에 "설계 필요" 단서 (새 용어 / 의도 모호 / 새 개념 언급) 가 없는가?

**하나라도 실패 → prd-only 로 승격** (최소한의 PRD 는 싼 보험). 전부 통과 → tasks-only 유지. 근거: "단순해 보이는" 작업이야말로 검증되지 않은 가정이 가장 많이 쌓이는 곳 — 이 게이트는 모델이 설계를 우회하도록 합리화하는 걸 막기 위한 것.

### B5 — Gate 1 — 추천 제시

유저 언어로 **독립 메시지** 한 번:

> "**{route}** ({expansion}) 추천. 예상 {N}파일. {신호 요약 또는 '보안·아키텍처 신호 없음'}. 진행할까요?"

예시:

- `"prd-only (PRD → Tasks) 추천. 예상 3파일, 보안 신호 없음. 진행할까요?"`
- `"prd-trd (PRD → TRD → Tasks) 추천. 예상 4파일, auth/ 를 건드림 (보안 민감). 진행할까요?"`
- `"tasks-only 추천. 오타 수정, 1파일, 신호 없음. 설계 건너뛰고 바로 태스크로 갈까요?"`

독립 메시지 — 터미널 상태 블록을 같이 붙이지 말 것. MC 암묵 제시 (수락 / 경로 변경 / 파일 수 조정). 다음 턴 대기.

### B6 — 응답 처리 (다음 유저 턴)

네 액션 중 하나로 분류:

- **수락** ("네", "진행", 무응답) → B7, `user_overrode: false`.
- **경로 번복** ("prd-trd 로 해줘") → B7, 유저 경로, `user_overrode: true`. 반박 X.
- **파일 수 번복** ("10파일쯤") → 새 N 으로 B3 재실행, B5 로 **한 번만** 돌아감. 두 번째 변경은 그 값 그대로 사용.
- **피벗 또는 casual** — 피벗 / exit-casual 터미널 블록으로 종료 (`## Status: pivot|exit-casual` + `## Reason: …`); `brainstorming.md` 작성 없음. "새 요청으로 보입니다; 라우팅으로 돌아갑니다." vs "작업 요청이 아닌 질문이었습니다." 피벗 시 ROADMAP/STATE 갱신 금지.

`intent` / `target` / `scope_hint` 명확화는 **여기서 하지 말 것** — Phase A 의 일. 빠져 있고 중요해 보이면 보수적 경로 (add → prd-only, refactor → trd-only) 로 넘기고 writer 단계에서 보강.

### B7 — 확정 + 파일 작성 + 터미널 메시지 (경로 outcome 전용)

수락 (번복 포함) 시:

1. **`ROADMAP.md` 갱신**:
   - 상단 근처에 `Complexity: {route} ({expansion})` 줄 추가/갱신.
   - `- [ ] brainstorming` → `- [x] brainstorming    → {route} (approved)`. `user_overrode` 면 `→ {route} (overridden from {recommended-route})` 로 표기. user_overrode 비트는 이 한 줄에만 산다 — 별도 `gate-1-approval` 체크박스는 두지 않는다 (Gate 1 이 brainstorming 에 흡수돼 두 줄로 표현하면 중복).
2. **`STATE.md` 갱신**:
   - `Current Position: {다음 phase — route 이름이 writer 를 함의}`
   - `Last activity: {ISO 타임스탬프} — classified as {route}{, 필요 시 user-overrode}`
3. **`.planning/{session_id}/brainstorming.md` 디스크에 작성** — 필수 구조 (SKILL.md "Terminal message" 또는 `../../harness-contracts/output-contract.ko.md` 참조):

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

   A1.6 가 스킵된 경우, `## A1.6 findings` 본문은 단 한 줄 `- (skipped — no resolvable target)`. `user approved: yes` 는 필수 — 파일은 B6 에서 Gate 1 수락이 있어야만 작성된다.

4. **턴을 경로 터미널 메시지로 종료**:

   ```markdown
   ## Status
   {prd-trd|prd-only|trd-only|tasks-only}

   ## Path
   .planning/{session_id}/brainstorming.md

   Proceeding to {next-skill}.
   ```

   메인 스레드는 SKILL.md 의 "필수 다음 스킬" 표에 따라 dispatch 하기 위해 `## Status` 를 읽고; writer 는 디스크에서 `brainstorming.md` 를 읽는다.
