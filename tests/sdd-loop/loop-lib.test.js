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
