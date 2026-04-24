# Flow PRD v0.2 — Claude Code Harness

> **Status**: ✅ v0.2 완성 (2026-04-18), 🔁 v0.2.1 보정 (2026-04-19) — Skill × Agent 하이브리드 반영
> **Scope**: 플로우 설계만. 구체적 스킬/프롬프트/훅 구현은 v0.3 이후.
> **확정 결정**: R2/R3/R4/R5/R6 (섹션 12~16) + D11 (섹션 4.1) · **미확정**: R1 (9개 스킬 프롬프트 + 5개 agent definition — v0.3)

---

## 1. 컨셉

Claude Code 위에서 동작하는 **자체 하네스**. 유저 요청을 받아 **요청 → 계획 → 실행 → 평가 → 문서화** 의 표준 흐름으로 흘리고, 중간에 유저 승인을 받거나 실패 시 루프백한다. 6개 reference 하네스 분석을 바탕으로, GSD(파일 기반 상태) + OMC(훅 기반 강제) + superpowers(스킬 체인)의 장점을 결합한다.

---

## 2. 확정된 설계 결정

| # | 결정 사항 | 선택 | 근거 |
|---|---|---|---|
| D1 | 실행 환경 | Claude Code 플러그인 전용 | 자체 LLM 호출 불필요, CC 에이전트 루프 재사용 |
| D2 | Router 방식 | 하이브리드 (키워드 결정론 → LLM 폴백) | OMC `keyword-detector` 90% 커버 + archon 스타일 모호성 해소 |
| D3 | 복잡도 분류 주체 | LLM 추천 + 유저 확정 | 자동화 + 통제권 양립 |
| D4 | 복잡도 기준 | 예상 파일 수(경계선 5) + 보안·아키텍처 신호 경로 매칭 | OMC verification tier 휴리스틱 차용 |
| D5 | Artifact 포맷 | Markdown (필요 시 YAML frontmatter) | 유저 수정 가능 + LLM 가독성 |
| D6 | **플로우 정의** | **정적 `harness-flow.yaml` (스킬 연결 접착제)** | 스킬 연결 이탈 방지 |
| D7 | 진행 상태 | per-session `ROADMAP.md` (구조) + `STATE.md` (메타) 2파일 분리 | GSD 패턴, LLM 안전 수정 |
| D8 | 승인 게이트 | Phase 3→4 (계획 착수 전) + Phase 6→7 (문서 업데이트 전) | 비싼 작업 착수 전만 |
| D9 | 실패 재실행 | Stop 훅 + retry_count (≥3 에스컬레이션) | OMC ralph 패턴 |
| D10 | 롤백 | 본 버전 제외 | 유저 명시 |
| D11 | 스킬·에이전트 분담 | 하이브리드: 경량 스테이지는 Skill (메인 컨텍스트), 무거운 산출물 생성 스테이지는 Agent 가 **자체 컨텍스트에서 동명의 Skill 을 호출** | 메인 컨텍스트 보호 + Skill 을 single source of truth 로 유지 |

---

## 3. 플로우

```
유저 요청
   ↓
[Phase 1] Router
   ├─ casual     → 일반 대화 (END)
   ├─ clarify    → Phase 2
   └─ plan       → Phase 3 (Phase 2 우회 가능)
   ↓
[Phase 2] Clarification
   ↓
[Phase 3] Complexity Classifier
   ├─ A: PRD → TRD → Tasks  (신규 기능, 복잡)
   ├─ B: PRD → Tasks        (신규 기능, 단순)
   ├─ C: TRD → Tasks        (리팩토링/기술)
   └─ D: Tasks only         (버그/trivial)
   ↓
[Gate 1] 유저 승인 — "B안으로 진행할까요?"
   ↓
[Phase 4] Artifact Creation — PRD.md / TRD.md / TASKS.md 생성
   ↓
[Phase 5] Execution — TASKS.md 를 subagent로 디스패치
   ↓
[Phase 6] Evaluation Loop — lint / test / rule 검증
   ├─ PASS → Gate 2
   └─ FAIL → Phase 5로 루프백 (retry_count++)
          └─ retry ≥ 3 → 에스컬레이션 (유저 호출)
   ↓
[Gate 2] 유저 승인 — "CHANGELOG 업데이트할까요?"
   ↓
[Phase 7] Doc Auto-update
   ↓
완료
```

---

## 4. 컴포넌트 (구현 시점 역할 정의만)

| 컴포넌트 | 종류 | 역할 |
|---|---|---|
| `router` | **Skill** (main) | 입력을 `casual/clarify/plan` 중 하나로 분류. 결정론 먼저, 실패 시 LLM. |
| `brainstorming` | **Skill** (main) | 유저 요청 명확화. 종료 기준: 유저 확인 or 필수 필드 채워짐. |
| `complexity-classifier` | **Skill** (main) | A/B/C/D 추천, 유저 확정 받음. |
| `subagent-dispatcher` | **Skill** (main) | `TASKS.md` 읽어 Claude Code `Task` 툴로 병렬/직렬 디스패치. **heavy 스테이지(prd-writer/trd-writer/task-writer/evaluator/doc-updater) 진입 시 동명의 agent 로 dispatch** (4.1 참조). |
| `prd-writer` | **Agent + Skill** | Agent 가 자체 컨텍스트에서 동명의 Skill 로드 → PRD.md 생성 → 경로 리턴. |
| `trd-writer` | **Agent + Skill** | 동일 패턴 — TRD.md 생성. |
| `task-writer` | **Agent + Skill** | 동일 패턴 — TASKS.md 생성. |
| `evaluator` | **Agent + Skill** | Track 2 (규칙 검증) — Agent 가 `.claude/rules/*.md` + git diff 로드, Skill 이 판단 절차 제공. Track 1 (기계적) 은 Stop 훅이 담당. |
| `doc-updater` | **Agent + Skill** | CHANGELOG 자동 + 문서 영향 분석. Agent 가 프로젝트 문서 스캔, Skill 이 판단·생성 절차 제공. |
| `stop-mechanical-check` | Hook (`.mjs`) | Track 1 — `make check` (없으면 skip) spawnSync 실행, 실패 시 block + 에러 주입 + `retry_count++`. |
| `stop-roadmap-enforcer` | Hook (`.mjs`) | `ROADMAP.md` 체크박스 + `STATE.md` retry_count 검사 → 미완료 시 block + 다음 스킬 지시 주입. |
| `/status` | Slash command | `ROADMAP.md` + `STATE.md` 렌더링. |
| `/flow` | Slash command | `~/.claude/docs/harness/harness-flow.yaml` 렌더링 (다이어그램 or 목록). |

### 4.1 Skill × Agent 분담 (D11 상세)

