# Code-first comment policy

This is a quality constraint for production and test code. Honor explicit user
instructions and required project documentation contracts; surrounding comment
volume is not a requirement. It does not govern prose in standalone documents.

## Default and burden of proof

Default to no explanatory comments. First express intent through clear names,
cohesive functions, types, invariants, and straightforward control flow. Do not
introduce abstractions or contrived names solely to eliminate a comment.

An explanatory comment is permitted only when all three conditions hold:

1. It records a verified, current reason or constraint essential to maintenance.
2. A straightforward, in-scope code improvement cannot adequately express it.
3. Removing it would lose information needed to avoid a concrete incorrect change.

The author must establish these conditions in the implementation/review handoff;
do not add policy-compliance explanations to code. "Helpful", "complex", and
"domain rule" alone justify nothing. A lack of clarity in the current code is
not proof that the information cannot be expressed in better code. Do not invent
external constraints to justify keeping prose. Keep only the shortest sufficient
statement of the verified reason; an issue link alone is not an explanation.

Remove code restatements, step-by-step narration, and work/plan/review history.
Historical facts qualify only when they explain a necessary current constraint.
Preserve required licenses, functional tool/type directives, and required API
documentation; evaluate their actual contracts before changing them.

## Audit and review

Before every implementation or correction commit, inspect added, modified, and
deleted comments and existing comments invalidated by the code change. Reviewers
apply the same check within their supplied range, including lost essential
information. Do not expand into unrelated legacy cleanup.

Proven code restatements, process history, or explanations replaceable by a
straightforward code improvement are **Important** findings even when behavior
is correct. Cite the comment and the concrete duplication or code improvement;
an unsupported preference is not a blocker. Apply the normal consequence rubric
to inaccurate comments or deletion of necessary information. Pure wording
preferences remain Minor. The correction is removal or a concrete code
improvement, not expanded explanatory prose. Preserve qualifying exceptions.

## Ordinary prose-only corrections

For edits affecting only ordinary prose comments, inspect the diff to establish
that runtime behavior, types, tool directives, generated documentation, and
licensing contracts are unchanged, then use existing relevant checks. No new
failing behavior test is required. Keep the controller's commit, verification,
and review steps. Code behavior changes still follow TDD. This exception does
not cover runtime skill instructions or executable examples.
