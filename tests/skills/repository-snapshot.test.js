'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const SNAPSHOT = path.join(ROOT, 'scripts', 'repository-snapshot.js');

function initRepository(repository) {
  execFileSync('git', ['init', '-q'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Snapshot Test'], { cwd: repository });
  execFileSync('git', ['config', 'user.email', 'snapshot@example.invalid'], { cwd: repository });
  fs.writeFileSync(path.join(repository, 'tracked.txt'), 'tracked\n');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: repository });
  execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: repository });
}

function snapshot(repository, env = process.env) {
  return execFileSync(process.execPath, [SNAPSHOT], {
    cwd: repository,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('repository snapshot is deterministic and detects untracked mutation', (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-snapshot-'));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  initRepository(repository);

  const before = snapshot(repository);
  assert.equal(snapshot(repository), before);
  fs.writeFileSync(path.join(repository, 'untracked.txt'), 'mutation\n');
  assert.notEqual(snapshot(repository), before);
});

test('repository snapshot normalizes detached HEAD explicitly', (t) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-snapshot-detached-'));
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  initRepository(repository);
  execFileSync('git', ['checkout', '--detach', '-q'], { cwd: repository });

  assert.equal(JSON.parse(snapshot(repository)).symbolicHead, 'DETACHED');
});

test('repository snapshot fails when any sensitive fingerprint command fails', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-snapshot-failure-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin);
  const fakeGit = path.join(bin, 'git');
  fs.writeFileSync(fakeGit, `#!/bin/sh
if [ "$1" = "$FAIL_COMMAND" ]; then exit 7; fi
case "$1" in
  rev-parse) printf '0123456789012345678901234567890123456789\\n' ;;
  symbolic-ref) exit 1 ;;
  status) printf '# branch.head (detached)\\n' ;;
  for-each-ref) printf 'refs/heads/main 0123456789012345678901234567890123456789\\n' ;;
  ls-files) printf 'tracked index data\\n' ;;
  config) printf 'remote.secret=redacted-by-hash\\n' ;;
  remote) printf 'origin https://credential.invalid/repo (fetch)\\n' ;;
esac
`);
  fs.chmodSync(fakeGit, 0o755);
  const baseEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}` };

  for (const command of ['ls-files', 'config', 'remote']) {
    assert.throws(() => snapshot(directory, { ...baseEnv, FAIL_COMMAND: command }));
  }
  const manifest = JSON.parse(snapshot(directory, baseEnv));
  assert.equal(manifest.symbolicHead, 'DETACHED');
  assert.match(manifest.configHash, /^[0-9a-f]{64}$/);
  assert.match(manifest.remoteHash, /^[0-9a-f]{64}$/);
});
