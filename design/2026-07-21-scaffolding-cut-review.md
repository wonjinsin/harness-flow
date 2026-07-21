# 스캐폴딩 컷 브랜치 — 멀티에이전트 adversarial 리뷰 보고서

작성일: 2026-07-21
대상 브랜치: `simplify-skills` (base `a970afc`, 순변경 46파일 +498/−4,750)
방법: 11개 adversarial 리뷰어(스킬 10 + 무결성 횡단 1) 병렬 fan-out. 각자 실제 파일·`git diff a970afc..HEAD`·`writing-skills` 룰·retrospective와 대조. `design/2026-07-21-cut-scaffolding.md` §7의 6질문 적용.
산출 성격: **보고서만.** 코드 변경 없음. 리뷰어 성향 adversarial(substance 손실 적극 추궁).

---

## 0. 한 줄 판정

> "**스캐폴딩만 컷, 실체 전부 보존**" 주장은 **파일 위생 관점에선 대체로 참**(dangling 없음, 체인 링크 해소, 테스트 168 green, 하드가드 훅 무변경)이나, 실체 보존 주장은 **검증된 2건 + reconciliation gap 1건 + CSO 위반 1건**에서 반증된다:
>
> - **H2·H3 — 검증된 clean 위반**(실파일 대조 완료): plan-audit(결정론적 in-session 완결성 게이트)를 "SDD 머신"으로 **오분류해 삭제**, eval로 검증된 severity-floor 블록이 **재배치 없이 소멸**(현재 `skills/` grep 0건). 둘 다 CLAUDE.md negative-record 규약 위반, 리뷰어 다수 독립 지목.
> - **H1 — 검증된 reconciliation gap**(clean 위반 아님): inline-first 기본화가 same-day retro의 tier-up trap(work가 세션모델=최고가 티어에서 실행)을 실제로 트리거하나(`implement:20` 확인), retro가 측정 안 한 "머신 삭제 절감"이 경제학을 재구성할 수 있어 **자동 부결이 아닌 재조정 필요.**
> - **H4 — 검증된 CSO 위반**: implement description이 writing-skills가 **이 스킬 이전 description을 GOOD 예시로 든 바로 그 룰**을 위반.
>
> **검증 방법:** find-only 리뷰의 HIGH 3건 + H4를 실파일·retrospective와 2차 대조(§부록 참조). H2/H3/H4 라인번호·인용 정확 확인, H1은 scope 대조 후 severity 하향.

verdict 분포:
| verdict | 대상 |
|---|---|
| claims-hold | finishing-a-development-branch |
| minor-issues | using-harness-flow, brainstorming, using-git-worktrees, writing-plans, test-driven-development, claude-md-revise, systematic-debugging |
| **substance-loss** | **implement(신규), requesting-code-review, cross-cutting-integrity** |

---

## 1. HIGH — 반드시 결정할 것 (전부 실파일 대조 완료)

### H2. plan-audit 삭제 = in-session 완결성 게이트 상실 (Q5) — ✅ CONFIRMED → 🔧 처리됨
**지목:** 무결성 리뷰어 + implement 리뷰어 | **2차 검증:** retro 배경문단 직접 확인
**처리(2026-07-21, 경량 체크 재도입):** `implement/SKILL.md`에 "Before the final review: completeness check" 스텝 추가(컨트롤러가 각 태스크 Touches/acceptance를 실제 diff와 대조 — 확률적 방어, 훅 deny 아님) + cut-scaffolding.md §4를 "plan-audit는 in-session 안전 게이트"로 정정.

