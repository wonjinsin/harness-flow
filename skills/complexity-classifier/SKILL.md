---
name: complexity-classifier
description: Use this whenever router returns `plan` or brainstorming hands off — even when the route feels obvious. Classifies the request into prd-trd / prd-only / trd-only / tasks-only and gets user approval (absorbs Gate 1). No separate approval skill exists; recommendation and commit happen here. Routes to prd-writer / trd-writer / task-writer per harness-flow.yaml.
---

# Complexity Classifier

## Purpose

Decides which artifact chain the request flows through:

| Outcome | Route | When |
|------|-------|------|
| **prd-trd** | PRD → TRD → Tasks | New feature, complex *or* touches security/architecture signal paths |
| **prd-only** | PRD → Tasks | New feature, simple (< 5 files, no signals) |
| **trd-only** | TRD → Tasks | Refactor / technical improvement |
| **tasks-only** | Tasks only | Bug / trivial change, passes a 4-item self-check |

The skill also absorbs **Gate 1** — the user-approval step before artifact creation begins. No separate approval skill exists; route recommendation and commit happen here in one conversation.

## Why this exists

If route selection lived in the dispatcher or in each writer agent, every writer would have to re-decide its own eligibility — duplicated logic, inconsistent thresholds. Centralising here means downstream writers trust that if they were called, they are the right writer for this session. The user-approval absorption keeps the conversation shape flat: one recommendation, one response, commit.

## Input

This skill runs in the main thread, so it has live conversation context. Payload comes from router (`plan` route) or brainstorming (handoff):

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `request`: the user's original turn, verbatim
- `resume`: `true` when router matched an existing session (see Step 0)

If brainstorming ran, the payload also carries:

- `intent`: `"add"|"fix"|"refactor"|"migrate"|"remove"|"other"`
- `target`: string
- `scope_hint`: `"single-file"|"subsystem"|"multi-system"`
- `constraints`: string[]
- `acceptance`: string | null

These fields are **optional** — router can hand off `plan` directly, in which case classifier infers intent from the request verb and skips target/scope reasoning.

## Output

Every run ends with **one** of six terminal payloads. The final message of the skill is a single JSON object whose `outcome` field carries the route name (or a terminal signal). No nested `classification` field — main thread evaluates `when:` expressions against the `outcome` string per `harness-flow.yaml`.

**Normal classification** — `outcome` is the route name (`prd-trd`, `prd-only`, `trd-only`, or `tasks-only`):

```json
{
  "outcome": "prd-trd",
  "session_id": "2026-04-19-...",
  "request": "...",
  "brainstorming_output": { "intent": "...", "target": "...", "scope_hint": "...", "constraints": [...], "acceptance": "..." }
}
```

Routing per `harness-flow.yaml`:

- `prd-trd` → `prd-writer` → `trd-writer` → `task-writer`
- `prd-only` → `prd-writer` → `task-writer`
- `trd-only` → `trd-writer` → `task-writer`
- `tasks-only` → `task-writer`

`brainstorming_output` may be `null` when router handed off `plan` directly (no brainstorming phase).

**Pivot** — user turned away from the current request to an unrelated one. Dispatcher should let router fire on the next turn; the current session stays as-is:

```json
{ "outcome": "pivot", "session_id": "2026-04-19-...", "reason": "user asked about dashboard UI mid-classification" }
```

**Casual re-classified** — it became clear the user was asking a question, not requesting work. Dispatcher should drop and let router handle the next turn:

```json
{ "outcome": "exit-casual", "session_id": "2026-04-19-...", "reason": "user was asking about tier definitions, not requesting work" }
```

The skill also writes to session files on tier outcomes (prd-trd / prd-only / trd-only / tasks-only) — see Step 7. Pivot and exit-casual leave ROADMAP/STATE untouched.

## Procedure

### Step 0 — Resume short-circuit

If `resume: true`, read `.planning/{session_id}/ROADMAP.md`. If it contains a `Complexity: X` line (X ∈ prd-trd / prd-only / trd-only / tasks-only) **and** the `classifier` phase is `[x]`, do **not** reclassify. Emit the resume payload pointing to the next incomplete phase per `harness-flow.yaml` and end. Rationale: re-asking the user "which route?" when they already decided it last session wastes a turn and erodes trust.

If `resume: true` but classification is missing (e.g., session was interrupted mid-Gate-1), proceed normally from Step 1.

### Step 1 — Signal detection

Two kinds of signals:

**(a) Path signals — literal, language-agnostic.** Scan `request`, `target`, and `constraints` for these file-path patterns:

- `auth/`, `security/` — authentication/authorization
- `schema.*`, `*/schema/` — DB or API schemas
- `migrations/` — DB migrations
- `package.json`, `*/package.json` — dependency/version changes
- `config.ts`, `*.config.*` — global configuration

