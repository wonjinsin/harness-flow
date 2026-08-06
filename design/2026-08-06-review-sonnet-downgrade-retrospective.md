# Retrospective: 최종 리뷰 전면 sonnet 다운그레이드 + 출력 서식 캡

**날짜**: 2026-08-06
**브랜치**: `worktree-review-sonnet-downgrade` (release 2.0.4)
**요약**: `requesting-code-review`가 느리고 비싸다는 사용자 문제 제기에서 출발. 참고
harness 7종(superpowers / matt-pocock / ECC / Archon / GSD / gstack / OMC)의 리뷰
방식을 병렬 전수 조사해 절감 레버 3후보(A diff-size gate / B 모델 다운그레이드+confidence
gate / C 출력 캡)를 도출, 사전등록 eval(대형 diff, n=6, 게이트 ≥5/6 & demotion 0)이
**6/6·demotion 0**으로 통과하여 **B(전면 sonnet) + C(서식 캡·템플릿 슬리밍)** 를 채택.
A는 전면 다운그레이드 선택으로 결정 대상이 소멸해 탈락, confidence gate는 기존 기각
기록 존중으로 제외.

## 1. 배경 — 어느 레버가 살아남았나

| 후보 | 판정 | 근거 |
|---|---|---|
| A. diff-size gate (측정 줄수로 리뷰어 티어 결정) | **탈락(무의미화)** | 사용자가 2단 매핑 대신 전면 sonnet을 선택 → 티어 결정 자체가 사라짐. size-classifier 기각(예측 분류의 tier-up trap)과 달리 measured-diff는 결정적이라 재도전 자격은 있었음 — 전면안이 실패했다면 폴백이 이것 |
| B-1. 리뷰어 opus→sonnet | **채택** | coarsening 기각 기록이 지목한 "다음 $ 레버"; P3(all-cheap→sonnet final, 4/4) 및 review-removal eval(sonnet 하한 6/6)이 소형 구간을 선입증, 본 eval이 대형 구간을 채움 |
| B-2. confidence gate (저확신 finding 억제) | **제외** | reviewer-read-scope-cap 기각 기록("ECC-style confidence filters / finding suppression" rejected) + severity floor(결과 기준 승격)와 방향 충돌. 단일 최종 리뷰 설계에서 recall이 우선 |
| C. 출력 캡 | **채택(서식만)** | finding당 ≤5줄·Strengths ≤3, **개수 무제한 명시**(suppression 아님). Example Output(~37줄) 삭제는 P4(A-lite 슬리밍) 계열 |

타 harness 조사에서 가져온 판단 재료: 전 리뷰어 sonnet(ECC 21/22)·medium(Archon)이
업계 표준이고 "항상 최고급 리뷰"는 harness-flow가 유일했음; ECC/Archon의 confidence
gate는 병렬 다수 리뷰어의 노이즈 곱셈을 상쇄하는 장치라 단일 리뷰어 구조엔 전제가 안 맞음;
matt-pocock의 400단어 총량 캡은 finding 개수 억제로 새는 경계라 서식 캡으로 대체.

## 2. 사전등록 eval (PREREG 동결 → 관측)

- **미검증 구간만 측정**: 소형 diff의 sonnet 성능은 기존 eval로 입증돼 있었으므로,
  fixture는 **대형 diff**(fixture-a: pricing 728줄/15파일, fixture-b: auth/session
  891줄/15파일 — security-surface diff에서 sonnet이 버티는지 겸측)로 구성.
- **결함**: E5 계열 discovery-class type-contract(설정값이 JSON string으로 number 계약
  위반, coercion으로 전 테스트 green, brief 미기재). 빌더 subagent가 심고 controller가
  dispatch 전 직접 검증(git grep + node --test).
- **treatment**: 서식 캡 적용 프롬프트 + severity floor, **sonnet** 리뷰어, n=6(fixture당 3).
- **판정**: controller가 6개 raw output 전수 수동 판독(v2 §3.2 관례).

| rep | fixture | caught | severity | location |
|---|---|---|---|---|
| a1~a3 | a | 3/3 | Important(impl-fix) | config/pricing.json:3 + config.js (전 rep 정확) |
| b1~b3 | b | 3/3 | Important(impl-fix) | config/auth.json:2 + config.js (전 rep 정확) |

**TALLY 6/6, Minor demotion 0 → 게이트(≥5/6 & 0) 통과.**

부수 관찰:
1. fixture-b에 빌더가 **비의도로 심은 진짜 결함**(plan이 요구한 constant-time 비교
   `tokensEqual`이 실제 검증 경로에 미배선)을 3/3 rep이 Important로 잡음 — security
   diff에서 sonnet의 plan-대비 검증이 동작한다는 추가 신호.
2. 서식 캡이 catch를 해치지 않음: rep당 finding 3~7개 자유 보고, Strengths ≤3 준수.
3. 리뷰어 실측 5~9 tool calls / 165~245초(대형 diff) — read-scope cap이 sonnet에서도 유지됨.

## 3. 변경 (2.0.4)

| 파일 | 변경 |
|---|---|
| `requesting-code-review/SKILL.md` | dispatch 모델 "most capable" → mid-tier + suppression 금지 문구; Codex 번역 동기화 |
| `requesting-code-review/code-reviewer.md` | dispatch 헤더에 `model: sonnet`; Output Format에 서식 캡(finding ≤5줄, Strengths ≤3, 개수 무제한 명시); Example Output 삭제; Codex 번역 mid-tier |
| `implement/SKILL.md`, `brainstorming/SKILL.md` | 최종 리뷰 모델 문구 동기화 |
| `AGENTS.md` | chain 5·7 문구 + eval 근거 요약 |
| 무변경 | severity floor, read-scope cap, 테스트 재실행 금지, verify-fix 재리뷰 ≤3회, class 라우팅 |

## 4. 기대 효과와 한계

- **$**: 리뷰 1회당 opus→sonnet 단가 차 (P3 실측 −18k tok 상당의 단가 이동 + 재리뷰
  루프에도 동일 적용). 서식 캡·Example 삭제는 소폭 추가.
- **속도**: P3 실측 −110~217초/리뷰 계열의 개선이 전 리뷰로 확대. dispatch cold-start와
  재리뷰 루프 구조는 그대로.
- **한계/미검증**: (1) 실사용 재리뷰 수렴 횟수는 sonnet에서 재관측 필요 — 만약 fix 품질
  저하로 re-review가 늘면 절감이 상쇄될 수 있음(관찰 항목). (2) eval 결함은 type-contract
  1계열 — 더 넓은 결함 분포에서의 sonnet/opus 격차는 미측정. 실사용에서 최종 리뷰가
  놓친 결함이 발견되면 이 retro를 재개정하고 2단 폴백(A: 대형/트리거 diff만 top-tier)을
  1순위로 재검토할 것.

## 5. 아티팩트

- PREREG / ADJUDICATION / treatment / fixture 2repo: 세션 scratchpad `eval/`
- 조사 원자료: 7-harness 리뷰 방식 비교(세션 대화, agent 보고 7건)
