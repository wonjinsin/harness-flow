# Harness Rules PRD — 하네스 고삐 잡기

> 스킬 체인은 끝났지만 "하네스가 하네스답게 도는" 운영 레이어가 비어 있다. 이 문서는 그 빈 자리를 채우는 권한 / 검증 / 실패 복구 규칙을 PRD 형식으로 정리한다.

## 배경 (Context)

현재 하네스의 정리된 부분과 비어 있는 부분:

- **정리됨** — 스킬 체인 (`router → brainstorming → *-writer → parallel-task-executor → evaluator → doc-updater`), per-edge 핸드오프 계약 (`harness-contracts/payload-contract.ko.md`), 파일 소유권 (`harness-contracts/file-ownership.ko.md`), 실행 모드 (`harness-contracts/execution-modes.ko.md`).
- **비어 있음** — `.claude/settings.local.json` 의 `permissions.allow` 는 git/npm 4 줄뿐 (`Bash(npm root *)`, `Bash(npx -y ccstatusline@latest --version)`, `Bash(git add *)`, `Bash(git commit -m ' *)`). `hooks/hooks.json` 은 `SessionStart` 한 개. 즉:
  - executor 서브에이전트가 매 명령마다 권한 프롬프트를 띄운다 — 사용자가 매번 끊는다.
  - writer 산출물 (PRD.md / TRD.md / TASKS.md) 의 형식 검증, 변경된 코드의 lint·typecheck 가 사람 책임이다.
  - writer 가 `## Status: error`, executor 가 `blocked|failed` 로 죽으면 메인 thread 가 손으로 다시 디스패치해야 한다.
  - 위험 명령 (`rm -rf`, `git push --force`, `git reset --hard`) 차단 장치가 없다.

요컨대 스킬은 "무엇을" 할지 정의했지만, 하네스는 "어떻게 안전하게 / 자동으로" 돌아갈지에 대한 가드를 가지고 있지 않다. 솔로 개발 환경에서도 권한 프롬프트와 수동 재디스패치가 흐름을 깬다.

## 문제 (Problem)

P1. **권한 프롬프트 피로.** executor 서브에이전트가 `npm test`, `pnpm lint`, `tsc --noEmit`, `pytest`, `ruff check` 같은 평범한 검증 명령을 돌릴 때마다 사용자에게 승인 요청이 뜬다. 결과적으로 사용자가 매 task 를 손으로 통과시킨다.

P2. **산출물 형식 검증 부재.** writer 가 `## Status: done` 으로 끝나도 산출물의 필수 섹션이 빠져 있을 수 있다 (예: `PRD.md` 에 `## Acceptance` 없음). 다음 writer 가 그걸 권위 있는 ground 로 읽고 빈약한 spec 을 증폭시킨다.

P3. **코드 변경 후 자동 lint 없음.** executor 의 task 별 서브에이전트가 코드를 편집하면, lint / typecheck 는 그 안에서 돌아야 하지만 강제되지 않는다. evaluator 단계까지 결함이 늦게 surface 된다.

P4. **실패 시 자동 재시도 부재.** writer 가 `error`, executor 가 `blocked|failed`, evaluator 가 `escalate` 로 종료하면 메인 thread 는 그냥 사용자에게 보고하고 멈춘다. 흔한 transient 실패 (탐색 도구 예산 부족, 한 task 의 lint 실패 등) 도 사용자 손으로 재디스패치해야 한다.

P5. **위험 명령 가드 없음.** 메인 thread 든 서브에이전트든 `git push --force`, `rm -rf`, `git reset --hard origin/master` 를 실행하기 직전에 막아 줄 hook 이 없다. 권한 프롬프트가 떠도, 솔로 개발자는 "Yes" 를 습관적으로 누른다.

P6. **관측성 부재.** 어떤 스킬이 언제 들어가고 언제 어떤 status 로 나왔는지 추적할 수 없다. STATE.md 가 부분적으로 그 역할을 하지만, hook 단의 raw 이벤트 로그가 없다.

