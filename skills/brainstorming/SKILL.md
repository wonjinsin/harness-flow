---
name: brainstorming
description: Use this whenever router hands off `clarify`, `plan`, or `resume`. Owns the full intake — Q&A to fill the actionability checklist (when needed), then complexity classification (prd-trd / prd-only / trd-only / tasks-only) with Gate 1 user approval. Emits the route name directly as `outcome`. Routes to prd-writer / trd-writer / task-writer per harness-flow.yaml.
---

# Brainstorming

## Purpose

Brainstorming is the harness's **intake skill**. It owns two responsibilities that used to live in two skills:

1. **Clarify the request** — when router routes `clarify`, drive a tight Q&A loop until the request has enough signal to classify and to draft.
2. **Classify into a route** — pick `prd-trd` / `prd-only` / `trd-only` / `tasks-only`, then absorb **Gate 1** (user approval before artifact creation).

The skill never proposes solutions, never writes specs, and never drafts code. Its product is a single route payload that downstream writers (`prd-writer` / `trd-writer` / `task-writer`) can trust.

## Why one skill, not two

Splitting "ask questions" and "pick a tier" leaks responsibility: the classifier ends up asking its own clarifying questions, and the brainstorming step asks questions whose answers the classifier ignores. Both phases also share pivot/exit-casual handling and both are multi-turn main-thread conversations. Folding them together gives the user one intake conversation, one approval, one handoff.

## Input

Runs in the main thread with live conversation context. Payload from router:

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `request`: the user's original turn, verbatim, any language
- `route`: `"clarify"` | `"plan"` | `"resume"` — mirror of `router.output.outcome`. Determines whether the Q&A phase runs.
- `resume`: `true` when `route == "resume"` (Step 0 short-circuits)

No other skills call this one. No other payload fields.

## Output

Every run ends with **one** of six terminal payloads. The final message of the skill is a single JSON object whose `outcome` field carries the route name (or a terminal signal). No nested `classification` field — main thread evaluates `when:` expressions in `harness-flow.yaml` against the `outcome` string directly.

**Route outcome** — `outcome` is the route name (`prd-trd`, `prd-only`, `trd-only`, or `tasks-only`):

```json
{
  "outcome": "prd-trd",
  "session_id": "2026-04-19-...",
  "request": "...",
  "brainstorming_output": {
    "intent": "add|fix|refactor|migrate|remove|other",
    "target": "...",
    "scope_hint": "single-file|subsystem|multi-system",
    "constraints": ["..."],
    "acceptance": "..."
  },
  "next": "prd-writer"
}
```

Routing per `harness-flow.yaml` (`next` is the **immediate** downstream node — main thread re-derives the rest after each writer completes):

- `prd-trd` → `next: "prd-writer"` (full chain: prd-writer → trd-writer → task-writer)
- `prd-only` → `next: "prd-writer"` (full chain: prd-writer → task-writer)
- `trd-only` → `next: "trd-writer"` (full chain: trd-writer → task-writer)
- `tasks-only` → `next: "task-writer"`

`brainstorming_output` may be `null` when router handed off `plan` directly and the Q&A phase was skipped (intent inferred from request verb only).

**Pivot** — user turned away from this request mid-intake. Dispatcher leaves the session as-is; router fires on the next turn:

```json
{ "outcome": "pivot", "session_id": "2026-04-19-...", "reason": "user asked about dashboard UI mid-intake", "next": null }
```

**Casual re-classified** — it became clear the user was asking a question, not requesting work. Dispatcher drops and lets router handle the next turn:

```json
{ "outcome": "exit-casual", "session_id": "2026-04-19-...", "reason": "user was browsing, not requesting work", "next": null }
```

The skill writes to session files only on route outcomes (`prd-trd` / `prd-only` / `trd-only` / `tasks-only`) — see Step B5. The `Last activity` line in `STATE.md` is updated on every outcome (trace). ROADMAP is untouched on `pivot` / `exit-casual`.

## Process flow

