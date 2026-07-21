# Condition-Based Waiting

Flaky tests guess at timing with arbitrary delays, creating races that pass on fast
machines and fail under load. Wait for the condition you actually care about, not a
guess about how long it takes.

**Use when:** tests use `setTimeout`/`sleep`, are flaky, or time out in parallel.
**Don't** when testing real timing behavior (debounce/throttle) — there, document why.

## The pattern

```typescript
// ❌ guessing at timing
await new Promise(r => setTimeout(r, 50));
// ✅ waiting for the condition
await waitFor(() => getResult() !== undefined);
```

```typescript
async function waitFor<T>(condition: () => T | undefined | false,
                          description: string, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  while (true) {
    const result = condition();
    if (result) return result;
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout: ${description} after ${timeoutMs}ms`);
    await new Promise(r => setTimeout(r, 10)); // poll every 10ms
  }
}
```

Common conditions: `waitFor(() => events.find(e => e.type === 'DONE'))`,
`waitFor(() => machine.state === 'ready')`, `waitFor(() => fs.existsSync(path))`.

**Mistakes:** polling every 1ms (wastes CPU — use 10ms); no timeout (loops forever —
always include one); caching state before the loop (call the getter *inside* it).

## When an arbitrary timeout is correct

```typescript
await waitForEvent(manager, 'TOOL_STARTED'); // first: wait for the condition
await new Promise(r => setTimeout(r, 200));   // then: 2 ticks at 100ms — known, documented
```

Wait for the triggering condition first, base the delay on known timing (not a
guess), and comment why.
