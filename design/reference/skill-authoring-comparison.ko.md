# 스킬 작성 방법: 참고 프로젝트 비교와 실제 생성 실험

> [영문 원본](skill-authoring-comparison.md)의 전체 한국어 번역본입니다. 실험 수치, 근거 링크, 재현 명령과 해석상의 한계를 유지했습니다.

## 0. 범위와 결론

- **작성일:** 2026-10-14.
- **질문:** 어떤 참고 프로젝트가 에이전트에게 스킬 작성 방법을 가르치는가? 각 방법이 더하는 가치는 무엇이며, 실제로 그 방법으로 만든 스킬은 어떻게 동작하는가?
- **비교 기준:** 현재 로컬 작업 파일을 기준으로 하며, [소스 스냅샷과 해시](skill-authoring-benchmark/inputs/source-manifest.json)를 보존했다. 확인하지 않은 원격 최신 버전과의 비교가 아니다.
- **결과물:** **완성된 생성 스킬 14개**, 작성 에이전트 보고서, 소스·Git 이력·브라우저 테스트 자료, 스킬을 사용하는 에이전트의 원본 응답, 결정론적 채점기, 실제 브라우저로 재실행할 수 있는 스모크 검증 도구.
- **변경 범위:** 운영 중인 스킬, 참고 프로젝트 소스, 설치된 스킬 경로, 전역 설정을 변경하지 않았고, 배포나 게시도 하지 않았다. ECC를 위해 격리된 임시 저장소에 커밋 6개로 구성된 **합성 Git 테스트 이력**을 만들었다. 이 이력은 이식 가능한 번들로 보존했으며 기존 프로젝트에는 커밋하지 않았다.

**핵심 결론:** 이번 실험은 어떤 작성 방법이 더 우수한지 **입증하지 못했다**. 사전에 고정한 엄격한 정답 기준에서는 harness-flow, superpowers, mattpocock, ECC, 전용 작성 스킬 없이 작성한 대조군의 생성물이 모두 분리된 평가를 통과했다. OMC와 원본 절차 제공 조건의 점수 차이는 다른 해석도 타당한 두 사례에서만 발생했다. 모든 조건에서 이 두 사례를 동일하게 제외하면, 절차를 제공한 모든 조건이 나머지 사례를 전부 통과한다. 가장 뚜렷하게 관찰된 차이는 **작성 과정과 생성물 크기**이며, 일반적인 신뢰성 순위가 아니다.

규모가 작고 요구사항이 명확한 이번 과제에서는 harness-flow가 측정된 동작을 유지하면서 공통 실험군 중 가장 짧은 생성물을 만들었다. superpowers의 실패 유형별 지침 형태 선택, mattpocock의 정보 계층, ECC의 생성·감사·행동 측정 분리는 참고할 만하다. 다만 이 결과만으로 상위 프로젝트의 워크플로 전체를 가져오지는 않아야 한다.

## 1. 어떤 프로젝트에 스킬 작성 방법이 있는가?

| 프로젝트 | 관련 진입점 | 원래 목적과 검증 방식 | harness-flow와의 관계 |
| --- | --- | --- | --- |
| superpowers | [writing-skills 스냅샷](skill-authoring-benchmark/inputs/source-snapshots/superpowers/writing-skills-SKILL.md) | 실패 재현, 지침 작성, 새 컨텍스트의 사용자 에이전트 평가, 문구 개선. 5회 이상 반복하는 소규모 평가 포함 | 가장 직접적으로 비교할 수 있는 방법. 실패 유형과 지침 형태를 연결하는 규칙이 추가로 있음 |
| mattpocock/skills | [writing-for-agents](skill-authoring-benchmark/inputs/source-snapshots/mattpocock/writing-for-agents-SKILL.md), [스킬 작성 원리](skill-authoring-benchmark/inputs/source-snapshots/mattpocock/writing-for-agents-SKILL-MECHANICS.md) | 컨텍스트 참조, 정보 계층, 완료 기준, 호출 경계 설계 | 정해진 RED/GREEN 실행 순환보다는 작성·참조 설계 원칙에 가까움 |
| everything-claude-code (ECC) | [skill-create](skill-authoring-benchmark/inputs/source-snapshots/ecc/commands-skill-create.md) | Git 이력에서 패턴 추출. 이름, 저장 경로, 덮어쓰기, YAML, 원자적 교체 보호 | 관찰된 이력에서 생성. 구조 검증이 행동 검증을 뜻하지는 않음 |
| oh-my-claudecode (OMC) | [skillify](skill-authoring-benchmark/inputs/source-snapshots/omc/skillify-SKILL.md) | 성공했고 반복 가능한 세션 작업 흐름을 학습 스킬 초안으로 추출 | 스킬로 만들 가치와 출처를 확인하는 관문은 있지만, 초안 이후 행동 평가를 반드시 수행하도록 하지는 않음 |
| gstack | [skillify 템플릿](skill-authoring-benchmark/inputs/source-snapshots/gstack/skillify-SKILL.md.tmpl) | 성공한 브라우저 수집 절차를 코드·테스트 자료·테스트로 변환. 승인·설치 전에 별도 임시 영역에 준비 | 실행형 브라우저 스킬 작성기이며, 일반적인 지침 문서 작성기는 아님 |
| Archon | [authoring-workflows](skill-authoring-benchmark/inputs/source-snapshots/archon/authoring-workflows-authoring-workflows.md) | 결과 중심의 워크플로 YAML, 명시적 관문, 모의 실행 자료, 실제 작업 적용 | 인접한 워크플로 작성 기능. 조사한 런타임 스킬·명령·에이전트 영역에서는 일반적인 SKILL.md 작성 방법을 찾지 못함 |
| get-shit-done (GSD) | [스킬 의존성 검사기](skill-authoring-benchmark/inputs/source-snapshots/gsd/scripts-lint-skill-deps.cjs), 설치기의 명령→스킬 변환 | GSD 명령 소스에서 설치 가능한 런타임 파일을 생성하고 의존성 선언 및 프로필의 의존성 완결성을 검증 | 인접한 변환·배포 도구이며, 일반적인 스킬 작성기는 아님 |

