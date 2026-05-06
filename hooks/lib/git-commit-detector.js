'use strict';

function isGitCommit(cmd) {
  const text = String(cmd || '').trimStart();
  // Match: git commit (with possible flags after) — top-level command only.
  return /^git\s+commit(\s|$)/.test(text);
}

module.exports = { isGitCommit };
