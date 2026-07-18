"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync, spawnSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "../../hooks/pre-plan-audit.js");

const PLAN = [
  "#### Task 1.1: a",
  "- Create: `src/a.js`",
].join("\n");

function makeRepo(t, { withFile, planAt }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-plan-audit-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execSync(
    "git init -q -b main && git config user.email t@t && git config user.name t",
    { cwd: dir }
  );
  if (planAt) {
    fs.mkdirSync(path.join(dir, path.dirname(planAt)), { recursive: true });
    fs.writeFileSync(path.join(dir, planAt), PLAN);
  }
  if (withFile) {
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src/a.js"), "x");
  }
  fs.writeFileSync(path.join(dir, "keep"), "x");
  execSync("git add -A && git commit -qm init", { cwd: dir });
  return dir;
}

function run(payload, env, cwd) {
  return spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
  });
}

const REVIEW = { tool_name: "Agent", tool_input: { description: "Review code changes", model: "opus" } };

test("denies final review when plan deliverables are missing", (t) => {
  const dir = makeRepo(t, { withFile: false, planAt: "docs/harness-flow/plans/2026-01-01-x.md" });
  const r = run({ ...REVIEW, cwd: dir }, {}, dir);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('"permissionDecision":"deny"') || r.stdout.includes('"deny"'));
  assert.ok(r.stdout.includes("MISSING"));
});

test("allows final review when the plan is complete", (t) => {
  const dir = makeRepo(t, { withFile: true, planAt: "docs/harness-flow/plans/2026-01-01-x.md" });
  const r = run({ ...REVIEW, cwd: dir }, {}, dir);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual(r.stdout.trim(), "");
});

test("HARNESS_FLOW_PLAN env overrides plan discovery", (t) => {
  const dir = makeRepo(t, { withFile: false, planAt: "my-plan.md" });
  const r = run({ ...REVIEW, cwd: dir }, { HARNESS_FLOW_PLAN: "my-plan.md" }, dir);
  assert.strictEqual(r.status, 2);
});

test("fail-open: no plan dir, non-review dispatch, hooks off, no repo", (t) => {
  const noPlan = makeRepo(t, { withFile: false, planAt: null });
  assert.strictEqual(run({ ...REVIEW, cwd: noPlan }, {}, noPlan).status, 0);

  const withPlan = makeRepo(t, { withFile: false, planAt: "docs/harness-flow/plans/p.md" });
  const other = { tool_name: "Agent", tool_input: { description: "Implement Group 1: x", model: "haiku" } };
  assert.strictEqual(run({ ...other, cwd: withPlan }, {}, withPlan).status, 0);
  assert.strictEqual(
    run({ ...REVIEW, cwd: withPlan }, { HARNESS_FLOW_HOOKS_OFF: "1" }, withPlan).status,
    0
  );

  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "no-repo-"));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  assert.strictEqual(run({ ...REVIEW, cwd: bare }, {}, bare).status, 0);
});

test("fail-open: task-less plan (audit exit 2) allows", (t) => {
  const dir = makeRepo(t, { withFile: false, planAt: "docs/harness-flow/plans/p.md" });
  fs.writeFileSync(path.join(dir, "docs/harness-flow/plans/p.md"), "# no tasks");
  assert.strictEqual(run({ ...REVIEW, cwd: dir }, {}, dir).status, 0);
});
