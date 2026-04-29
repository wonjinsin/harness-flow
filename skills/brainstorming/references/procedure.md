# Brainstorming — Full Procedure

The complete Q&A protocol referenced from `SKILL.md`. Step 0 → Phase A (A1–A4) → Phase B (B1–B7).

## Step 0 — Resume short-circuit

If `resume: true`, check `.planning/{session_id}/brainstorming.md` first. If the file exists and contains `user approved: yes` under `## Recommendation`, do **not** re-intake — read the route off the file's `## Recommendation` block, end the turn with the standard route terminal message (`## Status: {route}` + `## Path: .planning/{session_id}/brainstorming.md` + "Proceeding to {next-skill}."). Main thread dispatches the writer for the next incomplete phase per the "Required next skill" markers. Rationale: re-asking the user "which route?" when they already decided it last session wastes a turn and erodes trust.

Fallback: if `brainstorming.md` is missing but `.planning/{session_id}/ROADMAP.md` contains a `Complexity: X` line (X ∈ prd-trd / prd-only / trd-only / tasks-only) **and** the `brainstorming` phase is `[x]`, treat the session as approved at that route, write `brainstorming.md` from the available state (use `- (skipped — resumed without prior file)` for `## A1.6 findings`), and emit the route terminal message. This covers sessions started before the file-based handoff existed.

If `resume: true` but classification is missing entirely (e.g., session was interrupted mid-Gate-1), proceed normally — skip Phase A (router only picks `resume` when prior signal is sufficient) and start Phase B.

## Phase A — Clarify (only when `route == "clarify"`)

If `route == "plan"` or `route == "resume"`, **skip Phase A entirely** and start at B1. Router decided the request had enough signal; re-asking would duplicate work.

### A1 — Extract, then assess scope

Before asking anything, do both in order:

**(a) Fill from what the request already gives you.** Read `request` and tentatively fill the actionability checklist (`intent`, `target`, `scope_hint`, `constraints`, `acceptance`) from what the user already said. Ask only about genuine gaps. Asking a question whose answer is already in the request is the most common failure mode of a clarifying step. If the user wrote "refactor the DB layer for clarity", `intent=refactor` and `target=DB layer` are already filled — don't re-ask.

**(b) Assess scope — one session or many?** If the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), **flag this immediately** before spending field questions on it. Propose decomposition:

> "This looks like several distinct sub-projects: {list}. One session should own one coherent piece. Which one do you want to start with? The others can be separate sessions."

If the user picks one, treat the chosen sub-project as the working `request` (it lands under `## Request` in `brainstorming.md` at B7) and proceed. The other sub-projects become future sessions — router will fire fresh on each one.

If the user insists on tackling all of it as one session, proceed but record `constraints: ["deliberately-wide-scope"]` so Phase B leans toward `prd-trd`.

Skip the scope check for obviously single-scope requests — don't ask "is this one project?" for "fix the login timeout bug".

### A1.5 — Pick mode: explore or intake

After A1(a) extraction and A1(b) scope assessment, decide which sub-phase runs first:

- **A-intake** (default): If A1(a) yielded at least one of `intent` or `target` from the request, skip A-explore and run **A1.6 first** (codebase peek), then A2. Most clarify-routed requests land here — "make the auth code better" already pins target=auth, even though intent is fuzzy.
- **A-explore**: Run when **both** `intent` and `target` are unfillable from the request, OR the user explicitly signals idea-stage ("아직 고민 중", "뭘 만들지 모르겠어", "I'm exploring", "not sure yet", "AI로 뭔가 해보고 싶은데 …"). The premise itself is the gap — asking field-by-field would feel like an interrogation before the user knows what they want. A1.6 fires once explore converges on intent + target.

The mode is an internal routing decision; the user does not need to know the modes exist. The conversation should feel like one continuous Q&A.

### A-explore — Diverge, then converge

Goal: surface enough about the **problem space** that intake mode can start. **Not** to propose solutions.

Allowed prompts:

- Open questions about motivation — "What pain point sparked this?" / "어떤 문제가 이걸 시작하게 했어요?"
- Problem-space neighbours — "Internal tool or user-facing?" / "혼자 쓸 거예요, 팀에 배포할 거예요?"
- 2–3 direction-mapping multiple choice — high-level *shape categories*, NOT implementations:
  - ✓ "Sounds like notifications — push, email, or in-app?"
  - ✓ "이메일 자동화라면 — 초안만 보조하는 건지, 자동 발송까지 가는 건지?"
  - ✗ "Use Pub/Sub vs cron vs polling?" — implementation choice, prd-writer / trd-writer's job.
  - ✗ "Should we use Postgres or MongoDB?" — same.