**문제**: 9개 스테이지를 전부 Skill 로 두면 각 SKILL.md (200~500줄) 가 메인 대화 컨텍스트에 누적된다. 특히 `prd-writer` / `trd-writer` / `task-writer` 는 **코드베이스·참조 문서를 대량 읽어가며 산출물을 만드는 탐색 중심 스테이지** 라, 중간 탐색 흔적까지 메인에 남으면 컨텍스트가 빠르게 오염된다.

**해결**: 경량 스테이지는 Skill 로 유지하고, 무거운 산출물 생성 스테이지는 **Agent 가 자체 컨텍스트에서 동명의 Skill 을 호출**하는 하이브리드 구조.

| 분류 | 컴포넌트 | 이유 |
|---|---|---|
| **Skill only** (메인 컨텍스트) | `router`, `brainstorming`, `complexity-classifier`, `subagent-dispatcher` | 분류·대화·조율이 본질. 세션 상태 (session_id, classification, 유저 응답) 를 메인 흐름에 공유해야 함. 가볍고 빠름. |
| **Agent + Skill** (격리 컨텍스트) | `prd-writer`, `trd-writer`, `task-writer`, `evaluator`, `doc-updater` | 대량 탐색·한방에 산출물 생성. 메인 컨텍스트 보호. Agent 가 얇은 래퍼, Skill 이 instruction 본체. |

**디스패치 패턴**:

```
메인 스레드 (subagent-dispatcher skill)
   ↓ Task 툴로 dispatch (agent name = prd-writer)
Agent 컨텍스트 (격리, 메인 히스토리 못 봄)
   ↓ Skill 툴로 prd-writer skill 로드
   ↓ Skill 절차에 따라 탐색·생성
   ↓ 세션 폴더에 PRD.md 쓰기
   ↓ "PRD.md created at .planning/{id}/PRD.md" 한 줄 요약 리턴
메인 스레드
   ↓ 리턴값 검증 + ROADMAP 체크박스 `[x]`
   ↓ harness-flow.yaml 의 next 로 진행
```

**Skill 의 자기완결성 제약**: Agent 는 메인 대화 히스토리를 볼 수 없으므로, 호출되는 Skill 은 **payload 만으로 산출물이 결정**되어야 한다. 각 Skill SKILL.md 상단에 명시적 입력 스키마 필수:

```yaml
# 예: prd-writer SKILL.md 상단
## Input payload
- session_id: string   # e.g. "2026-04-19-add-2fa-login"
- request: string       # 유저 원 요청 (brainstorming 정제 후)
- brainstorming_output?: object  # router 가 직접 plan 으로 넘긴 경우 없을 수도

## Output  (미니멀: outcome + session_id, 실패 시 reason)
- file: .planning/{session_id}/PRD.md  # 경로는 session_id 로 결정적
- return (done):  { "outcome": "done",  "session_id": "2026-04-19-..." }
- return (error): { "outcome": "error", "session_id": "...", "reason": "PRD.md already exists at <path>" }
```

**Output 스키마 원칙 — 미니멀리즘**:

플로우 노드는 outcome 문자열만 읽고, 경로는 `session_id` 로 결정적이고, task-level 세부는 파일(`TASKS.md` `[Result]` 블록 등)에 살므로 JSON 에 진단 필드를 쌓지 않는다. 하류가 읽지 않는 필드는 전부 제거. 최종 형태:

| 스킬 | done 페이로드 | error/escalate 페이로드 |
|---|---|---|
| router | `{outcome: "plan"\|"clarify"\|"resume", session_id}` (casual 은 JSON 없이 plain text 로 종료) | (해당 없음) |
| brainstorming | `{outcome: "clarified", session_id}` | `{outcome: "pivot"\|"exit-casual", session_id, reason}` |
| complexity-classifier | `{outcome: "prd-trd"\|"prd-only"\|"trd-only"\|"tasks-only", session_id, request, brainstorming_output}` | `{outcome: "pivot"\|"exit-casual", session_id, reason}` |
| prd/trd/task-writer | `{outcome: "done", session_id}` | `{outcome: "error", session_id, reason}` |
| parallel-task-executor | `{outcome: "done"\|"blocked"\|"failed", session_id}` | `{outcome: "error", session_id, reason}` |
| evaluator | `{outcome: "pass", session_id}` | `{outcome: "escalate"\|"error", session_id, reason}` |
| doc-updater | `{outcome: "done", session_id}` (CHANGELOG 자동 + 영향 타겟 자동 패치) | `{outcome: "error", session_id, reason}` |

`artifact`, `task_count`, `completed`, `parallelism_used`, `blocked_tasks`, `failed_tasks`, `violations`, `open_questions`, `defect`, `signals_matched`, `estimated_files`, `stage`, `source` 같은 필드는 **모두 제거**. 필요한 세부는 `reason` 한 줄이나 세션 폴더의 산출물(`TASKS.md`, `PRD.md`, diff) 에서 읽어온다.

**파일 쓰기 규칙**: Agent 가 `.planning/{session_id}/` 에 직접 쓴다. ROADMAP/STATE 업데이트는 메인 스레드의 dispatcher 가 리턴 받은 뒤 수행 — agent 가 이 두 파일을 동시에 건드리면 race·일관성 이슈.

**왜 "Agent as skill wrapper" 가 이득인가**:
- Skill = single source of truth (직접 호출·agent 경유 둘 다 지원)
- Agent definition 은 얇은 `.claude/agents/{name}.md` 파일 — "이 skill 호출해서 작업 수행하라" 한 줄 수준
- Skill 만 개선하면 메인 직접 호출과 agent 경유 둘 다 자동 개선
- 메인 컨텍스트엔 **agent 의 최종 요약 한 줄만** 남음 → 9 스테이지 풀 사이클 돌려도 컨텍스트 깨끗

---

## 5. `harness-flow.yaml` — 플로우 정의 (정적)

**역할**: 모든 스킬이 startup 시 이 파일을 읽어 "내 다음은 누구?" 를 확인. 스킬 간 연결의 단일 소스.

**위치**: `~/.claude/docs/harness/harness-flow.yaml` (글로벌). 프로젝트별 오버라이드는 v0.3 이후 고려.

**배치 근거**: Claude Code 스킬/훅/커맨드는 각자 정해진 디렉토리에 흩어져 존재 (`skills/`, `hooks/`, `commands/`). `harness-flow.yaml` 은 "실행 자산" 이 아니라 **참조 문서** 성격이므로 `docs/` 에 위치. OMC 방식(흩뿌리기)과 동일한 컨벤션.

