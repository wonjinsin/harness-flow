# harness-flow

## Overview

> A Claude Code plugin that wires nine skills into two gated entry points — a feature track (design → isolation → planning → TDD → review → finish) and a bug-fix track (root-cause investigation → minimal fix) — so the agent walks the full path instead of jumping to the end.

### Problems it solves

- Coding starts before the spec is agreed on, piling up code that's hard to redirect
- Multiple tasks blend into one worktree, making rollback and review painful
- Code review and cleanup get skipped or vary from person to person

### How it solves them

- Gates the spec-agreement step so no implementation can start without explicit user approval
- Isolates each task into its own worktree, then forces an explicit merge / PR / keep / discard decision at the end
- Splits implementation and review into separate subagents — one implementer per Task Group, reviewed at each group boundary (a ≤3-task plan runs inline, no dispatch)

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

Work is tiered before the chain starts: **trivial** (1–2 files, obvious, no contract/security/ambiguity triggers) runs inline with TDD and a self-review — no worktree, docs, or approvals; **standard** runs the full chain. Objective diff caps backstop the classification (`skills/using-harness-flow/references/sizing.md`).

1. **using-harness-flow** — injected at session start. Forces the agent to first ask "which skill applies here?"

2. **brainstorming** — refines the spec before implementation. Includes a `<HARD-GATE>` that blocks moving on without user approval. Output: `docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md`.
   - 2-1. **using-git-worktrees** — invoked from inside brainstorming to isolate the workspace before writing any files. Detects existing worktrees → prefers native tools → falls back to manual.

3. **writing-plans** — decomposes the design into TDD tasks (2–5 minutes sizes a *step*, not the task) and wraps related tasks into Task Groups (2–3 each), the unit the executor dispatches. Output: `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md`.

4. **subagent-driven-development** — runs one implementer subagent per Task Group (a ≤3-task plan runs inline, no dispatch), then reviews each group in two stages: spec compliance and code quality.
   - 4-1. **test-driven-development** — sub-skill each implementer subagent follows. Forces the order Red → confirm fail → Green → confirm pass → Refactor.
   - 4-2. **requesting-code-review** — template used twice: (a) per group by the code quality reviewer subagent, and (b) once at the end as a final review of the entire implementation before moving on to step 5.
   - 4-3. **claude-md-revise** — after the final review (default ON), surfaces session learnings (corrections, "always/never" rules, project facts, anti-patterns) as per-candidate CLAUDE.md edits, while the branch is still open, before handing off to step 5.

5. **finishing-a-development-branch** — presents four options (merge locally / push & PR / keep / discard) and cleans up the worktree.

### Output locations

Skills create artifacts lazily inside the active worktree (not the repo root):

```
docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md   # brainstorming output
docs/harness-flow/plans/YYYY-MM-DD-<feature>.md        # writing-plans output
```

---

## Parallel track — bug fixing

**systematic-debugging** — separate entry point for bugs, test failures, or unexpected behavior. Enforces root-cause investigation before any fix attempt (4 phases, Iron Law: no fixes without investigation). Joins the main chain only at Phase 4, where it uses `test-driven-development` to write the failing test before fixing. After a verified fix it conditionally surfaces `claude-md-revise` candidates (debugging sessions often reveal anti-patterns), then hands off to `finishing-a-development-branch`.

---

## Hooks

Six Node.js hooks (Node 18+ required, zero npm dependencies, macOS · Claude Code only):

- **`session-start-harness.js`** — injects the `using-harness-flow` skill into every new/cleared/compacted session.
- **`session-start-caveman.js`** — pre-activates `caveman` mode (token-efficient terse responses) on every session boundary. Disable mid-session with "stop caveman" / "normal mode".
- **`pre-bash-commands.js`** — PreToolUse(Bash) destructive-action and cloud-CLI guard. Blocks: `--no-verify`, `rm -rf` of `/`/`~`/`$HOME`/`.`, pipe-to-shell (`curl|wget|fetch ... | sh|bash|...`), and `gcloud`/`aws` CLI calls (user authorization required).
- **`pre-secrets.js`** — PreToolUse(Read|Edit|Write|MultiEdit|Bash) secret-file access guard. Blocks any reference to secret-bearing paths: `.env` variants, SSH private keys (`id_rsa`/`id_ed25519`/`id_ecdsa`/`id_dsa`), `~/.aws/credentials`, gcloud credentials/ADC, GCP service-account JSON. Allowlist skips `.env.example`/`.sample`/`.template`/`.schema`/`.defaults`.
- **`pre-agent-model.js`** — PreToolUse(Agent|Task) SDD model-omission guard. When a `subagent-driven-development` implementer/reviewer dispatch omits `model`, it silently inherits the session's most expensive model (Opus); this hook denies such a dispatch so the controller re-dispatches with an explicit tier. Scoped to SDD dispatch descriptions — every other Agent dispatch passes untouched.
- **`post-edit.js`** — runs file-type post-edit actions after every Edit/Write/MultiEdit. Current `RULES`: `*.go` → `make fmt` at the project root. Any command exit ≠ 0 blocks (exit 2) and feeds stdout/stderr back to the LLM; if the project has no `Makefile` the hook is a silent no-op.

