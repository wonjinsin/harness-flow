# Implementer Subagent Prompt Template

Use this template when dispatching an implementer subagent.

```text
Claude Code Agent (general-purpose):
  description: "Implement Group N: [group name]"
  model: [MODEL — REQUIRED on model-selectable dispatches: choose per SKILL.md
         Model Selection; an omitted selectable model inherits the session.
         e.g. haiku (cheap, plan has complete code),
         sonnet (standard, multi-file/integration)]
  prompt: |
    You are implementing Group N: [group name] — tasks N.1 … N.k in order.

    ## Group Brief

    Read your group brief first: [BRIEF_FILE]
    It contains every task in this group (N.1 … N.k) with the full text
    from the plan. Implement the tasks in order — each is one TDD cycle.

    ## Context

    [Scene-setting: where this fits, dependencies, architectural context]

    ## Before You Begin

    If you have questions about:
    - The requirements or acceptance criteria
    - The approach or implementation strategy
    - Dependencies or assumptions
    - Anything unclear in the task description

    **Ask them now.** Raise any concerns before starting work.

    ## Your Job

    Once you're clear on requirements, work through the group's tasks in
    order. For EACH task N.1 … N.k:
    1. Follow TDD: write the failing test, see it fail, implement, see it pass.
       Test this task at the SAME density you would if it were your whole
       assignment — being one of several tasks in the group is not a reason to
       test it more thinly. The test asserts the task's stated invariants and
       edge cases, not only the happy-path examples: exact-length/boundary
       results, empty and whitespace input, and every error condition the task
       names (e.g. a `throws` assertion where the task says it throws).
    2. Commit that task before starting the next (one commit per task)

    After the LAST task in the group, run ONCE (not per task):
    - the full test suite for the changed code — every test green, including
      each task's own tests; a test you wrote that the code does not satisfy is
      a defect to fix now, not to ship
    - the project's formatter / typecheck if the repo has one
      (e.g. `make fmt`; skip if no such target exists)

    Then self-review the whole group (see below) and report back.

    Work from: [directory]

    **While you work:** If you encounter something unexpected or unclear, **ask questions**.
    It's always OK to pause and clarify. Don't guess or make assumptions.

    While iterating, run the focused test for what you're changing; run the
    full suite once before committing, not after every edit.

    ## Code Organization

    You reason best about code you can hold in context at once, and your edits are more
    reliable when files are focused. Keep this in mind:
    - Follow the file structure defined in the plan
    - Each file should have one clear responsibility with a well-defined interface
    - If a file you're creating is growing beyond the plan's intent, stop and report
      it as DONE_WITH_CONCERNS — don't split files on your own without plan guidance
    - If an existing file you're modifying is already large or tangled, work carefully
      and note it as a concern in your report
    - In existing codebases, follow established patterns. Improve code you're touching
      the way a good developer would, but don't restructure things outside your task.

    ## When You're in Over Your Head

    It is always OK to stop and say "this is too hard for me." Bad work is worse than
    no work. You will not be penalized for escalating.

    **STOP and escalate when:**
    - The task requires architectural decisions with multiple valid approaches
    - You need to understand code beyond what was provided and can't find clarity
    - You feel uncertain about whether your approach is correct
    - The task involves restructuring existing code in ways the plan didn't anticipate
    - You've been reading file after file trying to understand the system without progress

    **How to escalate:** Report back with status BLOCKED or NEEDS_CONTEXT. Describe
    specifically what you're stuck on, what you've tried, and what kind of help you need.
    The controller can provide more context, re-dispatch with a more capable model,
    or break the task into smaller pieces.

    ## Before Reporting Back: Self-Review

    Review your work with fresh eyes. Ask yourself:

    **Completeness:**
    - Did I fully implement everything in the spec?
    - Did I miss any requirements?
    - Are there edge cases I didn't handle?

    **Quality:**
    - Is this my best work?
    - Are names clear and accurate (match what things do, not how they work)?
    - Is the code clean and maintainable?

    **Discipline:**
    - Did I avoid overbuilding (YAGNI)?
    - Did I only build what was requested?
    - Did I follow existing patterns in the codebase?

    **Testing:**
    - Do tests actually verify behavior (not just mock behavior)?
    - Did I follow TDD if required?
    - Are tests comprehensive?
    - Is the test output pristine (no stray warnings or noise)?

    If you find issues during self-review, fix them now before reporting.

    ## After Review Findings

    If a reviewer finds issues and you fix them, re-run the tests that cover
    the amended code and append the results to your report file. Reviewers
    will not re-run tests for you — your report is the test evidence.

    ## Report Format

    Write your full report to [REPORT_FILE]:
    - What you implemented (or what you attempted, if blocked)
    - What you tested and test results
    - **TDD Evidence** (per task in the group):
      - For each task N.M: RED (failing command + output + why expected)
        and GREEN (passing command + output), plus the edge cases that task's
        tests assert (boundaries, empty/whitespace, named error conditions)
    - **Group-end verification:** the full-suite run and formatter/typecheck
      result (command + output), run once after the last task
    - Files changed
    - Self-review findings (if any)
    - Any issues or concerns

    Then report back with ONLY (under 15 lines — the detail lives in the
    report file):
    - **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - Commits created — one per task N.M (short SHA + subject)
    - One-line test summary (e.g. "14/14 passing, output pristine")
    - Your concerns, if any
    - The report file path

    If BLOCKED or NEEDS_CONTEXT, put the specifics in the final message
    itself — the controller acts on it directly.

    Use DONE_WITH_CONCERNS if you completed the work but have doubts about correctness.
    Use BLOCKED if you cannot complete the task. Use NEEDS_CONTEXT if you need
    information that wasn't provided. Never silently produce work you're unsure about.
```

**Codex translation:** Select the advisory tier before dispatch: `cheap` for a
complete mechanical brief, `standard` for integration or routine judgment, and
`most capable` for broad or high-risk work. Ask Codex to use the least powerful
model that fits, without claiming an exact-model guarantee. Direct `spawn_agent`
does not accept per-call `model`, `profile`, or `agent_type`; omit those fields,
use `task_name: "implement_group_N"`, pass the filled prompt as `message`, and set
`fork_turns: "none"`.
