---
name: evaluator
description: 세션의 executor phase 가 끝나고 doc-updater 가 돌기 전에 게이트가 필요할 때 사용. 격리된 evaluator agent 컨텍스트에서 실행 — 메인 대화 이력은 보이지 않는다. `.planning/{session_id}/TASKS.md` 의 `[Result]` 블록, 프로젝트 `.claude/rules/*.md`, 현재 git diff 를 읽고 pass / escalate / error 판정. 세션 레벨 retry 루프 없음 — non-pass 는 모두 terminal.
---

# Evaluator

## Purpose

`doc-updater` 가 돌기 전에 executor 산출물을 게이팅한다. 검증 축 두 개:

1. **executor 완료 형태** — TASKS.md 의 `[Result]` 블록이 모든 task 를 `done` 으로 표시하는지. 어떤 task 든 `blocked` (task 명세 틀림) 또는 `failed` (task-local Attempt cap 소진) 이면 즉시 escalate — 세션 레벨 retry 는 존재하지 않는다.
2. **프로젝트 규칙 준수** (PRD §16 Track 2) — 이번 세션 diff 가 `<project>/.claude/rules/*.md` 를 위반하지 않는지. Track 1 (기계적 — `make check`) 은 이미 Stop 훅으로 돌아서 여기까지 왔다; 이 스킬은 쉘 명령을 재실행하지 않는다.

outcome 은 `harness-flow.yaml` 에 따라 라우팅: `pass` → `doc-updater`, `escalate` → END (메인 스레드가 STATE.md 에 `escalated: true` 기록 + 유저에게 이유 전달), `error` → END (복구 불가 — payload 결함 또는 인프라 실패). `fail` outcome 없음, executor 루프백 없음 — non-pass 는 모두 세션 종료.

## Why this exists

executor 의 일은 조율이다 — subagent 들이 쓴 코드가 각 task 의 Acceptance bullet 넘어서 *올바른지* 판단하는 것은 executor 의 능력 밖. task 간 정합성, 프로젝트 컨벤션, 아키텍처 적합도, 변경의 전체 모양 — 이것이 evaluator 의 표면. 두 설계 압력:

1. **executor 의 상태가 진실이지, 재도출할 수 없다.** evaluator 가 돌 때쯤이면 subagent 들이 이미 파일을 고쳤고 TASKS.md 에 `[Result]` 블록을 밀어넣었다. 우리는 그 블록을 **읽는다**, 다시 추론하지 않는다. `[Result: blocked]` = task-writer 가 task 를 틀리게 쓴 것. `[Result: failed, Attempt: 3]` = 구현이 자기 retry 예산을 소진한 task. 어느 쪽이든 executor 재-dispatch 로 복구 안 됨 (executor resume 규칙상 terminal 상태는 스킵) — 즉시 escalate.
2. **규칙 검증은 LLM 판단, 룰 엔진 아님.** `.claude/rules/*.md` 는 자연어 규범 ("production 에 `console.log` 금지", "PRD 어휘의 bold 는 bold 유지"). 읽고, diff 읽고, agent 가 판단한다. DSL 없음, 파서 없음. 판단 실패로 garbage `FAIL` 이 나오면 `error` 로 잡힌다 — 메인 스레드가 유저에게 전달.

escalate 는 기계적으로 개선할 수 없는 상황에 대한 정직한 응답이다. 유저가 결정: TASKS.md 편집 / 규칙 편집 / dismiss. 스킬은 outcome JSON 에 신호를 내고, 메인 스레드가 STATE.md 에 `escalated: true` 를 영속화한다.

## Input payload

evaluator agent 가 너를 로드한다. payload 가 전부:

- `session_id`: `"YYYY-MM-DD-{slug}"` — 어느 세션 폴더를 읽을지 결정.
- `tasks_path`: `".planning/{session_id}/TASKS.md"` — executor 의 `[Result]` 블록이 사는 곳.
- `rules_dir` *(optional)*: `"<project>/.claude/rules"` — `*.md` 를 로드할 디렉토리. 생략되거나 디렉토리 부재/비어있음 → Track 2 skip; executor 완료 체크는 그래도 돈다.
- `diff_command` *(optional)*: diff 를 만들 쉘 명령 (기본 `git diff HEAD`). 그대로 사용 — baseline 은 메인 스레드가 고른다.

