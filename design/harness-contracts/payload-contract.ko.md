# 하네스 payload 계약 (Harness payload contract)

스킬 사이에 흐르는 것의 단일 출처. 하네스는 두 계층 모델을 사용한다:

- **계획 산출물**은 `.planning/{session_id}/` 의 **파일**을 통해 흐른다. 다운스트림 writer 는 Read 도구로 업스트림 파일을 직접 읽고, 디스패치 프롬프트는 최소한의 컨텍스트 (session_id, request, 읽을 경로) 만 담는다.
- **실행 상태**는 **대화 속 마크다운**으로 흐른다. 각 스킬의 터미널 메시지는 표준 섹션 헤더 (`## Status`, `## Path`, `## Reason`, …) 를 사용하므로, 메인 thread 가 산문을 파싱하지 않고도 다음에 무엇을 디스패치할지 결정할 수 있다.

이 파일은 모든 엣지를 문서화하므로, 세 진실 출처 (스킬 터미널 메시지, "Required next skill" 섹션, 메인 thread 디스패치 로직) 를 한 곳에 대조할 수 있다.

## 노드 그래프

```
                      router
                        │
                        ▼ (clarify | plan | resume)
                   brainstorming
                        │
       ┌────────────────┼─────────────────┬──────────────┐
       ▼                ▼                 ▼              ▼
   (prd-trd)        (prd-only)        (trd-only)     (tasks-only)
       │                │                 │              │
       ▼                ▼                 ▼              ▼
   prd-writer       prd-writer        trd-writer     task-writer
       │                │                 │              │
       ▼                ▼                 │              │
   trd-writer       task-writer ──────────┤              │
       │                │                 ▼              │
       └───────┬────────┴───────────► task-writer ◄──────┘
               ▼
       parallel-task-executor
               │
               ▼ (done)
           evaluator
               │
               ▼ (pass)
          doc-updater
               │
               ▼ (terminal)
              END
```

비-pass 종료점: `router → casual` (마크다운 헤더 없는 일반 산문), `brainstorming → pivot|exit-casual`, `*-writer → error`, `executor → blocked|failed|error`, `evaluator → escalate|error`. 각각 세션을 종료한다 — 메인 thread 가 사용자에게 보고하고 멈춘다.

## 계획 산출물

스킬 간 핸드오프는 파일에 닻을 내린다. 각 다운스트림 writer 는 업스트림 파일을 직접 읽으며, 디스패치 프롬프트는 세션과 참조할 파일만 명시한다.

| 파일 | 소유자 | 읽는 자 |
|---|---|---|
| `.planning/{session_id}/brainstorming.md` | `brainstorming` (Phase B7, Gate 1 승인 후) | `prd-writer`, `trd-writer`, `task-writer` |
| `.planning/{session_id}/PRD.md` | `prd-writer` | `trd-writer`, `task-writer` |
| `.planning/{session_id}/TRD.md` | `trd-writer` | `task-writer` |
| `.planning/{session_id}/TASKS.md` | `task-writer` | `parallel-task-executor`, `evaluator`, `doc-updater` |

`brainstorming.md` 는 예전에 디스패치 payload 의 세션-와이드 필드로 운반되던 내용을 그대로 이어 받는다. 필수 섹션 — `## Request`, `## A1.6 findings`, `## Brainstorming output`, `## Recommendation` — 이 writer 에게 사용자의 그대로의 요청, verify-first 탐색 ground, intent/target/scope/constraints/acceptance, 그리고 route 를 제공한다. writer 는 모든 섹션을 권위 있는 것으로 취급한다.

brainstorming 의 범위 한정 코드베이스 peek 이 실행되지 않은 경우 (router 가 해결 가능한 target 없이 `plan` 으로 직접 라우팅), `## A1.6 findings` 본문은 `- (skipped — no resolvable target)` 이 된다. writer 는 명시적 "skipped" 마커를 보고 풀 모드 탐색으로 전환한다.

## 엣지별 핸드오프

각 항목: **트리거** (업스트림 스킬의 터미널 메시지 형태) → **디스패치 프롬프트** (메인 thread 가 다운스트림에 보내는 것).

### router → brainstorming

- 트리거: `router` 가 `## Status: clarify | plan | resume` 으로 종료. (`casual` 은 인라인 종료; 다운스트림 없음.)
- 디스패치:
  ```
  Skill(brainstorming, args: "session_id={id} request={text} route={status} resume={true|false}")
  ```
