#!/usr/bin/env node
'use strict';

// pre-secrets.js — PreToolUse(Read|Edit|Write|MultiEdit|Bash) secret guard.
// One hook, one concern, one pattern array. Dispatches on tool_name:
//   - Read|Edit|Write|MultiEdit → match against tool_input.file_path
//   - Bash                      → tokenize tool_input.command, then match each
//                                 token against the same file_path patterns
// Result: any reference to a secret-bearing path — read, write, move, delete,
// list — is blocked, whether the tool is Read or Bash. ALLOWLIST applies in
// both directions.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Fail-open on payload parse errors.

const { emitDeny } = require('./lib/guard.js');
const {
  readStdinSync,
  parsePayload,
  getCommand,
  getFilePath,
  getPatch,
} = require('./lib/payload.js');

// Skip these even when they would otherwise match the dotenv pattern — they're
// templates and intentionally tracked in version control.
const ALLOWLIST = [
  /\.env\.example$/i,
  /\.env\.sample$/i,
  /\.env\.template$/i,
  /\.env\.schema$/i,
  /\.env\.defaults$/i,
];

const PATTERNS = [
  {
    id: 'read-dotenv',
    regex: /(?:^|\/)\.env(?:\.[^/]*)?$/,
    reason: 'Reading/writing .env files exposes or corrupts secrets. Use environment variables or a secrets manager.',
  },
  {
    id: 'read-ssh-key',
    regex: /(?:^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/,
    reason: 'Accessing SSH private key. There is no safe LLM use case.',
  },
  {
    id: 'read-aws-credentials',
    regex: /(?:^|\/)\.aws\/credentials$/,
    reason: 'Accessing AWS credentials. Use AWS_PROFILE or credential helpers instead.',
  },
  {
    id: 'read-gcp-credentials',
    regex: /(?:^|\/)\.config\/gcloud\/[^/]*(credentials|tokens|adc|application_default)/i,
    reason: 'Accessing GCloud credentials. Use gcloud auth or ADC properly instead.',
  },
  {
    id: 'read-gcp-service-account',
    regex: /service[_-]?account[^/]*\.json$/i,
    reason: 'Accessing GCP service account JSON. Use workload identity or env-injected credentials instead.',
  },
  {
    id: 'read-key-material',
    regex: /\.(pem|key)$/i,
    reason: 'Accessing key material (.pem/.key). There is no safe LLM use case.',
  },
  {
    id: 'read-netrc',
    regex: /(?:^|\/)\.netrc$/,
    reason: 'Accessing .netrc exposes stored credentials. Use a credential helper instead.',
  },
];

function matchFilePath(filePath) {
  const text = String(filePath == null ? '' : filePath);
  if (!text) return null;
  for (const allow of ALLOWLIST) {
    if (allow.test(text)) return null;
  }
  for (const p of PATTERNS) {
    if (p.regex.test(text)) return p;
  }
  return null;
}

function matchBashCommand(command) {
  const text = String(command == null ? '' : command);
  if (!text) return null;
  // Tokenize on whitespace + shell separators, then apply the same path
  // matcher (which consults ALLOWLIST) to each token. Any reference to a
  // secret path — read, write, move, delete, list — is treated as a hit.
  const tokens = text.split(/[\s|;&]+/).filter(Boolean);
  for (const tok of tokens) {
    const hit = matchFilePath(tok);
    if (hit) return hit;
  }
  return null;
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit']);

function main() {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return;

  let payload;
  try {
    payload = parsePayload(readStdinSync());
  } catch (err) {
    console.error(`pre-secrets: payload parse error: ${err.message}`);
    return; // fail-open
  }

  const tool = payload && payload.tool_name;
  let value = '';
  let hit = null;
  let kind = '';

  if (tool === 'Bash') {
    value = getCommand(payload);
    hit = matchBashCommand(value);
    kind = 'Bash command';
  } else if (tool === 'apply_patch') {
    value = getPatch(payload);
    hit = matchBashCommand(value);
    kind = 'apply_patch';
  } else if (FILE_TOOLS.has(tool)) {
    value = getFilePath(payload);
    hit = matchFilePath(value);
    kind = 'file path';
  }

  if (hit) {
    emitDeny(hit, value, kind);
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = { PATTERNS, ALLOWLIST, matchFilePath, matchBashCommand };
