---
name: router
description: 매 유저 턴의 첫 단계에서 발동해 요청을 casual / clarify / plan 중 하나로 분류하고, 자연어 재개 의도를 감지하고, 세션 슬러그를 할당한다. 하위 스킬은 모두 router 가 먼저 돌았다고 전제한다. 결정론적 키워드 감지가 우선, LLM 판단이 폴백.
---

# Router

## 목적

하네스로 들어오는 모든 유저 요청은 이 스킬을 가장 먼저 거친다. Router 는 순서대로 세 가지 질문에 답한다:

1. **이전 작업의 재개인가?** 그렇다면 → 매칭되는 세션의 ROADMAP 으로 인계.
2. **잡담이거나 단순 사실 질문인가?** → `casual` 로 분류, 인라인 응답 후 턴 종료.
3. **작업 요청인가?** → `clarify` (요구사항 불명확) 또는 `plan` (요구사항 명확) 으로 분류.

Router 는 코드를 쓰지 않고 작업을 실행하지도 않는다. 오직 **요청이 다음에 어디로 가는지**만 결정한다.

이 스킬의 내부 추론, 키워드 매칭, 유저에게 던지는 질문은 **유저가 어떤 언어로 쓰든 관계없이 모두 영어**로 처리한다. LLM 자체가 비영어 입력을 이해하고 분류하는 능력은 그대로지만, 스킬이 언어별 규칙 테이블을 별도로 유지하지 않는다. 스킬 자신이 묻는 질문 (예: 슬러그 확인) 도 영어로 던진다. 스킬을 단일 언어로 유지하면 규칙 세트가 하나이고, 디버깅 지점도 하나가 된다.

## 세 가지 루트의 이유

- **casual** 은 잡담·메타 질문이 세션 할당·기획·하위 스킬까지 끌려가는 걸 막는다. 유저가 `"hi"` 나 `"what can you do"` 라고 했다고 `.planning/` 을 만들면 안 된다.
- **plan** 은 작업 요청의 기본 경로다. 동사, 대상, 그리고 `complexity-classifier` 가 티어를 고를 수 있을 만큼의 기준이 모두 있다.
- **clarify** 는 유저가 작업을 원한다는 것은 명확하지만 router 가 *무엇을* 할지 알 수 없는 경우의 안전판이다. Router 는 그 질문을 직접 하지 않는다. 그건 `brainstorming` 의 몫이다.

**plan** 과 **clarify** 사이에서 애매하면 **clarify** 로 기울여라 — 한 번 더 묻는 비용이 추측으로 세운 plan 을 복구하는 비용보다 싸다.

## 사용 시점

매 유저 턴의 **가장 첫 단계**에서 이 스킬을 트리거한다. 다른 스킬이 `harness-flow.yaml` 을 통해 명시적으로 제어권을 넘긴 경우에만 건너뛴다.

## 절차

### Step 1 — 재개 감지

재개 신호는 **재개 동사**와 **이전 작업 참조**가 둘 다 있어야 성립한다. 무엇이 이전 작업 참조로 카운트되는지, 그리고 anaphor 없는 단독 재개 동사가 왜 재개 신호가 아닌지는 아래 "재개 지시어(Anaphoric resume) 신호" 섹션을 참고.

두 신호가 모두 있으면:

1. `.planning/` 을 읽는다. 디렉토리가 없으면 세션이 없는 것 — 신규 세션 흐름으로 진행.
2. 각 서브디렉토리의 `ROADMAP.md` 를 읽는다. `- [ ]` 미체크 항목이 하나라도 남은 세션만 후보로 유지.
3. 요청 텍스트 vs 후보 세션의 slug 유사도 + 목표·제목 텍스트 겹침으로 매칭.
4. **1개 매칭** → 해당 세션 로드. `outcome: "resume"` 를 emit, `session_id` 지정. Classifier 의 Step 0 이 숏서킷으로 `harness-flow.yaml` 의 다음 미완료 phase 로 점프한다.
5. **여러 개 매칭** → 유저에게 선택 요청. 포맷: `{slug} — {한 줄 goal}`.
6. **매칭 없음 또는 유저가 제안 거부** → 신규 세션 흐름으로 진행.

