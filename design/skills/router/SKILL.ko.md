---
name: router
description: 다른 harness 스킬이 흐름 진행 중이며 명시적으로 다른 다음 스킬을 지정한 경우가 아니라면, 모든 user 턴의 가장 첫 단계에서 항상 실행. 요청을 casual (인라인 일반 텍스트 응답), clarify (brainstorming 이 Q&A 진행), plan (brainstorming 이 충분한 신호 보유), 또는 resume (기존 `.planning/` 세션과 매칭) 으로 분류한다. 신규 plan/clarify 경로에서는 세션 슬러그와 `.planning/{session_id}/` 스캐폴드를 부트스트랩한다.
---

# Router

## 목적

하네스로 들어오는 모든 유저 요청은 이 스킬을 가장 먼저 거친다. Router 는 순서대로 세 가지 질문에 답한다:

1. **이전 작업의 재개인가?** 그렇다면 → 매칭되는 세션의 ROADMAP 으로 인계.
2. **잡담이거나 단순 사실 질문인가?** → `casual` 로 분류, 인라인 응답 후 턴 종료.
3. **작업 요청인가?** → `clarify` (요구사항 불명확) 또는 `plan` (요구사항 명확) 으로 분류.

Router 는 코드를 쓰지 않고 작업을 실행하지도 않는다. 오직 **요청이 다음에 어디로 가는지**만 결정한다.

내부 규칙과 프롬프트는 영어 전용; 비영어 user 입력은 LLM 이 자연스럽게 이해함.

## 실행 모드

Main context — `../../harness-contracts/execution-modes.ko.md` 참조. `.planning/` 스캐폴드 생성과 세션 슬러그 확인이 라이브 대화 컨텍스트를 필요로 하기 때문에 router 는 인라인으로 실행된다.

frontmatter 에 하드코딩된 `model:` 없음 — router 는 기본 세션 모델을 사용한다 (보통 Sonnet 4.6). 라우팅 로직이 가볍다고 해서 casual 응답을 더 저렴한 모델로 내려받지 말고, interactive 사용을 위해 **응답 품질을 보장**하도록 설계됨.

## 세 가지 루트의 이유

- **casual** 은 잡담·메타 질문이 세션 할당·기획·하위 스킬까지 끌려가는 걸 막는다. 유저가 `"hi"` 나 `"what can you do"` 라고 했다고 `.planning/` 을 만들면 안 된다.
- **plan** 은 작업 요청의 기본 경로다. 동사, 대상, 그리고 `brainstorming` 이 재질의 없이 바로 티어를 고를 수 있을 만큼의 기준이 모두 있다.
- **clarify** 는 유저가 작업을 원한다는 것은 명확하지만 router 가 *무엇을* 할지 알 수 없는 경우의 안전판이다. Router 는 그 질문을 직접 하지 않는다. 그건 `brainstorming` 의 몫이다.

**plan** 과 **clarify** 사이에서 애매하면 **clarify** 로 기울여라 — 한 번 더 묻는 비용이 추측으로 세운 plan 을 복구하는 비용보다 싸다.

## 사용 시점

매 유저 턴의 **가장 첫 단계**에서 이 스킬을 트리거한다. 다른 harness 스킬이 흐름 진행 중이며 명시적으로 다른 다음 스킬을 지정한 경우에만 건너뛴다.

## 절차

### Step 1 — 재개 감지

재개 신호는 **재개 동사**와 **이전 작업 참조**가 둘 다 있어야 성립한다. 무엇이 이전 작업 참조로 카운트되는지, 그리고 anaphor 없는 단독 재개 동사가 왜 재개 신호가 아닌지는 아래 "재개 지시어(Anaphoric resume) 신호" 섹션을 참고.

두 신호가 모두 있으면:

