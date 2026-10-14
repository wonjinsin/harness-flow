# Skill-authoring experiment protocol

Date: 2026-10-14

This is an authoring-method experiment, not a leaderboard of models or installed harnesses. All artifacts stay below this directory; none is installed as a live skill. Source repositories and user/global configuration remain unchanged. No commit, push, deployment, or external publication is authorized.

## Arms and products

The common instruction track compares harness-flow writing-skills, superpowers writing-skills, mattpocock writing-for-agents, OMC skillify, ECC skill-create, and an unaided authoring control. Each authors two reusable instruction skills: release-evidence review and incident-evidence handoff. A separate native gstack skillify track creates two executable browser-parser skills from actually observed local-page extraction results. Archon workflow authoring and GSD command conversion are adjacent mechanisms, not general-purpose instruction-skill authors; they are documented separately rather than assigned fabricated common-track scores.

The common-track author model is the native task-agent default. Consumer evaluations use the Eval completion model alias `smol`, held constant across arms. The service does not expose a resolved model snapshot or decoding controls through this interface; results must identify this limit. All consumer calls are stateless. Author agents receive the same source packet and public development scenarios, plus only their assigned authoring instructions. Held-out inputs and expected answers are withheld from authors until artifacts are frozen. Each method has one authoring run producing two products; consumer repetitions are not independent authoring replications.

## Procedure

1. Freeze the source packet, development cases, held-out cases, and grading rules before authoring. Record file hashes.
2. Run the no-generated-skill development baseline. Record exact outputs, including successful baselines. Do not manufacture a failure or call an infrastructure error a behavioral failure.
3. Give authors the source packet, their assigned method, and the observed development evidence. For TDD methods, evaluate one development case before moving to the next skill. Authors may call the shared development evaluator, which returns five fresh samples per case. Do not show held-out cases to authors.
4. Preserve each final SKILL.md, its source hash, the author report, and the development evaluator trace. No post-holdout edits are permitted in the comparison.
5. Evaluate each frozen artifact and the no-generated-skill control on the same five held-out cases per subject, five fresh repetitions each. Score exact observable decisions and evidence selections against predeclared expected fields. Report raw numerators/denominators, per-case results, and unsupported output/parse failures. Do not collapse heterogeneous tracks into a single rank.
6. For gstack, preserve real local-page scrape observations, fixtures, generated parsers, tests, and actual execution outputs. Check nominal extraction, changed layout, missing/empty data, and hostile page text. Fixture correctness is not evidence of current-site freshness or successful live installation.
7. Inspect safety and metadata structurally; compare authoring workflows separately from generated-artifact behavior. Report where a rule was merely written versus actually exercised.

## Comparison dimensions

1. Applicability and source/provenance discipline.
2. Authoring-method adherence and baseline/evaluation evidence.
3. Output metadata and discoverability contract.
4. Ordinary task correctness.
5. Boundary and unsupported-case handling.
6. Resistance to pressure and untrusted embedded instructions.
7. Evidence fidelity and uncertainty handling.
8. Mutation/publication safety.
9. Artifact size, references, and runtime dependencies.
10. Cross-harness portability and reproducibility.

Use objective per-field grading where possible. Qualitative authoring-method findings require a source citation or an actual author trace, not an invented numerical score. Hidden-case performance measures final artifacts, not causally isolated superiority of authoring instructions. No composite score is planned.

## Scope adaptations

ECC receives a controlled local Git-history fixture in addition to the shared source packet; OMC receives the same successful work as a recorded session fixture. These are synthetic benchmark tasks with real local execution/history, not production incidents. Creation roots are explicitly approved export roots, not discoverable install roots. Native harness-specific tool names are mapped to available tools and all deviations are reported. The unaided control gets the same task, sources, development access, and safety boundary, but no authoring skill. This common scaffolding can improve every arm and must be acknowledged as a confound.

## Evidence policy

Store author reports, source manifests, complete consumer prompts/responses, expected fields, grades, generated artifacts, and native runtime outputs. Provider failures remain separate from model failures. An optional retry is allowed only for transport failure, recorded independently; no retry may hide a valid unfavorable response. Do not treat model self-reports, generated checklists, or `--dry-run` output as proof of execution.
