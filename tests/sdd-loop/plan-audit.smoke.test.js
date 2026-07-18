"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync, spawnSync } = require("node:child_process");

const AUDIT = path.resolve(
  __dirname,
  "../../skills/subagent-driven-development/scripts/plan-audit"
);

const PLAN = [
  "### Group 1: g",
  "#### Task 1.1: a",
  "- Create: `src/a.js`",
  "- Test: `test/a.test.js`",
  "#### Task 1.2: b",
  "- Create: `src/b.js`",
].join("\n");

function makeRepo(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-audit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execSync(
    "git init -q -b main && git config user.email t@t && git config user.name t",
    { cwd: dir }
  );
  fs.writeFileSync(path.join(dir, "plan.md"), PLAN);
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "x");
  }
  execSync("git add -A && git commit -qm init", { cwd: dir });
  return dir;
}

function run(dir, args) {
  return spawnSync(process.execPath, [AUDIT, ...args], {
    cwd: dir,
    encoding: "utf8",
  });
}

test("complete plan passes with per-task OK lines", (t) => {
  const dir = makeRepo(t, ["src/a.js", "test/a.test.js", "src/b.js"]);
  const r = run(dir, ["plan.md"]);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes("Task 1.1: OK"));
  assert.ok(r.stdout.includes("Task 1.2: OK"));
});

test("missing deliverables exit 1 and are named", (t) => {
  const dir = makeRepo(t, ["src/a.js"]);
  const r = run(dir, ["plan.md"]);
  assert.strictEqual(r.status, 1);
  assert.ok(r.stdout.includes("Task 1.1: MISSING test/a.test.js"));
  assert.ok(r.stdout.includes("Task 1.2: MISSING src/b.js"));
});

test("--base enforces commits >= tasks", (t) => {
  const dir = makeRepo(t, ["src/a.js", "test/a.test.js", "src/b.js"]);
  execSync("git commit -q --allow-empty -m one", { cwd: dir });
  const base = execSync("git rev-list --max-parents=0 HEAD", {
    cwd: dir,
    encoding: "utf8",
  }).trim();
  const short = run(dir, ["plan.md", "--base", base]);
  assert.strictEqual(short.status, 1, short.stdout);
  assert.ok(short.stdout.includes("commits 1 < tasks 2"));
  execSync("git commit -q --allow-empty -m two", { cwd: dir });
  assert.strictEqual(run(dir, ["plan.md", "--base", base]).status, 0);
});

test("usage errors and task-less plans exit 2", (t) => {
  const dir = makeRepo(t, []);
  assert.strictEqual(run(dir, []).status, 2);
  assert.strictEqual(run(dir, ["nope.md"]).status, 2);
  fs.writeFileSync(path.join(dir, "empty.md"), "# nothing here");
  assert.strictEqual(run(dir, ["empty.md"]).status, 2);
});
