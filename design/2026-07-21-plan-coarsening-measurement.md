# Plan Coarsening / Inline-K — Decision Record

**Date**: 2026-07-21
**Branch**: `speedup-agent-runtime` (base `3811333`)
**Spec**: `docs/harness-flow/specs/2026-07-21-plan-coarsening-inline-k-design.md`
**Conclusion**: **Neither lever implemented.** The primary basis is economics (robust, measurement-independent); the fragmentation measurement is **inconclusive** (tool bias), so it is only a secondary basis. skills/ unchanged.

## 1. Headline — Why Not (holds regardless of measurement)

The two levers of the token-cost ($) re-strategy — (1) writing-plans coarsening, (2) SDD inline-K — **both attack only the number of dispatch cold-starts**. The decisive fact: **what inlining/coarsening saves is the cold-start *overhead*, not the work tokens** — the actual code-writing and test tokens are identical either way. Therefore the saving per avoided dispatch is cold-start input tokens × tier rate = **sub-dollar**.

Against this, the costs:
- Phase 2's **mandatory net-$ eval** itself consumes tokens.
- Inlining large plans accumulates controller context → **compaction may actually raise costs**.
- Execution speedup already ships ①coarsening, ②review-gating, ③inline (≤3), ④tiering (`2026-07-09-execution-granularity-analysis.md`) — so the remaining dispatch-avoidance headroom is structurally small.

→ **Gain is cents-scale, and risk plus eval cost are comparable to it.** Not worth clearing the repo gate (speed/tokens primary, quality a constraint). This judgment holds whether or not fragmentation is real.

### Saving Magnitude Estimate (external anchor — not measured in harness-flow)

Taking cold-start overhead as **GSD's ~14K input-token anchor** (caution: this is the GSD `execute-plan.md:72` figure, not a harness-flow measurement — in Phase 0 the measurement of `S` and `a` was **not performed**), and applying measured tier rates:

| Tier | one cold-start (~14K input, estimated) |
|---|---|
| Haiku ($1/Mtok) | ~$0.014 |
| Sonnet ($3) | ~$0.042 |
| Opus ($5) | ~$0.070 |

The qualitative conclusion (marginal) holds even if `S` is 2–5× larger. The tokens consumed by the generating subagent (~30–40K/run) also corroborate the order of magnitude. That is, the conclusion is unchanged without pinning an exact `S` — which is why no further measurement is done.

## 2. Fragmentation Measurement — Secondary, and Inconclusive

Hypothesis: "writing-plans splits groups finer than intended (2–3 tasks) → G↑ → cost↑". An N=1 real plan (`2026-07-10-size-classifier.md`, 1.66 task/group, 1 solo) was the directional signal.

**Method**: 3 subagents (neutral instructions) faithfully applying the current `writing-plans/SKILL.md` to plan 3 representative specs + 1 real plan. Measure the task/group and solo distributions.

**Results**:

| Plan | task | group | avg t/g | solo | source |
|---|---|---|---|---|---|
| small (`--json`) | 2 | 1 | 2.0 | 0 | synthetic |
| medium (rate-limit) | 2 | 1 | 2.0 | 0 | synthetic |
| large (webhook) | 7 | 3 | 2.33 | 0 | synthetic |
| size-classifier | 5 | 3 | 1.66 | 1 | **real** |
| aggregate | 16 | 8 | 2.0 | 12.5% | |

The pre-registered gate (`avg<2.0` or `solo>20%`) with aggregate 2.0 / 12.5% **did not fire**.

**Why this measurement cannot carry the conclusion (inconclusive):**
1. **The tool is biased toward the answer.** The generator under-decomposed (medium "~6"→2, large "~10+"→7). Under-decomposition = coarser = larger groups = fewer solos remaining = **exactly the direction in which the gate fails to catch fragmentation**. A "pass" comes out regardless of whether fragmentation actually exists.
2. **The only real data contradicts the verdict.** The non-synthetic sample (size-classifier, 1.66 + solo 1) actually **supports the hypothesis**. The aggregate dilutes this with 3 biased synthetic plans.
3. **The aggregate lands on the boundary (exactly 2.0)**, and solo 12.5% comes only from that one real plan. A boundary result from a biased tool is not a "clean pass" but **"undecidable"**.

