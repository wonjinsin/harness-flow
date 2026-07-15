# AGENTS.md

This repository ships **harness-flow**, a cross-harness skills library.

## Before any code work

Follow the `using-harness-flow` skill first. It classifies the work
(trivial vs standard) and routes standard-tier work through the skill
chain: brainstorming → worktree → plans → subagent-driven development →
review. Do not write or change code before invoking it.

Skills live under `skills/`. Each is a `SKILL.md` with a `name` and
`description` — load and follow the relevant one.

## Codex users

Skills use Claude Code tool names. Translations for Codex tools
(`spawn_agent`, `apply_patch`, subagent profiles, model tiering) live in
`skills/using-harness-flow/references/codex-tools.md`. Read it before
executing skills that dispatch subagents or edit files.

## Guardrail hooks

`hooks/hooks.json` registers SessionStart context injection and PreToolUse
guards (destructive commands, secret files). Codex auto-detects this file.
Disable all hooks with `HARNESS_FLOW_HOOKS_OFF=1`.
