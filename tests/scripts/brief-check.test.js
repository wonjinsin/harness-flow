"use strict";
// Tests for scripts/brief-check — deterministic placeholder guard for
// dispatch-time group briefs.
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const SCRIPT = join(
  __dirname,
  "..",
  "..",
  "skills",
  "subagent-driven-development",
  "scripts",
  "brief-check"
);

function runCheck(content) {
  const dir = mkdtempSync(join(tmpdir(), "brief-check-"));
  const file = join(dir, "group-1-brief.md");
  writeFileSync(file, content);
  return spawnSync(SCRIPT, [file], { encoding: "utf8" });
}

const CLEAN_BRIEF = [
  "### Group 1: Parser",
  "#### Task 1.1: tokenizer",
  "**Step 1: Write the failing test**",
  "```python",
  "def test_tokenize():",
  "    assert tokenize('a b') == ['a', 'b']",
  "```",
  "Run: `pytest tests/test_tok.py -v` — expected FAIL",
  "**Step 3: Write minimal implementation**",
  "```python",
  "def tokenize(s):",
  "    return s.split()",
  "```",
].join("\n");

test("clean brief passes (exit 0)", () => {
  const r = runCheck(CLEAN_BRIEF);
  assert.strictEqual(r.status, 0, r.stderr);
});

for (const [name, marker] of [
  ["TBD", "Interface: TBD"],
  ["TODO", "TODO: decide the format"],
  ["TODO no colon", "TODO decide the format"],
  ["implement later", "we can implement later"],
  ["fill in", "fill in the details here"],
  ["appropriate error handling", "Add appropriate error handling"],
  ["add validation", "We should add validation for the input"],
  ["handle edge cases", "handle edge cases as needed"],
  ["similar to Task", "Similar to Task 1.1, repeat for parse"],
  ["similar to Group", "similar to Group 2"],
]) {
  test(`placeholder "${name}" fails (exit 1, line reported)`, () => {
    const r = runCheck(CLEAN_BRIEF + "\n" + marker + "\n");
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /line \d+:/);
  });
}

for (const [name, line] of [
  ["todos plural", "Update the todos"],
  ["todos list phrase", "Update the todos list and progress ledger"],
  ["todo list phrase", "See the todo list for remaining items"],
]) {
  test(`non-placeholder "${name}" passes (exit 0)`, () => {
    const r = runCheck(CLEAN_BRIEF + "\n" + line + "\n");
    assert.strictEqual(r.status, 0, r.stderr);
  });
}

test("unbalanced code fences fails (exit 1, unbalanced message)", () => {
  const unbalanced = CLEAN_BRIEF + "\n```python\n# unterminated fence, TODO swallowed below\n";
  const r = runCheck(unbalanced);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /unbalanced code fences in brief/);
});

test("placeholder inside a code fence is ignored", () => {
  const fenced =
    CLEAN_BRIEF + "\n```python\n# TODO markers in shipped code are the task's business\n```\n";
  const r = runCheck(fenced);
  assert.strictEqual(r.status, 0, r.stderr);
});

test("brief with zero code fences fails (exit 1)", () => {
  const r = runCheck("### Group 1: Docs\n**Step 1: Write the failing test**\nprose only\n");
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /no code fence/);
});

test("case-insensitive match (tbd lowercase)", () => {
  const r = runCheck(CLEAN_BRIEF + "\nformat is tbd\n");
  assert.strictEqual(r.status, 1);
});

test("missing file is usage error (exit 2)", () => {
  const r = spawnSync(SCRIPT, ["/nonexistent/brief.md"], { encoding: "utf8" });
  assert.strictEqual(r.status, 2);
});

test("no args is usage error (exit 2)", () => {
  const r = spawnSync(SCRIPT, [], { encoding: "utf8" });
  assert.strictEqual(r.status, 2);
});

test("indented fence: TODO inside is ignored, counts as a fence", () => {
  const indented = [
    "### Group 1: Parser",
    "**Step 1: nested in a list**",
    "- list item:",
    "  ```js",
    "  // TODO markers in shipped code are the task's business",
    "  assert.equal(1, 1);",
    "  ```",
  ].join("\n");
  const r = runCheck(indented);
  assert.strictEqual(r.status, 0, r.stderr);
});

test("4-backtick fence: inner ``` does not toggle state (TBD stays fenced)", () => {
  const nested = [
    "### Group 1: Docs task",
    "**Step 1: write the markdown file**",
    "````markdown",
    "```bash",
    "Interface: TBD is documented content, not brief prose",
    "```",
    "````",
  ].join("\n");
  const r = runCheck(nested);
  assert.strictEqual(r.status, 0, r.stderr);
});

test("indented fence left open at EOF is unbalanced (exit 1)", () => {
  const open = CLEAN_BRIEF + "\n- item:\n  ```js\n  // never closed\n";
  const r = runCheck(open);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /unbalanced code fences in brief/);
});
