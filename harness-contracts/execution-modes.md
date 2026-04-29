# Execution modes

Single source of truth for the two execution modes a harness skill can declare. Each `SKILL.md` carries a one-line `## Execution mode` declaration that points here; the explanations below apply uniformly.

## Subagent (isolated context)

The main thread loads the skill via the Skill tool, then dispatches a fresh subagent via the Task tool with the skill's procedure as the prompt. **The subagent has no access to the main conversation history** — its entire input is the dispatch prompt it was dispatched with (plus any upstream files the prompt cites).

Why isolation: writers and gatekeepers spend a lot of context on code reading and rule reasoning. Letting that pollute the main thread would crowd out the user-facing conversation. The trade-off is that the skill cannot recover from a thin dispatch prompt by recalling earlier turns — the prompt must be self-sufficient or the skill must investigate via Read/Grep/Glob.

Skills that declare this mode: `prd-writer`, `trd-writer`, `task-writer`, `evaluator`, `doc-updater`.

## Main context

The skill runs inline in the main thread. It has the live conversation context and can write directly to the user, ask clarifying questions, dispatch other skills via the Task tool, and aggregate parallel returns.

Why main: classification (`router`), Q&A (`brainstorming`), and orchestration (`parallel-task-executor`) all need either user dialogue or the ability to fan out work to subagents. Both require the main thread.

Skills that declare this mode: `router`, `brainstorming`, `parallel-task-executor`.

## How a SKILL.md references this file

Each skill's `## Execution mode` section is a single line:

```markdown
## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.
```

or

```markdown
## Execution mode

Main context — see `../../harness-contracts/execution-modes.md`.
```

The relative path assumes `skills/{skill-name}/SKILL.md`. Adjust if the skill lives elsewhere.
