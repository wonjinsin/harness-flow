---
name: using-harness
description: Loaded at session start as the meta-skill. Defines when to engage the harness chain (build/fix/refactor/migrate requests → invoke router as the first action; casual chat → reply inline without invoking) and how skill priority works (each skill's 'Required next skill' marker is load-bearing — follow it before any other skill the conversation might match). Points at `harness-contracts/` for the shared execution-modes, payload, and file-ownership contracts.
model: haiku
---

# Using Harness

The harness is a chained planning + execution flow that turns a feature/bug request into PRD/TRD/TASKS, executes, evaluates, and updates docs. Each skill's SKILL.md declares its own next skill in a "Required next skill" section — follow those markers in order.

## When to engage

- **Casual chat / question** ("hi", "what does X mean?", "how do I…?") → answer directly. Do not invoke the harness.
- **Build / fix / refactor / migrate request** ("add 2FA to login", "fix the broken test", "refactor session handling") → invoke `Skill("harness-flow:router")` as your first action. Router decides whether to clarify, plan, or resume.

## Skill priority

When a harness skill's "Required next skill" section names a follow-up, run it before any other skill the conversation might also match. Treat the chain as load-bearing — skipping a step (e.g., going straight from brainstorming to executor) breaks the per-edge handoff contract. The full graph lives in `harness-contracts/payload-contract.md`.

## Execution mode

Each SKILL.md declares its own `## Execution mode` — either "Main context" (run inline) or "Subagent (isolated context)" (dispatch via Task tool with the procedure as the prompt). Honor that declaration when invoking. Full contract: `harness-contracts/execution-modes.md`.

## Session artifacts

`.planning/{session_id}/` (relative to user CWD): `ROADMAP.md`, `STATE.md`, `brainstorming.md`, `PRD.md`, `TRD.md`, `TASKS.md`, `findings.md`.
