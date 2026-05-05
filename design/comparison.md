# Harness Comparison: 6종 비교 분석

**대상**: Archon / everything-claude-code (ECC) / get-shit-done (GSD) / gstack / oh-my-claudecode (OMC) / superpowers
**작성일**: 2026-04-16
**기반**: 각 하네스의 기완성 분석 문서 (`reference/*.md`)

## TL;DR — 어느 것을 골라야 하는가

여섯 하네스는 겉보기엔 모두 "Claude를 더 잘 쓰게 해주는 도구"지만, **사는 층위**가 전혀 다르다. Archon만이 유일하게 Claude Code/Codex **바깥에서** 플랫폼을 감싸는 외부 래퍼(external wrapper)이고, OMC는 **바깥(SDK)과 안(플러그인) 양쪽**에 발을 걸친 하이브리드이며, 나머지 넷(ECC·GSD·gstack·superpowers)은 모두 Claude Code **안에서 동작하는 in-harness 시스템**이다. 이 한 장의 구분이 아래 모든 차이의 뿌리다.

- **원격 채팅·다중 플랫폼이 필요하면** → Archon 외에 선택지 없음
- **스펙부터 구현까지 단계를 강제하고 싶으면** → GSD (워크플로우) 또는 superpowers (스킬 체인)
- **이미 Claude Code를 매일 쓰고 있고 가드레일·기억만 붙이고 싶으면** → ECC
- **여러 플랫폼(Claude Code / Cursor / Codex) 오가며 같은 경험을 원하면** → gstack 또는 superpowers
- **반복 루프·병렬 에이전트로 장시간 자동화를 돌리고 싶으면** → OMC

---

# Part 1: The Story — 흐름으로 비교하기

## 1-1. Main Flow 병치 (가장 중요한 한 장)

여섯 하네스의 **유저 입력 → LLM 응답**까지의 주 경로를 같은 해상도로 나란히 놓으면, 세 가지 **구조적 계층**이 뚜렷하게 드러난다.

```
─── 계층 A: 외부 래퍼 ──────────────────────────────────────────────────
(LLM 호출을 직접 소유한다. 플랫폼 어댑터가 진입점.)

  Archon
  ├─ 플랫폼 어댑터 (Slack/Telegram/GitHub/Discord/Web/CLI)
  │   └─ 인증 체크 · 미인가 유저 차단
  ├─ ConversationLockManager (대화별 FIFO 락)
  ├─ 결정론 커맨드 화이트리스트 → 매칭 시 AI 우회
  ├─ 컨텍스트 6단 계단 (대화→세션→코드→워크플로우→설정→스레드)
  ├─ Agent SDK 호출 (Claude/Codex 교체 가능)
  ├─ 실행-평가 루프 + 스트림 텍스트 송신
  └─ /invoke-workflow 감지 → emitRetract → DAG 워크플로우

─── 계층 B: 하이브리드 ─────────────────────────────────────────────────
(플러그인 + SDK 라이브러리 양쪽 진입점. 같은 로직을 두 군데에서 호출.)

  oh-my-claudecode (OMC)
  ├─ 진입 1: Claude Code 훅 (UserPromptSubmit)
  │   OR
  │   진입 2: SDK import (직접 API 호출)
  ├─ keyword-detector.mjs (ralph/autopilot/ultrawork 감지)
  ├─ [MAGIC KEYWORD: ...] 마커 삽입
  ├─ skill-injector.mjs (triggers 매칭 최대 5스킬 주입)
  ├─ Task 도구로 19개 전문 에이전트 병렬 파견 (최대 5 동시)
  ├─ Anthropic API (Opus/Sonnet/Haiku 티어 라우팅)
  └─ Stop 훅: boulder 상태 감지 → 다음 이터레이션 강제

─── 계층 C: in-harness 스킬 ────────────────────────────────────────────
(Claude Code가 LLM 호출을 소유. 하네스는 "읽히는 마크다운"일 뿐.)

  everything-claude-code (ECC)         get-shit-done (GSD)
  ├─ SessionStart: 이전 요약          ├─ /gsd:* 커맨드 or CLI
  │  + 인스팅트 최대 6개 주입           ├─ ROADMAP.md 에서 미완료 Phase 조회
  ├─ 슬래시 커맨드 or 자연어 입력       ├─ Phase 순차 실행:
  ├─ commands/*.md → skills/*.md       │   Discuss→Research→Plan→Execute→Verify
  ├─ PreToolUse 훅 (block-no-verify)   ├─ Phase별 파일 매니페스트 로드
  ├─ Claude Code 도구 실행             │   (.planning/ROADMAP·STATE·PLAN 등)
  ├─ PostToolUse 훅 (Prettier·TS)      ├─ Agent SDK query() 호출 (maxTurns=50)
  └─ Stop 훅: 인스팅트 추출·세션 저장   └─ 이벤트 스트림 → GSDEvent 발행

  gstack                              superpowers
  ├─ 루트 SKILL.md 자동 로드          ├─ SessionStart 훅
  │  (preamble-tier:1)                ├─ 플랫폼 감지 (CC/Cursor/Gemini/Copilot)
  ├─ 25개 자연어 라우팅 룰 제시        ├─ using-superpowers.md 전체 주입
  ├─ 슬래시 or 자연어 매칭            ├─ LLM이 "1%라도 적용되면 스킬 호출" 규칙 학습
  ├─ Skill tool 호출 → SKILL.md 로드   ├─ 유저 메시지 수신
  ├─ Bash Preamble (환경 감지·학습)   ├─ LLM이 Skill Priority 따라 스킬 호출
  ├─ Step 1→N 실행 (자연어 워크플로우)  ├─ 해당 스킬 마크다운 로드 → 워크플로우 따름
  └─ STATUS 보고 + 학습 append         └─ TDD/Subagent/Review 체인 강제
```

