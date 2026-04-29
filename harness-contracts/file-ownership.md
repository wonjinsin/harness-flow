# File ownership

Single source of truth for which skill is allowed to create, update, or only read each file the harness touches. Each skill's `## Boundaries` section is its row in this table, not a free-form list — keep them in sync.

## Session artifacts (under `.planning/{session_id}/`)

| Path | Created by | Updated by | Read-only by |
|---|---|---|---|
| `ROADMAP.md` | `router` (empty skeleton, Step 4) | `brainstorming` (Complexity line, brainstorming row), `parallel-task-executor` (phase finalization, Step 7) | `trd-writer`, `task-writer`, `evaluator` |
| `STATE.md` | `router` (empty skeleton, Step 4) | `brainstorming` (Current Position, Last activity), `parallel-task-executor` (resume state), main thread (`escalated`, `last_eval`, `last_eval_at`, `last_eval_excerpt` on evaluator return) | `evaluator` *(does not read STATE.md)* |
| `brainstorming.md` | `brainstorming` (Phase B7, after Gate 1 approval) | — (no further writes; regeneration deletes and re-dispatches) | `prd-writer`, `trd-writer`, `task-writer` |
| `PRD.md` | `prd-writer` | — (no further writes; regeneration deletes and re-dispatches) | `trd-writer`, `task-writer` |
| `TRD.md` | `trd-writer` | — | `task-writer` |
| `TASKS.md` | `task-writer` | `parallel-task-executor` (`[Result]` blocks per task; never the body) | `evaluator`, `doc-updater` |
| `findings.md` | `doc-updater` | — | — |

## Project-level files

| Path | Created/updated by | Notes |
|---|---|---|
| `CHANGELOG.md` | `doc-updater` | Created with Keep-a-Changelog skeleton if absent; otherwise appended under `## [Unreleased]`. |
| `README.md`, `CLAUDE.md`, `docs/**/*.md` | `doc-updater` (≤20-line edits only) | Structural rewrites are recorded as `not applied — structural rewrite required` in `findings.md`; the human handles them. No locale variants (e.g., `README.ko.md`). |
| Source code under VCS | `parallel-task-executor`'s per-task **subagents** (via Task tool, isolated context) | The executor itself does not edit source — it only dispatches. Each subagent's edit is bounded by its task's `Files:` declaration. |

## Forbidden operations

- **No skill modifies source code outside the executor's per-task subagents.** Writers, brainstorming, router, evaluator, and doc-updater do not edit code, even if they spot bugs while reading it. They record findings in their own artifact (Open questions in PRD/TRD, Notes in TASKS, `findings.md` for doc-updater).
- **No skill writes `.planning/{session_id}/` directories outside its own row above.** The row is the contract; deviating breaks downstream assumptions about who owns regeneration.
- **No skill writes `*.ko.md`, `*.ja.md`, or other locale variants.** Translation is a human responsibility; recorded under `## Not applied` in `findings.md` if encountered.

## How a SKILL.md references this file

Each skill's `## Boundaries` (or equivalent) section lists its row from this table verbatim, plus skill-specific operational constraints (tool budget, attempt cap, etc.). The single-source-of-truth lives here; `SKILL.md` rows are summaries, not new rules. Example:

```markdown
## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill = TRD.md row).
- Tool budget: ~25 Read/Grep/Glob calls. ...
- Do not invoke other agents or skills. ...
```