Archon과 GSD는 구조 비교에는 포함했지만, **생성 스킬 점수를 임의로 부여하지 않았다**. Archon 워크플로를 만들거나 기존 GSD 명령을 변환하면 다른 종류의 결과물을 측정하게 된다. 위에서 확인한 실제 스킬 작성 방법과 harness-flow를 실행했으며, gstack은 별도의 원래 용도에 맞는 생성물 실험군으로 유지했다.

### 참고할 만한 차이

- **superpowers:** 출력 형태가 잘못되면 올바른 수행 절차를 제시하고, 요소가 빠지면 필수 출력 항목을 만들며, 조건부 행동에는 관찰 가능한 조건문을 쓰고, 실제 규칙 위반에는 규율에 맞는 금지 조항을 적용한다. 무조건 강한 표현을 추가하는 것보다 실행 가능성이 높다.
- **mattpocock:** 항상 필요한 단계는 본문에 둔다. 특정 분기에서만 필요한 자료는 언제 읽어야 하는지 밝힌 참조로 분리한다. 같은 개념의 규칙과 주의사항은 함께 둔다. 파일 길이만으로 분리 여부를 결정하지 않는다.
- **ECC:** 생성(`skill-create`), 보유 스킬 관리(`skill-stocktake`), 준수 여부 관찰(`skill-comply`)은 결과물과 근거가 서로 다르다. 구조적 유효성, Git 이력에서의 반복, 행동의 정확성을 같은 것으로 취급하지 않는다.
- **OMC:** 발견한 내용을 스킬로 만들 가치가 있는지, 프로젝트 문서에 둘 내용인지, 아직 너무 모호한지 명시적으로 판단한다. 원래 품질 관문은 프로젝트·워크플로에 특화된 발견을 선호하며, 이는 harness-flow의 재사용 가능한 스킬 범위와 다르다.
- **gstack:** 성공한 원본 작업의 출처를 보존하고, 준비 중인 생성물을 격리하며, 저장된 테스트 자료의 재생과 실제 실행을 구분한다. 여기서 “commit skill”은 디렉터리 이동을 통한 설치를 뜻하며, 반드시 Git 커밋을 의미하지는 않는다.

### 그대로 가져오면 안 되는 차이

harness-flow는 이미 기존 사용자 콘텐츠를 보호하고, 참조형 스킬을 평가하며, 커밋 승인과 푸시 승인을 분리한다. 상위 superpowers에는 삭제·게시 범위가 더 넓은 문구가 있고, 순수 참조형 스킬을 압박 평가에서 제외하면서 그에 상응하는 명확한 단서를 제시하지 않는 보조 자료도 있다. 앞서 검토한 무조건적인 삭제와 권한 오류를 빈 데이터로 취급하는 예제 역시 상위 보조 자료에 남아 있다. 상위 버전으로 통째로 교체한다고 로컬 규칙이 자동으로 좋아지지는 않는다.

ECC·OMC의 프로젝트별 학습 지식 정책이 비공개 스키마와 저장소 사실을 프로젝트 문서에 두라는 harness-flow의 원칙을 묵시적으로 대체해서는 안 된다. 마찬가지로 gstack의 설치 수명주기와 ECC의 보유 스킬 감사를 모두 하나의 writing-skills 런타임 문서에 합쳐서는 안 된다.

## 2. 평가 방법과 주요 근거

평가는 **작성 과정의 근거**와 **생성물의 실제 결과**를 분리한다. 문서에 “테스트하라”고 쓰여 있다고 테스트가 실행됐다는 뜻은 아니다. 에이전트가 “완료했다”고 말한다고 요청한 결과물이 동작한다는 뜻도 아니다.

주요 방법론 출처는 다음과 같다.

