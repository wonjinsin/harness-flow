---
name: brainstorming
description: router 가 clarify, plan, 또는 resume 를 방출한 직후 harness intake 단계로 실행. 요청에 신호가 부족할 때(clarify 경로) 짧은 Q&A 루프를 돌리며, 코드베이스 peek (~10 Read/Grep/Glob calls) 로 질문을 실제 코드에 ground 시킨 뒤, 네 가지 하위 경로(prd-trd, prd-only, trd-only, tasks-only) 중 하나로 분류하면서 아티팩트 생성 전 Gate 1 유저 승인을 흡수. 구현 해결책 제안·스펙 작성은 절대 하지 않음 — 경로 승인 시 `.planning/{session_id}/brainstorming.md` 를 작성하고 (prd-writer/trd-writer/task-writer 가 코드베이스를 재탐색하지 않고 검증만 하면 되도록 하는 verify-first ground), 그 파일을 가리키는 짧은 마크다운 상태 노트로 턴을 마친다.
model: sonnet
---

# Brainstorming

## 목적

Brainstorming 은 하네스의 **인테이크 스킬**이다. 세 가지 책임을 한 스킬에서 소유한다:

1. **요청 명확화** — router 가 `clarify` 로 라우팅하면, 분류·드래프팅에 필요한 신호가 다 모일 때까지 짧은 Q&A 루프를 돈다. Phase A 는 두 모드 중 하나로 진행:
   - **Intake** (기본) — 요청에 intent 와 target 이 이미 보이면 남은 필드를 한 번에 하나씩 채운다.
   - **Explore** — 요청이 아직 아이디어 단계라면 잠깐 발산해서 *문제 공간*을 매핑한 뒤, intake 로 수렴한다.
2. **코드베이스 ground** — intent + target 이 잡힌 시점 (Phase A1.6) 에 코드베이스 peek (~10 Read/Grep/Glob calls) 을 한 번 돌려 target 이 실재하는지 확인하고, 코드 가시 제약 (기존 schema, auth flow, 함수 시그니처) 을 surface 하며, 나머지 Phase A 의 질문을 구체화한다. 발견 사항은 `brainstorming.md` 의 `## A1.6 findings` 섹션에 기록되어 writer 가 같은 영역을 재탐색하지 않게 한다.
3. **경로 분류** — `prd-trd` / `prd-only` / `trd-only` / `tasks-only` 중 하나 선정, **Gate 1** (아티팩트 생성 착수 전 유저 승인) 흡수, 그리고 다운스트림 writer 에 대한 권위 있는 핸드오프로 `.planning/{session_id}/brainstorming.md` 를 작성한다.

이 스킬은 **구현 해결책**을 제안하지 않고, 스펙·코드 작성도 하지 않는다. **Explore 모드는 방향성 옵션 (문제 공간 카테고리, 상위 모양) 까지는 제시할 수 있으나 구현 옵션은 절대 제안하지 않는다** — 이 경계가 brainstorming 을 `prd-writer` / `trd-writer` 와 분리시키는 핵심이다. 산출물은 `brainstorming.md` (Request + A1.6 findings + Brainstorming output + Recommendation) 이며, 다운스트림 writer 가 이를 신뢰할 수 있다.

왜 brainstorming 이 코드베이스 탐색을 소유하나 (그리고 writer 가 재탐색하지 않나): **이 자리에는 사용자가 있다**. 잘못된 가정을 surface 한 발견 ("`issueSession` 이라고 하셨는데 코드에는 `createSession` 만 있어요 — 같은 거 말씀이신가요?") 은 한 턴에 라이브로 해결된다. 같은 발견이 격리된 서브에이전트 안에서 일어나면 PRD/TRD/TASKS 가 다 작성된 뒤에야 사용자가 발견하는 Open question 이 된다. 메인 컨텍스트에서 ~10 tool call 을 미리 쓰면 다운스트림에서 세 번 독립으로 재발견하는 비용을 절감하고, 가장 싼 시점에 mismatch 를 잡는다.

## 실행 모드

Main context — `../../harness-contracts/execution-modes.ko.md` 참조. Brainstorming 은 Q&A 와 분류 단계가 사용자와의 라이브 대화를 필요로 하므로 인라인 실행.

## 입력

메인 스레드 실행 — 라이브 대화 컨텍스트 접근 가능. Router 로부터 받는 디스패치 프롬프트 필드:

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `request`: 유저의 원 요청, verbatim, 언어 무관
- `route`: `"clarify"` | `"plan"` | `"resume"` — router 의 `## Status` 미러. Q&A 단계 실행 여부를 결정한다.
- `resume`: `route == "resume"` 일 때 `true` (Step 0 숏서킷)

## Terminal message

