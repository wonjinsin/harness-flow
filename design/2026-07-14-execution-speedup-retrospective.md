# 실행 속도 개선 회고 — 리뷰 gating + retry gating

**날짜**: 2026-07-14
**브랜치**: `worktree-execution-speedup`
**결론 요약**: SDD 실행 단계의 잔여 병목(그룹 경계마다 도는 직렬 리뷰 루프)을 병렬화 없이 공략했다. cheap 그룹 리뷰어 스킵 + 못 고칠 finding 조기 에스컬레이션 + 재리뷰 3회 캡. A/B dry-run(escalate/stubborn/decoy/control × OLD/NEW + 블라인드 판정)에서 **전 합격 게이트 충족** — 구조 카운트 유의 감소, 품질 동등(미끼 0 누출), standard 컨트롤 무변화, retry 경로 정상 발동. release 후보.

## 1. 배경 — 왜 이 변경인가

`execution-granularity-analysis.md`의 권고 ①(Task Group 코어스닝)·③(인라인)·④(모델 티어링)와 trivial 티어가 이미 shipped된 뒤에도 실행이 느렸다. 진단: 잔여 병목은 dispatch 세분화가 아니라 **매 그룹 경계의 `리뷰 → fix → 재리뷰` 루프 + 최종 리뷰가 전부 직렬**. SKILL.md 자신이 "최종 리뷰 fix wave가 전체 task보다 비쌀 수 있다"고 경고. 병렬화(⑤)는 이 직렬 비용을 크리티컬 패스에서 못 없앤다(동시 실행일 뿐) — **gating은 일을 아예 없애 크리티컬 패스에서 제거**하므로 잔여 병목엔 직격이고 리스크도 낮다(worktree-per-agent 격리 불필요).

## 2. 무엇을 만들었나

- **리뷰 gating (변경 1)**: 기존 그룹 tier 신호(`cheap`)를 재사용 — cheap 그룹은 그룹 리뷰어 dispatch를 스킵하고 최종 whole-branch 리뷰가 net. 스킵 그룹을 최종 리뷰 dispatch에 명시. 새 메타데이터 0.
- **retry gating (변경 2)**: 리뷰어가 finding을 `impl-fix`/`plan-escalate`로 분류. `plan-escalate`(스펙/plan 자체가 틀림) → fixer 안 돌리고 즉시 사람. `impl-fix` → fix→재리뷰 루프, **3회 캡**, `reviewCycles`를 ledger에 영속화(재시작해도 상한 유지).
- 스킬은 `writing-skills` 경유 conditional/structural 형태로 편집(discipline-under-pressure가 아니므로 금지문구 대신 조건문·필수슬롯).

> **주의(2026-07-14 이후):** 원래 이 작업엔 3번째 변경인 **fmt Stop 배칭**(`post-edit.js`/`stop-fmt.js`)이 포함됐으나 사용자 요청으로 브랜치에서 제거됨. 이 회고의 평가는 리뷰 gating·retry gating에만 유효하다.

## 3. 평가 방법 (size-classifier 방법론 재사용)

- **구조 카운트는 산술로**(advisor): 리뷰어 dispatch 수는 그룹 tier 구성에서 결정적으로 나오므로 시뮬레이션 불필요. dry-run은 시뮬레이션이 값을 버는 두 가지 — retry gating *동작* + *품질 동등* — 에만 투자.
- **A/B dry-run**: 4 시나리오 × 2 arm(OLD=commit a9a6632 스킬 / NEW=브랜치 HEAD 스킬). 각 arm은 신선 컨텍스트에서 해당 버전 스킬 파일만 읽고 SDD 컨트롤러가 그 규칙대로 시나리오를 처리하는 트레이스를 구조화 반환.
- **블라인드 판정단**: opus, 익명 X/Y(시나리오 id 패리티로 OLD/NEW 매핑 은닉) + 숨긴 정답 키로 프로세스 안전성·결함 누출만 판정.
- **토큰은 세션 델타로 모델링**(§측정 주의): dry-run 토큰 N=1은 `size-classifier §3`대로 비신뢰 → 헤드라인은 세션/dispatch 델타.

## 4. 결과

### 4-1. 구조 카운트 (산술, 결정적 — 헤드라인 속도 지표)