이 병치가 보여주는 가장 중요한 사실은, **계층 C의 네 하네스는 모두 LLM을 직접 호출하지 않는다**는 점이다. 그들은 Claude Code(혹은 Cursor, Codex)가 읽는 마크다운을 배치하고 훅으로 개입할 뿐이다. 따라서 "Claude가 규칙을 따를까?"가 근본적인 신뢰 문제가 되며, superpowers의 `<HARD-GATE>`나 ECC의 `block-no-verify` 같은 **강제 장치**가 생긴 이유가 여기에 있다.

반면 **계층 A의 Archon**은 Agent SDK를 직접 호출하므로 "Claude 의지에 달린" 부분이 현저히 줄어든다. 라우팅·토큰 해석·취소까지 모두 코드로 검증 가능하다. 대가는 구현 복잡도 — TypeScript 5천 줄 vs 마크다운 수십 줄.

**OMC는 양쪽의 장단점을 같이 진다**. SDK 경로에선 결정론을 확보하지만 훅 경로에선 Claude Code 안의 마크다운에 의존한다. 그래서 keyword-detector·skill-injector 같은 핵심 로직이 **두 군데에 중복 구현**되어 있고, 이게 OMC 유지보수의 가장 큰 기술 부채다.

## 1-2. 라우팅: 입력에서 "무엇을 할지"를 고르는 순간

라우팅은 여섯 하네스가 **가장 극명하게 갈리는 축**이다. 같은 "이 이슈 좀 봐줘" 한 마디가 하네스마다 어떻게 해석되는지 본다.

```
  입력: "/deploy staging" (슬래시 커맨드)
  ─────────────────────────────────────────────────────────────────
  Archon      : 결정론 화이트리스트 매칭 → AI 우회, 즉시 실행
  ECC         : commands/deploy.md 로드 (파일 이름 직매핑)
  GSD         : /gsd:execute → Phase 오케스트레이터
  gstack      : SKILL.md 내 Step 0 매칭 → Bash preamble 실행
  OMC         : 훅에서 키워드 감지 → 모드 전환
  superpowers : LLM이 "Skill Priority" 규칙에 따라 스킬 호출

  입력: "이 코드 리팩터링해줄래" (자연어)
  ─────────────────────────────────────────────────────────────────
  Archon      : LLM에 던져지고, 응답 스트림에 /invoke-workflow 토큰이
                섞이면 그때 스트림 취소 후 워크플로우로 전환
  ECC         : LLM이 스킬 설명 읽고 결정 (권장 수준, 강제 없음)
  GSD         : 동작 안 함 — 명시적 /gsd:discuss 필요
  gstack      : 25개 자연어 룰 매칭 → Skill tool 호출
  OMC         : keyword-detector가 magic keyword 스캔 → 마커 삽입
  superpowers : LLM이 "브레인스토밍 먼저" 규칙 떠올리고 스킬 체인 진입
```

