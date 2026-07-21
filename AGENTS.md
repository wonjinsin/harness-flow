# AGENTS.md

Canonical guidance for **harness-flow** — the single source of truth for every harness. Codex and other agents read this file natively; Claude Code loads it through `CLAUDE.md` (which is just `@AGENTS.md`). Map any generic mechanism (skill loading, task tracking, subagent dispatch, file edits) to your harness's native tool.

## What This Repo Is

`harness-flow` is a Claude Code plugin that ships a personal **skills library**.

The repo is simultaneously:

- A plugin (`.claude-plugin/plugin.json`)
- Its own marketplace (`.claude-plugin/marketplace.json` points `source: ./`)

So the same checkout can be installed locally as a plugin for testing.

**Cross-harness (Claude Code + Codex).** The repo is also a Codex plugin: `.codex-plugin/plugin.json` mirrors the Claude manifest (same name/version), `.agents/plugins/marketplace.json` is the Codex marketplace. This `AGENTS.md` is the canonical guidance both harnesses share — Codex reads it directly, and the repo's `CLAUDE.md` is a one-line `@AGENTS.md` import so Claude Code loads the same content. Both harnesses read the **same** `hooks/hooks.json` (`CLAUDE_PLUGIN_ROOT` is a Codex compat alias) — do NOT duplicate hooks per harness. Skill bodies are written in **harness-neutral** wording rather than shipping per-harness tool-translation files.

## The Skill Chain (architectural backbone)

Skills under `skills/` are designed to be invoked **in order**. A new Claude instance must understand this chain before touching skill content — editing one link affects the whole flow.

**Routing (by request type, no tier system).** `using-harness-flow` routes every request before the chain starts: code work (feature/refactor/script) → `brainstorming`; a bug/test-failure/unexpected-behavior → `systematic-debugging` (the parallel track below). There is no trivial/standard tier classifier — a "small" middle tier and the trivial/standard split were both built, A/B-evaled, and removed (see `design/2026-07-10-size-classifier-retrospective.md` before re-attempting).

**Spec is optional (Model B).** `brainstorming` recommends an exit and the user picks: **small/clear** → implement directly with `test-driven-development` (self-review the whole diff at the end, since this path skips the plan and the final whole-branch review); **large/ambiguous** → save a spec, then a plan. No `<HARD-GATE>`, no forced spec file, no separate approval loop.

**Negative-record re-challenges:** a proposal recorded as rejected in a `design/*retrospective*.md` may be re-attempted ONLY with (a) a mechanism that directly defends against the recorded failure mode and (b) a fresh pre-registered eval that passes the original gate — precedent: P5 (streak gating, 6/8 fail) re-challenged same-day as final-only review + severity floor, 6/6 pass (`design/2026-07-16-review-removal-retrospective.md`).

