# Optional Task Isolation

Read this file only when one settled task benefits from a fresh implementation
context. Isolation is optional and sequential; never dispatch tasks in parallel.

## Dispatch package

- Pass the task's settled input inline. Do not create a brief file or ledger.
- Immediately before dispatch, resolve current `HEAD` as `EXPECTED_HEAD` and pass
  it with the session checkout's top-level path, git directory, and named branch.
- Name the allowed files and interfaces. Require TDD, one commit, and comments
  that state durable technical facts rather than design history.
- Select and explicitly set the least costly model tier that fits the task. Use a
  standard tier for non-trivial integration or judgment work.

## Checkout guard

Before editing, the task agent must run:

```bash
git rev-parse --show-toplevel
git rev-parse --git-dir
git symbolic-ref -q --short HEAD
git rev-parse --verify 'HEAD^{commit}'
```

Compare every value with the supplied checkout identity, including current HEAD
against `EXPECTED_HEAD`. Any checkout identity mismatch must stop before edits or
commits and report both expected and observed values.

After the agent returns, verify its commit landed on the session branch. If a
wrong-checkout commit still occurred, report both checkout identities and the
commit SHA, then wait for user direction. Never mutate either checkout as an
automatic repair.