```yaml
version: 1
name: default-flow

# runner 값의 의미:
#   skill  — 메인 컨텍스트에서 Skill 툴로 직접 실행
#   agent  — dispatcher 가 Task 툴로 agent dispatch,
#            agent 가 자체 컨텍스트에서 동명의 skill 호출 (4.1 참조)

phases:
  - id: router
    runner: skill
    target: router
    role: "입력 분류"
    routes:
      casual: END
      clarify: brainstorming
      plan: classifier

  - id: brainstorming
    runner: skill
    target: brainstorming
    role: "요청 명확화"
    next: classifier

  - id: classifier
    runner: skill
    target: complexity-classifier
    role: "A/B/C/D 중 선택 + 유저 승인 (Gate 1)"
    routes:
      A: prd-writer
      B: prd-writer
      C: trd-writer
      D: task-writer

  - id: prd-writer
    runner: agent          # 격리 컨텍스트 dispatch
    target: prd-writer      # agent definition + 동명의 skill
    role: "PRD.md 생성"
    next:
      when complexity=A: trd-writer
      else: task-writer

  - id: trd-writer
    runner: agent
    target: trd-writer
    next: task-writer

  - id: task-writer
    runner: agent
    target: task-writer
    next: executor

  - id: executor
    runner: skill           # dispatcher 는 메인에 있음 (subagent 병렬 조율)
    target: subagent-dispatcher
    next: evaluator

  - id: evaluator
    runner: agent           # 규칙 검증을 격리 컨텍스트에서
    target: evaluator
    routes:
      pass: doc-updater
      fail: executor        # 루프백
    max_retries: 3
    on_max_retries: escalate

  - id: doc-updater
    runner: agent           # 문서 스캔 + findings 생성 (heavy)
    target: doc-updater     # Gate 2 승인은 agent 가 유저에게 직접 질의
    next: END
```

**각 Skill SKILL.md 상단엔** 이 한 줄만:
> `~/.claude/docs/harness/harness-flow.yaml` 을 읽고, 이 스킬의 `routes`/`next` 에 따라 다음 phase 를 호출하라. 다음 phase 의 `runner: agent` 이면 메인의 `subagent-dispatcher` 가 해당 agent 로 dispatch 한다.

**각 Agent definition (`agents/{name}.md`) 은 얇게**:
```markdown
---
name: prd-writer
description: Dispatched by subagent-dispatcher when a new PRD is required.
tools: Read, Write, Glob, Grep, Skill
---

격리 컨텍스트에서 실행된다. 다음을 수행하라:
1. `Skill` 툴로 `prd-writer` skill 을 로드.
2. 전달받은 payload (session_id, request, classification, brainstorming_output?) 를 skill 에 입력.
3. skill 의 절차대로 PRD.md 를 `.planning/{session_id}/PRD.md` 에 작성.
4. 최종 응답은 `PRD.md created at <path>` 한 줄.
```

---

## 6. per-session 진행상태 — `ROADMAP.md` + `STATE.md` (2파일 분리)

**배경**: GSD 스타일을 따라 **구조(phase 체크박스)** 와 **메타(retry_count, 타임스탬프, CC session_id)** 를 두 파일로 분리. 이유:
- LLM 이 frontmatter YAML 을 수정할 때 구문 오류 위험 → 메타만 분리된 파일로 격리
- `/status` 가 두 파일을 합쳐 렌더, 훅은 둘 다 파싱 가능
- 유저가 읽기 친화적 (roadmap 은 phase 흐름, state 는 진단)

### 6.1 `ROADMAP.md` — 구조 / 체크박스

**위치**: `.planning/{session-id}/ROADMAP.md`

**역할**: phase 체크박스 + artifact 경로. 순수 마크다운, frontmatter 없음.

```markdown
# Session 2026-04-17-add-2fa-login
Request: "로그인 페이지에 2FA 추가"
Complexity: B (PRD → Tasks)

## Phases
- [x] router           → plan
- [ ] ~~brainstorming~~    (우회됨)
- [x] classifier       → B
- [x] gate-1-approval  → approved
- [x] prd-writer       → PRD.md
- [ ] task-writer      → TASKS.md  ← 현재 여기
- [ ] executor
- [ ] evaluator
- [ ] confirm-doc-updates
- [ ] doc-updater

## Artifacts
- PRD.md: .planning/2026-04-17-add-2fa-login/PRD.md
- TASKS.md: (미생성)
```

**갱신 규칙**: 각 스킬이 자기 phase 완료 시 체크박스 `[ ]` → `[x]`.

### 6.2 `STATE.md` — 메타 / 진단

**위치**: `.planning/{session-id}/STATE.md`

**역할**: 훅·escalation 에 필요한 동적 메타. 순수 마크다운, frontmatter 없음.

```markdown
# State — 2026-04-17-add-2fa-login

## Current Position
Phase: task-writer
Status: in-progress
Last activity: 2026-04-17 14:23 — PRD.md 작성 완료

## Evaluator
retry_count: 0
escalated: false
last_eval: -

## Session Continuity
Created: 2026-04-17 13:10
Updated: 2026-04-17 14:23
CC session_id: 3a160f86-db0a-42c2-9254-43b77f44505e
```

**갱신 규칙**:
- `evaluator` (agent): 실패 시 agent 가 FAIL 리턴 → 메인의 dispatcher 가 `retry_count` 증가, 3회 달성 시 `escalated: true`
- 각 phase 완료 시 (skill 이면 자체, agent 면 메인의 dispatcher 가) `Current Position` + `Last activity` 업데이트 — agent 는 ROADMAP/STATE 를 직접 건드리지 않음 (4.1 참조)
- Stop 훅은 이 파일에서 `retry_count`, `escalated`, `Status` 파싱

### 6.3 파일 분리 근거 (references 조사)
- GSD 가 동일하게 `ROADMAP.md` + `STATE.md` 로 분리 (sdk/prompts/templates)
- superpowers 등에서 조사한 결과 **상태 파일에 frontmatter 를 쓰는 레퍼런스 없음** (SKILL.md 같은 *스킬 메타데이터* 에만 frontmatter 사용)
- 훅(Node.js) 에서 정규식으로 `retry_count:\s*(\d+)` 파싱이 YAML 파서 없이도 안전

---

## 7. 핵심 동작

### 7.1 Stop 훅
세션 종료 시도 시 `ROADMAP.md` + `STATE.md` 를 읽어:
- `ROADMAP.md` 모든 phase `[x]` → 통과
- `STATE.md` 의 `escalated: true` → 통과 (유저 개입 대기 중)
- 미완료 `[ ]` 있음 → `{continue: false, decision: "block", reason: "다음 phase: <id> 를 실행하라. ~/.claude/docs/harness/harness-flow.yaml 참고."}` 주입
- `STATE.md` `retry_count ≥ 3` → 에스컬레이션 메시지 주입 후 `escalated: true` 기록, 통과
- OMC 가드 그대로 수용: context_limit / user_abort / auth_error 은 **무조건 통과**

