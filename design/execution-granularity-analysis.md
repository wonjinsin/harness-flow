# Execution Granularity Analysis: Why `subagent-driven-development` Is Slow on Small Plans

**Subjects**: get-shit-done (GSD) / gstack / oh-my-claudecode (OMC) / everything-claude-code (ECC) vs. harness-flow (superpowers model)
**Date**: 2026-07-08
**Basis**: Direct source analysis of the sibling checkouts under `../` (parallel Explore agents), plus `design/comparison.md` and `design/reference/*.md`
**Lens**: How each harness chunks implementation work into LLM sessions/subagents, and what makes harness-flow pay the worst dispatch overhead on small tasks.

## TL;DR

harness-flow inherits superpowers' execution model: **one fresh subagent per micro-task (2–5 min), dispatched serially, each followed by a task-reviewer subagent**. A 10-task plan becomes ~20 cold-start sessions run back-to-back. Every session re-pays context load + skill re-injection + file re-reads — overhead that dwarfs the 2–5 min of actual work.

The decisive finding from analyzing four sibling harnesses in source: **not one of them dispatches a fresh serial subagent per micro-task.** That pattern is unique to superpowers/harness-flow, and it is precisely the slow path. Each of the other four avoids it a different way:

- **GSD** — bundles 2–3 tasks into a "plan", runs the whole plan in **one** executor session (internal task loop), and runs independent plans **in parallel by wave**.
- **gstack** — single-context prose; composes sub-workflows by `Read`-ing them into the *current* context (skip-list), never dispatching per step. Subagents reserved for parallel independent review only.
- **OMC** — many agents, but **≤5 concurrent** (semaphore) and **model-tiered** (grunt work → Haiku), so fan-out is cheap and wall-clock is hidden.
- **ECC** — single session, sequential task loop; batches side-effects (format/typecheck) to the Stop boundary; front-loads context once via instinct injection.

---

# Part 1 — The Core Finding

Placing the *unit of LLM dispatch during implementation* side by side:

| Harness | Dispatch unit | Subagents per feature | Parallel | Cold-start mitigation |
|---|---|---|---|---|
| **GSD** | **Plan** (2–3 tasks), executor loops tasks in one session | ~4 plan sessions/phase (flat `query()`, not nested) | **Yes — wave** (`Promise.allSettled`) | Minimal per-step context + cached preset prefix |
| **gstack** | **Single context**, Step 0→N prose | 0 for implementation (review-only fan-out) | Review only | `Read` + skip-list re-injection, no re-prime |
| **OMC** | Coarse concern, 1 agent | Many, but **≤5 concurrent** | **Yes — semaphore** | 3-tier model routing (cheap→Haiku) |
| **ECC** | **Single session**, sequential loop | 0 for implementation | No | Stop-batched hooks + top-6 instinct pre-inject |
| **harness-flow** | **micro-task (2–5 min)** | task × 2 (implementer + reviewer) | **No — serial** | **None** |

harness-flow sits alone in the bottom row: finest granularity, fully serial, per-session cold-start, no mitigation. The overhead is structural, not incidental.

---

# Part 2 — Per-Harness Dispatch Model (source-grounded)

## 2-1. GSD — "bundle coarse, parallelize the independent" (`../get-shit-done`)

The unit of Execute-phase dispatch is a **PLAN**, not a task and not a whole phase.

- **Plans bundle 2–3 tasks, by design.** `agents/gsd-planner.md:396` fixes Tasks/Plan at 2–3 across *every* granularity level (Coarse/Standard/Fine); only the plan *count* per phase varies (1–3 / 3–5 / 5–10). Each plan is sized to a ~40–50% context budget (`gsd-planner.md:394`). The "2–5 min" figure in GSD (`gsd-planner.md:194`) is a *verification* tier, not task size.
- **The executor runs a whole plan in ONE session, looping tasks internally.** `agents/gsd-executor.md:15` ("You execute PLAN.md files atomically"); the `execute_tasks` step (`gsd-executor.md:117-139`) is an in-session `For each task:` loop with a per-task commit (`:131`). No Task/subagent spawn per task. Fresh spawns happen only at explicit `checkpoint:*` boundaries or continuation resumes — exceptional, not the norm.
- **High turn budget makes single-session multi-task viable.** `phase-runner.ts:128-133`: `maxTurns = 50`, `maxBudgetUsd = 5.0`, reused for every step/plan session.
- **Wave parallelism.** `runExecuteStep` groups incomplete plans by pre-computed `wave` (`phase-runner.ts:656-662`) and runs each wave's plans **concurrently** via `Promise.allSettled` (`phase-runner.ts:682-684`). Waves run in order; a `config.parallelization === false` switch falls back to serial. Wave numbers come from the `depends_on` + `files_modified` graph at plan time, and same-wave plans are guaranteed **zero file overlap** (`gsd-planner.md:1020-1038`: "if any file appears in 2+ plans, bump the later plan to the next wave").
- **Cheap cold-starts.** Execute loads only `STATE.md` + `config.json` (`context-engine.ts:43-46`); ROADMAP is narrowed to the current milestone and big docs are truncated (`context-engine.ts:120-151`); every session shares a stable cached preset prefix with only the delta in `append` (`session-runner.ts:81-85`).

