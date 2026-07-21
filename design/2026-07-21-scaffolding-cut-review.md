# Scaffolding Cut Branch — Multi-Agent Adversarial Review Report

Date: 2026-07-21
Target branch: `simplify-skills` (base `a970afc`, net change 46 files +498/−4,750)
Method: Parallel fan-out of 11 adversarial reviewers (10 skills + 1 cross-cutting integrity). Each cross-checked against the actual files, `git diff a970afc..HEAD`, `writing-skills` rules, and retrospectives. Applied the 6 questions from `design/2026-07-21-cut-scaffolding.md` §7.
Deliverable nature: **Report only.** No code changes. Reviewer stance is adversarial (aggressively probes for substance loss).

---

## 0. One-Line Verdict

> The claim "**cut scaffolding only, preserve all substance**" is **mostly true from a file-hygiene standpoint** (no dangling references, chain links resolved, tests 168 green, hard-guard hooks unchanged), but the substance-preservation claim is **disproven in 2 verified cases + 1 reconciliation gap + 1 CSO violation**:
>
> - **H2·H3 — verified clean violations** (actual-file cross-check complete): plan-audit (a deterministic in-session completeness gate) was **misclassified as an "SDD machine" and deleted**, and the eval-verified severity-floor block **vanished without relocation** (currently 0 hits in `skills/` grep). Both violate the CLAUDE.md negative-record convention, independently flagged by multiple reviewers.
> - **H1 — verified reconciliation gap** (not a clean violation): making inline-first the default does in fact trigger the same-day retro's tier-up trap (work runs on the session model = the most expensive tier) (confirmed at `implement:20`), but a "machine-deletion saving" the retro never measured could reshape the economics, so this **needs reconciliation, not automatic rejection.**
> - **H4 — verified CSO violation**: the implement description violates **the very rule for which writing-skills cites this skill's previous description as the GOOD example.**
>
> **Verification method:** the 3 HIGH findings from the find-only review + H4 were cross-checked a second time against the actual files and retrospectives (see appendix). H2/H3/H4 line numbers and quotes confirmed accurate; H1 severity was lowered after a scope cross-check.

verdict distribution:
| verdict | target |
|---|---|
| claims-hold | finishing-a-development-branch |
| minor-issues | using-harness-flow, brainstorming, using-git-worktrees, writing-plans, test-driven-development, claude-md-revise, systematic-debugging |
| **substance-loss** | **implement (new), requesting-code-review, cross-cutting-integrity** |

---

## 1. HIGH — Must Decide (all cross-checked against actual files)

