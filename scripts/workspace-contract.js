'use strict';

const fs = require('node:fs');

function classifyWorkspace(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'UNRESOLVED';
  if (!['optional', 'required-execution'].includes(input.mode)) return 'UNRESOLVED';
  for (const field of ['linkedWorktree', 'clean', 'namedBranch', 'onBaseBranch']) {
    if (typeof input[field] !== 'boolean') return 'UNRESOLVED';
  }

  if (input.mode === 'required-execution') {
    return input.clean && input.namedBranch && !input.onBaseBranch
      ? 'REUSE_CURRENT'
      : 'CREATE_OR_STOP';
  }
  return input.linkedWorktree ? 'REUSE_CURRENT' : 'OFFER_ISOLATION';
}

function evaluateWorkspaceFixtures(fixturePath) {
  let fixtures;
  try {
    fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    return { count: 0, errors: [`cannot load workspace fixtures: ${error.message}`] };
  }
  if (!Array.isArray(fixtures)) {
    return { count: 0, errors: ['workspace fixtures must be an array'] };
  }

  const errors = [];
  for (const fixture of fixtures) {
    const actual = classifyWorkspace(fixture.input);
    if (actual !== fixture.expected) {
      errors.push(`${fixture.name || '<unnamed fixture>'}: expected ${fixture.expected}, got ${actual}`);
    }
  }
  return { count: fixtures.length, errors };
}

module.exports = { classifyWorkspace, evaluateWorkspaceFixtures };
