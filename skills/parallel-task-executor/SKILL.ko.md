---
name: parallel-task-executor
description: 세션의 TASKS.md 가 준비되면 사용. 격리된 agent 가 아닌 **메인 대화 컨텍스트**에서 실행. `.planning/{session_id}/TASKS.md` 를 읽어 `Depends:` 필드로 DAG 를 만들고, 각 task 를 Claude Code `Task` 툴로 subagent dispatch — 레이어 안은 병렬, 레이어 간은 순차. 모든 task 가 종료되면 한 줄 결과 emit.
---

# Parallel Task Executor

## Purpose

TASKS.md 의 모든 task 를 완료까지 — 또는 evaluator 가 판단 가능한 깔끔한 halt 까지 — 돌린다. `harness-flow.yaml` 의 Phase 5 스킬. Claude Code `Task` 툴을 루프로 호출하는 **유일한** 스킬.

writer 스킬들(`prd-writer`, `trd-writer`, `task-writer`) 과 달리 executor 는 **메인 대화 컨텍스트**에 산다. `ROADMAP.md` 업데이트와 병렬 subagent 리턴 조율은 메인 스레드가 필요하기 때문 — 둘 다 격리된 agent 로는 못 한다. 무거운 작업은 dispatch 된 subagent 안에서, 일회용 격리 컨텍스트에서 일어난다.

## Why this exists

executor 는 계획이 실제 코드와 만나는 choke point. 세 가지 설계 압력이 형태를 결정한다:

1. **DAG 모양 병렬은 싸고 안전하다, 아무 병렬이나 그렇지 않다.** task 는 TASKS.md 에 `Depends:` 와 `Files:` 를 선언한다. 의존 없고 파일 겹침 없는 task 는 동시 실행 가능. 파일을 공유하는 task 는 DAG 가 허락해도 직렬화해야 한다. 공유 파일 git 충돌은 subagent 가 고칠 수 있는 버그가 아니라 **스케줄링 실수**다.
2. **task 하나에 fresh subagent 하나, subagent 하나가 여러 task 하지 않음.** 각 task 는 해당 task 에만 필요한 것만 담긴 focused 프롬프트로 dispatch 된다 — task 본문, `Acceptance:` bullet, `Files:` 목록, TDD 지시. subagent 는 TASKS.md 나 PRD/TRD 를 읽지 않는다. 이게 task-writer 의 계약: task 는 self-contained.
3. **실패는 분류하지 그냥 재시도하지 않는다.** subagent 는 DONE / BLOCKED / FAILED 로 리턴 가능. DONE = Acceptance 검증 가능. BLOCKED = task 자체가 틀림 (정보 부족, Acceptance 모순) — 재시도로 안 고쳐진다. FAILED = 시도가 틀렸지만 task 는 가능할 수도 — 더 강한 모델이나 좁은 scope 로 재시도. 이 셋을 뭉개면 retry 루프가 같은 에러 루프가 된다.

Phase 5→6 handoff 는 `TASKS.md` 의 각 task 가 `[Result]` 섹션에 `[x]` 로 마킹되고 세션 worktree 에 커밋이 푸시된 상태, 또는 evaluator(Phase 6) 가 실수로 규칙/테스트 탓으로 돌릴 뻔한 구조화된 에러로 halt 된 상태.

## Input payload

격리된 agent **아니므로** 메인 대화 컨텍스트를 이어받는다. 그래도 이 스킬은 기억 없는 것처럼 읽어라 — 권위는 세션 폴더에 있다.

- `session_id`: `"YYYY-MM-DD-{slug}"` — 메인 스레드가 전달.
- `.planning/{session_id}/TASKS.md`: 진실의 원천. 없으면 halt.
- `.planning/{session_id}/ROADMAP.md`: 모든 task 완료 시 `executor` phase 마킹용.

STATE.md 는 참조하지 않는다. 세션 레벨 retry 루프 자체가 없고, task-local 재시도는 전부 TASKS.md `[Result]` 블록에 산다.

메인 스레드가 추가 힌트를 주면 (예: "task-3 만 재시도") 존중한다. 기본 동작: "TASKS.md 에서 아직 `[Result: done]` 마킹 안 된 모든 task 실행."

## Output

모든 task 종료 시 단일 JSON 객체 emit. task 레벨 결과는 TASKS.md `[Result]` 블록에 살고 — evaluator 가 다시 읽는다. JSON 은 top-level outcome 만 전달.

