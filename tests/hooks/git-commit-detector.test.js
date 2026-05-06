'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isGitCommit } = require('../../hooks/lib/git-commit-detector.js');

test('matches plain git commit', () => {
  assert.equal(isGitCommit('git commit'), true);
});

test('matches git commit -m "msg"', () => {
  assert.equal(isGitCommit('git commit -m "feat: add x"'), true);
});

test('matches git commit --amend', () => {
  assert.equal(isGitCommit('git commit --amend'), true);
});

test('matches git commit with leading spaces', () => {
  assert.equal(isGitCommit('  git commit -m "x"'), true);
});

test('rejects git status', () => {
  assert.equal(isGitCommit('git status'), false);
});

test('rejects git push', () => {
  assert.equal(isGitCommit('git push'), false);
});

test('rejects echo containing words', () => {
  assert.equal(isGitCommit('echo "git commit"'), false);
});

test('rejects empty string', () => {
  assert.equal(isGitCommit(''), false);
});
