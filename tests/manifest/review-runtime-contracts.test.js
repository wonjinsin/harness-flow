'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const exists = (relativePath) => fs.existsSync(path.join(ROOT, relativePath));
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Matt review replaces the legacy runtime surface', () => {
  assert.equal(exists('skills/requesting-code-review/SKILL.md'), true);
  assert.equal(exists('tests/review/review-state.js'), true);

  for (const relativePath of [
    'skills/requesting-code-review/code-reviewer.md',
    'skills/requesting-code-review/parallel-review.md',
    'skills/requesting-code-review/review-checks.md',
    'skills/requesting-code-review/review-report.schema.json',
    'skills/requesting-code-review/scripts/review-state.js',
    'skills/requesting-code-review/scripts/prepare-review.js',
    'skills/requesting-code-review/scripts/read-review-evidence.js',
    'skills/requesting-code-review/scripts/combine-reviews.js',
  ]) {
    assert.equal(exists(relativePath), false, `${relativePath} must be removed`);
  }
});

test('review runs Matt Standards and Spec axes in parallel', () => {
  const skill = read('skills/requesting-code-review/SKILL.md');

  assert.match(skill, /two-axis review/i);
  assert.match(skill, /\*\*Standards\*\*/);
  assert.match(skill, /\*\*Spec\*\*/);
  assert.match(skill, /parallel sub-agents/i);
  assert.match(skill, /## Standards[\s\S]*## Spec/);
  assert.match(skill, /do \*\*not\*\* merge or rerank/i);
  assert.equal((skill.match(/under 400 words/gi) || []).length, 2);
  assert.doesNotMatch(skill, /\*\*Comments\*\*/);
});

test('review pins Matt fixed-point commands', () => {
  const skill = read('skills/requesting-code-review/SKILL.md');

  assert.match(skill, /git diff <fixed-point>\.\.\.HEAD/);
  assert.match(skill, /git log <fixed-point>\.\.HEAD --oneline/);
  assert.match(skill, /git rev-parse <fixed-point>/);
  assert.match(skill, /bad ref or empty diff should fail here/i);
});

test('review discovers harness-flow specs and plans without changing authority', () => {
  const skill = read('skills/requesting-code-review/SKILL.md');

  assert.match(skill, /inline settled requirements supplied by a caller as the spec/i);
  assert.match(skill, /docs\/harness-flow\/specs\//);
  assert.match(skill, /docs\/harness-flow\/plans\//);
  assert.match(skill, /plan must not override its `Source`/i);
  assert.match(skill, /no spec available/i);
});

test('Standards keeps the complete Fowler smell baseline', () => {
  const skill = read('skills/requesting-code-review/SKILL.md');

  for (const smell of [
    'Mysterious Name',
    'Duplicated Code',
    'Feature Envy',
    'Data Clumps',
    'Primitive Obsession',
    'Repeated Switches',
    'Shotgun Surgery',
    'Divergent Change',
    'Speculative Generality',
    'Message Chains',
    'Middle Man',
    'Refused Bequest',
  ]) {
    assert.match(skill, new RegExp(`\\*\\*${smell}\\*\\*`));
  }
  assert.match(skill, /documented repo standard always wins/i);
  assert.match(skill, /always a judgement call/i);
});

test('Codex starts fresh axes before waiting', () => {
  const skill = read('skills/requesting-code-review/SKILL.md');

  assert.match(skill, /spawn_agent/);
  assert.match(skill, /fork_turns: "none"/);
  assert.match(skill, /unique task names/i);
  assert.match(skill, /before waiting for either result/i);
  assert.match(skill, /use one agent when the Spec axis is skipped/i);
});

test('review guidance stays compact and self-contained', () => {
  const skill = read('skills/requesting-code-review/SKILL.md');
  const words = skill.trim().split(/\s+/).length;

  assert.ok(words <= 1100, `review guidance is ${words} words; expected at most 1100`);
  assert.doesNotMatch(skill, /design\//);
  assert.doesNotMatch(skill, /docs\/agents\/issue-tracker\.md/);
  assert.doesNotMatch(skill, /setup-matt-pocock-skills/);
});
