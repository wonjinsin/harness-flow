# Testing Skills With Fresh Context

Use this reference when creating or editing a skill. The canonical
`test-driven-development` skill defines RED → GREEN → REFACTOR; this file
defines evaluation forms for runtime guidance.

## Evaluation matrix

Choose by failure mode:

| Skill type | RED | GREEN | REFACTOR signal |
|---|---|---|---|
| **Discipline** | Combined pressure produces a violation | Same pressure produces compliance | New rationalization |
| **Technique** | Application or edge variation fails | Both cases are applied correctly | Missing step or boundary |
| **Pattern** | Recognition or counter-example fails | Use and non-use cases are distinguished | Over- or under-triggering |
| **Reference** | Retrieval, application, or gap task fails | Correct fact is found and used | Missing or ambiguous entry |

Pure reference skills still need retrieval, application, and gap evaluations.
They do not need rationalization pressure. Pressure is meaningful only when an
agent has an incentive to violate a discipline.

## Shared cycle

### RED

- New skill: run the evaluation without the skill.
- Existing edit: run it against the pre-edit version.
- Use a fresh context that lacks implementation-session hints.
- Record the exact output and why it is wrong.
- Stop if the baseline already succeeds.

### GREEN

- Add the smallest guidance that addresses the observed failure.
- Repeat the same evaluation with the skill available.
- Check behavior, not recall: the agent must make the right decision or produce
  the right artifact.

### REFACTOR

- Add an edge, counter-example, or gap case.
- Tighten existing wording before adding a new section.
- Re-run affected cases after each edit.
- Preserve passed cases while closing the new failure.

For non-deterministic behavior, run multiple fresh samples and read each result.
For deterministic scripts or schemas, prefer automated tests. Do not replace
behavioral evidence with a parser test when the risk is agent judgment.

Run one case per RED → GREEN cycle. The cases below define required final
coverage, not a batch of failures to collect before the first GREEN. After all
cycles pass independently, rerun the complete set as regression evidence.

## Discipline-only pressure evaluation

Build one realistic scenario with at least three pressures:

- time or emergency;
- sunk cost;
- authority or social pressure;
- exhaustion;
- apparent harmlessness;
- fear of wasted work.

Require an action or explicit choice. A prompt that asks “what does the skill
say?” tests recall, not compliance.

During RED, capture rationalizations verbatim. During GREEN, use the same
scenario. During REFACTOR, add one changed-pressure case that tempts a new
exception. Keep a rationalization table only while it remains useful:

| Rationalization | Counter |
|---|---|
| Observed excuse | Short rule that removes its ambiguity |

Consult [persuasion-principles.md](persuasion-principles.md) only for discipline
skills whose rule is still rationalized away.

## Technique evaluation

Use two sequential cycles:

1. **Application:** run application RED → GREEN on a normal task that requires
   every essential step.
2. **Variation:** only after application is green, run variation RED → GREEN with
   a changed input, environment, or boundary.

Score the produced steps or artifact. A good result applies the method rather
than paraphrasing it. A missed step becomes one clarified instruction; a
failure unique to the edge case becomes one boundary.

## Pattern evaluation

Use a matched pair as sequential cycles:

1. **Recognition:** run recognition RED → GREEN where the pattern should apply.
2. **Counter-example:** only after recognition is green, run counter-example
   RED → GREEN on a similar-looking case where it must not apply.

The pair detects both under-triggering and over-triggering. Add trigger symptoms
or exclusions only when the corresponding case fails.

## Reference evaluation

Use three sequential cycles:

1. **Retrieval:** run retrieval RED → GREEN by locating the exact fact, field,
   command, or constraint.
2. **Application:** only after retrieval is green, run application RED → GREEN
   by using that fact in a realistic decision or artifact.
3. **Gap:** only after application is green, run gap RED → GREEN by asking for a
   nearby unsupported case and verifying the skill exposes the limit instead of
   inventing an answer.

Reference skill evaluation should favor precise outputs and source locations.
Do not add pressure language unless the reference also enforces a discipline.

## Micro-tests

Use micro-tests to compare wording before an expensive campaign:

1. Include a no-guidance or pre-edit control.
2. Keep context and task fixed between variants.
3. Sample enough fresh runs to reveal variance.
4. Read flagged outputs; quoted examples can create false positives.
5. Promote only wording that improves behavior consistently.

Micro-tests refine wording. They do not replace full pressure scenarios for a
discipline skill.

## Evidence record

Keep the report short:

```text
Skill:
Type:
Baseline:
Observed failure:
Change:
Verification:
Remaining limit:
```

If one edit affects another skill's route or contract, run that skill's relevant
evaluation too. A local pass does not justify a cross-skill contradiction.
