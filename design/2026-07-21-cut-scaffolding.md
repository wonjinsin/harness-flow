# 스킬 라이브러리 간소화 — enforcement scaffolding 제거

작성일: 2026-07-21
브랜치: `simplify-skills` (base `a970afc`)
현재 순 변경: **46 파일, +498 / −4,750 (net −4,252줄)**

이 문서는 멀티에이전트 리뷰의 근거 자료다. "무엇을, 왜 바꿨는가"와 "각 스킬에서
정확히 무엇을 잘랐고 무엇을 남겼는가"를 리뷰어가 실제 파일과 대조할 수 있을 만큼
상세히 기록한다. 리뷰 질문은 문서 맨 끝 §7에 있다.

---

## 1. 배경과 동기

harness-flow는 obra/superpowers(v6.1.1)의 포크이며, 마크다운 스킬 체인
(brainstorming → writing-plans → 실행 → 최종 리뷰 → finishing)으로 구성된다.
포크 과정에서 superpowers의 가벼운 `executing-plans`(70줄 인라인 경로)를 버리고
무거운 `subagent-driven-development`(dispatch/ledger/scripts 머신)만 남겨,
**원본보다 오히려 무거워졌다.**

세 가지 동인:

1. **LLM 역량 향상.** 스킬에 박힌 enforcement scaffolding(반복되는 iron law,
   rationalization 표, Red Flags STOP 목록)은 약한 모델이 절차를 이탈하지 않게
   붙잡아두는 장치였다. 현재 모델에는 과잉이다.
2. **필드 합의.** 비교한 7개 프로젝트 중 5개가 spec/plan을 optional로 둔다
   (GSD/superpowers만 강제). harness-flow가 상속한 강제 게이트는 과중하다.
3. **실제 작업 성격.** 사용자의 작업은 one-shot 대형 프로젝트가 아니라
   점진적/incremental이다. 무거운 사전 설계 게이트가 마찰만 만든다.

목표: **스킬/훅을 50% 이상 감축.** 품질은 제약(constraint)이지 목표가 아니며,
속도·토큰 개선이 1차 게이트다([[changes-optimize-speed-and-tokens]] 메모 원칙).

## 2. 핵심 설계 판단 (사용자와 인터뷰로 확정)

### 2.1 "실체 vs 스캐폴딩" 구분선

이 브랜치 전체를 관통하는 단일 기준:

- **실체(유지):** 기법 자체 — mocking anti-pattern, 진단 휴리스틱, git 명령 블록,
  placement 로딩 시맨틱, 역추적 절차, 탐지 신호. "어떻게 하는가"의 내용.
- **스캐폴딩(컷):** 절차 규칙을 format만 바꿔 반복하는 것 — Red Flags STOP 목록,
  Common Mistakes 표, Quick Reference 표, rationalization 표, "Announce at start"
  줄, Overview 슬로건, 상위 표를 1:1 복제한 graphviz digraph.

판정 규칙: 삭제 후보가 **프로세스 스텝에 이미 있는 규칙의 재진술**이면 컷,
**다른 곳에 없는 내용/탐지신호/WHY**면 유지. 비자명한 WHY는 inline 주석으로 보존.

### 2.2 실행 모델 = A″ (inline-first)

`subagent-driven-development`(500줄) → `implement`(57줄)로 재작성·개명.

- 기본: 현재 세션·세션 모델에서 **inline 실행**(TDD, 태스크당 1커밋).
- 옵션: 깨끗한 컨텍스트가 명백히 이득일 때만 **단일·순차** 서브에이전트 격리
  (병렬 없음, brief 파일/ledger 없음).
- 항상: 끝에 **fresh-context 최종 리뷰 1회**, most-capable 모델.

근거: 필드 증거상 병렬성은 **빌드가 아니라 리뷰에 속한다**(Archon/gstack/Matt은
빌드를 inline). superpowers `executing-plans`(70줄 inline) 선례. dispatch/ledger/
model-tier 머신 전부 제거.

