# Skill Authoring: Reference Comparison and Creation Experiment

## 0. Scope and conclusion

- **Date:** 2026-10-14.
- **Question:** Which reference projects teach agents to author skills, what do their methods add, and how do skills actually produced with those methods behave?
- **Source basis:** current local working files, preserved as [source snapshots and hashes](skill-authoring-benchmark/inputs/source-manifest.json). This is not a comparison against unverified remote latest versions.
- **Deliverables:** **14 complete generated skills**, author reports, source/history/browser fixtures, raw consumer responses, deterministic graders, and a replayable real-browser smoke harness.
- **Mutation boundary:** no production skill, reference-project source, installed skill root, global configuration, deployment, or publication was changed. A six-commit **synthetic Git fixture** was created in an isolated temporary repository for ECC; it is retained as a portable bundle, not committed into any existing project.

**Main conclusion:** the experiment does **not** establish a superior authoring method. On the frozen strict oracle, harness-flow, superpowers, mattpocock, ECC, and the unaided author all produced skills passing every held-out trial. The OMC and raw-procedure score differences occurred only on two cases with defensible alternative interpretations. Excluding both disputed cases for every arm leaves every supplied-procedure condition perfect on the remaining cases. The strongest measured distinction is **process and artifact size**, not a general reliability ranking.

Within this small, strongly specified task, harness-flow produced the shortest common-track artifacts while preserving the measured behavior. Superpowers' failure-to-instruction-form mapping, mattpocock's information hierarchy, and ECC's separation of generation/audit/behavior measurement remain useful design ideas. Do not import an entire upstream workflow based on these results.

## 1. Which projects contain an authoring method?

| Project | Relevant entrypoint | Native purpose and verification | Relationship to harness-flow |
| --- | --- | --- | --- |
| superpowers | [writing-skills snapshot](skill-authoring-benchmark/inputs/source-snapshots/superpowers/writing-skills-SKILL.md) | Reproduce failures, write guidance, test fresh consumers, refine wording; includes five-plus-repetition micro-tests | Closest comparable method; additional mapping from failure shape to instruction form |
| mattpocock/skills | [writing-for-agents](skill-authoring-benchmark/inputs/source-snapshots/mattpocock/writing-for-agents-SKILL.md), [skill mechanics](skill-authoring-benchmark/inputs/source-snapshots/mattpocock/writing-for-agents-SKILL-MECHANICS.md) | Design context pointers, information hierarchy, completion criteria, and invocation boundaries | A writing/reference discipline rather than a prescribed RED/GREEN execution loop |
| everything-claude-code (ECC) | [skill-create](skill-authoring-benchmark/inputs/source-snapshots/ecc/commands-skill-create.md) | Extract patterns from Git history; guard names, roots, overwrites, YAML, and atomic replacement | Generates from observed history; structural verification is not behavioral verification |
| oh-my-claudecode (OMC) | [skillify](skill-authoring-benchmark/inputs/source-snapshots/omc/skillify-SKILL.md) | Extract successful repeatable session workflows into learned-skill drafts | Requires a worthiness/provenance gate, but no mandatory post-draft behavioral campaign |
| gstack | [skillify template](skill-authoring-benchmark/inputs/source-snapshots/gstack/skillify-SKILL.md.tmpl) | Codify a successful browser scrape into code, fixture, and tests; stage before approval/installation | Executable browser-skill authoring, not a general instruction-writing method |
| Archon | [authoring-workflows](skill-authoring-benchmark/inputs/source-snapshots/archon/authoring-workflows-authoring-workflows.md) | Outcome-first workflow YAML, explicit gates, dry-run fixtures, and real-task use | Adjacent workflow authoring. No general SKILL.md authoring method found in the inspected runtime skill/command/agent surfaces |
| get-shit-done (GSD) | [skill dependency checker](skill-authoring-benchmark/inputs/source-snapshots/gsd/scripts-lint-skill-deps.cjs); installer command-to-skill conversion | Generate installable runtime surfaces from GSD command sources; validate dependency declarations and profile closure | Adjacent conversion/distribution machinery, not a general authoring skill |

