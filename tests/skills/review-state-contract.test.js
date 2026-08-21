'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fixtures = require('./review-state-fixtures.json');
const { classifyReviewResult, evaluateReviewStateFixtures } = require('../../scripts/review-state-contract.js');

test('review state fixtures are mutually exclusive and deterministic', () => {
  const result = evaluateReviewStateFixtures(
    path.join(ROOT, 'tests', 'skills', 'review-state-fixtures.json'),
  );
  assert.equal(result.count, fixtures.length);
  assert.deepEqual(result.errors, []);
});

for (const fixture of fixtures) {
  test(`review state: ${fixture.name}`, () => {
    const result = classifyReviewResult(fixture.input);
    assert.equal(result.state, fixture.expected);
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0);
  });
}
