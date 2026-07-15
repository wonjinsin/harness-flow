# Plan 문서 강등 회고 — spec이 Implementation Groups 흡수, brief는 dispatch 시점 저작

**날짜**: 2026-07-15 ~ 2026-07-16
**브랜치**: `worktree-plan-demotion`
**결론 요약**: 사용자의 원론적 의문("spec/plan 2문서 분리가 실제로 의미 있나")에서 출발. plan의 기능 3개(dispatch payload / 진행 추적 / 분해 기록)를 각자 더 나은 집(task-brief 라이브 저작 / ledger / spec 섹션)으로 이관하고 plan 문서를 폐지했다. A/B eval **전 게이트 충족**: 분해 산출물 −78.8%, 사용자 게이트 2→1, cheap 티어 품질 블라인드 동등(프로브 8/8 양측), decoy 누출 0, 인터페이스 불일치 처리는 NEW 우세(명시 해소 vs 조용한 정규화), 레거시 회귀 0(182/182). dispatch 경로 토큰은 초기 측정(§5-1)에서 NEW 불리로 보였으나 §7에서 측정 아티팩트로 정정 — 실경로는 대략 중립, 상세는 §7-3.

## 1. 배경 — 왜 이 변경인가

plan 문서의 존재 이유를 기능별로 해부하면 전부 대체재가 있었다:

| plan의 기능 | 더 나은 집 | 근거 |
|---|---|---|
| dispatch payload | dispatch 시점 저작 brief | plan 시점 예측 코드는 코드베이스 대비 낡는다 (pre-flight scan의 존재 이유). 라이브 저작은 이전 그룹들의 **실제 머지 코드** 기준 |
| 진행 추적 | ledger | 이미 ledger가 담당 |
| 분해 기록 | spec 내 `## Implementation Groups` 섹션 | 사람이 실제로 리뷰하는 것(그룹·Files·Interfaces·tier)만 남김 |

plan 사전 리뷰 게이트의 기능별 행방 분석(스펙 §7): coverage → 섹션 self-review + 리뷰어, type consistency → Interfaces verbatim 슬롯, placeholder → `brief-check`(결정론적 grep — size-classifier 교훈대로 LLM 판단 배제), 사람의 구조 검토 → 통합 문서 게이트. 유일한 순상실이던 placeholder 갭은 brief-check가 봉합.

## 2. 무엇을 만들었나

- **writing-plans**: 산출물이 별도 plan 문서 → spec에 append하는 `## Implementation Groups` 섹션 (그룹당 REQUIRED 슬롯: tier / Files / Interfaces verbatim). step 코드 블록 금지 — 그 정밀도는 Interfaces로.
- **사용자 게이트 1회 통합**: brainstorming의 spec 파일 리뷰 게이트 제거, writing-plans가 완성 문서(설계+분해)를 한 번에 리뷰받음.
- **SDD**: "Authoring the Group Brief" 신설 — 컨트롤러가 dispatch 직전 brief 저작, `scripts/brief-check`(exit 0/1/2, BSD awk 호환, 펜스 인지, 불균형 펜스 검출) 통과 후에만 dispatch. pre-flight scan은 레거시 plan 파일 전용으로 축소.
- **리뷰어 class 3분화**: `impl-fix`(구현↔brief) / **`brief-fix`(brief↔spec 섹션 — 컨트롤러가 brief 재작성, 사람 불필요)** / `plan-escalate`(spec 자체 결함 — 사람). brief-fix도 동일 `reviewCycles` 3캡에 합산.
- **하위 호환**: 레거시 plan 파일은 `task-brief` 추출 경로로 계속 실행 (테스트 불변 통과로 보증).
- 스킬 편집은 writing-skills 형태 규칙(조건문·필수 슬롯·recipe, 금지문 지양) 준수.

## 3. 평가 방법

execution-speedup 회고 §3 방법론 재사용 + 실구현 확장:

