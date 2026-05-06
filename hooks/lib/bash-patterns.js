'use strict';

const DANGEROUS_PATTERNS = [
  { name: 'no-verify', re: /\B--no-verify\b/ },
  {
    name: 'rm root/home/cwd',
    re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*\b|--recursive\b)[^|;&]*?(\s\/\s*$|\s~\s*$|\s\$HOME\b\s*$|\s\.\s*$)/,
  },
  {
    name: 'pipe to shell',
    re: /(^|[;&|]\s*)(curl|wget|fetch)\b[^|;&]*\|\s*(sudo\s+)?(bash|sh|zsh|fish|dash)\b/,
  },
];

function matchDangerous(cmd) {
  const text = String(cmd || '');
  for (const { name, re } of DANGEROUS_PATTERNS) {
    if (re.test(text)) return { name };
  }
  return null;
}

module.exports = { DANGEROUS_PATTERNS, matchDangerous };
