---
name: task-writer
description: 실행 직전 마지막 planning 단계로 실행 — trd-writer 뒤 (prd-trd 또는 trd-only 경로), prd-writer 뒤 (prd-only 경로), 또는 brainstorming 직후 (tasks-only 경로). `.planning/{session_id}/TASKS.md` 초안 — executor 의 유일한 진실 원천. 각 task 는 fresh subagent 가 재질의 없이 한 번에 끝낼 수 있는 PR-sized 단위이며, evaluator 가 PRD/TRD 어휘로 grep 하므로 어휘는 verbatim 보존. `.planning/{session_id}/brainstorming.md` (그리고 PRD.md / TRD.md 가 있으면 그들도) 를 권위 있는 ground 로 읽고, ~10-call budget 안에서 파일 존재 확인과 분해 분기점 탐색만 한다. 격리 subagent 에서 실행.
model: opus
---

# Task Writer

## 목적

**`TASKS.md`** — executor 의 유일한 진실 원천. 모든 세션은 tier 와 무관하게 여기서 끝난다. `parallel-task-executor` 가 읽고, `evaluator` 가 게이트하며, task 마다 dispatch 되는 subagent 가 PRD/TRD 컨텍스트 대신 자기 task 블록을 받는다.

터미널 메시지 규약, 에러 분류, 공통 anti-pattern 은 `../../harness-contracts/output-contract.ko.md` 참조. 디스패치 프롬프트 규약은 `../../harness-contracts/payload-contract.ko.md` 참조.

디스패치 프롬프트는 짧다. prd-trd 경로: `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md, .planning/{id}/PRD.md (if exists), and .planning/{id}/TRD.md."`. prd-only 경로: `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md. No TRD for this route."`. tasks-only 경로: `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md. No PRD or TRD will exist for this route."`. Gate 2 재디스패치는 프롬프트에 `Revision note from user: {note}` 한 줄을 덧붙인다 — Step 1 이 이를 감지한다.

## Execution mode

Subagent (격리 컨텍스트) — `../../harness-contracts/execution-modes.ko.md` 참조.

## 왜 이 스킬이 존재하나

Task 별 subagent 는 PRD/TRD 를 컨텍스트로 보지 못한다 — 오직 TASKS.md 의 task 텍스트만 본다. 따라서 PRD/TRD 어휘 verbatim 보존은 스타일 선택이 아니라 correctness: evaluator 가 PRD acceptance 용어로 grep 하므로 재표현하면 trace 가 깨진다.

세션은 네 가지 모양으로 도착하지만 출력 shape 은 동일 (분기는 input 기반, classification 기반 아님):

| Shape | PRD.md 존재 | TRD.md 존재 | Acceptance 뿌리 | Task shape 출처 |
|---|---|---|---|---|
| PRD + TRD | yes | yes | PRD Acceptance criteria | TRD Affected surfaces, Interfaces, Data model |
| PRD only | yes | no | PRD Acceptance criteria | Step 2 탐색 |
| TRD only | no | yes | TRD Interfaces & contracts, Risks | TRD Affected surfaces |
| neither | no | no | `## Brainstorming output` 의 `acceptance` 또는 `## Request` | Step 2 탐색 |

어떤 파일이 존재하는지는 `brainstorming.md` `## Recommendation` 의 경로를 읽고 파일시스템을 확인해서 결정 — 프롬프트 문구만에 의존하지 말 것.

## 절차

### Step 1 — `brainstorming.md` 와 상류 docs 읽기

`.planning/{session_id}/brainstorming.md` 를 끝까지 읽기. 예상 구조:

```markdown
# Brainstorming — {session_id}

## Request
"{verbatim user request}"

## A1.6 findings
- files visited: ...
- key findings: ...
- code signals: ...
- open questions: ...

## Brainstorming output
- intent: ...
- target: ...
- scope: ...
- constraints: ...
- acceptance: ...

## Recommendation
- route: {prd-trd|prd-only|trd-only|tasks-only}
- estimated files: ...
- user approved: yes
```

그 다음, `## Recommendation` 의 경로에 따라 디스크에 있는 것을 읽기:

- **prd-trd** → `.planning/{session_id}/PRD.md` 와 `.planning/{session_id}/TRD.md` 읽기.
- **prd-only** → `.planning/{session_id}/PRD.md` 읽기.
- **trd-only** → `.planning/{session_id}/TRD.md` 읽기.
- **tasks-only** → 상류 docs 없음; `brainstorming.md` 만으로 ground.

