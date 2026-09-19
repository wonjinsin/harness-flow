# Code Review Framework Benchmark

**Date:** 2026-09-19
**Status:** Completed comparative experiment
**Model:** `gpt-5.6-terra`
**Reasoning effort:** `medium`

## Purpose

This document consolidates the code-review experiments performed while redesigning
`requesting-code-review`. It compares the eight original frameworks, the earlier
harness-flow candidates, and the later Matt-based variants under the same seeded
review task.

The target was a review workflow that:

1. approaches Matt's latency;
2. exceeds Matt's quality by retaining 6/6 recall with zero false positives;
3. stays as simple as the current two-file runtime;
4. reduces reviewer token use;
5. avoids verifier, synthesis, schema, evidence-packet, risk-router, and multi-stage
   review-loop layers.

No existing framework benchmark was rerun during the redesign. Stored results were
used for comparison. Each new final candidate used two fresh parallel review agents
against the same read-only checkout.

## Benchmark fixture

| Field | Value |
|---|---|
| Checkout | `/private/tmp/hf-review-bench.UXIVNC` |
| From | `ec8c244bbb42f10e498af5aed4f042ffc3d9dfff` |
| To / HEAD | `cdb04bc937a04ee0661eedc416a2ed4364c70f04` |
| Baseline verification | `node --test`: 285/285 passing |
| Reviewer sandbox | Read-only |
| Token accounting | Input + output, including cached input |
| Judge accounting | Excluded from reviewer time and tokens |

Every measured run verified the pinned HEAD and compared repository state before
and after review. The state snapshot covered the worktree, index, refs, local Git
configuration, remotes, dirty submodules, and the pinned range.

## Ground-truth regressions

| Seed | Concrete regression | Required consequence |
|---|---|---|
| S1 | `prepare-review.js` uses `--ignore-submodules=all` | Dirty submodules can be hidden and accepted. |
| S2 | `--no-ext-diff` and `--no-textconv` were removed | Configured external helpers can run or alter collected evidence. |
| S3 | `read-review-evidence.js` checks only the first 12 digest characters | Invalid or modified evidence can pass digest validation. |
| S4 | The deduplication key omits `correction` | Findings with distinct corrections can be collapsed and lost. |
| S5 | Only `Critical` findings are treated as blocking | `Important` findings can produce `Blocking findings: none`. |
| S6 | New `highRiskSignals` do not make a standard review incomplete | Required escalation can be bypassed. |

A seed counted only when a report identified both its concrete cause and reachable
effect. Nearby observations did not count.

The following were accepted design decisions, not defects:

- semantic-conflict adjudication belongs to the caller, not `combineReviews`;
- unbounded `Promise.all` file-read fanout is intentional.

## Original framework benchmark

| Rank | Framework | Wall time | Calls | Reviewer tokens | Recall | False positives | Topology |
|---:|---|---:|---:|---:|---:|---:|---|
| 1 | Matt Pocock Skills | 78.901 s | 2 | 575,694 | 6/6 | 1 | Standards + Spec in parallel |
| 2 | Superpowers | 114.048 s | 1 | 323,791 | 6/6 | 0 | Single multi-pass reviewer |
| 3 | ECC | 119.019 s | 2 | 826,872 | 6/6 | 0 | General + triggered Security reviewer |
| 4 | GSD | 126.334 s | 1 | 596,377 | 6/6 | 0 | Single phase-scoped deep reviewer |
| 5 | Existing harness-flow | 132.897 s | 3 | 1,977,755 | 5/6 | 1 | Two detail + one integration reviewer |
| 6 | OMC | 136.466 s | 3 | 1,201,128 | 6/6 | 0 | Functional + Security + Quality lanes |
| 7 | Archon | 393.407 s | 6 | 2,933,443 | 6/6 | 0 | Five specialists + synthesis |
| 8 | gstack | 407.203 s | 7 | 2,600,977 | 5/6 | 2 | Structured, specialist, adversarial, red-team, synthesis |

### Token detail

| Framework | Input | Output | Total |
|---|---:|---:|---:|
| Matt Pocock Skills | 570,302 | 5,392 | 575,694 |
| Superpowers | 318,852 | 4,939 | 323,791 |
| ECC | 816,695 | 10,177 | 826,872 |
| GSD | 591,567 | 4,810 | 596,377 |
| Existing harness-flow | 1,964,369 | 13,386 | 1,977,755 |
| OMC | 1,186,451 | 14,677 | 1,201,128 |
| Archon | 2,902,075 | 31,368 | 2,933,443 |
| gstack | 2,575,974 | 25,003 | 2,600,977 |

