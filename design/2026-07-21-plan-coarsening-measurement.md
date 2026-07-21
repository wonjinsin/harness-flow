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

---

# v2 재측정 (2026-07-21) — 편향 방어 강화

**동기**: v1(§2)의 fragmentation 측정은 단일-dispatch 합성 생성기가 coarse-편향이라 inconclusive였다. v2는 (A) 실제 grouped 플랜 **전수 조사**를 바인딩 샘플로 승격하고, (B) S·a를 실측하고, (C) **tier-up trap**을 경제성에 반영해 두 게이트를 재판정한다.

**결론 (변경 없음, 근거는 강화)**: 두 레버 모두 **미구현**. v1은 경제성을 "sub-dollar marginal"로 봤으나, v2는 실측 S·a + tier-up으로 **coarsening/inline-K가 주요 대상 케이스에서 net-negative**임을 보인다 — 더 이상 marginal이 아니라 **적자**. fragmentation은 실데이터 N=3에서도 **inconclusive**(고분산, 방향 엇갈림)이며 더 이상 가설을 지지하지 않는다.

## v2-1. Fragmentation — 실제 grouped 플랜 전수 (바인딩 샘플)

현행 `### Group` 포맷을 쓰는 **모든** 실제 플랜을 main + 5개 worktree + 형제 checkout에서 전수 조사(v1은 1개만 사용). 합성과 **집계하지 않는다**(v1의 희석 오류 반복 금지) — 실데이터는 별도 판정.

| 플랜 | 출처 | groups | tasks | 분포 | avg t/g | solo |
|---|---|---|---|---|---|---|
| `2026-07-10-size-classifier` | 실제 | 3 | 5 | 2,2,**1** | 1.66 | 1 (33%) |
| `2026-07-18-sdd-agent-files` | 실제 | 3 | 8 | 3,2,3 | 2.67 | 0 |
| `2026-07-20-codex-advisory-tiering` | 실제 | 1 | 2 | 2 | 2.00 | 0 |
| **실제 집계 (N=3)** | | **7** | **15** | | **2.14** | **1/7 (14.3%)** |

**게이트 판정(실데이터)**: `평균 2.14 ≥ 2.0` 이고 `solo 14.3% ≤ 20%` → **두 트리거 모두 미발동**.

**그러나 "fragmentation 없음"이 아니라 inconclusive** (정직 규칙):
1. **고분산·방향 엇갈림.** 1.66 / 2.00 / 2.67 — size-classifier 하나는 두 트리거를 **단독 발동**(1.66<2.0 AND 33%>20%), 나머지 둘은 미발동. N=3에서 집계가 2.0 바로 위(2.14)에 착지 = 경계선.
2. **지목 원흉이 실제로는 과발동 안 함.** v1이 원흉으로 지목한 `writing-plans:55-56`(standalone→solo)의 반례가 실데이터에 있다 — **`sdd-agent-files`의 Group 3은 "Skill and doc updates" 3개 task를 solo로 쪼개지 않고 한 그룹으로 묶었다**(문서 task임에도). 즉 "문서=solo" 경향은 보편적이지 않고, 예외는 컨텍스트 의존적으로 작동한다.
3. 실 신호는 "fragmentation 있다/없다"가 아니라 **"그룹 granularity가 고분산·컨텍스트 의존적"** 이다. 결정론적 coarsening 규칙이 정당화되려면 fragmentation이 **체계적**이어야 하는데, 실데이터는 체계적이지 않다.

**N·잔여 편향 명시**: 실제 grouped 플랜은 전 세계 checkout에 **N=3**뿐(현 Group 포맷이 최근 도입 → 이전 플랜은 flat, group-level 측정 불가). 이게 바인딩 샘플이고, 작다. 합성으로 N을 부풀리면 v1 희석 오류를 반복하므로 하지 않는다(defense-B 프로브는 v2-4에 **부차·바이어스 플래그**로 분리).

