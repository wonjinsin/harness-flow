---
name: trd-writer
description: prd-writer (prd-trd 경로) 뒤 또는 brainstorming 직후 (trd-only 경로) 실행. `.planning/{session_id}/TRD.md` 초안 — 구체적 파일/함수 이름이 들어간 Affected surfaces, Interfaces & contracts, Data model, Risks. 코드 shape 수준: PRD 의 결과 중심 frame 과도, TASKS 의 단계별 지시와도 다르다. 세션당 TRD 하나, 격리 subagent 에서 실행.
---

# TRD Writer

## 목적

**`TRD.md`** — PRD 레벨의 결과 (무엇을) 와 TASKS 레벨의 단계 (어떻게) 를 잇는 기술 설계 문서. 세션당 한 개, 상류 PRD 가 있든 없든 동일 포맷. 솔로 개발자 관점: 구현 궤적이 확실해질 정도만, 그 이상은 쓰지 않는다. 독자가 3분 안에 읽혀야 한다.

payload schema, output JSON, error taxonomy, 공통 anti-pattern 은 `../../harness-contracts/output-contract.ko.md` 참조.

이 스킬은 `session_id`, `request`, optional `prd_path` (상류에서 PRD 가 만들어졌으면 세팅, 아니면 `null`), `brainstorming_outcome` (`"prd-trd"` 또는 `"trd-only"` — 필수), 그리고 optional `brainstorming_output` 을 받는다.

## Execution mode

Subagent (격리 컨텍스트) — `../../harness-contracts/execution-modes.ko.md` 참조.

## 왜 이 스킬이 존재하나

TRD 는 "코드에서 실제로 무엇이 바뀌고, 왜 이 모양인가" 에 답한다 — PRD 의 결과 중심 요구사항과도 다르고, TASKS 의 단계별 지시와도 다르다. 유일한 분기는 §1 (Context): PRD 가 있으면 상류 goal 을 인용하고, 없으면 기술 동기를 직접 기술. 본문 shape 은 동일해서 하류는 어느 상류가 먹였는지 신경 안 씀.

## Procedure

### Step 1 — Payload 읽기 (PRD 있으면 PRD 도)

`request` 전문을 다시 읽는다. `prd_path` 가 세팅돼 있으면 PRD 를 끝까지 읽고 Goal · Acceptance criteria · Constraints 를 hard input 으로 취급 — TRD 는 그것들을 만족해야지 재유도해서는 안 된다. target 과 가시적 constraints 를 뽑는다. 빠진 게 뭔지 메모 — payload + PRD 만으로 답할 수 없는 건 Step 2 탐색 또는 Open questions 후보.

`prd_path` 가 세팅돼 있는데 파일을 못 읽으면 `../../harness-contracts/output-contract.ko.md` 의 `error` outcome 을 emit.

### Step 2 — 범위 제한 코드베이스 탐색 (예산 cap)

Tool 예산: **Read/Grep/Glob ~25회**. TRD 결정은 실제 함수 시그니처 · 기존 추상화 · 데이터 shape 을 봐야 하므로 변경 위치만 찾는 패스보다 깊다 — 그래서 예산이 더 넉넉하다. 설계 질문에 답하자마자 중단.

Target 주도: 우선순위로 주 파일/모듈을 먼저 찾는다 — `brainstorming_output.target` (있으면), PRD 의 주제 (`prd_path` 세팅돼 있으면), 또는 `request` 의 첫 명사구. 폭 결정:

- `scope_hint: multi-system` → 직접 caller, 형제 모듈, 공유 추상화까지 확장.
- 그 외 → target 파일/모듈과 직접 의존성 안에서만.

다음에 답할 수 있을 때 중단: (1) 코드에서 구체적으로 무엇이 바뀌는가 (파일 레벨, 함수/클래스 이름까지)? (2) 어떤 기존 인터페이스를 소비/노출? (3) 어떤 데이터가 어떤 shape 으로 통과? (4) 이 surface 들에 어디가 의존?

요청이 코드만으로 설계 불가능한 경우 (현지 유사물이 없는 새 외부 연동 등) Open questions 에 적고, 근거 있는 기본값을 `(assumed)` 태그와 함께.

### Step 3 — 템플릿으로 TRD 초안 작성

정확한 구조는 `references/template.md`, PRD 가 있는 경우의 작동 예시는 `references/example.md` 참조. 각 섹션을 채운다 — 범위는 sanity check.

