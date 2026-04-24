---
name: brainstorming
description: Router 가 `clarify` 를 넘긴 경우 반드시 사용 — 요청이 작아 보여서 추측으로 때우고 싶을 때도 포함. 요청이 `complexity-classifier` 가 티어를 고르고 하위 writer 들이 초안을 쓸 수 있을 만큼의 신호를 갖출 때까지 짧은 Q&A 루프를 돈다. 이 스킬은 구조화된 payload 에서 멈춘다 — 디자인·스펙은 prd-writer / trd-writer 의 아티팩트다.
---

# Brainstorming

## 목적

Router 가 `clarify` 로 분류한 요청은 유저가 작업을 원하는 것은 명확하지만, 한 턴만으로는 router 가 *무엇을* 할지 판별할 수 없는 경우다. 이 스킬의 역할은 정확히 하나 — **유저에게 꼭 필요한 질문만 던져서 actionability 체크리스트를 채우고 `complexity-classifier` 로 인계**한다. 그 이상은 안 한다.

디자인 brainstorming 이 아니다. 접근법을 제안하거나 디자인 문서를 쓰거나 트레이드오프를 평가하지 않는다 — 그건 `prd-writer` / `trd-writer` 의 몫이다. 이 스킬의 산출물은 구조화된 payload 이지 스펙이 아니다.

## 왜 이 스킬이 필요한가

Clarification 단계가 없으면 router 의 `clarify` 버킷이 `complexity-classifier` 로 바로 흘러들어, classifier 가 얇은 신호로 잘못된 티어를 고르거나 자기가 명확화 질문을 직접 던지게 된다 — 책임 중복 + classifier 비대화. "유저가 정말 원하는 게 뭐냐" 대화를 이 스킬에 모아두면, 하위 스테이지는 받은 payload 를 신뢰할 수 있다.

## 입력

이 스킬은 메인 스레드에서 실행된다. 라이브 대화 컨텍스트 접근 가능. Router 로부터 받는 payload:

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `request`: 유저의 원 요청, verbatim, 언어 무관

그 외 스킬이 이 스킬을 호출하지 않는다. 그 외 payload 필드 없음.

## 출력

이 스킬은 **세 가지 터미널 payload 중 하나**로 끝난다. 스킬의 마지막 메시지는 `outcome` 으로 태깅된 JSON 하나.

**정상 명확화** — `complexity-classifier` 로 넘기는 보강된 payload:

```json
{
  "outcome": "clarified",
  "session_id": "2026-04-19-...",
  "request": "...",
  "intent": "add|fix|refactor|migrate|remove|other",
  "target": "...",
  "scope_hint": "single-file|subsystem|multi-system",
  "constraints": ["..."],
  "acceptance": "..."
}
```

- `intent`, `target`, `scope_hint` 은 **필수**.
- `constraints` 는 배열 — 유저가 언급하지 않았으면 빈 배열.
- `acceptance` 는 선호되지만 필수 아님 — 유저가 말하지 않았으면 `null`.
- `request` 는 **원 유저 턴을 그대로** — 구조화 필드에서 빠진 뉘앙스를 하위 writer 가 다시 읽어본다.

**피벗** — 명확화 도중 유저가 이 요청을 떠나 다른 요청으로 전환. Dispatcher 는 현재 세션을 그대로 두고 다음 턴에 router 가 재발화하게 한다:

```json
{ "outcome": "pivot", "session_id": "2026-04-19-...", "reason": "user asked about dashboard UI mid-clarification" }
```

**Casual 재분류** — 한 라운드 돌고 보니 유저가 작업 요청이 아니라 질문을 한 상황. Dispatcher 는 드롭하고 다음 턴을 router 가 처리하게 한다:

```json
{ "outcome": "exit-casual", "session_id": "2026-04-19-...", "reason": "user was browsing, not requesting work" }
```

세 outcome 모두 trace 를 위해 `STATE.md` 의 `Last activity` 는 갱신. ROADMAP 은 brainstorming 이 건드리지 않는다.

## 프로세스 흐름