- **주장(§4):** plan-audit / `pre-plan-audit.js`를 "삭제된 머신(subagent-driven-development 계열) ... implement로 대체되며 불필요"로 분류.
- **검증된 반증:** `2026-07-18-plan-audit-gate-retrospective.md` 배경문단 원문 확인 — "**외부 루프 eval에서 in-session 실행이 3판 중 2판에서 plan 태스크의 30–50%를 조용히 누락하고 성공을 자칭했다 ... 루프 전체 도입은 속도·토큰 게이트를 통과하지 못했으므로, 루프의 결정론 검증 개념만 in-session 체인에 역이식했다.**" 즉 **측정된 in-session 실패에서 태어나 in-session 체인에 역이식된 결정론적 완결성 게이트**다. 브랜치는 스크립트+훅(265줄)을 삭제하면서 동시에 inline in-session 실행을 **기본**으로 만든다 — 완결성은 이제 LLM + 최종 리뷰 1회로만 검증. 측정된 실패 모드를 부활시키며 전용 방어를 제거, fresh eval도 결정론적 대체물도 없음.
- **정직한 nuance:** 구현은 `hooks/pre-plan-audit.js`(SDD 최종리뷰 dispatch description에 gate)와 `skills/subagent-driven-development/scripts/`에 있었으므로 **기계적으로는** SDD dispatch에 결합돼 있었다. 그러나 그 **목적**은 in-session 완결성 방어였고, implement가 in-session을 기본화하면서 방어 대상은 남고 방어만 사라졌다.
- **권고:** ① inline 기본 경로에서 최종 리뷰 전에 plan의 Touches/Files 대비 결정론적 완결성 체크 재도입, 또는 ② inline-default 완결성 fresh eval 기록. 최소한 §4를 "plan-audit는 in-session 안전 게이트(SDD dispatch 머신 아님)"로 정정. [[external-loop-eval-verdict]]

### H3. severity-floor 블록 소멸 = 최종-단일-리뷰 정당성 상실 (Q2/Q5) — ✅ CONFIRMED → 🔧 처리됨
**지목:** implement + requesting-code-review + 무결성 리뷰어 (**독립 3건**) | **2차 검증:** a970afc 원문 + grep 확인
**처리(2026-07-21, code-reviewer.md 재배치):** `code-reviewer.md`의 Calibration 섹션에 severity-floor 블록 복원(inline 모델에 맞춰 첫 문장만 "self-review + single final review, no intermediate reviewer"로 조정, 실체 verbatim). over-rating 경고 옆에 anti-demotion 방어 병치. **design/ 인용은 제거**(신규 룰 [[no-design-refs-in-skills]] — 스킬 파일에 design 참조 금지, provenance는 CLAUDE.md로).

- **주장(§3.8/§4):** code-reviewer.md 템플릿 본문 전부 유지, 삭제된 건 SDD "머신".
- **검증된 반증:** `git show a970afc:.../subagent-driven-development/SKILL.md:312-315` 원문 확인 — "**severity by consequence, not by surface form: a finding that violates a ... A Minor rating on such a finding requires a one-line justification.**" 현재 `grep -rn "by consequence|surface form|one-line justification" skills/` → **0건**(직접 실행 확인). review-removal retro는 P5 재도전 통과(6/6 catch, 0 demotion)가 **이 블록 덕분**, 블록 없는 구성은 **E5 6/8 게이트 미달**로 기록. `implement:52` "Fixing Critical/Important findings is required; Minor is optional"(fix-routing일 뿐)만 남고, `code-reviewer.md:116` calibration은 **반대 방향**("DON'T mark nitpicks as Critical").
- **미측정 리스크:** 통과했던 측정은 **sonnet+블록**, 새 프로덕션 경로는 **opus−블록**(미측정). "most capable로 상쇄"는 검증 안 됨. 168 unit test는 severity-demotion(eval 행동)을 못 잡음.
- **권고:** severity-floor 블록을 `code-reviewer.md`(dispatch 프롬프트 필수 섹션) 또는 implement 최종리뷰 지시로 verbatim 재배치. opus 상쇄에 의존하려면 opus−블록 E5 재측정 후 기록. [[external-loop-eval-verdict]]

