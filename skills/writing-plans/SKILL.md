---
name: writing-plans
description: Use when you have an approved spec or agreed large design for a multi-step task, before touching code.
---

# Writing Plans

Turn an approved design into a plan the implementing session can follow. A plan is
a list of **tracer-bullet tasks** — vertical slices, each a complete path through
every layer it touches, verifiable on its own.

**Context:** work in an isolated workspace — invoke `using-git-worktrees` first if
not already in one. Save to `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md`.

## Header

```
# <Feature> Plan
Spec: docs/harness-flow/specs/<file>.md   — the source of intent; tasks need not
      restate decisions it already records. Consult it while implementing.
Goal: one sentence.
Constraints: project-wide rules copied verbatim from the spec (version floors,
      naming, platform) — every task inherits these.
```

## Tasks

List tasks in dependency order (blockers first):

```
### Task N: <title>
Delivers: the end-to-end behavior this makes work, from the user's perspective —
  not a layer-by-layer implementation list.
Touches: the files this creates or modifies (a pointer — no line numbers).
Blocked by: the tasks that must finish first, or "none".
- [ ] acceptance criterion 1
- [ ] acceptance criterion 2
```

## What a good task is

- A **tracer bullet** — a narrow but COMPLETE path through every layer it touches
  (schema → API → UI → test), demoable on its own. Never a horizontal slice of one
  layer.
- Sized to one focused sitting / one fresh context.
- **Responsive** — each task reflects what the previous one taught. Don't
  over-specify tasks far down the list; the early ones will change them.

## Rules

- Prefactor first: "make the change easy, then make the easy change."
- **No code blocks, and no line numbers — those rot. Name the files, not the lines.**
  Exception: a snippet that encodes a decision more precisely than prose (schema,
  type shape, state machine) — inline just the decision-rich part.
- No placeholders — no "TBD", no "handle errors later". Undecided → decide it or cut it.

**Wide refactor exception.** A mechanical change whose blast radius breaks thousands
of call sites at once can't be one vertical slice. Sequence it expand → migrate (in
batches) → contract, each step blocked by the last, keeping the suite green between
steps.

## Review with the user

Present the task list — titles, blocked-by, what each delivers. Ask: is the
granularity right? are the blocking edges correct? should any merge or split?
Iterate until the user approves.

There is no group-boundary reviewer and no per-task reviewer.
After the user approves, hand off to `implement`, which builds inline and ends
with one final whole-branch review.
