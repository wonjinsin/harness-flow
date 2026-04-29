# Writer 출력 계약 (Writer output contract)

writer 패밀리 (`prd-writer`, `trd-writer`, `task-writer`) 의 단일 출처. 이전에 이 규칙들을 중복 보유하던 per-skill `references/contract.md` 들을 대체한다. 각 writer 의 `SKILL.md` 는 payload, output 형태, 에러 분류, 공통 anti-pattern 을 위해 이 파일을 참조하고, 자신의 구체적 출력 예시 한 줄만 인라인으로 보유한다.

## 격리 컨텍스트

모든 writer 는 자기 서브에이전트 컨텍스트 안에서 돌아간다. **메인 대화 히스토리를 사용할 수 없다** — 입력은 payload (그리고 payload 가 인용한 업스트림 파일) 뿐이다. 이렇게 분리한 이유는 writer 가 코드 읽기에 컨텍스트를 자유롭게 써도 메인 thread 가 오염되지 않게 하기 위함이고, 동시에 빈약한 payload 를 이전 턴 회상으로 보충할 수 없다는 의미이기도 하다. payload 가 빈약하면 Read/Grep/Glob 으로 코드베이스를 조사하라; 요구사항·아키텍처·파일 구조를 임의로 만들지 마라.

전체 실행 모드 계약은 `execution-modes.md` 참조.

## 입력 payload

공통 필드, 모두 권위 있음:

- `session_id`: `"YYYY-MM-DD-{slug}"` — 출력 폴더를 결정.
- `request`: 사용자의 원본 턴, 그대로. 구조화 필드가 빠뜨리는 어조와 뉘앙스를 위해 읽는다.
- `brainstorming_outcome` *(prd-writer, trd-writer)*: brainstorming 이 emit 한 경로 (`"prd-trd"`, `"prd-only"`, `"trd-only"`). 명시된 곳에서는 필수; 부재 또는 다른 값은 `error`.
- `brainstorming_output` *(선택)*: `{intent, target, scope_hint, constraints[], acceptance}` — router 가 `plan` 으로 직접 라우팅했을 때 부재할 수 있다.
- `exploration_findings` *(선택)*: brainstorming 의 코드베이스 peek 산출물 `{files_visited[], key_findings[], code_signals[], open_questions[]}`. **있으면 권위 있는 ground 로 취급한다.** Step 2 는 verify-first 가 된다 — 발견사항이 여전히 유효한지 확인 후, brainstorming 이 방문하지 않은 표면으로만 budget 확장. 이미 다룬 영역을 재탐색하지 마라. 스키마는 `payload-contract.md` § 세션-와이드 필드 참조.
- `prd_path` *(trd-writer, task-writer)*: PRD 가 업스트림에 존재하면 `".planning/{session_id}/PRD.md"`, 그렇지 않으면 `null`.
- `trd_path` *(task-writer)*: TRD 가 업스트림에 존재하면 `".planning/{session_id}/TRD.md"`, 그렇지 않으면 `null`.
- `revision_note` *(선택)*: Gate 2 revise 후 메인 thread 가 이 writer 를 재디스패치할 때만 존재. 사용자의 수정사항을 담은 짧은 문자열. 있으면 처음부터 재유도하기보다 이를 우선 처리하라 — 이전 버전이 거의 맞고 이 축에서만 틀린 상태다.

`*_path` 가 설정됐는데 파일을 읽을 수 없거나 없으면, `error` 로 중단하고 `reason: "<doc> declared in payload but <path> not found"`. 추측하지 마라.

## 출력 JSON

마지막 메시지는 항상 단일 JSON 객체 — 옆에 산문 없음. 메인 thread 가 기계 판독 가능한 상태 라인으로 취급한다.

**done** — 파일 작성 완료. 형태 (path 는 writer 별로 다름; 각 `SKILL.md` 가 구체 예시를 보유):

```json
{ "outcome": "done", "session_id": "<id>", "path": ".planning/<id>/<ARTIFACT>.md" }
```

`prd-writer` 는 추가로 `brainstorming_outcome` 을 이 객체에 echo 한다 — 메인 thread 가 경로를 다시 읽지 않고 다음 스킬을 고를 수 있게.

**error** — payload 결함, 파일 충돌, 업스트림 누락, 회복 불가 탐색 갭:

```json
{ "outcome": "error", "session_id": "<id>", "reason": "<짧은 원인>" }
```

출력은 메인 thread 가 다음 스킬의 payload 를 만들기 위해 소비한다.

출력 경로는 `session_id` 로부터 결정된다; 메인 thread 가 재구성한다. 대상 파일이 이미 존재하면 `error` — **덮어쓰지 마라**. 재생성은 메인 thread 의 결정: 옛 파일을 먼저 삭제하고 재디스패치한다.

## 에러 분류 — `error` vs `done`

`error` 를 emit 할 때:

- 필수 payload 필드가 부재하거나 예상치 못한 값 (예: `brainstorming_outcome` 이 허용 집합 밖).
- 선언된 업스트림 파일 (`prd_path`, `trd_path`) 이 설정됐는데 누락 또는 읽기 불가.
- 대상 출력 파일이 이미 존재.
- Step 2 탐색이 도구 예산을 소진했는데도 변경 표면이 해결되지 않음.
- task-writer: task DAG 에 사이클.
- task-writer 한정: `prd_path`, `trd_path`, `brainstorming_output` 모두 null 이고 `request` 에 실행 가능한 동사가 없음.

`done` 을 emit 할 때 (Open questions 를 본문에 기록):

- 작성 완료 후 Open questions 가 2개 초과로 남음. self-escalate 하지 말 것; 다음 writer 또는 evaluator 가 블로킹 질문을 surface.
- PRD/TRD 가 빈약하지만 읽을 만함. 권위 있는 것으로 취급하고 자기 Open questions 에 갭을 기록.

## Solo-dev anti-patterns

세 writer 모두에 적용:

- **인시·스프린트·스토리포인트 금지.** 솔로 프로젝트; 추정은 노이즈다.
- **라이브러리 선택 연극 금지.** 잘 알려진 선택지에 pro/con 표를 그리지 말 것. 선택과 한 줄 근거를 적거나, 생략하라.
- **사용자 어휘 다른 말로 바꾸지 마라.** 사용자가 "login page" 라고 했으면 "authentication surface" 라고 다시 쓰지 마라. PRD 가 "2FA" 라고 했으면 "second-factor" 라고 다시 쓰지 마라. 다운스트림 (task-writer, evaluator) 이 이 어휘를 grep 한다; 패러프레이즈는 PRD ↔ TRD ↔ TASKS ↔ 검증 사이의 추적성을 깬다.
- **"있으면 좋은 것" 리스트 금지.** Goal/Acceptance 에 없으면 Non-goal 이다.
- **본문은 사용자 언어로 미러.** 한국어 요청 → 한국어 본문. 헤더, 필드명, 코드 식별자, 파일 경로는 기계 파싱 가능성을 위해 영어 유지.
