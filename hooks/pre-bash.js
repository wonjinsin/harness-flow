#!/usr/bin/env node
'use strict';

// pre-bash.js — PreToolUse(Bash) dangerous-command guard.
// Pure pattern matcher. Conservative: high-confidence-malicious only.
// On block: emit hookSpecificOutput.permissionDecision = 'deny' JSON + exit 2.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Fail-open on payload parse errors.

const { readStdinSync, parsePayload, getCommand } = require('./lib/payload.js');

const PATTERNS = [
  // Catastrophic shell operations
  {
    id: 'no-verify',
    regex: /\B--no-verify\b/,
    reason: '--no-verify bypasses pre-commit hooks. Fix the underlying issue instead.',
  },
  {
    id: 'rm-root',
    regex: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\b|--recursive\b)[^|;&]*?(\s\/\s*$|\s~\s*$|\s\$HOME\b\s*$|\s\.\s*$)/,
    reason: 'rm -rf targeting /, ~, $HOME, or . is catastrophic.',
  },
  {
    id: 'pipe-to-shell',
    regex: /(^|[;&|]\s*)(curl|wget|fetch)\b[^|;&]*\|\s*(sudo\s+)?(bash|sh|zsh|fish|dash)\b/,
    reason: 'Piping fetched content to a shell is remote code execution.',
  },

  // Secret-bearing file reads
  {
    id: 'read-dotenv',
    regex: /\b(cat|less|head|tail|more|bat)\s+(?:[^|;&\s]*\/)?\.env(\.[^\s|;&]+)?(?:\s|$|[;&|])/,
    reason: 'Reading .env exposes secrets. Use the specific env var or the Read tool.',
  },
  {
    id: 'read-ssh-key',
    regex: /\b(cat|less|head|tail|more|bat)\s+[^|;&]*\b(id_rsa|id_ed25519|id_ecdsa|id_dsa)(?!\.pub\b)\b/,
    reason: 'Reading SSH private key. There is no safe LLM use case.',
  },
  {
    id: 'read-aws-credentials',
    regex: /\b(cat|less|head|tail|more|bat)\s+[^|;&]*\.aws\/credentials\b/,
    reason: 'Reading AWS credentials. Use AWS_PROFILE or credential helpers instead.',
  },
  {
    id: 'read-gcp-credentials',
    regex: /\b(cat|less|head|tail|more|bat)\s+[^|;&]*\.config\/gcloud\/[^\s|;&]*(credentials|tokens|adc|application_default)/i,
    reason: 'Reading GCloud credentials. Use gcloud auth or ADC properly instead.',
  },
  {
    id: 'read-gcp-service-account',
    regex: /\b(cat|less|head|tail|more|bat)\s+[^|;&]*service[_-]?account[^\s|;&]*\.json\b/i,
    reason: 'Reading GCP service account JSON. Use workload identity or env-injected credentials instead.',
  },

  // Cloud CLI calls — user authorization required.
  // Prefix allows optional `sudo` and `VAR=value` env-var assignments.
  {
    id: 'gcloud-command',
    regex: /(^|[;&|]\s*)(sudo\s+)?(?:[A-Z_][A-Z0-9_]*=\S+\s+)*gcloud(?=\s|$|[;&|])/,
    reason: 'gcloud commands modify cloud state or read sensitive data. User authorization required.',
  },
  {
    id: 'aws-command',
    regex: /(^|[;&|]\s*)(sudo\s+)?(?:[A-Z_][A-Z0-9_]*=\S+\s+)*aws(?=\s|$|[;&|])/,
    reason: 'aws CLI commands modify cloud state or read sensitive data. User authorization required.',
  },
];

function matchDangerous(cmd) {
  const text = String(cmd == null ? '' : cmd);
  for (const p of PATTERNS) {
    if (p.regex.test(text)) return p;
  }
  return null;
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

function main() {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return;

  let payload;
  try {
    payload = parsePayload(readStdinSync());
  } catch (err) {
    console.error(`pre-bash: payload parse error: ${err.message}`);
    return; // fail-open
  }

  const cmd = getCommand(payload);
  const hit = matchDangerous(cmd);
  if (hit) {
    emitDeny(hit, cmd);
    process.exit(2); // belt-and-suspenders: JSON deny + exit code
  }
}

if (require.main === module) main();

module.exports = { PATTERNS, matchDangerous };
