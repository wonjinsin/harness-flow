#!/usr/bin/env node
'use strict';

// pre-bash-commands.js — PreToolUse(Bash) destructive-action guard.
// Blocks high-confidence-malicious shell operations and unauthorized cloud CLI use.
// See pre-bash-secrets.js for secret-file read protection.

const { makeMatcher, runGuard } = require('./lib/bash-guard.js');

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

const matchDangerous = makeMatcher(PATTERNS);

if (require.main === module) {
  runGuard({ name: 'pre-bash-commands', matchDangerous });
}

module.exports = { PATTERNS, matchDangerous };
