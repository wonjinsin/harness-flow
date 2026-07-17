"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const {
  parsePlanGroups,
  extractGlobalConstraints,
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
