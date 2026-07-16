# Review Gating v2 회고 — 위치 게이팅 · 최종 리뷰 티어링 · verify-fix 재리뷰 (streak 게이팅은 음성)

**날짜**: 2026-07-16
**브랜치**: `worktree-review-gating-v2` (release 1.1.8)
**결론 요약**: 1.1.7 복귀 직후, 회고들이 지목한 진짜 토큰 레버("게이팅 정책, 문서 구조 아님")를 직접 공략. 사용자 게이트(속도·토큰 **양축 동시 개선**, 품질은 하드 제약) 하에 5개 변경을 구현하고 사전 등록 eval로 각각 판정 — **4개 채택**(P1 위치 게이팅 / P3 all-cheap 최종 리뷰 sonnet / P2 verify-fix 재리뷰 / P4 A-lite 슬리밍), **1개 폐기**(P5 zero-finding streak 게이팅 — E5 게이트 미달, size-classifier·section-only와 같은 지위의 음성 기록). 제안 0(fence-aware task-brief cherry-pick)은 사용자 지시로 제외됨 — 재제안 금지.

## 1. 채택된 변경 (1.1.8)

| ID | 변경 | 판정 신호 (전부 기계적) | 양축 델타 |
|---|---|---|---|
| P1 | **마지막 그룹은 tier 무관 그룹 리뷰어 스킵** — 최종 리뷰가 net (brief 첨부, spec-compliance 승계) | 그룹 위치 | −40~45k tok/기능 (무조건), 직렬 세션 1개 (28~149s + cold-start) |
| P3 | **all-cheap plan의 최종 리뷰를 opus→sonnet** | plan의 tier 라벨 카운트 | −18k tok, −110~217s (해당 plan 한정) |
| P2 | **재리뷰를 verify-fix 변형으로** — open findings + fix-diff만 | 재리뷰 여부 | 패키지 −74% 실측(655B vs 2,534B), 발동 조건부 |
| P4 | **Example Workflow → references/, Advantages 삭제** | — | SKILL.md 4,207→3,933단어 (−274/호출) |

P1의 핵심 산술: 기존 cheap 게이팅의 트레이드오프("포착 시점이 최종 리뷰로 지연")가 마지막 그룹에서는 **정의상 0** — 최종 리뷰가 바로 다음이고 하류 그룹이 없다. 게이팅 확장 중 유일하게 "지연 비용 없는" 지점.

## 2. 평가 (사전 등록, 실 dispatch)

방법: pricing fixture 5변형(각각 독립 git repo, 3그룹 커밋, 결함은 브리프 미기재 discovery-class, 전 변형 테스트 green으로 결함 잠복), 리뷰어 실 dispatch sonnet(prod opus 대비 보수적 하한), 판정 sonnet 저지 + **컨트롤러 원문 수동 재판정**. 게이트는 결과 관측 전 PREREG.md에 고정.

| ID | 시나리오 | 결과 | 게이트 | 판정 |
|---|---|---|---|---|
| E1 | 마지막 그룹에 결함(미지 region 무음 0-tax), 최종 리뷰가 잡나 | **6/6** | ≥5/6 | P1 채택 |
| E2 | all-cheap + sonnet 최종 리뷰(parseFloat trailing garbage) | **4/4** | ≥3/4 | P3 채택 |
| E3a | 불완전 fix를 verify-fix가 unresolved로 잡나 | **4/4** (전원 fixer의 허위 "해결" 주장까지 적발) | ≥3/4 | P2 채택 |
| E3b | fix가 공유 round 헬퍼를 floor로 파손 — 최종 리뷰가 net하나 | **4/4** (전부 Critical) | ≥3/4 | P2 채택 |
| E5 | 중간 그룹 결함(rate 문자열 강제변환), streak 스킵 후 최종 리뷰가 잡나 | **6/8 Important, 2/8 Minor 강등** | ≥5/6 | **P5 폐기** |

## 3. P5가 진 이유 — severity 강등이라는 새 실패 모드

