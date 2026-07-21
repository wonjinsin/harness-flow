# Size Classifier Retrospective — Introduction and Removal of the small Tier

**Date**: 2026-07-10
**Target branch**: `worktree-size-classifier`
**Summary of conclusions**: After implementing, adversarially validating, and A/B-evaluating a 3-tier (trivial/small/standard) classifier, the **trivial tier was adopted** (approval round-trips −81%, zero quality loss, a clean sweep on decoy defense), while the **small tier was removed** (excessive tier-up wiped out the savings). The final form is a trivial/standard 2-tier system, confirmed in the 3rd re-evaluation after it met every gate condition (§4). This document is required reading before any attempt to reintroduce small.

## 1. Background — Why the Classifier Was Built

In the comparative analysis of six third-party harnesses (ECC/GSD/gstack/OMC/Archon/superpowers), harness-flow was the only one **without ceremony scaling proportional to work size**. Even a one-line change forced the full chain of brainstorming → spec document → plan with finished code → SDD → multiple reviews — 6–8 user-approval round-trips, 2 documents, and effectively 2 implementations. The immediately preceding work (46386f0, Task Group coarsening) was measured to cut the execution stage's tokens/round-trips by −58%/−67%, but wall-clock actually increased by +22–63% (grouping is a cost lever, not a speed lever), and the main culprit of the remaining perceived latency was diagnosed as **fixed front-loaded ceremony and user waiting**.

## 2. What Was Built

- **Predictive judgment + post-hoc verification hybrid**: In the bootstrap (`using-harness-flow`), a 3-signal decision table (change size / new dependencies·contracts / design ambiguity, highest signal wins) + tier-up triggers (security·contract·dependency·migration·concurrency·ambiguity) + an "if unsure, go higher" rule. At the exit, a measured-diff cap (post-hoc verification) recovers from failed predictions.
- **A-lite placement**: The decision-complete judgment table lives in the always-injected layer (bootstrap), while decoy examples, cap figures, and the retroactive procedure live in the on-demand `references/sizing.md`. Rationale: routing is the dispatcher's job (precedent: the bug → systematic-debugging branch), and only decision logic belongs in the always-on layer.
- **Per-tier paths**: trivial = inline TDD + self-review + a cumulative-diff cap before commit (0 worktree, docs, approvals, dispatch) / small = worktree + one chat design-summary approval + inline TDD + final review (no spec/plan document) / standard = existing full chain, unchanged.
- **Two adversarial red-teams** (exploit scenarios / contradictions·bypasses) → found 3 Critical and 9 Important issues, all fixed. Key fixes: re-validate triggers against the actual diff target at cap-check time, a cumulative trivial cap (a 2nd trivial commit = reclassification), mandatory reading of sizing.md before declaring trivial, normalizing the small path to go through brainstorming, and finishing's `main` hardcoding bug (this repo is master — silently disabling the backstop).

## 3. Evaluation Method (Reusable)

- **A/B dry-run simulation**: 10 scenarios × 2 arms (OLD = 1.1.3 skill set / NEW = classifier chain). Each arm, in a fresh sonnet context, reads the full relevant skill files and faithfully performs the flow the skills enforce against a hypothetical Node.js repo through document creation, returning approvals/dispatches/documents/safeguards as a structured trace.
- **Blind judge panel**: opus, judging only process safety from anonymized X/Y traces + an answer key hidden from the arms (correct tier, minimum safeguards).
- **Scenario design**: trivial 3 / small 3 / standard control 1 / **decoys 3** (a public API contract change that looks like one line, an auth-path fix, a "quick, right?" script with a hidden design choice).
- **Pass line (removal gate)**: trivial/small tokens −40%↑ AND approval round-trips −50%↑ AND quality parity·decoy leakage 0 AND standard unchanged. Failing any one → removal.
- **Lesson (measurement)**: dry-run tokens are unfit as a proxy — N=1 variance and reasoning verbosity swamp the path-cost signal (reversals occur such as +16% on the same lean path and −40% on the same full chain). The trustworthy metrics are **approval round-trips, document line count, and dispatch count**, which can be counted deterministically from the trace. Do not make direct wall-clock claims; state approval round-trips as the proxy metric.

## 4. Results

### 1st round (right after hardening)
NEW over-escalated 5 of 6 normal scenarios to standard. Cause: the trigger expansion the red-team required ("contract addition·change·deletion") effectively caught every code change. Decoy defense was 3/3.

### Trigger correction (once)
Narrowed to "change/deletion of an existing contract observable by consumers," made backward-compatible additions a non-trigger, limited the ambiguity trigger to "choices the request leaves open," and required naming a trigger even on tier-up (a counter-anchor against tier-up shopping).

