"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync, spawnSync } = require("node:child_process");

const SDD_LOOP = path.resolve(
  __dirname,
  "../../skills/subagent-driven-development/scripts/sdd-loop"
);

const PLAN = [
  "# Fixture Plan",
  "## Global Constraints",
  "- keep it tiny",
  "## Tasks",
  "### Group 1: alpha",
  "Model: haiku",
  "#### Task 1.1: a",
  "body a",
  "### Group 2: beta",
  "#### Task 2.1: b",
  "body b",
].join("\n");

// Stub claude: reads the prompt from its last argument, inspects the repo
// (cwd) it runs in, and simulates an implementer or reviewer session.
// tests/fixture control file: <repo>/stub-mode with lines "group=DONE" etc.
const STUB = `#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const prompt = process.argv[process.argv.length - 1];
const mode = fs.readFileSync(path.resolve("stub-mode"), "utf8").trim();
function out() {
  process.stdout.write(JSON.stringify({
    result: "stub done", usage: { input_tokens: 100, output_tokens: 50 },
    total_cost_usd: 0.001, duration_ms: 10, is_error: false,
  }));
}
if (prompt.includes("Machine-readable verdict")) {
  const m = prompt.match(/write your verdict to (\\S+) as JSON/);
  const findingsPath = m[1];
  const verdict = mode === "review=findings-once" &&
      !fs.existsSync(path.resolve("reviewed-once"))
    ? { verdict: "findings", findings: [{ severity: "Important",
        class: "impl-fix", file: "x.js", summary: "stub finding" }] }
    : mode === "review=escalate"
      ? { verdict: "findings", findings: [{ severity: "Critical",
          class: "plan-escalate", file: "plan.md", summary: "plan wrong" }] }
      : { verdict: "approved", findings: [] };
  if (mode === "review=findings-once") fs.writeFileSync(path.resolve("reviewed-once"), "1");
  fs.writeFileSync(findingsPath, JSON.stringify(verdict));
  out();
} else if (prompt.includes("fixing the complete findings list")) {
  fs.writeFileSync(path.resolve("fixed.txt"), "fixed");
  execSync("git add -A && git commit -m 'fix: stub fix'", { stdio: "ignore" });
  out();
} else {
  const g = prompt.match(/Group (\\d+)/)[1];
  const rp = prompt.match(/Write your full report to (\\S+?):/)[1];
  const status = mode.startsWith("group" + g + "=")
    ? mode.split("=")[1] : "DONE";
  if (status === "GARBLE_ONCE") {
    const marker = path.resolve("garbled-" + g);
    if (!fs.existsSync(marker)) {
      fs.writeFileSync(path.resolve("g" + g + ".txt"), "work");
      execSync("git add -A && git commit -m 'feat: stub group " + g + "'",
        { stdio: "ignore" });
      fs.writeFileSync(marker, "1");
      fs.writeFileSync(rp, "working...\\n");
    } else {
      fs.writeFileSync(rp, "Status: DONE\\ndetails\\n");
    }
  } else {
    if (status === "DONE") {
      fs.writeFileSync(path.resolve("g" + g + ".txt"), "work");
      execSync("git add -A && git commit -m 'feat: stub group " + g + "'",
        { stdio: "ignore" });
    }
    fs.writeFileSync(rp, "Status: " + status + "\\ndetails\\n");
  }
  out();
}
`;

