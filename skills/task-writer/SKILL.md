---
name: task-writer
description: Use when a session needs its TASKS.md drafted. Runs inside the task-writer agent's isolated context — main conversation history is NOT available. Produces a single `.planning/{session_id}/TASKS.md` from the input payload (plus any upstream PRD.md / TRD.md that exist), then emits a one-line outcome.
---

# Task Writer

## Purpose

Produce **`TASKS.md`** — the executor's only source of truth. Every session ends here regardless of tier; TASKS.md is the common terminal document that `parallel-task-executor` reads, that the `evaluator` gates on, and that the subagent dispatched for each task receives in place of PRD/TRD context.

This skill is loaded by the `task-writer` agent inside an isolated context. The **payload is your entire input** — you cannot see the main conversation. If `prd_path` or `trd_path` are set, those files are also authoritative input. Beyond those, investigate the codebase with Read/Grep/Glob; do not invent file structure.

## Why this exists

The executor dispatches one fresh subagent per task. Those subagents do not have the PRD/TRD in context — they only have the task text from TASKS.md. Preserving the PRD/TRD vocabulary verbatim here is therefore not a style choice but a correctness requirement: the evaluator later greps for PRD acceptance terms, and if task-writer rephrased them, the evaluator cannot tell whether the work satisfies the original requirement.

Sessions arrive here in four shapes, distinguished by which upstream artifacts exist:

- **Both PRD and TRD** (`prd_path` and `trd_path` set): the richest case. Map each PRD acceptance criterion to tasks; derive task shape from TRD Affected surfaces, Interfaces, and Data model.
- **PRD only** (`prd_path` set, `trd_path: null`): derive technical shape during Step 2 exploration since no TRD exists; ground Acceptance in the PRD.
- **TRD only** (`trd_path` set, `prd_path: null`): inherently technical change; Acceptance is grounded in TRD Interfaces & contracts and Risks.
- **Neither** (both null): direct-to-TASKS for tiny changes. Work from `request` and `brainstorming_output` (if present). This case must produce a TASKS.md even when the request is a single sentence.

**Output shape is identical in all four cases.** The branch is input-driven (which files exist), not a classification branch — downstream (executor, evaluator) does not read `classification` and neither do you.

Note on routing vocabulary: the main thread reasons in tiers (A/B/C/D) when deciding which writer to dispatch. You do not. Inside this skill the branches are null checks on `prd_path` and `trd_path`.

## Input payload

You receive this object from the main thread. Treat every field as authoritative:

- `session_id`: `"YYYY-MM-DD-{slug}"` — determines the output folder.
- `request`: the user's original turn, verbatim. **Always present**; read it carefully even when PRD/TRD exist.
- `prd_path` *(optional)*: `".planning/{session_id}/PRD.md"` if PRD was produced upstream, `null` otherwise.
- `trd_path` *(optional)*: `".planning/{session_id}/TRD.md"` if TRD was produced upstream, `null` otherwise.
- `brainstorming_output` *(optional)*: `{intent, target, scope_hint, constraints[], acceptance}` — may be absent when router routed `plan` directly and brainstorming skipped its Q&A phase.

If `prd_path` is set but the file is unreadable, halt and emit `{"outcome": "error", "session_id": "...", "reason": "PRD declared in payload but <path> not found", "next": null}`. Same for `trd_path`. Do not proceed by guessing.

If `prd_path`, `trd_path`, **and** `brainstorming_output` are all null and `request` is a single sentence with no actionable verb (e.g., "looks nice"), emit `{"outcome": "error", "session_id": "...", "reason": "insufficient input to derive tasks", "next": null}`. The main thread likely mis-routed; it will decide recovery.

## Output

The final message is always a single JSON object tagged by `outcome`. The `next` field is resolved in Step 6 below.

**done** — normal completion. File written to `.planning/{session_id}/TASKS.md`:

```json
{ "outcome": "done", "session_id": "2026-04-19-...", "next": "executor" }
```