### H1. inline-first 기본화 = tier-up trap 트리거 (Q5) — ⚠️ RECONCILIATION GAP → 🔧 부분 처리
**지목:** implement + 무결성 리뷰어 | **2차 검증:** measurement doc scope 대조 → severity 하향
**처리(2026-07-21, subagent 모델 가이드 복원):** superpowers/구-SDD의 Model Selection 실체를 `implement/SKILL.md` subagent 격리 경로에 복원(tier 정의 mechanical→cheap / 통합·판단→standard / 설계→most-capable + "명시 안 하면 세션 기본=최고가 상속, 최저가는 멀티스텝서 2-3× 턴이라 non-trivial엔 standard floor"). harness-neutral, design 참조 없음. **잔존:** 기본 inline 경로(`implement:20`, 세션모델 실행)의 tier-up은 그대로 — 사용자가 subagent 경로 tier 규율 복원을 택했고 inline-default 강제/eval은 미채택. 이 잔존 tension은 여전히 disclosed(§2.2 논증 또는 향후 eval 대상).

- **주장(§2.2):** 실행 모델 A″ = 현재 세션·세션 모델에서 inline 실행 기본. 근거는 "LLM 역량 향상" + 필드 증거 + superpowers 선례.
- **검증된 사실:** `2026-07-21-plan-coarsening-measurement.md`(같은 날짜) line 142/151이 inline-K 부결을 **tier-up 경제학**으로 규정 — "**인라인은 dispatch를 아예 제거하지만, work가 컨트롤러 티어(세션 모델=보통 Opus/Sonnet, 가장 비쌈)에서 돈다 → inline-K도 net-negative.**" `implement:20` "Work the plan in the current session, on the session's model" 확인 → **기본 inline 경로가 실제로 이 tier-up을 트리거**한다(cheap-tier 선택지는 line 38의 optional subagent 경로에만 존재, 기본경로엔 없음). 재도전 조건(line 191) (a) "인라인을 컨트롤러 티어가 아닌 cheap로 강제" **미충족**, (c) fresh net-$ eval **없음.**
- **왜 clean 위반이 아닌가(advisor 반영):** retro는 inline-K를 **머신을 유지한 채** 얹는 cost 레버로 측정했다. 이 브랜치는 **머신 자체(SKILL 500줄+스크립트+훅 2)를 제거**한다 — 표준 유지비용·세션당 문서 토큰 절감은 retro의 손익계산에 **없는 항목**이다. 즉 tier-up 페널티는 실재하나, 그것을 상쇄할 수도 있는 절감이 미측정이라 retro가 이 케이스를 **완전히 부결하지도 못한다.** → **자동 revert가 아니라 재조정 필요.**
- **가중(별개, 확인됨):** measurement line 191/§5가 "다음 $ 레버는 여전히 **Opus 최종 리뷰 티어**"라 지목했는데, 브랜치는 최종 리뷰를 most-capable(Opus)로 **고정**(`implement:44-46` 확인) — 줄이라던 비용을 명시적으로 유지.
- **권고:** ① inline 기본경로 work를 cheap 티어로 강제(조건 a 충족), **또는** ② inline-default vs dispatch net-$ eval(머신 삭제 절감 포함)을 돌려 기록. 그리고 tier-up trap·Opus-최종을 설계문서에서 정면 논증(현재 cut-scaffolding.md에 coarsen/inline-k/net-negative 검색 0건 — 은폐). [[coarsening-inline-k-rejected]] [[changes-optimize-speed-and-tokens]]

### H4. implement description = CSO 위반 (Q1) — ✅ CONFIRMED → 🔧 처리됨
**처리(2026-07-21):** `implement/SKILL.md:3` description에서 em-dash 뒤 workflow 요약("— implements inline with TDD, then one final review") 제거, trigger-only로 복원.

**지목:** implement 리뷰어

- **반증:** `implement/SKILL.md:3` description이 em-dash 뒤에 workflow 요약을 붙임("... — implements inline with TDD, then one final review"). `writing-skills:166-174`가 정확히 금지("Description = When to Use, NOT What the Skill Does"). **아이러니:** `writing-skills:183-184`가 **이 스킬의 이전 description**("Use when executing implementation plans with independent tasks in the current session")을 **GOOD 예시**로 인용 — 개명이 그걸 BAD 패턴으로 회귀시킴. 위험 시나리오: 주입된 description이 "one final review"라 말해 controller가 본문의 plan-escalate/impl-fix 라우팅·3-re-review cap을 로드하지 않고 단순 실행 — 룰이 경고한 바로 그 shortcut.
- **권고:** em-dash 뒤 절 삭제, trigger-only로 복원("Use when executing an approved implementation plan or spec in the current session").

