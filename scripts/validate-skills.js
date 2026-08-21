'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_LINES = 350;

function unquote(raw, file, errors) {
  if (!raw) return '';
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      errors.push(`${file}: invalid quoted frontmatter value`);
      return '';
    }
  }
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  return raw;
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
    if (/^[>|][+-]?$/.test(raw)) {
      const folded = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        folded.push(lines[index + 1].trim());
        index += 1;
      }
      fields[match[1]] = folded.join(raw.startsWith('>') ? ' ' : '\n');
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
