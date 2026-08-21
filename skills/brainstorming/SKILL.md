---
name: brainstorming
description: "Use BEFORE writing or changing code for a feature, fix, refactor, or script, and for read-only research on an in-scope codebase or technical artifact. Do NOT use for general knowledge, bug diagnosis (use systematic-debugging), an approved design/spec (use writing-plans), or an approved task plan (use implement)."
---

# Brainstorming

Turn an idea into an agreed approach through dialogue, or investigate an in-scope
codebase, repository, or technical artifact and report the evidence. Don't jump
to code.

## Read-only investigation

Inspect the relevant evidence, state the conclusion and its basis, then stop.
Ask only when missing scope blocks useful investigation. Do not force an
implementation, spec, or plan unless the user asks for a change.

## Change loop

1. Explore context — files, recent commits. If a question is answerable by
   reading, read instead of asking.
2. Grill one question at a time, each carrying your recommended answer. YAGNI hard;
   stay focused on what the request needs — don't fold in unrelated refactoring.
3. Propose 2-3 approaches with trade-offs; lead with your recommendation.
4. Present the design, scaled to the work — a sentence for a small change,
   a few paragraphs for a nuanced one. Agree section by section.

Large request spanning independent subsystems? Say so first and decompose into
sub-projects before grilling details — each gets its own pass.

## Change exit — recommend, let the user pick

Once the approach is agreed, recommend an exit and confirm. The user's "ok" is
the gate; there is no separate approval loop.

- Small / clear → "I'll implement this directly with TDD. OK?" → test-driven-development.
  Before editing, follow the shared [execution preflight](../using-git-worktrees/execution-preflight.md).
  Retain its return state. `STOP` stops before editing. Under `LIMITED_IN_PLACE`, use
  TDD only within the shared restrictions, report tests, the chain-owned working diff,
  and exact status, then stop. This path must not commit or request code review, and it
  never invokes branch finishing. Only `ELIGIBLE` continues below.
  After the last commit, measure the finished `START_HEAD..HEAD` diff and close accordingly:
  - Trivial diff — a few lines in one file, touching no contract, dependency, or
    security surface → self-review it for correctness and scope creep, then finish.
  - Anything larger → request one report-only `full-review` via
    requesting-code-review over the branch (mid-tier model). The current session
    owns any fixes: escalate non-`ACTIONABLE` failures or `plan-escalate`; otherwise
    batch Critical/Important `impl-fix` findings, use TDD, run relevant checks and
    the full suite, make one fix commit, and request a focused `verify-fix`.
    Resume the same reviewer when supported and allow at most two post-fix
    reviewer turns, counting a scope-expansion `full-review` against that same
    limit, before escalating.
  - After either successful path, follow the shared execution-preflight closeout.
- Large / ambiguous / spans sessions → "Big enough to write down — I'll choose
  the active workspace, then save a spec and plan. OK?" → `using-git-worktrees`.
  Once the workspace is chosen (or declined), save the spec below there, get its
  review, then invoke `writing-plans`.

## Spec (only for the large exit)

Save the agreed design in the active workspace at
`docs/harness-flow/specs/YYYY-MM-DD-<topic>.md`. Rules:

- Write from the user's perspective — the problem they face, the solution they get.
- Record decisions, not code — settled interfaces, contracts, schema. Never file
  paths or snippets; they rot.
- No placeholders — no "TBD", no "handle errors later". Undecided → decide it now
  or mark it out of scope.
- Be tight and opinionated — scale to the work, and state what's out of scope.

Then ask the user to review before continuing.
