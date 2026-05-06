# Hook System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use harness-flow:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `PreToolUse(Bash)` and `PostToolUse(Edit/Write)` hooks (`pre-bash.js`, `post-edit.js`) and migrate the existing `session-start` (Bash) to `session-start.js`. Hooks block dangerous Bash, run `make fmt`/`make lint`/secret regex scan at git-commit time, and immediately block secrets after Edit/Write. Disable via `HARNESS_FLOW_HOOKS_OFF=1`.

**Architecture:** Three Node.js entry scripts under `hooks/` with pure logic split into `hooks/lib/`. Pure logic is unit-tested with `node:test` (built-in). Entry scripts get smoke tests via `spawnSync`. Zero npm dependencies; only Node.js built-ins (`fs`, `path`, `child_process`).

**Tech Stack:** Node.js 18+ (`#!/usr/bin/env node`, CommonJS), `node:test`, `node:assert/strict`. Hook payloads parsed with native `JSON.parse`. macOS + Claude Code only.

---

## File Structure

**Create (worktree-relative):**
- `hooks/session-start.js` — entry: SessionStart, reads SKILL.md and emits `additionalContext`
- `hooks/pre-bash.js` — entry: PreToolUse(Bash), runs gates
- `hooks/post-edit.js` — entry: PostToolUse(Edit/Write/MultiEdit), runs secret scan
- `hooks/lib/secret-patterns.js` — SECRET_PATTERNS array + `scanText()`
- `hooks/lib/bash-patterns.js` — DANGEROUS_PATTERNS array + `matchDangerous()`
- `hooks/lib/payload.js` — `readStdinSync()`, `parsePayload()`, `getCommand()`, `getFilePath()`
- `hooks/lib/git-commit-detector.js` — `isGitCommit()`
- `hooks/lib/make-runner.js` — `makeTargetExists()`, `runMake()`
- `tests/hooks/secret-patterns.test.js`
- `tests/hooks/bash-patterns.test.js`
- `tests/hooks/payload.test.js`
- `tests/hooks/git-commit-detector.test.js`
- `tests/hooks/make-runner.test.js`
- `tests/hooks/fixtures/Makefile` — for make-runner tests
- `tests/hooks/smoke/session-start.smoke.test.js`
- `tests/hooks/smoke/post-edit.smoke.test.js`
- `tests/hooks/smoke/pre-bash.smoke.test.js`

**Modify:**
- `hooks/hooks.json` — register `pre-bash.js`, `post-edit.js`; switch `SessionStart` command to `session-start.js`
- `CLAUDE.md` — document new hooks, `HARNESS_FLOW_HOOKS_OFF`, Makefile delegation, Node.js dependency

**Delete:**
- `hooks/session-start` (Bash, after migration verified)

---

## Task 1: Secret-pattern library

**Files:**
- Create: `hooks/lib/secret-patterns.js`
- Test: `tests/hooks/secret-patterns.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/hooks/secret-patterns.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SECRET_PATTERNS, scanText } = require('../../hooks/lib/secret-patterns.js');

test('SECRET_PATTERNS is a non-empty array of {name, re}', () => {
  assert.ok(Array.isArray(SECRET_PATTERNS));
  assert.ok(SECRET_PATTERNS.length >= 5);
  for (const p of SECRET_PATTERNS) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.re instanceof RegExp);
  }
});

test('detects AWS Access Key', () => {
  const matches = scanText('aws_key = "AKIA0123456789ABCDEF"');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'AWS Access Key');
  assert.equal(matches[0].line, 1);
});

test('detects GitHub PAT', () => {
  const matches = scanText('token=ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'GitHub PAT');
});

test('detects Private Key Header', () => {
  const matches = scanText('-----BEGIN RSA PRIVATE KEY-----');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'Private Key Header');
});

test('detects generic password assignment', () => {
  const matches = scanText('password = "hunter2hunter"');
  assert.ok(matches.find((m) => m.name === 'Generic password'));
});

test('detects generic API key assignment', () => {
  const matches = scanText('api_key: "abcdef0123456789ABCDEF"');
  assert.ok(matches.find((m) => m.name === 'Generic API key'));
});

test('returns empty array on clean text', () => {
  const matches = scanText('// just a comment\nconst x = 1;');
  assert.deepEqual(matches, []);
});

test('reports correct line numbers', () => {
  const text = 'line 1\nline 2\nAKIA0123456789ABCDEF\nline 4';
  const matches = scanText(text);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].line, 3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks/secret-patterns.test.js`
Expected: FAIL with `Cannot find module '../../hooks/lib/secret-patterns.js'`.

- [ ] **Step 3: Write the implementation**

Create `hooks/lib/secret-patterns.js`:

```js
'use strict';

const SECRET_PATTERNS = [
  { name: 'AWS Access Key',    re: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub PAT',        re: /gh[ps]_[A-Za-z0-9]{36,}/ },
  { name: 'Private Key Header', re: /-----BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'Generic password',  re: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i },
  { name: 'Generic API key',   re: /(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i },
];

function scanText(text) {
  const lines = String(text).split('\n');
  const matches = [];
  for (const { name, re } of SECRET_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        matches.push({ name, line: i + 1 });
      }
    }
  }
  return matches;
}

module.exports = { SECRET_PATTERNS, scanText };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks/secret-patterns.test.js`
Expected: all tests pass (8/8).

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/secret-patterns.js tests/hooks/secret-patterns.test.js
git commit -m "feat(hooks): add secret-patterns library with scanText"
```

---

## Task 2: Dangerous Bash pattern library

**Files:**
- Create: `hooks/lib/bash-patterns.js`
- Test: `tests/hooks/bash-patterns.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/hooks/bash-patterns.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DANGEROUS_PATTERNS, matchDangerous } = require('../../hooks/lib/bash-patterns.js');

test('DANGEROUS_PATTERNS is a non-empty array of {name, re}', () => {
  assert.ok(Array.isArray(DANGEROUS_PATTERNS));
  assert.ok(DANGEROUS_PATTERNS.length >= 3);
  for (const p of DANGEROUS_PATTERNS) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.re instanceof RegExp);
  }
});

test('catches git commit --no-verify', () => {
  const m = matchDangerous('git commit --no-verify -m "x"');
  assert.ok(m);
  assert.equal(m.name, 'no-verify');
});

test('catches git push --no-verify', () => {
  assert.ok(matchDangerous('git push --no-verify origin main'));
});

test('catches rm -rf /', () => {
  const m = matchDangerous('rm -rf /');
  assert.ok(m);
  assert.equal(m.name, 'rm root/home/cwd');
});

test('catches rm -rf ~', () => {
  assert.ok(matchDangerous('rm -rf ~'));
});

test('catches rm -rf $HOME', () => {
  assert.ok(matchDangerous('rm -rf $HOME'));
});

test('catches rm -rf .', () => {
  assert.ok(matchDangerous('rm -rf .'));
});

test('catches curl | sh', () => {
  const m = matchDangerous('curl https://example.com/install.sh | sh');
  assert.ok(m);
  assert.equal(m.name, 'pipe to shell');
});

test('catches wget | bash', () => {
  assert.ok(matchDangerous('wget -qO- https://example.com | bash'));
});

test('catches curl | sudo bash', () => {
  assert.ok(matchDangerous('curl https://example.com | sudo bash'));
});

test('passes innocuous rm', () => {
  assert.equal(matchDangerous('rm temp.txt'), null);
});

test('passes rm -rf inside specific subdirectory', () => {
  assert.equal(matchDangerous('rm -rf node_modules'), null);
});

test('passes plain curl', () => {
  assert.equal(matchDangerous('curl https://example.com -o file.txt'), null);
});

