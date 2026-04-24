---
name: brainstorming
description: Use this whenever router hands off `clarify` — even for requests that feel small enough to guess at. Drives a tight Q&A loop until the request has enough signal for complexity-classifier to pick a tier and for downstream writers to draft. Scope stops at a structured payload for the next phase; design and spec live in prd-writer / trd-writer.
---

# Brainstorming

## Purpose

Router delivers `clarify` requests — the user clearly wants work done, but the router cannot tell *what work* from the turn alone. This skill owns exactly one job: **ask the user just enough questions to fill a checklist of actionability criteria, then hand off to `complexity-classifier`.** Nothing more.

This is not design brainstorming. It does not propose approaches, write design docs, or evaluate tradeoffs — those belong to `prd-writer` / `trd-writer`. The product here is a structured payload, not a spec.

## Why this exists

Without a clarification step, the router's `clarify` bucket would leak straight into `complexity-classifier`, which would either pick the wrong tier from thin signal or ask its own clarifying questions — duplicating responsibility and bloating classifier. Centralizing the "what does the user actually want?" conversation here means downstream stages can trust the payload they receive.

## Input

This skill runs in the main thread, so it has live conversation context. Payload from router:

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `request`: the user's original turn, verbatim, any language

No other skills call this one. No other payload fields.

## Output

Every run ends with **one** of three terminal payloads. The final message of the skill is a single JSON object tagged by `outcome`.

**Clarified** — the normal handoff to `complexity-classifier`:

```json
{
  "outcome": "clarified",
  "session_id": "2026-04-19-...",
  "request": "...",
  "intent": "add|fix|refactor|migrate|remove|other",
  "target": "...",
  "scope_hint": "single-file|subsystem|multi-system",
  "constraints": ["..."],
  "acceptance": "..."
}
```

- `intent`, `target`, `scope_hint` are **required**.
- `constraints` is an array — empty if the user surfaced none.
- `acceptance` is preferred but not required; use `null` if the user declined to specify.
- `request` is the original user turn verbatim — downstream writers re-read it for nuance the structured fields drop.

**Pivot** — user turned away from this request mid-clarification. Dispatcher leaves the session as-is; router fires on the next turn:

```json
{ "outcome": "pivot", "session_id": "2026-04-19-...", "reason": "user asked about dashboard UI mid-clarification" }
```

**Casual re-classified** — after one round it became clear the user was asking a question, not requesting work. Dispatcher drops and lets router handle the next turn:

```json
{ "outcome": "exit-casual", "session_id": "2026-04-19-...", "reason": "user was browsing, not requesting work" }
```

The skill writes the `STATE.md` `Last activity` line on all three outcomes (trace). ROADMAP is untouched by brainstorming.

## Process flow

```
┌─────────────────────────────────┐
│ Step 1 — extract + assess scope │
└─────────────┬───────────────────┘
              │
     ┌────────┴────────┐
     │ multi-project?  │──yes──▶ propose decomposition
     └────────┬────────┘              │
              │no                     │ user picks sub-project
              ▼                       ▼
┌─────────────────────────────────────────┐
│ Step 2 — ask missing fields (1/turn)    │◀─┐
└─────────────┬───────────────────────────┘  │
              │                              │
    ┌─────────┴──────────┐                   │
    │ user says "skip"?  │──yes──▶ Step 3 early exit
    └─────────┬──────────┘                   │
              │no                            │
              ▼                              │
      ┌───────────────┐                      │
      │ required set  │──no──────────────────┘
      │ filled?       │
      └───────┬───────┘
              │yes
              ▼
┌──────────────────────────────────┐
│ Step 4 — confirm + emit payload  │
└──────────────────────────────────┘
```

## Procedure

### Step 1 — Extract, then assess scope

Before asking anything, do both in order:

**(a) Fill from what the request already gives you.** Read `request` and tentatively fill the checklist from what the user already said. Ask only about genuine gaps. Asking a question whose answer is already in the request is the most common failure mode of a clarifying step. If the user wrote "refactor the DB layer for clarity", `intent=refactor` and `target=DB layer` are already filled — don't re-ask.

**(b) Assess scope — is this one session or many?** If the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), **flag this immediately** before spending field questions on it. Propose decomposition to the user:

> "This looks like several distinct sub-projects: {list}. One session should own one coherent piece. Which one do you want to start with? The others can be separate sessions."

If the user picks one, update `request` in the payload to describe just that sub-project and proceed. The other sub-projects become future sessions — router will fire fresh on each one.

If the user insists on tackling all of it as one session, proceed but record `constraints: ["deliberately-wide-scope"]` so `complexity-classifier` knows to lean toward prd-trd.

Skip the scope check for obviously single-scope requests — don't ask "is this one project?" for "fix the login timeout bug".

### Step 2 — Ask the missing fields, one at a time

Priority order — **first unfilled field wins, but only after re-running Step 1(a) on the latest answer.** A single user reply often fills multiple fields at once (e.g., "refactor session handling for clarity" fills intent + target + partial scope). After every user turn, re-extract from the whole conversation before choosing the next question. Don't just walk the list top-to-bottom.

1. **intent** — usually inferable, but when ambiguous: "Sounds like this is about {candidate}. Which fits best?" Offer MC: add / fix / refactor / migrate / remove / other. If the user's verb genuinely fits none of the five, record `intent: "other"` **and** append `"intent-freeform: <verb>"` to `constraints` so downstream can see the original verb.
2. **target** — "Which part of the codebase does this touch?" Open-ended, or MC if plausible candidates are visible.
3. **scope_hint** — "Is this contained to one place, one subsystem, or does it ripple across systems?" MC: single-file / subsystem / multi-system.
4. **constraints** — ask *only* when there is a plausible constraint you can name from context. Example for auth changes: "Any backward-compat requirement for existing sessions?" Do not fish for constraints with generic prompts.
5. **acceptance** — "How will we know this is done?" Open-ended.

