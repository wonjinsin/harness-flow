# harness-flow

Claude Code 플러그인. 유저 요청을 **router → brainstorming → PRD/TRD/TASKS → execute → evaluate → doc-update** 순으로 흘리는 Skill × Agent 하이브리드 하네스. 중앙 DAG 파일은 없다 — 각 스킬이 자기 본문에 다음 단계 (`## Required next skill`) 를 직접 선언하고, SessionStart 훅이 `using-harness` 메타 스킬을 컨텍스트에 주입해서 LLM 자체가 인터프리터로 동작한다.

---

## 핵심 컨셉

- **스킬 메타데이터 자체가 라우팅 소스.** 각 `skills/<name>/SKILL.md` 는 끝 부분에 `## Required next skill` 섹션을 가지고, 메인 스레드가 그걸 읽어 다음 단계를 디스패치한다. superpowers 스타일 마커에서 영감.
- **`harness-contracts/` 가 공유 계약 레이어.** repo 루트의 4개 파일이 스킬간 합의를 고정한다:
  - `execution-modes.md` — 어떤 스킬이 메인 컨텍스트에서 돌고 어떤 스킬이 격리 subagent 에서 도는지, 그리고 그 이유
  - `payload-contract.md` — 개념적 DAG: 모든 엣지와 거기서 흐르는 payload 모양
  - `output-contract.md` — writer 계열 입출력 스키마 + 에러 분류
  - `file-ownership.md` — 세션 산출물별 생성/수정/읽기 권한이 누구에게 있는지
- **Skill 9개 × Agent 4개.** 경량 단계 (router, brainstorming, parallel-task-executor) 는 메인 컨텍스트 Skill, 무거운 산출물 단계 (PRD/TRD/TASKS writer, evaluator, doc-updater) 는 격리된 subagent.
- **세션 = 폴더.** 모든 산출물은 유저 프로젝트의 `.planning/{YYYY-MM-DD-slug}/` 하위 (`ROADMAP.md`, `STATE.md`, `PRD.md`, `TRD.md`, `TASKS.md`, `findings.md`).
- **두 사용자 게이트.** Gate 1 (경로 승인, brainstorming Phase B 에 흡수) 이 어떤 spec 스택을 만들지 결정. Gate 2 (spec review, 각 `*-writer` 가 `done` emit 직후) 가 작성된 `PRD.md` / `TRD.md` / `TASKS.md` 를 사용자가 approve / revise / abort 할 수 있게 한다. revise 시 writer 가 `revision_note` 와 함께 재디스패치되어 그 노트만 surgical 하게 처리한다.
- **Brainstorming 이 질문을 코드에 ground.** intent + target 이 잡히면 brainstorming 이 ~10 Read/Grep/Glob 칼로 코드베이스 peek 을 한 번 돌려 `exploration_findings` 로 emit. writer 들은 이를 권위 있는 ground 로 받아들이고 작은 verify-first 예산으로 동작 (재탐색 없음).

---

## 설치

### A) Git 마켓플레이스 (권장)

이 repo 가 자기 자신을 단일 플러그인 마켓플레이스로 노출한다 (`.claude-plugin/marketplace.json`).

```
/plugin marketplace add wonjinsin/harness-flow
/plugin install harness-flow@harness
```

이후 새 세션에서 SessionStart 훅이 자동으로 돌아 `using-harness` 스킬이 컨텍스트에 주입된다.

### B) 복붙 모드 — 플러그인 안 쓰고 `.claude/` 에 직접 배치

플러그인 시스템을 거치지 않고 repo 를 통째로 `.claude/` 아래 두고 싶을 때. 이 모드에선 Claude Code 가 `$CLAUDE_PLUGIN_ROOT` 를 주입하지 않지만, `session-start.sh` 가 자기 위치에서 루트를 자동 유도하므로 **별도 환경 변수 설정 불필요**.

**(B-1) 글로벌 — `~/.claude/harness-flow/` 에 통째로 배치 (권장)**