**Session count for a typical feature**: one Standard phase ≈ discuss(0–1) + research(1) + plan(1) + plan-check(1) + **execute = ~3–5 plan sessions (parallel across 1–3 waves)** + verify(1) ≈ **8–10 top-level sessions/phase**. A phase whose work is ~10–15 tasks becomes **~4 plan sessions**, not ~15 serial subagent calls.

## 2-2. gstack — "don't dispatch at all" (`../gstack`)

- **Single-context prose.** Every skill is a linear `Step 0→N` list run by the one main agent. `ship/SKILL.md:846`: "Run straight through." There is **no implement/build/code skill** — implementation is inline Edit/Write in the same context that ran the preamble, review, and commit.
- **Sub-workflow composition via `Read`, not dispatch.** `autoplan` chains four review skills by **`Read`-ing each into the current context** plus a section skip-list (skip Preamble/Telemetry/Step 0), `autoplan/SKILL.md:1071-1094`. Stated reasoning (`:907-911`): "same rigor, same sections, same methodology as running each skill manually. The only difference: intermediate AskUserQuestion calls are auto-decided." State carries over for free; zero dispatch cost.
- **Subagents only for parallel independent review.** `review/SKILL.md:1352-1356`: "Launch ALL selected specialists in a single message (multiple Agent tool calls) so they run in parallel. Each subagent has fresh context — no prior review bias." Up to 7 specialists, `subagent_type: "general-purpose"`, foreground (all must finish before merge). Same code reached by ship via `sections/review-army.md`.
- **Adaptive fan-out gating.** `review/SKILL.md:1337-1343`: per-specialist hit rates tracked (`gstack-specialist-stats`); a specialist that found nothing in 10+ dispatches is auto-gated, while `[NEVER_GATE]` ones (security) are force-kept.
- **Continuity without fresh sessions is free** (one transcript); durable state is disk-persisted (`~/.gstack/projects/$SLUG/` timeline/checkpoints/decisions, `ship/SKILL.md:620-702`) to survive compaction.

## 2-3. OMC — "fan out wide, but capped and cheap" (`../oh-my-claudecode`)

