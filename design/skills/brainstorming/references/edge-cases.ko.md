# Brainstorming — 엣지 케이스

`SKILL.md` 에서 참조하는 엣지 케이스 처리.

- **대화 중 유저 피벗** (인증 리팩토링 명확화하다가 갑자기 대시보드 UI): `{"outcome": "pivot", ...}` 터미널 emit + "새 요청으로 보입니다; 라우팅으로 돌아갑니다." 한 문장 종료. 다음 턴 router 가 새 세션 할당.
- **Phase A 답변에 새 모호성** (예: "인증도 건드리고 결제 쪽도 조금"): `scope_hint: multi-system` 으로 흡수. 모호성 자체가 정보다.
- **Phase A 답변이 무관** (범위 MC 에 코드 스니펫 등): 질문을 한 번 인용하며 재질문. 두 번째도 빗나가면 보수적 기본값 `scope_hint: multi-system` 으로 두고 진행.
- **알고 보니 casual** (한 라운드 돌고 보니 작업 요청이 아니라 질문): `{"outcome": "exit-casual", ...}` emit + 한 문장 인지 후 종료. `Last activity: brainstorming exit (reclassified-casual)` 로 기록.
- **유저 자발적 분해** (예: "응, 리드부터 하자, 딜은 다음에"): 수락하고 선택된 서브 프로젝트를 `request` 로 캡처, 후속을 `constraints` 에 `"followup-sessions: deals, reporting"` 로 기록.
- **Router → plan 직송** (Phase A 스킵): `request` 의 첫 동사에서 `intent` 추론. 명확하지 않으면 `add` 기본. 유저에게 묻지 않는다 — 플로우 간결성.
- **기존 분류 있는 재개** (Step 0): 다음 `[ ]` phase 로 향하는 경로 payload emit. Gate 1 재질의 금지.
- **신호 충돌** (예: `migrations/` + "한 줄 오타"): prd-trd 쪽 편향. 사소한 마이그레이션을 과대 스코핑하는 비용은 5분짜리 PRD, 과소 스코핑하는 비용은 깨진 스키마.
- **유저가 파일 수만 주고 경로는 미정** ("8파일쯤?"): 조용히 경로 재계산, 새 추천 한 번 더 제시.
- **유저가 없는 경로 지명** ("prd-tasks 로"): 네 옵션으로 한 번 재질의. 여전히 불명확하면 추천 경로 사용.
- **`intent: "other"` + `intent-freeform`**: freeform 동사 파싱 — refactor-ish → trd-only, fix-ish → tasks-only 후보, create-ish → prd-trd/prd-only. 해석 불가면 prd-only 기본.

## A1.6 (코드베이스 peek) 엣지 케이스

- **A1.6 가 명명된 target 을 못 찾음** (예: 사용자는 "`createSession` 수정" 이라는데 Grep 은 `issueSession` 만 찾음): 사용자 용어와 실제 식별자 둘 다 `key_findings` 에 기록, 불일치를 `open_questions` 에 로그, A2 질문으로 surface — "코드에 `issueSession` 만 보이고 `createSession` 은 없네요. 그걸 말씀하신 건가요, 아니면 제가 안 본 곳에 있나요?" 사용자 어휘를 silent 로 덮어쓰지 말 것; writer 가 trail 을 봐야 함.
- **A1.6 budget 다 써도 target 안 잡힘**: 멈춘다. `open_questions: ["target <name> ~10 calls 안에 못 찾음 — 사용자 disambiguation 필요"]` 기록 후 A2 에서 직접 묻기 — "<name> 이 뻔한 자리에는 안 보이네요. 파일이나 디렉토리를 짚어주실 수 있을까요?" 두 번째 라운드 탐색을 silent 로 시작하지 말 것.
- **A1.6 가 규모 mismatch 감지** (사용자는 "작은 변경" 이라는데 Grep 결과 12개 호출자): `key_findings` 에 기록, A2 에서 surface — "이 변경이 12곳에서 호출되는 함수를 건드려요. 모두 같이 가나요, 일부는 그대로 두나요?" 사용자가 reconcile 하게; 조용히 경로 승격하지 말 것.
- **요청에 해결 가능한 코드베이스 target 이 없음** (순수 UX 결정, 로컬 아날로그 없는 신규 외부 통합, 순수 문서): A1.6 통째로 스킵. `exploration_findings: null` emit. `STATE.md` `Last activity` 에 사유 기록 — writer 가 자체 더 큰 Step 2 budget 으로 폴백할 수 있도록.
- **A1.6 가 target 에서 명백한 버그 발견**: `open_questions` 에 기록해서 사용자가 결정하게 ("이 함수가 null 체크를 빼먹는데, 이번 변경에 같이 묶을까요 별도 세션으로 뺄까요?"). 코드 수정 X; brainstorming 은 절대 편집하지 않는다.
- **사용자가 A1.6 발견을 반박** (Grep 으로 안 나오는 함수가 있다고 주장하거나 그 반대): 둘 중 하나를 고르지 말고 두 견해를 `open_questions` 에 둘 다 보관. writer 가 파일 read 시점에 해결할 수 있지만, 그 불일치가 payload 에 살아있어야만 가능.
- **A1.6 가 요청 텍스트에 없던 경로/키워드 신호 감지** (예: 사용자는 "체크아웃 속도 개선" 이라는데 target 파일이 `migrations/` 를 import): `code_signals` 에 추가 — B1 이 요청 텍스트와 무관하게 캐치한다. 이게 A1.6 를 B1 전에 돌리는 주된 근거.
