---
name: parallel-task-executor
description: Use when a session's TASKS.md is ready to be executed. Runs inside the main conversation (not an isolated agent). Reads `.planning/{session_id}/TASKS.md`, builds a DAG from `Depends:` fields, and dispatches each task as an isolated subagent via the Task tool — parallel within a layer, sequential across layers. Emits a one-line outcome when every task has terminated.
---

# Parallel Task Executor

## Purpose

Run every task in `TASKS.md` to completion — or to a clean halt the evaluator can reason about. This is the Phase 5 skill per `harness-flow.yaml`. It is the **only** skill that dispatches Claude Code's `Task` tool in a loop.

Unlike the writer skills (`prd-writer`, `trd-writer`, `task-writer`), the executor lives in the **main conversation context**. It needs to update `ROADMAP.md` and coordinate multiple parallel subagent returns — both require the main thread. Heavy work happens inside the dispatched subagents, whose contexts are isolated and disposable.

## Why this exists

The executor is the choke point where the plan meets actual code. Three design pressures shape it:

1. **DAG-shaped parallelism is cheap and safe, free parallelism is not.** Tasks declare `Depends:` and `Files:` in TASKS.md. Tasks with no dependencies and no overlapping files can run concurrently; tasks that share files must serialize even if the DAG would allow parallel. Git conflicts on a shared file are not a bug the subagent can fix — they are a scheduling mistake.
2. **One fresh subagent per task, not one subagent for many tasks.** Each task is dispatched with a focused prompt containing only what that task needs — the task text, its `Acceptance:` bullets, its `Files:` list, and a TDD directive. Subagents do not read TASKS.md or PRD/TRD. This is the task-writer's contract: the task is self-contained.
3. **Failures are classified, not just retried.** A subagent can return DONE, BLOCKED, or FAILED. DONE means its Acceptance is checkable. BLOCKED means the task itself is wrong (missing information, contradictory Acceptance) — retry will not help. FAILED means the attempt was wrong but the task might still be doable — retry with a stronger model or narrower scope. Conflating these turns the retry loop into a loop of the same error.

The Phase 5→6 handoff is that `TASKS.md` ends with every task marked `[x]` in a `[Result]` section and each task's branch commits are pushed to the session's worktree, or the executor halts with a structured error the evaluator (Phase 6) would otherwise blame on rules/tests.

## Input payload

You are **not** an isolated agent — you inherit the main conversation's context. But read this skill as if you had no memory; the authoritative input is the session folder.

- `session_id`: `"YYYY-MM-DD-{slug}"` — passed by the main thread.
- `.planning/{session_id}/TASKS.md`: the source of truth. If missing, halt.
- `.planning/{session_id}/ROADMAP.md`: for marking the `executor` phase when all tasks complete.

STATE.md is not consulted. There is no session-level retry loop; task-local retries live entirely in TASKS.md `[Result]` blocks.

If the main thread passes extra hints (e.g., "retry only task-3"), honor them. Default behavior is "run every task that isn't already marked `[Result: done]` in TASKS.md."

## Output

Emit a single JSON object when every task has terminated. Task-level outcomes live in TASKS.md `[Result]` blocks — the evaluator re-reads them. The JSON carries only the top-level outcome.

**done** — every task reached DONE:

```json
{ "outcome": "done", "session_id": "2026-04-19-..." }
```

**blocked** — one or more tasks are wrong in their description, **including** TASKS.md-level validation failures (cycles, typos in `Depends:`, empty Acceptance, empty or missing TASKS.md). Re-dispatching will not help; the task text needs upstream revision.

```json
{ "outcome": "blocked", "session_id": "2026-04-19-..." }
```

`harness-flow.yaml` advances `executor → evaluator` unconditionally — the evaluator skill detects `[Result: blocked]` blocks and escalates.

**failed** — one or more tasks exhausted the 3-attempt retry cap.

```json
{ "outcome": "failed", "session_id": "2026-04-19-..." }
```

**error** — infrastructure or tool-layer failure (Task tool errored, filesystem denied, TDD reference missing, TASKS.md not found):

