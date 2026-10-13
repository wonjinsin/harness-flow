'use strict';

const {
  matchFilePath,
  matchPathPattern,
  COMPLEX_PATTERN_MATCH,
  encodeShellLiteralGlobs,
} = require('./secret-paths.js');

function normalizeShellToken(token) {
  return token.replace(/^[('"`]+/, '').replace(/[)'"`,]+$/, '');
}

function decodeCodePoint(value, radix) {
  const codePoint = Number.parseInt(value, radix);
  return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\uFFFD';
}

function decodeAnsiCString(value) {
  const escapes = { a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
  let decoded = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\0') break;
    if (character !== '\\' || index + 1 >= value.length) {
      decoded += character;
      continue;
    }

    const escape = value[index + 1];
    if (escape === 'c' && index + 2 < value.length) {
      const controlCode = value[index + 2].toUpperCase().charCodeAt(0) & 0x1f;
      if (controlCode === 0) return decoded;
      decoded += String.fromCodePoint(controlCode);
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
        if (decoded.endsWith('\0')) return decoded.slice(0, -1);
        index = end - 1;
        continue;
      }
    } else if (/[0-7]/.test(escape)) {
      let end = index + 1;
      while (end < value.length && end < index + 4 && /[0-7]/.test(value[end])) end += 1;
      decoded += decodeCodePoint(value.slice(index + 1, end), 8);
      if (decoded.endsWith('\0')) return decoded.slice(0, -1);
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


function tokenizeShellWords(text) {
  const tokens = [];
  const substitutions = [];
  let token = '';
  let globPattern = '';
  let quote = '';
  let ansiBuffer = '';
  let hasUnquotedGlob = false;
  let quotedWord = false;
  let commandStart = true;
  let parentheses = 0;
  let cases = 0;
  const append = (value, patternActive = false) => {
    token += value;
    globPattern += patternActive ? value : encodeShellLiteralGlobs(value);
    if (patternActive && /[*?[{]/.test(value)) hasUnquotedGlob = true;
  };
  const push = () => {
    if (token) {
      if (commandStart && !quotedWord) {
        if (token === 'case') cases += 1;
        else if (token === 'esac' && cases > 0) cases -= 1;
      }
      commandStart = false;
      tokens.push({ value: token, globPattern, hasUnquotedGlob });
    }
    token = '';
    globPattern = '';
    hasUnquotedGlob = false;
    quotedWord = false;
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
    if (character === '\\' && index + 1 < text.length) {
      const next = text[index + 1];
      if (next === '\n') {
        index += 1;
        continue;
      }
      if (quote !== '"' || '$`"\\'.includes(next)) {
        append(next);
        quotedWord = true;
        index += 1;
        continue;
      }
    }

    const current = substitutions[substitutions.length - 1];
    if (character === '`' && current?.closing === '`') {
      push();
      ({ quote, commandStart, parentheses, cases } = substitutions.pop());
      quotedWord = Boolean(quote);
      continue;
    }
    const dollarSubstitution = character === '$' && text[index + 1] === '(' && text[index + 2] !== '(';
    if (dollarSubstitution || character === '`') {
      if (substitutions.length >= 8) return null;
      push();
      substitutions.push({ closing: dollarSubstitution ? ')' : '`', quote, commandStart, parentheses, cases });
      quote = '';
      commandStart = true;
      parentheses = 0;
      cases = 0;
      if (dollarSubstitution) index += 1;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = '';
      else append(character);
      continue;
    }
    if (character === '$' && text[index + 1] === "'") {
      quote = 'ansi';
      quotedWord = true;
      ansiBuffer = '';
      index += 1;
      continue;
    }
    if (character === '$' && text[index + 1] === '"') {
      quote = '"';
      quotedWord = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      quotedWord = true;
      continue;
    }
    if (character === '(') {
      push();
      if (cases === 0) parentheses += 1;
      commandStart = true;
      continue;
    }
    if (character === ')') {
      push();
      // A case pattern's ')' does not close the surrounding substitution.
      if (parentheses > 0) parentheses -= 1;
      else if (cases === 0 && current?.closing === ')') {
        ({ quote, commandStart, parentheses, cases } = substitutions.pop());
        quotedWord = Boolean(quote);
        continue;
      }
      commandStart = true;
      continue;
    }
    if (/[\s|;&<>]/.test(character)) {
      push();
      if (/[|;&\n]/.test(character)) commandStart = true;
      continue;
    }
    append(character, true);
  }
  if (quote === 'ansi') append(`$'${ansiBuffer}`);
  push();
  return tokens;
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

function matchBashCommand(command) {
  const text = String(command == null ? '' : command);
  if (!text) return null;
  const patch = matchApplyPatchPayload(text);
  if (patch.recognized) return patch.hit;

  // Parse shell words so adjacent quoted fragments and backslash escapes are
  // inspected as the path Bash will actually pass to the command.
  const tokens = tokenizeShellWords(text);
  if (!tokens) return COMPLEX_PATTERN_MATCH;
  for (const token of tokens) {
    const value = normalizeShellToken(token.value);
    const hit = token.hasUnquotedGlob
      ? matchPathPattern(normalizeShellToken(token.globPattern), { shellEncoded: true })
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

module.exports = { matchBashCommand };
