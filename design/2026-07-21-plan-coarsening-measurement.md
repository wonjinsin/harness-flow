# Plan Coarsening / Inline-K — 판정 기록

**날짜**: 2026-07-21
**브랜치**: `speedup-agent-runtime` (base `3811333`)
**스펙**: `docs/harness-flow/specs/2026-07-21-plan-coarsening-inline-k-design.md`
**결론**: **두 레버 모두 미구현.** 주근거는 경제성(견고, 측정 독립); fragmentation 측정은 **inconclusive**(도구 편향)라 보조 근거일 뿐. skills/ 무변경.

## 1. 헤드라인 — 왜 안 하나 (측정과 무관하게 성립)

토큰 비용($) 재전략의 두 레버 — (1) writing-plans coarsening, (2) SDD inline-K — 는 **둘 다 dispatch cold-start 개수만 공격**한다. 결정적 사실: **인라인/coarsening이 아끼는 건 cold-start *오버헤드*지 작업 토큰이 아니다** — 실제 코드 작성·테스트 토큰은 어느 쪽이든 동일. 따라서 회피한 dispatch 1건당 절감은 cold-start 입력토큰 × 티어단가 = **sub-dollar**.

이에 반해 비용:
- Phase 2는 **필수 net-$ eval** 자체가 토큰을 쓴다.
- 대형 플랜 인라인화는 컨트롤러 컨텍스트 누적 → **compaction이 오히려 비용을 올릴 수** 있다.
- 실행 speedup은 이미 ①코어스닝·②리뷰게이팅·③인라인(≤3)·④티어링이 shipped(`execution-granularity-analysis.md`) — 남은 dispatch-avoidance 헤드룸이 구조적으로 작다.

→ **이득 cents-scale, 리스크·eval 비용이 그에 상당.** repo 게이트(속도/토큰이 1차, quality는 제약)를 넘길 값어치가 없다. 이 판단은 fragmentation이 실재하든 아니든 성립한다.

### 절감 규모 추정 (외부 앵커 — harness-flow 미측정)

cold-start 오버헤드를 **GSD의 ~14K 입력토큰 앵커**로 잡고(주의: 이는 GSD `execute-plan.md:72` 수치이지 harness-flow 실측 아님 — Phase 0에서 `S`·`a` 실측은 **수행 안 함**), 실측 티어 단가 적용:

| 티어 | cold-start 1회 (~14K 입력, 추정) |
|---|---|
| Haiku ($1/Mtok) | ~$0.014 |
| Sonnet ($3) | ~$0.042 |
| Opus ($5) | ~$0.070 |

정성 결론(marginal)은 `S`가 2–5× 커도 유지된다. 생성 subagent가 소비한 토큰(~30–40K/건)도 자릿수를 방증. 즉 정확한 `S`를 pin하지 않아도 결론 불변 — 그래서 측정을 더 하지 않는다.

## 2. Fragmentation 측정 — 보조, 그리고 inconclusive

가설: "writing-plans가 그룹을 의도(2–3 task)보다 잘게 쪼갠다 → G↑ → 비용↑". N=1 실플랜(`2026-07-10-size-classifier.md`, 1.66 task/group, solo 1개)이 방향 신호였다.

**방법**: 현재 `writing-plans/SKILL.md`를 충실히 적용해 대표 spec 3종을 플랜화하는 subagent 3개(중립 지시) + 실플랜 1개. task/group·solo 분포 측정.

**결과**:

| 플랜 | task | group | 평균 t/g | solo | 출처 |
|---|---|---|---|---|---|
| 소형 (`--json`) | 2 | 1 | 2.0 | 0 | 합성 |
| 중형 (rate-limit) | 2 | 1 | 2.0 | 0 | 합성 |
| 대형 (webhook) | 7 | 3 | 2.33 | 0 | 합성 |
| size-classifier | 5 | 3 | 1.66 | 1 | **실제** |
| 집계 | 16 | 8 | 2.0 | 12.5% | |

사전등록 게이트(`평균<2.0` 또는 `solo>20%`)는 집계 2.0 / 12.5%로 **미발동**.

**왜 이 측정이 결론을 짊어질 수 없나 (inconclusive):**
1. **도구가 답 쪽으로 편향.** 생성기가 과소분해(중형 "~6"→2, 대형 "~10+"→7). 과소분해 = 더 coarse = 더 큰 그룹 = solo 덜 남음 = **게이트가 fragmentation을 못 잡는 바로 그 방향**. 실 fragmentation 유무와 무관하게 "통과"가 나온다.
2. **유일한 실데이터가 판정과 반대.** 비합성 샘플(size-classifier, 1.66 + solo 1)은 오히려 **가설을 지지**. 집계가 편향된 합성 3개로 이를 희석.
3. **집계가 경계선(정확히 2.0)에 착지**, solo 12.5%는 그 실플랜 하나에서만 나옴. 편향 도구의 경계 결과는 "clean pass"가 아니라 **"판정 불가"**.

→ 이 측정은 fragmentation을 **"없다"**로 확정하지 못한다. 지목 원흉(`writing-plans:55-56` standalone→solo)이 연결된 feature에서 발동 안 한 것은 사실이나, 도구가 그런 feature만 coarse하게 생성했으므로 반증도 확증도 아니다.

## 3. 미래 재도전 조건 (foreclose 아님)

이 기록은 coarsening을 **부결로 못박지 않는다.** 재도전 정당 조건:
- **더 나은 측정 도구**로 fragmentation 재측정 — 단일-dispatch 생성 대신 **실제 멀티스텝 writing-plans 세션**(또는 축적된 실플랜 다수)의 task/group 분포. 도구 편향을 제거하면 게이트가 유효해진다.
- **그리고** §1의 경제성 반론을 넘는 근거 — 즉 회피 cold-start의 순$ 절감이 eval+compaction 비용을 실제로 상회한다는 실측.
경제성(§1)이 1차 관문이다: fragmentation이 실재해도 dispatch 회피 이득이 sub-dollar면 여전히 미구현.

## 4. 결과 요약

- **Phase 1(coarsening): 미구현.** 주근거 경제성; 측정은 inconclusive라 대상 유무 미확정.
- **Phase 2(inline-K): 미구현/보류.** cents-scale 이득 + compaction 리스크 + 필수 heavy eval.
- **skills/ 무변경** — 유저의 원래 지시("기존 skills 수정 되돌림")와 정합. 이 브랜치 산출물 = 이 판정 기록 + 스펙.

## 5. 메타 교훈

실행 speedup이 ①~④로 이미 최적화된 뒤, 남은 dispatch-avoidance 레버는 (a) 아끼는 게 cold-start 오버헤드뿐이라 sub-dollar, (b) fragmentation 여부를 단일-dispatch로 측정하면 도구가 답을 편향시킨다. 가장 큰 미착수 $ 항목은 여전히 **Opus 최종 리뷰**(본 스펙 범위 밖) — 다음 재전략은 거기서 시작하는 게 맞다.
