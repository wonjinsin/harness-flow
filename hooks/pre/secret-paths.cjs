'use strict';
const legacyGuard = require('../pre-secrets.js');

const SHELL_LITERAL_GLOB_SENTINELS = new Map([
  ['*', '\uE000'],
  ['?', '\uE001'],
  ['[', '\uE002'],
  [']', '\uE003'],
  ['{', '\uE004'],
  ['}', '\uE005'],
]);
const SHELL_LITERAL_GLOB_RANGES = [...SHELL_LITERAL_GLOB_SENTINELS.values()]
  .map((character) => {
    const code = character.charCodeAt(0);
    return [code, code];
  });

function encodeShellLiteralGlobs(value) {
  return [...value].map((character) => SHELL_LITERAL_GLOB_SENTINELS.get(character) || character).join('');
}

const { ALLOWLIST } = legacyGuard;
const GLOB_TARGETS = {
  'read-dotenv': ['.env', '**/.env', '.env.*', '**/.env.*'],
  'read-ssh-key': ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', '**/id_rsa', '**/id_dsa', '**/id_ecdsa', '**/id_ed25519'],
  'read-aws-credentials': ['.aws/credentials', '**/.aws/credentials'],
  'read-gcp-credentials': ['credentials', 'tokens', 'adc', 'application_default'].flatMap((marker) => [
    `.config/gcloud/*${marker}*`,
    `.config/gcloud/*${marker}*/**`,
    `**/.config/gcloud/*${marker}*`,
    `**/.config/gcloud/*${marker}*/**`,
  ]),
  'read-gcp-service-account': [
    '*service-account*.json', '*service_account*.json', '*serviceaccount*.json',
    '**/*service-account*.json', '**/*service_account*.json', '**/*serviceaccount*.json',
  ],
  'read-key-material': ['*.pem', '*.key', '**/*.pem', '**/*.key'],
  'read-netrc': ['.netrc', '**/.netrc'],
};
const PATTERNS = legacyGuard.PATTERNS.map((pattern) => ({
  ...pattern,
  caseInsensitive: pattern.regex.ignoreCase,
  globs: GLOB_TARGETS[pattern.id],
}));

const MAX_PATTERN_EXPANSIONS = 128;
const MAX_PATTERN_LENGTH = 4096;
const COMPLEX_PATTERN_MATCH = {
  id: 'read-secret-pattern',
  reason: 'Path pattern is too complex to verify safely. Use explicit non-secret paths instead.',
};

function stripOuterQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (first === '"' || first === "'") && first === last ? trimmed.slice(1, -1) : trimmed;
}

function normalizeConcretePath(filePath) {
  return stripOuterQuotes(String(filePath == null ? '' : filePath)).replace(/\\/g, '/');
}

function isAllowlistedPath(filePath) {
  return ALLOWLIST.some((allow) => allow.test(filePath));
}

function matchFilePath(filePath, { literal = false } = {}) {
  const text = literal ? String(filePath == null ? '' : filePath) : normalizeConcretePath(filePath);
  return legacyGuard.matchFilePath(text);
}

function splitBraceAlternatives(body) {
  const alternatives = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '\\' && index + 1 < body.length) {
      index += 1;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === ',' && depth === 0) {
      alternatives.push(body.slice(start, index));
      start = index + 1;
    }
  }
  alternatives.push(body.slice(start));
  return alternatives.length > 1 ? alternatives : null;
}

function firstExpandableBrace(value) {
  const stack = [];
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\' && index + 1 < value.length) {
      index += 1;
      continue;
    }
    if (character === '{') {
      stack.push(index);
      continue;
    }
    if (character !== '}' || stack.length === 0) continue;
    const start = stack.pop();
    const alternatives = splitBraceAlternatives(value.slice(start + 1, index));
    if (alternatives) return { start, end: index, alternatives };
  }
  return null;
}

function expandBraces(value) {
  const queue = [value];
  const expanded = [];
  while (queue.length > 0) {
    const current = queue.shift();
    const group = firstExpandableBrace(current);
    if (!group) {
      expanded.push(current);
      continue;
    }
    if (queue.length + expanded.length + group.alternatives.length > MAX_PATTERN_EXPANSIONS) {
      return { values: expanded.concat(queue, current), truncated: true };
    }
    for (const alternative of group.alternatives) {
      queue.push(current.slice(0, group.start) + alternative + current.slice(group.end + 1));
    }
  }
  return { values: expanded, truncated: false };
}

