# Evaluate the Skill, Not the Prose

Use this reference to select cases, run fresh consumers, and interpret results.
The authoring sequence and publication boundaries live in `SKILL.md`.

## Choose cases from the job

Declare expected outcomes from the source requirements before seeing candidate
responses. Cover the relevant risks; a skill can need more than one row:

| Job | Cases and observable outcomes |
| --- | --- |
| Technique | Normal application and a changed input or boundary; inspect the resulting artifact |
| Pattern | A matching case and a similar non-match; check both use and non-use |
| Reference | Retrieve an exact fact, apply it, and answer a nearby unsupported question without invention |
| Discipline | A realistic incentive to violate the rule, then changed pressure; require an action or decision |
| Executable helper | Saved input, a changed or malformed input, and the actual command/tool entrypoint |

Pressure is not a substitute for application or retrieval. Apply it only where
rule-breaking is a plausible risk. An explicit unsupported result can be correct;
an inaccessible file or permission error is not evidence that data is absent.

## Run a controlled comparison

Give each consumer only the task, intended skill files, available inputs/tools,
and necessary host rules. Use independent fresh contexts without the author's
reasoning, expected answer, or earlier consumer responses. If the real host loads
references on demand, exercise that path rather than always pasting every file.

Use no skill for a new behavior or the original version for an edit. Change the
candidate guidance, not the task or grader, between baseline and candidate runs.
Use multiple fresh samples for nondeterministic decisions and inspect each failure;
record passes/attempts rather than treating one success as reliability proof.
Do not hide provider/tool errors inside behavior scores or silently replace failures.

One passing case says nothing about untested cases. Keep the full agreed scope
visible and preserve regression cases. Reserve a fresh confirmation variation;
after using it to fix wording, it is development evidence, not an unseen test.

When comparing authoring methods rather than editing one skill, also consider an
uncompressed-source control and a skill drafted without the authoring method.
Repeat authors independently: many consumers of one artifact are not many authors.
Do not impose that entire comparison campaign on routine skill edits.

## Grade outcomes and inspect disagreements

Use code for exact observable fields or executable results. Permit valid output
variants the contract allows; do not enforce an incidental tool order or wording.
For semantic judgments, define the rubric first and inspect the cited evidence;
an uncalibrated model score is not proof. Test action, not an agent's self-rating.

If a result and grader disagree, inspect the raw response, source requirement,
and execution trace. Separate a real violation from an ambiguous requirement,
invalid expectation, or broken comparison. Preserve the original evidence and
report any grader correction or post-hoc interpretation explicitly. Never rewrite
the skill merely to satisfy a demonstrably invalid grader.

## Keep claims separate

- **Structure:** valid metadata and reachable files. This does not prove behavior.
- **Discovery:** appropriate selection on applicable and non-applicable requests.
  A metadata-only prompt does not prove native automatic loading.
- **Behavior:** actual decisions, artifacts, or state changes on the declared cases.
- **Integration:** the real entrypoint, dependencies, and host operations exercised.
  Parser tests or an adapter do not prove untested installation, auth, or deployment.

Record the source/version, candidate, case, expected outcome, actual response or
trace, repetitions, and failure classification. Report what changed and the remaining
limits. Judge value by the agreed result and unnecessary context removed, not by
word count alone, stronger language, or how many evaluation calls were made.