- **공유 입력에 시드**: decoy 2종(D1: `>` 미이스케이프 — 통상 관행과 반대라 뭉개기 쉬움 / D2: `TypeError` 메시지 정확히 `"empty tokens"`), 인터페이스 불일치 시드(`parse(text)` vs 실제 `tokenize(text)`).
- **arm 충실도**: OLD arm의 brief는 실제 메커니즘(task-brief 추출), NEW arm의 brief는 실제 메커니즘(NEW SDD 저작 절차 + brief-check). 구현은 양측 haiku, 동일 프롬프트.
- **정답 키를 실행 가능하게**: 판정단 이전에 8종 기능 프로브(probe.js)로 기능 동등을 결정론적으로 확정. 판정단은 잔여 품질 차원만.
- **블라인드 판정**: opus ×2 (구현 diff X/Y, 산출물 P/Q — 매핑 은닉), "equivalent도 정당한 verdict" 명시.

## 4. 결과

### 4-1. 결정론 지표 (헤드라인)

| 지표 | OLD | NEW | Δ |
|---|---|---|---|
| 분해 산출물 크기 | 10,916 B (별도 문서) | 2,314 B (spec 내 섹션) | **−78.8%** |
| 문서 수 / 사용자 게이트 수 | 2 / 2 | 1 / 1 | 각 −1 |
| 정답 키 프로브 (D1×3·D2·핵심 4종) | 8/8 | 8/8 | 동등 |
| decoy 누출 (산출물/구현) | 0/0 | 0/0 | 동등 |
| 레거시 회귀 | — | 182/182 | 없음 |

### 4-2. 블라인드 판정

- **구현**: equivalent (X 4/4/5, Y 4/4/5 — 상보적 테스트 커버리지, 상쇄).
- **산출물**: **Q(NEW) better** — 추적성 5:5, 다운스트림 충분성 5:5 동률; **불일치 처리 4:3** (NEW는 업스트림 계약을 명시 인용·해소, OLD는 조용한 정규화), **리뷰 가능성 5:3** (NEW는 결정만 노출 + 요구사항 번호 교차 참조, OLD는 결정이 기계 콘텐츠에 희석).

### 4-3. 합격 게이트 (스펙 §8)

전 5개 게이트 충족 (doc-cost 산술 감소 / cheap 품질 동등 / decoy 0 / consistency 사전 포착 / legacy 무회귀) → **채택**.

## 5. 교훈 / 정직한 한계

1. **비용은 사라지지 않고 이동·교환된다.** dispatch 경로 파이프라인 총 토큰(분해+brief)은 N=1에서 OLD 57.5k vs NEW 123.7k — brief 저작이 하류 신규 비용. 단 ① 이 런의 brief 저작자는 스킬 요구를 넘어 샌드박스에서 TDD 전 사이클을 재연(과잉 수행 교란 — 스킬은 저작+brief-check만 요구), ② 인라인 경로(≤3 태스크, 소형 standard 대부분)에는 brief 단계가 없어 절감이 무조건적, ③ 교환으로 얻은 것: 신선한 코드베이스 기준 코드, 명시적 불일치 해소, 리뷰 가능성, pre-flight scan 제거, drift 원천 제거. dispatch 경로에서 토큰 순증이 실측으로 문제 되면 brief 저작 절차에 "재연 금지, 저작+검사만" 경계를 명시하는 후속이 첫 후보.
2. **추출은 저작보다 취약하다 — 실측.** 본 세션 Group 2에서 task-brief가 중첩 펜스(5-backtick 래핑 콘텐츠)에 brief를 절단하는 실버그 발생(implementer가 플랜 원본 대비 복구). 저작 방식은 이 버그 클래스가 원천 부재. 강등 설계를 실행하는 도중에 강등의 근거가 실측된 아이러니.
3. **결정론 게이트가 LLM 게이트보다 싸고 강하다 — 재확인.** brief-check(grep)는 size-classifier 회고의 교훈(판단 기반 분기 회피)을 그대로 이식해 placeholder 갭을 0 판단 비용으로 봉합. 최종 리뷰가 찾은 2건의 실제 엣지(불균형 펜스 우회, todo 부분 문자열 오탐)도 전부 결정론 레이어 안에서 수리 가능했다.
4. **N=1 세션 지표는 헤드라인 불가** (size-classifier §3 재확인): 산술 지표(산출물 크기·게이트 수·문서 수)만 헤드라인, 토큰/시간은 참고치.
5. **미검증 영역**: most-capable 티어 그룹, 3+ 그룹 인터페이스 체인, plan-escalate/brief-fix 라우팅의 실전 발동(eval 시나리오는 클린 경로만 통과). 후속 실사용에서 관찰 대상.

