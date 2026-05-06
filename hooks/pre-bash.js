#!/usr/bin/env node
'use strict';

// =============================================================================
// pre-bash.js — Bash gatekeeper hook
// =============================================================================
//
// WHEN: Fires on PreToolUse events where matcher === 'Bash', i.e. immediately
//       BEFORE the LLM's Bash tool invocation runs.
//
// STDIN: { tool_name: 'Bash', tool_input: { command: '<the bash command>' } }
//
// WHAT: Two-stage gate.
//   Stage 1 — Dangerous-pattern guard (every Bash command):
//     - --no-verify flag (any git command)
//     - rm -rf targeting /, ~, $HOME, or .
//     - pipe-to-shell at command position (curl|wget|fetch | bash|sh|...)
//     Match → exit 2 + stderr message.
//
//   Stage 2 — Commit gate (only when command is `git commit ...`):
//     a) make fmt (if target exists) → run, then `git diff --quiet` to detect
//        working-tree changes. fmt failure OR fmt-induced changes → exit 2.
//     b) make lint (if target exists) → run, failure → exit 2.
//     c) Secret regex matrix on `git diff --cached` → match → exit 2.
//
// WHY: PreToolUse(Bash) is the standard interception point for risky shell
//      commands in Claude Code (no dedicated PreGitCommit event exists). The
//      commit gate here is the LAST defense before history becomes permanent —
//      we want lint/secrets caught BEFORE the commit object is created.
//
//      Dangerous patterns are kept conservative (high-confidence-malicious only)
//      to minimize false positives. The LLM rarely intends `rm -rf /` or
//      `--no-verify`, so blocking these almost always reflects a real mistake.
//
// EXIT CODES:
//   0 → command is allowed (or kill-switched, or fail-open path)
//   2 → block the command (Claude Code surfaces stderr to the LLM as feedback)
//
// FAIL-OPEN: Payload parse errors exit 0. Hook must never crash the session.
// =============================================================================

const { spawnSync } = require('node:child_process');
const { readStdinSync, parsePayload, getCommand } = require('./lib/payload.js');
const { matchDangerous } = require('./lib/bash-patterns.js');
const { scanText } = require('./lib/secret-patterns.js');
const { isGitCommit } = require('./lib/git-commit-detector.js');
const { makeTargetExists, runMake } = require('./lib/make-runner.js');

// Stage 0: Single kill switch for the entire harness-flow hook system.
// Useful for one-off operations where the hook is in the way.
if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') {
  process.exit(0);
}

// Read and parse the JSON payload from stdin. Any failure here is treated as
// fail-open: log to stderr and exit 0. We refuse to take down a Bash invocation
// because OUR hook had a bug.
let payload;
try {
  payload = parsePayload(readStdinSync());
} catch (err) {
  console.error(`pre-bash: payload parse error: ${err.message}`);
  process.exit(0);
}

const cmd = getCommand(payload);

// -----------------------------------------------------------------------------
// Stage 1 — Dangerous-pattern guard
// -----------------------------------------------------------------------------
// matchDangerous returns { name } on first match, or null. The conservative
// pattern set lives in lib/bash-patterns.js. Block messages are LLM-readable
// — we want the model to understand WHY it was blocked and try a safer path.
const dangerous = matchDangerous(cmd);
if (dangerous) {
  console.error(`blocked: ${dangerous.name} pattern detected. Command: ${cmd}`);
  process.exit(2);
}

// -----------------------------------------------------------------------------
// Stage 2 — git commit gate (only triggers on `git commit` commands)
// -----------------------------------------------------------------------------
if (isGitCommit(cmd)) {
  // (a) make fmt — if the user's project defines a fmt target, run it. We then
  //     check if it modified the working tree. If yes, the user must re-stage
  //     and re-commit because fmt's changes weren't part of the original index.
  //     Why git diff --quiet (not --cached): fmt may rewrite files that are
  //     already staged. Working-tree diff catches that case.
  if (makeTargetExists('fmt')) {
    const fmtRes = runMake('fmt');
    if (!fmtRes.ok) {
      console.error('blocked: make fmt failed');
      console.error(fmtRes.stderr || fmtRes.stdout);
      process.exit(2);
    }
    const diffCheck = spawnSync('git', ['diff', '--quiet'], { encoding: 'utf-8' });
    if (diffCheck.status !== 0) {
      console.error(
        'blocked: make fmt modified files. Re-stage changes with git add and commit again.',
      );
      process.exit(2);
    }
  }

  // (b) make lint — surface lint stderr verbatim so the LLM can read the actual
  //     warnings/errors and fix them.
  if (makeTargetExists('lint')) {
    const lintRes = runMake('lint');
    if (!lintRes.ok) {
      console.error('blocked: make lint failed');
      console.error(lintRes.stderr || lintRes.stdout);
      process.exit(2);
    }
  }

  // (c) Secret scan on staged diff. We scan the diff (not the files) so we only
  //     check what's about to be committed, not noise from unstaged work or the
  //     existing repo state. scanText reports name + line number for each match.
  const stagedDiff = spawnSync('git', ['diff', '--cached'], { encoding: 'utf-8' });
  if (stagedDiff.status === 0 && stagedDiff.stdout) {
    const matches = scanText(stagedDiff.stdout);
    if (matches.length > 0) {
      for (const m of matches) {
        console.error(
          `blocked: secret detected: ${m.name} (staged diff line ${m.line}). Revert immediately or move to environment variable.`,
        );
      }
      process.exit(2);
    }
  }
}

// All gates passed (or this wasn't a git commit). Allow the Bash tool to proceed.
process.exit(0);
