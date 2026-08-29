# harness-flow

## Overview

> Claude Code와 Codex에서 같은 흐름을 제공하는 크로스 하네스 플러그인입니다. 기능 작업은 설계 → 계획 → TDD → 최초 전체 변경 리뷰 → 제한된 증분 리뷰 → 통합으로 진행하고, 버그 수정은 원인 조사 → 회귀 테스트 → 최소 수정으로 진행합니다.

### Problems it solves

- Coding starts before the spec is agreed on, piling up code that's hard to redirect
- Mixing pre-existing user changes with task changes makes rollback and review difficult
- Code review and cleanup get skipped or vary from person to person

### How it solves them

- Agrees the approach through dialogue before coding — a spec (then a plan) only when the work is large enough, with no forced spec gate
- Stops before implementation when the checkout is dirty, then confirms an immutable `BASE_SHA`, the base branch, and the baseline test. It does not switch branches or worktrees during implementation or review; the selected base merge is the only exception
- 현재 세션에서 TDD로 직접 구현합니다. 최초 리뷰는 `BASE_SHA..HEAD` 전체 변경을 보고, 수정 후에는 직전 리뷰 SHA 이후의 커밋만 최대 두 번 증분 리뷰합니다.

### Who it's for

- Users who want the agent in Claude Code or Codex to not skip required steps
- TDD, 현재 체크아웃 안전 검사, 최초 전체 변경 리뷰, 제한된 증분 리뷰를 한 흐름에서 원하는 사용자

### Foundation

