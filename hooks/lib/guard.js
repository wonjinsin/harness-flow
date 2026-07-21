'use strict';

// guard.js — shared infrastructure for PreToolUse hooks.
// Pure pattern matcher factory + main loop.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Fail-open on payload parse errors.

const { readStdinSync, parsePayload, getCommand } = require('./payload.js');

function makeMatcher(patterns) {
  return function matchDangerous(value) {
    const text = String(value == null ? '' : value);
    for (const p of patterns) {
      if (p.regex.test(text)) return p;
    }
    return null;
  };
}

function emitDeny(pattern, value, kind) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `[${pattern.id}] ${pattern.reason}`,
      },
      systemMessage:
        `Blocked ${kind}: ${value}\n\n` +
        `Stop here. Do NOT retry with a workaround. Ask the user how to proceed.`,
    }),
  );
}

function runGuard({ name, matchDangerous, kind = 'Bash command', getValue = getCommand }) {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return;

  let payload;
  try {
    payload = parsePayload(readStdinSync());
  } catch (err) {
    console.error(`${name}: payload parse error: ${err.message}`);
    return; // fail-open
  }

  const value = getValue(payload);
  const hit = matchDangerous(value);
  if (hit) {
    emitDeny(hit, value, kind);
    return; // Exit 0 so Codex and Claude Code both parse the deny JSON.
  }
}

module.exports = { makeMatcher, emitDeny, runGuard };
