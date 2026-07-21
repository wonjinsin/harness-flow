# Root Cause Tracing

Bugs surface deep in the call stack (git init in the wrong dir, file written to the
wrong path). The instinct is to fix where the error appears — that's the symptom.
Trace backward to the original trigger and fix there.

**Use when:** the error fires deep in execution, the stack chain is long, or it's
unclear where the invalid value came from.

## Trace backward

1. **Symptom** — `git init failed in ~/project/packages/core`.
2. **Immediate cause** — `execFileAsync('git', ['init'], { cwd: projectDir })`.
3. **Who called it?** `createSessionWorktree ← Session.initializeWorkspace ←
   Session.create ← test`.
4. **What value flowed?** `projectDir = ''` — empty `cwd` resolves to `process.cwd()`,
   the source tree.
5. **Original trigger** — `setupCoreTest()` returned `{ tempDir: '' }`, accessed
   before `beforeEach` populated it.

Root cause: a value read before initialization. Fix at the source (make `tempDir` a
getter that throws if accessed early), not at the `git init` call.

## When you can't trace by eye

Instrument before the dangerous operation and capture the call chain:

```typescript
async function gitInit(directory: string) {
  console.error('DEBUG git init:', { directory, cwd: process.cwd(), stack: new Error().stack });
  await execFileAsync('git', ['init'], { cwd: directory });
}
```

- Use `console.error()` in tests — a logger may be suppressed.
- Log *before* the operation, not after it fails; include cwd + env.
- Run and grep: `npm test 2>&1 | grep 'DEBUG git init'` (or `pytest -s`, `go test -v`).
- Read the stack for the test file and line that triggers it.

Fixing at the source removes the bug; adding validation at each layer it passed
through (see `defense-in-depth.md`) makes it impossible to recur.
