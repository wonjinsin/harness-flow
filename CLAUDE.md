# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

`harness-flow` is a Claude Code plugin that ships a personal **skills library**

The repo is simultaneously:

- A plugin (`.claude-plugin/plugin.json`)
- Its own marketplace (`.claude-plugin/marketplace.json` points `source: ./`)

So the same checkout can be installed locally as a plugin for testing.

## The Skill Chain (architectural backbone)

Skills under `skills/` are designed to be invoked **in order** for any non-trivial task. A new Claude instance must understand this chain before touching skill content — editing one link affects the whole flow.

1. `using-harness-flow` — bootstrap, injected at SessionStart. Enforces "invoke a skill before any response, even 1% applicability."
2. `brainstorming` — produces a spec at `docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md`. Contains a `<HARD-GATE>` blocking implementation until the user approves the design.
3. `using-git-worktrees` — isolates the workspace. Step 0 detects existing isolation (linked worktree, submodule guard); Step 1a defers to native worktree tools (`EnterWorktree` etc.); Step 1b is the manual `git worktree add` fallback.
4. `writing-plans` — produces an implementation plan at `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` as bite-sized TDD tasks (2–5 min each, with exact code blocks).
5. `subagent-driven-development` — executes the plan one task at a time: implementer subagent → spec-compliance reviewer → code-quality reviewer. Prompts at `subagent-driven-development/{implementer,spec-reviewer,code-quality-reviewer}-prompt.md`.
6. `test-driven-development` — sub-skill that each implementer subagent follows (Red → Verify red → Green → Verify green → Refactor).
7. `verification-before-completion` — "no completion claim without fresh verification evidence" gate. Applies before any "done"/"passing" assertion.
8. `requesting-code-review` — dispatch `harness-flow:code-reviewer` subagent (template at `requesting-code-review/code-reviewer.md`).
9. `finishing-a-development-branch` — present a 4-option menu (merge locally / push & PR / keep / discard). Cleanup logic depends on whether harness-flow created the worktree.

The chain ends when `finishing-a-development-branch` completes.

## SessionStart Hook

`hooks/session-start` (Bash) reads a skill file and emits JSON context at session start. Three output shapes — only one is emitted depending on detected platform:

| Platform             | JSON field                             | Detection                                  |
| -------------------- | -------------------------------------- | ------------------------------------------ |
| Cursor               | `additional_context`                   | `CURSOR_PLUGIN_ROOT` set                   |
| Claude Code          | `hookSpecificOutput.additionalContext` | `CLAUDE_PLUGIN_ROOT` set, no `COPILOT_CLI` |
| Copilot CLI / others | `additionalContext`                    | fallback                                   |

`hooks/run-hook.cmd` is a polyglot `.cmd`/Bash wrapper so the same file works on Windows (cmd → Git Bash) and Unix.

**Known stale reference:** `hooks/session-start:18` reads `using-superpowers/SKILL.md`, but that directory was renamed to `using-harness-flow/`. Update the path before relying on hook injection.

## Cross-Platform Tool Names

Skills use Claude Code tool names (`Task`, `TodoWrite`, `Skill`). Translations for other harnesses live in `skills/using-harness-flow/references/`:

- `codex-tools.md` — Codex (`spawn_agent`, `wait`, `close_agent`, `update_plan`)
- `copilot-tools.md` — Copilot CLI
- `gemini-tools.md` — Gemini CLI

When editing a skill, keep tool references Claude-Code-native; the reference files do the translation.

## Common Operations

- **Add a skill**: create `skills/<name>/SKILL.md` with frontmatter `name:` and `description:`. The `description` determines auto-invocation trigger, so write it as a precise activation condition (see existing skills for tone).
- **Edit a skill**: do not break the chain order above. If a skill links to another (e.g. `harness-flow:writing-plans`), keep the reference name stable.
- **Reinstall plugin locally for testing**: use Claude Code's plugin/marketplace commands; the marketplace `source: "./"` lets the repo install itself.
- **No tests to run.** Validation = invoking the skill in a live session and observing behavior.

## Output Paths

Skills produce artifacts lazily inside the active worktree (not the repo root):

- `docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md` (brainstorming output)
- `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` (writing-plans output)

## See Also

- `design/comparison.md` — 6-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers). Explains why this plugin sits in "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives.
