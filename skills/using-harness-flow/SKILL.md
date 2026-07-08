---
name: using-harness-flow
description: Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions. Based on superpowers(https://github.com/obra/superpowers).
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore this skill.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## The Rule

**Invoke relevant or requested skills BEFORE any response or action** — including clarifying questions, exploring the codebase, or checking files. Even a 1% chance a skill might apply means invoke it to check. If it turns out wrong for the situation, you don't have to use it.

**Before writing or changing any code/file — and before entering plan mode:** if you haven't already brainstormed this session, invoke the brainstorming skill first.

Then announce "Using [skill] to [purpose]" and follow the skill exactly. If it has a checklist, create a TodoWrite todo per item.

## Skill Priority

When multiple skills apply, process skills come first — they set the approach, then implementation skills (frontend-design, mcp-builder) carry it out.

- "Let's build X" → brainstorming first, then implementation skills.
- "Fix this bug" → systematic-debugging first, then domain skills.

## Red Flags

These thoughts mean STOP—you're rationalizing:

| Thought                             | Reality                                                |
| ----------------------------------- | ------------------------------------------------------ |
| "This is just a simple question"    | Questions are tasks. Check for skills.                 |
| "I need more context first"         | Skill check comes BEFORE clarifying questions.         |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first.           |
| "I can check git/files quickly"     | Files lack conversation context. Check for skills.     |
| "Let me gather information first"   | Skills tell you HOW to gather information.             |
| "This doesn't need a formal skill"  | If a skill exists, use it.                             |
| "I remember this skill"             | Skills evolve. Read current version.                   |
| "This doesn't count as a task"      | Action = task. Check for skills.                       |
| "The skill is overkill"             | Simple things become complex. Use it.                  |
| "I'll just do this one thing first" | Check BEFORE doing anything.                           |
| "This feels productive"             | Undisciplined action wastes time. Skills prevent this. |
| "I know what that means"            | Knowing the concept ≠ using the skill. Invoke it.      |

These thoughts specifically skip **brainstorming** before you start building:

| Thought                                       | Reality                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| "The user already told me exactly what to build" | A request states WHAT, not the design. Brainstorming surfaces the assumptions hidden in "exactly." Invoke it. |
| "This is a change to existing code, not a new feature" | Modifying behavior is creative work. Changes break assumptions too. Invoke brainstorming. |
| "It's a one-line / tiny change"               | Small changes are where unexamined assumptions cause the most rework. Size doesn't exempt the gate. |
| "They asked for code, not a design"           | "Add X" / "fix Y" never means skip brainstorming. The gate runs first regardless of phrasing. |
| "It's just a quick script / throwaway"        | Quick scripts encode assumptions about inputs, scope, and edge cases. Brainstorm them too. |
| "We're past planning, I'm just implementing"  | If no design was presented and approved this session, you have NOT brainstormed. Invoke it. |

## Platform Adaptation

Skills use Claude Code tool names. If your harness appears here, read its reference file for tool equivalents:

- Copilot CLI: `references/copilot-tools.md`
- Codex: `references/codex-tools.md`

## User Instructions

User instructions (CLAUDE.md, AGENTS.md, direct requests) take precedence over skills, which in turn override default system behavior. Only skip a skill workflow when the user has explicitly told you to. Instructions say WHAT, not HOW — "Add X" or "Fix Y" doesn't mean skip workflows.
