---
name: brainstorming
description: router 가 clarify, plan, 또는 resume 를 방출한 직후 harness intake 단계로 실행. 요청에 신호가 부족할 때(clarify 경로)만 짧은 Q&A 루프를 돌리고, 네 가지 하위 경로(prd-trd, prd-only, trd-only, tasks-only) 중 하나로 분류한 뒤 아티팩트 생성 전 Gate 1 유저 승인을 흡수. 해결책 제안·스펙 작성·코드베이스 탐색은 하지 않음 — target 이름 모호성 해소를 위한 최소 탐색만 허용. 산출물은 prd-writer / trd-writer / task-writer 가 신뢰할 수 있는 단일 경로 payload.
---

# Brainstorming

## 목적

Brainstorming 은 하네스의 **인테이크 스킬**이다. 두 가지 책임을 한 스킬에서 소유한다:

1. **요청 명확화** — router 가 `clarify` 로 라우팅하면, 분류·드래프팅에 필요한 신호가 다 모일 때까지 짧은 Q&A 루프를 돈다.
2. **경로 분류** — `prd-trd` / `prd-only` / `trd-only` / `tasks-only` 중 하나 선정 후 **Gate 1** (아티팩트 생성 착수 전 유저 승인) 흡수.

이 스킬은 절대 해결책을 제안하지 않고, 스펙·코드 작성도 하지 않는다. 산출물은 단 하나의 경로 payload — 하위 writer (`prd-writer` / `trd-writer` / `task-writer`) 가 신뢰할 수 있는.

## 실행 모드

Main context — `../../harness-contracts/execution-modes.ko.md` 참조. Brainstorming 은 Q&A 와 분류 단계가 사용자와의 라이브 대화를 필요로 하므로 인라인 실행.

## 입력

메인 스레드 실행 — 라이브 대화 컨텍스트 접근 가능. Router 로부터 받는 payload:

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `request`: 유저의 원 요청, verbatim, 언어 무관
- `route`: `"clarify"` | `"plan"` | `"resume"` — `router.output.outcome` 의 미러. Q&A 단계 실행 여부를 결정한다.
- `resume`: `route == "resume"` 일 때 `true` (Step 0 숏서킷)

## 출력

이 스킬은 **터미널 payload 하나**로 끝난다. 마지막 메시지는 JSON 하나이며, `outcome` 필드에 경로 이름(또는 터미널 신호)을 바로 담는다.

**경로 outcome** — `outcome` 이 경로 이름 (`prd-trd`, `prd-only`, `trd-only`, `tasks-only`):

```json
{
  "outcome": "prd-trd",
  "session_id": "2026-04-19-...",
  "request": "...",
  "brainstorming_output": {
    "intent": "add|fix|refactor|migrate|remove|other",
    "target": "...",
    "scope_hint": "single-file|subsystem|multi-system",
    "constraints": ["..."],
    "acceptance": "..."
  }
}
```

`brainstorming_output` 은 router 가 `plan` 을 바로 인계해서 Q&A 단계가 생략된 경우 `null` 일 수 있다.

**피벗** — 인테이크 도중 유저가 다른 요청으로 전환:

```json
{ "outcome": "pivot", "session_id": "...", "reason": "..." }
```

**Casual 재분류** — 알고 보니 유저가 작업 요청이 아니라 질문을 한 상황:

```json
{ "outcome": "exit-casual", "session_id": "...", "reason": "..." }
```

세션 파일은 경로 outcome 에서만 갱신 (B5/B7 — `references/procedure.ko.md` 참조). `STATE.md` 의 `Last activity` 라인은 모든 outcome 에서 갱신. `pivot` / `exit-casual` 은 ROADMAP 을 건드리지 않는다.

## 프로세스 흐름

1. **Step 0** — 재개 숏서킷 (이전에 분류된 경우 전부 스킵).
2. **Phase A** — 명확화 (`route == "clarify"` 일 때만).
3. **Phase B** — 분류 + Gate 1 유저 승인.

## 절차 요약

