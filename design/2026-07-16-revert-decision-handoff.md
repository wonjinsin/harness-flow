# plan-demotion 복귀 결정 — 새 세션 실행 핸드오프

**날짜**: 2026-07-16
**상태**: 결정 완료 (사용자 확정) · 실행 대기
**대상 릴리스**: 1.3.0

## 1. 결정과 근거 (재논의 불필요)

사용자 게이트: **"토큰과 속도 둘 다 개선되지 않으면 의미가 없다"** — 품질은
하드 제약이지 교환재가 아님.

이 게이트를 plan-demotion(1.2.0–1.2.2)에 적용한 결과:

| 축 | 1.2.x vs 1.1.7 | 근거 |
|---|---|---|
| 속도 | 승 (사람 게이트 2→1, 생산자 −25%) | retro §8 eval1 |
| 토큰 | 중립~열세 — n=1 −0.9k / n≥3 +0.7k (이중 저작, n 선형) + 스킬 텍스트 +454단어 | retro §9 실측 |
| (간접) | cheap 스킵의 전제(plan 인간 게이트) 상실 → follow-up 2가 리뷰어 +86.2k/기능으로 유료 대체 | retro §9 |

→ **양축 동시 개선 실패 = 탈락. 1.1.x plan 아키텍처로 복귀**하되, 양축
모두 이득인 요소만 이식한다: fence-aware 스캐너 (false-positive 재작성
사이클 제거 = 토큰·속도 동시 개선 + task-brief 무신호 절단 버그 해소).

## 2. 실행 스코프 (3 태스크 — SDD 인라인 경로, 최종 리뷰만 dispatch)

### Task 1: 스킬 체인 1.1.x 의미로 복원

- 복원 (원본: 832eb5e — 단 §3 함정 1 필독):
  `skills/writing-plans/SKILL.md`, `skills/writing-plans/plan-document-reviewer-prompt.md`(부활),
  `skills/subagent-driven-development/SKILL.md`, `skills/subagent-driven-development/task-reviewer-prompt.md`,
  `skills/brainstorming/SKILL.md`, `skills/subagent-driven-development/scripts/task-brief`(주석 원복; fence 수리는 Task 2)
- 삭제: `skills/subagent-driven-development/scripts/brief-check`, `tests/scripts/brief-check.test.js`
- 수동 재작성 (checkout 복원 금지 — 함정 1): `CLAUDE.md` 체인 2·4·5단계를 plan
  문서 기반 서술로 (writing-plans → `docs/harness-flow/plans/` 출력, plan 리뷰
  게이트, task-brief 추출, review gating = cheap 스킵), `README.md` 3단계·산출물
  경로 원복. `docs/harness-flow/` gitignore 노트(Output Paths)는 유지 (계속 유효).
- 1.1.7 스킬에 이미 있어 복원으로 자동 확보되는 것: inline path(≤3 tasks),
  review gating cheap-skip(1.1.6), 3-re-review cap, ledger, review-package.

### Task 2: fence-aware 스캐너를 task-brief에 이식 (TDD)

- 원본 로직: 현 master `scripts/brief-check`의 awk `ticklen` 상태 머신 —
  열림 = `[ \t]*` + backtick ≥3 (길이 기록), 닫힘 = backtick ≥ 열림 길이 +
  `[ \t]*$`, 미달 행은 펜스 내용. BSD awk 호환 (GNU 전용 금지).
- task-brief의 헤딩 탐지가 펜스 내부 헤딩을 무시하도록 이 상태 머신을 적용
  (1.2.0 이전의 naive `/^```/` 토글이 4-backtick 중첩에서 그룹 텍스트를
  무신호 절단한 실발동 버그의 수리).
- Red 선행: 4-backtick 중첩 펜스 절단 재현 + 들여쓴 펜스 케이스를
  `tests/scripts/task-brief.test.js`에 추가 (파일 존재 여부 먼저 확인; 없으면
  brief-check.test.js의 spawnSync 관례로 신규 작성).
- exit/CLI 계약 불변.

### Task 3: 릴리스

- 버전 1.3.0: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`,
  `.codex-plugin/plugin.json` (codex mirror 테스트가 동등성 강제).
- `design/2026-07-15-plan-demotion-retrospective.md`에 §10 추가: 복귀 완료 기록.
- 전체 스위트 green 확인 후 squash merge to master.

## 3. 함정 (이번 세션들에서 실제로 밟은 것)

1. **832eb5e는 순수 1.1.7 스냅샷이 아니다.** 히스토리 재작성 오염으로
   CLAUDE.md가 1.2.x 체인 텍스트(자기 트리에 없는 `scripts/brief-check` 참조
   포함)를 담고 있고 README도 일부 오염 가능. 따라서 CLAUDE.md·README는
   832eb5e에서 checkout하지 말고 수동 재작성. 스킬 파일들은 복원 전
   `git diff 74f1cd9 832eb5e -- skills/writing-plans skills/subagent-driven-development skills/brainstorming`
   으로 1.1.6↔1.1.7 간 무변경을 확인한 뒤 832eb5e에서 복원 (차이가 있으면
   내용을 읽고 1.1.7 의미가 맞는 쪽 선택).
2. **worktree는 stale origin/master에서 분기됨** — 생성 직후
   `git merge --ff-only master` 필수 (두 세션 연속 발생).
3. **digraph 노드 rename 시 개수를 grep으로 실측** — 들어오는 엣지 포함.
   추정 개수 오기가 두 세션 연속 발생 (3이라 쓰고 실제 4).
4. **사용자 전역 git hook**(`core.hooksPath=~/.git_template/hooks`)이 워크트리
   브랜치 커밋 subject에 `[브랜치명]` 프리픽스를 붙임 (JIRA 매처 오인).
   squash merge가 흡수 — 대응 불요, 커밋 메시지 검증 시 무시.
5. **dispatch된 서브에이전트가 main checkout에 커밋할 수 있음** (CLAUDE.md
   gotcha) — dispatch 프롬프트에 브랜치 확인 지시 + DONE 후 `git log` 검증.
6. `docs/harness-flow/`는 gitignore — spec/plan은 미커밋 작업 산출물,
   `git add -f` 금지. 영구 기록은 `design/`으로.

## 4. 보존 대상 (revert가 지우면 안 되는 것)

- `design/` 회고 3건 전부 (plan-demotion §1–9, section-only, 이 문서)
- hooks 일체 (이번 변경들과 무관) — 단 `hooks/pre-agent-model.js`의 `SDD_DESC`
  앵커가 복원된 1.1.x 프롬프트 템플릿의 description 형태와 일치하는지 확인
  ("Implement Group N:" / "Review Group N (spec + quality)" — 1.1.6에서 도입,
  일치할 것)
- 미머지 브랜치 `worktree-section-only-dispatch` (회수 가능 자산)

## 5. 판단 이력 요약 (컨텍스트용)

1.2.0 (spec 섹션 + dispatch-time brief) → 1.2.1 (경계 문구) → section-only
실험 (음성, 미머지) → 심층평가 "keep with follow-ups" (§8) → follow-up 1–3
실행 + 1.2.2 (§9): n=3 이중저작 +27% 실측, follow-up 2 리뷰어 +86.2k/기능
→ 사용자 게이트 적용 → **복귀 확정**. 남는 교훈: 토큰 레버는 문서 구조가
아니라 (a) 리뷰어 게이팅 정책, (b) false-positive 사이클 제거였다.
