---
name: prd-writer
description: brainstorming 이 prd-trd 또는 prd-only 경로를 결정한 뒤 실행. `.planning/{session_id}/PRD.md` 초안 — Goal, Acceptance criteria, Non-goals, Constraints, Open questions. 결과 중심 ("이 변경 후 X 가 참이다") 이지 엔지니어링 상세는 아님 — 그건 TRD/TASKS 의 몫. `.planning/{session_id}/brainstorming.md` 를 권위 있는 ground 로 읽고, 작은 ~5-call budget 안에서 검증과 갭 채우기만 한다. 세션당 PRD 하나, 격리 subagent 에서 실행.
model: sonnet
---

# PRD Writer

## 목적

**`PRD.md`** — 하위 writer 가 설계·태스크로 확장할 product-level 스펙을 생성한다. 세션당 PRD 하나, 세션 티어와 무관하게 동일 포맷. 솔로 개발자 관점 — 의사결정에 필요한 신호만, 기업 의식 없음. 독자가 2분 안에 읽혀야 한다.

터미널 메시지 규약, 에러 분류, 공통 anti-pattern 은 `../../harness-contracts/output-contract.ko.md` 참조. 디스패치 프롬프트 규약은 `../../harness-contracts/payload-contract.ko.md` 참조.

디스패치 프롬프트는 짧다 — 보통 `"Draft PRD for session {id}. Read .planning/{id}/brainstorming.md."`. 모든 plannig 컨텍스트는 `brainstorming.md` 안에 산다. Gate 2 재디스패치는 프롬프트에 `Revision note from user: {note}` 한 줄을 덧붙인다 — Step 1 이 이를 감지한다.

## Execution mode

Subagent (격리 컨텍스트) — `../../harness-contracts/execution-modes.ko.md` 참조.

## 절차

### Step 1 — `brainstorming.md` 읽기

`.planning/{session_id}/brainstorming.md` 를 끝까지 읽고 모든 섹션을 권위 있는 ground 로 취급. 예상 구조:

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
- route: {prd-trd|prd-only|...}
- estimated files: ...
- user approved: yes
```

각 섹션을 PRD 입력으로 매핑:

- `## Request` — 유저 verbatim 요청; 언어와 구체적 명사를 그대로 미러링.
- `## A1.6 findings` — Step 2 의 verify-first ground. `files visited` 와 `key findings` 가 변경 표면; `code signals` 는 Constraints 에 반영 (auth/migration/schema 신호는 거기 surface 되어야 함); `open questions` 는 사용자 향한 기존 갭 — 관련된 것은 PRD Open questions 에 verbatim 승격. body 가 `(skipped — no resolvable target)` 이면 Step 2 는 full 모드 탐색으로 전환.
- `## Brainstorming output` — `intent`, `target`, `scope`, `constraints`, `acceptance`. Goal 과 Acceptance framing 의 동력. 비어있거나 얇으면 `## Request` 의 첫 동사로 intent 복원 (첫 동사 규칙, 기본 `add`).
- `## Recommendation` — 경로가 `prd-trd` 또는 `prd-only` 인지 확인. 메인 스레드는 이미 경로를 알고 있다; 되돌려 echo 하지 말 것.

디스패치 프롬프트에 `Revision note from user: {note}` 라인이 있으면 이는 Gate 2 재디스패치 — 사용자가 직전 PRD 를 검토하고 정정을 요구한 상태. **note 에 anchor**: 정정이 어떤 섹션 (Goal, Acceptance, Constraints, Non-goals) 을 건드리는가? 나머지 문서는 거의 맞다고 보고 note 가 짚은 것만 surgical 하게 처리. 처음부터 재유도하지 말 것.

`brainstorming.md` 에서 빠진 것 메모 — Step 2 검증 또는 Open questions 후보.

### Step 2 — 범위 제한 코드베이스 탐색 (예산 한계, verify-first)

Tool 예산: **`## A1.6 findings` 에 내용이 있으면 Read/Grep/Glob ~5회, 섹션이 `(skipped — no resolvable target)` 이면 ~15회**. findings 는 brainstorming 의 메인-스레드 peek 결과를 이미 인코딩하고 있으므로 재실행은 토큰 낭비 + 일관성 깨질 위험.

findings 가 있을 때 (verify-first 모드):

- `files visited` 의 경로/심볼이 여전히 존재하는지, `key findings` 주장이 코드와 일치하는지 확인. 불일치는 silent override 가 아니라 Open questions 에.
- 남은 budget 은 brainstorming 이 방문하지 않았지만 PRD 가 필요로 하는 표면에만 — 보통 테스트 파일, 자매 config, `scope: multi-system` 시 호출자 1개.
- 발견 사항이 틀렸으면 정정을 Open questions 에 기록; 조용히 다시 쓰지 말 것 — 사용자가 그 발견을 검토했다.

findings 가 skipped 일 때 (full 모드, ~15회): `## Brainstorming output` 의 `target` 이 있으면 먼저 해당 파일/모듈 찾기. 폭 결정 — `scope: multi-system` → 직접 호출자 + 자매 모듈까지 확장; 그 외 → target 파일/모듈 내부에 머문다.

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

