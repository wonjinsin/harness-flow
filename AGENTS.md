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

Skills under `skills/` form a state-routed workflow. A new agent must understand the
handoffs before touching skill content — editing one link affects the whole flow.

**Routing (by current state, no tier system).** `using-harness-flow` sends a bug or
test failure to `systematic-debugging`; read-only codebase research and change intent
without an approved design to `brainstorming`; an approved design or spec to
`writing-plans`; an approved task plan to `implement`; and an explicit review artifact
to `requesting-code-review`. General knowledge stays outside the chain. Skills remain
independently invocable, but their input and workspace preconditions are mandatory.
There is no trivial/standard tier classifier — a "small" middle tier and the split
were A/B-evaluated and removed (see the size-classifier retrospective before retrying).
`scripts/routing-contract.js` and `scripts/workspace-contract.js` are the executable
routing precedence and required-execution workspace eligibility.

**Spec is optional (Model B).** `brainstorming` recommends an exit and the user picks: **small/clear** → implement directly with `test-driven-development`, then close by the measured diff (trivial — a few lines in one file, no contract/dependency/security surface → self-review; anything larger → one report-only fresh-context review via `requesting-code-review`, with controller-owned fixes followed by focused verification); **large/ambiguous** → save a spec, then a plan. No `<HARD-GATE>`, no forced spec file, no separate approval loop.

**Negative-record re-challenges:** a proposal recorded as rejected in a `design/*retrospective*.md` may be re-attempted ONLY with (a) a mechanism that directly defends against the recorded failure mode and (b) a fresh pre-registered eval that passes the original gate — precedent: P5 (streak gating, 6/8 fail) re-challenged same-day as final-only review + severity floor, 6/6 pass (`design/2026-07-16-review-removal-retrospective.md`).

1. `using-harness-flow` — bootstrap, injected at SessionStart. Enforces "invoke a skill before any response, even 1% applicability." Routes by request type (above).
2. `brainstorming` — turns a change idea into an agreed approach through dialogue, then recommends an exit (Model B above). In read-only mode, it investigates a codebase or technical question, reports evidence, and stops without forcing implementation. The large change exit saves a spec at `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md`.
3. `using-git-worktrees` — isolates the workspace. It is required before `writing-plans`
   on the large exit and when `implement` must establish a clean, named, non-base branch;
   planless paths may decline and work in place. Native worktree tools are preferred.
   The manual fallback writes private Git administration provenance and refuses marker
   collisions; cleanup requires exact kind/path/common-directory matches.
4. `writing-plans` — produces an implementation plan at `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` as bite-sized, tracer-bullet TDD tasks (`### Task N` with Delivers / Touches / Blocked by / acceptance checkboxes — no line numbers, no code blocks). Preserves the human-approval gate ("Iterate until the user approves; after the user approves, hand off to implement"). No Task-Group / dispatch machinery.
5. `implement` — executes only an approved task plan **inline** in the current session
   (one commit per task, TDD). Its mandatory preflight captures the plan across any
   workspace transition and refuses to edit outside a clean, named, non-base branch.
   It may isolate one task in one sequential subagent, never in parallel. A completeness
   check precedes the final whole-branch review. The controller batches implementation
   fixes, tests and commits them, then allows at most two post-fix reviewer turns.
6. `test-driven-development` — sub-skill each implementer (inline or subagent) follows (Red → Verify red → Green → Verify green → Refactor).
7. `requesting-code-review` — dispatches one report-only reviewer turn and never owns
   fixes. One same-package retry is allowed only for `OPERATIONAL`. Tool-level read-only
   isolation is mandatory. Both modes prove exact range, current evidence, and `N/N`
   file coverage. Classification is mutually exclusive and ordered:
   `PASS`, `ACTIONABLE`, `OPERATIONAL`, `CONTRACT`, `MALFORMED`. Full review and
   focused `verify-fix` use the executable state matrix under `scripts/`. Controllers
   may run at most two focused post-fix reviewer turns before escalation.
8. `llm-md-revise` — invoked in `implement` and `systematic-debugging` only **after the final reviewer state is `PASS`**, then before `finishing-a-development-branch` so approved edits land in the branch. Independent direct user requests to remember or update project instructions remain valid triggers. Surfaces session-derived knowledge (user corrections, "always/never" rules, project facts, anti-patterns, external-system references) and applies it as per-candidate diffs to the **active harness's** project instruction surface (Codex → `AGENTS.md`, Claude Code → `CLAUDE.md`; following an `@import` stub to the real file) or a project `rules/*.md`. Reads user-scope files (`~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`) for de-duplication only, never writes to them — surfaces a proposal instead.
9. `finishing-a-development-branch` — Step 0 requires clean status before tests or
   integration choices. It then detects environment/base, presents merge locally /
   push & PR / keep / discard, and executes the choice. Linked-worktree cleanup is
   allowed only with matching private provenance; host-managed detached worktrees are
   handed back without cleanup.

The chain ends when `finishing-a-development-branch` completes.

`pr-creator` is a helper skill for Option 2 of `finishing-a-development-branch` (create a PR).

**Worktree/subagent gotcha:** verify that a delegated task's commit landed on the
feature branch before continuing. If it landed in another checkout, stop and surface
the mismatch; do not mutate or reset another checkout automatically.

## Parallel Track: Bug Fixing

`systematic-debugging` is **not** part of the linear chain above — it's an
orthogonal entry point for bug/test-failure/unexpected-behavior tasks.

- Trigger: any technical issue (bug, test failure, performance, build failure)
- Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
- Four phases: Root Cause → Pattern Analysis → Hypothesis → Implementation
- Joins the main chain only at Phase 4 Step 1, where it invokes
  `test-driven-development` to write the failing test before fixing
- After the fix commit, requests `full-review`. `PASS` closes out; `ACTIONABLE`
  implementation findings enter TDD fix commits and focused `verify-fix`; `OPERATIONAL`,
  `CONTRACT`, or `MALFORMED` stops. The shared post-fix review budget is two turns.
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

- **Add a skill**: create `skills/<name>/SKILL.md` with a non-empty body and frontmatter
  `name:` (maximum 64 characters) and `description:` (maximum 1024 characters). The
  description is the auto-invocation trigger: state when to use it, not its workflow.
- **Edit a skill**: invoke `harness-flow:writing-skills` first — it applies to `SKILL.md` files and skill prompt templates (e.g. `*-prompt.md`). Do not break the chain order above; keep cross-references (e.g. `harness-flow:writing-plans`) stable.
- **Reinstall plugin locally for testing**: use Claude Code's plugin/marketplace commands; the marketplace `source: "./"` lets the repo install itself.
- **Run validation**: `node scripts/validate-skills.js`, then
  `node scripts/eval-skills.js`, then `node --test`. The evaluator runs deterministic
  workflow fixtures plus executable routing, workspace, and review-state matrices;
  the test command covers
  hooks, manifests/runtime contracts, and skill tooling.
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