| 시나리오(플랜) | 리뷰어 dispatch OLD | NEW | Δ |
|---|---|---|---|
| cheap (3 cheap 그룹) | 3 | 0 | **−3** |
| mixed (cheap 2 + std/mc 2) | 4 | 2 | −2 |
| standard (컨트롤, 3 std) | 3 | 3 | 0 |
| decoy (3 cheap 그룹) | 3 | 0 | **−3** |

- 제거된 리뷰어 dispatch마다 그에 딸린 fix→재리뷰 cold-start도 함께 제거된다(최종 리뷰는 양 arm 공통 1회, 미집계).

### 4-2. A/B dry-run + 블라인드 판정

| 시나리오 | OLD 동작 | NEW 동작 | 판정단 |
|---|---|---|---|
| escalate | reviewer→plan-escalate→사람(0 rounds) | 동일 | equivalent, 품질동등 |
| **stubborn** | fixer 루프 **무한(rounds=−1), 에스컬레이션 없음** | impl-fix→**3회 캡→사람** | **NEW 안전(Y)**, 품질동등 |
| **decoy(품질가드)** | G3 리뷰어가 swallowed error 포착 | G3 리뷰어 **스킵(cheap)**→**최종 리뷰가 net, 머지 안됨** | equivalent, **누출 0** |
| control | 3그룹 전부 리뷰 | 동일, 무변화 | equivalent |

### 4-3. 합격 게이트

| 조건 | 결과 | 판정 |
|---|---|---|
| 리뷰어 dispatch·사이클 유의 감소 | cheap 3→0, mixed 4→2, decoy 3→0; stubborn 무한→캡 3 | 충족 |
| 품질 동등 (NEW 누출 ≤ OLD, 미끼 0) | 전 시나리오 parity, decoy 양 arm 0 누출 | 충족 |
| standard 컨트롤 무변화 | control equivalent | 충족 |
| escalate/cap 경로 정상 발동 | stubborn 캡 발동+에스컬레이션, escalate 에스컬레이션 | 충족 |

**전 조건 충족 → 채택.**

## 5. 교훈 / 정직한 한계

- **stubborn이 결정적 승리**: OLD는 수렴 안 하는 fixer에 **무한 루프**(liveness 실패 — 종료도 사람 알림도 없음). NEW의 캡은 속도뿐 아니라 **안전(종료 보장)** 개선이다. 리뷰 루프에 상한이 없던 것이 실제 위험이었음이 시뮬레이션으로 드러남.
- **decoy — gating은 커버리지를 안 잃되 포착 시점이 뒤로 밀린다**: NEW는 cheap G3 리뷰어를 스킵하지만 최종 리뷰가 결함을 잡아 **머지 전 차단**(누출 0). 단 OLD는 G3 경계에서 더 *일찍* 잡는다. gating은 "포착을 최종 리뷰로 지연"하는 트레이드오프 — 최종 리뷰가 스킵 그룹을 명시적으로 커버하도록 강제한 것이 안전망의 핵심. 최종 리뷰 자체가 부실하면 이 net이 약해지므로, 스킵 그룹 명시 지침을 약화하면 안 된다.
- **측정 주의(보존)**: dry-run 토큰(405k)은 *eval 비용*이지 기능의 런타임 비용이 아니다 — 혼동 금지. wall-clock은 직접 주장하지 않음(`size-classifier §1`: 코어스닝은 토큰 −58%에도 wall-clock +22~63%였음). 단 이번은 세션을 *제거*(코어스닝은 *키움*)라 방향은 감소로 예상 — 세션/dispatch 델타를 대리지표로 본다.
- **실측 spot-check**: 진짜 OLD-vs-NEW end-to-end SDD 런은 N=1·환경 종속이라 헤드라인으로 쓰지 않고 방법만 기록. 세션 카운트 모델이 더 방어 가능(각 리뷰어 세션 = cold-start 재로드).
- **블라인드 판정 견고성**: 한 판정 rationale이 라이브 master를 직접 확인해 OLD에 캡이 없음을 교차검증 — 시뮬레이션 트레이스가 실제 스킬 텍스트와 일치함을 뒷받침.

## 7. 실측 A/B eval (dry-run 후속 — sonnet, 실제 dispatch)

dry-run(§3~4)의 "누출 0"은 *시뮬레이션 주장*이었다. 이를 **실제 리뷰어 subagent(sonnet)로 실측**해 검증하고, 모델링했던 토큰/시간을 **측정치로 교체**했다.