## What each framework contributed

### Matt Pocock Skills

Matt established the latency frontier: two independent axes, parallel dispatch,
sub-400-word reports, side-by-side output, and no synthesis. Its Standards lane
found all six seeds. The Spec lane introduced the semantic-conflict false positive.
The result is strong but was measured only once, so stability is unknown.

### Superpowers

Superpowers established the token-efficiency frontier. One reviewer preserved a
single context and followed a deliberate multi-pass order, reaching 6/6 with zero
false positives. The trade-off was 35.147 seconds more latency than Matt.

### ECC

ECC showed the value of asymmetric attention: a broad reviewer plus a specialist
triggered by the change. It avoided the cost of always-on specialist proliferation,
but repeated enough repository context to use 826,872 tokens.

### GSD

GSD demonstrated that explicit import, caller, boundary, and error-propagation
tracing can produce strong recall with one reviewer. Its deeper traversal increased
reasoning latency.

### OMC

OMC's Functional lane found all six seeds. This supports requirement-by-requirement
verification, but the full three-lane topology doubled Matt's token use.

### Archon and gstack

Role proliferation, adversarial passes, red-team passes, and synthesis did not form
an efficient frontier. Archon was accurate but very slow. gstack remained slow while
missing S5 and producing two false positives.

### Existing harness-flow

Immutable evidence, assignment validation, schemas, deterministic combination, and
an integration reviewer did not guarantee recall. The workflow missed S2, produced
one false positive, and consumed more tokens than every other non-synthesis design.
Only its small deterministic pre/post state check remained worth preserving.

## Earlier harness-flow candidates

| Candidate | Runs | Wall time | Reviewer tokens | Recall | False positives | Decision |
|---|---:|---:|---:|---|---:|---|
| Precision-first two-lane | 3 | 143.961 / 149.861 / 188.383 s | 1,134,394 / 947,409 / 825,178 | 6/6 each | 0 | Accurate, too slow |
| Single reviewer | 3 | 112.6 s average | 385,665 average | 6/6, 3/6, 6/6 | 0 | Token-efficient, unstable |
| Primary + verifier | 3 | 183.457 s average | Not retained | 6/6, 5/6, 6/6 | 0 | Verifier destroyed latency |
| Code/Spec parallel | 2 | 84.335 / 78.254 s | 707,307 / 561,190 | 6/6, 3/6 | 0 | Fast, unstable |
| Disjoint file slices | 2 | 108.872 / 82.329 s | 628,807 / 400,717 | 4/6, 4/6 | 0 | Lower tokens, insufficient recall |
| Matt-hybrid three-pass | 2 | 92.886 / 56.345 s | 750,055 / 519,653 | 5/6, 3/6 | 0, 1 | Fast average, unstable |

The file-slice experiment was retired. Alphabetical or disjoint file ownership
reduced cross-file reasoning and missed S2 in both runs.

## Attention-routing candidates

These candidates retained the small two-agent topology but did not start from the
full Matt prompt. They are included to distinguish topology imitation from a true
Matt-based experiment.

| Candidate | Wall time | Reviewer tokens | S1 | S2 | S3 | S4 | S5 | S6 | FP |
|---|---:|---:|:---:|:---:|:---:|:---:|:---:|:---:|---:|
| Standards-like Code + requirement trace | 93.316 s | 789,589 | Yes | Yes | No | No | No | No | 0 |
| Risk-bearing + obligation hunks | 95.436 s | 951,600 | Yes | No | No | Yes | Yes | Yes | 0 |
| Reverse executable sweep | 108.861 s | 736,954 | Yes | No | No | Yes | Yes | No | 0 |

All three failed on their first run, so a second run could not satisfy the rule that
both runs must reach 6/6. They were removed after measurement.

## True Matt-based candidates

The next three candidates shared the complete Matt review core rather than only its
topology:

- Standards + Spec axes;
- all twelve Fowler smell heuristics;
- Matt's original Standards and Spec briefs;
- parallel fresh contexts;
- 400-word limits;
- side-by-side output without synthesis.

The harness-flow safety envelope added only the exact SHA range, read-only contract,
pre/post state snapshots, concrete evidence gate, blocking severity contract, and a
guard against assigning semantic-conflict adjudication to the combiner.

Each candidate then added one bounded attention strategy inside the existing two
agents.

