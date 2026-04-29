# 파일 소유권 (File ownership)

하네스가 건드리는 각 파일에 대해 어느 스킬이 생성·갱신·읽기 전용 권한을 갖는지의 단일 출처. 각 스킬의 `## Boundaries` 섹션은 자유 형식 리스트가 아니라 이 표의 자기 행이다 — 동기화 유지.

## 세션 산출물 (`.planning/{session_id}/` 하위)

| 경로 | 생성 | 갱신 | 읽기 전용 |
|---|---|---|---|
| `ROADMAP.md` | `router` (빈 스켈레톤, Step 4) | `brainstorming` (Complexity 라인, brainstorming 행), `parallel-task-executor` (phase 마무리, Step 7) | `trd-writer`, `task-writer`, `evaluator` |
| `STATE.md` | `router` (빈 스켈레톤, Step 4) | `brainstorming` (Current Position, Last activity), `parallel-task-executor` (resume 상태), 메인 thread (`escalated`, `last_eval`, `last_eval_at`, `last_eval_excerpt` — evaluator 리턴 시) | `evaluator` *(STATE.md 를 읽지 않음)* |
| `PRD.md` | `prd-writer` | — (추가 쓰기 없음; 재생성은 삭제 후 재디스패치) | `trd-writer`, `task-writer` |
| `TRD.md` | `trd-writer` | — | `task-writer` |
| `TASKS.md` | `task-writer` | `parallel-task-executor` (task 별 `[Result]` 블록만; 본문 절대 손대지 않음) | `evaluator`, `doc-updater` |
| `findings.md` | `doc-updater` | — | — |

## 프로젝트 레벨 파일

| 경로 | 생성/갱신 | 비고 |
|---|---|---|
| `CHANGELOG.md` | `doc-updater` | 부재하면 Keep-a-Changelog 스켈레톤으로 생성; 그 외에는 `## [Unreleased]` 아래에 추가. |
| `README.md`, `CLAUDE.md`, `docs/**/*.md` | `doc-updater` (≤20 라인 편집만) | 구조 재작성은 `findings.md` 에 `not applied — structural rewrite required` 로 기록; 사람이 처리. 로케일 변종 (예: `README.ko.md`) 없음. |
| VCS 하의 소스 코드 | `parallel-task-executor` 의 task 별 **서브에이전트** (Task 툴, 격리 컨텍스트) | executor 자체는 코드 편집 안 함 — 디스패치만. 각 서브에이전트의 편집은 task 의 `Files:` 선언 범위로 제한. |

## 금지 작업

- **executor 의 task 별 서브에이전트 외에는 어떤 스킬도 소스 코드를 수정하지 않는다.** writer, brainstorming, router, evaluator, doc-updater 는 코드를 읽다가 버그를 발견해도 편집하지 않는다. 자기 산출물에 발견사항을 기록한다 (PRD/TRD 의 Open questions, TASKS 의 Notes, doc-updater 의 `findings.md`).
- **위 표의 자기 행 밖의 `.planning/{session_id}/` 디렉토리에 어떤 스킬도 쓰지 않는다.** 행이 계약이다; 벗어나면 재생성 소유권에 대한 다운스트림 가정이 깨진다.
- **`*.ko.md`, `*.ja.md` 등 로케일 변종을 어떤 스킬도 쓰지 않는다.** 번역은 사람의 책임; 마주치면 `findings.md` 의 `## Not applied` 에 기록.

## SKILL.md 가 이 파일을 참조하는 방법

각 스킬의 `## Boundaries` (또는 동등 섹션) 는 이 표의 자기 행을 그대로 나열하고, 스킬-특화 운영 제약 (도구 예산, 시도 캡 등) 을 추가한다. 단일 출처는 여기 살고; `SKILL.md` 행은 요약이지 새 규칙이 아니다. 예시:

```markdown
## Boundaries

- File ownership: see `../../harness-contracts/file-ownership.md` (this skill = TRD.md row).
- Tool budget: ~25 Read/Grep/Glob calls. ...
- Do not invoke other agents or skills. ...
```