Disable all hooks for a session with `HARNESS_FLOW_HOOKS_OFF=1`.

---

## Installation

There are two installation methods. If you use more than one environment, install separately in each.

### A) Git marketplace (recommended)

This repo exposes itself as a single-plugin marketplace via `.claude-plugin/marketplace.json`.

```
/plugin marketplace add wonjinsin/harness-flow
/plugin install harness-flow@harness-flow
```

Once installed, `hooks/hooks.json` is loaded automatically — all six hooks (session-start-harness, session-start-caveman, pre-bash-commands, pre-secrets, pre-agent-model, post-edit) activate.

### B) Copy-paste mode — drop the repo into `.claude/`

Place the repo directly under `.claude/` instead of going through the plugin system.

In copy-paste mode, `$CLAUDE_PLUGIN_ROOT` is unset, so the bundled `hooks/hooks.json` is ignored. You have to register hooks in `settings.json` yourself. The session-start scripts derive the plugin root from their own location, so you don't need to set the environment variable.

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
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/session-start-harness.js" },
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/session-start-caveman.js" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/pre-bash-commands.js" }
        ]
      },
      {
        "matcher": "Read|Edit|Write|MultiEdit|Bash",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/pre-secrets.js" }
        ]
      },
      {
        "matcher": "Agent|Task",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/pre-agent-model.js" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/post-edit.js" }
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
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/session-start-harness.js" },
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/session-start-caveman.js" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/pre-bash-commands.js" }
        ]
      },
      {
        "matcher": "Read|Edit|Write|MultiEdit|Bash",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/pre-secrets.js" }
        ]
      },
      {
        "matcher": "Agent|Task",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/pre-agent-model.js" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/post-edit.js" }
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
- **subagent-driven-development** — subagent-based implementation (one implementer per Task Group; ≤3-task plans inline) + per-group review (merged spec + quality verdicts) + final whole-branch review
- **using-git-worktrees** — parallel development branch isolation
- **finishing-a-development-branch** — merge/PR decision workflow

**Quality assurance**

- **test-driven-development** — enforces the Red-Green-Refactor cycle (includes testing-anti-patterns reference)
- **requesting-code-review** — code review request checklist

**Debugging**

- **systematic-debugging** — root-cause-first bug investigation (4 phases, supporting techniques: root-cause-tracing, defense-in-depth, condition-based-waiting)

**Meta**

- **using-harness-flow** — entry point for the skill system, injected at session start
- **writing-skills** — create, edit, and verify skills before deployment
- **claude-md-revise** — surface session-derived knowledge into the nearest project `CLAUDE.md` / rules file
- **caveman** — ultra-compressed "caveman" response mode for token efficiency (pre-activated via `session-start-caveman.js`)

---

## Credits & Third-Party Licenses

Most skills in this repository are derived from prior MIT-licensed work. Original copyright notices and full license texts are reproduced in [`NOTICE`](NOTICE), as required by the MIT License. Each derived skill folder under `skills/` also contains its own `NOTICE` file, so individual skill folders can be copied elsewhere without losing required attribution.

- [obra/superpowers](https://github.com/obra/superpowers) (MIT, © 2025 Jesse Vincent) — base for `brainstorming`, `finishing-a-development-branch`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `using-harness-flow`, `writing-plans`.
- [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, © 2026 Matt Pocock) — `brainstorming` additionally incorporates ideas from the `grill-me` skill.

The `claude-md-revise` skill is original to this repository and is not derived from any upstream work.

---

## See Also

- `design/comparison.md` — 6-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers). Explains why this plugin sits at "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives
