---
name: using-harness-flow
description: Use when starting any conversation, including before clarifying questions.
---

<SUBAGENT-STOP>
If dispatched as a subagent for a specific task, ignore this skill.
</SUBAGENT-STOP>

# Using harness-flow

Invoke the relevant skill before responding — even for clarifying questions.
Announce "Using [skill] to [purpose]" and follow it. User instructions override
skills — skip a skill's workflow only when the user explicitly tells you to.

## Routing

Apply the first matching route. `Directly` means no lower-priority route runs
first:

1. Approved plan or agreed small-change brief → `implement`.
   Approved spec → `writing-plans`. A confirmed bug-fix brief → `writing-plans`
   only when the user explicitly requested an implementation plan; otherwise →
   `implement`.
2. Skill creation, editing, or verification (`SKILL.md` and skill-shipped prompt
   templates) → `writing-skills` directly. Skill-only work stays outside the
   brainstorming → implement chain; enter that chain only when product/source code
   is also in scope. This skill-only route takes precedence over generic read-only analysis.
3. Unconfirmed bug / test failure / unexpected behavior, including an explicit implementation plan request
   about that symptom → `systematic-debugging`.
   Root-cause confirmation must precede any plan or fix proposal.
4. Explicit code review request → `requesting-code-review` directly. Reviewing a
   branch, diff, or recent changes takes this route even though it is read-only
   analysis.
5. Explicit spec request → `brainstorming` in its explicit-spec mode. Explicit
   implementation plan request for a non-bug task or already settled design →
   `writing-plans` directly.
6. Build / feature / refactor / script, stated change intent, or investigation to
   decide whether code should change → `brainstorming`.
7. Read-only research, investigation, comparison, analysis, or reporting about an
   in-scope codebase, repository, or technical artifact → `brainstorming`.
   General-knowledge questions stay direct.

Skills use harness-neutral wording — map any generic mechanism (skill loading,
task tracking, subagent dispatch) to your harness's native tool.
