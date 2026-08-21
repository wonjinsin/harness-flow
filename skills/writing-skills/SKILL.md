---
name: writing-skills
description: "Use when creating, revising, or validating an agent skill; when a reusable workflow keeps failing; or when SKILL.md needs stronger triggers, tests, or progressive disclosure."
---

# Writing Skills

Create compact, discoverable skills whose behavior is proven before their wording is
trusted. Keep the operating contract in `SKILL.md`; move deep background and reusable
tools to supporting files.

## Iron Law

**Never create or revise a skill without first observing a baseline failure.**

Skill authoring follows RED-GREEN-REFACTOR:

1. **RED** — run a realistic scenario without the new guidance and record the exact
   failure, pressure, or rationalization.
2. **GREEN** — add the smallest instruction that prevents that observed failure.
3. **REFACTOR** — rerun the scenario, close demonstrated loopholes, remove repetition,
   and keep every instruction necessary.

A skill written before RED is speculation. A skill changed without rerunning its
failure case is unverified documentation.

## Decide Whether a Skill Belongs

Create a skill when the knowledge is reusable across tasks, non-obvious, and likely to
save future investigation or prevent a recurring failure. Do not create one for:

- a one-off task or temporary project state;
- conventions already enforced by code, tests, or repository instructions;
- generic advice available in standard documentation;
- a workflow whose trigger cannot be stated clearly.

Classify the primary job before writing:

| Type | Primary job | Proof |
|---|---|---|
| Discipline | Enforce a rule under pressure | Adversarial scenario resists shortcuts |
| Technique | Teach a repeatable procedure | Agent produces a correct artifact |
| Pattern | Improve recognition or judgment | Agent chooses correctly across examples |
| Reference | Make facts retrievable | Agent finds and applies the right fact |

## Directory and Disclosure

Use one directory per skill and make `name` match that directory exactly:

```text
skill-name/
├── SKILL.md              # trigger + executable contract
├── references/           # deep background, APIs, long examples
├── scripts/              # deterministic reusable tools
├── templates/            # output skeletons
└── assets/               # non-text resources
```

Only create supporting directories that are needed. Keep these in `SKILL.md`:

- trigger and non-trigger conditions;
- non-negotiable rules and safety boundaries;
- the shortest complete procedure;
- decision points, failure handling, and verification;
- links that say when to load each supporting file.

Move long explanations, exhaustive tables, and uncommon examples out of the hot path.
A reference is not a dumping ground: delete duplicated or stale text instead of merely
relocating it.

## Frontmatter and Discovery

Required frontmatter:

```yaml
---
name: skill-name
description: Use when <observable trigger or failure condition>.
---
```

The repository validator accepts a safe YAML string subset: plain, single-quoted,
double-quoted, and `|`/`>` block string values with an optional `+` or `-` chomping
indicator. Values resembling a YAML boolean, number, or timestamp must be quoted.
Tags, anchors, aliases, flow collections, and indentation indicators are unsupported.

The description contains triggering conditions, not the workflow. Start with
`Use when`, write in third person, name symptoms and user phrases, and include relevant
technical keywords. Do not summarize the steps: an agent may follow the summary and
skip the body.

```yaml
# Bad: workflow summary
 description: Reviews a diff, fixes findings, and merges the branch.

# Good: trigger only
 description: Use when a completed branch or immutable diff needs independent review.
```

Choose a verb-led lowercase kebab-case name that describes the activity. Avoid vague
names such as `helpers`, `utilities`, or `misc`.

## Write the Body as an Operating Contract

Prefer imperative, observable instructions. Define:

1. **Entry state** — required inputs, workspace state, and authority.
2. **Actions** — ordered steps and decision branches.
3. **Exit states** — bounded outcomes the caller can handle.
4. **Failure policy** — what stops, retries, or escalates.
5. **Verification** — exact evidence required before completion.

Use a table when several states map to different actions. Use a flowchart only when a
reader can take a wrong branch; do not draw linear procedures or put code inside nodes.
For Graphviz details, load [graphviz-conventions.dot](graphviz-conventions.dot) and use
[render-graphs.js](render-graphs.js) to render it.

Examples should be minimal and directly runnable. Prefer one strong example over many
near-duplicates. Never include narrative history, discussion transcripts, or comments
that explain the authoring process instead of the technical rule.

## Test the Failure, Not the Prose