```
                         ┌───────────────────────────────┐
                         │ Step 0 — resume short-circuit │
                         └──────────────┬────────────────┘
                                        │
                         ┌──────────────┴──────────────┐
                         │ route == "clarify"?          │
                         └──────────────┬──────────────┘
                            yes         │           no (plan/resume)
              ┌─────────────────────────┘                       │
              ▼                                                 │
┌──────────────────────────────────────┐                       │
│ Phase A — Clarify (Q&A loop)          │                       │
│   A1. extract + scope assess          │                       │
│   A2. ask missing fields (1/turn)     │                       │
│   A3. early exit on user "skip"       │                       │
│   A4. confirm clarification           │                       │
└─────────────────────┬────────────────┘                       │
                      │                                         │
                      └────────────────┬────────────────────────┘
                                       ▼
            ┌──────────────────────────────────────────┐
            │ Phase B — Classify + Gate 1               │
            │   B1. signal detection                    │
            │   B2. file-count estimate                 │
            │   B3. tier determination                  │
            │   B4. tasks-only self-verification        │
            │   B5. Gate 1 — present recommendation     │
            │   B6. handle response (accept/override)   │
            │   B7. commit + emit route payload         │
            └───────────────────────────────────────────┘
```

## Procedure

### Step 0 — Resume short-circuit

If `resume: true`, read `.planning/{session_id}/ROADMAP.md`. If it contains a `Complexity: X` line (X ∈ prd-trd / prd-only / trd-only / tasks-only) **and** the `brainstorming` phase is `[x]`, do **not** re-intake. Emit a route payload that points downstream to the next incomplete phase per `harness-flow.yaml` and end. Rationale: re-asking the user "which route?" when they already decided it last session wastes a turn and erodes trust.

If `resume: true` but classification is missing (e.g., session was interrupted mid-Gate-1), proceed normally — skip Phase A (router only picks `resume` when prior signal is sufficient) and start Phase B.

### Phase A — Clarify (only when `route == "clarify"`)

If `route == "plan"` or `route == "resume"`, **skip Phase A entirely** and start at B1. Router decided the request had enough signal; re-asking would duplicate work.

#### A1 — Extract, then assess scope

Before asking anything, do both in order:

**(a) Fill from what the request already gives you.** Read `request` and tentatively fill the actionability checklist (`intent`, `target`, `scope_hint`, `constraints`, `acceptance`) from what the user already said. Ask only about genuine gaps. Asking a question whose answer is already in the request is the most common failure mode of a clarifying step. If the user wrote "refactor the DB layer for clarity", `intent=refactor` and `target=DB layer` are already filled — don't re-ask.

**(b) Assess scope — one session or many?** If the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), **flag this immediately** before spending field questions on it. Propose decomposition:

> "This looks like several distinct sub-projects: {list}. One session should own one coherent piece. Which one do you want to start with? The others can be separate sessions."

If the user picks one, update `request` in the payload to describe just that sub-project and proceed. The other sub-projects become future sessions — router will fire fresh on each one.

If the user insists on tackling all of it as one session, proceed but record `constraints: ["deliberately-wide-scope"]` so Phase B leans toward `prd-trd`.

Skip the scope check for obviously single-scope requests — don't ask "is this one project?" for "fix the login timeout bug".

#### A2 — Ask the missing fields, one at a time

Priority order — **first unfilled field wins, but only after re-running A1(a) on the latest answer.** A single user reply often fills multiple fields at once (e.g., "refactor session handling for clarity" fills intent + target + partial scope). After every user turn, re-extract from the whole conversation before choosing the next question. Don't walk the list top-to-bottom blindly.

