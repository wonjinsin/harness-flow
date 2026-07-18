#!/usr/bin/env node
'use strict';

// pre-plan-audit.js — PreToolUse(Agent|Task) completeness gate for the SDD
// final review. The measured worst-case in-session failure is silently
// dropping plan tasks and dispatching the final review as if complete
// (design/2026-07-18-external-loop-retrospective.md). This hook runs the
// deterministic plan-audit script when the final whole-branch review is
// dispatched and denies the dispatch while deliverables are missing.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Fail-open everywhere except a
// genuine audit failure (exit 1).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readStdinSync, parsePayload } = require('./lib/payload.js');

// Set verbatim by requesting-code-review's final-review dispatch.
const FINAL_REVIEW_DESC = /^Review code changes/;

const AUDIT = path.resolve(
  __dirname,
  '../skills/subagent-driven-development/scripts/plan-audit',
);

// Resolve the plan to audit: HARNESS_FLOW_PLAN (relative to cwd) wins, else
// the newest *.md under <git root>/docs/harness-flow/plans/. Null → no gate.
function resolvePlan(cwd, env) {
  if (env.HARNESS_FLOW_PLAN) {
    const p = path.resolve(cwd, env.HARNESS_FLOW_PLAN);
    return fs.existsSync(p) ? p : null;
  }
  const rootProc = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  });
  if (rootProc.status !== 0) return null;
  const planDir = path.join(rootProc.stdout.trim(), 'docs/harness-flow/plans');
  let entries;
  try {
    entries = fs.readdirSync(planDir).filter((f) => f.endsWith('.md'));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;
  const newest = entries
    .map((f) => {
      const full = path.join(planDir, f);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0];
  return newest.full;
}

function emitDeny(planPath, auditOutput) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[plan-audit] The final review was dispatched but the plan at ${planPath} ` +
          'has tasks whose declared files do not exist:\n' +
          auditOutput +
          '\nComplete the missing tasks (dispatch implementers for them), then re-dispatch the final review.',
      },
      systemMessage:
        'Blocked the final review: plan-audit found missing deliverables.\n\n' +
        auditOutput +
        '\nEvery plan task must have its declared Create/Modify/Test files in the working tree ' +
        'before the final whole-branch review. Dispatch implementers for the missing tasks, ' +
        `then re-dispatch. (Audited plan: ${planPath}; override with HARNESS_FLOW_PLAN.)`,
    }),
  );
}

function main() {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return;

  let payload;
  try {
    payload = parsePayload(readStdinSync());
  } catch (err) {
    console.error(`pre-plan-audit: payload parse error: ${err.message}`);
    return; // fail-open
  }

  const ti = (payload && payload.tool_input) || {};
  if (!FINAL_REVIEW_DESC.test(String(ti.description || ''))) return;

  const cwd = (payload && payload.cwd) || process.cwd();
  const plan = resolvePlan(cwd, process.env);
  if (!plan) return; // no plan in play → not an SDD chain session

  const audit = spawnSync(process.execPath, [AUDIT, plan], {
    cwd,
    encoding: 'utf8',
  });
  if (audit.error || audit.status !== 1) return; // fail-open unless a real audit failure

  emitDeny(plan, (audit.stdout || '').trim());
  process.exit(2);
}

if (require.main === module) {
  main();
}

module.exports = { FINAL_REVIEW_DESC, resolvePlan };
