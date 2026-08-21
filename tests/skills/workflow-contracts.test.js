'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('large design selects the workspace before saving its ignored spec', () => {
  const brainstorming = read('skills/brainstorming/SKILL.md');
  const worktree = brainstorming.indexOf('using-git-worktrees');
  const saveSpec = brainstorming.indexOf('docs/harness-flow/specs/');

  assert.notEqual(worktree, -1);
  assert.notEqual(saveSpec, -1);
  assert.ok(worktree < saveSpec, 'workspace selection must precede spec creation');
});

test('planning fails closed when its source artifact is missing after workspace selection', () => {
  const planning = read('skills/writing-plans/SKILL.md');

  assert.match(planning, /After workspace selection, verify the\s+input source exists/);
  assert.match(planning, /Do\s+not plan from a missing source/);
});