### 7.2 `/status`
`ROADMAP.md` (phase 체크박스 / artifact) + `STATE.md` (retry_count / last activity) 를 합쳐 렌더링. 프로그레스 바는 ROADMAP 기준.

### 7.3 `/flow`
`~/.claude/docs/harness/harness-flow.yaml` 을 Mermaid/ASCII 다이어그램으로 렌더링.

### 7.4 승인 게이트 (흡수 방식)
- **Gate 1** (Phase 3→4): `complexity-classifier` 스킬 내부에서 Tier 추천 직후 유저 승인
- **Gate 2** (Phase 6→7): `doc-updater` 스킬 **첫 단계** 에서 승인 질의 ("CHANGELOG 및 문서 영향 분석 진행할까요?")
- 별도 `user-approval` 스킬 없음 — 각 담당 스킬에 흡수. ROADMAP 에 응답 기록.

---

## 8. 파일 레이아웃

```
~/.claude/
├── docs/
│   └── harness/
│       └── harness-flow.yaml      ← 정적 플로우 정의
├── skills/                         ← 9개 스킬 (instruction 본체, agent 도 로드해서 사용)
│   ├── router/SKILL.md
│   ├── brainstorming/SKILL.md
│   ├── complexity-classifier/SKILL.md
│   ├── prd-writer/SKILL.md         ← agent 경유
│   ├── trd-writer/SKILL.md         ← agent 경유
│   ├── task-writer/SKILL.md        ← agent 경유
│   ├── subagent-dispatcher/SKILL.md
│   ├── evaluator/SKILL.md          ← agent 경유
│   └── doc-updater/SKILL.md        ← agent 경유
├── agents/                         ← 5개 agent definition (thin wrapper)
│   ├── prd-writer.md
│   ├── trd-writer.md
│   ├── task-writer.md
│   ├── evaluator.md
│   └── doc-updater.md
├── commands/                       ← 슬래시 커맨드
│   ├── status.md
│   └── flow.md
├── hooks/
│   ├── stop-mechanical-check.mjs  ← Track 1: make check 실행
│   └── stop-roadmap-enforcer.mjs  ← phase 완료 검사
└── settings.json                   ← 훅 등록 (Stop 이벤트에 두 훅 순차)

<project>/
├── .claude/
│   └── rules/                      ← project 전용 규칙 (있으면 적용)
│       ├── code-style.md           (예시)
│       ├── architecture.md
│       └── commits.md
├── Makefile                        ← `make check` 타깃 (검증 진입점)
└── .planning/
    └── {session-id}/
        ├── ROADMAP.md              ← phase 체크박스 / artifact 경로
        ├── STATE.md                ← retry_count / 타임스탬프 / CC session_id
        ├── PRD.md
        ├── TRD.md
        └── TASKS.md
```

**배치 철학 (OMC 스타일 흩뿌리기)**:
- 스킬은 `skills/`, 에이전트는 `agents/`, 훅은 `hooks/`, 커맨드는 `commands/` — Claude Code 기본 컨벤션 준수
- `harness-flow.yaml` 은 참조 문서라서 `docs/harness/` 에 위치 (실행 자산과 분리)
- 하네스 전용 디렉토리를 별도로 만들지 않아 Claude Code 와 자연스럽게 융합
- Agent 와 Skill 이 같은 이름 (e.g. `agents/prd-writer.md` ↔ `skills/prd-writer/SKILL.md`) 으로 1:1 대응 — 혼란 최소화

---

## 9. Non-goals (본 버전 제외)

- 자동 git 롤백 / 커밋
- Runtime-driven YAML 디스패처 (B 방식) — A 방식으로 시작
- 복잡도 경로 간 전환 (B → A 승격 등)
- 외부 도구 통합 (Linear / Jira)
- 병렬 세션 동시 실행 (한 번에 하나의 session-id)
- 플로우 분기의 조건 표현 풍부화 — 지금은 `when complexity=X` 수준만 지원

---

## 10. 남은 결정 (v0.3 에서 다룰 것들)

- R1: 각 스킬의 실제 프롬프트 내용 + 5개 agent definition (thin wrapper) (v0.3 범위)
- ~~R2~~: ✅ 확정 (섹션 14 참조 — 파일 수 경계 5 + 보안·아키텍처 신호)
- ~~R3~~: ✅ 확정 (섹션 16 참조 — Stop 훅 `make check` + `.claude/rules/` LLM 검증)
- ~~R4~~: ✅ 확정 (섹션 15 참조 — CHANGELOG 자동 + README/CLAUDE.md/docs 영향 분석)
- ~~R5~~: ✅ 확정 (섹션 12 참조)
- ~~R6~~: ✅ 확정 (섹션 13 참조 — GSD 스타일 2파일 분리)

---

## 11. 성공 기준 (이 플로우가 제대로 작동하는지)

- [ ] 유저가 임의 요청 → 첫 응답까지 Router 가 올바른 분류 (casual/clarify/plan)
- [ ] 복잡도 A 요청에서 PRD → TRD → Tasks 순서 이탈 없음 (YAML 덕분)
- [ ] 세션 중단 후 재시작 → ROADMAP 의 마지막 `[x]` 다음부터 재개
- [ ] Eval 실패 시 `STATE.md` 의 retry_count 증가, 3회 후 `escalated: true`
- [ ] `/status` 로 현재 phase + retry 상태 즉시 확인 가능

---

## 12. Session ID 규칙 (R5 확정)

### 포맷
```
YYYY-MM-DD-{slug}
```
예: `2026-04-17-add-2fa-login`

### Slug 생성 흐름
1. Router 스킬이 유저 요청에서 slug 초안을 추출 (예: `"로그인에 2FA 추가"` → `add-2fa-login`)
2. 유저에게 제안: `"세션명 add-2fa-login 으로 진행할까요?"`
3. 유저가 거부/수정 → 수정된 slug 사용
4. 무응답 → 제안 slug 그대로 사용

### 충돌 처리
- 이미 `.planning/2026-04-17-add-2fa-login/` 존재 → `2026-04-17-add-2fa-login-v2` 로 생성
- v2 도 존재 → `v3`, `v4`, ...

### Claude Code session_id 관계
- 하네스 session-id ≠ Claude Code session_id (독립 개념)
- 한 Claude Code 세션에서 여러 하네스 작업 가능
- CC session_id 는 `STATE.md` 의 `Session Continuity` 섹션에 **메타데이터로만** 기록 (감사·디버깅용)

