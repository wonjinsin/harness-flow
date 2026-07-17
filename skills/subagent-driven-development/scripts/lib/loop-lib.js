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

const STATUS_RE =
  /\*{0,2}Status:?\*{0,2}[ \t]*\*{0,2}(DONE_WITH_CONCERNS|DONE|BLOCKED|NEEDS_CONTEXT)\b/;

function parseReportStatus(text) {
  if (!text) return null;
  const m = String(text).match(STATUS_RE);
  return m ? m[1] : null;
}

function parseClaudeJson(stdout) {
  try {
    const data = JSON.parse(stdout);
    return {
      result: typeof data.result === "string" ? data.result : "",
      usage:
        data.usage && typeof data.usage === "object" ? data.usage : null,
      costUsd:
        typeof data.total_cost_usd === "number" ? data.total_cost_usd : null,
      durationMs:
        typeof data.duration_ms === "number" ? data.duration_ms : null,
      isError: Boolean(data.is_error),
    };
  } catch {
    return {
      result: "",
      usage: null,
      costUsd: null,
      durationMs: null,
      isError: true,
    };
  }
}

function parseFindings(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.findings)) return data.findings;
  return null;
}

function routeFindings(findings) {
  const open = findings.filter(
    (f) => f.severity === "Critical" || f.severity === "Important"
  );
  const escalations = open.filter((f) => f.class === "plan-escalate");
  if (escalations.length) return { action: "escalate", escalations };
  if (open.length) return { action: "fix", fixList: open };
  return {
    action: "approved",
    minor: findings.filter((f) => f.severity === "Minor"),
  };
}

module.exports = {
  parsePlanGroups,
  extractGlobalConstraints,
  parseReportStatus,
  parseClaudeJson,
  parseFindings,
  routeFindings,
};