Procedure:

1. Ask one open or direction-mapping question per turn, in the user's language.
2. After every user reply, re-run A1(a) on the cumulative conversation. Did `intent` or `target` emerge?
3. When **both** intent and target are reasonably pinned (you could write a one-line summary the user would agree with), confirm convergence as a standalone message in the user's language:
   > "그러면 결국 {intent} {target} 방향이네요. 이제 나머지 디테일 잡아갈게요."
   > or "Sounds like we're building {target} to {intent}. Let me pin down the rest."
4. On the next turn, run **A1.6 (codebase peek)** before A2 — but **do not re-ask anything already touched in explore**. Pre-fill what you can; only ask the remaining unfilled fields.

Stuck after ~3 rounds without convergence:

- Ask directly — "Hard to pick a single direction? We can prototype one and defer the others to later sessions."
- If still no convergence, propose the most concrete direction discussed and proceed. Note `constraints: ["explore-forced-pick: <direction>"]` so the writer knows the foundation is thin.

Early exit and pivot apply identically:

- "그냥 시작해줘" / "skip" / "you decide" → A3 (early exit). Jump to Phase B with whatever fields are filled (thin `## Brainstorming output` — log in STATE).
- User pivots to an unrelated topic → end with the `pivot` terminal block (no file written), router fires next turn.

Boundary that keeps explore safe in this skill (crossing the line erodes the brainstorming → writer separation):

| Layer | Explore mode | Out of scope (writers) |
| --- | --- | --- |
| Problem space | category, user, trigger, why-now | — |
| Solution shape | what *kind* of thing (tool / dashboard / pipeline / bot) | — |
| Implementation | — | library, framework, architecture, file structure |

### A1.6 — Scoped codebase peek

Run once intent + target are pinned. Skip only when the request has no resolvable target (pure UX decision, brand-new external integration with no local analog) — proceed straight to A2; at B7 the `## A1.6 findings` section in `brainstorming.md` carries the body `- (skipped — no resolvable target)`.

**Tool budget: ~10 Read/Grep/Glob calls.** Peek, not design pass. Stop the moment the question is answered.

Goals after this step:

1. **Target confirmed** — the named file/module exists; the function name is the actual identifier (or note both forms in `key_findings` when paraphrased).
2. **Code-visible constraints surfaced** — existing schemas, auth flows, public interfaces other code depends on. Becomes A2 Q&A material.
3. **Signals detected** — `auth/`, `migrations/`, `schema.*` etc. populate `code_signals` for B1.
4. **Obvious mismatches caught** — user says "add" but the function exists; "small change" but call sites are 12. Flag in A2 as a question, don't decide silently.

Typical spend: 1–2 Glob/Grep to locate, 2–4 Read on target + immediate deps (relevant ranges only), 2–3 Grep for callers if `scope_hint` could be `subsystem`/`multi-system`. Budget exhausted without resolving target → stop, log the limitation in `open_questions`, let A2 ask the user directly.

This step is **not** for designing the solution, counting LOC, proposing implementation choices, or modifying files — see SKILL.md "Out of scope" for the full boundary.

Output: draft A1.6 findings held in working memory, finalised at B7, written into the `## A1.6 findings` section of `.planning/{session_id}/brainstorming.md`:

```markdown
## A1.6 findings
- files visited: src/auth/session.ts:42-78, src/auth/middleware.ts
- key findings:
  - issueSession() in src/auth/session.ts:42 — currently issues without TOTP check
  - middleware.ts:18 reads Bearer token only — no MFA hook
- code signals: auth/, schema:session
- open questions:
  - Should refresh tokens be revoked on TOTP enable?
```

`code signals` lists path patterns AND concept-level signals (auth/login/schema/migration/config/dependency) the code visibly involves. `open questions` here = things the **user** should answer in A2 or Gate 1 — distinct from PRD/TRD/TASKS Open questions (those are for human review of the written doc).

After A1.6, transition to A2.

### A2 — Ask the missing fields, one at a time

