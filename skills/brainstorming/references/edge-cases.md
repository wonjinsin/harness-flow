# Brainstorming — Edge Cases

Edge-case handling referenced from `SKILL.md`.

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

## A1.6 (codebase peek) edge cases

- **A1.6 finds the named target doesn't exist** (e.g., user says "fix `createSession`" but Grep finds only `issueSession`): record both the user's term and the actual identifier in `key_findings`, log the mismatch in `open_questions`, and surface it as an A2 question — "I see `issueSession` in the code but no `createSession`. Did you mean that, or is `createSession` somewhere I haven't looked?" Do not silently rewrite the user's vocabulary; the writer needs the trail.
- **A1.6 budget exhausted before the target is located**: stop. Record `open_questions: ["target <name> not located within ~10 calls — needs user disambiguation"]` and ask directly in A2 — "I couldn't find <name> in the obvious places. Could you point me to the file or directory?" Do not silently start a second round of exploration.
- **A1.6 surfaces a scale mismatch** (user says "small change" but Grep finds 12 callers): note in `key_findings`, surface in A2 — "이 변경이 12곳에서 호출되는 함수를 건드려요. 모두 같이 가나요, 일부는 그대로 두나요?" Let the user reconcile; don't quietly upgrade the route.
- **Request has no resolvable codebase target** (pure UX decision, brand-new external integration with no local analog, pure documentation): skip A1.6 entirely. Emit `exploration_findings: null`. Note the reason in `STATE.md` `Last activity` so writers know to fall back to their own larger Step 2 budgets.
- **A1.6 finds an obvious bug in the target**: record in `open_questions` for the user to decide ("이 함수가 null 체크를 빼먹는데, 이번 변경에 같이 묶을까요 별도 세션으로 뺄까요?"). Do not modify code; brainstorming never edits.
- **User contradicts an A1.6 finding** (claims a function exists that Grep doesn't find, or vice versa): keep both views in `open_questions` rather than picking one. The writer will resolve at file-read time, but only if the discrepancy survives in the payload.
- **A1.6 detects path/keyword signals not present in the request text** (e.g., user says "speed up checkout" but the target file imports `migrations/`): add to `code_signals` — B1 will pick them up regardless of the request text. This is the main argument for running A1.6 before B1.
