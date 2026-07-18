# plan-audit 완전성 게이트 회고 — 2026-07-18

## 배경

외부 루프 eval(design/2026-07-18-external-loop-retrospective.md)에서 in-session 실행이 3판 중 2판에서 plan 태스크의 30–50%를 조용히 누락하고 성공을 자칭했다. 원인은 완전성 검증이 전부 확률적(LLM)이라는 것. 루프 전체 도입은 속도·토큰 게이트를 통과하지 못했으므로, 루프의 결정론 검증 개념만 in-session 체인에 역이식했다.

## 구현 (2그룹 4태스크, 최종 리뷰 opus Approved, 스위트 223/223)

1. `skills/subagent-driven-development/scripts/plan-audit` — plan의 태스크별 `Files:`(Create/Modify/Test) 경로 존재 + (`--base`) 태스크당 1커밋 하한을 검사. exit 0/1/2.
2. `hooks/pre-plan-audit.js` — PreToolUse(Agent|Task)에서 최종 리뷰 dispatch(`^Review code changes`)를 가로채 감사 실행, exit 1일 때만 deny(그 외 전부 fail-open). `HARNESS_FLOW_PLAN` env로 plan 명시 가능, 기본은 `docs/harness-flow/plans/` 최신 파일.
3. SDD SKILL.md에 1차 지시(리뷰 dispatch 전 자체 감사) + Red Flag, CLAUDE.md 훅 문서.

Minor 2건 미수정 기록(둘 다 fail-safe 방향): `--base` 값 누락 시 커밋 검사 조용히 생략; 감사 스크립트 내부 크래시(exit 1)가 deny로 읽힘(스퓨리어스 차단, HOOKS_OFF로 우회 가능).

## Eval 결과

**1. 리플레이 (결정론, 실제 실패 산출물 6건):** catch **3/3** — medium-insession(schema.js·index.js 등 4파일), complex-insession(3모듈 6파일), complex-loop(index.js 2파일)를 파일 단위로 정확 검출. 완전한 3건(simple×2, medium-loop)은 오탐 **0/3**.

**2. 훅 시뮬레이션 (동일 6건 + scope):** deny/allow 6/6 정확, 비-리뷰 dispatch(`Implement Group N:`) 무간섭 — blast radius 0. 기존 pre-agent-model.js와 같은 매처 공유하나 description 집합이 소격리(disjoint)로 이중 deny 없음(리뷰어 검증).

**3. 라이브 1회 (medium plan, 훅 무장, sonnet):** 이번 컨트롤러는 4/4 태스크를 완주해 deny 경로가 발화하지 않음(누락은 확률적 — 1샘플 한계). 대신 (a) 무장 훅 아래 최종 리뷰 dispatch가 정상 통과 — **라이브 오탐 0 확증**, (b) acceptance 6/6 + 감사 클린, (c) 부수 확인: 컨트롤러가 진짜 spec 모호점(`Number("")===0` 빈 값 타이핑)을 plan-escalate로 정확히 에스컬레이션하고 정지. 비용 $3.79(원판 $1.37 대비 높음 — 리뷰 루프 심화, 실행 간 분산 큼).

## 판정

- 게이트의 목적(측정된 최악 실패 모드의 결정론적 차단)은 리플레이+시뮬레이션으로 실증: **catch 3/3, 오탐 0/6** (리플레이 3 + 라이브 대조 3... 총 오탐 기회 4회 중 0회).
- 토큰/속도 비용: 감사·훅 자체는 LLM 무호출(수 ms) — 1차 게이트에 저촉 없음. deny 발생 시 재작업 비용은 "누락 채우기"라 어차피 필요한 지출.
- 한계: `Files:` 규약(bullet)을 따르는 plan에만 유효(비규약 plan은 fail-open — writing-plans가 규약의 단일 원천). 내용 부실은 못 봄 — 그건 여전히 최종 리뷰 몫.
