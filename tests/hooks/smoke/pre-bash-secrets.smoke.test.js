'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'pre-bash-secrets.js');

function runWith(cmd, env = {}) {
  return spawnSync('node', [SCRIPT], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } }),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

function parseDeny(stdout) {
  return JSON.parse(stdout);
}

test('blocks cat .env with JSON deny + exit 2', () => {
  const r = runWith('cat .env');
  assert.equal(r.status, 2);
  const out = parseDeny(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-dotenv\]/);
  assert.match(out.systemMessage, /Stop here\. Do NOT retry with a workaround/);
  assert.match(out.systemMessage, /Ask the user how to proceed/);
});

test('blocks cat ~/.ssh/id_rsa with JSON deny + exit 2', () => {
  const r = runWith('cat ~/.ssh/id_rsa');
  assert.equal(r.status, 2);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-ssh-key\]/);
});

test('blocks cat ~/.aws/credentials with JSON deny + exit 2', () => {
  const r = runWith('cat ~/.aws/credentials');
  assert.equal(r.status, 2);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-aws-credentials\]/);
});

test('blocks cat service-account.json with JSON deny + exit 2', () => {
  const r = runWith('cat my-service-account.json');
  assert.equal(r.status, 2);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-gcp-service-account\]/);
});

test('systemMessage includes the offending command', () => {
  const r = runWith('cat .env.production');
  const out = parseDeny(r.stdout);
  assert.match(out.systemMessage, /cat \.env\.production/);
});

test('passes innocuous ls with exit 0 and no stdout', () => {
  const r = runWith('ls -la');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('passes rm -rf / (destructive handled by sibling hook)', () => {
  const r = runWith('rm -rf /');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('kill switch overrides dangerous pattern', () => {
  const r = runWith('cat .env', { HARNESS_FLOW_HOOKS_OFF: '1' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('exits 0 on bad payload (fail-open)', () => {
  const r = spawnSync('node', [SCRIPT], { input: 'not json', encoding: 'utf-8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /payload parse error/);
});