| Candidate | Imported principle | Wall time | Input | Output | Total | Recall | FP | State |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Matt + Superpowers | Silent same-context completion pass | 79.011 s | 536,411 | 5,359 | 541,770 | 4/6 | 0 | Unchanged |
| Matt + GSD | Boundary and call-chain tracing | 76.859 s | 697,082 | 5,557 | 702,639 | 4/6 | 0 | Unchanged |
| Matt + ECC/OMC | Conditional integrity focus + functional requirement verification | 111.972 s | 653,046 | 7,270 | 660,316 | 6/6 | 0 | Unchanged |

### Seed matrix

| Candidate | S1 | S2 | S3 | S4 | S5 | S6 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Matt + Superpowers | Yes | No | Yes | Yes | Yes | No |
| Matt + GSD | Yes | No | Yes | No | Yes | Yes |
| Matt + ECC/OMC | Yes | Yes | Yes | Yes | Yes | Yes |

The Matt + ECC/OMC S4 wording was sent to a judge because it mentioned marking a
conflict incomplete. The judge confirmed that it detected the loss of distinct
correction-bearing evidence without creating a separate requirement for the
combiner to adjudicate semantic contradiction.

Judge cost was recorded separately:

| Calls | Input | Output | Total | Result |
|---:|---:|---:|---:|---|
| 1 | 18,446 | 134 | 18,580 | S4 detected; no separate false positive |

### Relative to Matt

| Candidate | Time change | Token change | Interpretation |
|---|---:|---:|---|
| Matt + Superpowers | +0.1% | -5.9% | Matched speed and improved tokens, but lost two seeds |
| Matt + GSD | -2.6% | +22.1% | Fastest run, but lost two seeds |
| Matt + ECC/OMC | +41.9% | +14.7% | Improved precision to 6/6 and FP 0, but missed latency and token targets |

The successful quality candidate was 1.8% faster than Superpowers but used 103.9%
more reviewer tokens.

## Runtime surface

| State | Runtime files | Lines | Words |
|---|---:|---:|---:|
| Current restored Code/Spec implementation | 2 | 228 | 1,150 |
| Matt-based experimental range | 2 | 259-264 | 1,437-1,488 |

The two runtime files are `SKILL.md` and `scripts/review-state.js`. No candidate
added a verifier, synthesis prompt, schema, report combiner, evidence packet, or
risk router.

## Pareto frontier

No tested design satisfied every target.

| Objective | Best measured result | Limitation |
|---|---|---|
| Lowest latency | Matt + GSD: 76.859 s | 4/6 recall and 702,639 tokens |
| Lowest reviewer tokens | Superpowers: 323,791 | 114.048 s latency |
| Fast 6/6 | Matt: 78.901 s | One false positive and one measured run |
| 6/6 with zero false positives | Matt + ECC/OMC: 111.972 s | Too slow and slightly over the 650,000-token ceiling |
| Stable 6/6 with zero false positives | Precision-first two-lane | 160.735 s average and about 968,994 tokens |
| Smallest retained runtime | Current Code/Spec: 228 lines | Recall varied from 6/6 to 3/6 |

## Conclusions

1. **Topology is not enough.** Copying Matt's two-lane shape without its complete
   review core did not reproduce Matt's result.
2. **Completion instructions do not stabilize recall by themselves.** Multiple
   candidates explicitly required full-hunk completion and still missed two or
   three seeds.
3. **Functional requirement tracing improves recall but costs latency.** The only
   new 6/6, zero-false-positive candidate used the ECC/OMC attention pattern and
   took 111.972 seconds.
4. **More agents are not a quality guarantee.** Archon, gstack, OMC, and the old
   harness-flow workflow paid large duplication and synthesis costs.
5. **One context is token-efficient but can be unstable.** Superpowers and the
   single-reviewer candidate used fewer tokens, but only Superpowers' stored run
   combined full recall with zero false positives.
6. **A deterministic state helper is valuable.** It adds little runtime complexity
   while detecting checkout mutation that prompt-only isolation cannot guarantee.
7. **The remaining problem is attention stability.** Prompt-only routing has not
   consistently forced reviewers to inspect every safety-relevant changed path
   without increasing traversal time.

The measured evidence does not justify restoring the former evidence packet,
schema, verifier, synthesis, or multi-review loop. The current small Code/Spec
implementation was restored after the experiments because no replacement improved
quality, speed, tokens, and simplicity together.

## Stored result locations

