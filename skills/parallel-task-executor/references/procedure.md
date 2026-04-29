# Procedure

The full Steps 1-7 body for `parallel-task-executor`. Each step is anchored so SKILL.md can deep-link.

## Step 1 — Load and validate TASKS.md

Read `TASKS.md` in full. If the file is missing, halt with the terminal message `## Status: error` + `## Reason: TASKS.md not found at .planning/{session_id}/TASKS.md` (task-writer did not emit its artifact).

Extract every `task-N` entry with its `Depends:`, `Files:`, and `Acceptance:` blocks. Also note the `## Goal` and `## Architecture` sections — these do not go into subagent prompts (too broad), but they help you reason about whether a subagent's return is plausible.

**Environment checks** (infrastructure — failures here emit `error`):

- Verify `{executor-skill-path}/references/test-driven-development.md` exists. If not, halt with `## Status: error` + `## Reason: TDD reference file missing at <path>`. Subagents cannot complete tasks without it.

**TASKS.md shape validation** (task-writer's artifact is wrong — failures here emit `## Status: blocked`; task-level reasons are written into TASKS.md `[Result]` blocks, not the final terminal message):

- **Empty TASKS.md** (zero `task-N` entries): emit `error` with `reason: "TASKS.md contains no tasks"` — no tasks to mark.
- **Cycle in `Depends:` graph**: mark all cycle members as `[Result: blocked, reason: "cycle: task-A → task-B → task-A"]`, then proceed (nothing dispatches).
- **`Depends:` references nonexistent task ID**: mark the dangling task as `[Result: blocked, reason: "task-N depends on nonexistent task-M"]`.
- **Task with empty `Acceptance:`**: do **not** halt the whole run. Pre-mark that task's `[Result]` block as `Status: blocked, Reason: empty Acceptance` without dispatching, then proceed with the rest. The task contributes to the final `blocked` outcome; its dependents skip via Step 3 propagation.

**Resume from a prior run** — if TASKS.md already has `[Result]` blocks from a previous executor invocation:

- `Status: done` → task is complete, do not re-dispatch. The DAG still includes it as a satisfied dependency node.
- `Status: blocked` or `Status: skipped` → treat as terminal; do not re-dispatch. If the main thread wants a fresh run, it deletes the `[Result]` blocks first.
- `Status: failed, Attempt: N` → continue the attempt counter. Next dispatch is `Attempt: N+1`. If `N ≥ 3`, treat as terminal (do not re-dispatch). The 3-attempt cap spans the entire session, not each invocation — otherwise conversation restarts would unbound the retry loop.

The main thread may pass an explicit hint (e.g., "retry only task-3, reset attempt counter") — honor it literally. Absent a hint, use the rules above.

## Step 2 — Build the execution plan: DAG → layers → serialization by file overlap

Topologically sort the task graph. The result is a sequence of **layers**, where every task in layer N has all its dependencies satisfied by layers <N.

Within each layer, check for **file overlap**: if two tasks in the same layer share any path in their `Files:` blocks, serialize them — pick one to dispatch first (task ID ascending), move the other to a later dispatch group.

**How to extract paths from `Files:` entries**: take only the string inside backticks. Strip any `:N-M` line-range suffix before comparing (so `src/foo.ts:10-20` and `src/foo.ts:50-80` both resolve to `src/foo.ts` and are considered an overlap — two subagents cannot both edit the same file, even on disjoint line ranges, because neither sees the other's changes). Ignore parenthetical annotations like `(also rename to ...)`.

**Then apply the concurrency cap**: if any dispatch group still contains more than 5 tasks after file-overlap serialization, split it into sub-groups of ≤5 by task ID ascending. Sub-groups execute sequentially. This keeps the "dispatch group" concept single-meaning: a dispatch group is always a set of ≤5 tasks with no file overlap that run in one assistant turn. Why 5: a higher cap risks the parent assistant turn aging out before all parallel returns aggregate, and gives diminishing parallelism returns once the typical task-DAG width is exceeded.

The result is an ordered list of **dispatch groups** — groups execute one after another; within a group, all Task calls go in the same assistant turn.

Example: TASKS.md has `task-1 (Depends: none, Files: auth/login.ts)`, `task-2 (Depends: task-1, Files: auth/totp.ts)`, `task-3 (Depends: none, Files: pages/landing.tsx)`. Topological layers are `[task-1, task-3]` and `[task-2]`. No file overlap in layer 1, layer size ≤ 5. Dispatch groups: `{task-1, task-3}` then `{task-2}`.

**Why not let subagents handle conflicts?** Git conflicts on a shared file are not a bug a subagent can fix — two subagents editing `auth/login.ts` in parallel both think they own it. Serializing at the dispatch layer is cheap and makes the problem impossible.

## Step 3 — Dispatch each group via the Task tool

For each dispatch group, call the Task tool once per task in the group. All Task calls in a group happen **in the same assistant turn** — this is how Claude Code actually runs them in parallel. (If you dispatch them across separate turns, they serialize.)

Each Task invocation gets a prompt built from the **subagent prompt template** (see `subagent-prompt.md`). Use `subagent_type: "general-purpose"` — no specialized agent exists for task execution (writers are the specialists; executors are open-ended).

After dispatching a group, **wait for all returns before reading any**. The Task tool aggregates parallel returns. Read each return, classify it (DONE/BLOCKED/FAILED — see Step 5), and write the `[Result]` block to TASKS.md before moving to the next group.

If any task in the group returns BLOCKED or FAILED, **do not dispatch dependent tasks in later groups** — they had a precondition that is now invalid. Mark dependents as `[Result: skipped, reason: depends on task-N which {blocked|failed}]` and finalize.

## Step 4 — Subagent prompt template

See `subagent-prompt.md` for the full template.

**Why TDD is loaded here, not as a peer phase**: TDD is the implementation discipline *inside* each dispatched subagent's context. The executor doesn't run tests itself — each subagent does, on its own slice. The executor's job is coordination, not verification; verification lives in the Acceptance bullets and later in the evaluator.

**Path substitution**: this executor skill itself, before each Task tool dispatch, replaces `{executor-skill-path}` in the prompt with the absolute path of the directory containing its own `SKILL.md` file (e.g., `~/.claude/skills/parallel-task-executor` if installed globally, or the repo's `skills/parallel-task-executor` path if invoked from within the repo). Resolve the path at dispatch time — do not hardcode. This is the only templated path in the prompt.

**Why the prompt is self-contained**: the subagent cannot re-read PRD/TRD or ask you questions. If information is missing, it returns BLOCKED. This is what makes task-writer's "PRD/TRD vocabulary verbatim, no placeholders" rule load-bearing — the task text must be sufficient on its own.

## Step 5 — Classify each subagent return

Parse the `[Result]` block from each return. Four terminal states are possible:

- **done**: `status: done` and every Acceptance bullet appears in `evidence` with a verification method. Mark `[Result: done]` with the summary.
- **blocked**: `status: blocked` OR `status: done` but evidence is missing/vague OR the subagent asked a clarifying question OR **the `[Result]` block is missing / malformed / contains an unrecognized status value**. The task description (or the subagent's protocol adherence) is wrong — retry will not help. Mark `[Result: blocked, reason: <blockers text or "malformed Result block">]` and do not re-dispatch automatically.
- **failed**: `status: failed` OR a per-task Task-tool error (subagent started but could not complete cleanly — timeout, context-limit exceeded, subagent crash mid-run). Mark `[Result: failed, attempt: N, reason: …]` and apply the retry policy below. **Distinct from infrastructure errors** — if the Task tool itself cannot dispatch (invalid `subagent_type`, filesystem denied, framework-level error wrapper in place of a subagent return), halt the entire run with `## Status: error` + `## Reason: ...` and do not mark individual tasks.
- **skipped**: assigned (not returned) when a task's dependency terminated as `blocked` or `failed`. Set in Step 3 without dispatching. Mark `[Result: skipped, reason: depends on task-N which {blocked|failed}]`. No retry, no evidence field.

**Retry policy for FAILED** (not BLOCKED, not skipped):

- 1st failure → retry once with the same prompt and `subagent_type: "general-purpose"`. Record `attempt: 2`.
- 2nd failure → retry once more with a note prepended to the prompt: `"Previous attempt failed. Previous summary: <text>. Previous blockers: <text>. Narrow your scope and focus on the first Acceptance bullet only."` Record `attempt: 3`.
- 3rd failure → stop. Mark `[Result: failed, attempt: 3, reason: repeated failure after narrow-scope retry]` and treat as terminal. Do not keep looping.

The three-attempt cap is task-local and the **only** retry mechanism in the system — there is no session-level retry loop. The executor tracks attempts per task in TASKS.md `[Result]` blocks; no global counter exists.

**Do not inflate retries into a rewrite loop.** If a task fails 3 times, that is a signal for the main thread (via `failed` outcome → evaluator → escalate) to re-engage task-writer or the user — not for the executor to keep guessing.

## Step 6 — Update TASKS.md `[Result]` blocks

After each group, append or replace a `[Result]` block under each task. The TASKS.md file is the executor's durable state — if this conversation dies and resumes, the next executor invocation reads these blocks and applies the resume rules from Step 1.

See `result-block-format.md` for the canonical format and the four `Status:` deltas.

Always include `Updated:` (ISO-8601). Do **not** modify any other section of TASKS.md (Goal, Architecture, task bodies, Self-Review) — only append or replace the `[Result]` block per task.

## Step 7 — Finalize ROADMAP.md, resolve `next`, emit

Once every task has a terminal `[Result]` block (`done` / `blocked` / `failed` / `skipped`), determine the final outcome by priority:

1. **Any `failed` task present** → emit `failed`. Leave `- [ ] executor` unchecked in ROADMAP.md.
2. **Otherwise, any `blocked` task present** → emit `blocked`. Leave `- [ ] executor` unchecked.
3. **Otherwise, all remaining tasks are `done` or `skipped`** (the skipped-only case should not occur — skipped always traces back to a blocked/failed root; if it does, treat as a logic error and emit `failed`) → set `- [x] executor` in ROADMAP.md, emit `done`.

`skipped` is never itself a top-level outcome — it always bubbles up under the root cause's outcome. Per-task IDs and reasons stay in TASKS.md `[Result]` blocks; the evaluator re-reads them.

The main thread dispatches `evaluator` next per SKILL.md's "Required next skill" section — for `done` outcome only. `blocked` / `failed` / `error` terminate the flow.

Do **not** update `STATE.md` — the main thread owns STATE.md writes. The executor's task-local attempts are recorded in TASKS.md `[Result]` blocks only.