## v2-2. S·a 실측 (v1에서 스킵)

**S = 회피 dispatch 1건당 절감되는 cold-start 입력토큰** (실측 합산, chars/4):

| cold-start 구성요소 | 실측 | 인라인 시 절감? |
|---|---|---|
| `implementer-prompt.md` | 1,850 tok | ✅ (컨트롤러가 이미 보유) |
| `test-driven-development/SKILL.md` | 2,913 tok | ✅ |
| injected `using-harness-flow/SKILL.md` | 1,424 tok | ✅ |
| group brief (실측: sdd-agent-files G1 = 21KB) | ~5,260 tok | ✅ (컨트롤러가 플랜 보유 → 재read 안 함) |
| **harness-flow 재주입 소계** | **~11.4K** | |
| 시스템 프롬프트 + 툴 스키마 | ~8–14K (GSD 앵커, repo 밖) | ✅ (컨트롤러가 이미 지불) |
| **총 S** | **~20–25K 입력토큰/dispatch** | (교차-dispatch 캐시 재사용 0 → 풀가) |

→ **회피 dispatch 1건당 cold-start 절감(입력만, 티어가중):**

| 티어 | S≈20K × 입력단가 |
|---|---|
| Haiku ($1/Mtok) | **$0.020** |
| Sonnet ($3) | **$0.060** |
| Opus ($5) | **$0.100** |

v1의 GSD 14K 앵커 추정($0.014–0.070)과 자릿수 일치, 다만 harness-flow는 스킬 재주입 때문에 S가 **앵커보다 큼**(~22K). 정성 결론 불변: 회피 1건 = **cents-scale**.

**a = task당 인라인 누적 컨텍스트** (compaction 동인): 파일 read(2–4개×~500) + diff(~1–2K) + 테스트출력(~500) ≈ **~5K tok/task**. compaction 한계 `T ≈ (160K−40K)/5K ≈ 24 task`, 품질할인 K*≈12. **실제 플랜은 ≤8 task** → 실사이즈 인라인의 compaction 리스크는 **낮음**(이 항목만은 inline-K에 유리하나, 아래 tier-up이 지배).

## v2-3. 경제성 게이트 (1차 관문) — tier-up trap으로 net-negative

v1은 "이득 cents, 리스크 상당 → marginal"로 봤다. v2는 **tier-up trap**을 넣어 **적자**임을 보인다.

**Tier-up trap (coarsening).** 스킬은 그룹 티어를 "최고복잡도 task"로 정한다(`SKILL.md:159-160`). coarsening의 주 타깃 = **cheap(Haiku) solo를 인접 standard(Sonnet) 그룹에 병합**(예: size-classifier의 문서 solo). 병합하면 그 task의 **work 토큰(특히 output)이 Haiku→Sonnet 단가로 이동**:

| 항목 | 계산 | $ |
|---|---|---|
| 제거된 Haiku dispatch cold-start 절감 | ~20K in × $1/Mtok | **+$0.020** |
| tier-up: work **input** (~10K, Haiku→Sonnet) | 10K × ($3−$1)/Mtok | −$0.020 |
| tier-up: work **output** (~5K, Haiku→Sonnet) | 5K × ($15−$5)/Mtok | −$0.050 |
| **병합 1건 순효과** | | **≈ −$0.05 (적자)** |

→ **coarsening의 대표 케이스(cheap solo → standard 그룹)는 돈을 잃는다.** 동일-티어 병합만 흑자지만 그건 sub-dollar cold-start만 절감(+$0.02–0.06)하고, 실제 플랜은 이미 ~3그룹이라 제거할 그룹도 거의 없다.

**Inline-K trap.** 인라인은 dispatch를 아예 제거하지만, work가 **컨트롤러 티어(세션 모델 = 보통 Opus/Sonnet, 가장 비쌈)** 에서 돈다. 2그룹(Haiku/Sonnet) 플랜을 Opus 컨트롤러에 인라인하면:

| 항목 | 계산 | $ |
|---|---|---|
| dispatch 2건 cold-start 절감 | 2 × ~$0.06 | +$0.12 |
| tier-up: work input (~40K, Sonnet→Opus) | 40K × ($5−$3)/Mtok | −$0.08 |
| tier-up: work output (~20K, Sonnet→Opus) | 20K × ($25−$15)/Mtok | −$0.20 |
| **플랜 1건 순효과** | | **≈ −$0.16 (적자)** + compaction 리스크 |

→ **inline-K도 net-negative** (컨트롤러 티어 반영 시). v1이 스킵한 이 항목이 결정적.

**Eval 상각.** 사전등록 Phase-1 eval(블라인드 패널 + decoy + BLOCKED율, 플랜×런 다수) ≈ 20–40 dispatch + 패널 추론 ≈ **$3–5 일회성** + 구축비. 최선(동일-티어 병합 +$0.06/feature) 기준 손익분기 ≈ **60–80 feature**, tier-up 케이스는 상각 자체가 **음수라 도달 불가**.

**Δ$ 판정**:
```
Δ$ = cold-start_saving − tier_up_cost − eval/N
   주타깃 케이스: ≈ (+$0.02) − ($0.07) − eval/N  <  0
```
→ **경제성 게이트 FAIL (robust).** v1의 "marginal"보다 강함 — 두 레버의 대표 케이스가 **실측상 적자**. fragmentation 실재 여부와 **독립**.

## v2-4. Defense-B 프로브 (부차 — 바이어스 플래그)

**주의(로드-베어링 아님)**: 아래는 실데이터가 아니라 subagent가 현행 스킬을 적용한 합성이다. advisor 지적대로 bottom-up 강제는 편향을 **제거가 아니라 재배치**한다(분해자가 t/g를 통제). 게다가 나는 spec을 **의도적으로 standalone 조각으로 덱을 쌓았다**(fragmentation 쪽으로). 유일한 목적: "**standalone 조각을 잔뜩 넣은 spec에 스킬을 적용하면 standalone→solo 예외가 과발동하는가?**" — 이 결과는 위 판정을 뒤집을 수 없다(경제성이 이미 결정).

**프로브 결과 (합성, N=3 spec, 각 N=1런 → 비신뢰)**:

| spec | groups | tasks | avg t/g | solo | standalone bait 처리 |
|---|---|---|---|---|---|
| SPEC 1 (CLI `--json`) | 1 | 1 | 1.0 | 1 (**구조적**) | README → 문서 step으로 흡수 |
| SPEC 2 (audit 그라운드워크) | 2 | 3 | 1.5 | 1 | redact_pii solo(명백); backfill → 마이그레이션과 그룹(스키마 소비) |
| SPEC 3 (webhook 리시버) | 3 | 6 | 2.0 | 1 | load-test solo(방어가능); dead-letter → 핸들러 그룹; runbook → 문서 step 흡수 |
| **합성 집계** | **6** | **10** | **1.67** | **3 (50%)** | |

**해석 — raw 집계는 오도, 메커니즘 판정은 반대**:
- raw `1.67 / 50%`는 게이트를 발동시키나, **덱을 standalone으로 쌓은 결과이지 스킬 오작동이 아니다**. SPEC 1의 solo는 예외 발동이 아니라 **구조적**(1-task 플랜은 정의상 solo 그룹) — 이거 하나가 solo%를 부풀린다.
- **핵심 메커니즘 판정**: standalone처럼 보이는 bait **6개 중 4개(README·backfill·dead-letter·runbook)를 스킬이 접었고(fold)**, 2개만 solo(redact_pii=명백 독립 테스트사이클, load-test=방어가능). 즉 **standalone→solo 예외는 과발동하지 않았다.** 무게를 진 기준은 "표면적 분리"가 아니라 "**shared *construction* context / 소비 관계**"였고, 그게 예외를 억제했다.
- 이는 v2-1의 실데이터 반례(sdd-agent-files G3가 문서를 solo로 안 쪼갬)와 **같은 방향** — 지목 원흉이 과발동한다는 v1 가정을 실데이터·합성 양쪽에서 **반증**.