- **19 agents, ≤5 concurrent.** `background-tasks.ts:24` (`DEFAULT_MAX_BACKGROUND_TASKS = 5`) and `background-agent/concurrency.ts:48` (`ConcurrencyManager`, per-model-keyed semaphore with a FIFO queue). Dispatch rides Claude Code's native `Task` tool with `run_in_background: true`. System prompt hard-codes "Parallelize Ruthlessly" (`definitions.ts:342`).
- **3-tier model routing.** `definitions.ts:264` precedence `override ?? inherit ?? config ?? agent-default`; `types.ts:151-165` maps `exploration → haiku`, `utility → haiku`, `specialist → sonnet`, `advisor → opus`, `orchestration → sonnet`. So high-fan-out grunt work (codebase `explore`, doc `writer`) is pinned to **Haiku**; implementation → Sonnet; only planner/architect/code-reviewer/critic pay **Opus**.
- **Wave decomposition (`ultrawork`).** `skills/ultrawork/SKILL.md:48-59`: classify tasks by independence → build dependency-aware waves → "Fire independent tasks simultaneously"; long builds/tests go `run_in_background: true`.
- **Non-blocking persistence.** The Stop hook (`persistent-mode.cjs`) returns `continue:true` (doesn't re-prompt) while a background task or subagent is still `running` (`:424-430, 1069-1072`), with per-mode circuit breakers — persistence *and* non-blocking parallelism from one pattern.
- **Coarse granularity**: a whole concern per agent, 30-min TTL (`manager.ts:26`).

## 2-4. ECC — "batch to boundaries, front-load context" (`../everything-claude-code`)

- **Single-session sequential implementation.** `commands/prp-implement.md:101` ("Process each task from the plan sequentially"); a per-task loop (`:103-118`) writes + validates + logs in the same session. TDD is inline RED→GREEN (`skills/tdd-workflow/SKILL.md`). No per-task subagent. Even the multi-model path (`commands/multi-execute.md:17,26`) shells out to external CLIs with Claude as sole writer — not serial Claude subagents.
- **Side-effects batched to Stop.** `scripts/hooks/post-edit-accumulator.js:6-13` only records edited paths ("eliminating per-edit latency"); format + typecheck run **once** at Stop (`hooks.json:271`). Many Bash checks are consolidated into one dispatcher process (`bash-hook-dispatcher.js:10-18`).
- **Context front-loaded once.** `scripts/hooks/session-start.js:31` injects the top-6 confidence-ranked "instincts" at boot (`summarizeActiveInstincts`, `:406-460`), so steps don't re-derive conventions.

---

# Part 3 — harness-flow's Current Model and Why It's Slow

`subagent-driven-development` executes a plan produced by `writing-plans`, which decomposes work into **bite-sized TDD tasks (2–5 min each, with exact code blocks)**. Execution is: implementer subagent → task-reviewer subagent, **per task, serially**, then one whole-branch review at the end.

The cost breakdown for an N-task plan:

- **2N fresh subagent sessions** (implementer + reviewer per task), run back-to-back.
- Each session pays a **cold-start**: context assembly, skill re-injection, re-reading the same files the previous subagent already read.
- **No parallelism** — wall-clock is the sum of all 2N sessions.
- **No coarsening** — a trivial task costs a full dispatch just like a substantial one.

harness-flow already closed the *model* half of the problem: `hooks/pre-agent-model.js` forces an explicit model tier on every SDD dispatch (cheap→haiku / standard→sonnet / most-capable→opus). That is the OMC tiering lesson, partially applied. Everything else — coarsening, batching, inlining, parallelism — is unaddressed.

---

# Part 4 — Recommendations for harness-flow

Ordered by impact/risk. Each maps to a proven technique in a sibling harness.

### ① Coarsen the dispatch unit: micro-task → task-group (from GSD) — highest impact

Change `writing-plans` to emit **groups of 2–3 related tasks** (GSD's "plan") instead of standalone micro-tasks, and change `subagent-driven-development` to dispatch **one implementer per group**. The implementer runs a TDD loop over the group's tasks internally, committing per task, with a high turn budget. Isolation and review move to the *group* boundary.

- Cuts session count ~3–5× while preserving superpowers' isolation + review value at a coarser grain.
- Source: `gsd-executor.md:117-139` (in-session task loop), `gsd-planner.md:396` (2–3 tasks/plan), `phase-runner.ts:128` (`maxTurns=50`).

### ② Batch verification/review to boundaries (from ECC) — low risk, immediate

- `hooks/post-edit.js` currently runs `make fmt` after *every* edit → defer formatting/checks to a session/group boundary (ECC's Stop-batching).
- The task-reviewer currently runs per micro-task → run it **once per group**; skip it for trivial groups via gstack-style gating.
- Source: `post-edit-accumulator.js:6-13`, `hooks.json:271` (format once at Stop); `review/SKILL.md:1337-1343` (adaptive gating).

### ③ Inline small plans via `Read` + skip-list (from gstack) — the concrete "don't dispatch" mechanism

For small plans (≤ ~5 tasks), `subagent-driven-development` should **not dispatch at all**. Instead `Read` the `test-driven-development` skill into the current context and execute inline, skipping redundant setup sections — exactly gstack's `autoplan` pattern.

- Source: `autoplan/SKILL.md:1071-1094` (Read + skip-list), `:907-911` (stated rationale).

### ④ Finish model tiering (from OMC) — half-done already

`pre-agent-model.js` already forces an explicit tier per dispatch. Complete the loop by making **trivial tasks/groups map to Haiku** by default, escalating only substantial implementation to Sonnet and review to (at least) Sonnet.

- Source: `definitions.ts:302-326`, `types.ts:151-165` (role→tier map).

### ⑤ Parallelize independent groups by wave (from GSD + OMC) — highest wall-clock win, highest risk

Compute a wave graph (no file overlap within a wave) and dispatch same-wave groups concurrently. This is the biggest wall-clock lever but collides with the documented **"worktree/subagent gotcha"** (dispatched subagents may commit on the main checkout, not the feature branch). Requires worktree-per-agent isolation first; keep it **opt-in for large plans only**.

- Source: `phase-runner.ts:682` (`Promise.allSettled` per wave), `gsd-planner.md:1020-1038` (zero-overlap wave assignment); `concurrency.ts:48` (semaphore cap).

**Combined effect of ① + ②**: a 10-task plan drops from ~20 serial sessions to ~5–6, while isolation and review coverage are preserved at the group boundary.

---

# Appendix — Session-count comparison (10–15 task feature)

| Harness | Approx. LLM sessions | Serial/Parallel |
|---|---|---|
| harness-flow (current) | ~20–30 (2 per micro-task) | Serial |
| harness-flow (① + ②) | ~5–6 | Serial (parallel opt-in via ⑤) |
| GSD | ~8–10/phase (3–5 execute run in parallel) | Wave-parallel |
| gstack | 1 (+ parallel review batch) | Single context |
| OMC | many, ≤5 concurrent, tiered | Parallel |
| ECC | 1 | Serial single session |

## See Also

- `design/comparison.md` — 6-harness architecture-level comparison.
- `design/reference/{get-shit-done,gstack,oh-my-claudecode,everything-claude-code}.md` — per-harness deep dives.
- `CLAUDE.md` → "The Skill Chain" and "Worktree/subagent gotcha".