### 2.3 Spec 게이팅 = Model B (optional)

brainstorming이 종료 지점을 **추천**하고 사용자가 선택(작은 작업→바로 TDD,
큰 작업→spec 작성→plan). HARD-GATE·강제 spec 파일·별도 승인 루프 없음.
tier 시스템(trivial/standard + `sizing.md`) 전면 제거 — 라우팅은 타입별로만.

### 2.4 Cross-harness = neutral 문구, 플러그인은 유지

스킬 본문은 harness-neutral 문구 사용, tool-translation 참조 파일
(`codex-tools.md`, `copilot-tools.md`)은 삭제. **단, 플러그인 인프라
(`.codex-plugin/`, `.agents/`, `AGENTS.md`)는 유지** — Codex는 계속 지원 대상.

예외: dispatch **템플릿**(`code-reviewer.md`)은 harness-neutral 대상 아님.
`Claude Code Task/Agent`를 명시하고 별도 **Codex translation** 블록을 유지한다
(`spawn_agent`/`fork_turns: none`/`task_name: final_review`). test lock으로 고정됨.

## 3. 변경된 스킬 — 상세

수치는 base `a970afc` 대비 (줄 수).

### 3.1 using-harness-flow (80 → 21)

- tier 시스템(Size the Work First 표, trivial/standard 라우팅) + `references/sizing.md`
  삭제. 라우팅을 타입별로만 축소(Build→brainstorming, Bug→systematic-debugging).
- Platform Adaptation의 Codex/Copilot 참조 삭제, harness-neutral 문구로.
- test lock: 엔트리 스킬은 "harness-neutral" 포함, "TodoWrite" 미포함으로 고정.

### 3.2 brainstorming (148 → 42)

- Model B로 재작성. Loop(explore, 하나씩 grill + 추천, 2–3 접근, YAGNI),
  "Exit — recommend, let the user pick", 규칙 기반 Spec 섹션(사용자 관점으로 작성,
  결정을 기록하되 코드는 아님, placeholder 금지, tight·opinionated).
- HARD-GATE·강제 spec·승인 루프 제거. orphan `spec-document-reviewer-prompt.md` 삭제.

### 3.3 using-git-worktrees (244 → 63)

- Step 0(격리 감지 + submodule 가드), Step 1a(네이티브 tool), Step 1b(수동 git)로 압축.
- test lock 문자열 보존: `git check-ref-format --branch`,
  `git check-ignore -q -- "$LOCATION"`, "sibling directory", `manual-git-worktree`,
  그리고 "Add to .gitignore, commit" 미포함.

### 3.4 writing-plans (244 → 70)

- Matt Pocock to-tickets 스타일. Spec 포인터 헤더 + Goal + Constraints.
  태스크는 Delivers/Touches(파일, 라인번호 없음)/Blocked by/acceptance 체크박스.
  "좋은 태스크"(tracer-bullet, vertical slice), 규칙(prefactor, 코드블록·라인번호 금지).
- Group/Interfaces dispatch 머신 제거(inline 실행이라 불필요).
- test lock: "There is no group-boundary reviewer", "After the user approves" 보존.

### 3.5 test-driven-development (399 → 62) + testing-anti-patterns (317 → 82)

- SKILL: Iron Law + ownership 가드("pre-existing user code"/"current TDD cycle" 보존),
  The Loop(RED/verify/GREEN/verify/REFACTOR), Good Tests 표, "When stuck" 표
  (테스트 고통→설계 신호), mocking anti-pattern 포인터.
- anti-patterns: 5개 mocking anti-pattern(위반/수정), "mocks 복잡해질 때",
  "Red flags"(6개 탐지 신호 — 복원됨) 유지. Gate Function 의사코드, Quick Reference
  표, Bottom Line 제거.
- 참고: 사용자가 Red Flags 탐지신호를 실체로 보고 복원 요청함(프로즈에 없는 신호).

### 3.6 systematic-debugging (SKILL 311 → 70, 지원파일 3개 394 → 133; 계 705 → 203)