After comparing several Claude Code harnesses ([`design/2026-05-05-comparison.md`](design/2026-05-05-comparison.md)), this project adopted the simplicity-first [superpowers](https://github.com/obra/superpowers) as its foundation. On top of that foundation, it adds a unified `implement` controller that operates in the current checkout and a fresh-context review flow.

- [Archon](design/reference/archon.md)
- [everything-claude-code](design/reference/everything-claude-code.md)
- [get-shit-done](design/reference/get-shit-done.md)
- [gstack](design/reference/gstack.md)
- [oh-my-claudecode](design/reference/oh-my-claudecode.md)
- [superpowers](design/reference/superpowers.md)
- [matt-pocock-skills](design/reference/matt-pocock-skills.md)

---

## Skill chain — the order work flows in

Routing applies the first matching rule. An approved plan or agreed small-change brief goes to `implement`, while an approved spec goes to `writing-plans`. Skill-only creation, editing, or verification takes priority over generic read-only analysis and goes directly to `writing-skills`. A bug, test failure, or unexpected behavior without a confirmed root cause goes to `systematic-debugging` first, even when the user requests an implementation plan; it proceeds to `writing-plans` or `implement` only after the root cause is confirmed. An explicit code review takes priority over generic read-only analysis and goes directly to `requesting-code-review`. Explicit specs go to `brainstorming`, non-bug implementation plans go to `writing-plans`, and other code work or codebase investigations go to `brainstorming`. General-knowledge questions stay outside the chain. Every chain skill is also independently invocable — preconditions are guards, not gates: invoked without its usual input, the skill recovers it (e.g. `writing-plans` asks the 1–2 settling questions first).

```mermaid
flowchart LR
    subgraph DESIGN [design]
        direction LR
        BS(["brainstorming"])
        SPEC[["spec artifact"]]
        WP(["writing-plans"])
        BS -- "large /<br/>ambiguous" --> SPEC --> WP
    end

    subgraph BUILD [build]
        direction LR
        IMPL(["implement"])
        TDD(["test-driven-development"])
        IMPL --> TDD --> IMPL
    end

    subgraph SHIP [review & ship]
        direction LR
        REVIEW(["requesting-code-review<br/>단일 범위 · report-only"])
        FIX(["controller<br/>일괄 수정 → 테스트 → 커밋"])
        LMR(["llm-md-revise"])
        BUDGET(["수정 리뷰 최대 2회"])
        ESC(["중단 후 보고"])
        CHOICE{"PR 또는 base merge?"}
        PR(["pr-creator"])
        BASE(["감지한 base에 merge"])
        LMR -- "확정 + clean" --> REVIEW
        REVIEW -- "complete: no" --> ESC
        REVIEW -- "blocker 없음" --> CHOICE
        REVIEW -- "blocker 있음 +<br/>횟수 남음" --> FIX
        REVIEW -- "blocker 있음 +<br/>한도 소진" --> ESC
        FIX -- "직전 SHA..HEAD +<br/>이전 보고서" --> REVIEW
        BUDGET -. "수정 리뷰 제한" .-> FIX
        CHOICE -- "create PR" --> PR
        CHOICE -- "merge" --> BASE
    end

    REQ(["user request"]) --> UHF(["using-harness-flow"])
    UHF -- "feature / refactor" --> BS
    UHF -- "codebase research /<br/>technical report" --> BS
    UHF -- "bug / test failure" --> SD(["systematic-debugging"])

    BS -- "read-only evidence report" --> REPORT(["report & stop"])
    BS -- "small / clear<br/>agreed brief" --> IMPL
    WP --> IMPL
    SD -- "confirmed + explicit<br/>plan request" --> WP
    SD -- "confirmed + no<br/>plan request" --> IMPL

    IMPL -- "durable candidates" --> LMR
    IMPL -- "no candidates" --> REVIEW

    classDef entry fill:#eceff1,stroke:#607d8b,color:#263238
    classDef design fill:#e3f2fd,stroke:#64b5f6,color:#0d47a1
    classDef build fill:#e8f5e9,stroke:#81c784,color:#1b5e20
    classDef ship fill:#fff3e0,stroke:#ffb74d,color:#e65100
    classDef debug fill:#ffebee,stroke:#e57373,color:#b71c1c

    class REQ,UHF entry
    class BS,SPEC,WP design
    class TDD,IMPL build
    class REVIEW,FIX,LMR,BUDGET,ESC,CHOICE,PR,BASE ship
    class SD debug

    style DESIGN fill:none,stroke:#64b5f6,stroke-dasharray:4 4
    style BUILD fill:none,stroke:#81c784,stroke-dasharray:4 4
    style SHIP fill:none,stroke:#ffb74d,stroke-dasharray:4 4
```

1. **using-harness-flow** — injected at session start. Forces the agent to first ask "which skill applies here?"

2. **brainstorming** — agrees the approach through dialogue, then recommends an exit: small/clear → send an agreed brief directly to `implement`; large/ambiguous → save a spec, then write an approved plan before `implement`. For an explicit spec request, it stops after requesting spec review unless the user also requests follow-on work. Both code-changing exits converge on the same controller. Large-exit output: `docs/harness-flow/specs/YYYY-MM-DD-<topic>.md`.

3. **writing-plans** — decomposes an approved spec, an approved inline design, or a confirmed bug-fix brief with an explicit plan request into bite-sized, tracer-bullet TDD tasks (`### Task N` with Delivers / Touches / Blocked by / acceptance), preserving the human-approval gate. The plan header's `Source` contains the actual spec path, agreed decisions, or a durable summary of confirmed bug evidence and its correction; every source requirement maps to a task's `Delivers` or an acceptance criterion. Output: `docs/harness-flow/plans/YYYY-MM-DD-<feature>.md`.

4. **implement** — caller가 합의된 brief, 승인된 plan, 확인된 bug-fix brief를 공통된 settled input으로 정규화해 넘깁니다. 현재 체크아웃에서 TDD로 구현하며, 수정 전 dirty checkout 검사, 불변 `BASE_SHA`, base branch, baseline test를 확인합니다. 최초에는 `BASE_SHA..HEAD`를 리뷰하고, blocker를 수정한 뒤에는 `LAST_REVIEWED_SHA..HEAD`만 이전 보고서와 함께 새 reviewer에게 보냅니다. 수정 리뷰는 최대 두 번입니다. 작업 격리와 종료 절차는 필요할 때만 내부 reference를 읽습니다.
   - 4-1. **test-driven-development** — sub-skill each implementer follows. Forces the order Red → confirm fail → Green → confirm pass → Refactor.
   - 4-2. **llm-md-revise** — durable candidate가 있을 때만 프로젝트 지침 변경을 제안합니다. 승인된 변경은 리뷰 범위를 고정하기 전에 커밋합니다.
   - 4-3. **requesting-code-review** — 호출 한 번마다 정확한 `FROM_SHA..TO_SHA` 한 범위를 fresh-context, report-only reviewer가 검토합니다. 결과 판단값은 `Review complete`와 `Blocking findings`뿐입니다. 파일별 diff와 `N/N` coverage를 확인하며, native read-only 제어가 없으면 전후 snapshot으로 저장소 변경을 탐지합니다.

5. **통합 선택** — 리뷰 통과 뒤에만 종료 reference를 읽습니다. clean checkout과 `HEAD == APPROVED_SHA`를 다시 확인한 뒤 PR 또는 감지된 base branch merge를 묻습니다. PR 경로는 같은 SHA를 `pr-creator`에 전달합니다. 어느 경로도 branch나 worktree를 자동 삭제하지 않습니다.

> **Mechanical work is not a routing exception.** Keep `brainstorming` proportional
> — a behavior-preserving move or rename normally needs only a short agreed brief —
> then continue through `implement`. Use verification-only instead of Red→Green
> only after explicit user approval under TDD's ask-first exception.

### Output locations

Skills create artifacts inside the current checkout on demand:

```
docs/harness-flow/specs/YYYY-MM-DD-<topic>.md   # brainstorming large-exit output
docs/harness-flow/plans/YYYY-MM-DD-<feature>.md   # writing-plans output
```

---

## Parallel track — bug fixing

**systematic-debugging** — separate entry point for bugs, test failures, or unexpected behavior. Diagnosis stays non-mutating and confirms root cause before Phase 4 sends a bug-fix brief to `writing-plans` when the user explicitly requested a plan, otherwise to `implement`. Implementation owns TDD, review, revision, and integration. Failed attempts are reverted before their evidence returns to root-cause analysis.

---

## Hooks

Provides four Node.js hooks (Node 18+, no npm dependencies). Claude Code and Codex use the same `hooks/hooks.json`.

- **`session-start-harness.js`** — injects `using-harness-flow` on new session, resume, clear, and compaction.
- **`session-start-caveman.js`** — pre-activates `caveman` mode (token-efficient terse responses) on every session boundary. Disable mid-session with "stop caveman" / "normal mode".
- **`pre-bash-commands.js`** — PreToolUse(Bash) destructive-action and cloud-CLI guard. Blocks: `--no-verify`, `rm -rf` of `/`/`~`/`$HOME`/`.`, pipe-to-shell (`curl|wget|fetch ... | sh|bash|...`), and `gcloud`/`aws` CLI calls (user authorization required).
- **`pre-secrets.js`** — blocks access to secret paths from Read/Edit/Write/MultiEdit/Bash and Codex `apply_patch`.

A blocking hook emits `permissionDecision: "deny"` JSON to stdout and exits 0. This way both Codex and Claude Code interpret the deny result, and the protected command is not run by mistake.

Disable all hooks for a session with `HARNESS_FLOW_HOOKS_OFF=1`.

---

## Installation

Install separately for each harness you use.

### Codex

```bash
codex plugin marketplace add wonjinsin/harness-flow
```

After installing, review and trust the command hooks under `/hooks`. Enabling the plugin alone does not auto-trust the command hooks, and you must review them again whenever the hook contents change.

### Claude Code A) Git marketplace (recommended)

This repo exposes itself as a single-plugin marketplace via `.claude-plugin/marketplace.json`.

```
/plugin marketplace add wonjinsin/harness-flow
/plugin install harness-flow@harness-flow
```

Once installed, `hooks/hooks.json` is loaded automatically — all four hook scripts activate.

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
- **implement** — 단일 코드 변경 controller: inline TDD, 최초 전체 변경 리뷰, 제한된 증분 리뷰, PR/base-merge handoff
- **pr-creator** — GitHub pull request creation after the user selects the PR path

**Quality assurance**

- **test-driven-development** — enforces the Red-Green-Refactor cycle (includes testing-anti-patterns reference)
- **requesting-code-review** — 정확한 단일 커밋 범위를 검토하는 report-only 리뷰 계약

**Debugging**

- **systematic-debugging** — root-cause-first bug investigation (4 phases, supporting techniques: root-cause-tracing, defense-in-depth, condition-based-waiting)

**Meta**

- **using-harness-flow** — entry point for the skill system, injected at session start
- **writing-skills** — create, edit, and verify skills before deployment
- **llm-md-revise** — organizes session learnings into candidates for the platform-specific project instruction (`AGENTS.md` / `CLAUDE.md`)
- **caveman** — ultra-compressed "caveman" response mode for token efficiency (pre-activated via `session-start-caveman.js`)

---

## Credits & Third-Party Licenses

Several skills in this repository are derived from MIT-licensed prior work. The original
copyright notices and the full license text are consolidated in
[`design/reference/THIRD-PARTY-LICENSES.md`](design/reference/THIRD-PARTY-LICENSES.md) (per-skill `NOTICE` files have been merged into this file).

- [obra/superpowers](https://github.com/obra/superpowers) (MIT, © 2025 Jesse Vincent) — base for `brainstorming`, `requesting-code-review`, `implement`, `systematic-debugging`, `test-driven-development`, `using-harness-flow`, `writing-plans`.
- [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, © 2026 Matt Pocock) — `brainstorming` incorporates ideas from `grill-me`, and `writing-plans` from `to-tickets`.
- [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) (MIT, © 2026 Julius Brussee) — base for `caveman`.

The `llm-md-revise` skill is original to this repository and is not derived from any upstream work.

---

## See Also

- `design/2026-05-05-comparison.md` — 7-harness comparative analysis (Archon / ECC / GSD / gstack / OMC / superpowers / matt-pocock-skills). Explains why this plugin sits at "Layer C: in-harness skills" and the tradeoffs that implies.
- `design/reference/*.md` — per-harness deep dives + `THIRD-PARTY-LICENSES.md`
