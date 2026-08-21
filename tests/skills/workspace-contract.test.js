'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const fixtures = require('./workspace-state-fixtures.json');
const {
  classifyWorkspace,
  evaluateWorkspaceFixtures,
} = require('../../scripts/workspace-contract.js');

test('workspace fixtures enforce required-execution eligibility', () => {
  const result = evaluateWorkspaceFixtures(path.join(__dirname, 'workspace-state-fixtures.json'));
  assert.equal(result.count, fixtures.length);
  assert.deepEqual(result.errors, []);
});

for (const fixture of fixtures) {
  test(`workspace state: ${fixture.name}`, () => {
    assert.equal(classifyWorkspace(fixture.input), fixture.expected);
  });
}

test('invalid workspace input fails closed', () => {
  assert.equal(classifyWorkspace(null), 'UNRESOLVED');
  assert.equal(classifyWorkspace([]), 'UNRESOLVED');
});
