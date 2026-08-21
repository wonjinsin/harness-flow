# Anthropic Skill Authoring Best Practices — Condensed

This reference summarizes the upstream authoring guidance that informed this skill.
For conceptual background and current platform behavior, use the official
[Anthropic Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).

`SKILL.md` is the executable contract for this repository. This file is background,
not a second source of local rules.

## Local repository overrides

The repository intentionally applies stricter rules than the upstream snapshot:

- Every `SKILL.md` has a **350-line** hard limit, not the upstream 500-line guideline.
- A description emphasizes triggering conditions and avoids summarizing the workflow.
- Structural validation, deterministic workflow fixtures, and `node --test` are
  mandatory CI gates.
- Nondeterministic LLM evaluations are opt-in and cannot be the only regression proof.

When this reference and `SKILL.md` differ, follow `SKILL.md`.

## Core principles

### Be concise

Skill instructions share context with the system prompt, conversation, tools, and other
skills. Assume the model already knows general programming and writing concepts. Keep
only information that changes selection, action, safety, or verification.

For every paragraph ask:

- Does the model need this to act correctly?
- Is it already stated elsewhere?
- Can a test, table, or script express it more precisely?
- Is it common-path guidance, or should it be loaded on demand?

### Set the right degree of freedom

Match precision to risk:

- **High freedom:** outcome and heuristics for creative or context-dependent work.
- **Medium freedom:** pseudocode, parameters, or a preferred pattern with variation.
- **Low freedom:** exact commands and bounded states for fragile or safety-critical work.

Over-specification makes flexible work brittle. Under-specification makes dangerous
work unpredictable.

### Use progressive disclosure

Metadata is always available for discovery; the body loads when selected; supporting
files load only when needed. Put common-path operating rules in `SKILL.md` and move
large references, schemas, examples, and executable helpers to named files.

Keep references shallow and link them directly from `SKILL.md`. For a long reference,
add a contents section or clear headings so partial reads reveal its scope.

## Structure

A skill requires YAML frontmatter followed by instructions:

```yaml
---
name: lowercase-kebab-case
description: Use when <observable condition>.
---
```

Upstream limits are 64 characters for `name` and 1024 for `description`. Use third
person and include search terms users will actually say. The directory name and skill
name should agree.

A good body makes these visible:

1. entry conditions and required inputs;
2. ordered workflow and decision branches;
3. safety boundaries and forbidden actions;
4. bounded outputs or exit states;
5. verification and failure handling;
6. links to optional detail.

Avoid time-sensitive facts unless they are explicitly dated and easy to refresh. Use
consistent terminology; do not introduce synonyms for the same state or artifact.

## Workflows and feedback loops

Complex tasks benefit from numbered phases, but every phase must earn its place. Add a
feedback loop when quality depends on inspecting an artifact:

```text
produce → validate → inspect failure → make one bounded correction → validate again
```

State the retry cap and escalation path. Never say only “check quality” or “fix errors”;
name the command, evidence, or output field that proves success.

## Examples

Examples teach format and judgment faster than abstract prose, but they are expensive.
Use one representative example and one boundary case. Prefer small input/output pairs
over a long narrative.

Do not copy every tool option into a skill. Point to stable local help or a reference,
and keep only the options required by the workflow.

## Scripts and tools

A helper script should solve the deterministic part completely, return useful errors,
and have a test. Do not make a script print “ask the model to finish this.”

For executable support:

- document inputs, outputs, dependencies, and timeouts;
- justify constants that affect reliability or cost;
- use forward-slash paths;
- produce verifiable intermediate artifacts for risky transformations;
- check that required tools are available before depending on them.

## Evaluation and iteration

Build evaluations from real tasks before polishing prose. Test the skill with the models
and tool environments it is expected to support. Observe:

- whether metadata triggers correctly;
- which instructions are skipped or misread;
- whether linked files are loaded at the right time;
- whether scripts run and their errors are actionable;
- whether the result is correct without hidden session context.

Iterate from observed failures, not imagined ones. Keep evaluation cases small enough to
identify which contract changed.

## Upstream-informed checklist

- [ ] Metadata is specific, discoverable, and within platform limits.
- [ ] The body is concise and uses an appropriate degree of freedom.
- [ ] Common-path instructions are in `SKILL.md`; uncommon detail is linked directly.
- [ ] Terminology is consistent and time-sensitive information is controlled.
- [ ] Workflows have explicit feedback and verification steps.
- [ ] Examples are concrete and minimal.
- [ ] Scripts solve the task, handle errors, and declare dependencies.
- [ ] Tests cover discovery, execution, outputs, and failure paths.
- [ ] The skill was iterated from observed behavior across supported environments.
- [ ] Local repository overrides and CI gates pass.
