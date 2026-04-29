---
name: using-harness
description: Loaded at session start — defines when to engage the harness flow and how to enter it.
---

# Using Harness

The harness is a chained planning + execution flow that turns a feature/bug request into PRD/TRD/TASKS, executes, evaluates, and updates docs. Each skill's SKILL.md declares its own next skill in a "Required next skill" section — follow those markers in order.

## When to engage

- **Casual chat / question** ("hi", "what does X mean?", "how do I…?") → answer directly. Do not invoke the harness.
- **Build / fix / refactor / migrate request** ("add 2FA to login", "fix the broken test", "refactor session handling") → invoke `Skill("harness-flow:router")` as your first action. Router decides whether to clarify, plan, or resume.

## Skill priority

When a harness skill's "Required next skill" section names a follow-up, run it before any other skill the conversation might also match. Treat the chain as load-bearing — skipping a step (e.g. going straight from brainstorming to executor) breaks payload threading.

## Execution mode

Each SKILL.md declares its own `## Execution mode` — either "Main context" (run inline) or "Subagent (isolated context)" (dispatch via Task tool with the procedure as the prompt). Honor that declaration when invoking. Full contract: `harness-contracts/execution-modes.md`.

## Session artifacts

`.planning/{session_id}/` (relative to user CWD): `ROADMAP.md`, `STATE.md`, `PRD.md`, `TRD.md`, `TASKS.md`, `findings.md`.