### 세션 재개 (자연어 기반)
- **슬래시 커맨드 없음**. Router 가 자연어로 감지.
- Router 가 다음 패턴 감지 시 재개 모드 진입:
  - `"이어서"`, `"계속"`, `"다시"`, `"resume"`
  - 기존 slug 언급 (예: `"2FA 작업 다시"`)
- 재개 시 Router 동작:
  1. `.planning/` 스캔 → 미완료(`[ ]` 존재) ROADMAP 수집
  2. 요청 내용과 매칭 시도 (slug / request 텍스트 비교)
  3. 후보 1개 → 해당 세션 재개
  4. 후보 여러 개 → 유저에게 선택 제시
  5. 후보 없음 → 신규 세션 흐름으로 전환

### 변경되는 부분
- 섹션 6 의 예시: `Session 2026-04-17-abc123` → `Session 2026-04-17-add-2fa-login`
- 섹션 8 파일 레이아웃: `{session-id}` 실제 값은 위 포맷 사용

---

## 13. 진행상태 파일 포맷 (R6 확정)

### 결정
**GSD 스타일 2파일 분리** — `ROADMAP.md` (구조) + `STATE.md` (메타). 둘 다 **순수 마크다운**, frontmatter 없음.

### 선택지 비교
| 옵션 | 구조 | 메타 저장 | 판정 |
|---|---|---|---|
| 1. 단일 ROADMAP.md, 메타도 마크다운 본문 | 1파일 | 본문 섹션 | 훅 파싱 모호, 스킬이 체크박스 수정하다 메타 덮어쓸 위험 |
| 2. ROADMAP.md + YAML frontmatter | 1파일 | frontmatter | **레퍼런스에 전례 없음**, LLM 이 YAML 구문 깨기 쉬움 |
| 3. ROADMAP.md + sidecar JSON | 2파일 | JSON | 유저 읽기 불편, GSD 컨벤션 이탈 |
| 4. **ROADMAP.md + STATE.md (GSD 스타일)** | 2파일 | 마크다운 | **채택** |

### 채택 근거
- **GSD 선례**: `get-shit-done/sdk/prompts/templates/` 에서 `roadmap.md` + `state.md` 분리 사용, 둘 다 순수 마크다운
- **LLM 안전성**: frontmatter 수정은 YAML 구문 오류 빈발 → 메타만 별 파일로 격리하면 영향 없음
- **훅 파싱**: `retry_count:\s*(\d+)` 같은 정규식으로 YAML 파서 없이 Node.js 훅에서 추출 가능
- **관심사 분리**: ROADMAP 은 "무엇이 남았나", STATE 는 "왜 막혔나" — 유저·LLM 모두 이해 쉬움
- **레퍼런스 검증**: superpowers / archon / oh-my-claudecode / everything-claude-code / gstack 모두 **상태 파일에 frontmatter 를 쓴 사례 없음** (frontmatter 는 SKILL.md 같은 "메타데이터 정의" 용도로만 쓰임)

### 갱신 책임
- `ROADMAP.md`: 각 phase 완료 시 해당 스킬이 체크박스 `[ ]` → `[x]`
- `STATE.md`:
  - 모든 스킬: 자기 phase 진입 시 `Current Position` + `Last activity` 업데이트
  - `evaluator`: `retry_count` 증가, 3회 시 `escalated: true`
  - Stop 훅: `escalated: true` 기록 (retry 한도 초과 시)

### Non-goals
- 원자적 수정 보장 (동시 세션 제한 D7 → 병렬 세션 금지로 회피)
- 자동 아카이브 (완료된 세션 폴더 정리는 v0.3)

---

## 14. 복잡도 분류 기준 (R2 확정)

### 결정 요약
- **파일 수 경계선**: 5 (예상 수정·신규 파일 총합)
- **보안·아키텍처 신호 경로**: OMC `verification-tiers` 그대로 차용
- **tasks-only 자기검증**: 강제 (superpowers 원칙)
- **파일 수 추정 주체**: LLM 추정 + 유저 번복 가능 (D3 연장)

### 판정 규칙

```
유저 요청
   ↓
Router: 키워드 + 경로 신호 감지
   ↓
신호 목록 중 하나라도 매칭? ──── Yes ──→ prd-trd 후보 (파일 수 무관)
   │
   No
   ↓
도메인 분류
   ├─ 신규 기능 + 예상 파일 ≥ 5  → prd-trd
   ├─ 신규 기능 + 예상 파일 ≤ 5  → prd-only
   ├─ 리팩토링/기술 개선           → trd-only
   └─ 버그/trivial + 예상 파일 ≤ 2 → tasks-only (자기검증 필수)
   ↓
LLM 이 유저에게 제시 + 번복 허용
```

### 보안·아키텍처 신호 경로 (OMC 그대로)
| 신호 경로 | 감지 의도 |
|---|---|
| `auth/`, `security/` | 인증·인가 로직 |
| `schema.*`, `*/schema/` | DB / API 스키마 |
| `migrations/` | DB 마이그레이션 |
| `package.json`, `*/package.json` | 의존성·버전 변경 |
| `config.ts`, `*.config.*` | 전역 설정 |

**매칭 방식**:
- **1차**: Router 가 유저 요청 텍스트에서 키워드 감지 ("auth", "로그인", "비밀번호", "DB", "스키마", "마이그레이션", "config", "의존성")
- **2차**: Tier 확정 전 LLM 이 "이 작업이 위 경로를 건드릴 것 같은가" 자문
- **3차(런타임)**: executor 가 실제로 신호 경로 수정 시 "중간 승격" 여부 — **본 버전 non-goal** (v0.3 이후)

### tasks-only 자기검증 (superpowers 원칙)
**강제 이유**: superpowers `brainstorming` SKILL.md 가 명시하는 anti-pattern "간단해 보여서 설계 스킵" 을 남용 방지.

**절차**:
1. Router/classifier 가 tasks-only 추천 시, classifier 스킬 내부에서 다음 체크리스트 통과 필요:
   - [ ] 명확히 버그 수정 또는 typo/format/주석 수준인가?
   - [ ] 예상 수정 파일 ≤ 2 인가?
   - [ ] 보안·아키텍처 신호 매칭 없는가?
   - [ ] 유저 요청에 "설계 필요" 단서(새 용어·의도 모호함)가 없는가?
2. 하나라도 실패 → **prd-only 로 자동 승격** (최소 PRD 작성)
3. 모두 통과 → 유저에게 제시: `"tasks-only 로 바로 진행할까요? (설계 건너뜀)"`