```bash
git clone https://github.com/wonjinsin/harness.git ~/.claude/harness-flow
```

**(B-2) 프로젝트 로컬 — `<project>/.claude/harness-flow/`**

```bash
git clone https://github.com/wonjinsin/harness.git <project>/.claude/harness-flow
```

#### 필수 — settings.json 에 훅 등록

플러그인 모드면 `hooks/hooks.json` 을 Claude Code 가 자동으로 읽지만, 복붙 모드에선 **무시된다**. 번들된 `hooks.json` 이 `${CLAUDE_PLUGIN_ROOT}` 를 참조하는데 플러그인 모드 밖에선 그 변수가 빈 값이기 때문. `~/.claude/settings.json` (글로벌) 또는 `<project>/.claude/settings.json` (프로젝트) 에 직접 등록:

글로벌 (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$HOME/.claude/harness-flow/hooks/session-start.sh\""
          }
        ]
      }
    ]
  }
}
```

프로젝트 로컬 (`<project>/.claude/settings.json`) — 프로젝트 루트 기준 상대 경로 사용:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "bash \".claude/harness-flow/hooks/session-start.sh\""
          }
        ]
      }
    ]
  }
}
```

환경 변수 없이 동작하는 이유: `session-start.sh` 가 자기 위치에서 루트를 유도한다.

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"
```

`$CLAUDE_PLUGIN_ROOT` 가 비어있으면 (복붙 모드) `HARNESS_ROOT` 는 `hooks/` 의 부모 디렉토리, 즉 repo 루트로 폴백한다. 이후 스크립트가 `using-harness` 본문에 절대 경로를 주입하므로, 스킬 본문의 `${CLAUDE_PLUGIN_ROOT}` 표기는 주입 시점에 모두 치환된다.

**(B-3) `.claude/` 에 납작하게 머지**

`skills/`, `agents/`, `hooks/` 를 분해해서 기존 `~/.claude/skills/`, `~/.claude/agents/` 등에 그대로 합치는 케이스. 이름 충돌만 없으면 동작하지만, 업그레이드·제거가 까다로워져서 추천하지 않는다. 굳이 한다면 위 settings.json 등록은 동일하게 필요.

### C) 동작 확인

```
/plugin
```

목록에 `harness-flow` 가 enabled 로 보이면 플러그인 모드 정상. 복붙 모드면 `/plugin` 에는 안 뜨지만, 새 세션 첫 메시지 시점에 시스템 컨텍스트 상단에 `"You have harness."` 블록과 `using-harness` 본문이 보이면 부트스트랩 성공.

---

## 어떻게 트리거되나

새 세션에서 첫 유저 메시지가 도착하면 `using-harness` 가 다음을 판단:

| 입력 예시                         | 분류    | 동작                                                  |
| --------------------------------- | ------- | ----------------------------------------------------- |
| `"안녕"`, `"이거 뭐 할 수 있어?"` | casual  | 일반 응답, 하네스 미개입                              |
| `"로그인에 2FA 추가해줘"`         | plan    | router → brainstorming → 경로 추천 → ...              |
| `"인증 코드 좀 더 깔끔하게"`      | clarify | router → brainstorming Phase A (Q&A) → Phase B (분류) |
| `"어제 하던 2FA 작업 이어서"`     | resume  | router → 매칭된 세션 로드 → 다음 미완료 phase 부터    |

세션이 만들어지면 `ROADMAP.md` 체크박스를 따라 진행되고, 중단 후 재시작해도 마지막 `[x]` 다음부터 이어진다.

---

## 노드 그래프

```
                      router
                        │
                        ▼ (clarify | plan | resume)
                   brainstorming
                        │
       ┌────────────────┼─────────────────┬──────────────┐
       ▼                ▼                 ▼              ▼
   (prd-trd)        (prd-only)        (trd-only)     (tasks-only)
       │                │                 │              │
       ▼                ▼                 ▼              ▼
   prd-writer       prd-writer        trd-writer     task-writer
       │                │                 │              │
       ▼                ▼                 │              │
   trd-writer       task-writer ──────────┤              │
       │                │                 ▼              │
       └───────┬────────┴───────────► task-writer ◄──────┘
               ▼
       parallel-task-executor
               │
               ▼ (done)
           evaluator
               │
               ▼ (pass)
          doc-updater
               │
               ▼ (terminal)
              END
