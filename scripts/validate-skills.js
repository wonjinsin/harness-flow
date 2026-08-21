'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_LINES = 350;

function invalidScalar(file, errors) {
  errors.push(`${file}: invalid quoted frontmatter value`);
  return '';
}

function hasValidQuotedSuffix(raw, closing) {
  const suffix = raw.slice(closing + 1);
  return suffix === '' || /^\s+(?:#.*)?$/.test(suffix);
}

function unquote(raw, file, errors) {
  if (!raw) return '';
  if (raw.startsWith('"')) {
    let closing = -1;
    let escaped = false;
    for (let index = 1; index < raw.length; index += 1) {
      if (escaped) {
        escaped = false;
      } else if (raw[index] === '\\') {
        escaped = true;
      } else if (raw[index] === '"') {
        closing = index;
        break;
      }
    }
    if (closing === -1) return invalidScalar(file, errors);
    if (!hasValidQuotedSuffix(raw, closing)) return invalidScalar(file, errors);
    try {
      return JSON.parse(raw.slice(0, closing + 1));
    } catch {
      return invalidScalar(file, errors);
    }
  }
  if (raw.startsWith("'")) {
    let closing = -1;
    for (let index = 1; index < raw.length; index += 1) {
      if (raw[index] !== "'") continue;
      if (raw[index + 1] === "'") {
        index += 1;
      } else {
        closing = index;
        break;
      }
    }
    if (closing === -1) return invalidScalar(file, errors);
    if (!hasValidQuotedSuffix(raw, closing)) return invalidScalar(file, errors);
    return raw.slice(1, closing).replace(/''/g, "'");
  }

  const comment = raw.search(/(?:^|\s)#/);
  const value = (comment === -1 ? raw : raw.slice(0, comment)).trimEnd();
  const yamlNumber = /^[-+]?(?:(?:0b[01_]+|0o[0-7_]+|0x[\da-f_]+)|(?:(?:\d[\d_]*)(?:\.[\d_]*)?|\.[\d_]+)(?:e[-+]?\d[\d_]*)?|\.(?:inf|nan))$/i;
  const yamlTimestamp = /^\d{4}-\d{2}-\d{2}(?:$|[Tt ]\d{2}:\d{2})/;
  const unsafePlain = /^(?:[\[{&*!%@`]|[-?](?:$|\s))/.test(value) || /:\s|:$/.test(value);
  if (/^(?:~|null|true|false)$/i.test(value)
      || yamlNumber.test(value)
      || yamlTimestamp.test(value)
      || unsafePlain) {
    errors.push(`${file}: frontmatter values must be YAML strings`);
    return '';
  }
  return value;
}

function parseBlockScalar(header, lines, startIndex, file, errors) {
  const source = [];
  let index = startIndex + 1;
  while (index < lines.length && (lines[index] === '' || /^[ \t]/.test(lines[index]))) {
    source.push(lines[index]);
    index += 1;
  }

  const nonBlank = source.filter((line) => !/^ *$/.test(line));
  if (nonBlank.length === 0) return { value: '', nextIndex: index - 1 };
  const firstIndent = nonBlank[0].match(/^ +/);
  const hasUnsupportedIndent = !firstIndent
    || source.some((line) => line.includes('\t'))
    || source.some((line) => /^ *$/.test(line))
    || nonBlank.some((line) => line.match(/^ +/)[0].length !== firstIndent[0].length);
  if (hasUnsupportedIndent) {
    errors.push(`${file}: unsupported block scalar indentation`);
    return { value: '', nextIndex: index - 1 };
  }

  const indentation = firstIndent[0].length;
  const separator = header.startsWith('>') ? ' ' : '\n';
  let value = nonBlank.map((line) => line.slice(indentation)).join(separator);
  if (!header.endsWith('-')) value += '\n';
  return { value, nextIndex: index - 1 };
}

function parseFrontmatter(text, file, errors) {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    errors.push(`${file}: missing opening frontmatter delimiter`);
    return { fields: {}, body: normalized };
  }

  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) {
    errors.push(`${file}: missing closing frontmatter delimiter`);
    return { fields: {}, body: '' };
  }

  const fields = {};
  const lines = normalized.slice(4, end).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) {
      errors.push(`${file}: malformed frontmatter line ${JSON.stringify(line)}`);
      continue;
    }
    const raw = match[2].trim();
    if (/^[>|]/.test(raw)) {
      if (!/^[>|][+-]?$/.test(raw)) {
        errors.push(`${file}: unsupported block scalar indicator ${JSON.stringify(raw)}`);
        fields[match[1]] = '';
      } else {
        const parsed = parseBlockScalar(raw, lines, index, file, errors);
        fields[match[1]] = parsed.value;
        index = parsed.nextIndex;
      }
    } else {
      fields[match[1]] = unquote(raw, file, errors);
    }
  }
  return { fields, body: normalized.slice(end + 5) };
}

function validateLinks(text, absoluteFile, displayFile, errors) {
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].trim().split(/\s+/)[0];
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
    const withoutAnchor = target.split('#')[0];
    if (!withoutAnchor) continue;
    const resolved = path.resolve(path.dirname(absoluteFile), withoutAnchor);
    if (!fs.existsSync(resolved)) {
      errors.push(`${displayFile}: broken link ${target}`);
    }
  }
}

function validateSkills(root = process.cwd()) {
  const errors = [];
  const skillsDir = path.join(root, 'skills');
  if (!fs.existsSync(skillsDir)) {
    return { count: 0, errors: ['skills directory is missing'] };
  }

  const directories = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const seenNames = new Map();
  let count = 0;

  for (const directory of directories) {
    const absoluteFile = path.join(skillsDir, directory, 'SKILL.md');
    const displayFile = path.relative(root, absoluteFile);
    if (!fs.existsSync(absoluteFile)) {
      errors.push(`${displayFile}: missing SKILL.md`);
      continue;
    }

    count += 1;
    const text = fs.readFileSync(absoluteFile, 'utf8');
    const { fields, body } = parseFrontmatter(text, displayFile, errors);
    const name = fields.name || '';
    const description = fields.description || '';

    if (!name) errors.push(`${displayFile}: name is required`);
    if (!description.trim()) errors.push(`${displayFile}: description is required`);
    const nameLength = Array.from(name).length;
    const descriptionLength = Array.from(description).length;
    if (nameLength > MAX_NAME_LENGTH) {
      errors.push(
        `${displayFile}: name length ${nameLength} exceeds ${MAX_NAME_LENGTH}-character limit`,
      );
    }
    if (descriptionLength > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `${displayFile}: description length ${descriptionLength} exceeds ${MAX_DESCRIPTION_LENGTH}-character limit`,
      );
    }
    if (!body.trim()) errors.push(`${displayFile}: body is required`);
    if (name && name !== directory) {
      errors.push(`${displayFile}: name ${name} does not match directory ${directory}`);
    }
    if (name && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      errors.push(`${displayFile}: invalid skill name ${name}`);
    }
    if (name && seenNames.has(name)) {
      errors.push(`${displayFile}: duplicate skill name ${name} (also ${seenNames.get(name)})`);
    } else if (name) {
      seenNames.set(name, displayFile);
    }
    const lineCount = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    if (lineCount > MAX_SKILL_LINES) {
      errors.push(`${displayFile}: ${lineCount} lines exceeds ${MAX_SKILL_LINES}-line limit`);
    }
    validateLinks(text, absoluteFile, displayFile, errors);
  }

  return { count, errors };
}

if (require.main === module) {
  const result = validateSkills(process.cwd());
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Validated ${result.count} skills.`);
  }
}

module.exports = {
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SKILL_LINES,
  validateSkills,
};
