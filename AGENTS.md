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

**Routing (by request type, no tier system).** `using-harness-flow` routes every request before the chain starts: skill-only creation/edit/verification → `writing-skills` directly, outside the code-mutation chain; this route outranks generic read-only analysis. Other code work (feature/refactor/script), or read-only research, investigation, comparison, analysis, or reporting about the in-scope codebase, repository, or technical artifact → `brainstorming`; a bug/test-failure/unexpected-behavior → `systematic-debugging` (the parallel track below). 명시적 spec 요청은 `brainstorming`의 explicit-spec mode, 구현 plan 요청은 `writing-plans`, code review 요청은 `requesting-code-review`로 보낸다. 이미 승인된 spec은 `writing-plans`, 승인된 plan이나 합의된 brief는 `implement`로 보낸다. General-knowledge questions stay outside the chain. **Dual-mode principle:** every chain skill is also independently invocable — the chain is the default route, and a skill's preconditions are guards, not gates: invoked without its usual input, the skill recovers it (e.g. `writing-plans` asks the 1–2 settling questions first) rather than bouncing the user back through the chain.

**Spec is optional (Model B).** `brainstorming` recommends an exit and the user picks: **small/clear** → capture the agreed brief and hand it to `implement`; **large/ambiguous** → save a spec, write an approved plan, then hand it to `implement`. No `<HARD-GATE>` or forced spec file; the selected artifact's review gate remains. Both exits converge before any code changes.

1. `using-harness-flow` — bootstrap, injected at SessionStart. Enforces "invoke a skill before any response, even 1% applicability." Routes by request type (above).
2. `brainstorming` — turns a change idea into an agreed approach through dialogue, then recommends an exit (Model B above). The small exit sends an agreed brief directly to `implement`; the large exit saves a spec at `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md` and continues through `writing-plans`. 명시적 spec 요청에서는 같은 규칙으로 spec만 저장하고 review를 요청한 뒤, 사용자가 후속 진행도 요청하지 않았다면 멈춘다. In read-only mode, it investigates a codebase or technical question, reports evidence, and stops without forcing implementation.
3. `writing-plans` — produces an implementation plan in the current checkout at `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md` as bite-sized, tracer-bullet TDD tasks (`### Task N` with Delivers / Touches / Blocked by / acceptance checkboxes — no line numbers, no code blocks). Header의 `Source`는 spec 경로 또는 합의된 결정을 담은 durable inline summary이며, 없는 spec 경로나 대화 자체를 가리키지 않는다. 모든 source requirement는 task의 `Delivers`나 acceptance criterion에 매핑하고, source-wide rule은 `Constraints`로 상속한다. Preserves the human-approval gate ("Iterate until the user approves; after the user approves, hand off to implement"). No Task-Group / dispatch machinery.
4. `implement` — the single code-mutation controller. It accepts an agreed small-change brief, an approved plan, or a confirmed bug-fix brief, then executes **inline** in the current checkout on the session's model (TDD; one commit per plan task or completed brief). Raw spec은 먼저 `writing-plans`를 거친다. 첫 변경 전에 dirty checkout이면 사용자 지시를 위해 중단하고 immutable `BASE_SHA`, base branch, baseline test를 확인한다. 구현과 review 중 branch/worktree를 생성·전환하지 않으며, 사용자가 local base merge를 선택한 뒤의 검증된 branch 전환만 예외다. It may isolate one task in ONE sequential general-purpose subagent (never for parallelism; set the model tier explicitly), comparing against `HEAD` captured immediately before that dispatch. Before final review it checks completeness, runs `llm-md-revise` when durable candidates exist, and commits approved instruction edits so the review range includes them. It **always** ends with one report-only fresh-context whole-branch review via `requesting-code-review` on a mid-tier model. Input errors and incomplete reviews escalate; the controller batches implementation fixes, tests and commits them, then runs at most two focused post-fix reviewer turns over fix deltas. Semantic contract expansion promotes a post-fix turn to whole-branch review but consumes the same limit. Failed bug-fix attempts are reverted with normal commits before a clean handoff to `systematic-debugging`.
5. `test-driven-development` — sub-skill each implementer (inline or subagent) follows (Red → Verify red → Green → Verify green → Refactor).
6. `llm-md-revise` — invoked **before final code review** when the session produced durable candidates. It surfaces user corrections, "always/never" rules, project facts, anti-patterns, and external-system references, then applies user-approved per-candidate diffs to the **active harness's** project instruction surface (Codex → `AGENTS.md`, Claude Code → `CLAUDE.md`; following an `@import` stub to the real file) or a project `rules/*.md`. Approved edits must be committed before review so the final whole-branch range includes them. Reads user-scope files (`~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`) for de-duplication only, never writes to them — surfaces a proposal instead.
7. `requesting-code-review` — dispatches exactly one report-only `general-purpose` reviewer turn on a **mid-tier model** and returns its report; it never owns fixes or loops. Native read-only controls are used when available; otherwise a bounded before/after snapshot detects listed repository-state changes but does not cover ignored-file contents or provide fail-closed isolation. Callers requiring fail-closed isolation must not dispatch without enforcement. Its `full-review` template is used for `implement`'s final whole-branch review after any instruction revision; its `verify-fix` template checks only a committed fix delta, re-evaluates only active finding IDs, and carries resolved IDs forward unchanged, preferably by resuming the same reviewer. Both modes read each changed-file diff separately and prove `N/N` coverage to avoid aggregate-output truncation. The template keeps the measured severity floor and output caps with no finding-count or confidence suppression. The `implement` controller may run at most two focused post-fix turns before escalation.

After revision and review settle, `implement` asks only whether to create a PR or merge into the detected base branch (`origin` default, then `main`, then `master`). 선택 실행 직전에 clean 상태와 `HEAD == PASSED_REVIEW_HEAD`를 다시 검증한다. PR 경로는 같은 SHA를 `pr-creator`에 넘기며, publish 직전에 local HEAD와 remote branch tip을 모두 재검증하고 생성된 PR의 `headRefOid`도 확인한다. The PR choice invokes `pr-creator`; the merge choice performs the explicit user-approved local merge. 어느 경로도 기존 branch나 외부에서 만든 worktree를 자동 삭제하지 않는다.

**External worktree/subagent gotcha:** when a session starts inside an externally managed git worktree and `implement` isolates a task in a subagent, the dispatched subagent may execute in the **main repo checkout** (on the base branch), not the session checkout. Pass and verify the session checkout identity before the subagent edits. On any mismatch, stop. If a wrong checkout commit still occurs, report both checkout identities and the commit SHA, then wait for user direction; do not repair or rewrite either checkout automatically.

## Parallel Track: Bug Fixing

`systematic-debugging` is **not** part of the linear chain above — it's an
orthogonal entry point for bug/test-failure/unexpected-behavior tasks.

- Trigger: any technical issue (bug, test failure, performance, build failure)
- Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
- Four phases: Root Cause → Pattern Analysis → Hypothesis → Confirmed Fix Handoff
- Joins the main chain at Phase 4 by sending a confirmed bug-fix brief to
  `harness-flow:implement`; implementation creates the failing test through TDD
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

**Dispatch templates are the opposite case.** `code-reviewer.md` names `Claude Code Agent (general-purpose)` explicitly and carries a separate **Codex translation** block (`spawn_agent`, `fork_turns: none`, `task_name: final_review`), because hooks/tests match its strings verbatim.

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