**Reference A1.6 findings when relevant.** Questions land better when grounded in concrete code: instead of "what's the scope?", ask "I see `issueSession` is called from `login.ts`, `oauth.ts`, and `refresh.ts` — does this change need to update all three or just login?" The user can correct your reading of the code in the same turn that they answer the field. Findings also let you skip questions whose answers are now visible (e.g., don't ask "single-file or subsystem?" when A1.6 already shows three callers).

Promote A1.6 open-question items to A2 questions when they are blocking — the user is the cheapest place to resolve them.

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

### A3 — Early exit

If the user says anything like "just start", "go ahead", "skip it", "whatever, you decide" — stop asking immediately and proceed to Phase B with whatever is filled. Record skipped fields in `STATE.md` under `Last activity` so downstream knows `brainstorming.md` will be thin:

```
Last activity: 2026-04-19 13:44 — brainstorming clarify exit (user-skip); missing: acceptance
```

A thin file is not a failure — it is a user signal that they want velocity over precision. Phase B and writers handle thin `## Brainstorming output` sections by asking their own narrow questions at the moment the missing info becomes blocking.

### A4 — Confirm, then proceed

When the required checklist is complete, send **one short confirmation** in the user's language:

> "Got it — {intent} {target}, {scope_hint}. {constraint summary if any}. {acceptance if stated}. Now picking a route."

The confirmation is its own message — do not bundle the route recommendation with it. On the **next** user turn:

- Accept ("yes", "looks good", silence/no correction) → proceed to Phase B (start at B1).
- Correct a field → loop back to A2 for *that field only* and re-confirm. Revising ≠ restarting; do not re-ask fields they already answered correctly.
- Pivot or reveal it was a question → end with the `pivot` / `exit-casual` terminal block (see Edge cases); no file written.

## Phase B — Classify + Gate 1

### B1 — Signal detection

Three kinds of signals:

**(a) Path signals — literal, language-agnostic.** Scan `request`, `target`, `constraints`, and the A1.6 `code signals` (held in working memory pre-B7) for these file-path patterns:

- `auth/`, `security/` — authentication/authorization
- `schema.*`, `*/schema/` — DB or API schemas
- `migrations/` — DB migrations
- `package.json`, `*/package.json` — dependency/version changes
- `config.ts`, `*.config.*` — global configuration

Paths are filesystem literals — match them the same in any language. Record hits as `signals_matched: ["path:auth/", ...]`. A1.6 may have already noted hits in `code_signals` — those count without re-grepping.

**(b) Keyword signals — semantic, multilingual.** Detect whether the request semantically refers to: authentication, login, password, session, database, schema, migration, configuration, dependency. Concepts not literal strings — "로그인", "認証", "authentification" all count as auth/login. Record hits as `signals_matched: ["keyword:login", ...]`.

**(c) `deliberately-wide-scope` constraint** (Phase A's flag when the user insisted on multi-subsystem scope): implicit `prd-trd` signal. Record as `signals_matched: ["constraint:deliberately-wide-scope"]`.

### B2 — File-count estimate

Single integer N — best-guess modified + newly created files. When A1.6 visited any files, use that count as floor; extrapolate for callers/tests not yet visited.

Calibration (rough — file count alone never decides tier, only nudges):

- Typo / format / comment-only → 1
- Single-subsystem bug fix → 1–3
- One new endpoint or page → 2–4
- Feature across multiple layers → 5–12
- Cross-cutting migration / framework swap → 10–30+

Don't overthink — user overrides in B6. If too vague to estimate (Phase A didn't run, no `target`), default to 3 and flag low confidence in Gate 1.

### B3 — Tier determination

Apply in order:

1. Any entry in `signals_matched` → **prd-trd candidate** regardless of file count.
2. Otherwise, by intent:
   - `add` / `create` + N ≥ 5 → **prd-trd**
   - `add` / `create` + N < 5 → **prd-only**
   - `refactor` / `migrate` / `remove` → **trd-only**
   - `fix` + N ≤ 2 → **tasks-only candidate** (must pass B4)
   - `other` with `intent-freeform` in constraints → parse the freeform verb: refactor-ish → trd-only, fix-ish → tasks-only candidate, create/add-ish → prd-trd if N ≥ 5 else prd-only. Unparseable → prd-only.
   - `other` or intent missing (no freeform hint) → **prd-only** (conservative — lightweight PRD costs less than wrong route).

### B4 — tasks-only self-verification

Only runs when B3 yielded a tasks-only candidate. Check all four:

- [ ] Clearly a bug fix, typo, formatting, or comment-level change?
- [ ] Estimated files ≤ 2?
- [ ] No security/architecture signal matched?
- [ ] No "design needed" cues in the request (new terminology, ambiguous intent, mention of a new concept)?

**Any fail → promote to prd-only** (a minimal PRD is cheap insurance). All pass → tasks-only stays. Rationale: "simple" projects are where unexamined assumptions cause the most wasted work. This gate exists to stop the model from rationalising its way past design.

### B5 — Gate 1 — present recommendation

**One** user-facing message as its own turn, in the user's language:

> "Recommend **{route}** ({expansion}). Estimated {N} files. {signals summary or 'no security/architecture signals.'} Proceed?"

Examples:

- `"Recommend prd-only (PRD → Tasks). Estimated 3 files, no security signals. Proceed?"`
- `"Recommend prd-trd (PRD → TRD → Tasks). Estimated 4 files, touches auth/ (security-sensitive). Proceed?"`
- `"Recommend tasks-only. Typo fix, 1 file, no signals. Skip design and go straight to tasks?"`

Standalone message — don't bundle the terminal status block. Offer MC implicitly (accept / change route / adjust file count). Wait for next turn.

### B6 — Handle the response (next user turn)

Classify into one of four:

- **Accept** ("yes", "proceed", silence) → B7, `user_overrode: false`.
- **Route override** ("make it prd-trd") → B7 with user's route, `user_overrode: true`. Don't argue.
- **File-count override** ("more like 10 files") → re-run B3 with new N, loop back to B5 **once only**. Second change uses the value without another recomputation.
- **Pivot or casual** — end with the pivot / exit-casual terminal block (`## Status: pivot|exit-casual` + `## Reason: …`); no `brainstorming.md` written. "This looks like a new request; stepping back to routing." vs "Was a question, not work." Do NOT update ROADMAP/STATE on pivot.

Do **not** re-ask `intent` / `target` / `scope_hint` here — Phase A's job. Missing and load-bearing → pick conservative route (prd-only for add-like, trd-only for refactor-like); writer surfaces gaps later.

### B7 — Commit + write file + emit terminal message (route outcome path only)

On acceptance (including override):

1. **Update `ROADMAP.md`**:
   - Add / update the line `Complexity: {route} ({expansion})` near the top.
   - Mark `- [ ] brainstorming` → `- [x] brainstorming    → {route} (approved)`. If `user_overrode`, use `→ {route} (overridden from {recommended-route})` instead. The user_overrode bit lives on this single row — there is no separate `gate-1-approval` checkbox (Gate 1 is absorbed into brainstorming, so a second row would be redundant).
2. **Update `STATE.md`**:
   - `Current Position: {next phase — the route name implies the writer}`
   - `Last activity: {ISO timestamp} — classified as {route}{, user-overrode if applicable}`
3. **Write `.planning/{session_id}/brainstorming.md`** to disk with the mandatory structure (see SKILL.md "Terminal message" or `../../harness-contracts/output-contract.md`):

   ```markdown
   # Brainstorming — {session_id}

   ## Request
   "{user's verbatim request}"

   ## A1.6 findings
   - files visited: {file:line, ...}
   - key findings:
     - {finding 1}
     - {finding 2}
   - code signals: {signal-1, signal-2}
   - open questions:
     - {question 1}

   ## Brainstorming output
   - intent: {add|fix|refactor|migrate|remove|other}
   - target: {short phrase}
   - scope: {single-file|subsystem|multi-system}
   - constraints:
     - {constraint 1}
   - acceptance: {one sentence}

   ## Recommendation
   - route: {prd-trd|prd-only|trd-only|tasks-only}
   - estimated files: {N}
   - user approved: yes
   ```

   When A1.6 was skipped, the body of `## A1.6 findings` is the single line `- (skipped — no resolvable target)`. `user approved: yes` is mandatory — the file is written only after Gate 1 acceptance in B6.

4. **End the turn** with the route terminal message:

   ```markdown
   ## Status
   {prd-trd|prd-only|trd-only|tasks-only}

   ## Path
   .planning/{session_id}/brainstorming.md

   Proceeding to {next-skill}.
   ```

   The main thread reads `## Status` to dispatch per SKILL.md's "Required next skill" table; the writer reads `brainstorming.md` from disk.