## 목표 (Goals)

G1. **Pre-configured permissions.** 하네스가 정상 운영에서 쓰는 모든 read-only / 흔한 dev-loop 명령을 `.claude/settings.json` 의 `permissions.allow` 에 미리 넣어 권한 프롬프트를 사실상 0 으로 만든다.

G2. **Hook 기반 산출물 검증.** writer / brainstorming 이 파일을 쓴 직후, 필수 섹션·헤더·route 정합성을 자동 검사한다. 실패하면 메인 thread 에 알리고 revise 디스패치를 유도한다.

G3. **Hook 기반 코드 검증.** executor 서브에이전트의 `Edit`/`Write` 직후 변경 파일에 대한 lint·typecheck 를 자동 실행한다. 실패는 task 의 `[Result]` 블록에 기록되어 evaluator 와 재시도 루프가 본다.

G4. **자동 retry 루프.** writer `error`, executor task `failed`, evaluator `escalate` 에 대해 명시적 재시도 정책 — per-skill 시도 캡, backoff, escalate 조건. STATE.md 에 시도 횟수 누적.

G5. **위험 명령 가드 (deny + ask).** `git push --force`, `git reset --hard`, `rm -rf`, `--no-verify` 같은 패턴은 `permissions.deny` 또는 `ask` 채널로 분리. 사용자에게 명시적으로 한 번 더 묻는다.

G6. **세션 audit log.** 모든 hook 이벤트 (스킬 진입/종료, Bash 명령, Edit 대상, status) 를 `.planning/{session_id}/audit.log` 에 append. 사후 디버깅과 evaluator 가 쓰기 위함.

## Non-goals

- **CI / CD 통합 아님.** 이건 로컬 Claude Code 하네스의 운영 레이어다. GitHub Actions / Vercel hook 는 별도 작업.
- **승인 / 거절 학습 모델 아님.** 어떤 명령을 허용할지는 사람이 정한 정적 allowlist. ML 기반 자동 판단 없음.
- **하네스 외부 프로젝트 보호 아님.** 사용자의 다른 repo 까지 보호하지 않는다 — 하네스 플러그인이 활성화된 세션 안에서만 작동.
- **새 스킬 추가 아님.** 모든 변경은 `.claude/settings.json` 과 `hooks/` 디렉토리, 그리고 메인 thread 의 retry 로직에 국한.
- **PRD/TRD/TASKS 의 의미 검증 아님.** 형식 (섹션 존재, route 정합) 만 검증한다. 내용 평가는 evaluator 의 책임으로 남긴다.

## Acceptance criteria

A1. 일반적인 build/fix 세션 (PRD 작성 → executor 5 task 실행 → evaluator pass) 에서 권한 프롬프트가 **0 번** 발생한다 — 단, 위험 명령에 대한 의도된 ask 는 제외.

A2. writer 가 필수 섹션 (`## Goal` / `## Acceptance` / `## Open questions` 등) 누락된 산출물을 작성하면, hook 이 즉시 감지해 `## Status` 메시지를 통해 메인 thread 에 신호를 보낸다 (`PostToolUse:Write` 검사).

A3. executor task 의 서브에이전트가 코드를 편집하면, hook 이 변경 파일 확장자에 맞는 lint·typecheck 를 돌리고, 실패 시 task 의 `[Result]` 에 `lint: failed — {summary}` 를 추가한다.

A4. writer `error` 가 발생하면 메인 thread 가 동일 writer 를 **최대 2 회** 재디스패치한다 (revision note 를 hook 출력에서 가져와 추가). 3 회째 실패 시 사용자에게 escalate.

A5. `git push --force`, `git reset --hard`, `rm -rf /`, `--no-verify` 등의 명령은 hook 또는 `permissions.deny` 가 가로채 사용자 명시 승인 없이는 실행되지 않는다.

A6. 세션이 끝나면 `.planning/{session_id}/audit.log` 에 모든 스킬 진입·종료, Bash 명령, Edit 대상, hook 결정이 시간순으로 기록되어 있다.

