# Codex 도구 매핑

harness-flow의 본문은 Claude Code 도구명을 사용한다. Codex에서는 현재
세션에 실제 노출된 도구 스키마를 먼저 확인하고 아래처럼 번역한다. Codex
버전에 따라 orchestration API가 달라질 수 있으므로 존재하지 않는 인자를
추측하지 않는다.

| skill 표기 | 현재 Codex 대응 |
| --- | --- |
| `Task`로 subagent 시작 | `spawn_agent({task_name, message, fork_turns: "none"})` |
| 완료 대기 | `wait_agent({timeout_ms})` |
| 실행 중 추가 정보 전달 | `send_message({target, message})` |
| 완료된 agent 재개 | `followup_task({target, message})` |
| 실행 중단 | `interrupt_agent({target})` |
| agent 상태 확인 | `list_agents({})` |
| `TodoWrite` | `update_plan` |
| `Skill` | Codex native skill 로딩; 해당 `SKILL.md`를 끝까지 읽고 따른다 |
| `Read`, `Write`, `Edit` | native file tool; 수정은 `apply_patch` 우선 |
| `Bash` | native shell tool |
| `CLAUDE.md` (project memory) | `AGENTS.md`; nested 파일은 해당 subtree에 적용 |

`claude-md-revise`는 이름만 Claude용이다. Codex 세션에서는 root/nested
`AGENTS.md`를 대상으로 하고, `.claude/rules/*.md`와 `~/.claude/` 경로는
사용하지 않는다. Codex user-level 지시 파일 경로를 추측해서 쓰지 않는다.

`functions.wait`는 장시간 실행 중인 exec cell용이며 subagent 대기 도구가
아니다. 현재 collaboration API에는 별도 close 단계가 없다. 완료된 agent는
활성 동시성 슬롯을 점유하지 않는다.

## Subagent 호출 계약

현재 `spawn_agent`의 필수값은 `task_name`과 `message`다. `task_name`은 한
요청 안에서 고유하고 짧게 정한다. SDD의 fresh-context 계약을 지키기 위해
구현자와 reviewer는 항상 `fork_turns: "none"`으로 시작하고, 요구사항은
brief/report/package 파일 경로로 전달한다.

```text
spawn_agent({
  task_name: "implement_group_2",
  fork_turns: "none",
  message: "<filled implementer prompt>"
})
```

agent가 질문한 뒤 종료했다면 새 agent를 만들지 말고 `followup_task`로 같은
thread를 재개한다. 실행 중이면 `send_message`를 쓴다. 작업 결과가 필요하면
`wait_agent`로 mailbox update를 기다린 뒤 `list_agents`로 상태를 확인한다.

## Template 기반 dispatch

1. template 파일을 skill 디렉터리 기준으로 읽는다.
2. placeholder를 모두 실제 값으로 채운다.
3. 요구사항 파일과 report 파일의 절대 경로를 message에 넣는다.
4. `fork_turns: "none"`으로 dispatch한다.

`message`는 system prompt가 아니다. 다음 framing을 사용한다.

```text
Your task is to perform the following. Follow the instructions below exactly.

<agent-instructions>
[filled prompt]
</agent-instructions>

Execute this now. Output ONLY the required structured response.
```

- persona framing("You are...") 대신 task-delegation framing("Your task is...")을 쓴다.
- 지시는 XML tag로 감싼다. 모델이 tag block을 authoritative하게 다룬다.
- 마지막에 명시적 실행 지시를 넣어 지시문 요약으로 끝나는 것을 막는다.

## SDD 모델 티어

SDD의 복잡도 기준으로 `cheap`, `standard`, `most capable` 중 하나를 먼저
선택하고, Codex가 현재 surface에서 사용할 수 있는 가장 낮은 적합 모델을 고르게
한다. 이는 권고형 선택이며 exact model을 보장하지 않는다. direct `spawn_agent`는
per-call `model`, `profile`, `agent_type`을 지원하지 않으므로 해당 필드를 만들지
않는다.

## Plugin 설치와 hook 신뢰

```bash
codex plugin marketplace add wonjinsin/harness-flow
# 로컬 checkout
codex plugin marketplace add .
```

설치 후 `/hooks`에서 plugin hook 정의를 검토하고 신뢰해야 한다. plugin을
enable하는 것만으로 command hook이 자동 신뢰되지는 않는다. hook 변경 뒤에도
hash가 달라지므로 다시 검토한다.

최신 Codex는 multi-agent가 기본 활성화된다. `spawn_agent`가 실제로 노출되지
않는 구버전에서만 다음 설정 후 Codex를 재시작한다.

```toml
[features]
multi_agent = true
```

hook에서는 `PLUGIN_ROOT`가 Codex 기본 변수이며 `CLAUDE_PLUGIN_ROOT`도 호환
alias로 제공된다. 이 plugin은 두 harness가 공유하는 hook 파일 때문에 호환
alias를 사용한다.

## Skill script 경로

Codex shell CWD는 보통 사용자 프로젝트다. `scripts/plan-audit`처럼 skill에
포함된 실행 파일은 CWD 상대 경로로 실행하지 않는다. 로드한 `SKILL.md`의
디렉터리를 `SKILL_DIR`로 잡고 절대 경로를 사용한다.

```bash
"$SKILL_DIR/scripts/plan-audit" "$PLAN_FILE" --base "$IMPLEMENTATION_BASE"
```

## Git 환경 감지

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON`: linked worktree
- 빈 `BRANCH`: detached HEAD

Codex App이 관리하는 detached workspace에서는 임의로 worktree를 제거하거나
branch를 삭제하지 않는다. 작업을 보존한 뒤 App의 **Create branch** 또는
**Hand off to local** control을 사용하도록 안내한다.
