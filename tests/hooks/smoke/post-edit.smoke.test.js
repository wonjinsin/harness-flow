'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'post-edit.js');

const MAKEFILE_OK = 'fmt:\n\t@echo fmt-ok\n';
const MAKEFILE_FMT_FAIL = 'fmt:\n\t@echo "fmt err" >&2; exit 1\n';

function mkProject(makefileBody) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-edit-smoke-'));
  if (makefileBody !== null) {
    fs.writeFileSync(path.join(dir, 'Makefile'), makefileBody, 'utf-8');
  }
  return dir;
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function runIn(cwd, payload, env = {}) {
  // Hook reads cwd from payload.cwd; we also pass cwd to spawn for parity.
  return spawnSync('node', [SCRIPT], {
    cwd,
    input: JSON.stringify({ ...payload, cwd }),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

test('exits 0 when .go edit succeeds (fmt passes)', () => {
  const dir = mkProject(MAKEFILE_OK);
  const r = runIn(dir, { tool_name: 'Edit', tool_input: { file_path: '/x/handler.go' } });
  rmrf(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('exits 2 when make fmt fails on .go edit', () => {
  const dir = mkProject(MAKEFILE_FMT_FAIL);
  const r = runIn(dir, { tool_name: 'Write', tool_input: { file_path: '/x/handler.go' } });
  rmrf(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\[go-fmt\] make fmt failed/);
  assert.match(r.stderr, /fmt err/);
  assert.match(r.stderr, /re-Read before editing/);
});

test('exits 0 on non-Go extension (no rule match)', () => {
  const dir = mkProject(MAKEFILE_FMT_FAIL);
  const r = runIn(dir, { tool_name: 'Edit', tool_input: { file_path: '/x/handler.ts' } });
  rmrf(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('exits 0 for MultiEdit on .go (covered by POST_EDIT_TOOLS) when fmt passes', () => {
  const dir = mkProject(MAKEFILE_OK);
  const r = runIn(dir, { tool_name: 'MultiEdit', tool_input: { file_path: '/x/handler.go' } });
  rmrf(dir);
  assert.equal(r.status, 0);
});

test('exits 0 when Makefile missing (fail-open)', () => {
  const dir = mkProject(null);
  const r = runIn(dir, { tool_name: 'Edit', tool_input: { file_path: '/x/handler.go' } });
  rmrf(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('kill switch overrides .go + fmt-fail Makefile', () => {
  const dir = mkProject(MAKEFILE_FMT_FAIL);
  const r = runIn(
    dir,
    { tool_name: 'Edit', tool_input: { file_path: '/x/handler.go' } },
    { HARNESS_FLOW_HOOKS_OFF: '1' },
  );
  rmrf(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});

test('exits 0 on bad payload (fail-open)', () => {
  const r = spawnSync('node', [SCRIPT], { input: 'not json', encoding: 'utf-8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /payload parse error/);
});

test('exits 0 for Read tool_name (not in POST_EDIT_TOOLS)', () => {
  const dir = mkProject(MAKEFILE_FMT_FAIL);
  const r = runIn(dir, { tool_name: 'Read', tool_input: { file_path: '/x/handler.go' } });
  rmrf(dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
});