## 설계 (Design)

### 1. Permissions allowlist (G1, P1)

#### 1.1 위치와 분할

- **하네스 글로벌 (`harness/.claude/settings.json` — 신규).** 하네스 전반에서 항상 허용해야 하는 명령. 플러그인 설치 시 자동 적용.
- **사용자 로컬 (`harness/.claude/settings.local.json` — 기존).** 사용자가 자신의 환경 (예: 사내 패키지 매니저, 사내 lint) 에 맞춰 추가.
- 우선순위: local > global > deny. deny 는 어디서 선언하든 항상 이긴다.

#### 1.2 기본 allow 카테고리

| 카테고리 | 패턴 예시 | 근거 |
|---|---|---|
| Read-only git | `Bash(git status*)`, `Bash(git diff*)`, `Bash(git log*)`, `Bash(git show*)`, `Bash(git branch*)` | router/brainstorming/evaluator 가 빈번히 호출. |
| Write git (보수적) | `Bash(git add *)`, `Bash(git commit -m *)`, `Bash(git restore --staged *)` | 기존 라인 유지. force / push / reset 은 별도 처리. |
| 패키지 매니저 read | `Bash(npm root *)`, `Bash(npm ls *)`, `Bash(pnpm list *)`, `Bash(yarn list *)` | 의존성 탐색. |
| 패키지 매니저 install (조건부) | `Bash(npm install --no-save *)` 등 — 글로벌 X, 로컬 O | 솔로 환경에서만 자동 허용. |
| 빌드 / 테스트 / lint | `Bash(npm test*)`, `Bash(npm run lint*)`, `Bash(npm run typecheck*)`, `Bash(npm run build*)`, `Bash(pnpm *)`, `Bash(yarn *)`, `Bash(pytest*)`, `Bash(ruff *)`, `Bash(eslint *)`, `Bash(prettier *)`, `Bash(tsc *)`, `Bash(go test *)`, `Bash(cargo test *)` | executor 서브에이전트의 verify 명령. |
| 파일 read 도구 | `Bash(ls *)`, `Bash(find *)`, `Bash(rg *)` | Read/Grep/Glob 도구가 다 커버하지 못하는 케이스. |
| 하네스 자체 도구 | `Bash(npx -y ccstatusline@latest --version)` 외 | 기존 라인 유지. |

#### 1.3 Deny / Ask 분리

- **deny (즉시 차단, 프롬프트 없음).**
  - `Bash(rm -rf /*)`, `Bash(rm -rf ~*)`, `Bash(rm -rf $HOME*)`
  - `Bash(git push --force*)`, `Bash(git push -f*)`
  - `Bash(git reset --hard *)` *(soft / mixed 는 허용 검토)*
  - 모든 `--no-verify`, `--no-gpg-sign`, `-c commit.gpgsign=false` 변형 (hook + deny 이중 가드)
- **ask (사용자 명시 승인 필요).**
  - `Bash(git push *)` *(force 아닌 일반 push)*
  - `Bash(npm publish *)`, `Bash(pnpm publish *)`
  - `Bash(gh pr merge *)`, `Bash(gh pr close *)`
  - 외부 네트워크 mutation (`curl -X POST *`, `curl -X DELETE *`)

#### 1.4 마이그레이션

- 현재 `settings.local.json` 의 4 줄은 글로벌로 승격하고, local 파일은 `permissions.allow` 를 비운 채 사용자 확장 슬롯으로 남긴다.
- `hooks/hooks.json` 은 그대로 유지하되, 새 hook 들을 동일 파일에 추가 (1.4 의 분할은 적용 X — 하네스 hook 은 글로벌이 자연스럽다).

### 2. Hooks 기반 검증 (G2, G3)

#### 2.1 사용할 hook 이벤트