**done** — 모두 DONE:

```json
{ "outcome": "done", "session_id": "2026-04-19-..." }
```

**blocked** — task 명세(구현 아님) 가 틀린 경우. TASKS.md 레벨 검증 실패(cycle, `Depends:` 오타, 빈 Acceptance, 빈/없는 TASKS.md) **포함**. 재 dispatch 로 해결 불가 — 상류에서 task 본문을 고쳐야 한다.

```json
{ "outcome": "blocked", "session_id": "2026-04-19-..." }
```

`harness-flow.yaml` 은 `executor → evaluator` 로 무조건 진행한다 — evaluator 스킬이 `[Result: blocked]` 블록을 감지해 escalate 한다.

**failed** — 하나 이상 task 가 3회 재시도 cap 소진:

```json
{ "outcome": "failed", "session_id": "2026-04-19-..." }
```

**error** — 인프라·툴 레이어 실패 (Task 툴 오류, 파일시스템 거부, TDD reference 누락, TASKS.md 없음):

```json
{ "outcome": "error", "session_id": "2026-04-19-...", "reason": "TDD reference file missing at <path>" }
```

JSON 외 prose 절대 금지. 부분 진행 됐으면 TASKS.md `[Result]` 블록에 현실 그대로 남긴다 — 메인 스레드가 executor 를 재 dispatch 할 수 있고, Step 1 resume 규칙에 따라 재개된다.

## Procedure

### Step 1 — TASKS.md 로드·검증

`TASKS.md` 전체 읽기. 파일이 없으면 halt: `{"outcome": "error", "session_id": "...", "reason": "TASKS.md not found at .planning/{session_id}/TASKS.md"}` (task-writer 가 산출물을 emit 하지 않은 것).

각 `task-N` 의 `Depends:`, `Files:`, `Acceptance:` 블록 추출. `## Goal` 과 `## Architecture` 도 읽어둔다 — subagent 프롬프트엔 안 들어가지만(너무 넓음) subagent 리턴의 타당성 판단엔 도움.

**환경 검사** (인프라 — 여기 실패는 `error` emit):

- `{executor-skill-path}/references/test-driven-development.md` 존재 확인. 없으면 halt: `{"outcome": "error", "session_id": "...", "reason": "TDD reference file missing at <path>"}`. subagent 가 이 파일 없이는 task 완료 불가.

**TASKS.md 모양 검증** (task-writer 산출물이 틀림 — 여기 실패는 `blocked` emit; task 레벨 reason 은 TASKS.md `[Result]` 블록에 쓰고, 최종 JSON 에는 안 담는다):

- **빈 TASKS.md** (`task-N` 항목 0개): `error` emit, `reason: "TASKS.md contains no tasks"` — 마킹할 task 자체가 없음.
- **`Depends:` 그래프에 cycle**: cycle 구성원 전부를 `[Result: blocked, reason: "cycle: task-A → task-B → task-A"]` 로 마킹 후 진행 (dispatch 되는 것 없음).
- **`Depends:` 가 존재하지 않는 task ID 참조**: 그 dangling task 를 `[Result: blocked, reason: "task-N depends on nonexistent task-M"]` 로 마킹.
- **`Acceptance:` 가 빈 task**: **전체 런을 halt 하지 말 것.** 해당 task 의 `[Result]` 블록을 dispatch 없이 `Status: blocked, Reason: empty Acceptance` 로 선마킹하고 나머지는 진행. 그 task 는 최종 `blocked` outcome 에 기여하고, 의존 task 들은 Step 3 전파로 skip 된다.

**이전 런에서 resume** — TASKS.md 에 이미 이전 executor 호출의 `[Result]` 블록이 있으면:

- `Status: done` → task 완료, 재 dispatch 안 함. DAG 에는 satisfied 의존 노드로 포함.
- `Status: blocked` 또는 `Status: skipped` → terminal 취급; 재 dispatch 안 함. 메인 스레드가 fresh 런을 원하면 `[Result]` 블록을 먼저 지운다.
- `Status: failed, Attempt: N` → attempt 카운터 이어간다. 다음 dispatch 는 `Attempt: N+1`. `N ≥ 3` 이면 terminal 취급 (재 dispatch 안 함). 3회 cap 은 매 호출이 아니라 세션 전체 — 안 그러면 대화 재시작이 재시도 루프를 무한히 늘릴 수 있다.

