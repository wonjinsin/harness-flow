---
name: evaluator
description: Use when an executor phase has finished in a harness session and its output must be gated before doc-updater. Runs in an isolated agent context with no main conversation history.
---

# Evaluator

## Purpose

Gate the executor's output before `doc-updater` runs. Two things to verify:

1. **Executor completion shape** — TASKS.md `[Result]` blocks say every task is `done`. If any task is `blocked` (task description wrong) or `failed` (task-local Attempt cap hit), the evaluator escalates directly — no session-level retry exists.
2. **Project rule compliance** (Track 2 per PRD §16) — the diff introduced by this session does not violate `<project>/.claude/rules/*.md`. Track 1 (mechanical, `make check`) already ran as a Stop hook before control reached here; this skill does not re-run commands.

Outcomes route per the 'Required next skill' section below: `pass` → `doc-updater`, `escalate` → END (main thread writes `escalated: true` to STATE.md and surfaces the reason to the user), `error` → END (unrecoverable — payload defect or infra failure). There is no `fail` outcome and no loopback to executor; any non-pass condition terminates the session.

## Execution mode

Subagent (isolated context) — see `../../harness-contracts/execution-modes.md`.

## Input payload

You are loaded by the `evaluator` agent. The payload is your entire input:

- `session_id`: `"YYYY-MM-DD-{slug}"` — determines which session folder to read.
- `tasks_path`: `".planning/{session_id}/TASKS.md"` — where executor's `[Result]` blocks live.
- `rules_dir` *(optional)*: `"<project>/.claude/rules"` — directory to load `*.md` from. If omitted or the directory is absent/empty, Track 2 is skipped; executor-completion check still runs.
- `diff_command` *(optional)*: shell command to produce the diff (defaults to `git diff HEAD`). Used verbatim — the main thread chooses the baseline.

No `state_path` — this skill does not read STATE.md. Session-level retry is not a concept anymore, and the main thread owns STATE.md writes.

If `tasks_path` is missing or unreadable, emit `error` at step-1. Do not guess.

## Output

Emit a single JSON object — your entire final message. No prose alongside.

```json
{ "outcome": "pass|escalate|error", "session_id": "2026-04-19-...", "reason": "<omit on pass>" }
```

- `pass` — every task `[Result: done]` and (if rules exist) zero violations.
- `escalate` — any classifiable non-pass condition (blocked task, Attempt:3 task, rule violation). `reason` quotes the first blocker's `Reason:` line, or `{rule-file}: {path:line} — {claim}` for rule violations.
- `error` — payload defect or unrecoverable infra issue (missing files, unreadable diff, unparseable LLM response, internally inconsistent state).

## Procedure

### Step 1 — Read session state and parse `[Result]` blocks

Read `tasks_path` in full. Extract every task entry and its `[Result]` block.

**`[Result]` block format** — parallel-task-executor writes a multi-line block per task:

```markdown
[Result]
Status: done | failed | blocked | skipped
Attempt: 1
Summary: ...
Evidence:
- ...
Reason: ...           (present when Status != done; replaces Evidence for non-done statuses)
Updated: 2026-04-21T14:23:00Z
```

Parse by finding each `[Result]` line and reading the labeled fields until the next task heading or `[Result]`. Do **not** expect inline shorthand like `[Result: blocked]` — that is user-facing shorthand only; the serialized block is always multi-line.

Count tasks by `Status` value: `done`, `failed`, `blocked`, `skipped`, `(no [Result] block)`.

**Error conditions at step-1** (emit `{"outcome": "error", "session_id": "...", "reason": "..."}`):

- `tasks_path` missing or unreadable → `reason: "TASKS.md not found at <path>"`.
- Any task has no `[Result]` block → `reason: "task-N has no Result block — executor did not finalize"`.
- Any task has **two or more** `[Result]` blocks → `reason: "task-N has duplicate Result blocks — state corruption"`. parallel-task-executor's contract guarantees one per task; duplicates signal corruption.
- `Status:` value is not one of `done|failed|blocked|skipped` → `reason: "task-N has unknown Status value: <value>"`.

### Step 2 — Pre-check executor completion

Before touching rules, decide whether executor's output is gate-able:

- **Any `Status: blocked`** → emit `escalate` with `reason` quoting the first blocked task's ID and `Reason:` line (e.g., `"task-4: Acceptance bullet 2 contradicts bullet 4"`). Do not read rules; do not run Track 2.
- **Any `Status: failed`** → emit `escalate` with `reason` quoting the first failed task's ID and `Reason:` line. Do not run Track 2 — rules on a half-implemented diff are noise.
- **All `Status: done` or `skipped`** → proceed to Step 3. Note: if every non-done task is `skipped`, that means its root cause was a prior `blocked`/`failed` that should have been caught above. Reaching this branch with `skipped` tasks present means the `[Result]` state is internally inconsistent — emit `error` with reason `"skipped tasks present without blocked/failed root"`.
- **All `Status: done`** → proceed to Step 3, normal path.

### Step 3 — Track 2 rule validation

If `rules_dir` is unset or the directory has no `*.md` files, skip this step and go to Step 4 with an implicit pass on rules.

Otherwise:

1. List `*.md` files directly under `rules_dir` (not recursive — rules are flat-per-project by convention). For each, read the file. If the first non-blank line contains `<!-- evaluator: skip -->`, exclude the file from the concatenated rules block.
2. Run the configured diff command (default `git diff HEAD`). If the command errors or returns empty output, emit `{"outcome": "error", "session_id": "...", "reason": "diff command returned <empty|nonzero>: <stderr tail>"}`. An empty diff at evaluator time means the executor claimed `done` without modifying any file — that is a task-writer/executor bug, not a pass.
3. Build the LLM prompt (see `## Rule validation prompt` below). Run it via your own reasoning — you are the LLM.
4. Parse the response:
   - The **first non-blank line** must be exactly `PASS` or exactly `FAIL`. Trailing whitespace is allowed; anything else on that line → unparseable.
   - If `PASS`: any subsequent lines are treated as diagnostics (not violations) and ignored. The response is a pass.
   - If `FAIL`: each subsequent non-blank line must match the violation format `- {rule-file}: {path:line} — {claim}`. Lines that don't match are ignored (diagnostic noise), but **at least one** well-formed violation line is required or the response is unparseable. Keep the first well-formed violation line — it becomes the `reason` in Step 4.
   - Neither `PASS` nor `FAIL + ≥1 valid violation` → emit `{"outcome": "error", "session_id": "...", "reason": "rule-judgment response unparseable: <first 200 chars>"}`.

### Step 4 — Determine outcome and emit

Combine executor pre-check (Step 2) and rule result (Step 3):

| Step 2 result | Step 3 result | Outcome | `reason` |
|---|---|---|---|
| escalate (blocked) | n/a (skipped) | `escalate` | first blocked task's ID + `Reason:` |
| escalate (failed) | n/a (skipped) | `escalate` | first failed task's ID + `Reason:` |
| error (inconsistent skipped) | n/a (skipped) | `error` | `"skipped tasks present without blocked/failed root"` |
| clean | PASS | `pass` | (omit) |
| clean | FAIL | `escalate` | first violation line as `{rule-file}: {path:line} — {claim}` |
| clean | error (diff empty / unparseable) | `error` | step-3 reason |

The main thread owns STATE.md writes for `last_eval`, `last_eval_at`, `last_eval_excerpt`, and (on escalate) `escalated: true`. This skill does **not** modify STATE.md — it emits the signal and lets the main thread persist it.

## Rule validation prompt

Use this structure for Step 3's LLM judgment. Treat it as an inner monologue — you are the model executing both the outer skill and this inner check:

```
You will judge whether the following code diff violates any of the listed rules.
Rules are in natural language; apply judgment, not regex matching. A violation
requires a concrete line in the diff that breaches a concrete rule claim.

Output format (exact):
  Line 1: PASS  OR  FAIL
  If FAIL, one line per violation:
    - {rule-file}: {path:line} — {one-sentence claim, quoting the offending code if short}

No prose outside this format. No commentary. No recommendations.

--- RULES ---
{concatenated contents of every non-opt-out *.md in rules_dir, with a "# <filename>" header before each}

--- DIFF ---
{raw git diff output}
```

**Judgment discipline**:

- Cite a specific diff line. A rule triggers only if a line in the diff matches. "The overall structure feels off" is not a violation.
- Quote the offending code (≤60 chars) in the claim. Reviewers should not need to re-read the diff to understand the call.
- One violation per line breach. If one line breaches three rules, emit three violation lines (each with its own `rule-file`).
- A rule that says "prefer X" without a crisp forbidden case does not trigger — evaluator is not a style mentor. Encode style preferences as "Required"/"Forbidden" in the rule file if they should gate.

