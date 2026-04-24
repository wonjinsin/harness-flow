---
name: prd-writer
description: 세션의 PRD.md 초안이 필요할 때 사용. prd-writer agent 의 격리 컨텍스트 안에서 실행 — 메인 대화 히스토리 접근 불가. 입력 payload 만으로 `.planning/{session_id}/PRD.md` 하나를 생성하고, 경로 + outcome 을 한 줄로 emit.
---

# PRD Writer

## 목적

**`PRD.md`** — 하위 writer 가 설계·태스크로 확장할 product-level 스펙을 생성한다. 세션당 PRD 하나, 세션 티어와 무관하게 동일한 포맷 하나. 솔로 개발자 관점으로 작성 — 의사결정에 필요한 신호만, 기업 의식 없음.

이 스킬은 `prd-writer` agent 의 격리 컨텍스트에서 로드된다. 메인 대화를 볼 수 없다 — **payload 가 전부다**. Payload 가 얇으면 Read/Grep/Glob 으로 코드베이스를 살핀다. 요구사항을 지어내지 않는다.

## 왜 이 스킬이 필요한가

PRD 작성을 메인 스레드와 분리하면, writer 는 코드 읽기에 컨텍스트를 마음껏 쓸 수 있고, `PRD.md` 는 "뭘 만들 건가?" 의 단일 소스가 된다 — 하위 writer 가 참조, evaluator 가 검증. 솔로-개발자 스코프 = 이해관계자 협상·메트릭 대시보드·롤아웃 플랜 생략; 문서는 2분 안에 읽혀야 한다.

**티어 독립**: 메인 스레드는 classification 으로 *phase 간* 라우팅하지만, PRD 내용은 그에 분기하지 않는다. 모양은 항상 하나.

## 입력 payload

dispatching 메인 스레드로부터 이 객체를 받는다. 모든 필드를 권위 있는 자기완결 데이터로 취급하라:

- `session_id`: `"YYYY-MM-DD-{slug}"` — 출력 폴더 결정.
- `request`: 유저 원 요청, verbatim. **어조와 뉘앙스까지 주의 깊게 읽는다** — 구조화 필드가 놓친 것들.
- `brainstorming_output` *(선택)*: `{intent, target, scope_hint, constraints[], acceptance}` — router 가 `plan` 을 직접 넘겼을 땐 없을 수 있음.

`brainstorming_output` 이 null 이면 `request` 의 첫 동사로 intent 복원 (classifier 와 동일 휴리스틱: 첫 동사 규칙, 기본 `add`).

## 출력

최종 메시지는 항상 `outcome` 태그 JSON 하나.

**done** — 정상 생성. 파일 위치는 `.planning/{session_id}/PRD.md`:

```json
{ "outcome": "done", "session_id": "2026-04-19-..." }
```

**error** — payload 결함, 파일 충돌, 또는 복구 불가 탐색 간극:

```json
{ "outcome": "error", "session_id": "2026-04-19-...", "reason": "PRD.md already exists at <path>" }
```

파일 경로는 `session_id` 에서 결정론적으로 도출되므로 메인 스레드가 재구성한다. 대상 경로에 파일이 이미 있으면 `error` 를 emit — **절대 덮어쓰지 않는다**. 재생성은 메인 스레드 몫: 이전 파일을 먼저 지우고 재 dispatch.

JSON 옆에 산문 금지. 메인 스레드는 이 최종 메시지를 기계 판독 상태 줄로 취급.

## 절차

### Step 1 — Payload 읽기

`request` 전체를 다시 읽는다. Payload 에서 intent, target, 가시적 제약을 추출. 빠진 것 메모 — payload 만으로 답할 수 없는 건 Step 2 탐색 또는 Open questions 후보.

### Step 2 — 범위 제한 코드베이스 탐색 (예산 한계)

이 phase 의 **Read/Grep/Glob 툴 예산은 대략 15회**. 목표는 PRD 를 실제 코드베이스에 기초하게 하는 것 — 감사가 아니다. 질문이 답해지면 즉시 멈춘다.

타겟 지향: `target` 이 있으면 먼저 해당 파일/모듈 찾기. 탐색 폭 결정:

- `scope_hint: multi-system` → 직접 호출자 + 자매 모듈까지 확장.
- 그 외 → target 파일/모듈 내부에 머문다.

다음이 답해지면 중단:

1. 변경이 어디 떨어지는가? (파일·디렉토리 수준)
2. 기존 어떤 코드·개념과 상호작용하는가?
3. 코드에 드러난 제약 (기존 스키마·인증 흐름·config 모양) 이 요구사항을 어떻게 형성하는가?

