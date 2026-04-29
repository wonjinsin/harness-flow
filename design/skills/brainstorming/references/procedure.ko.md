# Brainstorming — 전체 절차

`SKILL.md` 에서 참조하는 전체 Q&A 프로토콜. Step 0 → Phase A (A1–A4) → Phase B (B1–B7).

## Step 0 — 재개 숏서킷

`resume: true` 이면 `.planning/{session_id}/ROADMAP.md` 를 읽는다. `Complexity: X` 줄 (X ∈ prd-trd / prd-only / trd-only / tasks-only) 이 있고 **동시에** `brainstorming` phase 가 `[x]` 면 **다시 인테이크하지 않는다**. 다음 미완료 phase 로 향하는 경로 payload 를 emit 하고 종료 (메인 thread 가 거기서 SKILL.md 의 "Required next skill" 마커를 따라간다). 근거: 지난 세션에서 이미 결정한 경로를 다시 묻는 건 턴을 낭비하고 신뢰를 깎는다.

`resume: true` 인데 분류 기록이 없으면 (예: Gate 1 중간에 끊긴 세션) Phase A 를 건너뛰고 Phase B 부터 정상 진행 (router 가 `resume` 으로 분류했다는 건 사전 신호가 충분하다는 뜻).

## Phase A — 명확화 (`route == "clarify"` 일 때만)

`route == "plan"` 또는 `route == "resume"` 이면 **Phase A 는 통째로 스킵**하고 B1 부터 시작. Router 가 이미 신호가 충분하다고 판정했으므로 재질의는 작업 중복이다.

### A1 — 추출 후 범위 평가

뭐라도 묻기 전에 순서대로 둘 다:

**(a) 요청에 이미 있는 것부터 채운다.** `request` 를 읽고 actionability 체크리스트 (`intent`, `target`, `scope_hint`, `constraints`, `acceptance`) 에서 이미 확정된 필드를 채운다. **진짜 빈 곳만** 물어본다. 요청에 답이 이미 있는 질문을 다시 던지는 건 명확화 단계의 가장 흔한 실패 패턴이다. 유저가 "refactor the DB layer for clarity" 라고 썼다면 `intent=refactor`, `target=DB layer` 는 이미 찬 상태 — 다시 묻지 않는다.

**(b) 범위 평가 — 한 세션인가 여러 세션인가?** 요청이 독립적인 여러 서브시스템을 기술하면 (예: "채팅·파일 스토리지·결제·분석이 있는 플랫폼 구축"), 필드 질문에 들어가기 **전에 즉시 플래그**한다. 분해 제안:

> "이건 여러 개의 독립된 서브 프로젝트로 보입니다: {리스트}. 한 세션은 하나의 일관된 조각을 소유해야 합니다. 어떤 것부터 시작하시겠어요? 나머지는 별도 세션이 됩니다."

유저가 하나를 고르면 payload 의 `request` 를 그 서브 프로젝트 설명으로 교체하고 진행. 나머지 서브 프로젝트는 미래 세션이 된다 — 각 세션마다 router 가 새로 돈다.

유저가 다 한 세션에서 처리하자고 고집하면 진행하되 `constraints: ["deliberately-wide-scope"]` 를 기록해서 Phase B 가 prd-trd 쪽으로 기울게 한다.

명백히 단일 범위의 요청은 범위 체크 생략 — "src/auth/session.ts 의 로그인 타임아웃 버그 수정" 같은 요청에 "이게 하나의 프로젝트인가요?" 를 묻지 말 것.

### A2 — 빈 필드를 한 번에 하나씩 묻는다

우선순위 — **첫 번째 빈 필드부터 질문하되, 반드시 A1(a) 를 최신 답변 위에 다시 돌린 뒤에**. 유저 답 하나가 여러 필드를 동시에 채우는 경우가 흔하다 (예: "refactor session handling for clarity" → intent + target + 부분 scope 동시 충족). 매 턴마다 대화 전체를 재추출한 뒤 다음 질문을 고른다. 목록을 위→아래로 맹목적으로 타지 말 것.

1. **intent** — 보통 추론 가능. 애매할 때만: "Sounds like this is about {후보}. Which fits best?" MC: add / fix / refactor / migrate / remove / other. 유저의 동사가 다섯 개 중 어디에도 안 맞으면 `intent: "other"` 로 두고 **함께** `constraints` 에 `"intent-freeform: <동사>"` 를 추가 — Phase B 가 원 동사를 볼 수 있어야 한다.
2. **target** — "코드베이스의 어느 부분에 해당하나요?" 열린 질문, 후보가 보이면 MC.
3. **scope_hint** — "한 곳에 갇힌 변경인가요, 한 서브시스템 내인가요, 아니면 크로스-시스템인가요?" MC: single-file / subsystem / multi-system.
4. **constraints** — 컨텍스트에서 **그럴듯한 제약이 짚어질 때만** 묻는다. 예 (인증 변경 요청): "기존 세션에 대한 하위 호환 요구 있나요?" 막연한 프롬프트로 제약을 낚지 않는다.
5. **acceptance** — "완료 판정 기준이 뭐가 될까요?" 열린 질문.