**정직 플래그**: 합성 N=1런/spec은 비신뢰(size-classifier §3의 교훈). 이 프로브는 "예외가 과발동하는가?"에 **아니오** 방향의 방증일 뿐, fragmentation 판정을 실데이터(v2-1, 바인딩)에서 프로브로 옮기지 않는다.

## v2-5. 두 게이트 최종 판정 (v2)

| 게이트 | 판정 | 근거 |
|---|---|---|
| **① Fragmentation** | **inconclusive** (미발동, 단 경계·고분산) | 실데이터 N=3: 2.14 t/g, 14.3% solo. 두 트리거 미발동이나 고분산·방향엇갈림·N작음 → "없음"이 아니라 판정불가. 지목 원흉(standalone→solo)의 반례 실증(sdd-agent-files G3). |
| **② 경제성 (1차 관문)** | **FAIL (net-negative)** | 실측 S≈22K → 회피 1건 cents. tier-up trap으로 coarsening(−$0.05/병합)·inline-K(−$0.16/플랜) **적자**. eval $3–5 상각 불가. |

**결론**: 경제성(1차 관문)이 fragmentation과 **독립적으로** 실패하고, 이번엔 marginal이 아니라 **net-negative**로 실패한다. fragmentation은 실데이터로도 inconclusive이며 가설을 지지하지 않는다. → **Phase 1(coarsening) 재개 부당, Phase 2(inline-K) 부당.** skills/ **무변경.**

**재도전 조건(갱신)**: coarsening/inline-K는 (a) tier-up trap을 **직접 방어하는 메커니즘**(예: 동일-티어 그룹만 병합, 또는 인라인을 컨트롤러 티어가 아닌 cheap로 강제) **그리고** (b) 실제 멀티세션 fragmentation이 **체계적**임을 보이는 재측정 **그리고** (c) 회피 순$가 eval 비용을 상회한다는 실측 — 셋 다 있을 때만. 다음 토큰-비용 레버는 여전히 **Opus 최종 리뷰 티어**(본 스펙 밖).

## v2-6. 커버리지 구멍: 대형 mechanical 마이그레이션 클래스 (유저 반례)

**동기**: 유저가 반례 제시 — "30+ 파일을 디렉토리 이동 + 참조 패키지 수정하는 작업이 group 4-5개로 쪼개지는데 이게 맞냐". v2-1의 실플랜 N=3은 **전부 작은 skill·hook 편집**이라 이 클래스가 표본에 0개였다. 실이력 없음(유저 확인) → 대표 spec 합성(`scratchpad/migration-spec.md`: `@app/core` 30파일 flat→feature 재구성 + 형제 3패키지 import 수정)으로 writing-plans bottom-up 분해 **2회 독립 실행**.

| 런 | groups | tasks | avg t/g | solo | 티어 |
|---|---|---|---|---|---|
| A | 4 | 7 | 1.75 | 1 (33%) | 전부 cheap |
| B | 3 | 5 | 1.67 | 2 (40%) | 전부 cheap |

**합성이자 N=2런/1spec → 비신뢰. 실플랜 없음(바인딩 샘플 없는 클래스).** 하지만 두 런의 일치점이 강함:

1. **fragmentation 게이트가 이 클래스에선 발동.** avg 1.67–1.75 < 2.0 AND solo 33–40% > 20%. **v2-1 소형 플랜과 정반대** — 여기선 숫자상 fragmentation이 체계적. 단 두 런 다 그룹 분해를 **정당하다** 판정(모듈 경계/fan-in 구동, 임의 절단 아님). 즉 "낮은 t/g"이지 "잘못된 그룹핑"은 아님. 그룹 수는 고분산(A=4/B=3, 유저 관찰 4-5와 동일 자릿수) — v2-1의 "grouping 고분산" 재확인.