메인 스레드가 명시 힌트를 주면 (예: "task-3 만 재시도, attempt 리셋") 그대로 따른다. 힌트 없으면 위 규칙.

### Step 2 — 실행 계획 구성: DAG → 레이어 → 파일 겹침 직렬화

task 그래프 위상 정렬. 결과는 **레이어** 시퀀스 — 레이어 N 의 모든 task 는 레이어 <N 에 의해 의존 해결 완료.

각 레이어 안에서 **파일 겹침** 검사: 같은 레이어 두 task 가 `Files:` 블록에 같은 경로 하나라도 공유하면 직렬화 — 하나 먼저 dispatch (task ID 오름차순), 다른 하나는 이후 dispatch 그룹으로.

**`Files:` 항목에서 경로 추출하는 법**: 백틱 안의 문자열만 취한다. 비교 전에 `:N-M` 라인-범위 suffix 는 제거 (즉 `src/foo.ts:10-20` 과 `src/foo.ts:50-80` 은 둘 다 `src/foo.ts` 로 해석되어 겹침으로 본다 — 두 subagent 가 같은 파일을 심지어 disjoint 라인 범위라도 동시에 편집할 수 없다. 서로의 변경을 보지 못하기 때문). `(also rename to ...)` 같은 괄호 주석은 무시.

**그 다음 concurrency cap 적용**: 파일 겹침 직렬화 후에도 어떤 dispatch 그룹이 5개 초과면 task ID 오름차순으로 ≤5 sub-그룹으로 쪼갠다. sub-그룹은 순차 실행. 이렇게 하면 "dispatch 그룹" 개념이 단일 의미로 유지된다: dispatch 그룹은 항상 파일 겹침 없는 ≤5개 task 집합으로, 한 assistant turn 에 실행된다.

결과는 **dispatch 그룹** 의 순서 있는 리스트 — 그룹은 순차 실행; 그룹 내 모든 Task 호출은 같은 assistant turn 에 들어간다.

예: TASKS.md 에 `task-1 (Depends: none, Files: auth/login.ts)`, `task-2 (Depends: task-1, Files: auth/totp.ts)`, `task-3 (Depends: none, Files: pages/landing.tsx)`. 위상 레이어: `[task-1, task-3]`, `[task-2]`. 레이어 1 파일 겹침 없음, 레이어 크기 ≤ 5. dispatch 그룹: `{task-1, task-3}` → `{task-2}`.

**왜 subagent 에게 충돌 처리를 맡기지 않나?** 공유 파일 git 충돌은 subagent 가 못 고치는 버그 — `auth/login.ts` 를 병렬로 편집하는 두 subagent 는 둘 다 자기가 주인이라 생각한다. dispatch 레이어에서 직렬화하는 게 싸고, 문제를 **불가능하게** 만든다.

### Step 3 — 각 그룹을 Task 툴로 dispatch

각 dispatch 그룹마다 그룹 내 task 수만큼 Task 툴 호출. 한 그룹의 모든 Task 호출은 **같은 assistant turn** 에서 일어나야 함 — 이게 Claude Code 가 실제로 병렬 실행하는 방식. (turn 을 나누면 직렬화된다.)

각 Task 호출은 **subagent 프롬프트 템플릿**(다음 섹션) 으로 구성된 프롬프트를 받는다. `subagent_type: "general-purpose"` 사용 — task 실행용 특화 agent 는 없다 (writer 가 특화, executor 는 오픈엔드).

그룹 dispatch 후 **모든 리턴이 올 때까지 하나도 안 읽는다**. Task 툴이 병렬 리턴을 모아준다. 각 리턴 읽고, 분류(DONE/BLOCKED/FAILED — Step 5) 하고, TASKS.md 에 `[Result]` 블록 쓴 뒤 다음 그룹으로.

그룹 내 어떤 task 든 BLOCKED 나 FAILED 면 **이후 그룹의 의존 task 는 dispatch 하지 않는다** — 전제가 깨진 것. 의존 task 는 `[Result: skipped, reason: depends on task-N which {blocked|failed}]` 로 마킹하고 finalize.

### Step 4 — Subagent 프롬프트 템플릿

dispatch 된 subagent 는 이 구조를 받는다. `{…}` 필드는 TASKS.md 에서 채운다.

