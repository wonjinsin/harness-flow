'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RULES, matchRule } = require('../../hooks/post-edit.js');

test('RULES is a non-empty array of {id, regex, commands}', () => {
  assert.ok(Array.isArray(RULES));
  assert.ok(RULES.length >= 1);
  for (const r of RULES) {
    assert.equal(typeof r.id, 'string');
    assert.ok(r.regex instanceof RegExp);
    assert.ok(Array.isArray(r.commands));
    assert.ok(r.commands.length >= 1);
    for (const c of r.commands) assert.equal(typeof c, 'string');
  }
});

test('RULE ids are unique', () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('go-fmt rule exists with make fmt', () => {
  const r = RULES.find((x) => x.id === 'go-fmt');
  assert.ok(r, 'go-fmt rule present');
  assert.deepEqual(r.commands, ['make fmt']);
});

test('matchRule: handler.go → go-fmt', () => {
  assert.equal(matchRule('handler.go').id, 'go-fmt');
});

test('matchRule: handler_test.go → go-fmt (test files included)', () => {
  assert.equal(matchRule('handler_test.go').id, 'go-fmt');
});

test('matchRule: /abs/path/main.go → go-fmt', () => {
  assert.equal(matchRule('/Users/x/proj/main.go').id, 'go-fmt');
});

test('matchRule: handler.ts → null', () => {
  assert.equal(matchRule('handler.ts'), null);
});

test('matchRule: Makefile → null', () => {
  assert.equal(matchRule('Makefile'), null);
});

test('matchRule: empty / null / undefined → null', () => {
  assert.equal(matchRule(''), null);
  assert.equal(matchRule(null), null);
  assert.equal(matchRule(undefined), null);
});

test('matchRule: .go appearing mid-path but not as extension → null', () => {
  // regex anchored to end with $, so "foo.go.bak" should not match
  assert.equal(matchRule('foo.go.bak'), null);
});
