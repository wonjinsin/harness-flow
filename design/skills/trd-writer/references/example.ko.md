# 렌더된 TRD 예시 (상류 PRD 있음)

prd-writer 예시 세션 (`2026-04-19-add-2fa-login`) 을 이어받아 `.planning/2026-04-19-add-2fa-login/PRD.md` 가 이미 존재하는 경우:

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

이 예시는 모든 범위에서 **하단** 수준 — 단일 모듈 내 변경, Approach 4 bullet, Affected surfaces 4 항목, Risks 2 항목, Open questions 0. `scope_hint: multi-system` 세션은 대개 Affected surfaces 와 Interfaces 가 먼저 늘어나고 (서브시스템 횡단이면 노출되는 계약이 더 많다) 그 다음 Risks 가 늘어난다.

상류 PRD 가 없는 케이스는 §1 (Context) 문구만 다르다 — TRD 본문 shape 은 동일.
