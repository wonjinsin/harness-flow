'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeTargetExists, runMake } = require('../../hooks/lib/make-runner.js');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');

test('makeTargetExists returns true for existing target', () => {
  assert.equal(makeTargetExists('ok-target', FIXTURE_DIR), true);
});

test('makeTargetExists returns false for missing target', () => {
  assert.equal(makeTargetExists('does-not-exist', FIXTURE_DIR), false);
});

test('makeTargetExists returns false when Makefile is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-no-make-'));
  try {
    assert.equal(makeTargetExists('anything', dir), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runMake returns ok=true for successful target', () => {
  const r = runMake('ok-target', FIXTURE_DIR);
  assert.equal(r.ok, true);
});

test('runMake returns ok=false for failing target', () => {
  const r = runMake('fail-target', FIXTURE_DIR);
  assert.equal(r.ok, false);
  assert.match(r.stderr + r.stdout, /boom/);
});