이 두 표가 라우팅 철학의 **세 가지 전략**을 보여준다:

1. **결정론 + LLM 토큰 감지** (Archon): LLM을 전혀 못 믿을 거면 화이트리스트, 믿되 검증하고 싶으면 스트림 중 토큰을 감지. Archon은 둘 다 쓴다. `/invoke-workflow`가 스트림에 등장하면 `emitRetract`로 스트림을 취소하고 워크플로우 DAG로 전환하는 설계는 여섯 중 유일하게 **"LLM 한 번 호출로 라우팅과 답변을 동시에"** 달성한다.
2. **결정론만** (ECC, GSD): 명시적 커맨드만 인식. 자연어는 LLM의 기본 행동에 맡긴다. 간단하지만 "~해줘"류 의도를 잡지 못한다.
3. **룰 매칭 / LLM 우선순위 / 키워드 증폭** (gstack, superpowers, OMC): 세 방식 모두 "LLM이 스스로 올바른 스킬을 고르게 한다"는 공통점이 있지만 강제력이 다르다 — gstack은 명시적 25룰, superpowers는 `<HARD-GATE>`로 합리화 방지, OMC는 프롬프트에 magic keyword를 증폭 주입한다.

**현실적 함의**: 슬래시 커맨드만 쓸 팀이라면 ECC/GSD가 가장 단순하다. 자연어 의도를 잡고 싶으면 gstack의 25룰이 가장 명시적이고, superpowers의 Skill Priority가 가장 원칙적이며, Archon의 토큰 감지가 가장 강력하다. 대가도 그 순서대로 커진다.

## 1-3. 상태·세션: "세션이 끊겨도 이어질 수 있는가"

여섯 하네스의 상태 저장 모델을 놓고 보면 **세 가지 철학**이 보인다.

```
                   불변 링크드 체인           append-only 파일         가변 상태
                   (재개 + 감사)              (재개 + 인간 편집)        (반복 루프)
                   ─────────────────          ─────────────────        ─────────
  Archon           ●
                   parent_session_id
                   포인터로 분기·병합
                   추적 가능

  ECC                                         ●
                                              *-session.tmp
                                              인스팅트 JSONL

  GSD                                         ●
                                              .planning/*.md
                                              사람이 읽고 편집

  gstack                                      ●
                                              ~/.gstack/projects/
                                              learnings.jsonl

  OMC                                                                   ●
                                                                        .omc/state/*.json
                                                                        덮어쓰기 가능

  superpowers      (상태 없음 — git이 곧 상태)
```

Archon의 **불변 링크드 체인**은 세션마다 새 row를 만들고 `parent_session_id`만 가리킨다. race condition이 원천 차단되고, 감사·디버깅 시 정확한 시간축 복원이 가능하다. 대신 DB 복잡도가 올라간다.

ECC·GSD·gstack은 **파일 시스템을 데이터베이스처럼 쓴다**. 장점은 명확하다 — Claude가 그 파일들을 그대로 읽고 쓸 수 있다. GSD의 `.planning/ROADMAP.md`는 개발자가 에디터로 열어서 Phase 순서를 바꿀 수도 있다. 단점은 동시성 제어가 취약하다는 것(파일 락 없음).

OMC는 **가변 상태 모델** — `.omc/state/*.json`을 덮어쓴다. ralph 모드가 같은 PRD에 대해 반복 이터레이션을 돌 때 자연스럽지만, 두 이터레이션이 동시에 돌면 상태가 깨질 수 있다.

Superpowers는 독특하다 — **고유 상태를 아예 두지 않는다**. 세션 간 맥락은 git 커밋·plan 마크다운 파일로만 연결되며, 하네스 자신은 stateless다. zero-dependency 철학의 귀결.

