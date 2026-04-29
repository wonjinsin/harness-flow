---
name: task-writer
description: 실행 직전 마지막 planning 단계로 실행 — trd-writer 뒤 (prd-trd 또는 trd-only 경로), prd-writer 뒤 (prd-only 경로), 또는 brainstorming 직후 (tasks-only 경로). `.planning/{session_id}/TASKS.md` 초안 — executor 의 유일한 진실 원천. 각 task 는 fresh subagent 가 재질의 없이 한 번에 끝낼 수 있는 PR-sized 단위이며, evaluator 가 PRD/TRD 어휘로 grep 하므로 어휘는 verbatim 보존. 격리 subagent 에서 실행.
---

# Task Writer

## 목적

**`TASKS.md`** — executor 의 유일한 진실 원천. 모든 세션은 tier 와 무관하게 여기서 끝난다. `parallel-task-executor` 가 읽고, `evaluator` 가 게이트하며, task 마다 dispatch 되는 subagent 가 PRD/TRD 컨텍스트 대신 자기 task 블록을 받는다.

payload schema, output JSON, error taxonomy, 공통 anti-pattern 은 `../../harness-contracts/output-contract.ko.md` 참조.

이 스킬은 `session_id`, `request` (항상 존재), optional `prd_path`, optional `trd_path`, 그리고 optional `brainstorming_output` 을 받는다. `prd_path`, `trd_path`, **그리고** `brainstorming_output` 이 모두 null 이고 `request` 에 actionable verb 가 없으면 `error` emit.

## Execution mode

Subagent (격리 컨텍스트) — `../../harness-contracts/execution-modes.ko.md` 참조.

## 왜 이 스킬이 존재하나

Task 별 subagent 는 PRD/TRD 를 컨텍스트로 보지 못한다 — 오직 TASKS.md 의 task 텍스트만 본다. 따라서 PRD/TRD 어휘 verbatim 보존은 스타일 선택이 아니라 correctness: evaluator 가 PRD acceptance 용어로 grep 하므로 재표현하면 trace 가 깨진다.

세션은 네 가지 모양으로 도착하지만 출력 shape 은 동일 (분기는 input 기반, classification 기반 아님):

| Shape | `prd_path` | `trd_path` | Acceptance 뿌리 | Task shape 출처 |
|---|---|---|---|---|
| PRD + TRD | set | set | PRD Acceptance criteria | TRD Affected surfaces, Interfaces, Data model |
| PRD only | set | null | PRD Acceptance criteria | Step 2 탐색 |
| TRD only | null | set | TRD Interfaces & contracts, Risks | TRD Affected surfaces |
| neither | null | null | `brainstorming_output.acceptance` 또는 `request` | Step 2 탐색 |

## Procedure

### Step 1 — Payload 와 상류 docs 읽기

`request` 전문을 다시 읽는다. PRD (있으면), TRD (있으면) 끝까지 읽기. 추출:

- PRD: Goal, Acceptance criterion 각각 (→ task `Acceptance:` bullet), Non-goals, Constraints.
- TRD: Affected surfaces (→ task `Files:`), Interfaces & contracts (→ API-shaped task 의 `Acceptance:`), Risks (→ Notes).
- `brainstorming_output` (PRD 없을 때): `acceptance`, `constraints[]`.
- `request` 만 (상류 docs 없을 때): 동작 verb + object.

선언된 상류 파일이 누락되면 `error` emit.

### Step 2 — 범위 제한 코드베이스 탐색 (예산 cap)

Tool 예산: **Read/Grep/Glob ~20회**. 어디 쓰는지는 어느 상류 docs 가 있는지에 따라:

- **TRD 있음**: TRD Affected surfaces 의 파일들이 실제 존재하는지 Glob 으로 확인; 줄 범위는 Read. 깊은 탐색은 TRD 가 했고, 너는 확인만.
- **PRD 만**: PRD 주제에서 주 모듈 찾고, 정확한 `Files:` 쓸 만큼만 바깥으로. TRD-writer Step 2 보다 얕음 — *어떤 파일이 바뀌는지*만 알면 됨.
- **둘 다 없음**: 처음부터. `request` 첫 명사구로 시작, 등장 위치 grep, 변경 surface map.