1. `using-harness-flow` — bootstrap, injected at SessionStart. Enforces "invoke a skill before any response, even 1% applicability." Routes by request type (above).
2. `brainstorming` — turns an idea into an agreed approach through dialogue, then recommends an exit (Model B above). The large exit saves a spec at `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md`.
3. `using-git-worktrees` — isolates the workspace. Step 0 detects existing isolation (linked worktree, submodule guard); Step 1a defers to native worktree tools (`EnterWorktree` etc.); Step 1b is the manual `git worktree add` fallback (sibling directory default).
4. `writing-plans` — produces an implementation plan at `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` as bite-sized, tracer-bullet TDD tasks (`### Task N` with Delivers / Touches / Blocked by / acceptance checkboxes — no line numbers, no code blocks). Preserves the human-approval gate ("Iterate until the user approves; after the user approves, hand off to implement"). No Task-Group / dispatch machinery.
5. `implement` — executes an approved plan/spec **inline** in the current session on the session's model (one commit per task, TDD). Optionally isolates a single task in ONE sequential general-purpose subagent (never for parallelism; set the model tier explicitly on that dispatch). Before the final review, runs a **completeness check** (each plan task's declared Touches actually changed) so an inline run can't silently drop a task. **Always** ends with one fresh-context whole-branch review via `requesting-code-review` on the most-capable model, routing findings by class: plan/spec wrong → escalate to the human; implementation defect → fix (inline or one fix subagent) → re-review, capped at 3 re-reviews. Replaces the former `subagent-driven-development` (dispatch/ledger/scripts machinery all removed).
6. `test-driven-development` — sub-skill each implementer (inline or subagent) follows (Red → Verify red → Green → Verify green → Refactor).
7. `requesting-code-review` — dispatch a `general-purpose` code reviewer subagent (template at `requesting-code-review/code-reviewer.md`) on the most-capable model. The template's Calibration carries a **severity floor** (rate by consequence, not surface form) to counter demotion of consequential findings at the single final review.
8. `llm-md-revise` — invoked **after the final code review** in `implement` (default ON), and **conditionally after a verified `systematic-debugging` fix** — in both cases *before* `finishing-a-development-branch`, so approved edits land in the branch. Surfaces session-derived knowledge (user corrections, "always/never" rules, project facts, anti-patterns, external-system references) and applies it as per-candidate diffs to the **active harness's** project instruction surface (Codex → `AGENTS.md`, Claude Code → `CLAUDE.md`; following an `@import` stub to the real file) or a project `rules/*.md`. Reads user-scope files (`~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`) for de-duplication only, never writes to them — surfaces a proposal instead.
9. `finishing-a-development-branch` — Step 1: verify tests. Steps 2–3: detect environment & base branch. Step 4: present a 4-option menu (merge locally / push & PR / keep / discard). Steps 5–6: execute & cleanup. Cleanup depends on whether harness-flow created the worktree.

The chain ends when `finishing-a-development-branch` completes.

`pr-creator` is a helper skill for Option 2 of `finishing-a-development-branch` (create a PR).

**Worktree/subagent gotcha:** when `implement` isolates a task in a subagent from inside a git worktree, the dispatched subagent may execute in the **main repo checkout** (on the base branch), not the worktree — so its `git commit` lands on the wrong branch. After the subagent reports DONE, verify the commit is on the feature branch (`git log` in the worktree); if it landed on the main checkout, cherry-pick it onto the feature branch and `git reset` the main checkout back.

## Parallel Track: Bug Fixing

`systematic-debugging` is **not** part of the linear chain above — it's an
orthogonal entry point for bug/test-failure/unexpected-behavior tasks.

- Trigger: any technical issue (bug, test failure, performance, build failure)
- Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
- Four phases: Root Cause → Pattern Analysis → Hypothesis → Implementation
- Joins the main chain only at Phase 4 Step 1, where it invokes
  `harness-flow:test-driven-development` to write the failing test before fixing
- Supporting files: `root-cause-tracing.md`, `defense-in-depth.md`,
  `condition-based-waiting.md`

When the user describes a symptom (not a feature), enter via systematic-debugging
instead of brainstorming.

## Hooks (Node.js, Claude Code + Codex compatibility)

Four hooks (2 SessionStart + 2 PreToolUse guards). All require Node.js 18+ and have zero npm dependencies. Registered in `hooks/hooks.json` via `${CLAUDE_PLUGIN_ROOT}`. Disable all hooks with `HARNESS_FLOW_HOOKS_OFF=1`.

Hooks are the plugin's ONLY guard-distribution mechanism: plugins cannot ship `permissions.allow/deny/ask` rules (plugin `settings.json` supports only the `agent` and `subagentStatusLine` keys — code.claude.com/docs/en/plugins-reference). Do not propose "move this pattern to permissions" for plugin-shipped guards; declarative deny rules belong in the user's own settings as a complementary layer.

### `hooks/session-start-harness.js` — SessionStart