**작성 규칙**:

- 본문은 유저 언어 미러링; 헤더는 영어.
- PRD (있으면) 또는 유저 request 의 구체적 명사를 그대로 — 재표현하면 하류 traceability 가 깨진다.
- Approach 는 **해결의 shape** 을 묘사하지 구현 단계 순서를 쓰지 않는다. 단계 배열은 task-writer 의 몫.
- Interfaces & contracts 는 구체적으로: 함수 시그니처, request/response shape, 이벤트 이름. 진짜 아무것도 변경 안 할 때만 생략.
- Risks 는 구체적: "rate limiter 가 IP 키라서 공유 NAT 사용자 놓침" 이 "보안 이슈 가능" 보다 낫다.
- 가정은 Open questions 에 `(assumed)` 태그.

### Step 4 — 파일 쓰기

`.planning/{session_id}/` 없으면 만들고 `TRD.md` 작성. 파일이 이미 있으면 중단하고 `../../harness-contracts/output-contract.ko.md` 의 `error` 형식대로 emit.

### Step 5 — Emit

최종 JSON 을 최종 메시지로 emit. TRD-writer 의 `done` 예시 (shape 은 `../../harness-contracts/output-contract.ko.md` 정의):

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "path": ".planning/2026-04-19-.../TRD.md" }
```

## 필수 다음 스킬

이 스킬이 `outcome: "done"` 을 emit 하면 (전체 payload 계약: `../../harness-contracts/payload-contract.ko.md` § "trd-writer → task-writer"). 경계에서의 필드 명칭 변환 (예: 이 스킬의 `path` → 다음 스킬의 `trd_path`) 은 거기서 명시:

- **필수 하위 스킬:** harness-flow:task-writer 사용
  Payload: `{ session_id, request, prd_path, trd_path, brainstorming_output }` — `trd_path` 는 이 스킬의 `path` 로부터 구성. `prd_path` 는 trd-only 경로에서 `null` 일 수 있다.

`outcome: "error"` 인 경우: 흐름 종료. 사용자에게 보고하고 멈춘다.

## Anti-patterns

TRD 한정 (`../../harness-contracts/output-contract.ko.md` 의 공통 항목에 추가):

- **단계별 task 리스트 금지.** 단계 배열은 task-writer 의 몫. TRD 는 변경의 shape 을 묘사하고, 거기까지 가는 단계는 TASKS 에 속한다.
- **PRD acceptance criteria 의 verbatim 재진술 금지.** 섹션 참조로 가리킬 것 (예: "PRD §Acceptance criteria #2 참조"). 중복은 drift 를 부르고, evaluator 는 어차피 원본 PRD 어휘로 grep 한다.

## Edge cases

- **PRD 가 있는데 얇거나 불완전**: 그래도 권위 있는 입력으로 취급; 공백은 TRD 의 Open questions 로. 이 스킬 안에서 PRD 를 "고치지" 말 것 — 메인 스레드 결정 사항.
- **요청이 존재 안 하는 파일 참조**: Glob 으로 확인. 진짜 없으면 구조를 지어내지 말고 Open question 으로.
- **탐색에서 `auth/` / `security/` / `migrations/` 우려가 드러남**: 템플릿 §7 규칙은 변경이 아무리 작아 보여도 적용 — 생략이 곧 조용한 실패 모드 (항목이 "accepted: 동작 보존" 같은 형태여도 OK).
- **PRD 없으면서 request 도 아주 얇을 때**: `prd_path` null, `request` 한 문장, `brainstorming_output` null 이면 상류 오라우팅 가능성 높음. best-effort TRD 진행하고 얇음을 Open question 으로.
- **작성 후 Open questions 가 2개 초과**: 기록하고 `done` emit. task-writer 가 차단성 질문을 노출하므로 self-escalate 금지.

## Boundaries

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조 (이 스킬 = `TRD.md` 행 — create only; PRD 는 상류 read-only; 소스 코드는 손대지 않음).
- 다른 agent 나 skill 호출 금지. task-writer dispatch 금지 — 위의 '필수 다음 스킬' 섹션이 하류로 디스패치한다.
- 탐색 중 버그를 발견해도 소스 코드 수정 금지. load-bearing 이면 Open questions 에.
- Tool 예산: Read/Grep/Glob ~25회. 더 필요하면 중단하고 `error` + `reason` 으로 기록.
