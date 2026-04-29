# Writer 핸드오프 계약 (Writer handoff contract)

writer 패밀리 (`prd-writer`, `trd-writer`, `task-writer`) 의 단일 출처. 이전에 이 규칙들을 중복 보유하던 per-skill `references/contract.md` 들을 대체한다. 각 writer 의 `SKILL.md` 는 무엇을 읽고 쓸지, 터미널 메시지 형태, 에러 분류, 공통 anti-pattern 을 위해 이 파일을 참조하고, 자신의 구체적 산출물 예시 한 줄만 인라인으로 보유한다.

## 격리 컨텍스트

모든 writer 는 자기 서브에이전트 컨텍스트 안에서 돌아간다. **메인 대화 히스토리를 사용할 수 없다** — 입력은 디스패치 프롬프트와 그 프롬프트가 인용한 업스트림 파일 뿐이다. 이렇게 분리한 이유는 writer 가 코드 읽기에 컨텍스트를 자유롭게 써도 메인 thread 가 오염되지 않게 하기 위함이고, 동시에 빈약한 디스패치 프롬프트를 이전 턴 회상으로 보충할 수 없다는 의미이기도 하다. 프롬프트가 빈약하면 Read/Grep/Glob 으로 업스트림 파일과 코드베이스를 조사하라; 요구사항·아키텍처·파일 구조를 임의로 만들지 마라.

전체 실행 모드 계약은 `execution-modes.ko.md` 참조.

## writer 가 읽는 것

모든 writer 의 Step 1 은 동일하다: `.planning/{session_id}/brainstorming.md` 를 Read 하고 모든 섹션을 권위 있는 것으로 취급한다.

`brainstorming.md` 는 예전에 디스패치 payload 로 운반되던 내용을 담은 ground truth 다. 섹션 매핑은 다음과 같다:

- `## Request` — 사용자의 그대로의 턴. 구조화 필드가 빠뜨리는 어조와 뉘앙스를 위해 읽는다.
- `## A1.6 findings` — verify-first 탐색 ground (방문 파일, 핵심 발견사항, 코드 신호, 미해결 질문). **본문이 실제 내용이면 권위 있는 것으로 취급한다.** Step 2 는 verify-first 가 된다 — 발견사항이 여전히 유효한지 확인 후, brainstorming 이 방문하지 않은 표면으로만 확장. 이미 다룬 영역을 재탐색하지 마라.
  - 본문이 `- (skipped — no resolvable target)` 이면 풀 모드 탐색으로 전환.
- `## Brainstorming output` — `intent`, `target`, `scope`, `constraints`, `acceptance`. 이들이 spec 을 이끈다.
- `## Recommendation` — `route`, `estimated files`, `user approved`. 디스크에 업스트림 PRD/TRD 가 존재하는지를 결정한다.

writer 별로 추가로 읽을 파일:

- **prd-writer** — `brainstorming.md` 만.
- **trd-writer** — `brainstorming.md`, route 가 `prd-trd` 일 때는 `.planning/{session_id}/PRD.md` 도. `trd-only` 에서는 PRD 가 존재하지 않는다.
- **task-writer** — `brainstorming.md`, 그리고 `.planning/{session_id}/PRD.md` (있으면), `.planning/{session_id}/TRD.md` (있으면). 항상 디스크에서 존재를 확인하라; 디스패치 프롬프트의 산문 힌트에 의존하지 마라.

디스패치 프롬프트에는 `Revision note from user: {note}` 줄이 포함될 수 있다 (메인 thread 가 Gate 2 revise 후 재디스패치한 경우에만 존재). 있으면 처음부터 재유도하기보다 revision note 를 우선 처리하라 — 이전 버전이 거의 맞고 이 축에서만 틀린 상태다.

route 가 선언한 파일이 기대되는 시점에 읽을 수 없거나 없으면, `error` 와 `## Reason: <doc> declared by route but <path> not found` 로 중단한다. 추측하지 마라.

## writer 가 쓰는 것

각 writer 는 결정적 경로에 정확히 한 파일을 생성한다:

- `prd-writer` → `.planning/{session_id}/PRD.md`
- `trd-writer` → `.planning/{session_id}/TRD.md`
- `task-writer` → `.planning/{session_id}/TASKS.md`

출력 경로는 `session_id` 로부터 결정된다; 메인 thread 가 이미 알고 있다. **절대 덮어쓰지 마라.** writer 가 시작될 때 대상 파일이 이미 존재하면 `error` 로 중단한다. 재생성은 메인 thread 의 결정: 옛 파일을 먼저 삭제하고 재디스패치한다.

산출물 본문 형태는 각 writer 의 `SKILL.md` 에 문서화되어 있다 (섹션, 필드, 예시). 세 writer 모두에 공통인 anti-pattern 은 아래에 있다.

## 터미널 메시지

산출물 작성 후 (또는 회복 불가 문제 감지 시), writer 는 짧은 마크다운 블록으로 자기 턴을 종료한다. 메인 thread 가 대화에서 읽는 것은 이것뿐이며, 계획 내용은 파일에 산다.

**done** — 파일 작성 완료:

```markdown
## Status
done

## Path
.planning/{session_id}/{ARTIFACT}.md
```

**error** — 입력 결함, 파일 충돌, 업스트림 누락, 회복 불가 탐색 갭:

```markdown
## Status
error

## Reason
{short cause}
```

터미널 메시지는 추가 필드를 담지 않는다. 다음 스킬은 최소 디스패치 프롬프트만 받는다 (session id 와 Read 할 경로); writer 의 터미널 메시지에서 status 외에 어떤 것도 소비하지 않는다. `## Path` 는 사용자와 Gate 2 가독성을 위한 정보용이다.

## 에러 분류 — `error` vs `done`

`## Status: error` 를 emit 할 때:

- route 가 선언한 필수 업스트림 파일이 누락 또는 읽기 불가 (예: `prd-trd` route 인데 trd-writer 실행 시 `PRD.md` 부재).
- 대상 출력 파일이 이미 존재.
- Step 2 탐색이 도구 예산을 소진했는데도 변경 표면이 해결되지 않음.
- task-writer: task DAG 에 사이클.
- task-writer 한정: PRD 도, TRD 도, 실행 가능한 `## Brainstorming output` 도 없고, `## Request` 에 실행 가능한 동사가 없음.
- `brainstorming.md` 자체가 누락 또는 형식 오류 (`## Recommendation` 블록 없음, route 가 허용 집합 밖 등).

`## Status: done` 을 emit 할 때 (Open questions 를 파일 본문에 기록):

- 작성 완료 후 Open questions 가 2개 초과로 남음. self-escalate 하지 말 것; 다음 writer 또는 evaluator 가 블로킹 질문을 surface.
- PRD/TRD 가 빈약하지만 읽을 만함. 권위 있는 것으로 취급하고 자기 Open questions 에 갭을 기록.

## Solo-dev anti-patterns

세 writer 모두에 적용:

- **인시·스프린트·스토리포인트 금지.** 솔로 프로젝트; 추정은 노이즈다.
- **라이브러리 선택 연극 금지.** 잘 알려진 선택지에 pro/con 표를 그리지 말 것. 선택과 한 줄 근거를 적거나, 생략하라.
- **사용자 어휘를 다른 말로 바꾸지 마라.** 사용자가 "login page" 라고 했으면 "authentication surface" 라고 다시 쓰지 마라. PRD 가 "2FA" 라고 했으면 "second-factor" 라고 다시 쓰지 마라. 다운스트림 (task-writer, evaluator) 이 이 어휘를 grep 한다; 패러프레이즈는 PRD ↔ TRD ↔ TASKS ↔ 검증 사이의 추적성을 깬다.
- **"있으면 좋은 것" 리스트 금지.** Goal/Acceptance 에 없으면 Non-goal 이다.
- **본문은 사용자 언어로 미러.** 한국어 요청 → 한국어 본문. 헤더, 필드명, 코드 식별자, 파일 경로는 기계 파싱 가능성을 위해 영어 유지.
