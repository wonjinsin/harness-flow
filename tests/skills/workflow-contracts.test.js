'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

test('branch finishing refuses integration menus until the workspace is clean', () => {
  const finishing = read('skills/finishing-a-development-branch/SKILL.md');
  const cleanGate = finishing.indexOf('### Step 0: Require a Clean State');
  const tests = finishing.indexOf('### Step 1: Verify Tests');

  assert.notEqual(cleanGate, -1);
  assert.ok(cleanGate < tests, 'clean-state gate must precede tests and options');
  assert.match(finishing, /PENDING_COMMIT/);
  assert.match(finishing, /Do not present integration options while status is non-empty/);
});

test('instruction revision returns a bounded workspace state', () => {
  const revise = read('skills/llm-md-revise/SKILL.md');

  for (const state of ['NO_CHANGES', 'APPLIED_CLEAN', 'PENDING_COMMIT']) {
    assert.match(revise, new RegExp(`\\b${state}\\b`));
  }
  assert.match(revise, /Return exactly one status/);
});

test('manual worktree location resolves beside the repo from a nested cwd', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-worktree-'));
  const repo = path.join(tmp, 'project');
  const nested = path.join(repo, 'skills', 'nested');
  fs.mkdirSync(nested, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const skill = read('skills/using-git-worktrees/SKILL.md');
  const fallback = skill.slice(skill.indexOf('**1b. Manual git fallback**'));
  const script = fallback.match(/```bash\n([\s\S]*?)```/)[1];
  const output = execFileSync('bash', ['-c', script], {
    cwd: nested,
    env: { ...process.env, BRANCH_NAME: 'feat/nested' },
    encoding: 'utf8',
  });
  const location = output.match(/Worktree: (.+)/)[1].trim();

  assert.equal(location, path.join(tmp, 'project-feat-nested'));
  assert.ok(!location.startsWith(`${repo}${path.sep}`));
});

test('workspace cleanup requires an exact ownership marker, never a path guess', () => {
  const finishing = read('skills/finishing-a-development-branch/SKILL.md');

  assert.match(finishing, /OWNER=.*worktree-owner/);
  assert.match(finishing, /"\$OWNER" = "manual-git-worktree"/);
  assert.doesNotMatch(finishing, /path is under `?\.worktrees/i);
  assert.doesNotMatch(finishing, /or `?worktrees\//i);
});

test('entry routing distinguishes intent, design, plan, bug, and review states', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');

  assert.match(entry, /Bug, test failure, or unexpected behavior[\s\S]*`systematic-debugging`/);
  assert.match(entry, /Read-only codebase research[\s\S]*`brainstorming` read-only exit/);
  assert.match(entry, /Approved design or spec[\s\S]*`writing-plans`/);
  assert.match(entry, /Approved task plan[\s\S]*`implement`/);
  assert.match(entry, /Explicit code-review artifact[\s\S]*`requesting-code-review`/);
});

test('implement accepts only an approved task plan and normalizes specs through planning', () => {
  const implement = read('skills/implement/SKILL.md');
  const frontmatter = implement.match(/^---[\s\S]*?---/)[0];

  assert.doesNotMatch(frontmatter, /plan or spec/i);
  assert.match(implement, /Required input: an approved task plan/);
  assert.match(implement, /A spec or design is not executable input[\s\S]*`writing-plans`/);
  for (const field of ['Delivers', 'Touches', 'Blocked by', 'acceptance']) {
    assert.match(implement, new RegExp(field, 'i'));
  }
});

test('full review receives test evidence tied to the reviewed commit', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');
  const fullTemplate = template.slice(0, template.indexOf('## verify-fix'));
  const implement = read('skills/implement/SKILL.md');

  assert.match(fullTemplate, /\{TEST_EVIDENCE\}/);
  for (const field of ['tested commit SHA', 'command', 'exit status', 'pass/fail/skip summary']) {
    assert.match(review, new RegExp(field.replaceAll(' ', '\\s+'), 'i'));
  }
  assert.match(review, /tested commit SHA[\s\S]*HEAD_SHA|HEAD_SHA[\s\S]*tested commit SHA/i);
  assert.match(implement, /TEST_EVIDENCE/);
});

test('review results use bounded states and retry only operational failures once', () => {
  const review = read('skills/requesting-code-review/SKILL.md');

  for (const state of ['PASS', 'ACTIONABLE', 'OPERATIONAL', 'CONTRACT', 'MALFORMED']) {
    assert.match(review, new RegExp(`\\b${state}\\b`));
  }
  assert.match(review, /Only\s+`OPERATIONAL` may be retried once with the same immutable package/);
  assert.match(review, /mutation[\s\S]*`CONTRACT`/i);
  assert.match(review, /`MALFORMED`[^\n]*missing required fields|missing required fields[\s\S]*`MALFORMED`/i);
});
