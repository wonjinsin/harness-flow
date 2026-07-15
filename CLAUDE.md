# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

`harness-flow` is a Claude Code plugin that ships a personal **skills library**

The repo is simultaneously:

- A plugin (`.claude-plugin/plugin.json`)
- Its own marketplace (`.claude-plugin/marketplace.json` points `source: ./`)

So the same checkout can be installed locally as a plugin for testing.

**Cross-harness (Claude Code + Codex).** The repo is also a Codex plugin: `.codex-plugin/plugin.json` mirrors the Claude manifest (same name/version), `.agents/plugins/marketplace.json` is the Codex marketplace, and `AGENTS.md` bootstraps Codex sessions. Codex reads the **same** `hooks/hooks.json` (`CLAUDE_PLUGIN_ROOT` is a Codex compat alias) — do NOT duplicate hooks per harness. Codex tool/mechanism translations live in `skills/using-harness-flow/references/codex-tools.md`.

## The Skill Chain (architectural backbone)

Skills under `skills/` are designed to be invoked **in order** for any standard-tier task (see Tier routing below). A new Claude instance must understand this chain before touching skill content — editing one link affects the whole flow.

**Tier routing:** `using-harness-flow` classifies every code-work request before the chain starts (Size the Work First): **trivial** → inline TDD in the current checkout, self-review, diff caps — no worktree, no docs, no approvals; **standard** → the full chain below, unchanged. Exit backstop: trivial checks its cumulative diff before commit; over cap or a trigger hit in the actual diff → retroactive review. Caps and retroactive procedures live only in `skills/using-harness-flow/references/sizing.md`. Bugs still enter via systematic-debugging, unclassified. (A "small" middle tier was built, A/B-evaled, and removed — LLM-predicted judgment boundaries over-escalate; see `design/size-classifier-retrospective.md` before re-attempting.)

1. `using-harness-flow` — bootstrap, injected at SessionStart. Enforces "invoke a skill before any response, even 1% applicability."
2. `brainstorming` — produces a spec at `docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md` (standard tier). Contains a `<HARD-GATE>` blocking implementation until the user approves the design; the written document is reviewed once, after writing-plans appends the Implementation Groups section.
3. `using-git-worktrees` — isolates the workspace. Step 0 detects existing isolation (linked worktree, submodule guard); Step 1a defers to native worktree tools (`EnterWorktree` etc.); Step 1b is the manual `git worktree add` fallback.
4. `writing-plans` — appends an `## Implementation Groups` section to the spec (standard tier only): groups of 2–3 tasks with exact Files, a required `tier` tag, and verbatim Interfaces — the decomposition contract. Step-level content is NOT written here; no standalone plan document is produced (legacy plan files under `docs/harness-flow/plans/` still execute via the extraction path).
5. `subagent-driven-development` — executes the plan one Task Group at a time: dispatches one implementer subagent per group (plans of ≤3 tasks run inline, no dispatch) → a single task reviewer that returns both a spec-compliance and a code-quality verdict (plus a "⚠️ can't verify from diff" channel) at each group boundary, **except cheap-tier groups, whose dedicated reviewer is skipped — the final whole-branch review nets them** (review gating) → one broad whole-branch review at the end. The review loop routes findings by the reviewer's `class` tag: `plan-escalate` (plan/spec itself is wrong) → escalate to the human immediately, no fixer; `brief-fix` (controller-authored brief deviates from the spec section) → controller rewrites the brief, no human; `impl-fix` → fix→re-review loop **capped at 3 re-reviews per group** (`reviewCycles` tracked in the ledger so a resume can't reset the cap). Prompts at `subagent-driven-development/{implementer,task-reviewer}-prompt.md`. Hands work off as files: the controller authors each group's brief at dispatch time (gated by `scripts/brief-check`; legacy plans extract via `scripts/task-brief`) and packages diffs via `scripts/review-package` (both resolve their output dir through the `sdd-workspace` helper, which writes to a self-ignoring working-tree `.harness-flow/sdd/` — not `.git/`, which Claude Code denies agent writes to), runs a pre-flight conflict scan before Task 1 on legacy plan files only, requires an explicit model on every dispatch, and tracks completion in a progress ledger that survives compaction. Speedup rationale + A/B eval: `design/2026-07-14-execution-speedup-retrospective.md`.
6. `test-driven-development` — sub-skill that each implementer subagent follows (Red → Verify red → Green → Verify green → Refactor).
7. `requesting-code-review` — dispatch a `general-purpose` code reviewer subagent (template at `requesting-code-review/code-reviewer.md`).
8. `claude-md-revise` — invoked **after the final code review** in `subagent-driven-development` (default ON), and **conditionally after a verified `systematic-debugging` fix** — in both cases *before* `finishing-a-development-branch`, so approved edits land in the branch. Surfaces session-derived knowledge (user corrections, "always/never" rules, project facts, anti-patterns, external-system references) and applies it as per-candidate diffs to the nearest project `CLAUDE.md` or to a project `rules/*.md`. Reads `~/.claude/projects/<slug>/<uuid>.jsonl` directly when context may have compacted. Reads user-scope files (`~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`) for de-duplication only, never writes to them — surfaces a proposal instead.
9. `finishing-a-development-branch` — Step 1: verify tests. Steps 2–3: detect environment & base branch. Step 4: present 4-option menu (merge locally / push & PR / keep / discard). Steps 5–6: execute & cleanup. Cleanup logic depends on whether harness-flow created the worktree. (No longer hosts the `claude-md-revise` gate — that moved upstream to step 8.)

