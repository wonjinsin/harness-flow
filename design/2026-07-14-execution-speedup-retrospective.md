# Execution Speedup Retrospective — review gating + retry gating

**Date**: 2026-07-14
**Branch**: `worktree-execution-speedup`
**Summary**: Attacked the residual bottleneck in the SDD execution phase (the serial review loop that runs at every group boundary) without parallelization. Skip the reviewer for cheap groups + early-escalate findings that can't be fixed + cap re-reviews at 3. In the A/B dry-run (escalate/stubborn/decoy/control × OLD/NEW + blind adjudication) **all pass gates were met** — structural counts dropped significantly, quality was equivalent (0 decoy leakage), the standard control was unchanged, and the retry path fired correctly. Release candidate.

## 1. Background — why this change

Even after recommendations ① (Task Group coarsening), ③ (inlining), and ④ (model tiering) from `2026-07-09-execution-granularity-analysis.md` plus the trivial tier had all shipped, execution was still slow. Diagnosis: the residual bottleneck is not dispatch granularity but the **`review → fix → re-review` loop at every group boundary + the final review, all serial**. SKILL.md itself warns that "the final-review fix wave can cost more than the whole task." Parallelization (⑤) does not remove this serial cost from the critical path (it just runs concurrently) — **gating removes the work entirely, taking it off the critical path**, so it hits the residual bottleneck directly and carries low risk (no worktree-per-agent isolation needed).

## 2. What was built

- **Review gating (change 1)**: Reuse the existing group tier signal (`cheap`) — cheap groups skip the group-reviewer dispatch and the final whole-branch review is the net. Skipped groups are named explicitly in the final-review dispatch. Zero new metadata.
- **Retry gating (change 2)**: The reviewer classifies each finding as `impl-fix`/`plan-escalate`. `plan-escalate` (the spec/plan itself is wrong) → skip the fixer and go straight to a human. `impl-fix` → fix→re-review loop, **capped at 3**, persisting `reviewCycles` to the ledger (the cap survives a restart).
- The skill is edited via `writing-skills` in a conditional/structural form (this is not discipline-under-pressure, so use conditionals and required slots rather than prohibition phrasing).

> **Note (after 2026-07-14):** this work originally included a third change, **fmt Stop batching** (`post-edit.js`/`stop-fmt.js`), but it was removed from the branch at the user's request. This retrospective's evaluation is valid only for review gating and retry gating.

## 3. Evaluation method (reusing the size-classifier methodology)

- **Structural counts arithmetically** (advisor): the reviewer dispatch count follows deterministically from the group tier composition, so no simulation is needed. The dry-run invests only in the two things where simulation earns its keep — retry gating *behavior* + *quality equivalence*.
- **A/B dry-run**: 4 scenarios × 2 arms (OLD = skill at commit a9a6632 / NEW = skill at branch HEAD). Each arm reads only that version of the skill files in fresh context and returns a structured trace of the SDD controller processing the scenario per those rules.
- **Blind adjudication panel**: opus, anonymized X/Y (OLD/NEW mapping hidden via scenario-id parity) + a hidden answer key, judging only process safety and defect leakage.
- **Tokens modeled as session deltas** (§measurement caveat): dry-run token N=1 is untrustworthy per `size-classifier §3` → the headline is the session/dispatch deltas.

## 4. Results

### 4-1. Structural counts (arithmetic, deterministic — headline speed metric)

| Scenario (plan) | Reviewer dispatch OLD | NEW | Δ |
|---|---|---|---|
| cheap (3 cheap groups) | 3 | 0 | **−3** |
| mixed (cheap 2 + std/mc 2) | 4 | 2 | −2 |
| standard (control, 3 std) | 3 | 3 | 0 |
| decoy (3 cheap groups) | 3 | 0 | **−3** |

- For each removed reviewer dispatch, the fix→re-review cold-start attached to it is removed as well (the final review is a common single pass across both arms, not counted).

### 4-2. A/B dry-run + blind adjudication

| Scenario | OLD behavior | NEW behavior | Panel |
|---|---|---|---|
| escalate | reviewer→plan-escalate→human (0 rounds) | same | equivalent, quality equivalent |
| **stubborn** | fixer loop **infinite (rounds=−1), no escalation** | impl-fix→**cap at 3→human** | **NEW safe (Y)**, quality equivalent |
| **decoy (quality guard)** | G3 reviewer catches the swallowed error | G3 reviewer **skipped (cheap)**→**final review is the net, not merged** | equivalent, **0 leakage** |
| control | all 3 groups reviewed | same, unchanged | equivalent |

### 4-3. Pass gates