→ This measurement cannot establish fragmentation as **"absent"**. It is true that the fingered culprit (`writing-plans:55-56` standalone→solo) did not fire on the linked features, but since the tool generated only such features coarsely, this is neither disproof nor confirmation.

## 3. Conditions for Future Re-challenge (not foreclosed)

This record does **not nail coarsening down as rejected.** Conditions that justify a re-challenge:
- Re-measure fragmentation with a **better measurement tool** — the task/group distribution of an **actual multi-step writing-plans session** (or many accumulated real plans) instead of single-dispatch generation. Removing tool bias makes the gate valid.
- **And** a basis that overcomes the economics objection in §1 — i.e. a measurement showing that the net-$ saving from avoided cold-start actually exceeds the eval + compaction cost.
Economics (§1) is the first gate: even if fragmentation is real, if the dispatch-avoidance gain is sub-dollar it remains unimplemented.

## 4. Outcome Summary

- **Phase 1 (coarsening): not implemented.** Primary basis economics; the measurement is inconclusive, so whether the target exists is undetermined.
- **Phase 2 (inline-K): not implemented/deferred.** cents-scale gain + compaction risk + mandatory heavy eval.
- **skills/ unchanged** — consistent with the user's original instruction ("revert edits to existing skills"). This branch's deliverables = this decision record + the spec.

## 5. Meta-lesson