1. **intent** — usually inferable, but when ambiguous: "Sounds like this is about {candidate}. Which fits best?" Offer MC: add / fix / refactor / migrate / remove / other. If the user's verb genuinely fits none of the five, record `intent: "other"` **and** append `"intent-freeform: <verb>"` to `constraints` so Phase B can see the original verb.
2. **target** — "Which part of the codebase does this touch?" Open-ended, or MC if plausible candidates are visible.
3. **scope_hint** — "Is this contained to one place, one subsystem, or does it ripple across systems?" MC: single-file / subsystem / multi-system.
4. **constraints** — ask *only* when there is a plausible constraint you can name from context. Example for auth changes: "Any backward-compat requirement for existing sessions?" Do not fish for constraints with generic prompts.
5. **acceptance** — "How will we know this is done?" Open-ended.

Rules:

- **One question per turn.** Never batch. A wall of questions is the anti-pattern we are avoiding.
- **Prefer multiple choice** when plausible options exist. Users answer MC faster and more precisely than open-ended.
- **Mirror the user's language** in questions and confirmations — the skill's rules and field names stay English, but the conversation follows the user. If they write Korean, ask in Korean.
- **YAGNI on questions.** Only ask what's needed to classify and draft. If an answer wouldn't change the route or the writer's first draft, don't ask it.
- **Stop when required fields are filled.** Optional fields empty is fine.

#### A3 — Early exit

If the user says anything like "just start", "go ahead", "skip it", "whatever, you decide" — stop asking immediately and proceed to Phase B with whatever is filled. Record skipped fields in `STATE.md` under `Last activity` so downstream knows the payload is thin:

```
Last activity: 2026-04-19 13:44 — brainstorming clarify exit (user-skip); missing: acceptance
```

Thin payload is not a failure — it is a user signal that they want velocity over precision. Phase B and writers handle thin payloads by asking their own narrow questions at the moment the missing info becomes blocking.

#### A4 — Confirm, then proceed

When the required checklist is complete, send **one short confirmation** in the user's language:

> "Got it — {intent} {target}, {scope_hint}. {constraint summary if any}. {acceptance if stated}. Now picking a route."

The confirmation is its own message — do not bundle the route recommendation with it. On the **next** user turn:

- Accept ("yes", "looks good", silence/no correction) → proceed to Phase B (start at B1).
- Correct a field → loop back to A2 for *that field only* and re-confirm. Revising ≠ restarting; do not re-ask fields they already answered correctly.
- Pivot or reveal it was a question → emit `pivot` / `exit-casual` payload (see Edge cases) and end.

### Phase B — Classify + Gate 1

#### B1 — Signal detection

Two kinds of signals:

**(a) Path signals — literal, language-agnostic.** Scan `request`, `target`, and `constraints` for these file-path patterns:

- `auth/`, `security/` — authentication/authorization
- `schema.*`, `*/schema/` — DB or API schemas
- `migrations/` — DB migrations
- `package.json`, `*/package.json` — dependency/version changes
- `config.ts`, `*.config.*` — global configuration

Paths are filesystem literals — match them the same in any language. Record hits as `signals_matched: ["path:auth/", ...]`.

**(b) Keyword signals — semantic, multilingual.** Detect whether the request semantically refers to any of these concepts: authentication, login, password, session, database, schema, migration, configuration, dependency. These are concepts, not literal strings — "로그인", "認証", "authentification" all count as the auth/login concept. Use judgment, not a fixed keyword table. Record hits as `signals_matched: ["keyword:login", "keyword:dependency", ...]`.

**(c) `deliberately-wide-scope` constraint** (Phase A's flag when the user insisted on multi-subsystem scope): implicit `prd-trd` signal. Record as `signals_matched: ["constraint:deliberately-wide-scope"]`.

#### B2 — File-count estimate

Produce a single integer N — best-guess total of modified + newly created files.

Calibration:

- Typo / format / comment-only → 1
- Single-subsystem bug fix → 1–3
- One new endpoint or page → 2–4
- Feature across multiple layers → 5–12
- Cross-cutting migration or framework swap → 10–30+

Don't overthink this. One rough integer is enough — the user can override in B6. If the request is too vague to estimate at all (and Phase A didn't run to pin `target`), pick 3 as a neutral default and flag low confidence in the Gate 1 message.

