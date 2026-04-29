# harness-flow

A Claude Code plugin. Routes user requests through **router → brainstorming → PRD/TRD/TASKS → execute → evaluate → doc-update** as a Skill × Agent hybrid harness. There is no central DAG file — each skill declares its own next step inline (`## Required next skill`), and a session-start hook injects the `using-harness` meta-skill so the LLM acts as the interpreter.

---

## Core concepts

- **Skill metadata is the routing source.** Each `skills/<name>/SKILL.md` ends with a `## Required next skill` section; the main thread reads it and dispatches the next stage. Inspired by superpowers-style markers.
- **`harness-contracts/` is the shared contract layer.** Four files at repo root pin down the cross-skill agreements:
  - `execution-modes.md` — which skill runs in main context vs. as an isolated subagent, and why
  - `payload-contract.md` — the conceptual DAG: every edge plus the payload shape it carries
  - `output-contract.md` — input/output shape for the writer family + error taxonomy
  - `file-ownership.md` — who creates/updates/reads each session artifact
- **9 skills × 4 agents.** Lightweight stages (router, brainstorming, parallel-task-executor) run in the main context; heavy artifact stages (PRD/TRD/TASKS writers, evaluator, doc-updater) run as isolated subagents.
- **Session = folder.** All artifacts live under the user's project at `.planning/{YYYY-MM-DD-slug}/` (`ROADMAP.md`, `STATE.md`, `PRD.md`, `TRD.md`, `TASKS.md`, `findings.md`).
- **Two explicit user gates.** Gate 1 (route approval, absorbed by brainstorming Phase B) decides which spec stack to produce. Gate 2 (spec review, after each `*-writer` emits `done`) lets the user approve / revise / abort the written `PRD.md` / `TRD.md` / `TASKS.md` before the next stage runs. On revise, the writer is re-dispatched with a `revision_note` and surgically addresses just that note.
- **Brainstorming grounds questions in code.** Once intent + target are pinned, brainstorming runs a scoped codebase peek (~10 Read/Grep/Glob calls) and emits the findings as `exploration_findings`. Writers consume them as authoritative ground and run on a small verify-first budget instead of re-exploring.

---

## Installation

### A) Git marketplace (recommended)

This repo exposes itself as a single-plugin marketplace via `.claude-plugin/marketplace.json`.

```
/plugin marketplace add wonjinsin/harness-flow
/plugin install harness-flow@harness
```

The `SessionStart` hook bundled with the plugin will run on every new session and inject `using-harness` into context.

### B) Copy-paste mode — drop into `.claude/` without the plugin system

Use this when you want to bypass the plugin system and place the repo directly under `.claude/`. Claude Code will not inject `$CLAUDE_PLUGIN_ROOT` in this mode, but `session-start.sh` self-derives the harness root from its own location, so **no environment variable needs to be exported**.

**(B-1) Global — clone into `~/.claude/harness-flow/` (recommended)**

```bash
git clone https://github.com/wonjinsin/harness.git ~/.claude/harness-flow
```

**(B-2) Project-local — `<project>/.claude/harness-flow/`**

```bash
git clone https://github.com/wonjinsin/harness.git <project>/.claude/harness-flow
```

#### Required: register the hook in `settings.json`

In plugin mode, Claude Code reads `hooks/hooks.json` automatically. In copy-paste mode it is **ignored**, because the bundled `hooks.json` references `${CLAUDE_PLUGIN_ROOT}` — an empty variable outside of plugin mode. Register the hook manually in `~/.claude/settings.json` (global) or `<project>/.claude/settings.json` (project-local):

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
            "command": "bash \"$HOME/.claude/harness-flow/hooks/session-start.sh\""
          }
        ]
      }
    ]
  }
}
```

Project-local (`<project>/.claude/settings.json`) — use a relative path from the project root:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "bash \".claude/harness-flow/hooks/session-start.sh\""
          }
        ]
      }
    ]
  }
}
```