```

---

## 스킬

**using-harness** — 세션 시작 시 훅을 통해 주입되는 메타 스킬. 하네스 체인을 가동할지 (build/fix/refactor/migrate 요청) 인라인으로 답할지 (casual 대화) 를 결정한다. 각 스킬의 "Required next skill" 마커는 load-bearing — 단계를 건너뛰면 엣지별 payload 계약이 깨진다.

**router** — 모든 유저 요청의 진입점. 입력을 `casual`, `clarify`, `plan`, `resume` 중 하나로 분류하고, 새 세션이면 `.planning/{session_id}/` 폴더 스켈레톤을 생성한다.

**brainstorming** — 모호함, 코드베이스 grounding, 라우팅을 처리하는 인테이크 단계. Phase A 에서 요청을 명확화하고 A1.6 (~10 Read/Grep/Glob 코드베이스 peek) 을 돌려 질문이 실재하는 코드를 참조하게 한다. Phase B 에서 작업을 네 가지 경로 (`prd-trd`, `prd-only`, `trd-only`, `tasks-only`) 중 하나로 분류한 뒤 Gate 1 에서 유저 승인을 받는다. 하류 writer 를 위해 `exploration_findings` 를 emit.

**prd-writer** — 격리된 subagent 에서 `PRD.md` 를 작성한다. 목표, 인수 기준, Non-goals, 제약 조건, 열린 질문을 담는다. 엔지니어링 상세가 아닌 outcome 관점으로 작성한다. `exploration_findings` 가 있으면 verify-first (~5 calls), 없으면 full mode (~15).

**trd-writer** — 격리된 subagent 에서 `TRD.md` 를 작성한다. 영향받는 파일/함수 이름, 인터페이스 & 계약, 데이터 모델, 리스크를 코드 형태 수준으로 기술한다. PRD 와 구분되는 레이어다. `exploration_findings` 가 있으면 verify-first (~10 calls), 없으면 full mode (~25).

**task-writer** — 격리된 subagent 에서 `TASKS.md` 를 작성한다. 작업을 PR 단위로 분해한다 (3–8개가 적정). PRD/TRD 용어를 그대로 유지해야 evaluator 가 grep 할 수 있다. 상류 컨텍스트 (TRD 또는 `exploration_findings`) 가 있으면 verify-first (~10 calls), 없으면 full mode (~20).

**parallel-task-executor** — Task 툴을 통해 태스크별로 새 subagent 를 디스패치한다. 가능하면 병렬 실행, 파일 겹침이 있으면 직렬화, 그룹당 최대 5개. 태스크마다 `[Result]` 블록을 기록하고 `ROADMAP.md` 를 마무리한다.

**evaluator** — doc-updater 앞의 게이트. 모든 `[Result]` 블록이 `done` 인지 확인하고 diff 를 프로젝트 규칙에 따라 판정한다. 결과: `pass` → doc-updater; `escalate` 또는 `error` → 세션 종료.

**doc-updater** — 터미널 단계. 코드 변경을 반영해 `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs/**/*.md` 를 업데이트한다. 편집은 ≤20줄로 제한하고, 구조적 개편이 필요한 경우 `findings.md` 에 남긴다.

설치 후 유저 프로젝트엔 다음만 생긴다:

```
<your-project>/
└── .planning/
    └── {YYYY-MM-DD-slug}/
        ├── ROADMAP.md
        ├── STATE.md
        ├── PRD.md
        ├── TRD.md
        ├── TASKS.md
        └── findings.md
```