1. `.planning/` 을 읽는다. 디렉토리가 없으면 세션이 없는 것 — 신규 세션 흐름으로 진행.
2. 각 서브디렉토리의 `ROADMAP.md` 를 읽는다. `- [ ]` 미체크 항목이 하나라도 남은 세션만 후보로 유지.
3. 요청 텍스트 vs 후보 세션의 slug 유사도 + 목표·제목 텍스트 겹침으로 매칭.
4. **1개 매칭** → 해당 세션 로드. `## Status: resume` 와 `## Session: {session_id}` 를 emit. Brainstorming 의 Step 0 이 숏서킷으로 다음 미완료 phase 로 점프한다.
5. **여러 개 매칭** → `AskUserQuestion` 으로 유저에게 선택 요청. 최대 4개 후보 (초과 시 trim); label = slug, description = ROADMAP 에서 가져온 한 줄 goal. 정식 포맷은 `../../harness-contracts/ask-user-question.ko.md` § "Router — multiple session matches" 참조.
6. **매칭 없음 또는 유저가 제안 거부** → 신규 세션 흐름으로 진행.

### Step 2 — casual / clarify / plan 분류

아래 "분류 신호" 와 "False-positive 트랩" 의 휴리스틱을 적용한다. `references/keywords.md` 의 좁은 정규식 힌트는 명백한 케이스를 빠르게 처리하는 용도다. 그 외는 위 정의를 읽고 판정한다.

**plan** 과 **clarify** 사이에서 애매하면 **clarify** 를 고른다.

### Step 3 — 세션 슬러그 (신규 세션만)

포맷: `YYYY-MM-DD-{slug}`.

1. 요청에서 핵심 개념 추출. 본동사의 직접 목적어 우선 (예: `"add 2FA to login"` → `add-2fa-login`).
2. 소문자, ASCII 한정, 단어 사이 하이픈, 40자 이하.
3. `AskUserQuestion` 으로 유저에게 확인. 정식 옵션 목록은 `../../harness-contracts/ask-user-question.ko.md` § "Router — slug confirmation" 참조.
4. "Yes, use this" (또는 무응답) → 제안 그대로 진행. "Edit" / Other → 유저 입력 그대로 사용 (필요 시 재-slug화).
5. **충돌**: `.planning/{date}-{slug}/` 이미 존재 시 `-v2`, `-v3`, ... 순차 부여.

### Step 4 — 스캐폴드 (신규 세션만)

세션 디렉토리에 스켈레톤 생성:

```
.planning/{session-id}/
├── ROADMAP.md      ← templates/roadmap.md 기반, phase 개수 TBD
└── STATE.md        ← templates/state.md 기반, position = Phase 1 ready to plan
```

이 단계에서 두 파일은 태스크 내용 없이 골격만 채운다. 하위 스킬 (`prd-writer`, `trd-writer`, `task-writer`) 이 채워 넣는다.

### Step 5 — 터미널 메시지

최종 메시지는 표준 마크다운 섹션(`## Status`, `## Session`)을 사용한다. **`casual` 인 경우에는 마크다운 섹션을 전혀 쓰지 않는다** — 일반 텍스트로 유저에게 응답하고 종료.

| Outcome | 터미널 메시지 |
|---------|----------------|
| `casual` | 일반 텍스트 응답, 헤더 없음 |
| `clarify` | `## Status: clarify` + `## Session: {session_id}` |
| `plan` | `## Status: plan` + `## Session: {session_id}` |
| `resume` | `## Status: resume` + `## Session: {session_id}` |

`resume` 는 독립된 status 다 — `plan` 위의 boolean 플래그가 아니다. Step 1 에서 기존 세션이 매칭되면 `## Status: resume` 을, 아니면 `## Status: plan` 을 emit.

메인 스레드가 `## Status` 를 읽고 `brainstorming` 을 짧은 디스패치 프롬프트로 호출하는 방법은 `../../harness-contracts/payload-contract.ko.md` 의 "router → brainstorming" 섹션에 명세돼 있다.

## 분류 신호

### casual

**Positive 신호** — 하나 이상 성립해야 함:

- 인사·잡담 (`hi`, `hello`, `hey`, `yo`).
- 하네스 자체에 대한 메타 질문 ("what can you do", "how do I use this").
- 실행 요청 없는 순수 사실 질문 ("what's a closure in JS?", "what does NOT NULL mean").
- Router 의 직전 질문에 대한 yes/no 확인.
- 액션 동사 *에 대한* 질문 ("how do I add …", "why does fix fail") — 정보를 묻는 것이지 명령이 아니다.

**Negative 신호** — 있으면 casual 이 아닐 가능성:

- 이 코드베이스에 작용하는 명령형 동사와 명명된 대상.
- 명시적 수용 기준 ("should …", "must …").
- 에러·실패 테스트·깨진 상태 언급 + 복구 의도.

