---
name: evaluator
description: parallel-task-executor 가 done 을 emit 한 뒤 실행 — doc-updater 직전 게이트. TASKS.md 의 모든 `[Result]` 가 done 인지 검증하고 (아니면 첫 blocker 의 reason 을 인용해 escalate), (Track 2) 세션 diff 를 `.claude/rules/*.md` 에 대해 LLM 추론으로 판정한다. pass / escalate / error 를 emit; non-pass 는 세션을 종료시킨다 — loopback 없음. 격리된 subagent 에서 실행.
---

# Evaluator

## Purpose

`doc-updater` 가 돌기 전에 executor 산출물을 게이팅한다. 검증 축 두 개:

1. **executor 완료 형태** — TASKS.md 의 `[Result]` 블록이 모든 task 를 `done` 으로 표시하는지. 어떤 task 든 `blocked` (task 명세 틀림) 또는 `failed` (task-local Attempt cap 소진) 이면 즉시 escalate — 세션 레벨 retry 는 존재하지 않는다.
2. **프로젝트 규칙 준수** (PRD §16 Track 2) — 이번 세션 diff 가 `<project>/.claude/rules/*.md` 를 위반하지 않는지. Track 1 (기계적 — `make check`) 은 이미 Stop 훅으로 돌아서 여기까지 왔다; 이 스킬은 쉘 명령을 재실행하지 않는다.

outcome 은 아래 '필수 다음 스킬' 섹션에 따라 라우팅: `pass` → `doc-updater`, `escalate` → END (메인 스레드가 STATE.md 에 `escalated: true` 기록 + 유저에게 이유 전달), `error` → END (복구 불가 — payload 결함 또는 인프라 실패). `fail` outcome 없음, executor 루프백 없음 — non-pass 는 모두 세션 종료.

## 실행 모드

Subagent (격리 컨텍스트) — `../../harness-contracts/execution-modes.ko.md` 참조.

## Input payload

evaluator agent 가 너를 로드한다. payload 가 전부:

- `session_id`: `"YYYY-MM-DD-{slug}"` — 어느 세션 폴더를 읽을지 결정.
- `tasks_path`: `".planning/{session_id}/TASKS.md"` — executor 의 `[Result]` 블록이 사는 곳.
- `rules_dir` *(optional)*: `"<project>/.claude/rules"` — `*.md` 를 로드할 디렉토리. 생략되거나 디렉토리 부재/비어있음 → Track 2 skip; executor 완료 체크는 그래도 돈다.
- `diff_command` *(optional)*: diff 를 만들 쉘 명령 (기본 `git diff HEAD`). 그대로 사용 — baseline 은 메인 스레드가 고른다.

`state_path` 없음 — 이 스킬은 STATE.md 를 읽지 않는다. 세션 레벨 retry 가 더 이상 컨셉이 아니고, STATE.md 쓰기는 메인 스레드 소유.

`tasks_path` 가 없거나 읽을 수 없으면 step-1 에서 `error` emit. 추측 금지.

## Output

단일 JSON 객체 emit — 그게 최종 메시지 전부. JSON 외 prose 절대 금지.

```json
{ "outcome": "pass|escalate|error", "session_id": "2026-04-19-...", "reason": "<pass 시 생략>" }
```

- `pass` — 모든 task `[Result: done]` 이고 (규칙 있으면) 위반 0건.
- `escalate` — 분류 가능한 모든 non-pass 조건 (blocked task, Attempt:3 task, 규칙 위반). `reason` 은 첫 blocker 의 `Reason:` 라인 인용, 또는 규칙 위반은 `{rule-file}: {path:line} — {claim}` 형태.
- `error` — payload 결함 또는 복구 불가 인프라 이슈 (파일 없음, diff 읽기 실패, LLM 응답 파싱 불가, 내적 모순 상태).

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

### Step 2 — Short-circuit on non-done executor (Track 2 skip)

규칙 건드리기 전에 executor 산출물이 게이트 가능한 상태인지 판단한다. 어떤 task 든 `done` 에 도달하지 못했다면 단축하고 Track 2 를 통째로 skip 한다 — 반쯤 구현된 diff 에 규칙 검사를 돌리는 건 노이즈일 뿐이다.

- **`Status: blocked` 어느 하나라도** → `escalate` emit, `reason` 은 첫 blocked task 의 ID + `Reason:` 라인 인용 (예: `"task-4: Acceptance bullet 2 가 bullet 4 와 모순"`). 규칙 안 읽음, Track 2 안 돌음.
- **`Status: failed` 어느 하나라도** → `escalate` emit, `reason` 은 첫 failed task 의 ID + `Reason:` 인용. Track 2 안 돌음 — 반쯤 구현된 diff 에 규칙 들이대는 건 노이즈.
- **모두 `Status: done` 또는 `skipped`** → Step 3 로. 주의: 모든 non-done 이 `skipped` 면, 그 루트 원인은 위에서 잡혔어야 할 `blocked`/`failed` 였음; 이 분기에 `skipped` 만 남으면 `[Result]` 상태가 내적 모순 — `"skipped tasks present without blocked/failed root"` 이유로 `error` emit.
- **모두 `Status: done`** → Step 3 로, 정상 경로.