### 2nd round (after correction)
| Metric | trivial group | small group |
|---|---|---|
| Approval round-trips | **−81%** (T2 is 0, 0 doc lines) | −14% (below the −50% baseline) |
| Classification accuracy | 2/3 (T3 escalated one step to small) | 1/3 (S2·S3 escalated to standard) |
| Decoy defense | — | **3/3** + the panel rated OLD as riskier in 2 cases (B2 missing security review, T1 missing call-site audit — NEW's escalation caught real defects) |

Conclusion: **a clean win on quality·safety conditions, but the efficiency condition failed for small** → per the gate rule, remove small and adopt only trivial (2-tier reduction, commit c3a1c37).

### 3rd round (after the 2-tier reduction, final)

8 scenarios: trivial 2 (T2, T3) / decoys 5 (T1 internal contract break · S1 3-file scope · B1 public API · B2 security · B3 ambiguity — all correctly standard) / control 1 (C1).

| Condition | Result | Verdict |
|---|---|---|
| trivial group approval −50%↑ | avg 5.5 → 1.0 (**−81.8%**), docs 165/300 lines → 0 lines, 0 dispatches | Met |
| Decoy leakage 0 | 5/5 all classified standard or escalated | Met |
| standard (C1) unchanged | all 4 full-chain safeguards (spec/plan/group review/final review) executed | Met |
| Quality parity | quality_flags 0. Panel riskier: on T1 **OLD is riskier** (missing call-site audit — NEW explicitly hits the contract trigger and surfaces consumer impact), all others none | Met |

**All gate conditions met → trivial/standard 2-tier adopted and confirmed** (release 1.1.4).

## 5. Why small Failed — Structural Causes

**What failed is not the "middle tier" itself, but "the way an LLM predictively classifies a middle tier."**

| Harness | How the middle tier works | Deciding party |
|---|---|---|
| GSD | `/gsd-quick` — the user selects via command, the LLM only validates eligibility (rejects·stops if it falls short) | User |
| ECC | small = "1 file / 1 function" — a mechanical boundary | LLM, but only countable signals |
| gstack | scales **only the back-end review** by finished-diff size (50–200 lines) — ceremony is at the back, so no prediction is needed | Measured value |
| Archon | user/router selects a 0–4 gate workflow | User |

harness-flow's small handed a **judgment-type boundary** ("≤5 files + no remaining design ambiguity") to LLM predictive classification, and once the "if unsure, go higher" safety rule is layered on, a structural upward skew emerges. Measured evidence: S1 (adding an option + 2 call sites), which can be judged mechanically, passed (approvals 9→3), while only the judgment-requiring S2 (log rotation — sync/async, check interval) and S3 (replacing week-number calculation — return format, timezone) were escalated.

**Precision and recall are tied to the same dial**: the S2 request and the B3 decoy ("CSV import, even large files, quick, right?") are isomorphic in phrasing, differing only in the lethality of the hidden choice. Blunting the ambiguity trigger enough for S2 to pass lets B3 leak through. One iteration brought over-escalation from 1st-round 5/6 down to 2nd-round 3/6, but beyond that is a region traded off against the decoy defense rate.

**The fundamental constraint of front-loaded ceremony**: harness-flow's expensive ceremony (design dialogue·spec·plan) comes *before* the code exists. With no diff, it can't be measured → prediction is unavoidable → the prediction-bias problem can't be escaped. gstack avoids the problem entirely via post-hoc measurement precisely because its ceremony is at the back end (review). The most post-hoc measurement can do in a front-loaded harness is act as a backstop (retroactively restoring skipped verification).

## 6. Directions to Consider When Retrying small (by priority)

1. **User opt-in only (GSD approach, most likely)**: remove automatic classification. The small path applies only when the user explicitly requests it ("keep it simple", "/quick"). The LLM only validates eligibility — if a tier-up trigger fires, it rejects the small request and goes to standard (asymmetric: downgrade is the user's prerogative, forced upgrade is the skill's). The over-escalation problem disappears by definition. Additional evaluation needed: "decoy where the user requested small" scenarios.
2. **Redefine as a mechanical boundary (ECC approach)**: small = only countable conditions like "1 file / 1 function + no trigger match." Exclude judgment-type signals (ambiguity). The boundary narrows so the savings shrink too, but it's stable.
3. **Not recommended — retuning the judgment-type boundary**: the limit was confirmed in the 2nd iteration. It's a wall traded off against the decoys.

## 7. Other Lessons Worth Preserving

- **Red-team hardening creates the opposite failure**: the phrasing that blocks optimistic classification (trigger expansion, if-unsure-go-higher) induced systematic pessimistic classification. When adding defensive phrasing, always pair it with a counter-anchor in the opposite direction (require naming a rationale even on tier-up), and measure both directions with the eval.
- **The answer key has errors too**: keying T1 (a behavior-breaking change to a shared utility) as trivial was a design mistake, and the panel exposed it (OLD treated it as trivial and shipped a real defect). Fix the key only as a key-defect fix, not as result tuning, and record it with the reason.
- **finishing `main` hardcoding**: this repo's default branch is master. The `git merge-base HEAD main 2>/dev/null || git merge-base HEAD master` pattern is mandatory (precedent in finishing Step 3).
- **Workflow args**: Workflow tool args may arrive as a string — guard scripts with `typeof args === 'string' ? JSON.parse(args) : args`.
- **Workflow cache**: on resume with the same runId, if (prompt, opts) are identical the cache is replayed — even if the skill file content changed, a stale result is replayed as long as the prompt (path) is the same. An arm whose file content changed must invalidate the cache by putting the iteration number in the label (opts).

## 8. Related Materials

- Spec: `docs/harness-flow/specs/2026-07-10-size-classifier-design.md` (worktree-local, gitignored)
- Plan: `docs/harness-flow/plans/2026-07-10-size-classifier.md` (same)
- Evaluation scenarios·answer key: session scratchpad `eval/scenarios.json` (summary preserved in §3–4 of this document)
- Prior analysis: `design/2026-07-09-execution-granularity-analysis.md` (rationale and limits of Task Group coarsening)