---

## 2. MEDIUM — 체인 정합성 · dangling · substance

### M1. brainstorming 소형 경로가 implement 최종 리뷰를 우회 (Q4) — 🔧 처리됨
**처리(2026-07-21, 소형 exit self-review 1줄):** `brainstorming/SKILL.md` 소형 exit에 "이 경로는 plan·최종 whole-branch 리뷰를 건너뛰므로 마지막 커밋 후 전체 diff를 스스로 검토(정확성+scope creep)" 백스톱 추가. 소형의 가벼움 유지.
**지목:** 무결성 리뷰어

`brainstorming/SKILL.md:27`이 "Small/clear → test-driven-development"로 **직결**해 implement를 건너뜀 → 소형 작업은 최종 whole-branch 리뷰 **없음.** 이전엔 제거된 trivial tier가 self-review + exit diff-cap 백스톱을 가졌고 size-classifier retro가 measured-safe로 채택(decoy 3/3→5/5, quality loss 0). §2.3이 tier 시스템을 통째 삭제하며 그 백스톱도 제거 — 소형 작업은 최종리뷰도, plan도, trivial self-review/diff-cap도 없는 **리뷰 공백.** §2.2의 "항상 최종 리뷰 1회" 보장이 이 경로에서 깨짐. **권고:** 소형 경로를 implement로 라우팅하거나 경량 self-review/diff-cap 백스톱 추가, 그리고 "trivial tier 제거 = measured-safe 백스톱 제거"임을 문서화. [[size-classifier-retrospective]]

### M2. AGENTS.md — §5 "무변경" 주장 사실오류 + 삭제된 tier/스킬명 잔존 (Q3) — 🔧 처리됨
**처리(2026-07-22, CLAUDE.md/AGENTS.md 재구조화):** `/claude-md-improver` 감사 후 아키텍처 전면 재작성(implement·tier제거·훅4개·no-design-refs·라이선스 통합 반영). 소스를 **AGENTS.md로 단일화**(canonical), `CLAUDE.md`는 `@AGENTS.md` 스텁 — Codex는 AGENTS.md 네이티브, Claude Code는 CLAUDE.md→@import. 삭제된 tier/sdd명 전부 제거, §5 사실오류 무효화. 168/168 green.
**지목:** using-harness-flow · implement · 무결성 리뷰어 (다중)

`git diff a970afc..HEAD -- AGENTS.md`는 AGENTS.md가 **변경됐음**을 보여줌 → §5의 "무변경" 주장 거짓. 게다가 불완전: `AGENTS.md:8-9`가 삭제된 tier("trivial vs standard")와 개명 전 스킬명("subagent-driven development")을 **Codex 부트스트랩 파일에 그대로** 유지. §6 concession(README/CLAUDE.md만)에도 미포함. narrative 문서가 아니라 **Codex 세션 시작 시 주입되는 실동작 파일.** **권고:** AGENTS.md:8-9 즉시 수정(tier 제거, implement로 개명), §5 정정.

### M3. README/CLAUDE.md = 삭제된 훅 등록 스니펫 = 설치 파손 (Q3) — 🔧 처리됨
**처리(2026-07-22):** CLAUDE.md는 AGENTS.md 재작성으로 해소. **README.md도 전면 갱신** — settings.json 예시 2곳에서 삭제 훅(`pre-agent-model`/`pre-plan-audit`) 등록 블록 제거(설치 파손 해소), 훅 6→4, tier/HARD-GATE/Task-Group/sdd/`-design.md`/plan-audit 참조 정정, 6→7harness+matt-pocock, 라이선스 통합 반영. JSON 예시 유효성 확인, 168/168 green.
**지목:** 무결성 · requesting-code-review 리뷰어

