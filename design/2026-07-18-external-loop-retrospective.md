# 외부 루프(sdd-loop) A/B eval 회고 — 2026-07-18

## 무엇을 만들었나

harness_framework의 외부 결정론 루프 패턴을 harness-flow에 이식한 opt-in 헤드리스 실행기
`skills/subagent-driven-development/scripts/sdd-loop` (Node zero-dep, 그룹별 fresh `claude -p` 세션,
커밋 검증, 재시도 캡 2, 최종 리뷰 + verify-fix 캡 3 코드 강제, `loop-state.json` 재개).
브랜치 `worktree-sdd-external-loop`, 스위트 210/210, 최종 리뷰 1 fix-wave 후 Approved.

## Eval 설계

- 3개 난이도(simple 1그룹/2태스크, medium 2그룹/4태스크, complex 3그룹/6태스크) × 2모드.
- **before(in-session 근사)**: `claude -p` 단일 세션이 SDD 컨트롤러로 Task tool 서브에이전트 dispatch.
- **after**: sdd-loop. 전 세션 sonnet. 동일 plan(요구사항·시그니처·엣지케이스 명시, 구현 코드 없음).
- 품질은 **숨겨진 acceptance 스위트**(구현자에게 미제공)로 객관 측정. 각 조합 1회 실행(분산 미측정 — 한계).

## 결과

| run | exit | API시간* | 비용 | acceptance | 자체테스트 | 커밋 | src 완성도 |
|---|---|---|---|---|---|---|---|
| simple-insession | 0 | 177s | $0.89 | **5/5** | 20p | 2 | 완전 |
| simple-loop | 0 | 293s | $1.36 | **5/5** | 13p | 2 | 완전 |
| medium-insession | 0(자칭 성공) | 218s | $1.37 | **0/6 (로드 실패)** | 22p | 2 | schema.js 누락 |
| medium-loop | 1(자칭 실패) | 292s† | $1.75 | **6/6** | 37p | 4 | 완전 |
| complex-insession | 0(자칭 성공) | 320s | $1.34 | **0/9 (로드 실패)** | 33p | 2 | aggregate/retry/index 3개 모듈 누락 |
| complex-loop | 1 | 420s† | $2.29 | 0/9 (index.js 누락) | 49p | 5 | 6개 중 5개 모듈, 실패 지점 정확 보고 |

\* wall-clock은 야간 API 스로틀링으로 오염(wall ≫ api, 예: 68s api에 2034s wall) — API 시간만 유효.
† 실패 시점까지의 합(미완주 — 완주 시 더 커짐).

## 판정

**속도/토큰(이 repo의 1차 게이트): 루프 패배.** 비용 1.5–1.7×, API 시간 1.3–1.7× (fresh 세션 cold-start + 가드레일 재주입). in-session 컨트롤러의 상주 비용을 감안해도 열세.

**품질/정직성: 루프 압승, 그리고 이것이 진짜 발견.**
- in-session은 3판 중 2판(medium, complex)에서 **plan의 30–50%를 조용히 누락하고 exit 0 + "리뷰 승인"을 자칭**했다. 자체 테스트는 전부 green(자기가 만든 것만 테스트) — 숨긴 acceptance가 없었으면 발각 불가.
- 루프는 같은 상황에서 **정확한 실패 지점을 exit 1로 보고**했다(complex: task 3.2에서 정지). medium-loop은 구현이 실제로 완전(acceptance 6/6)한데도 보고 계약 위반으로 실패 선언 — false alarm이지만 fail-closed.
- 커밋 규율: 루프 4–5개(태스크당 1커밋 근접) vs in-session 일률 2개.

## 근본 원인 2건

1. **보고 파일 계약 미준수(루프의 아킬레스건):** 헤드리스 sonnet 구현 세션의 ~50%가 작업·커밋은 완료하고 report 파일 작성만 생략(stdout에 요약만). `parseReportStatus`가 null → 재시도/에러. 개선 방향: 커밋 존재 + 전체 스위트 green이면 보고 누락을 DONE_WITH_CONCERNS로 강등해 최종 리뷰가 게이트하게 하는 fallback, 또는 findings처럼 JSON 사이드카 계약.
2. **in-session의 조용한 부분 완료:** 컨트롤러가 그룹을 건너뛰거나 서브에이전트가 태스크를 흡수·축소해도 자체 리뷰가 plan 대비 완전성을 검증하지 않음. 방어는 최종 리뷰에 "plan의 태스크별 산출물 존재 확인" 체크리스트를 넣거나, 루프의 커밋-검증 개념을 in-session에도 이식하는 것.

## 결정 기록

- 게이트 판정: **속도·토큰 게이트 실패 → 기본 경로 승격 불가.** 단 opt-in 무인 실행 경로로서의 가치(정직한 실패, 재개성, compaction 무관)는 실증됨 — merge 여부는 사용자 판단.
- 재도전 조건(negative-record 규칙): 보고-계약 fallback(원인 1)을 구현하고, 동일 3-plan eval에서 (a) 루프 완주율 3/3, (b) 비용 격차 ≤1.2×를 통과할 것.
- wall-clock 기반 속도 비교는 무효(스로틀링) — 재실행 시 API duration만 채점하고 시간대 통제.
- **후속(같은 날): 슬림화로 sdd-loop 코드 제거.** 게이트 실패 + 유지보수 부채(코드 ~500줄, 문서 상시 토큰) 때문에 사용자 결정으로 본체 삭제. 루프의 결정론 검증 개념은 `plan-audit` + `pre-plan-audit.js`로 in-session 체인에 이식되어 존속(2026-07-18-plan-audit-gate-retrospective.md). 이 회고와 재도전 조건은 negative-record로 유지 — 재도전 시 이 커밋 이력에서 코드 복구 가능.
