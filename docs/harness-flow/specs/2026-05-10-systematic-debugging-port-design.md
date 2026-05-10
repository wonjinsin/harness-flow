# systematic-debugging 스킬 포팅 설계

> 작성일: 2026-05-10
> 브랜치: `worktree-port-systematic-debugging`
> 출처: superpowers([https://github.com/obra/superpowers](https://github.com/obra/superpowers))의 `skills/systematic-debugging/`

## Context

harness-flow는 superpowers에서 8개 스킬을 선별 포팅한 상태이며, **버그 수정용 진입점인 `systematic-debugging`은 누락**되어 있다. 결과적으로 `using-harness-flow`(entry point) 역시 superpowers 원본의 debugging 분기 라인을 모두 잘라낸 미니멀 버전으로 유지되고 있다.

```
superpowers/using-superpowers          harness-flow/using-harness-flow
─────────────────────────────────────  ─────────────────────────────
Process skills first                   Process skills first
  (brainstorming, debugging)             (brainstorming)            ← debugging 빠짐
"Fix this bug" → debugging first        (해당 라인 자체 삭제)        ← 라우팅 가이드 부재
Rigid (TDD, debugging)                 Rigid (TDD)                  ← 분류 누락
```

영향: 사용자가 "bug fix" 류 작업을 요청해도 harness-flow의 가드레일이 작동하는 진입점이 없으며, 모델은 일반 시스템 프롬프트 동작으로 fallback한다. brainstorming은 *기능 빌드* 전제이므로 버그 수정에 부적합 (HARD-GATE가 spec 작성 강요, "2-3 approaches 비교"가 root cause 추적과 직교).

본 설계는:
1. `systematic-debugging`을 harness-flow에 포팅하되, **superpowers 원본의 견고성 약점은 제거**
2. `using-harness-flow`에 debugging 분기 복원
3. 프로젝트 메타 문서(CLAUDE.md, README.md)에 직교 트랙 명시

## 결정 요약 (brainstorming 결과)

| # | 결정 | 값 | 이유 |
|---|---|---|---|
| 1 | 포팅 범위 | superpowers의 11개 파일 중 4개 markdown만 | 셸 스크립트/TS 예제는 npm/Lace 의존, 메타 파일은 런타임 무관 |
| 2 | 본문 cross-skill 참조 (TDD) | `superpowers:test-driven-development` → `harness-flow:test-driven-development` | harness-flow에 동명 스킬 존재, 사용자 invoke 가능 |
| 3 | 본문 cross-skill 참조 (verification) | 줄 자체 삭제 | `verification-before-completion`은 harness-flow에 미포팅, 깨진 참조 방지 |
| 4 | `find-polluter.sh` | **드롭 (markdown으로도 흡수 안 함)** | npm 하드코딩, 알고리즘 자명, 메인 메시지 주변 시나리오에 불과 |
| 5 | `condition-based-waiting-example.ts` | **드롭** | Lace 전용 import (`~/threads/thread-manager`), 어떤 환경에서도 컴파일 안 됨. md에 generic 구현 이미 포함 |
| 6 | `root-cause-tracing.md`의 npm 명령 예시 (L88-90) | 다중 스택 예시로 generalize | npm/go test/pytest 병기 |
| 7 | `root-cause-tracing.md`의 폴루터 섹션 (L97-107) | 통째로 삭제 | 결정 4의 결과 — 메인 backward-tracing 메시지에 부속적 |
| 8 | description 패턴 | 원문 + `" Based on superpowers(https://github.com/obra/superpowers)."` | 다른 8개 스킬과 일관 |
| 9 | CLAUDE.md/README.md 갱신 | 함께 진행 | 직교 트랙임을 명시하지 않으면 chain 문서가 불완전 |

## 작업 범위

### 새 디렉토리: `skills/systematic-debugging/`

복사하는 파일 4개 (모두 markdown):

| 파일 | 변경 |
|---|---|
| `SKILL.md` | (a) frontmatter description에 Based-on 추가 (b) L179, L287의 `superpowers:test-driven-development` → `harness-flow:test-driven-development` (c) L288 `verification-before-completion` 줄 삭제 |
| `root-cause-tracing.md` | (a) L88-90 npm 명령 예시 → 다중 스택 (아래 참조) (b) L97-107 "Finding Which Test Causes Pollution" 섹션 삭제 |
| `defense-in-depth.md` | verbatim |
| `condition-based-waiting.md` | L82 "See `condition-based-waiting-example.ts` ..." 줄 삭제 |

드롭하는 파일 7개:

| 파일 | 사유 |
|---|---|
| `find-polluter.sh` | npm 하드코딩, 알고리즘 자명, 결정 4 |
| `condition-based-waiting-example.ts` | Lace 전용 import, 결정 5 |
| `test-pressure-1.md` ~ `test-pressure-3.md` | 스킬 자체를 시험하는 평가 픽스처 |
| `test-academic.md` | 스킬 quiz |
| `CREATION-LOG.md` | superpowers 저자의 스킬 작성 히스토리 |

### 기존 스킬 수정: `skills/using-harness-flow/SKILL.md`

3곳 수정 — superpowers 원본의 분기 복원:

```diff
@@ Skill Priority @@
- 1. **Process skills first** (brainstorming) - these determine HOW to approach the task
+ 1. **Process skills first** (brainstorming, debugging) - these determine HOW to approach the task
  ...
  "Let's build X" → brainstorming first, then implementation skills.
+ "Fix this bug" → debugging first, then domain-specific skills.

@@ Skill Types @@
- **Rigid** (TDD): Follow exactly. Don't adapt away discipline.
+ **Rigid** (TDD, debugging): Follow exactly. Don't adapt away discipline.
```

### 메타 문서 수정

#### `CLAUDE.md`

"## The Skill Chain (architectural backbone)" 섹션 끝의 `The chain ends when finishing-a-development-branch completes.` 다음에 새 섹션 추가:

```markdown
## Parallel Track: Bug Fixing

`systematic-debugging` is **not** part of the linear chain above — it's an
orthogonal entry point for bug/test-failure/unexpected-behavior tasks.

- Trigger: any technical issue (bug, test failure, performance, build failure)
- Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
- Four phases: Root Cause → Pattern Analysis → Hypothesis → Implementation
- Joins the main chain only at Phase 4 Step 1, where it invokes
  `harness-flow:test-driven-development` to write the failing test before fixing
- Supporting files: `root-cause-tracing.md`, `defense-in-depth.md`,
  `condition-based-waiting.md`

When the user describes a symptom (not a feature), enter via systematic-debugging
instead of brainstorming.
```

#### `README.md`

3곳 수정:

1. **Overview (L5)** — `wires eight skills` → `wires nine skills`, 두 진입점 명시:

   ```
   > A Claude Code plugin that wires nine skills into two gated entry points —
   > a feature track (design → isolation → planning → TDD → review → finish)
   > and a bug-fix track (root-cause investigation → minimal fix) — so the agent
   > walks the full path instead of jumping to the end.
   ```

2. **Skill chain 섹션 끝(L61 `---`와 L63 `## Hooks` 사이)** — "Parallel track" 단락 추가:

   ```markdown
   ---

   ## Parallel track — bug fixing

   **systematic-debugging** — separate entry point for bugs, test failures, or
   unexpected behavior. Enforces root-cause investigation before any fix attempt
   (4 phases, Iron Law: no fixes without investigation). Joins the main chain
   only at Phase 4, where it uses `test-driven-development` to write the failing
   test before fixing.
   ```

3. **Included skills (L178)** — 새 카테고리 추가:

   ```markdown
   **Debugging**

   - **systematic-debugging** — root-cause-first bug investigation (4 phases,
     supporting techniques: root-cause-tracing, defense-in-depth,
     condition-based-waiting)
   ```

### `root-cause-tracing.md` L88-90 정확한 교체 텍스트

원본:
````
**Run and capture:**
```bash
npm test 2>&1 | grep 'DEBUG git init'
```
````

교체:
````
**Run and capture (use your test command):**
```bash
npm test 2>&1 | grep 'DEBUG git init'      # Node
go test ./... -v 2>&1 | grep 'DEBUG git init'   # Go
pytest -s 2>&1 | grep 'DEBUG git init'      # Python
```
````

### `SKILL.md` description 정확한 최종 텍스트

```yaml
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes. Based on superpowers(https://github.com/obra/superpowers).
```

## 비-범위 (out of scope)

- **하위 스킬 추가 포팅** (verification-before-completion, dispatching-parallel-agents 등) — 본 작업은 systematic-debugging 단일 트랙만 다룬다
- **subagent-driven-development와의 통합** — 현재 implementer가 TDD 도중 빨간 테스트를 만났을 때 systematic-debugging으로 분기하도록 prompt를 갱신할지 여부는 별도 follow-up
- **plugin version bump** (`.claude-plugin/plugin.json`) — 마지막 단계에서 같이 처리할지 여부는 implementation 단계에서 결정 (PR 시점 기준)
- **테스트 픽스처 포팅** — 결정 1, 평가 자료는 superpowers 측에 유지

## 파일 변경 매트릭스 (구현 시 참조)

| 파일 | 작업 | 라인 |
|---|---|---|
| `skills/systematic-debugging/SKILL.md` | 신규 (조정 복사) | description, L179, L287, L288 |
| `skills/systematic-debugging/root-cause-tracing.md` | 신규 (조정 복사) | L88-90, L97-107 |
| `skills/systematic-debugging/defense-in-depth.md` | 신규 (verbatim) | — |
| `skills/systematic-debugging/condition-based-waiting.md` | 신규 (조정 복사) | L82 |
| `skills/using-harness-flow/SKILL.md` | 수정 | L101, L104 다음, L108 |
| `CLAUDE.md` | 수정 (섹션 추가) | "The Skill Chain" 섹션 끝 |
| `README.md` | 수정 | L5, L62 (L61 `---`와 L63 `## Hooks` 사이), L178 (Included skills 카테고리 추가) |

## 검증

- 작업 완료 후 hook 단위/스모크 테스트 70개 모두 통과 유지 (`node --test 'tests/hooks/*.test.js' 'tests/hooks/smoke/*.smoke.test.js'`)
- `skills/systematic-debugging/SKILL.md`의 frontmatter가 다른 스킬과 동일 패턴 (description 마지막에 Based-on)
- `using-harness-flow/SKILL.md` 본문에서 `debugging` 토큰이 정확히 3곳 등장
- `README.md`의 "wires nine skills" 일치
- live 세션에서 `using-harness-flow`가 SessionStart hook으로 inject되었을 때 새 분기 문구가 표시되는지 수동 확인 (자동 테스트 없음)

## 참고

- 원본 스킬: `~/Documents/project/superpowers/skills/systematic-debugging/`
- harness-flow 기존 스킬 chain: `CLAUDE.md` "The Skill Chain (architectural backbone)" 섹션
- 6개 하네스 비교 분석: `design/comparison.md`
