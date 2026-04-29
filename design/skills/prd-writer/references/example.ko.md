# 렌더링된 PRD 예시

각 섹션에 기대하는 구체성 수준 참조용. 요청 `"로그인 페이지에 2FA 추가"` 와, `## Brainstorming output` 에 intent: add, target: 로그인 페이지, scope: subsystem, constraints: (없음), acceptance: (열림) 이 적힌 `brainstorming.md` 가 주어진 경우:

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

이 예시는 빈 줄 포함 ~34줄이며 모든 범위의 **하단**에 위치 — Goal 1개, Non-goals 3개, Acceptance 4개, Constraints 1개, Open questions 0개. `scope_hint: multi-system` 세션은 보통 Constraints 와 Open questions 부터 확장되고, 나머지 섹션은 범위 안에서 늘어나지 밖으로 가지 않는다.
