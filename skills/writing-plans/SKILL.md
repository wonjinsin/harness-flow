---
name: writing-plans
description: Use when you have an approved spec for a multi-step task, before touching code. Based on superpowers(https://github.com/obra/superpowers).
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** This must run inside a dedicated worktree. Invoke the `using-git-worktrees` skill BEFORE saving the plan file if not already in one.

**Save plans to:** `docs/harness-flow/plans/YYYY-MM-DD-<feature-name>.md`

- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently testable deliverable.

## Task Groups

Wrap 2–3 related tasks into a **Task Group** — the unit `subagent-driven-development`
dispatches to one implementer. Group tasks that share context and run in
sequence (e.g. a parser task and the middleware that consumes it). A group
is the coarser gate: one implementer builds all its tasks (one commit each),
and one reviewer reviews the group's combined diff.

- Heading: `### Group N: <name>`, with tasks nested as `#### Task N.M: <name>`.
- Keep a group to 2–3 tasks. A task that is naturally standalone is its own
  one-task group.
- Group by shared context, not to hit a count. Do not split a single test
  cycle across groups.
- If the whole plan is ≤3 tasks, still write it (grouped or not) — the
  executor runs tiny plans inline, without dispatch.

## Bite-Sized Task Granularity

**Each *step* (not task) is one action (2-5 minutes):** a task is ~5 such
steps; a group is 2–3 tasks. The 2–5 minutes sizes a step, never the dispatch
unit.

- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use harness-flow:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

---
```

## Task Structure

````markdown
### Group N: [Group Name]

#### Task N.1: [Component Name]

**Files:**

- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**

- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```

#### Task N.2: [Second Component]

**Files:**

- Create: `exact/path/to/other_file.py`
- Modify: `exact/path/to/file.py:12-18`
- Test: `tests/exact/path/to/other_test.py`

**Interfaces:**

- Consumes: `function(input)` from Task N.1 (see Produces above)
- Produces: [what later tasks rely on — exact function names, parameter
  and return types]

- [ ] **Step 1: Write the failing test**

```python
def test_other_behavior():
    result = other_function(function(input))
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/other_test.py::test_name -v`
Expected: FAIL with "other_function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def other_function(value):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/other_test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/other_test.py src/path/other_file.py
git commit -m "feat: add other feature"
```
````

## No Placeholders

Every step must contain the actual content an engineer needs. These are **plan failures** — never write them:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code — the engineer may be reading tasks out of order)
- Steps that describe what to do without showing how (code blocks required for code steps)
- References to types, functions, or methods not defined in any task

## Remember

- Exact file paths always
- Complete code in every step — if a step changes code, show the code
- Exact commands with expected output
- DRY, YAGNI, TDD, frequent commits

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Placeholder scan:** Search your plan for red flags — any of the patterns from the "No Placeholders" section above. Fix them.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## User Review Gate

After the self-review passes, ask the user to review the written plan before proceeding:

> "Plan written and committed to `<path>`. Please review it and let me know if you want to make any changes before we start implementation."

Wait for the user's response. If they request changes, make them and re-run the self-review. Only proceed once the user approves.

## Execution Handoff

After saving the plan, announce completion and proceed directly to Subagent-Driven execution:

**"Plan complete and saved to `docs/harness-flow/plans/<filename>.md`. Proceeding with Subagent-Driven execution — one implementer per Task Group (or inline for a ≤3-task plan), with review at each group boundary."**

- **REQUIRED SUB-SKILL:** Use harness-flow:subagent-driven-development
- Implementer per group + group-boundary review (tiny plans run inline)
