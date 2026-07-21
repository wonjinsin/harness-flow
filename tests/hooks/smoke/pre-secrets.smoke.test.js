'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'pre-secrets.js');

function run(payload, env = {}) {
  return spawnSync('node', [SCRIPT], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

function runBash(cmd, env = {}) {
  return run({ tool_name: 'Bash', tool_input: { command: cmd } }, env);
}

function runFile(toolName, filePath, env = {}) {
  return run({ tool_name: toolName, tool_input: { file_path: filePath } }, env);
}

function parseDeny(stdout) {
  return JSON.parse(stdout);
}

// ---------- Bash dispatch ----------

test('Bash: blocks cat .env with JSON deny + exit 0', () => {
  const r = runBash('cat .env');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-dotenv\]/);
  assert.match(out.systemMessage, /Blocked Bash command: cat \.env/);
  assert.match(out.systemMessage, /Stop here\. Do NOT retry with a workaround/);
});

test('Bash: blocks cat ~/.ssh/id_rsa', () => {
  const r = runBash('cat ~/.ssh/id_rsa');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-ssh-key\]/);
});

test('Bash: blocks cat ~/.aws/credentials', () => {
  const r = runBash('cat ~/.aws/credentials');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-aws-credentials\]/);
});

test('Bash: blocks cat my-service-account.json', () => {
  const r = runBash('cat my-service-account.json');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-gcp-service-account\]/);
});

test('Bash: passes innocuous ls', () => {
  const r = runBash('ls -la');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('Bash: passes rm -rf / (handled by pre-bash-commands)', () => {
  const r = runBash('rm -rf /');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('Bash: blocks rm .env (non-reader verb still blocks)', () => {
  const r = runBash('rm .env');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-dotenv\]/);
  assert.match(out.systemMessage, /Blocked Bash command: rm \.env/);
});

test('Bash: blocks vim ~/.ssh/id_rsa', () => {
  const r = runBash('vim ~/.ssh/id_rsa');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-ssh-key\]/);
});

test('Bash: passes cat .env.example (ALLOWLIST applies to Bash too)', () => {
  const r = runBash('cat /proj/.env.example');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

// ---------- Read/Edit/Write/MultiEdit dispatch ----------

test('Read: blocks /proj/.env', () => {
  const r = runFile('Read', '/proj/.env');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-dotenv\]/);
  assert.match(out.systemMessage, /Blocked file path: \/proj\/\.env/);
  assert.match(out.systemMessage, /Stop here\. Do NOT retry with a workaround/);
});

test('Edit: blocks /home/u/.ssh/id_rsa', () => {
  const r = runFile('Edit', '/home/u/.ssh/id_rsa');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-ssh-key\]/);
});

test('Write: blocks /tmp/my-service-account.json', () => {
  const r = runFile('Write', '/tmp/my-service-account.json');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-gcp-service-account\]/);
});

test('MultiEdit: blocks /home/u/.aws/credentials', () => {
  const r = runFile('MultiEdit', '/home/u/.aws/credentials');
  assert.equal(r.status, 0);
  const out = parseDeny(r.stdout);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[read-aws-credentials\]/);
});

test('Read: passes /proj/.env.example (allowlist)', () => {
  const r = runFile('Read', '/proj/.env.example');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('Read: passes innocuous file', () => {
  const r = runFile('Read', '/proj/src/index.js');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

// ---------- unknown tool / kill switch / fail-open ----------

test('unknown tool name passes through (no match)', () => {
  const r = run({ tool_name: 'WebFetch', tool_input: { url: 'http://x/.env' } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('kill switch overrides Bash match', () => {
  const r = runBash('cat .env', { HARNESS_FLOW_HOOKS_OFF: '1' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('kill switch overrides file_path match', () => {
  const r = runFile('Read', '/proj/.env', { HARNESS_FLOW_HOOKS_OFF: '1' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('exits 0 on bad payload (fail-open)', () => {
  const r = spawnSync('node', [SCRIPT], { input: 'not json', encoding: 'utf-8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /payload parse error/);
});