```json
{ "outcome": "error", "session_id": "2026-04-19-...", "reason": "TDD reference file missing at <path>" }
```

Never emit prose alongside the JSON. If partial progress was made, leave TASKS.md `[Result]` blocks reflecting reality — the main thread may re-dispatch the executor and it will resume per Step 1's resume rules.

## Procedure

### Step 1 — Load and validate TASKS.md

Read `TASKS.md` in full. If the file is missing, halt: `{"outcome": "error", "session_id": "...", "reason": "TASKS.md not found at .planning/{session_id}/TASKS.md"}` (task-writer did not emit its artifact).

Extract every `task-N` entry with its `Depends:`, `Files:`, and `Acceptance:` blocks. Also note the `## Goal` and `## Architecture` sections — these do not go into subagent prompts (too broad), but they help you reason about whether a subagent's return is plausible.

**Environment checks** (infrastructure — failures here emit `error`):

- Verify `{executor-skill-path}/references/test-driven-development.md` exists. If not, halt: `{"outcome": "error", "session_id": "...", "reason": "TDD reference file missing at <path>"}`. Subagents cannot complete tasks without it.

**TASKS.md shape validation** (task-writer's artifact is wrong — failures here emit `blocked`; task-level reasons are written into TASKS.md `[Result]` blocks, not the final JSON):

- **Empty TASKS.md** (zero `task-N` entries): emit `error` with `reason: "TASKS.md contains no tasks"` — no tasks to mark.
- **Cycle in `Depends:` graph**: mark all cycle members as `[Result: blocked, reason: "cycle: task-A → task-B → task-A"]`, then proceed (nothing dispatches).
- **`Depends:` references nonexistent task ID**: mark the dangling task as `[Result: blocked, reason: "task-N depends on nonexistent task-M"]`.
- **Task with empty `Acceptance:`**: do **not** halt the whole run. Pre-mark that task's `[Result]` block as `Status: blocked, Reason: empty Acceptance` without dispatching, then proceed with the rest. The task contributes to the final `blocked` outcome; its dependents skip via Step 3 propagation.

**Resume from a prior run** — if TASKS.md already has `[Result]` blocks from a previous executor invocation:

- `Status: done` → task is complete, do not re-dispatch. The DAG still includes it as a satisfied dependency node.
- `Status: blocked` or `Status: skipped` → treat as terminal; do not re-dispatch. If the main thread wants a fresh run, it deletes the `[Result]` blocks first.
- `Status: failed, Attempt: N` → continue the attempt counter. Next dispatch is `Attempt: N+1`. If `N ≥ 3`, treat as terminal (do not re-dispatch). The 3-attempt cap spans the entire session, not each invocation — otherwise conversation restarts would unbound the retry loop.

The main thread may pass an explicit hint (e.g., "retry only task-3, reset attempt counter") — honor it literally. Absent a hint, use the rules above.

### Step 2 — Build the execution plan: DAG → layers → serialization by file overlap

Topologically sort the task graph. The result is a sequence of **layers**, where every task in layer N has all its dependencies satisfied by layers <N.

Within each layer, check for **file overlap**: if two tasks in the same layer share any path in their `Files:` blocks, serialize them — pick one to dispatch first (task ID ascending), move the other to a later dispatch group.

**How to extract paths from `Files:` entries**: take only the string inside backticks. Strip any `:N-M` line-range suffix before comparing (so `src/foo.ts:10-20` and `src/foo.ts:50-80` both resolve to `src/foo.ts` and are considered an overlap — two subagents cannot both edit the same file, even on disjoint line ranges, because neither sees the other's changes). Ignore parenthetical annotations like `(also rename to ...)`.

**Then apply the concurrency cap**: if any dispatch group still contains more than 5 tasks after file-overlap serialization, split it into sub-groups of ≤5 by task ID ascending. Sub-groups execute sequentially. This keeps the "dispatch group" concept single-meaning: a dispatch group is always a set of ≤5 tasks with no file overlap that run in one assistant turn.

The result is an ordered list of **dispatch groups** — groups execute one after another; within a group, all Task calls go in the same assistant turn.

Example: TASKS.md has `task-1 (Depends: none, Files: auth/login.ts)`, `task-2 (Depends: task-1, Files: auth/totp.ts)`, `task-3 (Depends: none, Files: pages/landing.tsx)`. Topological layers are `[task-1, task-3]` and `[task-2]`. No file overlap in layer 1, layer size ≤ 5. Dispatch groups: `{task-1, task-3}` then `{task-2}`.

**Why not let subagents handle conflicts?** Git conflicts on a shared file are not a bug a subagent can fix — two subagents editing `auth/login.ts` in parallel both think they own it. Serializing at the dispatch layer is cheap and makes the problem impossible.

### Step 3 — Dispatch each group via the Task tool

For each dispatch group, call the Task tool once per task in the group. All Task calls in a group happen **in the same assistant turn** — this is how Claude Code actually runs them in parallel. (If you dispatch them across separate turns, they serialize.)

Each Task invocation gets a prompt built from the **subagent prompt template** (see next section). Use `subagent_type: "general-purpose"` — no specialized agent exists for task execution (writers are the specialists; executors are open-ended).

After dispatching a group, **wait for all returns before reading any**. The Task tool aggregates parallel returns. Read each return, classify it (DONE/BLOCKED/FAILED — see Step 5), and write the `[Result]` block to TASKS.md before moving to the next group.

If any task in the group returns BLOCKED or FAILED, **do not dispatch dependent tasks in later groups** — they had a precondition that is now invalid. Mark dependents as `[Result: skipped, reason: depends on task-N which {blocked|failed}]` and finalize.

### Step 4 — Subagent prompt template

Each dispatched subagent gets this structure. Fields marked `{…}` are filled from TASKS.md.

```
You are executing {task-id} from a multi-task plan. You have an isolated context —
you cannot see other tasks, the PRD, or the TRD. Everything you need is below.

## Task
{task-id} — {task title, verbatim}

## Files you will touch
{task Files: block verbatim, Create/Modify/Test entries preserved}

## What success looks like
{task Acceptance: block verbatim, each bullet on its own line}

## Notes
{task Notes: block if present; otherwise omit this section}

## How to work

Before writing any production code, read
`{executor-skill-path}/references/test-driven-development.md` in full and follow
it exactly. The Iron Law, Red-Green-Refactor cycle, Red Flags, and Verification
Checklist in that file are non-negotiable for your work on this task.

That discipline applies to every testable Acceptance bullet below. If an
Acceptance bullet is not testable (e.g., "file is renamed"), verify it with a
deterministic command (grep, ls, etc.) and include the command + output in your
`evidence` list.

## What to return

Return a single block at the end of your response:

[Result]
status: done | blocked | failed
summary: (1-2 sentences — what you did, or why you couldn't)
evidence:
  - (list of Acceptance bullets you satisfied, each paired with how you verified it —
     test name, grep output, file path + line, etc.)
blockers: (only if status=blocked — specific claim about what in the task is wrong)
```

**Why TDD is loaded here, not as a peer phase**: TDD is the implementation discipline *inside* each dispatched subagent's context. The executor doesn't run tests itself — each subagent does, on its own slice. The executor's job is coordination, not verification; verification lives in the Acceptance bullets and later in the evaluator.

**Path substitution**: this executor skill itself, before each Task tool dispatch, replaces `{executor-skill-path}` in the prompt above with the absolute path of the directory containing its own `SKILL.md` file (e.g., `~/.claude/skills/parallel-task-executor` if installed globally, or the repo's `skills/parallel-task-executor` path if invoked from within the repo). Resolve the path at dispatch time — do not hardcode. This is the only templated path in the prompt.

**Why the prompt is self-contained**: the subagent cannot re-read PRD/TRD or ask you questions. If information is missing, it returns BLOCKED. This is what makes task-writer's "PRD/TRD vocabulary verbatim, no placeholders" rule load-bearing — the task text must be sufficient on its own.

### Step 5 — Classify each subagent return

Parse the `[Result]` block from each return. Four terminal states are possible:

- **done**: `status: done` and every Acceptance bullet appears in `evidence` with a verification method. Mark `[Result: done]` with the summary.
- **blocked**: `status: blocked` OR `status: done` but evidence is missing/vague OR the subagent asked a clarifying question OR **the `[Result]` block is missing / malformed / contains an unrecognized status value**. The task description (or the subagent's protocol adherence) is wrong — retry will not help. Mark `[Result: blocked, reason: <blockers text or "malformed Result block">]` and do not re-dispatch automatically.
- **failed**: `status: failed` OR a per-task Task-tool error (subagent started but could not complete cleanly — timeout, context-limit exceeded, subagent crash mid-run). Mark `[Result: failed, attempt: N, reason: …]` and apply the retry policy below. **Distinct from infrastructure errors** — if the Task tool itself cannot dispatch (invalid `subagent_type`, filesystem denied, framework-level error wrapper in place of a subagent return), halt the entire run with `{"outcome": "error", "session_id": "...", "reason": "..."}` and do not mark individual tasks.
- **skipped**: assigned (not returned) when a task's dependency terminated as `blocked` or `failed`. Set in Step 3 without dispatching. Mark `[Result: skipped, reason: depends on task-N which {blocked|failed}]`. No retry, no evidence field.

**Retry policy for FAILED** (not BLOCKED, not skipped):

- 1st failure → retry once with the same prompt and `subagent_type: "general-purpose"`. Record `attempt: 2`.
- 2nd failure → retry once more with a note prepended to the prompt: `"Previous attempt failed. Previous summary: <text>. Previous blockers: <text>. Narrow your scope and focus on the first Acceptance bullet only."` Record `attempt: 3`.
- 3rd failure → stop. Mark `[Result: failed, attempt: 3, reason: repeated failure after narrow-scope retry]` and treat as terminal. Do not keep looping.

The three-attempt cap is task-local and the **only** retry mechanism in the system — there is no session-level retry loop. The executor tracks attempts per task in TASKS.md `[Result]` blocks; no global counter exists.

**Do not inflate retries into a rewrite loop.** If a task fails 3 times, that is a signal for the main thread (via `failed` outcome → evaluator → escalate) to re-engage task-writer or the user — not for the executor to keep guessing.

### Step 6 — Update TASKS.md `[Result]` blocks

After each group, append or replace a `[Result]` block under each task. The TASKS.md file is the executor's durable state — if this conversation dies and resumes, the next executor invocation reads these blocks and applies the resume rules from Step 1.

Canonical format (using `done` as the reference):

```markdown
[Result]
Status: done
Attempt: 1
Summary: Added POST /auth/totp/verify handler; all 4 Acceptance bullets verified.
Evidence:
- rate-limit bullet → tests/auth/totp.test.ts::"three consecutive failures yield 429"
- intermediate-token consumption → grep "jti.*consumed" src/auth/totp.ts:142
Updated: 2026-04-19T14:23:00Z
```

Other statuses use the same block with these deltas:

- **failed**: `Status: failed`, bump `Attempt: N` each retry, replace `Evidence` with a single `Reason:` line. `Summary:` is the subagent's summary or `"Task tool errored: <type>"`.
- **blocked**: `Status: blocked`, drop `Attempt` and `Summary`, replace `Evidence` with `Reason:` (one-line cause).
- **skipped** (set in Step 3 without dispatching): `Status: skipped`, drop `Attempt` and `Summary`, `Reason: depends on task-N which {blocked|failed}`.

Always include `Updated:` (ISO-8601). Do **not** modify any other section of TASKS.md (Goal, Architecture, task bodies, Self-Review) — only append or replace the `[Result]` block per task.

### Step 7 — Finalize ROADMAP.md and emit

Once every task has a terminal `[Result]` block (`done` / `blocked` / `failed` / `skipped`), determine the final outcome by priority:

1. **Any `failed` task present** → emit `failed`. Leave `- [ ] executor` unchecked in ROADMAP.md.
2. **Otherwise, any `blocked` task present** → emit `blocked`. Leave `- [ ] executor` unchecked.
3. **Otherwise, all remaining tasks are `done` or `skipped`** (the skipped-only case should not occur — skipped always traces back to a blocked/failed root; if it does, treat as a logic error and emit `failed`) → set `- [x] executor` in ROADMAP.md, emit `done`.

`skipped` is never itself a top-level outcome — it always bubbles up under the root cause's outcome. Per-task IDs and reasons stay in TASKS.md `[Result]` blocks; the evaluator re-reads them.

Do **not** update `STATE.md` — the main thread owns STATE.md writes. The executor's task-local attempts are recorded in TASKS.md `[Result]` blocks only.

## Parallelism rules (concise)

- **Max concurrent subagents in a group**: 5 — a politeness cap. Claude Code's Task tool does not enforce it, but overloading it makes returns harder to reason about and burns tokens.
- **Dependency edges are hard.** Never dispatch task-N before all its `Depends:` targets have `Status: done`. Blocked/failed dependencies → `skipped` (Step 3).
- **File overlap is hard.** Two tasks in the same group never share a `Files:` path — git-conflict prevention (Step 2 enforces this).
- **Approval nodes are not supported.** Approval semantics live in Gate 1 / Gate 2 around the executor, not inside it. A task requiring mid-execution user input → subagent returns BLOCKED.

## Anti-patterns

- **Do not re-dispatch a BLOCKED task.** Blocked means the task itself is wrong. Retry produces the same return. Escalate via the `blocked` outcome.
- **Do not read other tasks' Acceptance when reviewing a return.** Each task's verification is self-contained via its own Acceptance bullets. Cross-task coherence is the evaluator's job (Phase 6).
- **Do not silently skip a file overlap.** If you detect overlap, serialize explicitly — do not hope two subagents won't actually touch the shared lines.
- **Do not embed PRD/TRD content in the subagent prompt.** The task text already quotes PRD/TRD verbatim (task-writer's contract). Re-including the source documents breaks context-isolation and invites the subagent to "reinterpret" the task against the source — exactly the interpretation drift task-writer was written to prevent.
- **Do not let the subagent define its own Acceptance.** If the return says `status: done` but the evidence doesn't map to the task's Acceptance bullets, that is BLOCKED — the subagent solved a different problem.
- **Do not dispatch tasks across turns when they could be parallel.** All Task calls for one group go in **one assistant turn**. Spreading them across turns serializes them and loses the parallelism gain.

## Edge cases

- **Single task with no dependencies**: degenerate case. Build a one-layer DAG, dispatch one subagent, emit done/blocked/failed. Do not skip the `[Result]` block — the evaluator still reads it.
- **Task whose `Files:` block has a path that doesn't exist and is not marked `Create:`**: not your problem to validate at dispatch time (task-writer/evaluator catch this). Dispatch anyway; subagent will return BLOCKED if the path is genuinely wrong.
- **User interrupts mid-execution** (abort): do not try to clean up. Leave `[Result]` blocks as they are; the next executor invocation resumes per Step 1. Partial file writes by aborted subagents are left in place — the retry subagent will see them and overwrite per TDD.
- **Request in non-English language in TASKS.md**: subagent prompt content (task title, Notes, Acceptance prose) stays in the source language. The prompt template frame (`## Task`, `## Files`, etc.) stays English. Consistent with task-writer's output rule.

## Boundaries

- Reads `.planning/{session_id}/TASKS.md` and `ROADMAP.md`. Writes `[Result]` blocks to TASKS.md and `[x]` to ROADMAP.md. **Does not touch STATE.md** — the main thread owns STATE.md writes (`escalated`, `last_eval`, etc.).
- Does not invoke any other skill. Does not dispatch `evaluator`, `doc-updater`, or any writer. The main thread follows `harness-flow.yaml`.
- Dispatches only `general-purpose` subagents via the Task tool. Does not create new agent types.
- Does not read or modify PRD.md or TRD.md. The task text is sufficient by contract.
- Does not modify source code directly. All code changes happen inside subagents.
- Does not resolve git conflicts. Serialization prevents them; if one occurs anyway, the affected subagent returns FAILED and normal retry applies.
