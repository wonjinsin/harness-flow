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

**Request-type routing (no tier classification).** `using-harness-flow` applies the first matching rule. An approved plan or agreed brief goes to `implement`, while an approved spec goes to `writing-plans`. Skill-only creation, editing, or verification takes priority over generic read-only analysis and goes directly to `writing-skills` outside the code-mutation chain. An unconfirmed bug, test failure, or unexpected behavior goes to `systematic-debugging` first, even when paired with an explicit implementation plan request. After the root cause is confirmed, an explicit plan request sends the confirmed bug-fix brief to `writing-plans`; otherwise, it goes to `implement`. An explicit code review goes to `requesting-code-review`, an explicit spec goes to `brainstorming` in explicit-spec mode, and an explicit non-bug implementation plan goes to `writing-plans`. Other feature, refactor, script, or change-intent requests, along with read-only research, analysis, or reporting on an in-scope codebase, repository, or technical artifact, go to `brainstorming`. General-knowledge questions stay outside the chain. **Dual-mode principle:** every chain skill is also independently invocable — the chain is the default route, and a skill's preconditions are guards, not gates: invoked without its usual input, the skill recovers it (e.g. `writing-plans` asks the 1–2 settling questions first) rather than bouncing the user back through the chain.

**Spec is optional (Model B).** `brainstorming` recommends an exit and the user picks: **small/clear** → capture the agreed brief and hand it to `implement`; **large/ambiguous** → save a spec, write an approved plan, then hand it to `implement`. No `<HARD-GATE>` or forced spec file; the selected artifact's review gate remains. Both exits converge before any code changes.

1. `using-harness-flow` — bootstrap, injected at SessionStart. Enforces "invoke a skill before any response, even 1% applicability." Routes by request type (above).
2. `brainstorming` — turns a change idea into an agreed approach through dialogue, then recommends an exit (Model B above). The small exit sends an agreed brief directly to `implement`; the large exit saves a spec at `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md` and continues through `writing-plans`. For an explicit spec request, it follows the same rules to save only the spec and request review, then stops unless the user also requests follow-on work. In read-only mode, it investigates a codebase or technical question, reports evidence, and stops without forcing implementation.
3. `writing-plans` — produces an implementation plan in the current checkout at `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` from an approved spec, approved inline design, or confirmed bug-fix brief when the user explicitly requested a plan after root-cause confirmation. Tasks are bite-sized tracer bullets (`### Task N` with Delivers / Touches / Blocked by / acceptance checkboxes — no line numbers, no code blocks). The header's `Source` contains the spec path, agreed decisions, or a durable summary of confirmed bug evidence and its correction; it never points to a nonexistent spec path or the conversation itself. Every source requirement maps to a task's `Delivers` or an acceptance criterion, and source-wide rules are inherited as `Constraints`. Preserves the human-approval gate ("Iterate until the user approves; after the user approves, hand off to implement"). No Task-Group / dispatch machinery.
4. `implement` — the single code-change controller. Callers normalize an agreed brief, approved plan, or confirmed bug-fix brief into the same settled implementation input. `implement` works directly in the current checkout with TDD and commits each task or completed brief. Before the first edit, it stops on a dirty checkout and records an immutable `BASE_SHA`, the base branch, and the baseline test. It does not create or switch branches or worktrees during implementation or review. Optional task-isolation and finalization references load only when needed. After completeness and durable-candidate handling, the initial fresh-context, report-only review covers `BASE_SHA..HEAD`. Before applying the correction-turn limit, the controller validates every blocker against the settled requirements, resulting tree, all relevant tests, and acceptance criteria. It batches only valid blockers. If a finding is factually false, conflicts with a settled requirement, or its correction would violate an acceptance criterion, it makes no code change and stops with the exact finding, rebuttal evidence, and correction consequence. The loop allows at most two correction reviews. A failed bug-fix attempt is removed with normal revert commits before its new evidence returns to `systematic-debugging`.
5. `test-driven-development` — sub-skill each implementer (inline or subagent) follows (Red → Verify red → Green → Verify green → Refactor).
6. `llm-md-revise` — runs before the review range is pinned when durable candidates exist. It proposes user corrections, always/never rules, project facts, anti-patterns, and external-system references, then applies only approved diffs to the active harness's project instruction surface (Codex → `AGENTS.md`; Claude Code → `CLAUDE.md`; follow an `@import` to the real file) or project `rules/*.md`. Approved edits must be committed first so the review range includes them. If `llm-md-revise` creates a new commit, rerun the full suite at the new `TO_SHA` and regenerate `VERIFICATION_EVIDENCE`. User-scope files are read only for deduplication and are never written.
7. `requesting-code-review` — dispatches one fresh-context `general-purpose` reviewer per invocation and returns its report. It owns neither fixes nor loops. The package includes inline requirements, exact `FROM_SHA` and `TO_SHA`, up to two earlier complete reports, and risk metadata. `VERIFICATION_EVIDENCE` binds the verified commit, exact commands, exit statuses, and observed results to `TO_SHA`; `PRE_CHECK` and `POST_CHECK` each prove the same `HEAD == TO_SHA` and clean worktree. Risk is pinned from the requirements and complete diff: `standard` uses a mid-tier model, while `high` uses the most-capable model. Explicit risk signals, including a large diff that limits cross-file reasoning, select `high`. A newly confirmed high-risk signal upgrades the review and cannot be downgraded before approval. On correction reviews, `standard` starts at `LAST_REVIEWED_SHA`, while `high` rechecks the full range from `BASE_SHA`. A validated escalation to a high-risk full-range review does not consume a correction-review turn. The skill never recomputes the caller's range and stops when current `HEAD` differs from `TO_SHA`. The reviewer reads each changed-file diff separately and proves `N/N` coverage. Its only decision fields are `Review complete: yes | no` and `Blocking findings: none | finding list`. Without native read-only control, bounded before/after snapshots detect the listed repository-state changes but cannot cover ignored-file contents or provide fail-closed isolation.