#### B3 — Tier determination

Apply in order:

1. Any entry in `signals_matched` → **prd-trd candidate** regardless of file count.
2. Otherwise, by intent:
   - `add` / `create` + N ≥ 5 → **prd-trd**
   - `add` / `create` + N < 5 → **prd-only**
   - `refactor` / `migrate` / `remove` → **trd-only**
   - `fix` + N ≤ 2 → **tasks-only candidate** (must pass B4)
   - `other` with `intent-freeform` in constraints → parse the freeform verb: refactor-ish → trd-only, fix-ish → tasks-only candidate, create/add-ish → prd-trd if N ≥ 5 else prd-only. Unparseable → prd-only.
   - `other` or intent missing (no freeform hint) → **prd-only** (conservative — lightweight PRD costs less than wrong route).

#### B4 — tasks-only self-verification

Only runs when B3 yielded a tasks-only candidate. Check all four:

- [ ] Clearly a bug fix, typo, formatting, or comment-level change?
- [ ] Estimated files ≤ 2?
- [ ] No security/architecture signal matched?
- [ ] No "design needed" cues in the request (new terminology, ambiguous intent, mention of a new concept)?

**Any fail → promote to prd-only** (a minimal PRD is cheap insurance). All pass → tasks-only stays. Rationale: "simple" projects are where unexamined assumptions cause the most wasted work. This gate exists to stop the model from rationalising its way past design.

#### B5 — Gate 1 — present recommendation

Send **one** user-facing message as its own turn, in the user's language, with this shape:

> "Recommend **{route}** ({expansion}). Estimated {N} files. {signals summary or 'no security/architecture signals.'} Proceed?"

Examples:

- `"Recommend prd-only (PRD → Tasks). Estimated 3 files, no security signals. Proceed?"`
- `"Recommend prd-trd (PRD → TRD → Tasks). Estimated 4 files, touches auth/ (security-sensitive). Proceed?"`
- `"Recommend tasks-only. Typo fix, 1 file, no signals. Skip design and go straight to tasks?"`

This message is standalone — do **not** bundle the output JSON with it. Offer MC implicitly: accept / change route / adjust file count. Do not batch more than this — signals + file count + route is the whole decision surface. Then wait for the user's next turn.

#### B6 — Handle the response (next user turn)

On the **next** user turn, classify the response into one of four actions:

- **Accept** ("yes", "proceed", silence/no-correction) → go to B7 with the current route. `user_overrode: false`.
- **Route override** ("make it prd-trd" / "just do tasks-only") → go to B7 with the user's route. `user_overrode: true`. Do not argue — the user is the final authority.
- **File-count override** ("more like 10 files") → re-run B3 with the new N and loop back to B5 **once only** with the new recommendation. This is the only loop allowed; a second file-count change uses the second value without another recomputation-then-ask.
- **Pivot or casual** — see Pivot handling below.

Do **not** ask clarifying questions about `intent` / `target` / `scope_hint` here — that was Phase A's job. If those fields are missing and feel load-bearing, pick the conservative route (prd-only for add-like, trd-only for refactor-like) and hand off; the writer will surface gaps at its own layer.

**Pivot handling.** If the user asks about an unrelated topic or drops this request entirely, emit `{"outcome": "pivot", ...}` as the terminal payload and end the skill with one sentence: "This looks like a new request; stepping back to routing." Do **not** update ROADMAP/STATE. If instead the user's response reveals they were asking a question about tiers rather than requesting classified work, emit `{"outcome": "exit-casual", ...}` and end with a one-line acknowledgement.

#### B7 — Commit + emit (route outcome path only)

On acceptance (including override):

1. **Update `ROADMAP.md`**:
   - Add / update the line `Complexity: {route} ({expansion})` near the top.
   - Mark `- [ ] brainstorming` → `- [x] brainstorming    → {route} (approved)`. If `user_overrode`, use `→ {route} (overridden from {recommended-route})` instead. The user_overrode bit lives on this single row — there is no separate `gate-1-approval` checkbox (Gate 1 is absorbed into brainstorming, so a second row would be redundant).
