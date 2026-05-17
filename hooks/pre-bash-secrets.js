#!/usr/bin/env node
'use strict';

// pre-bash-secrets.js — PreToolUse(Bash) secret-file read guard.
// Blocks shell commands that would expose secrets via stdout (cat/less/head/...).
// See pre-bash-commands.js for destructive-action and cloud-CLI protection.

const { makeMatcher, runGuard } = require('./lib/bash-guard.js');

const PATTERNS = [
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
];

const matchDangerous = makeMatcher(PATTERNS);

if (require.main === module) {
  runGuard({ name: 'pre-bash-secrets', matchDangerous });
}

module.exports = { PATTERNS, matchDangerous };