`state_path` 없음 — 이 스킬은 STATE.md 를 읽지 않는다. 세션 레벨 retry 가 더 이상 컨셉이 아니고, STATE.md 쓰기는 메인 스레드 소유.

`tasks_path` 가 없거나 읽을 수 없으면 step-1 에서 `error` emit. 추측 금지.

## Output

단일 JSON 객체 emit. outcome 3종. task 레벨 세부 (어느 task 가 blocked 인지, 어느 규칙이 fired 했는지) 는 TASKS.md `[Result]` 블록과 diff 자체에 남고, 유저가 직접 다시 읽는다. JSON 은 top-level outcome 과, non-pass 케이스의 한 줄 `reason` 만 전달.

**pass** — 모든 task Status: done 이고 (규칙 있으면) 위반 0건:

```json
{ "outcome": "pass", "session_id": "2026-04-19-..." }
```

**escalate** — 스킬이 분류 가능한 모든 non-pass 조건 (blocked task, Attempt:3 task, 규칙 위반):

```json
{ "outcome": "escalate", "session_id": "2026-04-19-...", "reason": "task-4: Acceptance bullet 2 가 bullet 4 와 모순" }
```

`reason` 은 유저-노출용 한 문장 요약. executor-blocked/failed 는 첫 blocker 의 `Reason:` 인용, rule-violation 은 `{rule-file}: {path:line} — {claim}` 형태.

**error** — payload 결함 또는 복구 불가 인프라 이슈 (파일 없음, diff 읽기 실패, LLM 응답 파싱 불가, 내적 모순 상태):

```json
{ "outcome": "error", "session_id": "2026-04-19-...", "reason": "TASKS.md not found at <path>" }
```

JSON 외 prose 절대 금지. JSON 객체가 최종 메시지 전부.

## Procedure

### Step 1 — 세션 상태 읽기 + `[Result]` 블록 파싱

`tasks_path` 전체 읽기. 각 task 엔트리와 `[Result]` 블록 추출.

**`[Result]` 블록 포맷** — parallel-task-executor 는 task 당 multi-line 블록을 쓴다:

```markdown
[Result]
Status: done | failed | blocked | skipped
Attempt: 1
Summary: ...
Evidence:
- ...
Reason: ...           (Status != done 일 때 존재; non-done status 에서 Evidence 대체)
Updated: 2026-04-21T14:23:00Z
```

`[Result]` 라인을 찾고, 다음 task 헤딩 또는 다음 `[Result]` 전까지 라벨된 필드를 읽어 파싱. `[Result: blocked]` 같은 **inline shorthand 기대 금지** — 그건 유저-노출용 약칭이고, 직렬화된 블록은 항상 multi-line.

`Status` 값별 카운트: `done`, `failed`, `blocked`, `skipped`, `([Result] 블록 없음)`.

**step-1 에러 조건** (emit `{"outcome": "error", "session_id": "...", "reason": "..."}`):

- `tasks_path` 없음/읽기 불가 → `reason: "TASKS.md not found at <path>"`.
- 어떤 task 든 `[Result]` 블록 없음 → `reason: "task-N has no Result block — executor did not finalize"`.
- 한 task 에 `[Result]` 블록이 **둘 이상** → `reason: "task-N has duplicate Result blocks — state corruption"`. parallel-task-executor 계약상 task 당 1개 보장; 중복은 corruption.
- `Status:` 값이 `done|failed|blocked|skipped` 중 하나가 아님 → `reason: "task-N has unknown Status value: <value>"`.

### Step 2 — Executor 완료 pre-check

규칙 건드리기 전에 executor 산출물이 게이트 가능한 상태인지 판단:

- **`Status: blocked` 어느 하나라도** → `escalate` emit, `reason` 은 첫 blocked task 의 ID + `Reason:` 라인 인용 (예: `"task-4: Acceptance bullet 2 가 bullet 4 와 모순"`). 규칙 안 읽음, Track 2 안 돌음.
- **`Status: failed` 어느 하나라도** → `escalate` emit, `reason` 은 첫 failed task 의 ID + `Reason:` 인용. Track 2 안 돌음 — 반쯤 구현된 diff 에 규칙 들이대는 건 노이즈.
- **모두 `Status: done` 또는 `skipped`** → Step 3 로. 주의: 모든 non-done 이 `skipped` 면, 그 루트 원인은 위에서 잡혔어야 할 `blocked`/`failed` 였음; 이 분기에 `skipped` 만 남으면 `[Result]` 상태가 내적 모순 — `"skipped tasks present without blocked/failed root"` 이유로 `error` emit.
- **모두 `Status: done`** → Step 3 로, 정상 경로.

### Step 3 — Track 2 규칙 검증

`rules_dir` 미설정이거나 `.md` 없음 → 이 Step skip. Step 4 에서 규칙은 암묵적 pass.

아니면:

1. `rules_dir` 바로 아래 `*.md` 파일 나열 (재귀 아님 — 규칙은 프로젝트당 플랫이 컨벤션). 각 파일 읽기. 첫 비공백 라인에 `<!-- evaluator: skip -->` 포함 시 연결된 rules 블록에서 제외.
2. 설정된 diff 명령 실행 (기본 `git diff HEAD`). 명령 실패 또는 빈 출력 → `{"outcome": "error", "session_id": "...", "reason": "diff command returned <empty|nonzero>: <stderr tail>"}`. evaluator 시점에 diff 가 비어있다는 건 executor 가 파일 하나도 안 바꾸고 `done` 을 주장한 것 — pass 가 아니라 task-writer/executor 버그.
3. LLM 프롬프트 빌드 (아래 `## Rule validation prompt` 참조). 네 자신의 추론으로 실행 — 네가 LLM 이다.
4. 응답 파싱:
   - **첫 비공백 라인** 이 정확히 `PASS` 또는 정확히 `FAIL` 이어야 함. 끝 공백 허용; 그 외는 unparseable.
   - `PASS` → 이후 라인은 진단(위반 아님)으로 취급, 무시. 응답은 pass.
   - `FAIL` → 이후 각 비공백 라인이 `- {rule-file}: {path:line} — {claim}` 포맷과 일치해야 함. 매칭 안 되는 라인은 진단 노이즈로 무시하되, **최소 1건**의 well-formed 위반 라인이 필요. 없으면 unparseable. 첫 well-formed 위반 라인을 보관 — Step 4 에서 `reason` 이 된다.
   - `PASS` 도 아니고 `FAIL + ≥1 valid violation` 도 아니면 → `{"outcome": "error", "session_id": "...", "reason": "rule-judgment response unparseable: <first 200 chars>"}`.

### Step 4 — Outcome 결정 + emit

executor pre-check (Step 2) 와 규칙 결과 (Step 3) 조합:

| Step 2 결과 | Step 3 결과 | Outcome | `reason` |
|---|---|---|---|
| escalate (blocked) | n/a (skip) | `escalate` | 첫 blocked task 의 ID + `Reason:` |
| escalate (failed) | n/a (skip) | `escalate` | 첫 failed task 의 ID + `Reason:` |
| error (skipped 불일치) | n/a (skip) | `error` | `"skipped tasks present without blocked/failed root"` |
| clean | PASS | `pass` | (생략) |
| clean | FAIL | `escalate` | 첫 위반 라인을 `{rule-file}: {path:line} — {claim}` 형태로 |
| clean | error (diff 없음/파싱 실패) | `error` | step-3 reason |

메인 스레드가 STATE.md 쓰기를 소유: `last_eval`, `last_eval_at`, `last_eval_excerpt`, (escalate 시) `escalated: true`. 이 스킬은 STATE.md 를 **수정하지 않는다** — 신호만 emit, 영속화는 메인 스레드.

JSON emit. 그게 최종 메시지 전부.

## Rule validation prompt

