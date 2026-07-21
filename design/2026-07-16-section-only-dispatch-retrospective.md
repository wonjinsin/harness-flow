# Section-Only Dispatch Retrospective — Negative Result (release held)

**Date**: 2026-07-16
**Branch**: `worktree-section-only-dispatch` (preserved, unmerged)
**Conclusion summary**: An experiment to change the SDD dispatch payload from an authored brief to deterministic extraction (`scripts/group-entry`). Implementation and review both passed fully (211/211, final review "Ready to merge"), but it **failed at the release gate**: functional probes were 8/8 (2/2 reps), yet in blind quality judgment both reps came out inferior to the brief arm — a negative result showing that **the pre-authored step code is the actual source of cheap-tier (haiku) code quality**. 1.2.1 retained. A record of the same standing as the size-classifier retrospective.

## 1. Hypothesis and Motivation

Under the user's criteria (speed and tokens are the primary gate) following plan-demotion retrospective §7:
Eliminate the cost class of the authored brief entirely (real path ~2–3k, fresh controller ~60–78k + over-execution
surface), and instead extract the group entry + global constraints from the spec section via a script (0 tokens)
to dispatch, so the implementer fills it in directly via TDD.

## 2. Implementation (preserved on branch, unmerged)

- `scripts/group-entry` + 8 unit tests (fence-aware 2-pass awk, KR/EN constraint
  headings, exit 0/2/3) — this part has no defects of its own, and has reuse value.
- Restructured SDD SKILL.md "Dispatch Payload" (default = extraction / fallback = author + brief-check
  / legacy = task-brief), made the reviewer's `brief-fix` class conditional on the fallback path,
  aligned writing-plans, CLAUDE.md, and README. Completed through final review approval.
- 2 incidental empirical findings: (1) the reviewer triggered the new `brief-fix` routing in practice (correctly
  classifying 2 spec omissions in the controller-authored brief as brief-fix, converging via brief rewrite
  without human intervention — the first real validation of the 1.2.0 design), (2) the worktree gotcha
  actually triggered (the fixer committed to the main-checkout master → recovered via
  cherry-pick + reset per the CLAUDE.md procedure).

## 3. Evaluation (tokmark fixture, reusing 1.2.0 eval assets)

Same spec section, same seeds (D1 `>` unescaped, D2 "empty tokens"), same
probes. Comparison target K = brief arm (sonnet-authored brief + haiku implementation, 1.2.0
eval). New Z1 and Z2 = extraction payload + haiku, 2 reps.

| Metric | K (brief) | Z1 | Z2 |
|---|---|---|---|
| Probes (8 types, incl. decoy) | 8/8 | 8/8 | 8/8 |
| implementer tokens / s | 37.0k / 80s | 45.7k / 142s | 45.8k / 190s |
| Blind test quality | 4 | 3 (tautology, process-leak names) | 4 |
| Blind code quality | 5 | 2 (duplicated escape logic) | 2 (~40 lines dead nested code) |
| Blind spec fidelity | 5 | 3 (`* *` semantic deviation) | 2 (over-construction) |
| Verdict | — | **inferior to K** | **inferior to K** |

- Variance observation: Z1 and Z2 are "noise from the same process" — a shared signature of verbosity, excessive star logic,
  and inflated suites. A structural result, not bad luck.
- Even tokens were inferior: without the code, exploration turns increased, raising implementer cost +23% (45.7k vs
  37.0k) and time +78–137%. **A failure on the speed and token axes too** — the implementer's excess (+8.7k)
  exceeds the real-path cost of authoring the brief (~2–3k).
- Sole success case: this branch's Group 3 (documentation sweep) completed with section-only without
  problems — valid for code-free documentation tasks, but that alone is not grounds to change the default
  (branching by task type is the size-classifier trap).

## 4. Gate Verdict

| Gate | Result | Verdict |
|---|---|---|
| 1. Quality: probes 8/8 + blind at least equal | probes passed, blind 2/2 inferior | **Fail** |
| 2. Keep cheap (haiku) | functionally kept, quality below bar | **Fail** |
| 3. Token/speed total ≤ brief arm | implementer +23% tok / +78% s | **Fail** |
| 4. No regression | 211/211 | Met |

**3/4 fail → release held, 1.2.1 retained.**

## 5. Lessons

1. **Step code is not ceremony — it is the delivery medium for quality.** The brief's pre-authored
   code was not a transcription cost but the conduit for injecting sonnet quality into haiku
   execution. Remove it and quality regresses to the implementer tier.
2. **The "token savings" hypothesis was patched on the token axis too**: a code-free payload
   increased the implementer's exploration turns and outweighed the savings (a reconfirmation of the
   turn-count > token-unit-price principle).
3. **Implementation quality ≠ design validity.** This branch passed every review —
   the defect was not in the code but in the hypothesis, and only the release gate (A/B)
   could catch it. The reason the gate must not be replaced by passing the skill chain.
4. The `group-entry` script and the brief-fix real-world validation are recoverable assets —
   the branch is preserved, unmerged.