```
┌─────────────────────────────────┐
│ Step 1 — 추출 + 범위 평가        │
└─────────────┬───────────────────┘
              │
     ┌────────┴────────┐
     │ 다중 프로젝트?    │──yes──▶ 분해 제안
     └────────┬────────┘              │
              │no                     │ 유저가 서브 프로젝트 선택
              ▼                       ▼
┌─────────────────────────────────────────┐
│ Step 2 — 빈 필드 질문 (턴당 하나)        │◀─┐
└─────────────┬───────────────────────────┘  │
              │                              │
    ┌─────────┴──────────┐                   │
    │ 유저 "그냥 시작"?   │──yes──▶ Step 3 조기 종료
    └─────────┬──────────┘                   │
              │no                            │
              ▼                              │
      ┌───────────────┐                      │
      │ 필수 필드 다   │──no──────────────────┘
      │ 찼는가?        │
      └───────┬───────┘
              │yes
              ▼
┌──────────────────────────────────┐
│ Step 4 — 확인 + payload emit     │
└──────────────────────────────────┘
```

## 절차

### Step 1 — 추출 후 범위 평가

뭐라도 묻기 전에 순서대로 둘 다:

**(a) 요청에 이미 있는 것부터 채운다.** `request` 를 읽고 체크리스트에서 이미 확정된 필드를 채운다. **진짜 빈 곳만** 물어본다. 요청에 답이 이미 있는 질문을 다시 던지는 건 명확화 스킬의 가장 흔한 실패 패턴이다. 유저가 "refactor the DB layer for clarity" 라고 썼다면 `intent=refactor`, `target=DB layer` 는 이미 찬 상태 — 다시 묻지 않는다.

**(b) 범위 평가 — 한 세션인가 여러 세션인가?** 요청이 독립적인 여러 서브시스템을 기술하면 (예: "채팅·파일 스토리지·결제·분석이 있는 플랫폼 구축"), 필드 질문에 들어가기 **전에 즉시 플래그** 한다. 유저에게 분해를 제안:

> "이건 여러 개의 독립된 서브 프로젝트로 보입니다: {리스트}. 한 세션은 하나의 일관된 조각을 소유해야 합니다. 어떤 것부터 시작하시겠어요? 나머지는 별도 세션이 됩니다."

유저가 하나를 고르면 payload 의 `request` 를 그 서브 프로젝트 설명으로 교체하고 진행한다. 나머지 서브 프로젝트는 미래 세션이 된다 — 각 세션마다 router 가 새로 돈다.

유저가 다 한 세션에서 처리하자고 고집하면 진행하되 `constraints: ["deliberately-wide-scope"]` 를 기록해서 `complexity-classifier` 가 prd-trd 쪽으로 기울게 한다.

명백히 단일 범위의 요청은 범위 체크를 생략 — "src/auth/session.ts 의 로그인 타임아웃 버그 수정" 같은 요청에 "이게 하나의 프로젝트인가요?" 를 묻지 말 것.

### Step 2 — 빈 필드를 한 번에 하나씩 묻는다

우선순위 — **첫 번째 빈 필드부터 질문하되, 반드시 Step 1(a) 를 최신 답변 위에 다시 돌린 뒤에**. 유저 답 하나가 여러 필드를 동시에 채우는 경우가 흔하다 (예: "refactor session handling for clarity" → intent + target + 부분 scope 동시 충족). 매 턴마다 대화 전체를 재추출한 뒤 다음 질문을 고른다. 목록을 위→아래로 맹목적으로 타지 말 것.