§6은 "아키텍처 서술 stale"로 축소하지만 실제로는 **user-facing 설치 파손**: `README.md:162-163, 201-202`가 삭제된 `pre-agent-model.js`·`pre-plan-audit.js` 등록을 copy-paste로 안내, `README.md:39` 삭제된 sizing.md 참조, `README.md:50` 없는 plan-audit 게이팅. repo-root `CLAUDE.md`도 chain item 5=subagent-driven-development, 삭제 훅 2개 문서화(125-145), 삭제 참조(161-162), sizing.md(22)로 전면 stale. **README 따라하면 존재하지 않는 훅을 등록함.** **권고:** merge 전 doc pass 완료 또는 브랜치 주장 축소 — 삭제-훅 등록 스니펫과 참조 제거.

### M4. severity-floor 외 finding-class 태그도 소멸 (Q4) — 🔧 처리됨
**처리(2026-07-22):** `code-reviewer.md` Output Format의 "For each issue"에 Class 태그(`impl-fix`/`plan-escalate`, Critical/Important 한정) 추가 + `implement`의 라우팅 문구를 "Route its findings by the reviewer's `class` tag"로 정밀화 → 프로즈 추론이 아닌 기계 태그로 라우팅. 168/168 green.
**지목:** requesting-code-review 리뷰어

구 dispatch는 `impl-fix`/`plan-escalate` verbatim 태그를 강제해 루프가 **machine tag**로 라우팅했으나, 현 `code-reviewer.md` output format(74-103)은 Critical/Important/Minor + "Ready to merge"만 요구하고 **class 태그를 안 물어봄.** implement controller는 이제 plan-vs-impl을 **prose 추론.** LLM엔 동작하나 escalation 루프가 설계된 machine-reliable 어휘 상실. **권고:** code-reviewer.md output에 "Critical/Important finding마다 impl-fix 또는 plan-escalate 태그" 1줄 추가.

### M5. systematic-debugging — "No Root Cause" 섹션 미공개 삭제 (Q2) — 🔧 처리됨
**처리(2026-07-22, 압축 가드 복원):** systematic-debugging Phase 1 끝에 2줄 가드 복원 — "'no root cause/환경' 결론 유혹? 95%는 불완전 조사 — 증명 후 exit; 진짜 환경/타이밍/외부면 문서화 + retry/timeout/monitoring 방어를 *그게* fix". 168/168 green.
**지목:** systematic-debugging 리뷰어

§3.6 cut-list에 없는 `## When Process Reveals "No Root Cause"` 섹션 전체 삭제. 디버깅 루프의 terminal 분기(환경/타이밍/외부 원인 → 문서화 + retry/timeout/monitoring)와 anti-rationalization 가드("95% of 'no root cause' cases are incomplete investigation")를 제공했고 스킬·지원파일 어디에도 없음. LLM이 압박 하에 "no root cause"로 프로세스를 탈출하는 걸 막던 신호. **권고:** Phase 1에 압축 1줄 복원 또는 §3.6에 삭제 공개+정당화.

### M6. writing-plans Interfaces 블록 제거 ↔ implement:36 여전히 참조 (Q4) — 🔧 처리됨
**처리(2026-07-22, implement 문구 완화):** implement의 subagent 격리 경로를 "the interfaces it must honor (derive these from the plan and the codebase — the plan does not pre-compute them)"로 완화 → plan 포맷에 Interfaces 슬롯 안 넣고 불일치 해소.
**지목:** writing-plans 리뷰어

`implement/SKILL.md:36`은 subagent 격리 시 "the interfaces it must honor"를 주라 하지만, 새 writing-plans 태스크 스키마(Delivers/Touches/Blocked by/acceptance)엔 **Interfaces/Consumes/Produces 블록 없음.** plan 아티팩트가 더 이상 implement가 가리키는 시그니처를 pre-compute 안 함. **권고:** writing-plans 태스크 템플릿에 "Interfaces(격리 시)" 슬롯 추가하거나 implement:36을 "(plan/코드베이스에서 도출)"로 완화.

