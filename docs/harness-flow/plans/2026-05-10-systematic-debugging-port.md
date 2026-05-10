# systematic-debugging Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use harness-flow:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `systematic-debugging` skill from superpowers into harness-flow as an orthogonal bug-fix entry point, restore debugging branches in `using-harness-flow`, and update `CLAUDE.md` / `README.md` to document the parallel track.

**Architecture:** Pure content/documentation work — no runtime behavior changes. Four markdown files copied from superpowers (with targeted edits to remove npm/Lace coupling and adjust cross-skill refs), three docs modified in place. TDD adapts to "verify-by-grep": each task asserts expected/unexpected strings before and after edits.

**Tech Stack:** Markdown only. No new runtime code. Existing hook tests (`node --test`) serve as regression baseline.

**Source files (read-only reference):** `/Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/`

**Spec:** `docs/harness-flow/specs/2026-05-10-systematic-debugging-port-design.md`

---

## File Structure

Files created (new):

- `skills/systematic-debugging/SKILL.md` — main skill (description adjusted, 2 cross-refs retargeted, 1 cross-ref removed)
- `skills/systematic-debugging/root-cause-tracing.md` — backward-tracing technique (npm command generalized, polluter section removed)
- `skills/systematic-debugging/defense-in-depth.md` — verbatim
- `skills/systematic-debugging/condition-based-waiting.md` — example.ts reference removed

Files modified:

- `skills/using-harness-flow/SKILL.md` — restore 3 debugging-branch lines
- `CLAUDE.md` — add "Parallel Track: Bug Fixing" section
- `README.md` — update overview, add parallel track section, add Debugging category

Files explicitly NOT copied (per spec decisions 4-5 + meta exclusion):

- `find-polluter.sh` (npm hardcoded, algorithm trivial)
- `condition-based-waiting-example.ts` (Lace-specific imports)
- `test-pressure-{1,2,3}.md`, `test-academic.md`, `CREATION-LOG.md` (meta/eval)

---

## Commit Plan

Four logical commits at task boundaries:

1. After Task 4: `feat(skills): add systematic-debugging skill`
2. After Task 5: `feat(skills): restore debugging branches in using-harness-flow`
3. After Task 6: `docs: document systematic-debugging as parallel track in CLAUDE.md`
4. After Task 7: `docs: add systematic-debugging to README`

---

### Task 1: Port `SKILL.md` with description and cross-ref edits

**Files:**

- Create: `skills/systematic-debugging/SKILL.md`
- Source: `/Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/SKILL.md`

- [ ] **Step 1: Read the source file**

```bash
cat /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/SKILL.md | wc -l
```

Expected: 297 lines.

- [ ] **Step 2: Copy the file verbatim to destination**

```bash
mkdir -p skills/systematic-debugging
cp /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/SKILL.md skills/systematic-debugging/SKILL.md
```

- [ ] **Step 3: Verify pre-edit baseline (file matches source)**

```bash
diff /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/SKILL.md skills/systematic-debugging/SKILL.md
```

Expected: no output (files identical).

- [ ] **Step 4: Edit frontmatter description (add Based-on suffix)**

In `skills/systematic-debugging/SKILL.md`, replace:

```
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
```

with:

```
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes. Based on superpowers(https://github.com/obra/superpowers).
```

- [ ] **Step 5: Edit cross-ref at line ~179 (TDD)**

In `skills/systematic-debugging/SKILL.md`, replace:

```
   - Use the `superpowers:test-driven-development` skill for writing proper failing tests
```

with:

```
   - Use the `harness-flow:test-driven-development` skill for writing proper failing tests
```

- [ ] **Step 6: Edit cross-ref at line ~287 (TDD in Related skills)**

In `skills/systematic-debugging/SKILL.md`, replace:

```
- **superpowers:test-driven-development** - For creating failing test case (Phase 4, Step 1)
```

with:

```
- **harness-flow:test-driven-development** - For creating failing test case (Phase 4, Step 1)
```