The chain ends when `finishing-a-development-branch` completes.

**Worktree/subagent gotcha:** when running `subagent-driven-development` from inside a
git worktree, dispatched implementer subagents may execute in the **main repo checkout**
(on the base branch), not the worktree — so their `git commit` lands on the wrong branch.
After each implementer reports DONE, verify the commit is on the feature branch
(`git log` in the worktree); if it landed on the main checkout, cherry-pick it onto the
feature branch and `git reset` the main checkout back.

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

## Hooks (Node.js, macOS · Claude Code only)

All hooks require Node.js 18+ and have zero npm dependencies. Registered in `hooks/hooks.json` via `${CLAUDE_PLUGIN_ROOT}`. Disable all hooks with `HARNESS_FLOW_HOOKS_OFF=1`.

### `hooks/session-start-harness.js` — SessionStart

Reads `skills/using-harness-flow/SKILL.md` and emits `hookSpecificOutput.additionalContext` JSON to inject session context. Matcher: `startup|clear|compact`.

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start-harness.js`

### `hooks/session-start-caveman.js` — SessionStart

Reads `skills/caveman/SKILL.md` and emits it as `additionalContext` wrapped in `<EXTREMELY_IMPORTANT>` tags, mirroring `session-start-harness.js`. Pre-activates caveman mode (token-efficient terse responses) at every session boundary. User can disable mid-session with "stop caveman" / "normal mode". Matcher: `startup|clear|compact`.

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start-caveman.js`

### `hooks/pre-bash-commands.js` — PreToolUse(Bash)

Destructive-action and cloud-CLI guard. Conservative: high-confidence-malicious only.
On block, emits Claude Code's `hookSpecificOutput.permissionDecision: 'deny'`
JSON (also exits 2) with `systemMessage` instructing the LLM to stop and ask
the user — do NOT retry with a workaround.

Patterns (5 total, see `PATTERNS` in the file):