2. **Update `STATE.md`**:
   - `Current Position: {next phase per harness-flow.yaml}`
   - `Last activity: {ISO timestamp} — classified as {route}{, user-overrode if applicable}`
3. **Resolve `next`** — perform the next-node lookup per `using-harness § Core loop` steps 3–5 against this skill's outgoing edges. The resolution table is fixed by the route → first-listed-candidate rule:
   - `prd-trd` / `prd-only` → `prd-writer`
   - `trd-only` → `trd-writer`
   - `tasks-only` → `task-writer`
   - `pivot` / `exit-casual` → `null` (no edge matches)
4. **Emit the route payload** as the final message — `outcome` is the route name (`prd-trd`/`prd-only`/`trd-only`/`tasks-only`) and `next` is the resolved downstream node id. Main thread evaluates `when:` expressions in `harness-flow.yaml` and dispatches the correct writer agents (cross-checking against `next`).

## What this skill does NOT do

- Propose solutions, approaches, or tradeoffs. That's `prd-writer` / `trd-writer`.
- Write specs, design docs, or plans. Those are downstream artifacts.
- Read the codebase, except the minimum needed to disambiguate a target name (e.g., confirm that a file the user named actually exists). If even this requires more than two tool calls, stop and ask the user instead.
- Estimate LOC or test coverage — these are request-time unknowns and not part of the classification signal.
- Promote tier at runtime based on actual diff — runtime promotion is not in scope here.
- Dispatch the next agent directly — main thread reads the emitted `outcome` and follows `harness-flow.yaml` transitions.
- Read the codebase to estimate file count — the estimate is from the request alone. If the request is genuinely unknowable without code reading, default to N=3 and flag low confidence.
- Re-ask questions the user already answered in-turn.

## Conversation shape

**Good — clarify path, full intake into trd-only:**

> User: "make the auth code better"
> Brainstorming: "What kind of change are you thinking? (fix a bug / refactor for clarity / improve performance / migrate to something new)"
> User: "refactor for clarity"
> Brainstorming: "Which part — session handling, password reset, JWT issuance, or broader?"
> User: "session handling"
> Brainstorming: "Scope: contained to the session module, or will it ripple into callers?"
> User: "just the module"
> Brainstorming: "Got it — refactor session handling, subsystem-scoped. Now picking a route."
> User: "ok"
> Brainstorming: "Recommend **trd-only** (TRD → Tasks). Estimated 3 files, no security signals. Proceed?"
> User: "yes"
> Brainstorming: [commits ROADMAP, emits `{"outcome": "trd-only", ...}`]

**Good — plan path (skip Phase A), signal promotion to prd-trd:**

> Router output: `{outcome: "plan", request: "add 2FA to login", session_id: "..."}`
> Brainstorming: [skips Phase A; B1 hits `auth/` + `keyword:login`]
> Brainstorming: "Recommend **prd-trd** (PRD → TRD → Tasks). Estimated 4 files, touches `auth/` (security-sensitive). Proceed?"
> User: "yeah"
> Brainstorming: [commits, emits `{"outcome": "prd-trd", ...}`]

**Good — tasks-only self-check fails, demoted to prd-only:**

> Request: "fix the expired-session bug in login"
> intent: fix, N=2 — tasks-only candidate → B1 hits `auth/` → promoted to prd-only
> Brainstorming: "Initially looked like a tasks-only fix, but it touches `auth/` — recommending **prd-only** (PRD → Tasks) instead. 2 files. Proceed, or escalate to prd-trd?"

**Good — user overrides route:**

> Brainstorming: "Recommend prd-only …"
> User: "Nah, just tasks-only, it's one line"
> Brainstorming: "Got it — tasks-only, user override. Skipping design. Proceeding to task-writer."
> [commits with `user_overrode: true`]

**Good — catching multi-project scope before drilling into fields:**