```
You are executing {task-id} from a multi-task plan. You have an isolated context —
you cannot see other tasks, the PRD, or the TRD. Everything you need is below.

## Task
{task-id} — {task title, verbatim}

## Files you will touch
{task Files: block verbatim, Create/Modify/Test entries preserved}

## What success looks like
{task Acceptance: block verbatim, each bullet on its own line}

## Notes
{task Notes: block if present; otherwise omit this section}

## How to work

Before writing any production code, read
`{executor-skill-path}/references/test-driven-development.md` in full and follow
it exactly. The Iron Law, Red-Green-Refactor cycle, Red Flags, and Verification
Checklist in that file are non-negotiable for your work on this task.

That discipline applies to every testable Acceptance bullet below. If an
Acceptance bullet is not testable (e.g., "file is renamed"), verify it with a
deterministic command (grep, ls, etc.) and include the command + output in your
`evidence` list.

## What to return

Return a single block at the end of your response:

[Result]
status: done | blocked | failed
summary: (1-2 sentences — what you did, or why you couldn't)
evidence:
  - (list of Acceptance bullets you satisfied, each paired with how you verified it —
     test name, grep output, file path + line, etc.)
blockers: (only if status=blocked — specific claim about what in the task is wrong)
```

**TDD 가 peer phase 가 아니라 여기서 로드되는 이유**: TDD 는 각 dispatch 된 subagent 컨텍스트 *내부*의 구현 규율이다. executor 가 직접 테스트를 돌리지 않는다 — 각 subagent 가 자기 slice 에서 돌린다. executor 의 일은 조율이지 검증이 아니다; 검증은 Acceptance bullet 과 그 다음 evaluator 에 있다.

**경로 치환**: 이 executor 스킬 자체가 각 Task 툴 dispatch 직전에 위 프롬프트의 `{executor-skill-path}` 를 **자신의 `SKILL.md` 파일이 있는 디렉토리 절대 경로**로 치환한다 (전역 설치 시 `~/.claude/skills/parallel-task-executor`, 레포 내부에서 호출 시 레포의 `skills/parallel-task-executor` 경로). dispatch 시점에 경로를 해석할 것 — 하드코드 금지. 프롬프트에서 유일한 템플릿 경로.

**프롬프트가 self-contained 인 이유**: subagent 는 PRD/TRD 를 다시 읽거나 너에게 질문할 수 없다. 정보가 부족하면 BLOCKED 리턴. 이게 task-writer 의 "PRD/TRD 어휘 verbatim, 플레이스홀더 금지" 규칙이 load-bearing 인 이유 — task 본문이 그 자체로 충분해야 한다.

### Step 5 — 각 subagent 리턴 분류

각 리턴에서 `[Result]` 블록 파싱. 네 terminal 상태 가능:

- **done**: `status: done` 이고 모든 Acceptance bullet 이 `evidence` 에 검증 방법과 함께 등장. `[Result: done]` + summary 로 마킹.
- **blocked**: `status: blocked` OR `status: done` 인데 evidence 누락·모호 OR subagent 가 리턴 대신 명확화 질문 OR **`[Result]` 블록 누락/malformed/인식 불가 status 값**. task 명세(또는 subagent 프로토콜 준수)가 틀림 — 재시도 무효. `[Result: blocked, reason: <blockers text 또는 "malformed Result block">]` 마킹, 자동 재 dispatch 안 함.
- **failed**: `status: failed` OR per-task Task 툴 에러 (subagent 는 시작했으나 깔끔히 완료 못함 — timeout, 컨텍스트 한도 초과, 중간 crash). `[Result: failed, attempt: N, reason: …]` 마킹 후 아래 재시도 정책 적용. **인프라 에러와 구분** — Task 툴 자체가 dispatch 불가(`subagent_type` 무효, 파일시스템 거부, subagent 리턴 대신 프레임워크 레벨 에러 래퍼 반환) 면 전체 런 halt: `{"outcome": "error", "session_id": "...", "reason": "..."}`, 개별 task 마킹 안 함.
- **skipped**: 의존 task 가 `blocked` 또는 `failed` 로 종결됐을 때 (리턴 아닌) **할당된다**. Step 3 에서 dispatch 없이 설정. `[Result: skipped, reason: depends on task-N which {blocked|failed}]` 마킹. 재시도 없음, evidence 필드 없음.