## Examples

### Example 1 — Pass, rules present

Payload `{session_id: "2026-04-19-rename-getUser", tasks_path: ".planning/2026-04-19-rename-getUser/TASKS.md", rules_dir: ".claude/rules"}`. TASKS.md contains one task with:

```markdown
[Result]
Status: done
Attempt: 1
Summary: Renamed getUser to fetchUser across 4 files.
Evidence:
- grep output: no remaining `getUser` references
Updated: 2026-04-19T14:10:00Z
```

- Step 1: 1 task, Status: done.
- Step 2: clean.
- Step 3: read `.claude/rules/code-style.md` (1 file, no opt-out). Run `git diff HEAD`. Judge against the rule. All violations absent.

```json
{ "outcome": "pass", "session_id": "2026-04-19-rename-getUser" }
```

### Example 2 — Escalate on rule violation

Same payload. Diff introduces a `console.log(...)` in `src/auth/login.ts:42`.

Step 3 LLM response:
```
FAIL
- code-style.md: src/auth/login.ts:42 — production `console.log(user)` forbidden
```

```json
{
  "outcome": "escalate",
  "session_id": "2026-04-19-rename-getUser",
  "reason": "code-style.md: src/auth/login.ts:42 — production `console.log(user)` forbidden"
}
```

Main thread: writes `escalated: true`, halts session, surfaces `reason` to the user. The user re-reads the diff to see all violations — the skill carries only the one-liner.

### Example 3 — Escalate on executor-blocked

TASKS.md contains task-4 with:

```markdown
[Result]
Status: blocked
Reason: Acceptance bullet 2 contradicts bullet 4
Updated: 2026-04-21T10:05:00Z
```

And task-5 (which depends on task-4):

```markdown
[Result]
Status: skipped
Reason: depends on task-4 which blocked
Updated: 2026-04-21T10:05:00Z
```

- Step 2: blocked task found → short-circuit. Do not read rules. The user re-reads TASKS.md `[Result]` blocks to see task-5's skip.

```json
{
  "outcome": "escalate",
  "session_id": "2026-04-19-add-2fa-login",
  "reason": "task-4: Acceptance bullet 2 contradicts bullet 4"
}
```

The same shape applies when the source is `Status: failed` — only the `reason` differs (quote the `Attempt:3` line).

## Edge cases

- **`rules_dir` absent or empty**: Track 2 skipped. Pass on rules alone (executor completion check still runs). `rules_dir` pointing to a file (not directory) is treated identically — skip.
- **Diff empty but tasks claim `done`**: error outcome at step-3. A done task that produced zero diff is a lie; the main thread re-investigates.
- **Rule file opts out** (`<!-- evaluator: skip -->` on the first non-blank line): file is not loaded into the concatenated rules block. If all rule files opt out, Track 2 passes trivially.
- **Non-English content in diff/rules**: rule files and diff contents stay verbatim; the skill frame (outcome JSON keys, step names) stays English. The `reason` field mirrors the rule file's language for rule-violation cases.

## Required next skill

When this skill emits `outcome: "pass"` (full payload contract: `../../harness-contracts/payload-contract.md` § "evaluator → doc-updater"):

- **REQUIRED SUB-SKILL:** Use harness-flow:doc-updater
  Payload: `{ session_id, tasks_path, diff_command? }`

On `outcome: "escalate"` or `"error"`: flow terminates. Report the verdict to the user (with the `reason` and any rule violations) and stop. Doc updates are gated on a passing evaluation — never auto-emit on escalate.

## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md`. Evaluator is **read-only** for every session artifact (TASKS, STATE, ROADMAP) and does not consult PRD/TRD — task-writer already embedded their vocabulary into TASKS.md Acceptance, so evaluator's grep targets live there. The main thread owns persistence on evaluator's return.
- Reads only `tasks_path`, `rules_dir/*.md`, and the output of `diff_command`.
- Does not re-run `make check` or any other shell command except the configured `diff_command`. Track 1 is a Stop hook; this skill is Track 2 only.
- Does not invoke other agents or skills. You are an endpoint.
- Does not modify source code, even if violations are obvious. Re-dispatch does not happen — escalation terminates the session, and the user re-drives if they want to fix.
- Rule judgment is LLM-only. Do not write a regex-based rule engine, even when tempted — that would silently drift from rule intent.