매 실행은 짧은 마크다운 블록으로 끝난다. 공통 섹션 문법은 `../../harness-contracts/output-contract.ko.md` 참조.

**경로 outcome** — Phase B7 이 `.planning/{session_id}/brainstorming.md` 를 먼저 쓴 뒤 다음 메시지로 턴을 마친다:

```markdown
## Status
{prd-trd|prd-only|trd-only|tasks-only}

## Path
.planning/{session_id}/brainstorming.md

Proceeding to {next-skill}.
```

핸드오프는 이 파일이다. 필수 구조:

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

A1.6 가 스킵된 경우 (router 가 해결 가능한 target 없이 `plan` 으로 라우팅했거나, 요청에 로컬 아날로그가 없을 때) `## A1.6 findings` 헤더는 그대로 두고 본문에 `- (skipped — no resolvable target)` 한 줄을 둔다. Writer 는 이 명시적 "skipped" 마커를 보고 풀 모드 탐색으로 전환한다.

**피벗** — 인테이크 도중 유저가 다른 요청으로 전환. 파일은 쓰지 않는다. 산문 설명 후:

```markdown
## Status
pivot

## Reason
{short cause}
```

**Casual 재분류** — 알고 보니 유저가 작업 요청이 아니라 질문을 한 상황. 파일은 쓰지 않는다. 산문 설명 후:

```markdown
## Status
exit-casual

## Reason
{short cause}
```

`brainstorming.md` 는 경로 outcome 에서만 작성된다 (`references/procedure.ko.md` 의 B5/B7 참조). `STATE.md` 의 `Last activity` 라인은 모든 터미널 상태에서 갱신. `pivot` / `exit-casual` 은 ROADMAP 을 건드리지 않는다.

## 절차

Step 0 (재개 숏서킷) → **Phase A** (`route == "clarify"` 일 때만) → **Phase B** (항상). Phase A 는 intent + target 추출 가능 여부에 따라 A-intake 또는 A-explore 선택; 어느 쪽이든 둘 다 잡히면 A2 전에 A1.6 가 발동한다.

| 단계    | 스텝      | 한 줄 설명                                                                                                          |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| Step 0  | resume    | `.planning/{id}/brainstorming.md` 가 존재하고 `user approved: yes` 면 숏서킷 (ROADMAP 마커는 폴백).                  |
| Phase A | A1        | 요청에서 먼저 추출; 필드 질문 전에 멀티-서브시스템 범위 플래그.                                                     |
| Phase A | A1.5      | 모드 선택 — A-explore (intent + target 둘 다 없음) vs A-intake (필드 일부 추출 가능).                               |
| Phase A | A-explore | 열린 질문·방향성 MC 로 발산하다 intent + target 안정화.                                                             |
| Phase A | A1.6      | 코드베이스 peek (~10 Read/Grep/Glob) — target 검증, 코드 가시 제약 수집.                                            |
| Phase A | A2        | 턴당 빈 필드 하나, MC 선호, 유저 언어. A1.6 발견을 질문에 활용.                                                     |
| Phase A | A3        | "그냥 시작" / "스킵" → 즉시 종료, 채워진 채로 Phase B.                                                              |
| Phase A | A4        | 채워진 필드 확인을 독립 메시지로 — 다음 턴이 Phase B 진입.                                                          |
| Phase B | B1        | 경로 + 다국어 키워드 신호. A1.6 코드 신호가 `code_signals` 채움.                                                    |
| Phase B | B2        | 정수 하나 N = 수정 + 신규 파일 베스트-게스.                                                                         |
| Phase B | B3        | 티어 규칙: 신호 있으면 prd-trd; 그 외엔 intent + N.                                                                 |
| Phase B | B4        | tasks-only 후보는 4개 자기검증 통과 필요, 하나라도 실패 → prd-only.                                                 |
| Phase B | B5        | Gate 1 — 추천을 독립 메시지로 제시 후 대기.                                                                         |
| Phase B | B6        | 수락 / 경로 번복 / 파일 수 번복 (1회 재계산) / 피벗.                                                                |
| Phase B | B7        | ROADMAP + STATE 갱신, `.planning/{id}/brainstorming.md` 작성, 마크다운 상태로 턴 종료.                              |

전체 Q&A 프로토콜: `references/procedure.ko.md`.

## 대화 모양

**좋은 예 — clarify 경로 + A1.6 grounded refinement → trd-only:**

