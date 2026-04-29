# Terminal Message Variants

Emit a single markdown block as the final assistant message when every task has terminated. Per-task outcomes live in TASKS.md `[Result]` blocks — the evaluator re-reads them. The terminal message carries only the top-level status and a per-task one-liner roll-up.

The standard sections are `## Status`, `## Tasks`, and (when non-`done`) `## Reason`.

**done** — every task reached DONE:

```markdown
## Status
done

## Tasks
- T1: done
- T2: done
- T3: done
```

**blocked** — one or more tasks are wrong in their description, **including** TASKS.md-level validation failures (cycles, typos in `Depends:`, empty Acceptance, empty or missing TASKS.md). Re-dispatching will not help; the task text needs upstream revision.

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

**failed** — one or more tasks exhausted the 3-attempt retry cap.

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

**error** — infrastructure or tool-layer failure (Task tool errored, filesystem denied, TDD reference missing, TASKS.md not found):

```markdown
## Status
error

## Reason
TDD reference file missing at <path>
```

(`## Tasks` may be omitted in the error case if no tasks were dispatched — only `## Status` and `## Reason` are required.)

The terminal message is consumed by the main thread to dispatch the next skill per the SKILL.md 'Required next skill' section — the main thread reads the `## Status` header line.

Never emit prose alongside the standard sections. If partial progress was made, leave TASKS.md `[Result]` blocks reflecting reality — the main thread may re-dispatch the executor and it will resume per Step 1's resume rules.
