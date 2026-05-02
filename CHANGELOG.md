# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project loosely tracks [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.7] — 2026-05-02

### Changed

- `skills/router/SKILL.md` — removed hardcoded `model: haiku` from frontmatter. Router now runs on the default session model (typically Sonnet 4.6) instead of being downgraded to Haiku. This ensures casual responses have full quality for interactive use, rather than being optimized purely for routing speed. Added explanatory note in "## Execution mode" section explaining the design choice. Korean mirror `design/skills/router/SKILL.ko.md` updated in lockstep.

## [0.3.6] — 2026-05-01

### Changed

- `skills/using-harness/SKILL.md` — meta-skill rewritten to mandate `Skill("harness-flow:router")` as the first action of every user turn, removing the prior LLM-side casual/build pre-classification that occasionally caused the harness to silently disengage. Router (which already handles `casual` inline) is now the single classifier. Adds `<SUBAGENT-STOP>` guard, `<EXTREMELY-IMPORTANT>` entry rule, and a 5-row Red Flags table covering the rationalizations that lead to skipping router. Korean mirror `design/skills/using-harness/SKILL.ko.md` updated in lockstep.

## [0.3.5] — 2026-05-01

### Added

- `harness-contracts/ask-user-question.md` — new contract documenting when and how to call `AskUserQuestion` across all decision points (router slug confirmation, router multiple-session match, Gate 2 spec review).
- `agents/doc-updater.md` — missing Task-tool wrapper for `doc-updater`; fixes `Task(doc-updater, ...)` dispatch resolving without "agent not found" error.
- `CLAUDE.md` — project-level Claude Code guidance (repo layout, workflow, architecture, versioning, gotchas).
- `design/harness-contracts/ask-user-question.ko.md` — Korean mirror of the new ask-user-question contract.

### Changed

- `skills/router/SKILL.md`: Step 3 slug confirmation and Step 1 multiple-session-match now use `AskUserQuestion` instead of bare text prompts. Added clarify-vs-casual rule: proposals and suggestions in question form ("how about adding 2FA?", "what if we fix this?") route to `clarify`, not `casual`. Added anaphoric-reference examples to clarify signals table. Refined False-positive trap #8 to explicitly exclude proposal question forms.
- `skills/brainstorming/SKILL.md` + references: conversation examples converted from Korean to English; Edge-cases and procedure references updated accordingly.
- `harness-contracts/payload-contract.md`: Gate 2 spec-review description updated — main thread now calls `AskUserQuestion` for user decision (not bare prose).

## [0.3.3] — 2026-04-30

### Changed

- Skill handoff convention reworked: planning artifacts now flow through files (new `.planning/{session_id}/brainstorming.md` for brainstorming output, plus existing `PRD.md` / `TRD.md` / `TASKS.md`), and execution status flows through conversation markdown sections (`## Status`, `## Path`, `## Reason`, `## Session`). All `SKILL.md` files (English + Korean) and `harness-contracts/` documents updated accordingly. Top-level `README.md` / `README.ko.md` rewritten to describe the file-based handoff and the markdown-section status protocol. JSON output convention removed.
