"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const {
  parsePlanGroups,
  extractGlobalConstraints,
  parseReportStatus,
  parseClaudeJson,
  parseFindings,
  routeFindings,
  buildImplementerPrompt,
  buildFinalReviewPrompt,
  buildFixPrompt,
  buildVerifyFixPrompt,
  SEVERITY_FLOOR_BLOCK,
  FINDING_CLASS_BLOCK,
  initState,
  nextPending,
  MAX_ATTEMPTS,
  MAX_REVIEW_CYCLES,
} = require("../../skills/subagent-driven-development/scripts/lib/loop-lib.js");

test("parsePlanGroups finds numbered groups with names", () => {
  const plan = [
    "## Tasks",
    "### Group 1: parser core",
    "body",
    "### Group 2: cli",
    "body",
  ].join("\n");
  assert.deepStrictEqual(parsePlanGroups(plan), [
    { n: 1, name: "parser core", model: null },
    { n: 2, name: "cli", model: null },
  ]);
});

test("parsePlanGroups ignores headings inside code fences", () => {
  const plan = [
    "### Group 1: real",
    "```",
    "### Group 9: fake",
    "```",
    "### Group 2: also real",
  ].join("\n");
  assert.deepStrictEqual(
    parsePlanGroups(plan).map((g) => g.n),
    [1, 2]
  );
});

test("parsePlanGroups extracts a Model: line from the group body", () => {
  const plan = [
    "### Group 1: cheap one",
    "Model: haiku",
    "### Group 2: no model",
    "text",
    "### Group 3: bold model",
    "**Model:** OPUS",
  ].join("\n");
  const groups = parsePlanGroups(plan);
  assert.strictEqual(groups[0].model, "haiku");
  assert.strictEqual(groups[1].model, null);
  assert.strictEqual(groups[2].model, "opus");
});

test("parsePlanGroups: a ## heading ends the current group's model scope", () => {
  const plan = [
    "### Group 1: only",
    "body",
    "## Next section",
    "Model: opus",
  ].join("\n");
  assert.strictEqual(parsePlanGroups(plan)[0].model, null);
});

test("parsePlanGroups returns [] on empty or group-less plans", () => {
  assert.deepStrictEqual(parsePlanGroups(""), []);
  assert.deepStrictEqual(parsePlanGroups("## Tasks\n#### Task 1: x"), []);
});

test("extractGlobalConstraints returns the section body", () => {
  const plan = [
    "# Title",
    "## Global Constraints",
    "- rule one",
    "- rule two",
    "## Tasks",
    "- not a rule",
  ].join("\n");
  assert.strictEqual(extractGlobalConstraints(plan), "- rule one\n- rule two");
});

test("extractGlobalConstraints tolerates fences and missing section", () => {
  const withFence = [
    "## Global Constraints",
    "```",
    "## fake heading in fence",
    "```",
    "- real rule",
    "## Next",
  ].join("\n");
  assert.strictEqual(
    extractGlobalConstraints(withFence),
    "```\n## fake heading in fence\n```\n- real rule"
  );
  assert.strictEqual(extractGlobalConstraints("# no section here"), "");
});

test("parseReportStatus finds the four statuses, preferring the longest match", () => {
  assert.strictEqual(parseReportStatus("**Status:** DONE\nrest"), "DONE");
  assert.strictEqual(
    parseReportStatus("Status: DONE_WITH_CONCERNS"),
    "DONE_WITH_CONCERNS"
  );
  assert.strictEqual(parseReportStatus("- Status: BLOCKED because x"), "BLOCKED");
  assert.strictEqual(parseReportStatus("Status:NEEDS_CONTEXT"), "NEEDS_CONTEXT");
  assert.strictEqual(parseReportStatus("no status here"), null);
  assert.strictEqual(parseReportStatus(""), null);
  assert.strictEqual(parseReportStatus(null), null);
});

test("parseClaudeJson extracts usage fields and tolerates garbage", () => {
  const ok = parseClaudeJson(
    JSON.stringify({
      result: "hi",
      usage: { input_tokens: 5, output_tokens: 7 },
      total_cost_usd: 0.01,
      duration_ms: 1200,
      is_error: false,
    })
  );
  assert.strictEqual(ok.result, "hi");
  assert.deepStrictEqual(ok.usage, { input_tokens: 5, output_tokens: 7 });
  assert.strictEqual(ok.costUsd, 0.01);
  assert.strictEqual(ok.durationMs, 1200);
  assert.strictEqual(ok.isError, false);

  const bad = parseClaudeJson("not json at all");
  assert.strictEqual(bad.isError, true);
  assert.strictEqual(bad.usage, null);
});

test("parseFindings accepts a bare array or a {findings: []} wrapper", () => {
  assert.deepStrictEqual(parseFindings("[]"), []);
  const wrapped = parseFindings(
    JSON.stringify({ verdict: "findings", findings: [{ severity: "Critical" }] })
  );
  assert.strictEqual(wrapped.length, 1);
  assert.strictEqual(parseFindings("nonsense"), null);
  assert.strictEqual(parseFindings(JSON.stringify({ nope: 1 })), null);
});

test("routeFindings: plan-escalate wins over impl-fix", () => {
  const routed = routeFindings([
    { severity: "Important", class: "impl-fix", summary: "a" },
    { severity: "Critical", class: "plan-escalate", summary: "b" },
  ]);
  assert.strictEqual(routed.action, "escalate");
  assert.strictEqual(routed.escalations.length, 1);
});