- SKILL: Iron Law, 4 phase(에러 읽기/재현/최근변경/**계층 계측 예제**/역추적 포인터),
  Phase 2–3 압축, **3-fix→아키텍처 질문** 룰, claude-md-revise+finishing(harness-neutral),
  Supporting techniques 포인터.
- 컷: Overview, "When to Use ESPECIALLY", Red Flags 목록, "human partner Signals",
  Common Rationalizations 표, Quick Reference 표, Real-World Impact 통계, graphviz digraph들.
- 지원파일: `root-cause-tracing.md`(159→41), `defense-in-depth.md`(122→46),
  `condition-based-waiting.md`(113→46) — 각 핵심 기법 + 예제 1개로 압축.
- **cascade:** claude-md-revise 참조를 harness-neutral화(CLAUDE.md/AGENTS.md 명시 제거)
  → `codex-runtime-contracts.test.js`의 debugging platform 검증 삭제.

### 3.7 claude-md-revise (209 → 130)

- 컷(스캐폴딩): Step 4 밑 graphviz digraph(위 표 1:1 복제), Quick Reference 표,
  Common Mistakes 표(9행), Red Flags STOP(9항목), "Announce at start", Overview 장황함.
- 유지(실체 전부): Platform Detection, Process 6스텝, Step 4 placement 표 + 200줄
  reactive 룰, references 2개(`placement-decision.md`, `examples.md`) 그대로.
- **복원:** 항목별 대조 후, 스텝에 없던 nuance 2개만 담은 "Guardrails" 6줄 복원
  (① one-time 제안→defer, ② project-wide 룰을 subdir에 묻으면 touched시에만 로드).
- test lock 보존: `Codex...AGENTS.md`, "do not scan them by guessed path".

### 3.8 requesting-code-review (SKILL 128 → 49, code-reviewer.md 178 → 172)

- **dangling 해소:** 삭제된 `../subagent-driven-development/scripts/review-package`
  호출과 `{DIFF_FILE}` placeholder 제거 → 리뷰어가 `git diff BASE..HEAD` 직접 실행.
  `plan-audit` 참조 제거.
- 동작 변경: "least powerful model that fits"(SDD tier) → **"most capable"**
  (A″ 결정: 최종 리뷰는 cost 쓸 가치 있는 유일한 곳).
- 컷: "Review early review often" 슬로건, 장황한 When 목록, 24줄 Example,
  "Integration with Workflows" 3하위섹션, Red Flags.
- 유지: code-reviewer.md 템플릿 본문 전부(체크리스트/output format/calibration/
  Example Output), **Codex translation**(dispatch-template 예외).
- test lock 보존: `spawn_agent`, `fork_turns...none`, `final_review`,
  `SDD...final whole-branch review`.

### 3.9 finishing-a-development-branch (287 → 212)

- 컷(스캐폴딩만): Overview + "Announce at start", Quick Reference 표,
  Common Mistakes(7항목), Red Flags Never/Always.
- 유지: 프로세스 Step 1–6 전부(git 명령 블록, provenance/detached-HEAD 로직).
  다른 스킬보다 컷 폭이 작음 — 실체가 git 메커니즘이라.
- 비자명 WHY 점검: squash `-D` 이유는 Step 5에 inline 주석으로 이미 존재.
- test lock 보존: `detached HEAD...exactly these 2 options`, `Create branch`,
  `Hand off to local`, `harness-flow:pr-creator`, `git switch <base-branch>`.

## 4. 삭제된 머신 (subagent-driven-development 계열)

`implement`로 대체되며 불필요해진 것들:

- `skills/subagent-driven-development/` 전체: SKILL(500), `implementer-prompt.md`(165),
  `task-reviewer-prompt.md`(127), `references/example-workflow.md`,
  `scripts/{task-brief, review-package, sdd-workspace, plan-audit, lib/plan-lib.js}`.
