'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('OMP always-apply rule bootstraps using-harness-flow for the main agent', () => {
  const rule = read('rules/using-harness-flow.md');

  assert.match(rule, /^alwaysApply:\s*true$/m);
  assert.match(rule, /^agents:\s*main$/m);
  assert.match(rule, /skill:\/\/using-harness-flow/);
  assert.match(rule, /before responding/i);
  assert.match(rule, /including before clarifying questions/i);
});

test('OMP installation and native compatibility surfaces are documented', () => {
  const readme = read('README.md');

  assert.match(readme, /### OMP/);
  assert.match(readme, /omp plugin marketplace add wonjinsin\/harness-flow/);
  assert.match(readme, /omp plugin install harness-flow@harness-flow/);
  assert.match(readme, /rules\/using-harness-flow\.md/);
  assert.match(readme, /hooks\/pre\/harness-flow\.js/);
  assert.match(readme, /Claude Code\/Codex blocking hooks emit `permissionDecision: "deny"`/);
  assert.match(readme, /OMP's native hook returns `\{ block: true, reason \}`/);
});

test('canonical repository guidance documents OMP-native integration', () => {
  const agents = read('AGENTS.md');

  assert.match(agents, /Cross-harness \(Claude Code \+ Codex \+ OMP\)/);
  assert.match(agents, /rules\/using-harness-flow\.md/);
  assert.match(agents, /hooks\/pre\/harness-flow\.js/);
  assert.match(agents, /OMP[\s\S]*one `task` call/i);
  assert.match(agents, /native OMP hook[\s\S]*ESM/i);
});