Reads `skills/using-harness-flow/SKILL.md` and emits `hookSpecificOutput.additionalContext` JSON to inject session context. Matcher: `startup|resume|clear|compact`.

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start-harness.js`

### `hooks/session-start-caveman.js` — SessionStart

Reads `skills/caveman/SKILL.md` and emits it as `additionalContext` wrapped in `<EXTREMELY_IMPORTANT>` tags, mirroring `session-start-harness.js`. Pre-activates caveman mode (token-efficient terse responses) at every session boundary. User can disable mid-session with "stop caveman" / "normal mode". Matcher: `startup|resume|clear|compact`.

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start-caveman.js`

### `hooks/pre-bash-commands.js` — PreToolUse(Bash)

Destructive-action and cloud-CLI guard. Conservative: high-confidence-malicious only.
On block, emits Claude Code's `hookSpecificOutput.permissionDecision: 'deny'`
JSON and exits 0 with `systemMessage` instructing the LLM to stop and ask
the user — do NOT retry with a workaround.

Patterns (see `PATTERNS` in the file):

- `--no-verify` (bypassing pre-commit hooks)
- `rm -rf /|~|$HOME|.`
- pipe-to-shell (`curl|wget|fetch … | sh|bash|...`)
- `gcloud` / `aws` CLI calls (user authorization required)
- `gh auth token` (prints GitHub token; matched anywhere in the string so `$(...)` substitution is caught)
- `security find-generic/internet-password` (macOS Keychain password read; same anywhere-match)

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/pre-bash-commands.js`

### `hooks/pre-secrets.js` — PreToolUse(Read|Edit|Write|MultiEdit|Bash|apply_patch)

Secret-file access guard. Single hook, single `PATTERNS` array (path-shape).
Dispatch by `tool_name`:

- `Read|Edit|Write|MultiEdit` → match `tool_input.file_path` directly against `PATTERNS` (ALLOWLIST first)
- `Bash` → split `tool_input.command` on whitespace + shell separators, then apply the same matcher to each token

Posture: any reference to a secret-bearing path is blocked — read (`cat .env`), write (`echo X > .env`), move (`mv ~/.aws/credentials …`), edit (`vim ~/.ssh/id_rsa`), or stage (`git add .env`). No reader-verb whitelist: the file is treated as untouchable. Trade-off: descriptive uses like `echo "use .env file"` are also blocked; deemed acceptable because the deny message instructs the LLM to stop and ask.

ALLOWLIST skips `.env.example`/`.sample`/`.template`/`.schema`/`.defaults` for both Bash and file tools.

Same deny-JSON + exit-0 contract as `pre-bash-commands.js`. Families (see `PATTERNS` in the file):

- `.env` (any variant)
- SSH private keys (`id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`; `.pub` excluded)
- `~/.aws/credentials`
- `~/.config/gcloud/*credentials|tokens|adc|application_default*`
- GCP service-account JSON
- `*.pem` / `*.key` key material (block-all; no public-cert allowlist — filenames don't prove a cert is public)
- `~/.netrc`

Both hooks share `hooks/lib/guard.js` (`emitDeny` + `runGuard` parameterized by `kind`/`getValue`).

**Codex:** the matcher includes `apply_patch` (Codex's file-edit tool). Its `tool_input` is a patch body, not a `file_path`, so the dispatch routes it through `getPatch` (`lib/payload.js`) — which reads `input`/`command` or, on an unknown field name, joins all string values with real newlines (fail-safe, never fail-open) — then reuses `matchBashCommand`'s tokenizer so patch-header paths (`*** Update File: .env`) are caught.

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/pre-secrets.js`

### Hook registration env var conventions

- Plugin install → `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}`, auto-injected by Claude Code's plugin runtime.
- User settings (`~/.claude/settings.json`) → use `$HOME` (POSIX-standard).
- Project settings (`<project>/.claude/settings.json`) → use `$CLAUDE_PROJECT_DIR` (officially supported). Relative paths are not safe — hook CWD is unspecified.

### Hook code conventions

CommonJS (`require`), `'use strict'` at top, `node:*` built-ins only. stderr messages in English (LLM-readable). An external linter auto-formats JS files (notably converts single → double quotes) — don't fight it.

## Cross-Platform Tool Names

Skills use Claude Code tool names (`Task`/`Agent`, `TodoWrite`, `Skill`) only where a concrete dispatch template needs them; skill **bodies** are written in harness-neutral wording so Codex and other harnesses map the generic mechanism to their native tool. There are no per-harness tool-translation reference files.

**Exception — the entry skill.** `skills/using-harness-flow/SKILL.md` is injected at SessionStart on every harness, before anything else can be consulted, so naming one harness's tools there would misinstruct the others. It uses harness-neutral wording (e.g. "native skill loading"). `tests/manifest/codex-runtime-contracts.test.js` pins this — it asserts the entry skill does NOT contain `TodoWrite`.

**Dispatch templates are the opposite case.** `code-reviewer.md` names `Claude Code Agent (general-purpose)` explicitly and carries a separate **Codex translation** block (`spawn_agent`, `fork_turns: none`, `task_name: final_review`), because hooks/tests match its strings verbatim.

## No design/ references inside skills

**Never cite `design/*` (retrospectives, analyses, specs) from inside a skill file (`SKILL.md`, `*-prompt.md`, or any skill-shipped doc).** Skills ship to users as runtime instructions; a `design/…retrospective.md §N` pointer is dead weight there — the file may be gitignored, absent from an installed plugin, or just noise the model can't act on. Keep the *rule* in the skill, stated as a rule; keep its *rationale/provenance* in `design/` and in this CLAUDE.md. When porting a rule out of a design doc into a skill, strip the citation. (`grep -rn "design/" skills/` must stay empty.)

## Common Operations

- **Add a skill**: create `skills/<name>/SKILL.md` with frontmatter `name:` and `description:`. The `description` is the auto-invocation trigger — write it as a precise activation condition (when to use, not what it does), matching the tone of existing skills.
- **Edit a skill**: invoke `harness-flow:writing-skills` first — it applies to `SKILL.md` files and skill prompt templates (e.g. `*-prompt.md`). Do not break the chain order above; keep cross-references (e.g. `harness-flow:writing-plans`) stable.
- **Reinstall plugin locally for testing**: use Claude Code's plugin/marketplace commands; the marketplace `source: "./"` lets the repo install itself.
- **Run tests**: `node --test` (Node 18+ built-in runner; hook unit/smoke tests, manifest/runtime-contract tests, and skill-script tests).
- **Add a hook**: register in `hooks/hooks.json`, gate on `HARNESS_FLOW_HOOKS_OFF=1`, add unit tests for any new `lib/`, add a smoke test that spawns the hook with `spawnSync('node', [SCRIPT], { input: JSON.stringify(payload) })` and asserts on `status`/`stderr`.
- **Add a dangerous pattern**: destructive/CLI actions go in `hooks/pre-bash-commands.js` (`PATTERNS`), secret-file access goes in `hooks/pre-secrets.js` (single `PATTERNS` array). Add match + non-match cases in the matching `tests/hooks/*.test.js`.

## Output Paths

Skills produce artifacts lazily inside the active worktree (not the repo root):

- `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md` (brainstorming large-exit output)
- `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` (writing-plans output)

**In this repo `docs/harness-flow/` is gitignored** — specs/plans are per-feature working artifacts and are not committed; durable records (retrospectives, analyses) get promoted to `design/` instead. Do not `git add -f` a spec or plan.

## Licensing

Several skills are derived/adapted from prior MIT-licensed work (superpowers, mattpocock/skills, caveman); the repo also studies other harnesses for the comparison. All upstream copyright notices are consolidated in `design/reference/THIRD-PARTY-LICENSES.md` (there are no per-skill `NOTICE` files).

## See Also

- `design/2026-05-05-comparison.md` — 7-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers / matt-pocock-skills). Explains why this plugin sits in "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives + `THIRD-PARTY-LICENSES.md`.