Archon and GSD are included in the architectural comparison but **not assigned invented generated-skill scores**. Creating an Archon workflow or converting an existing GSD command would measure a different product. The actual skill-authoring methods identified above, plus harness-flow itself, were exercised; gstack remains a separate native-product track.

### Useful differences to retain

- **superpowers:** choose a positive recipe for wrong-shaped output, a required slot for omitted elements, an observable conditional for conditional behavior, and discipline-specific prohibitions for actual rule violations. This is more actionable than adding stronger language indiscriminately.
- **mattpocock:** keep universally required steps inline; disclose branch-specific reference behind a pointer that says when to load it. Co-locate a concept's rule and caveats. File length alone does not determine the right split.
- **ECC:** generation (`skill-create`), portfolio maintenance (`skill-stocktake`), and compliance observation (`skill-comply`) have different outputs and evidence. Do not conflate structural validity, repetition in Git history, and behavioral correctness.
- **OMC:** explicitly decide whether a discovery deserves a skill, belongs in project documentation, or remains too ambiguous. Its native quality gate favors project/workflow-specific discoveries; that policy differs from harness-flow's reusable-skill boundary.
- **gstack:** preserve successful-source provenance, isolate staged output, and distinguish fixture replay from live execution. Its “commit skill” step means installation by directory move, not necessarily a Git commit.

### Differences not to copy wholesale

Harness-flow already protects pre-existing user content, evaluates reference skills, and separates commit approval from push approval. Upstream superpowers contains broader deletion/publication wording and a support reference that excludes pure reference skills from pressure testing without equally clear qualification. The previously reviewed unconditional deletion and permission-error-as-empty-data examples also remain in upstream supporting material. A full upstream replacement would not automatically improve the local contract.

ECC/OMC's project-specific learned knowledge policy should not silently replace harness-flow's rule to keep private schemas and repository facts in project documentation. Likewise, gstack's installation lifecycle and ECC's portfolio audit should not all be folded into a single writing-skills runtime document.

## 2. Evaluation methods and primary evidence

The evaluation separates **authoring-process evidence** from **generated-product outcomes**. A document saying “test this” is not proof that a test ran; an agent saying “completed” is not proof that the requested artifact works.

Primary methodological sources:

1. [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). Distinguishes tasks, trials, graders, transcripts, and outcomes; recommends isolated repeated trials, balanced cases, deterministic graders where suitable, transcript inspection, and careful task/grade validity.
2. [Agent Skills specification](https://agentskills.io/specification). Supplies structural metadata/packaging constraints. Format checks do not establish discovery or behavioral quality.
3. [Anthropic skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md). An additional evaluation-method reference for baseline/with-skill comparisons, assertions, test prompts, and output review; not an extra authoring arm in this experiment.
4. [ECC skill-comply snapshot](skill-authoring-benchmark/inputs/source-snapshots/ecc/skill-comply-SKILL.md) and its [upstream implementation](https://github.com/affaan-m/ECC/tree/main/skills/skill-comply/scripts). Supplies the useful idea of supportive/neutral/competing prompts and observable tool-call timelines. Its LLM-generated specifications/classification and native `claude -p` execution are not equivalent to our fixed outcome grader.
5. [Local fresh-context evaluation guidance](../../skills/writing-skills/testing-skills-with-subagents.md) and the preserved upstream authoring references.

**Grader policy used here:** exact observable JSON fields are scored by code; arrays are order-insensitive but duplicates and extra IDs do not pass. Parse failures count as failures. Method adherence and interpretation problems are assessed from recorded calls, artifacts, and source text, not assigned an invented numeric score. No uncalibrated LLM judge determines the main results.

### Ten comparison dimensions

| Dimension | How to evaluate the authoring method | How the generated product was evaluated | Observation / boundary |
| --- | --- | --- | --- |
| 1. Source fidelity and provenance | Inspect actual inputs, source hashes, history/session evidence, and stated adaptations | Match selected evidence IDs to predeclared facts; preserve source-to-output records | ECC consumed real synthetic Git history; OMC consumed actual successful controlled completions; neither demonstrates discovery quality on messy production history |
| 2. Diagnostic and iteration discipline | Inspect actual baseline/candidate call sequence and evidence-driven revisions | Compare application/variation outcomes before freezing | harness-flow and superpowers each revised one observed release failure; other common arms needed no observed revision |
| 3. Metadata and selection | Verify export paths, frontmatter, names, and stated discovery roots | Parse YAML/name/length/link subset; run metadata-only positive and negative selection probes | All artifacts passed the common structural subset; all common arms passed selection probes. This is not native host activation |
| 4. Ordinary task correctness | Check that the method produced a complete usable artifact, not a scaffold | Frozen normal release and incident cases, five repetitions each | All supplied-procedure conditions passed normal cases; outcome evidence is stronger than author self-report |
| 5. Boundaries and missing evidence | Check whether variations are required and actually exercised | Superseded checks, expired waivers, absent recovery, conflicting owners, missing/empty native records | Most cases separated the no-skill control; two cases exposed ambiguity in the benchmark itself |
| 6. Pressure and untrusted text | Distinguish method-mandated pressure testing from optional probes | Manager-pressure and quoted-injection tasks; native extraneous hostile text | These are narrow output-policy probes. Common system scaffolding also warned against quoted instructions; consumers had no mutation tools |
| 7. Groundedness and uncertainty | Require exact failure evidence and honest limitations | Cause IDs vs hypotheses, disproof handling, owner ambiguity, effective check IDs | Frozen field grades preserved; plausible alternate interpretations received a separate sensitivity analysis, not hidden regrading |
| 8. Mutation and publication boundaries | Inspect approved export scope, guarded writes, stage usage, and omitted publication steps | `may_deploy`/`may_publish` fields; no live installation or deployment | ECC exercised candidate validation/atomic replacement; gstack stayed export-staged. Correct booleans do not prove safe deployment behavior |
| 9. Size and maintainability | Record process observations rather than rewarding more calls | Count generated Markdown words/bytes and native package size; inspect dependencies | harness-flow had the shortest common artifacts. Word count is whitespace-delimited, not tokenizer usage or monetary cost |
| 10. Portability and reproducibility | Record native steps vs mapped operations, source revisions, aliases, and full evidence | Frozen hashes, deterministic offline regrading, canonical SDK equality, real-browser CLI replay | Native Claude/OMC discovery and gstack daemon authorization were not tested; exact resolved model snapshots were unavailable |

## 3. Experimental design

The [protocol](skill-authoring-benchmark/protocol.md), [pre-holdout addendum](skill-authoring-benchmark/inputs/protocol-addendum.md), [shared author brief](skill-authoring-benchmark/inputs/author-brief.md), and [source packet](skill-authoring-benchmark/inputs/source-packet.md) define the experiment.

### Common instruction track

Five authoring treatments — harness-flow, superpowers, mattpocock, OMC, and ECC — each authored two skills. An **unaided author** produced the same two products without reading an authoring method. “Unaided” still received the same complete task/source packet, baseline evidence, safety boundary, and optional development evaluator.

Subjects:

- **release-evidence:** assess candidate-specific required checks, runtime evidence, waiver validity, effective supporting IDs, and the boundary between a readiness verdict and deployment authorization.
- **incident-handoff:** distinguish recovery from completed actions, confirmed causes from hypotheses, prevention from mitigation, accepted ownership from suggestions, and handoff from publication permission.

Controls:

- **no-skill:** consumer receives the task and output schema, but no procedure.
- **raw-procedure:** consumer receives the relevant uncompressed source procedure, with no authoring transformation.
- **unaided:** consumer receives a skill written from the same rich brief without an authoring-skill treatment.

Author agents used the native task-agent default. Consumers used the fixed Eval model alias **`smol`**. The tool interface did not expose the resolved model snapshot or decoding controls. Authoring is one run per common arm, producing two different products; consumer repetitions are **not independent authoring replications**.

Observed development baseline: release application **0/5**, incident application **3/5**. Authors could use two public cases per subject. Complete [development traces](skill-authoring-benchmark/results/author-development-traces.json) retain **170** additional fresh consumer samples, including controls. Two successful supplied-procedure demonstrations were recorded separately for session extraction.

After all common artifacts were frozen, the parent ran **400 held-out trials**: eight conditions × two subjects × five cases × five fresh repetitions. Trial order was shuffled with seed `20261014`; there were **zero provider errors**. Authors were instructed not to access the held-out file. This separation was not enforced by an OS sandbox and must not be described as cryptographically or physically blinded.

A separate **120-trial metadata selector probe** used names/descriptions only: two applicable requests and two non-applicable requests, five repetitions per request, for each of six authored common arms. It does not measure native automatic skill loading.

### Native executable track

Gstack's skillify method produced:

- [release-feed](skill-authoring-benchmark/artifacts/gstack/release-feed/SKILL.md): release rows into version/status/URL JSON.
- [service-notices](skill-authoring-benchmark/artifacts/gstack/service-notices/SKILL.md): notice articles into title/severity/URL JSON.

Both began with **actual local-page Chromium navigation and DOM extraction**, preserved in [browser-session.json](skill-authoring-benchmark/inputs/browser-session.json). Each product contains complete executable code, tests, captured HTML, and a byte-identical copy of the canonical browse SDK. The two native subjects had separate author contexts.

The gstack checkout lacked installed dependencies and a built browse binary. We therefore mapped browser operations to a **real Chromium adapter**, not canned responses: the unchanged SDK sends `goto`/`html` requests; the adapter actually navigates Chromium and returns its DOM. This exercises the generated CLI and parser but does **not** establish native gstack installation, daemon auth/scope behavior, or live third-party-site freshness. No generated artifact was installed into a discoverable root.

## 4. Generated-product results

### Frozen strict-oracle results

The primary grades below remain unchanged, including the disputed cases. **They are descriptive results for these frozen artifacts, not a method leaderboard.** “Stable cases” counts cases where all five observed trials passed; it is not an estimated universal pass^5 probability.

| Consumer condition | Exact full-output passes | Correct required fields | Stable cases | Task-validity sensitivity: both disputed cases excluded |
| --- | ---: | ---: | ---: | ---: |
| harness-flow artifact | 50/50 | 225/225 | 10/10 | 40/40 |
| superpowers artifact | 50/50 | 225/225 | 10/10 | 40/40 |
| mattpocock artifact | 50/50 | 225/225 | 10/10 | 40/40 |
| OMC artifact | 47/50 | 216/225 | 9/10 | 40/40 |
| ECC artifact | 50/50 | 225/225 | 10/10 | 40/40 |
| Unaided-author artifact | 50/50 | 225/225 | 10/10 | 40/40 |
| Raw source procedure | 45/50 | 220/225 | 9/10 | 40/40 |
| No generated skill or procedure | 10/50 | 157/225 | 0/10 | 8/40 |

Evidence: [raw responses](skill-authoring-benchmark/results/holdout-responses.json), [deterministically recomputed summary](skill-authoring-benchmark/results/summary.json), and [case-validity review](skill-authoring-benchmark/results/task-validity-review.json).

### Why the score differences do not establish superiority

**OMC, `r-latest`:** three of five trials held the release because a record only said `runtime PASS` and did not describe an exercised path. Its generated instruction explicitly asks runtime records to describe a path. The frozen oracle treated the shorthand as sufficient. A conservative interpretation is defensible; this is not clean evidence that OMC mishandles superseded failures.

**Raw procedure, `i-pressure`:** every trial included rollback/recovery record `z2` in hypothesis IDs. The source itself says rollback coinciding with recovery is hypothesis-level rather than confirmed evidence, while the frozen oracle expected only explicit cause claim `z1`. The extra ID is a plausible source interpretation, not demonstrated fabrication.

These problems were discovered **after** scoring. We did not change expected answers, repair artifacts, or replace unfavorable responses. The sensitivity column removes the same two cases from every condition. It is a post-hoc validity check, not a new pre-registered headline score. All authored and raw-procedure conditions pass the remaining cases, so the evidence does not support ranking them by reliability.

### Structure and metadata selection

All **14** generated SKILL.md files passed the exercised common subset: YAML present, name/directory match, lowercase name format and length, nonempty description within the limit, under 500 lines, and resolvable local Markdown links where present. This is not full conformance certification for every host's extensions.

Every common authored arm passed **20/20** metadata-only selection trials. Mattpocock's two descriptions do not start with the local literal `Use when`; that is a local style difference, not a native-format failure. The selector result provides no evidence that the prefix difference changes native discovery.

Evidence: [structural checks](skill-authoring-benchmark/results/structural-checks.json), [selector responses](skill-authoring-benchmark/results/discovery-responses.json).

### Native executable results

| Check | Observed result | What it establishes |
| --- | --- | --- |
| Author-generated fixture tests | 15 pass, 0 fail; 42 assertions across two files | Both complete packages execute their authored test suites |
| Independent frozen parser cases | 10/10, five per subject | Nominal extraction, layout changes, incomplete records, empty collections, and extraneous hostile text match expected data |
| Actual CLI through real Chromium adapter | Both scripts exit 0 with exact expected JSON; successful independent replay retained | Canonical SDK → actual navigation/DOM → generated parser → stdout path works |
| Canonical SDK integrity | Both copies byte-identical; all 11 native artifact files unchanged after freeze | No SDK substitution or post-evaluation product repair |

The native packages are **78,192 bytes** (release-feed) and **69,173 bytes** (service-notices), including tests, fixtures, SDK copies, and vendored HTML entity data. These are different deliverables from pure instruction skills; their size is not a fair cross-track efficiency ranking.

Infrastructure failures are retained rather than charged to the generated skills or hidden. Four early CLI attempts timed out while the adapter routed browser operations through nested tool helpers. Moving the adapter callbacks into the raw Puppeteer context succeeded without changing either artifact. The saved replay initially reported false negatives because strict object equality compared different JavaScript realms; prototype inspection confirmed the mismatch while normalized JSON was identical. The grader was corrected to canonical JSON comparison and replayed successfully. See [infrastructure notes](skill-authoring-benchmark/results/infrastructure-notes.json).

## 5. What the authoring methods actually did

| Authoring arm | Actual development observations | Behavioral revision observed | Generated Markdown words, two skills |
| --- | --- | --- | ---: |
| harness-flow | 11 probe calls / 55 trials, including no-skill controls, sequential application/variation and regression | Tightened effective evidence selection after the release variation passed only 1/5; subsequent variation and regression passed | 682 |
| superpowers | 11 probe calls / 55 trials, including controls and regression | Added explicit waiver-first handling after the first release candidate passed 4/5; subsequent application and regression passed | 1,018 |
| mattpocock | 4 voluntarily used probe calls / 20 trials | No revision after all public probes passed; organized steps, completion criteria, and co-located evidence rules | 950 |
| OMC | 4 voluntarily used probe calls / 20 trials | No revision after public probes passed; extracted steps, success criteria, and pitfalls with native triggers metadata | 1,042 |
| ECC | No candidate behavioral probes during authoring | Parsed and checked temporary candidates before atomic replacement; parent later measured their behavior | 1,182 |
| Unaided author | 4 voluntarily used probe calls / 20 trials | No revision after public probes passed; ordinary drafting from the same rich source packet | 1,278 |

Do not compare aggregate development pass rates as method quality: the TDD arms intentionally include failing controls and intermediate candidates. A larger number of probes is process cost/evidence, not automatically a stronger final product.

Method reports: [harness-flow](skill-authoring-benchmark/results/author-harness-flow.json), [superpowers](skill-authoring-benchmark/results/author-superpowers.json), [mattpocock](skill-authoring-benchmark/results/author-mattpocock.json), [OMC](skill-authoring-benchmark/results/author-omc.json), [ECC](skill-authoring-benchmark/results/author-ecc.json), [unaided](skill-authoring-benchmark/results/author-unaided.json), [gstack releases](skill-authoring-benchmark/results/author-gstack-releases.json), [gstack notices](skill-authoring-benchmark/results/author-gstack-notices.json). Shared evaluator traces, rather than reports alone, establish the probe counts and outputs.

**Method-fidelity limits:** OMC's real-discovery/effort quality gate cannot be established from a designer-specified synthetic task, and its flat learned-file storage was adapted to export directories. ECC's history is real Git but artificially clean and narrowly constructed. Several arms reported incidental exposure to the local writing-skills wrapper due harness routing. Their claims of following only their assigned method do not erase that exposure. Native publication steps were deliberately not authorized.

## 6. Implications for harness-flow

1. **Keep the small local core.** It produced the shortest common-track artifacts with the measured outcomes intact. This is a task-specific observation, not proof that fewer words always work better.
2. **Consider a compact failure-to-form rule from superpowers.** The recorded waiver/effective-evidence revisions show that a targeted conditional can fix a specific observed gap. Do not respond to every gap by adding universal prohibitions.
3. **Use mattpocock's information hierarchy as an editing lens.** Make reference-loading conditions explicit and keep the rule, qualification, and completion criterion together. No need to expand the runtime skill into a long writing textbook.
4. **Keep structural, discovery, process, and outcome checks distinct.** ECC's safe writer and trace-oriented evaluator offer different guarantees. YAML validity and tool-order compliance must not substitute for task correctness.
5. **Audit the evaluator before blaming a skill.** The disputed cases and cross-realm comparator false negatives were evaluation defects/ambiguities. Preserve primary evidence, inspect actual outputs, and report sensitivity instead of inventing a winner.
6. **Do not justify more machinery from a ceiling-effect result.** The unaided control also succeeded. More varied source tasks and independent authoring replications would be needed to estimate causal method benefits. The current evidence supports selective improvement, not a new orchestration framework.

No proposed production writing-skills changes were applied in this investigation.

## 7. Reproduction and evidence map

### Offline outcome regrading

From the harness-flow root:

```bash
python3 design/reference/skill-authoring-benchmark/scripts/score.py
bun design/reference/skill-authoring-benchmark/scripts/evaluate-native.ts
bun test design/reference/skill-authoring-benchmark/artifacts/gstack/release-feed/script.test.ts design/reference/skill-authoring-benchmark/artifacts/gstack/service-notices/script.test.ts
```

`score.py` regrades all saved common-track responses, checks trial counts and duplicate identities, and verifies frozen common artifact hashes. It uses only the Python standard library. The native commands need Bun, not the original gstack daemon.

### Fresh model repetitions

[run_holdout.py](skill-authoring-benchmark/scripts/run_holdout.py) is an OMP Eval-hosted driver, not a standalone provider SDK. Load it in Python Eval, call `prepare_trials()`, and run eight `run_wave()` calls. It requires the host's stateless `completion`, `tool.write`, and `smol` alias. Archive existing result files before an intentional rerun; the driver writes wave files. Exact model replay is not guaranteed because the alias does not expose a resolved snapshot or decoding settings.

The metadata selector's full system prompt, candidate descriptions, requests, responses, expected labels, and grades are preserved in its response file. Its four cases are separately stored in [discovery-cases.json](skill-authoring-benchmark/inputs/discovery-cases.json).

### Real browser replay

Import `replayBrowser` from [replay_browser.js](skill-authoring-benchmark/scripts/replay_browser.js) in OMP JavaScript Eval and call `await replayBrowser(browser)`. It opens managed Chromium, serves the preserved local HTML on fresh loopback ports, executes both unchanged generated programs through the canonical SDK, compares exact JSON, and closes its tabs/servers. The benchmark URL is overridden for replay, so the original ephemeral port is not a dependency.

This is an explicit adapter experiment. It does not impersonate or validate native gstack daemon authentication; the adapter's capability string is a local synthetic test value, not a credential.

### Durable evidence

- [Source versions, working-file hashes, and snapshots](skill-authoring-benchmark/inputs/source-manifest.json).
- [Frozen common artifacts](skill-authoring-benchmark/results/artifact-manifest.json) and [frozen native artifacts](skill-authoring-benchmark/results/native-artifact-manifest.json).
- [Public cases](skill-authoring-benchmark/inputs/development-cases.json), [held-out cases](skill-authoring-benchmark/inputs/heldout-cases.json), and [native parser cases](skill-authoring-benchmark/inputs/browser-heldout-cases.json).
- [Initial no-skill baseline](skill-authoring-benchmark/results/development-baseline.json), [author development traces](skill-authoring-benchmark/results/author-development-traces.json), [held-out responses](skill-authoring-benchmark/results/holdout-responses.json), and [summary](skill-authoring-benchmark/results/summary.json).
- [Synthetic Git provenance](skill-authoring-benchmark/inputs/history-fixture.json) and [portable history bundle](skill-authoring-benchmark/inputs/history.bundle). The original temporary repository was removed after the authors finished; reconstruct it in a new empty directory with `git clone <bundle-path> <new-directory>` if needed.
- [Native held-out outcomes](skill-authoring-benchmark/results/native-heldout.json), [actual direct-browser CLI output](skill-authoring-benchmark/results/native-cli-direct-browser.json), [saved replay verification](skill-authoring-benchmark/results/native-cli-replay.json), and [SDK/hash checks](skill-authoring-benchmark/results/native-integrity.json).
- [Final evidence audit](skill-authoring-benchmark/results/final-audit.json).

Source snapshots and copied SDK material retain their upstream identity; consolidated project notices are in [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md). Generated native parsers also identify their Python standard-library HTML entity data source.

## 8. Limits that must accompany the results

- Only two common subjects, one authoring run per method, and five consumer repetitions per case; no statistical superiority claim.
- Rich, mostly complete source policies and explicit output schemas reduce the discovery/design work and create a ceiling effect. This tests incremental authoring guidance over a strong brief.
- The no-skill control lacks task-specific procedure knowledge, so its gap is not the isolated effect of a meta-authoring skill. The raw-procedure and unaided controls address that confound partially.
- Two held-out cases were semantically contestable. Primary grades and post-hoc sensitivity are both retained.
- Consumer alias `smol`, native default author agents, and imperfect treatment isolation limit exact reproducibility and generalization to other models.
- Consumer trials were single-turn, tool-free decisions. They do not prove multi-turn operational behavior, safe real deployment, or native automatic skill activation.
- All generated Markdown was supplied to consumers. This does not measure selective retrieval of supporting files; the common products happened to be self-contained.
- Native gstack tests use controlled local pages and a real-browser adapter. No live-site drift, external-service behavior, native installed discovery, or native daemon security claim is made.
- Structural validators were evaluated separately in the preceding repository survey; ECC's 810-directory check and GSD's 134-skill dependency check are not evidence that these generated artifacts behave correctly.
