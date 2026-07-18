"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const {
  parsePlanFiles,
} = require("../../skills/subagent-driven-development/scripts/lib/plan-lib.js");

test("parsePlanFiles collects Create/Modify/Test paths per task", () => {
  const plan = [
    "### Group 1: g",
    "#### Task 1.1: alpha",
    "**Files:**",
    "- Create: `src/a.js`",
    "- Modify: `src/old.js:12-18`",
    "- Test: `test/a.test.js`",
    "#### Task 1.2: beta",
    "- Create: src/b.js (mode 755)",
    "## Next section",
    "- Create: not-in-a-task.js",
  ].join("\n");
  assert.deepStrictEqual(parsePlanFiles(plan), [
    {
      task: "1.1",
      name: "alpha",
      files: [
        { kind: "create", path: "src/a.js" },
        { kind: "modify", path: "src/old.js" },
        { kind: "test", path: "test/a.test.js" },
      ],
    },
    {
      task: "1.2",
      name: "beta",
      files: [{ kind: "create", path: "src/b.js" }],
    },
  ]);
});

test("parsePlanFiles ignores file lines inside code fences", () => {
  const plan = [
    "#### Task 1.1: x",
    "- Create: `real.js`",
    "```bash",
    "- Create: fake.js",
    "```",
  ].join("\n");
  assert.deepStrictEqual(parsePlanFiles(plan)[0].files, [
    { kind: "create", path: "real.js" },
  ]);
});

test("parsePlanFiles skips non-path values and tasks without Files", () => {
  const plan = [
    "#### Task 1.1: no files",
    "prose only",
    "#### Task 1.2: none marker",
    "- Test: none in this task (covered later)",
    "- Create: `CLAUDE.md`",
  ].join("\n");
  const tasks = parsePlanFiles(plan);
  assert.deepStrictEqual(tasks[0].files, []);
  assert.deepStrictEqual(tasks[1].files, [{ kind: "create", path: "CLAUDE.md" }]);
});

test("parsePlanFiles returns [] on empty or task-less plans", () => {
  assert.deepStrictEqual(parsePlanFiles(""), []);
  assert.deepStrictEqual(parsePlanFiles("## Tasks\n### Group 1: g"), []);
});
