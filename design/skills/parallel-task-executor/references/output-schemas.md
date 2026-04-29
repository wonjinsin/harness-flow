# 터미널 메시지 변형

모든 task 가 종료되면 마지막 어시스턴트 메시지로 단일 마크다운 블록을 emit. task 레벨 결과는 TASKS.md `[Result]` 블록에 산다 — evaluator 가 다시 읽는다. 터미널 메시지는 top-level status 와 task 별 한 줄 roll-up 만 전달한다.

표준 섹션은 `## Status`, `## Tasks`, 그리고 status 가 `done` 이 아닐 때의 `## Reason` 이다.

**done** — 모든 task 가 DONE 도달:

```markdown
## Status
done

## Tasks
- T1: done
- T2: done
- T3: done
```

**blocked** — task 명세가 틀린 경우. TASKS.md 레벨 검증 실패 (cycle, `Depends:` 오타, 빈 Acceptance, 빈/없는 TASKS.md) **포함**. 재 dispatch 로 해결 불가 — 상류에서 task 본문을 고쳐야 한다.

```markdown
## Status
blocked

## Tasks
- T1: done
- T2: blocked (cycle: T2 -> T3 -> T2)
- T3: blocked (cycle: T2 -> T3 -> T2)

## Reason
T2: cycle in Depends graph
```

**failed** — 하나 이상 task 가 3회 재시도 cap 소진:

```markdown
## Status
failed

## Tasks
- T1: done
- T2: failed (3 attempts)
- T3: not started

## Reason
T2: repeated failure after narrow-scope retry
```

**error** — 인프라·툴 레이어 실패 (Task 툴 오류, 파일시스템 거부, TDD reference 누락, TASKS.md 없음):

```markdown
## Status
error

## Reason
TDD reference file missing at <path>
```

(`## Tasks` 는 dispatch 가 한 번도 일어나지 않았으면 error 케이스에서 생략 가능 — `## Status` 와 `## Reason` 만 필수.)

터미널 메시지는 메인 스레드가 SKILL.md 의 '필수 다음 스킬' 섹션에 따라 다음 스킬을 dispatch 하는 데 사용된다 — 메인 스레드는 `## Status` 헤더 라인을 읽는다.

표준 섹션 옆에 산문을 절대 emit 하지 말 것. 부분 진행이 됐으면 TASKS.md `[Result]` 블록에 현실 그대로 남긴다 — 메인 스레드가 executor 를 재 dispatch 할 수 있고, Step 1 의 resume 규칙에 따라 재개된다.
