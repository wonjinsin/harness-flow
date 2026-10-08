import bashGuard from '../pre-bash-commands.js';
import secretGuard from '../pre-secrets.js';

const { matchDangerous } = bashGuard;
const { matchBashCommand, matchPathPattern } = secretGuard;

const FILE_TOOLS = new Set(['read', 'grep', 'glob', 'edit', 'write', 'multiedit', 'multi_edit', 'delete', 'ast_edit']);
const PATCH_TOOLS = new Set(['apply_patch', 'patch']);
const HASHLINE_PATH_TOOLS = new Set(['edit', 'write', 'multiedit', 'multi_edit', 'delete']);
const SEARCH_TOOLS = new Set(['grep', 'glob', 'ast_edit']);
const READ_SELECTOR_RE = /:(?:raw|conflicts|img|-\d+|L?\d+(?:(?:\.\.|[-+])L?\d*)?(?:,L?\d+(?:(?:\.\.|[-+])L?\d*)?)*)$/i;
const QUERY_START_RE = /^\?[a-z_][\w-]*=/i;
const HASHLINE_TAG_RE = /#[0-9a-fA-F]{4}$/;
const EDIT_FILE_HEADER_RE = /^\s*\*{3}\s+(?:Add|Update|Delete)\s+File\s*:\s*(.+?)\s*$/i;
const EDIT_MOVE_HEADER_RE = /^\s*\*{3}\s+Move\s+to\s*:\s*(.+?)\s*$/i;
const SLOPPY_EDIT_HEADER_RE = /^\s*\*{3}[ \t]+Edit[ \t]+File(?::|[ \t]|$)[ \t]*(.*?)\s*$/i;
const HASHLINE_HEADER_RE = /^\s*\[[^#\r\n]+#[0-9a-fA-F]{4}\]\s*$/;
const HASHLINE_MOVE_RE = /^\s*MV(?:\s+|$)(.*?)\s*$/;

function blockResult(match) {
  if (!match) return undefined;
  return {
    block: true,
    reason: `[${match.id}] ${match.reason}\nStop here. Do NOT retry with a workaround. Ask the user how to proceed.`,
  };
}

function collectStringValues(value) {
  if (!value || typeof value !== 'object') return '';
  return Object.values(value)
    .filter((item) => typeof item === 'string')
    .join('\n');
}

function stripOuterQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  return (first === '"' || first === "'") && first === last ? trimmed.slice(1, -1) : trimmed;
}

function decodeQuotedPathLiteral(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const decoded = JSON.parse(trimmed);
      if (typeof decoded === 'string') return decoded;
    } catch {
      // Fall back to conservative quote stripping for malformed nested JSON.
    }
  }
  return stripOuterQuotes(trimmed);
}

function parseSloppyEditPath(value) {
  let path = value.trim();
  if (/^all$/i.test(path)) return '';
  path = path.replace(/\s+all$/i, '').trimEnd();
  return decodeQuotedPathLiteral(path);
}

function unwrapHashlineHeader(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return trimmed;

  const inner = trimmed.slice(1, -1);
  const tagStart = HASHLINE_TAG_RE.exec(inner)?.index;
  const path = tagStart === undefined ? inner : inner.slice(0, tagStart);
  if (!path || (tagStart === undefined && path.includes('#'))) return trimmed;
  return stripOuterQuotes(path);
}

function stripReadSelectors(value) {
  let path = value;
  while (READ_SELECTOR_RE.test(path)) path = path.replace(READ_SELECTOR_RE, '');
  return path;
}

function splitTopLevelPathList(value) {
  const parts = [];
  let braceDepth = 0;
  let quote = '';
  let query = false;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\' && index + 1 < value.length) {
      index += 1;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '?' && QUERY_START_RE.test(value.slice(index))) query = true;
    if (character === '{') {
      braceDepth += 1;
      continue;
    }
    if (character === '}') {
      if (braceDepth > 0) braceDepth -= 1;
      continue;
    }
    if (braceDepth !== 0 || (query ? character !== ';' : !/[\s,;]/.test(character))) continue;
    parts.push(value.slice(start, index));
    start = index + 1;
    query = false;
  }

  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

function expandStringPathValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed.flatMap(expandStringPathValue);
      }
    } catch {
      // Preserve non-JSON bracketed paths for hashline handling below.
    }
  }

  const sources = [...new Set([trimmed, stripOuterQuotes(trimmed)])];
  const candidates = new Set(sources);
  for (const source of sources) {
    for (const part of splitTopLevelPathList(source)) candidates.add(part);
  }
  return candidates.size > 0 ? [...candidates] : [trimmed];
}

