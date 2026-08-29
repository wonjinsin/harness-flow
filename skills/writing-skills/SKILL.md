---
name: writing-skills
description: Use when creating new skills, editing existing skills, or verifying skills work before deployment.
---

# Writing Skills

## Contract

Skill authoring is TDD for runtime instructions: observe a failing evaluation,
write the smallest useful guidance, verify it, then remove duplication and close
observed gaps.

Read `../test-driven-development/SKILL.md` completely before using this skill.
Its RED → GREEN → REFACTOR rules are canonical. This skill only maps that cycle
to skill artifacts.

This local policy overrides the bundled guide's generic **what + when** metadata
advice. In harness-flow, `description` contains triggering conditions only; the
body owns capability and workflow details.

Detailed references:

- [anthropic-best-practices.md](anthropic-best-practices.md) — structure,
  progressive disclosure, scripts, and general authoring guidance.
- [testing-skills-with-subagents.md](testing-skills-with-subagents.md) —
  evaluation forms, fresh-context runs, and evidence.
- [persuasion-principles.md](persuasion-principles.md) — discipline-only
  rationalization resistance.
- [graphviz-conventions.dot](graphviz-conventions.dot) — diagram conventions.

## Scope

A skill is reusable guidance for future agents: a discipline, technique, pattern,
or reference. Do not create one for a one-off solution, project-specific fact, or
mechanical rule better enforced by code. Keep project-specific facts such as
private schemas, table names, and repository conventions in project documentation
or project instructions; a skill may teach the reusable retrieval or application
workflow without embedding those facts.

Keep the runtime surface small:

```text
skills/<skill-name>/
  SKILL.md
  supporting-file.*   # only for reusable tools or heavy reference
```

Keep principles, routing, and short examples in `SKILL.md`. Move detailed
methodology, large examples, or API reference to supporting files and link them
at the point of use. Do not repeat the same rule in both places. Keep the main
skill comfortably below 500 lines; if it approaches that size, split or delete.

This skill applies to `SKILL.md` and skill-shipped prompt templates. Product or
source-code changes use the normal code-mutation chain.

## Local frontmatter contract

Frontmatter has two required fields:

- `name` — at most 64 characters; lowercase letters, numbers, and hyphens.
  It must match the directory name.
- `description` — at most 1024 characters; triggering conditions only.
  Start with `Use when...` and name observable situations, symptoms, and
  explicit requests. Do not summarize the workflow or outcome.

Keep descriptions impersonal: avoid `I` and `you`. Put discovery keywords in
natural trigger phrases, not a keyword dump. Quote descriptions containing YAML
punctuation.

## Choose the evaluation form

Classify the skill before writing:

| Type | RED evaluation | GREEN evidence | REFACTOR signal |
|---|---|---|---|
| **Discipline** | Combined pressure causes a rule violation | Agent complies under the same pressure | New rationalization |
| **Technique** | Application or edge variation is wrong | Agent applies the steps to both | Missing step or boundary |
| **Pattern** | Recognition or counter-example is wrong | Agent distinguishes use from non-use | Over- or under-triggering |
| **Reference** | Retrieval, application, or gap task fails | Agent finds and uses the right fact | Missing or ambiguous entry |

Pressure and rationalization testing is required only for discipline skills.
Technique skills need application plus variation. Pattern skills need recognition
plus a counter-example. Reference skill evaluation needs retrieval, application,
and gap cases; pure reference skills do not need artificial pressure.

Run one case per RED → GREEN cycle; do not batch every required case before the
first GREEN. Technique order is application, then variation. Pattern order is
recognition, then counter-example. Reference order is retrieval, then application,
then gap. After every case has gone green, rerun the full set as regression evidence.

## RED → GREEN → REFACTOR

### RED: reproduce the failure

- **New skill:** run the relevant evaluation without the skill.
- **Existing skill edit:** reproduce the failure against the pre-edit version.
- Record the exact wrong choice, missed step, false trigger, lookup failure, or
  rationalization. If the baseline already succeeds, stop; the proposed guidance
  has no demonstrated job.

If editing began before RED, discard only current-cycle agent-authored changes
needed to restore the pre-edit baseline. Never delete or revert pre-existing user
content.

Use fresh context for behavioral evaluations. For deterministic parsers, scripts,
or templates, write an automated failing test instead. A skill may need both.

### GREEN: write the minimum

Address the observed failure and no more:

- Put trigger logic in frontmatter and operational guidance in the body.
- Lead with the decision or invariant future agents must apply.
- Use imperative, harness-neutral wording.
- Name exact files, commands, fields, and failure states when precision matters.
- Prefer one strong example over several near-duplicates.
- Link heavy detail instead of copying it.

Run the same evaluation with the edited skill. Verify correct behavior, not merely
that the agent can quote the document.

### REFACTOR: close gaps without bloat

When evaluation exposes a new gap, choose the smallest response:

1. Tighten an existing sentence.
2. Add one boundary or counter-example.
3. Move reusable detail to an existing reference.
4. Add new material only when the first three cannot express the rule.

Re-run the affected evaluation after each change. For discipline skills, record
new rationalizations and counter only those observed. Do not turn hypothetical
excuses into pages of prose.

## Authoring rules

- Match the repository's existing naming and organization.
- Preserve stable cross-skill references and chain order.
- Keep runtime wording harness-neutral unless a concrete dispatch template needs
  harness-specific translation.
- Do not cite repository-only design material from shipped skill files.
- Avoid narrative history, repeated conclusions, generic motivation, and obvious
  advice that a capable agent already knows.
- Keep code examples executable and focused. Prefer a reusable script when logic
  is likely to be copied or must be deterministic.
- Add a diagram only when branching or feedback loops are hard to explain in
  prose. Render it with `render-graphs.js` and inspect the output.
- Do not add README or changelog files inside a skill unless they are required
  runtime inputs.

## Verification and publishing

Verify one skill before moving to the next. Use native task-tracking for
multi-step work.

Verification completes authoring; repository publication is separate:

- Commit only with explicit user approval.
- Push only with separate explicit user approval.
- Approval to commit is not approval to push.

Do not create a commit or remote side effect merely because evaluation passed.

## Checklist

### RED

- [ ] Classify discipline, technique, pattern, or reference.
- [ ] Run the matching baseline against no skill or the pre-edit version.
- [ ] Record the concrete failure.

### GREEN

- [ ] Frontmatter follows the local contract.
- [ ] Guidance addresses the observed failure with minimal text.
- [ ] The same evaluation now passes.

### REFACTOR

- [ ] New gaps or rationalizations are handled without duplication.
- [ ] Supporting files are loaded only when needed.
- [ ] Cross-skill routes and terminology still agree.
- [ ] Automated checks and relevant fresh-context evaluations pass.

### Handoff

- [ ] Report files changed, evaluation evidence, and remaining limits.
- [ ] Commit or push only under its own explicit approval.
