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

## 8. 부록 (2026-07-16) — 832eb5e vs 1.2.1 심층 평가 (dynamic workflow)

사용자 지시로 수행한 최종 keep/revert 판정. 방법: 신선 시나리오(duraparse)
실측 런(생산자 2 arm + haiku 구현 4 reps, 프로브 12/12 전원 통과) + sonnet
workflow 8 에이전트(변경 감사 / 산술 검증 / 블라인드 판정 2 / 실패 모드
분석 / 적대 검증 2 / 종합).

**판정: keep with follow-ups (confidence: medium).**

- **토큰: 미입증.** 실경로 산술로 NEW는 분해를 두 번 쓴다(섹션 ~0.7k +
  그룹당 brief ~2–3k) vs OLD 단일 plan ~2.7k — 1그룹이면 대략 비김,
  다그룹이면 구조적으로 불리하며 n≥3그룹 실측은 없음. 스킬 텍스트 순증
  (+454 단어)도 매 호출 비용. "토큰 절감" 주장은 소형 단일 그룹의 문서·
  게이트 수 감소로 축소된 형태만 생존.
- **속도: 부분 입증.** eval1은 교란 없는 순수 승리 (생산자 305→229s,
  구현 94→80s, 게이트 2→1, pre-flight 제거). eval2의 생산자 비교는
  **비대칭 과잉수행 처리로 오염** (OLD의 과잉수행 런은 헤드라인에 포함,
  NEW의 것은 경계 추가 후 재측정으로 교체) — 적대 검증이 정확히 적발.
- **품질: 유지, 주 경로에선 개선.** 판정 동등~우세 + 실패 모드 비대칭이
  결정타: **1.1.7로 되돌리면 task-brief의 무신호 절단 버그(실발동 이력)가
  기본 경로로 복귀** — 1.2.1의 최악 실패 모드(시끄럽고 복구 가능)보다
  엄격히 나쁨. revert는 품질 중립이 아니다.

### 신규 발견 (감사가 적발, 기존 회고 미인지)

1. `brief-check` 펜스 파서 버그 2건 (실행 재현됨): 들여쓴 펜스 미인식
   (false-positive 거부), backtick 개수 무시 중첩 오토글. 둘 다 fail-safe
   (좋은 brief를 막는 방향)지만 불필요한 재작성 사이클 = 토큰 근거 잠식.
2. `brief-fix` class가 레거시 경로에 대한 명시 스코프 없음 (우연히 무해).

### Follow-ups (우선순위순)

1. **재검토 트리거**: n≥3그룹 실기능을 인컨텍스트 컨트롤러 계정으로 실측 —
   다그룹 토큰이 명확히 불리하면 revert 재상정.
2. **cheap 티어 리뷰 갭 봉합**: 저작 brief 경로에선 그룹 리뷰어 스킵을
   해제 (스킵은 사용자 승인 텍스트를 verbatim 추출하는 레거시에만) —
   품질이 실제로 후퇴할 수 있는 유일 지점.
3. brief-check 펜스 파서 수리 (들여쓰기·backtick 개수 인지).
4. eval2 생산자 비교를 대칭 조건으로 재실행.
5. 스킬 텍스트 순증을 토큰 모델에 산입.
6. brief-fix class의 경로 스코프 명문화.

## 9. 부록 (2026-07-16) — follow-up 1·2·3 실행 결과 (release 1.2.2)

사용자 지시로 follow-up 1–3을 실행. 2·3의 구현 자체를 3그룹 spec으로 구성해
그 실행을 follow-up 1의 "n≥3그룹 실기능 인컨텍스트 계정" 실측 대상으로 사용.

### Follow-up 3 — brief-check 펜스 파서 수리 (완료)

단일 awk 상태 머신으로 재작성: 열림 = 선행 공백 + backtick ≥3 (길이 기록),
닫힘 = backtick ≥ 열림 길이 + 공백 잔여만 (CommonMark 길이 규칙), 3개 검사
(placeholder 스캔·균형·존재)가 스캐너 공유. §8의 재현 버그 2건이 Red 테스트로
선행 후 green (기존 20 + 신규 3 = 23, 스위트 206). exit 계약 불변.

### Follow-up 2 — review gating 스코프 축소 (완료)

스킵 조건을 "레거시 plan 파일 경로 AND cheap"으로 축소 — 저작 brief 경로는
전 티어 그룹 리뷰어 dispatch. 근거: 스킵의 전제는 "저위험"이 아니라 "사전
리뷰 존재"(레거시 brief = 사용자 승인 plan의 verbatim 추출)였음. SKILL.md
인트로·digraph(4곳)·Review Gating 섹션·ledger 문구, CLAUDE.md 동기화.
부수 효과: Example Workflow의 잠재 모순(cheap 그룹이 리뷰받는 예시)이 해소.

### Follow-up 1 — n=3 실측과 revert 재상정 (트리거 발화, keep 결론)

같은 기능의 반사실 1.1.7-style plan(step-level 전체)을 저작해 비교
(토큰 프록시 chars/4, 한글 과소추정이나 양 arm 동일 구성):

| 분해 산출물 | tok≈ |
|---|---|
| OLD: plan 문서 1개 | 2,741 |
| NEW: 섹션 429 + brief 3개 (1,385/1,165/500) | 3,479 |

**이중 저작 불리 실측 확정: +738 tok (+26.9%), 그룹당 반복 성분 200–350 tok
(n에 선형).** §8의 구조적 예측이 검증됨 — revert 재상정 트리거 발화.

**재상정 결론: keep.** ① 절대량 ~0.7k/기능은 같은 기능의 실행 비용
(구현 130k + 리뷰 189k tok)의 0.3% — 토큰 레버로 무의미. n=10 외삽도 ~3k.
② 이 기능에서 NEW−OLD 총 토큰 차의 ~99%는 follow-up 2의 추가 리뷰어
2 dispatch(+86.2k, G1·G3 지적 0건)로, 문서 아키텍처와 직교하는 품질 게이트
구매 비용. 진짜 토큰 레버는 게이팅 정책이지 spec/plan 구조가 아님.
③ revert는 무신호 절단 버그와 게이트 2개(사람 왕복)를 복귀시킴.
비율(+27%)을 게이트로 삼으면 revert 논거가 성립하므로 최종 선택권은
사용자에게 있음 — 절대량 기준 권고는 keep.

### 실행 계측 (SDD, 이 기능)

- G1 impl haiku 36.6k/86s · rev sonnet 45.2k/149s — 승인, 지적 0
- G2 impl sonnet 59.4k/106s · rev sonnet 44.3k/37s — 승인, 지적 0
  (brief의 digraph 개수 오기 2엣지→3엣지를 구현자가 적발, 컨트롤러가
  brief·spec 사후 수정 — brief-fix 리뷰 라운드 없이 흡수)
- G3 impl haiku 34.4k/71s · rev sonnet 41.1k/28s — 승인, 지적 0
- 최종 whole-branch review opus 58.4k/312s — Ready to merge, Critical/Important 0

### 남은 follow-up

4 (eval2 대칭 재실행) · 5 (스킬 텍스트 비용 산입) · 6 (brief-fix 스코프
명문화 — 단, 리뷰어 템플릿의 조건부화는 미머지 section-only 브랜치에 자산
존재)은 미착수.
