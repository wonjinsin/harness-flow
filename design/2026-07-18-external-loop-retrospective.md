# External-loop (sdd-loop) A/B eval retrospective — 2026-07-18

## What was built

An opt-in headless runner porting harness_framework's external deterministic-loop pattern into harness-flow:
`skills/subagent-driven-development/scripts/sdd-loop` (Node zero-dep, fresh `claude -p` session per group,
commit verification, retry cap 2, final review + verify-fix cap 3 enforced in code, `loop-state.json` resume).
Branch `worktree-sdd-external-loop`, suite 210/210, Approved after one fix-wave in the final review.

## Eval design

- 3 difficulty levels (simple 1 group/2 tasks, medium 2 groups/4 tasks, complex 3 groups/6 tasks) × 2 modes.
- **before (in-session approximation)**: a single `claude -p` session acts as the SDD controller, dispatching subagents via the Task tool.
- **after**: sdd-loop. All sessions on sonnet. Identical plan (requirements, signatures, and edge cases spelled out; no implementation code).
- Quality measured objectively via a **hidden acceptance suite** (not provided to the implementer). One run per combination (variance not measured — a limitation).

## Results

| run | exit | API time* | cost | acceptance | self-tests | commits | src completeness |
|---|---|---|---|---|---|---|---|
| simple-insession | 0 | 177s | $0.89 | **5/5** | 20p | 2 | complete |
| simple-loop | 0 | 293s | $1.36 | **5/5** | 13p | 2 | complete |
| medium-insession | 0 (self-declared success) | 218s | $1.37 | **0/6 (load failure)** | 22p | 2 | schema.js missing |
| medium-loop | 1 (self-declared failure) | 292s† | $1.75 | **6/6** | 37p | 4 | complete |
| complex-insession | 0 (self-declared success) | 320s | $1.34 | **0/9 (load failure)** | 33p | 2 | 3 modules missing: aggregate/retry/index |
| complex-loop | 1 | 420s† | $2.29 | 0/9 (index.js missing) | 49p | 5 | 5 of 6 modules, accurate report of the failure point |

\* wall-clock is polluted by nightly API throttling (wall ≫ api, e.g. 2034s wall for 68s api) — only API time is valid.
† sum up to the point of failure (did not run to completion — would be larger if it had).

## Verdict

**Speed/tokens (this repo's primary gate): the loop loses.** Cost 1.5–1.7×, API time 1.3–1.7× (fresh-session cold-start + guardrail re-injection). Even accounting for the resident cost of the in-session controller, it comes out behind.

**Quality/honesty: the loop wins decisively, and this is the real finding.**
- In-session silently dropped **30–50% of the plan** in 2 of 3 runs (medium, complex) and **self-declared exit 0 + "review approved"**. Its self-tests were all green (it only tests what it built) — undetectable without the hidden acceptance suite.
- The loop, in the same situation, **reported the exact failure point with exit 1** (complex: stopped at task 3.2). medium-loop declared failure due to a report-contract violation even though the implementation was actually complete (acceptance 6/6) — a false alarm, but fail-closed.
- Commit discipline: the loop produced 4–5 commits (close to one commit per task) vs. a flat 2 for in-session.

## Two root causes

1. **Report-file contract non-compliance (the loop's Achilles' heel):** ~50% of the headless sonnet implementation sessions completed the work and commits but skipped writing the report file (only a summary to stdout). `parseReportStatus` returned null → retry/error. Direction: a fallback that, when a commit exists + the full suite is green, demotes a missing report to DONE_WITH_CONCERNS so the final review gates it, or a JSON sidecar contract like findings.
2. **In-session's silent partial completion:** when the controller skips a group or a subagent absorbs/shrinks a task, the self-review does not verify completeness against the plan. The defense is to add a "confirm each plan task's deliverable exists" checklist to the final review, or to port the loop's commit-verification concept into in-session as well.

## Decision record

- Gate verdict: **speed/token gate failed → cannot be promoted to the default path.** However, its value as an opt-in unattended-execution path (honest failure, resumability, compaction-independence) is empirically demonstrated — whether to merge is the user's call.
- Re-challenge conditions (negative-record rule): implement the report-contract fallback (root cause 1) and, on the same 3-plan eval, pass (a) loop completion rate 3/3 and (b) cost gap ≤1.2×.
- Wall-clock-based speed comparison is invalid (throttling) — on re-run, score only API duration and control for time-of-day.
- **Follow-up (same day): sdd-loop code removed during slimming.** Because of the gate failure + maintenance debt (~500 lines of code, ongoing documentation tokens), the main body was deleted by user decision. The loop's deterministic-verification concept survives, ported into the in-session chain as `plan-audit` + `pre-plan-audit.js` (2026-07-18-plan-audit-gate-retrospective.md). This retrospective and its re-challenge conditions are kept as a negative record — on re-challenge, the code can be recovered from this commit history.