Rules:

- **One question per turn.** Never batch. A wall of questions is the anti-pattern we are avoiding.
- **Prefer multiple choice** when plausible options exist. Users answer MC faster and more precisely than open-ended.
- **Mirror the user's language** in questions and confirmations — the skill's rules and field names stay English, but the conversation follows the user. If they write Korean, ask in Korean.
- **YAGNI on questions.** Only ask what's needed to route and draft. If an answer wouldn't change downstream routing or the writer's first draft, don't ask it.
- **Stop when required fields are filled.** Optional fields empty is fine.

### Step 3 — Early exit

If the user says anything like "just start", "go ahead", "skip it", "whatever, you decide" — stop asking immediately and hand off with whatever is filled. Record skipped fields in `STATE.md` under `Last activity` so downstream knows the payload is thin:

```
Last activity: 2026-04-19 13:44 — brainstorming exit (user-skip); missing: acceptance
```

Thin payload is not a failure — it is a user signal that they want velocity over precision. Classifier and writers handle thin payloads by asking their own narrow questions at the moment the missing info becomes blocking.

### Step 4 — Confirm, then emit (`outcome: "clarified"` path)

When the required checklist is complete, send **one short confirmation** in the user's language:

> "Got it — {intent} {target}, {scope_hint}. {constraint summary if any}. {acceptance if stated}. Passing to classifier."

The confirmation is its own message — do not bundle the JSON with it. On the **next** user turn, if they accept ("yes", "looks good", silence/no correction), emit the `clarified` payload as your message and end the skill. If they correct a field, loop back to Step 2 for *that field only* and re-confirm — do not re-ask fields they already answered correctly. Revising ≠ restarting. If instead the user pivots or reveals they were only asking a question, emit the `pivot` or `exit-casual` payload (see Edge cases) and end.

## What this skill does NOT do

- Propose solutions, approaches, or tradeoffs. That's `prd-writer` / `trd-writer`.
- Decide or negotiate complexity tier. That's `complexity-classifier`.
- Write specs, design docs, or plans. Those are Phase 4 artifacts.
- Read the codebase, except the minimum needed to disambiguate a target name (e.g., confirm that a file the user named actually exists). If even this requires more than two tool calls, stop and ask the user instead.
- Update `ROADMAP.md`. This skill only writes the `Last activity` line in `STATE.md` for trace.
- Re-ask questions the user already answered in-turn.

## Conversation shape

Good — one question at a time, MC preferred, ends in a short confirmation:

> User: "make the auth code better"
> Brainstorming: "What kind of change are you thinking? (fix a bug / refactor for clarity / improve performance / migrate to something new)"
> User: "refactor for clarity"
> Brainstorming: "Which part — session handling, password reset, JWT issuance, or broader?"
> User: "session handling"
> Brainstorming: "Scope: contained to the session module, or will it ripple into callers?"
> User: "just the module"
> Brainstorming: "Got it — refactor session handling, subsystem-scoped. Passing to classifier."

Good — catching multi-project scope before drilling into fields:

> User: "build a complete CRM — leads, deals, reporting, email integration, and mobile app"
> Brainstorming: "This is several distinct sub-projects: leads/deals management, reporting, email integration, mobile app. One session should own one coherent piece — which do you want to start with? The others can be separate sessions."

Bad — batched questions:

> Brainstorming: "I need to know: (1) intent, (2) target, (3) scope, (4) constraints, (5) acceptance criteria. Please provide all five."

Bad — proposing approaches (not this skill's job):

> Brainstorming: "Here are three approaches: A) rename only, B) extract functions, C) rewrite from scratch. Which do you prefer?"

Bad — re-asking what the request already said:

> User request: "fix the login timeout bug in src/auth/session.ts"
> Brainstorming: "What kind of change is this?"
> (intent, target, and scope are all obvious from the request — skip straight to acceptance or exit)

## Edge cases

- **User pivots mid-conversation** to an unrelated request (e.g., was clarifying auth refactor, suddenly asks about dashboard UI): emit `{"outcome": "pivot", ...}` as the terminal payload and end with one sentence — "This looks like a new request; stepping back to routing." Router will fire on the next user turn and allocate a fresh session.
- **User answers with new ambiguity** (e.g., "touches auth, but also something in billing"): absorb it into `scope_hint: multi-system` without a follow-up question, since the ambiguity itself is informative.
- **User gives irrelevant answer** (e.g., answering the "scope" MC question with a code snippet): quote the question once and re-ask. If the second answer is also off, set `scope_hint: multi-system` as the conservative default and move on — over-asking is worse than over-escalating scope.
- **Request is actually casual** (becomes clear after one round that the user was asking a question, not requesting work): emit `{"outcome": "exit-casual", ...}` as the terminal payload with a one-sentence acknowledgment. Log `Last activity: brainstorming exit (reclassified-casual)`.
- **User decomposes voluntarily** (e.g., "yeah, let's start with leads, do deals next"): acknowledge, capture the chosen sub-project as `request`, and note the follow-ups in `constraints` as `"followup-sessions: deals, reporting"` — the user asked for velocity, not scope negotiation.

## Boundaries

- No code writes. No file creation beyond the `STATE.md` `Last activity` update.
- No handoff except to `complexity-classifier` via the output payload.
- No re-invoking router. If the user's pivot warrants a new session, end this skill; router fires on the next turn.
- Skill internals (rules, field names, examples, this document) stay English. User-facing prompts and confirmations mirror the user's language.
