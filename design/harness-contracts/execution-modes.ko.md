# 실행 모드 (Execution modes)

하네스 스킬이 선언할 수 있는 두 실행 모드의 단일 출처. 각 `SKILL.md` 의 `## Execution mode` 한 줄 선언이 이 파일을 가리키며, 아래의 정의가 일관되게 적용된다.

## Subagent (격리 컨텍스트, isolated context)

메인 thread 가 Skill 툴로 스킬을 로드한 뒤 Task 툴로 새 서브에이전트를 디스패치한다. 서브에이전트는 그 스킬의 procedure 를 프롬프트로 받는다. **서브에이전트는 메인 대화 히스토리에 접근할 수 없다** — 입력 전체가 디스패치 시 받은 payload (그리고 payload 가 인용한 업스트림 파일들) 이다.

격리하는 이유: writer 와 게이트키퍼는 코드 읽기와 규칙 추론에 컨텍스트를 많이 쓴다. 그것이 메인 thread 에 흘러들어가면 사용자와의 대화를 밀어낸다. 트레이드오프는, 스킬이 빈약한 payload 를 메인의 이전 턴 회상으로 보충할 수 없다는 점이다 — payload 자체가 자족적이거나, 스킬이 Read/Grep/Glob 으로 직접 조사해야 한다.

이 모드를 선언하는 스킬: `prd-writer`, `trd-writer`, `task-writer`, `evaluator`, `doc-updater`.

## Main context (메인 컨텍스트)

스킬이 메인 thread 에서 인라인으로 실행된다. 라이브 대화 컨텍스트를 가지고, 사용자에게 직접 쓰고, 명확화 질문을 던지고, Task 툴로 다른 스킬을 디스패치하고, 병렬 리턴을 집계할 수 있다.

메인이 필요한 이유: 분류 (`router`), Q&A (`brainstorming`), 오케스트레이션 (`parallel-task-executor`) 은 모두 사용자 대화 또는 서브에이전트로의 fan-out 둘 중 하나가 필요하다. 둘 다 메인 thread 가 있어야 한다.

이 모드를 선언하는 스킬: `router`, `brainstorming`, `parallel-task-executor`.

## SKILL.md 가 이 파일을 참조하는 방법

각 스킬의 `## Execution mode` 섹션은 한 줄이다:

```markdown
## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.
```

또는

```markdown
## Execution mode

Main context — see `../../harness-contracts/execution-modes.md`.
```

상대경로는 `skills/{skill-name}/SKILL.md` 기준. 스킬 위치가 다르면 조정한다.
