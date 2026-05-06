# Hook 시스템 추가 설계 (Hook System Spec)

> 작성일: 2026-05-06
> 브랜치: `worktree-hook-system`
> 출처: `/Users/WonjinSin/.claude/plans/design-reference-expressive-robin.md`의 "Spec: Hook 시스템 추가" 섹션을 spec 위치로 옮긴 것

## Context

`hooks/session-start` 단일 SessionStart hook(Bash)만 있는 현재 구조에 다음 세 가지를 추가하면서, 기존 `session-start`도 함께 Node.js로 마이그레이션한다:

1. **위험한 동작 차단** (`--no-verify`, `rm -rf` root/home/cwd, `| sh` 원격 실행)
2. **commit 직전 fmt/lint 자동 실행** (Makefile target 위임)
3. **secret/취약 패턴 검사** (Edit/Write 후 즉시 + commit 직전)

ECC가 검증한 PreToolUse(Bash) + PostToolUse(Edit/Write) 패턴을 차용하되, 본 repo의 minimalist 정체성("skill chain은 markdown으로 표현")과 정합되도록 단순화한다. ECC 또한 hook을 `.js`로 작성하므로 언어 선택도 그 패턴을 따른다.

배경 분석은 `design/reference/*.md` 6개 하네스 비교 + plan 파일의 "Lint/Format/Security를 hook에서 처리하는 패턴" 부록 참고.

## 결정 요약 (brainstorming 결과)

| # | 결정 | 값 | 이유 |
|---|---|---|---|
| 1 | 실패 시 재실행 | 옵션 A — fail-open, 메시지만 | LLM이 정직한 메시지로 자율 fix. exit 2의 "거부 메시지"는 이미 적용된 파일과 상태 모순 |
| 2 | 차단 게이트 위치 | (b) `git commit` 직전 + (c') Edit/Write 후 secret 즉시 | 영구 기록 보호 + secret은 fix path 자명 |
| 3 | lint/fmt 도구 | `make lint`, `make fmt` Makefile target 위임 | 본 repo가 다중 언어 매트릭스 안 쥠 |
| 4 | secret 검사 | hook 내부 정규식 매트릭스 (외부 의존 없음) | 패턴 보편적, 설치 의존 0 |
| 5 | 위험 Bash 차단 | 보수적 — `--no-verify`, `rm -rf` root/home/cwd, `\|sh`/`\|bash` 원격 실행 | LLM 의도 가능성 낮은 명백한 위험만 |
| 6 | disable | `HARNESS_FLOW_HOOKS_OFF=1` 단일 kill switch | 미니멀, 외부 설정 파일 불필요 |
| 7 | 자동 워크플로 강제 | **out of scope** | 책임 분리: hook=신호, skill=정책 |
| 8 | hook script 언어 | **Node.js** (`#!/usr/bin/env node`, npm 외부 의존 0) | JSON 파싱 native, 정규식 매트릭스 객체로 깔끔, 단위 테스트 용이. ECC 패턴과 정합. 기존 `session-start`도 함께 마이그레이션 |

## 아키텍처

### 스크립트 셋

- `hooks/session-start.js` — `SessionStart` (기존 bash 마이그레이션)
- `hooks/pre-bash.js` — `PreToolUse(Bash)` 게이트 (신규)
- `hooks/post-edit.js` — `PostToolUse(Edit|Write|MultiEdit)` secret 검사 (신규)

기존 `hooks/session-start` (Bash) 파일은 마이그레이션 후 삭제.

### `hooks/hooks.json` 확장

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js\"", "async": false }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/pre-bash.js\"", "async": false }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/post-edit.js\"", "async": false }
        ]
      }
    ]
  }
}
```

각 `.js` 파일은 shebang `#!/usr/bin/env node` + `chmod +x` 를 둬서 직접 실행 가능하게 한다 (ECC 패턴과 동일).

## `hooks/session-start.js` — 기존 SessionStart 마이그레이션

기존 Bash 동작을 1:1 보존:

```
1. SKILL.md 파일 읽기 (fs.readFileSync, plugin root 기준 상대경로)
2. session_context 문자열 조립 (현재 hooks/session-start의 <EXTREMELY_IMPORTANT> 블록 그대로)
3. JSON.stringify로 escape 자동 처리
4. process.stdout.write로 hookSpecificOutput JSON 출력 + exit 0
```

Bash 버전의 `escape_for_json` 수동 escape는 `JSON.stringify` 한 줄로 대체되어 코드 단순화 + 모서리 케이스 안전성 향상.

## `hooks/pre-bash.js` — Bash 게이트 동작

stdin으로 들어오는 hook payload(JSON)를 `JSON.parse`로 파싱해 `tool_input.command` 추출.

```
1. process.env.HARNESS_FLOW_HOOKS_OFF === '1' 이면 → exit 0
2. 위험 패턴 매칭 → exit 2 + console.error("차단됨: <사유>")
   - --no-verify
   - rm -rf 가 root/home/cwd 대상 (/, ~, $HOME, .)
   - curl|wget|fetch ... | (bash|sh|zsh|...) 원격 실행
3. git commit 명령 패턴이면 commit gate 실행:
   a. `make -q fmt` 로 target 존재 확인 (child_process.spawnSync)
      - 있으면 `make fmt` → 변경 발생(`git diff --quiet` 실패) 시 exit 2 + "fmt가 변경 적용. 재stage 후 commit"
      - target 없으면 graceful skip
   b. `make -q lint` 로 target 존재 확인
      - 있으면 `make lint` → 실패 시 exit 2 + lint stderr 그대로 노출
      - target 없으면 graceful skip
   c. secret 정규식 매트릭스 (`git diff --cached` 대상으로 staged 변경분만 검사)
      → 발견 시 exit 2 + "secret 발견: <패턴> at <file>:<line>"
   d. 모두 통과 → exit 0
4. 그 외 → exit 0
```

