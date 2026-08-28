---
name: brainstorming
description: "Use BEFORE writing or changing code for a feature, fix, refactor, or script, and when the user asks to research, investigate, compare, analyze, or report on an in-scope codebase, repository, or technical artifact, even without requesting a change. Do NOT use for general-knowledge questions, diagnosing bugs or test failures (use systematic-debugging), an approved spec (use writing-plans), or an approved plan or agreed brief (use implement)."
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

## Explicit spec request

When the user explicitly requests a spec artifact, settle its open design decisions,
save the spec using the rules below, ask the user to review it, then stop. Do not
classify it into a small/large exit or continue to `writing-plans` unless the user
also asks to continue beyond the spec.

## Change exit — recommend, let the user pick

Once the approach is agreed, recommend an exit and confirm. The user's "ok" is
the gate; there is no separate approval loop.

- Small / clear → "I'll hand the agreed brief to implementation. OK?" → capture
  the goal, acceptance checks, and boundaries as an **agreed brief**, then invoke
  `harness-flow:implement`. Do not create a spec or plan for this path.
- Large / ambiguous / spans sessions → "Big enough to write down — I'll save a
  spec, then a plan. OK?" → write the spec below, then writing-plans.

## Spec

Save the agreed design to `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md`. Rules:

- Write from the user's perspective — the problem they face, the solution they get.
- Record decisions, not code — settled interfaces, contracts, schema. Never file
  paths or snippets; they rot.
- No placeholders — no "TBD", no "handle errors later". Undecided → decide it now
  or mark it out of scope.
- Be tight and opinionated — scale to the work, and state what's out of scope.

Then ask the user to review before continuing.