- `route` 는 router 의 터미널 상태 이름을 운반한다. `resume=true` 는 상태가 `resume` 일 때만.
- brainstorming 은 메인 컨텍스트에서 실행 (Skill, Task 아님).

### brainstorming → prd-writer

- 트리거: `.planning/{session_id}/brainstorming.md` 가 존재하고 `## Recommendation` route 가 `prd-trd` 또는 `prd-only`. Gate 1 승인은 brainstorming Phase B6 안에서 이미 흡수되어 B7 이 파일을 쓴다.
- 디스패치:
  ```
  Task(prd-writer, prompt: "Draft PRD for session {id}. Read .planning/{id}/brainstorming.md as authoritative ground.")
  ```

### brainstorming → trd-writer (trd-only route)

- 트리거: `## Recommendation` route 가 `trd-only`.
- 디스패치:
  ```
  Task(trd-writer, prompt: "Draft TRD for session {id}. Read .planning/{id}/brainstorming.md. No PRD will exist for this route.")
  ```

### brainstorming → task-writer (tasks-only route)

- 트리거: `## Recommendation` route 가 `tasks-only`.
- 디스패치:
  ```
  Task(task-writer, prompt: "Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md. No PRD or TRD will exist for this route.")
  ```

### prd-writer → trd-writer (prd-trd route, Gate 2 approve 이후)

- 트리거: prd-writer 가 `## Status: done` 으로 종료, brainstorming.md route 가 `prd-trd`.
- 디스패치:
  ```
  Task(trd-writer, prompt: "Draft TRD for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md.")
  ```

### prd-writer → task-writer (prd-only route, Gate 2 approve 이후)

- 트리거: prd-writer 가 `## Status: done` 으로 종료, brainstorming.md route 가 `prd-only`.
- 디스패치:
  ```
  Task(task-writer, prompt: "Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md. No TRD for this route.")
  ```

### trd-writer → task-writer (Gate 2 approve 이후)

- 트리거: trd-writer 가 `## Status: done` 으로 종료.
- 디스패치:
  ```
  Task(task-writer, prompt: "Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md, .planning/{id}/PRD.md (if exists), and .planning/{id}/TRD.md.")
  ```

writer 는 디스패치 프롬프트에 의존하지 말고 항상 디스크에서 `PRD.md` 존재를 확인해야 한다. `brainstorming.md` 의 `## Recommendation` route 가 모호성을 해소한다.

### task-writer → parallel-task-executor (Gate 2 approve 이후)

- 트리거: task-writer 가 `## Status: done` 으로 종료.
- 디스패치:
  ```
  Skill(parallel-task-executor, args: "session_id={id}")
  ```
- parallel-task-executor 는 메인 컨텍스트에서 실행 (Skill, Task 아님). `.planning/{session_id}/TASKS.md` 를 디스크에서 읽는다.

### parallel-task-executor → evaluator

- 트리거: executor 가 `## Status: done` 으로 종료. (`blocked` / `failed` / `error` 는 세션을 종료한다.)
- 디스패치:
  ```
  Task(evaluator, prompt: "Evaluate session {id}. Read .planning/{id}/TASKS.md and the diff.")
  ```

### evaluator → doc-updater

- 트리거: evaluator 가 `## Status: pass` 로 종료. (`escalate` / `error` 는 종료.)
- 디스패치:
  ```
  Task(doc-updater, prompt: "Reflect session {id} into docs. Read .planning/{id}/TASKS.md.")
  ```

### doc-updater (terminal)

- 다운스트림 없음 — 하네스가 사용자에게 보고하고 멈춘다.

## 사용자 review 게이트

체인에 두 개의 명시적 사용자 게이트가 있다. 둘 다 **메인 thread** 가 소유 — 어떤 스킬도 게이트를 직접 작성하지 않는다; 메인 thread 가 업스트림 터미널 메시지와 다운스트림 디스패치 사이에 사용자 응답을 보유한다.