test("routeFindings: only Critical/Important trigger a fix; Minor approves", () => {
  const fix = routeFindings([
    { severity: "Important", class: "impl-fix", summary: "a" },
    { severity: "Minor", class: "impl-fix", summary: "m" },
  ]);
  assert.strictEqual(fix.action, "fix");
  assert.strictEqual(fix.fixList.length, 1);

  const ok = routeFindings([{ severity: "Minor", class: "impl-fix", summary: "m" }]);
  assert.strictEqual(ok.action, "approved");
  assert.strictEqual(ok.minor.length, 1);
  assert.strictEqual(routeFindings([]).action, "approved");
});

test("routeFindings treats a missing class as impl-fix (reviewer default)", () => {
  const routed = routeFindings([{ severity: "Critical", summary: "no class" }]);
  assert.strictEqual(routed.action, "fix");
});

test("buildImplementerPrompt embeds paths, constraints, and headless contract", () => {
  const p = buildImplementerPrompt({
    groupN: 2,
    groupName: "cli",
    briefPath: "/w/.harness-flow/sdd/group-2-brief.md",
    reportPath: "/w/.harness-flow/sdd/group-2-report.md",
    workDir: "/w",
    constraints: "- zero deps",
    retryNote: null,
  });
  assert.ok(p.includes("Group 2: cli"));
  assert.ok(p.includes("/w/.harness-flow/sdd/group-2-brief.md"));
  assert.ok(p.includes("/w/.harness-flow/sdd/group-2-report.md"));
  assert.ok(p.includes("- zero deps"));
  assert.ok(p.includes("NEEDS_CONTEXT"));
  assert.ok(!p.includes("[BRIEF_FILE]"));
  assert.ok(!p.includes("retry"));
});

test("buildImplementerPrompt includes the previous error on retry", () => {
  const p = buildImplementerPrompt({
    groupN: 1,
    groupName: "x",
    briefPath: "/b",
    reportPath: "/r",
    workDir: "/w",
    constraints: "",
    retryNote: "no commits were created",
  });
  assert.ok(p.includes("previous attempt failed"));
  assert.ok(p.includes("no commits were created"));
});

test("buildFinalReviewPrompt carries package, briefs, verbatim blocks, findings path", () => {
  const p = buildFinalReviewPrompt({
    packagePath: "/pkg.diff",
    briefPaths: ["/b1.md", "/b2.md"],
    constraints: "- rule",
    templatePath: "/tmpl/code-reviewer.md",
    findingsPath: "/out/findings.json",
  });
  assert.ok(p.includes("/pkg.diff"));
  assert.ok(p.includes("/b1.md") && p.includes("/b2.md"));
  assert.ok(p.includes(SEVERITY_FLOOR_BLOCK.trim()));
  assert.ok(p.includes(FINDING_CLASS_BLOCK.trim()));
  assert.ok(p.includes("/out/findings.json"));
  assert.ok(p.includes("/tmpl/code-reviewer.md"));
});

test("buildFixPrompt lists every finding and demands test evidence", () => {
  const p = buildFixPrompt({
    findings: [
      { severity: "Critical", class: "impl-fix", file: "a.js", summary: "boom" },
      { severity: "Important", class: "impl-fix", file: "b.js", summary: "bad" },
    ],
    reportPath: "/r.md",
    constraints: "- rule",
  });
  assert.ok(p.includes("boom") && p.includes("bad"));
  assert.ok(p.includes("a.js") && p.includes("b.js"));
  assert.ok(p.includes("/r.md"));
  assert.ok(/covering tests/i.test(p));
});

test("buildVerifyFixPrompt carries open findings and the fix package", () => {
  const p = buildVerifyFixPrompt({
    openFindings: [{ severity: "Critical", class: "impl-fix", file: "a.js", summary: "boom" }],
    fixPackagePath: "/fix.diff",
    briefPaths: ["/b1.md"],
    templatePath: "/tmpl/task-reviewer-prompt.md",
    findingsPath: "/out/findings.json",
  });
  assert.ok(p.includes("boom"));
  assert.ok(p.includes("/fix.diff"));
  assert.ok(p.includes("/out/findings.json"));
  assert.ok(p.includes("/tmpl/task-reviewer-prompt.md"));
});

test("initState maps groups with per-group model override and default", () => {
  const s = initState({
    plan: "/p.md",
    branch: "feat",
    mergeBase: "abc1234",
    groups: [
      { n: 1, name: "a", model: "haiku" },
      { n: 2, name: "b", model: null },
    ],
    defaultModel: "sonnet",
  });
  assert.strictEqual(s.groups[0].model, "haiku");
  assert.strictEqual(s.groups[1].model, "sonnet");
  assert.strictEqual(s.groups[0].status, "pending");
  assert.strictEqual(s.groups[0].attempts, 0);
  assert.deepStrictEqual(s.final, { reviewCycles: 0, status: "pending" });
  assert.strictEqual(s.mergeBase, "abc1234");
});

test("nextPending returns the first non-completed group, else null", () => {
  const s = initState({
    plan: "p",
    branch: "b",
    mergeBase: "m",
    groups: [
      { n: 1, name: "a", model: null },
      { n: 2, name: "b", model: null },
    ],
    defaultModel: "sonnet",
  });
  assert.strictEqual(nextPending(s).n, 1);
  s.groups[0].status = "completed";
  assert.strictEqual(nextPending(s).n, 2);
  s.groups[1].status = "completed";
  assert.strictEqual(nextPending(s), null);
});

test("caps are exported as constants", () => {
  assert.strictEqual(MAX_ATTEMPTS, 2);
  assert.strictEqual(MAX_REVIEW_CYCLES, 3);
});
