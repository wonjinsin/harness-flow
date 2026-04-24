---
name: trd-writer
description: 세션에 TRD.md 를 작성해야 할 때 사용. trd-writer 에이전트의 isolated context 안에서 동작 — 메인 대화 이력에는 접근 불가. payload 와 (있으면) 상류 PRD 만 입력으로 받아 `.planning/{session_id}/TRD.md` 한 파일을 쓰고, 경로 + outcome 한 줄을 돌려준다.
---

# TRD Writer

## 목적

**`TRD.md`** 를 만든다 — PRD 레벨의 결과 (무엇을) 와 TASKS 레벨의 단계 (어떻게, 단계별) 를 잇는 기술 설계 문서. 세션당 한 개, **상류 PRD 가 있든 없든 동일한 포맷**. 솔로 개발자 관점: 구현 궤적이 확실해질 정도만 쓰고 그 이상은 쓰지 않는다. 독자가 3분 안에 다 읽을 수 있어야 한다.

이 스킬은 `trd-writer` 에이전트가 isolated context 안에서 로드한다. **payload 가 전부 입력**이고 메인 대화는 보이지 않는다. payload 에 `prd_path` 가 세팅돼 있으면 그 PRD 파일도 권위 있는 입력. 그 외에는 Read/Grep/Glob 으로 코드베이스를 조사해 근거를 찾는다. 아키텍처를 지어내지 말 것.

## 왜 이 스킬이 존재하나

TRD 는 "코드에서 실제로 무엇이 바뀌고, 왜 이 모양인가" 에 답하는 유일한 문서다 — PRD 의 결과 중심 요구사항과도 다르고, TASKS 의 단계별 지시와도 다르다.

세션은 두 가지 모양으로 도착한다 — `prd_path` 세팅됨 (PRD 가 이미 goal·acceptance·constraints 를 고정, TRD 는 그걸 구체적 접근으로 확장) 또는 `prd_path: null` (변경이 본질적으로 기술적 — 리팩터링·인프라·내부 API, TRD 가 첫 산출물). **출력 shape 은 동일.** 유일한 분기는 Section 1 (Context) — PRD 인용이 있고 없고에 따라 살짝 다르게 읽힐 뿐, 하류는 어느 상류가 먹였는지 신경 쓰지 않는다.

메인 스레드는 어떤 writer 를 dispatch 할지 결정할 때 tier (A/B/C/D) 로 사고한다 — 이 스킬은 그러지 않는다. 여기 유일한 분기는 `prd_path` 의 input 기반 null check.

## Input payload

메인 스레드로부터 다음 객체를 받는다. 모든 필드를 권위 있는 입력으로 취급:

- `session_id`: `"YYYY-MM-DD-{slug}"` — 출력 폴더를 결정.
- `request`: 유저의 원본 턴을 그대로. **structured 필드가 놓치는 톤과 뉘앙스를 잡기 위해 꼼꼼히 읽을 것**.
- `prd_path` *(optional)*: 상류에서 PRD 가 만들어졌으면 `".planning/{session_id}/PRD.md"`, 아니면 `null`.
- `brainstorming_output` *(optional)*: `{intent, target, scope_hint, constraints[], acceptance}` — router 가 바로 classifier 로 넘긴 경우 없을 수 있음.

`prd_path` 가 세팅돼 있는데 파일을 못 읽거나 존재하지 않으면 즉시 중단하고 `{"outcome": "error", "session_id": "...", "reason": "PRD declared in payload but <path> not found"}` 를 emit. 지어내서 진행하지 말 것 — payload 는 메인 스레드와의 계약이다.

## Output

최종 메시지는 항상 `outcome` 태그가 붙은 JSON 객체 하나.

**done** — 정상 완료. 파일 위치는 `.planning/{session_id}/TRD.md`:

```json
{ "outcome": "done", "session_id": "2026-04-19-..." }
```

**error** — payload 결함, PRD 누락, 파일 충돌, 회복 불가능한 탐색 공백:

```json
{ "outcome": "error", "session_id": "2026-04-19-...", "reason": "TRD.md already exists at <path>" }
```

파일 경로는 `session_id` 로부터 결정론적으로 도출되므로 메인 스레드가 재구성한다. 같은 경로에 파일이 이미 있으면 `error` 를 emit — **절대 overwrite 하지 않음**. 재생성은 메인 스레드 몫: 이전 파일을 먼저 지우고 나서 재-dispatch.

JSON 옆에 prose 를 덧붙이지 말 것. 메인 스레드는 최종 메시지를 기계 판독 가능한 status line 으로 처리한다.

## Procedure

### Step 1 — Payload 읽기 (PRD 있으면 PRD 도)

`request` 전문을 다시 읽는다. `prd_path` 가 세팅돼 있으면 PRD 를 끝까지 읽고, Goal · Acceptance criteria · Constraints 를 hard input 으로 취급 — TRD 는 그것들을 만족해야지 재유도해서는 안 된다. payload 에서 target 과 가시적 constraints 를 뽑는다. 빠진 게 뭔지 메모 — payload + PRD 만으로 답할 수 없는 건 Step 2 탐색 대상이거나 Open questions 후보.

`prd_path` 가 세팅돼 있는데 파일을 못 읽으면 위의 `error` outcome 을 emit 하고 종료.

### Step 2 — 범위 제한 코드베이스 탐색 (예산 cap)

이 단계의 **tool-call 예산은 Read/Grep/Glob 약 25회**. TRD 결정은 실제 함수 시그니처 · 기존 추상화 · 데이터 shape 을 봐야 하기 때문에 변경 위치만 찾는 패스보다 더 깊이 봐야 하고, 그래서 예산이 더 넉넉하다. 설계 질문에 답하자마자 중단한다.

Target 주도: 다음 우선순위로 주 파일/모듈을 먼저 찾는다 — `brainstorming_output.target` (있으면), PRD 의 주제 (`prd_path` 세팅돼 있으면), 둘 다 없는 최후의 경우엔 `request` 의 첫 명사구 (예: `"auth middleware 를 별도 패키지로 추출하고 싶다"` → `auth middleware`). 그 다음 탐색 폭을 결정:

- `scope_hint: multi-system` → 직접 caller, 형제 모듈, 이 변경이 건드리는 공유 추상화까지 확장.
- 그 외 → target 파일/모듈과 그 직접 의존성 안에서만.

다음에 답할 수 있을 때 탐색을 중단:

1. 코드에서 구체적으로 무엇이 바뀌는가? (파일 레벨, 함수/클래스 이름까지 보임)
2. 어떤 기존 인터페이스를 소비하거나 노출하는가?
3. 어떤 데이터가 어떤 shape 으로 이 변경을 통과하는가?
4. 이 surface 들에 코드베이스 어디가 의존하는가?

요청이 코드만으로 설계 불가능한 경우 (예: 현지 유사물이 없는 새 외부 연동) Open questions 에 적고, 근거 있는 기본값을 `(assumed)` 태그와 함께 선택.

### Step 3 — 템플릿으로 TRD 초안 작성

정확한 구조는 아래 `## TRD.md template` 참조. 각 섹션을 채운다 — placeholder 범위 (예: "문장 1–3개") 는 할당량이 아니라 sanity check.

**작성 규칙**:

- 유저 언어를 content 에서 그대로 반영 (한국어 요청 → 한국어 TRD 본문; 헤더는 기계 판독성 위해 영어 유지).
- **PRD (있으면) 나 유저 request 의 구체적 명사를 그대로 쓸 것.** PRD 가 "2FA 화면" 이라고 했으면 "이차 인증 surface" 같은 식으로 바꾸지 말 것. 하류 (task-writer, evaluator) 는 이 어휘로 grep 한다; 바꿔 쓰면 traceability 가 깨진다.
- Approach 는 **해결의 shape** 을 묘사하지 구현 단계 순서를 쓰지 않는다. 단계 배열은 task-writer 의 몫.
- Interfaces & contracts 는 구체적으로: 함수 시그니처, request/response shape, 이벤트 이름. 진짜 아무것도 추가/변경하지 않을 때만 생략.
- Risks 는 구체적: "rate limiter 가 IP 키라서 공유 NAT 사용자 놓침" 이 "보안 이슈 가능" 보다 낫다.
- Open questions 는 명시적으로 — 근거 있는 판단이면 "X 라고 가정" 도 괜찮지만 `(assumed)` 태그 붙일 것.

**Anti-patterns** (하지 말 것):

- 단계별 task 리스트. TASKS.md 의 몫.
- PRD 의 acceptance criteria 를 그대로 재진술. 섹션 참조로 가리키고 중복 서술하지 말 것.
- 라이브러리 선택 쇼 (잘 알려진 선택에 대한 장단점 표). 선택과 한 줄 이유만 적을 것.
- person-hour · sprint · story point 추정. 솔로 개발자 프로젝트.

### Step 4 — 파일 쓰기

`.planning/{session_id}/` 없으면 만들고 `TRD.md` 작성.

파일이 이미 있으면 중단하고 `{"outcome": "error", "session_id": "...", "reason": "TRD.md already exists at <path>"}` emit. 재생성은 메인 스레드 몫 — 이전 파일을 먼저 지우고 재-dispatch.

### Step 5 — Emit

"Open questions" 항목 개수를 센다. 최종 JSON 을 emit. 이게 최종 메시지 전부.

## TRD.md template

간결 지향 — 독자가 3분 안에 끝낼 수 있어야 한다. 섹션이 범위 이상으로 늘어나려 하면 대개 Open question 으로 떼어내야 한다는 신호지 padding 으로 메우는 게 아니다. 섹션 4–6 (Interfaces, Data model, Dependencies) 은 변경이 없을 때 `N/A — <한 줄 이유>` 로 적어도 됨; 무관한 내용으로 채우지 말 것.

```markdown
# TRD — {PRD 또는 request 에서 뽑은 한 줄 제목}

Session: {session_id}
Created: {ISO date}
PRD: {PRD.md 상대 경로, 또는 "(none)"}

## 1. Context

{문장 1–3개. PRD 가 있으면 TRD 관점으로 goal 을 요약하고 관련 PRD 섹션을
 **헤더 이름으로** 인용 (번호 금지 — 헤더 이름은 안정적이지만 번호는 위치
 기반이라 PRD 템플릿 순서가 바뀌면 조용히 stale 해진다). PRD 없으면
 유저 request 에서 뽑은 기술적 동기를 기술.}

## 2. Approach

{bullet 2–5개. 해결의 shape 을 묘사 — 핵심 설계 결정, 구현 단계 아님.
 각 bullet 은 "왜 이 shape 인가" 에 답해야 함.}

- {결정 1 + 한 줄 이유}
- {결정 2 + 한 줄 이유}

## 3. Affected surfaces

{생성/수정될 파일·모듈. 경계를 넘나들면 서브시스템별로 그룹핑. 항목당
 무엇이 바뀌는지 한 줄.}

- `path/to/file.ext` — {무엇이 바뀌는지}
- `path/to/other.ext` — {무엇이 바뀌는지}

## 4. Interfaces & contracts

{구체적 시그니처, request/response shape, 이벤트 이름, CLI 플래그 —
 이 변경 바깥 코드와의 계약이 되는 것들. 시그니처는 code block.
 진짜 추가/변경이 없으면 "N/A — <이유>".}

## 5. Data model

{스키마, 테이블, 영속화 구조, 메시지 포맷 — 지속적 shape 은 무엇이든.
 영속화/스키마 변경 없으면 "N/A — <이유>".}

## 6. Dependencies

{외부 라이브러리, 서비스, 피처 플래그, 이 변경이 의존하는 진행 중인
 다른 작업. self-contained 면 "N/A — <이유>".}

## 7. Risks

{구체적 실패 모드 + 설계가 어떻게 완화하거나 수용하는지.
 탐색 중 auth/security/migrations 관련 우려가 드러나면 항목이 필요하다 —
 하류 (task-writer, evaluator) 는 이 요구사항들을 코드만으로 복구할 수 없어서
 생략된 risk 는 조용히 실패한다.}

- {Risk 1}: {완화책 또는 명시적 수용}
- {Risk 2}: {완화책 또는 명시적 수용}

## 8. Open questions

{구현에 영향을 미치는 미결정 설계. 없으면 비워둠.
 형식: "- Q: … (impact: …)".}
```

## Example 1 — 렌더된 TRD (상류 PRD 있음)

prd-writer 예시 세션 (`2026-04-19-add-2fa-login`) 을 이어받는 payload `{prd_path: ".planning/2026-04-19-add-2fa-login/PRD.md"}` 가 주어진 경우:

````markdown
# TRD — 로그인 페이지에 2FA 추가

Session: 2026-04-19-add-2fa-login
Created: 2026-04-19
PRD: PRD.md

## 1. Context

기존 패스워드 로그인 플로우에 세션 발급 전 TOTP 확인을 끼워 넣는 변경. PRD 의 Goal · Acceptance criteria 를 충족. SMS · 복구 플로우는 PRD 의 Non-goals 에 따라 범위 밖.

## 2. Approach

- 패스워드 검증 후 발급되는 중간 단기 토큰 (JWT, TTL 5분) 에 `pending_2fa: true` 를 담는다. 이유: 2FA 성공 시 세션 발급을 원자적으로 유지하면서 서버측 pending-login 상태를 안 들고 있기 위해.
- TOTP 검증 엔드포인트가 중간 토큰을 소비하고 성공 시 진짜 세션을 발급. 이유: "2FA 전에 세션 없음" 을 단일 지점에서 강제.
- TOTP 엔드포인트 rate limit (30초당 3회, 키 = 중간 토큰 id). 이유: PRD acceptance criterion; IP 가 아니라 토큰으로 키잉해서 공유 NAT false positive 회피.
- Enrollment 배너는 랜딩 페이지의 UI 전용 변경이며 `user.totp_enrolled == false` 조건부 렌더링. 이유: auth flow 와 분리 가능 — 렌더 실패해도 로그인 안 막음.

## 3. Affected surfaces

- `src/auth/login.ts` — 패스워드 검증이 세션 대신 중간 토큰을 반환하도록 변경.
- `src/auth/totp.ts` — 새 모듈: verify 엔드포인트, rate limit, 성공 시 세션 발급.
- `src/auth/session.ts` — totp.ts 가 호출할 `issueSession(userId)` 노출.
- `src/pages/landing.tsx` — enrollment 배너 조건부 렌더.

## 4. Interfaces & contracts

```ts
// POST /auth/login — success response (변경됨)
{ intermediate_token: string, expires_at: ISO8601 }

// POST /auth/totp/verify — 신규
// request
{ intermediate_token: string, code: string }
// response (성공)
{ session: Session }
// response (rate-limited)
{ error: "rate_limited", retry_after_seconds: number }
```

## 5. Data model

스키마 변경 없음. 중간 토큰은 기존 세션 키로 서명한 stateless JWT; `user.totp_secret` 과 `user.totp_enrolled` 컬럼은 이미 존재.

## 6. Dependencies

- `otplib` (`package.json` 에 이미 있음) TOTP 검증용.
- 신규 서비스 없음, 피처 플래그 없음.

## 7. Risks

- **중간 토큰 재전송**: 토큰은 single-use — verify 엔드포인트가 `jti` 를 in-memory LRU (크기 10k, TTL 5분) 에 consumed 로 마킹. 프로세스 재시작 시 유실은 허용 (TTL 이 이미 짧음).
- **Clock skew 로 TOTP 실패**: `otplib` 기본 window 는 ±1 step (30초). 문서화만, 변경 없음.

## 8. Open questions

(none)
````

참고: 이 예시는 모든 범위에서 **하단** 수준이다 — 단일 모듈 내 변경, Approach 4 bullet, Affected surfaces 4 항목, Risks 2 항목, Open questions 0. `scope_hint: multi-system` 세션은 대개 Affected surfaces 와 Interfaces 가 먼저 늘어나고 (서브시스템 횡단이면 노출되는 계약이 더 많다) 그 다음 Risks 가 늘어난다; 다른 섹션은 범위 안에서 확장하지 밖으로 나가지 않는다. 아래 "PRD 없음" 변형은 Section 1 이 기술 동기 문단으로 바뀌고, 설계 근거가 의지할 PRD 가 없기 때문에 Approach 도 대개 더 늘어난다.

## Example 2 — 렌더된 TRD (상류 PRD 없음)

요청 `"auth middleware 를 별도 패키지로 추출해서 admin API 와 공유하고 싶다"` 와 payload `{prd_path: null, brainstorming_output: {scope_hint: "multi-system"}}` 가 주어진 경우:

````markdown
# TRD — auth middleware 공유 패키지로 추출

Session: 2026-04-19-extract-auth-middleware
Created: 2026-04-19
PRD: (none)

## 1. Context

`src/auth/middleware.ts` 의 auth middleware 가 곧 나올 admin API 에 중복될 예정. `packages/auth-middleware` 로 추출해서 두 소비자가 한 소스에 의존하게 한다. 동작 변경은 없다.

## 2. Approach

- 새 workspace 패키지 `packages/auth-middleware`, middleware factory 와 의존성 인터페이스를 export. 이유: interface 기반 export 여야 각 소비자가 자신의 session store 와 logger 를 주입할 수 있음.
- 본체 앱과 admin API 가 둘 다 이 패키지에서 import; 추출 후 `src/auth/middleware.ts` 에는 코드 없음. 이유: 원본을 남겨두면 drift 발생 — shim 이 아니라 완전 제거.
- Session store 는 본체 앱에 남겨둠 (추출 안 함). 이유: store 구현이 앱 특화 (Redis 스키마, key prefix); 공유하는 건 middleware 계약뿐.

## 3. Affected surfaces

- `packages/auth-middleware/` — 신규 패키지 (src/index.ts, package.json, tsconfig.json).
- `src/auth/middleware.ts` — 추출 후 삭제.
- `src/server.ts` — import 경로를 `./auth/middleware` 에서 `@internal/auth-middleware` 로 변경.
- `pnpm-workspace.yaml` — 새 패키지를 workspace 에 추가.
- `tsconfig.base.json` — `@internal/auth-middleware` path alias.

## 4. Interfaces & contracts

```ts
// packages/auth-middleware/src/index.ts
export interface SessionStore {
  get(token: string): Promise<Session | null>;
}
export interface AuthMiddlewareOptions {
  store: SessionStore;
  logger?: { warn: (msg: string, meta?: object) => void };
}
export function createAuthMiddleware(opts: AuthMiddlewareOptions): Middleware;
```

## 5. Data model

N/A — 동작 보존 추출이라 영속화 shape 변경 없음.

## 6. Dependencies

- 새 외부 dep 없음. `express` 타입 (devDep) 만 의존.

## 7. Risks

- **Import 경로 churn** (`path:auth/`): 본체 앱의 한 모듈이 현재 middleware 를 import — 추출이 잘못되면 서버 부팅 깨짐. 완화: 이동하는 같은 task batch 에서 typecheck + 부팅 smoke test.
- **Admin API 가 아직 소비 안 함**: 추출은 "지금 공유 모양을 만들고 다음 세션에서 쓴다". 상상 속 두 번째 소비자를 위한 과설계 리스크. 완화: 인터페이스 최소화 (현재 본체 앱 호출 지점이 필요로 하는 것만) — admin API 가 실제 도착하면 그때 PR 로 추가.

## 8. Open questions

- Q: 패키지를 지금 내부 레지스트리에 퍼블리시할지, workspace 전용으로 둘지? (impact: admin API 는 다른 repo 에 살 예정 — workspace 전용이면 그 시점에 다시 봄. (assumed): 지금은 workspace 전용.)
````

~62줄. 상류 PRD 가 없으면 범위가 미리 해소되지 않으므로 open question 1-2개쯤은 흔하다.

## Edge cases

- **PRD 가 있는데 얇거나 불완전**: 그래도 권위 있는 입력으로 취급; 공백은 TRD 의 Open questions 로. 이 스킬 안에서 PRD 를 "고치지" 말 것 — 메인 스레드 결정 사항.
- **요청이 존재하지 않는 파일을 참조**: Glob 으로 확인. 진짜 없으면 구조를 지어내지 말고 Open question 에.
- **탐색에서 `auth/` / `security/` / `migrations/` 우려가 드러남**: 템플릿 §7 규칙은 변경이 아무리 작아 보여도 적용된다 — 생략이 곧 조용한 실패 모드이므로 판단을 명시적으로 적는다 (항목이 "accepted: 동작 보존 변경" 같은 형태여도 괜찮음).
- **PRD 가 없으면서 request 도 아주 얇을 때**: `prd_path` 가 null 이고 `request` 가 한 문장이고 `brainstorming_output` 도 null 이면 상류가 오라우팅한 가능성이 높다. best-effort TRD 진행하고 얇음을 Open question 으로 표시 — 루프백 여부는 메인 스레드 결정.
- **비영어 request**: 본문은 유저 언어, 헤더·필드명·코드 식별자는 영어. 기계 판독성 유지하면서 유저한테 읽히게.
- **작성 후 Open questions 가 2개 초과**: TRD 의 Open questions 섹션에 기록하고 `done` 을 emit — task-writer 가 TRD 를 재독하며 차단성 질문을 유저에게 노출한다. self-escalate 하지 말 것; 범위 판단은 메인 스레드의 몫.

## Boundaries

- `.planning/{session_id}/TRD.md` 에만 쓴다. **PRD.md, ROADMAP.md, STATE.md 는 건드리지 말 것** — PRD.md 는 downstream 리더일 뿐이고, 나머지는 메인 스레드 소관.
- 다른 agent 나 skill 을 호출하지 말 것. 종착점.
- task-writer 를 dispatch 하지 말 것. 메인 스레드가 harness-flow.yaml 을 따른다.
- 탐색 중 버그를 발견해도 소스 코드를 수정하지 말 것. load-bearing 이면 Open questions 에 적는다.
- Tool 예산: Step 2 에서 Read/Grep/Glob 약 25회 총량. 더 필요하면 payload 에 문제가 있는 것 — 중단하고 `error` 와 `reason` 으로 예산 고갈을 기록.
