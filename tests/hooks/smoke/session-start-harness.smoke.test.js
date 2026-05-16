'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(PLUGIN_ROOT, 'hooks', 'session-start-harness.js');

test('session-start-harness.js emits valid hookSpecificOutput JSON', () => {
  const result = spawnSync('node', [SCRIPT], {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    encoding: 'utf-8',
  });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(parsed.hookSpecificOutput.additionalContext, /You have harness-flow/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /<EXTREMELY_IMPORTANT>/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /using-harness-flow/);
});

test('session-start-harness.js emits fallback when SKILL.md missing', () => {
  const result = spawnSync('node', [SCRIPT], {
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: '/nonexistent/path/xyz' },
    encoding: 'utf-8',
  });
  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.match(parsed.hookSpecificOutput.additionalContext, /Error reading using-harness-flow skill/);
});