Paths are filesystem literals — match them the same in any language. Record hits as `signals_matched: ["path:auth/", ...]`.

**(b) Keyword signals — semantic, multilingual.** Detect whether the request semantically refers to any of these concepts: authentication, login, password, session, database, schema, migration, configuration, dependency. These are concepts, not literal strings — "로그인", "認証", "authentification" all count as the auth/login concept. Use judgment, not a fixed keyword table. Record hits as `signals_matched: ["keyword:login", "keyword:dependency", ...]`.

**(c) `deliberately-wide-scope` constraint** (brainstorming's flag when the user insisted on multi-subsystem scope): implicit prd-trd signal. Record as `signals_matched: ["constraint:deliberately-wide-scope"]`.

### Step 2 — File-count estimate

Produce a single integer N — best-guess total of modified + newly created files.

Calibration:

- Typo / format / comment-only → 1
- Single-subsystem bug fix → 1–3
- One new endpoint or page → 2–4
- Feature across multiple layers → 5–12
- Cross-cutting migration or framework swap → 10–30+

Don't overthink this. One rough integer is enough — the user can override in Step 6. If the request is too vague to estimate at all (and brainstorming didn't run to pin `target`), pick 3 as a neutral default and flag low confidence in the Gate 1 message.

### Step 3 — Tier determination

Apply in order:

1. Any entry in `signals_matched` → **prd-trd candidate** regardless of file count.
2. Otherwise, by intent:
   - `add` / `create` + N ≥ 5 → **prd-trd**
   - `add` / `create` + N < 5 → **prd-only**
   - `refactor` / `migrate` / `remove` → **trd-only**
   - `fix` + N ≤ 2 → **tasks-only candidate** (must pass Step 4)
   - `other` with `intent-freeform` in constraints → parse the freeform verb: refactor-ish → trd-only, fix-ish → tasks-only candidate, create/add-ish → prd-trd if N ≥ 5 else prd-only. Unparseable → prd-only.
   - `other` or intent missing (no freeform hint) → **prd-only** (conservative — lightweight PRD costs less than wrong route).

### Step 4 — tasks-only self-verification

Only runs when Step 3 yielded a tasks-only candidate. Check all four:

- [ ] Clearly a bug fix, typo, formatting, or comment-level change?
- [ ] Estimated files ≤ 2?
- [ ] No security/architecture signal matched?
- [ ] No "design needed" cues in the request (new terminology, ambiguous intent, mention of a new concept)?

**Any fail → promote to prd-only** (a minimal PRD is cheap insurance). All pass → tasks-only stays. The rationale: "simple" projects are where unexamined assumptions cause the most wasted work. This gate exists to stop the model from rationalising its way past design.

### Step 5 — Gate 1 — present recommendation

Send **one** user-facing message as its own turn, in the user's language, with this shape:

> "Recommend **{route}** ({expansion}). Estimated {N} files. {signals summary or 'no security/architecture signals.'} Proceed?"

Examples:

- `"Recommend prd-only (PRD → Tasks). Estimated 3 files, no security signals. Proceed?"`
- `"Recommend prd-trd (PRD → TRD → Tasks). Estimated 4 files, touches auth/ (security-sensitive). Proceed?"`
- `"Recommend tasks-only. Typo fix, 1 file, no signals. Skip design and go straight to tasks?"`

This message is standalone — do **not** bundle the output JSON with it. Offer MC implicitly: accept / change route / adjust file count. Do not batch more than this — signals + file count + route is the whole decision surface. Then wait for the user's next turn.

### Step 6 — Handle the response (next user turn)

On the **next** user turn, classify the response into one of four actions:

- **Accept** ("yes", "proceed", silence/no-correction) → go to Step 7 with the current route. `user_overrode: false`.
- **Route override** ("make it prd-trd" / "just do tasks-only") → go to Step 7 with the user's route. `user_overrode: true`. Do not argue — the user is the final authority.
- **File-count override** ("more like 10 files") → re-run Step 3 with the new N and loop back to Step 5 **once only** with the new recommendation. This is the only loop allowed; a second file-count change uses the second value without another recomputation-then-ask.
- **Pivot or casual** — see Pivot handling below.

Do **not** ask clarifying questions about `intent` / `target` / `scope_hint` here — that was brainstorming's job. If those fields are missing and feel load-bearing, pick the conservative route (prd-only for add-like, trd-only for refactor-like) and hand off; the writer will surface gaps at its own layer.

**Pivot handling.** If the user asks about an unrelated topic or drops this request entirely, emit `{"outcome": "pivot", ...}` as the terminal payload and end the skill with one sentence: "This looks like a new request; stepping back to routing." Do **not** update ROADMAP/STATE. If instead the user's response reveals they were asking a question about tiers rather than requesting classified work, emit `{"outcome": "exit-casual", ...}` and end with a one-line acknowledgement.

### Step 7 — Commit + emit (route outcome path only: prd-trd / prd-only / trd-only / tasks-only)