- `--no-verify` (bypassing pre-commit hooks)
- `rm -rf /|~|$HOME|.`
- pipe-to-shell (`curl|wget|fetch … | sh|bash|...`)
- `gcloud` / `aws` CLI calls (user authorization required)

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/pre-bash-commands.js`

### `hooks/pre-secrets.js` — PreToolUse(Read|Edit|Write|MultiEdit|Bash|apply_patch)

Secret-file access guard. Single hook, single `PATTERNS` array (path-shape).
Dispatch by `tool_name`:

- `Read|Edit|Write|MultiEdit` → match `tool_input.file_path` directly against `PATTERNS` (ALLOWLIST first)
- `Bash` → split `tool_input.command` on whitespace + shell separators, then apply the same matcher to each token

Posture: any reference to a secret-bearing path is blocked — read (`cat .env`), write (`echo X > .env`), move (`mv ~/.aws/credentials …`), edit (`vim ~/.ssh/id_rsa`), or stage (`git add .env`). No reader-verb whitelist: the file is treated as untouchable. Trade-off: descriptive uses like `echo "use .env file"` are also blocked; deemed acceptable because the deny message instructs the LLM to stop and ask.

ALLOWLIST skips `.env.example`/`.sample`/`.template`/`.schema`/`.defaults` for both Bash and file tools.

Same deny + exit-2 contract as `pre-bash-commands.js`. Families (5 total, see `PATTERNS` in the file):

- `.env` (any variant)
- SSH private keys (`id_rsa`, `id_ed25519`, `id_ecdsa`, `id_dsa`; `.pub` excluded)
- `~/.aws/credentials`
- `~/.config/gcloud/*credentials|tokens|adc|application_default*`
- GCP service-account JSON

Both hooks share `hooks/lib/guard.js` (`emitDeny` + `runGuard` parameterized by `kind`/`getValue`).

**Codex:** the matcher includes `apply_patch` (Codex's file-edit tool). Its `tool_input` is a patch body, not a `file_path`, so the dispatch routes it through `getPatch` (`lib/payload.js`) — which reads `input`/`command` or, on an unknown field name, joins all string values with real newlines (fail-safe, never fail-open) — then reuses `matchBashCommand`'s tokenizer so patch-header paths (`*** Update File: .env`) are caught.

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/pre-secrets.js`

### `hooks/pre-agent-model.js` — PreToolUse(Agent|Task)

SDD model-omission guard. When a `subagent-driven-development` dispatch omits `model`, Claude Code silently inherits the session's most expensive model (Opus) — the leak this hook closes at the moment of dispatch (passive docs were ignored on every prior dispatch).

Scoped to SDD by matching the dispatch `description` against `SDD_DESC` (`/^Implement (Task|Group) \d+:|^Review (Task|Group) \d+ \(spec \+ quality\)/`, anchored on the distinctive shape each of `implementer-prompt.md` / `task-reviewer-prompt.md` sets verbatim), matching the per-group implementer and reviewer dispatches (`Task` kept as a backward-compat alias). Every other Agent dispatch — Explore, general-purpose searches — passes untouched, so there is **no blast radius**. Fires when the description matches AND `model` is absent, empty, or `inherit` (case-insensitive; all resolve to the session default). Reads `tool_input.model` directly: an omitted model arrives as an **absent key** (empirically confirmed), not null/empty.

**Coverage boundary (intentional):** only the per-group implementer and reviewer dispatches — plus re-reviews, which reuse the reviewer template — are scoped. The final whole-branch review (`requesting-code-review`, description `"Review code changes"`) and the fix-wave subagents are deliberately uncovered: the fixer has no stable description to key on, and an omitted-model final review inherits the session model, which in an SDD session is already the opus tier that review wants.

Does NOT use `guard.js`'s `runGuard`/`emitDeny`: the deny `systemMessage` must steer the controller to *re-dispatch with an explicit tier* (cheap→haiku / standard→sonnet / most-capable→opus, reviewer floor sonnet), the opposite of the secret/bash guards' "stop and ask the user." Same deny + exit-2 contract otherwise. Ceiling: a presence-check enforces "you chose a model," not "you chose cheap" — the reason text nudges toward the cheapest fitting tier but cannot force it.

Recent Claude Code versions renamed the dispatch tool `Task` → `Agent` (`Task` kept as a back-compat alias); the matcher covers both.

**Claude-Code-only by design.** This hook does not port to Codex: Codex's `SubagentStart` hook cannot block a dispatch and does not expose the target model, so there is nothing to intercept. Codex SDD model tiering is handled instead by per-tier agent-profile templates at `skills/using-harness-flow/references/codex-agents/sdd-{cheap,standard,review}.toml` (users copy them into `.codex/agents/` and dispatch by profile name). The `Agent|Task` matcher simply never fires under Codex, so leaving this hook registered is harmless.

Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/pre-agent-model.js`

### Hook registration env var conventions

- Plugin install → `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}`, auto-injected by Claude Code's plugin runtime.
- User settings (`~/.claude/settings.json`) → use `$HOME` (POSIX-standard).
- Project settings (`<project>/.claude/settings.json`) → use `$CLAUDE_PROJECT_DIR` (officially supported). Relative paths are not safe — hook CWD is unspecified.

### Hook code conventions

CommonJS (`require`), `'use strict'` at top, `node:*` built-ins only. stderr messages in English (LLM-readable). An external linter auto-formats JS files (notably converts single → double quotes) — don't fight it.

## Cross-Platform Tool Names

Skills use Claude Code tool names (`Task`, `TodoWrite`, `Skill`). Translations for other harnesses live in `skills/using-harness-flow/references/`:

- `codex-tools.md` — Codex (`spawn_agent`, `wait`, `close_agent`, `update_plan`)
- `copilot-tools.md` — Copilot CLI

When editing a skill, keep tool references Claude-Code-native; the reference files do the translation.

## Common Operations

- **Add a skill**: create `skills/<name>/SKILL.md` with frontmatter `name:` and `description:`. The `description` determines auto-invocation trigger, so write it as a precise activation condition (see existing skills for tone).
- **Edit a skill**: always invoke `harness-flow:writing-skills` first — this applies to `SKILL.md` files and skill prompt templates (e.g. `*-prompt.md`). Do not break the chain order above. If a skill links to another (e.g. `harness-flow:writing-plans`), keep the reference name stable.
- **Reinstall plugin locally for testing**: use Claude Code's plugin/marketplace commands; the marketplace `source: "./"` lets the repo install itself.
- **Run hook tests**: `node --test` (Node 18+ built-in runner; unit tests at `tests/hooks/*.test.js`, smoke tests at `tests/hooks/smoke/*.smoke.test.js`). Skill behavior has no automated tests — validate by invoking in a live session.
- **Add a hook**: register in `hooks/hooks.json`, gate on `HARNESS_FLOW_HOOKS_OFF=1`, add unit tests for any new `lib/`, add smoke test that spawns the hook with `spawnSync('node', [SCRIPT], { input: JSON.stringify(payload) })` and asserts on `status`/`stderr`.
- **Add a dangerous pattern**: pick the right hook — destructive/CLI actions go in `hooks/pre-bash-commands.js` (`PATTERNS`), secret-file access goes in `hooks/pre-secrets.js` (single `PATTERNS` array; same regex covers both Bash and file tools). Add match + non-match cases in `tests/hooks/pre-bash-commands.test.js` or `tests/hooks/pre-secrets.test.js`.

## Output Paths

Skills produce artifacts lazily inside the active worktree (not the repo root):

- `docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md` (brainstorming output)
- `docs/harness-flow/plans/` — legacy only; new decompositions live in the spec's `## Implementation Groups` section

**In this repo `docs/harness-flow/` is gitignored** — specs/sections are per-feature working artifacts and are not committed; durable records (retrospectives, analyses) get promoted to `design/` instead. Do not `git add -f` a spec.

## See Also

- `design/comparison.md` — 6-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers). Explains why this plugin sits in "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives.
