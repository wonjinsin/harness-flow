# plan-audit completeness gate retrospective — 2026-07-18

## Background

In the external-loop eval (design/2026-07-18-external-loop-retrospective.md), in-session execution silently dropped 30–50% of plan tasks in 2 of 3 runs while self-declaring success. The cause: completeness verification was entirely probabilistic (LLM). Adopting the full loop failed the speed/token gate, so we back-ported only the loop's deterministic-verification concept into the in-session chain.

## Implementation (2 groups, 4 tasks, final review opus Approved, suite 223/223)

1. `skills/subagent-driven-development/scripts/plan-audit` — checks, per plan task, that the `Files:` (Create/Modify/Test) paths exist plus (`--base`) a lower bound of one commit per task. exit 0/1/2.
2. `hooks/pre-plan-audit.js` — in PreToolUse(Agent|Task), intercepts the final review dispatch (`^Review code changes`), runs the audit, and denies only on exit 1 (everything else is fail-open). The plan can be specified explicitly via the `HARNESS_FLOW_PLAN` env var; the default is the latest file in `docs/harness-flow/plans/`.
3. In SDD SKILL.md, a first-line instruction (self-audit before the review dispatch) plus a Red Flag, and hook documentation in CLAUDE.md.

2 Minor items recorded as unfixed (both in the fail-safe direction): when the `--base` value is missing, the commit check is silently skipped; an internal crash in the audit script (exit 1) reads as a deny (spurious block, workable around via HOOKS_OFF).

## Eval results

**1. Replay (deterministic, 6 real failure artifacts):** catch **3/3** — medium-insession (4 files including schema.js/index.js), complex-insession (3 modules, 6 files), complex-loop (index.js, 2 files) detected precisely at file granularity. The 3 complete cases (simple×2, medium-loop) had **0/3** false positives.

**2. Hook simulation (same 6 cases + scope):** deny/allow 6/6 correct, no interference with non-review dispatches (`Implement Group N:`) — blast radius 0. Shares the same matcher as the existing pre-agent-model.js, but the description sets are disjoint, so there is no double deny (reviewer-verified).

**3. One live run (medium plan, hook armed, sonnet):** this controller completed all 4/4 tasks, so the deny path did not fire (omission is probabilistic — a 1-sample limitation). Instead we confirmed (a) the final review dispatch passed normally under the armed hook — **live false-positive 0 confirmed**, (b) acceptance 6/6 + a clean audit, (c) a side observation: the controller correctly escalated a genuine spec ambiguity (`Number("")===0` empty-value typing) as a plan-escalate and halted. Cost $3.79 (higher than the baseline $1.37 — deeper review loop, large run-to-run variance).

## Verdict

- The gate's purpose (deterministic blocking of the measured worst-case failure mode) was demonstrated empirically via replay + simulation: **catch 3/3, false positives 0/6** (replay 3 + live control 3... 0 across all 4 false-positive opportunities).
- Token/speed cost: the audit and hook themselves make no LLM calls (a few ms) — no conflict with the first-line gate. When a deny occurs, the rework cost is "filling in the omission," which is spending that would be needed anyway.
- Limitations: valid only for plans that follow the `Files:` convention (bullets); non-conforming plans are fail-open (writing-plans is the single source of the convention). It cannot see weak content — that remains the job of the final review.