2. **경제성 게이트가 이 클래스에선 뒤집힘 (tier-up 무효).** 전부 **cheap 동일 티어** → coarsening/통합해도 work 토큰 티어 이동 **없음** = tier-up 페널티 0. 3-4개 cheap cold-start(~$0.02씩)를 1-2로 줄이면 **순$ 양수**(~$0.04–0.06/마이그레이션, no downside). **v2-3의 "coarsening net-negative"는 이 클래스에 적용 안 됨** — 이게 v2 판정의 명확한 **예외 클래스**(동일-티어 mechanical).

3. **진짜 문제는 fragmentation 개수가 아니라 machinery mismatch (correctness):**
   - **TDD Red→Green이 안 맞음** — 순수 이동엔 새 behavior 테스트가 없음. 게이트는 `tsc -b`+`vitest run` 1회.
   - **bite-size(~5스텝/task)가 원자성과 충돌** — `utils` 같은 fan-in sink는 옮기면 전 consumer가 깨져 **한 커밋에 20+ importer 수정**(bite-size 초과) 또는 **shim/codemod-first**(스킬이 기술 안 하는 스캐폴딩) 강제.
   - **각 커밋 green의 유일 규칙**: 이동 파일의 *전체 importer closure*(내부+형제 3패키지+exports/tsconfig)를 같은 커밋에. naive per-feature 커밋은 RED. 원자성이 자연스럽지 않고 **엔지니어링됨**.
   - features가 깨끗이 독립도 아님(shared utils 항상, audit/notify 같은 cross-cutting model이 경계 누출).

**판정(이 클래스)**: "group 4-5개가 맞냐" →
- **그룹 개수 자체는 방어 가능**(모듈/fan-in 구동). 공유 컨텍스트를 쪼갠 over-fragmentation은 **아님**.
- **그러나 동일-티어 mechanical 마이그레이션에 3-4개 별도 cold-start dispatch는 낭비**(tier-up 상쇄 없음) + **TDD/bite-size/per-task-commit 기계가 근본적으로 mismatch**. 유저 직관("뭔가 이상")은 옳음.
- **단 이걸 고치는 건 coarsening 레버가 아니다.** 필요한 개입은 **mechanical 마이그레이션 라우팅** — 예: writing-plans에 "순수 이동+import-rewrite는 TDD Red→Green 미적용, `build+기존테스트 green`으로 게이트, fan-in sink는 codemod-first, 각 커밋=전체 importer closure" 노트 + SDD에서 단일 codemod 패스/트리비얼-티어로 라우팅. 이는 v1/v2가 측정·거부한 coarsening과 **다른 개입**.

**미해결(유저 결정 필요)**: 이 개입의 1차 정당화는 $ 아니라 **correctness**(red 커밋/미문서 shim 방지)다. repo 게이트는 speed/tokens가 1차, quality는 제약([[changes-optimize-speed-and-tokens]]). $ 절감은 실재하나 소액(~$0.05/마이그레이션). 따라서 skill 수정 전 (a) 이 클래스가 유저 워크로드에서 얼마나 빈번한지, (b) correctness 개선을 token-중립으로 정당화할지 유저 확인 필요.

### v2-6a. 라우팅 노트 RED 테스트 → 실패 재현 안 됨 → 노트 미채택

유저가 "라우팅 노트 추가"를 택함. writing-skills Iron Law(편집도 실패 테스트 먼저)에 따라 노트가 방지하려던 실패 — "**cheap 구현자가 현행 스킬로 naive move-then-fix 커밋 → 빌드 RED**" — 를 RED 테스트로 재현 시도.

