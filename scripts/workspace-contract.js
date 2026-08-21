'use strict';

const fs = require('node:fs');

function classifyWorkspace(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'UNRESOLVED';
  if (!['optional', 'required-execution', 'planless'].includes(input.mode)) return 'UNRESOLVED';
  for (const field of ['linkedWorktree', 'clean', 'namedBranch', 'onBaseBranch']) {
    if (typeof input[field] !== 'boolean') return 'UNRESOLVED';
  }
  const creationResult = input.creationResult || 'not-attempted';
  if (!['not-attempted', 'sandbox-failure'].includes(creationResult)) return 'UNRESOLVED';
  if (creationResult === 'sandbox-failure') {
    if (input.mode === 'planless' && input.isolationDecision !== 'accepted') return 'UNRESOLVED';
    return 'STOP';
  }

  const eligible = input.clean && input.namedBranch && !input.onBaseBranch;
  if (input.mode === 'required-execution') {
    return eligible
      ? 'REUSE_CURRENT'
      : 'CREATE_OR_STOP';
  }
  if (input.mode === 'planless') {
    if (!['not-needed', 'undecided', 'accepted', 'declined'].includes(input.isolationDecision)) {
      return 'UNRESOLVED';
    }
    if (eligible) return input.isolationDecision === 'not-needed' ? 'REUSE_CURRENT' : 'UNRESOLVED';
    if (input.isolationDecision === 'undecided') return 'OFFER_ISOLATION';
    if (input.isolationDecision === 'accepted') return 'CREATE_AND_REVALIDATE';
    if (input.isolationDecision === 'declined') return 'LIMITED_IN_PLACE';
    return 'UNRESOLVED';
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