function makeRepo(t, { stubMode }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdd-loop-smoke-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execSync(
    "git init -q -b main && git config user.email t@t && git config user.name t",
    { cwd: dir }
  );
  fs.writeFileSync(path.join(dir, "plan.md"), PLAN);
  fs.writeFileSync(path.join(dir, "stub-mode"), stubMode);
  execSync("git add -A && git commit -qm init", { cwd: dir });
  const bin = path.join(dir, "stub-bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "claude"), STUB, { mode: 0o755 });
  return dir;
}

function runLoop(dir, args) {
  return spawnSync(process.execPath, [SDD_LOOP, "plan.md", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.join(dir, "stub-bin")}${path.delimiter}${process.env.PATH}`,
    },
  });
}

test("happy path: two groups, approved review, exit 0", (t) => {
  const dir = makeRepo(t, { stubMode: "all=DONE" });
  const r = runLoop(dir, []);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const state = JSON.parse(
    fs.readFileSync(path.join(dir, ".harness-flow/sdd/loop-state.json"), "utf8")
  );
  assert.ok(state.groups.every((g) => g.status === "completed"));
  assert.strictEqual(state.final.status, "approved");
  assert.strictEqual(state.groups[0].model, "haiku");
  assert.strictEqual(state.groups[1].model, "sonnet");
  const log = execSync("git log --oneline", { cwd: dir, encoding: "utf8" });
  assert.ok(log.includes("stub group 1") && log.includes("stub group 2"));
  const ledger = fs.readFileSync(
    path.join(dir, ".harness-flow/sdd/progress.md"),
    "utf8"
  );
  assert.ok(ledger.includes("Group 1: complete"));
  assert.ok(ledger.includes("final: approved"));
  const metrics = fs
    .readFileSync(path.join(dir, ".harness-flow/sdd/loop-metrics.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.ok(metrics.length >= 3);
  assert.ok(metrics.every((m) => m.usage.output_tokens === 50));
});

test("blocked group exits 2 and --resume completes", (t) => {
  const dir = makeRepo(t, { stubMode: "group2=BLOCKED" });
  const r1 = runLoop(dir, []);
  assert.strictEqual(r1.status, 2, r1.stdout + r1.stderr);
  let state = JSON.parse(
    fs.readFileSync(path.join(dir, ".harness-flow/sdd/loop-state.json"), "utf8")
  );
  assert.strictEqual(state.groups[1].status, "blocked");

  fs.writeFileSync(path.join(dir, "stub-mode"), "all=DONE");
  execSync("git add -A && git commit -qm 'unblock'", { cwd: dir });
  const r2 = runLoop(dir, ["--resume"]);
  assert.strictEqual(r2.status, 0, r2.stdout + r2.stderr);
});

test("fix loop: findings once -> fix wave -> verify-fix approves", (t) => {
  const dir = makeRepo(t, { stubMode: "review=findings-once" });
  const r = runLoop(dir, []);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const state = JSON.parse(
    fs.readFileSync(path.join(dir, ".harness-flow/sdd/loop-state.json"), "utf8")
  );
  assert.strictEqual(state.final.reviewCycles, 1);
  assert.strictEqual(state.final.status, "approved");
  const log = execSync("git log --oneline", { cwd: dir, encoding: "utf8" });
  assert.ok(log.includes("stub fix"));
});

test("plan-escalate exits 2 without dispatching a fixer", (t) => {
  const dir = makeRepo(t, { stubMode: "review=escalate" });
  const r = runLoop(dir, []);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.ok(r.stderr.includes("plan-escalate"));
  assert.ok(!fs.existsSync(path.join(dir, "fixed.txt")));
});

test("retry-then-succeed: garbled status on attempt 1 still counts the commit", (t) => {
  const dir = makeRepo(t, { stubMode: "group1=GARBLE_ONCE" });
  const r = runLoop(dir, []);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const state = JSON.parse(
    fs.readFileSync(path.join(dir, ".harness-flow/sdd/loop-state.json"), "utf8")
  );
  assert.strictEqual(state.groups[0].status, "completed");
  assert.strictEqual(state.groups[0].attempts, 2);
  const log = execSync("git log --oneline", { cwd: dir, encoding: "utf8" });
  const matches = log.match(/stub group 1/g) || [];
  assert.strictEqual(matches.length, 1);
});

test("existing state without --resume refuses to run", (t) => {
  const dir = makeRepo(t, { stubMode: "all=DONE" });
  assert.strictEqual(runLoop(dir, []).status, 0);
  const again = runLoop(dir, []);
  assert.strictEqual(again.status, 1);
  assert.ok(again.stderr.includes("--resume"));
});
