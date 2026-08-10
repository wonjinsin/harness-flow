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
- Stated intent or desire to change code, or investigating whether code should
  change ("check if X needs updating", "compare to decide") → brainstorming
- Bug / test failure / unexpected behavior → systematic-debugging
- Read-only research, investigation, comparison, analysis, or report requests
  about the in-scope codebase, repository, or technical artifact, even without
  change intent ("investigate and report", "research this codebase")
  → brainstorming. General-knowledge questions stay direct; bug, test-failure,
  and unexpected-behavior requests follow systematic-debugging above
- Explicit ask for a specific artifact (an implementation plan — "write/make a
  plan", a spec, a code review) → that skill directly; never draft the artifact
  ad-hoc without the skill. It recovers its own missing inputs

Skills use harness-neutral wording — map any generic mechanism (skill loading,
task tracking, subagent dispatch) to your harness's native tool.