### Step 3 — Track 2 규칙 검증

`rules_dir` 미설정이거나 `.md` 없음 → 이 Step skip. Step 4 에서 규칙은 암묵적 pass.

아니면:

1. `rules_dir` 바로 아래 `*.md` 파일 나열 (재귀 아님 — 규칙은 프로젝트당 플랫이 컨벤션). 각 파일 읽기. 첫 비공백 라인에 `<!-- evaluator: skip -->` 포함 시 연결된 rules 블록에서 제외.
2. 설정된 diff 명령 실행 (기본 `git diff HEAD`). 명령 실패 또는 빈 출력 → `{"outcome": "error", "session_id": "...", "reason": "diff command returned <empty|nonzero>: <stderr tail>"}`. evaluator 시점에 diff 가 비어있다는 건 executor 가 파일 하나도 안 바꾸고 `done` 을 주장한 것 — pass 가 아니라 task-writer/executor 버그.
3. 규칙 판단 프롬프트 빌드 (아래 `## Rule validation prompt` 참조) 후 네 자신의 추론으로 적용. 별도 모델 호출은 없다 — evaluator 의 바깥쪽 절차 추론과 규칙 판단은 같은 thread 에서 돈다.
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

## Rule validation prompt

Step 3 규칙 판단에 쓰는 구조. 규칙 판단은 이 스킬의 나머지와 같은 추론 thread 에서 실행된다 (별도 모델 호출이 아님); 아래 프롬프트는 내적 독백으로 취급:

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

소스가 `Status: failed` 일 때도 같은 shape — `reason` 만 다름 (`Attempt:3` 라인 인용).

## Edge cases

- **`rules_dir` 부재 또는 비어있음**: Track 2 skip. 규칙만으로 pass (executor 완료 체크는 그래도 돔). `rules_dir` 가 디렉토리가 아닌 파일을 가리키는 경우도 동일 — skip.
- **diff 가 비어있는데 task 들이 `done` 주장**: step-3 에서 error. done 인데 diff 0 은 거짓말; 메인 스레드가 재조사.
- **규칙 파일이 opt-out** (`<!-- evaluator: skip -->` 로 첫 비공백 라인 시작): 연결된 rules 블록에 로드 안 함. 모든 규칙 파일이 opt-out 이면 Track 2 는 trivial pass.
- **diff/규칙의 비영어 콘텐츠**: 규칙 파일과 diff 내용은 원어 그대로; 스킬 프레임 (outcome JSON 키, step 이름) 은 영어. `reason` 필드는 rule-violation 케이스에서 규칙 파일 언어 미러.

## 필수 다음 스킬

이 스킬이 `outcome: "pass"` 를 emit 할 때 (전체 payload 계약: `../../harness-contracts/payload-contract.ko.md` § "evaluator → doc-updater"):

- **필수 하위 스킬:** harness-flow:doc-updater 사용
  Payload: `{ session_id, tasks_path, diff_command? }`

`outcome: "escalate"` 또는 `"error"` 일 때: 플로우 종료. 유저에게 판정 (`reason` 과 규칙 위반 사항 포함) 을 보고하고 멈춘다. 문서 업데이트는 통과한 평가에 게이팅됨 — escalate 시 절대 자동 emit 하지 않는다.

## Boundaries

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조. Evaluator 는 모든 세션 산출물 (TASKS, STATE, ROADMAP) 에 대해 **read-only** 이고 PRD/TRD 는 참조하지 않는다 — task-writer 가 이미 어휘를 TASKS.md Acceptance 에 박았으므로, evaluator 의 grep 타겟이 거기 있다. evaluator 리턴 시 영속화는 메인 스레드 소유.
- `tasks_path`, `rules_dir/*.md`, 그리고 `diff_command` 의 출력만 읽는다.
- 설정된 `diff_command` 외에는 `make check` 나 어떤 쉘 명령도 재실행하지 않음. Track 1 은 Stop 훅; 이 스킬은 Track 2 전용.
- 다른 agent 나 skill 호출 안 함. 엔드포인트.
- 위반이 명확해도 소스 코드 수정 안 함. 재-dispatch 없음 — escalate 는 세션을 종료하고, 유저가 원하면 다시 드라이브.
- 규칙 판단은 LLM 전용. 유혹되더라도 정규식 룰 엔진 쓰지 말 것 — 규칙 의도에서 조용히 drift 한다.
