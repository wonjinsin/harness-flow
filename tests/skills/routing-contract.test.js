'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const fixtures = require('./routing-state-fixtures.json');
const { evaluateRoutingFixtures, routeRequest } = require('../../scripts/routing-contract.js');

test('routing fixtures enforce one deterministic route per request state', () => {
  const result = evaluateRoutingFixtures(path.join(__dirname, 'routing-state-fixtures.json'));
  assert.equal(result.count, fixtures.length);
  assert.deepEqual(result.errors, []);
});

for (const fixture of fixtures) {
  test(`routing state: ${fixture.name}`, () => {
    assert.equal(routeRequest(fixture.input), fixture.expected);
  });
}

test('invalid routing input fails closed', () => {
  assert.equal(routeRequest(null), 'UNRESOLVED');
  assert.equal(routeRequest([]), 'UNRESOLVED');
});