### M7. brainstorming 스펙 경로 무단 개명 `-design.md`→`.md` (Q3) — 🔧 처리됨
**처리(2026-07-22):** 기능부(brainstorming SKILL + AGENTS.md)는 `.md`로 정합, README.md의 `-design.md`+HARD-GATE 문구도 README 전면 갱신에서 정정 완료.
**지목:** brainstorming 리뷰어

`brainstorming/SKILL.md:33`이 `specs/YYYY-MM-DD-<topic>.md`로 쓰지만 §3.2에 미기재. README.md:43,60 · CLAUDE.md:27,183이 옛 `-design.md`로 잔존. README.md:43은 제거된 `<HARD-GATE>`도 여전히 서술. **권고:** 접미사 복원 또는 rename 완료 + 문서 갱신.

---

## 3. LOW — 미세 substance 손실 · 사전존재 위반 · 일관성

각 항목은 동작은 유지되나 프로세스 스텝·references 어디에도 없는 nuance/신호가 소멸했거나, 사전존재 문제라 브랜치 scope 밖:

| # | 스킬 | 소멸/이슈 | Q | 비고 |
|---|---|---|---|---|
| L1 ✅ | test-driven-development | SKILL:34 "horizontal slicing in the anti-patterns" dead 포인터 → **괄호 제거(2026-07-22)**, 문장 자체 완결 유지 | Q3 | rewrite가 만든 신규 무결성 결함, 해소 |
| L2 ✅ | test-driven-development | anti-pattern #2 2번째 탐지신호(lifecycle 소유 → wrong class) **clause 복원** | Q2 | 처리됨 |
| L3 ✅ | test-driven-development | Verify-RED에 "passes immediately = 기존 동작/mis-targeted" 진단 **추가** | Q2 | 처리됨 |
| L4 ✅ | test-driven-development | TDD Exceptions(prototype/generated/config → ask first) **1줄 복원** | Q2 | 처리됨 |
| L5 ✅ | llm-md-revise | "Codex엔 stable user-level path 없음 — 추측 말라" **harness-neutral clause 복원** | Q2 | 처리됨 |
| L6 ⏹ | using-git-worktrees | project-local `.worktrees` 재사용 탐지 + LOCATION_KIND 제거 | Q2 | **수용(무변경)** — sibling-first는 단순화 취지에 부합, 재추가는 역행. finishing의 `.worktrees/` 분기는 무해 방어코드 |
| L7 ✅ | finishing | "worktree 먼저 제거→branch 삭제" WHY를 **inline 주석 복원**(git branch -d 실패 이유) | Q2 | 처리됨 |
| L8 ✅ | brainstorming | Loop item 2에 "stay focused — no unrelated refactoring" **복원**. worktree는 의도적 downstream 위임(무변경) | Q2/Q4 | 처리됨 |
| L9 ✅ | using-harness-flow | "user instructions override skills — 명시적일 때만 skip" **1줄 복원** | Q2 | 처리됨 |
| L10 ⏹ | requesting-code-review | "least powerful"→"most capable" | Q5 | **수용(무변경)** — A″ 의도적 결정(최종 리뷰만 비용), 품질↑, cost 회귀는 감수 |
| L11 ✅ | requesting-code-review | orphan "SDD" 약어 → **"implement"로 교체** + test-lock 문자열 갱신 | Q3 | 처리됨 |
| L12 ✅/⏹ | finishing / using-harness-flow | finishing description **trigger-only로 trim**. using-harness-flow는 SessionStart 특수 엔트리라 무변경(리뷰 REC "none required") | Q1 | 처리됨 |

---

## 4. 무결성 clean 확인 (반증 실패 — 주장 성립)