## 1-4. 격리·동시성: "여러 작업을 동시에 돌릴 수 있는가"

이 축에서 Archon만 진지하게 답을 냈고 나머지는 거의 포기했다.

```
                      격리                        동시성
                      ──────────────────          ──────────────────
  Archon              git worktree + 결정론       Global max 10
                      포트 배정                   per-conversation FIFO
                      (Docker 없음, 싱글유저 전제)  (큐 대기)

  OMC                 없음                        병렬 서브에이전트 최대 5
                                                  (BackgroundTaskManager)

  superpowers         worktree 권장               태스크당 서브에이전트 1개
                      (using-git-worktrees 스킬)   (격리 강조하지만 enforce X)

  gstack              worktree 감지 (강제 아님)    없음

  ECC, GSD            없음                         없음
```

Archon이 **Docker를 선택하지 않은 것**은 의식적 설계다 — 싱글 유저가 여러 대화를 동시에 돌릴 때 Docker는 과하다. 대신 git worktree + 해시 기반 포트 배정(`3190-4089`)으로 **같은 브랜치 코드에 대한 동시 작업**을 안전하게 격리한다. 단, 네트워크·OS 격리가 없으므로 악성 프롬프트에는 취약하다 ("내 전 파일 삭제해" 가능). 싱글 유저 도구라는 전제 하에 합리적인 트레이드오프.

OMC의 **병렬 서브에이전트 5개**는 "하나의 큰 태스크를 쪼개서 동시 실행"에 특화되어 있다. autopilot 모드에서 plan의 독립 태스크 5개를 한꺼번에 병렬로 태우는 식. Archon의 "여러 유저 대화 동시 처리"와 목적이 다르다.

나머지 넷은 동시성 제어가 거의 없다. superpowers는 `using-git-worktrees` 스킬로 격리를 권장하지만 강제하지 않고, gstack은 감지만 하고, ECC·GSD는 아예 주제를 피한다. 이들의 공통 전제는 **"하나의 Claude Code 세션 = 하나의 작업"**이다.

## 1-5. "LLM을 어떻게 신뢰하는가" — 철학의 결정적 분기점

여섯 하네스 모두가 답해야 하는 근본 질문이다. 답이 완전히 갈린다.

```
신뢰도 낮음 ←────────────────────────────────────────→ 신뢰도 높음

Archon              OMC            gstack     ECC       GSD        superpowers
(코드로 검증)    (훅+SDK)      (25 룰+호스트)  (훅 차단)  (Phase 강제)  (LLM이 따름)

↓ 강제 장치       ↓                ↓             ↓         ↓           ↓
결정론 라우팅    boulder 상태     결정론+룰매칭   exit 2    ROADMAP.md   <HARD-GATE>
emitRetract      persistence     STATUS 강제    block    파일 기반    Red Flags
스트림 취소      다음 이터 주입    JSONL 학습              Phase 격리   "1%라도 호출"
```

- **Archon**은 LLM이 엉뚱한 일을 하면 **스트림을 코드로 취소**한다(`emitRetract`). 가장 강한 강제.
- **OMC**는 LLM이 "그만할까?" 하면 Stop 훅이 **"멈추지 말라"는 메시지를 주입**해 다시 돌린다. 강제지만 우회 가능.
- **ECC**는 블랙리스트(예: `--no-verify`) 패턴을 **훅에서 exit 2로 차단**한다. 확실하지만 제한적.
- **GSD**는 Phase 순서를 파일 구조로 강제 — Execute 단계로 넘어가려면 Plan이 있어야 하며, 이를 LLM이 알고 있다.
- **superpowers**는 전적으로 LLM의 자발적 준수에 의존한다. `<HARD-GATE>`, `Red Flags` 테이블, "이 규칙은 협상 불가"라는 강한 어조로 설득한다. 코드 없이 마크다운만으로 LLM의 행동을 바꾸는 실험.
- **gstack**은 중간 — 결정론 슬래시 커맨드는 확실하고, 자연어 룰 매칭은 LLM에 맡기되 25개 룰을 프롬프트에 명시한다.