test('passes plain bash command', () => {
  assert.equal(matchDangerous('bash ./scripts/build.sh'), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks/bash-patterns.test.js`
Expected: FAIL with `Cannot find module '../../hooks/lib/bash-patterns.js'`.

- [ ] **Step 3: Write the implementation**

Create `hooks/lib/bash-patterns.js`:

```js
'use strict';

const DANGEROUS_PATTERNS = [
  { name: 'no-verify', re: /\B--no-verify\b/ },
  {
    name: 'rm root/home/cwd',
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\b|--recursive\b)[^|;&]*?(\s\/\s*$|\s~\s*$|\s\$HOME\b\s*$|\s\.\s*$)/,
  },
  {
    name: 'pipe to shell',
    re: /\b(curl|wget|fetch)\b[^|]*\|\s*(sudo\s+)?(bash|sh|zsh|fish|dash)\b/,
  },
];

function matchDangerous(cmd) {
  const text = String(cmd || '');
  for (const { name, re } of DANGEROUS_PATTERNS) {
    if (re.test(text)) return { name };
  }
  return null;
}

module.exports = { DANGEROUS_PATTERNS, matchDangerous };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks/bash-patterns.test.js`
Expected: all tests pass (14/14).

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/bash-patterns.js tests/hooks/bash-patterns.test.js
git commit -m "feat(hooks): add bash-patterns library with matchDangerous"
```

---

## Task 3: Payload helper

**Files:**
- Create: `hooks/lib/payload.js`
- Test: `tests/hooks/payload.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/hooks/payload.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePayload, getCommand, getFilePath } = require('../../hooks/lib/payload.js');

test('parsePayload parses valid JSON', () => {
  const p = parsePayload('{"tool_name":"Bash","tool_input":{"command":"ls"}}');
  assert.equal(p.tool_name, 'Bash');
  assert.equal(p.tool_input.command, 'ls');
});

test('parsePayload throws on invalid JSON', () => {
  assert.throws(() => parsePayload('not json'));
});

test('getCommand returns command string', () => {
  const p = { tool_input: { command: 'git status' } };
  assert.equal(getCommand(p), 'git status');
});

test('getCommand returns empty string when missing', () => {
  assert.equal(getCommand({}), '');
  assert.equal(getCommand({ tool_input: {} }), '');
  assert.equal(getCommand(null), '');
});

test('getFilePath returns path', () => {
  const p = { tool_input: { file_path: '/abs/path/to/file.ts' } };
  assert.equal(getFilePath(p), '/abs/path/to/file.ts');
});

test('getFilePath returns empty when missing', () => {
  assert.equal(getFilePath({}), '');
  assert.equal(getFilePath(null), '');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks/payload.test.js`
Expected: FAIL with `Cannot find module '../../hooks/lib/payload.js'`.

- [ ] **Step 3: Write the implementation**

Create `hooks/lib/payload.js`:

```js
'use strict';
const fs = require('node:fs');

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (err) {
    return '';
  }
}

function parsePayload(text) {
  return JSON.parse(text);
}

function getCommand(payload) {
  return (payload && payload.tool_input && payload.tool_input.command) || '';
}

function getFilePath(payload) {
  return (payload && payload.tool_input && payload.tool_input.file_path) || '';
}

module.exports = { readStdinSync, parsePayload, getCommand, getFilePath };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks/payload.test.js`
Expected: all tests pass (6/6).

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/payload.js tests/hooks/payload.test.js
git commit -m "feat(hooks): add payload helper for stdin JSON parsing"
```

---

## Task 4: Git-commit detector

**Files:**
- Create: `hooks/lib/git-commit-detector.js`
- Test: `tests/hooks/git-commit-detector.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/hooks/git-commit-detector.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isGitCommit } = require('../../hooks/lib/git-commit-detector.js');

test('matches plain git commit', () => {
  assert.equal(isGitCommit('git commit'), true);
});

test('matches git commit -m "msg"', () => {
  assert.equal(isGitCommit('git commit -m "feat: add x"'), true);
});

test('matches git commit --amend', () => {
  assert.equal(isGitCommit('git commit --amend'), true);
});

test('matches git commit with leading spaces', () => {
  assert.equal(isGitCommit('  git commit -m "x"'), true);
});

test('rejects git status', () => {
  assert.equal(isGitCommit('git status'), false);
});

test('rejects git push', () => {
  assert.equal(isGitCommit('git push'), false);
});

test('rejects echo containing words', () => {
  assert.equal(isGitCommit('echo "git commit"'), false);
});

test('rejects empty string', () => {
  assert.equal(isGitCommit(''), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks/git-commit-detector.test.js`
Expected: FAIL with `Cannot find module '../../hooks/lib/git-commit-detector.js'`.

- [ ] **Step 3: Write the implementation**

Create `hooks/lib/git-commit-detector.js`:

```js
'use strict';

function isGitCommit(cmd) {
  const text = String(cmd || '').trimStart();
  // Match: git commit (with possible flags after) — top-level command only.
  return /^git\s+commit(\s|$)/.test(text);
}

module.exports = { isGitCommit };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks/git-commit-detector.test.js`
Expected: all tests pass (8/8).

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/git-commit-detector.js tests/hooks/git-commit-detector.test.js
git commit -m "feat(hooks): add git-commit-detector"
```

---

## Task 5: Make runner

**Files:**
- Create: `hooks/lib/make-runner.js`
- Create: `tests/hooks/fixtures/Makefile`
- Test: `tests/hooks/make-runner.test.js`

- [ ] **Step 1: Create the test Makefile fixture**

Create `tests/hooks/fixtures/Makefile`:

```makefile
.PHONY: ok-target fail-target noop

ok-target:
	@echo "ok"

fail-target:
	@echo "boom" >&2
	@exit 1

noop:
	@true
```

- [ ] **Step 2: Write failing tests**

Create `tests/hooks/make-runner.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeTargetExists, runMake } = require('../../hooks/lib/make-runner.js');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

test('makeTargetExists returns true for existing target', () => {
  assert.equal(makeTargetExists('ok-target', FIXTURE_DIR), true);
});

test('makeTargetExists returns false for missing target', () => {
  assert.equal(makeTargetExists('does-not-exist', FIXTURE_DIR), false);
});

test('makeTargetExists returns false when Makefile is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-no-make-'));
  try {
    assert.equal(makeTargetExists('anything', dir), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runMake returns ok=true for successful target', () => {
  const r = runMake('ok-target', FIXTURE_DIR);
  assert.equal(r.ok, true);
});

test('runMake returns ok=false for failing target', () => {
  const r = runMake('fail-target', FIXTURE_DIR);
  assert.equal(r.ok, false);
  assert.match(r.stderr + r.stdout, /boom/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/hooks/make-runner.test.js`
Expected: FAIL with `Cannot find module '../../hooks/lib/make-runner.js'`.

- [ ] **Step 4: Write the implementation**

Create `hooks/lib/make-runner.js`:

```js
'use strict';
const { spawnSync } = require('node:child_process');

function makeTargetExists(target, cwd) {
  const r = spawnSync('make', ['-n', target], {
    cwd: cwd || process.cwd(),
    encoding: 'utf-8',
  });
  if (r.status === 0) return true;
  // Make prints "No rule to make target" when target missing or Makefile absent.
  if (r.stderr && /No rule to make target|No targets|Makefile/i.test(r.stderr)) {
    return false;
  }
  return false;
}

function runMake(target, cwd) {
  const r = spawnSync('make', [target], {
    cwd: cwd || process.cwd(),
    encoding: 'utf-8',
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

module.exports = { makeTargetExists, runMake };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/hooks/make-runner.test.js`
Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add hooks/lib/make-runner.js tests/hooks/fixtures/Makefile tests/hooks/make-runner.test.js
git commit -m "feat(hooks): add make-runner library"
```

---

## Task 6: Migrate session-start to Node.js

**Files:**
- Create: `hooks/session-start.js`
- Create: `tests/hooks/smoke/session-start.smoke.test.js`

(Old `hooks/session-start` Bash file stays in place until Task 10 cuts over.)

- [ ] **Step 1: Write failing smoke test**

Create `tests/hooks/smoke/session-start.smoke.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'session-start.js');

test('session-start.js emits valid hookSpecificOutput JSON', () => {
  const result = spawnSync('node', [SCRIPT], {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    encoding: 'utf-8',
  });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(parsed.hookSpecificOutput.additionalContext, /You have harness-flow/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<EXTREMELY_IMPORTANT>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /using-harness-flow/);
});

test('session-start.js emits fallback when SKILL.md missing', () => {
  const result = spawnSync('node', [SCRIPT], {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: '/nonexistent/path/xyz' },
    encoding: 'utf-8',
  });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.match(parsed.hookSpecificOutput.additionalContext, /Error reading using-harness-flow skill/);
});
```

- [ ] **Step 2: Run smoke test to verify it fails**

Run: `node --test tests/hooks/smoke/session-start.smoke.test.js`
Expected: FAIL — script does not yet exist.

- [ ] **Step 3: Write the implementation**

Create `hooks/session-start.js`:

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const skillFile = path.join(pluginRoot, 'skills', 'using-harness-flow', 'SKILL.md');

let skillContent;
try {
  skillContent = fs.readFileSync(skillFile, 'utf-8');
} catch (err) {
  skillContent = 'Error reading using-harness-flow skill';
}

const sessionContext =
  '<EXTREMELY_IMPORTANT>\n' +
  'You have harness-flow.\n\n' +
  "**Below is the full content of your 'harness-flow:using-harness-flow' skill — your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n" +
  skillContent +
  '\n</EXTREMELY_IMPORTANT>';

const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: sessionContext,
  },
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exit(0);
```

- [ ] **Step 4: Make script executable**

Run: `chmod +x hooks/session-start.js`

- [ ] **Step 5: Run smoke test to verify it passes**

Run: `node --test tests/hooks/smoke/session-start.smoke.test.js`
Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add hooks/session-start.js tests/hooks/smoke/session-start.smoke.test.js
git commit -m "feat(hooks): migrate session-start to Node.js"
```

---

## Task 7: Implement post-edit.js

**Files:**
- Create: `hooks/post-edit.js`
- Create: `tests/hooks/smoke/post-edit.smoke.test.js`

- [ ] **Step 1: Write failing smoke test**

Create `tests/hooks/smoke/post-edit.smoke.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'post-edit.js');

function tmpFileWith(content, suffix = '.txt') {
  const f = path.join(os.tmpdir(), `post-edit-smoke-${Date.now()}-${Math.random()}${suffix}`);
  fs.writeFileSync(f, content, 'utf-8');
  return f;
}

function runWith(payload, env = {}) {
  return spawnSync('node', [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

test('exits 2 when secret detected', () => {
  const f = tmpFileWith('aws_key = "AKIA0123456789ABCDEF"');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /AWS Access Key/);
});

test('exits 0 on clean file', () => {
  const f = tmpFileWith('// nothing to see here\nconst x = 1;');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  assert.equal(r.status, 0);
});

test('exits 0 when HARNESS_FLOW_HOOKS_OFF=1 even with secret', () => {
  const f = tmpFileWith('AKIA0123456789ABCDEF');
  const r = runWith(
    { tool_name: 'Edit', tool_input: { file_path: f } },
    { HARNESS_FLOW_HOOKS_OFF: '1' },
  );
  fs.unlinkSync(f);
  assert.equal(r.status, 0);
});

test('exits 0 when file does not exist (graceful)', () => {
  const r = runWith({
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/definitely-does-not-exist-xyz' },
  });
  assert.equal(r.status, 0);
});

test('exits 0 for skip-glob path even with secret', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-skip-'));
  const f = path.join(dir, '.env.example');
  fs.writeFileSync(f, 'AKIA0123456789ABCDEF', 'utf-8');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  fs.rmdirSync(dir);
  assert.equal(r.status, 0);
});

test('exits 0 on bad payload (fail-open)', () => {
  const r = spawnSync('node', [SCRIPT], { input: 'not json', encoding: 'utf-8' });
  assert.equal(r.status, 0);
});
```

- [ ] **Step 2: Run smoke test to verify it fails**

Run: `node --test tests/hooks/smoke/post-edit.smoke.test.js`
Expected: FAIL — script does not yet exist.

- [ ] **Step 3: Write the implementation**

Create `hooks/post-edit.js`:

```js
#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { readStdinSync, parsePayload, getFilePath } = require('./lib/payload.js');
const { scanText } = require('./lib/secret-patterns.js');

if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') {
  process.exit(0);
}

let payload;
try {
  payload = parsePayload(readStdinSync());
} catch (err) {
  console.error(`post-edit: payload parse error: ${err.message}`);
  process.exit(0);
}

const filePath = getFilePath(payload);
if (!filePath || !fs.existsSync(filePath)) {
  process.exit(0);
}

const SKIP_PATTERNS = [
  /\.env\.example$/,
  /\.test\./,
  /\/fixtures\//,
];
if (SKIP_PATTERNS.some((re) => re.test(filePath))) {
  process.exit(0);
}

let content;
try {
  content = fs.readFileSync(filePath, 'utf-8');
} catch (err) {
  process.exit(0);
}

const matches = scanText(content);
if (matches.length > 0) {
  for (const m of matches) {
    console.error(
      `secret 패턴 발견: ${m.name} at ${filePath}:${m.line}. 즉시 revert 또는 환경변수로 분리하라`,
    );
  }
  process.exit(2);
}
process.exit(0);
```

- [ ] **Step 4: Make script executable**

Run: `chmod +x hooks/post-edit.js`

- [ ] **Step 5: Run smoke test to verify it passes**

Run: `node --test tests/hooks/smoke/post-edit.smoke.test.js`
Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add hooks/post-edit.js tests/hooks/smoke/post-edit.smoke.test.js
git commit -m "feat(hooks): add post-edit secret-scan hook"
```

---

## Task 8: Implement pre-bash.js — kill switch + dangerous patterns

**Files:**
- Create: `hooks/pre-bash.js`
- Create: `tests/hooks/smoke/pre-bash.smoke.test.js`

This task delivers the dangerous-pattern path. Task 9 extends with the commit gate.

- [ ] **Step 1: Write failing smoke test**

Create `tests/hooks/smoke/pre-bash.smoke.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'pre-bash.js');

function runWith(cmd, env = {}) {
  return spawnSync('node', [SCRIPT], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

test('blocks --no-verify', () => {
  const r = runWith('git commit --no-verify -m "x"');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no-verify/);
});

test('blocks rm -rf /', () => {
  const r = runWith('rm -rf /');
  assert.equal(r.status, 2);
});

test('blocks curl | sh', () => {
  const r = runWith('curl https://example.com/x.sh | sh');
  assert.equal(r.status, 2);
});

test('passes innocuous ls', () => {
  const r = runWith('ls -la');
  assert.equal(r.status, 0);
});

test('kill switch overrides dangerous pattern', () => {
  const r = runWith('rm -rf /', { HARNESS_FLOW_HOOKS_OFF: '1' });
  assert.equal(r.status, 0);
});

test('exits 0 on bad payload (fail-open)', () => {
  const r = spawnSync('node', [SCRIPT], { input: 'not json', encoding: 'utf-8' });
  assert.equal(r.status, 0);
});
```

- [ ] **Step 2: Run smoke test to verify it fails**

Run: `node --test tests/hooks/smoke/pre-bash.smoke.test.js`
Expected: FAIL — script does not yet exist.

- [ ] **Step 3: Write the implementation (dangerous-pattern only)**

Create `hooks/pre-bash.js`:

```js
#!/usr/bin/env node
'use strict';
const { readStdinSync, parsePayload, getCommand } = require('./lib/payload.js');
const { matchDangerous } = require('./lib/bash-patterns.js');

if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') {
  process.exit(0);
}

let payload;
try {
  payload = parsePayload(readStdinSync());
} catch (err) {
  console.error(`pre-bash: payload parse error: ${err.message}`);
  process.exit(0);
}

const cmd = getCommand(payload);

const dangerous = matchDangerous(cmd);
if (dangerous) {
  console.error(`차단됨: ${dangerous.name} 패턴 감지. 명령: ${cmd}`);
  process.exit(2);
}

// Commit gate added in Task 9.
process.exit(0);
```

- [ ] **Step 4: Make script executable**

Run: `chmod +x hooks/pre-bash.js`

- [ ] **Step 5: Run smoke test to verify it passes**

Run: `node --test tests/hooks/smoke/pre-bash.smoke.test.js`
Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add hooks/pre-bash.js tests/hooks/smoke/pre-bash.smoke.test.js
git commit -m "feat(hooks): add pre-bash hook with dangerous-pattern guard"
```

---

## Task 9: Extend pre-bash.js with commit gate (fmt/lint/secret)

**Files:**
- Modify: `hooks/pre-bash.js`
- Modify: `tests/hooks/smoke/pre-bash.smoke.test.js`

The commit gate runs `make fmt`, `make lint`, and a secret scan on `git diff --cached` when the command is a git commit. To make the smoke test deterministic, we run pre-bash inside a temporary git repo with a controllable Makefile and staged content.

- [ ] **Step 1: Append failing tests for commit gate**

Append to `tests/hooks/smoke/pre-bash.smoke.test.js` (after the existing tests):

```js
const fs = require('node:fs');
const os = require('node:os');

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-bash-repo-'));
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  return dir;
}

