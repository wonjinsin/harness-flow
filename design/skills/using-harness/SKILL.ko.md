---
name: using-harness
description: 세션 시작 시 메타 스킬로 로드. harness 체인에 진입할 시점(build/fix/refactor/migrate 요청 → router 를 첫 액션으로 invoke; 잡담은 invoke 없이 인라인 응답)과 스킬 우선순위 동작 방식(각 스킬의 'Required next skill' 마커는 load-bearing — 대화에서 매칭될 다른 어떤 스킬보다 먼저 따라야 함)을 정의. 공유 execution-modes / payload / file-ownership 계약은 `harness-contracts/` 를 가리킴.
---

# Using Harness

harness 는 feature/bug 요청을 PRD/TRD/TASKS 로 만들고, 실행하고, 검증하고, 문서를 갱신하는 체인 흐름. 각 스킬의 SKILL.md 는 자기 다음 스킬을 "Required next skill" 섹션에 선언함 — 그 마커를 순서대로 따르면 됨.

## 언제 engage 할지

- **잡담 / 질문** ("hi", "X 가 뭐야?", "어떻게 해?") → 직접 답변. harness invoke 금지.
- **build / fix / refactor / migrate 요청** ("login 에 2FA 추가", "깨진 테스트 고쳐", "세션 핸들링 리팩토") → 첫 액션으로 `Skill("harness-flow:router")` invoke. router 가 clarify, plan, resume 중 결정.

## 스킬 우선순위

harness 스킬의 "Required next skill" 섹션이 후속 스킬을 지정하면, 대화에서 매칭될 다른 스킬보다 먼저 실행. 체인은 load-bearing — 중간 단계 스킵(예: brainstorming 에서 바로 executor) 은 엣지별 payload 계약을 깸. 전체 그래프는 `harness-contracts/payload-contract.ko.md` 참조.

## 실행 모드

각 SKILL.md 는 자체 `## Execution mode` 섹션을 가짐 — "Main context" (인라인 실행) 또는 "Subagent (격리 컨텍스트)" (절차를 prompt 로 Task 툴 dispatch). invoke 할 때 그 선언을 따름. 전체 계약: `harness-contracts/execution-modes.ko.md`.

## 세션 산출물

`.planning/{session_id}/` (사용자 CWD 기준 상대): `ROADMAP.md`, `STATE.md`, `PRD.md`, `TRD.md`, `TASKS.md`, `findings.md`.
