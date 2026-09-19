---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes.
---

# Systematic Debugging

Prove the root cause before proposing a fix. Keep diagnosis non-mutating.

## The Iron Law

**No fixes without root-cause investigation first.**

## Phase 1 — Root cause

1. Ground the symptom: read the complete error and reproduce it. If it is not
   reproducible, gather available evidence; report the exact gap only when unavailable.
2. Locate the failure: inspect recent changes and config/environment differences.
   For layered systems, observe component boundaries; trace bad data backward.

## Phase 2 — Pattern

Compare the closest working path when it can narrow the cause.

## Phase 3 — Hypothesis

State one falsifiable hypothesis and test it with the smallest non-mutating observation.
If false, replace it; never stack speculative fixes.

Stop once the cause is proven; do not perform techniques mechanically. If evidence
cannot distinguish hypotheses, report the gap. For environmental or timing causes,
record only evidence-backed retry, timeout, error-handling, or monitoring needs in
the confirmed bug-fix brief. Do not implement it here.

## Phase 4 — Confirmed fix handoff

Capture the reproducer, root-cause evidence, minimal correction, boundaries, and
acceptance checks. The reproducer becomes the first failing test during implementation.

If the user explicitly requested an implementation plan, invoke
`harness-flow:writing-plans`; otherwise invoke `harness-flow:implement`. Those
skills own TDD, code changes, verification, and completeness checking.

If implementation or verification fails, stop, count the failed correction, and
return here with the new evidence. Form a new hypothesis instead of layering a fix.
After three failed corrections or evidence of broad coupling, raise the architecture
question before another fix.

## Supporting techniques

- `root-cause-tracing.md` — deep or indirect failures.
- `defense-in-depth.md` — validation layers needed by the confirmed correction.
- `condition-based-waiting.md` — timing-dependent or flaky behavior.