| Experiment | Location |
|---|---|
| Original eight frameworks | `/private/tmp/hf-review-results.NDQ9Rp` |
| Precision-first two-lane | `/var/folders/3h/1nggl5mj5vz25jxbf1vn9jp00000gn/T/hf-greenfield-results.VOjdqV` |
| Current Code/Spec | `/private/tmp/hf-mattlike-results.HMtWUo` |
| Disjoint file slices | `/private/tmp/hf-sliced-results.jUHvFf` |
| Attention-routing candidates | `/private/tmp/hf-three-candidates-results.HpTvvf` |
| True Matt-based candidates | `/private/tmp/hf-matt-base-results.z2FS6f` |

These paths are experiment artifacts, not runtime dependencies.


## New experiment: typed change locations with asymmetric entry points

The session began with an intentionally dirty checkout. All existing tracked and
untracked files, deletions, staged/unstaged diffs, and status were preserved under
`/var/folders/3h/1nggl5mj5vz25jxbf1vn9jp00000gn/T/hf-attention-experiment.za4g5ql0`.
`rules/guidelines.md` was absent. Baseline `node --test`: 211/211 passing.
No previous LLM benchmark was rerun.

### Static comparison before implementation

All three designs start from Matt's original Standards and Spec briefs, all twelve
Fowler smells with definitions and remedies, repo-overrides/tooling exclusions,
two fresh parallel reviewers, a 400-word limit per axis, and separate reports with
no synthesis. The estimates below are hypotheses, not measured recall.

| New approach | Expected recall | S2 / S6 stability | Cross-file reasoning | Duplicate context/tokens | Latency risk | False-positive risk | Runtime complexity |
|---|---|---|---|---|---|---|---|
| A: typed changed-operation locations | Medium-high | Medium-high / medium-high: explicit command-option and decision locations, including additions | Preserved; no file ownership | Standards reads full diff; Spec enters through requirements and typed source locations | Low-medium; repeated relevant reads remain possible | Low-medium; types are navigation, never defect evidence | Small lexical index in existing helper |
| B: removed/replaced token deltas | Medium | High for actual option deletions / low-medium for missing new-code gates | Preserved | Very small deltas; full new files still need exploration | Low | Medium: deletion is not inherently regression | Small token multiset comparison |
| C: output dependency locations | Potentially high | Medium for command configuration / high for omitted decision dependencies | Preserved across producers and consumers | Less broad context, but dependency expansion can grow | High: parser and dependency traversal | Medium: aliases/dynamic dispatch defeat syntactic dependence | Largest; conflicts with compact-runtime goal |

A was selected for its small deterministic structure and applicability to wholly
new files. B cannot expose safeguards absent from newly added files. C requires
more runtime machinery and traversal than justified. Unlike earlier zero-context
inventories, A groups changed locations by operation kind, sends the index only to
Spec, and gives the two axes different entry points. It does not divide files,
rank risk, supply source bodies, validate assignments, or claim coverage proof.

The borrowed principles are ECC's asymmetric attention and OMC's functional
requirement checking. GSD contributes permission to follow relevant cross-file
callers/consumers, without a mandatory whole-call-chain pass. The existing
harness-flow pinned state envelope remains. No verifier, evidence packet, schema,
report combiner, risk router, or additional reviewer is introduced.

### Implementation and benchmark protocol

Contract tests changed before runtime implementation. Three focused additions
covered original Matt content, added/deleted operation locations with no source
body, and bounded output disclosure. The external-diff non-execution test also
covered the new CLI view. Candidate `node --test`: **214/214 passing**, exit 0.
The initial 211-test tree remained the restoration baseline. Canonical documents
were deliberately left unchanged while retention was undecided.

Runtime: two files, **283 lines / 1,925 whitespace-delimited words**:
`SKILL.md` 140 lines / 1,288 words; `review-state.js` 143 lines / 637 words.
This is +55 lines (+24.1%) and +775 words (+67.4%) versus 228 / 1,150.
Much of the word growth is the verbatim original Fowler definitions and remedies;
the helper grows by 44 lines. The runtime adds no dependency or other file.
The benchmark's attention index is **2,293 bytes / 9 lines**, produced from generic
lexical patterns without seed IDs, known buggy symbols, source bodies, or severity
labels. It is advisory, not an AST, a requirement mapper, or a completeness proof.

Two independent `codex exec --ephemeral --ignore-user-config` processes were started
concurrently using `-m gpt-5.6-terra -c model_reasoning_effort="medium" -s read-only`.
This matches the prior experiment's CLI multi-agent transport; each axis receives
only its own filled prompt. No reviewer inherits the implementation
conversation. The original Standards brief and the full baseline are pasted into Standards;
Spec receives its original brief, resolved requirements, and the index. No seed
list or old report is passed. Both accepted design decisions are explicitly supplied.
The reports remain separate files; the runner performs timing/accounting only.