규칙:

- **턴당 질문 하나.** 묶음 금지.
- **가능하면 객관식.** 유저는 MC 를 더 빠르고 정확하게 답한다.
- **유저 언어로 질문.** 스킬 본문·필드명·규칙은 영어로 두되, 유저 대화는 유저 언어를 미러링.
- **질문에도 YAGNI.** 분류와 드래프팅에 필요한 것만 묻는다. 어떤 답이 와도 경로나 writer 의 초안을 바꾸지 않는 질문이면 묻지 말 것.
- **필수 필드 채워지면 중단.** 선택 필드가 비어도 괜찮다.

### A3 — 조기 종료

유저가 "그냥 시작", "일단 가자", "스킵", "너가 알아서" 비슷한 말을 하면 **즉시 중단**하고 현재 채워진 필드로 Phase B 진입. 건너뛴 필드는 `STATE.md` 의 `Last activity` 에 기록해서 하위가 payload 가 얇음을 알게 한다:

```
Last activity: 2026-04-19 13:44 — brainstorming clarify exit (user-skip); missing: acceptance
```

얇은 payload 는 실패가 아니다 — "정확성보다 속도" 라는 유저 신호다. Phase B 와 writer 는 빈 필드가 실제로 블로킹되는 순간에 자기가 좁은 범위로 다시 물어본다.

### A4 — 확인 후 진행

필수 체크리스트가 다 찼으면 **짧은 한 문단으로 확인** — 유저 언어로:

> "확인 — {intent} {target}, {scope_hint}. {constraint 요약이 있다면}. {acceptance 가 있다면}. 이제 경로를 고르겠습니다."

확인 메시지는 **독립된 한 메시지** — 경로 추천을 같이 묶지 않는다. **다음** 유저 턴에서:

- 수락 ("네", "좋아요", 무응답/정정 없음) → Phase B 로 진입 (B1 부터).
- 필드 정정 → A2 의 **그 필드만** 으로 돌아가서 재확인. 수정 ≠ 재시작; 이미 옳게 답한 필드는 다시 묻지 않는다.
- 피벗 또는 질문이었음 드러내기 → `pivot` / `exit-casual` payload emit (엣지 케이스 참조) 후 종료.

## Phase B — 분류 + Gate 1

### B1 — 신호 탐지

두 종류의 신호:

**(a) 경로 신호 — 리터럴, 언어 무관.** `request`, `target`, `constraints` 에서 다음 파일 경로 패턴을 스캔:

- `auth/`, `security/` — 인증·인가
- `schema.*`, `*/schema/` — DB 또는 API 스키마
- `migrations/` — DB 마이그레이션
- `package.json`, `*/package.json` — 의존성·버전 변경
- `config.ts`, `*.config.*` — 전역 설정

경로는 파일시스템 리터럴 — 어떤 언어든 동일하게 매칭. 히트는 `signals_matched: ["path:auth/", ...]` 로 기록.

**(b) 키워드 신호 — 의미론적, 다국어.** 요청이 다음 개념 중 하나를 의미론적으로 가리키는지 판단: 인증, 로그인, 비밀번호, 세션, DB, 스키마, 마이그레이션, 설정, 의존성. 리터럴 문자열이 아니라 개념 — "로그인", "認証", "authentification" 모두 auth/login 개념으로 센다. 고정 키워드 테이블이 아니라 판단으로. 히트는 `signals_matched: ["keyword:login", ...]` 로 기록.

**(c) `deliberately-wide-scope` 제약** (Phase A 에서 멀티서브시스템을 발견했는데 유저가 그대로 가자고 한 플래그): **암묵적 prd-trd 신호**. `signals_matched: ["constraint:deliberately-wide-scope"]` 로 기록.

### B2 — 파일 수 추정

정수 하나 N — 수정 + 신규 파일의 베스트-게스 합계.

Calibration (각 모양의 완료된 프로젝트들에서 나오는 일반적인 시그널 — 경계가 아니다; 정밀도가 목표가 아닌 이유는 파일 수만으로는 절대 tier 를 결정하지 않고 그저 nudge 하기 때문):

