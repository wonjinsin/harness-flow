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
    caseInsensitive: false,
    globs: ['.env', '**/.env', '.env.*', '**/.env.*'],
    reason: 'Reading/writing .env files exposes or corrupts secrets. Use environment variables or a secrets manager.',
  },
  {
    id: 'read-ssh-key',
    caseInsensitive: false,
    globs: ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', '**/id_rsa', '**/id_dsa', '**/id_ecdsa', '**/id_ed25519'],
    reason: 'Accessing SSH private key. There is no safe LLM use case.',
  },
  {
    id: 'read-aws-credentials',
    caseInsensitive: false,
    globs: ['.aws/credentials', '**/.aws/credentials'],
    reason: 'Accessing AWS credentials. Use AWS_PROFILE or credential helpers instead.',
  },
  {
    id: 'read-gcp-credentials',
    caseInsensitive: true,
    globs: ['credentials', 'tokens', 'adc', 'application_default'].flatMap((marker) => [
      `.config/gcloud/*${marker}*`,
      `.config/gcloud/*${marker}*/**`,
      `**/.config/gcloud/*${marker}*`,
      `**/.config/gcloud/*${marker}*/**`,
    ]),
    reason: 'Accessing GCloud credentials. Use gcloud auth or ADC properly instead.',
  },
  {
    id: 'read-gcp-service-account',
    caseInsensitive: true,
    globs: [
      '*service-account*.json',
      '*service_account*.json',
      '*serviceaccount*.json',
      '**/*service-account*.json',
      '**/*service_account*.json',
      '**/*serviceaccount*.json',
    ],
    reason: 'Accessing GCP service account JSON. Use workload identity or env-injected credentials instead.',
  },
  {
    id: 'read-key-material',
    caseInsensitive: true,
    globs: ['*.pem', '*.key', '**/*.pem', '**/*.key'],
    reason: 'Accessing key material (.pem/.key). There is no safe LLM use case.',
  },
  {
    id: 'read-netrc',
    caseInsensitive: false,
    globs: ['.netrc', '**/.netrc'],
    reason: 'Accessing .netrc exposes stored credentials. Use a credential helper instead.',
  },
];

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