다음에 답할 수 있을 때 중단: (1) 어떤 파일이 생성·수정·테스트 추가되는가? (2) 독립 subagent 가 서로 안 막고 task 하나씩 소유할 자연스러운 분기점이 있는가? (DAG shape 결정) (3) 코드베이스가 task 들이 따라야 할 패턴 (테스트 위치, 모듈 경계) 을 노출하는가?

유사물 없는 그린필드라면 근거 있는 경로를 골라 task 를 쓰고 불확실성은 Notes 에. 예산 다 써도 세 질문 못 풀면 중단하고 `error` emit.

### Step 3 — Task 로 분해

Task 1개 = fresh subagent 가 재질의 없이 한 번에 완결할 수 있는 PR-sized 작업.

쪼개기: 공유 context 없는 두 파일; 의존 코드 전에 먼저 들어가야 할 config/migration; 한 커밋 안의 리팩터+동작 변경. 쪼개지 않기: 새 파일과 그 테스트; 함수와 그 단일 caller (서로 명확히 다른 서브시스템 아니면).

3–8 task 가 여러 파일·서브시스템을 건드리는 세션의 건강한 범위. 3 미만 = 묶었거나 분해 부족; 8 초과 = 과다 분할.

**예외, 우선 적용**: 전체 변경이 ≤2 파일이면 1 task 가 정답인 경우가 많다 — 구조를 억지로 만들지 말 것. 자연스러운 세분이 없는 1-파일 변경은 task 1 개이지, "task-1: 편집" / "task-2: 테스트 작성" 으로 쪼개면 trivially 직렬화될 뿐이다. 3–8 휴리스틱은 substantial 한 범위를 가정하므로, trivial 한 범위에서는 휴리스틱을 건너뛴다.

ID: `task-1`, `task-2`, ... 위상 순서로. Evaluator 와 executor 는 ID 로 참조; 이름 바꾸면 상태 추적 깨짐.

### Step 4 — 각 task 작성

템플릿과 Self-Review 체크리스트는 `references/template.md`, 작동 예시는 `references/example.md` 참조.

**작성 규칙**:

- 유저 언어를 prose 에서 미러링; 필드명 (`Depends:`, `Files:`, `Acceptance:`, `Notes:`) 과 코드 식별자는 영어.
- **PRD/TRD 어휘 verbatim.** PRD 가 "2FA" 면 "이차 인증" 쓰지 말 것. TRD 가 `issueSession` 이면 `createSession` 쓰지 말 것. 코드 식별자는 backtick; 개념 용어는 task 첫 등장 시 `**bold**` 로 — evaluator grep 의 목표물.
- **Placeholder 금지.** "TBD", "task N 과 유사", "에러 핸들링 추가", "엣지 케이스 처리" 는 plan failure.
- **Acceptance 는 외부 검증 가능**: "TOTP 검증 통과 후에만 `issueSession` 호출" 은 OK; "구현이 올바르다" 는 불가.
- **Acceptance bullet 각각은 출처 인용** 괄호로: `(PRD §Acceptance criteria)`, `(TRD §Interfaces & contracts)`, 또는 `(request)`.
- **Notes 는 비자명한 제약 전용.** 쓸 말 없으면 필드 자체 생략.

### Step 5 — 파일 쓰기

`.planning/{session_id}/` 없으면 만들고 `TASKS.md` 작성. 파일이 이미 있으면 `error` emit.

Self-Review 쓰기 전에 각 체크를 실제로 수행하고, 정직하게 certify 할 수 있는 박스만 (`[x]`) 체크. 박스 비워두는 건 OK — 알려진 gap 신호. 거짓 체크는 task 누락보다 나쁨.

