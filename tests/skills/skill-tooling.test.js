'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const {
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SKILL_LINES,
  validateSkills,
} = require('../../scripts/validate-skills.js');
const { evaluateFixtures } = require('../../scripts/eval-skills.js');

test('repository skills pass structural validation', () => {
  const result = validateSkills(ROOT);
  assert.equal(result.count, 13);
  assert.deepEqual(result.errors, []);
});

test('validator reports identity, metadata, duplicate, and broken-link errors', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-flow-validator-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, 'skills', 'alpha'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'beta'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'skills', 'alpha', 'SKILL.md'),
    '---\nname: alpha\ndescription:\n---\n\n# Alpha\n\n[missing](missing.md)\n',
  );
  fs.writeFileSync(
    path.join(root, 'skills', 'beta', 'SKILL.md'),
    '---\nname: alpha\ndescription: duplicate\n---\n\n# Beta\n',
  );

  const { errors } = validateSkills(root);
  const output = errors.join('\n');
  assert.match(output, /description is required/);
  assert.match(output, /does not match directory beta/);
  assert.match(output, /duplicate skill name alpha/);
  assert.match(output, /broken link missing\.md/);
});

test('validator enforces metadata length boundaries and a non-empty body', (t) => {
  const validRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-flow-validator-valid-'));
  const invalidRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-flow-validator-invalid-'));
  t.after(() => fs.rmSync(validRoot, { recursive: true, force: true }));
  t.after(() => fs.rmSync(invalidRoot, { recursive: true, force: true }));

  const validName = 'a'.repeat(64);
  fs.mkdirSync(path.join(validRoot, 'skills', validName), { recursive: true });
  fs.writeFileSync(
    path.join(validRoot, 'skills', validName, 'SKILL.md'),
    `---\nname: ${validName}\ndescription: ${'d'.repeat(1024)}\n---\n\n# Valid\n`,
  );
  assert.equal(MAX_NAME_LENGTH, 64);
  assert.equal(MAX_DESCRIPTION_LENGTH, 1024);
  assert.deepEqual(validateSkills(validRoot).errors, []);

  const tooLongName = 'b'.repeat(65);
  const invalidSkills = [
    [tooLongName, `---\nname: ${tooLongName}\ndescription: valid\n---\n\n# Body\n`],
    ['long-description', `---\nname: long-description\ndescription: ${'d'.repeat(1025)}\n---\n\n# Body\n`],
    ['empty-body', '---\nname: empty-body\ndescription: valid\n---\n'],
  ];
  for (const [directory, content] of invalidSkills) {
    fs.mkdirSync(path.join(invalidRoot, 'skills', directory), { recursive: true });
    fs.writeFileSync(path.join(invalidRoot, 'skills', directory, 'SKILL.md'), content);
  }

  const output = validateSkills(invalidRoot).errors.join('\n');
  assert.match(output, /name length 65 exceeds 64-character limit/);
  assert.match(output, /description length 1025 exceeds 1024-character limit/);
  assert.match(output, /body is required/);
});

test('deterministic workflow fixtures pass against repository skills', () => {
  const result = evaluateFixtures(ROOT, path.join(ROOT, 'tests', 'skills', 'eval-fixtures.json'));
  assert.ok(result.count >= 6);
  assert.deepEqual(result.errors, []);
});

test('evaluator reports missing, forbidden, and out-of-order contracts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-flow-eval-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, 'skills', 'sample'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'sample', 'SKILL.md'), 'first forbidden second\n');
  const fixturePath = path.join(root, 'fixtures.json');
  fs.writeFileSync(
    fixturePath,
    JSON.stringify([
      {
        name: 'bad fixture',
        file: 'skills/sample/SKILL.md',
        required: ['missing'],
        forbidden: ['forbidden'],
        ordered: ['second', 'first']
      }
    ]),
  );

  const { errors } = evaluateFixtures(root, fixturePath);
  const output = errors.join('\n');
  assert.match(output, /missing required text/);
  assert.match(output, /contains forbidden text/);
  assert.match(output, /ordered text appears out of order/);
});

test('CI runs validation, deterministic evals, and the complete test suite', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /node scripts\/validate-skills\.js/);
  assert.match(workflow, /node scripts\/eval-skills\.js/);
  assert.match(workflow, /node --test/);
});

test('README and AGENTS describe the current executable workflow contracts', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');

  for (const document of [readme, agents]) {
    assert.match(document, /approved design or spec[\s\S]*`writing-plans`/i);
    assert.match(document, /approved task plan[\s\S]*`implement`/i);
    assert.match(document, /clean, named, non-base branch/i);
    assert.match(document, /`PASS`[\s\S]*`ACTIONABLE`[\s\S]*`OPERATIONAL`[\s\S]*`CONTRACT`[\s\S]*`MALFORMED`/i);
    assert.doesNotMatch(document, /approved plan\/spec|implements? (?:the )?plan\/spec/i);
  }

  assert.match(readme, /systematic-debugging[\s\S]*full-review[\s\S]*verify-fix/i);
  assert.match(agents, /private Git administration[\s\S]*provenance/i);
  assert.match(agents, /node scripts\/validate-skills\.js[\s\S]*node scripts\/eval-skills\.js[\s\S]*node --test/);
});

test('writing-skills stays compact while preserving the authoring contract', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills', 'writing-skills', 'SKILL.md'), 'utf8');
  const lineCount = skill.trimEnd().split('\n').length;

  assert.ok(MAX_SKILL_LINES <= 350, `skill limit is still ${MAX_SKILL_LINES}`);
  assert.ok(lineCount <= MAX_SKILL_LINES, `writing-skills is ${lineCount} lines`);
  assert.match(skill, /Never create or revise a skill without first observing a baseline failure/);
  assert.match(skill, /RED[\s\S]*GREEN[\s\S]*REFACTOR/);
  assert.match(skill, /description[\s\S]*triggering conditions[\s\S]*not the workflow/i);
  assert.match(skill, /testing-skills-with-subagents\.md/);
  assert.match(skill, /node scripts\/validate-skills\.js/);
  assert.match(skill, /node scripts\/eval-skills\.js/);
});

test('upstream authoring reference is condensed and marks local overrides', () => {
  const reference = fs.readFileSync(
    path.join(ROOT, 'skills', 'writing-skills', 'anthropic-best-practices.md'),
    'utf8',
  );
  const lineCount = reference.trimEnd().split('\n').length;

  assert.ok(lineCount <= 200, `anthropic reference is ${lineCount} lines`);
  assert.match(reference, /Local repository overrides/);
  assert.match(reference, /350-line/);
  assert.match(reference, /platform\.claude\.com\/docs/);
});
