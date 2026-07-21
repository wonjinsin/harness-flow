# Verify-Fix Re-Review Prompt Template

Use this template when dispatching the re-review after a final-review
fix wave. Its scope is the fix itself — resolved/unresolved verdicts on
the open findings plus a defect check on the fix diff. It never re-reviews
the whole branch; the final review already did.

**Purpose:** Verify a fix wave resolved the final review's open findings
without introducing new defects.

```text
Claude Code Agent (general-purpose):
  description: "Verify fix wave (final re-review)"
  model: [MODEL — REQUIRED on model-selectable dispatches: reviewer floor is
         mid-tier: sonnet for a routine fix diff, opus for a subtle/high-risk
         one. State the choice.]
  prompt: |
    You are verifying a fix wave against the open findings from the final
    whole-branch review. This is a fix-scoped gate: judge the open
    findings and the fix diff, nothing else.

    ## Open Findings

    [OPEN_FINDINGS — paste verbatim from the final review or the previous
    verify-fix re-review]

    ## Context

    Group briefs (requirements context for spec findings): [BRIEF_PATHS]

    Global constraints from the spec/design: [GLOBAL_CONSTRAINTS]

    ## Diff Under Review

    **Fix base:** [FIX_BASE_SHA]  (HEAD recorded before the fixer)
    **Head:** [HEAD_SHA]
    **Diff file:** [DIFF_FILE]

    Read the diff file once — it contains the commit list, a stat summary,
    and the full diff with surrounding context. The diff's context lines
    ARE the changed files: do not Read a changed file separately unless a
    hunk you must judge is cut off mid-function — and say so in your
    report. Do not re-run git commands. If the diff file is missing, fetch
    the diff yourself: `git diff --stat [FIX_BASE_SHA]..[HEAD_SHA]` and
    `git diff [FIX_BASE_SHA]..[HEAD_SHA]`. Inspect code outside the diff
    only to evaluate a concrete risk you can name — one focused check per
    named risk, and name both the risk and what you checked.

    Your review is read-only on this checkout. Do not mutate the working
    tree, the index, HEAD, or branch state in any way.

    ## Do Not Trust the Fix Report

    Treat the fixer's report as unverified claims. Verify each claimed
    resolution against the diff. A stated rationale never downgrades a
    finding's severity.

    ## Scope

    For each finding under ## Open Findings, verdict: resolved (cite the
    hunk that resolves it) or unresolved (cite what is still wrong). Then
    check the fix diff itself for new defects — same calibration and class
    tags as below. Do not re-review code outside the fix diff.

    ## Calibration

    Categorize new issues by actual severity. Important means the fix
    cannot be trusted until addressed: incorrect or fragile behavior, a
    missed requirement, or maintainability damage you would block a merge
    over. Rate severity by consequence, not by surface form: a finding
    that violates a brief requirement, or propagates a wrong
    value/type/contract downstream, is Important or Critical even when it
    reads as a type-contract or style nit. A Minor rating on such a
    finding requires a one-line justification of why the consequence is
    harmless.

    Tag each new Critical/Important finding with exactly one `class`:
    - `impl-fix` — a further fix subagent can resolve it. Default when
      unsure.
    - `plan-escalate` — the plan/brief/spec text itself is wrong or
      internally contradictory. State the plan text at fault.

    ## Output Format

    ### Open Findings Verdicts

    - [finding 1]: resolved (hunk cited) | unresolved (what is still wrong)
    - ...

    ### New Findings

    #### Critical (Must Fix)
    #### Important (Should Fix)
    #### Minor (Nice to Have)

    For each Critical/Important: `class: impl-fix | plan-escalate`,
    file:line, what's wrong, why it matters.

    ### Assessment

    **Fix quality:** [Approved | Needs fixes]

    **Reasoning:** [1-2 sentence technical assessment]
```

**Codex translation:** Select the advisory review tier before dispatch:
`standard` for a routine fix diff and `most capable` for subtle or high-risk
work. Ask Codex to use the least powerful model that fits, without claiming an
exact-model guarantee. Direct `spawn_agent` does not accept per-call `model`,
`profile`, or `agent_type`; omit those fields, use a unique `task_name`, pass the
filled prompt as `message`, and set `fork_turns: "none"`.

**Placeholders:**

- `[MODEL]` — required only on a model-selectable dispatch; follow SKILL.md
  Model Selection (reviewer floor sonnet). Omit on Codex direct `spawn_agent`.
- `[OPEN_FINDINGS]` — REQUIRED: the still-open findings, verbatim
- `[BRIEF_PATHS]` — the group brief files (the absolute
  `$SDD_SKILL_DIR/scripts/task-brief PLAN N` command printed these during execution)
- `[GLOBAL_CONSTRAINTS]` — binding requirements copied verbatim from the plan's Global Constraints or the spec
- `[FIX_BASE_SHA]` — HEAD recorded immediately before dispatching the fixer
- `[HEAD_SHA]` — current commit
- `[DIFF_FILE]` — REQUIRED: the path printed by the absolute
  `$SDD_SKILL_DIR/scripts/review-package FIX_BASE HEAD` command

Each verify-fix dispatch increments `final: reviewCycles` in the progress
ledger — the 3-re-review cap lives in SKILL.md (Final Review Loop).