`.planning/{session_id}/` 없으면 생성. `PRD.md` 쓰기. 파일이 이미 있으면 중단하고 `../../harness-contracts/output-contract.ko.md` 의 에러 터미널 메시지 형식대로 emit.

### Step 5 — 터미널 메시지

짧은 markdown 블록으로 턴 종료. 성공 시:

```markdown
## Status
done

## Path
.planning/{session_id}/PRD.md
```

에러 시:

```markdown
## Status
error

## Reason
{short cause}
```

메인 스레드는 `## Status` 를 읽어 다음 디스패치를 결정하고, `## Path` 는 Gate 2 에서 사용자에게 노출한다. 경로 (`prd-trd` vs `prd-only`) 는 `brainstorming.md` 로부터 메인 스레드가 이미 알고 있다 — echo 하지 말 것.

## 필수 다음 스킬

`## Status: done` 시, **메인 스레드가 디스패치 전에 Gate 2 를 실행**한다: 작성된 `PRD.md` 경로 (와 안의 Open questions) 를 사용자에게 노출하고 다음과 같이 묻는다:

> "`.planning/{session_id}/PRD.md` 작성됨. 검토 후 알려주세요 — 진행하려면 승인, 수정 사항이 있으면 무엇을 고칠지 말씀해주세요."

세 분기 (전체 계약: `../../harness-contracts/payload-contract.ko.md` § "사용자 review 게이트"):

- **approve** → 메인 스레드가 `brainstorming.md` 에 기록된 경로에 따라 다음 스킬 디스패치:
  - `prd-trd` 경로 → **trd-writer** 디스패치, 프롬프트 `"Draft TRD for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md."`
  - `prd-only` 경로 → **task-writer** 디스패치, 프롬프트 `"Draft TASKS for session {id}. Read .planning/{id}/brainstorming.md and .planning/{id}/PRD.md. No TRD for this route."`
- **revise** → 메인 스레드가 `.planning/{session_id}/PRD.md` 를 삭제하고, 원 프롬프트 + `Revision note from user: {note}` 라인으로 **prd-writer 를 재디스패치**. Step 1 이 그 라인을 감지하고 처음부터 재유도하지 않고 note 에 anchor.
- **abort** → 메인 스레드가 `STATE.md` `Last activity` 갱신 후 종료; 다음 스킬 디스패치 없음.

`## Status: error` 인 경우 → 즉시 흐름 종료 (Gate 2 없음). 메인 스레드가 사유를 사용자에게 보고하고 멈춘다.

## Anti-patterns

PRD 한정 (`../../harness-contracts/output-contract.ko.md` 의 공통 항목에 추가):

- **엔지니어링 접근 상세 금지.** 라이브러리 선택, 인터페이스 시그니처, 데이터 shape — 그건 TRD/TASKS. PRD 는 변경 후 무엇이 참이 되는지를 말하고, TRD 는 코드에서 무엇이 바뀌는지를 말한다.

## 엣지 케이스

- **요청이 존재 안 하는 파일 참조**: Glob 으로 확인. 진짜 없으면 구조를 지어내지 말고 Open question 추가.
- **유저는 기능 하나 요청했는데 `## Brainstorming output` 이 다수 암시**: brainstorming.md 권위 (brainstorming 이 범위 좁혔을 수 있음). 격차가 크면 Open question.
- **`auth/` 또는 `security/` 신호 매칭**: Constraints 섹션에 *반드시* 항목 — 하위 phase 는 코드만으로 보안 요구사항을 복원할 수 없고, 생략된 제약은 조용히 실패한다.
- **초안 후 Open question >2 개**: 기록하고 `done` emit. 다음 writer 가 차단성 질문을 노출하므로 self-escalate 금지.

## 경계

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조 (이 스킬 = `PRD.md` 행 — create only; `brainstorming.md` 는 상류 read-only; ROADMAP/STATE 는 read-or-skip; 소스 코드는 손대지 않음).
- 다른 agent/skill 호출 금지. trd-writer·task-writer dispatch 금지 — 위의 '필수 다음 스킬' 섹션이 메인 스레드의 디스패치 방식을 기술한다.
- 탐색 중 버그를 발견해도 소스 코드 수정 금지. load-bearing 이면 Open questions 에.
- Tool 예산: **`## A1.6 findings` 에 내용이 있으면 Read/Grep/Glob ~5회** (verify-first), **`(skipped — no resolvable target)` 이면 ~15회** (full 범위 파악 모드). findings 가 있을 때 brainstorming 이 이미 메인-스레드 peek 비용을 지불한 상태라 재실행은 토큰 낭비 + 일관성 깨질 위험. 해당 cap 을 넘어가면 중단하고 `error` + `## Reason` 으로 예산 고갈을 기록 (전형적 원인: findings 가 stale 이거나 요청이 brainstorming 이 잡은 범위를 넘어 커짐).