- 훅 2개: `hooks/pre-agent-model.js`(SDD 모델 누락 가드),
  `hooks/pre-plan-audit.js`(최종 리뷰 완결성 게이트). → 훅 6개에서 4개로.
  **주의: plan-audit는 SDD dispatch 전용 스캐폴딩이 아니라 in-session 완결성
  안전 게이트였다**(외부 루프 eval에서 in-session 실행이 태스크 30–50%를 조용히
  누락한 실패를 막으려 in-session 체인에 역이식된 것 — `2026-07-18-plan-audit-gate-retrospective.md`).
  결정론적 훅(deny)은 제거하되, 그 방어 개념은 `implement`의 "Before the final
  review: completeness check" 스텝으로 옮겨 확률적(컨트롤러 자체 확인) 형태로 보존한다.
- 참조: `using-harness-flow/references/{codex-tools.md, copilot-tools.md, sizing.md}`.
- reviewer prompt: `writing-plans/plan-document-reviewer-prompt.md`,
  `brainstorming/spec-document-reviewer-prompt.md`.
- 테스트: `tests/scripts/task-brief.test.js`, `tests/plan-audit/*`,
  `tests/hooks/{pre-agent-model, pre-plan-audit, smoke/pre-agent-model.smoke}.test.js`,
  `tests/manifest/codex-tools-doc.test.js`.

`hooks.json`은 4개만 유지(session-start ×2, pre-bash-commands, pre-secrets).
가드 2개(파괴적 명령, 시크릿 파일 접근)는 안전 계층이라 손대지 않음.

## 5. 보존된 것 / 안전망

- **테스트 스위트 168개 green** (매 스킬 변경 후 확인).
- 모든 test lock 문자열을 스킬별로 대조·보존(§3 각 항목 명시).
- 하드 가드 훅(pre-bash-commands, pre-secrets)과 그 테스트 무변경.
- 플러그인 인프라(`.codex-plugin/`, `.agents/`, `AGENTS.md`, 두 marketplace) 무변경.
- MIT NOTICE 파일 각 스킬 유지(개명된 implement는 NOTICE 함께 이동).

## 6. 아직 안 한 것

- `writing-skills`(메타 스킬, 726줄) — **미변경**. 이 문서의 리뷰 대상 아님.
  오히려 이 변경들이 writing-skills 룰을 위반했는지 검증하는 기준.
- `pr-creator`, `caveman` — 미변경(caveman 유지 유력).
- README, repo-root `CLAUDE.md` — 아키텍처 서술이 stale(아직 sdd/tier 언급).
  최종 doc 패스 예정.

## 7. 리뷰 질문 (멀티에이전트 판정용)

각 리뷰어는 문서의 주장을 **실제 파일과 대조**해 판정할 것:

1. **writing-skills 룰 위반?** 변경된 각 스킬이 `skills/writing-skills`의 규칙
   (frontmatter 형식, description = 활성화 조건, 구조/톤, 자기참조 무결성)을 위반하나?
2. **과잉 삭제(substance 손실)?** "스캐폴딩만 컷" 주장이 참인가, 아니면 프로세스
   스텝·references 어디에도 없는 실체/탐지신호/WHY가 사라졌나? (특히 3.6/3.9)
3. **dangling/무결성?** 삭제된 스크립트·훅·참조·개명(sdd→implement)에 대한 끊긴
   참조가 스킬·테스트·README·CLAUDE.md·AGENTS.md에 남아있나?
4. **체인 정합성?** brainstorming→writing-plans→implement→requesting-code-review→
   claude-md-revise→finishing 링크가 서로 일관되나? (예: implement가 기대하는
   리뷰 계약과 requesting-code-review 실제 동작 일치?)
5. **negative-record 재도전?** `design/*retrospective*.md`에 rejected로 기록된
   메커니즘을 이 변경이 방어책 없이 되살렸나?
6. **harness-neutral 일관성?** 엔트리 스킬·본문은 neutral인데 dispatch 템플릿은
   Codex translation 유지 — 이 경계가 일관되게 지켜졌나?