**error** — payload defect, missing upstream file, TASKS.md already exists, or unrecoverable decomposition gap:

```json
{ "outcome": "error", "session_id": "2026-04-19-...", "reason": "TASKS.md already exists at <path>", "next": null }
```

The file path is deterministic from `session_id`; the main thread reconstructs it. If the file already exists, emit `error` — **never overwrite**. Re-generation is the main thread's call: it deletes the file first, then re-dispatches.

Never emit prose alongside the JSON.

## Procedure

### Step 1 — Read the payload and upstream docs

Re-read `request` in full. Read the PRD (if `prd_path`) and TRD (if `trd_path`) end-to-end. Role division between them (TRD → technical shape, PRD → Acceptance) is covered in "Why this exists" above — this step is about extraction.

Extract and hold in mind:

- From PRD: Goal, every Acceptance criterion (these become bullet points in task `Acceptance:` fields), Non-goals, Constraints.
- From TRD: every entry under Affected surfaces (these seed the task `Files:` blocks), Interfaces & contracts (these become `Acceptance:` items for API-shaped tasks), Risks (these become Notes on the relevant tasks).
- From `brainstorming_output` (if no PRD): `acceptance` field and `constraints[]`.
- From `request` alone (if no upstream docs): the action verb and object. That is the minimum starting point for a single task.

If any declared upstream file is missing, emit the step-1 `error` outcome.

### Step 2 — Scoped codebase exploration (budget-capped)

You have a **tool-call budget of roughly 20 Read/Grep/Glob calls**. What you spend the budget on depends on which upstream docs exist:

- **TRD present**: budget goes to verifying the files in TRD Affected surfaces actually exist (Glob), and resolving any line ranges TRD references (Read). TRD already did deep exploration; you are confirming, not re-exploring.
- **PRD only**: budget goes to locating the primary module from the PRD subject, then walking outward enough to write accurate `Files:` blocks. Similar to TRD-writer Step 2 but shallower — you only need to know *which files change*, not *how they change internally*.
- **Neither**: budget goes to understanding the change area from scratch. Start from the first noun-phrase in `request` (e.g., `"Rename getUser to fetchUser"` → `getUser`), grep for its current occurrences, and map the change surface.

Stop exploring when you can answer:

1. Which files will be created, modified, or have tests added?
2. Are there natural seams where an independent subagent could own one task without blocking another? (This drives DAG shape — if seams exist, tasks parallelize; if everything touches one module, tasks serialize.)
3. Does the existing codebase expose any patterns the tasks should follow (test location, module boundaries, existing similar factories)?

If the change is genuinely unknowable from code — e.g., new file in a greenfield area with no analog — that's fine. Just write the task with a defensible path (e.g., `src/auth/totp.ts` alongside existing `src/auth/*`) and put the uncertainty in Notes.

If you exhaust the budget cap without resolving the three questions above, halt and emit `{"outcome": "error", "session_id": "...", "reason": "codebase exploration exhausted budget without resolving change surface", "next": null}`. Upstream is likely underspecified — the main thread decides whether to re-dispatch an upstream writer.

### Step 3 — Decompose into tasks

**Task granularity**: one task = one PR-sized unit of work a fresh subagent can complete in a single execution without needing clarification. Signals to split:

- Two files with no shared context (e.g., `backend/api.ts` and `frontend/form.tsx`) → usually two tasks.
- A config/migration change that must land before the code that depends on it → two tasks with `Depends:`.
- A refactor and a behavior change in the same commit → split; each can be reviewed independently.

Signals to *not* split:

- A new file and the test file that exercises it. One task; the Files block lists both.
- A function and its single caller updated to use its new signature. One task unless the caller lives in a clearly different subsystem.

**Rule of thumb**: 3–8 tasks is the healthy range for the sessions this harness is designed for. Fewer than 3 means you're bundling things that should split; more than 8 means you're splitting things a single subagent could do in one pass. When exploration shows the change touches ≤ 2 files, exactly 1 task is often correct — do not manufacture structure.

