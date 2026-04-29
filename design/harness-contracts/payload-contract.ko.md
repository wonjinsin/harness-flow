# 하네스 payload 계약 (Harness payload contract)

스킬 사이에 흐르는 것의 단일 출처. 각 스킬은 자신의 JSON 상태를 emit 하고 (그 스킬의 `SKILL.md` 에 정의), **메인 thread** 는 그 emission 을 세션-와이드 컨텍스트 필드와 합쳐서 다운스트림 스킬의 payload 를 구성한다. 이 파일은 모든 엣지를 문서화하므로, 세 진실 출처 (스킬 emission, "Required next skill" 섹션, 메인 thread 디스패치 로직) 를 한 곳에 대조할 수 있다.

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

비-pass 종료점: `router → casual` (JSON 없음, 인라인 응답), `brainstorming → pivot|exit-casual`, `*-writer → error`, `executor → blocked|failed|error`, `evaluator → escalate|error`. 각각 세션을 종료한다 — 메인 thread 가 사용자에게 보고하고 멈춘다.

## 세션-와이드 필드

메인 thread 가 체인 전체에 걸쳐 운반하는 필드. 단일 스킬의 emission 에 포함되지 않는다.

| 필드 | 출처 | 수명 |
|---|---|---|
| `session_id` | router (Step 3) | 세션 전체 |
| `request` | 사용자의 원본 턴, router 에서 캡처 | 세션 전체 |
| `brainstorming_output` | brainstorming emission `brainstorming_output` | brainstorming 이후 |
| `brainstorming_outcome` | brainstorming emission `outcome` (`prd-trd`/`prd-only`/`trd-only`/`tasks-only`) | brainstorming 이후 |

## 엣지별 payload

각 항목: **emission** (업스트림 스킬이 쓰는 것) → **payload** (메인 thread 가 다운스트림에 보내는 것). 이름 변경과 추가는 명시적으로 표시 — drift 가 감지되도록.

### router → brainstorming

- 트리거: emission `outcome ∈ {clarify, plan, resume}`. (`casual` 은 인라인 종료; 다운스트림 없음.)
- Emission: `{ outcome, session_id }`.
- Payload: `{ session_id, request, route, resume? }`.
  - `route` = emission `outcome`. `brainstorming` 이 `route` 를 의미적으로 사용 (요청된 인테이크 모드) 하기 때문에 이름이 바뀜 — `outcome` 은 자기 emission 용으로 예약.
  - `resume` = emission `outcome == "resume"` 일 때 `true`; 그 외에는 부재.
  - `request` = 사용자의 그대로의 턴 (세션-와이드).

### brainstorming → prd-writer

- 트리거: emission `outcome ∈ {prd-trd, prd-only}`.
- Emission: `{ outcome, session_id, request, brainstorming_output }`.
- Payload: `{ session_id, request, brainstorming_outcome, brainstorming_output }`.
  - `brainstorming_outcome` = emission `outcome`. prd-writer 자신의 `outcome` 필드가 종료 상태를 운반할 수 있게 이름 변경 (충돌 방지).

### brainstorming → trd-writer

- 트리거: emission `outcome == "trd-only"`.
- Emission: 위와 같은 형태.
- Payload: `{ session_id, request, brainstorming_outcome: "trd-only", brainstorming_output, prd_path: null }`.

### brainstorming → task-writer

- 트리거: emission `outcome == "tasks-only"`.
- Emission: 위와 같은 형태.
- Payload: `{ session_id, request, brainstorming_output, prd_path: null, trd_path: null }`.

### prd-writer → trd-writer

- 트리거: prd-writer emission `outcome: "done"` 그리고 `brainstorming_outcome: "prd-trd"`.
- Emission: `{ outcome, session_id, brainstorming_outcome, path }`.
- Payload: `{ session_id, request, prd_path, brainstorming_outcome: "prd-trd", brainstorming_output }`.
  - `prd_path` = emission `path` (이름 변경: writer 는 자기 작성 파일을 보고; 다운스트림은 그것을 업스트림 PRD 로 소비).

### prd-writer → task-writer

- 트리거: prd-writer emission `outcome: "done"` 그리고 `brainstorming_outcome: "prd-only"`.
- Emission: 위와 같음.
- Payload: `{ session_id, request, prd_path, trd_path: null, brainstorming_output }`.

### trd-writer → task-writer

- 트리거: trd-writer emission `outcome: "done"`.
- Emission: `{ outcome, session_id, path }`.
- Payload: `{ session_id, request, prd_path, trd_path, brainstorming_output }`.
  - `trd_path` = emission `path`. `prd_path` 는 trd-writer 가 받은 그대로 (trd-only 경로에서는 `null` 가능).

### task-writer → parallel-task-executor

- 트리거: task-writer emission `outcome: "done"`.
- Emission: `{ outcome, session_id, path }`.
- Payload: `{ session_id }`.
  - executor 는 `.planning/{session_id}/TASKS.md` 를 디스크에서 읽는다; payload 에 `path` 가 필요 없다.

### parallel-task-executor → evaluator

- 트리거: executor emission `outcome: "done"`. (`blocked`/`failed`/`error` 는 종료.)
- Emission: `{ outcome, session_id }`.
- Payload: `{ session_id, tasks_path, rules_dir?, diff_command? }`.
  - `tasks_path` = `.planning/{session_id}/TASKS.md` (결정적; 메인 thread 가 구성).
  - `rules_dir`, `diff_command` 는 메인 thread 설정에서; 둘 다 선택.

### evaluator → doc-updater

- 트리거: evaluator emission `outcome: "pass"`. (`escalate`/`error` 는 종료.)
- Emission: `{ outcome, session_id }` (비-pass 시 `reason` 추가 가능).
- Payload: `{ session_id, tasks_path, diff_command? }`.

### doc-updater (terminal)

- Emission: `{ outcome, session_id }` (`error` 시 `reason`).
- 다운스트림 없음 — 하네스가 사용자에게 보고하고 멈춘다.

## 컨벤션

- **스킬 `outcome` 은 보편적이다.** 모든 스킬 emission 에 종료 상태를 가리키는 `outcome` 필드가 있다. 다음 스킬은 메인 thread 가 만든 *payload* 를 받지; 업스트림의 `outcome` 을 그 이름으로 직접 읽지 않는다.
- **이름 변경 시 path → 타입 명시.** writer 가 `path` 를 emit 하면 다운스트림 payload 가 `prd_path` / `trd_path` 로 이름 변경한다 — 수신자가 어떤 문서를 받았는지 필드명 수준에서 알 수 있도록 (수신자가 여러 업스트림 문서를 가질 수 있음).
- **부재보다 `null` 선호.** 개념적으로 기대되지만 이번 세션에서 생산되지 않은 문서 (예: trd-only 경로의 `prd_path: null`). 수신자가 `'prd_path' in payload` 대신 `payload.prd_path === null` 로 분기할 수 있게 한다.

## 함께 보기

- `execution-modes.md` — Subagent vs Main context 계약.
- `output-contract.md` — writer 패밀리 payload/output/error 형태.
- 각 스킬의 `## Required next skill` 섹션 — 같은 엣지의 per-skill 뷰.