> User: "build a complete CRM — leads, deals, reporting, email integration, and mobile app"
> Brainstorming: "This looks like several distinct sub-projects: leads/deals management, reporting, email integration, mobile app. One session should own one coherent piece — which do you want to start with? The others can be separate sessions."

**Bad — batched questions:**

> Brainstorming: "I need to know: (1) intent, (2) target, (3) scope, (4) constraints, (5) acceptance criteria. Please provide all five."

**Bad — proposing approaches (not this skill's job):**

> Brainstorming: "Here are three approaches: A) rename only, B) extract functions, C) rewrite from scratch. Which do you prefer?"

**Bad — re-asking what the request already said:**

> User request: "fix the login timeout bug in src/auth/session.ts"
> Brainstorming: "What kind of change is this?"
> (intent, target, and scope are all obvious from the request — skip straight to acceptance or route recommendation)

**Bad — silent commit (Gate 1 must be explicit):**

> Brainstorming: [writes ROADMAP without asking user]

**Bad — arguing with user override:**

> User: "just do tasks-only"
> Brainstorming: "Are you sure? It's touching auth/, I recommend prd-trd. Shall I reconsider?" ← the user has already decided; log `user_overrode: true` and move on

## Edge cases

- **User pivots mid-conversation** to an unrelated request (e.g., was clarifying auth refactor, suddenly asks about dashboard UI): emit `{"outcome": "pivot", ...}` as the terminal payload and end with one sentence — "This looks like a new request; stepping back to routing." Router will fire on the next user turn and allocate a fresh session.
- **User answers Phase A with new ambiguity** (e.g., "touches auth, but also something in billing"): absorb it into `scope_hint: multi-system` without a follow-up question — the ambiguity itself is informative.
- **User gives irrelevant Phase A answer** (e.g., answering the "scope" MC with a code snippet): quote the question once and re-ask. If the second answer is also off, set `scope_hint: multi-system` as the conservative default and move on — over-asking is worse than over-escalating scope.
- **Request is actually casual** (becomes clear after one round that the user was asking a question, not requesting work): emit `{"outcome": "exit-casual", ...}` and end with a one-sentence acknowledgment. Log `Last activity: brainstorming exit (reclassified-casual)`.
- **User decomposes voluntarily** (e.g., "yeah, let's start with leads, do deals next"): acknowledge, capture the chosen sub-project as `request`, and note the follow-ups in `constraints` as `"followup-sessions: deals, reporting"`.
- **Router → plan direct** (Phase A skipped): infer `intent` from the first verb in `request`. If none obvious, default to `add`. Don't ask the user — keep the flow terse.
- **Resume with existing classification** (Step 0): emit a route payload pointing to the next `[ ]` phase. Do not re-ask Gate 1.
- **Conflicting signals** (e.g., `migrations/` + "one-line typo"): err toward prd-trd. The cost of over-scoping a trivial migration is a 5-minute PRD; the cost of under-scoping one is a broken schema.
- **User gives file count but no route verdict** ("maybe 8 files?"): recompute route silently and present the new recommendation once more.
- **User names a non-existent route** ("prd-tasks, please"): re-ask once with the four options. If still unclear, use the recommended route.
- **`intent: "other"` with `intent-freeform` constraint**: inspect the freeform verb — refactor-ish → trd-only, fix-ish → tasks-only candidate, create-ish → prd-trd/prd-only. Unparseable → prd-only.

## Boundaries

- Writes only to `ROADMAP.md` (Complexity line + two checkboxes) and `STATE.md` (Current Position + Last activity). No other files.
- Hands off only via `harness-flow.yaml` routing — never invokes a writer agent directly.
- No re-invoking router. If the user's pivot warrants a new session, end this skill; router fires on the next turn.
- Skill internals (route names, signal list, checklists, field names, this document) stay English. User-facing prompts and confirmations mirror the user's language.
- One file-count recomputation in B6 is the entire retry budget. Beyond that, accept the user's value and move on.