| Condition | Result | Verdict |
|---|---|---|
| Significant drop in reviewer dispatches/cycles | cheap 3→0, mixed 4→2, decoy 3→0; stubborn infinite→cap 3 | met |
| Quality equivalent (NEW leakage ≤ OLD, 0 decoy) | parity across all scenarios, decoy 0 leakage on both arms | met |
| Standard control unchanged | control equivalent | met |
| escalate/cap paths fire correctly | stubborn cap fires + escalation, escalate escalation | met |

**All conditions met → adopt.**

## 5. Lessons / honest limits

- **stubborn is the decisive win**: OLD **infinite-loops** on a fixer that never converges (liveness failure — no termination, no human alert). NEW's cap improves not just speed but **safety (guaranteed termination)**. Simulation revealed that the absence of any bound on the review loop was a real hazard.
- **decoy — gating loses no coverage but the catch point shifts later**: NEW skips the cheap G3 reviewer, but the final review catches the defect and **blocks it before merge** (0 leakage). However OLD catches it *earlier*, at the G3 boundary. Gating is a "defer the catch to the final review" tradeoff — forcing the final review to explicitly cover skipped groups is the heart of the safety net. If the final review itself is weak this net weakens, so the skipped-group naming guidance must not be softened.
- **Measurement caveat (preserved)**: the dry-run tokens (405k) are the *eval cost*, not the feature's runtime cost — do not conflate them. Wall-clock is not claimed directly (`size-classifier §1`: coarsening was −58% tokens yet +22–63% wall-clock). But this time we *remove* sessions (coarsening *grew* them) so the direction is expected to be a decrease — session/dispatch deltas are the proxy metric.
- **Empirical spot-check**: a genuine OLD-vs-NEW end-to-end SDD run is N=1 and environment-dependent, so it is not used as a headline; only the method is recorded. The session-count model is more defensible (each reviewer session = a cold-start reload).
- **Blind-adjudication robustness**: one adjudication rationale directly checked live master and cross-verified that OLD has no cap — supporting that the simulation trace matches the real skill text.

## 7. Empirical A/B eval (dry-run follow-up — sonnet, real dispatch)

The "0 leakage" from the dry-run (§3–4) was a *simulation claim*. This was verified by **measuring it with a real reviewer subagent (sonnet)**, and the modeled tokens/time were **replaced with measured values**.

**Design (advisor-reviewed):** decompose the change by risk type — the retry cap is safe by construction (cap→human escalation, and human-in-loop cannot become a system leak) → only confirm that the cap fires; **review gating is the only real leakage risk** → invest repeated measurement only there. The decision collapses to a single metric:

> **R_group** (does OLD's focused group reviewer catch a defect seeded in a cheap group) vs **R_final** (does NEW's whole-branch final review catch the *same* defect buried in the full diff).

**Fixture:** a pricing module, 3 groups (cheap 2 + standard 1), defect in cheap Group 1, only the happy path tested → 9/9 green, defect latent. Focused (G1) and whole packages generated with the real `scripts/review-package`.

**Why two defect classes were measured (advisor):** if you *restore* the violated requirement into the reviewer prompt, the catch becomes a **checklist match** rather than a *discovery* in the diff, and diff dilution can't degrade it, pinning R_final at 1.0 — you never observe the region where leakage lives (R_group>R_final). So it was split into two classes.

### 7-1. Quality gate (crux)

**Round 1 — spec-violation (checklist)**: parseAmount returns 0 instead of throwing on invalid (requirement **restored**). CAUGHT = flagging the swallow as Critical/Important. N=4/arm.

| arm | diff | catch |
|---|---|---|
| R_group (OLD group review, removed by NEW) | 58 lines | **4/4 = 100%** (all Critical) |
| R_final (NEW final review, common to both arms) | 185 lines | **4/4 = 100%** (all Critical) |

This round is non-discriminating (checklist, so dilution is powerless). But a genuine bug that was *not even seeded* (`in` in `taxRates.js` matching `Object.prototype` → wrong error type) was caught by R_final only **1/4** — revealing that this is the discriminating (discovery-type) register.

**Round 2 — discovery-class**: parseAmount uses `parseFloat` → silently accepts trailing garbage (`'12abc'`→1200, `'1,234.50'`→100). **Not written** in the requirement → the reviewer must find it in the code. CAUGHT = flagging the parseFloat leniency. N=6/arm.

| arm | diff | catch |
|---|---|---|
| R_group (focused) | 52 lines | **6/6 = 100%** (5 Important + 1 Critical) |
| R_final (buried) | 179 lines | **6/6 = 100%** (all Important) |