Pre/post snapshots require exact HEAD, clean status including submodules, index,
refs, local config, and remotes. An additional file-content fingerprint covers all
73 tracked and other checkout files. Commands, prompts, events, original reports,
scoring, and frozen candidate files are saved alongside each run. Token totals
include cached input; reasoning output is a subset of output, not added again.
Reviewer wall time covers parallel launch through both exits; pre/post checks and
index preparation are outside that interval, as in the stored benchmarks.

Run 1 passed the quality gate (6/6, FP 0), permitting exactly one unchanged repeat.
Direct seed scoring was unambiguous: Spec found all six; Standards found S1 and S3.
Spec's last finding names both the correction-key loss and the Important-only
blocking failure with their separate effects. No judge was needed for that wording.

### Measured results

| Run | Wall time | Input | Cached input (included) | Output | Total | Recall | FP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 95.311 s | 703,741 | 578,560 | 7,258 | 710,999 | 6/6 | 0 |
| 2 | 91.351 s | 783,249 | 647,936 | 6,480 | 789,729 | 4/6 | 1 |
| Mean | **93.331 s** | **743,495** | **613,248** | **6,869** | **750,364** | Not stable | Not zero |

Raw axis measurements (parallel durations must not be summed):

| Run | Axis | Duration | Input | Cached input (included) | Output | Total | Report words |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | Standards | 79.439 s | 355,679 | 299,008 | 3,420 | 359,099 | 190 |
| 1 | Spec | 95.309 s | 348,062 | 279,552 | 3,838 | 351,900 | 320 |
| 2 | Standards | 91.351 s | 447,264 | 375,552 | 3,487 | 450,751 | 270 |
| 2 | Spec | 74.065 s | 335,985 | 272,384 | 2,993 | 338,978 | 191 |

All four processes exited 0; all four reports stayed under 400 whitespace-delimited
words. Both runs used fresh processes with the same frozen candidate and settings.
No third run was executed. Separate raw reports are retained without synthesis.

| Run / axis | S1 | S2 | S3 | S4 | S5 | S6 | FP |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---:|
| 1 / Standards | Yes | No | Yes | No | No | No | 0 |
| 1 / Spec | Yes | Yes | Yes | Yes | Yes | Yes | 0 |
| **1 / union** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **0** |
| 2 / Standards | Yes | No | No | Yes | Yes | Yes | 0 |
| 2 / Spec | Yes | No | No | No | Yes | Yes | 1 |
| **2 / union** | **Yes** | **No** | **No** | **Yes** | **Yes** | **Yes** | **1** |

The unions above are benchmark scoring only, not combined user-facing review reports.
Every credited seed includes its specific implementation cause and harmful result.
S6 was found twice, but S2 remained unstable and S3 was also lost on the repeat.

The repeat's Spec false positive claims `combine-reviews.js:199` must reject
`reviewedFileIndices: [1, 0]` because source evidence is ordered. It conflates two
contracts: source files must match the canonical manifest order, while coverage is
a set of canonical indices. Reordering coverage indices does not reorder source or
lose coverage. Evidence: `read-review-evidence.js:30-32` validates source ordering;
`combine-reviews.js:149-151` independently checks packet file order;
`tests/review/combine-reviews.test.js:201-205` deliberately accepts permuted coverage
indices, while lines 326-335 reject mismatched packet file/manifest order for both
transports. Requiring sorted coverage would turn accepted behavior into a defect.
Neither run flagged caller-owned semantic adjudication or intentional file-read fanout.

Judge: **not invoked**. Direct seed mapping and the false-positive rebuttal were
unambiguous. Judge calls/time/input/output/total: **0 / 0 s / 0 / 0 / 0**, excluded
from reviewer accounting.

### Comparison, bottleneck, and decision

Percentages use the two-run candidate mean against the stored original framework
run; the originals were not rerun and have only one observation each.

| Reference | Wall-time change | Reviewer-token change | Quality comparison |
|---|---:|---:|---|
| Matt (78.901 s / 575,694) | **+18.29%** | **+30.34%** | Matt had 6/6, FP 1 once; candidate varied 6/6 to 4/6, FP 0 to 1 |
| Superpowers (114.048 s / 323,791) | **-18.17%** | **+131.74%** | Superpowers had 6/6, FP 0 once; candidate does not match that quality reliably |

The small index did not control the actual reading footprint. In run 1 both axes
made seven command calls, returning 401,478 and 417,102 bytes respectively in raw
command events. Both opened all three production helpers, then reopened broad
numbered ranges plus contracts and tests. Run 2 used eight and seven calls
(322,531 and 293,687 returned bytes). These byte counts describe tool output, not
model-token billing or independent source coverage. The raw events contain no
explicit output-truncation markers; source prose containing "truncated" must not
be counted as a tool truncation event.