### 파일 수 추정
- **주체**: LLM (classifier 스킬 내부)
- **방식**: 유저 요청 분석 → 대략치 추출 (정수 하나)
- **유저 제시 예시**: `"prd-only 추천: 예상 3~4파일 수정, 보안 신호 없음. 진행할까요?"`
- **유저 번복**:
  - 숫자 직접 제시 (`"10파일 이상"` → prd-trd 승격)
  - 경로 직접 지정 (`"그냥 tasks-only 로"`)

### 판정 예시

| 요청 | LLM 추정 | 신호? | Tier |
|---|---|---|---|
| "버튼 색 빨강으로" | 1 | × | tasks-only |
| "README 오타 수정" | 1 | × | tasks-only |
| "로그인에 2FA 추가" | 4 | ✅ `auth/` | **prd-trd** (신호 승격) |
| "GraphQL 스키마에 `User.avatar` 추가" | 2 | ✅ `schema.*` | **prd-trd** |
| "새 대시보드 페이지" | 8 | × | prd-trd |
| "`useState` → `useReducer` 리팩토링" | 3 | × | trd-only |
| "Prisma → Drizzle 마이그레이션" | 15 | ✅ `migrations/`, `package.json` | prd-trd |

### Outcome 계약 (2026-04-22 archon-style `harness-flow.yaml` 반영)

`harness-flow.yaml` 이 archon 스타일 DAG (`depends_on` + `when:`) 로 통일되면서, classifier 스킬의 최종 JSON `outcome` 필드는 경로 이름을 **직접** 담아야 한다. 메인 스레드는 후속 노드의 `when:` 식에서 이 문자열을 평가해 dispatch 여부를 결정한다:

```json
{ "outcome": "prd-trd", ... }      // prd-trd 확정: PRD → TRD → Tasks
{ "outcome": "prd-only", ... }     // prd-only 확정: PRD → Tasks
{ "outcome": "trd-only", ... }     // trd-only 확정: TRD → Tasks
{ "outcome": "tasks-only", ... }   // tasks-only 확정 (자기검증 통과)
{ "outcome": "pivot" }             // 유저가 다른 요청으로 전환
{ "outcome": "exit-casual" }       // 작업 요청 아니었음
```

기존 안이었던 `{"outcome": "classified", "classification": "A"}` 중첩 형태 및 `A/B/C/D` 단일 문자 라벨은 **쓰지 않는다**. 경로 승격/강등 (tasks-only 자기검증 실패 → prd-only) 도 classifier 스킬 내부에서 해결한 뒤, 최종 outcome 은 승격된 경로 이름 하나를 담는다.

`harness-flow.yaml` 의 후속 노드 `when:` 식:

```yaml
- id: prd-writer
  when: "$classifier.output.outcome == 'prd-trd' || $classifier.output.outcome == 'prd-only'"

- id: trd-writer
  when: "$classifier.output.outcome == 'prd-trd' || $classifier.output.outcome == 'trd-only'"

- id: task-writer
  when: >-
    $classifier.output.outcome == 'prd-trd' ||
    $classifier.output.outcome == 'prd-only' ||
    $classifier.output.outcome == 'trd-only' ||
    $classifier.output.outcome == 'tasks-only'
```

pivot / exit-casual 일 때는 모든 후속 `when:` 이 false → 연쇄 skip → 플로우 자연 종료.

### references 근거
- **OMC `tier-selector.ts`** (줄 45-66): `filesChanged > 20` → THOROUGH, `< 5` + `< 100 LOC` + full test → LIGHT. 우리는 경계선 5 만 차용 (LOC·테스트 커버리지는 요청 시점 미지수라 제외).
- **OMC `verification-tiers.md`** (줄 9-38): 보안·아키텍처 경로 패턴 목록 원본.
- **superpowers `brainstorming/SKILL.md`** (줄 16-18): "Simple projects are where unexamined assumptions cause the most wasted work" — tasks-only 자기검증 근거.
- **GSD `inline_plan_threshold: 2`**: 차용 안 함 (설계 경로 분기가 아닌 실행 분기라 목적 다름).
- **archon / ECC**: 수치 기준 없음 → 차용 없음.

### Non-goals
- 런타임 중간 승격 (executor 가 예상 밖 파일 건드릴 때 Tier 업그레이드) — v0.3
- LOC·테스트 커버리지 기반 분류 — 요청 시점 미지수라 제외
- 프로젝트별 임계치 커스터마이즈 — v0.3

---

## 15. doc-updater 대상 파일 (R4 확정)

### 결정 요약
**전량 자동**: `CHANGELOG.md` 는 무조건, `README.md` / `CLAUDE.md` / `docs/*.md` 도 영향 감지 시 **자동 적용**. `findings.md` 는 결정 surface 가 아닌 **감사 로그**. 유저 확인 프롬프트 없음 — evaluator 가 이미 게이트했고 문서만의 편집은 `git revert` 로 복구 가능.

### 처리 흐름 (단일 노드)

```
doc-updater 스킬 (Phase 7)
   ↓
[Step 1] TASKS.md + git diff 읽기
   ↓
[Step 2] CHANGELOG.md 자동 갱신 (무조건)
   - 없으면 Keep a Changelog 포맷으로 신규 생성
   - 있으면 [Unreleased] 섹션에 append
   - 분류: Added / Changed / Fixed / Security / Deprecated / Removed
   ↓
[Step 3] README.md / CLAUDE.md / docs/**/*.md 영향 스캔
   - 변경된 코드 → 영향받는 문서 섹션 매칭 (의미론적, archon docs-impact 스타일)
   - 권고 형태 2종: 기존 섹션 업데이트 / 신규 섹션 추가
   - 각 권고 ≤20 줄 편집으로 제한
   ↓
[Step 4] 권고 적용 (자동)
   - ≤20 줄 권고는 바로 Edit 적용
   - 전면 재작성 요구는 `not applied — structural rewrite required` 기록
   - 권고 충돌 시 첫 번째만 적용, 나머지는 `not applied` 기록
   ↓
[Step 5] findings.md 감사 로그 작성
   - Scanned: 조사한 모든 파일
   - Changes applied: 적용된 편집 (체크박스 `- [x]`)
   - Not applied: 자동 적용 거부한 권고 + 이유 (유저 숙제)
```

### 왜 자동 적용인가

- **evaluator 가 이미 코드 게이트** — Track 1 `make check`, Track 2 rule 검증 통과한 상태. 문서만의 편집은 리스크 최하위 등급.
- **edits 가 bounded** — 각 권고 ≤20 줄, additive 또는 append-only 중심, top-to-bottom 재작성 명시 금지.
- **findings.md 가 감사 로그** — 유저가 원할 때 열어 "어느 파일 어느 섹션이 왜 바뀌었는지" 추적 가능.
- **복구 비용 미미** — 유저가 싫으면 `git revert <doc-commit>` 한 번으로 원복.
- **세션당 3노드 + 프롬프트 게이트 제거** — v0.2 미니멀리즘 정신과도 일치 (Skill × Agent hybrid 의 "격리된 에이전트 하나로 완결" 원칙).