**이 스펙트럼이 선택에 결정적이다**. 중요한 작업을 자동화할수록 왼쪽이 맞고, 유연성·단순성이 중요할수록 오른쪽이 맞는다.

---

# Part 2: Reference — 표 비교

## 2-1. 18차원 한 장 요약

| # | 차원 | Archon | ECC | GSD | gstack | OMC | superpowers |
|---|------|--------|-----|-----|--------|-----|-------------|
| 1 | 종류 | External wrapper | in-harness | in-harness | in-harness | Hybrid | in-harness |
| 2 | LLM 직접 호출 | O (SDK) | X | O (SDK) | X | O (SDK) + X (플러그인) | X |
| 3 | 진입점 | 6개 플랫폼 어댑터 | SessionStart + 커맨드 | CLI + 슬래시커맨드 | 루트 SKILL.md | 훅 + SDK | SessionStart |
| 4 | 라우팅 | 결정론 + AI 토큰 감지 | 결정론만 | 결정론만 | 결정론 + 25 룰 | 키워드 증폭 + LLM | LLM Skill Priority |
| 5 | 격리 | git worktree + 포트 | 없음 | 없음 | 선택적 worktree | 없음 | 권장만 |
| 6 | 동시성 | Global 10 + FIFO | 없음 | 없음 | 없음 | 백그라운드 5개 | 태스크 1개 |
| 7 | 세션 모델 | 불변 링크드 체인 | 파일 기반 불변 | `.planning/` 파일 | 파일 터치 TTL | 파일 기반 가변 | stateless |
| 8 | 상태 저장소 | SQLite | `*-session.tmp` | `.planning/*.md` | JSONL append | `.omc/state/*.json` | git |
| 9 | 컨텍스트 조립 | 6단 계단식 | 요약+인스팅트 자동주입 | Phase별 파일 매니페스트 | Preamble bash | skill-injector 5개 주입 | using-superpowers 주입 |
| 10 | 워크플로우 엔진 | DAG (YAML, 6 노드 타입) | 없음 | 5-Phase 고정 | 마크다운 Step 1→N | Ralph/Autopilot 모드 | 스킬 체인 |
| 11 | 강제 장치 | emitRetract + 화이트리스트 | PreToolUse 훅 exit 2 | Phase 순서 | 결정론 슬래시 | Stop 훅 persistence | `<HARD-GATE>` 마크다운 |
| 12 | 플랫폼 지원 | 6개 (Slack/TG/GH/DC/Web/CLI) | Claude Code만 | Claude Code만 | 8개 호스트 | Claude Code + SDK | 4개 (CC/Cursor/Gemini/Copilot) |
| 13 | 학습·기억 | SQLite 로그 | 인스팅트 (confidence ≥ 0.7) | `.planning/SUMMARY.md` | project/learnings.jsonl | 없음 | git 커밋 |
| 14 | 모델 선택 | Claude/Codex 교체 | Opus/Sonnet | Sonnet 기본 | 호스트 종속 | 3티어 라우팅 | 호스트 종속 |
| 15 | 가드레일 | 화이트리스트 + 포트 격리 | block-no-verify 등 훅 | bypassPermissions (위험) | STATUS 보고 | boulder 감지 | 마크다운 규칙 |
| 16 | 확장성 | 어댑터·워크플로우·노드 추가 | 스킬 파일 추가 | Phase 정의 수정 | `.tmpl` 추가 | 에이전트·키워드 추가 | 스킬 `.md` 추가 |
| 17 | 의존성 | TypeScript/Bun/SQLite | Node.js | TypeScript/Node.js | Bash/Bun | TypeScript/Node.js | zero |
| 18 | 주 언어 | TypeScript 5k+줄 | Markdown + Node.js | TypeScript | Bash + TS | TypeScript + JS | Markdown only |

## 2-2. 장단점 요약 (하네스별)

### Archon — 가장 완성도 높은 외부 래퍼

