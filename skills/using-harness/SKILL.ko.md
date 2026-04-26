---
name: using-harness
description: 하네스 부트스트랩 — `docs/harness/harness-flow.yaml` 을 해석해 매 스킬 종료 후 다음 노드를 직접 dispatch 한다. `harness-flow.yaml` 이 단일 소스 오브 트루스이고, 이 스킬은 그걸 읽는 법을 가르친다. 세션 시작 훅으로 로드되며 수동 호출 대상 아님.
---

# Using Harness

`docs/harness/harness-flow.yaml` = DAG (단일 소스 오브 트루스).
**너 = 인터프리터.** 런타임 엔진 없음. YAML 읽고 다음 노드 직접 dispatch.

## Core loop

스킬 종료 시 (또는 유저 메시지 도착 시):

1. **`docs/harness/harness-flow.yaml` 재독** (~60 줄, 저렴).
2. **현재 위치 파악** — 어느 노드가 방금 끝났나? 출력 JSON 은 뭐였나?
3. **후보 노드 찾기** — 방금 끝난 노드를 `depends_on` 에 가진 모든 노드.
4. **`when:` 치환·평가** — `$<id>.output.<field>` 를 최근 출력값으로 치환하고 boolean 평가 (`==`, `||`, `&&`).
5. **`trigger_rule` 적용** — 기본은 모든 `depends_on` 완료 필요, `one_success` 는 하나라도 매칭되면 즉시 발화.
6. **첫 매칭 노드 호출.** 스킬은 `skills/<command>/SKILL.md` 에 있음 — 등록돼 있으면 `Skill` tool, 아니면 `Read` 로 해당 파일 읽고 지시 따름.
7. **매칭 없음 → 플로우 종료.** 최종 outcome 유저에게 보고.

## 플로우 시작

세션의 첫 유저 메시지:

- **캐주얼 대화·일반 질문** (계획·빌드 의도 없음) → 일반 응답. 하네스 미개입.
- **feature / bug / 프로젝트 / "X 만들어줘" 요청** → `router` 노드 호출 (진입점 — `harness-flow.yaml` 에서 `depends_on` 없음).

플로우 시작 시점에 `session_id = "YYYY-MM-DD-{slug}"` 생성 (slug 은 요청 요약의 2-4 단어 kebab-case). 이후 모든 스킬 호출에 관통.

## Output 계약

모든 하네스 스킬은 **단일 JSON 객체**를 최종 메시지로 방출:

- 성공: `{"outcome": "<value>", "session_id": "<id>", ...}`
- 에러: `{"outcome": "error", "session_id": "<id>", "reason": "<한 줄>"}`

이 JSON 으로 downstream `when:` 평가. 필드 지어내지 말 것 — 스킬이 실제 방출한 것만 읽어라.

## 컨텍스트 격리

`context: fresh` 노드는 가능하면 격리된 subagent 에서 실행:

- `Task` / `Agent` tool 가용 → subagent dispatch (컨텍스트 깨끗, heavy 스킬이 메인 스레드 오염 안 함).
- 불가 → 인라인 실행, 컨텍스트 오염 비용 감수.

## 세션 아티팩트

세션 상태 전부 `.planning/{session_id}/` 하위:

- `STATE.md` — 메인 스레드 진행 원장
- `PRD.md` / `TRD.md` / `TASKS.md` — writer 산출물
- `findings.md` — doc-updater 감사 로그

각 스킬이 자기 아티팩트 소유, `STATE.md` 만 메인 스레드 책임.

## 규칙

- **`when:` 은 엄격한 `==`** (정확한 문자열 매치, 퍼지 금지).
- **다중 매칭** → `harness-flow.yaml` 에 먼저 나열된 노드 우선.
- **스킬 출력에 `outcome` 필드 부재** → 플로우 종료 처리, 유저에게 보고.
- **무한 재귀 금지** — 같은 노드를 세션 내에서 두 번 invoke 했는데 진척 없으면 멈추고 유저에게 질문.

## 파일

- 플로우: `docs/harness/harness-flow.yaml`
- 스킬: `skills/<command>/SKILL.md` (등록돼 있으면 `Skill` tool, 아니면 `Read`)
- 아티팩트: `.planning/{session_id}/`
