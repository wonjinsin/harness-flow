---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code.
---

# Test-Driven Development

Write the test first, watch it fail, write the minimal code to pass, then refactor.

## The Iron Law

**No production code without a failing test first.**

If you wrote code before its test in the current TDD cycle, delete that
agent-authored code and start the cycle over.

**Ownership guard:** pre-existing user code, and any change from before the current
TDD cycle, are never yours to delete. Inspect the baseline diff first, preserve
them, and add a characterization or regression test around the existing code
instead. "Delete" means only current-cycle, agent-authored code.

**Exceptions (ask first):** throwaway prototypes, generated code, and pure
configuration files may skip TDD — confirm with the user rather than deciding it yourself.

**Behavior-preserving moves/renames:** when only file or path identity changes,
public behavior, API, and schema stay fixed, and the existing suite can verify
preservation, ask first before using a verification-only flow instead of Red →
Green. A mechanical label is not permission to skip this approval.

## The Loop

1. **RED** — write one failing test for the next small behavior.
2. **Verify RED** — run it and watch it fail *for the right reason* (the assertion,
   not a typo or missing import). A test that errors out is not red; one that passes
   immediately isn't red either — the behavior already exists or the test is mis-targeted.
3. **GREEN** — write the minimal code to pass. No speculative extras.
4. **Verify GREEN** — run it and watch it pass; run the nearby suite too.
5. **REFACTOR** — only on green: remove duplication, improve names, extract helpers.
   Keep tests green; add no behavior.
6. Repeat with the next failing test.

One behavior per cycle. Don't write several tests up front — that tests imagined
behavior.

## Good Tests

| Quality | Good | Bad |
|---|---|---|
| Minimal | one thing — "and" in the name? split it | `test('validates email and domain and whitespace')` |
| Clear | name describes the behavior | `test('test1')` |
| Shows intent | demonstrates the desired API | obscures what the code should do |

Test behavior through public interfaces, not internals — a test that breaks on a
refactor when behavior did not change is testing the wrong thing.

## Comments

Default to no explanatory comments in production or test code. Express intent
through clear names and straightforward code first; do not invent abstractions
or contrived names solely to eliminate a comment.

Keep only the shortest sufficient statement of a verified, current reason that
an in-scope code improvement cannot express and whose removal would risk a
concrete incorrect change, including distinct conditions for safely removing a
workaround. "Helpful", "complex", or "domain rule" alone is not enough; do not
invent constraints or add policy-compliance explanations to code.

Before every implementation or correction commit, inspect added, modified, and
deleted comments and existing comments invalidated by the change. Delete code
restatements, step-by-step narration, and work/plan/review history unless it
explains a necessary current constraint. For each remaining explanation, remove
sentences that add no essential information; one necessary reason does not
justify a whole paragraph. Improve unclear code before retaining an explanation.
Keep this cleanup within the change's scope, including isolated tasks.

Honor explicit user/project requirements. Preserve required licenses, functional
tool/type directives, and required API documentation after checking their actual
contracts. Surrounding comment volume is not a requirement. These rules concern
code comments, not prose in standalone documents.

For edits affecting only ordinary prose comments, inspect the diff to establish
that runtime behavior, types, tool directives, generated documentation, and
licensing contracts are unchanged, then use existing relevant checks. No new
failing behavior test is required. Keep the controller's commit, verification,
and review steps. Code behavior changes still follow TDD. This exception does
not cover runtime skill instructions or executable examples.

## When stuck

Test pain is usually a design signal:

| Problem | What it's telling you |
|---|---|
| Don't know how to test it | Write the wished-for API and assert first. Still stuck? Ask. |
| Test is too complicated | The design is. Simplify the interface. |
| Must mock everything | Code is too coupled. Use dependency injection. |
| Test setup is huge | Extract helpers; if still complex, simplify the design. |

## Mocking and other anti-patterns

Writing or changing tests, or adding mocks? Read `testing-anti-patterns.md` — the
common ways tests end up verifying nothing (asserting on mocks, test-only
production methods, over-mocking, partial mocks, tests as an afterthought).