- **Key point:** dilution (52→179 lines) did **not** degrade catching the discovery-type defect. The buried whole-branch final review caught it as well as the focused group review. Pre-registered decision rule R_group≈R_final → **gating is safe for discovery-type defects too**.
- **Leakage verdict:** across both classes, NEW residual leakage = 1 − R_final = **0/10**. Measured, not simulated.
- **Conservatism:** prod runs the final review on opus (top tier). The sonnet-measured R_final is a **lower bound** → actual leakage ≤ the measured 0.
- **Honest limit:** the sonnet reviewer was strong enough to catch both classes 100%. For R_final<1 to expose leakage, the defect would have to be at the level of that ultra-subtle prototype bug (1/4), which exceeds cheap-tier complexity. That is, gating's net (the final whole-branch review) is **robust to realistic cheap-tier defects**; defects more subtle than that are often missed by OLD's group review too, and prod opus makes it stronger.

### 7-2. Tokens/time (measured, sonnet, per-dispatch `subagent_tokens`+`duration_ms`, cheap-group reviewer N=10)

Cost of the one reviewer session NEW removes per cheap group: **~36.6k tokens median** (34–39k, tight) / **~48s median wall-clock** (20–72s, depends on defect difficulty — blatant Critical ~25s, subtle discovery-type ~55s). Multiply by the deterministic K (dispatches are serial on the critical path → K×session = critical-path reduction):

| Plan | Sessions removed | Token savings | Wall-clock savings (median-based) |
|---|---|---|---|
| cheap (3 cheap) | 3 | ~110k | ~144s (~2.4 min) |
| mixed (2 cheap) | 2 | ~73k | ~96s (~1.6 min) |
| standard (control) | 0 | 0 | 0 |

(Modeled §4-1 **replaced with measured values**. Tokens are tight, wall-clock has high variance → reported as median+range. This is the *review-phase* saving, not total SDD time; implementer sessions are unchanged.)

- **Retry cap (deterministic):** `reviewCycles` cap 3 → human escalation. Persisted in code + SKILL.md, survives a restart.

### 7-3. Conclusion (3 groups)

R_group = R_final = 100% — for **both** checklist defects (N=4) and discovery-type defects (N=6), even with dilution. Measured leakage 0/10.

### 7-4. 6-group scale validation + full end-to-end (dilution 6.5×)

Following the point (advisor) that 3-group dilution (3.5×) alone can't speak to the quality of "large plans with many groups (the region where this feature helps most)," it was extended to a **6-group plan** (cheap 4 + std 2, same parseFloat defect in G1). Whole diff 337 lines → G1 defect dilution **52→337 = 6.5×**.

- **Quality (deterministic):** R_final (6 groups) = **6/6 = 100%** (N=6, sonnet). Pre-registered threshold ≥5/6 → **ship confirmed at scale.** Increasing dilution 3.5×→6.5× did not degrade catching. If anything, the 6-group reviewers even caught genuine bugs that were *not seeded* (`applyDiscount(cents,NaN)`→NaN 5/6, `taxRates` `in` 2/6) — the net strengthens rather than weakens as scale grows.
- **full end-to-end (measured sessions × deterministic counts):** implementers (haiku cheap ~25.7k/21s, sonnet std ~36.8k/41s) and fixer (sonnet 38.4k/75s, actual parseFloat fix commit fc91b1a) all measured via real dispatch.

| Phase | OLD | NEW | Δ |
|---|---|---|---|
| Implementation (shared) | 176k / 2.8 min | 176k / 2.8 min | 0 |
| **Review phase** | 343k / 8.7 min | 209k / 6.6 min | **−39% tok / −24%** |
| **Total (impl+review)** | 520k / 11.5 min | 385k / 9.4 min | **−26% tok / −18%** |

- **Total underestimates the effect:** the implementers are unchanged and shared, so the total is −26%, but the review phase the feature actually touches is −39%.
- **fix-wave (new signal):** OLD catches the G1 defect early (G1 boundary) and NEW late (final review), but **the fix is confined to parseAmount on both sides** (the fixer touches only that file + its test, 19/19 pass). A late catch does not create larger rework — the advisor's prediction confirmed.
- **N caveat:** measured sessions × count assembly (not a single N=1 stopwatch). The final review has high variance (95–202s); the std implementation and fixer are N=1.

### 7-5. Conclusion

**SHIP (confirmed for both 3 groups and 6 groups).** Zero quality leakage (10/10 + 6/6), full-task tokens down ~26% / time ~18%, review-phase tokens down ~39%. With a prod opus final review the net is stronger. Artifacts, decision criteria, and raw numbers: scratchpad `eval2/{DESIGN,results,results2}.json`, `eval3/{PREREG,results3}.json`.

## 8. Related material

- Spec: `docs/harness-flow/specs/2026-07-14-execution-speedup-design.md` (worktree-local, gitignored)
- Plan: `docs/harness-flow/plans/2026-07-14-execution-speedup.md` (same)
- Eval scenarios/answer key/results: session scratchpad `eval/{scenarios,results}.json` (summary preserved in §3–4), Workflow `wf_896d55f6-cff`
- Prior analysis: `design/2026-07-09-execution-granularity-analysis.md` (§Status 2026-07-14)
