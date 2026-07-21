# Skill library simplification — removing enforcement scaffolding

Written: 2026-07-21
Branch: `simplify-skills` (base `a970afc`)
Current net change: **46 files, +498 / −4,750 (net −4,252 lines)**

This document is the reference material for the multi-agent review. It records "what was changed and why" and "exactly what was cut from each skill and what was kept" in enough detail that a reviewer can cross-check against the actual files. The review questions are at the very end in §7.

---

## 1. Background and motivation

harness-flow is a fork of obra/superpowers (v6.1.1), and consists of a markdown skill chain
(brainstorming → writing-plans → execution → final review → finishing).
During the fork, superpowers' lightweight `executing-plans` (70-line inline path) was dropped and
only the heavy `subagent-driven-development` (dispatch/ledger/scripts machinery) was kept,
so it **actually became heavier than the original.**

Three drivers:

1. **Improved LLM capability.** The enforcement scaffolding baked into the skills (repeated iron laws,
   rationalization tables, Red Flags STOP lists) was a device to keep weaker models from
   deviating from the procedure. For current models it is overkill.
2. **Field consensus.** Of the 7 projects compared, 5 keep spec/plan optional
   (only GSD/superpowers enforce them). The forced gate harness-flow inherited is excessive.
3. **Nature of the actual work.** The user's work is not one-shot large projects but
   gradual/incremental. A heavy up-front design gate only creates friction.

Goal: **cut skills/hooks by 50%+.** Quality is a constraint, not a goal, and
speed/token improvements are the primary gate (the [[changes-optimize-speed-and-tokens]] memo principle).

## 2. Key design decisions (confirmed via interview with the user)

### 2.1 The "substance vs scaffolding" dividing line

The single criterion running through this entire branch:

- **Substance (keep):** the technique itself — mocking anti-pattern, diagnostic heuristics, git command blocks,
  placement loading semantics, back-tracing procedures, detection signals. The "how to do it" content.
- **Scaffolding (cut):** repeating a process rule with only the format changed — Red Flags STOP lists,
  Common Mistakes tables, Quick Reference tables, rationalization tables, "Announce at start"
  lines, Overview slogans, a graphviz digraph that 1:1 duplicates a table above.

Decision rule: if a deletion candidate is a **restatement of a rule already present in a process step**, cut it;
if it is **content/a detection signal/a WHY not found elsewhere**, keep it. Non-obvious WHYs are preserved as inline comments.

### 2.2 Execution model = A″ (inline-first)

`subagent-driven-development` (500 lines) → rewritten and renamed to `implement` (57 lines).

- Default: **inline execution** in the current session on the session model (TDD, one commit per task).
- Option: **single/sequential** subagent isolation only when a clean context is clearly beneficial
  (no parallelism, no brief files/ledger).
- Always: **one fresh-context final review** at the end, on the most-capable model.

Rationale: field evidence shows parallelism **belongs to review, not to the build** (Archon/gstack/Matt build
inline). Precedent: superpowers `executing-plans` (70-line inline). The dispatch/ledger/
model-tier machinery is all removed.

### 2.3 Spec gating = Model B (optional)

brainstorming **recommends** an exit point and the user chooses (small work → straight to TDD,
large work → write spec → plan). No HARD-GATE, no forced spec file, no separate approval loop.
The tier system (trivial/standard + `sizing.md`) is removed entirely — routing is by type only.

### 2.4 Cross-harness = neutral wording, plugin kept

Skill bodies use harness-neutral wording, and the tool-translation reference files
(`codex-tools.md`, `copilot-tools.md`) are deleted. **However, the plugin infrastructure
(`.codex-plugin/`, `.agents/`, `AGENTS.md`) is kept** — Codex remains a supported target.

Exception: the dispatch **template** (`code-reviewer.md`) is not a harness-neutral target.
It names `Claude Code Task/Agent` explicitly and keeps a separate **Codex translation** block
(`spawn_agent`/`fork_turns: none`/`task_name: final_review`). Pinned by a test lock.

## 3. Changed skills — detail

Figures are relative to base `a970afc` (line counts).

### 3.1 using-harness-flow (80 → 21)

- Removed the tier system (Size the Work First table, trivial/standard routing) + `references/sizing.md`.
  Reduced routing to type-only (Build→brainstorming, Bug→systematic-debugging).
- Removed the Codex/Copilot references in Platform Adaptation, switched to harness-neutral wording.
- test lock: the entry skill is pinned to contain "harness-neutral" and not contain "TodoWrite".

### 3.2 brainstorming (148 → 42)

