# Plan Document Demotion Retrospective — spec absorbs Implementation Groups, brief authored at dispatch time

**Date**: 2026-07-15 ~ 2026-07-16
**Branch**: `worktree-plan-demotion`
**Conclusion summary**: Started from the user's foundational question ("is splitting spec/plan into 2 documents actually meaningful"). The plan's three functions (dispatch payload / progress tracking / decomposition record) were each relocated to a better home (live task-brief authoring / ledger / spec section) and the plan document was retired. A/B eval **meets all gates**: decomposition artifact −78.8%, user gates 2→1, cheap-tier quality blind-equivalent (probes 8/8 both sides), decoy leakage 0, interface-mismatch handling favors NEW (explicit resolution vs silent normalization), legacy regression 0 (182/182). The dispatch-path token count looked unfavorable to NEW in the initial measurement (§5-1) but was corrected in §7 as a measurement artifact — the real path is roughly neutral; details in §7-3.

## 1. Background — Why This Change

Dissecting the plan document's reason for existing function by function, everything had a replacement:

| plan's function | better home | rationale |
|---|---|---|
| dispatch payload | brief authored at dispatch time | plan-time prediction code goes stale relative to the codebase (the very reason the pre-flight scan exists). Live authoring is based on the **actual merged code** of prior groups |
| progress tracking | ledger | ledger already handles this |
| decomposition record | `## Implementation Groups` section within the spec | keeps only what a human actually reviews (groups · Files · Interfaces · tier) |

Function-by-function fate analysis of the plan pre-review gate (spec §7): coverage → section self-review + reviewer, type consistency → Interfaces verbatim slot, placeholder → `brief-check` (deterministic grep — LLM judgment excluded, per the size-classifier lesson), human structural review → integrated-document gate. The placeholder gap, the only net loss, is sealed by brief-check.

## 2. What We Built

- **writing-plans**: output changed from a separate plan document → an `## Implementation Groups` section appended to the spec (REQUIRED slots per group: tier / Files / Interfaces verbatim). No step code blocks — that precision goes into Interfaces.
- **User gate consolidated to one pass**: removed the spec-file review gate in brainstorming; writing-plans has the completed document (design + decomposition) reviewed in one pass.
- **SDD**: added "Authoring the Group Brief" — the controller authors the brief right before dispatch, and dispatches only after passing `scripts/brief-check` (exit 0/1/2, BSD awk compatible, fence-aware, detects unbalanced fences). The pre-flight scan is narrowed to legacy plan files only.
- **Reviewer class three-way split**: `impl-fix` (implementation ↔ brief) / **`brief-fix` (brief ↔ spec section — controller rewrites the brief, no human needed)** / `plan-escalate` (defect in the spec itself — human). brief-fix also counts against the same `reviewCycles` cap of 3.
- **Backward compatibility**: legacy plan files continue to run via the `task-brief` extraction path (guaranteed by unchanged tests passing).
- Skill edits follow the writing-skills form rules (conditionals · required slots · recipes, avoid prohibition statements).

## 3. Evaluation Method

Reused the execution-speedup retrospective §3 methodology + real-implementation extensions:

- **Seed into shared input**: 2 decoys (D1: unescaped `>` — opposite of common practice, so easy to mangle / D2: `TypeError` message exactly `"empty tokens"`), interface-mismatch seed (`parse(text)` vs the actual `tokenize(text)`).
- **arm fidelity**: OLD arm's brief uses the real mechanism (task-brief extraction), NEW arm's brief uses the real mechanism (NEW SDD authoring procedure + brief-check). Implementation is haiku on both sides, identical prompt.
- **Make the answer key executable**: before the judging panel, 8 functional probes (probe.js) deterministically confirm functional equivalence. The panel handles only the residual quality dimensions.
- **Blind judging**: opus ×2 (implementation diff X/Y, artifact P/Q — mapping hidden), "equivalent is also a legitimate verdict" made explicit.

## 4. Results

### 4-1. Deterministic Metrics (headline)

