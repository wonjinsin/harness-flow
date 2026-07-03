'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkDispatch, SDD_DESC } = require('../../hooks/pre-agent-model.js');

test('SDD_DESC is a RegExp', () => {
  assert.ok(SDD_DESC instanceof RegExp);
});

// In scope: SDD dispatches (implementer + reviewer) that omit the model
test('implementer dispatch without model is a hit', () => {
  const hit = checkDispatch({ description: 'Implement Task 1: add guard', prompt: 'x' });
  assert.equal(hit && hit.id, 'sdd-model-required');
});
test('reviewer dispatch without model is a hit', () => {
  const hit = checkDispatch({ description: 'Review Task 2 (spec + quality)', prompt: 'x' });
  assert.equal(hit && hit.id, 'sdd-model-required');
});
test('multi-digit task number still matches', () => {
  const hit = checkDispatch({ description: 'Implement Task 12: something' });
  assert.equal(hit && hit.id, 'sdd-model-required');
});

// model that means "the session default" is exactly the leak → hit
test('empty-string model is a hit', () => {
  const hit = checkDispatch({ description: 'Implement Task 1: x', model: '' });
  assert.equal(hit && hit.id, 'sdd-model-required');
});
test('model "inherit" is a hit (inherit is the leak)', () => {
  const hit = checkDispatch({ description: 'Review Task 3 (spec + quality)', model: 'inherit' });
  assert.equal(hit && hit.id, 'sdd-model-required');
});
test('model "Inherit"/"INHERIT" is a hit (case-insensitive)', () => {
  assert.equal(checkDispatch({ description: 'Implement Task 1: x', model: 'Inherit' }).id, 'sdd-model-required');
  assert.equal(checkDispatch({ description: 'Implement Task 1: x', model: 'INHERIT' }).id, 'sdd-model-required');
});
test('whitespace-only model is a hit', () => {
  const hit = checkDispatch({ description: 'Implement Task 1: x', model: '   ' });
  assert.equal(hit && hit.id, 'sdd-model-required');
});

// An explicit model clears the check
test('explicit haiku model passes', () => {
  assert.equal(checkDispatch({ description: 'Implement Task 1: x', model: 'haiku' }), null);
});
test('explicit sonnet model passes', () => {
  assert.equal(checkDispatch({ description: 'Review Task 2 (spec + quality)', model: 'sonnet' }), null);
});
test('explicit opus model passes', () => {
  assert.equal(checkDispatch({ description: 'Implement Task 1: x', model: 'opus' }), null);
});

// Blast-radius guard: non-SDD dispatches are out of scope even without a model
test('non-SDD description without model passes (Explore probe)', () => {
  assert.equal(checkDispatch({ description: 'list files in hooks dir', prompt: 'x' }), null);
});
test('description that only mentions implement passes', () => {
  assert.equal(checkDispatch({ description: 'Implement the login feature' }), null);
});
test('"Review Task N ..." without the (spec + quality) suffix passes (no blast radius)', () => {
  assert.equal(checkDispatch({ description: 'Review Task 3 in the ticket' }), null);
});
test('"Implement Task N ..." without the colon passes (no blast radius)', () => {
  assert.equal(checkDispatch({ description: 'Implement Task 5 later this week' }), null);
});
test('missing description passes (cannot identify SDD dispatch)', () => {
  assert.equal(checkDispatch({ prompt: 'do something', model: undefined }), null);
});

// Robustness
test('checkDispatch handles null/undefined safely', () => {
  assert.equal(checkDispatch(null), null);
  assert.equal(checkDispatch(undefined), null);
});
