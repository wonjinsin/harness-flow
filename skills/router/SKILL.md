---
name: router
description: Always run first at the start of a user turn unless another harness skill is mid-flow with a named next skill. Classifies the request as casual (reply inline as plain prose), clarify (brainstorming will Q&A), plan (brainstorming has enough signal), or resume (matched against an existing `.planning/` session). Bootstraps the session slug and `.planning/{session_id}/` skeleton on fresh plan/clarify routes.
model: haiku
---

# Router

## Purpose

Every user request enters the harness through this skill. The router answers three questions, in order:

1. **Is this a resume of prior work?** If yes → hand off to the matching session's ROADMAP.
2. **Is this trivial chat or a direct factual question?** → classify as `casual`, reply inline, end.
3. **Is this actionable work?** → classify as `clarify` (requirements unclear) or `plan` (requirements clear).

The router never writes code and never executes tasks. It only decides **where the request goes next**.

Internal rules and prompts stay English-only; the LLM understands non-English user input fine.

## Execution mode

Main context — see `../../harness-contracts/execution-modes.md`. Router runs inline because `.planning/` scaffold creation and session-slug confirmation need the live conversation.

## Why three routes

- **casual** exists so small talk and meta-questions don't drag through session allocation, planning, and downstream skills. A user saying "hi" or "what can you do" shouldn't create a `.planning/` directory.
- **plan** is the normal path for work requests with enough signal to proceed — a verb, a target, and enough criteria for `brainstorming` to pick a tier without re-asking.
- **clarify** is the release valve for requests where the user clearly wants work done but the router cannot tell *what work* without asking. The router does not ask those questions itself; `brainstorming` owns that conversation.

When in doubt between **plan** and **clarify**, prefer **clarify** — one extra round-trip is cheaper than a plan built on guessed requirements.

## When to use

Trigger this skill as the very first step of every user turn. Skip only when another harness skill is mid-flow and has named a different next skill.

## Procedure

### Step 1 — Resume detection

A resume cue requires **both** a resume verb and a reference to prior work. See "Anaphoric resume signals" below for what counts as a prior-work reference and why bare resume verbs without anaphor don't qualify.

If both signals are present:

1. Read `.planning/`. If the directory doesn't exist, there are no sessions — fall through to fresh-session flow.
2. For each subdirectory, read `ROADMAP.md`. Keep only sessions with at least one `- [ ]` unchecked item.
3. Match the request against candidates using slug similarity plus overlap with the session's goal/title.
4. **One match** → load that session. Emit `## Status: resume` with `## Session: {session_id}`. Brainstorming's Step 0 short-circuits and jumps to the next incomplete phase.
5. **Multiple matches** → ask the user to pick. Format: `{slug} — {one-line goal}`.
6. **No match, or user rejects the proposed match** → fall through to fresh-session flow.

### Step 2 — casual / clarify / plan classification

Apply the heuristics in "Classification signals" and "False-positive traps" below. `references/keywords.md` lists narrow regex hints that match unambiguous cases; everything else relies on reading the definitions and applying judgment.

When ambiguous between **plan** and **clarify**, choose **clarify**.

### Step 3 — Session slug (fresh sessions only)

Format: `YYYY-MM-DD-{slug}`.

1. Extract a concept from the request. Prefer the direct object of the main verb (e.g., "add 2FA to login" → `add-2fa-login`).
2. Lowercase, ASCII-only, hyphens between words, ≤ 40 chars.
3. Confirm with the user, in English: `Use session id "{date}-{slug}"?`
4. On silence → proceed with the proposal. On rejection → use the user's edit verbatim (re-slug if needed).
5. **Collision**: if `.planning/{date}-{slug}/` already exists, append `-v2`, `-v3`, … until free.

### Step 4 — Scaffold (fresh sessions only)

Create the session directory with skeletons:

```
.planning/{session-id}/
├── ROADMAP.md      ← from templates/roadmap.md, phase count TBD
└── STATE.md        ← from templates/state.md, position = Phase 1 ready to plan
```

