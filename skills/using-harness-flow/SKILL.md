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

Route by current state, not by keywords alone:

| Current state or intent | Route |
|---|---|
| Bug, test failure, or unexpected behavior | `systematic-debugging` |
| Read-only codebase research or report | `brainstorming` read-only exit |
| Change intent without an approved design | `brainstorming` |
| Approved design or spec, or explicit plan artifact | `writing-plans` |
| Approved task plan | Mandatory workspace preflight in `implement`, then plan execution |
| Explicit code-review artifact | `requesting-code-review` |
| General-knowledge question | Answer directly |

Artifact skills recover their own missing inputs; never draft an artifact ad hoc.

Skills use harness-neutral wording — map any generic mechanism (skill loading,
task tracking, subagent dispatch) to your harness's native tool.