const MAX_CODE_UNIT = 0xffff;
const SLASH_CODE_UNIT = '/'.charCodeAt(0);
const NO_SLASH_RANGES = [
  [0, SLASH_CODE_UNIT - 1],
  [SLASH_CODE_UNIT + 1, MAX_CODE_UNIT],
];
const ALL_RANGES = [[0, MAX_CODE_UNIT]];
function normalizeRanges(ranges) {
  const sorted = ranges
    .map(([start, end]) => [Math.max(0, Math.min(start, end)), Math.min(MAX_CODE_UNIT, Math.max(start, end))])
    .filter(([start, end]) => start <= end)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range[0] > previous[1] + 1) merged.push([...range]);
    else previous[1] = Math.max(previous[1], range[1]);
  }
  return merged;
}

function subtractRanges(base, excluded) {
  let result = normalizeRanges(base);
  for (const [excludeStart, excludeEnd] of normalizeRanges(excluded)) {
    const next = [];
    for (const [start, end] of result) {
      if (excludeEnd < start || excludeStart > end) next.push([start, end]);
      else {
        if (excludeStart > start) next.push([start, excludeStart - 1]);
        if (excludeEnd < end) next.push([excludeEnd + 1, end]);
      }
    }
    result = next;
  }
  return result;
}

function rangesIntersect(left, right) {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const [leftStart, leftEnd] = left[leftIndex];
    const [rightStart, rightEnd] = right[rightIndex];
    if (Math.max(leftStart, rightStart) <= Math.min(leftEnd, rightEnd)) return true;
    if (leftEnd < rightEnd) leftIndex += 1;
    else rightIndex += 1;
  }
  return false;
}

function literalRanges(character, caseInsensitive) {
  const variants = new Set([character]);
  if (caseInsensitive && /[A-Za-z]/.test(character)) {
    variants.add(character.toLowerCase());
    variants.add(character.toUpperCase());
  }
  return normalizeRanges([...variants].map((value) => {
    const code = value.charCodeAt(0);
    return [code, code];
  }));
}

function parseCharacterClass(pattern, start) {
  let searchFrom = start + 1;
  if (pattern[searchFrom] === '!' || pattern[searchFrom] === '^') searchFrom += 1;
  if (pattern[searchFrom] === ']') searchFrom += 1;
  let end = searchFrom;
  while (end < pattern.length && pattern[end] !== ']') end += 1;
  if (end >= pattern.length) return null;

  let body = pattern.slice(start + 1, end);
  let negated = false;
  if (body.startsWith('!') || body.startsWith('^')) {
    negated = true;
    body = body.slice(1);
  }
  if (!body) return null;

  const ranges = [];
  for (let index = 0; index < body.length; index += 1) {
    const startCode = body.charCodeAt(index);
    if (index + 2 < body.length && body[index + 1] === '-') {
      ranges.push([startCode, body.charCodeAt(index + 2)]);
      index += 2;
    } else {
      ranges.push([startCode, startCode]);
    }
  }
  const normalized = normalizeRanges(ranges);
  return {
    end,
    ranges: negated ? subtractRanges(NO_SLASH_RANGES, normalized) : subtractRanges(normalized, [[SLASH_CODE_UNIT, SLASH_CODE_UNIT]]),
  };
}

function tokenizeGlob(pattern, caseInsensitive = false, excludedWildcardRanges = []) {
  const tokens = [];
  const nonSlashWildcardRanges = subtractRanges(NO_SLASH_RANGES, excludedWildcardRanges);
  // A recursive ** represents directory prefixes, so it must still traverse
  // directories whose literal names contain quoted glob metacharacters.
  const recursiveWildcardRanges = ALL_RANGES;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      let end = index;
      while (pattern[end + 1] === '*') end += 1;
      const recursive = end > index;
      tokens.push({ star: true, ranges: recursive ? recursiveWildcardRanges : nonSlashWildcardRanges });
      index = end;
      continue;
    }
    if (character === '?') {
      tokens.push({ star: false, ranges: nonSlashWildcardRanges });
      continue;
    }
    if (character === '[') {
      const characterClass = parseCharacterClass(pattern, index);
      if (characterClass) {
        tokens.push({ star: false, ranges: subtractRanges(characterClass.ranges, excludedWildcardRanges) });
        index = characterClass.end;
        continue;
      }
    }
    tokens.push({ star: false, ranges: literalRanges(character, caseInsensitive) });
  }
  return tokens;
}

