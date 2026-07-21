---
name: using-harness-flow
description: Use when starting any conversation - establishes how to find and use skills, requiring native skill loading before ANY response including clarifying questions.
---

<SUBAGENT-STOP>
If dispatched as a subagent for a specific task, ignore this skill.
</SUBAGENT-STOP>

# Using harness-flow

Invoke the relevant skill before responding — even for clarifying questions.
Announce "Using [skill] to [purpose]" and follow it. User instructions override
skills — skip a skill's workflow only when the user explicitly tells you to.

## Routing

- Build / feature / refactor / script → brainstorming
- Bug / test failure / unexpected behavior → systematic-debugging

Skills use harness-neutral wording — map any generic mechanism (skill loading,
task tracking, subagent dispatch) to your harness's native tool.