- **Gate 1 — route 승인** (`brainstorming` Phase B6 안, B7 이전). 사용자가 추천 route 와 (선택적으로) 파일 수 추정을 승인 / 오버라이드한다. 자세한 흐름은 `skills/brainstorming/SKILL.md` Phase B 참조; brainstorming 자체가 메시지를 보내고 응답을 기다린 뒤, 승인이 있어야 `brainstorming.md` 를 작성한다.
- **Gate 2 — spec review** (각 writer 가 `## Status: done` 으로 종료한 직후). 메인 thread 가 writer 의 `## Path` 파일과 파일 본문의 Open questions 를 산문으로 먼저 노출한 뒤, `AskUserQuestion` 으로 사용자 결정을 받는다. 정식 옵션 목록은 `harness-contracts/ask-user-question.ko.md` § "메인 thread — Gate 2" 참조. 세 가지 분기:
  - **approve (승인)** — 메인 thread 가 위 엣지 규칙대로 다음 스킬을 디스패치한다.
  - **revise (수정 요청)** — 메인 thread 가 작성된 파일 (`.planning/{session_id}/<ARTIFACT>.md`) 을 삭제하고, 디스패치 프롬프트에 `Revision note from user: {note}` 한 줄을 추가하여 동일 writer 를 재디스패치한다:
    ```
    Task(prd-writer, prompt: "Draft PRD for session {id}. Read .planning/{id}/brainstorming.md. Revision note from user: {note}")
    ```
    writer 는 revision note 가 있을 때 반드시 우선 처리해야 한다.
  - **abort (중단)** — 메인 thread 가 `STATE.md` `Last activity` 에 abort 사유를 기록 후 종료; 다음 스킬 디스패치 없음.

Gate 2 는 `prd-writer`, `trd-writer`, `task-writer` 의 `done` 종료점 후 발동한다. `error` 후에는 발동하지 않으며 (즉시 종료), `parallel-task-executor` 후에도 발동하지 않는다 (executor 결과는 사용자가 아닌 evaluator 로 — 사용자는 TASKS 게이트에서 이미 plan 을 승인했음).

각 writer 의 `## Required next skill` 섹션은 자기 Gate 2 프롬프트와 승인 시 디스패치할 다음 스킬을 명시한다.

## 컨벤션

- **표준 마크다운 섹션.** 모든 스킬의 터미널 메시지는 다음 섹션 헤더를 일관되게 사용한다:
  - `## Status` — 필수. 스킬의 터미널 어휘에서 가져온 한 줄 값 (`done`, `error`, `clarify`, `plan`, `resume`, `pivot`, `exit-casual`, `pass`, `escalate`, `blocked`, `failed`).
  - `## Path` — 파일이 작성된 경우 (writer, brainstorming).
  - `## Reason` — 상태가 `error`, `escalate`, `blocked`, `failed`, `pivot`, `exit-casual` 등일 때.
  - `## Session` — `session_id` 를 처음 도입하는 메시지에서만 (router).
  - 스킬-특화 섹션이 추가될 수 있음 (예: parallel-task-executor 의 `## Tasks` 블록, doc-updater 의 `## Updated` 블록) — 각 `SKILL.md` 에 정의.
- **계획 내용은 파일이, 상태는 메시지가 소유한다.** writer 의 실제 출력은 `## Path` 의 파일이다. 터미널 메시지는 메인 thread 를 위한 순수 상태 신호일 뿐이며, 산출물 내용을 절대 중복하지 않는다.
- **디스패치 프롬프트는 최소로 유지한다.** `session_id` 와 읽을 경로를 전달하라; 다운스트림 스킬이 디스크에서 Read 할 수 있는 내용을 인라인으로 넣지 마라. 이로써 메인 thread 컨텍스트가 가벼워지고, `brainstorming.md` 가 모든 writer 의 단일 재수화 (rehydration) 지점이 된다.
- **파일이 부재하면 `null` 이 암묵적이다.** PRD 를 기대하는 writer 는 `.planning/{session_id}/PRD.md` 를 직접 확인한다; 부재는 그 route 가 PRD 를 생산하지 않았다는 뜻이다. 디스패치 프롬프트는 부재를 산문으로 명시한다 (예: "No PRD will exist for this route") — 사람 독자를 위한 안내.

## 함께 보기

- `execution-modes.ko.md` — Subagent vs Main context 계약.
- `output-contract.ko.md` — Writer 핸드오프 계약 (writer 가 무엇을 Read·Write 하고 터미널 메시지로 무엇을 보내는지).
- `file-ownership.ko.md` — `brainstorming.md` 를 포함한 파일별 생성/갱신/읽기 권한.
- 각 스킬의 `## Required next skill` 섹션 — 같은 엣지의 per-skill 뷰.