**설계 (advisor 검토):** 변경을 리스크 유형별로 분해 — retry 캡은 by-construction 안전(캡→사람 에스컬레이션, human-in-loop은 시스템 누출이 될 수 없음) → 캡 발동만 확인; **리뷰 gating만이 유일한 실제 누출 리스크** → 여기에만 반복 실측 투자. 결정은 단 하나의 지표로 붕괴한다:

> **R_group**(OLD의 focused 그룹 리뷰어가 cheap 그룹 seeded 결함을 잡나) vs **R_final**(NEW의 whole-branch 최종 리뷰가 *같은* 결함을 full diff에 묻힌 채 잡나).

**Fixture:** pricing 모듈, 3그룹(cheap 2 + standard 1), cheap Group 1에 결함, happy-path만 테스트 → 9/9 green, 결함 잠복. 실제 `scripts/review-package`로 focused(G1)·whole 패키지 생성.

**결함 클래스 2종으로 나눠 측정한 이유(advisor):** 위반된 요구사항을 리뷰어 프롬프트에 *복원해 넘기면* 포착은 diff에서의 *발견*이 아니라 **checklist 매칭**이 되고, diff dilution이 이를 못 떨어뜨려 R_final이 1.0에 고정된다 — 누출이 사는 영역(R_group>R_final)을 관측하지 못한다. 그래서 두 클래스로 나눴다.

### 7-1. 품질 게이트 (crux)

**Round 1 — spec-위반(checklist)**: parseAmount가 invalid에 throw 대신 0 반환(요구사항 **복원**). CAUGHT = swallow를 Critical/Important 지적. N=4/arm.

| arm | diff | catch |
|---|---|---|
| R_group (OLD 그룹리뷰, NEW가 제거) | 58줄 | **4/4 = 100%** (전부 Critical) |
| R_final (NEW 최종리뷰, 양 arm 공통) | 185줄 | **4/4 = 100%** (전부 Critical) |

이 라운드는 비-discriminating(checklist라 dilution 무력). 단 *심지도 않은* 진짜 버그(`taxRates.js`의 `in`이 `Object.prototype` 매칭 → 잘못된 에러 타입)를 R_final이 **1/4만** 포착 — 이게 discriminating register(발견형)임이 드러남.

**Round 2 — discovery-class(발견형)**: parseAmount가 `parseFloat` 사용 → trailing garbage 조용히 수용(`'12abc'`→1200, `'1,234.50'`→100). 요구사항엔 **안 적음** → 리뷰어가 코드에서 발견해야 함. CAUGHT = parseFloat leniency 지적. N=6/arm.

| arm | diff | catch |
|---|---|---|
| R_group (focused) | 52줄 | **6/6 = 100%** (5 Important + 1 Critical) |
| R_final (buried) | 179줄 | **6/6 = 100%** (전부 Important) |

- **핵심:** dilution(52→179줄)이 발견형 결함 포착을 **안 떨어뜨렸다**. 묻힌 whole-branch 최종리뷰가 focused 그룹리뷰만큼 잡음. 사전 등록 결정규칙 R_group≈R_final → **gating은 발견형 결함도 안전**.
- **누출 판정:** 두 클래스 통틀어 NEW 잔여 누출 = 1 − R_final = **0/10**. 시뮬레이션이 아니라 실측.
- **보수성:** prod는 최종리뷰를 opus(최상위)로 돌린다. sonnet 측정 R_final은 **하한** → 실제 누출 ≤ 측정된 0.
- **정직한 한계:** sonnet 리뷰어가 두 클래스 모두 100% 잡을 만큼 강했다. R_final<1로 누출이 관측되려면 결함이 저 초-미묘 프로토타입 버그(1/4) 수준이어야 하는데, 그건 cheap-tier 복잡도를 넘는다. 즉 gating의 net(최종 whole-branch 리뷰)은 **cheap-tier 현실 결함엔 견고**하고, 그보다 미묘한 결함은 OLD 그룹리뷰도 놓치는 경우가 많으며 prod opus면 더 강해진다.

### 7-2. 토큰·시간 (실측, sonnet, dispatch당 `subagent_tokens`+`duration_ms`, cheap-그룹 리뷰어 N=10)

NEW가 cheap 그룹당 제거하는 리뷰어 세션 1개 비용: **토큰 ~36.6k 중앙값**(34–39k, 타이트) / **wall-clock ~48초 중앙값**(20–72초, 결함 난이도 의존 — 노골적 Critical ~25초, 미묘한 발견형 ~55초). 결정적 K를 곱하면(dispatch는 크리티컬 패스에서 직렬 → K×세션 = 크리티컬 패스 감소):

