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
   codesign --sign "$IDENTITY" --verbose=4 "$APP"                  # layer 4
   ```
5. **Trace data flow backward.** When the error is deep in the stack, trace the
   bad value up to its origin and fix at the source — see `root-cause-tracing.md`.

**Tempted to conclude "no root cause / it's environmental"?** ~95% of such calls are
incomplete investigation — prove it before exiting. If it genuinely is
environmental/timing/external, document why, then add a retry/timeout/error-handling
defense plus monitoring and treat *that* as the fix — don't just stop.

## Phase 2 — Pattern

Find similar working code in the same codebase and list every difference from the
broken path, however small ("that can't matter" is where bugs hide). Reading a
reference implementation? Read it completely, not skimmed.

## Phase 3 — Hypothesis

State one hypothesis: "X is the root cause because Y." Test it with the *smallest*
change, one variable at a time. Confirmed → Phase 4. Wrong → form a new
hypothesis; don't stack fixes. When you don't understand something, say so and dig.

## Phase 4 — Fix

1. **Failing test first** — simplest reproduction, via `test-driven-development`.
2. **One fix at a time** — address the root cause, no "while I'm here" extras.
3. **Verify** — target test passes, nothing else broke, issue actually gone.
4. **If it doesn't work, stop and count.** <3 fixes → back to Phase 1 with the new
   information. **≥3 failed fixes = wrong architecture, not a failed hypothesis** —
   each fix surfacing new coupling elsewhere is the tell. Stop guessing and raise
   the design question with the human before any fix #4.

Consider adding validation at each layer the bad value passed through, to make the
bug structurally impossible — see `defense-in-depth.md`.

## After the fix lands

If the session surfaced a reusable lesson — a correction, an anti-pattern, a rule,
a non-obvious external fact — surface `llm-md-revise` candidates before finishing
so any approved edit lands with the fix (debugging is a common anti-pattern source;
skip when nothing's worth persisting). Then use `finishing-a-development-branch`.

## Supporting techniques

- `root-cause-tracing.md` — trace a bug backward through the call stack to its trigger.
- `defense-in-depth.md` — validate at every layer so the bug can't recur.
- `condition-based-waiting.md` — replace arbitrary timeouts with condition polling.
