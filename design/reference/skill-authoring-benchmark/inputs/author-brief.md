# Shared author brief

You are one authoring arm in a controlled comparison requested by the user. Actually author two reusable skills, not a recommendation or a scaffold. Use the assigned authoring method as the experimental treatment; do not read other methods or other arms' products. The parent has already loaded the harness workflow and owns the overall experiment. Normal safety rules remain in force.

## Inputs

Read `inputs/source-packet.md`, `inputs/development-cases.json`, and `results/development-baseline.json` under this benchmark directory. These are the same across arms. `inputs/session-demonstrations.json` contains actual successful fresh consumer outputs when supplied the procedure; this is a controlled synthetic task, not a production incident. For ECC, `inputs/history-fixture.json` locates a real isolated Git fixture and its portable bundle; inspect its history as required by skill-create. Do not modify the fixture.

## Outputs

Write exactly two complete export-only products beneath `artifacts/<arm>/release-evidence/` and `artifacts/<arm>/incident-handoff/`. Each needs `SKILL.md`; add supporting Markdown only if the assigned method calls for it. The skill name should match the containing subject directory where the method's packaging contract requires that. No scripts are needed for the common instruction track. No placeholders or unimplemented steps.

Public development cases are `release-dev` then `release-variation`, and `incident-dev` then `incident-variation`. If your method calls for behavioral evaluation, use the supplied `evaluate_authored_skill(arm, subject, case_id, baseline=False)` tool. It evaluates five fresh consumers and preserves full output automatically. `baseline=True` omits the candidate. The initial no-skill application baseline already has observed failures (release 0/5 passed; incident 3/5 passed). For methods that require sequential RED/GREEN, finish the application cycle before starting variation, then regress both. Do not collect every new failure before first GREEN. Do not invent runs, outcomes, or a missing baseline. The tool loads all Markdown below the candidate directory; author notes belong outside it.

No minimum number of revisions or evaluation calls is imposed on methods that do not require them. A method may produce a draft without behavioral evaluation; record that honestly. The parent independently evaluates all frozen outputs afterward. Do not optimize against hidden cases.

## Safety and experiment boundaries

Only write your two artifact directories and `results/author-<arm>.json`. Do not access `inputs/heldout-cases.json`, other arms' artifacts, or later holdout results. Do not install skills, alter source skills/global config, commit, push, deploy, or publish. Creation in your export directory is approved; publication is not. A method's native tool names may be mapped to the tools available here; report adaptations. Skip repository build/lint/test/formatter commands mid-flight; behavioral development probes are the experiment's primary observations and may be requested through the shared evaluator. Parent runs final verification after authors finish.

## Author report

Write JSON with: `arm`, `method_files_read`, `subjects` (for each: artifact files, changes made, observed baseline references, probe outcomes actually seen, unresolved limitations), `native_steps_performed`, `native_steps_not_performed`, `adaptations`, and `publication_actions` (must be empty). Do not claim that self-review or stated guidance proves behavior. Finish only when both products and the report exist.