After review passes, `implement` pins `APPROVED_SHA` and only then reads the internal finalization reference. It rechecks the clean state and `HEAD == APPROVED_SHA` before asking whether to create a PR or merge into the detected base branch (`origin` default, then `main`, then `master`). The PR path passes the same SHA to `pr-creator` and verifies local `HEAD`, the remote branch tip before publication, and the PR's `headRefOid` afterward. The merge path performs only a local merge explicitly selected by the user. Neither path automatically deletes an existing branch or externally created worktree.

**External worktree/subagent gotcha:** when a session starts inside an externally managed git worktree and `implement` isolates a task in a subagent, the dispatched subagent may execute in the **main repo checkout** (on the base branch), not the session checkout. Pass and verify the session checkout identity before the subagent edits. On any mismatch, stop. If a wrong checkout commit still occurs, report both checkout identities and the commit SHA, then wait for user direction; do not repair or rewrite either checkout automatically.

## Parallel Track: Bug Fixing

`systematic-debugging` is **not** part of the linear chain above — it's an
orthogonal entry point for bug/test-failure/unexpected-behavior tasks.

- Trigger: any technical issue (bug, test failure, performance, build failure)
- Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
- Four phases: Root Cause → Pattern Analysis → Hypothesis → Confirmed Fix Handoff
- Joins the main chain at Phase 4: for an explicit implementation plan request,
  send the confirmed bug-fix brief to `writing-plans`;
  otherwise send it to `implement`. Implementation creates the failing test through TDD
- Diagnosis is non-mutating; all code and test changes belong to `implement`
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

**Dispatch templates are the opposite case.** `code-reviewer.md` names `Claude Code Agent (general-purpose)` explicitly and carries a separate **Codex translation** block (`spawn_agent`, `fork_turns: none`, unique `task_name: final_review_<unused-ordinal>_<TO_SHA-prefix>`), because hooks/tests match its strings verbatim.

## No design/ references inside skills

**Never cite `design/*` from inside a skill file (`SKILL.md`, `*-prompt.md`, or any skill-shipped doc).** Skills ship to users as runtime instructions, while `design/` is reserved for cross-harness comparison material. Keep runtime rules self-contained and keep implementation rationale in git history. (`grep -rn "design/" skills/` must stay empty.)

## Common Operations

- **Add a skill**: create `skills/<name>/SKILL.md` with frontmatter `name:` and `description:`. The `description` is the auto-invocation trigger — write it as a precise activation condition (when to use, not what it does), matching the tone of existing skills.
- **Edit a skill**: invoke `harness-flow:writing-skills` first — it applies to `SKILL.md` files and skill prompt templates (e.g. `*-prompt.md`). Do not break the chain order above; keep cross-references (e.g. `harness-flow:writing-plans`) stable.
- **Reinstall plugin locally for testing**: use Claude Code's plugin/marketplace commands; the marketplace `source: "./"` lets the repo install itself.
- **Run tests**: `node --test` (Node 18+ built-in runner; hook unit/smoke tests, manifest/runtime-contract tests, and skill-script tests).
- **Add a hook**: register in `hooks/hooks.json`, gate on `HARNESS_FLOW_HOOKS_OFF=1`, add unit tests for any new `lib/`, add a smoke test that spawns the hook with `spawnSync('node', [SCRIPT], { input: JSON.stringify(payload) })` and asserts on `status`/`stderr`.
- **Add a dangerous pattern**: destructive/CLI actions go in `hooks/pre-bash-commands.js` (`PATTERNS`), secret-file access goes in `hooks/pre-secrets.js` (single `PATTERNS` array). Add match + non-match cases in the matching `tests/hooks/*.test.js`.

## Output Paths

Skills produce artifacts lazily inside the current checkout:

- `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md` (brainstorming large-exit output)
- `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` (writing-plans output)

**In this repo `docs/harness-flow/` is gitignored** — specs/plans are per-feature working artifacts and are not committed. Do not `git add -f` a spec or plan. Keep implementation decisions in git history; reserve `design/` for cross-harness comparative analysis.

## Licensing

Several skills are derived/adapted from prior MIT-licensed work (superpowers, mattpocock/skills, caveman); the repo also studies other harnesses for the comparison. All upstream copyright notices are consolidated in `design/reference/THIRD-PARTY-LICENSES.md` (there are no per-skill `NOTICE` files).

## See Also

- `design/2026-05-05-comparison.md` — 7-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers / matt-pocock-skills). Explains why this plugin sits in "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives + `THIRD-PARTY-LICENSES.md`.
