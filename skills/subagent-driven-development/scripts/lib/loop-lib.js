"use strict";

// Pure logic for sdd-loop: plan parsing, report/output parsing, prompt
// assembly, and state transitions. No I/O — the sdd-loop executable owns
// subprocesses and the filesystem so this module stays unit-testable.

const FENCE = /^```/;
const GROUP_HEADING = /^###[ \t]+Group[ \t]+(\d+)(?::[ \t]*(.*))?$/;
const SECTION_HEADING = /^##[ \t]/;
const MODEL_LINE = /^\*{0,2}Model:?\*{0,2}[ \t]*(haiku|sonnet|opus)\b/i;

function parsePlanGroups(planText) {
  const groups = [];
  let inFence = false;
  let current = null;
  for (const line of String(planText).split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(GROUP_HEADING);
    if (heading) {
      current = {
        n: Number(heading[1]),
        name: (heading[2] || "").trim(),
        model: null,
      };
      groups.push(current);
      continue;
    }
    if (SECTION_HEADING.test(line) && !/^###/.test(line)) {
      current = null;
      continue;
    }
    if (current && current.model === null) {
      const model = line.match(MODEL_LINE);
      if (model) current.model = model[1].toLowerCase();
    }
  }
  return groups;
}

function extractGlobalConstraints(planText) {
  const out = [];
  let inFence = false;
  let inSection = false;
  for (const line of String(planText).split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      if (inSection) out.push(line);
      continue;
    }
    if (!inFence) {
      if (/^##[ \t]+Global Constraints/i.test(line)) {
        inSection = true;
        continue;
      }
      if (inSection && SECTION_HEADING.test(line) && !/^###/.test(line)) break;
    }
    if (inSection) out.push(line);
  }
  return out.join("\n").trim();
}

module.exports = {
  parsePlanGroups,
  extractGlobalConstraints,
};