| 단계 | 스텝 | 한 줄 설명 |
| --- | --- | --- |
| Step 0 | resume | ROADMAP 에 `Complexity:` + `brainstorming` 이 `[x]` 면 숏서킷. |
| Phase A | A1 | 요청에서 먼저 추출; 필드 질문 전에 멀티-서브시스템 범위 플래그. |
| Phase A | A2 | 턴당 빈 필드 하나, MC 선호, 유저 언어로 질문. |
| Phase A | A3 | "그냥 시작" / "스킵" → 즉시 종료, 채워진 채로 Phase B. |
| Phase A | A4 | 채워진 필드 확인을 독립 메시지로 — 다음 턴이 Phase B 진입. |
| Phase B | B1 | 경로 신호 (`auth/`, `migrations/`, …) + 다국어 키워드 신호 탐지. |
| Phase B | B2 | 정수 하나 N = 수정 + 신규 파일 베스트-게스. |
| Phase B | B3 | 티어 규칙: 신호 있으면 prd-trd; 그 외엔 intent + N. |
| Phase B | B4 | tasks-only 후보는 4개 자기검증 통과 필요, 하나라도 실패 → prd-only. |
| Phase B | B5 | Gate 1 — 추천을 독립 메시지로 제시 후 대기. |
| Phase B | B6 | 수락 / 경로 번복 / 파일 수 번복 (1회 재계산) / 피벗. |
| Phase B | B7 | ROADMAP 에 `Complexity:` + `brainstorming` 행 체크, STATE 갱신, payload emit. |

`references/procedure.ko.md` 에 전체 Q&A 프로토콜.

## 대화 모양

**좋은 예 — clarify 경로, 인테이크 거쳐 trd-only:**

> User: "make the auth code better"
> Brainstorming: "어떤 변경이 필요하신가요? (버그 수정 / 가독성 리팩토링 / 성능 개선 / 마이그레이션)"
> User: "리팩토링"
> Brainstorming: "어느 부분이요 — 세션 처리 / 비밀번호 리셋 / JWT 발급 / 더 넓은 범위?"
> User: "세션 처리"
> Brainstorming: "범위: 세션 모듈 안에 갇히나요, 호출자까지 번지나요?"
> User: "모듈 안에만"
> Brainstorming: "확인 — 세션 처리 리팩토링, subsystem 범위. 이제 경로를 고르겠습니다."
> User: "ok"
> Brainstorming: "**trd-only** (TRD → Tasks) 추천. 예상 3파일, 보안 신호 없음. 진행할까요?"
> User: "네"
> Brainstorming: [ROADMAP 확정, `{"outcome": "trd-only", ...}` emit]

`references/conversation-examples.ko.md` 에 추가 대화 패턴 (plan 경로 신호 승격, tasks-only 강등, 유저 번복, 다중 프로젝트 분해, 나쁜 예들).

## 엣지 케이스

`references/edge-cases.ko.md` 에 피벗, casual 재분류, 모호 답변, 신호 충돌, intent-freeform 처리 등.

## 필수 다음 스킬

다음 스킬은 `outcome` 에 따라 결정됨 (전체 payload 계약: `../../harness-contracts/payload-contract.ko.md` § "brainstorming → *"):

- `outcome == "prd-trd"` 또는 `"prd-only"` → **필수 하위 스킬:** harness-flow:prd-writer 사용
  Payload: `{ session_id, request, brainstorming_outcome: <outcome>, brainstorming_output }`
- `outcome == "trd-only"` → **필수 하위 스킬:** harness-flow:trd-writer 사용
  Payload: `{ session_id, request, brainstorming_outcome: "trd-only", brainstorming_output, prd_path: null }`
- `outcome == "tasks-only"` → **필수 하위 스킬:** harness-flow:task-writer 사용
  Payload: `{ session_id, request, brainstorming_output, prd_path: null, trd_path: null }`
- `outcome == "pivot"` 또는 `"exit-casual"` → 흐름 종료. 사용자에게 보고하고 멈춤.

## 범위 밖

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조. Brainstorming 은 `ROADMAP.md` 의 `Complexity:` 줄 + brainstorming 행, `STATE.md` 의 `Current Position` + `Last activity` 만 쓴다. 그 외는 범위 밖.
- 해결책·접근법·트레이드오프 제안 — `prd-writer` / `trd-writer` 의 몫.
- 스펙·디자인·플랜 / 코드 작성.
- 코드베이스 탐색 — target 이름 모호성 해소에 꼭 필요한 최소한 (≤ 2 tool call) 외 금지. 파일 수 추정 위한 코드베이스 스캔도 금지.
- LOC / 테스트 커버리지 추정.
- 런타임 중간 승격 (실제 diff 보고 경로 상향).
- 다음 agent 직접 dispatch — 메인 스레드가 아래 "필수 다음 스킬" 섹션을 읽고 진행.
- 유저가 이미 답한 질문 되묻기.
- Router 재호출. 피벗이 새 세션을 정당화하면 이 스킬 종료 — 다음 턴에 router 가 돈다.
- B6 의 파일 수 재계산 1회 초과. 그 너머는 유저 값을 그대로 받고 진행.
- 스킬 내부 (경로명·신호 리스트·필드명) 비영어화 — 유저 추천·확인은 유저 언어 미러링.
