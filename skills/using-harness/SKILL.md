---
name: using-harness
description: Harness bootstrap — you interpret the harness DAG file and dispatch the next node after every skill completes. The DAG file is the single source of truth; this skill teaches you how to read it. Loaded at session start via hook, not invoked manually.
---

# Using Harness

**Harness DAG file**: `${CLAUDE_PLUGIN_ROOT}/docs/harness/harness-flow.yaml`. The SessionStart hook injects the resolved path into context — use whichever absolute path the hook surfaced. **You = interpreter.** No runtime engine. Read the YAML, dispatch the next node yourself.

> The plugin root is wherever Claude Code mounted this plugin (e.g. `~/.claude/plugins/marketplaces/<mp>/plugins/harness-flow/`). Never read `docs/harness/harness-flow.yaml` as a relative path — the user's project CWD won't have it.

## Core loop

After any skill completes (or a user message arrives):

1. **Re-read the harness DAG file** at `${CLAUDE_PLUGIN_ROOT}/docs/harness/harness-flow.yaml` (~60 lines, cheap).
2. **Identify current position** — which node just finished? What was its output JSON?
3. **Find candidate next nodes** — any node whose `depends_on` includes the node you just ran.
4. **Substitute & evaluate `when:`** — replace `$<id>.output.<field>` with actual values from recent outputs, evaluate the boolean (`==`, `||`, `&&`).
5. **Apply `trigger_rule`** — default requires every `depends_on` to have completed; `one_success` fires as soon as one dep produced a matching output.
6. **Invoke the first matching node.** Skills are registered by name when the plugin loads — prefer the `Skill` tool with the bare command name (e.g. `Skill("router")`). If the registry lookup fails, fall back to `Read` on `${CLAUDE_PLUGIN_ROOT}/skills/<command>/SKILL.md`.
7. **No match → flow terminates.** Report final outcome to the user.

## Downstream self-lookup (the `next` field)

Every harness skill performs steps 1–5 of the Core loop **for its own outgoing edges** before emitting its final JSON, and includes the resolved next-node id as `next`:

- One matching candidate → `"next": "<node-id>"`.
- No matching candidate → `"next": null` (this skill is a terminal in the current branch).
- Multiple matching candidates → emit the first one listed in `harness-flow.yaml` (same tiebreak as the Core loop).

Why every skill does this even though main thread re-derives independently:

- **Self-validation.** A skill that cannot find any matching downstream edge for its own outcome is emitting a value the flow doesn't expect — that is almost always a bug in the skill, and surfacing it as `"next": null` makes it visible.
- **Single source of truth.** Hard-coded "next-skill" hints in SKILL.md drift from `harness-flow.yaml` over time. Re-evaluating the YAML each run keeps the two in sync.
- **Cross-check with main thread.** Main thread re-derives `next` independently. Mismatch = bug (in the skill, in the flow file, or in how the payload was threaded). Log and prefer the main-thread result.

Subagents (`context: fresh` skills) cannot directly invoke the next node — they emit `next` as a hint. Main thread is still the dispatcher.

### Threading upstream outcomes through payloads

A downstream `when:` expression may reference an upstream node's output (e.g., `task-writer`'s `when:` reads `$brainstorming.output.outcome`). For a dispatched skill to evaluate its own outgoing edges, it needs those upstream values in its payload.

Convention: when dispatching a node, include in the payload every upstream `outcome` referenced by that node's downstream edges in `harness-flow.yaml`. Today this means:

- `prd-writer` payload includes `brainstorming_outcome` (its downstream `trd-writer` / `task-writer` `when:` both reference `$brainstorming.output.outcome`).
- `trd-writer` payload includes `brainstorming_outcome` (its downstream `task-writer` `when:` references it).
- All other skills' downstream edges either have no `when:` or reference only the immediate upstream's outcome (which the skill already has as its own `outcome`), so no extra payload field is needed.

If you add a new edge whose `when:` references an upstream outcome the dispatched skill doesn't currently receive, update both the flow file and the payload schema in the skill's SKILL.md.

## Starting the flow

On the first user message of a session:

- **Casual chat / question** (no planning or building intent) → respond normally. Do not engage the harness.
- **Feature / bug / project / "help me build X" request** → invoke `router` (entry node — no `depends_on` in `harness-flow.yaml`).

At flow start, generate `session_id = "YYYY-MM-DD-{slug}"` where slug is a 2-4 word kebab-case summary of the request. Thread this through every subsequent skill invocation.

## Output contract

Every harness skill emits a single JSON object as its final message:

- Success: `{"outcome": "<value>", "session_id": "<id>", "next": "<next-node-id>" | null, ...}`
- Error: `{"outcome": "error", "session_id": "<id>", "reason": "<one line>", "next": null}`

`next` is the skill's own resolved downstream lookup (see "Downstream self-lookup"). Use the `outcome` (not `next`) to re-derive your own dispatch decision; treat the skill's `next` as a cross-check signal — log if it disagrees with your derivation. Never invent output fields beyond these — read what the skill actually emitted.

## Context isolation

Nodes marked `context: fresh` should run in an isolated subagent when possible:

- If `Task` / `Agent` tool is available → dispatch via subagent (clean context, heavy skill doesn't pollute main thread).
- Otherwise → run inline, knowing context bleed is a cost.

## Session artifacts

All session state lives under `.planning/{session_id}/`:

- `STATE.md` — main-thread progress ledger
- `PRD.md` / `TRD.md` / `TASKS.md` — writer outputs
- `findings.md` — doc-updater audit log

Skills own their own artifacts; `STATE.md` is main-thread responsibility.

## Rules

- **Strict `==`** in `when:` expressions (exact string match, not fuzzy).
- **Multiple candidates match** → pick the first listed in `harness-flow.yaml`.
- **Missing `outcome` field** in a skill's output → treat as flow termination, report to user.
- **Don't recurse endlessly** — if you've invoked the same node twice in a session without making progress, stop and ask the user.

## Files

- Flow: `${CLAUDE_PLUGIN_ROOT}/docs/harness/harness-flow.yaml` (plugin root, **not** user CWD)
- Skills: registered by name on plugin load — `Skill("<command>")`. Fallback: `${CLAUDE_PLUGIN_ROOT}/skills/<command>/SKILL.md` via `Read`.
- Artifacts: `.planning/{session_id}/` (relative — written into the **user's project**, not the plugin)