adversarial 추궁에도 성립한 것:
- **훅 위생:** 삭제 훅 2개(pre-agent-model, pre-plan-audit) 잔존 등록/활성 테스트 0. hooks.json 6→4 정합. 하드가드 2개(pre-bash-commands, pre-secrets)+테스트 무변경.
- **체인 링크:** 모든 skill-body cross-ref(brainstorming→writing-plans→implement→requesting-code-review→claude-md-revise→finishing; systematic-debugging 분기) 해소.
- **Q6 경계:** 엔트리 스킬 neutral(test가 no-TodoWrite+harness-neutral 고정), code-reviewer.md는 Codex translation(spawn_agent/fork_turns none/final_review) 유지 + test-lock.
- **test-lock:** 각 스킬의 명명된 lock 문자열 전부 생존, codex-runtime-contracts 10/10.
- **finishing-a-development-branch:** 유일하게 claims-hold — Step 1–6 byte-for-byte, provenance/detached-HEAD/squash -D WHY 보존.
- **claude-md-revise:** restored Guardrails 2개가 실제로 스텝에 없던 nuance임을 리뷰어가 재확인(§3.7 정확).

---

## 5. 개선 권고 — 우선순위

**merge 전 필수 (HIGH):**
1. **H2·H3 (검증된 clean 위반) 정면 대응:** severity-floor 블록 verbatim 재배치(H3) + inline 완결성 결정론 체크 재도입 또는 fresh eval(H2). 방어 재도입 **또는** fresh pre-registered eval — 브랜치 자체 규약이 요구. 최소한 §4를 정정(plan-audit는 in-session 게이트, SDD 머신 아님).
2. **H1 (reconciliation gap) 재조정:** inline 기본경로를 cheap 티어로 강제하거나 머신-삭제-절감 포함 net-$ eval을 기록. §2.2가 tier-up trap·Opus-최종을 정면 논증(현재 은폐).
3. **H4** implement description trigger-only로 수정(writing-skills가 이 스킬 이전 description을 GOOD 예시로 든 룰 위반).

**merge 전 강권 (MEDIUM):**
3. **M2/M3** AGENTS.md + README 즉시 수정 — 삭제-훅 등록 스니펫은 설치 파손, AGENTS.md는 Codex 실동작. §5 "무변경" 사실오류 정정.
4. **M1** brainstorming 소형 경로 리뷰 공백 — implement 라우팅 또는 백스톱.
5. **M4** finding-class 태그 복원(escalation 라우팅 신호).

**doc pass에 포함 (MEDIUM/LOW):**
6. M5 No-Root-Cause 가드, M6 Interfaces 정합, M7 spec 경로 rename, L1 horizontal-slicing dead 포인터, L2–L9 미세 신호 — §3의 cut-list를 **정직하게 갱신**(무단 삭제 공개). "스캐폴딩만 컷" 프레이밍을 "스캐폴딩 + 일부 의도적 technique trim"으로 정정하면 §7 Q2 주장이 참이 됨.

**메타 관찰:** 대부분의 substance-loss는 §1의 "LLM 역량 향상" 논거로 **정당화 가능**하다. 문제는 정당화가 아니라 **미공개** — 설계문서가 "스캐폴딩만"이라 단언해 의도적 trim을 은폐한 것. 정직한 cut-list + 3개 retro의 명시적 재도전 논증이면 대부분 해소된다.

---

## 부록: 방법·한계

- 리뷰어 11명, general-purpose, 각자 파일·diff·retrospective 직접 조회(subagent tokens 660k+128k, tool_uses 141).
- 1차 requesting-code-review 리뷰어가 degenerate 출력 반환 → 동일 프롬프트로 재실행, 결과 채택(H3·M4·L10·L11 근거).
- **2차 검증 pass(advisor 지적 반영):** find-only 리뷰어 산출을 사실로 제시하기 전 HIGH 4건을 실파일·retrospective와 직접 대조. 결과: **H2·H3·H4 = CONFIRMED**(a970afc 원문, `grep skills/`, implement 라인번호 정확), **H1 = severity 하향**(tier-up trap 적용은 확인되나 머신-삭제 절감이 미측정이라 clean 위반 아닌 reconciliation gap). MEDIUM/LOW는 리뷰어 인용을 스팟체크 없이 전달 — 채택 전 개별 확인 권장.
- 이 보고서는 **주장 대조 결과**다. 최종 채택 여부는 사용자 판단.