- [ ] **Step 7: Delete the verification-before-completion reference (line ~288)**

In `skills/systematic-debugging/SKILL.md`, delete this entire line:

```
- **superpowers:verification-before-completion** - Verify fix worked before claiming success
```

- [ ] **Step 8: Verify edits applied**

```bash
grep -c "Based on superpowers" skills/systematic-debugging/SKILL.md
grep -c "harness-flow:test-driven-development" skills/systematic-debugging/SKILL.md
grep -c "superpowers:test-driven-development" skills/systematic-debugging/SKILL.md
grep -c "verification-before-completion" skills/systematic-debugging/SKILL.md
```

Expected:
- `Based on superpowers`: 1
- `harness-flow:test-driven-development`: 2
- `superpowers:test-driven-development`: 0
- `verification-before-completion`: 0

- [ ] **Step 9: Stage (do not commit yet — single commit at Task 4)**

```bash
git add skills/systematic-debugging/SKILL.md
git status
```

Expected: shows `new file: skills/systematic-debugging/SKILL.md` staged.

---

### Task 2: Port `root-cause-tracing.md` with npm generalization and section removal

**Files:**

- Create: `skills/systematic-debugging/root-cause-tracing.md`
- Source: `/Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/root-cause-tracing.md`

- [ ] **Step 1: Copy the file verbatim**

```bash
cp /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/root-cause-tracing.md skills/systematic-debugging/root-cause-tracing.md
```

- [ ] **Step 2: Verify pre-edit baseline**

```bash
diff /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/root-cause-tracing.md skills/systematic-debugging/root-cause-tracing.md
```

Expected: no output.

- [ ] **Step 3: Generalize the npm test command (around L87-90)**

In `skills/systematic-debugging/root-cause-tracing.md`, replace this block:

````
**Run and capture:**
```bash
npm test 2>&1 | grep 'DEBUG git init'
```
````

with:

````
**Run and capture (use your test command):**
```bash
npm test 2>&1 | grep 'DEBUG git init'              # Node
go test ./... -v 2>&1 | grep 'DEBUG git init'      # Go
pytest -s 2>&1 | grep 'DEBUG git init'             # Python
```
````

- [ ] **Step 4: Remove the "Finding Which Test Causes Pollution" section**

In `skills/systematic-debugging/root-cause-tracing.md`, delete the entire section starting with `## Finding Which Test Causes Pollution` and ending right before `## Real Example: Empty projectDir`. Specifically, delete these lines (in source they are L97-108):

````
## Finding Which Test Causes Pollution

If something appears during tests but you don't know which test:

Use the bisection script `find-polluter.sh` in this directory:

```bash
./find-polluter.sh '.git' 'src/**/*.test.ts'
```

Runs tests one-by-one, stops at first polluter. See script for usage.

````

