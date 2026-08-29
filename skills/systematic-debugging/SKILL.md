---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes.
---

# Systematic Debugging

Find the root cause before touching a fix. Symptom patches mask the real bug and
spawn new ones — and under time pressure is exactly when guessing costs the most.

## The Iron Law

**No fixes without root-cause investigation first.** If you haven't finished
Phase 1, you cannot propose a fix — this holds for "simple" bugs too.

## Phase 1 — Root cause

1. **Read the error.** Whole stack trace, line numbers, codes. It often names the fix.
2. **Reproduce.** Reliable steps? If not reproducible, gather data — don't guess.
3. **Check recent changes.** `git diff`, new deps, config/env differences.
4. **Instrument component boundaries.** When the system has layers (CI → build →
   sign, API → service → DB), log what enters and exits each boundary, run once,
   and read *where* it breaks before investigating that component:

   ```bash
   echo "workflow: IDENTITY=${IDENTITY:+SET}${IDENTITY:-UNSET}"   # layer 1
   env | grep IDENTITY || echo "not in build env"                 # layer 2
   security find-identity -v                                       # layer 3
   codesign --display --verbose=4 "$APP"                            # layer 4
   ```
5. **Trace data flow backward.** When the error is deep in the stack, trace the
   bad value up to its origin and identify the source correction — see
   `root-cause-tracing.md`.

**Tempted to conclude "no root cause / it's environmental"?** ~95% of such calls are
incomplete investigation — prove it before exiting. If it genuinely is
environmental/timing/external, document why, then add a retry/timeout/error-handling
defense plus monitoring to the confirmed bug-fix brief. Do not implement it here.

## Phase 2 — Pattern

Find similar working code in the same codebase and list every difference from the
broken path, however small ("that can't matter" is where bugs hide). Reading a
reference implementation? Read it completely, not skimmed.

## Phase 3 — Hypothesis

State one hypothesis: "X is the root cause because Y." Test it with the smallest non-mutating observation:
a focused reproducer, alternate input or environment,
existing logs, or a debugger/tracepoint. Do not edit production, test, or config
files in this skill. Confirmed → Phase 4. Wrong → form a new hypothesis; don't
stack fixes. If evidence cannot distinguish hypotheses, report the gap.

## Phase 4 — Confirmed fix handoff

1. Capture a **confirmed bug-fix brief**: the reproducer, root-cause evidence,
   minimal correction, boundaries, and acceptance checks. The reproducer becomes
   the first failing test during implementation.
2. If the user explicitly requested an implementation plan, invoke
   `harness-flow:writing-plans` with the confirmed bug-fix brief; after approval,
   that plan hands off to `harness-flow:implement`. Otherwise invoke
   `harness-flow:implement` directly. It owns TDD, implementation, verification,
   review, revisions, and the integration decision. Do not change code in this
   skill.
3. **If implementation or verification fails, stop and count.** Return here with
   the new evidence, then go back to Phase 1. <3 attempted fixes → form a new
   hypothesis. **≥3 failed fixes = wrong architecture, not a failed hypothesis** —
   each fix surfacing new coupling elsewhere is the tell. Stop guessing and raise
   the design question with the human before any fix #4.

Record needed validation layers in the bug-fix brief; `implement` owns their code
and tests. See `defense-in-depth.md`.

## Supporting techniques

- `root-cause-tracing.md` — trace a bug backward through the call stack to its trigger.
- `defense-in-depth.md` — validate at every layer so the bug can't recur.
- `condition-based-waiting.md` — replace arbitrary timeouts with condition polling.