> User: "make the auth code better"
> Brainstorming: "어떤 변경이 필요하신가요? (버그 수정 / 가독성 리팩토링 / 성능 / 마이그레이션)"
> User: "리팩토링"
> Brainstorming: "어느 부분이요 — 세션 처리 / 비밀번호 리셋 / JWT 발급 / 더 넓은 범위?"
> User: "세션 처리"
> [A1.6: Read `session.ts` + Grep 호출자 → `auth/{login,logout,refresh,middleware}` 에 4 호출자. 발견: `issueSession()` (session.ts:42) 가 발급과 쿠키 세팅을 한 함수에 섞음; 신호 `auth/`.]
> Brainstorming: "코드 보니 발급 로직과 쿠키 세팅이 한 함수에 섞여 있어요. 이번 리팩토링에서 둘을 분리할까요, 발급 쪽만 정리할까요?"
> User: "분리해줘"
> Brainstorming: "범위: session 모듈 안에서만, 4개 호출자 시그니처는 유지?"
> User: "그대로"
> Brainstorming: "확인 — 세션 처리 리팩토링 (발급/쿠키 분리), subsystem. 경로 추천하겠습니다."
> User: "ok"
> Brainstorming: "**trd-only** 추천. 예상 3파일, `auth/` 를 건드림. 진행할까요?"
> User: "네"
> Brainstorming: [ROADMAP/STATE 갱신, `.planning/{id}/brainstorming.md` 작성, `## Status: trd-only` + `## Path: .planning/{id}/brainstorming.md` + "Proceeding to trd-writer." 로 종료]

A1.6 가 "발급 + 쿠키 결합" 같은 결정을 실재 코드 위에서 사용자가 라이브로 정할 수 있게 한다 — peek 이 없으면 그 결정은 writer 가 나중에 플래그할 Open question 으로 남는다.

`references/conversation-examples.ko.md` 에 더 많은 패턴 — explore → A1.6 → intake (아이디어 단계), intake + grounded refinement, plan 경로 신호 승격, tasks-only 강등, 유저 번복, 다중 프로젝트 분해, 나쁜 예들.

## 엣지 케이스

`references/edge-cases.ko.md` 에 피벗, casual 재분류, 모호 답변, 신호 충돌, intent-freeform 처리 등.

## 필수 다음 스킬

다음 스킬은 터미널 메시지의 `## Status` 값에 따라 결정됨 (전체 per-edge 핸드오프: `../../harness-contracts/payload-contract.ko.md` § "brainstorming → \*"). 모든 writer 디스패치는 디스크의 `.planning/{session_id}/brainstorming.md` 를 읽는다 — 디스패치 프롬프트 자체는 최소로 유지한다.

- `## Status: prd-trd` 또는 `prd-only` → **필수 하위 스킬:** harness-flow:prd-writer 사용
  Dispatch: `Task(prd-writer, prompt: "Draft PRD for session {id}. Read .planning/{id}/brainstorming.md.")`
- `## Status: trd-only` → **필수 하위 스킬:** harness-flow:trd-writer 사용
  Dispatch: `Task(trd-writer, prompt: "Draft TRD for session {id}. Read .planning/{id}/brainstorming.md. No PRD will exist for this route.")`
- `## Status: tasks-only` → **필수 하위 스킬:** harness-flow:task-writer 사용
  Dispatch: `Task(task-writer, prompt: "Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md. No PRD or TRD will exist for this route.")`
- `## Status: pivot` 또는 `exit-casual` → 흐름 종료. 파일 작성 없음. 사용자에게 보고하고 멈춤.

## 범위 밖

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조 (이 스킬은 `ROADMAP.md` 의 `Complexity:` + brainstorming 행, `STATE.md` 의 `Current Position` + `Last activity`, 그리고 `.planning/{session_id}/brainstorming.md` 를 쓴다).
- **구체적인** 해결책·접근법·구현 트레이드오프 제안 — `prd-writer` / `trd-writer` 의 몫. Explore 모드는 문제 공간 *모양* 카테고리 ("푸시 / 이메일 / 인앱") 정도만, 구현 선택지 (라이브러리, 아키텍처, 파일 구조) 는 제안 금지.
- 스펙·디자인·코드 작성.
- A1.6 의 ~10 call budget 을 넘는 코드베이스 탐색. target 도 못 잡으면 `constraint: deliberately-wide-scope` 기록 후 진행 — 그 요청은 prd-trd 경로일 가능성이 높다.
- A1.6 가 버그를 surface 해도 소스 코드 수정 금지. `## A1.6 findings` → open questions 에 기록.
- LOC / 테스트 커버리지 추정; 런타임 중간 승격 (실제 diff 기반 경로 상향).
- 다음 agent 직접 dispatch — 메인 스레드가 아래 "필수 다음 스킬" 을 읽고 진행.
- 유저가 이미 답한 질문 되묻기; router 재호출 (피벗이면 다음 턴에 router 가 돈다).
- B6 의 파일 수 재계산 1회 초과.
- 스킬 내부 (경로명·신호 리스트·필드명) 비영어화 — 유저 추천·확인은 유저 언어 미러링.
