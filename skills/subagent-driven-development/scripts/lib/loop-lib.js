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

// Verbatim from subagent-driven-development/SKILL.md "Final Review Nets
// Every Group" — do not edit here without editing the skill.
const SEVERITY_FLOOR_BLOCK = `This branch was implemented without intermediate group reviews. Rate
severity by consequence, not by surface form: a finding that violates a
brief requirement, or propagates a wrong value/type/contract downstream,
is Important or Critical even when it reads as a type-contract or style
nit. A Minor rating on such a finding requires a one-line justification
of why the consequence is harmless.`;

const FINDING_CLASS_BLOCK = `Tag each Critical/Important finding with exactly one \`class\`:
- \`impl-fix\` — the implementation is wrong, incomplete, or low-quality
  against a correct spec; a fix subagent can resolve it. Default when
  unsure.
- \`plan-escalate\` — the plan/brief/spec text itself is wrong or
  internally contradictory, so no implementation of it can be correct.
  State the plan text at fault. Every plan-mandated finding is
  \`plan-escalate\`.`;

const FINDINGS_JSON_CONTRACT = (findingsPath) => `## Machine-readable verdict (REQUIRED)

After your prose review, write your verdict to ${findingsPath} as JSON:
{"verdict": "approved" | "findings",
 "findings": [{"severity": "Critical"|"Important"|"Minor",
               "class": "impl-fix"|"plan-escalate",
               "file": "<repo-relative path>",
               "summary": "<one sentence>"}]}
An approved review writes {"verdict": "approved", "findings": []}. This
file is parsed by a script — write valid JSON, nothing else in the file.`;

function buildImplementerPrompt(opts) {
  const retry = opts.retryNote
    ? `\n## ⚠ The previous attempt failed — fix this first\n\n${opts.retryNote}\n`
    : "";
  return `You are implementing Group ${opts.groupN}: ${opts.groupName} — all its tasks, in order.

## Group Brief

Read your group brief first: ${opts.briefPath}
It contains every task in this group with the full text from the plan.
Implement the tasks in order — each is one TDD cycle (write the failing
test, see it fail, implement, see it pass), with ONE commit per task.

## Global Constraints

${opts.constraints || "(none)"}
${retry}
## Headless contract

You are running non-interactively — no one can answer questions. If a
requirement is genuinely ambiguous or you are missing information, do NOT
guess: write your report with Status: NEEDS_CONTEXT (or BLOCKED if you
cannot proceed) and stop. Otherwise, work through every task.

After the LAST task: run the full test suite for the changed code once,
plus the project's formatter/typecheck if it has one. Then self-review
(completeness, quality, YAGNI, test honesty) and fix what you find.

Work from: ${opts.workDir}

## Report

Write your full report to ${opts.reportPath}: what you implemented, TDD
evidence per task (RED and GREEN commands + output), the group-end full
suite result, files changed, self-review findings, concerns.
The FIRST line of the report must be:
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Then reply with only that status line, your commits (short SHA + subject),
and a one-line test summary.`;
}

function buildFinalReviewPrompt(opts) {
  return `You are the final whole-branch code reviewer. Follow the review method in ${opts.templatePath} (read it first).

## Inputs

- Review package (commit list + stat + full diff): ${opts.packagePath}
- Group briefs (the requirements each group implemented): ${opts.briefPaths.join(", ")}
- No group had a dedicated review — cover spec compliance and quality for
  all of them. Report requirements you cannot verify from the diff as ⚠ items in your prose.

## Global Constraints (attention lens — verbatim from the plan)

${opts.constraints || "(none)"}

## Severity floor

${SEVERITY_FLOOR_BLOCK}

## Finding class

${FINDING_CLASS_BLOCK}

${FINDINGS_JSON_CONTRACT(opts.findingsPath)}`;
}

function buildFixPrompt(opts) {
  const list = opts.findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity}] ${f.file || "(no file)"} — ${f.summary}`
    )
    .join("\n");
  return `You are fixing the complete findings list from a code review — all of them, in one pass.

## Findings

${list}

## Global Constraints

${opts.constraints || "(none)"}

## Contract

For each finding: fix it, then re-run the covering tests for the amended
code (name the test file and command). Append your fix report — what you
changed and the covering tests' command + output — to ${opts.reportPath}.
Commit your fixes (one commit is fine). Reviewers will not re-run tests
for you — your report is the test evidence. Reply with a short summary:
what you fixed, commits, test results.`;
}

function buildVerifyFixPrompt(opts) {
  const list = opts.openFindings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity}] ${f.file || "(no file)"} — ${f.summary}`
    )
    .join("\n");
  return `You are verifying a fix wave (final re-review). Follow the verify-fix review method in ${opts.templatePath} (read it first).

## Open findings (verbatim — verify each is resolved)

${list}

## Inputs

- Fix-diff package (FIX_BASE..HEAD only): ${opts.fixPackagePath}
- Group briefs for context: ${opts.briefPaths.join(", ")}

Check that every open finding is resolved, that no new Critical/Important
defect was introduced by the fix, and that fix quality is acceptable.

${FINDINGS_JSON_CONTRACT(opts.findingsPath)}`;
}

const MAX_ATTEMPTS = 2;
const MAX_REVIEW_CYCLES = 3;

function initState(opts) {
  return {
    plan: opts.plan,
    branch: opts.branch,
    mergeBase: opts.mergeBase,
    groups: opts.groups.map((g) => ({
      n: g.n,
      name: g.name,
      model: g.model || opts.defaultModel,
      status: "pending",
      attempts: 0,
      commits: [],
    })),
    final: { reviewCycles: 0, status: "pending" },
  };
}

function nextPending(state) {
  return state.groups.find((g) => g.status !== "completed") || null;
}

module.exports = {
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
};