**FAILED 재시도 정책** (BLOCKED 아님, skipped 아님):

- 1차 실패 → 같은 프롬프트 + `subagent_type: "general-purpose"` 로 1회 재시도. `attempt: 2` 기록.
- 2차 실패 → 프롬프트 앞에 주석 prepend 하고 1회 재시도: `"Previous attempt failed. Previous summary: <text>. Previous blockers: <text>. Narrow your scope and focus on the first Acceptance bullet only."` `attempt: 3` 기록.
- 3차 실패 → 중지. `[Result: failed, attempt: 3, reason: repeated failure after narrow-scope retry]` 마킹하고 terminal 취급. 루프 계속 안 함.

3회 cap 은 task-local 이고, 시스템에서 **유일한** retry 메커니즘 — 세션 레벨 retry 루프는 존재하지 않는다. executor 는 task 별 attempt 를 TASKS.md `[Result]` 블록에 기록; 글로벌 카운터 없음.

**재시도를 재작성 루프로 부풀리지 말 것.** task 가 3회 실패하면 그건 메인 스레드(`failed` outcome → evaluator → escalate 경유) 가 task-writer 나 유저에게 다시 질의할 신호 — executor 가 계속 추측하라는 신호가 아니다.

### Step 6 — TASKS.md `[Result]` 블록 업데이트

각 그룹 후 각 task 아래 `[Result]` 블록 append 또는 replace. TASKS.md 는 executor 의 영속 상태 — 대화가 죽고 다시 시작되면 다음 executor 호출이 이 블록을 읽어 Step 1 resume 규칙을 적용한다.

표준 포맷 (`done` 을 기준으로):

```markdown
[Result]
Status: done
Attempt: 1
Summary: POST /auth/totp/verify 핸들러 추가, Acceptance bullet 4개 모두 검증.
Evidence:
- rate-limit bullet → tests/auth/totp.test.ts::"three consecutive failures yield 429"
- intermediate-token 소비 → grep "jti.*consumed" src/auth/totp.ts:142
Updated: 2026-04-19T14:23:00Z
```

다른 상태는 같은 블록에 아래 차이만:

- **failed**: `Status: failed`, 재시도마다 `Attempt: N` 증가, `Evidence` 대신 `Reason:` 한 줄. `Summary:` 는 subagent 의 summary 또는 `"Task tool errored: <type>"`.
- **blocked**: `Status: blocked`, `Attempt` / `Summary` 제거, `Evidence` 대신 `Reason:` (한 줄 원인).
- **skipped** (Step 3 가 dispatch 없이 설정): `Status: skipped`, `Attempt` / `Summary` 제거, `Reason: depends on task-N which {blocked|failed}`.

`Updated:` (ISO-8601) 는 항상 포함. TASKS.md 의 다른 섹션(Goal, Architecture, task 본문, Self-Review) 은 **수정 금지** — task 별 `[Result]` 블록 append/replace 만.

### Step 7 — ROADMAP.md 최종화·emit

모든 task 가 terminal `[Result]` 블록(`done` / `blocked` / `failed` / `skipped`) 을 가지면 우선순위로 최종 outcome 결정:

1. **`failed` task 하나라도 존재** → `failed` emit. ROADMAP.md 는 `- [ ] executor` 그대로.
2. **아니면, `blocked` task 하나라도 존재** → `blocked` emit. `- [ ] executor` 그대로.
3. **아니면, 남은 task 모두 `done` 또는 `skipped`** (skipped-only 케이스는 발생하면 안 된다 — skipped 는 항상 blocked/failed 루트로 거슬러 올라감; 발생하면 로직 에러로 보고 `failed` 로 emit) → ROADMAP.md 에 `- [x] executor` 마킹, `done` emit.

`skipped` 는 절대 자체로 top-level outcome 이 되지 않는다 — 항상 루트 원인의 outcome 밑에서 bubble up. task ID 와 reason 은 TASKS.md `[Result]` 블록에 남고, evaluator 가 다시 읽는다.

`STATE.md` 는 **업데이트하지 않는다** — STATE.md 쓰기는 메인 스레드 소유. executor 의 task-local attempt 는 TASKS.md `[Result]` 블록에만 기록.

## Parallelism rules (간결)