## `hooks/post-edit.js` — Edit/Write 후 Secret 즉시 차단

stdin payload에서 `tool_input.file_path` 추출.

```
1. process.env.HARNESS_FLOW_HOOKS_OFF === '1' → exit 0
2. fs.existsSync로 파일 존재 체크 (없으면 graceful exit 0)
3. 스캔 제외 경로면 exit 0 (.env.example, *.test.*, fixtures/**)
4. secret 정규식 매트릭스 실행 (파일 전체 텍스트)
5. 발견 시 → exit 2 + console.error("secret 패턴 발견: <name> at line N. 즉시 revert 또는 환경변수로 분리하라")
6. 통과 → exit 0
```

일반 lint/fmt는 PostToolUse에서 안 돌림. 매 Edit마다 `make lint` 전체 호출은 비용이 크고, commit gate에서 일괄 받기로 결정.

## Secret 정규식 매트릭스 (초안)

JavaScript 객체 배열로 표현 (단일 진실 원천):

```js
const SECRET_PATTERNS = [
  { name: 'AWS Access Key',    re: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub PAT',        re: /gh[ps]_[A-Za-z0-9]{36,}/ },
  { name: 'Private Key Header', re: /-----BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'Generic password',  re: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i },
  { name: 'Generic API key',   re: /(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i },
];
```

스캔 제외 glob: `.env.example`, `*.test.*`, `**/fixtures/**` (false positive 감소).

## 위험 Bash 패턴 (초안)

```js
const DANGEROUS_PATTERNS = [
  { name: 'no-verify',     re: /\B--no-verify\b/ },
  { name: 'rm root/home/cwd',
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\b|--recursive\b).*(\s\/\s*$|\s~\s*$|\$HOME\b|\s\.\s*$)/ },
  { name: 'pipe to shell', re: /\b(curl|wget|fetch)\b[^|]*\|\s*(sudo\s+)?(bash|sh|zsh|fish|dash)\b/ },
];
```

실제 구현 시 단위 테스트로 false positive/negative 검증 + 정밀화.

## 비기능 요구사항

- 모든 hook script는 동일 스타일: shebang `#!/usr/bin/env node`, `chmod +x` 적용, top-level `'use strict'` (선택). 외부 npm 의존 없음(`fs`, `child_process`, 정규식 등 Node.js built-in만 사용).
- 운용 범위는 macOS + Claude Code 전용. 별도 OS 분기 코드는 두지 않는다. 멀티 OS 지원이 필요해지면 별도 spec.
- fail-open 원칙: hook 자체 오류(`JSON.parse` 실패, child process 오류 등)는 try/catch로 감싸 `console.error`만 하고 `process.exit(0)`. 절대 세션을 막지 않는다.
- 의존: Node.js 18+ (macOS 기본 dev 환경에 사실상 항상 존재). `make`는 commit gate 케이스에서만 호출하며 미설치 시 graceful skip.

## 변경 대상 파일

- `hooks/hooks.json` — 모든 command 경로 `.js` 로 변경 + PreToolUse/PostToolUse 항목 추가
- `hooks/session-start.js` — 신규 (기존 Bash 동작 마이그레이션)
- `hooks/session-start` — 삭제 (Bash 버전)
- `hooks/pre-bash.js` — 신규
- `hooks/post-edit.js` — 신규
- `CLAUDE.md` — 신규 hook 두 개 + disable 환경변수 + Makefile 위임 정책 + Node.js 의존 명시

## 검증 방법

1. **단위**: stdin 입력 mock으로 직접 실행
   ```bash
   echo '{"tool_name":"Bash","tool_input":{"command":"git commit --no-verify"}}' \
     | node hooks/pre-bash.js
   # exit 2 + stderr "no-verify 차단" 메시지 기대
   ```
2. **session-start 회귀**: 마이그레이션 후 동일한 `additionalContext` JSON이 출력되는지 직접 비교
   ```bash
   CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start.js | jq .hookSpecificOutput.additionalContext
   ```
3. **통합 (dogfooding)**: 본 repo에서 hook 활성. Makefile 없으니 fmt/lint silent skip 확인. 의도적 secret(`AKIA0000000000000001`) fixture로 PostToolUse 발화 확인.
4. **End-to-end**: Makefile 보유 다른 프로젝트에 플러그인 설치 후 LLM이 `git commit --no-verify`, `rm -rf ~`, secret commit 시도 시 차단 확인.
5. **disable 동작**: `HARNESS_FLOW_HOOKS_OFF=1 node hooks/pre-bash.js <<< '...위험 명령...'` → exit 0.

## 후속 작업 (out of scope, 별도 spec)

- `subagent-driven-development` skill markdown에 "code-quality-reviewer가 PostToolUse hook 메시지를 deliverable로 검토하고, lint/secret 실패가 있으면 implementer 재dispatch" 규칙 추가. 자동화 워크플로의 강제 fix 루프를 markdown 레이어에서 표현하기 위함.
