'use strict';

const SECRET_PATTERNS = [
  { name: 'AWS Access Key',    re: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub PAT',        re: /gh[ps]_[A-Za-z0-9]{36,}/ },
  { name: 'Private Key Header', re: /-----BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'GCP API Key',       re: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'GCP OAuth Access Token', re: /ya29\.[0-9A-Za-z\-_]{20,}/ },
  { name: 'GCP OAuth Client Secret', re: /GOCSPX-[0-9A-Za-z\-_]{28}/ },
  { name: 'GCP Service Account', re: /"type"\s*:\s*"service_account"/ },
  { name: 'Generic password',  re: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i },
  { name: 'Generic API key',   re: /(api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/i },
];

function scanText(text) {
  const lines = String(text).split('\n');
  const matches = [];
  for (const { name, re } of SECRET_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        matches.push({ name, line: i + 1 });
      }
    }
  }
  return matches;
}

module.exports = { SECRET_PATTERNS, scanText };