On acceptance (including override):

1. **Update `ROADMAP.md`**:
   - Add / update the line `Complexity: {route} ({expansion})` near the top.
   - Mark `- [ ] classifier` → `- [x] classifier       → {route}`.
   - Mark `- [ ] gate-1-approval` → `- [x] gate-1-approval  → approved` (or `→ overridden` if `user_overrode`).
2. **Update `STATE.md`**:
   - `Current Position: {next phase per harness-flow.yaml}`
   - `Last activity: {ISO timestamp} — classified as {route}{, user-overrode if applicable}`
3. **Emit the route payload** as the final message — `outcome` is the route name (`prd-trd`/`prd-only`/`trd-only`/`tasks-only`). Main thread evaluates `when:` expressions in `harness-flow.yaml` and dispatches the correct writer agents.

## What this skill does NOT do

- Ask clarifying questions about intent / target / scope — that's brainstorming. If it's missing, use conservative defaults and move on.
- Estimate LOC or test coverage — these are request-time unknowns and not part of the classification signal.
- Promote tier at runtime based on actual diff — runtime promotion is not in scope here.
- Dispatch the next agent directly — main thread reads the emitted `outcome` and follows `harness-flow.yaml` transitions; classifier only emits the payload and updates session files.
- Read the codebase to estimate file count — the estimate is from the request alone. If the request is genuinely unknowable without code reading, default to N=3 and flag low confidence.

## Conversation shape

**Good — straightforward trd-only:**

> brainstorming output: `{intent: refactor, target: session handling, scope_hint: subsystem}`
> Classifier: "Recommend **trd-only** (TRD → Tasks). Estimated 3 files, no security signals. Proceed?"
> User: "yes"
> Classifier: [commits ROADMAP, emits payload]

**Good — signal promotion:**

> Request: "add 2FA to login"
> Signal match: `auth/` → prd-trd candidate
> Classifier: "Recommend **prd-trd** (PRD → TRD → Tasks). Estimated 4 files, touches `auth/` (security-sensitive). Proceed?"
> User: "yeah"
> Classifier: [commits]

**Good — tasks-only self-check fails, demoted to prd-only:**

> Request: "fix the expired-session bug in login"
> Intent: fix, N=2 — tasks-only candidate → signal check hits `auth/` → promoted to prd-only
> Classifier: "Initially looked like a tasks-only fix, but it touches `auth/` — recommending **prd-only** (PRD → Tasks) instead. 2 files. Proceed, or escalate to prd-trd?"

**Good — user overrides route:**

> Classifier: "Recommend prd-only …"
> User: "Nah, just tasks-only, it's one line"
> Classifier: "Got it — tasks-only, user override. Skipping design. Proceeding to task-writer."
> [commits with user_overrode: true]

**Bad — clarifying:**

> Classifier: "What kind of change is this — bug fix or feature?" ← brainstorming's job, not classifier's

**Bad — silent commit:**

> Classifier: [writes ROADMAP without asking user] ← Gate 1 must be explicit

**Bad — arguing:**

> User: "just do tasks-only"
> Classifier: "Are you sure? It's touching auth/, I recommend prd-trd. Shall I reconsider?" ← the user has already decided; log `user_overrode: true` and move on

## Edge cases

- **Router → plan direct** (brainstorming bypassed): infer `intent` from the first verb in `request`. If none obvious, default to `add`. Don't ask the user — keep the flow terse.
- **Resume with existing classification** (Step 0): emit a resume payload pointing to the next `[ ]` phase. Do not re-ask Gate 1.
- **Conflicting signals** (e.g., `migrations/` + "one-line typo"): err toward prd-trd. The cost of over-scoping a trivial migration is a 5-minute PRD; the cost of under-scoping one is a broken schema.
- **User gives file count but no route verdict** ("maybe 8 files?"): recompute route silently and present the new recommendation once more.
- **User names a non-existent route** ("prd-tasks, please"): re-ask once with the four options. If still unclear, use the recommended route.
- **`intent: "other"` with `intent-freeform` constraint** (from brainstorming): inspect the freeform verb — if it parses as refactor-ish → trd-only, as fix-ish → tasks-only candidate, as create-ish → prd-trd/prd-only. If unparseable, default to prd-only.
- **Request is actually casual** (user was asking a question about routes, not requesting work): classifier should not have been invoked; exit with one sentence and let router re-fire next turn.

## Boundaries

- Writes only to `ROADMAP.md` (Complexity line + two checkboxes) and `STATE.md` (Current Position + Last activity). No other files.
- Hands off only via `harness-flow.yaml` routing — never invokes a writer agent directly.
- Skill internals (route names, signal list, checklists, field names) stay English. User-facing recommendations and confirmations mirror the user's language.
- No retry loop except the single file-count recomputation in Step 6. One user turn of back-and-forth is the whole budget.
