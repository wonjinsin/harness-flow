# AskUserQuestion — 하네스 Q&A 패턴

스킬이 사용자에게 선택 또는 결정 확인을 요청해야 할 때마다 `AskUserQuestion` 도구를 사용한다. 메인 thread 스킬 (router, brainstorming, 메인 thread 게이트) 모두에 적용된다.

## 사용 시점

- **MC 결정** — 열거 가능한 선택지 2–4개가 존재 (intent 유형, scope, 경로 승인).
- **확인 게이트** — yes/proceed/abort 분기 (slug 확인, Gate 1, Gate 2).
- **멀티 세션 disambiguation** — 알려진 기존 세션 중 선택 (후보 ≤ 4개).

## 사용하지 않을 시점

- 미리 열거할 수 없는 열린 텍스트 필드 (자유형 acceptance criteria, 후보가 보이지 않는 경우의 target 이름). 이 경우 산문 질문을 사용하고, 사용자가 일반 메시지로 답변한다. AskUserQuestion 을 사용했지만 사용자의 답이 어떤 옵션과도 맞지 않으면, 자동 제공되는 "Other" 를 선택하고 자유롭게 입력한다.

## 패턴

모든 `AskUserQuestion` 호출에서:

1. **프레이밍** (호출 전 선택적 산문) — 결정에 맥락이 필요할 때는 짧은 산문 한 문장을 먼저 보낸다. 예: "코드 보니 발급 로직과 쿠키 세팅이 섞여 있네요 — 어떻게 정리할까요?" 그 다음 도구를 호출한다. 질문이 자명할 때는 프레이밍 문장을 생략한다.
2. **호출** — `question` (결정 사항), `header` (≤ 12자 칩), `options` (2–4개, 각각 description 포함).
3. **확인 응답** — 답변을 받은 뒤, 진행 전에 사용자 언어로 한 줄 확인 응답을 보낸다: `"refactor으로 가겠습니다."` / `"Got it — refactor."` 확인 응답을 생략하지 말 것; 모델이 답변을 처리했다는 신호다.

## 결정 지점별 명세

각 결정 지점의 정식 `header` 칩 값과 옵션 목록.

### Router — slug 확인

```
question: "Use session id \"<YYYY-MM-DD-slug>\"?"
header:   "Session ID"
options:
  - label: "Yes, use this"
    description: "Continue with the proposed id"
  - label: "Edit"
    description: "Type your preferred session id via Other"
```

### Router — 복수 세션 매칭

최대 4개 후보 (초과 시 4개로 trim). 각 옵션: `label: {slug}`, `description: {ROADMAP 에서 가져온 한 줄 goal}`.

```
question: "Multiple sessions match. Which one do you want to resume?"
header:   "Session"
options:  [ ...후보마다 하나씩... ]
```

### Brainstorming — intent (A2)

```
question: "어떤 종류의 변경인가요?"   (유저 언어 미러링)
header:   "Intent"
options:
  - label: "fix",      description: "버그·오류 수정"
  - label: "refactor", description: "동작 유지, 코드 구조 개선"
  - label: "add",      description: "새 기능 추가"
  - label: "other",    description: "migrate / remove / 기타 — Other 로 입력"
```

intent 가 진짜 애매할 때만 사용; 요청에서 이미 추론 가능하면 건너뛴다.

### Brainstorming — scope (A2)

```
question: "변경 범위가 어느 정도인가요?"
header:   "Scope"
options:
  - label: "single-file",  description: "파일 하나만 변경"
  - label: "subsystem",    description: "하나의 모듈/서비스 범위"
  - label: "multi-system", description: "여러 시스템에 걸쳐 변경"
```

### Brainstorming — explore 방향성 매핑 (A-explore)

문제 공간 카테고리 2–3개가 드러났을 때 사용. 구현이 아닌 방향성 매핑 옵션으로 구성한다.

```
question: "<유저 언어로 된 문제 공간 질문>"
header:   "Direction"
options:  [ ...모양 카테고리 2–3개... ]
```

예시:
```
question: "알림 방식이 어떤 형태를 생각하세요?"
header:   "Direction"
options:
  - label: "push",   description: "모바일 푸시 알림"
  - label: "email",  description: "이메일 발송"
  - label: "in-app", description: "앱 내 알림 센터"
```

### Brainstorming — 확인 fills (A4)

확인 요약 산문 메시지를 먼저 보낸 뒤 호출:

```
question: "이 내용이 맞나요?"
header:   "Confirm"
options:
  - label: "맞아요",         description: "분류 단계로 넘어가기"
  - label: "수정할게 있어요", description: "Other 로 어떤 부분인지 입력"
```

### Brainstorming — Gate 1 (B5)

추천 산문 (경로 + 파일 수 + 신호 요약) 을 먼저 보낸 뒤 호출:

```
question: "이 루트로 진행할까요?"
header:   "Route"
options:
  - label: "진행",         description: "추천 루트로 시작"
  - label: "루트 변경",    description: "Other 로 원하는 루트 입력 (prd-trd / prd-only / trd-only / tasks-only)"
  - label: "파일 수 조정", description: "Other 로 예상 파일 수 입력"
```

### 메인 thread — Gate 2 (각 writer 이후)

`## Path` 파일과 Open questions 를 산문으로 먼저 노출한 뒤 호출:

```
question: "<PATH> 파일을 검토해 주세요. 어떻게 할까요?"
header:   "Spec review"
options:
  - label: "승인",      description: "다음 단계로 진행"
  - label: "수정 요청", description: "Other 로 수정 내용 입력"
  - label: "중단",      description: "이 세션 중단"
```

답변을 분기로 매핑: 승인 → 다음 스킬 디스패치; 수정 요청 → 파일 삭제 후 `Revision note from user: {note}` 를 추가하여 동일 writer 재디스패치; 중단 → STATE 갱신 후 종료.