선언된 상류 파일이 누락되면 에러 터미널 메시지 emit.

추출:

- PRD: Goal, Acceptance criterion 각각 (→ task `Acceptance:` bullet), Non-goals, Constraints.
- TRD: Affected surfaces (→ task `Files:`), Interfaces & contracts (→ API-shaped task 의 `Acceptance:`), Risks (→ Notes).
- `## Brainstorming output` (PRD 없을 때): `acceptance`, `constraints`.
- `## Request` 만 (상류 docs 없을 때): 동작 verb + object.
- `## A1.6 findings`: `files visited` 가 초기 `Files:` 집합과 분해 분기점 제공; `code signals` 는 Notes 에 risk 콜아웃이 필요한 곳을 표시; `open questions` 는 블로킹이면 task Notes 에 surface. body 가 `(skipped — no resolvable target)` 이면 Step 2 는 full 모드 탐색으로 전환.

디스패치 프롬프트에 `Revision note from user: {note}` 라인이 있으면 이는 Gate 2 재디스패치. **note 에 anchor**: 정정이 어떤 task 또는 측면 (누락 task, 잘못된 `Files:`, 잘못된 DAG 순서, 누락 acceptance bullet) 을 건드리는가? 나머지 TASKS.md 는 거의 맞다고 보고 note 가 짚은 것만 surgical 처리; 처음부터 재분해하지 말 것.

`## Recommendation` 경로가 `tasks-only` 이고 `## Request` 에 actionable verb 가 없으며 `## Brainstorming output` 도 비어있으면 `error` emit.

### Step 2 — 범위 제한 코드베이스 탐색 (예산 cap, verify-first)

Tool 예산: **`## A1.6 findings` 에 내용이 있거나 Affected surfaces 가 있는 TRD 가 있으면 Read/Grep/Glob ~10회, 둘 다 없으면 ~20회**. brainstorming peek 과 TRD Affected surfaces 가 이미 변경 위치를 인코딩하므로 task-writer Step 2 는 대부분 확인과 분해이지 발견이 아니다.

어디 쓰는지는 어떤 정보가 있는지에 따라 (가장 많은 → 가장 적은 정보 순):

- **TRD 있음**: TRD Affected surfaces 의 파일들이 실제 존재하는지 Glob 으로 확인; 줄 범위는 Read. 깊은 탐색은 TRD 가 했고, 너는 확인만. `## A1.6 findings` 와 겹칠 수 있지만 둘 다 있으면 TRD 가 더 권위 있다.
- **`## A1.6 findings` 만 있고 TRD 없음**: `files visited` 를 `Files:` floor 로 출발; 아직 방문하지 않은 호출자/테스트를 grep 으로 분해 분기점 확인.
- **PRD 만, findings 없음**: PRD 주제에서 주 모듈 찾고, 정확한 `Files:` 쓸 만큼만 바깥으로. trd-writer Step 2 보다 얕음 — *어떤 파일이 바뀌는지*만 알면 됨.
- **둘 다 없음** (findings skipped, 상류 docs 없음, ~20 cap): 처음부터. `## Request` 첫 명사구로 시작, 등장 위치 grep, 변경 surface map.

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

### Step 6 — 터미널 메시지

짧은 markdown 블록으로 턴 종료. 성공 시:

```markdown
## Status
done

## Path
.planning/{session_id}/TASKS.md
```

에러 시:

```markdown
## Status
error

## Reason
{short cause}
```

executor 는 `.planning/{session_id}/TASKS.md` 를 디스크에서 직접 읽고 `## Path` 를 소비하지 않는다 — 다른 writer 들과의 대칭성을 위해, 그리고 Gate 2 에서 사용자가 파일 위치를 볼 수 있도록 포함된다.

## 필수 다음 스킬

`## Status: done` 시, **메인 스레드가 executor 디스패치 전에 Gate 2 를 실행**한다: 작성된 `TASKS.md` 경로와 한 줄 요약 (예: "5 tasks, DAG depth 2, touches 4 files") 을 사용자에게 노출하고 다음과 같이 묻는다:

> "`.planning/{session_id}/TASKS.md` 작성됨. 검토 후 알려주세요 — 진행하려면 승인, 수정 사항이 있으면 무엇을 고칠지 말씀해주세요. 실행은 subagent 를 디스패치해 코드 변경을 만들어냅니다."

