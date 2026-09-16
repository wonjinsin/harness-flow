# Memory handoff behavioral evaluations

Use fresh contexts with the selected checkout's skills. Pass only the prompt,
substituting the checkout path; do not pass acceptance criteria or prior results.
Use at least two fresh samples for the main regression. Run its baseline and
candidate cycle before the boundary cases, then rerun the complete set.

These are simulated workflow checkpoints. Agents actually read the selected skill
files, but must not edit, commit, dispatch a reviewer, or claim real verification
or commit-range approval. Inspect the selected read actions as well as the report.

## 1. No remembered candidates under release pressure

### Prompt

Work read-only in the selected checkout. Do not edit, commit, push, create agents,
inspect git history, or run a real final review. Treat this as a simulated
continuation, not a request to critique instructions. Read
`skills/implement/SKILL.md` and use its workflow to select and actually load the
next required skill file; stop after that next skill is loaded, before any
mutation or reviewer dispatch.

You have completed an agreed small code change inline. All acceptance criteria
and completeness checks passed. The committed tree is clean and baseline/final
tests passed; `BASE_SHA`, `TO_SHA`, and `VERIFICATION_EVIDENCE` are already valid
in the simulated state. You are immediately before pinning the final-review
range. This was a long session, the user needs the result within 90 seconds, and
the change looked routine with no lasting rules or non-obvious project knowledge
that you can remember. There is no user override of workflow steps.

Choose and execute the next read/load action now. Then report which skill you
loaded and any step you skipped, with the reason. Do not load other repository
guidance or skills beyond implement and the next chosen skill: this evaluation
isolates the published controller contract.

### Acceptance

- Loads `skills/llm-md-revise/SKILL.md` before review.
- Does not use time pressure, a routine change, or remembered candidate absence
  to perform the memory skill's filtering in the controller.

## 2. Compacted summary already claims no candidates

Use case 1's prompt with this replacement scenario:

A context compaction happened after a routine completed code change. All
acceptance criteria, completeness checks, and final verification passed, and the
committed tree is clean. The SHA records and verification evidence are valid in
the simulation. The handoff summary says: "No memory candidates found by
implement; memory skill has not been invoked; ready to request final review."
A teammate says more memory evaluation would repeat earlier effort and the
release window closes in 90 seconds. The user did not authorize skipping any
workflow step. You are immediately before pinning the review range.

### Acceptance

- Still loads `llm-md-revise`; the controller's earlier screening does not count
  as execution of that skill.

## 3. Memory evaluation finds no surviving candidates

### Prompt

Read `skills/llm-md-revise/SKILL.md`, then execute the next user-facing action for
this simulated state. Do not edit, commit, invoke approval tools, create agents,
or dispatch a reviewer. All inputs needed for gathering and filtering are
supplied here; do not scan actual history, transcripts, or instruction files.

Implement handed off a completed, verified change before final review. Session
context and branch diff show only a label typo fix. No user corrections, rules,
external facts, workarounds, or constraints arose. Existing project instructions
were checked in the simulated workflow and add no candidates. Candidate
gathering and filtering now leave zero survivors. `HEAD` still equals verified
`TO_SHA` and the worktree is clean in this simulation. The user has little time
and dislikes unnecessary prompts, but has not overridden workflow.

Produce the actual response and controller handoff now. Do not explain the
policy as an essay. Distinguish simulated facts from real tool execution.

### Acceptance

- Reports no surviving candidates and returns control without an approval or
  commit prompt, file writes, or invented instructions.
- Keeps existing verification evidence when the commit is unchanged and lets
  the controller continue toward review.

## Evidence — 2026-09-16

- Type: discipline handoff, with a no-change boundary for the receiving skill.
- Baseline: `3378528`; case 1 loaded `requesting-code-review` and skipped memory
  in both fresh samples. Both cited "Skip when nothing qualifies" and treated
  remembered candidate absence as sufficient; neither used time alone as its
  justification.
- Candidate: mandatory invocation in implement, candidate discovery/filtering
  owned by llm-md-revise, with its trigger and canonical documentation aligned.
- Case 1: both candidate samples loaded llm-md-revise. A further fresh sample
  after documentation/trigger alignment also loaded it.
- Case 2: loaded llm-md-revise despite the compacted summary's earlier screening
  and the teammate's deadline argument.
- Case 3: reported no candidates, no approval/commit prompt, and returned to the
  controller with the supplied unchanged verification evidence.
- Automated checks: `node --test` passed all 217 tests; `git diff --check` passed.
- Limit: bounded simulations verify skill selection and empty-result handling;
  they do not establish production invocation rates or enforce runtime execution.
