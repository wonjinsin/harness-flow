'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { captureReviewState } = require('./review-state.js');

const git = (repo, args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
  cwd: repo,
  encoding: 'utf8',
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
}).trim();

const makeRange = () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'review-state-test-'));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.name', 'Review Test']);
  git(repo, ['config', 'user.email', 'review@example.invalid']);
  fs.writeFileSync(path.join(repo, 'sample.txt'), 'before\n');
  git(repo, ['add', 'sample.txt']);
  git(repo, ['commit', '-qm', 'base']);
  const from = git(repo, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repo, 'sample.txt'), 'after\n');
  git(repo, ['add', 'sample.txt']);
  git(repo, ['commit', '-qm', 'change']);
  const to = git(repo, ['rev-parse', 'HEAD']);
  return { repo, from, to };
};

test('review-state exposes one snapshot operation', () => {
  assert.equal(typeof captureReviewState, 'function');
});

test('review-state captures a clean pinned non-empty range without mutation', () => {
  const { repo, from, to } = makeRange();
  const beforeHead = git(repo, ['rev-parse', 'HEAD']);
  const beforeStatus = git(repo, ['status', '--porcelain', '--untracked-files=all']);

  const state = captureReviewState({ repo, from, to });

  assert.equal(state.schemaVersion, 1);
  assert.equal(state.repoRoot, fs.realpathSync(repo));
  assert.equal(state.fromSha, from);
  assert.equal(state.toSha, to);
  assert.equal(state.headSha, to);
  assert.equal(state.clean, true);
  assert.equal(state.nonEmpty, true);
  assert.match(state.snapshotDigest, /^[0-9a-f]{64}$/);
  assert.equal(git(repo, ['rev-parse', 'HEAD']), beforeHead);
  assert.equal(git(repo, ['status', '--porcelain', '--untracked-files=all']), beforeStatus);
});

test('review-state rejects dirty, stale, and empty review inputs', () => {
  const dirty = makeRange();
  fs.writeFileSync(path.join(dirty.repo, 'untracked.txt'), 'dirty\n');
  assert.throws(
    () => captureReviewState(dirty),
    /worktree is not clean/,
  );

  const stale = makeRange();
  assert.throws(
    () => captureReviewState({ ...stale, to: stale.from }),
    /does not match TO_SHA/,
  );

  const empty = makeRange();
  assert.throws(
    () => captureReviewState({ ...empty, from: empty.to }),
    /review range is empty/,
  );
});

test('review-state detects local configuration changes without exposing values', () => {
  const range = makeRange();
  const before = captureReviewState(range);

  git(range.repo, ['config', 'review.test-value', 'sensitive-value']);
  const after = captureReviewState(range);

  assert.notEqual(after.configHash, before.configHash);
  assert.notEqual(after.snapshotDigest, before.snapshotDigest);
  assert.doesNotMatch(JSON.stringify(after), /sensitive-value/);
});

test('review-state disables configured external diff helpers', () => {
  const range = makeRange();
  const helperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-state-helper-'));
  const helper = path.join(helperDir, 'external-diff.sh');
  const marker = path.join(helperDir, 'executed');
  fs.writeFileSync(helper, `#!/bin/sh\ntouch "${marker}"\nexit 0\n`);
  fs.chmodSync(helper, 0o755);
  git(range.repo, ['config', 'diff.external', helper]);

  captureReviewState(range);

  assert.equal(fs.existsSync(marker), false);
});
