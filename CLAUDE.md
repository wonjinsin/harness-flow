# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`harness-flow` is a Claude Code plugin (v0.3.4). It is entirely markdown — no build step, no test runner, no package manager. The operative content is in `skills/` and `harness-contracts/`. Everything else is documentation or plugin metadata.

## File layout

```
skills/             Operative skill files loaded by Claude Code
harness-contracts/  Shared cross-skill contracts (read before editing any skill)
agents/             Thin Task-tool wrappers that call the Skill tool; logic lives in skills/
design/             Korean documentation mirrors (.ko.md) — keep in sync when editing skills/
hooks/              SessionStart hook (session-start.sh) that injects using-harness at startup
.claude-plugin/     Plugin manifest (plugin.json) and marketplace entry (marketplace.json)
.planning/          Session artifacts created at runtime — brainstorming.md, PRD.md, TRD.md, TASKS.md (gitignored)
```

## Workflow

1. **Edit** — modify files under `skills/` or `harness-contracts/`
2. **Reflect** — update the matching `design/*.ko.md` Korean mirror
3. **Test** — either bump version + reinstall, or copy edits directly to `~/.claude/plugins/cache/harness/harness-flow/<version>/` for quick iteration
4. **Version** — bump version in both `plugin.json` and `marketplace.json`, add entry to `CHANGELOG.md`

## Architecture

**Routing chain.** Every user request enters through `router`, which classifies it and emits a `## Status` value. The main thread reads that value, dispatches `brainstorming`, and then follows each skill's `## Required next skill` section to dispatch the next stage. There is no central orchestrator — the chain is self-describing.

**Main context vs. subagent.** Three skills run inline (`router`, `brainstorming`, `parallel-task-executor`) because they need live user dialogue or fan-out. Five run as isolated subagents via the Task tool (`prd-writer`, `trd-writer`, `task-writer`, `evaluator`, `doc-updater`) — subagents have no access to main conversation history, so their dispatch prompts must be self-sufficient.

**Two handoff layers.**

- _Planning artifacts on disk_ — each writer reads the prior stage's `.planning/{session_id}/*.md` file. `brainstorming.md` is the authoritative ground for all downstream writers (Request, A1.6 findings, Brainstorming output, Recommendation).
- _Execution status in conversation markdown_ — terminal messages use fixed section headers (`## Status`, `## Path`, `## Reason`, `## Session`) so the main thread can dispatch the next stage without parsing prose.

**`harness-contracts/` is load-bearing.** Before changing any skill's Q&A, routing, file writes, or terminal messages, read the relevant contract first:

- `payload-contract.md` — the full node graph and per-edge handoff shape
- `output-contract.md` — terminal message shape and error taxonomy for all writers
- `execution-modes.md` — which skills run inline vs. as subagents, and why
- `file-ownership.md` — which skill creates / updates / reads each session artifact
- `ask-user-question.md` — when and how to use `AskUserQuestion` for interactive Q&A (covers all decision points across router, brainstorming, and Gate 2)

**`agents/` are thin shells.** Each `.md` in `agents/` does exactly three things: loads the corresponding skill via `Skill`, follows its procedure, emits the terminal message. Never add logic to agent files — put it in the skill.

**Korean design docs.** `design/` mirrors every `skills/` and `harness-contracts/` file in Korean (`.ko.md`). When you edit an English skill or contract file, update the matching Korean file in `design/`. `harness-contracts/ask-user-question.md` ↔ `design/harness-contracts/ask-user-question.ko.md`, etc.

**`skills/` are English-only.** Skill files are operative prompts — all text in `skills/` must be English, including dialogue examples, inline comments, and option labels. Korean belongs exclusively in `design/*.ko.md`.

**`## Required next skill` is load-bearing.** The chain only advances because each skill's terminal message tells the main thread what to dispatch next and with what dispatch prompt. If you change routing logic, update both the `## Required next skill` section in the affected `SKILL.md` and the corresponding edge in `harness-contracts/payload-contract.md`.

## Versioning

Version is tracked in two places — keep them in sync:

- `.claude-plugin/plugin.json` → `"version"`
- `.claude-plugin/marketplace.json` → `"metadata.version"` and `"plugins[0].version"`

Log every change in `CHANGELOG.md` under a new `## [x.y.z]` header.

## Gotchas

**Version drift.** The version mentioned in the `## What this repo is` section header comment must match `plugin.json`. If they diverge, the installed plugin version is the source of truth.

**Testing skill changes.** Skills are read from the installed plugin cache at `~/.claude/plugins/cache/harness/harness-flow/<version>/`. After editing files in this repo, either bump the version and reinstall, or edit the cached copy directly for quick iteration. There is no `npm test` — manual end-to-end testing via a real session is the only verification.

**`design/` sync is not automated.** When editing any English file under `skills/` or `harness-contracts/`, manually update the matching `.ko.md` in `design/`. There is no lint or CI to catch drift.
