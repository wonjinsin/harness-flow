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

test('planless feature and bug fixes share one immutable execution preflight', () => {
  const brainstorming = read('skills/brainstorming/SKILL.md');
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const preflight = read('skills/using-git-worktrees/execution-preflight.md');

  assert.match(brainstorming, /execution-preflight\.md/);
  assert.match(debugging, /execution-preflight\.md/);
  assert.match(preflight, /START_HEAD/);
  assert.match(preflight, /base branch,? or has pre-existing changes/);
  assert.match(preflight, /START_HEAD\.\.HEAD/);
});

test('report-only debugging stops after diagnosis without entering the fix path', () => {
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const stop = debugging.indexOf('Diagnosis-only request');
  const fix = debugging.indexOf('## Phase 4 — Fix');

  assert.notEqual(stop, -1);
  assert.ok(stop < fix, 'diagnosis-only exit must precede the fix phase');
});
