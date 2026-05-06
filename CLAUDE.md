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
7. `requesting-code-review` — dispatch `harness-flow:code-reviewer` subagent (template at `requesting-code-review/code-reviewer.md`).
8. `finishing-a-development-branch` — present a 4-option menu (merge locally / push & PR / keep / discard). Cleanup logic depends on whether harness-flow created the worktree.

The chain ends when `finishing-a-development-branch` completes.

## Hooks (Node.js, macOS · Claude Code only)

All hooks require Node.js 18+ and have zero npm dependencies. Registered in `hooks/hooks.json` via `${CLAUDE_PLUGIN_ROOT}`. Disable all hooks with `HARNESS_FLOW_HOOKS_OFF=1`.

### `hooks/session-start.js` — SessionStart

Reads `skills/using-harness-flow/SKILL.md` and emits `hookSpecificOutput.additionalContext` JSON to inject session context. Matcher: `startup|clear|compact`.

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start.js`

### `hooks/pre-bash.js` — PreToolUse(Bash)

Blocks dangerous Bash commands before they run (exit 2):
- `--no-verify` flag on any git command
- `rm -rf` targeting `/`, `~`, `$HOME`, or `.`
- Pipe-to-shell: `curl|wget|fetch ... | bash|sh|zsh|...`

On `git commit` commands, runs the commit gate:
1. `make fmt` (if target exists) — blocks if fmt modifies working tree; instructs re-stage
2. `make lint` (if target exists) — blocks and surfaces stderr on failure
3. Secret scan on `git diff --cached` — blocks if secret patterns detected

Missing Makefile targets are silently skipped. `make` is only invoked at commit time.

### `hooks/post-edit.js` — PostToolUse(Edit|Write|MultiEdit)

Scans the modified file for secret patterns immediately after each edit. Blocks (exit 2) on match with file path and line number. Skips `.env.example`, `*.test.*`, `**/fixtures/**` to reduce false positives.

### Hook registration env var conventions

- Plugin install → `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}`, auto-injected by Claude Code's plugin runtime.
- User settings (`~/.claude/settings.json`) → use `$HOME` (POSIX-standard).
- Project settings (`<project>/.claude/settings.json`) → use `$CLAUDE_PROJECT_DIR` (officially supported). Relative paths are not safe — hook CWD is unspecified.

### Hook code conventions

CommonJS (`require`), `'use strict'` at top, `node:*` built-ins only. stderr messages in English (LLM-readable). An external linter auto-formats JS files (notably converts single → double quotes) — don't fight it.

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
- **Run hook tests**: `node --test` (Node 18+ built-in runner; unit tests at `tests/hooks/*.test.js`, smoke tests at `tests/hooks/smoke/*.smoke.test.js`). Skill behavior has no automated tests — validate by invoking in a live session.
- **Add a hook**: register in `hooks/hooks.json`, gate on `HARNESS_FLOW_HOOKS_OFF=1`, add unit tests for any new `lib/`, add smoke test that spawns the hook with `spawnSync('node', [SCRIPT], { input: JSON.stringify(payload) })` and asserts on `status`/`stderr`.

## Output Paths

Skills produce artifacts lazily inside the active worktree (not the repo root):

- `docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md` (brainstorming output)
- `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` (writing-plans output)

## See Also

- `design/comparison.md` — 6-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers). Explains why this plugin sits in "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives.
