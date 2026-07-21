# harness-flow

## Overview

> Claude Code와 Codex에서 같은 workflow를 제공하는 cross-harness plugin입니다. 기능 작업은 설계 → 격리 → 계획 → TDD → 최종 리뷰 → 마무리, 버그 수정은 원인 조사 → 회귀 테스트 → 최소 수정 흐름을 따릅니다.

### Problems it solves

- Coding starts before the spec is agreed on, piling up code that's hard to redirect
- Multiple tasks blend into one worktree, making rollback and review painful
- Code review and cleanup get skipped or vary from person to person

### How it solves them

- Gates the spec-agreement step so no implementation can start without explicit user approval
- Isolates each task into its own worktree, then forces an explicit merge / PR / keep / discard decision at the end
- 구현은 Task Group별 implementer에게 맡기고, 모든 group이 끝난 뒤 branch 전체를 한 번 리뷰합니다. 전체 계획이 3개 이하 task면 현재 context에서 직접 구현합니다.

### Who it's for

- Claude Code 또는 Codex에서 agent가 필수 단계를 생략하지 않길 원하는 사용자
- People who want TDD + worktree isolation + subagent-driven review wired up in one shot

### Foundation

After analyzing six Claude Code harnesses ([`design/comparison.md`](design/comparison.md)), [superpowers](https://github.com/obra/superpowers) was adopted as the base because it minimizes complexity and treats simplicity as the top priority. Worktree isolation and finishing flows were added on top.

- [Archon](design/reference/archon.md)
- [everything-claude-code](design/reference/everything-claude-code.md)
- [get-shit-done](design/reference/get-shit-done.md)
- [gstack](design/reference/gstack.md)
- [oh-my-claudecode](design/reference/oh-my-claudecode.md)
- [superpowers](design/reference/superpowers.md)

---

## Skill chain — the order work flows in

Work is tiered before the chain starts: **trivial** (1–2 files, obvious, no contract/security/ambiguity triggers) runs inline with TDD and a self-review — no worktree, docs, or approvals; **standard** runs the full chain. Objective diff caps backstop the classification (`skills/using-harness-flow/references/sizing.md`).

1. **using-harness-flow** — injected at session start. Forces the agent to first ask "which skill applies here?"

2. **brainstorming** — refines the spec before implementation. Includes a `<HARD-GATE>` that blocks moving on without user approval. Output: `docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md`.
   - 2-1. **using-git-worktrees** — invoked from inside brainstorming to isolate the workspace before writing any files. Detects existing worktrees → prefers native tools → falls back to manual.

3. **writing-plans** — decomposes the design into TDD tasks (2–5 minutes sizes a *step*, not the task) and wraps related tasks into Task Groups (2–3 each), the unit the executor dispatches. Output: `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md`.

4. **subagent-driven-development** — Task Group마다 fresh-context implementer를 실행합니다(3개 이하 task는 inline). 중간 group review 없이 마지막에 구현 시작점부터 branch 전체를 한 번 리뷰합니다.
   - 4-1. **test-driven-development** — sub-skill each implementer subagent follows. Forces the order Red → confirm fail → Green → confirm pass → Refactor.
   - 4-2. **requesting-code-review** — 마지막 whole-branch review에 사용하는 template입니다. `plan-audit`가 현재 `HEAD`의 ancestor인 구현 시작 commit을 요구하고, task별 선언 파일이 그 이후 실제로 변경됐는지 검증합니다.
   - 4-3. **claude-md-revise** — 최종 리뷰 뒤 session 학습 내용을 platform에 맞는 project instruction(`AGENTS.md` 또는 `CLAUDE.md`) 후보로 제안합니다.

5. **finishing-a-development-branch** — presents four options (merge locally / push & PR / keep / discard) and cleans up the worktree.

### Output locations

Skills create artifacts lazily inside the active worktree (not the repo root):

```
docs/harness-flow/specs/YYYY-MM-DD-<topic>-design.md   # brainstorming output
docs/harness-flow/plans/YYYY-MM-DD-<feature>.md        # writing-plans output
```

---

## Parallel track — bug fixing

**systematic-debugging** — separate entry point for bugs, test failures, or unexpected behavior. Enforces root-cause investigation before any fix attempt (4 phases, Iron Law: no fixes without investigation). Joins the main chain only at Phase 4, where it uses `test-driven-development` to write the failing test before fixing. After a verified fix it conditionally surfaces `claude-md-revise` candidates (debugging sessions often reveal anti-patterns), then hands off to `finishing-a-development-branch`.

---

## Hooks

Node.js hook 6개를 제공합니다(Node 18+, npm dependency 없음). Claude Code와 Codex가 같은 `hooks/hooks.json`을 사용합니다.

- **`session-start-harness.js`** — 새 session, resume, clear, compaction 때 `using-harness-flow`를 주입합니다.
- **`session-start-caveman.js`** — pre-activates `caveman` mode (token-efficient terse responses) on every session boundary. Disable mid-session with "stop caveman" / "normal mode".
- **`pre-bash-commands.js`** — PreToolUse(Bash) destructive-action and cloud-CLI guard. Blocks: `--no-verify`, `rm -rf` of `/`/`~`/`$HOME`/`.`, pipe-to-shell (`curl|wget|fetch ... | sh|bash|...`), and `gcloud`/`aws` CLI calls (user authorization required).
- **`pre-secrets.js`** — Read/Edit/Write/MultiEdit/Bash와 Codex `apply_patch`에서 secret 경로 접근을 막습니다.
- **`pre-agent-model.js`** — model 인자를 지원하는 Claude Code Agent/Task dispatch에서 SDD model 누락을 막습니다. Codex는 권고형 `cheap` / `standard` / `most capable` tier 선택을 따릅니다. direct `spawn_agent`에는 호출별(per-call) 모델 강제 기능이 없으며 정확한 모델은 보장되지 않으므로 이 hook을 적용하지 않습니다.
- **`pre-plan-audit.js`** — Claude Agent/Task와 Codex `spawn_agent`의 최종 review 전에 현재 `HEAD`의 ancestor인 implementation base를 요구하고, plan 선언 파일이 그 이후 실제로 변경됐는지 검증합니다.

차단 hook은 `permissionDecision: "deny"` JSON을 stdout으로 내보내고 exit 0으로 종료합니다. 그래야 Codex와 Claude Code가 모두 deny 결과를 해석하며, 보호 대상 명령이 실수로 실행되지 않습니다.

Disable all hooks for a session with `HARNESS_FLOW_HOOKS_OFF=1`.

---

## Installation

사용하는 harness마다 별도로 설치합니다.

### Codex

```bash
codex plugin marketplace add wonjinsin/harness-flow
```

설치 뒤 `/hooks`에서 command hook을 검토하고 신뢰하세요. Plugin enable만으로 command hook이 자동 신뢰되지는 않으며, hook 내용이 바뀌면 다시 검토해야 합니다.

### Claude Code A) Git marketplace (recommended)

This repo exposes itself as a single-plugin marketplace via `.claude-plugin/marketplace.json`.

```
/plugin marketplace add wonjinsin/harness-flow
/plugin install harness-flow@harness-flow
```

Once installed, `hooks/hooks.json` is loaded automatically — all six hook scripts activate.

### B) Copy-paste mode — drop the repo into `.claude/`

Place the repo directly under `.claude/` instead of going through the plugin system.

In copy-paste mode, `$CLAUDE_PLUGIN_ROOT` is unset, so the bundled `hooks/hooks.json` is ignored. You have to register hooks in `settings.json` yourself. The session-start scripts derive the plugin root from their own location, so you don't need to set the environment variable.

**(B-1) Global — clone into `~/.claude/harness-flow/` (recommended)**

```bash
git clone https://github.com/wonjinsin/harness-flow.git ~/.claude/harness-flow
```

**(B-2) Project-local — `<project>/.claude/harness-flow/`**

```bash
git clone https://github.com/wonjinsin/harness-flow.git <project>/.claude/harness-flow
```

#### Required: register the hook in `settings.json`

Global (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/session-start-harness.js" },
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/session-start-caveman.js" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/pre-bash-commands.js" }
        ]
      },
      {
        "matcher": "Read|Edit|Write|MultiEdit|Bash|apply_patch",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/pre-secrets.js" }
        ]
      },
      {
        "matcher": "Agent|Task",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/pre-agent-model.js" },
          { "type": "command", "command": "$HOME/.claude/harness-flow/hooks/pre-plan-audit.js" }
        ]
      }
    ]
  }
}
```

Project-local (`<project>/.claude/settings.json`) — use `$CLAUDE_PROJECT_DIR`, the project-root variable Claude Code injects into hook commands:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/session-start-harness.js" },
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/session-start-caveman.js" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/pre-bash-commands.js" }
        ]
      },
      {
        "matcher": "Read|Edit|Write|MultiEdit|Bash|apply_patch",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/pre-secrets.js" }
        ]
      },
      {
        "matcher": "Agent|Task",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/pre-agent-model.js" },
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/harness-flow/hooks/pre-plan-audit.js" }
        ]
      }
    ]
  }
}
```

