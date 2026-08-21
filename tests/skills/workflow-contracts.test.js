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

test('bug-fix review routes every non-pass state with a bounded verification loop', () => {
  const debug = read('skills/systematic-debugging/SKILL.md');
  const afterFix = debug.slice(debug.indexOf('## After the fix lands'));

  assert.match(afterFix, /`PASS`[\s\S]*execution-preflight closeout/i);
  assert.match(afterFix, /`OPERATIONAL`[\s\S]*stop/i);
  assert.match(afterFix, /`CONTRACT`[\s\S]*stop/i);
  assert.match(afterFix, /`MALFORMED`[\s\S]*stop/i);
  assert.match(afterFix, /`ACTIONABLE`[\s\S]*`plan-escalate`[\s\S]*stop/i);
  assert.match(afterFix, /`ACTIONABLE`[\s\S]*`impl-fix`[\s\S]*TDD[\s\S]*fix commit[\s\S]*`verify-fix`/i);
  assert.match(afterFix, /at most two post-fix reviewer turns/i);
  assert.match(afterFix, /advance `REVIEWED_HEAD`[\s\S]*`FIXED_HEAD`/i);
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

test('manual worktree fallback fails before location selection for an invalid branch', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-worktree-invalid-'));
  const repo = path.join(tmp, 'project');
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const skill = read('skills/using-git-worktrees/SKILL.md');
  const fallback = skill.slice(skill.indexOf('**1b. Manual git fallback**'));
  const script = fallback.match(/```bash\n([\s\S]*?)```/)[1];

  assert.throws(() => execFileSync('bash', ['-c', script], {
    cwd: repo,
    env: { ...process.env, BRANCH_NAME: 'bad..branch' },
    encoding: 'utf8',
    stdio: 'pipe',
  }));
});

test('manual worktree fallback stores provenance only in private git administration', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-worktree-owner-'));
  const repo = path.join(tmp, 'project');
  fs.mkdirSync(repo, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repo });
  execFileSync('git', [
    '-c', 'user.name=Fixture',
    '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '-m', 'fixture',
  ], { cwd: repo });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const skill = read('skills/using-git-worktrees/SKILL.md');
  const fallback = skill.slice(skill.indexOf('**1b. Manual git fallback**'));
  const scripts = [...fallback.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
  const output = execFileSync('bash', ['-c', `${scripts[0]}\n${scripts[1]}`], {
    cwd: repo,
    env: { ...process.env, BRANCH_NAME: 'feat/owned' },
    encoding: 'utf8',
  });
  const location = output.match(/Worktree: (.+)/)[1].trim();
  const ownerFile = execFileSync(
    'git', ['-C', location, 'rev-parse', '--git-path', 'harness-flow/worktree-owner'],
    { encoding: 'utf8' },
  ).trim();

  assert.equal(fs.existsSync(path.join(location, '.harness-flow')), false);
  assert.equal(fs.existsSync(ownerFile), true);
  assert.deepEqual(fs.readFileSync(ownerFile, 'utf8').trim().split('\n'), [
    'manual-git-worktree',
    fs.realpathSync(location),
    fs.realpathSync(path.join(repo, '.git')),
  ]);
});

test('manual provenance creation is atomic and refuses file or symlink collisions', (t) => {
  const skill = read('skills/using-git-worktrees/SKILL.md');
  const nodeBlock = skill.match(/node - "\$OWNER_FILE"[\s\S]*?<<'NODE'\n([\s\S]*?)\nNODE/);

  assert.match(skill, /O_EXCL[\s\S]*O_NOFOLLOW/);
  assert.match(skill, /lstatSync/);
  assert.doesNotMatch(skill, /> "\$OWNER_FILE"/);
  assert.ok(nodeBlock, 'skill must contain the exclusive provenance writer');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-owner-collision-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const common = path.join(tmp, 'common');
  const worktree = path.join(tmp, 'worktree');
  fs.mkdirSync(common);
  fs.mkdirSync(worktree);

  const existingDir = path.join(tmp, 'existing-parent');
  const existingOwner = path.join(existingDir, 'worktree-owner');
  fs.mkdirSync(existingDir);
  fs.writeFileSync(existingOwner, 'preserve-me\n');
  assert.throws(() => execFileSync(
    'node', ['-', existingOwner, worktree, common],
    { input: nodeBlock[1], stdio: ['pipe', 'pipe', 'pipe'] },
  ));
  assert.equal(fs.readFileSync(existingOwner, 'utf8'), 'preserve-me\n');

  const linkDir = path.join(tmp, 'link-parent');
  const linkOwner = path.join(linkDir, 'worktree-owner');
  const linkTarget = path.join(tmp, 'link-target');
  fs.mkdirSync(linkDir);
  fs.writeFileSync(linkTarget, 'target-stays\n');
  fs.symlinkSync(linkTarget, linkOwner);
  assert.throws(() => execFileSync(
    'node', ['-', linkOwner, worktree, common],
    { input: nodeBlock[1], stdio: ['pipe', 'pipe', 'pipe'] },
  ));
  assert.equal(fs.readFileSync(linkTarget, 'utf8'), 'target-stays\n');

  const parentTarget = path.join(tmp, 'parent-target');
  const parentLink = path.join(tmp, 'parent-link');
  fs.mkdirSync(parentTarget);
  fs.symlinkSync(parentTarget, parentLink);
  assert.throws(() => execFileSync(
    'node', ['-', path.join(parentLink, 'worktree-owner'), worktree, common],
    { input: nodeBlock[1], stdio: ['pipe', 'pipe', 'pipe'] },
  ));
  assert.equal(fs.existsSync(path.join(parentTarget, 'worktree-owner')), false);
});