After execution speedup is already optimized by ①–④, the remaining dispatch-avoidance levers (a) save only cold-start overhead, hence sub-dollar, and (b) if you measure whether fragmentation exists via a single dispatch, the tool biases the answer. The largest untouched $ item is still the **Opus final review** (outside this spec's scope) — the next re-strategy should start there.

---

# v2 Re-measurement (2026-07-21) — Strengthened Bias Defenses

**Motivation**: v1's (§2) fragmentation measurement was inconclusive because the single-dispatch synthetic generator was coarse-biased. v2 (A) promotes an **exhaustive survey** of actual grouped plans to a binding sample, (B) measures S·a empirically, and (C) folds the **tier-up trap** into the economics to re-adjudicate both gates.

**Conclusion (unchanged, basis strengthened)**: Both levers **not implemented**. v1 saw economics as "sub-dollar marginal", but v2 shows via measured S·a + tier-up that **coarsening/inline-K are net-negative in the main target cases** — no longer marginal but a **loss**. Fragmentation is **inconclusive** even on real data at N=3 (high variance, mixed direction) and no longer supports the hypothesis.

## v2-1. Fragmentation — Exhaustive Survey of Actual Grouped Plans (binding sample)

Exhaustively survey **all** actual plans using the current `### Group` format across main + 5 worktrees + sibling checkouts (v1 used only 1). **Do not aggregate** with synthetics (avoid repeating v1's dilution error) — real data is adjudicated separately.

| Plan | source | groups | tasks | distribution | avg t/g | solo |
|---|---|---|---|---|---|---|
| `2026-07-10-size-classifier` | real | 3 | 5 | 2,2,**1** | 1.66 | 1 (33%) |
| `2026-07-18-sdd-agent-files` | real | 3 | 8 | 3,2,3 | 2.67 | 0 |
| `2026-07-20-codex-advisory-tiering` | real | 1 | 2 | 2 | 2.00 | 0 |
| **real aggregate (N=3)** | | **7** | **15** | | **2.14** | **1/7 (14.3%)** |

**Gate verdict (real data)**: `avg 2.14 ≥ 2.0` and `solo 14.3% ≤ 20%` → **neither trigger fires**.

**But this is not "no fragmentation" — it is inconclusive** (honesty rule):
1. **High variance, mixed direction.** 1.66 / 2.00 / 2.67 — size-classifier alone **fires both triggers by itself** (1.66<2.0 AND 33%>20%), the other two do not. At N=3 the aggregate lands just above 2.0 (2.14) = borderline.
2. **The fingered culprit does not actually over-fire.** There is a counterexample in the real data to `writing-plans:55-56` (standalone→solo), the culprit v1 fingered — **`sdd-agent-files`'s Group 3 bundled the 3 "Skill and doc updates" tasks into one group rather than splitting them into solos** (even though they are doc tasks). That is, the "doc = solo" tendency is not universal, and the exception operates context-dependently.
3. The real signal is not "fragmentation present/absent" but **"group granularity is high-variance and context-dependent"**. For a deterministic coarsening rule to be justified, fragmentation must be **systematic**, but the real data is not systematic.

**N and residual bias stated explicitly**: actual grouped plans number only **N=3** across every checkout worldwide (the current Group format was introduced recently → earlier plans are flat, group-level measurement impossible). This is the binding sample, and it is small. Inflating N with synthetics would repeat v1's dilution error, so it is not done (the defense-B probe is separated into v2-4 as **secondary, bias-flagged**).

## v2-2. Empirical S·a (skipped in v1)

**S = cold-start input tokens saved per avoided dispatch** (measured sum, chars/4):

| cold-start component | measured | saved when inlined? |
|---|---|---|
| `implementer-prompt.md` | 1,850 tok | ✅ (controller already holds it) |
| `test-driven-development/SKILL.md` | 2,913 tok | ✅ |
| injected `using-harness-flow/SKILL.md` | 1,424 tok | ✅ |
| group brief (measured: sdd-agent-files G1 = 21KB) | ~5,260 tok | ✅ (controller holds the plan → no re-read) |
| **harness-flow re-injection subtotal** | **~11.4K** | |
| system prompt + tool schemas | ~8–14K (GSD anchor, outside repo) | ✅ (controller already paid it) |
| **total S** | **~20–25K input tokens/dispatch** | (0 cross-dispatch cache reuse → full price) |

→ **cold-start saving per avoided dispatch (input only, tier-weighted):**

| Tier | S≈20K × input rate |
|---|---|
| Haiku ($1/Mtok) | **$0.020** |
| Sonnet ($3) | **$0.060** |
| Opus ($5) | **$0.100** |

Order-of-magnitude match with v1's GSD 14K anchor estimate ($0.014–0.070), except harness-flow's S is **larger than the anchor** (~22K) because of skill re-injection. The qualitative conclusion is unchanged: one avoided dispatch = **cents-scale**.

**a = per-task inline accumulated context** (compaction driver): file reads (2–4 × ~500) + diff (~1–2K) + test output (~500) ≈ **~5K tok/task**. compaction limit `T ≈ (160K−40K)/5K ≈ 24 tasks`, quality-discounted K*≈12. **Real plans are ≤8 tasks** → the compaction risk of real-size inlining is **low** (this item alone favors inline-K, but the tier-up below dominates).

## v2-3. Economics Gate (first gate) — net-negative via the tier-up trap

v1 saw it as "gain cents, risk comparable → marginal". v2 introduces the **tier-up trap** to show it is a **loss**.

**Tier-up trap (coarsening).** The skill sets a group's tier to the "highest-complexity task" (`SKILL.md:159-160`). Coarsening's main target = **merging a cheap (Haiku) solo into an adjacent standard (Sonnet) group** (e.g. size-classifier's doc solo). Merging **shifts that task's work tokens (especially output) from Haiku to Sonnet rates**:

| item | calculation | $ |
|---|---|---|
| cold-start saved from removed Haiku dispatch | ~20K in × $1/Mtok | **+$0.020** |
| tier-up: work **input** (~10K, Haiku→Sonnet) | 10K × ($3−$1)/Mtok | −$0.020 |
| tier-up: work **output** (~5K, Haiku→Sonnet) | 5K × ($15−$5)/Mtok | −$0.050 |
| **net effect per merge** | | **≈ −$0.05 (loss)** |

→ **coarsening's representative case (cheap solo → standard group) loses money.** Only same-tier merges are net-positive, but those save only sub-dollar cold-start (+$0.02–0.06), and real plans already have ~3 groups so there are barely any groups left to remove.

**Inline-K trap.** Inlining removes the dispatch entirely, but the work runs on the **controller tier (session model = usually Opus/Sonnet, the most expensive)**. Inlining a 2-group (Haiku/Sonnet) plan into an Opus controller:

| item | calculation | $ |
|---|---|---|
| cold-start saved from 2 dispatches | 2 × ~$0.06 | +$0.12 |
| tier-up: work input (~40K, Sonnet→Opus) | 40K × ($5−$3)/Mtok | −$0.08 |
| tier-up: work output (~20K, Sonnet→Opus) | 20K × ($25−$15)/Mtok | −$0.20 |
| **net effect per plan** | | **≈ −$0.16 (loss)** + compaction risk |

→ **inline-K is also net-negative** (once the controller tier is accounted for). This item that v1 skipped is decisive.

**Eval amortization.** A pre-registered Phase-1 eval (blind panel + decoy + BLOCKED rate, many plans × runs) ≈ 20–40 dispatches + panel reasoning ≈ **$3–5 one-time** + build cost. Against the best case (same-tier merge +$0.06/feature) the break-even ≈ **60–80 features**; for tier-up cases the amortization itself is **negative and hence unreachable**.

**Δ$ verdict**:
```
Δ$ = cold-start_saving − tier_up_cost − eval/N
   main target case: ≈ (+$0.02) − ($0.07) − eval/N  <  0
```
→ **Economics gate FAIL (robust).** Stronger than v1's "marginal" — the representative case of both levers is **a loss by measurement**. **Independent** of whether fragmentation is real.

## v2-4. Defense-B Probe (secondary — bias-flagged)

**Caution (not load-bearing)**: the below is not real data but a synthetic produced by a subagent applying the current skill. As the advisor noted, forcing bottom-up **relocates bias rather than removing it** (the decomposer controls t/g). Moreover I **intentionally stacked the deck with standalone fragments** in the spec (toward fragmentation). Sole purpose: "**when the skill is applied to a spec loaded with standalone fragments, does the standalone→solo exception over-fire?**" — this result cannot overturn the verdict above (economics already decides it).

**Probe results (synthetic, N=3 specs, each N=1 run → unreliable)**:

| spec | groups | tasks | avg t/g | solo | standalone bait handling |
|---|---|---|---|---|---|
| SPEC 1 (CLI `--json`) | 1 | 1 | 1.0 | 1 (**structural**) | README → absorbed into a doc step |
| SPEC 2 (audit groundwork) | 2 | 3 | 1.5 | 1 | redact_pii solo (obvious); backfill → grouped with the migration (consumes the schema) |
| SPEC 3 (webhook receiver) | 3 | 6 | 2.0 | 1 | load-test solo (defensible); dead-letter → handler group; runbook → absorbed into a doc step |
| **synthetic aggregate** | **6** | **10** | **1.67** | **3 (50%)** | |

**Interpretation — the raw aggregate misleads, the mechanism verdict is the opposite**:
- The raw `1.67 / 50%` fires the gate, but **it is the result of stacking the deck with standalones, not skill misbehavior**. SPEC 1's solo is not the exception firing but **structural** (a 1-task plan is by definition a solo group) — this one alone inflates the solo%.
- **Core mechanism verdict**: of the **6 baits that look standalone, the skill folded 4 (README, backfill, dead-letter, runbook)**, leaving only 2 solos (redact_pii = clearly independent test cycle, load-test = defensible). That is, **the standalone→solo exception did not over-fire.** The criterion that carried weight was not "surface separation" but "**shared *construction* context / consumption relationship**", and that suppressed the exception.
- This is **in the same direction** as v2-1's real-data counterexample (sdd-agent-files G3 not splitting docs into solos) — **disproving** v1's assumption that the fingered culprit over-fires, on both real and synthetic sides.

**Honesty flag**: synthetic N=1 runs/spec are unreliable (the lesson of size-classifier §3). This probe is merely corroborating evidence in the **"no"** direction to "does the exception over-fire?"; it does not move the fragmentation verdict from real data (v2-1, binding) to the probe.

## v2-5. Final Verdict on Both Gates (v2)

| Gate | verdict | basis |
|---|---|---|
| **① Fragmentation** | **inconclusive** (does not fire, but borderline/high-variance) | Real data N=3: 2.14 t/g, 14.3% solo. Neither trigger fires, but high variance, mixed direction, small N → not "absent" but undecidable. Counterexample to the fingered culprit (standalone→solo) demonstrated (sdd-agent-files G3). |
| **② Economics (first gate)** | **FAIL (net-negative)** | Measured S≈22K → one avoided dispatch is cents. Via the tier-up trap coarsening (−$0.05/merge) and inline-K (−$0.16/plan) are **a loss**. eval $3–5 cannot amortize. |

**Conclusion**: Economics (the first gate) fails **independently** of fragmentation, and this time it fails as **net-negative** rather than marginal. Fragmentation is inconclusive even on real data and does not support the hypothesis. → **Resuming Phase 1 (coarsening) is unwarranted, Phase 2 (inline-K) is unwarranted.** skills/ **unchanged.**

**Re-challenge conditions (updated)**: coarsening/inline-K only when all three hold — (a) a **mechanism that directly defends the tier-up trap** (e.g. merge only same-tier groups, or force inlining onto a cheap tier rather than the controller tier) **and** (b) a re-measurement showing that actual multi-session fragmentation is **systematic** **and** (c) a measurement showing the avoided net-$ exceeds the eval cost. The next token-cost lever is still the **Opus final review tier** (outside this spec).

## v2-6. Coverage Gap: the Large Mechanical Migration Class (user counterexample)

**Motivation**: the user offered a counterexample — "a task moving 30+ files across directories + fixing the referencing packages gets split into 4-5 groups; is that right?". v2-1's real plans N=3 were **all small skill/hook edits**, so this class was 0 in the sample. No real history (user confirmed) → synthesize a representative spec (`scratchpad/migration-spec.md`: `@app/core` 30 files, flat→feature reorganization + fixing imports in 3 sibling packages) and run writing-plans bottom-up decomposition **twice independently**.

| run | groups | tasks | avg t/g | solo | tier |
|---|---|---|---|---|---|
| A | 4 | 7 | 1.75 | 1 (33%) | all cheap |
| B | 3 | 5 | 1.67 | 2 (40%) | all cheap |

**Synthetic and N=2 runs/1 spec → unreliable. No real plan (a class with no binding sample).** But the agreement between the two runs is strong:

1. **The fragmentation gate fires for this class.** avg 1.67–1.75 < 2.0 AND solo 33–40% > 20%. **The opposite of v2-1's small plans** — here fragmentation is numerically systematic. But both runs judged the group decomposition **justified** (module-boundary / fan-in driven, not arbitrary cutting). That is, "low t/g" but not "wrong grouping". The group count is high-variance (A=4/B=3, same order as the user's observed 4-5) — reconfirming v2-1's "grouping high-variance".

2. **The economics gate flips for this class (tier-up void).** All **cheap, same tier** → coarsening/consolidating shifts **no** work-token tier = 0 tier-up penalty. Reducing 3-4 cheap cold-starts (~$0.02 each) to 1-2 is **net-$ positive** (~$0.04–0.06/migration, no downside). **v2-3's "coarsening net-negative" does not apply to this class** — this is v2's clear **exception class** (same-tier mechanical).

3. **The real problem is not the fragmentation count but a machinery mismatch (correctness):**
   - **TDD Red→Green does not fit** — a pure move has no new-behavior test. The gate is a single `tsc -b` + `vitest run`.
   - **bite-size (~5 steps/task) conflicts with atomicity** — moving a fan-in sink like `utils` breaks all consumers, forcing **20+ importer edits in one commit** (exceeding bite-size) or **shim/codemod-first** (scaffolding the skill does not describe).
   - **The only rule for green per commit**: the *entire importer closure* of a moved file (internal + 3 sibling packages + exports/tsconfig) in the same commit. A naive per-feature commit is RED. Atomicity is not natural but **engineered**.
   - features are not cleanly independent either (shared utils always, cross-cutting models like audit/notify leak across boundaries).

**Verdict (this class)**: "are 4-5 groups right?" →
- **The group count itself is defensible** (module/fan-in driven). It is **not** over-fragmentation that splits shared context.
- **But 3-4 separate cold-start dispatches for a same-tier mechanical migration are wasteful** (no tier-up offset) + **the TDD/bite-size/per-task-commit machinery is fundamentally mismatched.** The user's intuition ("something's off") is correct.
- **But fixing this is not the coarsening lever.** The intervention needed is **mechanical-migration routing** — e.g. a note in writing-plans ("pure move + import-rewrite does not apply TDD Red→Green, gate on `build + existing tests green`, fan-in sinks are codemod-first, each commit = the entire importer closure") + routing in SDD to a single codemod pass / trivial tier. This is a **different intervention** from the coarsening that v1/v2 measured and rejected.

**Open (needs user decision)**: this intervention's primary justification is not $ but **correctness** (preventing red commits / undocumented shims). The repo gate is speed/tokens primary, quality a constraint ([[changes-optimize-speed-and-tokens]]). The $ saving is real but small (~$0.05/migration). So before editing the skill, confirm with the user (a) how frequent this class is in the user's workload, and (b) whether to justify the correctness improvement as token-neutral.

### v2-6a. Routing-note RED test → failure not reproduced → note not adopted

The user chose "add the routing note". Per the writing-skills Iron Law (a failing test first, even for edits), I attempted to reproduce as a RED test the failure the note was meant to prevent — "**a cheap implementer, using the current skill, does a naive move-then-fix commit → build RED**".

**RED setup**: have a **haiku (cheap, the actual migration routing tier)** implementer decompose the commits for moving the `utils` fan-in sink using the current writing-plans. No note.

**Result: failure not reproduced.** haiku, without the note, **derived the shim-first codemod pattern on its own** — (1) move the file + re-export shim at the old path → tsc green, (2) migrate core-internal imports → green, (3) migrate the 3 sibling packages + delete the shim → green. **Every commit tsc -b PASS**, atomic. The predicted red commit did not happen.

**3/3 convergence**: run A (capable), run B (capable), RED (haiku) **all** derived a green-safe, importer-closure/shim approach without the note. That is, the note would **document behavior the agent already does** → unjustified under the Iron Law (no failure).

**Verdict: routing note not adopted. skills/ unchanged.**
- The correctness justification evaporates — the current skill + an arbitrary-tier implementer already produce green migrations.
- What remains is the dispatch-count $ (~$0.05/migration, small) — still below the bar under v2-3's mandatory eval-cost logic, and moreover in this case the fix is not coarsening either.
- **Residual bias/limits**: RED is a haiku N=1 run (though combined with A/B it is 3/3 same-direction). "4-5 groups" itself is real and defensible but not a defect. To re-challenge, a demonstration that cheap implementers **systematically** produce red commits (larger N) must come first — current evidence is the opposite.

**Final: this class too, skills/ unchanged.** The user's observation (4-5 groups) is real, but the plans are green-safe, the tiers are uniformly cheap, and the note's failure premise does not reproduce.

### v2-6b. The user's real experience = #3 (not correctness, but perceived speed/tokens)

User confirmed: what they saw in a native migration was **neither a broken build (#1) nor messy shims (#2), but "4-5 groups = many separate dispatches feel slow and token-wasteful" (#3)**. That is, zero correctness issues — a **perceived dispatch-count** problem.

**Verdict (why skills still recommended unchanged):**
1. **Already permitted.** The skill says "Group by shared context, not to hit a count", so it already permits consolidation — run B bundled 3 features into **1 group**. The skill does not *force* 4-5 (A=4/B=3 spread). That is, "splitting too much" is not a skill defect but **upward spread from the absence of steering**.
2. **$ is small.** Same-tier so no tier-up, so consolidation is net-$ positive but ~$0.05/migration. The latency is only the sequential portion of 2-3 dispatches (a few minutes). If frequency is low, the total gain is marginal.
3. **Simplicity cost.** Adding a mechanical-migration special-case rule to writing-plans = every reader reads it every time. Excessive against a marginal gain.
4. Even under the speed/tokens first gate ([[changes-optimize-speed-and-tokens]]) the delta is small, and since the skill already permits consolidation, the net gain of a rule is unclear.

**flip condition**: if the user does 30+ file migrations at **high frequency** (weekly, etc.), the cumulative speed/token gain could exceed the simplicity cost → only then add a minimal 1-line steer ("uniform mechanical migration uses only the minimum groups the module boundaries require; minimize dispatch count") after justifying it with RED/GREEN. With current information, **unchanged**.