function escapeGlobLiteral(value) {
  return value.replace(/\[/g, '[[]').replace(/\*/g, '[*]').replace(/\?/g, '[?]');
}

function matchFilePath(filePath) {
  const text = normalizeConcretePath(filePath);
  if (!text) return null;
  if (isAllowlistedPath(text)) return null;
  const literalPattern = escapeGlobLiteral(text);
  for (const pattern of PATTERNS) {
    if (pattern.globs.some((glob) => globPatternsIntersect(literalPattern, glob, pattern.caseInsensitive))) {
      return pattern;
    }
  }
  return null;
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

function matchPathPattern(filePath, shellEncoded = false) {
  const normalized = normalizeConcretePath(filePath);
  const direct = matchFilePath(normalized);
  if (direct || !/[*?[\]{}]/.test(normalized)) return direct;
  if (
    normalized.length > MAX_PATTERN_LENGTH
    || normalized.includes('[[:')
    || normalized.includes('[[.')
    || normalized.includes('[[=')
  ) return COMPLEX_PATTERN_MATCH;

  const braces = expandBraces(normalized);
  if (braces.truncated) return COMPLEX_PATTERN_MATCH;
  for (const expanded of braces.values) {
    if (/[{}]/.test(expanded)) return COMPLEX_PATTERN_MATCH;
    if (isAllowlistedPath(expanded)) continue;
    const exact = matchFilePath(expanded);
    if (exact) return exact;
    if (!/[*?[\]]/.test(expanded)) continue;
    const wildcardExclusions = shellEncoded ? SHELL_LITERAL_GLOB_RANGES : [];
    for (const pattern of PATTERNS) {
      for (const protectedGlob of pattern.globs) {
        if (globPatternsIntersect(expanded, protectedGlob, pattern.caseInsensitive, wildcardExclusions)) return pattern;
      }
    }
  }
  return null;
}

function normalizeShellToken(token) {
  return token.replace(/^[('"`]+/, '').replace(/[)'"`,]+$/, '');
}

function decodeCodePoint(value, radix) {
  const codePoint = Number.parseInt(value, radix);
  if (codePoint === 0) return '';
  return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\uFFFD';
}

function decodeAnsiCString(value) {
  const escapes = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
  let decoded = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== '\\' || index + 1 >= value.length) {
      decoded += character;
      continue;
    }

    const escape = value[index + 1];
    if (escape === 'c' && index + 2 < value.length) {
      const controlCode = value[index + 2].toUpperCase().charCodeAt(0) & 0x1f;
      if (controlCode !== 0) decoded += String.fromCodePoint(controlCode);
      index += 2;
      continue;
    }

    const limits = { x: [16, 2], u: [16, 4], U: [16, 8] };
    if (limits[escape]) {
      const [radix, maximum] = limits[escape];
      const matcher = radix === 16 ? /[0-9a-fA-F]/ : /[0-7]/;
      let end = index + 2;
      while (end < value.length && end < index + 2 + maximum && matcher.test(value[end])) end += 1;
      if (end > index + 2) {
        decoded += decodeCodePoint(value.slice(index + 2, end), radix);
        index = end - 1;
        continue;
      }
    } else if (/[0-7]/.test(escape)) {
      let end = index + 1;
      while (end < value.length && end < index + 4 && /[0-7]/.test(value[end])) end += 1;
      decoded += decodeCodePoint(value.slice(index + 1, end), 8);
      index = end - 1;
      continue;
    }

    if (Object.hasOwn(escapes, escape)) decoded += escapes[escape];
    else if ('\\\'"?'.includes(escape)) decoded += escape;
    else if (escape === '\n') decoded += '';
    else decoded += `\\${escape}`;
    index += 1;
  }
  return decoded;
}

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

function tokenizeShellWords(text) {
  const tokens = [];
  let token = '';
  let globPattern = '';
  let quote = '';
  let ansiBuffer = '';
  let hasUnquotedGlob = false;
  const append = (value, patternActive = false) => {
    token += value;
    globPattern += patternActive ? value : encodeShellLiteralGlobs(value);
    if (patternActive && /[*?[{]/.test(value)) hasUnquotedGlob = true;
  };
  const push = () => {
    if (token) tokens.push({ value: token, globPattern, hasUnquotedGlob });
    token = '';
    globPattern = '';
    hasUnquotedGlob = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote === 'ansi') {
      if (character === '\\' && index + 1 < text.length) {
        ansiBuffer += character + text[index + 1];
        index += 1;
      } else if (character === "'") {
        append(decodeAnsiCString(ansiBuffer));
        ansiBuffer = '';
        quote = '';
      } else {
        ansiBuffer += character;
      }
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = '';
      else append(character);
      continue;
    }
    if (quote === '"' || quote === '`') {
      if (character === quote) {
        quote = '';
        continue;
      }
      if (character === '\\' && index + 1 < text.length) {
        const next = text[index + 1];
        if (next === '\n') {
          index += 1;
          continue;
        }
        if (quote === '`' || '$`"\\'.includes(next)) {
          append(next);
          index += 1;
          continue;
        }
      }
      append(character);
      continue;
    }

    if (character === '$' && text[index + 1] === "'") {
      quote = 'ansi';
      ansiBuffer = '';
      index += 1;
      continue;
    }
    if (character === '$' && text[index + 1] === '"') {
      quote = '"';
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '\\' && index + 1 < text.length) {
      const next = text[index + 1];
      if (next !== '\n') append(next);
      index += 1;
      continue;
    }
    if (/[\s|;&<>()]/.test(character)) {
      push();
      continue;
    }
    append(character, true);
  }
  if (quote === 'ansi') append(`$'${ansiBuffer}`);
  push();
  return tokens;
}

function extractFirstCommandSubstitutionTail(text) {
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote === "'") {
      if (character === "'") quote = '';
      continue;
    }
    if (quote === 'ansi') {
      if (character === '\\' && index + 1 < text.length) index += 1;
      else if (character === "'") quote = '';
      continue;
    }
    if (quote === '"') {
      if (character === '\\' && index + 1 < text.length) {
        index += 1;
        continue;
      }
      if (character === '"') {
        quote = '';
        continue;
      }
    } else {
      if (character === '\\' && index + 1 < text.length) {
        index += 1;
        continue;
      }
      if (character === '$' && text[index + 1] === "'") {
        quote = 'ansi';
        index += 1;
        continue;
      }
      if (character === "'") {
        quote = "'";
        continue;
      }
      if (character === '"') {
        quote = '"';
        continue;
      }
    }

    if (character === '$' && text[index + 1] === '(' && text[index + 2] !== '(') {
      return text.slice(index + 2);
    }
    if (character === '`') return text.slice(index + 1);
  }
  return null;
}

function unwrapApplyPatchHeredoc(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  const trimmed = lines.slice(start, end);
  const first = trimmed[0]?.trim();
  const last = trimmed[trimmed.length - 1]?.trim();
  if (trimmed.length >= 2 && ['<<EOF', "<<'EOF'", '<<"EOF"'].includes(first) && last === 'EOF') {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function matchApplyPatchPayload(text) {
  const lines = unwrapApplyPatchHeredoc(text.split('\n').map((line) => line.replace(/\r$/, '')));
  const firstContentLine = lines.find((line) => line.trim() !== '') || '';
  if (!/^\s*\*{3}\s+Begin Patch\s*$/.test(firstContentLine)) return { recognized: false, hit: null };

  for (const line of lines) {
    const target = /^\s*\*{3}\s+(?:Add|Update|Delete) File:\s*(.*?)\s*$/.exec(line)?.[1]
      || /^\s*\*{3}\s+Move to:\s*(.*?)\s*$/.exec(line)?.[1];
    if (!target) continue;
    const hit = matchPathPattern(target);
    if (hit) return { recognized: true, hit };
  }
  return { recognized: true, hit: null };
}

function matchBashCommand(command, substitutionDepth = 0) {
  const text = String(command == null ? '' : command);
  if (!text) return null;
  const patch = matchApplyPatchPayload(text);
  if (patch.recognized) return patch.hit;

  const substitutionTail = extractFirstCommandSubstitutionTail(text);
  if (substitutionTail != null) {
    if (substitutionDepth >= 8) return COMPLEX_PATTERN_MATCH;
    const nestedHit = matchBashCommand(substitutionTail, substitutionDepth + 1);
    if (nestedHit) return nestedHit;
  }

  // Parse shell words so adjacent quoted fragments and backslash escapes are
  // inspected as the path Bash will actually pass to the command.
  const tokens = tokenizeShellWords(text);
  for (const token of tokens) {
    const value = normalizeShellToken(token.value);
    const hit = token.hasUnquotedGlob
      ? matchPathPattern(normalizeShellToken(token.globPattern), true)
      : matchFilePath(value);
    if (hit) return hit;

    // Whitespace can only survive inside a quoted shell word. Preserve the
    // historical conservative check for explicit secret basenames in prose,
    // but never reinterpret those quoted fragments as active globs.
    for (const candidate of value.split(/\s+/).filter(Boolean)) {
      const concreteHit = matchFilePath(candidate);
      if (concreteHit) return concreteHit;
    }
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
    return; // Exit 0 so the runtime parses the deny JSON on stdout.
  }
}

if (require.main === module) {
  main();
}

module.exports = { PATTERNS, ALLOWLIST, matchFilePath, matchPathPattern, matchBashCommand };