function runInRepo(repo, cmd, env = {}) {
  return spawnSync('node', [SCRIPT], {
    cwd: repo,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

test('git commit passes when no Makefile and no staged changes', () => {
  const repo = makeTempRepo();
  const r = runInRepo(repo, 'git commit -m "x"');
  fs.rmSync(repo, { recursive: true, force: true });
  assert.equal(r.status, 0);
});

test('git commit blocked when staged file contains secret', () => {
  const repo = makeTempRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'AKIA0123456789ABCDEF\n');
  spawnSync('git', ['add', 'a.txt'], { cwd: repo });
  const r = runInRepo(repo, 'git commit -m "x"');
  fs.rmSync(repo, { recursive: true, force: true });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /AWS Access Key/);
});

test('git commit blocked when make lint fails', () => {
  const repo = makeTempRepo();
  fs.writeFileSync(
    path.join(repo, 'Makefile'),
    '.PHONY: lint\nlint:\n\t@echo lint-failed >&2\n\t@exit 1\n',
  );
  spawnSync('git', ['add', 'Makefile'], { cwd: repo });
  const r = runInRepo(repo, 'git commit -m "x"');
  fs.rmSync(repo, { recursive: true, force: true });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /lint/);
});

test('git commit blocked when make fmt modifies tree', () => {
  const repo = makeTempRepo();
  // Track a file then introduce an unstaged modification via make fmt.
  fs.writeFileSync(path.join(repo, 'src.txt'), 'before\n');
  spawnSync('git', ['add', 'src.txt'], { cwd: repo });
  spawnSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
  // make fmt rewrites src.txt to "after".
  fs.writeFileSync(
    path.join(repo, 'Makefile'),
    '.PHONY: fmt\nfmt:\n\t@echo after > src.txt\n',
  );
  spawnSync('git', ['add', 'Makefile'], { cwd: repo });
  const r = runInRepo(repo, 'git commit -m "next"');
  fs.rmSync(repo, { recursive: true, force: true });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /fmt/);
});