| metric | OLD | NEW | Δ |
|---|---|---|---|
| decomposition artifact size | 10,916 B (separate document) | 2,314 B (section within spec) | **−78.8%** |
| document count / user gate count | 2 / 2 | 1 / 1 | −1 each |
| answer-key probes (D1×3 · D2 · 4 core) | 8/8 | 8/8 | equivalent |
| decoy leakage (artifact/implementation) | 0/0 | 0/0 | equivalent |
| legacy regression | — | 182/182 | none |

### 4-2. Blind Judging

- **Implementation**: equivalent (X 4/4/5, Y 4/4/5 — complementary test coverage, offsetting).
- **Artifact**: **Q(NEW) better** — traceability 5:5, downstream sufficiency 5:5 tied; **mismatch handling 4:3** (NEW explicitly cites and resolves the upstream contract, OLD silently normalizes), **reviewability 5:3** (NEW exposes only decisions + cross-references requirement numbers, OLD dilutes decisions in machine content).

### 4-3. Pass Gates (spec §8)

All 5 gates met (arithmetic doc-cost reduction / cheap quality equivalent / decoy 0 / consistency caught upfront / legacy no-regression) → **adopt**.

## 5. Lessons / Honest Limitations

1. **Cost doesn't disappear, it moves and is exchanged.** The dispatch-path pipeline total tokens (decomposition + brief) at N=1 is OLD 57.5k vs NEW 123.7k — brief authoring is a new downstream cost. But ① this run's brief author went beyond what the skill required and re-enacted a full TDD cycle in a sandbox (over-execution confound — the skill requires only authoring + brief-check), ② the inline path (≤3 tasks, most small standard cases) has no brief stage, so the savings there are unconditional, ③ what the exchange bought: code based on a fresh codebase, explicit mismatch resolution, reviewability, pre-flight scan removal, drift-source removal. If a net token increase on the dispatch path becomes an empirically measured problem, the first candidate follow-up is to state a "no re-enactment, author + check only" boundary in the brief-authoring procedure.
2. **Extraction is more fragile than authoring — measured.** In this session's Group 2, task-brief truncated the brief at a nested fence (5-backtick wrapped content), a real bug (the implementer recovered against the original plan). The authoring approach has no source for this bug class. The irony that the rationale for demotion was empirically measured while executing the demotion design.
3. **Deterministic gates are cheaper and stronger than LLM gates — reconfirmed.** brief-check (grep) transplanted the size-classifier retrospective's lesson (avoid judgment-based branching) directly, sealing the placeholder gap at zero judgment cost. The 2 real edges the final review found (unbalanced-fence bypass, todo substring false positive) were all repairable within the deterministic layer.
4. **N=1 session metrics can't be headlines** (size-classifier §3 reconfirmed): only arithmetic metrics (artifact size · gate count · document count) are headlines; tokens/time are reference values.
5. **Unverified areas**: most-capable-tier groups, 3+ group interface chains, real-world firing of plan-escalate/brief-fix routing (the eval scenario only passed the clean path). To be observed in subsequent real usage.

## 6. Deliverables

- Skills: `writing-plans` (rewrite), `brainstorming` (gate moved), `subagent-driven-development` (brief authoring + brief-fix routing), `task-reviewer-prompt.md` (class three-way split)
- Scripts: `scripts/brief-check` new (+20 tests), `scripts/task-brief` marked legacy
- Docs: `CLAUDE.md` · `README.md` chain narrative updated
- eval raw data: session scratchpad `eval/` (fixture, both-arm artifacts, probes, judgment text) — reproduction procedure in §3

## 7. Appendix (2026-07-16) — Token-Axis Re-scoring and Re-measurement

User criterion confirmed: **the purpose of every change is speed improvement · token reduction** — quality is a constraint, not something to be traded. §5-1 was re-scored under this criterion.

### 7-1. Added brief-authoring boundary + compliance re-measurement

Made the completion condition explicit in SDD "Authoring the Group Brief" ("brief-check exit 0 = done, the next action is dispatch itself; doubts are resolved in text"):