Leave the files empty of task content. Downstream skills (`prd-writer`, `trd-writer`, `task-writer`) fill them in.

### Step 5 — Emit

The terminal message uses standard markdown sections (`## Status`, `## Session`). **For `casual`, skip the markdown sections entirely** — reply to the user in plain prose and end.

| Outcome | Terminal message |
|---------|------------------|
| `casual` | plain prose reply, no headers |
| `clarify` | `## Status: clarify` + `## Session: {session_id}` |
| `plan` | `## Status: plan` + `## Session: {session_id}` |
| `resume` | `## Status: resume` + `## Session: {session_id}` |

`resume` is its own status — not a boolean flag on `plan`. When Step 1 matches an existing session, emit `## Status: resume`; otherwise `## Status: plan`.

How the main thread reads `## Status` and dispatches `brainstorming` with a short prompt is documented in `../../harness-contracts/payload-contract.md` under "router → brainstorming".

## Classification signals

### casual

**Positive signals** — at least one must hold:

- Greeting or small talk (`hi`, `hello`, `hey`, `yo`).
- Meta-question about the harness itself ("what can you do", "how do I use this").
- Pure factual lookup with no execution request ("what's a closure in JS?", "what does NOT NULL mean").
- Yes/no confirmation of the router's own last question.
- A question *about* an action verb ("how do I add …", "why does fix fail") — asking for information, not issuing a command.

**Negative signals** — presence suggests not casual:

- Imperative verb with named target pointing at this codebase.
- Explicit acceptance criteria ("should …", "must …").
- Reference to an error, failing test, or broken state expecting repair.

### plan

**Positive signals** — at least one must hold:

- Imperative verb + named target in this codebase ("add 2FA to login", "fix src/auth.ts:42", "refactor the DB layer").
- Explicit acceptance criteria phrased as "should …" / "must …".
- Reference to a failing test, error message, or stack trace paired with repair intent.

**Negative signals** — presence suggests not plan:

- Question form ("how do I", "what happens if") → casual.
- Past or subjunctive tense ("I already added …", "we would fix it if …") → casual or clarify.
- No named target paired with vague evaluation ("make it better") → clarify.

### clarify

**Positive signals** — at least one must hold:

- Work verb with no clear object ("make it better", "clean it up", "improve the code").
- Conflicting or underspecified requirements ("fast but also thorough", "simple but full-featured").
- Reference to "the bug", "that feature", "the issue" with no prior context pinning it down.
- Imperative present but target is ambiguous between multiple plausible referents.

**Negative signals** — presence suggests not clarify:

- Target is unambiguous in the conversation context → plan.
- No execution intent at all → casual.

### Boundary cases

| Input | Route | Why |
|-------|-------|-----|
| `fix the login bug`                                   | plan    | Named target + imperative |
| `fix the bug`                                         | clarify | Target unpinned, no prior context |
| `how do I fix a login bug?`                           | casual  | Question form, no execution intent |
| `add JWT auth to /login in src/api.ts`                | plan    | Imperative + named file + named feature |
| `make the auth code better`                           | clarify | Vague evaluation, no concrete criterion |
| `I already added 2FA, what's next?`                   | casual  | Status report, no execution intent |
| `what's the difference between JWT and sessions?`     | casual  | Pure factual question |
| `the spec says "add 2FA", what do you think?`         | casual  | Discussing a reference, not issuing it |

## False-positive traps

Action words (`add`, `fix`, `refactor`, `implement`, `migrate`) inside the following contexts do **not** count as user intent. A keyword that appears only in these positions should not move the classification toward `plan`.

1. **Fenced code blocks** — ```` ``` ```` or inline `` `…` ``. Code examples contain action verbs as identifiers or sample code, not commands.
2. **Block quotes** — lines starting with `>`. The user is referencing someone else's text.
3. **Quoted strings** — `"add 2FA"` inside a larger sentence like `the spec says "add 2FA"` is a reference, not a command.
4. **File paths and identifiers** — `src/add-user.ts` contains "add" but isn't a command.
5. **Echoed instruction text** — if two or more review-outcome labels (approve / request-changes / blocked / merge-ready) appear in the first 20 lines, the prompt is reviewing instructions, not issuing them.
6. **Slash command echoes** — `run /fix` mentions a command rather than invoking it.
7. **Past or subjunctive tense** — "I already added …", "we would refactor if …" are status reports, not requests.
8. **Question forms** — "how do I add …", "why does fix fail?" ask about a verb, they don't invoke it.

Principle: the signal is **action intent directed at this turn**, not mention of an action word. When unsure, ask: "If I treat this as a plan, does the user actually want work to start now?" If no, downgrade to `casual` or `clarify`.

## Anaphoric resume signals

A resume verb (`resume`, `continue`, `pick up where`, `keep going on`, `go back to`) needs a prior-work reference — an explicit slug, named feature, or temporal/demonstrative/process anaphor pointing at past work. Examples: "continue the 2FA work from yesterday", "pick up where we left off on that auth bug".

Bare resume verbs with no anaphor default to current-turn continuation (e.g. user says "continue" right after assistant proposes an action).

## Input

Router is the entry point — no upstream skill calls it, so there is no cross-skill dispatch prompt to consume. Its operational inputs are:

- **Current turn** — the user's request, in any language.
- **Prior-turn transcript** — used only to disambiguate bare resume verbs (see "Anaphoric resume signals"). Router does not read beyond the current conversation.
- **`.planning/`** — scanned during Step 1 resume detection.

Router runs in the main thread and has full access to the live conversation context. This is intentional: detecting whether `continue` means "resume prior session" vs "continue what you just said" requires seeing the assistant's previous turn. Downstream agent-dispatched skills do not have this access and must be driven by an explicit dispatch prompt.

## Output

Two terminal-message modes depending on the route:

**casual** — respond to the user directly as plain prose and end the skill. No status headers, no downstream flow. Example response: *"I'm a task-oriented harness — you describe a change, I plan it, break it into tasks, and help you execute. What would you like to work on?"*

**clarify / plan / resume** — the final message uses standard markdown sections (`## Status`, `## Session`). No surrounding prose.

Sections:

- `## Status` — single line value: `clarify`, `plan`, or `resume`
- `## Session` — single line value: `YYYY-MM-DD-slug`

### Examples

Input: `hi claude, what can you build?` — casual: router replies with plain prose. No status headers emitted.

Input: `add 2FA to login`

```markdown
## Status
plan

## Session
2026-04-19-add-2fa-login
```

Input: `make the auth code better`

```markdown
## Status
clarify

## Session
2026-04-19-improve-auth
```

Input: `let's continue the 2FA work from yesterday` (match found in `.planning/2026-04-18-add-2fa-login/`)

```markdown
## Status
resume

## Session
2026-04-18-add-2fa-login
```

## Required next skill

The next skill depends on `## Status` (full handoff contract: `../../harness-contracts/payload-contract.md` § "router → brainstorming"):

- `## Status: clarify | plan | resume` → **REQUIRED SUB-SKILL:** Use harness-flow:brainstorming
  Dispatch (main context — Skill, not Task): `Skill(brainstorming, args: "session_id={id} request={text} route={status} resume={true|false}")`. The route arg carries the router's `## Status` value verbatim; `resume=true` only when status is `resume`.
- `## Status` absent (casual) → no headers emitted; flow does not engage. Reply directly to the user and stop.

## Keyword catalogue

See `references/keywords.md` for the deterministic keyword catalogue used by Step 2.

## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md`. Router creates the empty `ROADMAP.md` / `STATE.md` skeletons in Step 4 and never modifies them after — downstream skills own subsequent writes.
- Do not plan, decompose, or write code here. Those belong to `brainstorming`, `prd-writer`, `trd-writer`, `task-writer`.
- Do not ask clarifying questions beyond session-slug confirmation and multiple-match disambiguation. Any other ambiguity is for `brainstorming`.