**강점**
- 채팅 플랫폼 6개 + CLI/HTTP 진입이 모두 공통 오케스트레이터로 수렴 → 일관된 동작
- 불변 세션 모델로 race condition 없음, 감사 이력 완벽
- 워크플로우 DAG + approval 노드로 사람 검수 지점 자연스럽게 삽입
- emitRetract 토큰 감지로 "LLM 한 번 호출에 라우팅과 답변 동시에"

**약점 / 트레이드오프**
- TypeScript 5천 줄 이상 — 유지 비용 가장 큼
- 격리가 git worktree만 → 네트워크·OS 격리 없음 (싱글 유저 전제)
- Shallow per-field 설정 병합 → 깊은 구조 부분 수정 불가
- Global max 10 동시 대화 → 고부하 시 큐 대기

**적합**: Slack으로 AI에 일 맡기고 싶은 개인 개발자 · 작은 팀. 승인 단계가 필요한 워크플로우.

### everything-claude-code (ECC) — Claude Code 강화 플러그인의 맥시멈

**강점**
- 143개 프리빌드 스킬 → 설치 즉시 풍부한 기능
- 세션 기억 + 인스팅트 학습 (confidence ≥ 0.7) → 크래시 복구·행동 누적
- 훅 프로필(minimal/standard/strict)로 팀별 가드레일 강도 조절
- 외부 의존성 거의 없음 (Node.js만)

**약점**
- 훅이 exit 0 원칙으로 **조용히 실패** → 유저가 문제를 모름
- 143개 스킬 관리 오버헤드 + 서로 간섭 가능
- 모든 훅에 경로 탐색 resolver 반복 → 복잡
- 마크다운 강제력 없음 → LLM이 무시 가능

**적합**: 이미 Claude Code를 매일 쓰며 TDD/커밋 품질/세션 기억을 기본 장착하고 싶은 개발자.

### get-shit-done (GSD) — 워크플로우 강제형

**강점**
- 5-Phase 강제 → 계획 없이 코딩 방지
- `.planning/` 파일 기반 상태 → 사람이 읽고 편집 가능 (ROADMAP.md 직접 수정 가능)
- Phase별 도구 스코핑 → Research는 읽기만, Execute는 쓰기 허용
- 안정적 프롬프트 프리픽스로 캐시 최적화

**약점**
- Phase 간 세션 독립 → 암묵적 맥락 전달 불가 (파일만 매개체)
- `bypassPermissions` 기본 → 프로젝트 외 파일 수정 위험
- Plan 검증에 LLM 세션 2회 소비 → 속도·비용 증가
- 자연어 진입 없음 (`/gsd:*` 명시 호출만)

**적합**: 큰 feature를 설계 → 구현 단계로 명확히 나누고 싶은 팀. "먼저 생각하고 나중 코딩".

### gstack — 멀티 호스트 이식성의 왕

**강점**
- `.tmpl` 빌드 파이프라인으로 8개 호스트(Claude/Codex/Kiro/OpenClaw 등) 자동 생성
- 프로젝트별 `learnings.jsonl` append-only → 같은 repo 작업 시 상위 3개 학습 자동 주입
- 25개 자연어 라우팅 룰 명시 → 의도 매칭이 가장 투명
- Bash preamble로 환경 자동 감지

**약점**
- worktree 격리 선택적 — 강제 아님 → 실수로 프로덕션 수정 가능
- 모든 bin 유틸리티가 `2>/dev/null || true` → 버그 조용히 숨음
- 마크다운 워크플로우 → 파싱 불가, 버전 검증 어려움
- 학습 검색이 O(n) (DB 아님)

**적합**: Cursor·Claude Code·OpenClaw를 오가며 같은 스킬을 쓰고 싶은 개발자. 프로젝트별 학습 누적을 원하는 팀.

### oh-my-claudecode (OMC) — 반복 루프의 제왕

**강점**
- 두 진입점 (플러그인 + SDK) → 유연한 통합
- 매직 키워드 증폭(ralph/autopilot/ultrawork) → 자연스러운 모드 전환
- 19개 전문 에이전트 병렬 5개 파견 → 설계·리뷰·구현 역할 분담
- 3티어 모델 라우팅 (Opus/Sonnet/Haiku) → 비용 최적화