(Including the trailing blank line so two consecutive blank lines don't remain.)

- [ ] **Step 5: Verify edits applied**

```bash
grep -c "use your test command" skills/systematic-debugging/root-cause-tracing.md
grep -c "go test ./" skills/systematic-debugging/root-cause-tracing.md
grep -c "pytest -s" skills/systematic-debugging/root-cause-tracing.md
grep -c "Finding Which Test Causes Pollution" skills/systematic-debugging/root-cause-tracing.md
grep -c "find-polluter.sh" skills/systematic-debugging/root-cause-tracing.md
```

Expected:
- `use your test command`: 1
- `go test ./`: 1
- `pytest -s`: 1
- `Finding Which Test Causes Pollution`: 0
- `find-polluter.sh`: 0

- [ ] **Step 6: Verify "Real Example" section still intact (sanity check that we didn't over-delete)**

```bash
grep -c "## Real Example: Empty projectDir" skills/systematic-debugging/root-cause-tracing.md
grep -c "## Key Principle" skills/systematic-debugging/root-cause-tracing.md
```

Expected: both 1.

- [ ] **Step 7: Stage (commit at Task 4)**

```bash
git add skills/systematic-debugging/root-cause-tracing.md
```

---

### Task 3: Port `defense-in-depth.md` verbatim

**Files:**

- Create: `skills/systematic-debugging/defense-in-depth.md`
- Source: `/Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/defense-in-depth.md`

- [ ] **Step 1: Copy verbatim**

```bash
cp /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/defense-in-depth.md skills/systematic-debugging/defense-in-depth.md
```

- [ ] **Step 2: Verify identical to source (no edits planned)**

```bash
diff /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/defense-in-depth.md skills/systematic-debugging/defense-in-depth.md
```

Expected: no output.

- [ ] **Step 3: Stage (commit at Task 4)**

```bash
git add skills/systematic-debugging/defense-in-depth.md
```

---

### Task 4: Port `condition-based-waiting.md` with example.ts reference removed, then commit Tasks 1–4

**Files:**

- Create: `skills/systematic-debugging/condition-based-waiting.md`
- Source: `/Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/condition-based-waiting.md`

- [ ] **Step 1: Copy verbatim**

```bash
cp /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/condition-based-waiting.md skills/systematic-debugging/condition-based-waiting.md
```

- [ ] **Step 2: Verify pre-edit baseline**

```bash
diff /Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/condition-based-waiting.md skills/systematic-debugging/condition-based-waiting.md
```

Expected: no output.

- [ ] **Step 3: Remove the example.ts reference (L82 in source)**

In `skills/systematic-debugging/condition-based-waiting.md`, delete this single line:

```
See `condition-based-waiting-example.ts` in this directory for complete implementation with domain-specific helpers (`waitForEvent`, `waitForEventCount`, `waitForEventMatch`) from actual debugging session.
```

(Also remove the blank line above it if it leaves a double-blank between the code block and the next section header `## Common Mistakes`.)

- [ ] **Step 4: Verify edit applied**

```bash
grep -c "condition-based-waiting-example.ts" skills/systematic-debugging/condition-based-waiting.md
grep -c "waitForEventCount" skills/systematic-debugging/condition-based-waiting.md
grep -c "## Common Mistakes" skills/systematic-debugging/condition-based-waiting.md
```

Expected:
- `condition-based-waiting-example.ts`: 0
- `waitForEventCount`: 0
- `## Common Mistakes`: 1

- [ ] **Step 5: Stage and verify all 4 files staged**

```bash
git add skills/systematic-debugging/condition-based-waiting.md
git status --short
```

Expected output (4 new files):

```
A  skills/systematic-debugging/SKILL.md
A  skills/systematic-debugging/condition-based-waiting.md
A  skills/systematic-debugging/defense-in-depth.md
A  skills/systematic-debugging/root-cause-tracing.md
```

- [ ] **Step 6: Run hook tests (regression check)**

```bash
node --test 'tests/hooks/*.test.js' 'tests/hooks/smoke/*.smoke.test.js' 2>&1 | tail -10
```

Expected: `# pass 70`, `# fail 0`.

- [ ] **Step 7: Commit Tasks 1–4 as one logical change**

```bash
git commit -m "$(cat <<'EOF'
feat(skills): add systematic-debugging skill

Port systematic-debugging from superpowers as an orthogonal bug-fix
entry point. Four markdown files: SKILL.md (root-cause-first 4-phase
process), root-cause-tracing.md (backward call-chain tracing),
defense-in-depth.md (multi-layer validation), condition-based-waiting.md
(replace arbitrary timeouts with condition polling).

Adjustments from upstream:
- description: append Based-on attribution
- SKILL.md cross-refs: superpowers:test-driven-development → harness-flow,
  drop verification-before-completion (not ported)
- root-cause-tracing.md: generalize npm test example to Node/Go/Python,
  drop "Finding Which Test Causes Pollution" section (npm-coupled)
- condition-based-waiting.md: drop reference to example.ts (Lace-specific)

Files dropped from upstream: find-polluter.sh, condition-based-waiting-example.ts,
test-pressure-{1,2,3}.md, test-academic.md, CREATION-LOG.md.
EOF
)"
```

Expected: commit succeeds, 4 files added.

---

### Task 5: Restore debugging branches in `using-harness-flow/SKILL.md`

**Files:**

- Modify: `skills/using-harness-flow/SKILL.md` (3 lines)

- [ ] **Step 1: Verify pre-edit state (debugging absent in 3 expected spots)**

```bash
grep -n "Process skills first" skills/using-harness-flow/SKILL.md
grep -n "Fix this bug" skills/using-harness-flow/SKILL.md
grep -n "Rigid (TDD" skills/using-harness-flow/SKILL.md
```

Expected:
- `Process skills first`: matches `1. **Process skills first** (brainstorming) - these determine HOW to approach the task` (no `, debugging`)
- `Fix this bug`: 0 matches (line absent)
- `Rigid (TDD`: matches `**Rigid** (TDD): Follow exactly. Don't adapt away discipline.` (no `, debugging`)

- [ ] **Step 2: Edit Skill Priority line (~L101)**

In `skills/using-harness-flow/SKILL.md`, replace:

```
1. **Process skills first** (brainstorming) - these determine HOW to approach the task
```

with:

```
1. **Process skills first** (brainstorming, debugging) - these determine HOW to approach the task
```

- [ ] **Step 3: Add the "Fix this bug" routing line after the "Let's build X" line (~L104)**

In `skills/using-harness-flow/SKILL.md`, replace:

```
"Let's build X" → brainstorming first, then implementation skills.
```

with:

```
"Let's build X" → brainstorming first, then implementation skills.
"Fix this bug" → debugging first, then domain-specific skills.
```

- [ ] **Step 4: Edit Skill Types line (~L108)**

In `skills/using-harness-flow/SKILL.md`, replace:

```
**Rigid** (TDD): Follow exactly. Don't adapt away discipline.
```

with:

```
**Rigid** (TDD, debugging): Follow exactly. Don't adapt away discipline.
```

- [ ] **Step 5: Verify all 3 edits applied**

```bash
grep -c "(brainstorming, debugging)" skills/using-harness-flow/SKILL.md
grep -c '"Fix this bug" → debugging first' skills/using-harness-flow/SKILL.md
grep -c "Rigid\*\* (TDD, debugging)" skills/using-harness-flow/SKILL.md
```

Expected: all 1.

- [ ] **Step 6: Verify nothing else changed (single-line edits only)**

```bash
git diff --stat skills/using-harness-flow/SKILL.md
```

Expected: `1 file changed, 3 insertions(+), 2 deletions(-)` — two lines modified (each = 1 deletion + 1 insertion) plus one entirely new line.

- [ ] **Step 7: Run hook tests (regression check — session-start hook reads this file)**

```bash
node --test 'tests/hooks/*.test.js' 'tests/hooks/smoke/*.smoke.test.js' 2>&1 | tail -10
```

Expected: `# pass 70`, `# fail 0`. (The session-start hook reads the file as a blob — the additions don't break parsing.)

- [ ] **Step 8: Commit**

```bash
git add skills/using-harness-flow/SKILL.md
git commit -m "$(cat <<'EOF'
feat(skills): restore debugging branches in using-harness-flow

With systematic-debugging now ported, restore the routing guidance that
was previously removed when the skill didn't exist:
- Skill Priority lists brainstorming AND debugging as process skills
- "Fix this bug" → debugging first routing example
- Skill Types lists TDD AND debugging as rigid skills

Mirrors the upstream using-superpowers structure for the bug-fix branch.
EOF
)"
```

---

### Task 6: Add "Parallel Track: Bug Fixing" section to `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md` (insert new section after "The Skill Chain" section)

- [ ] **Step 1: Locate insertion point**

```bash
grep -n "The chain ends when" CLAUDE.md
```

Expected: one match, e.g. `21:The chain ends when \`finishing-a-development-branch\` completes.`

- [ ] **Step 2: Insert the new section after that line**

In `CLAUDE.md`, replace:

```
The chain ends when `finishing-a-development-branch` completes.

## Hooks (Node.js, macOS · Claude Code only)
```

with:

```
The chain ends when `finishing-a-development-branch` completes.

## Parallel Track: Bug Fixing

`systematic-debugging` is **not** part of the linear chain above — it's an
orthogonal entry point for bug/test-failure/unexpected-behavior tasks.

- Trigger: any technical issue (bug, test failure, performance, build failure)
- Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
- Four phases: Root Cause → Pattern Analysis → Hypothesis → Implementation
- Joins the main chain only at Phase 4 Step 1, where it invokes
  `harness-flow:test-driven-development` to write the failing test before fixing
- Supporting files: `root-cause-tracing.md`, `defense-in-depth.md`,
  `condition-based-waiting.md`

When the user describes a symptom (not a feature), enter via systematic-debugging
instead of brainstorming.

## Hooks (Node.js, macOS · Claude Code only)
```

- [ ] **Step 3: Verify the insertion**

```bash
grep -c "## Parallel Track: Bug Fixing" CLAUDE.md
grep -c "Iron Law: NO FIXES WITHOUT ROOT CAUSE" CLAUDE.md
grep -n "## Hooks" CLAUDE.md
```

Expected:
- `## Parallel Track: Bug Fixing`: 1
- `Iron Law: NO FIXES WITHOUT ROOT CAUSE`: 1
- `## Hooks`: line number is now ~14 lines later than before

- [ ] **Step 4: Verify diff is purely additive (no other changes)**

```bash
git diff --stat CLAUDE.md
```

Expected: only insertions, 0 deletions in this single hunk.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document systematic-debugging as parallel track in CLAUDE.md

Add a "Parallel Track: Bug Fixing" section after the linear skill chain
to make explicit that systematic-debugging is an orthogonal entry point,
not a chain step. Prevents future readers from assuming bug-fix work
must go through brainstorming.
EOF
)"
```

---

### Task 7: Update `README.md` (overview, parallel track section, included skills)

**Files:**

- Modify: `README.md` (3 spots: L5, L62 area, L178 area)

- [ ] **Step 1: Update Overview (L5) — eight skills → nine skills, two entry points**

In `README.md`, replace:

```
> A Claude Code plugin that wires eight skills into one gated workflow — design, isolation, planning, TDD, review, and finish — so the agent walks the full path instead of jumping to the end.
```

with:

```
> A Claude Code plugin that wires nine skills into two gated entry points — a feature track (design → isolation → planning → TDD → review → finish) and a bug-fix track (root-cause investigation → minimal fix) — so the agent walks the full path instead of jumping to the end.
```

- [ ] **Step 2: Insert "Parallel track — bug fixing" section between L61 `---` and L63 `## Hooks`**

In `README.md`, replace:

````

```
docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md   # brainstorming output
docs/harness-flow/plans/YYYY-MM-DD-<feature>.md        # writing-plans output
```

---

## Hooks
````

with:

````

```
docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md   # brainstorming output
docs/harness-flow/plans/YYYY-MM-DD-<feature>.md        # writing-plans output
```

---

## Parallel track — bug fixing

**systematic-debugging** — separate entry point for bugs, test failures, or unexpected behavior. Enforces root-cause investigation before any fix attempt (4 phases, Iron Law: no fixes without investigation). Joins the main chain only at Phase 4, where it uses `test-driven-development` to write the failing test before fixing.

---

## Hooks
````

- [ ] **Step 3: Add "Debugging" category to Included skills (after Quality assurance, before Meta)**

First locate the Quality assurance / Meta boundary:

```bash
grep -n "^\*\*Meta\*\*" README.md
```

Expected: one match.

In `README.md`, replace:

```
**Quality assurance**

- **test-driven-development** — enforces the Red-Green-Refactor cycle (includes testing-anti-patterns reference)
- **requesting-code-review** — code review request checklist

**Meta**
```

with:

```
**Quality assurance**

- **test-driven-development** — enforces the Red-Green-Refactor cycle (includes testing-anti-patterns reference)
- **requesting-code-review** — code review request checklist

**Debugging**

- **systematic-debugging** — root-cause-first bug investigation (4 phases, supporting techniques: root-cause-tracing, defense-in-depth, condition-based-waiting)

**Meta**
```

- [ ] **Step 4: Verify all 3 edits applied**

```bash
grep -c "wires nine skills into two gated entry points" README.md
grep -c "## Parallel track — bug fixing" README.md
grep -c "^\*\*Debugging\*\*$" README.md
grep -c "systematic-debugging\*\* — root-cause-first" README.md
```

Expected: all 1.

- [ ] **Step 5: Verify no stale "eight skills" reference remains**

```bash
grep -c "eight skills" README.md
grep -c "wires eight" README.md
```

Expected: both 0.

- [ ] **Step 6: Run hook tests (final regression check)**

```bash
node --test 'tests/hooks/*.test.js' 'tests/hooks/smoke/*.smoke.test.js' 2>&1 | tail -10
```

Expected: `# pass 70`, `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: add systematic-debugging to README

- Overview: nine skills, two gated entry points (feature + bug-fix tracks)
- New "Parallel track — bug fixing" section between skill chain and hooks
- New "Debugging" category in Included skills listing
EOF
)"
```

---

### Task 8: Final verification

**Files:** None modified — read-only checks across the whole branch.

- [ ] **Step 1: Show full commit history of this branch**

```bash
git log --oneline master..HEAD
```

Expected: 5 commits (1 spec + 4 implementation):

```
<sha> docs: add systematic-debugging to README
<sha> docs: document systematic-debugging as parallel track in CLAUDE.md
<sha> feat(skills): restore debugging branches in using-harness-flow
<sha> feat(skills): add systematic-debugging skill
<sha> docs: add systematic-debugging port design spec
```

- [ ] **Step 2: Verify new skill structure mirrors other harness-flow skills**

```bash
ls skills/systematic-debugging/
```

Expected (4 files, all markdown — no .sh, no .ts):

```
SKILL.md
condition-based-waiting.md
defense-in-depth.md
root-cause-tracing.md
```

- [ ] **Step 3: Verify no broken cross-skill references**

```bash
grep -rn "superpowers:test-driven-development\|superpowers:verification-before-completion" skills/systematic-debugging/
grep -rn "find-polluter.sh\|condition-based-waiting-example.ts" skills/systematic-debugging/
```

Expected: both empty (no matches).

- [ ] **Step 4: Verify description pattern consistency across all skills**

```bash
for d in skills/*/; do
  grep -m1 "^description:" "$d/SKILL.md" | grep -c "Based on superpowers"
done
```

Expected: each line outputs `1` (every skill has the Based-on attribution).

- [ ] **Step 5: Final hook test run**

```bash
node --test 'tests/hooks/*.test.js' 'tests/hooks/smoke/*.smoke.test.js' 2>&1 | tail -10
```

Expected: `# pass 70`, `# fail 0`.

- [ ] **Step 6: Verify clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

- [ ] **Step 7: Report**

Print summary: total files changed, commit count, test pass count. Then hand off to `harness-flow:requesting-code-review` for end-of-implementation review (per chain step 7), or to `harness-flow:finishing-a-development-branch` for merge/PR decision (per chain step 8) — whichever the user prefers.

---

## Notes for the implementer

- All edits are line-targeted text replacements — use `Edit` with exact surrounding context to avoid ambiguity. Do NOT use `sed` for multi-line replacements (the spec writer's expectations may not survive whitespace normalization).
- Source files at `/Users/WonjinSin/Documents/project/superpowers/skills/systematic-debugging/` are read-only references — never modify them.
- If a `grep -c` verification returns an unexpected count, STOP. Re-read the file at the affected lines, identify what's different, and fix before proceeding. Don't paper over a mismatch.
- The `cp` command in Tasks 1–4 is intentional rather than `Read + Write`: preserves byte-exact source so subsequent diffs are interpretable.