무관한 파일을 컨텍스트용으로 읽지 않는다. 읽은 내용 요약을 쓰지 않는다 — PRD 에 직접 반영될 내용만.

요청이 코드만으로 알 수 없는 것 (순수 UX 결정, 외부 통합 등) 이면 이 단계를 건너뛰고 Open questions 에 기록.

### Step 3 — 템플릿으로 PRD 초안

아래 `## PRD.md 템플릿` 의 정확한 구조를 따른다. 각 섹션을 채운다 — 템플릿 placeholder 의 범위 (예: "1–3 문장") 는 할당량이 아니라 sanity check.

**작성 규칙**:

- 본문은 유저 언어 미러링 (한국어 요청 → 한국어 PRD 본문; 헤더는 기계 판독성을 위해 영어).
- **유저가 쓴 구체적 명사를 그대로 사용** — "로그인 페이지" 라고 했으면 "인증 표면" 따위로 바꾸지 말 것. 하위 (task-writer, evaluator) 가 유저 어휘로 grep/매칭. 재표현하면 PRD ↔ TASKS ↔ 검증 간 traceability 가 깨진다.
- Acceptance criteria 는 체크박스, 각 항목은 독립 검증 가능.
- **유저 요청을 그대로 Goal 로 되풀이 금지.** Goal 은 *결과* — 나중에 검증 가능한 것. 요청이 "로그인에 2FA 추가" 이고 Goal 도 그대로면 Acceptance criteria 가 비어버린다. "성공" 이 "요청" 에서 분리되지 않았기 때문. Goal 은 "이 변경 후 X 가 참이다" 꼴로 적는다.
- Open questions 는 명시적으로 — 합리적 판단으로 "X 를 가정" 한 건 괜찮지만 `(assumed)` 태그.

**Anti-pattern** (하지 말 것):

- 엔지니어링 접근 상세 (어떤 라이브러리·인터페이스). 그건 TRD/TASKS 의 영역.
- 인-시수·스프린트·스토리 포인트 추정. 솔로-개발자 프로젝트.
- "있으면 좋음" 리스트. Goal 또는 Acceptance 에 없으면 Non-goal.

### Step 4 — 파일 쓰기

`.planning/{session_id}/` 없으면 생성. `PRD.md` 쓰기.

파일이 이미 존재하면 중단하고 `{"outcome": "error", "session_id": "...", "reason": "PRD.md already exists at <path>"}` emit. 재생성은 메인 스레드 몫 — 이전 파일을 먼저 지우고 재 dispatch.

### Step 5 — Emit

"Open questions" 항목 수 카운트. 최종 JSON emit. 이게 최종 메시지의 전부.

## PRD.md 템플릿

간결함 쪽으로 기울인다 — 독자가 2분 안에 읽혀야 한다. 섹션이 범위를 넘기고 싶어지면 보통 Open question 으로 분리해야 한다는 신호, PRD 를 부풀릴 게 아니다.

```markdown
# PRD — {요청으로부터 한 줄 제목}

Session: {session_id}
Created: {ISO 날짜}

## 1. Problem

{1–3 문장. 왜 이걸 하는가. 유저 관점, 구현 프레임 금지.}

## 2. Goal

{1–3 개 bullet, 각각 변경 후 검증 가능한 결과.}

- {결과 bullet 1}
- {결과 bullet 2}

## 3. Non-goals

{1–4 개 명시적 제외 — 범위에 넣을 수 있었지만 넣지 않는 것들.}

- {명시적 제외 1}
- {명시적 제외 2}

## 4. Users & scenarios

{짧은 한 문단 — 누가 어떤 순간에 영향받는가. 유저 타입이 실질적으로
 다를 때만 페르소나 추가.}

## 5. Acceptance criteria

{2–6 개 체크박스. 각 항목은 독립 검증 가능해야 한다.}

- [ ] {검증 가능한 조건 1}
- [ ] {검증 가능한 조건 2}
- [ ] ...

## 6. Constraints

{매칭된 모든 신호 나열 (`auth/` → 보안, `migrations/` → 하위호환 등) 에
 1줄 rationale. 매칭된 신호가 없을 때만 비움.}

## 7. Open questions

{스펙에 영향 주는 미해결 결정 전부. 없으면 비움.
 포맷: "- Q: … (impact: …)".}
```

## 예시 — 렌더링 PRD