- Rewritten as Model B. Loop (explore, grill one at a time + recommend, 2–3 approaches, YAGNI),
  "Exit — recommend, let the user pick", a rule-based Spec section (written from the user's perspective,
  records decisions but not code, no placeholders, tight/opinionated).
- Removed HARD-GATE/forced spec/approval loop. Deleted the orphan `spec-document-reviewer-prompt.md`.

### 3.3 using-git-worktrees (244 → 63)

- Compressed into Step 0 (isolation detection + submodule guard), Step 1a (native tool), Step 1b (manual git).
- Preserved test lock strings: `git check-ref-format --branch`,
  `git check-ignore -q -- "$LOCATION"`, "sibling directory", `manual-git-worktree`,
  and not containing "Add to .gitignore, commit".

### 3.4 writing-plans (244 → 70)

- Matt Pocock to-tickets style. Spec pointer header + Goal + Constraints.
  Tasks have Delivers/Touches (files, no line numbers)/Blocked by/acceptance checkboxes.
  "Good tasks" (tracer-bullet, vertical slice), rules (prefactor, no code blocks/line numbers).
- Removed the Group/Interfaces dispatch machinery (unnecessary since execution is inline).
- test lock: preserved "There is no group-boundary reviewer", "After the user approves".

### 3.5 test-driven-development (399 → 62) + testing-anti-patterns (317 → 82)

- SKILL: Iron Law + ownership guard (preserved "pre-existing user code"/"current TDD cycle"),
  The Loop (RED/verify/GREEN/verify/REFACTOR), Good Tests table, "When stuck" table
  (test pain → design signal), mocking anti-pattern pointer.
- anti-patterns: kept the 5 mocking anti-patterns (violation/fix), "when mocks get complex",
  "Red flags" (6 detection signals — restored). Removed the Gate Function pseudocode, Quick Reference
  table, Bottom Line.
- Note: the user views the Red Flags detection signals as substance and requested their restoration (signals not present in the prose).

### 3.6 systematic-debugging (SKILL 311 → 70, 3 supporting files 394 → 133; total 705 → 203)

- SKILL: Iron Law, 4 phases (read error/reproduce/recent changes/**layered instrumentation example**/back-tracing pointer),
  Phase 2–3 compressed, the **3-fix → architecture question** rule, claude-md-revise+finishing (harness-neutral),
  Supporting techniques pointer.
- Cut: Overview, "When to Use ESPECIALLY", Red Flags list, "human partner Signals",
  Common Rationalizations table, Quick Reference table, Real-World Impact statistics, the graphviz digraphs.
- Supporting files: `root-cause-tracing.md` (159→41), `defense-in-depth.md` (122→46),
  `condition-based-waiting.md` (113→46) — each compressed to the core technique + 1 example.
- **cascade:** made the claude-md-revise reference harness-neutral (removed the explicit CLAUDE.md/AGENTS.md mentions)
  → deleted the debugging platform assertion in `codex-runtime-contracts.test.js`.

### 3.7 claude-md-revise (209 → 130)

- Cut (scaffolding): the graphviz digraph under Step 4 (1:1 duplicate of the table above), Quick Reference table,
  Common Mistakes table (9 rows), Red Flags STOP (9 items), "Announce at start", the Overview verbosity.
- Kept (all substance): Platform Detection, the 6-step Process, the Step 4 placement table + the 200-line
  reactive rule, the 2 references (`placement-decision.md`, `examples.md`) as-is.
- **Restored:** after an item-by-item comparison, restored a 6-line "Guardrails" holding only the 2 nuances not in the steps
  (① one-time proposal → defer, ② if a project-wide rule is buried in a subdir it loads only when touched).
- Preserved test lock: `Codex...AGENTS.md`, "do not scan them by guessed path".

### 3.8 requesting-code-review (SKILL 128 → 49, code-reviewer.md 178 → 172)

- **dangling resolved:** removed the deleted `../subagent-driven-development/scripts/review-package`
  call and the `{DIFF_FILE}` placeholder → the reviewer runs `git diff BASE..HEAD` directly.
  Removed the `plan-audit` reference.
- Behavior change: "least powerful model that fits" (SDD tier) → **"most capable"**
  (the A″ decision: the final review is the one place worth spending cost).
- Cut: the "Review early review often" slogan, the verbose When list, the 24-line Example,
  the "Integration with Workflows" 3 subsections, Red Flags.
- Kept: the entire code-reviewer.md template body (checklist/output format/calibration/
  Example Output), the **Codex translation** (dispatch-template exception).
- Preserved test lock: `spawn_agent`, `fork_turns...none`, `final_review`,
  `SDD...final whole-branch review`.