**Task IDs**: `task-1`, `task-2`, ... in topological order (tasks with no dependencies first, downstream tasks last). Evaluator and executor reference tasks by this ID; renaming between runs breaks state tracking.

### Step 4 — Write each task

Fill every field for every task. See `## TASKS.md template` for the exact structure.

**Writing rules**:

- Mirror the user's language in prose content (Korean request → Korean Notes, Korean Goal paragraph). Field names (`Depends:`, `Files:`, `Acceptance:`, `Notes:`) stay English for machine parseability, as do file paths and code identifiers.
- **Use PRD/TRD vocabulary verbatim.** If PRD says "2FA", don't write "second-factor". If TRD says `issueSession`, don't write `createSession`. Code identifiers stay in backticks (not bold). Wrap conceptual terms that appear in prose in `**bold**` on their first occurrence per task — those are the grep targets the evaluator uses to trace back to PRD/TRD.
- **No placeholders.** "TBD", "similar to task 2", "add error handling", "handle edge cases", "write tests for the above" — all plan failures. Every Acceptance bullet must be a concrete, verifiable claim. Every Files entry must be a real path (either existing or to be created).
- **Acceptance is externally verifiable**, not internal reasoning. "`issueSession` is called only after TOTP verification passes" is verifiable by reading code. "implementation is correct" is not.
- **Every Acceptance bullet cites its source** in parentheses: `(PRD §Acceptance criteria)` or `(TRD §Interfaces & contracts)` or `(request)`. This is the traceability path the evaluator follows backwards.
- **Notes is for non-obvious constraints only.** Ordering constraints, gotchas, pointers to a specific TRD Risk. Skip the field entirely when there's nothing to say.

**Anti-patterns** (do not do):

- Rephrasing PRD/TRD terms to sound more "design-y". Breaks evaluator grep.
- Writing implementation steps (`- [ ] write the test` / `- [ ] run it` / `- [ ] commit`). The subagent decides its own steps.
- Bundling unrelated surface changes into one task because "they're both small". If they have no shared reason, split.
- Duplicating an Acceptance bullet across tasks to "be safe". Each criterion lives in exactly one task.
- Adding `(assumed)` to an Acceptance bullet. Assumptions belong in Notes; Acceptance must be definite.

### Step 5 — Write the file

Create `.planning/{session_id}/` if missing. Write `TASKS.md` using the template.

If the file already exists, halt and emit `{"outcome": "error", "session_id": "...", "reason": "TASKS.md already exists at <path>", "next": null}`. Regeneration is the main thread's responsibility.

Before writing the Self-Review section at the bottom of the file, actually perform each check and only check (`[x]`) the boxes you can honestly certify. Leaving a box unchecked is fine — it signals a known gap the evaluator must scrutinize. Checking a box falsely is worse than missing a task: it directs the evaluator's attention away from a real problem.

### Step 6 — Resolve `next` and emit

Perform the next-node lookup per `using-harness § Core loop` steps 3–5 against this skill's outgoing edges in `harness-flow.yaml`. Sole candidate: `executor` (`depends_on: [task-writer]`, no `when:`):

| `outcome` | `next` |
|---|---|
| `done` | `executor` |
| `error` | `null` |

Count the tasks. Emit the final JSON with the resolved `next`. That is your entire final message.

## TASKS.md template

````markdown
# TASKS — {one-line title from PRD/TRD or request}

Session: {session_id}
Created: {ISO date}
PRD: {relative path to PRD.md, or "(none)"}
TRD: {relative path to TRD.md, or "(none)"}

## Goal

{1–2 sentences typically. If PRD exists, restate its Goal in executor-facing terms
 (what the implementer needs to accomplish, not what the user wants).
 If no PRD, extract the goal from TRD Context or `request`.}

## Architecture