1. **intent** — 보통 추론 가능. 애매할 때만: "Sounds like this is about {후보}. Which fits best?" MC 제시: add / fix / refactor / migrate / remove / other. 유저의 동사가 다섯 개 중 어디에도 안 맞으면 `intent: "other"` 로 두고 **함께** `constraints` 에 `"intent-freeform: <동사>"` 를 추가 — 하위가 원 동사를 볼 수 있어야 한다.
2. **target** — "코드베이스의 어느 부분에 해당하나요?" 열린 질문, 후보가 보이면 MC.
3. **scope_hint** — "한 곳에 갇힌 변경인가요, 한 서브시스템 내인가요, 아니면 크로스-시스템인가요?" MC: single-file / subsystem / multi-system.
4. **constraints** — 컨텍스트에서 **그럴듯한 제약이 짚어질 때만** 묻는다. 예 (인증 변경 요청): "기존 세션에 대한 하위 호환 요구 있나요?" 막연한 프롬프트로 제약을 낚지 않는다.
5. **acceptance** — "완료 판정 기준이 뭐가 될까요?" 열린 질문.

규칙:

- **턴당 질문 하나.** 묶음 금지. 질문 폭격은 우리가 피하려는 anti-pattern.
- **가능하면 객관식.** 유저는 MC 를 더 빠르고 정확하게 답한다.
- **유저 언어로 질문.** 스킬 본문·필드명·규칙은 영어로 두되, 유저 대화는 유저 언어를 미러링. 유저가 한국어면 한국어로 묻는다. Router 와 같은 규범.
- **질문에도 YAGNI.** 라우팅·드래프팅에 필요한 것만 묻는다. 어떤 답이 와도 하위 라우팅이나 writer 의 초안을 바꾸지 않는 질문이면 묻지 말 것.
- **필수 필드 채워지면 중단.** 선택 필드가 비어도 괜찮다.

### Step 3 — 조기 종료

유저가 "그냥 시작", "일단 가자", "스킵", "너가 알아서" 비슷한 말을 하면 **즉시 중단**하고 현재 채워진 필드로 인계한다. 건너뛴 필드는 `STATE.md` 의 `Last activity` 에 기록해서 하위가 payload 가 얇음을 알게 한다:

```
Last activity: 2026-04-19 13:44 — brainstorming exit (user-skip); missing: acceptance
```

얇은 payload 는 실패가 아니다 — "정확성보다 속도" 라는 유저 신호다. Classifier 와 writer 는 빈 필드가 실제로 블로킹되는 순간에 자기가 좁은 범위로 다시 물어본다.

### Step 4 — 확인 후 emit (`outcome: "clarified"` 경로)

필수 체크리스트가 다 찼으면 **짧은 한 문단으로 확인** — 유저 언어로:

> "Got it — {intent} {target}, {scope_hint}. {constraint 요약이 있다면}. {acceptance 가 있다면}. Passing to classifier."

확인 메시지는 **독립된 한 메시지** — JSON 을 같이 묶지 않는다. **다음** 유저 턴에서 수락 ("네", "좋아요", 무응답/정정 없음) 이면 `clarified` payload 를 메시지로 emit 하고 스킬 종료. 필드를 고치면 Step 2 의 **그 필드만** 으로 돌아가서 재확인 — 이미 옳게 답한 필드는 다시 묻지 않는다. 수정 ≠ 재시작. 유저가 대신 피벗하거나 질문이었음을 드러내면 `pivot` 또는 `exit-casual` payload 를 emit 하고 종료 (엣지 케이스 참조).

## 이 스킬이 하지 않는 것

- 해결책·접근법·트레이드오프 제안 — `prd-writer` / `trd-writer` 의 몫.
- 복잡도 티어 결정·협상 — `complexity-classifier` 의 몫.
- 스펙·디자인·플랜 문서 작성 — Phase 4 아티팩트.
- 코드베이스 탐색 — **target 이름 모호성 해소에 꼭 필요한 최소한** (예: 유저가 언급한 파일이 실존하는지 확인) 외엔 안 한다. 이것도 tool call 2회 넘어가면 멈추고 유저에게 물어본다.
- `ROADMAP.md` 수정. 이 스킬은 `STATE.md` 의 `Last activity` 한 줄만 쓴다.
- 유저가 이번 턴에 이미 답한 것을 다시 묻는 행위.

## 대화 모양

좋은 예 — 턴당 질문 하나, MC 선호, 짧은 확인으로 마감:

> User: "make the auth code better"
> Brainstorming: "어떤 변경이 필요하신가요? (버그 수정 / 가독성 리팩토링 / 성능 개선 / 마이그레이션)"
> User: "리팩토링"
> Brainstorming: "어느 부분이요 — 세션 처리 / 비밀번호 리셋 / JWT 발급 / 더 넓은 범위?"
> User: "세션 처리"
> Brainstorming: "범위: 세션 모듈 안에 갇히나요, 호출자까지 번지나요?"
> User: "모듈 안에만"
> Brainstorming: "확인 — 세션 처리 리팩토링, subsystem 범위. Classifier 로 넘깁니다."

좋은 예 — 필드 파기 전에 다중 프로젝트를 잡아내는 경우:

> User: "리드 / 딜 / 리포팅 / 이메일 통합 / 모바일 앱이 있는 완전한 CRM 을 만들자"
> Brainstorming: "이건 여러 서브 프로젝트로 보입니다: 리드/딜 관리, 리포팅, 이메일 통합, 모바일 앱. 한 세션은 하나의 일관된 조각을 소유해야 합니다 — 어떤 것부터 시작하시겠어요? 나머지는 별도 세션으로."

나쁜 예 — 질문 폭격:

> Brainstorming: "다음을 알려주세요: (1) intent, (2) target, (3) scope, (4) constraints, (5) acceptance — 다섯 개 다 부탁합니다."

나쁜 예 — 접근법 제안 (이 스킬의 일이 아니다):

> Brainstorming: "세 가지 방법이 있습니다: A) 이름만 바꾸기 B) 함수 추출 C) 전면 재작성. 뭐가 좋을까요?"

나쁜 예 — 요청에 이미 있는 걸 되묻기:

> User 요청: "fix the login timeout bug in src/auth/session.ts"
> Brainstorming: "어떤 종류의 변경인가요?"
> (intent / target / scope 가 요청에 다 있음 — acceptance 물어보거나 바로 종료)

## 엣지 케이스

- **대화 중 유저 피벗** (인증 리팩토링 명확화하다가 갑자기 대시보드 UI 얘기): `{"outcome": "pivot", ...}` 을 터미널 payload 로 emit 하고 한 문장으로 마감 — "새 요청으로 보입니다; 라우팅으로 돌아갑니다." 다음 유저 턴에서 router 가 다시 트리거되어 새 세션을 할당한다.
- **새 모호성을 포함한 답변** (예: "인증도 건드리고 결제 쪽도 조금"): `scope_hint: multi-system` 으로 흡수하고 추가 질문 없음. 모호성 자체가 정보다.
- **질문과 무관한 답변** (예: 범위 MC 에 코드 스니펫으로 답): 질문을 한 번 인용하며 재질문. 두 번째도 빗나가면 보수적 기본값 `scope_hint: multi-system` 으로 두고 진행 — 과도한 질문이 과도한 범위 책정보다 나쁘다.
- **알고 보니 casual** (한 라운드 돌고 나서 작업 요청이 아니라 질문이었음이 드러남): `{"outcome": "exit-casual", ...}` 을 터미널 payload 로 emit 하고 한 문장으로 인지하며 종료. `Last activity: brainstorming exit (reclassified-casual)` 로 기록.
- **유저가 자발적으로 분해** (예: "응, 리드부터 하자, 딜은 다음에"): 수락하고 선택된 서브 프로젝트를 `request` 로 캡처, 후속 작업은 `constraints` 에 `"followup-sessions: deals, reporting"` 로 기록 — 유저가 원한 건 속도이지 범위 협상이 아니다.

## 경계

- 코드 쓰기 금지. 파일 생성은 `STATE.md` `Last activity` 업데이트 외 금지.
- `complexity-classifier` 외로의 인계 금지.
- Router 재호출 금지. 유저 피벗이 새 세션을 정당화하면 이 스킬은 종료 — 다음 턴에 router 가 돈다.
- 스킬 내부 (규칙·필드명·예시·본 문서) 는 영어. 유저에게 던지는 질문·확인은 유저 언어를 미러링.