1. [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents). 과제, 개별 시행, 채점기, 실행 기록, 결과를 구분한다. 격리된 반복 평가, 균형 잡힌 사례, 적합한 경우의 결정론적 채점, 기록 검토, 과제·채점 기준의 타당성 확인을 권한다.
2. [Agent Skills 명세](https://agentskills.io/specification). 메타데이터와 패키징의 구조적 제약을 제공한다. 형식 검사가 스킬 발견이나 행동 품질을 입증하지는 않는다.
3. [Anthropic skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md). 스킬 미사용 기준선과 사용 결과의 비교, 검증 조건, 평가 프롬프트, 출력 검토를 위한 추가 참고 자료다. 이번 실험의 별도 작성 실험군은 아니다.
4. [ECC skill-comply 스냅샷](skill-authoring-benchmark/inputs/source-snapshots/ecc/skill-comply-SKILL.md)과 [상위 구현](https://github.com/affaan-m/ECC/tree/main/skills/skill-comply/scripts). 규칙 준수를 돕는·중립적인·경쟁하는 프롬프트와 관찰 가능한 도구 호출 시간선이라는 유용한 관점을 제공한다. LLM으로 생성한 명세·분류와 원래의 `claude -p` 실행은 이번 실험의 고정된 결과 채점기와 동일하지 않다.
5. [로컬 새 컨텍스트 평가 지침](../../skills/writing-skills/testing-skills-with-subagents.md)과 보존된 상위 작성 지침.

**이번 실험의 채점 정책:** 관찰 가능한 JSON 필드를 코드로 정확히 비교한다. 배열 순서는 무시하지만 중복이나 추가 ID는 통과시키지 않는다. 파싱 실패는 실패로 센다. 방법 준수와 해석 문제는 기록된 호출, 생성물, 소스 문서를 검토하며, 임의의 수치 점수를 붙이지 않는다. 보정되지 않은 LLM 판정기가 주요 결과를 결정하지 않는다.

### 비교 기준 10개

| 기준 | 작성 방법을 평가하는 방식 | 생성물을 평가한 방식 | 관찰과 적용 한계 |
| --- | --- | --- | --- |
| 1. 소스 충실도와 출처 | 실제 입력, 소스 해시, 이력·세션 근거, 명시된 적용 방식 변경 확인 | 선택된 근거 ID를 사전에 정한 사실과 비교하고 소스→출력 기록 보존 | ECC는 실제 Git으로 만든 합성 이력을, OMC는 통제된 환경에서 실제 성공한 응답을 사용했다. 복잡한 운영 이력에서 유용한 지식을 발견하는 능력을 입증하지는 않음 |
| 2. 진단과 반복 개선 | 실제 기준선·후보 평가 호출 순서와 근거 기반 수정 확인 | 생성물을 고정하기 전에 적용·변형 사례 결과 비교 | harness-flow와 superpowers는 각각 관찰된 릴리스 실패 하나를 수정했다. 다른 공통 실험군에서는 평가상 수정이 필요하지 않았음 |
| 3. 메타데이터와 선택 | 내보내기 경로, frontmatter, 이름, 명시된 탐색 경로 확인 | YAML·이름·길이·링크의 일부 요건 검사. 메타데이터만 사용한 적용·비적용 요청 평가 | 모든 생성물이 공통 구조 검사를 통과했고 모든 공통 작성 실험군이 선택 평가를 통과했다. 실제 호스트의 스킬 활성화 검증은 아님 |
| 4. 일반 과제의 정확성 | 뼈대만 있는 결과물이 아니라 사용 가능한 완성품을 만들었는지 확인 | 고정된 일반 릴리스·장애 사례를 각각 5회 반복 | 절차를 제공한 모든 조건이 일반 사례를 통과했다. 작성자의 자기 보고보다 실제 결과가 더 강한 근거임 |
| 5. 경계 조건과 근거 누락 | 변형 사례가 요구되는지, 실제 실행했는지 확인 | 새 결과로 대체된 검사, 만료된 면제, 복구 증거 부재, 담당자 충돌, 실행형 스킬의 누락·빈 레코드 | 대부분의 사례에서 스킬 미제공 대조군과 차이가 났다. 두 사례는 벤치마크 자체의 모호성을 드러냄 |
| 6. 압박과 비신뢰 텍스트 | 방법이 필수로 요구하는 압박 평가와 선택적 평가 구분 | 관리자 압박, 인용문 형태의 지침 주입, 실행형 입력에 섞인 악의적 외부 텍스트 | 좁은 범위의 출력 정책 평가다. 공통 시스템 지침도 인용된 지시를 경계하도록 했으며, 사용 에이전트에는 변경 도구가 없었음 |
| 7. 근거 충실도와 불확실성 | 정확한 실패 근거와 솔직한 한계 보고 요구 | 확정 원인 ID와 가설, 반증 처리, 담당자 모호성, 유효한 검사 ID | 고정된 필드 점수를 보존했다. 타당한 대안 해석은 몰래 재채점하지 않고 별도 민감도 분석으로 다룸 |
| 8. 변경과 게시 경계 | 승인된 내보내기 범위, 보호된 쓰기, 임시 준비 영역, 생략한 게시 단계 확인 | `may_deploy`·`may_publish` 필드 평가. 실제 설치·배포는 하지 않음 | ECC는 후보 검증·원자적 교체를 수행했고, gstack은 내보내기용 임시 영역에 머물렀다. 불리언 값이 맞다고 안전한 배포 행동이 입증되는 것은 아님 |
| 9. 크기와 유지보수성 | 호출이 많다는 이유로 가산하지 않고 과정 관찰 기록 | 생성된 Markdown의 단어 수·바이트 수, 실행형 패키지 크기, 의존성 확인 | harness-flow의 공통 생성물이 가장 짧았다. 단어 수는 공백 기준이며, 토큰 사용량이나 금전적 비용이 아님 |
| 10. 이식성과 재현성 | 원래 단계와 대체 실행 방식, 소스 리비전, 모델 별칭, 전체 근거 기록 | 고정 해시, 결정론적 오프라인 재채점, 공식 SDK 동일성, 실제 브라우저 CLI 재실행 | Claude·OMC의 원래 스킬 탐색과 gstack 데몬 인가는 검증하지 않았다. 별칭에 연결된 정확한 모델 스냅샷도 제공되지 않았음 |

## 3. 실험 설계

[실험 절차](skill-authoring-benchmark/protocol.md), [분리 평가 전 추가 규정](skill-authoring-benchmark/inputs/protocol-addendum.md), [공통 작성 과제](skill-authoring-benchmark/inputs/author-brief.md), [소스 자료](skill-authoring-benchmark/inputs/source-packet.md)에 실험을 정의했다.

### 공통 지침형 스킬 실험

harness-flow, superpowers, mattpocock, OMC, ECC의 다섯 작성 방법이 각각 스킬 두 개를 만들었다. **전용 작성 스킬 없는 작성자**도 작성 방법을 읽지 않고 같은 두 결과물을 만들었다. 이 대조군에도 동일한 완성도 높은 과제·소스 자료, 기준선 근거, 안전 경계, 선택적으로 사용할 수 있는 개발 평가기를 제공했다.

과제는 다음 두 가지다.

- **release-evidence:** 릴리스 후보별 필수 검사, 실제 실행 근거, 면제 유효성, 유효한 근거 ID, 준비 상태 판정과 배포 승인 사이의 경계 평가.
- **incident-handoff:** 복구와 조치 완료, 확정 원인과 가설, 예방과 완화, 수락된 담당과 제안, 인계와 게시 권한을 구분.

대조 조건은 다음과 같다.

- **no-skill:** 사용 에이전트에 과제와 출력 스키마만 제공하고 절차는 제공하지 않는다.
- **raw-procedure:** 작성 변환을 거치지 않은 해당 원본 절차를 축약 없이 제공한다.
- **unaided:** 동일하게 상세한 과제로부터 전용 작성 스킬 없이 만든 스킬을 제공한다.

작성 에이전트는 호스트의 기본 작업 에이전트 설정을 사용했다. 사용 에이전트는 고정된 Eval 모델 별칭 **`smol`**을 사용했다. 도구 인터페이스는 별칭에 연결된 정확한 모델 스냅샷이나 디코딩 설정을 노출하지 않았다. 공통 실험군별 작성은 한 번이며 서로 다른 결과물 두 개를 만들었다. 사용 에이전트의 반복 평가는 **독립적인 작성 실험 반복이 아니다**.

관찰된 개발 기준선은 릴리스 적용 **0/5**, 장애 적용 **3/5**였다. 작성자는 과제별 공개 사례 두 개를 사용할 수 있었다. 전체 [개발 기록](skill-authoring-benchmark/results/author-development-traces.json)에는 대조 조건을 포함하여 새 컨텍스트에서 생성한 추가 응답 **170개**가 남아 있다. 세션 추출을 위해 원본 절차를 제공한 성공 시연 두 개도 별도로 기록했다.

모든 공통 생성물을 고정한 뒤 상위 에이전트가 **분리된 평가 400회**를 실행했다. 조건 8개 × 과제 2개 × 사례 5개 × 새 컨텍스트 반복 5회다. 시행 순서는 시드 `20261014`로 섞었으며 **모델 제공자 오류는 0건**이었다. 작성자에게 분리 평가 파일을 읽지 말라고 지시했다. 이 분리는 운영체제 샌드박스로 강제한 것이 아니므로, 암호학적·물리적으로 차단된 블라인드 실험이라고 설명해서는 안 된다.

별도의 **메타데이터 선택 평가 120회**는 이름과 설명만 사용했다. 공통 작성 실험군 6개 각각에 적용 요청 2개와 비적용 요청 2개를 넣고, 요청당 5회 반복했다. 실제 호스트의 자동 스킬 로딩을 측정한 것은 아니다.

### 원래 용도에 맞춘 실행형 스킬 실험

gstack의 skillify 방법으로 다음을 만들었다.

- [release-feed](skill-authoring-benchmark/artifacts/gstack/release-feed/SKILL.md): 릴리스 행을 버전·상태·URL JSON으로 변환.
- [service-notices](skill-authoring-benchmark/artifacts/gstack/service-notices/SKILL.md): 공지 항목을 제목·심각도·URL JSON으로 변환.

둘 다 **실제 Chromium으로 로컬 페이지에 접속하고 DOM을 추출하는 작업**에서 시작했으며, 이를 [browser-session.json](skill-authoring-benchmark/inputs/browser-session.json)에 보존했다. 각 결과물에는 완전한 실행 코드, 테스트, 수집한 HTML, 공식 browse SDK와 바이트 단위로 동일한 사본이 들어 있다. 두 실행형 과제는 서로 다른 작성 컨텍스트를 사용했다.

gstack 체크아웃에는 설치된 의존성과 빌드된 browse 바이너리가 없었다. 따라서 고정 응답을 대신 넣지 않고 브라우저 작업을 **실제 Chromium 어댑터**에 연결했다. 수정하지 않은 SDK가 `goto`·`html` 요청을 보내면 어댑터가 실제 Chromium을 탐색하고 DOM을 반환한다. 이는 생성된 CLI와 파서의 실행을 검증하지만, **gstack의 원래 설치 과정, 데몬 인증·권한 범위 동작, 실제 외부 사이트 데이터의 최신성은 입증하지 않는다**. 생성물은 스킬 자동 탐색 경로에 설치하지 않았다.

## 4. 생성물 평가 결과

### 고정된 엄격한 정답 기준의 결과

아래 주요 점수는 논란이 있는 사례까지 포함해 변경하지 않았다. **고정된 이번 생성물의 관찰 결과이며, 작성 방법의 순위표가 아니다.** “안정적으로 통과한 사례”는 관찰한 5회가 모두 통과한 사례 수다. 일반적인 pass^5 확률을 추정한 값이 아니다.

| 사용 에이전트에 제공한 조건 | 전체 필수 출력의 정확한 일치 | 정확한 필수 필드 | 안정적으로 통과한 사례 | 과제 타당성 민감도: 논란 사례 두 개 제외 |
| --- | ---: | ---: | ---: | ---: |
| harness-flow 생성물 | 50/50 | 225/225 | 10/10 | 40/40 |
| superpowers 생성물 | 50/50 | 225/225 | 10/10 | 40/40 |
| mattpocock 생성물 | 50/50 | 225/225 | 10/10 | 40/40 |
| OMC 생성물 | 47/50 | 216/225 | 9/10 | 40/40 |
| ECC 생성물 | 50/50 | 225/225 | 10/10 | 40/40 |
| 전용 작성 스킬 없는 작성자의 생성물 | 50/50 | 225/225 | 10/10 | 40/40 |
| 원본 절차 | 45/50 | 220/225 | 9/10 | 40/40 |
| 생성 스킬·절차 모두 미제공 | 10/50 | 157/225 | 0/10 | 8/40 |

근거: [원본 응답](skill-authoring-benchmark/results/holdout-responses.json), [결정론적으로 재계산한 요약](skill-authoring-benchmark/results/summary.json), [사례 타당성 검토](skill-authoring-benchmark/results/task-validity-review.json).

### 점수 차이가 우위를 입증하지 못하는 이유

**OMC, `r-latest`:** 5회 중 3회에서 릴리스를 보류했다. 기록에 `runtime PASS`만 있고 어떤 경로를 실행했는지 적혀 있지 않았기 때문이다. OMC가 만든 지침은 실행 기록에 경로를 명시하도록 요구한다. 고정된 정답 기준은 이 축약 표현만으로 충분하다고 간주했다. 보수적인 해석도 타당하므로, 이를 OMC가 새 결과로 대체된 과거 실패를 잘못 처리한다는 명확한 근거로 볼 수는 없다.

**원본 절차, `i-pressure`:** 모든 시행에서 롤백·복구 기록 `z2`를 가설 ID에 포함했다. 원본 자체가 롤백과 복구의 동시 발생은 확정 근거가 아니라 가설 수준이라고 설명하지만, 고정된 정답 기준은 명시적인 원인 주장 `z1`만 기대했다. 추가 ID는 원본을 타당하게 해석한 결과일 수 있으며, 조작된 정보라고 입증된 것은 아니다.

이 문제들은 채점 **이후** 발견했다. 예상 정답을 바꾸거나, 생성물을 수정하거나, 불리한 응답을 교체하지 않았다. 민감도 열은 모든 조건에서 동일한 두 사례를 제외한다. 사후 타당성 점검이지, 사전에 등록한 새 대표 점수가 아니다. 작성된 스킬과 원본 절차를 제공한 모든 조건이 나머지 사례를 통과하므로, 이 근거로 신뢰성 순위를 매길 수 없다.

### 구조와 메타데이터 선택

생성한 SKILL.md **14개** 모두 실제 검사한 공통 요건을 통과했다. YAML 존재, 이름과 디렉터리 일치, 소문자 이름 형식과 길이, 비어 있지 않고 제한 길이 이내인 설명, 500줄 미만, 로컬 Markdown 링크가 있는 경우 대상 존재 여부를 확인했다. 각 호스트의 확장 규격까지 모두 준수한다는 인증은 아니다.

모든 공통 작성 실험군이 메타데이터만 사용하는 선택 평가 **20/20**을 통과했다. mattpocock의 설명 두 개는 로컬 규칙의 정확한 접두사 `Use when`으로 시작하지 않는다. 이는 로컬 스타일 차이이지 원래 형식의 오류가 아니다. 선택 평가 결과는 이 접두사 차이가 실제 호스트의 스킬 발견에 영향을 준다는 근거를 제공하지 않는다.

근거: [구조 검사](skill-authoring-benchmark/results/structural-checks.json), [선택 평가 응답](skill-authoring-benchmark/results/discovery-responses.json).

### 실행형 스킬 결과

| 검사 | 관찰 결과 | 입증하는 범위 |
| --- | --- | --- |
| 작성자가 만든 테스트 자료 기반 테스트 | 통과 15개, 실패 0개. 파일 두 개에서 검증 조건 42개 실행 | 완성된 두 패키지에서 작성된 테스트 모음을 실행할 수 있음 |
| 독립적으로 고정한 파서 사례 | 10/10, 과제별 5개 | 일반 추출, 레이아웃 변경, 불완전한 레코드, 빈 목록, 섞여 들어온 악의적 텍스트에서 예상 데이터와 일치 |
| 실제 Chromium 어댑터를 통한 CLI | 두 스크립트 모두 종료 코드 0, 예상 JSON과 정확히 일치. 별도 재실행 성공 기록 보존 | 공식 SDK → 실제 페이지 탐색·DOM → 생성 파서 → 표준 출력 경로가 동작 |
| 공식 SDK 무결성 | 두 사본 모두 바이트 단위로 동일. 실행형 생성물 파일 11개가 고정 이후 변경되지 않음 | SDK를 대체하거나 평가 이후 생성물을 수정하지 않음 |

실행형 패키지 크기는 release-feed **78,192바이트**, service-notices **69,173바이트**다. 테스트, 테스트 자료, SDK 사본, 포함된 HTML 엔터티 데이터를 합한 값이다. 순수 지침형 스킬과는 결과물 종류가 다르므로, 이 크기로 두 실험군의 효율을 직접 비교하는 것은 공정하지 않다.

인프라 실패를 생성 스킬의 실패로 계산하거나 숨기지 않고 보존했다. 어댑터가 중첩된 도구 헬퍼를 통해 브라우저 작업을 전달한 초기 CLI 시도 네 번은 시간 초과됐다. 콜백을 직접 Puppeteer 컨텍스트로 옮기자 두 생성물을 변경하지 않고 성공했다. 저장한 재실행 도구도 처음에는 서로 다른 JavaScript 실행 영역의 객체를 엄격 비교하여 잘못된 실패를 보고했다. 프로토타입 검토로 이 불일치를 확인했으며, 정규화한 JSON은 같았다. 채점기만 정규화된 JSON 비교로 수정하고 재실행해 성공했다. [인프라 기록](skill-authoring-benchmark/results/infrastructure-notes.json)을 참고한다.

## 5. 각 작성 방법이 실제로 수행한 작업

| 작성 실험군 | 실제 개발 과정 관찰 | 관찰된 행동 개선 수정 | 생성 Markdown 단어 수, 스킬 두 개 합계 |
| --- | --- | --- | ---: |
| harness-flow | 평가 호출 11회 / 시행 55회. 스킬 미제공 대조, 순차적인 적용·변형, 회귀 평가 포함 | 릴리스 변형 사례가 1/5만 통과하자 유효 근거 선택을 엄격하게 했다. 이후 변형·회귀 평가 통과 | 682 |
| superpowers | 평가 호출 11회 / 시행 55회. 대조·회귀 평가 포함 | 첫 릴리스 후보가 4/5를 통과한 뒤 면제를 먼저 처리하는 규칙을 명시했다. 이후 적용·회귀 평가 통과 | 1,018 |
| mattpocock | 자발적으로 평가 호출 4회 / 시행 20회 | 공개 평가를 모두 통과하여 이후 수정 없음. 단계·완료 기준을 구성하고 근거 규칙을 함께 배치 | 950 |
| OMC | 자발적으로 평가 호출 4회 / 시행 20회 | 공개 평가 이후 수정 없음. 원래 형식의 triggers 메타데이터와 함께 단계·성공 기준·주의사항 추출 | 1,042 |
| ECC | 작성 중 후보 행동 평가 호출 없음 | 임시 후보를 파싱·검사한 뒤 원자적으로 교체. 이후 상위 에이전트가 행동 측정 | 1,182 |
| 전용 작성 스킬 없는 작성자 | 자발적으로 평가 호출 4회 / 시행 20회 | 공개 평가 통과 이후 수정 없음. 동일하게 상세한 소스 자료로 일반적인 초안 작성 | 1,278 |

개발 과정의 합산 통과율을 방법의 품질로 비교해서는 안 된다. TDD 실험군에는 의도적으로 실패하는 대조 조건과 중간 후보가 들어 있다. 평가 호출이 많다는 것은 과정의 비용·근거이지, 최종 생성물이 자동으로 더 우수하다는 뜻이 아니다.

방법별 보고서: [harness-flow](skill-authoring-benchmark/results/author-harness-flow.json), [superpowers](skill-authoring-benchmark/results/author-superpowers.json), [mattpocock](skill-authoring-benchmark/results/author-mattpocock.json), [OMC](skill-authoring-benchmark/results/author-omc.json), [ECC](skill-authoring-benchmark/results/author-ecc.json), [전용 작성 스킬 없는 작성자](skill-authoring-benchmark/results/author-unaided.json), [gstack 릴리스](skill-authoring-benchmark/results/author-gstack-releases.json), [gstack 공지](skill-authoring-benchmark/results/author-gstack-notices.json). 평가 호출 수와 출력은 자기 보고만이 아니라 공통 평가기 기록으로 확인했다.

**원래 방법의 충실한 재현에 관한 한계:** 설계자가 지정한 합성 과제로는 OMC의 실제 발견·투입 노력에 대한 품질 관문을 입증할 수 없다. OMC의 평면적인 학습 파일 저장 방식도 내보내기 디렉터리에 맞게 변경했다. ECC의 이력은 실제 Git이지만 인위적으로 깔끔하고 좁은 범위로 구성했다. 일부 실험군은 호스트 라우팅 때문에 로컬 writing-skills 안내에도 부수적으로 노출됐다고 보고했다. 지정된 방법만 따랐다는 주장으로 이 노출이 사라지지는 않는다. 원래의 게시 단계는 의도적으로 승인하지 않았다.

## 6. harness-flow에 주는 시사점

1. **작은 로컬 핵심을 유지한다.** 이번 공통 실험에서 측정된 결과를 유지하며 가장 짧은 생성물을 만들었다. 과제에 한정된 관찰이지, 단어가 적으면 항상 좋다는 증거는 아니다.
2. **superpowers의 실패 유형별 지침 형태 선택 규칙을 짧게 도입하는 방안을 고려한다.** 기록된 면제·유효 근거 수정은 구체적인 조건문이 관찰된 결함을 해결할 수 있음을 보여 준다. 모든 결함에 보편적인 금지 조항을 추가하지 않는다.
3. **mattpocock의 정보 계층을 편집 기준으로 활용한다.** 참조 자료를 읽을 조건을 명시하고 규칙·적용 조건·완료 기준을 함께 둔다. 런타임 스킬을 긴 글쓰기 교재로 확장할 필요는 없다.
4. **구조·발견·과정·결과 검사를 구분한다.** ECC의 안전한 쓰기와 기록 중심 평가기는 서로 다른 보장을 제공한다. YAML 유효성과 도구 호출 순서 준수가 과제 정확성을 대신해서는 안 된다.
5. **스킬 탓을 하기 전에 평가기를 점검한다.** 논란이 있는 사례와 실행 영역 간 비교기의 잘못된 실패 판정은 평가 결함·모호성이다. 주요 근거를 보존하고 실제 출력을 검토하며, 승자를 임의로 만들지 말고 민감도를 보고한다.
6. **성적이 상한에 몰린 결과로 더 복잡한 장치를 정당화하지 않는다.** 전용 작성 스킬 없는 대조군도 성공했다. 작성 방법의 인과적 이점을 추정하려면 더 다양한 소스 과제와 독립적인 작성 반복이 필요하다. 현재 근거는 선택적인 개선을 뒷받침하며 새로운 실행 조율 프레임워크를 정당화하지 않는다.

이번 조사에서는 운영 중인 writing-skills에 제안한 변경을 적용하지 않았다.

## 7. 재현 방법과 근거 위치

### 저장된 결과의 오프라인 재채점

harness-flow 루트에서 실행한다.

```bash
python3 design/reference/skill-authoring-benchmark/scripts/score.py
bun design/reference/skill-authoring-benchmark/scripts/evaluate-native.ts
bun test design/reference/skill-authoring-benchmark/artifacts/gstack/release-feed/script.test.ts design/reference/skill-authoring-benchmark/artifacts/gstack/service-notices/script.test.ts
```

`score.py`는 저장된 공통 실험 응답 전체를 다시 채점하고, 시행 수·중복 식별자를 검사하며, 고정된 공통 생성물 해시를 확인한다. Python 표준 라이브러리만 사용한다. 실행형 검증 명령에는 Bun이 필요하지만 원래 gstack 데몬은 필요하지 않다.

### 모델 응답을 새로 생성하는 반복 평가

[run_holdout.py](skill-authoring-benchmark/scripts/run_holdout.py)는 OMP Eval 안에서 동작하는 실행 도구이며, 독립적인 모델 제공자 SDK가 아니다. Python Eval에 로드하고 `prepare_trials()`를 호출한 다음 `run_wave()`를 8회 실행한다. 호스트가 제공하는 무상태 `completion`, `tool.write`, `smol` 별칭이 필요하다. 의도적으로 재실행하기 전에는 기존 결과 파일을 따로 보존한다. 이 도구가 실행 묶음별 파일을 쓰기 때문이다. 별칭에 연결된 정확한 모델 스냅샷과 디코딩 설정이 노출되지 않으므로, 모델 응답을 완전히 동일하게 재현할 수 있다는 보장은 없다.

메타데이터 선택기의 전체 시스템 프롬프트, 후보 설명, 요청, 응답, 예상 라벨, 점수는 응답 파일에 보존했다. 사례 네 개는 [discovery-cases.json](skill-authoring-benchmark/inputs/discovery-cases.json)에 별도로 저장했다.

### 실제 브라우저 재실행

OMP JavaScript Eval에서 [replay_browser.js](skill-authoring-benchmark/scripts/replay_browser.js)의 `replayBrowser`를 가져와 `await replayBrowser(browser)`를 호출한다. 관리되는 Chromium을 열고, 새로운 루프백 포트로 보존된 로컬 HTML을 제공하며, 공식 SDK를 통해 변경하지 않은 두 생성 프로그램을 실행한다. JSON이 정확히 일치하는지 비교한 다음 탭과 서버를 닫는다. 재실행 시 벤치마크 URL을 덮어쓰므로 원래 임시 포트에 의존하지 않는다.

이는 명시적인 어댑터 실험이다. 원래 gstack 데몬 인증을 흉내 내거나 검증하지 않는다. 어댑터의 capability 문자열은 로컬 합성 테스트 값이지 인증 정보가 아니다.

### 보존된 근거

- [소스 버전, 작업 파일 해시, 스냅샷](skill-authoring-benchmark/inputs/source-manifest.json).
- [고정된 공통 생성물](skill-authoring-benchmark/results/artifact-manifest.json), [고정된 실행형 생성물](skill-authoring-benchmark/results/native-artifact-manifest.json).
- [공개 사례](skill-authoring-benchmark/inputs/development-cases.json), [분리 평가 사례](skill-authoring-benchmark/inputs/heldout-cases.json), [실행형 파서 사례](skill-authoring-benchmark/inputs/browser-heldout-cases.json).
- [초기 스킬 미제공 기준선](skill-authoring-benchmark/results/development-baseline.json), [작성 과정 평가 기록](skill-authoring-benchmark/results/author-development-traces.json), [분리 평가 응답](skill-authoring-benchmark/results/holdout-responses.json), [요약](skill-authoring-benchmark/results/summary.json).
- [합성 Git 이력 출처](skill-authoring-benchmark/inputs/history-fixture.json), [이식 가능한 이력 번들](skill-authoring-benchmark/inputs/history.bundle). 작성자 작업이 끝난 뒤 원래 임시 저장소를 제거했다. 필요하면 `git clone <bundle-path> <new-directory>`로 새 빈 디렉터리에 복원한다.
- [실행형 분리 평가 결과](skill-authoring-benchmark/results/native-heldout.json), [실제 브라우저 직접 연결 CLI 출력](skill-authoring-benchmark/results/native-cli-direct-browser.json), [저장된 재실행 검증](skill-authoring-benchmark/results/native-cli-replay.json), [SDK·해시 검사](skill-authoring-benchmark/results/native-integrity.json).
- [최종 근거 감사](skill-authoring-benchmark/results/final-audit.json).

소스 스냅샷과 복사한 SDK 자료에는 상위 출처가 유지된다. 프로젝트의 통합 저작권 고지는 [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md)에 있다. 생성된 실행형 파서도 HTML 엔터티 데이터의 출처가 Python 표준 라이브러리임을 명시한다.

## 8. 결과와 함께 전달해야 할 한계

- 공통 과제는 두 개뿐이며, 방법별 작성은 한 번, 사용 에이전트 평가는 사례별 5회다. 통계적 우위를 주장하지 않는다.
- 대부분 완성된 상세 원본 정책과 명확한 출력 스키마 때문에 발견·설계 작업이 줄고, 점수가 상한에 몰렸다. 강한 과제 설명에 작성 지침을 추가했을 때의 효과를 측정한 실험이다.
- 스킬 미제공 대조군에는 과제별 절차 지식이 없다. 따라서 이 조건과의 차이는 메타 작성 스킬만의 효과가 아니다. 원본 절차와 전용 작성 스킬 없는 대조 조건이 이 혼동 요인을 일부 보완한다.
- 분리 평가 사례 두 개는 의미 해석에 논란의 여지가 있었다. 주요 점수와 사후 민감도 분석을 모두 보존했다.
- 사용 에이전트 별칭 `smol`, 호스트 기본 작성 에이전트, 완전하지 않은 실험 조건 격리는 정확한 재현과 다른 모델로의 일반화를 제한한다.
- 사용 에이전트 평가는 도구 없는 단일 턴 판단이었다. 여러 턴의 운영 행동, 안전한 실제 배포, 원래 호스트의 자동 스킬 활성화를 입증하지 않는다.
- 생성된 Markdown 전체를 사용 에이전트에 제공했다. 보조 파일의 선택적 검색·로딩을 측정하지 않는다. 이번 공통 생성물은 모두 자체 완결형이었다.
- gstack 실행형 평가는 통제된 로컬 페이지와 실제 브라우저 어댑터를 사용한다. 실제 사이트 변경, 외부 서비스 동작, 원래 설치 환경의 스킬 발견, 원래 데몬의 보안에 관해 주장하지 않는다.
- 구조 검증기는 앞선 저장소 조사에서 별도로 평가했다. ECC의 디렉터리 810개 검사와 GSD의 스킬 134개 의존성 검사는 이번 생성물의 행동 정확성을 입증하는 근거가 아니다.