**RED 셋업**: `utils` fan-in sink 이동을 **haiku(cheap, 실제 마이그레이션 라우팅 티어)** 구현자에게 현행 writing-plans로 커밋 분해시킴. 노트 없음.

**결과: 실패 재현 안 됨.** haiku가 노트 없이 **shim-first codemod 패턴을 스스로 도출** — (1) 파일 이동 + 옛 경로에 re-export 심 → tsc green, (2) core 내부 import 이전 → green, (3) 형제 3패키지 이전 + 심 삭제 → green. **모든 커밋 tsc -b PASS**, 원자적. 예측한 red 커밋 안 함.

**3/3 수렴**: 런 A(capable), 런 B(capable), RED(haiku)가 **모두** 노트 없이 green-safe·importer-closure/shim 접근을 도출. 즉 노트는 **에이전트가 이미 하는 행동을 문서화**하는 것 → Iron Law상 미정당(실패 없음).

**판정: 라우팅 노트 미채택. skills/ 무변경.**
- correctness 정당화 소멸 — 현행 스킬 + 임의 티어 구현자가 이미 green 마이그레이션 생산.
- 남는 건 dispatch 개수 $(~$0.05/마이그레이션, 소액) — v2-3의 필수 eval 비용 논리로 여전히 미달, 게다가 이 경우 fix가 coarsening도 아님.
- **잔여 편향/한계**: RED는 haiku N=1런(단, A/B와 합쳐 3/3 동방향). "4-5 그룹" 자체는 실재·방어가능하나 결함 아님. 재도전하려면 cheap 구현자가 red 커밋을 **체계적으로** 내는 실증(N 확대)이 선행돼야 함 — 현 증거는 반대.

**최종: 이 클래스도 skills/ 무변경.** 유저 관찰(4-5 그룹)은 실재하나, 플랜은 green-safe하고 티어는 균일 cheap이며, 노트의 실패 전제가 재현되지 않음.

### v2-6b. 유저 실경험 = #3 (correctness 아님, 속도/토큰 체감)

유저 확인: 네이티브 마이그레이션에서 본 건 **빌드 깨짐(#1)도 shim 지저분(#2)도 아니고, "그룹 4-5개 = 별도 dispatch가 많아 느리고 토큰 낭비 같다"(#3)**. 즉 correctness 이슈 0, **dispatch 개수 체감** 문제.

**판정(왜 그래도 skill 무변경 권장):**
1. **이미 permitted.** 스킬은 "Group by shared context, not to hit a count"라 이미 consolidation 허용 — 런 B가 feature 3개를 **1그룹**으로 묶음. 스킬이 4-5를 *강제*하지 않음(A=4/B=3 분산). 즉 "너무 많이 쪼갬"은 스킬 결함이 아니라 **steer 부재로 인한 상방 분산**.
2. **$ 소액.** 동일-티어라 tier-up 없어 consolidation은 순$ 양수지만 ~$0.05/마이그레이션. 지연도 dispatch 2-3개 순차분(수 분)뿐. 빈도가 낮으면 총 이득 marginal.
3. **simplicity 비용.** writing-plans에 mechanical-migration 특례 규칙 추가 = 모든 독자가 매번 읽음. marginal 이득 대비 과함.
4. **speed/tokens 1차 게이트**([[changes-optimize-speed-and-tokens]])로 봐도 델타가 작고, 스킬이 이미 consolidation을 허용하므로 규칙화의 순이득 불명확.

**flip 조건**: 유저가 30+ 파일 마이그레이션을 **고빈도**(주 단위 등)로 한다면 누적 speed/token 이득이 simplicity 비용을 넘을 수 있음 → 그때만 최소 1-line steer("uniform mechanical migration은 모듈 경계가 요구하는 최소 그룹만; dispatch 개수 최소화")를 RED/GREEN으로 정당화 후 추가. 현 정보로는 **무변경**.