### 대상 파일 상세

| 파일 | 처리 | 없으면 |
|---|---|---|
| `CHANGELOG.md` | **자동 갱신** (무조건) | Keep a Changelog 포맷으로 **신규 생성** |
| `README.md` | 영향 감지 시 **자동 적용** | Skip (신규 생성 안 함) |
| `CLAUDE.md` | 영향 감지 시 **자동 적용** | Skip |
| `docs/**/*.md` | 영향 감지 시 **자동 적용** | `docs/` 없으면 Skip |

**왜 이 4개**:
- `CHANGELOG.md` — 6 references 모두 존재 (표준)
- `README.md` — 프로젝트 진입점, 기능 추가 시 가장 영향 큼
- `CLAUDE.md` — archon `docs-impact-agent` 의 1순위 대상 (Claude Code 에이전트 컨텍스트)
- `docs/**/*.md` — archon / gsd 공통 스캔 대상

### CHANGELOG.md 포맷 (Keep a Changelog 1.1.0)

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- 로그인 페이지에 2FA 인증 추가 (TASKS.md: task-3, task-5)

### Changed
- JWT 만료 시간 기본값 1h → 15m

### Fixed
- -

### Security
- -
```

**카테고리 자동 분류 규칙** (LLM 이 판단):
- prd-trd / prd-only (신규 기능) → `Added`
- trd-only (리팩토링) → `Changed`
- tasks-only (버그) → `Fixed`
- 보안 경로 신호 매칭 시 → `Security` 에도 중복 기록
- 의존성 제거·API 제거 → `Removed`
- deprecation 문구 포함 → `Deprecated`

### findings.md 포맷 (감사 로그)

```markdown
# Doc Impact Findings — 2026-04-17-add-2fa-login

## Scanned
- README.md ✓
- CLAUDE.md ✓
- docs/auth.md ✓
- docs/api.md ✓

## Changes applied

### CHANGELOG.md
- [x] Added: 로그인 페이지에 2FA 인증 추가 (TASKS.md: task-3, task-5)
- [x] Security: 로그인 페이지에 2FA 인증 추가 (TASKS.md: task-3, task-5)

### README.md
- [x] Section "Features" (line 12) — 2FA 항목 추가

### CLAUDE.md
- [x] Section "Authentication flow" (line 45) — 2FA 단계 추가 설명

### docs/auth.md
- [x] 새 "Two-Factor Authentication" 섹션 추가

### docs/api.md
- (영향 없음)

## Not applied
- docs/architecture.md — structural rewrite required: 2FA 도입이 기존 Auth 섹션 구조 변경 요구. 유저 직접 처리 필요.
```

**구조 해설**:
- `## Scanned` — 조사한 모든 파일 (`✓` = 존재). 없는 타겟 생략.
- `## Changes applied` — 실제 적용된 편집 목록. `- [x]` 고정 (결정 surface 아니므로 미선택 `[ ]` 상태가 존재하지 않음).
- `## Not applied` — 스킬이 자동 적용 거부한 권고 + 한 줄 이유. `structural rewrite`, `conflicts with earlier change`, `translation sync not automated` 등이 전형적 사유. 비어있으면 섹션 생략.

**유저 워크플로우 (사후)**:
- 세션 완료 후 유저가 `git diff HEAD~1` 으로 적용된 편집 확인
- 마음에 안 드는 편집이 있으면 파일 단위로 `git checkout HEAD~1 -- README.md` 또는 전체 doc 커밋 `git revert`
- `## Not applied` 섹션의 유저 숙제 항목을 별도 처리

### references 근거
- **archon `docs-impact-agent`** (`.archon/commands/defaults/archon-docs-impact-agent.md` 줄 1-60): CLAUDE.md + docs/ + agent 정의 스캔, 구조화된 findings 출력. → **Step 3 스캔 로직 차용**, 단 archon 은 권고만 출력하고 유저 적용을 맡김. 우리는 evaluator 게이트 이후라는 전제로 **자동 적용까지 확장**.
- **get-shit-done `/gsd-docs-update`** (`commands/gsd/docs-update.md` 줄 1-50): 9종 문서 자동 업데이트. → 범위 너무 큼, **차용 안 함** (v0.3 이후 고려)
- **everything-claude-code / gstack / OMC `CHANGELOG.md`**: Keep a Changelog 포맷 공통 → **포맷 표준 차용**
- **6 references 모두 CHANGELOG 자동 생성 안 함** → 우리가 이 부분은 선도 (자동화 가치 큼, 리스크 낮음)
- **superpowers**: 완료 후 문서 업데이트 없음 → 차용 없음

### Non-goals
- ARCHITECTURE.md / GETTING-STARTED.md 등 추가 문서 자동 생성 — gsd 수준은 v0.3
- Git commit 자동화 (CHANGELOG 만 갱신, 커밋은 유저) — D10 롤백 non-goal 과 일관
- 버전 bump 자동화 (`[Unreleased]` → `[1.2.0]`) — 릴리스 판단은 유저
- 다국어 문서 동기화

---

## 16. Evaluator 구성 (R3 확정)

### 결정 요약
- **Two-Track**: Track 1 기계적 검증 (Stop 훅) + Track 2 규칙 검증 (evaluator 스킬)
- **훅 이벤트**: `Stop` 확정
- **명령 감지**: `Makefile` 만 — `make check` 있으면 실행, 없으면 skip (package.json 폴백 없음)
- **규칙 위치**: project `<project>/.claude/rules/*.md` 만 (global `~/.claude/rules/` 무시)
- **규칙 포맷**: 자유 마크다운
- **retry_count**: 두 Track 통합 (하나의 카운터, 3회 초과 시 escalation)

### Track 1 — 기계적 검증 (Stop 훅)

**파일**: `~/.claude/hooks/stop-mechanical-check.mjs`

**동작**:
```javascript
// 의사코드
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';

async function main() {
  const input = JSON.parse(await readStdin());

  // OMC 가드 먼저 (D9 패턴 재사용)
  if (isContextLimitStop(input) || isUserAbort(input) || isAuthError(input)) {
    return { continue: true, suppressOutput: true };
  }

  // Makefile 없으면 skip
  if (!existsSync('Makefile')) {
    return { continue: true, suppressOutput: true };
  }

  // make check 실행
  const res = spawnSync('make', ['check'], { stdio: 'pipe', encoding: 'utf8' });
  if (res.status === 0) {
    return { continue: true, suppressOutput: true };
  }

  // 실패 → STATE.md 에 retry_count++ 기록, block
  incrementRetryCount(); // STATE.md 정규식 수정
  const tail = res.stderr.split('\n').slice(-50).join('\n');
  return {
    continue: false,
    decision: 'block',
    reason: `[MECHANICAL CHECK FAILED]\n\nmake check 가 exit ${res.status} 로 실패했다.\n\n--- stderr (마지막 50줄) ---\n${tail}\n\n이 에러를 수정한 뒤 다시 시도하라.`
  };
}
```

