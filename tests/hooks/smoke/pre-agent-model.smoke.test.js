'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'pre-agent-model.js');

function runWith(toolName, toolInput, env = {}) {
  return spawnSync('node', [SCRIPT], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

test('blocks SDD implementer dispatch without model (JSON deny + exit 2)', () => {
  const r = runWith('Agent', { description: 'Implement Task 1: add guard', prompt: 'x' });
  assert.equal(r.status, 2);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /^\[sdd-model-required\]/);
});

test('deny systemMessage steers to the tier -> alias mapping', () => {
  const r = runWith('Agent', { description: 'Review Task 2 (spec + quality)' });
  const out = JSON.parse(r.stdout);
  assert.match(out.systemMessage, /haiku/);
  assert.match(out.systemMessage, /sonnet/);
  assert.match(out.systemMessage, /opus/);
  assert.match(out.systemMessage, /Do NOT reflexively pick opus/);
  assert.match(out.systemMessage, /Review Task 2/);
});

test('Task alias also fires the guard', () => {
  const r = runWith('Task', { description: 'Implement Task 3: refactor' });
  assert.equal(r.status, 2);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /^\[sdd-model-required\]/);
});

test('passes SDD dispatch WITH an explicit model (exit 0, no stdout)', () => {
  const r = runWith('Agent', { description: 'Implement Task 1: x', model: 'haiku' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('passes non-SDD dispatch without model (no blast radius)', () => {
  const r = runWith('Agent', { description: 'list files in hooks dir', prompt: 'x' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('kill switch overrides the guard', () => {
  const r = runWith('Agent', { description: 'Implement Task 1: x' }, { HARNESS_FLOW_HOOKS_OFF: '1' });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('exits 0 on bad payload (fail-open)', () => {
  const r = spawnSync('node', [SCRIPT], { input: 'not json', encoding: 'utf-8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /payload parse error/);
});