test('git commit passes when make fmt and lint succeed and no secrets', () => {
  const repo = makeTempRepo();
  fs.writeFileSync(
    path.join(repo, 'Makefile'),
    '.PHONY: fmt lint\nfmt:\n\t@true\nlint:\n\t@true\n',
  );
  fs.writeFileSync(path.join(repo, 'a.txt'), 'clean content\n');
  spawnSync('git', ['add', 'Makefile', 'a.txt'], { cwd: repo });
  const r = runInRepo(repo, 'git commit -m "x"');
  fs.rmSync(repo, { recursive: true, force: true });
  assert.equal(r.status, 0);
});
```

- [ ] **Step 2: Run smoke tests to verify commit-gate tests fail**

Run: `node --test tests/hooks/smoke/pre-bash.smoke.test.js`
Expected: 5 new tests FAIL (gate not yet implemented). Earlier 6 tests still pass.

- [ ] **Step 3: Extend `hooks/pre-bash.js` with the commit gate**

Replace `hooks/pre-bash.js` with the full implementation:

```js
#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const { readStdinSync, parsePayload, getCommand } = require('./lib/payload.js');
const { matchDangerous } = require('./lib/bash-patterns.js');
const { scanText } = require('./lib/secret-patterns.js');
const { isGitCommit } = require('./lib/git-commit-detector.js');
const { makeTargetExists, runMake } = require('./lib/make-runner.js');