Use deterministic tests whenever the contract can be parsed or executed. A useful test
must fail when the behavioral guarantee is removed; checking that a keyword exists is
only a fallback.

### RED — observe baseline behavior

1. Choose one scenario that exercises the trigger and highest-risk branch.
2. Run it without the proposed instruction in a clean context.
3. Record the wrong action, missing evidence, or rationalization verbatim.
4. Add a regression test or fixture that represents that failure.

For discipline skills, include realistic pressure: urgency, sunk cost, authority,
fatigue, or an apparently harmless shortcut. For detailed scenario design, load
[testing-skills-with-subagents.md](testing-skills-with-subagents.md).

### GREEN — add the minimum contract

Write only enough to make the failing scenario pass. Keep the rule near the decision it
controls. If the skill needs a long rationale to be obeyed, make the rule clearer before
adding persuasion; use [persuasion-principles.md](persuasion-principles.md) only when
necessary.

### REFACTOR — close observed loopholes

Rerun the baseline and at least one variation. When the agent finds a new rationalization:

- name the loophole explicitly;
- add the smallest counter-rule or decision-table row;
- rerun the scenario;
- remove wording that no longer changes behavior.

Do not anticipate every imaginable excuse. Harden only against failures you observed or
can reproduce deterministically.

## Testing by Skill Type

- **Discipline:** run compliance, urgency, ambiguity, and authority-pressure cases.
- **Technique:** execute the procedure on a fixture and inspect the resulting artifact.
- **Pattern:** include positive, negative, and near-boundary examples.
- **Reference:** ask retrieval questions and verify the applied value, not only recall.

When testing agent behavior, isolate the context and record prompt, tools, result, and
exit state. LLM evaluations are useful for exploratory or adversarial testing but remain
opt-in because they are nondeterministic. Mandatory CI should use structural validation,
deterministic fixtures, and executable integration tests.

## Rationalization Hardening

Match the instruction form to the observed failure:

| Failure | Stronger form |
|---|---|
| Rule skipped | Bold rule plus stop condition |
| Wrong branch | Decision table or small flowchart |
| Shortcut under pressure | Explicit forbidden action and safe alternative |
| Vague output | Bounded status/schema plus example |
| Missing proof | Required evidence and fail-closed gate |
| Oversized skill | Delete duplication; move uncommon detail to a named reference |

A red-flags list is justified only when the flags came from actual test runs. Keep it
short and actionable: `If you think X, stop and do Y`.

## Repository Validation

For this repository, run all three gates before committing a skill change:

```bash
node scripts/validate-skills.js
node scripts/eval-skills.js
node --test
```

The validator checks frontmatter identity, descriptions, links, uniqueness, and the
350-line `SKILL.md` limit. Deterministic eval fixtures protect workflow handoffs and
forbidden states. Add or update a fixture when changing a cross-skill contract.

## Checklist

Before declaring the skill complete:

- [ ] A baseline failure was observed and recorded.
- [ ] The trigger is specific; non-triggers are clear when ambiguity matters.
- [ ] `name` matches the directory and the description says when to load the skill.
- [ ] The body defines entry state, actions, exits, failure policy, and verification.
- [ ] Safety boundaries are fail-closed for mutation, credentials, scope, and cost.
- [ ] The minimum change made the baseline scenario pass.
- [ ] At least one variation or boundary case passes.
- [ ] New loopholes are covered; speculative prose and duplicate examples are removed.
- [ ] Supporting files are linked at the point they become relevant.
- [ ] Structural validator, deterministic evals, and full tests pass.
- [ ] The diff contains no unrelated artifacts or generated output.

## Supporting Material

Load only when needed:

- [testing-skills-with-subagents.md](testing-skills-with-subagents.md) — behavioral and
  pressure-scenario testing.
- [persuasion-principles.md](persuasion-principles.md) — compliance language for rules
  that agents rationalize around.
- [anthropic-best-practices.md](anthropic-best-practices.md) — upstream authoring
  guidance and discovery considerations.
- [examples/CLAUDE_MD_TESTING.md](examples/CLAUDE_MD_TESTING.md) — worked testing example.
- [graphviz-conventions.dot](graphviz-conventions.dot) — flowchart conventions.

## Bottom Line

Prove the failure, add the minimum enforceable contract, rerun it, and delete everything
that does not improve discovery or behavior.