### plan

**Positive 신호** — 하나 이상 성립해야 함:

- 명령형 동사 + 이 코드베이스의 명명된 대상 ("add 2FA to login", "fix src/auth.ts:42", "refactor the DB layer").
- "should …" / "must …" 형태로 표현된 명시적 수용 기준.
- 실패 테스트·에러 메시지·스택 트레이스 언급 + 복구 의도.

**Negative 신호** — 있으면 plan 이 아닐 가능성:

- 의문형 ("how do I", "what happens if") → casual.
- 과거·가정법 시제 ("I already added …", "we would fix it if …") → casual 또는 clarify.
- 명명된 대상 없이 모호한 평가 ("make it better") → clarify.

### clarify

**Positive 신호** — 하나 이상 성립해야 함:

- 대상이 명확하지 않은 작업 동사 ("make it better", "clean it up", "improve the code").
- 충돌하거나 과소 명세된 요구사항 ("fast but also thorough", "simple but full-featured").
- 맥락이 지시 대상을 고정하지 않은 상태에서 "the bug", "that feature", "the issue" 를 언급.
- 명령형이지만 지시 대상이 여러 그럴듯한 참조물 사이에서 모호.

**Negative 신호** — 있으면 clarify 가 아닐 가능성:

- 대화 맥락상 대상이 명확함 → plan.
- 실행 의도 자체가 없음 → casual.

### 경계 케이스

| Input | Route | 이유 |
|-------|-------|------|
| `fix the login bug`                                   | plan    | 명명된 대상 + 명령형 |
| `fix the bug`                                         | clarify | 지시 대상 미고정, 이전 맥락 없음 |
| `how do I fix a login bug?`                           | casual  | 의문형, 실행 의도 없음 |
| `add JWT auth to /login in src/api.ts`                | plan    | 명령형 + 명명된 파일 + 명명된 기능 |
| `make the auth code better`                           | clarify | 모호한 평가, 구체 기준 없음 |
| `I already added 2FA, what's next?`                   | casual  | 상태 보고, 실행 의도 없음 |
| `what's the difference between JWT and sessions?`     | casual  | 순수 사실 질문 |
| `the spec says "add 2FA", what do you think?`         | casual  | 참조 논의이지 명령이 아님 |

## False-positive 트랩

액션 단어 (`add`, `fix`, `refactor`, `implement`, `migrate`) 가 아래 문맥에서 등장하면 유저 의도로 **카운트하지 않는다**. 이런 위치에서만 키워드가 나타났다면 plan 쪽으로 분류가 기울면 안 된다.