The precise structural limit is that an operation-kind location index identifies
where syntax changed but not which dependency discharges each requirement. Long
lists inside newly added functions still led to broad reads. Spec's requirement
entry point therefore retained substantial overlap with Standards. Attention
shifted across repetitions despite identical deterministic hints: S6 held, while
S2 and S3 disappeared. The false positive additionally shows that lexical similarity
cannot distinguish source order from coverage-set order. There is no evidence that
another completion sentence or a third reviewer would fix this trade-off cheaply.

| Success criterion | Result |
|---|---|
| Both runs 6/6 | Fail: 6/6, 4/6 |
| Both runs FP 0 | Fail: 0, 1 |
| Mean <= 90 s (prefer <= 85 s) | Fail: 93.331 s |
| Mean <= 650,000 tokens (prefer <= 575,694) | Fail: 750,364 |
| Compact runtime near 228 lines | Two files retained during experiment, but 283 lines (+24.1%) and 1,925 words (+67.4%) |
| No verifier/synthesis/schema/combiner/risk router | Pass |
| Whole test suite | Candidate 214/214; restored baseline 211/211 |
| Read-only benchmark and unchanged checkout | Pass: both snapshots identical; all 73 file hashes identical |

This candidate does not improve the measured Pareto frontier. It buys an 18.17%
mean latency reduction from Superpowers at much higher token cost and unstable
quality; Matt is faster, cheaper, and has better observed recall. No claim of
superiority or reliable 6/6 is justified. No extra layer was added after failure.

**Disposition: rejected and fully restored, except this requested experiment log.**
Exactly four candidate files were copied back from their session-start bytes:
`skills/requesting-code-review/SKILL.md`, its `scripts/review-state.js`,
`tests/manifest/review-runtime-contracts.test.js`, and
`tests/review/review-state.test.js`. Existing user changes and deletions were kept.
`AGENTS.md` and `README.md` were never changed in this session. The restored runtime
is again two files / 228 lines / 1,150 words. No commit or push was performed.

Restoration checks: staged diff, unstaged binary diff, and porcelain status are
byte-identical to the saved starting values. File-by-file hashes identify only this
benchmark document as changed; its entire original content remains an unchanged
prefix. Benchmark snapshots retain digest
`e05b95de25d5da80f6add8fde85b63abb5d0f566771693809bd58e593f986988`
and HEAD `cdb04bc937a04ee0661eedc416a2ed4364c70f04` with clean status.
The final context/contract audit confirmed exact Matt text in the archived
candidate, original chain/caller contracts in the restored tree, and no runtime
references to this design document.

Artifacts:
`/var/folders/3h/1nggl5mj5vz25jxbf1vn9jp00000gn/T/hf-attention-experiment.za4g5ql0`
contains `initial.diff`, starting file copies, candidate code/tests, runner,
`typed_locations/run-1` and `run-2` raw commands/prompts/events/reports/scores,
`comparison.json`, `candidate-audit.json`, `restoration-audit.json`, and baseline,
candidate, and restored full-suite TAP logs. These are experiment artifacts only.


## Matt original: two explicitly requested repeat runs

After the typed-location candidate was rejected, the user explicitly requested two
new runs of Matt's original review. This supersedes the earlier no-rerun instruction
for Matt only. Both requested repetitions were run regardless of first-run recall;
they are baseline replications, not additional candidate attempts. No other framework
was rerun and no current runtime file was changed.

The original comparison runner's common prompt and both Matt role prompts were
reused verbatim. Both reviewers read the original file at
`/Users/WonjinSin/Documents/project/skills/skills/engineering/code-review/SKILL.md`.
No hybrid attention instructions, seed descriptions, earlier findings, or extra
accepted-design prompt clauses were added. The original Fowler baseline and briefs
remain the review basis. Reports stay separate, without synthesis.

Each repetition starts two fresh parallel CLI processes with
`gpt-5.6-terra`, `model_reasoning_effort="medium"`, and `-s read-only`.
The target and pinned SHAs are unchanged. The original three-dot comparison has
merge base equal to FROM, so it covers the same tree delta as FROM..TO.
Prompts are byte-identical between repetitions. The source skill is unchanged.
External pre/post state checks and file hashes do not enter reviewer context or
timing. Raw commands, prompts, events, reports, and usage are retained separately.

### Results

