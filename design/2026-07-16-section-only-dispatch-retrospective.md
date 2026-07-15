# Section-Only Dispatch 회고 — 음성 결과 (release 보류)

**날짜**: 2026-07-16
**브랜치**: `worktree-section-only-dispatch` (미머지 보존)
**결론 요약**: SDD dispatch payload를 저작 brief에서 결정론 추출(`scripts/group-entry`)로 바꾸는 실험. 구현·리뷰는 전부 통과(211/211, 최종 리뷰 "Ready to merge")했으나 **release 게이트에서 탈락**: 기능 프로브는 8/8 (2/2 reps)인데 블라인드 품질 판정에서 두 rep 모두 brief arm 대비 열세 — **사전 작성 step 코드가 cheap 티어(haiku) 코드 품질의 실제 원천**이라는 음성 결과. 1.2.1 유지. size-classifier 회고와 같은 지위의 기록.

## 1. 가설과 동기

plan-demotion 회고 §7 이후 사용자 기준(속도·토큰이 1차 게이트) 하에서:
저작 brief의 비용 클래스(실경로 ~2–3k, fresh 컨트롤러 ~60–78k + 과잉 수행
표면)를 아예 제거하고, spec 섹션에서 그룹 엔트리+전역 제약을 스크립트로
추출(0 토큰)해 dispatch하면 implementer가 직접 TDD로 메꿀 것이다.

## 2. 구현 (브랜치에 보존, 미머지)

- `scripts/group-entry` + 8 유닛 테스트 (펜스 인지 2-pass awk, 한/영 제약
  헤딩, exit 0/2/3) — 이 부분은 자체 결함 없음, 재사용 가치 있음.
- SDD SKILL.md "Dispatch Payload" 재구성 (기본=추출 / 폴백=저작+brief-check
  / 레거시=task-brief), 리뷰어 `brief-fix` class를 폴백 경로 조건부화,
  writing-plans·CLAUDE.md·README 정합화. 최종 리뷰 승인까지 완료.
- 부수 실증 2건: ① 리뷰어가 신규 `brief-fix` 라우팅을 실전 발동 (컨트롤러
  저작 brief의 spec 누락 2건을 정확히 brief-fix로 분류, 사람 개입 없이
  brief 재작성으로 수렴 — 1.2.0 설계의 첫 실전 검증), ② worktree gotcha
  실발동 (fixer가 main 체크아웃 master에 커밋 → CLAUDE.md 절차대로
  cherry-pick + reset 복구).

## 3. 평가 (tokmark fixture, 1.2.0 eval 자산 재사용)

동일 spec 섹션·동일 시드(D1 `>` 미이스케이프, D2 "empty tokens")·동일
프로브. 비교 대상 K = brief arm (sonnet 저작 brief + haiku 구현, 1.2.0
eval). 신규 Z1·Z2 = 추출 payload + haiku, 2 reps.

| 지표 | K (brief) | Z1 | Z2 |
|---|---|---|---|
| 프로브 (8종, decoy 포함) | 8/8 | 8/8 | 8/8 |
| implementer tokens / s | 37.0k / 80s | 45.7k / 142s | 45.8k / 190s |
| 블라인드 테스트 품질 | 4 | 3 (동어반복·프로세스 누수 이름) | 4 |
| 블라인드 코드 품질 | 5 | 2 (이스케이프 로직 중복) | 2 (~40줄 데드 중첩 코드) |
| 블라인드 spec 충실도 | 5 | 3 (`* *` 의미 일탈) | 2 (과잉 구축) |
| 판정 | — | **K보다 열세** | **K보다 열세** |

- 분산 소견: Z1·Z2는 "같은 프로세스의 노이즈" — 장황함·과잉 star 로직·
  부풀린 스위트라는 공통 시그니처. 구조적 결과지 불운 아님.
- 토큰조차 열세: 코드 없이 탐색 턴이 늘어 implementer 비용 +23% (45.7k vs
  37.0k), 시간 +78~137%. **속도·토큰 축에서도 실패** — brief 저작의 실경로
  비용(~2–3k)을 implementer 초과분(+8.7k)이 상회.
- 유일한 성공 사례: 본 브랜치 Group 3(문서 스윕)은 section-only로 문제
  없이 완료 — 코드 없는 문서 태스크에는 유효하나, 그것만으로 기본값을
  바꿀 근거가 못 됨 (태스크 유형 분기는 size-classifier 함정).

## 4. 게이트 판정

| 게이트 | 결과 | 판정 |
|---|---|---|
| 1. 품질: 프로브 8/8 + 블라인드 동등 이상 | 프로브 통과, 블라인드 2/2 열세 | **탈락** |
| 2. cheap(haiku) 유지 | 기능은 유지, 품질 미달 | **탈락** |
| 3. 토큰/속도 총합 ≤ brief arm | implementer +23% tok / +78% s | **탈락** |
| 4. 회귀 없음 | 211/211 | 충족 |

**3/4 탈락 → release 보류, 1.2.1 유지.**

## 5. 교훈

1. **step 코드는 세리머니가 아니라 품질 전달 매체다.** brief의 사전 작성
   코드는 받아쓰기 비용이 아니라 sonnet 품질을 haiku 실행에 주입하는
   통로였다. 제거하면 품질이 implementer 티어로 회귀한다.
2. **"토큰 절감" 가설도 토큰 축에서 patched됨**: 코드 없는 payload는
   implementer의 탐색 턴을 늘려 절감분을 상회했다 (턴 수 > 토큰 단가
   원칙의 재확인).
3. **구현 품질 ≠ 설계 타당성.** 이 브랜치는 모든 리뷰를 통과했다 —
   결함은 코드가 아니라 가설에 있었고, 그것은 release 게이트(A/B)만
   잡을 수 있었다. 게이트를 스킬 체인 통과로 대체하면 안 되는 이유.
4. `group-entry` 스크립트와 brief-fix 실전 검증은 회수 가능한 자산 —
   브랜치를 미머지 보존.
