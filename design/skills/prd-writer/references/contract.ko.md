# Writer 계약 — payload, output, error, anti-pattern

`prd-writer`, `trd-writer`, `task-writer` 가 공유한다. 모든 writer 는 자기 subagent 컨텍스트 안에서 로드된다.

## 격리 컨텍스트

writer 에이전트의 격리 컨텍스트에서 동작한다. **메인 대화 이력에는 접근 불가** — 입력은 payload (와 그 payload 가 인용한 상류 파일) 뿐이다. 분리 이유: writer 가 코드 읽기에 컨텍스트를 마음껏 쓰면서 메인 스레드를 오염시키지 않게 하려는 것; 동시에 payload 가 얇아도 이전 턴을 떠올려 메우는 식의 회복은 불가능. payload 가 얇으면 Read/Grep/Glob 으로 코드베이스를 조사한다. 요구사항·아키텍처·파일 구조를 지어내지 말 것.

## Input payload

공통 필드, 모두 권위 있는 입력:

- `session_id`: `"YYYY-MM-DD-{slug}"` — 출력 폴더 결정.
- `request`: 유저 원본 턴, verbatim. 구조화 필드가 놓치는 톤·뉘앙스를 잡기 위해 꼼꼼히 읽는다.
- `brainstorming_outcome` *(prd-writer, trd-writer)*: brainstorming 이 emit 한 route (`"prd-trd"`, `"prd-only"`, `"trd-only"`). 해당 writer 에서는 필수; 없거나 다른 값이면 `error`.
- `brainstorming_output` *(optional)*: `{intent, target, scope_hint, constraints[], acceptance}` — router 가 `plan` 을 직접 넘겼을 때는 없을 수 있음.
- `prd_path` *(trd-writer, task-writer)*: 상류에서 PRD 가 만들어졌으면 `".planning/{session_id}/PRD.md"`, 아니면 `null`.
- `trd_path` *(task-writer)*: 상류에서 TRD 가 만들어졌으면 `".planning/{session_id}/TRD.md"`, 아니면 `null`.

`*_path` 가 세팅돼 있는데 파일을 못 읽거나 없으면 즉시 중단하고 `error` + `reason: "<doc> declared in payload but <path> not found"` emit. 지어내서 진행 금지.

## Output JSON

최종 메시지는 항상 JSON 객체 하나 — 옆에 prose 금지. 메인 스레드는 이걸 기계 판독 status line 으로 처리한다.

**done** — 파일 작성됨:

```json
{ "node_id": "prd-writer", "outcome": "done", "session_id": "2026-04-19-...", "brainstorming_outcome": "prd-trd", "path": ".planning/2026-04-19-.../PRD.md", "next": "<step-5-에서-결정>" }
```

**error** — payload 결함, 파일 충돌, 상류 누락, 회복 불가능한 탐색 공백:

```json
{ "node_id": "prd-writer", "outcome": "error", "session_id": "2026-04-19-...", "reason": "<짧은 원인>", "next": null }
```

`node_id` 필수: Stop 훅 디스패처(`hooks/dispatch-next.js`)가 어떤 노드가 방금 emit 했는지 식별하고 `harness-flow.yaml` 에서 다음 노드를 계산할 때 사용. `brainstorming_outcome` 도 echo 해서 디스패처가 원래 payload 를 다시 읽지 않고 다운스트림 `when:` 식을 평가할 수 있게 함.

출력 경로는 `session_id` 로부터 결정론적; 메인 스레드가 재구성한다. 대상 파일이 이미 있으면 `error` — **절대 덮어쓰지 않음**. 재생성은 메인 스레드 몫: 이전 파일을 먼저 지우고 재-dispatch.

## Error 분류 — 언제 `error` 를, 언제 `done` 을

다음 경우 `error` emit:

- 필수 payload 필드 누락 또는 허용 값이 아님 (예: `brainstorming_outcome` 이 허용 집합 밖).
- 선언된 상류 파일 (`prd_path`, `trd_path`) 이 세팅됐는데 누락/판독불가.
- 대상 출력 파일이 이미 존재.
- Step 2 탐색이 tool 예산 cap 까지 가도 변경 surface 를 못 풀음.
- (task-writer) Task DAG 에 사이클.
- (task-writer 한정) `prd_path`, `trd_path`, `brainstorming_output` 이 모두 null 이고 `request` 에 actionable verb 없음.

다음 경우 `done` emit (Open question 은 파일 본문에 기록):

- 작성 완료했고 Open question 이 2개를 초과해도 self-escalate 하지 말 것; 다음 writer 또는 evaluator 가 차단성 질문을 노출한다.
- PRD/TRD 가 얇아도 판독 가능하면 권위 있는 입력으로 취급하고 공백은 자기 Open questions 에 기록.

## 솔로-개발자 anti-pattern

세 writer 모두 적용:

- **person-hour, sprint, story point 추정 금지.** 솔로 프로젝트; 추정은 노이즈.
- **라이브러리 선택 쇼 금지.** 잘 알려진 선택에 장단점 표 금지. 선택 + 한 줄 이유, 또는 생략.
- **유저 어휘를 재표현하지 말 것.** 유저가 "로그인 페이지" 라고 했으면 "인증 표면" 으로 바꾸지 말 것. PRD 가 "2FA" 면 "이차 인증" 으로 바꾸지 말 것. 하류 (task-writer, evaluator) 는 이 어휘로 grep 한다; 재표현하면 PRD ↔ TRD ↔ TASKS ↔ 검증 traceability 가 깨진다.
- **"있으면 좋음" 리스트 금지.** Goal/Acceptance 에 없으면 Non-goal.
- **본문은 유저 언어 미러링.** 한국어 요청 → 한국어 본문. 헤더, 필드명, 코드 식별자, 파일 경로는 기계 판독성 위해 영어 유지.