| 이벤트 | 용도 | 신규/기존 |
|---|---|---|
| `SessionStart` | using-harness 메타 스킬 주입 (현재 동작) | 기존 |
| `UserPromptSubmit` | `.planning/` 활성 세션 감지 후 메인 thread 에 컨텍스트 주입 | 신규 |
| `PreToolUse(Bash)` | 위험 명령 차단 (deny 보강), audit log 기록 | 신규 |
| `PostToolUse(Write\|Edit)` | 산출물 / 코드 검증 분기 | 신규 |
| `SubagentStop` | writer / executor 의 task 서브에이전트 종료 시 status 검증 | 신규 |
| `Stop` | 세션 종료 시 STATE.md / audit.log 마무리 | 신규 |

#### 2.2 산출물 검증 hook (`PostToolUse:Write`)

대상 경로 패턴: `.planning/*/brainstorming.md`, `.planning/*/PRD.md`, `.planning/*/TRD.md`, `.planning/*/TASKS.md`.

검사 항목 (단순 grep / 헤더 카운트 — 의미 검증 X):

- **brainstorming.md** — `## Request`, `## A1.6 findings`, `## Brainstorming output`, `## Recommendation` 4 섹션 모두 존재.
- **PRD.md** — `## Goal`, `## Non-goals`, `## Acceptance`, `## Open questions` 존재.
- **TRD.md** — `## Architecture`, `## Data flow`, `## File map`, `## Open questions` 존재.
- **TASKS.md** — 최소 1 개 task 블록, 각 task 에 `Files:` / `Verify:` 라인 존재, DAG 사이클 없음 (간단 토폴로지 체크).
- 본문이 비어 있거나 (< N 라인) `<TODO>` 플레이스홀더가 남아있으면 fail.

실패 시 hook 이 stderr 에 `validation failed: <reason>` 출력 → Claude Code 가 이를 메인 thread 에 surface → 메인 thread 의 retry 정책 (§3) 이 처리.

#### 2.3 코드 lint hook (`PostToolUse:Edit|Write`)

대상 경로 패턴: 프로젝트 source 트리 (`.planning/**` 제외, `node_modules/**` 제외).

언어/확장자별 액션:

| 확장자 | 명령 |
|---|---|
| `*.ts`, `*.tsx` | `npx tsc --noEmit --pretty false {file}` + `npx eslint --no-eslintrc --quiet {file}` (있을 때) |
| `*.js`, `*.jsx` | `npx eslint --quiet {file}` |
| `*.py` | `ruff check {file}` |
| `*.go` | `gofmt -l {file}` + `go vet ./...` (대상 패키지) |
| `*.rs` | `cargo check --quiet` (대상 crate) |
| `*.md` | (선택) `markdownlint {file}` — 산출물은 §2.2 가 우선 |

규칙:

- 명령이 미설치면 silently skip (CI 가 아니라 dev loop 라서).
- 실패 시 실패 요약을 stdout 에 출력. 메인 thread 의 task `[Result]` 작성 로직이 이걸 소비해 `lint: failed — {first 3 lines}` 추가.
- hook 실행 시간 캡: 30 초. 초과 시 timeout 으로 기록하고 통과 처리 (build 봉쇄 방지).

#### 2.4 위험 명령 차단 (`PreToolUse:Bash`)

§1.3 의 deny 패턴은 settings 의 `permissions.deny` 가 일차로 막는다. hook 은 보강 — settings 가 매칭하지 못하는 변형 (예: 줄바꿈, 인용 트릭, `eval`) 을 잡는다. 매칭 시 hook 이 stderr 에 사유 출력 후 exit 1 → Claude Code 가 명령 차단.

### 3. 자동 retry 루프 (G4, P4)

#### 3.1 STATE.md 의 retry 슬롯

`.planning/{session_id}/STATE.md` 에 다음 카운터 섹션을 추가한다:

```markdown
## Retry counters
- prd-writer: 0/2
- trd-writer: 0/2
- task-writer: 0/2
- executor: 0/3   <!-- 전체 task 묶음 단위 -->
- evaluator: 0/1  <!-- escalate 후 자동 revise 1 회 -->
```