### 3.9 finishing-a-development-branch (287 → 212)

- Cut (scaffolding only): Overview + "Announce at start", Quick Reference table,
  Common Mistakes (7 items), Red Flags Never/Always.
- Kept: all of process Step 1–6 (git command blocks, provenance/detached-HEAD logic).
  Smaller cut than the other skills — because the substance is the git mechanism.
- Non-obvious WHY check: the reason for the squash `-D` already exists as an inline comment in Step 5.
- Preserved test lock: `detached HEAD...exactly these 2 options`, `Create branch`,
  `Hand off to local`, `harness-flow:pr-creator`, `git switch <base-branch>`.

## 4. Removed machinery (subagent-driven-development family)

Things that became unnecessary once replaced by `implement`:

- All of `skills/subagent-driven-development/`: SKILL (500), `implementer-prompt.md` (165),
  `task-reviewer-prompt.md` (127), `references/example-workflow.md`,
  `scripts/{task-brief, review-package, sdd-workspace, plan-audit, lib/plan-lib.js}`.
- 2 hooks: `hooks/pre-agent-model.js` (SDD model-missing guard),
  `hooks/pre-plan-audit.js` (final-review completeness gate). → from 6 hooks down to 4.
  **Caution: plan-audit was not SDD-dispatch-only scaffolding but an in-session completeness
  safety gate** (back-ported into the in-session chain to prevent the failure — observed in the external-loop eval —
  where in-session execution silently dropped 30–50% of tasks — `2026-07-18-plan-audit-gate-retrospective.md`).
  The deterministic hook (deny) is removed, but its defensive concept is moved into `implement`'s "Before the final
  review: completeness check" step, preserved in a probabilistic (controller self-check) form.
- References: `using-harness-flow/references/{codex-tools.md, copilot-tools.md, sizing.md}`.
- reviewer prompts: `writing-plans/plan-document-reviewer-prompt.md`,
  `brainstorming/spec-document-reviewer-prompt.md`.
- Tests: `tests/scripts/task-brief.test.js`, `tests/plan-audit/*`,
  `tests/hooks/{pre-agent-model, pre-plan-audit, smoke/pre-agent-model.smoke}.test.js`,
  `tests/manifest/codex-tools-doc.test.js`.

`hooks.json` keeps only 4 (session-start ×2, pre-bash-commands, pre-secrets).
The 2 guards (destructive commands, secret-file access) are a safety layer and are left untouched.

## 5. What was preserved / safety net

- **168 tests green** (verified after every skill change).
- Every test lock string cross-checked and preserved per skill (specified in each §3 item).
- The hard-guard hooks (pre-bash-commands, pre-secrets) and their tests are unchanged.
- The plugin infrastructure (`.codex-plugin/`, `.agents/`, `AGENTS.md`, the two marketplaces) is unchanged.
- The MIT NOTICE file is kept in each skill (the renamed implement moves with its NOTICE).

## 6. Not yet done

- `writing-skills` (meta skill, 726 lines) — **unchanged.** Not a review target of this document.
  Rather, it is the benchmark for verifying whether these changes violated the writing-skills rules.
- `pr-creator`, `caveman` — unchanged (keeping caveman is likely).
- README, repo-root `CLAUDE.md` — the architecture narrative is stale (still mentions sdd/tier).
  A final doc pass is planned.

## 7. Review questions (for the multi-agent verdict)

Each reviewer should render a verdict by **cross-checking the document's claims against the actual files**:

1. **writing-skills rule violation?** Does each changed skill violate the rules of `skills/writing-skills`
   (frontmatter format, description = activation condition, structure/tone, self-reference integrity)?
2. **Over-deletion (substance loss)?** Is the "scaffolding only cut" claim true, or did substance/detection signals/WHY
   that exist nowhere in the process steps/references disappear? (especially 3.6/3.9)
3. **dangling/integrity?** Are there broken references — to deleted scripts/hooks/references/renames (sdd→implement) —
   remaining in skills/tests/README/CLAUDE.md/AGENTS.md?
4. **Chain coherence?** Are the brainstorming→writing-plans→implement→requesting-code-review→
   claude-md-revise→finishing links consistent with one another? (e.g. does the review contract implement expects
   match requesting-code-review's actual behavior?)
5. **negative-record re-challenge?** Did this change revive, without a defense, a mechanism recorded as rejected
   in `design/*retrospective*.md`?
6. **harness-neutral consistency?** The entry skill/bodies are neutral while the dispatch template keeps
   the Codex translation — is this boundary held consistently?
