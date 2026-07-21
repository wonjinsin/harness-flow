---
name: brainstorming
description: "Use BEFORE writing or changing code for a feature, fix, refactor, or script. Triggers on \"add X\", \"build/make/create X\", \"change how X works\", \"let's refactor Y\", \"a new endpoint/page/component\", \"a quick script to X\", or any request to modify existing behavior. Do NOT use for diagnosing a bug or test failure (use systematic-debugging), or when an approved spec/plan already exists (use writing-plans)."
---

# Brainstorming

Turn an idea into an agreed approach through dialogue. Don't jump to code.

## Loop

1. Explore context — files, recent commits. If a question is answerable by
   reading, read instead of asking.
2. Grill one question at a time, each carrying your recommended answer. YAGNI hard;
   stay focused on what the request needs — don't fold in unrelated refactoring.
3. Propose 2-3 approaches with trade-offs; lead with your recommendation.
4. Present the design, scaled to the work — a sentence for a small change,
   a few paragraphs for a nuanced one. Agree section by section.

Large request spanning independent subsystems? Say so first and decompose into
sub-projects before grilling details — each gets its own pass.

## Exit — recommend, let the user pick

Once the approach is agreed, recommend an exit and confirm. The user's "ok" is
the gate; there is no separate approval loop.

- Small / clear → "I'll implement this directly with TDD. OK?" → test-driven-development.
  This path skips the plan and the final whole-branch review, so after the last
  commit self-review the full diff (`git diff <base>..HEAD`) for correctness and
  scope creep before finishing.
- Large / ambiguous / spans sessions → "Big enough to write down — I'll save a
  spec, then a plan. OK?" → write the spec below, then writing-plans.

## Spec (only for the large exit)

Save the agreed design to `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md`. Rules:

- Write from the user's perspective — the problem they face, the solution they get.
- Record decisions, not code — settled interfaces, contracts, schema. Never file
  paths or snippets; they rot.
- No placeholders — no "TBD", no "handle errors later". Undecided → decide it now
  or mark it out of scope.
- Be tight and opinionated — scale to the work, and state what's out of scope.

Then ask the user to review before continuing.
