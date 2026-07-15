---
name: writing-plans
description: Use when you have an approved spec for a multi-step task, before touching code. Based on superpowers(https://github.com/obra/superpowers).
---

# Writing Plans

## Overview

Decompose an approved spec into an **Implementation Groups section appended
to the spec document itself** — the decomposition contract: groups, tasks,
files, tiers, and interfaces. Step-level content (test code, commands,
implementation code) is NOT written here: the subagent-driven-development
controller authors it as a group brief at dispatch time, against the
then-current codebase, gated by `scripts/brief-check`.

**Announce at start:** "I'm using the writing-plans skill to add the Implementation Groups section to the spec."

**Context:** This must run inside a dedicated worktree. Invoke the `using-git-worktrees` skill BEFORE editing the spec if not already in one.

**Output location:** the spec document (`docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md`) — append one `## Implementation Groups` section at the end. Do not create a file under `docs/harness-flow/plans/`.

- (User preferences for spec location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest that split now — one spec (with its own Implementation Groups section) per subsystem. Each must produce working, testable software on its own.

## File Structure

Before defining groups, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently testable deliverable.

## Task Groups

Wrap 2–3 related tasks into a **Task Group** — the unit
`subagent-driven-development` dispatches to one implementer. Group tasks
that share context and run in sequence (e.g. a parser task and the
middleware that consumes it). One implementer builds all of a group's
tasks (one commit each); one reviewer reviews the group's combined diff.

- Keep a group to 2–3 tasks. A naturally standalone task is its own
  one-task group.
- Group by shared context, not to hit a count. Do not split a single test
  cycle across groups.
- If the whole feature is ≤3 tasks, still write the section — the executor
  runs tiny decompositions inline, without dispatch.

## Section Format

Append exactly one section in this shape. Heading strings are
machine-parsed — `## Implementation Groups`, `### Group N: <name>`, and the
tier tag are exact:

````markdown
## Implementation Groups

> **For agentic workers:** REQUIRED SUB-SKILL: harness-flow:subagent-driven-development.
> Step-level briefs are authored at dispatch time — this section is the
> decomposition contract, not the step script.

### Group 1: Tokenizer `tier: cheap`

- Task 1.1: split input into tokens — Files: create `src/tokenize.py`, test `tests/test_tokenize.py`
- Task 1.2: classify token kinds — Files: modify `src/tokenize.py`, test `tests/test_tokenize.py`
- Interfaces:
  - consumes: — (none)
  - produces: `tokenize(text: str) -> list[Token]`; `Token(kind: str, value: str)`

### Group 2: Renderer `tier: standard`

- Task 2.1: render tokens to HTML — Files: create `src/render.py`, test `tests/test_render.py`
- Interfaces:
  - consumes: `tokenize(text: str) -> list[Token]` (Group 1)
  - produces: `render(tokens: list[Token]) -> str`
````

Every group carries these REQUIRED slots:

- **tier** — `cheap` | `standard` | `most-capable`, judged by the group
  complexity signals in subagent-driven-development's Model Selection
  (highest-complexity task in the group wins). Model choice and review
  gating read this tag.
- **Files per task** — exact paths, create/modify/test.
- **Interfaces** — exact signatures, verbatim: every name, parameter and
  return type another group relies on. This block is the pre-review
  surface for cross-group type consistency — a later brief is written
  against it.

Global Constraints live in the spec body (the section's requirements
implicitly include them); do not duplicate them here.

## What This Section Does NOT Contain

Step-level content — failing-test code, run commands, implementation
code, commit steps — belongs to the dispatch-time group brief
(subagent-driven-development authors it and `scripts/brief-check` gates
it). If you find yourself writing a code block in this section, move that
precision into the Interfaces slot instead.

## Self-Review

After writing the section, check it against the spec with fresh eyes —
a checklist you run yourself, not a subagent dispatch:

**1. Spec coverage:** Skim each requirement in the spec. Can you point to
the group that implements it? A requirement with no group is a gap — add
the group or task.

**2. Interface consistency:** Every `consumes` names a `produces` that
exists in an earlier group, verbatim — same name, same parameter and
return types.

**3. Path existence:** Every file listed as modify exists in the
worktree; every create path's directory convention matches the codebase.

**4. Tier sanity:** Each tier matches the group complexity signals — a
group whose every task touches 1-2 files with a complete interface
contract is `cheap`; integration concerns pull it to `standard`; design
judgment pulls it to `most-capable`.

Fix issues inline and move on.

## User Review Gate (unified)

This is the chain's single document gate — it reviews the design AND the
decomposition in one pass (brainstorming no longer runs a separate spec
review). After the self-review passes:

> "Design + Implementation Groups written to `<spec path>`. Please review
> — design sections first, then the group decomposition — and let me know
> what to change before implementation starts."

Wait for the user's response. If they request changes, make them and
re-run the self-review. Only proceed once the user approves.

## Legacy Plans

A standalone plan document under `docs/harness-flow/plans/` from an
earlier version still executes: subagent-driven-development's legacy path
extracts briefs from it with `scripts/task-brief`. Do not convert it and
do not write new ones.

## Execution Handoff

After user approval, announce and proceed:

**"Implementation Groups approved in `<spec path>`. Proceeding with Subagent-Driven execution — the controller authors each group's brief at dispatch time (or runs inline for a ≤3-task decomposition)."**

- **REQUIRED SUB-SKILL:** Use harness-flow:subagent-driven-development