{2–3 sentences typically. If TRD exists, distill its Approach into what physically
 changes: which modules, how they connect, what's new vs. modified.
 If no TRD, state the minimum technical picture from Step 2 exploration.}

## Conventions

- Task IDs are stable (`task-1`, `task-2`, ...). Evaluator and executor reference by ID.
- A task is complete when every `Acceptance:` checkbox is satisfied with evidence.
- **Bold terms** are quoted verbatim from PRD/TRD. Do not rename them in code, tests, or commit messages.

---

### task-1 — {imperative verb + object, PRD/TRD vocabulary verbatim}

**Depends:** (none)
**Files:**
- Create: `exact/path/to/new.ext`
- Modify: `exact/path/to/existing.ext:start-end`
- Test: `exact/path/to/test.ext`

**Acceptance:**
- [ ] {Verifiable criterion with **bold** PRD/TRD term, ending with source cite — e.g., "(PRD §Acceptance criteria)"}
- [ ] {Criterion 2}

**Notes:** {1-2 sentences, only if non-obvious. Omit the field entirely otherwise.}

---

### task-2 — ...

**Depends:** task-1
**Files:** ...
**Acceptance:** ...

---

## Self-Review

Performed by task-writer before emitting. Evaluator re-checks these claims.

- [ ] Every PRD Acceptance criterion maps to at least one task's Acceptance bullet (or is deferred to Non-goals).
- [ ] Every TRD Risks entry is referenced in the Notes of the task that creates the risk (or explicitly accepted as out-of-scope for this session).
- [ ] No placeholder strings: "TBD", "similar to task N", "handle edge cases", "add error handling", "write tests for the above".
- [ ] PRD/TRD vocabulary consistency: terms used in one task appear in the same form across all other tasks (no `TOTP` → `2FA` drift).
- [ ] DAG is acyclic; no task depends transitively on itself.
- [ ] No orphan task: every task is reachable from the set of root tasks (`Depends: (none)`), and every task either has a dependent or is a natural leaf.
````

## Example 1 — rendered TASKS.md (prd-trd: both PRD and TRD present)

Given the session from trd-writer's Example 1 (`2026-04-19-add-2fa-login`) with payload `{prd_path: ".planning/2026-04-19-add-2fa-login/PRD.md", trd_path: ".planning/2026-04-19-add-2fa-login/TRD.md"}`:

````markdown
# TASKS — Add 2FA to login page

Session: 2026-04-19-add-2fa-login
Created: 2026-04-19
PRD: PRD.md
TRD: TRD.md

## Goal

Gate session issuance behind a **TOTP** check so that password-only compromise is insufficient to sign in. Preserve the existing password flow for users who have not yet enrolled.

## Architecture

A short-lived **intermediate token** (JWT, 5-minute TTL) is issued after password verification; the real session is only issued after the TOTP code is verified against the intermediate token. Rate limiting keys by intermediate-token id, not IP. Enrollment discovery is a UI-only banner on the landing page.

## Conventions

- Task IDs are stable (`task-1`, `task-2`, ...). Evaluator and executor reference by ID.
- A task is complete when every `Acceptance:` checkbox is satisfied with evidence.
- **Bold terms** are quoted verbatim from PRD/TRD. Do not rename them in code, tests, or commit messages.

---

### task-1 — Issue intermediate token from `/auth/login` on password success

**Depends:** (none)
**Files:**
- Modify: `src/auth/login.ts`
- Modify: `src/auth/session.ts` (expose `issueSession(userId)`)
- Test: `tests/auth/login.test.ts`

**Acceptance:**
- [ ] `/auth/login` success response returns `{ intermediate_token, expires_at }` instead of a session. (TRD §Interfaces & contracts)
- [ ] The **intermediate token** is a JWT signed with the existing session key, carries `pending_2fa: true`, and has a 5-minute TTL. (TRD §Approach)
- [ ] `issueSession(userId)` is exported from `src/auth/session.ts` for `totp.ts` to call. (TRD §Affected surfaces)
- [ ] Existing login tests updated: password-only success no longer yields a session. (PRD §Acceptance criteria)