**Makefile 전제**:
- `make check` 가 프로젝트의 **검증 단일 진입점** (유저가 Makefile 에 정의)
- 내부적으로 `make lint test typecheck` 조합이든 단일 스크립트든 자유
- 예시:
  ```makefile
  .PHONY: check lint test typecheck
  check: lint typecheck test
  lint:
  	pnpm lint
  typecheck:
  	pnpm tsc --noEmit
  test:
  	pnpm test
  ```

**Makefile 없을 때**: skip + STATE.md 에 `mechanical: skipped (no Makefile)` 기록. Retry 안 함.

### Track 2 — 규칙 검증 (evaluator 스킬)

**호출 시점**: Phase 6 (Track 1 통과 후 harness-flow.yaml 에 의해 evaluator 스킬 호출)

**동작**:
1. `<project>/.claude/rules/*.md` 전체 로드 (없으면 skip, pass 처리)
2. `git diff` (이번 세션의 변경분) 획득
3. LLM 프롬프트 구성:
   ```
   다음 규칙들에 비춰 아래 변경에 위반이 있는지 판단하라.
   위반 있으면 "FAIL\n<위반 목록과 근거>" 형식으로,
   없으면 "PASS" 만 출력하라.
   
   --- RULES ---
   {rules 전체 내용}
   
   --- DIFF ---
   {git diff}
   ```
4. LLM 응답 파싱:
   - `PASS` → Phase 6 완료 → Gate 2 로
   - `FAIL` → `STATE.md` 에 `retry_count++` + `last_eval: "track-2-rule"` + 위반 내용 기록 → Phase 5 executor 로 루프백 (위반 내용 주입)

**규칙 파일 병합**:
- project `<project>/.claude/rules/*.md` 만 로드
- global `~/.claude/rules/` 은 evaluator 가 참조하지 않음 (Claude Code 자체의 CLAUDE.md 주입으로 이미 LLM 컨텍스트엔 들어오지만, evaluator 의 판단 기준은 프로젝트 규칙만)
- project `.claude/rules/` 없음 → Track 2 skip, Phase 6 즉시 pass

**규칙 파일 포맷**: 자유 마크다운. 권장 (강제 아님):

```markdown
# code-style.md

## Forbidden
- production 코드에 `console.log`
- TypeScript 에서 `any` 타입
- WHAT 을 설명하는 주석 (WHY 만 허용)

## Required
- 30줄 초과 함수엔 JSDoc
- 테스트 파일은 소스 파일 경로 미러링
```

### 실행 흐름 (Phase 5 → Gate 2)

```
[Phase 5] Execution (subagent)
   ↓ LLM 이 Stop 시도
   ↓
[Stop 훅 1] stop-mechanical-check.mjs
   ├─ Makefile 없음 → skip, 통과
   ├─ make check PASS → 통과
   └─ make check FAIL → block + retry_count++ → Phase 5 재실행
   ↓
[Stop 훅 2] stop-roadmap-enforcer.mjs
   └─ Phase 6 미완료 감지 → block + "evaluator 스킬 호출하라" 주입
   ↓
[Phase 6] evaluator 스킬 (Track 2)
   ├─ .claude/rules/ 없음 → PASS
   ├─ PASS → ROADMAP 체크박스 `[x]` → Gate 2 로
   └─ FAIL → retry_count++ → Phase 5 로 루프백 (위반 내용 주입)
   ↓
retry_count ≥ 3 감지 시 (어느 Track 이든)
   └─ STATE.md `escalated: true` 기록, 유저 개입 요청 메시지 출력
```

### STATE.md 필드 확장

```markdown
## Evaluator
retry_count: 2                     ← 통합 카운터 (Track 1 + Track 2)
escalated: false
last_eval: track-1-mechanical      ← "track-1-mechanical" | "track-2-rule" | "pass"
last_eval_at: 2026-04-17 14:55
last_eval_excerpt: |
  make check failed: ESLint found 3 errors in src/auth/login.ts
```

### settings.json 등록 (참고)

```json
{
  "hooks": {
    "Stop": [
      { "command": "node ~/.claude/hooks/stop-mechanical-check.mjs" },
      { "command": "node ~/.claude/hooks/stop-roadmap-enforcer.mjs" }
    ]
  }
}
```

순서: mechanical → roadmap-enforcer (mechanical 이 먼저 fail 나면 roadmap 까지 갈 필요 없음)

### references 근거
- **ECC `hooks/hooks.json`** + **`scripts/hooks/quality-gate.js`**: Stop/PostToolUse 훅이 `spawnSync` 로 `biome check`, `tsc` 등 실행 → **Track 1 로직 그대로 차용**
- **ECC `.claude/rules/node.md`** + **`.claude/rules/everything-claude-code-guardrails.md`**: 자연어 마크다운으로 Do/Don't 기술 → **Track 2 의 rule 포맷 원형**
- **OMC `persistent-mode.mjs`**: OMC 가드 (context_limit / user_abort / auth_error) + retry_count 주입 패턴 → **Track 1 훅에 재사용**
- **archon `ralph-dag.yaml` Phase 3**: `bun run type-check && lint && format:check && test` → 우리는 `make check` 로 추상화 (언어·도구 무관)
- **GSD `/gsd-validate-commit.sh`**: 훅이 bash 로 검증하는 전례

### 이전 제안에서 버린 것
- ~~`evaluator.yaml` 캐시~~ — Makefile convention 으로 대체
- ~~package.json scripts 자동 스캔~~ — 유저 결정 (Q2=b)
- ~~Python / Rust / Go 기본 명령 사전 정의~~ — Makefile 이 언어-무관 레이어
- ~~global `~/.claude/rules/` 병합~~ — 유저 결정 (Q3, project only)
- ~~Track 1 · Track 2 retry_count 분리~~ — 유저 결정 (Q5, 통합)

### Non-goals
- Makefile 자동 생성 — 유저가 프로젝트 초기에 직접 작성
- 커스텀 훅 이벤트 (PostToolUse 등) — Stop 만 사용
- rule 파일 포맷 강제 (YAML frontmatter / Do·Don't 섹션 등) — 자유 마크다운
- 병렬 Track 실행 — 순차만 (mechanical 통과 후 rule)
- global `~/.claude/rules/` 병합 — v0.3 이후