| run | brief authoring tokens / s | re-enactment (over-execution) |
|---|---|---|
| baseline (no boundary) | 78,402 / 279s | full sandbox TDD cycle re-enacted |
| boundary v1 | 63,267 / 144s (−19% / −48%) | partial re-enactment via "outside the brief" rationalization |
| boundary v2 (strengthened) | 67,934 / 170s | partial re-enactment via "isolated copy" rationalization |

Strengthening the wording **reduced but did not eliminate** re-enactment (2/2 rationalizations occurred in the fresh-agent harness; the v1↔v2 difference is at the noise level). Loophole chasing halted — 7-2 below is the reason.

### 7-2. Measurement Artifact — what the eval measured is not the real path

The eval's brief author is a **fresh agent with fresh context**, paying the cost of reconstructing the spec · section · repo from scratch (~60–78k). The real-usage author is **the controller itself** — the main session that already holds that context, whose marginal cost is the brief file output (~8.4KB ≈ 2–3k tokens) + brief-check (0). OLD's plan writing was also output by that same main session at 10.9KB, so **the real-path dispatch-path token delta is roughly neutral**, and on top of that, removing one gate round-trip · the pre-flight scan · spec re-statement is NEW's net reduction. §5-1's "57.5k vs 123.7k" is corrected as an artifact of the measurement design (this is arithmetic analysis, not measured — measuring it would require instrumenting the controller-session delta).

### 7-3. Final Verdict Under the User Criterion

- Inline path: **PASS** (net reduction in documents · gates · round-trips — unconditional).
- Dispatch path: tokens **roughly neutral** (7-2 arithmetic), speed favorable by the one gate round-trip · scan removal, offset by the brief authoring added to the controller turn. **Net-increase claim withdrawn, net-reduction claim also held in reserve** — real-session instrumentation is a follow-up task.
- Known limitation: fresh-agent authoring (e.g. a controller right after context compaction) has a real ~60k-class cost, and the boundary wording does not fully suppress over-execution.

## 8. Appendix (2026-07-16) — 832eb5e vs 1.2.1 In-Depth Evaluation (dynamic workflow)

Final keep/revert verdict performed at the user's direction. Method: fresh scenario (duraparse)
measured run (2 producer arms + haiku implementation 4 reps, probes 12/12 all passing) + sonnet
workflow 8 agents (change audit / arithmetic verification / blind judging 2 / failure-mode
analysis / adversarial verification 2 / synthesis).

**Verdict: keep with follow-ups (confidence: medium).**

- **Tokens: not proven.** By real-path arithmetic, NEW writes the decomposition twice (section ~0.7k +
  ~2–3k brief per group) vs OLD's single plan ~2.7k — roughly a tie at 1 group,
  structurally unfavorable at multiple groups, and there is no measurement at n≥3 groups. The skill-text net increase
  (+454 words) is also a per-call cost. The "token reduction" claim survives only in the reduced form of
  document · gate count reduction for a small single group.
