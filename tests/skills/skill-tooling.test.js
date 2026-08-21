'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const { validateSkills } = require('../../scripts/validate-skills.js');
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