1. **Fenced 코드 블록** — ```` ``` ```` 또는 인라인 `` `…` ``. 코드 예시 안의 액션 동사는 식별자거나 샘플일 뿐 명령이 아니다.
2. **블록 인용** — `>` 로 시작하는 줄. 유저가 남의 텍스트를 참조하는 중이다.
3. **따옴표로 둘러싼 문자열** — `the spec says "add 2FA"` 같은 더 큰 문장 안의 `"add 2FA"` 는 참조이지 명령이 아니다.
4. **파일 경로·식별자** — `src/add-user.ts` 에 "add" 가 있지만 명령이 아니다.
5. **지시문을 에코하는 텍스트** — 첫 20줄 안에 리뷰 결과 라벨 (approve / request-changes / blocked / merge-ready) 중 둘 이상이 나오면 프롬프트는 명령이 아니라 지시문을 리뷰하는 중이다.
6. **슬래시 커맨드 에코** — `run /fix` 는 커맨드를 언급할 뿐 호출하지 않는다.
7. **과거·가정법 시제** — "I already added …", "we would refactor if …" 는 상태 보고이지 요청이 아니다.
8. **의문형** — "how do I add …", "why does fix fail?" 는 동사에 *대해* 묻는 것이지 호출하는 것이 아니다.

원칙: 신호는 **이 턴에 지시된 행동 의도**이지 액션 단어의 *등장*이 아니다. 애매하면 이렇게 물어보라 — "이걸 plan 으로 처리하면 유저가 정말 지금 작업을 시작하길 원하는가?" 아니라면 casual 또는 clarify 로 내린다.

## 재개 지시어(Anaphoric resume) 신호

재개 동사 (`resume`, `continue`, `pick up where`, `keep going on`, `go back to`) 는 이전 작업 참조 — 명시적 slug, 명명된 기능, 또는 시간/지시/프로세스 anaphor — 와 함께 나와야 재개 신호로 카운트된다. 예시: "continue the 2FA work from yesterday", "pick up where we left off on that auth bug".

Anaphor 없는 단독 재개 동사는 현재 턴의 연속으로 기본 해석한다 (예: 어시스턴트가 액션을 제안한 직후 유저가 "continue" 라고 하는 경우).

## 입력

Router 는 진입점이다 — 상위에서 호출하는 스킬이 없으므로 스킬 간 디스패치 프롬프트도 없다. 운영 입력은:

- **현재 턴** — 유저의 요청, 언어 무관.
- **이전 턴 기록** — 단독 재개 동사의 모호성 해소용으로만 사용 (재개 지시어 신호 참조). 현재 대화 이전은 읽지 않는다.
- **`.planning/`** — Step 1 재개 감지 시 스캔.

Router 는 메인 스레드에서 돌고, 라이브 대화 컨텍스트 전체에 접근한다. 이는 의도적 — `continue` 가 "과거 세션 재개" 인지 "방금 말한 것 계속" 인지 판별하려면 어시스턴트의 직전 턴을 봐야 한다. Agent 로 dispatch 되는 하위 스킬은 이 접근권이 없으므로 명시적 디스패치 프롬프트로 구동된다.

## 출력

루트에 따른 두 가지 터미널 메시지 모드:

**casual** — 유저에게 일반 텍스트로 직접 응답하고 스킬 종료. status 헤더 없음, 하위 플로우 없음. 예시 응답: *"I'm a task-oriented harness — you describe a change, I plan it, break it into tasks, and help you execute. What would you like to work on?"*

**clarify / plan / resume** — 최종 메시지는 표준 마크다운 섹션(`## Status`, `## Session`)을 사용. 앞뒤 산문 금지.

섹션:

- `## Status` — 한 줄 값: `clarify`, `plan`, `resume` 중 하나
- `## Session` — 한 줄 값: `YYYY-MM-DD-slug`

### 예시

입력: `hi claude, what can you build?` — casual: router 가 일반 텍스트로 응답. status 헤더 없음.

입력: `add 2FA to login`

```markdown
## Status
plan

## Session
2026-04-19-add-2fa-login
```

입력: `make the auth code better`

```markdown
## Status
clarify

## Session
2026-04-19-improve-auth
```

입력: `let's continue the 2FA work from yesterday` (매칭: `.planning/2026-04-18-add-2fa-login/`)

```markdown
## Status
resume

## Session
2026-04-18-add-2fa-login
```

## 필수 다음 스킬

다음 스킬은 `## Status` 에 따라 결정됨 (전체 핸드오프 계약: `../../harness-contracts/payload-contract.ko.md` § "router → brainstorming"):

- `## Status: clarify | plan | resume` → **필수 하위 스킬:** harness-flow:brainstorming 사용
  디스패치 (메인 컨텍스트 — Skill, Task 아님): `Skill(brainstorming, args: "session_id={id} request={text} route={status} resume={true|false}")`. `route` 인자는 router 의 `## Status` 값을 그대로 전달; `resume=true` 는 status 가 `resume` 일 때만.
- `## Status` 부재 (casual) → 헤더 emit 없음; 흐름 미진입. 사용자에게 직접 답변하고 종료.

## 키워드 카탈로그

Step 2 의 결정론적 키워드 카탈로그는 `references/keywords.md` 참조.

## 경계

- 파일 소유권: `../../harness-contracts/file-ownership.ko.md` 참조. Router 는 Step 4 에서 빈 `ROADMAP.md` / `STATE.md` 스켈레톤을 생성한 뒤 절대 수정하지 않는다 — 이후 쓰기는 하위 스킬이 소유.
- 계획·분해·코드 작성 금지. 각각 `brainstorming`, `prd-writer`, `trd-writer`, `task-writer` 의 역할.
- 세션 슬러그 확인 / 복수 매칭 선택 외의 clarifying question 금지. 그 외의 모호성은 `brainstorming` 가 담당.