- **Speed: partially proven.** eval1 is a pure win with no confounds (producer 305→229s,
  implementation 94→80s, gates 2→1, pre-flight removed). eval2's producer comparison is
  **contaminated by asymmetric over-execution handling** (OLD's over-execution run is included in the headline,
  NEW's is replaced by a re-measurement after the boundary was added) — adversarial verification caught exactly this.
- **Quality: maintained, improved on the main path.** The judging equivalent~favorable + failure-mode asymmetry
  is the clincher: **reverting to 1.1.7 returns task-brief's silent-truncation bug (with a real firing history)
  to the default path** — strictly worse than 1.2.1's worst failure mode (noisy and recoverable).
  A revert is not quality-neutral.

### New Findings (caught by the audit, not recognized by prior retrospectives)

1. Two `brief-check` fence-parser bugs (reproduced in execution): indented fences not recognized
   (false-positive rejection), backtick count ignored for nested toggles. Both are fail-safe
   (in the direction of blocking a good brief) but cause unnecessary rewrite cycles = eroding the token rationale.
2. `brief-fix` class has no explicit scope for the legacy path (harmless by accident).

### Follow-ups (in priority order)

1. **Re-review trigger**: measure the n≥3-group real feature with an in-context controller account —
   if multi-group tokens are clearly unfavorable, re-submit revert for consideration.
2. **Seal the cheap-tier review gap**: on the authored-brief path, lift the group-reviewer skip
   (the skip applies only to the legacy path that extracts user-approved text verbatim) —
   the only point where quality can actually regress.
3. Repair the brief-check fence parser (indentation · backtick count awareness).
4. Re-run the eval2 producer comparison under symmetric conditions.
5. Factor the skill-text net increase into the token model.
6. Formalize the brief-fix class's path scope.

## 9. Appendix (2026-07-16) — Follow-up 1 · 2 · 3 Execution Results (release 1.2.2)

Executed follow-ups 1–3 at the user's direction. Structured the implementation of 2 · 3 itself as a 3-group spec,
using that execution as the measurement target for follow-up 1's "n≥3-group real feature, in-context account."

### Follow-up 3 — brief-check fence parser repair (done)

Rewritten as a single awk state machine: open = leading whitespace + backtick ≥3 (length recorded),
close = backtick ≥ open length + only whitespace remaining (CommonMark length rule), with 3 checks
(placeholder scan · balance · existence) sharing the scanner. §8's 2 reproduced bugs went Red as tests
first, then green (existing 20 + new 3 = 23, suite 206). exit contract unchanged.

### Follow-up 2 — review gating scope narrowed (done)

Narrowed the skip condition to "legacy plan file path AND cheap" — the authored-brief path
dispatches a group reviewer for all tiers. Rationale: the skip's premise was not "low risk" but "pre-review
exists" (legacy brief = verbatim extraction of a user-approved plan). Synced SKILL.md
intro · digraph (4 places) · Review Gating section · ledger wording, and CLAUDE.md.
Side effect: a latent contradiction in the Example Workflow (an example where a cheap group is reviewed) is resolved.

### Follow-up 1 — n=3 measurement and revert re-submission (trigger fired, keep conclusion)

Authored a counterfactual 1.1.7-style plan (full step-level) for the same feature and compared
(token proxy chars/4, Korean underestimates but both arms are configured identically):

| decomposition artifact | tok≈ |
|---|---|
| OLD: 1 plan document | 2,741 |
| NEW: section 429 + 3 briefs (1,385/1,165/500) | 3,479 |

**Double-authoring disadvantage measured and confirmed: +738 tok (+26.9%), per-group repeated component 200–350 tok
(linear in n).** §8's structural prediction is verified — the revert re-submission trigger fired.

**Re-submission conclusion: keep.** ① The absolute ~0.7k/feature is 0.3% of the same feature's execution cost
(implementation 130k + review 189k tok) — meaningless as a token lever. Extrapolating to n=10 is also ~3k.
② ~99% of the NEW−OLD total token difference in this feature is follow-up 2's 2 extra reviewer
dispatches (+86.2k, 0 findings on G1 · G3), a quality-gate
purchase cost orthogonal to the document architecture. The real token lever is the gating policy, not spec/plan structure.
③ A revert returns the silent-truncation bug and the 2 gates (human round-trips).
If the ratio (+27%) is used as the gate, the revert argument holds, so the final choice belongs to
the user — the absolute-quantity-based recommendation is keep.

### Execution Instrumentation (SDD, this feature)

- G1 impl haiku 36.6k/86s · rev sonnet 45.2k/149s — approved, 0 findings
- G2 impl sonnet 59.4k/106s · rev sonnet 44.3k/37s — approved, 0 findings
  (the implementer caught the brief's digraph edge-count typo, 2 edges→3 edges; the controller
  fixed the brief · spec after the fact — absorbed without a brief-fix review round)
- G3 impl haiku 34.4k/71s · rev sonnet 41.1k/28s — approved, 0 findings
- final whole-branch review opus 58.4k/312s — Ready to merge, Critical/Important 0

### Remaining Follow-ups

4 (eval2 symmetric re-run) · 5 (factor in skill-text cost) · 6 (formalize brief-fix
scope — but the reviewer template's conditionalization asset exists on the unmerged section-only branch)
are not started.
