'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'post-edit.js');

function tmpFileWith(content, suffix = '.txt') {
  const f = path.join(os.tmpdir(), `post-edit-smoke-${Date.now()}-${Math.random()}${suffix}`);
  fs.writeFileSync(f, content, 'utf-8');
  return f;
}

function runWith(payload, env = {}) {
  return spawnSync('node', [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

test('exits 2 when secret detected', () => {
  const f = tmpFileWith('aws_key = "AKIA0123456789ABCDEF"');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /AWS Access Key/);
});

test('exits 0 on clean file', () => {
  const f = tmpFileWith('// nothing to see here\nconst x = 1;');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  assert.equal(r.status, 0);
});

test('exits 0 when HARNESS_FLOW_HOOKS_OFF=1 even with secret', () => {
  const f = tmpFileWith('AKIA0123456789ABCDEF');
  const r = runWith(
    { tool_name: 'Edit', tool_input: { file_path: f } },
    { HARNESS_FLOW_HOOKS_OFF: '1' },
  );
  fs.unlinkSync(f);
  assert.equal(r.status, 0);
});

test('exits 0 when file does not exist (graceful)', () => {
  const r = runWith({
    tool_name: 'Edit',
    tool_input: { file_path: '/tmp/definitely-does-not-exist-xyz' },
  });
  assert.equal(r.status, 0);
});

test('exits 0 for skip-glob path even with secret', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-skip-'));
  const f = path.join(dir, '.env.example');
  fs.writeFileSync(f, 'AKIA0123456789ABCDEF', 'utf-8');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  fs.rmdirSync(dir);
  assert.equal(r.status, 0);
});

test('exits 0 for .env.local even with secret', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-skip-local-'));
  const f = path.join(dir, '.env.local');
  fs.writeFileSync(f, 'AKIA0123456789ABCDEF', 'utf-8');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  fs.rmdirSync(dir);
  assert.equal(r.status, 0);
});

test('exits 0 for *_test.go even with secret', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-skip-gotest-'));
  const f = path.join(dir, 'handler_test.go');
  fs.writeFileSync(f, 'AKIA0123456789ABCDEF', 'utf-8');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  fs.rmdirSync(dir);
  assert.equal(r.status, 0);
});

test('exits 0 for *Test.go (PascalCase, e.g. integration test) even with secret', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-skip-gotest-pascal-'));
  const f = path.join(dir, 'IntegrationTest.go');
  fs.writeFileSync(f, 'AKIA0123456789ABCDEF', 'utf-8');
  const r = runWith({ tool_name: 'Edit', tool_input: { file_path: f } });
  fs.unlinkSync(f);
  fs.rmdirSync(dir);
  assert.equal(r.status, 0);
});

test('exits 0 on bad payload (fail-open)', () => {
  const r = spawnSync('node', [SCRIPT], { input: 'not json', encoding: 'utf-8' });
  assert.equal(r.status, 0);
});