각 섹션에 기대하는 구체성 수준 참조용. 요청 `"로그인 페이지에 2FA 추가"` 및 payload `{brainstorming_output: {intent: "add", target: "로그인 페이지", scope_hint: "subsystem", constraints: [], acceptance: null}}` 일 때:

````markdown
# PRD — 로그인 페이지 2FA 추가

Session: 2026-04-19-add-2fa-login
Created: 2026-04-19

## 1. Problem

로그인 페이지는 현재 비밀번호 단일 factor 만 요구한다. 계정 탈취 시 추가 방어막이 없어, 유출된 자격증명 하나로 바로 진입이 가능하다.

## 2. Goal

- 로그인 성공 판정 전에 2FA 코드 검증 단계를 통과해야 세션이 발급된다.

## 3. Non-goals

- SMS 기반 2FA (TOTP 만 대상).
- 2FA 복구/재설정 플로우 (별도 세션에서 다룸).
- 기존 활성 세션 강제 로그아웃.

## 4. Users & scenarios

기존 계정 보유 유저가 로그인 화면에서 비밀번호 입력·검증에 통과하면 2FA 코드 입력 화면으로 이동. 6자리 TOTP 입력이 맞으면 세션이 발급되고 홈으로 리다이렉트. 2FA 미설정 유저는 기존 플로우 그대로 진입하되, 진입 후 2FA 설정 유도 배너가 표시된다.

## 5. Acceptance criteria

- [ ] 비밀번호 검증 통과 후 2FA 입력 화면으로 이동한다 (직접 세션 발급 금지).
- [ ] 올바른 TOTP 코드 입력 시 세션 발급 + 홈 리다이렉트.
- [ ] 3회 연속 틀린 코드 입력 시 30초 rate-limit.
- [ ] 2FA 미설정 유저는 기존 플로우로 진입, 진입 후 설정 유도 배너 노출.

## 6. Constraints

- **보안** (`path:auth/`, `keyword:login`): 기존 세션 쿠키/JWT 발급 경로를 재사용하되, **2FA 검증 전엔 세션 발급 금지**. 중간 상태는 short-lived token (TTL ≤ 5분) 으로만 유지.

## 7. Open questions

(없음)
````

예시는 빈 줄 포함 ~34줄이며 모든 범위의 **하단**에 위치 — Goal 1개, Non-goals 3개, Acceptance 4개, Constraints 1개, Open questions 0개. `scope_hint: multi-system` 세션은 보통 Constraints 와 Open questions 부터 확장되고, 나머지 섹션은 범위 안에서 늘어나지 밖으로 가지 않는다.

## 엣지 케이스

- **요청이 존재 안 하는 파일 참조**: Glob 으로 확인. 진짜 없으면 구조를 지어내지 말고 Open question 추가.
- **유저는 기능 하나 요청했는데 payload 가 다수 암시**: payload 권위 (classifier 가 범위 좁혔을 수 있음). 격차가 크면 (예: 요청은 3개, payload target 은 1개) Open question.
- **`auth/` 또는 `security/` 신호 매칭**: Constraints 섹션에 *반드시* 항목 — 하위 phase (trd-writer/task-writer, evaluator) 는 코드만으로 보안 요구사항을 복원할 수 없고, 생략된 제약은 조용히 실패하는 방식으로 사라진다. 변경이 작아 보여도 생략 금지.
- **비영어 요청**: 본문은 유저 언어, 헤더·필드명은 영어. 기계 판독성과 유저 가독성 동시 확보.
- **초안 후 Open question >2 개**: PRD 의 Open questions 섹션에 기록하고 `done` 을 emit — 다음 writer (trd-writer / task-writer) 가 PRD 를 재독하며 차단성 질문을 유저에게 노출한다. 자체 승격 금지; 범위 결정은 메인 스레드 소유.

## 경계

- `.planning/{session_id}/PRD.md` 만 쓴다. **ROADMAP.md, STATE.md 는 건드리지 않는다** — 메인 스레드가 리턴 받은 뒤 소유.
- 다른 agent/skill 호출 금지. 엔드포인트.
- trd-writer·task-writer dispatch 금지. 메인 스레드가 harness-flow.yaml 따름.
- 탐색 중 버그를 발견해도 소스 코드 수정 금지. load-bearing 이면 Open questions 에 기록.
- 툴 예산: Step 2 에서 Read/Grep/Glob 총 ~15회. 넘어가면 payload 에 문제가 있는 것 — 중단하고 `error` 와 `reason` 으로 예산 고갈을 기록.