**약점**
- keyword-detector·skill-injector가 **훅과 SDK 양쪽에 중복 구현** → 유지 비용
- Stop 훅에서 boulder 상태 매번 검사 → 응답마다 비용
- 파일 기반 가변 상태 → 동시 이터레이션 시 충돌
- 에이전트별 모델 선택 오류 시 과소/과대 비용

**적합**: PRD 주면 구현·테스트·리뷰를 자동 반복하는 경험을 원하는 팀. 큰 plan을 병렬 서브에이전트로 쪼개 돌리고 싶은 프로젝트.

### superpowers — zero-dependency의 극단

**강점**
- zero-dependency — 설치·업그레이드 가장 단순
- 순수 마크다운 → 어떤 LLM 플랫폼에서도 해석 가능
- 14개 스킬이 전체 개발 생명주기 커버 (설계→구현→리뷰)
- `<HARD-GATE>` · Red Flags 테이블로 명시적 강제

**약점**
- 마크다운 강제력 한계 — LLM이 궁극적으로 무시 가능
- 서브에이전트 n회 호출 비용 (15 태스크 = 15회 호출)
- on-demand 스킬 로딩 → 매 스킬마다 tool call 비용
- 복잡 로직 불가 — 모든 판단을 LLM이 함

**적합**: "프로세스를 코드가 아닌 문서로 강제하고 싶다"는 팀. TDD·브레인스토밍·코드리뷰를 필수 관문으로 만들고 싶은 조직.

---

## 2-3. 상황별 선택 가이드

| 원하는 것 | 1순위 | 2순위 |
|-----------|-------|-------|
| Slack에서 AI한테 일 맡기기 | **Archon** | — |
| 여러 CLI 플랫폼에서 같은 경험 | **gstack** | superpowers |
| 단계별 스펙→구현 강제 | **GSD** | superpowers |
| 가드레일·커밋 품질·세션 기억 | **ECC** | OMC |
| 반복 루프·병렬 자동화 | **OMC** | Archon (워크플로우) |
| 최소 설치·최대 이식성 | **superpowers** | gstack |
| 승인 단계 포함 워크플로우 | **Archon** | GSD |
| 하나의 큰 작업 여러 조각으로 | **OMC** (autopilot) | Archon (DAG) |
| 프로젝트별 학습 누적 | **gstack** | ECC (인스팅트) |
| 팀 내 프로세스 강제 | **superpowers** | GSD |

## 2-4. 조합 가능성

여섯 하네스가 **서로 배타적이지 않다**는 점은 중요하다. 실제 조합 예시:

- **ECC + superpowers**: 둘 다 in-harness 스킬 시스템이므로 스킬 네임스페이스만 겹치지 않으면 공존. ECC의 인스팅트 · superpowers의 `<HARD-GATE>` 둘 다 활용.
- **gstack + GSD**: gstack의 25 룰로 진입점 확보, GSD의 5-Phase로 큰 작업 처리.
- **Archon + OMC (SDK 모드)**: Archon이 채팅 인터페이스 담당, OMC가 SDK 라이브러리로 모드 주입.
- **단 Archon + ECC/GSD/gstack/superpowers 조합은 어색**: Archon은 LLM을 직접 호출하므로 in-harness 스킬이 작동하지 않는다. 둘이 다른 layer에 살아서다.

---

## 3. 결론: 세 가지 축을 먼저 답하라

어느 것을 고르기 전에 세 질문의 답이 있어야 한다:

1. **어디서 AI와 대화할 건가?**
   - 채팅 플랫폼(Slack 등) → Archon
   - 기존 CLI 도구(Claude Code / Cursor) → in-harness 넷 중 하나 + OMC
2. **LLM을 얼마나 믿는가?**
   - 적게 → 결정론 강한 Archon, GSD
   - 많이 → 마크다운 기반 superpowers, ECC
3. **무엇을 자동화할 건가?**
   - 한 번의 대화 품질 → ECC, superpowers
   - 긴 반복 작업 → OMC, GSD, Archon 워크플로우
   - 여러 플랫폼 이식성 → gstack, superpowers

이 세 축의 답이 정해지면, 위의 "상황별 선택 가이드" 표가 자연스럽게 하나로 수렴한다.