## 6. 산출물

- 스킬: `writing-plans`(재작성), `brainstorming`(게이트 이동), `subagent-driven-development`(brief 저작 + brief-fix 라우팅), `task-reviewer-prompt.md`(class 3분화)
- 스크립트: `scripts/brief-check` 신규(+테스트 20종), `scripts/task-brief` 레거시 표기
- 문서: `CLAUDE.md`·`README.md` 체인 서술 갱신
- eval 원자료: 세션 스크래치패드 `eval/` (fixture, 양 arm 산출물, 프로브, 판정문) — 재현 절차는 §3

## 7. 부록 (2026-07-16) — 토큰 축 재채점과 재측정

사용자 기준 확정: **모든 변경의 목적은 속도 개선·토큰 절감** — 품질은 제약 조건이지 교환재가 아니다. 이 기준으로 §5-1을 재채점했다.

### 7-1. brief 저작 경계 추가 + 순응 재측정

SDD "Authoring the Group Brief"에 완료 조건 명시("brief-check exit 0 = done, 다음 행동은 dispatch 자체; 의심은 텍스트에서 해소"):

| 런 | brief 저작 tokens / s | 재연(과잉 수행) |
|---|---|---|
| baseline (경계 없음) | 78,402 / 279s | 샌드박스 TDD 전 사이클 재연 |
| 경계 v1 | 63,267 / 144s (−19% / −48%) | "brief 밖" 합리화로 부분 재연 |
| 경계 v2 (강화) | 67,934 / 170s | "격리 사본" 합리화로 부분 재연 |

문구 강화는 재연을 **줄였지만 제거하지 못했다** (fresh-agent 하네스에서 2/2 합리화 발생, v1↔v2 차이는 노이즈 수준). 루프홀 추격 중단 — 아래 7-2가 이유.

### 7-2. 측정 아티팩트 — eval이 잰 것은 실경로가 아니다

eval의 brief 저작자는 **신선 컨텍스트의 fresh agent**로, spec·섹션·레포를 처음부터 재구축하는 비용(~60–78k)을 문다. 실사용의 저작자는 **컨트롤러 본인** — 그 컨텍스트를 이미 보유한 메인 세션이며, 한계 비용은 brief 파일 출력(~8.4KB ≈ 2–3k tokens) + brief-check(0). OLD의 plan 작성도 같은 메인 세션이 10.9KB를 출력했으므로, **실경로의 dispatch 경로 토큰 델타는 대략 중립**이고, 여기에 게이트 1회 왕복·pre-flight scan·spec 재서술 제거가 NEW의 순감분이다. §5-1의 "57.5k vs 123.7k"는 측정 설계의 아티팩트로 정정한다 (산술 분석이며 실측 아님 — 실측하려면 컨트롤러 세션 델타 계측 필요).

### 7-3. 사용자 기준 최종 판정

- 인라인 경로: **PASS** (문서·게이트·왕복 순감 — 무조건).
- dispatch 경로: 토큰 **대략 중립** (7-2 산술), 속도는 게이트 왕복 1회·scan 제거만큼 우세, brief 저작이 컨트롤러 턴에 추가되는 만큼 상쇄. **순증 주장 철회, 순감 주장도 유보** — 실세션 계측이 후속 과제.
- 알려진 한계: fresh-agent 저작(예: 컨텍스트 압축 직후의 컨트롤러)은 60k급 비용이 실재하며, 경계 문구로도 과잉 수행이 완전히 억제되지 않는다.
