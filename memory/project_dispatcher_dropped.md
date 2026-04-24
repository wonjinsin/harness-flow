---
name: dispatcher-dropped
description: 2026-04-19 설계 결정 — subagent-dispatcher 의 라우팅 glue 역할 제거. harness-flow.yaml + outcome 태그 컨벤션으로 대체. Executor (TASKS.md 병렬 실행) 만 별도 skill 유지.
type: project
---

PRD v0.2.1 에는 `subagent-dispatcher` 가 (a) 전 phase 의 라우팅 glue 와 (b) Executor phase (TASKS.md 병렬 dispatch) 를 겸하도록 설계됨. 2026-04-19 유저와의 리뷰에서 (a) 는 제거 결정.

**Why:**
- 세 메인-스레드 스킬 (router / brainstorming / complexity-classifier) 이 이미 `outcome` 태그 payload (`classified` / `pivot` / `exit-casual` / `casual` / `clarify` 등) 를 emit 하고 있고, harness-flow.yaml 이 라우팅 스펙을 명시함.
- 메인 스레드 Claude 가 harness-flow.yaml 을 읽고 직접 `Agent(subagent_type=...)` 를 호출하면 dispatcher 는 20줄짜리 중복 레이어.
- 현재 플로우 (A/B/C/D → writer → evaluator → doc-updater) 가 선형이라 공통 로직 재사용이 얕음.

**How to apply:**
- 새 라우팅 로직을 skill 로 빼지 말 것 — harness-flow.yaml 스펙에 담고 메인 스레드가 따름.
- 단, **Executor phase (TASKS.md 병렬 task dispatch)** 는 별도 skill (`parallel-task-executor` 또는 유사 명) 로 유지 — task 의존성 분석, Task tool 병렬 호출, 결과 취합은 실제 로직이라 글루가 아님.
- 각 스킬 SKILL.md 상단의 "harness-flow.yaml 참조" 문구는 유지 (스킬이 자기 다음 phase 를 알기 위한 단일 소스).
