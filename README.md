# harness-flow

## Overview

> A Claude Code plugin that wires nine skills into one gated workflow — design, isolation, planning, TDD, verification, review, and finish — so the agent walks the full path instead of jumping to the end.

### Problems it solves

- Coding starts before the spec is agreed on, piling up code that's hard to redirect
- "Tests pass" is asserted with no fresh verification evidence
- Multiple tasks blend into one worktree, making rollback and review painful
- Code review and cleanup get skipped or vary from person to person

### How it solves them

- Gates the spec-agreement step so no implementation can start without explicit user approval
- Isolates each task into its own worktree, then forces an explicit merge / PR / keep / discard decision at the end
- Splits implementation and review into separate subagents that run in parallel within one session, and blocks "done" claims without fresh verification evidence

### Who it's for

- People using Claude Code daily who want the agent to stop skipping steps
- People who want TDD + worktree isolation + subagent-driven review wired up in one shot

### Foundation

After analyzing six Claude Code harnesses ([`design/comparison.md`](design/comparison.md)), [superpowers](https://github.com/obra/superpowers) was adopted as the base because it minimizes complexity and treats simplicity as the top priority. Worktree isolation and finishing flows were added on top.

- [Archon](design/reference/archon.md)
- [everything-claude-code](design/reference/everything-claude-code.md)
- [get-shit-done](design/reference/get-shit-done.md)
- [gstack](design/reference/gstack.md)
- [oh-my-claudecode](design/reference/oh-my-claudecode.md)
- [superpowers](design/reference/superpowers.md)

---

## Skill chain — the order work flows in

1. **using-harness-flow** — injected at session start. Forces the agent to first ask "which skill applies here?"
2. **brainstorming** — refines the spec before implementation. Includes a `<HARD-GATE>` that blocks moving on without user approval. Output: `docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md`.
3. **using-git-worktrees** — isolates the workspace. Detects existing worktrees → prefers native tools → falls back to manual.
4. **writing-plans** — decomposes the design into 2–5 minute TDD tasks. Output: `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md`.
5. **subagent-driven-development** — runs an implementer subagent per task, then reviews in two stages: spec compliance and code quality.
6. **test-driven-development** — sub-skill each implementer subagent follows. Forces the order Red → confirm fail → Green → confirm pass → Refactor.
7. **verification-before-completion** — fresh verification evidence is required before any "done" claim.
8. **requesting-code-review** — dispatches the `harness-flow:code-reviewer` subagent to review changes.
9. **finishing-a-development-branch** — presents four options (merge locally / push & PR / keep / discard) and cleans up the worktree.

### Output locations

Skills create artifacts lazily inside the active worktree (not the repo root):

```
docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md   # brainstorming output
docs/harness-flow/plans/YYYY-MM-DD-<feature>.md        # writing-plans output
```

---

## Installation

There are two installation methods. If you use more than one environment, install separately in each.

### A) Git marketplace (recommended)

This repo exposes itself as a single-plugin marketplace via `.claude-plugin/marketplace.json`.

```
/plugin marketplace add wonjinsin/harness-flow
/plugin install harness-flow@harness-flow
```

Once installed, `hooks/hooks.json` is loaded automatically and the `using-harness-flow` context is injected at session start.

### B) Copy-paste mode — drop the repo into `.claude/`

Place the repo directly under `.claude/` instead of going through the plugin system.

In copy-paste mode, `$CLAUDE_PLUGIN_ROOT` is unset, so the bundled `hooks/hooks.json` is ignored. You have to register the hook in `settings.json` yourself. The `session-start` script derives the plugin root from its own location, so you don't need to set the environment variable.

**(B-1) Global — clone into `~/.claude/harness-flow/` (recommended)**

```bash
git clone https://github.com/wonjinsin/harness-flow.git ~/.claude/harness-flow
```

**(B-2) Project-local — `<project>/.claude/harness-flow/`**

```bash
git clone https://github.com/wonjinsin/harness-flow.git <project>/.claude/harness-flow
```

#### Required: register the hook in `settings.json`

Global (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/harness-flow/hooks/session-start"
          }
        ]
      }
    ]
  }
}
```

Project-local (`<project>/.claude/settings.json`) — use `$CLAUDE_PROJECT_DIR`, the project-root variable Claude Code injects into hook commands:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/session-start"
          }
        ]
      }
    ]
  }
}
```

---

## Included skills

**Development process**

- **brainstorming** — Socratic design refinement, spec document generation
- **writing-plans** — task-level implementation plan generation
- **subagent-driven-development** — subagent-based implementation + two-stage review
- **using-git-worktrees** — parallel development branch isolation
- **finishing-a-development-branch** — merge/PR decision workflow

**Quality assurance**

- **test-driven-development** — enforces the Red-Green-Refactor cycle (includes testing-anti-patterns reference)
- **verification-before-completion** — verification gate before claiming done
- **requesting-code-review** — code review request checklist

**Meta**

- **using-harness-flow** — entry point for the skill system, injected at session start

---

## See Also

- `design/comparison.md` — 6-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers). Explains why this plugin sits at "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives
