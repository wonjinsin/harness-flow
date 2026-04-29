# 렌더된 TASKS.md 예시 (PRD · TRD 둘 다 있음)

trd-writer 예시 (`2026-04-19-add-2fa-login`) 을 이어받아 `.planning/2026-04-19-add-2fa-login/PRD.md` 와 `.planning/2026-04-19-add-2fa-login/TRD.md` 가 이미 존재하는 경우:

````markdown
# TASKS — 로그인 페이지에 2FA 추가

Session: 2026-04-19-add-2fa-login
Created: 2026-04-19
PRD: PRD.md
TRD: TRD.md

## Goal

세션 발급을 **TOTP** 검증 뒤로 게이팅해서, 패스워드만 탈취됐을 때는 로그인이 안 되게 한다. 아직 enroll 안 한 유저는 기존 패스워드 플로우 유지.

## Architecture

패스워드 검증 후 단기 **intermediate token** (JWT, 5분 TTL) 발급; 진짜 세션은 intermediate token 에 대한 TOTP 코드 검증이 성공했을 때만 발급. Rate limit 은 intermediate-token id 로 키잉 (IP 아님). Enrollment 발견은 랜딩 페이지의 UI 전용 배너.

## Conventions

- Task IDs are stable (`task-1`, `task-2`, ...). Evaluator and executor reference by ID.
- A task is complete when every `Acceptance:` checkbox is satisfied with evidence.
- **Bold terms** are quoted verbatim from PRD/TRD. Do not rename them in code, tests, or commit messages.

---

### task-1 — `/auth/login` 에서 패스워드 성공 시 intermediate token 발급

**Depends:** (none)
**Files:**
- Modify: `src/auth/login.ts`
- Modify: `src/auth/session.ts` (expose `issueSession(userId)`)
- Test: `tests/auth/login.test.ts`

**Acceptance:**
- [ ] `/auth/login` 성공 응답이 세션 대신 `{ intermediate_token, expires_at }` 을 반환. (TRD §Interfaces & contracts)
- [ ] **intermediate token** 은 기존 세션 키로 서명한 JWT, `pending_2fa: true` 를 담고 TTL 5분. (TRD §Approach)
- [ ] `issueSession(userId)` 가 `src/auth/session.ts` 에서 export 되어 `totp.ts` 가 호출할 수 있음. (TRD §Affected surfaces)
- [ ] 기존 로그인 테스트 업데이트: 패스워드만 성공해도 세션이 안 나옴. (PRD §Acceptance criteria)

**Notes:** 기존 세션 발급 경로를 아직 제거하지 말 것 — `task-2` 가 TOTP verify 엔드포인트에서 `issueSession` 을 호출할 예정이고, 그게 들어오기 전에 새 계약 하에 기존 테스트가 통과해야 함.

---

### task-2 — `POST /auth/totp/verify` 엔드포인트 추가

**Depends:** task-1
**Files:**
- Create: `src/auth/totp.ts`
- Test: `tests/auth/totp.test.ts`

**Acceptance:**
- [ ] `POST /auth/totp/verify` 가 `{ intermediate_token, code }` 를 받고 성공 시 `{ session }` 반환. (TRD §Interfaces & contracts)
- [ ] 검증은 `otplib` 기본 ±1 step window 사용. (TRD §Dependencies, §Risks)
- [ ] 성공 시 `issueSession(userId)` 정확히 한 번 호출; `jti` 는 LRU (크기 10k, TTL 5분) 에서 consumed 로 마킹. (TRD §Risks "중간 토큰 재전송")
- [ ] Rate-limit 시 응답은 `{ error: "rate_limited", retry_after_seconds }`, status 429. (TRD §Interfaces & contracts)
- [ ] Rate limit: **intermediate-token-id** 당 30초에 3회 (IP 아님). (PRD §Acceptance criteria, TRD §Approach)

**Notes:** Rate limit 키는 `jti` 지 user id 아님 — PRD criterion 이 공유-NAT false positive 를 명시적으로 지적함. 더 간단해 보여도 IP 로 치환하지 말 것.

---

### task-3 — 랜딩 페이지에 TOTP enrollment 배너 렌더

**Depends:** (none)
**Files:**
- Modify: `src/pages/landing.tsx`
- Test: `tests/pages/landing.test.tsx`

**Acceptance:**
- [ ] 배너는 `user.totp_enrolled === false` 일 때만 렌더, 아니면 안 함. (TRD §Approach)
- [ ] 배너 렌더 실패가 로그인을 막지 않음. (TRD §Approach — "auth flow 와 분리 가능")

**Notes:** UI 전용 변경; 백엔드 커플링 없음. task-1 · task-2 와 독립 — 병렬 실행 가능.

---

## Self-Review

Performed by task-writer before emitting. Evaluator re-checks these claims.

- [x] Every PRD Acceptance criterion maps to at least one task's Acceptance bullet (or is deferred to Non-goals).
- [x] Every TRD Risks entry is referenced in the Notes of the task that creates the risk (or explicitly accepted as out-of-scope for this session).
- [x] No placeholder strings: "TBD", "similar to task N", "handle edge cases", "add error handling", "write tests for the above".
- [x] PRD/TRD vocabulary consistency: terms used in one task appear in the same form across all other tasks (no `TOTP` → `2FA` drift).
- [x] DAG is acyclic; no task depends transitively on itself.
- [x] No orphan task: every task is reachable from the set of root tasks (`Depends: (none)`), and every task either has a dependent or is a natural leaf.
````

Task 3개, DAG 너비 2 (task-1 과 task-3 가 root, task-2 는 task-1 의존). Executor 는 task-1 과 task-3 을 병렬 dispatch 후 task-1 이 해소되면 task-2 를 돌린다.

상류 docs 가 일부만 있거나 없는 케이스 (TRD-only, PRD-only, neither) 도 같은 shape — task 개수가 줄고, 매핑할 게 없을 때 PRD/TRD 관련 Self-Review 항목들은 trivial pass 다.