E5의 miss 2건은 블라인드 미스가 아니라 **강등**이다: 리뷰어가 결함을 발견하고도 "type-contract nit, not a correctness bug"로 Minor 처리. E1(무음 0-tax)·E2(금액 파싱)는 돈이 틀리는 서사가 명확해 6/6·4/4인데, E5(rate 타입 계약 위반)는 심각도 판단이 갈렸다. 교훈:

1. **최종 리뷰 net의 강도는 결함의 "서사 명확도"에 의존한다.** 발견율(§speedup 7의 100%)만 보고 게이팅을 확장하면, 발견돼도 Minor로 흘러 머지되는 결함 클래스가 생긴다. 중간 그룹 스킵(streak)은 이 리스크에 노출 — 마지막 그룹 스킵(P1)은 같은 리뷰가 잡되 지연·전파가 0이라 노출이 다르다 (E1 6/6이 방증).
2. **저지도 틀린다 — 원문 수동 재판정 필수.** sonnet 저지 1건이 evidence("Minor로 강등됨")와 모순되는 caught=true를 반환. journal 원문 8건을 수동 재판정해 6/8로 확정했다. 자동 카운트만 믿었으면 P5가 5/6 "통과"로 출하됐다. (writing-skills "manually read every flagged match"의 실전 재확인.)
3. **API 오류 재실행이 표본을 늘리면, 전 관측치를 계상한다.** 1차 런에서 리뷰어 4건이 연결 오류 → resume 재실행. 일부 rep이 이중 관측돼 표본이 8이 됨. 유리한 6개만 고르는 것은 plan-demotion §8이 적발한 비대칭 처리와 동일 — 전량 계상(6/8)으로 판정했다.

## 4. 결정론 산술 (헤드라인)

- 리뷰어 dispatch 수 (plan 구성별): std 3그룹 3→2 (P1), mixed 4그룹(c,s,c,s) 2→1, all-cheap 0→0+최종 sonnet. §9 실사례(n=3 std, 리뷰 130.6k)에 P1 적용 시 −41.1k (−31%).
- verify-fix 패키지: 655B vs 풀 2,534B (−74%), E3 fixture 실측.
- SDD SKILL.md: 4,207→3,933단어 (−274, 호출·compact 재로드당). task-reviewer-prompt +199단어(재리뷰 시에만 읽힘). references/example-workflow.md 459단어(온디맨드).
- 사람 게이트: 불변 (이 변경들은 사람 대기 축에 중립 — 정직 고지).

## 5. 비용·한계

- eval 비용: workflow 2런 subagent 합 ~2.7M tok (48 에이전트; 리뷰어 24+재실행, 저지 24). 기능 자체의 런타임 비용 아님 (speedup §5 구분 유지).
- E1~E3 전부 sonnet 하한 측정 — prod 최종 리뷰(opus)면 net은 더 강함. 단 P3 경로는 sonnet이 prod이므로 E2가 곧 prod 측정.
- 미검증: most-capable 그룹이 마지막인 plan의 P1 실전 발동, verify-fix의 실전 reviewCycles 수렴 양상. 실사용 관찰 대상.
- 세션 실책 2건 (재발 방지): ① 컨트롤러가 ledger를 수동 mkdir로 만들면 self-ignore가 없어 `git add -A`에 커밋됨 — `scripts/sdd-workspace` 경유가 정답 (CLAUDE.md에 반영). ② `git reset --hard`는 권한 정책 차단 — drop은 역편집 커밋으로.

## 6. 산출물

- 스킬: `subagent-driven-development/SKILL.md`(게이팅 v2 + Model Selection 예외 + 루프 문구), `task-reviewer-prompt.md`(verify-fix 변형), `references/example-workflow.md`(신규, cheap 그룹이 리뷰받던 기존 예시 모순도 수정)
- 문서: `CLAUDE.md` 체인 5단계·pre-agent-model 주석 동기화
- eval 원자료: 세션 스크래치패드 `eval/`(PREREG, fixtures 5 repo, 패키지, arithmetic.md), workflow `wf_6548625f-694` journal
- 버전: 1.1.8 (plugin ×2 + marketplace)