function unwrapEditHeredoc(lines) {
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

function extractEditPayloadPaths(input) {
  const paths = [];
  for (const key of ['input', '_input', 'patch']) {
    const payload = input[key];
    if (typeof payload !== 'string') continue;

    const stripped = payload.startsWith('\uFEFF') ? payload.slice(1) : payload;
    const lines = unwrapEditHeredoc(stripped.split('\n').map((line) => line.replace(/\r$/, '')));
    const contentLines = lines.filter((line) => line.trim() !== '');
    const firstContentLine = contentLines[0] || '';
    const beginsApplyPatch = /^\s*\*{3}\s+Begin Patch\s*$/.test(firstContentLine);
    const wrappedHeader = beginsApplyPatch ? contentLines[1] || '' : '';
    const wrappedHashline = HASHLINE_HEADER_RE.test(wrappedHeader);
    const wrappedSloppy = SLOPPY_EDIT_HEADER_RE.test(wrappedHeader);
    const mode = wrappedHashline
      ? 'hashline'
      : wrappedSloppy
        ? 'sloppy'
        : beginsApplyPatch
          ? 'apply-patch'
          : SLOPPY_EDIT_HEADER_RE.test(firstContentLine)
            ? 'sloppy'
            : 'hashline';

    for (const line of lines) {
      if (mode === 'apply-patch') {
        const editPath = EDIT_FILE_HEADER_RE.exec(line)?.[1] || EDIT_MOVE_HEADER_RE.exec(line)?.[1];
        if (editPath) paths.push(editPath);
        continue;
      }

      if (mode === 'sloppy') {
        const sloppyPath = SLOPPY_EDIT_HEADER_RE.exec(line)?.[1];
        if (sloppyPath) {
          const decoded = parseSloppyEditPath(sloppyPath);
          if (decoded) paths.push(decoded);
        }
        continue;
      }

      const movePath = HASHLINE_MOVE_RE.exec(line)?.[1];
      if (movePath) {
        paths.push(decodeQuotedPathLiteral(movePath));
        continue;
      }

      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
        paths.push(trimmedLine);
        continue;
      }

      const legacy = line.trimStart();
      if (legacy.startsWith('¶')) {
        const body = legacy.replace(/^¶+/, '').trim();
        const tagStart = HASHLINE_TAG_RE.exec(body)?.index;
        paths.push(tagStart === undefined ? body : body.slice(0, tagStart));
      }
    }
  }
  return paths;
}

function collectPathValues(toolName, input) {
  const values = [input.path, input.file_path, input._path, input.paths, input.glob, input.include];
  if (toolName === 'glob') values.push(input.pattern);
  if (toolName === 'edit' || PATCH_TOOLS.has(toolName)) {
    values.push(...extractEditPayloadPaths(input));
    if (Array.isArray(input.edits)) {
      for (const edit of input.edits) {
        if (edit && typeof edit === 'object') values.push(edit.rename, edit.move, edit.to);
      }
    }
  }

  return values.flatMap((value) => {
    if (typeof value === 'string') return expandStringPathValue(value);
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === 'string').flatMap(expandStringPathValue);
    }
    return [];
  });
}

function stripPathQuery(toolName, value) {
  const index = value.indexOf('?');
  if (index < 0) return value;
  const uri = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  const fileQuery = (toolName === 'read' || toolName === 'grep') && QUERY_START_RE.test(value.slice(index));
  return uri || fileQuery ? value.slice(0, index) : value;
}

function canonicalizePath(toolName, value) {
  let path = decodeQuotedPathLiteral(value);
  if (HASHLINE_PATH_TOOLS.has(toolName)) path = unwrapHashlineHeader(path);
  path = stripReadSelectors(stripPathQuery(toolName, decodeQuotedPathLiteral(path))).trim();
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path)) {
    try {
      return decodeURIComponent(path);
    } catch {
      // Malformed URI encodings are rejected by the runtime before file access.
    }
  }
  return path;
}

function expandCompoundPathTargets(value) {
  const targets = new Set([value]);
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ':') continue;
    const suffix = value.slice(index + 1).replace(/^:+/, '');
    if (suffix) targets.add(suffix);
  }
  return targets;
}


function matchProtectedPath(toolName, input) {
  for (const path of collectPathValues(toolName, input)) {
    const canonical = canonicalizePath(toolName, path);
    for (const target of expandCompoundPathTargets(canonical)) {
      const normalizedTarget = stripReadSelectors(target);
      const match = matchPathPattern(normalizedTarget, { search: SEARCH_TOOLS.has(toolName) });
      if (match) return match;
    }
  }
  return null;
}

export function matchToolCall(event) {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return undefined;

  const toolName = typeof event?.toolName === 'string' ? event.toolName.toLowerCase() : '';
  const input = event?.input && typeof event.input === 'object' ? event.input : {};

  if (toolName === 'bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    return blockResult(matchDangerous(command) || matchBashCommand(command));
  }

  if (PATCH_TOOLS.has(toolName)) {
    return blockResult(matchProtectedPath(toolName, input) || matchBashCommand(collectStringValues(input)));
  }

  if (FILE_TOOLS.has(toolName)) {
    return blockResult(matchProtectedPath(toolName, input));
  }

  return undefined;
}

export default function registerHarnessFlowPreToolHook(pi) {
  pi.on('tool_call', async (event) => matchToolCall(event));
}