- 오타 / 포맷 / 주석만 → 1
- 단일 서브시스템 버그 수정 → 1–3
- 엔드포인트 하나 또는 페이지 하나 신규 → 2–4
- 여러 레이어 걸친 기능 → 5–12
- 크로스-커팅 마이그레이션 / 프레임워크 교체 → 10–30+

과하게 생각하지 않는다. 대략의 정수 하나면 충분 — B6 에서 유저가 번복 가능. 추정조차 불가능할 정도로 요청이 모호하고 (Phase A 도 안 돌아서 `target` 이 없음) N=3 중립값으로 두고 Gate 1 메시지에 low-confidence 표시.

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

**하나라도 실패 → prd-only 로 승격**. 전부 통과 → tasks-only 유지. 근거: "단순해 보이는" 작업이야말로 검증되지 않은 가정이 가장 많이 쌓이는 곳 — 이 게이트는 모델이 설계를 우회하도록 합리화하는 걸 막기 위한 것.

### B5 — Gate 1 — 추천 제시

유저 언어로, **독립된 턴 한 개 메시지**로 전달:

> "**{route}** ({expansion}) 추천. 예상 {N}파일. {신호 요약 또는 '보안·아키텍처 신호 없음'}. 진행할까요?"

예시:

- `"prd-only (PRD → Tasks) 추천. 예상 3파일, 보안 신호 없음. 진행할까요?"`
- `"prd-trd (PRD → TRD → Tasks) 추천. 예상 4파일, auth/ 를 건드림 (보안 민감). 진행할까요?"`
- `"tasks-only 추천. 오타 수정, 1파일, 신호 없음. 설계 건너뛰고 바로 태스크로 갈까요?"`

이 메시지는 **단독** — 출력 JSON 을 같이 붙이지 않는다. MC 는 암묵적으로 제시: 수락 / 경로 변경 / 파일 수 조정. 이보다 더 묶지 않는다.

### B6 — 응답 처리 (다음 유저 턴)

**다음** 유저 턴 응답을 네 액션 중 하나로 분류:

- **수락** ("네", "진행", 무응답/정정 없음) → B7 로, 현재 경로 유지. `user_overrode: false`.
- **경로 번복** ("prd-trd 로 해줘" / "그냥 tasks-only") → B7 로, 유저 경로. `user_overrode: true`. 반박하지 않는다.
- **파일 수 번복** ("10파일쯤일 듯") → 새 N 으로 B3 재실행, B5 로 한 번만 돌아가서 새 추천 제시. 이 루프만 허용.
- **피벗 또는 casual** — 아래 Pivot handling 참조.

`intent` / `target` / `scope_hint` 에 대한 명확화 질문은 **여기서 하지 않는다** — Phase A 의 일이었다. 빠져 있고 중요해 보이면 보수적 경로 (add 쪽이면 prd-only, refactor 쪽이면 trd-only) 로 넘기고 writer 단계에서 보강한다.

**Pivot handling.** 유저가 관련 없는 주제를 꺼내거나 현재 요청을 완전히 놓으면, 터미널 payload 로 `{"outcome": "pivot", ...}` emit 후 "새 요청으로 보입니다; 라우팅으로 돌아갑니다." 한 문장으로 종료. ROADMAP/STATE **갱신 금지**. 대신 유저 응답이 "경로에 대한 질문이었지 작업 요청이 아님" 을 드러내면 `{"outcome": "exit-casual", ...}` emit 후 한 줄 인정으로 종료.

### B7 — 확정 + emit (경로 outcome 전용)

수락 (번복 포함) 시:

1. **`ROADMAP.md` 갱신**:
   - 상단 근처에 `Complexity: {route} ({expansion})` 줄 추가/갱신.
   - `- [ ] brainstorming` → `- [x] brainstorming    → {route} (approved)`. `user_overrode` 면 `→ {route} (overridden from {recommended-route})` 로 표기. user_overrode 플래그는 이 한 줄 우측 라벨에만 산다 — 별도 `gate-1-approval` 체크박스는 두지 않는다 (Gate 1 이 brainstorming 에 흡수돼 두 줄로 표현하면 중복).
2. **`STATE.md` 갱신**:
   - `Current Position: {다음 phase — route 이름이 writer 를 함의}`
   - `Last activity: {ISO 타임스탬프} — classified as {route}{, 필요 시 user-overrode}`
3. **경로 payload 를 마지막 메시지로 emit** — `outcome` 은 경로 이름 (`prd-trd` / `prd-only` / `trd-only` / `tasks-only` / `pivot` / `exit-casual`). 메인 스레드가 SKILL.md 의 "Required next skill" 섹션을 읽어 맞는 writer 로 dispatch.