### Step 2 — casual / clarify / plan 분류

아래 "분류 신호" 와 "False-positive 트랩" 의 휴리스틱을 적용한다. 문서 끝의 키워드 카탈로그에 있는 좁은 정규식 힌트는 명백한 케이스를 빠르게 처리하는 용도다. 그 외는 위 정의를 읽고 판정한다.

**plan** 과 **clarify** 사이에서 애매하면 **clarify** 를 고른다.

### Step 3 — 세션 슬러그 (신규 세션만)

포맷: `YYYY-MM-DD-{slug}`.

1. 요청에서 핵심 개념 추출. 본동사의 직접 목적어 우선 (예: `"add 2FA to login"` → `add-2fa-login`).
2. 소문자, ASCII 한정, 단어 사이 하이픈, 40자 이하.
3. 유저에게 **영어로** 확인: `Use session id "{date}-{slug}"?`
4. 무응답 → 제안 그대로 진행. 거부 → 유저 수정안 그대로 사용 (필요 시 재-slug화).
5. **충돌**: `.planning/{date}-{slug}/` 이미 존재 시 `-v2`, `-v3`, ... 순차 부여.

### Step 4 — 스캐폴드 (신규 세션만)

세션 디렉토리에 스켈레톤 생성:

```
.planning/{session-id}/
├── ROADMAP.md      ← templates/roadmap.md 기반, phase 개수 TBD
└── STATE.md        ← templates/state.md 기반, position = Phase 1 ready to plan
```

이 단계에서 두 파일은 태스크 내용 없이 골격만 채운다. 하위 스킬 (`prd-writer`, `trd-writer`, `task-writer`) 이 채워 넣는다.

### Step 5 — 인계

구조화된 분류 결과를 내보낸다. `harness-flow.yaml` 은 `outcome` 필드로 라우팅한다.

| Outcome | 다음 노드 (harness-flow.yaml 기준) | Payload |
|---------|---------------------------|---------|
| `casual` | END — router 가 인라인 응답 | — |
| `clarify` | `brainstorming` | `{ request, session_id }` |
| `plan` | `classifier` | `{ request, session_id }` |
| `resume` | `classifier` (Step 0 숏서킷으로 다음 미완료 phase) | `{ request, session_id }` |

`resume` 는 독립된 outcome 이다 — `plan` 위의 boolean 플래그가 아니다. Step 1 에서 기존 세션이 매칭되면 `outcome: "resume"` 을, 아니면 `plan` 을 emit.

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

재개 동사 (`resume`, `continue`, `pick up where`, `keep going on`, `go back to`) 가 **이전 작업에 대한 참조**와 함께 나와야 재개 신호로 카운트된다. 이전 작업 참조는 아래 형태를 띤다:

1. **명시적 slug** — 기존 세션 id 나 근접 변형을 유저가 직접 호출.
2. **명명된 기능** — "the 2FA work", "the auth migration", "the profile page" — 과거 세션의 목표·제목과 매칭되는 명사구.
3. **시간 지시어** — "yesterday's …", "this morning's …", "last session's …", "the one we started Monday".
4. **지시 대명사** — "that bug", "that feature", "that thing we were doing", "the one where login broke".
5. **프로세스 지시어** — "where we left off", "what I was working on", "the paused phase".

위 중 하나라도 재개 동사와 동시에 나오면 재개 신호로 처리하고 `.planning/` 매칭을 돌린다.

Anaphor 없는 단독 재개 동사는 **현재 턴의 연속**으로 기본 해석한다. 예: 어시스턴트가 "I'll refactor this now" 라고 말한 직후 유저가 "continue" 라고 하면 이는 "방금 말한 것 그대로 진행" 이지 "과거 세션 재개" 가 아니다.

