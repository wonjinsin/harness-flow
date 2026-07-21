# Review Gating v2 Retrospective — Position Gating · Final-Review Tiering · verify-fix Re-review (streak gating is negative)

**Date**: 2026-07-16
**Branch**: `worktree-review-gating-v2` (release 1.1.8)
**Summary**: Immediately after reverting to 1.1.7, we directly attacked the real token lever the retrospectives identified ("the gating policy, not the doc structure"). Under the user gate (**simultaneous improvement on both axes** — speed and tokens, with quality as a hard constraint), we implemented 5 changes and adjudicated each with a pre-registered eval — **4 adopted** (P1 position gating / P3 all-cheap final review sonnet / P2 verify-fix re-review / P4 A-lite slimming), **1 rejected** (P5 zero-finding streak gating — failed the E5 gate; a negative record with the same standing as size-classifier and section-only). Proposal 0 (fence-aware task-brief cherry-pick) was excluded by user instruction — do not re-propose.

## 1. Adopted changes (1.1.8)

| ID | Change | Adjudication signal (all mechanical) | Both-axis delta |
|---|---|---|---|
| P1 | **Last group skips the group reviewer regardless of tier** — the final review nets it (brief attached, spec-compliance inherited) | Group position | −40~45k tok/feature (unconditional), 1 serial session (28~149s + cold-start) |
| P3 | **Final review of an all-cheap plan goes opus→sonnet** | Tier-label count of the plan | −18k tok, −110~217s (only for such plans) |
| P2 | **Re-review becomes a verify-fix variant** — open findings + fix-diff only | Whether a re-review occurs | package −74% measured (655B vs 2,534B), conditional on firing |
| P4 | **Example Workflow → references/, Advantages removed** | — | SKILL.md 4,207→3,933 words (−274/invocation) |

P1's core arithmetic: the tradeoff of the existing cheap gating ("capture is deferred to the final review") is **by definition 0** at the last group — the final review is next and there are no downstream groups. It is the only "no deferral cost" point within the gating expansion.

## 2. Evaluation (pre-registered, real dispatch)

Method: 5 variants of the pricing fixture (each an independent git repo, 3-group commits, defects are discovery-class not recorded in the brief, tests green across all variants so the defect stays latent), reviewer real-dispatched on sonnet (a conservative lower bound versus prod opus), adjudication by a sonnet judge + **manual re-adjudication of the controller's raw text**. Gates were fixed in PREREG.md before observing results.

| ID | Scenario | Result | Gate | Verdict |
|---|---|---|---|---|
| E1 | Defect in the last group (silent 0-tax on unknown region); does the final review catch it | **6/6** | ≥5/6 | P1 adopted |
| E2 | all-cheap + sonnet final review (parseFloat trailing garbage) | **4/4** | ≥3/4 | P3 adopted |
| E3a | Does verify-fix catch an incomplete fix as unresolved | **4/4** (all also caught the fixer's false "resolved" claim) | ≥3/4 | P2 adopted |
| E3b | The fix breaks a shared round helper via floor — does the final review net it | **4/4** (all Critical) | ≥3/4 | P2 adopted |
| E5 | Middle-group defect (rate string coercion); after a streak skip, does the final review catch it | **6/8 Important, 2/8 demoted to Minor** | ≥5/6 | **P5 rejected** |

## 3. Why P5 lost — severity demotion as a new failure mode

E5's 2 misses are not blind misses but **demotions**: the reviewer found the defect yet marked it Minor as a "type-contract nit, not a correctness bug." E1 (silent 0-tax) and E2 (amount parsing) are 6/6 and 4/4 because the narrative of money being wrong is clear, whereas E5 (rate type-contract violation) split the severity judgment. Lessons:

1. **The strength of the final-review net depends on the defect's "narrative clarity."** Expanding gating based on detection rate alone (§speedup 7's 100%) creates a defect class that, even when detected, drifts to Minor and gets merged. Middle-group skipping (streak) is exposed to this risk — last-group skipping (P1) has the same review catch it but with 0 deferral and propagation, so its exposure differs (E1 6/6 is the evidence).
2. **The judge is fallible too — manual re-adjudication of the raw text is mandatory.** One sonnet judge returned caught=true contradicting its own evidence ("demoted to Minor"). We manually re-adjudicated the 8 raw journal entries and settled on 6/8. Had we trusted the automated count, P5 would have shipped as a 5/6 "pass." (A field re-confirmation of writing-skills' "manually read every flagged match.")
3. **When an API-error re-run enlarges the sample, count every observation.** In the first run 4 reviewers hit connection errors → resume re-run. Some reps were double-observed, so the sample became 8. Picking only the 6 favorable ones is the same asymmetric handling that plan-demotion §8 caught — we adjudicated by counting all of them (6/8).

## 4. Deterministic arithmetic (headline)

- Reviewer dispatch count (by plan composition): std 3-group 3→2 (P1), mixed 4-group (c,s,c,s) 2→1, all-cheap 0→0+sonnet final. Applying P1 to the §9 real case (n=3 std, review 130.6k) yields −41.1k (−31%).
- verify-fix package: 655B vs full 2,534B (−74%), measured on the E3 fixture.
- SDD SKILL.md: 4,207→3,933 words (−274, per invocation/compact reload). task-reviewer-prompt +199 words (read only on re-review). references/example-workflow.md 459 words (on-demand).
- Human gate: unchanged (these changes are neutral on the human-wait axis — honest disclosure).

## 5. Cost & limits

- Eval cost: 2 workflow runs, subagent total ~2.7M tok (48 agents; reviewers 24 + re-runs, judges 24). Not the runtime cost of the feature itself (keeps the speedup §5 distinction).
- E1~E3 are all measured on the sonnet lower bound — with a prod final review (opus) the net is stronger. Note that on the P3 path sonnet is prod, so E2 is itself a prod measurement.
- Unverified: real-world firing of P1 on a plan whose most-capable group is last, and the real-world reviewCycles convergence behavior of verify-fix. To be observed in actual use.
- 2 session mistakes (recurrence prevention): (1) if the controller creates the ledger via a manual mkdir there is no self-ignore, so it gets committed by `git add -A` — going through `scripts/sdd-workspace` is the correct path (reflected in CLAUDE.md). (2) `git reset --hard` is blocked by the permission policy — a drop must be done as a reverse-edit commit.

## 6. Artifacts

- Skills: `subagent-driven-development/SKILL.md` (gating v2 + Model Selection exception + loop wording), `task-reviewer-prompt.md` (verify-fix variant), `references/example-workflow.md` (new; also fixes the existing example's contradiction where cheap groups were being reviewed)
- Docs: `CLAUDE.md` chain step 5 · pre-agent-model note synchronized
- Eval raw data: session scratchpad `eval/` (PREREG, fixtures 5 repos, packages, arithmetic.md), workflow `wf_6548625f-694` journal
- Version: 1.1.8 (plugin ×2 + marketplace)