| 플랜 | 제거 세션 | 토큰 절감 | wall-clock 절감(중앙값 기준) |
|---|---|---|---|
| cheap (3 cheap) | 3 | ~110k | ~144초 (~2.4분) |
| mixed (2 cheap) | 2 | ~73k | ~96초 (~1.6분) |
| standard (컨트롤) | 0 | 0 | 0 |

(모델링 §4-1을 **측정치로 교체**. 토큰은 타이트, wall-clock은 분산 큼 → 중앙값+범위로 보고. 총 SDD 시간이 아닌 *리뷰 단계* 절감이며 구현자 세션은 불변.)

- **retry 캡(결정적):** `reviewCycles` 캡 3 → 사람 에스컬레이션. 코드+SKILL.md에 영속, 재시작해도 유지.

### 7-3. 결론 (3그룹)

R_group = R_final = 100% — checklist 결함(N=4)과 발견형 결함(N=6) **둘 다**, dilution 있어도. 실측 누출 0/10.

### 7-4. 6그룹 스케일 검증 + full end-to-end (dilution 6.5×)

3그룹 dilution(3.5×)만으로는 "그룹 많은 대형 플랜(이 기능이 가장 이득인 영역)"의 품질을 못 말한다는 지적(advisor)에 따라 **6그룹 플랜**(cheap 4 + std 2, G1에 동일 parseFloat 결함)으로 확장. whole diff 337줄 → G1 결함 dilution **52→337 = 6.5×**.

- **품질(결정적):** R_final(6그룹) = **6/6 = 100%** (N=6, sonnet). 사전 등록 임계값 ≥5/6 → **ship 확정 at scale.** dilution 3.5×→6.5× 늘려도 포착 안 떨어짐. 오히려 6그룹 리뷰어들이 *심지도 않은* 진짜 버그(`applyDiscount(cents,NaN)`→NaN 5/6, `taxRates` `in` 2/6)까지 잡음 — 스케일 커져도 net이 약해지긴커녕 강해짐.
- **full end-to-end (실측 세션 × 결정적 카운트):** 구현자(haiku cheap ~25.7k/21s, sonnet std ~36.8k/41s)·fixer(sonnet 38.4k/75s, parseFloat 실제 수정 커밋 fc91b1a) 모두 실제 dispatch로 실측.

| 단계 | OLD | NEW | Δ |
|---|---|---|---|
| 구현 (공유) | 176k / 2.8분 | 176k / 2.8분 | 0 |
| **리뷰 단계** | 343k / 8.7분 | 209k / 6.6분 | **−39% tok / −24%** |
| **전체(구현+리뷰)** | 520k / 11.5분 | 385k / 9.4분 | **−26% tok / −18%** |

- **total이 효과를 과소평가:** 구현자는 불변·공유라 전체 −26%지만 기능이 실제 건드리는 리뷰 단계는 −39%.
- **fix-wave(새 신호):** G1 결함을 OLD는 조기(G1 경계)·NEW는 늦게(최종리뷰) 잡지만, **수정은 양쪽 다 parseAmount에 국한**(fixer가 그 파일+테스트만, 19/19 pass). 늦은 포착이 더 큰 재작업을 안 만듦 — advisor 예측 확인.
- **N 주의:** 세션 실측 × 카운트 조립(단일 N=1 스톱워치 아님). final review 분산 큼(95–202초), 구현 std·fixer는 N=1.

### 7-5. 결론

**SHIP (3그룹·6그룹 모두 확정).** 품질 누출 0(10/10 + 6/6), full-task 토큰 ~26%·시간 ~18% 감소, 리뷰 단계 토큰 ~39% 감소. prod opus 최종리뷰면 net 더 강함. 산출물·판정기준·원시 수치: 스크래치패드 `eval2/{DESIGN,results,results2}.json`, `eval3/{PREREG,results3}.json`.

## 8. 관련 자료

- 스펙: `docs/harness-flow/specs/2026-07-14-execution-speedup-design.md` (워크트리 로컬, gitignored)
- 플랜: `docs/harness-flow/plans/2026-07-14-execution-speedup.md` (동일)
- 평가 시나리오·정답 키·결과: 세션 스크래치패드 `eval/{scenarios,results}.json` (본문 §3~4에 요약 보존), Workflow `wf_896d55f6-cff`
- 선행 분석: `design/execution-granularity-analysis.md` (§Status 2026-07-14)