| Measurement | Wall time | Input | Cached input (included) | Output | Total | Recall | FP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Historical original, not rerun here | 78.901 s | 570,302 | 460,288 | 5,392 | 575,694 | 6/6 | 1 |
| New repeat 1 | 90.153 s | 524,642 | 415,488 | 6,375 | 531,017 | 5/6 | 0 |
| New repeat 2 | 81.400 s | 565,689 | 451,072 | 6,018 | 571,707 | 6/6 | 0 |
| **New two-run mean** | **85.7765 s** | **545,165.5** | **433,280** | **6,196.5** | **551,362** | Not consistently 6/6 | **0 in both** |

Input includes cached input. Reasoning output is already included in output.
All four reviewer processes exited 0. Raw axis durations are parallel and must not
be added to derive wall time:

| Repeat | Axis | Duration | Input | Cached input | Output | Total | Report words |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | Standards | 90.152 s | 307,863 | 241,920 | 3,718 | 311,581 | 110 |
| 1 | Spec | 69.207 s | 216,779 | 173,568 | 2,657 | 219,436 | 167 |
| 2 | Standards | 80.466 s | 302,403 | 239,872 | 3,144 | 305,547 | 146 |
| 2 | Spec | 81.397 s | 263,286 | 211,200 | 2,874 | 266,160 | 252 |

All reports satisfy the 400-word limit. No third new repetition was run.

| Repeat / axis | S1 | S2 | S3 | S4 | S5 | S6 | FP |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---:|
| 1 / Standards | Yes | No | Yes | No | No | No | 0 |
| 1 / Spec | Yes | Yes | Yes | Yes | No | Yes | 0 |
| **1 / union** | **Yes** | **Yes** | **Yes** | **Yes** | **No** | **Yes** | **0** |
| 2 / Standards | Yes | No | Yes | Yes | Yes | Yes | 0 |
| 2 / Spec | Yes | Yes | Yes | Yes | Yes | Yes | 0 |
| **2 / union** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **0** |

The union is seed scoring only, not a merged review report. Repeat 1 misses the
Critical-only blocking filter (S5). Repeat 2's Spec report identifies every seed's
cause and consequence. Neither repetition claims the combiner must adjudicate
semantic conflict or objects to intentional unbounded file-read fanout. There are
no other defect claims requiring adjudication. Judge was not invoked: zero calls,
zero time, and zero tokens, outside reviewer totals.

### Validation limits and state

The historical 285/285 test result remained the supplied verification evidence.
The unmodified original common prompt permits non-mutating validation commands.
In repeat 2, Standards nevertheless invoked `node --test`; the sandbox prevented
required temporary-directory creation. Its command exited 1 with **266 pass / 19
fail**, all 19 failures attributed to `mkdtemp` EPERM. The reviewer disclosed this
limit. This is not a newly demonstrated implementation regression or a fresh passing
suite. Its execution time and output remain in the reported reviewer statistics;
the run was not discarded or rerun to improve the measurement.

Both pre/post snapshots are identical, with HEAD
`cdb04bc937a04ee0661eedc416a2ed4364c70f04`, clean status, and snapshot digest
`e05b95de25d5da80f6add8fde85b63abb5d0f566771693809bd58e593f986988`.
All **73 checkout file hashes** remain identical. Current-project staged and
unstaged diffs and porcelain status are identical to this repeat task's starting
values. Only this requested experiment log is appended. Runtime remains the
restored Code/Spec implementation: **2 files / 228 lines / 1,150 words**.
No runtime changes, commit, or push were performed.

### Updated interpretation

Matt's historical 6/6 was not evidence of stable complete recall: the three known
observations are now **6/6, 5/6, 6/6**, with FP **1, 0, 0**. The new pair meets mean
90-second and 650,000-token targets, also using fewer than 575,694 tokens on average,
but misses the preferred 85-second target and the requirement that both runs find
all six seeds.

Against the historical single Matt observation, the new-pair mean is **8.71% slower**
and uses **4.23% fewer tokens**. Against the retained Code/Spec pair (81.2945 s /
634,248.5 tokens; recall 6/6 then 3/6), the new Matt pair is **5.51% slower** and uses
**13.07% fewer tokens**, with better observed recall (5/6 then 6/6) and the same zero
false positives. These small samples do not establish statistical superiority or
reliable 6/6. They do weaken any claim that the current Code/Spec implementation is
an improvement over Matt. No automatic workflow replacement follows from this
measurement-only request.