- **그룹 당 최대 동시 subagent**: 5 — politeness 한도. Claude Code Task 툴은 강제 안 하지만, 과부하면 리턴 파악이 어렵고 토큰을 태운다.
- **의존 엣지는 hard.** task-N 의 모든 `Depends:` 타겟이 `Status: done` 되기 전 dispatch 금지. blocked/failed 의존 → `skipped` (Step 3).
- **파일 겹침은 hard.** 같은 그룹 두 task 는 `Files:` 경로를 하나도 공유하지 않는다 — git 충돌 방지 (Step 2 가 강제).
- **Approval 노드는 지원하지 않음.** approval 의미론은 executor 주위의 Gate 1/Gate 2 몫, 내부 아님. 실행 중 유저 입력이 필요한 task → subagent 가 BLOCKED 리턴.

## Anti-patterns

- **BLOCKED task 를 재 dispatch 하지 말 것.** Blocked = task 자체가 틀림. 재시도는 같은 리턴. `blocked` outcome 으로 escalate.
- **리턴 리뷰 시 다른 task 의 Acceptance 읽지 말 것.** 각 task 검증은 자기 Acceptance bullet 으로 self-contained. task 간 정합성은 evaluator(Phase 6) 몫.
- **파일 겹침을 조용히 넘기지 말 것.** 감지되면 명시적 직렬화 — 두 subagent 가 공유 라인을 안 건드릴 거라 희망하지 말 것.
- **Subagent 프롬프트에 PRD/TRD 내용 박지 말 것.** task 본문이 이미 PRD/TRD 어휘 verbatim 을 인용함(task-writer 계약). 원본 재포함은 컨텍스트 격리를 깨고 subagent 가 task 를 원본 대비 "재해석" 하게 만든다 — task-writer 가 막으려 한 해석 drift 그 자체.
- **Subagent 가 자기 Acceptance 정의하게 두지 말 것.** 리턴이 `status: done` 인데 evidence 가 task Acceptance bullet 에 매핑 안 되면 그건 BLOCKED — subagent 가 다른 문제를 풀었다.
- **병렬 가능 task 를 turn 나눠서 dispatch 하지 말 것.** 한 그룹의 모든 Task 호출은 **한 assistant turn** 에 넣는다. turn 을 쪼개면 직렬화되고 병렬 이득을 잃는다.

## Edge cases

- **의존 없는 단일 task**: degenerate. 1-layer DAG, 1 subagent dispatch, done/blocked/failed emit. `[Result]` 블록 건너뛰지 말 것 — evaluator 가 여전히 읽는다.
- **`Files:` 블록에 존재하지 않고 `Create:` 마킹도 안 된 경로**: dispatch 시점 검증은 네 몫 아님 (task-writer/evaluator 가 잡음). 그대로 dispatch; 경로가 정말 틀렸으면 subagent 가 BLOCKED 리턴.
- **유저 중도 인터럽트 (abort)**: 정리 시도하지 말 것. `[Result]` 블록 그대로 두고, 다음 executor 호출이 Step 1 resume 규칙으로 이어간다. 중단된 subagent 의 부분 파일 쓰기는 그대로 남는다 — 재시도 subagent 가 보고 TDD 로 덮어쓴다.
- **TASKS.md 의 요청이 비영어**: subagent 프롬프트 콘텐츠(task title, Notes, Acceptance prose) 는 원 언어. 프롬프트 템플릿 프레임(`## Task`, `## Files` 등) 은 영어. task-writer 출력 규칙과 일관.

## Boundaries

- `.planning/{session_id}/TASKS.md` 와 `ROADMAP.md` 읽음. TASKS.md 엔 `[Result]` 블록, ROADMAP.md 엔 `[x]` 쓴다. **STATE.md 는 건드리지 않음** — STATE.md 쓰기(`escalated`, `last_eval` 등) 는 메인 스레드 소유.
- 다른 스킬 호출 안 함. `evaluator`, `doc-updater`, writer 어느 것도 dispatch 안 함. 메인 스레드가 `harness-flow.yaml` 을 따른다.
- Task 툴로 `general-purpose` subagent 만 dispatch. 새 agent 타입 만들지 않음.
- PRD.md / TRD.md 읽거나 수정 안 함. 계약상 task 본문이 충분.
- 소스 코드 직접 수정 안 함. 모든 코드 변경은 subagent 안에서.
- git 충돌 해결 안 함. 직렬화가 예방; 그래도 발생하면 해당 subagent 가 FAILED 리턴하고 일반 재시도 적용.