Step 3 의 LLM 판단에 쓰는 구조. 내적 독백으로 취급 — 너는 바깥 스킬과 이 안쪽 체크를 동시에 실행하는 모델:

```
아래 코드 diff 가 나열된 규칙 중 어느 것이라도 위반하는지 판정하라.
규칙은 자연어; 정규식 매칭이 아닌 판단을 적용하라. 위반은 diff 의
구체 라인이 구체 규칙 주장을 깨뜨릴 때만 성립.

출력 포맷 (정확히):
  1번째 라인: PASS  또는  FAIL
  FAIL 이면 위반 하나당 한 라인:
    - {rule-file}: {path:line} — {한 문장 claim, 짧으면 문제 코드 인용}

포맷 밖 prose 금지. 논평 금지. 권고 금지.

--- RULES ---
{rules_dir 의 opt-out 아닌 모든 *.md 내용 연결, 각 앞에 "# <filename>" 헤더}

--- DIFF ---
{raw git diff 출력}
```

**판단 규율**:

- 구체 diff 라인 인용. 규칙은 diff 라인에 매칭될 때만 발동. "전반적으로 구조가 이상하다" 는 위반 아님.
- 문제 코드 인용 (≤60자) claim 에. 리뷰어가 diff 를 다시 읽지 않아도 이해되게.
- 한 라인 위반당 한 줄. 한 라인이 세 규칙을 깨면 세 줄 (각각 자기 `rule-file`).
- "X 를 선호" 로만 쓰고 명확한 금지 케이스가 없는 규칙은 발동 안 함 — evaluator 는 스타일 멘토가 아니다. 스타일 선호가 게이트해야 한다면 규칙 파일에 "Required"/"Forbidden" 으로 인코딩.

## Examples

### Example 1 — Pass, 규칙 있음

Payload `{session_id: "2026-04-19-rename-getUser", tasks_path: ".planning/2026-04-19-rename-getUser/TASKS.md", rules_dir: ".claude/rules"}`. TASKS.md 에 task 1개:

```markdown
[Result]
Status: done
Attempt: 1
Summary: getUser 를 fetchUser 로 4개 파일에 걸쳐 이름 변경.
Evidence:
- grep 결과: `getUser` 잔존 참조 없음
Updated: 2026-04-19T14:10:00Z
```

- Step 1: 1 task, Status: done.
- Step 2: clean.
- Step 3: `.claude/rules/code-style.md` 읽음 (1파일, opt-out 아님). `git diff HEAD` 실행. 규칙 기준 판정. 위반 없음.

```json
{ "outcome": "pass", "session_id": "2026-04-19-rename-getUser" }
```

### Example 2 — 규칙 위반으로 escalate

동일 payload. diff 가 `src/auth/login.ts:42` 에 `console.log(...)` 도입.

Step 3 LLM 응답:
```
FAIL
- code-style.md: src/auth/login.ts:42 — production `console.log(user)` 금지
```

```json
{
  "outcome": "escalate",
  "session_id": "2026-04-19-rename-getUser",
  "reason": "code-style.md: src/auth/login.ts:42 — production `console.log(user)` 금지"
}
```

메인 스레드: `escalated: true` 기록, 세션 halt, `reason` 을 유저에게 전달. 유저가 diff 를 다시 읽어 전체 위반을 확인한다 — 스킬은 한 줄 요약만 전달.

### Example 3 — executor-blocked 으로 escalate

TASKS.md 의 task-4:

```markdown
[Result]
Status: blocked
Reason: Acceptance bullet 2 가 bullet 4 와 모순
Updated: 2026-04-21T10:05:00Z
```

task-5 (task-4 에 의존):

```markdown
[Result]
Status: skipped
Reason: depends on task-4 which blocked
Updated: 2026-04-21T10:05:00Z
```

- Step 2: blocked task 발견 → 단축. 규칙 안 읽음. 유저는 TASKS.md `[Result]` 블록을 직접 다시 읽어 task-5 의 skip 을 확인한다.

```json
{
  "outcome": "escalate",
  "session_id": "2026-04-19-add-2fa-login",
  "reason": "task-4: Acceptance bullet 2 가 bullet 4 와 모순"
}
```