Why this works without any env var: `session-start.sh` resolves the harness root from its own location:

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"
```

When `$CLAUDE_PLUGIN_ROOT` is empty (copy-paste mode), `HARNESS_ROOT` falls back to the parent of `hooks/`, which is the repo root. The script then injects the resolved absolute path into the `using-harness` content so all `${CLAUDE_PLUGIN_ROOT}` references in skill bodies are substituted at injection time.

**(B-3) Flat merge into `.claude/`**

Splitting `skills/`, `agents/`, `hooks/` out and merging them into the existing `~/.claude/skills/`, `~/.claude/agents/`, etc. works as long as there are no name collisions, but it makes upgrades and uninstalls painful. Not recommended. The same `settings.json` registration is still required.

### C) Verifying the install

```
/plugin
```

If `harness-flow` shows up as enabled, plugin mode is working. In copy-paste mode `/plugin` will not list anything, but on the first message of a new session the system context should contain a `"You have harness."` block with the body of `using-harness` — that is the bootstrap success signal.

---

## How it triggers

On the first user message of a new session, `using-harness` decides:

| Input example                     | Classification | Behavior                                                          |
| --------------------------------- | -------------- | ----------------------------------------------------------------- |
| `"hi"`, `"what can you do?"`      | casual         | Plain reply, harness does not engage                              |
| `"add 2FA to login"`              | plan           | router → brainstorming → route recommendation → …                 |
| `"clean up the auth code"`        | clarify        | router → brainstorming Phase A (Q&A) → Phase B (classification)   |
| `"continue yesterday's 2FA work"` | resume         | router → load matched session → resume from next unfinished phase |

Once a session is created, progress follows the `ROADMAP.md` checkboxes. If you stop and resume, work picks up after the last `[x]`.

---

## Node graph

```
                      router
                        │
                        ▼ (clarify | plan | resume)
                   brainstorming
                        │
       ┌────────────────┼─────────────────┬──────────────┐
       ▼                ▼                 ▼              ▼
   (prd-trd)        (prd-only)        (trd-only)     (tasks-only)
       │                │                 │              │
       ▼                ▼                 ▼              ▼
   prd-writer       prd-writer        trd-writer     task-writer
       │                │                 │              │
       ▼                ▼                 │              │
   trd-writer       task-writer ──────────┤              │
       │                │                 ▼              │
       └───────┬────────┴───────────► task-writer ◄──────┘
               ▼
       parallel-task-executor
               │
               ▼ (done)
           evaluator
               │
               ▼ (pass)
          doc-updater
               │
               ▼ (terminal)
              END
```

---

## Skills

**using-harness** — Meta-skill injected at session start via hook. Decides whether to engage the harness chain (build/fix/refactor/migrate) or reply inline (casual chat). Each skill's "Required next skill" marker is load-bearing — skipping a step breaks the per-edge payload contract.

**router** — Entry point for every user request. Classifies input as `casual`, `clarify`, `plan`, or `resume`, and creates the `.planning/{session_id}/` folder skeleton for new sessions.

**brainstorming** — Intake stage that handles ambiguity, codebase grounding, and routing. Phase A clarifies the request and runs A1.6 (a scoped ~10-call codebase peek) so questions reference what actually exists; Phase B classifies the work into one of four routes (`prd-trd`, `prd-only`, `trd-only`, `tasks-only`) and holds Gate 1 for user approval. Emits `exploration_findings` for downstream writers.

**prd-writer** — Drafts `PRD.md` in an isolated subagent. Captures Goal, Acceptance criteria, Non-goals, Constraints, and Open questions. Outcome-framed, not engineering-detailed. Verify-first when `exploration_findings` is present (~5 calls), full-mode otherwise (~15).

**trd-writer** — Drafts `TRD.md` in an isolated subagent. Maps affected surfaces to concrete file/function names, interfaces & contracts, data model, and risks. Code-shape level, distinct from PRD. Verify-first when `exploration_findings` is present (~10 calls), full-mode otherwise (~25).

**task-writer** — Drafts `TASKS.md` in an isolated subagent. Decomposes the work into PR-sized, executor-ready tasks (3–8 is healthy). Preserves PRD/TRD vocabulary verbatim — evaluator greps on it. Verify-first when upstream context (TRD or `exploration_findings`) is present (~10 calls), full-mode otherwise (~20).

**parallel-task-executor** — Dispatches one fresh subagent per task via the Task tool. Runs tasks in parallel where possible, serializes on file overlap, caps at 5 per group. Writes `[Result]` blocks per task and finalizes `ROADMAP.md`.

**evaluator** — Gates executor output before doc-updater. Verifies all `[Result]` blocks are `done` and judges the diff against project rules. Outcome: `pass` → doc-updater; `escalate` or `error` → session ends.

**doc-updater** — Terminal stage. Updates `CHANGELOG.md`, `README.md`, `CLAUDE.md`, and `docs/**/*.md` to reflect code changes. Keeps edits ≤20 lines; structural rewrites go to `findings.md` for human review.

After install, the only thing that appears in your project is:

```
<your-project>/
└── .planning/
    └── {YYYY-MM-DD-slug}/
        ├── ROADMAP.md
        ├── STATE.md
        ├── PRD.md
        ├── TRD.md
        ├── TASKS.md
        └── findings.md
```