function globPatternsIntersect(leftPattern, rightPattern, rightCaseInsensitive, rightWildcardExclusions = []) {
  const left = tokenizeGlob(leftPattern);
  const right = tokenizeGlob(rightPattern, rightCaseInsensitive, rightWildcardExclusions);
  const queue = [[0, 0]];
  const seen = new Set();
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const [leftIndex, rightIndex] = queue[queueIndex];
    queueIndex += 1;
    const key = `${leftIndex}:${rightIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (leftIndex === left.length && rightIndex === right.length) return true;

    const leftToken = left[leftIndex];
    const rightToken = right[rightIndex];
    if (leftToken?.star) queue.push([leftIndex + 1, rightIndex]);
    if (rightToken?.star) queue.push([leftIndex, rightIndex + 1]);
    if (!leftToken || !rightToken || !rangesIntersect(leftToken.ranges, rightToken.ranges)) continue;

    queue.push([
      leftToken.star ? leftIndex : leftIndex + 1,
      rightToken.star ? rightIndex : rightIndex + 1,
    ]);
  }
  return false;
}

// Directory scopes are derived from the canonical rules, never a second policy.
const SEARCH_SCOPES = new Map();
for (const pattern of PATTERNS) {
  for (const glob of pattern.globs) {
    const directories = glob.replace(/^\*\*\//, '').split('/').slice(0, -1);
    const firstWildcard = directories.findIndex((part) => /[*?[\]{}]/.test(part));
    const scope = (firstWildcard < 0 ? directories : directories.slice(0, firstWildcard)).join('/');
    if (scope) SEARCH_SCOPES.set(`${pattern.caseInsensitive}:${scope}`, { scope, caseInsensitive: pattern.caseInsensitive });
  }
}

function hasLiteralGlobText(value) {
  return tokenizeGlob(value).some((token) => (
    !token.star && token.ranges.length === 1 && token.ranges[0][0] === token.ranges[0][1]
  ));
}

function inspectSearchPattern(value) {
  const parts = value.split('/');
  const inspected = [];
  let scoped = false;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === '**') {
      if (scoped) inspected.push(part);
      else if (index === parts.length - 1) inspected.push('*');
      continue;
    }
    inspected.push(part);
    if (!scoped && hasLiteralGlobText(part)) {
      const prefix = inspected.join('/');
      for (const { scope, caseInsensitive } of SEARCH_SCOPES.values()) {
        if (
          globPatternsIntersect(prefix, scope, caseInsensitive)
          || globPatternsIntersect(prefix, `**/${scope}`, caseInsensitive)
        ) {
          scoped = true;
          break;
        }
      }
    }
  }
  return inspected.join('/');
}

function matchPathPattern(filePath, { shellEncoded = false, search = false, uri = false } = {}) {
  let normalized = normalizeConcretePath(filePath);
  if (uri) {
    try {
      normalized = normalized.replace(/(?:%[0-9a-f]{2})+/gi, (run) => encodeShellLiteralGlobs(decodeURIComponent(run)));
    } catch {
      // The runtime rejects malformed URI encodings before searching files.
      return null;
    }
  }
  const literal = uri && process.platform !== 'win32';
  const direct = matchFilePath(normalized, { literal });
  if (direct || !/[*?[\]{}]/.test(normalized)) return direct;
  if (
    normalized.length > MAX_PATTERN_LENGTH
    || normalized.includes('[[:')
    || normalized.includes('[[.')
    || normalized.includes('[[=')
  ) return COMPLEX_PATTERN_MATCH;

  const braces = expandBraces(normalized);
  if (braces.truncated) return COMPLEX_PATTERN_MATCH;
  // Search traversal does not establish a protected directory scope. Inspect
  // the components the caller actually names instead of inventing hidden
  // credential directories under every recursive wildcard.
  for (const expanded of braces.values) {
    if (/[{}]/.test(expanded)) return COMPLEX_PATTERN_MATCH;
    if (isAllowlistedPath(expanded)) continue;
    const exact = matchFilePath(expanded, { literal });
    if (exact) return exact;
    if (!/[*?[\]]/.test(expanded)) continue;
    const inspected = search ? inspectSearchPattern(expanded) : expanded;
    const basename = inspected.slice(inspected.lastIndexOf('/') + 1);
    const extensionIndex = basename.lastIndexOf('.');
    const hasExtension = extensionIndex > 0;
    const stem = hasExtension ? basename.slice(0, extensionIndex) : basename;
    const broadBasename = search && !hasLiteralGlobText(stem);
    const wildcardExclusions = shellEncoded || uri ? SHELL_LITERAL_GLOB_RANGES : [];
    for (const pattern of PATTERNS) {
      for (const protectedGlob of pattern.globs) {
        const protectedName = protectedGlob.replace(/^\*\*\//, '');
        if (
          broadBasename
          && !protectedName.includes('/')
          && !(hasExtension && protectedName.startsWith('*.'))
        ) continue;
        if (globPatternsIntersect(inspected, protectedGlob, pattern.caseInsensitive, wildcardExclusions)) return pattern;
      }
    }
  }
  return null;
}

module.exports = {
  matchFilePath,
  matchPathPattern,
  COMPLEX_PATTERN_MATCH,
  encodeShellLiteralGlobs,
};
