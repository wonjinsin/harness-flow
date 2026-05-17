'use strict';

// bash-guard.js — shared infrastructure for PreToolUse(Bash) pattern guards.
// Pure pattern matcher factory + main loop.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Fail-open on payload parse errors.

const { readStdinSync, parsePayload, getCommand } = require('./payload.js');

function makeMatcher(patterns) {
  return function matchDangerous(cmd) {
    const text = String(cmd == null ? '' : cmd);
    for (const p of patterns) {
      if (p.regex.test(text)) return p;
    }
    return null;
  };
}

function emitDeny(pattern, cmd) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[${pattern.id}] ${pattern.reason}`,
      },
      systemMessage:
        `Blocked Bash command: ${cmd}\n\n` +
        `Stop here. Do NOT retry with a workaround. Ask the user how to proceed.`,
    }),
  );
}

function runGuard({ name, matchDangerous }) {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return;

  let payload;
  try {
    payload = parsePayload(readStdinSync());
  } catch (err) {
    console.error(`${name}: payload parse error: ${err.message}`);
    return; // fail-open
  }

  const cmd = getCommand(payload);
  const hit = matchDangerous(cmd);
  if (hit) {
    emitDeny(hit, cmd);
    process.exit(2); // belt-and-suspenders: JSON deny + exit code
  }
}

module.exports = { makeMatcher, emitDeny, runGuard };