**Notes:** Do not remove the old session-issuance path yet — `task-2` will call `issueSession` from the TOTP verify endpoint, and the old tests need to pass against the new contract before that lands.

---

### task-2 — Add `POST /auth/totp/verify` endpoint

**Depends:** task-1
**Files:**
- Create: `src/auth/totp.ts`
- Test: `tests/auth/totp.test.ts`

**Acceptance:**
- [ ] `POST /auth/totp/verify` consumes `{ intermediate_token, code }` and returns `{ session }` on success. (TRD §Interfaces & contracts)
- [ ] Verification uses `otplib` with default ±1 step window. (TRD §Dependencies, §Risks)
- [ ] On success, `issueSession(userId)` is called exactly once; the `jti` is marked consumed in the LRU (size 10k, TTL 5min). (TRD §Risks "Intermediate token replay")
- [ ] On rate-limit, response is `{ error: "rate_limited", retry_after_seconds }` and status 429. (TRD §Interfaces & contracts)
- [ ] Rate limit: 3 attempts per 30 seconds per **intermediate-token-id** (not IP). (PRD §Acceptance criteria, TRD §Approach)

**Notes:** Rate limit key is the `jti`, not the user id — the PRD criterion explicitly calls out shared-NAT false positives. Don't substitute IP even if it's simpler.

---

### task-3 — Render TOTP enrollment banner on landing page

**Depends:** (none)
**Files:**
- Modify: `src/pages/landing.tsx`
- Test: `tests/pages/landing.test.tsx`

**Acceptance:**
- [ ] Banner renders when `user.totp_enrolled === false`, not otherwise. (TRD §Approach)
- [ ] Banner failing to render does not break login. (TRD §Approach — "separable from the auth flow")

**Notes:** UI-only change; no backend coupling. Independent of task-1 and task-2 — can run in parallel.

---

## Self-Review

Performed by task-writer before emitting. Evaluator re-checks these claims.

- [x] Every PRD Acceptance criterion maps to at least one task's Acceptance bullet (or is deferred to Non-goals).
- [x] Every TRD Risks entry is referenced in the Notes of the task that creates the risk (or explicitly accepted as out-of-scope for this session).
- [x] No placeholder strings: "TBD", "similar to task N", "handle edge cases", "add error handling", "write tests for the above".
- [x] PRD/TRD vocabulary consistency: terms used in one task appear in the same form across all other tasks (no `TOTP` → `2FA` drift).
- [x] DAG is acyclic; no task depends transitively on itself.
- [x] No orphan task: every task is reachable from the set of root tasks (`Depends: (none)`), and every task either has a dependent or is a natural leaf.
````

Three tasks, DAG width 2 (task-1 and task-3 root, task-2 depends on task-1). The executor will dispatch task-1 and task-3 in parallel, then task-2 after task-1 resolves.

## Example 2 — rendered TASKS.md (tasks-only: no PRD, no TRD)

Given `request: "Rename the getUser helper to fetchUser across the codebase"` and payload `{prd_path: null, trd_path: null}`:

````markdown
# TASKS — Rename getUser to fetchUser

Session: 2026-04-19-rename-getUser
Created: 2026-04-19
PRD: (none)
TRD: (none)

## Goal

Rename the `getUser` helper to `fetchUser` in every call site and at the definition, keeping behavior identical.

## Architecture

Single helper in `src/users/get-user.ts` with 4 call sites across `src/pages/` and `src/api/`. No contract change outside the function name.

## Conventions

- Task IDs are stable (`task-1`, `task-2`, ...). Evaluator and executor reference by ID.
- A task is complete when every `Acceptance:` checkbox is satisfied with evidence.
- **Bold terms** are quoted verbatim from PRD/TRD. Do not rename them in code, tests, or commit messages.

