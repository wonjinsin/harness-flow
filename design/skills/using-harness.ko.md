---
name: using-harness
description: 하네스 부트스트랩 — 하네스 DAG 파일을 해석해 매 스킬 종료 후 다음 노드를 직접 dispatch 한다. DAG 파일이 단일 소스 오브 트루스이고, 이 스킬은 그걸 읽는 법을 가르친다. 세션 시작 훅으로 로드되며 수동 호출 대상 아님.
---

# Using Harness

**하네스 DAG 파일**: `${CLAUDE_PLUGIN_ROOT}/docs/harness/harness-flow.yaml`. SessionStart 훅이 해석된 절대 경로를 컨텍스트에 주입하니 그대로 사용. **너 = 인터프리터.** 런타임 엔진 없음. YAML 읽고 다음 노드 직접 dispatch.

> 플러그인 루트는 Claude Code 가 이 플러그인을 마운트한 위치 (예: `~/.claude/plugins/marketplaces/<mp>/plugins/harness-flow/`). `docs/harness/harness-flow.yaml` 을 상대 경로로 읽으면 안 된다 — 유저 프로젝트 CWD 에는 그 파일이 없다.

## Core loop

스킬 종료 시 (또는 유저 메시지 도착 시):

1. **`${CLAUDE_PLUGIN_ROOT}/docs/harness/harness-flow.yaml` 재독** (~60 줄, 저렴).
2. **현재 위치 파악** — 어느 노드가 방금 끝났나? 출력 JSON 은 뭐였나?
3. **후보 노드 찾기** — 방금 끝난 노드를 `depends_on` 에 가진 모든 노드.
4. **`when:` 치환·평가** — `$<id>.output.<field>` 를 최근 출력값으로 치환하고 boolean 평가 (`==`, `||`, `&&`).
5. **`trigger_rule` 적용** — 기본은 모든 `depends_on` 완료 필요, `one_success` 는 하나라도 매칭되면 즉시 발화.
6. **첫 매칭 노드 호출.** 플러그인 로드 시 스킬이 이름으로 등록돼 있으니 `Skill("<command>")` 우선. 등록 조회 실패 시 폴백으로 `${CLAUDE_PLUGIN_ROOT}/skills/<command>/SKILL.md` 를 `Read`.
7. **매칭 없음 → 플로우 종료.** 최종 outcome 유저에게 보고.

## Downstream self-lookup (the `next` field)

모든 하네스 스킬은 최종 JSON 을 방출하기 전에 **자기 자신의 outgoing edge 에 대해** Core loop 의 1–5 단계를 수행하고, 해석된 다음 노드 id 를 `next` 로 포함한다:

- 매칭 후보 1개 → `"next": "<node-id>"`.
- 매칭 후보 0개 → `"next": null` (현재 분기에서 이 스킬이 터미널).
- 매칭 후보 다수 → `harness-flow.yaml` 에 먼저 나열된 것 방출 (Core loop 와 동일 tiebreak).

메인 스레드가 독립적으로 재유도하는데도 모든 스킬이 이걸 하는 이유:

- **자가 검증.** 스킬이 자기 outcome 에 대응하는 downstream edge 를 하나도 못 찾는다면 플로우가 기대하지 않는 값을 방출하고 있다는 뜻 — 거의 항상 스킬 버그이고, `"next": null` 로 표면화하면 보인다.
- **단일 소스 오브 트루스.** SKILL.md 에 하드코딩된 "다음 스킬" 힌트는 시간이 지나면 `harness-flow.yaml` 과 어긋난다. 매 실행마다 YAML 을 재평가하면 둘이 동기화된다.
- **메인 스레드와 cross-check.** 메인 스레드는 `next` 를 독립적으로 재유도한다. 불일치 = 버그 (스킬, 플로우 파일, 또는 페이로드 전달 중 하나). 로그 남기고 메인 스레드 결과를 우선한다.

Subagent (`context: fresh` 스킬) 는 다음 노드를 직접 invoke 할 수 없다 — `next` 는 힌트로만 방출한다. 디스패처는 여전히 메인 스레드.

### Threading upstream outcomes through payloads

downstream `when:` 표현식이 upstream 노드의 출력을 참조할 수 있다 (예: `task-writer` 의 `when:` 은 `$brainstorming.output.outcome` 을 읽는다). dispatch 된 스킬이 자기 outgoing edge 를 평가하려면 해당 upstream 값들이 페이로드에 들어 있어야 한다.

규약: 노드를 dispatch 할 때, `harness-flow.yaml` 에서 그 노드의 downstream edge 가 참조하는 모든 upstream `outcome` 을 페이로드에 포함시킬 것. 현재 기준으로:

- `prd-writer` 페이로드는 `brainstorming_outcome` 포함 (downstream `trd-writer` / `task-writer` 의 `when:` 둘 다 `$brainstorming.output.outcome` 참조).
- `trd-writer` 페이로드는 `brainstorming_outcome` 포함 (downstream `task-writer` 의 `when:` 이 참조).
- 그 외 모든 스킬의 downstream edge 는 `when:` 이 없거나 직속 upstream 의 outcome 만 참조한다 (스킬이 이미 자기 `outcome` 으로 갖고 있음). 추가 페이로드 필드 불필요.

dispatch 된 스킬이 현재 받지 않는 upstream outcome 을 참조하는 새 edge 를 추가한다면, 플로우 파일과 해당 스킬 SKILL.md 의 페이로드 스키마를 함께 갱신할 것.

## 플로우 시작

세션의 첫 유저 메시지:

- **캐주얼 대화·일반 질문** (계획·빌드 의도 없음) → 일반 응답. 하네스 미개입.
- **feature / bug / 프로젝트 / "X 만들어줘" 요청** → `router` 노드 호출 (진입점 — `harness-flow.yaml` 에서 `depends_on` 없음).

플로우 시작 시점에 `session_id = "YYYY-MM-DD-{slug}"` 생성 (slug 은 요청 요약의 2-4 단어 kebab-case). 이후 모든 스킬 호출에 관통.

## Output 계약

모든 하네스 스킬은 **단일 JSON 객체**를 최종 메시지로 방출:

- 성공: `{"outcome": "<value>", "session_id": "<id>", "next": "<next-node-id>" | null, ...}`
- 에러: `{"outcome": "error", "session_id": "<id>", "reason": "<한 줄>", "next": null}`

`next` 는 스킬이 자기 자신에 대해 해석한 downstream lookup 결과 ("Downstream self-lookup" 참조). 자기 dispatch 결정을 재유도할 때는 `next` 가 아니라 `outcome` 을 사용할 것 — 스킬의 `next` 는 cross-check 신호로 취급하고, 자기 유도 결과와 어긋나면 로그 남길 것. 이 필드들 외에 지어내지 말 것 — 스킬이 실제 방출한 것만 읽어라.

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

- 플로우: `${CLAUDE_PLUGIN_ROOT}/docs/harness/harness-flow.yaml` (플러그인 루트, **유저 CWD 아님**)
- 스킬: 플러그인 로드 시 이름으로 등록 — `Skill("<command>")`. 폴백: `${CLAUDE_PLUGIN_ROOT}/skills/<command>/SKILL.md` 를 `Read`.
- 아티팩트: `.planning/{session_id}/` (상대 경로 — **유저 프로젝트** 에 작성, 플러그인 아님)