### Step 6 — Emit

최종 JSON 을 최종 메시지로 emit. Task-writer 의 `done` 예시 (shape 은 `../../harness-contracts/output-contract.ko.md` 정의):

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "path": ".planning/2026-04-19-.../TASKS.md" }
```

## 필수 다음 스킬

이 스킬이 `outcome: "done"` 을 emit 하면 (전체 payload 계약: `../../harness-contracts/payload-contract.ko.md` § "task-writer → parallel-task-executor"). 경계에서의 명세는 거기서 명시:

- **필수 하위 스킬:** harness-flow:parallel-task-executor 사용
  Payload: `{ session_id }` — executor 가 `.planning/{session_id}/TASKS.md` 를 디스크에서 직접 읽으므로 `path` 는 따로 넘기지 않는다.

`outcome: "error"` 인 경우: 흐름 종료. 사용자에게 보고하고 멈춘다.

## Anti-patterns

Task-writer 한정 (`../../harness-contracts/output-contract.ko.md` 의 공통 항목에 추가):

- **구현 단계 쓰기 금지.** 어떻게 할지는 subagent 가 결정. Task 는 어떤 surface 를 바꾸고 무엇이 acceptance 를 통과시키는지를 말한다.
- **관련 없는 surface 묶기 금지.** 다른 이유로 다른 파일을 건드리는 두 변경은 두 task.
- **Task 간 Acceptance bullet 중복 금지.** 각 criterion 은 정확히 한 task 에 산다. TRD Risks 는 문서화된 예외 — Risk 가 여러 task 에 걸치면 영향 받는 각 task 의 Notes 에 반복.
- **Acceptance 에 `(assumed)` 태그 금지.** 가정 위에서 criterion 을 써야 한다면 그 항목은 Acceptance 가 아니라 Notes 에 — Acceptance 는 executor 와 evaluator 가 작업을 평가하는 기준이다.

## Edge cases

- **자연스러운 home task 가 없는 PRD Acceptance**: 더미 task 지어내지 말 것. 가장 가까운 기존 task 에 붙이고 PRD 섹션 인용. 정말 어느 task 도 그 surface 를 안 건드리면 Self-Review 박스 *체크 안 한 채* — evaluator 가 들여다볼 정당한 신호.
- **여러 task 에 걸치는 TRD Risk**: 영향 받는 각 task 의 Notes 에 반복. "각 항목 정확히 한 task" 규칙의 예외 — subagent 는 자기 task 만 봄.
- **DAG 사이클**: 파일 쓰지 말고 `error` emit.
- **`request` 만 있는 광범위 리팩터**: Step 2 예산을 호출 지점 열거 (Glob) 에 쓰고 각각 Read 하지 말 것. 균일 리팩터면 파일 8개 들어간 단일 task 도 OK.
- **PRD criterion 1개가 task 3개에 걸침**: task 별 하위 claim 으로 쪼개고 각각 같은 PRD 섹션 인용.

## Boundaries

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조 (이 스킬 = `TASKS.md` 행 — create only; PRD/TRD 는 상류 read-only; 소스 코드는 손대지 않음). 참고: parallel-task-executor 가 나중에 이 파일에 `[Result]` 블록을 append 하지만, 미리 자리를 만들지 말 것.
- 다른 agent/skill 호출 금지. Executor dispatch 금지 — 위의 '필수 다음 스킬' 섹션이 하류로 디스패치한다.
- 탐색 중 버그를 발견해도 소스 코드 수정 금지. load-bearing 이면 Notes 에.
- Tool 예산: Read/Grep/Glob ~20회 — PRD 의 범위 위치 ~15 와 TRD 의 설계-깊이 ~25 사이에 잡힌 크기. Task-writer 는 파일 존재 확인 (Glob) 과 분해 분기점 찾기를 해야 하지만 TRD 의 설계 작업을 다시 하지는 않는다. 더 필요하면 중단하고 `error` + `reason` 으로 기록.
