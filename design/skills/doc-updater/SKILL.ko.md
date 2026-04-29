---
name: doc-updater
description: harness `evaluator` 노드가 통과한 뒤 세션의 코드 변경을 프로젝트 문서(`CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs/**/*.md`)에 반영해야 할 때 사용. harness 흐름의 doc-updater 종단 노드로 실행될 때 사용.
---

# Doc Updater

세션의 코드 변경을 프로젝트 문서에 반영. `doc-updater` agent 의 격리 컨텍스트에서 실행.

## 실행 모드

**Subagent (격리 컨텍스트).** 메인 thread 가 Skill 툴로 SKILL.md 를 로드한 뒤 Task 툴로 별도 dispatch. 서브에이전트는 payload 외 메인 대화 히스토리에 접근 불가.

## When NOT to use

- harness flow 바깥 — doc-updater 는 `evaluator` 게이트 통과를 전제로 함.
- README 번역이나 버전 범프 — 이건 사람의 일.
- diff 가 비어있을 때: 상류가 문서화할 변경을 만들지 않았다는 뜻. `done` 이 아니라 `error` 방출.

## Input

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `tasks_path`: `".planning/{session_id}/TASKS.md"`
- `diff_command` *(선택)*: 기본 `git diff HEAD`
- `project_root` *(선택)*: 기본 CWD

## Output

단일 JSON 객체, 옆에 산문 금지.

```json
{ "outcome": "done", "session_id": "..." }
{ "outcome": "error", "session_id": "...", "reason": "<one line>" }
```

## Procedure

1. **컨텍스트 읽기** — `tasks_path` 파싱 (task 별 heading, Description, `[Result]`), `diff_command` 실행. TASKS.md 부재 또는 diff 비어있음 → `error`.

2. **CHANGELOG.md (무조건)** — 부재 시 [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) 스켈레톤으로 생성. `## [Unreleased]` 찾기 (없으면 삽입). 각 task 를 `Added` / `Changed` / `Fixed` / `Security` / `Deprecated` / `Removed` 로 분류. 보안 관련 diff (auth, crypto, 입력 검증, 비밀키, RBAC) 는 `Security` 에도 중복 등재. 모호 시 `Added > Changed > Fixed` 우선. task 당 bullet 한 줄: `- {명령형 한 줄} (TASKS.md: task-{id})`.

3. **README.md / CLAUDE.md / docs/\*\*/\*.md** — 존재하는 파일마다 diff 가 의미론적으로 건드린 섹션 식별. ≤20 줄 편집 적용: 기존 섹션 업데이트 (라인 번호 포함) 또는 파일 끝에 `## {heading}` append. 전면 재작성 요구 시 `not applied — structural rewrite required` 기록하고 스킵 (≤20 줄이면 문서 편집을 단일 hunk 로 리뷰 가능; 구조적 재작성은 사람 몫이지 조용히 쪼갤 일이 아님).

4. **findings.md** — `.planning/{session_id}/findings.md` 작성:

   ```markdown
   # Doc Impact Findings — {session_id}

   ## Scanned
   - README.md ✓
   - ...

   ## Changes applied
   ### CHANGELOG.md
   - [x] Added: ... (TASKS.md: task-3)
   ### README.md
   - [x] Section "Features" (line 12) — ...
   ### docs/api.md
   - (영향 없음)

   ## Not applied
   - docs/architecture.md — structural rewrite required
   ```

   `## Not applied` 비어있으면 생략.

5. **방출** — doc-updater 는 terminal node — `{outcome, session_id}` (에러 시 `{outcome, session_id, reason}`) 방출.

## 필수 다음 스킬

doc-updater 는 terminal node — harness 흐름이 여기서 종료. 사용자에게 짧은 요약 (CHANGELOG 항목, 갱신된 파일) 을 보고하고 멈춤.

## Constraints

- 생성물/vendored 경로 무시: `dist/`, `node_modules/`, `*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `go.sum`.
- `[Result: skipped]` task 는 CHANGELOG 에서 제외.
- 번역 (`README.ko.md` 등), 버전 범프, 네 타겟 외 신규 문서 생성 금지 — 스킵된 variant 는 `## Not applied` 에 기록.
- 유저에게 질문 금지. 모호하면 `## Not applied` 에 기록하고 계속.
- `not applied` 는 `error` 로 승격하지 않음 — 복구 불가 인프라 실패 (권한 거부, 디스크 풀, CHANGELOG 손상) 만 `error`.

## Common Mistakes

- **README 번역** — 범위 밖. `README.ko.md` 등 로케일 variant 는 번역가의 일. `## Not applied` 에 기록하고 계속 진행.
- **버전 범프** — 범위 밖. 버전 시맨틱은 릴리즈 결정이지 문서 영향 결정이 아님.
- **`not applied` 를 `error` 로 승격** — `not applied` 는 정상 결과 (findings.md 에 기록됨). `error` 는 복구 불가 인프라 실패 (권한 거부, 디스크 풀, CHANGELOG 손상) 만.

## Tools

`Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash` (`git diff` 용).
