#!/usr/bin/env node
'use strict';

// pre-plan-audit.js — PreToolUse(Agent|Task) completeness gate for the SDD
// final review. The measured worst-case in-session failure is silently
// dropping plan tasks and dispatching the final review as if complete
// (design/2026-07-18-external-loop-retrospective.md). This hook runs the
// deterministic plan-audit script when the final whole-branch review is
// dispatched and denies the dispatch while deliverables are missing.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Missing/invalid implementation bases
// and genuine audit failures deny; unrelated or unavailable audit contexts
// remain fail-open.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readStdinSync, parsePayload } = require('./lib/payload.js');

// Set verbatim by requesting-code-review's final-review dispatch.
const FINAL_REVIEW_DESC = /^(Review code changes|final[_ -]review\b)/i;

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

function resolveImplementationBase(cwd, env) {
  if (env.HARNESS_FLOW_IMPLEMENTATION_BASE) {
    return env.HARNESS_FLOW_IMPLEMENTATION_BASE;
  }
  const rootProc = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  });
  if (rootProc.status !== 0) return null;
  const ledger = path.join(rootProc.stdout.trim(), '.harness-flow/sdd/progress.md');
  try {
    const match = fs.readFileSync(ledger, 'utf8').match(/^implementationBase:\s*(\S+)/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// The SDD ledger is written before Task 1, so its presence marks a session that
// is (or was) executing a plan. An explicit env override counts too: the caller
// has named a base, so they intend the gate to run.
function sddSessionInFlight(cwd, env) {
  if (env.HARNESS_FLOW_IMPLEMENTATION_BASE) return true;
  const rootProc = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  });
  if (rootProc.status !== 0) return false;
  return fs.existsSync(
    path.join(rootProc.stdout.trim(), '.harness-flow/sdd/progress.md'),
  );
}

function implementationBaseExists(cwd, base) {
  const check = spawnSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `${base}^{commit}`],
    { cwd, encoding: 'utf8' },
  );
  return check.status === 0;
}

function implementationBaseIsAncestor(cwd, base) {
  const check = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', base, 'HEAD'],
    { cwd, encoding: 'utf8' },
  );
  return check.status === 0;
}

function emitDeny(planPath, auditOutput) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[plan-audit] The final review was dispatched but the plan at ${planPath} ` +
          'has tasks whose declared files are missing or unchanged since implementation began:\n' +
          auditOutput +
          '\nComplete the missing tasks (dispatch implementers for them), then re-dispatch the final review.',
      },
      systemMessage:
        'Blocked the final review: plan-audit found missing deliverables.\n\n' +
        auditOutput +
        '\nEvery plan task must have its declared Create/Modify/Test files present and changed after implementation began ' +
        'before the final whole-branch review. Dispatch implementers for the missing tasks, ' +
        `then re-dispatch. (Audited plan: ${planPath}; override with HARNESS_FLOW_PLAN.)`,
    }),
  );
}

function emitMissingBaseDeny(planPath) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[plan-audit] Cannot verify final-review completeness for ${planPath}: ` +
          'the implementation base is missing. Record implementationBase in ' +
          '.harness-flow/sdd/progress.md or set HARNESS_FLOW_IMPLEMENTATION_BASE.',
      },
      systemMessage:
        'Blocked the final review because plan-audit has no implementation base. ' +
        'Record the commit immediately before implementation as ' +
        '`implementationBase: <sha>` in `.harness-flow/sdd/progress.md`, or set ' +
        'HARNESS_FLOW_IMPLEMENTATION_BASE, then re-dispatch.',
    }),
  );
}

function emitInvalidBaseDeny(planPath, base) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[plan-audit] Cannot verify final-review completeness for ${planPath}: ` +
          `implementation base ${base} is not a commit in this repository.`,
      },
      systemMessage:
        `Blocked the final review because implementation base ${base} is invalid. ` +
        'Record the commit immediately before implementation as ' +
        '`implementationBase: <sha>` in `.harness-flow/sdd/progress.md`, or set ' +
        'HARNESS_FLOW_IMPLEMENTATION_BASE, then re-dispatch.',
    }),
  );
}

function emitNonAncestorBaseDeny(planPath, base) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[plan-audit] Cannot verify final-review completeness for ${planPath}: ` +
          `implementation base ${base} is not an ancestor of HEAD. A rebase, ` +
          'amend, or squash rewrites the recorded commit, and the base may also ' +
          'belong to a different branch.',
      },
      systemMessage:
        `Blocked the final review because implementation base ${base} is not ` +
        'an ancestor of HEAD. Do not look for that SHA — if the branch was ' +
        'rebased, amended, or squashed it no longer exists. Re-derive the base ' +
        'on the CURRENT branch: find the commit immediately before the first ' +
        'implementation commit (`git log --oneline` — it is the last plan/spec ' +
        'commit, often `git merge-base <base-branch> HEAD`). Write that SHA to ' +
        '`implementationBase: <sha>` in `.harness-flow/sdd/progress.md` (or set ' +
        'HARNESS_FLOW_IMPLEMENTATION_BASE), then re-dispatch.',
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
  const dispatchLabel = ti.description || ti.task_name || '';
  if (!FINAL_REVIEW_DESC.test(String(dispatchLabel))) return;

  const cwd = (payload && payload.cwd) || process.cwd();
  const plan = resolvePlan(cwd, process.env);
  if (!plan) return; // no plan in play → not an SDD chain session

  // Preserve the task-less-plan and audit-error fail-open cases before
  // requiring a base. Exit 0/1 means the plan has auditable tasks.
  const preflight = spawnSync(process.execPath, [AUDIT, plan], {
    cwd,
    encoding: 'utf8',
  });
  if (preflight.error || ![0, 1].includes(preflight.status)) return;

  // resolvePlan cannot tell an in-flight plan from a finished one left behind in
  // docs/harness-flow/plans/, so plan presence alone does not prove an SDD
  // session. The ledger does: SDD creates it before Task 1. Without one — and
  // without an explicit base override — this is an unrelated review in a project
  // that merely holds a stale plan, so do not demand a base.
  if (!sddSessionInFlight(cwd, process.env)) return;

  const base = resolveImplementationBase(cwd, process.env);
  if (!base) {
    emitMissingBaseDeny(plan);
    return;
  }
  if (!implementationBaseExists(cwd, base)) {
    emitInvalidBaseDeny(plan, base);
    return;
  }
  if (!implementationBaseIsAncestor(cwd, base)) {
    emitNonAncestorBaseDeny(plan, base);
    return;
  }
  const args = [AUDIT, plan, '--base', base];
  const audit = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
  });
  if (audit.error || audit.status !== 1) return; // fail-open unless a real audit failure

  emitDeny(plan, (audit.stdout || '').trim());
  return; // Exit 0 so the runtime parses the deny JSON on stdout.
}

if (require.main === module) {
  main();
}

module.exports = {
  FINAL_REVIEW_DESC,
  resolvePlan,
  resolveImplementationBase,
  sddSessionInFlight,
  implementationBaseExists,
  implementationBaseIsAncestor,
  emitMissingBaseDeny,
  emitInvalidBaseDeny,
  emitNonAncestorBaseDeny,
};