if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') {
  process.exit(0);
}

let payload;
try {
  payload = parsePayload(readStdinSync());
} catch (err) {
  console.error(`pre-bash: payload parse error: ${err.message}`);
  process.exit(0);
}

const cmd = getCommand(payload);

// 1. Dangerous-pattern guard.
const dangerous = matchDangerous(cmd);
if (dangerous) {
  console.error(`차단됨: ${dangerous.name} 패턴 감지. 명령: ${cmd}`);
  process.exit(2);
}

// 2. git commit gate.
if (isGitCommit(cmd)) {
  // a. make fmt — block if it produces working-tree changes.
  if (makeTargetExists('fmt')) {
    const fmtRes = runMake('fmt');
    if (!fmtRes.ok) {
      console.error('차단됨: make fmt 실패');
      console.error(fmtRes.stderr || fmtRes.stdout);
      process.exit(2);
    }
    const diffCheck = spawnSync('git', ['diff', '--quiet'], { encoding: 'utf-8' });
    if (diffCheck.status !== 0) {
      console.error(
        '차단됨: make fmt가 파일을 변경했습니다. 변경분을 git add 한 뒤 다시 commit 하세요.',
      );
      process.exit(2);
    }
  }

  // b. make lint.
  if (makeTargetExists('lint')) {
    const lintRes = runMake('lint');
    if (!lintRes.ok) {
      console.error('차단됨: make lint 실패');
      console.error(lintRes.stderr || lintRes.stdout);
      process.exit(2);
    }
  }

  // c. secret scan on staged diff.
  const stagedDiff = spawnSync('git', ['diff', '--cached'], { encoding: 'utf-8' });
  if (stagedDiff.status === 0 && stagedDiff.stdout) {
    const matches = scanText(stagedDiff.stdout);
    if (matches.length > 0) {
      for (const m of matches) {
        console.error(
          `차단됨: secret 발견: ${m.name} (staged diff line ${m.line}). 즉시 revert 또는 환경변수로 분리하라`,
        );
      }
      process.exit(2);
    }
  }
}

process.exit(0);
```

- [ ] **Step 4: Run smoke tests to verify they pass**

Run: `node --test tests/hooks/smoke/pre-bash.smoke.test.js`
Expected: all 11 tests pass.

- [ ] **Step 5: Run the full test suite**

Run: `node --test tests/hooks/`
Expected: all unit + smoke tests pass.

- [ ] **Step 6: Commit**

```bash
git add hooks/pre-bash.js tests/hooks/smoke/pre-bash.smoke.test.js
git commit -m "feat(hooks): extend pre-bash with commit gate (fmt/lint/secret)"
```

---

## Task 10: Wire hooks.json + delete old Bash session-start

**Files:**
- Modify: `hooks/hooks.json`
- Delete: `hooks/session-start` (Bash)

- [ ] **Step 1: Inspect current `hooks/hooks.json`**

Run: `cat hooks/hooks.json`
Expected output: registers only `SessionStart` pointing to `hooks/session-start` (Bash).

- [ ] **Step 2: Replace `hooks/hooks.json` with the extended version**

Overwrite `hooks/hooks.json` with:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js\"",
            "async": false
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/pre-bash.js\"",
            "async": false
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/post-edit.js\"",
            "async": false
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Delete the Bash session-start**

Run: `git rm hooks/session-start`
Expected: file removed and staged for deletion.

- [ ] **Step 4: Verify session-start.js still produces the same JSON shape (regression smoke)**

Run: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start.js | head -40`
Expected: prints `{ "hookSpecificOutput": { "hookEventName": "SessionStart", "additionalContext": "<EXTREMELY_IMPORTANT>...` JSON.

- [ ] **Step 5: Re-run the full test suite**

Run: `node --test tests/hooks/`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(hooks): wire pre-bash and post-edit; switch session-start to .js"
```

(`git rm` in Step 3 already staged the deletion of `hooks/session-start`, so it ships in this commit alongside the `hooks.json` change.)

---

## Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

Document the new hooks, the kill switch, the Makefile delegation contract, and the Node.js dependency.

- [ ] **Step 1: Locate the existing `## SessionStart Hook` section**

Run: `grep -n "## SessionStart Hook\|## Cross-Platform Tool Names" CLAUDE.md`
Expected: two line numbers — the start of the section to replace and the start of the next section.

- [ ] **Step 2: Replace the `## SessionStart Hook` section with a new `## Hooks` section**

Use the `Edit` tool to replace this exact existing block in `CLAUDE.md`:

```markdown
## SessionStart Hook

`hooks/session-start` (Bash, macOS · Claude Code only) reads `skills/using-harness-flow/SKILL.md` and emits a `hookSpecificOutput.additionalContext` JSON payload to inject session context. Matcher: `startup|clear|compact`. The script computes its own location from `$0`, so it works regardless of how it is invoked.

Hook registration — env var conventions:
- Plugin install → `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}`, auto-injected by Claude Code's plugin runtime.
- User settings (`~/.claude/settings.json`) → use `$HOME` (POSIX-standard; not explicitly documented for hook commands but reliable in practice).
- Project settings (`<project>/.claude/settings.json`) → use `$CLAUDE_PROJECT_DIR` (officially supported). Relative paths are not safe — hook CWD is not specified in Claude Code docs.
- Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" hooks/session-start` prints the JSON payload.
```

with this new block:

```markdown
## Hooks

`hooks/hooks.json` registers three hooks (Node.js, macOS · Claude Code only). All scripts use `#!/usr/bin/env node`, depend only on Node.js 18+ built-ins, and follow a fail-open principle (script-level errors → `console.error` + `process.exit(0)`).

### `hooks/session-start.js` — SessionStart
Reads `skills/using-harness-flow/SKILL.md` and emits a `hookSpecificOutput.additionalContext` JSON payload to inject session context. Matcher: `startup|clear|compact`. Plugin root resolved via `CLAUDE_PLUGIN_ROOT` (auto-injected by Claude Code's plugin runtime) or relative to the script location.

### `hooks/pre-bash.js` — PreToolUse(Bash)
Two responsibilities:
- **Dangerous-pattern guard** (always): blocks `--no-verify`, `rm -rf` targeting root/home/cwd, and pipe-to-shell (`curl|wget|fetch ... | (bash|sh|...)`). Exits 2 with stderr message.
- **git commit gate** (only when command matches `^git\s+commit\b`): runs `make fmt` then `make lint` then a secret regex scan on `git diff --cached`. Each step is exit 2 + stderr on failure. `make` targets that don't exist are skipped silently.

### `hooks/post-edit.js` — PostToolUse(Edit|Write|MultiEdit)
Reads the edited file and runs the secret regex matrix. Exit 2 + stderr on match. Skip globs: `.env.example`, `*.test.*`, `**/fixtures/**`. Missing/unreadable files exit 0 (graceful).

### Disable switch
Set `HARNESS_FLOW_HOOKS_OFF=1` in the environment to make all three hooks exit 0 immediately. Useful for CI or local debugging.

### Makefile delegation contract
`pre-bash.js` calls `make fmt` and `make lint` from the user project's working directory. The plugin does not ship language detection; users define those targets in their own `Makefile`. If the targets are absent, the gate skips them silently — only the secret scan and dangerous-pattern guard remain active.

### Hook registration — env var conventions
- Plugin install → `hooks/hooks.json` uses `${CLAUDE_PLUGIN_ROOT}`, auto-injected by Claude Code's plugin runtime.
- User settings (`~/.claude/settings.json`) → use `$HOME` (POSIX-standard; not explicitly documented for hook commands but reliable in practice).
- Project settings (`<project>/.claude/settings.json`) → use `$CLAUDE_PROJECT_DIR` (officially supported). Relative paths are not safe — hook CWD is not specified in Claude Code docs.
- Smoke test: `CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start.js` prints the JSON payload.
```

- [ ] **Step 3: Verify the rest of `CLAUDE.md` still references hooks correctly**

Run: `grep -n 'session-start\|pre-bash\|post-edit\|HARNESS_FLOW_HOOKS_OFF' CLAUDE.md`
Expected: matches only inside the new `## Hooks` section.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(CLAUDE): document new Node.js hook system"
```

---

## Final Verification

- [ ] **Step 1: Full test pass**

Run: `node --test tests/hooks/`
Expected: all unit + smoke tests pass (no regressions).

- [ ] **Step 2: Manual end-to-end smoke**

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git commit --no-verify"}}' \
  | node hooks/pre-bash.js
# Expected: exit 2, stderr "차단됨: no-verify ..."

HARNESS_FLOW_HOOKS_OFF=1 \
  echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}' \
  | node hooks/pre-bash.js
# Expected: exit 0 (kill switch wins)

CLAUDE_PLUGIN_ROOT="$(pwd)" node hooks/session-start.js \
  | python3 -c 'import sys, json; d = json.load(sys.stdin); print(d["hookSpecificOutput"]["hookEventName"])'
# Expected: SessionStart
```

- [ ] **Step 3: Inspect git log**

Run: `git log --oneline -15`
Expected: tasks committed in order, `feat(hooks): ...` and `docs(CLAUDE): ...` messages, no merge commits.