## 입력

Router 는 진입점이다 — 상위에서 호출하는 스킬이 없으므로 스킬 간 payload 수신은 없다. 운영 입력은:

- **현재 턴** — 유저의 요청, 언어 무관.
- **이전 턴 기록** — 단독 재개 동사의 모호성 해소용으로만 사용 (재개 지시어 신호 참조). 현재 대화 이전은 읽지 않는다.
- **`.planning/`** — Step 1 재개 감지 시 스캔.

Router 는 메인 스레드에서 돌고, 라이브 대화 컨텍스트 전체에 접근한다. 이는 의도적 — `continue` 가 "과거 세션 재개" 인지 "방금 말한 것 계속" 인지 판별하려면 어시스턴트의 직전 턴을 봐야 한다. Agent 로 dispatch 되는 하위 스킬은 이 접근권이 없으므로 명시적 payload 로 구동된다.

## 출력

`outcome` 에 따라 두 가지 emit 모드:

**casual** — 유저에게 일반 텍스트로 직접 응답하고 스킬 종료. JSON 없음, 하위 플로우 없음. 예시 응답: *"I'm a task-oriented harness — you describe a change, I plan it, break it into tasks, and help you execute. What would you like to work on?"*

**clarify / plan / resume** — 최종 메시지로 JSON 객체 하나를 emit. 앞뒤 설명 문장 금지.

스키마:

- `outcome`: `"clarify"`, `"plan"`, `"resume"` 중 하나 — 메인 스레드가 `harness-flow.yaml` transitions 에서 조회
- `session_id`: `"YYYY-MM-DD-slug"`

### 예시

입력: `hi claude, what can you build?` — casual: router 가 일반 텍스트로 응답. JSON 없음.

입력: `add 2FA to login`

```json
{"outcome":"plan","session_id":"2026-04-19-add-2fa-login"}
```

입력: `make the auth code better`

```json
{"outcome":"clarify","session_id":"2026-04-19-improve-auth"}
```

입력: `let's continue the 2FA work from yesterday` (매칭: `.planning/2026-04-18-add-2fa-login/`)

```json
{"outcome":"resume","session_id":"2026-04-18-add-2fa-login"}
```

## 키워드 카탈로그 (참조)

아래 패턴은 힌트 — 명백한 케이스를 빠르게 처리하기 위한 것이다. 여기서 안 잡히는 케이스 (그리고 false-positive 트랩 문맥에 들어간 케이스) 는 모두 위 휴리스틱으로 넘어간다. 패턴은 **영어 전용** 이며, 비영어 입력은 같은 정의를 기준으로 LLM 레이어가 처리한다.

**재개 동사** ("재개 지시어 신호" 에 따라 anaphor 와 동시 출현 필요):

- `\b(resume|continue|pick\s+up\s+where|keep\s+going\s+on|go\s+back\s+to)\b`

**casual:**

- `^(hi|hello|hey|yo|sup)\b`
- `\b(what\s+can\s+you\s+(do|build)|how\s+does\s+this\s+work|who\s+are\s+you)\b`

**plan (동사):**

- `\b(add|fix|implement|refactor|migrate|build|create|remove|replace)\b`

**clarify (모호):**

- `\b(make\s+it\s+(better|good|nice)|clean\s+it\s+up|improve\s+the\s+code)\b`

`harness-flow.yaml` 과 동기화 유지.

## 경계

- 계획·분해·코드 작성 금지. 각각 `complexity-classifier`, `prd-writer`, `trd-writer`, `task-writer` 의 역할.
- 세션 슬러그 확인 / 복수 매칭 선택 외의 clarifying question 금지. 그 외의 모호성은 `brainstorming` 가 담당.
- 스켈레톤 생성 후 `ROADMAP.md` / `STATE.md` 수정 금지. 이 두 파일은 하위 스킬이 소유한다.
