# AskUserQuestion — Harness Q&A Pattern

Use the `AskUserQuestion` tool whenever a skill needs the user to make a choice or confirm a decision. This applies to any main-thread skill (router, brainstorming, main-thread gates).

## When to use

- **MC decision** — 2–4 enumerable options exist (intent type, scope, route approval).
- **Confirmation gate** — yes/proceed/abort branching (slug confirm, Gate 1, Gate 2).
- **Multi-session disambiguation** — picking from known existing sessions (≤ 4 candidates).

## When NOT to use

- Open-ended text fields where options can't be enumerated in advance (freeform acceptance criteria, target name when candidates aren't visible). Ask as prose instead; the user types the answer as a regular message. If AskUserQuestion is used but the user's answer doesn't fit any option, they select the auto-provided "Other" and type freely.

## Pattern

For every `AskUserQuestion` invocation:

1. **Framing** (optional prose before the call) — when the decision benefits from context, send one short prose sentence first. Example: "코드 보니 발급 로직과 쿠키 세팅이 섞여 있네요 — 어떻게 정리할까요?" Then call the tool. Skip the framing sentence when the question is self-evident.
2. **Call** — `question` (the decision), `header` (≤ 12 chars chip), `options` (2–4 with descriptions).
3. **Acknowledge** — after receiving the answer, send a one-line acknowledgment in the user's language before proceeding: `"refactor으로 가겠습니다."` / `"Got it — refactor."` Do not skip the acknowledgment; it signals the model processed the answer before moving on.

## Per-decision specs

Canonical `header` chip values and option lists for each decision point.

### Router — slug confirmation

```
question: "Use session id \"<YYYY-MM-DD-slug>\"?"
header:   "Session ID"
options:
  - label: "Yes, use this"
    description: "Continue with the proposed id"
  - label: "Edit"
    description: "Type your preferred session id via Other"
```

### Router — multiple session matches

Up to 4 candidates (trim to 4 if more). Each option: `label: {slug}`, `description: {one-line goal from ROADMAP}`.

```
question: "Multiple sessions match. Which one do you want to resume?"
header:   "Session"
options:  [ ...one per candidate... ]
```

### Brainstorming — intent (A2)

```
question: "어떤 종류의 변경인가요?"   (mirror user's language)
header:   "Intent"
options:
  - label: "fix",     description: "버그·오류 수정"
  - label: "refactor", description: "동작 유지, 코드 구조 개선"
  - label: "add",     description: "새 기능 추가"
  - label: "other",   description: "migrate / remove / 기타 — Other로 입력"
```

Use only when intent is genuinely ambiguous; skip if already inferable from the request.

### Brainstorming — scope (A2)

```
question: "변경 범위가 어느 정도인가요?"
header:   "Scope"
options:
  - label: "single-file",  description: "파일 하나만 변경"
  - label: "subsystem",    description: "하나의 모듈/서비스 범위"
  - label: "multi-system", description: "여러 시스템에 걸쳐 변경"
```

### Brainstorming — explore direction mapping (A-explore)

Use when 2–3 problem-space categories have emerged. Format as direction-mapping options, not implementations.

```
question: "<problem-space question in user's language>"
header:   "Direction"
options:  [ ...2–3 shape categories... ]
```

Example:
```
question: "알림 방식이 어떤 형태를 생각하세요?"
header:   "Direction"
options:
  - label: "push",   description: "모바일 푸시 알림"
  - label: "email",  description: "이메일 발송"
  - label: "in-app", description: "앱 내 알림 센터"
```

### Brainstorming — confirm fills (A4)

Send the confirmation summary as a prose message first, then call:

```
question: "이 내용이 맞나요?"
header:   "Confirm"
options:
  - label: "맞아요",        description: "분류 단계로 넘어가기"
  - label: "수정할게 있어요", description: "Other로 어떤 부분인지 입력"
```

### Brainstorming — Gate 1 (B5)

Send the recommendation prose first (route + file count + signals summary), then call:

```
question: "이 루트로 진행할까요?"
header:   "Route"
options:
  - label: "진행",          description: "추천 루트로 시작"
  - label: "루트 변경",      description: "Other로 원하는 루트 입력 (prd-trd / prd-only / trd-only / tasks-only)"
  - label: "파일 수 조정",   description: "Other로 예상 파일 수 입력"
```

### Main thread — Gate 2 (after each writer)

Surface the `## Path` file and any Open questions in prose first, then call:

```
question: "<PATH> 파일을 검토해 주세요. 어떻게 할까요?"
header:   "Spec review"
options:
  - label: "승인",     description: "다음 단계로 진행"
  - label: "수정 요청", description: "Other로 수정 내용 입력"
  - label: "중단",     description: "이 세션 중단"
```

Map answers to branches: approve → dispatch next skill; revise → delete file + re-dispatch same writer with `Revision note from user: {note}`; abort → update STATE and stop.
