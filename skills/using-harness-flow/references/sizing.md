# Sizing Reference

Consulted from using-harness-flow's Size the Work First (borderline tier calls) and at exit boundaries (diff caps). The inline table in SKILL.md is decision-complete — this file adds evidence and exact numbers only, and skipping it must never produce a LOWER tier than the inline table alone.

## Diff caps (post-verification backstop)

| Tier | Max files | Max changed lines (insertions+deletions, `git diff --stat`) |
|---|---|---|
| trivial | 2 | 50 |

Count every line in the diff — lockfiles and generated files included; no exclusions.

Caps bind the final diff, not intermediate states. Escalation is upward-only: downward reclassification would let optimism skip safeguards after work started; upward costs only minutes.

## Retroactive procedures (cap exceeded)

- **trivial** — check before commit with `git diff HEAD --stat` (covers staged changes) on the cumulative request diff. Over cap: declare it in one line (`Tier exceeded: trivial → review dispatched`), dispatch a code reviewer (sonnet floor, requesting-code-review template) on the diff, fix Critical/Important findings, then commit. At cap-check time, re-verify the standard escalation triggers against the ACTUAL diff (not the original request); any trigger hit is treated the same as over-cap (review + one-line user notice), regardless of size.

## Bait examples (look trivial, are standard)

- One-line change that alters a public API contract (return shape, status code, header) — contract trigger.
- A "small edit" on an auth/session/secrets path — security trigger.
- A "quick script" with 2+ viable designs (streaming vs batch, sync vs async) — ambiguity trigger.
- A rename cascading into 3+ call sites across modules — change-size signal, not trivial.