### Example 4 — executor-failed 로 escalate (Attempt:3 hit)

TASKS.md 의 task-3 가 `Status: failed`, `Attempt: 3`, `Reason: repeated failure after narrow-scope retry`.

```json
{
  "outcome": "escalate",
  "session_id": "2026-04-19-add-2fa-login",
  "reason": "task-3: repeated failure after narrow-scope retry (Attempt 3)"
}
```

## Edge cases

- **`rules_dir` 부재 또는 비어있음**: Track 2 skip. 규칙만으로 pass (executor 완료 체크는 그래도 돔). `rules_dir` 가 디렉토리가 아닌 파일을 가리키는 경우도 동일 — skip.
- **diff 가 비어있는데 task 들이 `done` 주장**: step-3 에서 error. done 인데 diff 0 은 거짓말; 메인 스레드가 재조사 (대개 task-writer `Files:` 오류를 subagent 가 아무것도 안 하고 회피).
- **diff 가 거대 (수천 라인)**: 그대로 넣는다. 판단 비용이 문제되면 메인 스레드의 다음 리비전이 청킹 전략을 도입 — 지금은 세션당 판단 1회.
- **규칙 파일이 opt-out** (`<!-- evaluator: skip -->` 로 첫 비공백 라인 시작): 연결된 rules 블록에 로드 안 함. 모든 규칙 파일이 opt-out 이면 Track 2 는 trivial pass (비어있는 `rules_dir` 과 동치).
- **LLM self-judgment 이 PASS + 뒤따르는 진단** (첫 라인 `PASS`, 이후 라인에 노트나 부분 관찰): PASS 로 취급. 뒤 라인은 무시 — 엄격 파싱 규칙은 "첫 비공백 라인이 정확히 `PASS` 또는 정확히 `FAIL`". 뒤 내용에 엄격하면 좋은 결과가 `error` 로 튕김.
- **LLM 응답이 `FAIL` 인데 valid violation 라인 0개**: unparseable — step-3 에서 error emit. 구체 위반 없는 `FAIL` 은 무의미.
- **한 task 에 `[Result]` 블록 중복**: corruption — step-1 에서 error. merge 나 선택 시도 금지; 상류 계약 위반, 상태 신뢰 불가.
- **`Status` 값이 허용 집합 밖** (예: `Status: partial`): step-1 에서 error. parallel-task-executor 는 done/failed/blocked/skipped 만 emit; 그 외는 corruption.
- **done + skipped 혼재, blocked/failed 루트 없음**: 내적 모순 (Step 2 error 분기).
- **비영어 요청**: 규칙 파일과 diff 내용은 원어 그대로; 스킬 프레임 (outcome JSON 키, step 이름) 은 영어. `reason` 필드는 rule-violation 케이스에서 규칙 파일 언어 미러.

## Boundaries

- `tasks_path`, `rules_dir/*.md`, `diff_command` 출력 읽음. **어떤 파일도 쓰지 않음** — TASKS.md 도, STATE.md 도, ROADMAP.md 도. 영속화는 메인 스레드 소유.
- **STATE.md 읽지 않음.** 세션 레벨 retry 가 더 이상 컨셉이 아니므로 `retry_count` 도 참조 안 함.
- `make check` 나 어떤 쉘 명령도 재실행하지 않음 (단 설정된 `diff_command` 는 예외). Track 1 은 Stop 훅; 이 스킬은 Track 2 전용.
- 다른 agent 나 skill 호출 안 함. endpoint.
- 위반이 명확해도 소스 코드 수정 안 함. 재-dispatch 없음 — escalate 는 세션을 종료하고, 유저가 원하면 다시 드라이브.
- PRD.md / TRD.md 직접 참조 안 함. task-writer 가 이미 어휘를 TASKS.md Acceptance 에 박았다; evaluator grep 타겟이 거기 있다. 상류 문서 재열람은 scope 밖이고 drift 부른다.
- 규칙 판단은 LLM 전용. 유혹되더라도 정규식 룰 엔진 쓰지 말 것 — 규칙 의도에서 조용히 drift 한다.
