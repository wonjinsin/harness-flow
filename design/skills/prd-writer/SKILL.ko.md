---
name: prd-writer
description: brainstorming 이 prd-trd 또는 prd-only 를 emit 한 뒤 실행. `.planning/{session_id}/PRD.md` 초안 — Goal, Acceptance criteria, Non-goals, Constraints, Open questions. 결과 중심 ("이 변경 후 X 가 참이다") 이지 엔지니어링 상세는 아님 — 그건 TRD/TASKS 의 몫. 세션당 PRD 하나, 격리 subagent 에서 실행되어 코드베이스 탐색이 메인 thread 를 오염시키지 않는다.
---

# PRD Writer

## 목적

**`PRD.md`** — 하위 writer 가 설계·태스크로 확장할 product-level 스펙을 생성한다. 세션당 PRD 하나, 세션 티어와 무관하게 동일 포맷. 솔로 개발자 관점 — 의사결정에 필요한 신호만, 기업 의식 없음. 독자가 2분 안에 읽혀야 한다.

payload schema, output JSON, error taxonomy, 공통 anti-pattern 은 `../../harness-contracts/output-contract.ko.md` 참조.

이 스킬은 `session_id`, `request`, `brainstorming_outcome` (`"prd-trd"` 또는 `"prd-only"` — 필수), 그리고 선택 `brainstorming_output` 을 받는다. `brainstorming_output` 이 null 이면 `request` 의 첫 동사로 intent 복원 (첫 동사 규칙, 기본 `add`).

## Execution mode

Subagent (격리 컨텍스트) — `../../harness-contracts/execution-modes.ko.md` 참조.

## 절차

### Step 1 — Payload 읽기

`request` 전체를 다시 읽는다. Payload 에서 intent, target, 가시적 제약을 추출. 빠진 것 메모 — payload 만으로 답할 수 없는 건 Step 2 탐색 또는 Open questions 후보.

### Step 2 — 범위 제한 코드베이스 탐색 (예산 한계)

Tool 예산: **Read/Grep/Glob ~15회**. 목표는 PRD 를 실제 코드베이스에 기초하게 하는 것 — 감사가 아니다. 질문이 답해지면 즉시 멈춘다.

타겟 지향: `target` 이 있으면 먼저 해당 파일/모듈 찾기. 폭 결정:

- `scope_hint: multi-system` → 직접 호출자 + 자매 모듈까지 확장.
- 그 외 → target 파일/모듈 내부에 머문다.

다음이 답해지면 중단: (1) 변경이 어디 떨어지는가? (파일·디렉토리 수준) (2) 기존 어떤 코드·개념과 상호작용하는가? (3) 코드에 드러난 제약 (기존 스키마·인증 흐름·config 모양) 이 요구사항을 어떻게 형성하는가?

요청이 코드만으로 알 수 없는 것 (순수 UX 결정, 외부 통합 등) 이면 이 단계를 건너뛰고 Open questions 에 기록.

### Step 3 — 템플릿으로 PRD 초안

정확한 구조는 `references/template.md`, 작동 예시는 `references/example.md` 참조. 각 섹션을 채운다 — 범위 (예: "1–3 문장") 는 할당량이 아니라 sanity check.

**작성 규칙**:

- 본문은 유저 언어 미러링; 헤더는 영어.
- 유저가 쓴 구체적 명사를 그대로 — 재표현하면 PRD ↔ TASKS ↔ evaluator traceability 가 깨진다.
- Acceptance criteria 는 체크박스, 각 항목은 독립 검증 가능.
- 유저 요청을 그대로 Goal 로 되풀이 금지. Goal 은 *결과* — "이 변경 후 X 가 참이다" 꼴, 요청 자체가 아니다.
- 가정은 Open questions 에 `(assumed)` 태그.

### Step 4 — 파일 쓰기

`.planning/{session_id}/` 없으면 생성. `PRD.md` 쓰기. 파일이 이미 있으면 중단하고 `../../harness-contracts/output-contract.ko.md` 의 `error` 형식대로 emit.

### Step 5 — 최종 JSON emit

JSON 객체 하나를 최종 메시지로 emit. PRD-writer 의 `done` 예시 (path 는 writer 마다 다름; shape 은 `../../harness-contracts/output-contract.ko.md` 정의):

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "brainstorming_outcome": "prd-trd", "path": ".planning/2026-04-19-.../PRD.md" }
```

필수 필드:

- `outcome: "done" | "error"`.
- `session_id`.
- `brainstorming_outcome` — payload 에서 받은 값을 그대로 echo (메인 스레드가 이 값을 보고 다음 스킬을 결정).
- `path: ".planning/{session_id}/PRD.md"` — `done` 일 때.
- `reason: "<짧게>"` — `error` 일 때.

## 필수 다음 스킬

다음 스킬은 이 스킬 출력에 echo 된 `brainstorming_outcome` 에 따라 갈린다 (전체 payload 계약: `../../harness-contracts/payload-contract.ko.md` § "prd-writer → *"). 경계에서의 필드 명칭 변환 (예: 이 스킬의 `path` → 다음 스킬의 `prd_path`) 은 거기서 명시:

- `brainstorming_outcome == "prd-trd"` → **필수 하위 스킬:** harness-flow:trd-writer 사용
  Payload: `{ session_id, request, prd_path, brainstorming_outcome: "prd-trd", brainstorming_output }` — `prd_path` 는 이 스킬의 `path` 로부터 구성.
- `brainstorming_outcome == "prd-only"` → **필수 하위 스킬:** harness-flow:task-writer 사용
  Payload: `{ session_id, request, prd_path, trd_path: null, brainstorming_output }`
- `outcome: "error"` 인 경우 → 흐름 종료. 사용자에게 보고하고 멈춘다.

## Anti-patterns

PRD 한정 (`../../harness-contracts/output-contract.ko.md` 의 공통 항목에 추가):

- **엔지니어링 접근 상세 금지.** 라이브러리 선택, 인터페이스 시그니처, 데이터 shape — 그건 TRD/TASKS. PRD 는 변경 후 무엇이 참이 되는지를 말하고, TRD 는 코드에서 무엇이 바뀌는지를 말한다.

## 엣지 케이스

- **요청이 존재 안 하는 파일 참조**: Glob 으로 확인. 진짜 없으면 구조를 지어내지 말고 Open question 추가.
- **유저는 기능 하나 요청했는데 payload 가 다수 암시**: payload 권위 (brainstorming 이 범위 좁혔을 수 있음). 격차가 크면 Open question.
- **`auth/` 또는 `security/` 신호 매칭**: Constraints 섹션에 *반드시* 항목 — 하위 phase 는 코드만으로 보안 요구사항을 복원할 수 없고, 생략된 제약은 조용히 실패한다.
- **초안 후 Open question >2 개**: 기록하고 `done` emit. 다음 writer 가 차단성 질문을 노출하므로 self-escalate 금지.

## 경계

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조 (이 스킬 = `PRD.md` 행 — create only; ROADMAP/STATE 는 read-or-skip; 소스 코드는 손대지 않음).
- 다른 agent/skill 호출 금지. trd-writer·task-writer dispatch 금지 — 위의 '필수 다음 스킬' 섹션이 하류로 디스패치한다.
- 탐색 중 버그를 발견해도 소스 코드 수정 금지. load-bearing 이면 Open questions 에.
- Tool 예산: Read/Grep/Glob ~15회 — 범위 위치 파악 ("어디 떨어지고 무엇이 둘러싸는가") 용으로 잡힌 크기이지, 설계-깊이 탐색용이 아니다. TRD 의 ~25 예산이 더 깊은 패스를 위해 존재하므로, TRD 수준 상세가 필요하다 싶으면 그 요청은 prd-trd 경로에 속할 가능성이 크다. ~15 을 넘어가면 중단하고 `error` + `reason` 으로 예산 고갈을 기록.