---

## Included skills

**Development process**

- **brainstorming** — Socratic design refinement, spec document generation
- **writing-plans** — task-level implementation plan generation
- **subagent-driven-development** — Task Group별 구현(3개 이하 task는 inline) + 단일 final whole-branch review
- **using-git-worktrees** — parallel development branch isolation
- **finishing-a-development-branch** — merge/PR decision workflow

**Quality assurance**

- **test-driven-development** — enforces the Red-Green-Refactor cycle (includes testing-anti-patterns reference)
- **requesting-code-review** — code review request checklist

**Debugging**

- **systematic-debugging** — root-cause-first bug investigation (4 phases, supporting techniques: root-cause-tracing, defense-in-depth, condition-based-waiting)

**Meta**

- **using-harness-flow** — entry point for the skill system, injected at session start
- **writing-skills** — create, edit, and verify skills before deployment
- **claude-md-revise** — session 학습 내용을 platform별 project instruction(`AGENTS.md` / `CLAUDE.md`) 후보로 정리
- **caveman** — ultra-compressed "caveman" response mode for token efficiency (pre-activated via `session-start-caveman.js`)

---

## Credits & Third-Party Licenses

이 저장소의 여러 skill은 MIT license 선행 작업에서 파생됐습니다. 각 파생
skill 폴더의 `NOTICE`에 원 저작권 고지와 전체 license text가 포함되어 있어,
skill 폴더를 개별 복사해도 attribution이 유지됩니다.

- [obra/superpowers](https://github.com/obra/superpowers) (MIT, © 2025 Jesse Vincent) — base for `brainstorming`, `finishing-a-development-branch`, `requesting-code-review`, `subagent-driven-development`, `systematic-debugging`, `test-driven-development`, `using-git-worktrees`, `using-harness-flow`, `writing-plans`.
- [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, © 2026 Matt Pocock) — `brainstorming` additionally incorporates ideas from the `grill-me` skill.

The `claude-md-revise` skill is original to this repository and is not derived from any upstream work.

---

## See Also

- `design/comparison.md` — 6-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers). Explains why this plugin sits at "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives
