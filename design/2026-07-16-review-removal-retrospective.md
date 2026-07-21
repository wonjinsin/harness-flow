# Retrospective: Full removal of group reviews + severity floor (final-only review)

**Date**: 2026-07-16
**Branch**: `worktree-review-removal-final-only` (release 1.3.0)
**Summary of conclusion**: A superset re-challenge of P5 (mid-run group skip, E5 fell short at 6/8) that was rejected earlier this morning. P5's failure mode (Minor demotion after discovery) is defended directly with a **severity floor block** and re-measured with a pre-registered eval — **6/6 caught, 0 demotions, gate (≥5/6) passed**. The group-boundary reviewer is removed entirely, and a single final whole-branch review nets every group.

## 1. Changes (1.3.0)

| Target | Change |
|---|---|
| `sdd/SKILL.md` | Deleted the Review Gating section → `Final Review Nets Every Group` (deliver all group briefs + severity floor block + finding-class block, all inserted into the dispatch prompt — the `code-reviewer.md` template stays uncontaminated). Review Loop → `Final Review Loop` (ONE fixer → verify-fix, cap 3, `final: reviewCycles` ledger key, plan-escalate → human) |
| `sdd/task-reviewer-prompt.md` | Re-purposed into a verify-fix-only template (description `Verify fix wave (final re-review)` — intentionally not covered by `pre-agent-model.js`: on a missing model, inherit the session model = the tier the review wants, fail-safe) |
| `sdd/references/example-workflow.md` | Rewritten to the final-only flow |
| `CLAUDE.md`, plugin manifests | Restated chain item 5, 1.1.9 → **1.3.0** (1.2.x was consumed by the plan-demotion revert) |
| Unchanged | `implementer-prompt.md`, all hooks, tests, scripts, inline path, pre-flight scan, model tiering (P3 all-cheap→sonnet final included) |

## 2. Why a same-day re-challenge on the day P5 was rejected is valid

P5 (zero-finding streak gating) was an **undefended skip**: in E5, the final review demoted a mid-group defect to Minor in 2 of 8 runs as a "type-contract nit, not a correctness bug" → 6/8 < gate. The lesson from v2 retrospective §3 was "the strength of the final-review net depends on the narrative clarity of the defect," and this change removes that narrative dependency at the prompt level: **"Rate severity by consequence, not by surface form … A Minor rating on such a finding requires a one-line justification"**. In writing-skills' form-matching terms this is not a prohibition but a positive recipe + REQUIRED slot — the right form for a "verdict-shape error" like demotion.

## 3. Pre-registered eval (isomorphic to P5's E5, only the treatment added)

- **PREREG**: session scratchpad `eval/PREREG.md`, frozen before observing results.
- **Fixture** (E5-replica, discovery-class type-contract, not recorded in the brief, latent with all tests green):
  - fixture-a: `loadRate` returns rate from config as a **string** → violates the `rate: number` contract of `applyDiscount(subtotal, rate)`. Produces the correct answer via implicit coercion.
  - fixture-b: `parseItems` returns qty as a **string** (brief: "qty an integer") + a masking test (`qty * 1 === 2`).
- **Treatment**: final review dispatch = review package + all 3 group briefs + severity floor block + class block, reviewer **sonnet** (prod opus lower bound), n=6 (3 reps per fixture).
- **Judgment**: sonnet judge + manual re-judgment of every rep from raw text by the controller (v2 §3.2 convention) — the two are in complete agreement.

| rep | fixture | result | severity | location accuracy |
|---|---|---|---|---|
| 1 | a | caught | Important (impl-fix) | discount.js:14 loadRate |
| 2 | a | caught | Important (impl-fix) | discount.js:11-14 (+cross-group noted) |
| 3 | a | caught | Important (impl-fix) | discount.js:16 |
| 4 | b | caught | Important (impl-fix) | parse.js:4-9 (+test masking flagged) |
| 5 | b | caught | Important (impl-fix) | parse.js:6-7 (+test relaxation flagged) |
| 6 | b | caught | Important (impl-fix) | parse.js:4-9 (+masking flagged) |

**TALLY 6/6, 0 Minor demotions, gate (≥5/6) passed.** E5 (no floor) 6/8 → floor 6/6: the 2 demotions disappeared exactly. Side observation: 3 of the 6 reps flagged things that were not even planted (the masking test, an NaN-guard bypass scenario) — attaching the brief actually functions as spec-compliance inheritance.

## 4. Determinism arithmetic

- Reviewer dispatch (per plan composition, vs. 1.1.8): std 3-group 2→0, mixed 4-group (c,s,c,s) 1→0, all-cheap 0→0 (unchanged). Against the v2 §9 real case (n=3 std, review 130.6k tok), removing all group reviews eliminates **−130.6k tok** and 2 serial review sessions (each 28–149s + cold-start).
- The core pain the user pointed to ("group reviews take too long") = the serial group-review wait itself goes to 0.
- Human gate: neutral-to-later (findings concentrate at the final) — an honest disclosure. The risk of an expanded fix radius is capped by ONE fixer + verify-fix cap 3.

## 5. Limitations · unverified

- **Sonnet lower-bound measurement** — prod final review is opus (non all-cheap plan), so the net will be stronger. The all-cheap path (P3) has sonnet as prod, so this measurement is prod for that path.
- **Most-capable defect class not represented**: the fixture is the type-contract class. Demotion resistance for design-judgment defects (wrong architectural choice) is unmeasured — the spec-risk clause stands as is.
- **Catch-delay cost unmeasured**: the propagation cost of a defect staying latent until the final while downstream groups build on top of it is outside both E5 and this eval (only catch rate is measured).
- Eval cost: 6 reviewer + 1 judge dispatches, subagent total ~257k tok (not a functional runtime cost).
- Session mishap: the Group 3 implementer died on an API error without writing a report — all artifacts existed, so the controller verified them directly before proceeding (noted in the ledger). Same procedure on recurrence.

## 6. Lineage

superpowers (2 dispatches per task) → 46386f0 group coarsening → 1.1.8 gating (cheap+last) → **1.3.0 full removal + severity floor**. In the 6-harness survey (`design/2026-07-09-execution-granularity-analysis.md`), the only harnesses doing per-group AI review mid-execution were the superpowers family — with this change harness-flow also joins the "one boundary review + gating/defense" camp (GSD/gstack/OMC), but adds its own touch: brief inheritance and the severity floor.
