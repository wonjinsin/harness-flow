# 회고: group 리뷰 전면 폐지 + severity floor (final-only review)

**날짜**: 2026-07-16
**브랜치**: `worktree-review-removal-final-only` (release 1.3.0)
**결론 요약**: 오늘 오전 폐기된 P5(중간 group 스킵, E5 6/8 미달)의 상위집합 재도전. P5의 실패 모드(발견 후 Minor 강등)를 **severity floor 블록**으로 직접 방어하고 사전등록 eval로 재측정 — **6/6 포착, 강등 0건, 게이트(≥5/6) 통과**. group 경계 리뷰어는 전면 폐지되고 final whole-branch review 하나가 전 group을 net한다.

## 1. 변경 (1.3.0)

| 대상 | 변경 |
|---|---|
| `sdd/SKILL.md` | Review Gating 섹션 삭제 → `Final Review Nets Every Group` (전 group brief 전달 + severity floor 블록 + finding-class 블록, 전부 dispatch prompt 삽입 — `code-reviewer.md` 템플릿 무오염). Review Loop → `Final Review Loop` (ONE fixer → verify-fix, cap 3, `final: reviewCycles` ledger 키, plan-escalate → 사람) |
| `sdd/task-reviewer-prompt.md` | verify-fix 전용 템플릿으로 재목적화 (description `Verify fix wave (final re-review)` — `pre-agent-model.js` 의도적 미커버: 모델 누락 시 세션 모델 상속 = 리뷰가 원하는 티어, fail-safe) |
| `sdd/references/example-workflow.md` | final-only 흐름으로 재작성 |
| `CLAUDE.md`, plugin manifests | chain 5번 항목 재기술, 1.1.9 → **1.3.0** (1.2.x는 plan-demotion revert로 소진) |
| 무변경 | `implementer-prompt.md`, hooks 전체, tests, scripts, inline path, pre-flight scan, 모델 티어링(P3 all-cheap→sonnet final 포함) |

## 2. 왜 P5 폐기 당일 재도전이 성립하는가

P5(zero-finding streak 게이팅)는 **무방비 스킵**이었다: E5에서 최종 리뷰가 중간 group 결함을 8회 중 2회 "type-contract nit, not a correctness bug"로 Minor 강등 → 6/8 < 게이트. v2 회고 §3의 교훈이 "최종 리뷰 net의 강도는 결함의 서사 명확도에 의존한다"였고, 이 변경은 그 서사 의존성을 프롬프트 레벨에서 제거한다: **"Rate severity by consequence, not by surface form … A Minor rating on such a finding requires a one-line justification"**. writing-skills의 form-매칭으로는 prohibition이 아니라 positive recipe + REQUIRED slot — 강등이라는 "판정 형태 오류"에 맞는 형식.

## 3. 사전등록 eval (P5의 E5 동형, 처치만 추가)

- **PREREG**: 세션 스크래치패드 `eval/PREREG.md`, 결과 관측 전 고정.
- **Fixture** (E5-replica, discovery-class type-contract, brief 미기재, 전 테스트 green으로 잠복):
  - fixture-a: `loadRate`가 config에서 rate를 **문자열**로 반환 → `applyDiscount(subtotal, rate)`의 `rate: number` 계약 위반. 암묵 강제변환으로 정답 산출.
  - fixture-b: `parseItems`가 qty를 **문자열**로 반환 (brief: "qty an integer") + 마스킹 테스트(`qty * 1 === 2`).
- **처치**: final review dispatch = 리뷰 패키지 + 전 group brief 3개 + severity floor 블록 + class 블록, 리뷰어 **sonnet** (prod opus 하한), n=6 (fixture당 3 rep).
- **판정**: sonnet judge + 컨트롤러 원문 수동 재판정 전 rep (v2 §3.2 관례) — 양자 완전 일치.

| rep | fixture | 결과 | severity | 위치 정확도 |
|---|---|---|---|---|
| 1 | a | 포착 | Important (impl-fix) | discount.js:14 loadRate |
| 2 | a | 포착 | Important (impl-fix) | discount.js:11-14 (+cross-group 명시) |
| 3 | a | 포착 | Important (impl-fix) | discount.js:16 |
| 4 | b | 포착 | Important (impl-fix) | parse.js:4-9 (+테스트 마스킹 지적) |
| 5 | b | 포착 | Important (impl-fix) | parse.js:6-7 (+테스트 완화 지적) |
| 6 | b | 포착 | Important (impl-fix) | parse.js:4-9 (+마스킹 지적) |

**TALLY 6/6, Minor 강등 0, 게이트(≥5/6) 통과.** E5(무floor) 6/8 → floor 6/6: 강등 2건이 정확히 사라졌다. 부수 관찰: 6 rep 중 3개가 심지 않은 것까지 짚었다(마스킹 테스트, NaN 가드 우회 시나리오) — brief 첨부가 spec-compliance 승계로 실제 기능함.

## 4. 결정론 산술

- 리뷰어 dispatch (plan 구성별, 1.1.8 대비): std 3그룹 2→0, mixed 4그룹(c,s,c,s) 1→0, all-cheap 0→0 (불변). v2 §9 실사례(n=3 std, 리뷰 130.6k tok) 기준 그룹 리뷰 전량 제거 시 **−130.6k tok**과 직렬 리뷰 세션 2개(각 28~149s + cold-start) 소멸.
- 사용자가 지목한 핵심 pain("group 리뷰가 너무 오래 걸림") = 직렬 그룹 리뷰 대기 자체가 0으로.
- 사람 게이트: 중립~후행화 (findings가 final에 몰림) — 정직 고지. fix 반경 확대 리스크는 ONE fixer + verify-fix cap 3이 상한.

## 5. 한계·미검증

- **sonnet 하한 측정** — prod final review는 opus(비 all-cheap plan)이므로 net은 더 강할 것. all-cheap 경로(P3)는 sonnet이 prod → 본 측정이 곧 prod.
- **most-capable 결함 클래스 미대변**: fixture는 type-contract 클래스. 설계 판단 결함(아키텍처 오선택)의 강등 내성은 미측정 — spec 리스크 절 그대로.
- **포착 지연 비용 미측정**: 결함이 final까지 잠복하며 하류 group이 그 위에 쌓는 전파 비용은 E5/본 eval 모두 측정 밖 (포착률만 측정).
- eval 비용: 리뷰어 6 + judge 1 dispatch, subagent 합 ~257k tok (기능 런타임 비용 아님).
- 세션 실책: Group 3 implementer가 API 오류로 report 미작성 사망 — 산출물은 전부 존재해 컨트롤러가 직접 검증 후 진행 (ledger에 명기). 재발 시 동일 절차.

## 6. 계보

superpowers(task당 2 dispatch) → 46386f0 group 코어스닝 → 1.1.8 gating(cheap+last) → **1.3.0 전면 폐지 + severity floor**. 6-harness 조사(`design/2026-07-09-execution-granularity-analysis.md`)에서 실행 중간 per-group AI 리뷰를 하는 harness는 superpowers 계열뿐이었다 — 본 변경으로 harness-flow도 "경계 리뷰 1회 + 게이팅/방어" 진영(GSD/gstack/OMC)에 합류하되, brief 승계와 severity floor라는 자기 것을 얹었다.