Artifacts:
`/var/folders/3h/1nggl5mj5vz25jxbf1vn9jp00000gn/T/hf-matt-repeat.v78zl911`
contains the original skill snapshot, runner, starting diff/status/document,
`run-1/matt` and `run-2/matt` commands/prompts/events/reports/scores/summaries,
`axis-metrics.json`, `comparison.json`, and `final-audit.json`.

## Matt copy with a parallel Comments axis

The Matt source checkout remained unchanged. Its `code-review/SKILL.md` was copied
to `design/experiments/matt-code-review-comments/SKILL.md`, then extended with a
third fresh-context axis dispatched in parallel with Standards and Spec. The
candidate follows Matt's existing prompt structure and keeps all three reports
separate without synthesis.

The Comments contract uses a bounded Clean Code rule: names and structure explain
what and how, while comments retain verified information that code cannot express.
It reviews comments changed by the range and nearby comments made stale by changed
code. It reports code narration, signature paraphrases, process history, commented
out code, stale text, and explanations replaceable by a straightforward rename or
extraction. It preserves verified rationale, invariants, constraints, deliberate
trade-offs, compatibility and security warnings, necessary examples, required API
documentation, legal notices, generated markers, and functional directives.

### Behavioral evaluation

The pre-edit two-axis control returned zero findings for a focused diff containing
three redundant comments. After one wording correction for an over-preserved
signature-paraphrasing JSDoc, two fresh candidate samples each found all three
redundant comments and retained the currency-rounding rationale.

A separate boundary fixture deleted a required copyright header, generated API
documentation, and a type-checker directive; changed a retry limit while leaving a
stale comment; added a verified vendor-workaround explanation; and left an unrelated
legacy comment unchanged. Two fresh candidate samples restored all required text,
removed the stale comment, retained the workaround rationale, and did not request
unrelated cleanup.

### Large-fixture A/B

The original two-axis skill (A) and copied three-axis candidate (B) ran in ABBA
order against the unchanged seeded fixture. Each variant used two fresh runs with
`gpt-5.6-terra`, medium reasoning, read-only isolation, identical requirements,
and the same pinned range. Axes within one variant ran concurrently; variants ran
sequentially.

| Variant | Run | Wall time | Reviewer tokens | Recall | State |
|---|---:|---:|---:|---:|---|
| A: original Standards + Spec | 1 | 75.322 s | 622,133 | 6/6 | Unchanged |
| A: original Standards + Spec | 2 | 82.476 s | 568,231 | 6/6 | Unchanged |
| **A mean** | 2 runs | **78.899 s** | **595,182** | **6/6 each** | Unchanged |
| B: Standards + Spec + Comments | 1 | 114.224 s | 888,452 | 6/6 | Unchanged |
| B: Standards + Spec + Comments | 2 | 100.554 s | 829,093 | 6/6 | Unchanged |
| **B mean** | 2 runs | **107.389 s** | **858,772.5** | **6/6 each** | Unchanged |

The third axis increased mean wall time by **28.490 seconds (36.11%)** and reviewer
tokens by **263,590.5 (44.29%)**. Comments itself took 93.382 and 77.940 seconds,
but Standards remained the critical path in both candidate runs at 114.223 and
100.554 seconds. The wall-time increase therefore includes three-agent resource
contention and review variance, not only the Comments axis duration.

The large fixture contains one changed inline shell comment that repeats the same
exit-status explanation in adjacent prose. Comments reported it once and returned
zero findings once. This is a defensible cleanup finding, but the inconsistent
detection shows that the two-run sample does not establish stable comment recall.
The focused fixtures provide the positive and preservation evidence instead.

### Decision

The axis is behaviorally useful, but it is not cheap. In this environment, adding
one full-diff reviewer raised tokens by about 44% and latency by about 36% despite
parallel dispatch. Keep it as an experimental candidate rather than replacing the
current runtime until that cost is acceptable or the Comments input can be reduced
without losing changed-comment and stale-neighbor coverage.

Artifacts:
`/tmp/hf-matt-comments-bench.i1hCQM` contains the A/B runner, prompts, events,
reports, and summaries. `/tmp/hf-comment-review-eval.17C0F7` and
`/tmp/hf-comment-review-variation.rJcCe9` contain the focused behavioral fixtures
and fresh-context reports.

## Subsequent adoption

The branch later replaced the restored Code/Spec runtime with Matt's two-axis
Standards/Spec workflow. The shipped runtime now consists only of
`skills/requesting-code-review/SKILL.md`; `tests/review/review-state.js` remains a
test helper and is not part of the plugin runtime. This final state supersedes the
earlier experiment-time disposition while preserving the measurements above as
historical evidence.