소유자: 메인 thread (router 가 빈 스켈레톤 생성, 후속 스킬 디스패치 직전 +1).

#### 3.2 재시도 정책

| 트리거 | 동작 | 캡 |
|---|---|---|
| writer `## Status: error` | 메인 thread 가 동일 writer 재디스패치. 디스패치 프롬프트에 `Revision note from harness: previous run errored — {Reason}` 추가. | 2 회 |
| writer hook 검증 실패 (§2.2) | 동일 writer 재디스패치. revision note 에 누락 섹션 명시. | 2 회 |
| executor task `failed` | 해당 task 만 재디스패치 (전체 batch 아님). prior `[Result]` 의 lint/test 출력을 revision note 로 첨부. | task 당 2 회, 세션 누적 3 회 |
| executor `blocked` | 즉시 escalate (사람 개입). 자동 retry 없음 — blocked 는 의존성 미충족이라 재실행해도 같은 결과. | 0 |
| evaluator `escalate` | revision note 와 함께 task-writer 재디스패치하여 TASKS 보강 (자동 1 회). 그 후에도 escalate 면 사용자에게. | 1 회 |
| evaluator `error`, writer `error` (재시도 캡 도달) | 사용자에게 즉시 escalate. STATE.md 의 `Last activity` 에 사유 기록. | — |

#### 3.3 무한 루프 방지

- 동일 reason 으로 2 연속 실패하면 캡과 무관하게 즉시 escalate. (예: `Reason: brainstorming.md missing ## Recommendation` 이 두 번 연속 — writer 가 풀어낼 수 없는 입력 결함.)
- 캡은 세션 누적이지 시간당 비율 아님 — 세션이 길어져도 누적치는 리셋되지 않는다.
- audit.log 에 모든 retry 이벤트 기록 (시도 번호, 트리거 사유, 결과).

#### 3.4 메인 thread 책임

- retry 카운터 갱신은 메인 thread 가 디스패치 직전에 수행 (스킬 자체는 자기 시도 횟수를 모른다).
- revision note 작성도 메인 thread 책임 — hook 출력 / 이전 status 메시지 / `[Result]` 를 종합.
- 이 로직은 새 스킬이 아니라 메인 thread 의 운영 매뉴얼 (using-harness 의 보강) 로 들어간다.

### 4. 관측성 — audit.log (G6)

#### 4.1 형식

JSON Lines, 한 줄 한 이벤트:

```json
{"ts":"2026-04-30T11:02:14Z","ev":"skill_enter","skill":"prd-writer","session":"abc123","attempt":1}
{"ts":"2026-04-30T11:02:55Z","ev":"bash","cmd":"npx tsc --noEmit","cwd":"...","exit":0}
{"ts":"2026-04-30T11:02:58Z","ev":"validation","target":".planning/abc123/PRD.md","ok":true}
{"ts":"2026-04-30T11:03:12Z","ev":"skill_exit","skill":"prd-writer","status":"done","path":".planning/abc123/PRD.md"}
```

#### 4.2 작성 주체

- `PreToolUse` / `PostToolUse` / `SubagentStop` / `Stop` hook 이 각자 한 줄씩 append.
- 스킬 entry/exit 는 hook 이 추론 (Subagent 시작/종료 + Skill 툴 호출) — 스킬 본문은 audit 을 모른다.
- 파일 lock 은 OS append 의 원자성에 의존 (POSIX `O_APPEND`); concurrent writer 도 안전.

#### 4.3 사용처

- evaluator 가 `Read` 로 직접 참조 가능 (단, 권위 ground 는 TASKS.md 의 `[Result]` 가 우선; audit 은 보조).
- 사용자 사후 디버깅 — 어떤 hook 이 무엇을 막았는지, 어느 retry 가 어디서 실패했는지 추적.

### 5. 작업 계획 (구현 순서)

S1. **Permissions allowlist 확장** — `.claude/settings.json` 글로벌 추가, `permissions.allow` / `deny` / `ask` 작성. (P1, A1, A5)