---

### task-1 — Rename `getUser` → `fetchUser` at definition and all call sites

**Depends:** (none)
**Files:**
- Modify: `src/users/get-user.ts` (also rename file to `fetch-user.ts`)
- Modify: `src/pages/profile.tsx`
- Modify: `src/pages/admin.tsx`
- Modify: `src/api/user-handler.ts`
- Test: `tests/users/fetch-user.test.ts` (rename from `get-user.test.ts`)

**Acceptance:**
- [ ] No occurrences of the identifier `getUser` remain in the codebase (grep returns 0 results outside comments). (request)
- [ ] All call sites compile and existing tests pass unchanged in behavior. (request)
- [ ] The file `src/users/get-user.ts` no longer exists; `src/users/fetch-user.ts` exists with the renamed export. (request)

---

## Self-Review

Performed by task-writer before emitting. Evaluator re-checks these claims.

- [x] Every PRD Acceptance criterion maps to at least one task's Acceptance bullet (or is deferred to Non-goals).
- [x] Every TRD Risks entry is referenced in the Notes of the task that creates the risk (or explicitly accepted as out-of-scope for this session).
- [x] No placeholder strings: "TBD", "similar to task N", "handle edge cases", "add error handling", "write tests for the above".
- [x] PRD/TRD vocabulary consistency: terms used in one task appear in the same form across all other tasks (no `TOTP` → `2FA` drift).
- [x] DAG is acyclic; no task depends transitively on itself.
- [x] No orphan task: every task is reachable from the set of root tasks (`Depends: (none)`), and every task either has a dependent or is a natural leaf.
````

One task, no DAG, no PRD/TRD to trace to. The Self-Review items about PRD/TRD trivially pass (nothing to map); the executor runs a single subagent and evaluator checks grep counts.

## Edge cases

- **PRD Acceptance criterion with no natural home task**: do not invent a dummy task to hold it. Instead, add the criterion as an Acceptance bullet on the closest existing task and cite the PRD section. If genuinely none of the tasks touch the criterion's surface, leave the Self-Review box *unchecked* — that's a legitimate signal for the evaluator to investigate.
- **TRD Risk that applies across multiple tasks**: repeat it in the Notes of each affected task. Risks are the exception to the "each item lives in exactly one task" rule, because the executor subagent only sees its own task.
- **DAG with cycle**: do not write the file. Emit `{"outcome": "error", "session_id": "...", "reason": "task DAG contains cycle: task-N → task-M → task-N", "next": null}`. The main thread decides whether to re-decompose.
- **Request in non-English language**: Goal / Architecture / Notes content in the user's language; Conventions, field names, file paths, code identifiers, and Self-Review checklist text in English (they are machine-readable contracts).
- **Only `request` available, request is a refactor with wide reach** (`scope_hint: multi-system` or evident from the verb+object): Step 2 budget is tight; spend it on Glob to enumerate the call sites, not on Read to understand each. A single task with a file list of 8 is acceptable if the refactor is uniform.
- **One Acceptance criterion from PRD maps to three separate tasks**: split the criterion into per-task sub-claims, each citing the same PRD section. Evaluator will still trace back to one PRD line; executor subagents each have their own verifiable slice.

## Boundaries

- Writes only to `.planning/{session_id}/TASKS.md`. **Do not touch PRD.md, TRD.md, ROADMAP.md, or STATE.md** — PRD and TRD are upstream read-only; the main thread owns the others.
- Do not invoke other agents or skills. You are an endpoint.
- Do not dispatch the executor. The main thread follows harness-flow.yaml.
- Do not modify source code, even if you spot bugs during exploration. Note them in the affected task's Notes if load-bearing, or leave them alone.
- Tool budget: ~20 Read/Grep/Glob calls total for Step 2. If you need more, something is wrong with the payload or with the upstream docs — halt and emit `error` with a `reason` describing the exhaustion.
