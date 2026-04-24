---
name: doc-updater
description: `evaluator` 통과 후 사용. 세션의 코드 변경을 `CHANGELOG.md` (무조건), `README.md`, `CLAUDE.md`, `docs/**/*.md` 에 반영. `.planning/{session_id}/findings.md` 에 감사 로그 기록. 유저 확인 없음 — evaluator 가 이미 게이트했고 문서 편집은 git revert 가능.
---

# Doc Updater

세션의 코드 변경을 프로젝트 문서에 반영. `doc-updater` agent 의 격리 컨텍스트에서 실행.

## Input

- `session_id`: `"YYYY-MM-DD-{slug}"`
- `tasks_path`: `".planning/{session_id}/TASKS.md"`
- `diff_command` *(선택)*: 기본 `git diff HEAD`
- `project_root` *(선택)*: 기본 CWD

## Output

단일 JSON 객체, 옆에 산문 금지:

```json
{ "outcome": "done", "session_id": "..." }
{ "outcome": "error", "session_id": "...", "reason": "<한 줄>" }
```

## Procedure

1. **컨텍스트 읽기** — `tasks_path` 파싱 (task 별 heading, Description, `[Result]`), `diff_command` 실행. TASKS.md 부재 또는 diff 비어있음 → `error`.

2. **CHANGELOG.md (무조건)** — 부재 시 [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) 스켈레톤으로 생성. `## [Unreleased]` 찾기 (없으면 삽입). 각 task 를 `Added` / `Changed` / `Fixed` / `Security` / `Deprecated` / `Removed` 로 분류. 보안 관련 diff (auth, crypto, 입력 검증, 비밀키, RBAC) 는 `Security` 에도 중복 등재. 모호 시 `Added > Changed > Fixed` 우선. task 당 bullet 한 줄: `- {명령형 한 줄} (TASKS.md: task-{id})`.

3. **README.md / CLAUDE.md / docs/\*\*/\*.md** — 존재하는 파일마다 diff 가 의미론적으로 건드린 섹션 식별. ≤20 줄 편집 적용: 기존 섹션 업데이트 (라인 번호 포함) 또는 파일 끝에 `## {heading}` append. 전면 재작성 요구 시 `not applied — structural rewrite required` 기록하고 스킵.

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

5. **방출** `{outcome: "done", session_id}`.

## Constraints

- 생성물/vendored 경로 무시: `dist/`, `node_modules/`, `*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `Cargo.lock`, `go.sum`.
- `[Result: skipped]` task 는 CHANGELOG 에서 제외.
- 번역 (`README.ko.md` 등), 버전 범프, 네 타겟 외 신규 문서 생성 금지 — 스킵된 variant 는 `## Not applied` 에 기록.
- 유저에게 질문 금지. 모호하면 `## Not applied` 에 기록하고 계속.
- `not applied` 는 `error` 로 승격하지 않음 — 복구 불가 인프라 실패 (권한 거부, 디스크 풀, CHANGELOG 손상) 만 `error`.

## Tools

`Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash` (`git diff` 용).