S2. **위험 명령 deny + PreToolUse hook** — settings deny 패턴 + `hooks/pre-bash.sh`. (P5, A5)

S3. **산출물 검증 hook** — `hooks/post-write-validate.sh` + `PostToolUse:Write` 등록. (P2, A2)

S4. **코드 lint hook** — `hooks/post-edit-lint.sh` + `PostToolUse:Edit|Write` 등록. (P3, A3)

S5. **STATE.md retry 슬롯 + 메인 thread 매뉴얼** — using-harness 보강, router 의 STATE.md 스켈레톤 확장. (P4, A4)

S6. **audit.log 작성기** — 모든 hook 에서 공통 `audit_append` 함수 사용, `Stop` hook 에서 세션 마무리. (P6, A6)

각 단계는 독립적으로 머지 가능 — S1, S2 부터 가도 즉시 권한 프롬프트 피로 해소 효과가 나온다.

## Open questions

Q1. **글로벌 settings 파일을 플러그인이 자동 배치할 수 있나?** 현재 `harness/.claude/` 는 사용자 워크스페이스 기준이지 플러그인 root 기준이 아니다. 플러그인 설치 시 사용자 settings 에 자동 머지하는 메커니즘이 있는지 확인 필요. 없다면 README 에 "글로벌 settings 추가 가이드" 를 사람이 따라 하게 하는 폴백.

Q2. **lint hook 의 timeout / 비용.** 30 초 캡이 빠른 PostToolUse 흐름에 무겁지 않은가? 대안: `tsc` 는 워치 모드 데몬으로 두고 hook 은 결과만 조회. 우선 30 초 동기로 시작하고 측정.

Q3. **retry 카운터를 STATE.md 가 아닌 별도 파일로?** STATE.md 는 사람이 읽는 면이 강한데, 카운터는 기계용. `.planning/{session_id}/runtime.json` 같은 분리도 고려할 수 있다. 다만 단일 파일 정책에 부합하는 STATE.md 가 더 단순.

Q4. **ask 채널의 UX.** Claude Code 에서 `permissions.ask` 와 `permissions.allow` 의 사용자 UI 차이가 명확한지 — ask 는 매번 묻고 allow 는 묻지 않는다는 가정인데, 실측 필요.

Q5. **audit.log 회전.** 세션이 길어지면 무한 append. 세션 종료 시 압축 (`audit.log.gz`) 또는 일정 크기 초과 시 split — 솔로 환경에서는 우선 무회전으로 시작해도 충분할 가능성이 높다.

Q6. **executor 의 task 별 서브에이전트가 hook 의 lint 실패를 자기 [Result] 에 어떻게 반영하나?** 현재 file-ownership 상 executor 가 TASKS.md 의 `[Result]` 만 갱신한다. hook 이 직접 TASKS.md 를 만지면 소유권 위반. 설계: hook 은 stdout 으로만 신호하고, executor (또는 task 서브에이전트) 가 자기 종료 직전에 그 stdout 을 읽어 `[Result]` 에 반영. 서브에이전트가 hook stdout 을 보는 채널이 가능한지 검증 필요.

## 함께 보기

- `harness-contracts/payload-contract.ko.md` — 스킬 간 핸드오프. retry 디스패치 프롬프트의 형태가 여기 정의된 핸드오프 규칙을 위반하지 않아야 한다.
- `harness-contracts/file-ownership.ko.md` — STATE.md / TASKS.md 의 갱신 권한. retry 카운터 슬롯과 hook 의 `[Result]` 반영은 이 표를 손대지 않는 선에서 설계되어야 한다.
- `harness-contracts/execution-modes.ko.md` — Subagent vs Main context. retry 로직은 메인 thread 책임이고, hook 은 컨텍스트 외부에서 돌아간다 (어느 모드에도 속하지 않음).
- `skills/using-harness/SKILL.md` — 본 PRD 의 retry 규칙은 결국 여기 운영 매뉴얼로 흡수되어야 메인 thread 가 일관되게 따른다.
