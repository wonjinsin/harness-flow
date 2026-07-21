# plan-demotion revert decision — handoff for a fresh session

**Date**: 2026-07-16
**Status**: **Executed — but concluded via a user-directed hard-reset rather than the incremental revert in §2.**
Reset the master tree to be identical to 832eb5e (1.1.7), preserving only the 3 design/ documents
(reset --hard was blocked by permission policy → performed as an additive commit with identical content; if you
want to squash the history, run `git reset --hard <this commit>` directly).
CLAUDE.md was manually corrected from the 832eb5e contamination (pitfall 1) to the 0398517 wording.
**Task 2 (fence-aware task-brief port) is preserved, complete and passing tests, in the unmerged branch
`worktree-revert-plan-arch` (tip d85bacc: 7a9eb4a restore + d85bacc fence port,
3 Red → Green, 186/186)** — if needed, just
cherry-pick the task-brief + tests from d85bacc. §2–§4 below are the original plan as written at decision time (for the record).

## 1. Decision and rationale (no re-discussion needed)

User gate: **"if it doesn't improve both tokens and speed, it's pointless"** — quality is a
hard constraint, not a tradeable.

Applying this gate to plan-demotion (1.2.0–1.2.2) yields:

| Axis | 1.2.x vs 1.1.7 | Basis |
|---|---|---|
| Speed | win (human gate 2→1, producer −25%) | retro §8 eval1 |
| Tokens | neutral~losing — n=1 −0.9k / n≥3 +0.7k (dual authoring, linear in n) + skill text +454 words | retro §9 measured |
| (indirect) | loss of the premise for the cheap skip (plan human gate) → follow-up 2 substitutes a paid reviewer at +86.2k/feature | retro §9 |

→ **failed to improve both axes at once = rejected. Return to the 1.1.x plan architecture**, but
port only the elements that gain on both axes: the fence-aware scanner (eliminates the false-positive rewrite
cycle = simultaneous token/speed gain + fixes the silent task-brief truncation bug).

## 2. Execution scope (3 tasks — SDD inline path, dispatch only the final review)

### Task 1: restore the skill chain to 1.1.x semantics

- Restore (source: 832eb5e — but read §3 pitfall 1 first):
  `skills/writing-plans/SKILL.md`, `skills/writing-plans/plan-document-reviewer-prompt.md` (revive),
  `skills/subagent-driven-development/SKILL.md`, `skills/subagent-driven-development/task-reviewer-prompt.md`,
  `skills/brainstorming/SKILL.md`, `skills/subagent-driven-development/scripts/task-brief` (restore comments to original; fence repair is Task 2)
- Delete: `skills/subagent-driven-development/scripts/brief-check`, `tests/scripts/brief-check.test.js`
- Manual rewrite (do NOT restore via checkout — pitfall 1): rewrite `CLAUDE.md` chain steps 2·4·5 into the plan-
  document-based narrative (writing-plans → `docs/harness-flow/plans/` output, plan review
  gate, task-brief extraction, review gating = cheap skip), and restore `README.md`'s 3 steps and artifact
  paths. Keep the `docs/harness-flow/` gitignore note (Output Paths) (still valid).
- Already present in 1.1.7 skills and thus secured automatically by the restore: inline path (≤3 tasks),
  review gating cheap-skip (1.1.6), 3-re-review cap, ledger, review-package.

### Task 2: port the fence-aware scanner into task-brief (TDD)

- Source logic: the awk `ticklen` state machine in the current master's `scripts/brief-check` —
  open = `[ \t]*` + backtick ≥3 (records the length), close = backtick ≥ open length +
  `[ \t]*$`, a line short of that is fence content. BSD awk compatible (no GNU-only features).
- Apply this state machine so that task-brief's heading detection ignores headings inside a fence
  (repair of the real bug where the pre-1.2.0 naive `/^```/` toggle silently truncated group text
  on a 4-backtick nested fence).
- Red first: add a reproduction of the 4-backtick nested-fence truncation + an indented-fence case to
  `tests/scripts/task-brief.test.js` (first check whether the file exists; if not, author a new one following
  brief-check.test.js's spawnSync convention).
- exit/CLI contract unchanged.

### Task 3: release

- Version 1.3.0: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`,
  `.codex-plugin/plugin.json` (the codex mirror test enforces equivalence).
- Add §10 to `design/2026-07-15-plan-demotion-retrospective.md`: record of the completed revert.
- After confirming the full suite is green, squash merge to master.

## 3. Pitfalls (actually hit across these sessions)

1. **832eb5e is not a pure 1.1.7 snapshot.** Due to history-rewrite contamination,
   CLAUDE.md carries the 1.2.x chain text (including a reference to `scripts/brief-check`, which does not
   exist in its own tree), and README may be partly contaminated too. So do NOT checkout CLAUDE.md·README
   from 832eb5e — rewrite them manually. For the skill files, before restoring, confirm no changes
   between 1.1.6↔1.1.7 with
   `git diff 74f1cd9 832eb5e -- skills/writing-plans skills/subagent-driven-development skills/brainstorming`
   and then restore from 832eb5e (if there is a diff,
   read the content and pick the side that matches 1.1.7 semantics).
2. **The worktree branched off a stale origin/master** — right after creation,
   `git merge --ff-only master` is required (occurred in two consecutive sessions).
3. **When renaming digraph nodes, measure the count with grep** — including incoming edges.
   A miscounted estimate occurred in two consecutive sessions (wrote 3, actually 4).
4. **A user global git hook** (`core.hooksPath=~/.git_template/hooks`) prepends a `[branch-name]`
   prefix to worktree-branch commit subjects (mistaken for a JIRA matcher).
   The squash merge absorbs it — no action needed; ignore it when validating commit messages.
5. **A dispatched subagent may commit to the main checkout** (CLAUDE.md
   gotcha) — instruct the dispatch prompt to confirm the branch + verify with `git log` after DONE.
6. `docs/harness-flow/` is gitignored — specs/plans are uncommitted working artifacts,
   do not `git add -f`. Durable records go to `design/`.

## 4. Preservation targets (things the revert must not erase)

- All 3 `design/` retrospectives (plan-demotion §1–9, section-only, this document)
- All hooks (unrelated to these changes) — but confirm that the `SDD_DESC` anchor in `hooks/pre-agent-model.js`
  matches the description form of the restored 1.1.x prompt templates
  ("Implement Group N:" / "Review Group N (spec + quality)" — introduced in 1.1.6,
  should match)
- The unmerged branch `worktree-section-only-dispatch` (a recoverable asset)

## 5. Decision-history summary (for context)

1.2.0 (spec section + dispatch-time brief) → 1.2.1 (boundary wording) → section-only
experiment (negative, unmerged) → deep eval "keep with follow-ups" (§8) → follow-up 1–3
execution + 1.2.2 (§9): n=3 dual-authoring +27% measured, follow-up 2 reviewer +86.2k/feature
→ user gate applied → **revert confirmed**. The lasting lesson: the token lever was not document structure
but (a) reviewer gating policy and (b) elimination of the false-positive cycle.