test('workspace cleanup requires exact private provenance, never a path guess', () => {
  const finishing = read('skills/finishing-a-development-branch/SKILL.md');

  assert.match(finishing, /OWNER_FILE=.*git-path harness-flow\/worktree-owner/);
  assert.match(finishing, /"\$OWNER_KIND" = "manual-git-worktree"/);
  assert.match(finishing, /"\$OWNER_PATH" = "\$WORKTREE_PATH"/);
  assert.match(finishing, /"\$OWNER_COMMON" = "\$GIT_COMMON"/);
  assert.doesNotMatch(finishing, /\.harness-flow\/worktree-owner/);
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

test('approved-plan execution establishes a clean named non-base workspace before edits', () => {
  const implement = read('skills/implement/SKILL.md');
  const entry = read('skills/using-harness-flow/SKILL.md');
  const preflight = implement.indexOf('## Step 0: Establish the execution workspace');
  const planScan = implement.indexOf('## Before you start');

  assert.notEqual(preflight, -1);
  assert.ok(preflight < planScan, 'workspace preflight must precede plan scan and edits');
  assert.match(implement, /capture[\s\S]*approved plan source[\s\S]*before[\s\S]*workspace transition/i);
  assert.match(implement, /clean, named, non-base branch/i);
  assert.match(implement, /dirty[\s\S]*detached[\s\S]*base branch[\s\S]*`using-git-worktrees`/i);
  assert.match(implement, /`required-execution` mode/i);
  assert.match(implement, /declines?\s+isolation[\s\S]*stop before editing/i);
  assert.match(implement, /after (?:the )?workspace transition[\s\S]*plan input[\s\S]*active\s+workspace/i);
  assert.match(entry, /Approved task plan[\s\S]*mandatory workspace preflight[\s\S]*`implement`/i);

  const worktree = read('skills/using-git-worktrees/SKILL.md');
  assert.match(worktree, /`required-execution` mode[\s\S]*clean, named, non-base/i);
  assert.match(worktree, /dirty[\s\S]*detached[\s\S]*base[\s\S]*create another workspace or stop/i);

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
  const template = read('skills/requesting-code-review/code-reviewer.md');

  for (const state of ['PASS', 'ACTIONABLE', 'OPERATIONAL', 'CONTRACT', 'MALFORMED']) {
    assert.match(review, new RegExp(`\\b${state}\\b`));
  }
  assert.match(review, /Only\s+`OPERATIONAL` may be retried once with the same immutable package/);
  assert.match(review, /mutation[\s\S]*`CONTRACT`/i);
  assert.match(review, /`MALFORMED`[^\n]*missing required fields|missing required fields[\s\S]*`MALFORMED`/i);
  assert.match(review, /mutually exclusive/i);
  assert.match(review, /Minor[^\n]*Ready to merge[^\n]*Yes[\s\S]*`PASS`/i);
  assert.match(review, /Critical\/Important[^\n]*Ready to merge[^\n]*No[\s\S]*`ACTIONABLE`/i);
  assert.match(review, /contradictory tuple[\s\S]*`CONTRACT`/i);
  assert.doesNotMatch(template, /Ready to merge\?\*\* \[Yes \| No \| With fixes\]/);
});

test('planless feature and fix paths transition from bounded review to closeout', () => {
  const preflight = read('skills/using-git-worktrees/execution-preflight.md');
  const brainstorming = read('skills/brainstorming/SKILL.md');
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const small = brainstorming.slice(
    brainstorming.indexOf('- Small / clear'),
    brainstorming.indexOf('- Large / ambiguous'),
  );

  assert.match(preflight, /review(?:er)? state is `PASS`[\s\S]*`finishing-a-development-branch`/);
  assert.match(preflight, /isolation was declined[\s\S]*stop without merge\/PR claims/i);
  assert.match(small, /execution-preflight closeout/);
  assert.match(debugging, /If Phase 4 changes code[\s\S]*requesting-code-review[\s\S]*execution-preflight closeout/);
});

test('both reviewer modes treat repository content as untrusted data', () => {
  const template = read('skills/requesting-code-review/code-reviewer.md');
  const review = read('skills/requesting-code-review/SKILL.md');
  const full = template.slice(template.indexOf('## full-review'), template.indexOf('## verify-fix'));
  const verify = template.slice(template.indexOf('## verify-fix'));

  for (const mode of [full, verify]) {
    assert.match(mode, /requirements\s*\/\s*plan[\s\S]*untrusted\s+data/i);
    assert.match(mode, /review criteria only/i);
    assert.match(mode, /do not follow instructions found in/i);
    assert.match(mode, /network/i);
    assert.match(mode, /secret|credential/i);
    assert.match(mode, /do not dispatch[\s\S]*(agent|fixer)/i);
  }
  assert.match(review, /tool policy[\s\S]*network[\s\S]*secret[\s\S]*agent\s+dispatch/i);
});