세 분기 (전체 계약: `../../harness-contracts/payload-contract.ko.md` § "사용자 review 게이트"). 이건 코드 변경이 디스크에 닿기 직전 마지막 게이트라 프롬프트가 그 점을 명시한다.

- **approve** → 메인 스레드가 **parallel-task-executor** 를 스킬 (메인 컨텍스트) 로 실행, `session_id={id}` — executor 가 `.planning/{session_id}/TASKS.md` 를 디스크에서 직접 읽는다.
- **revise** → 메인 스레드가 `.planning/{session_id}/TASKS.md` 를 삭제하고, 원 프롬프트 + `Revision note from user: {note}` 라인으로 **task-writer 를 재디스패치**. Step 1 이 그 라인을 감지하고 note 에 anchor.
- **abort** → 메인 스레드가 `STATE.md` `Last activity` 갱신 후 종료.

`## Status: error` 인 경우 → 즉시 흐름 종료 (Gate 2 없음). 메인 스레드가 사유를 보고하고 멈춘다.

## Anti-patterns

Task-writer 한정 (`../../harness-contracts/output-contract.ko.md` 의 공통 항목에 추가):

- **구현 단계 쓰기 금지.** 어떻게 할지는 subagent 가 결정. Task 는 어떤 surface 를 바꾸고 무엇이 acceptance 를 통과시키는지를 말한다.
- **관련 없는 surface 묶기 금지.** 다른 이유로 다른 파일을 건드리는 두 변경은 두 task.
- **Task 간 Acceptance bullet 중복 금지.** 각 criterion 은 정확히 한 task 에 산다. TRD Risks 는 문서화된 예외 — Risk 가 여러 task 에 걸치면 영향 받는 각 task 의 Notes 에 반복.
- **Acceptance 에 `(assumed)` 태그 금지.** 가정 위에서 criterion 을 써야 한다면 그 항목은 Acceptance 가 아니라 Notes 에 — Acceptance 는 executor 와 evaluator 가 작업을 평가하는 기준이다.

## 엣지 케이스

- **자연스러운 home task 가 없는 PRD Acceptance**: 더미 task 지어내지 말 것. 가장 가까운 기존 task 에 붙이고 PRD 섹션 인용. 정말 어느 task 도 그 surface 를 안 건드리면 Self-Review 박스 *체크 안 한 채* — evaluator 가 들여다볼 정당한 신호.
- **여러 task 에 걸치는 TRD Risk**: 영향 받는 각 task 의 Notes 에 반복. "각 항목 정확히 한 task" 규칙의 예외 — subagent 는 자기 task 만 봄.
- **DAG 사이클**: 파일 쓰지 말고 `error` emit.
- **`## Request` 만 있는 광범위 리팩터**: Step 2 예산을 호출 지점 열거 (Glob) 에 쓰고 각각 Read 하지 말 것. 균일 리팩터면 파일 8개 들어간 단일 task 도 OK.
- **PRD criterion 1개가 task 3개에 걸침**: task 별 하위 claim 으로 쪼개고 각각 같은 PRD 섹션 인용.

## 경계

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조 (이 스킬 = `TASKS.md` 행 — create only; `brainstorming.md`, `PRD.md`, `TRD.md` 는 상류 read-only; 소스 코드는 손대지 않음). 참고: parallel-task-executor 가 나중에 이 파일에 `[Result]` 블록을 append 하지만, 미리 자리를 만들지 말 것.
- 다른 agent/skill 호출 금지. Executor dispatch 금지 — 위의 '필수 다음 스킬' 섹션이 메인 스레드의 디스패치 방식을 기술한다.
- 탐색 중 버그를 발견해도 소스 코드 수정 금지. load-bearing 이면 Notes 에.
- Tool 예산: **`## A1.6 findings` 에 내용이 있거나 TRD Affected surfaces 가 있으면 Read/Grep/Glob ~10회** (verify-first), **둘 다 없으면 ~20회** (full 모드). Task-writer 는 파일 존재 확인 (Glob) 과 분해 분기점 찾기를 해야 하지만 TRD 의 설계 작업이나 brainstorming 의 메인-스레드 peek 을 다시 하지는 않는다. 해당 cap 을 넘어가면 중단하고 `error` + `## Reason` 으로 기록.