### H2. Deleting plan-audit = loss of the in-session completeness gate (Q5) — ✅ CONFIRMED → 🔧 handled
**Flagged by:** integrity reviewer + implement reviewer | **2nd verification:** directly confirmed the retro's background paragraph
**Handling (2026-07-21, lightweight check re-introduced):** added a "Before the final review: completeness check" step to `implement/SKILL.md` (the controller cross-checks each task's Touches/acceptance against the actual diff — probabilistic defense, not a hook deny) + corrected cut-scaffolding.md §4 to state "plan-audit is an in-session safety gate."

- **Claim (§4):** classified plan-audit / `pre-plan-audit.js` as "part of the deleted machine (subagent-driven-development family) ... replaced by implement and unnecessary."
- **Verified counter-evidence:** confirmed the original text of the `2026-07-18-plan-audit-gate-retrospective.md` background paragraph — "**In the external-loop eval, in-session execution silently dropped 30–50% of plan tasks in 2 of 3 runs while claiming success ... adopting the full loop failed the speed/token gate, so only the loop's deterministic-verification concept was back-ported into the in-session chain.**" In other words, it is a **deterministic completeness gate born from a measured in-session failure and back-ported into the in-session chain.** The branch deletes the script + hook (265 lines) while simultaneously making inline in-session execution the **default** — completeness is now verified only by the LLM + a single final review. This revives the measured failure mode and removes its dedicated defense, with neither a fresh eval nor a deterministic replacement.
- **Honest nuance:** the implementation lived in `hooks/pre-plan-audit.js` (which gated the SDD final-review dispatch description) and `skills/subagent-driven-development/scripts/`, so **mechanically** it was coupled to the SDD dispatch. But its **purpose** was in-session completeness defense, and as implement makes in-session the default, the thing being defended remains while only the defense disappears.
- **Recommendation:** ① re-introduce a deterministic completeness check on the inline default path against the plan's Touches/Files before the final review, or ② record a fresh eval of inline-default completeness. At minimum, correct §4 to "plan-audit is an in-session safety gate (not an SDD dispatch machine)." [[external-loop-eval-verdict]]

### H3. Severity-floor block vanished = loss of the single-final-review justification (Q2/Q5) — ✅ CONFIRMED → 🔧 handled
**Flagged by:** implement + requesting-code-review + integrity reviewer (**3 independent**) | **2nd verification:** confirmed against a970afc original + grep
**Handling (2026-07-21, relocated into code-reviewer.md):** restored the severity-floor block in the Calibration section of `code-reviewer.md` (adjusted only the first sentence to fit the inline model — "self-review + single final review, no intermediate reviewer" — substance verbatim). Placed the anti-demotion defense alongside the over-rating warning. **The design/ citation was removed** (new rule [[no-design-refs-in-skills]] — no design references in skill files; provenance goes in CLAUDE.md).

- **Claim (§3.8/§4):** the entire code-reviewer.md template body is retained; what was deleted is the SDD "machine."
- **Verified counter-evidence:** confirmed the original text of `git show a970afc:.../subagent-driven-development/SKILL.md:312-315` — "**severity by consequence, not by surface form: a finding that violates a ... A Minor rating on such a finding requires a one-line justification.**" Currently `grep -rn "by consequence|surface form|one-line justification" skills/` → **0 hits** (confirmed by direct execution). The review-removal retro records that the P5 re-challenge passed (6/6 catch, 0 demotion) **thanks to this block**, while the configuration without the block was recorded as **E5 6/8, below gate**. Only `implement:52` "Fixing Critical/Important findings is required; Minor is optional" (which is just fix-routing) remains, while the `code-reviewer.md:116` calibration points the **opposite direction** ("DON'T mark nitpicks as Critical").
- **Unmeasured risk:** the passing measurement was **sonnet + block**, while the new production path is **opus − block** (unmeasured). "Offset by using the most capable model" is unverified. The 168 unit tests cannot catch severity-demotion (an eval behavior).
- **Recommendation:** relocate the severity-floor block verbatim into `code-reviewer.md` (a required section of the dispatch prompt) or into the implement final-review instructions. If relying on opus to offset it, re-measure and record E5 with opus − block. [[external-loop-eval-verdict]]

### H1. Making inline-first the default = triggers the tier-up trap (Q5) — ⚠️ RECONCILIATION GAP → 🔧 partially handled
**Flagged by:** implement + integrity reviewer | **2nd verification:** cross-checked measurement-doc scope → lowered severity
**Handling (2026-07-21, subagent model guidance restored):** restored the substance of the superpowers / old-SDD Model Selection into the `implement/SKILL.md` subagent-isolation path (tier definitions mechanical→cheap / integration·judgment→standard / design→most-capable + "if unspecified, the session default = most-expensive is inherited; the cheapest is 2-3× turns in multi-step work, so use a standard floor for non-trivial"). Harness-neutral, no design references. **Remaining:** the tier-up on the default inline path (`implement:20`, runs on the session model) is unchanged — the user chose to restore tier discipline on the subagent path, and forcing inline-default / an eval was not adopted. This remaining tension is still disclosed (§2.2 argument or a future eval target).

- **Claim (§2.2):** execution model A″ = inline execution in the current session on the session model is the default. Rationale is "improved LLM capability" + field evidence + the superpowers precedent.
- **Verified facts:** `2026-07-21-plan-coarsening-measurement.md` (same date) lines 142/151 frame the inline-K rejection in terms of **tier-up economics** — "**Inline removes dispatch entirely, but work runs at the controller tier (session model = usually Opus/Sonnet, the most expensive) → inline-K is also net-negative.**" Confirmed `implement:20` "Work the plan in the current session, on the session's model" → **the default inline path does in fact trigger this tier-up** (the cheap-tier option exists only on the optional subagent path at line 38, not on the default path). Re-challenge condition (line 191) (a) "force inline to cheap rather than the controller tier" is **not met**, and (c) a fresh net-$ eval is **absent.**
- **Why this is not a clean violation (reflecting advisor input):** the retro measured inline-K as a cost lever added **while keeping the machine.** This branch **removes the machine itself** (the SKILL 500 lines + scripts + 2 hooks) — the standard maintenance cost and per-session document-token savings are **items absent from the retro's cost accounting.** So the tier-up penalty is real, but the savings that could offset it are unmeasured, so the retro **cannot fully reject this case either.** → **needs reconciliation, not an automatic revert.**
- **Aggravating (separate, confirmed):** measurement line 191/§5 identified that "the next $ lever is still the **Opus final-review tier**," yet the branch **pins** the final review to most-capable (Opus) (confirmed at `implement:44-46`) — explicitly retaining the cost it claimed to reduce.
- **Recommendation:** ① force default inline-path work to the cheap tier (satisfies condition a), **or** ② run and record an inline-default vs dispatch net-$ eval (including machine-deletion savings). And argue the tier-up trap · Opus-final head-on in the design document (currently 0 hits for coarsen/inline-k/net-negative in cut-scaffolding.md — concealed). [[coarsening-inline-k-rejected]] [[changes-optimize-speed-and-tokens]]

### H4. implement description = CSO violation (Q1) — ✅ CONFIRMED → 🔧 handled
**Handling (2026-07-21):** removed the post-em-dash workflow summary ("— implements inline with TDD, then one final review") from the `implement/SKILL.md:3` description, restoring it to trigger-only.

**Flagged by:** implement reviewer

- **Counter-evidence:** the `implement/SKILL.md:3` description appends a workflow summary after the em-dash ("... — implements inline with TDD, then one final review"). `writing-skills:166-174` prohibits exactly this ("Description = When to Use, NOT What the Skill Does"). **Irony:** `writing-skills:183-184` cites **this skill's previous description** ("Use when executing implementation plans with independent tasks in the current session") as the **GOOD example** — the rename regresses it into the BAD pattern. Risk scenario: the injected description says "one final review," so the controller runs simple execution without loading the body's plan-escalate/impl-fix routing or the 3-re-review cap — exactly the shortcut the rule warned about.
- **Recommendation:** delete the post-em-dash clause and restore trigger-only ("Use when executing an approved implementation plan or spec in the current session").

---

## 2. MEDIUM — Chain Consistency · Dangling · Substance

### M1. brainstorming small path bypasses the implement final review (Q4) — 🔧 handled
**Handling (2026-07-21, one-line small-exit self-review):** added a backstop to the small exit in `brainstorming/SKILL.md`: "this path skips the plan and the final whole-branch review, so after the last commit self-review the whole diff (correctness + scope creep)." Keeps the small path lightweight.
**Flagged by:** integrity reviewer

`brainstorming/SKILL.md:27` routes "Small/clear → test-driven-development" **directly**, bypassing implement → small work has **no** final whole-branch review. Previously the (removed) trivial tier had a self-review + exit diff-cap backstop, which the size-classifier retro adopted as measured-safe (decoy 3/3→5/5, quality loss 0). §2.3 deletes the whole tier system and with it that backstop — small work now has a **review gap** with no final review, no plan, and no trivial self-review/diff-cap. §2.2's "always one final review" guarantee is broken on this path. **Recommendation:** route the small path through implement or add a lightweight self-review/diff-cap backstop, and document that "removing the trivial tier = removing a measured-safe backstop." [[size-classifier-retrospective]]

### M2. AGENTS.md — §5 "unchanged" claim is factually wrong + deleted tier/skill names remain (Q3) — 🔧 handled
**Handling (2026-07-22, CLAUDE.md/AGENTS.md restructured):** after a `/claude-md-improver` audit, fully rewrote the architecture (reflecting implement · tier removal · the 4 hooks · no-design-refs · license consolidation). **Single-sourced to AGENTS.md** (canonical), with `CLAUDE.md` as an `@AGENTS.md` stub — Codex reads AGENTS.md natively, Claude Code goes CLAUDE.md→@import. All deleted tier/sdd names removed, §5 factual error nullified. 168/168 green.
**Flagged by:** using-harness-flow · implement · integrity reviewer (multiple)

`git diff a970afc..HEAD -- AGENTS.md` shows AGENTS.md **was changed** → §5's "unchanged" claim is false. Worse, it is incomplete: `AGENTS.md:8-9` retains the deleted tier ("trivial vs standard") and the pre-rename skill name ("subagent-driven development") **verbatim in the Codex bootstrap file.** Not covered by the §6 concession (README/CLAUDE.md only). This is not a narrative document but a **live behavioral file injected at Codex session start.** **Recommendation:** fix AGENTS.md:8-9 immediately (remove tier, rename to implement), correct §5.

### M3. README/CLAUDE.md = deleted hook-registration snippets = broken install (Q3) — 🔧 handled
**Handling (2026-07-22):** CLAUDE.md resolved via the AGENTS.md rewrite. **README.md also fully updated** — removed the deleted-hook (`pre-agent-model`/`pre-plan-audit`) registration blocks from the 2 settings.json examples (fixing the broken install), hooks 6→4, corrected tier/HARD-GATE/Task-Group/sdd/`-design.md`/plan-audit references, 6→7 harnesses + matt-pocock, reflected the license consolidation. JSON examples validated, 168/168 green.
**Flagged by:** integrity · requesting-code-review reviewers

§6 reduces this to "stale architecture description," but it is actually a **user-facing broken install**: `README.md:162-163, 201-202` walk users through copy-pasting registrations for the deleted `pre-agent-model.js`·`pre-plan-audit.js`, `README.md:39` references the deleted sizing.md, and `README.md:50` references non-existent plan-audit gating. The repo-root `CLAUDE.md` is also thoroughly stale with chain item 5 = subagent-driven-development, documenting the 2 deleted hooks (125-145), deleted references (161-162), and sizing.md (22). **Following the README registers hooks that do not exist.** **Recommendation:** complete a doc pass before merge or narrow the branch claim — remove the deleted-hook registration snippets and references.

### M4. Beyond severity-floor, finding-class tags also vanished (Q4) — 🔧 handled
**Handling (2026-07-22):** added Class tags (`impl-fix`/`plan-escalate`, Critical/Important only) to "For each issue" in `code-reviewer.md`'s Output Format + tightened `implement`'s routing wording to "Route its findings by the reviewer's `class` tag" → routing by a machine tag rather than prose inference. 168/168 green.
**Flagged by:** requesting-code-review reviewer

The old dispatch forced `impl-fix`/`plan-escalate` verbatim tags so the loop routed by **machine tag**, but the current `code-reviewer.md` output format (74-103) requires only Critical/Important/Minor + "Ready to merge" and **does not ask for the class tag.** The implement controller now does **prose inference** for plan-vs-impl. This works for an LLM but loses the machine-reliable vocabulary the escalation loop was designed around. **Recommendation:** add one line to the code-reviewer.md output: "for each Critical/Important finding, an impl-fix or plan-escalate tag."

### M5. systematic-debugging — undisclosed deletion of the "No Root Cause" section (Q2) — 🔧 handled
**Handling (2026-07-22, compressed guard restored):** restored a 2-line guard at the end of systematic-debugging Phase 1 — "Tempted to conclude 'no root cause/environment'? 95% is incomplete investigation — prove it then exit; if it's a genuine environment/timing/external cause, document it + the retry/timeout/monitoring defense *is* the fix." 168/168 green.
**Flagged by:** systematic-debugging reviewer

The entire `## When Process Reveals "No Root Cause"` section, absent from the §3.6 cut-list, was deleted. It provided the debugging loop's terminal branch (environment/timing/external cause → document + retry/timeout/monitoring) and an anti-rationalization guard ("95% of 'no root cause' cases are incomplete investigation"), and it exists nowhere in the skill or support files. It was the signal that kept the LLM from escaping the process to "no root cause" under pressure. **Recommendation:** restore a compressed one line in Phase 1 or disclose + justify the deletion in §3.6.

### M6. writing-plans Interfaces block removed ↔ implement:36 still references it (Q4) — 🔧 handled
**Handling (2026-07-22, softened implement wording):** softened the implement subagent-isolation path to "the interfaces it must honor (derive these from the plan and the codebase — the plan does not pre-compute them)" → resolves the mismatch without adding an Interfaces slot to the plan format.
**Flagged by:** writing-plans reviewer

`implement/SKILL.md:36` says to provide "the interfaces it must honor" when isolating a subagent, but the new writing-plans task schema (Delivers/Touches/Blocked by/acceptance) has **no Interfaces/Consumes/Produces block.** The plan artifact no longer pre-computes the signatures implement points to. **Recommendation:** add an "Interfaces (when isolating)" slot to the writing-plans task template, or soften implement:36 to "(derive from the plan/codebase)."

### M7. brainstorming spec path silently renamed `-design.md`→`.md` (Q3) — 🔧 handled
**Handling (2026-07-22):** the functional side (brainstorming SKILL + AGENTS.md) is consistent at `.md`, and the `-design.md` + HARD-GATE wording in README.md was also corrected in the full README update.
**Flagged by:** brainstorming reviewer

`brainstorming/SKILL.md:33` writes `specs/YYYY-MM-DD-<topic>.md` but this is not noted in §3.2. README.md:43,60 · CLAUDE.md:27,183 still have the old `-design.md`. README.md:43 also still describes the removed `<HARD-GATE>`. **Recommendation:** restore the suffix, or complete the rename + update the docs.

---

## 3. LOW — Minor Substance Loss · Pre-existing Violations · Consistency

Each item preserves behavior but has lost a nuance/signal absent from every process step and reference, or is a pre-existing issue outside the branch scope:

| # | skill | vanished/issue | Q | note |
|---|---|---|---|---|
| L1 ✅ | test-driven-development | SKILL:34 "horizontal slicing in the anti-patterns" dead pointer → **parenthetical removed (2026-07-22)**, sentence stays self-complete | Q3 | new integrity defect created by the rewrite, resolved |
| L2 ✅ | test-driven-development | anti-pattern #2 second detection signal (lifecycle ownership → wrong class) **clause restored** | Q2 | handled |
| L3 ✅ | test-driven-development | added "passes immediately = existing behavior/mis-targeted" diagnostic to Verify-RED | Q2 | handled |
| L4 ✅ | test-driven-development | TDD Exceptions (prototype/generated/config → ask first) **one line restored** | Q2 | handled |
| L5 ✅ | llm-md-revise | "Codex has no stable user-level path — don't guess" **harness-neutral clause restored** | Q2 | handled |
| L6 ⏹ | using-git-worktrees | removal of project-local `.worktrees` reuse detection + LOCATION_KIND | Q2 | **accepted (no change)** — sibling-first fits the simplification intent; re-adding it regresses. finishing's `.worktrees/` branch is harmless defensive code |
| L7 ✅ | finishing | restored the WHY of "remove worktree first → delete branch" as an **inline comment** (why git branch -d fails) | Q2 | handled |
| L8 ✅ | brainstorming | restored "stay focused — no unrelated refactoring" to Loop item 2. worktree is an intentional downstream delegation (no change) | Q2/Q4 | handled |
| L9 ✅ | using-harness-flow | restored one line "user instructions override skills — skip only when explicit" | Q2 | handled |
| L10 ⏹ | requesting-code-review | "least powerful"→"most capable" | Q5 | **accepted (no change)** — an intentional A″ decision (cost only on the final review), quality↑, cost regression accepted |
| L11 ✅ | requesting-code-review | orphan "SDD" abbreviation → **replaced with "implement"** + updated the test-lock string | Q3 | handled |
| L12 ✅/⏹ | finishing / using-harness-flow | finishing description **trimmed to trigger-only**. using-harness-flow unchanged as a special SessionStart entry (review REC "none required") | Q1 | handled |

---

## 4. Integrity Clean Confirmations (counter-evidence failed — claims hold)

What held up under adversarial probing:
- **Hook hygiene:** the 2 deleted hooks (pre-agent-model, pre-plan-audit) have 0 remaining registrations/active tests. hooks.json 6→4 consistent. The 2 hard guards (pre-bash-commands, pre-secrets) + tests unchanged.
- **Chain links:** all skill-body cross-refs (brainstorming→writing-plans→implement→requesting-code-review→claude-md-revise→finishing; systematic-debugging branch) resolved.
- **Q6 boundary:** the entry skill is neutral (test pins no-TodoWrite + harness-neutral), code-reviewer.md retains the Codex translation (spawn_agent/fork_turns none/final_review) + test-lock.
- **test-lock:** every skill's named lock string survives, codex-runtime-contracts 10/10.
- **finishing-a-development-branch:** the only claims-hold — Step 1–6 byte-for-byte, provenance/detached-HEAD/squash -D WHY preserved.
- **claude-md-revise:** the reviewer reconfirmed that the 2 restored Guardrails were genuinely nuances not present in the steps (§3.7 accurate).

---

## 5. Improvement Recommendations — Priority

**Required before merge (HIGH):**
1. **Address H2·H3 (verified clean violations) head-on:** relocate the severity-floor block verbatim (H3) + re-introduce the deterministic inline completeness check or a fresh eval (H2). Re-introduce the defense **or** a fresh pre-registered eval — the branch's own convention requires it. At minimum correct §4 (plan-audit is an in-session gate, not an SDD machine).
2. **Reconcile H1 (reconciliation gap):** force the default inline path to the cheap tier, or record a net-$ eval including machine-deletion savings. Have §2.2 argue the tier-up trap · Opus-final head-on (currently concealed).
3. **H4** fix the implement description to trigger-only (it violates the rule for which writing-skills cites this skill's previous description as the GOOD example).

**Strongly urged before merge (MEDIUM):**
3. **M2/M3** fix AGENTS.md + README immediately — the deleted-hook registration snippets are a broken install, and AGENTS.md is a live Codex behavioral file. Correct the §5 "unchanged" factual error.
4. **M1** brainstorming small-path review gap — route to implement or add a backstop.
5. **M4** restore the finding-class tags (an escalation-routing signal).

**Include in the doc pass (MEDIUM/LOW):**
6. M5 No-Root-Cause guard, M6 Interfaces consistency, M7 spec path rename, L1 horizontal-slicing dead pointer, L2–L9 minor signals — **honestly update** the §3 cut-list (disclose the silent deletions). Correcting the "cut scaffolding only" framing to "scaffolding + some intentional technique trim" makes the §7 Q2 claim true.

**Meta observation:** most of the substance-loss is **justifiable** by §1's "improved LLM capability" argument. The problem is not the justification but the **non-disclosure** — the design document asserted "scaffolding only," concealing the intentional trims. An honest cut-list + explicit re-challenge arguments for the 3 retros resolves most of it.

---

## Appendix: Method · Limitations

- 11 reviewers, general-purpose, each directly consulting the files · diff · retrospectives (subagent tokens 660k+128k, tool_uses 141).
- The first requesting-code-review reviewer returned degenerate output → re-ran with the same prompt, adopted the result (basis for H3·M4·L10·L11).
- **2nd verification pass (reflecting advisor's point):** before presenting the find-only reviewer output as fact, the 4 HIGH findings were cross-checked directly against actual files and retrospectives. Result: **H2·H3·H4 = CONFIRMED** (a970afc original, `grep skills/`, implement line numbers accurate), **H1 = severity lowered** (the tier-up trap does apply, but because machine-deletion savings are unmeasured it is a reconciliation gap, not a clean violation). MEDIUM/LOW were relayed from reviewer citations without spot-checking — individual confirmation recommended before adoption.
- This report is the **result of cross-checking claims.** Final adoption is up to the user's judgment.
