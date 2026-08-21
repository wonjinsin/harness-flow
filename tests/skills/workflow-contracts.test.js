'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const bashBlocks = (content) => [...content.matchAll(/```bash\n([\s\S]*?)\n```/g)].map((match) => match[1]);
const initRepository = (repository) => {
  execFileSync('git', ['init', '-q'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Harness Test'], { cwd: repository });
  execFileSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: repository });
  fs.writeFileSync(path.join(repository, 'README.md'), 'initial\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repository });
  execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: repository });
};

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
  assert.match(preflight, /base branch[\s\S]*pre-existing changes/);
  assert.match(preflight, /START_HEAD\.\.HEAD/);
});

test('planless preflight has one deterministic limited in-place fallback', () => {
  const preflight = read('skills/using-git-worktrees/execution-preflight.md');

  assert.match(preflight, /ineligible[\s\S]*exactly two choices[\s\S]*isolate[\s\S]*limited in-place/i);
  assert.match(preflight, /isolation is accepted[\s\S]*re-run[\s\S]*still ineligible[\s\S]*stop/i);
  assert.match(preflight, /isolation is\s+declined[\s\S]*`LIMITED_IN_PLACE`/i);
  assert.match(preflight, /declines isolation[\s\S]*separately accepts[\s\S]*restrictions/i);
  assert.match(preflight, /until[\s\S]*restrictions[\s\S]*accepted[\s\S]*do not edit/i);
  assert.match(preflight, /overlaps? a pre-existing changed path[\s\S]*stop before editing/i);
  assert.match(preflight, /must not stage, commit, stash, reset, clean, push, merge, or create a PR/i);
  assert.match(preflight, /working diff[\s\S]*not an immutable approval[\s\S]*stop without merge\/PR claims/i);
});

test('sandbox worktree failure never silently downgrades accepted isolation', () => {
  const worktrees = read('skills/using-git-worktrees/SKILL.md');
  const failure = worktrees.slice(worktrees.indexOf('If `git worktree add` fails'));

  assert.match(failure, /`required-execution`[\s\S]*stop before editing/i);
  assert.match(failure, /accepted isolation[\s\S]*stop before editing/i);
  assert.match(failure, /not[\s\S]*reinterpret[\s\S]*declined/i);
  assert.match(failure, /`LIMITED_IN_PLACE`[\s\S]*explicitly\s+declined isolation/i);
  assert.doesNotMatch(failure, /work\s+in the current directory instead/i);
});

test('report-only debugging stops after diagnosis without entering the fix path', () => {
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const stop = debugging.indexOf('Diagnosis-only request');
  const fix = debugging.indexOf('## Phase 4 — Fix');

  assert.notEqual(stop, -1);
  assert.ok(stop < fix, 'diagnosis-only exit must precede the fix phase');
});

test('bug-fix review routes every non-pass state with a bounded verification loop', () => {
  const debugging = read('skills/systematic-debugging/SKILL.md');
  const afterFix = debugging.slice(debugging.indexOf('## After the fix lands'));
  assert.match(
    afterFix,
    /REVIEWED_HEAD=\$\(git rev-parse --verify 'HEAD\^\{commit\}'\)[\s\S]*`START_HEAD\.\.REVIEWED_HEAD`/i,
  );
  assert.match(afterFix, /`OPERATIONAL`, `CONTRACT`, or `MALFORMED`[\s\S]*stop[\s\S]*do not[\s\S]*retry/i);
  assert.match(afterFix, /`PASS`[\s\S]*execution-preflight closeout/i);
  assert.match(afterFix, /`OPERATIONAL`[\s\S]*stop/i);
  assert.match(afterFix, /`CONTRACT`[\s\S]*stop/i);
  assert.match(afterFix, /`MALFORMED`[\s\S]*stop/i);
  assert.match(afterFix, /`ACTIONABLE`[\s\S]*`plan-escalate`[\s\S]*stop/i);
  assert.match(afterFix, /`ACTIONABLE`[\s\S]*`impl-fix`[\s\S]*TDD[\s\S]*fix commit[\s\S]*`verify-fix`/i);
  assert.match(afterFix, /at most two post-fix reviewer turns/i);
  assert.match(afterFix, /advance `REVIEWED_HEAD`[\s\S]*`FIXED_HEAD`/i);

  const postFix = afterFix.slice(afterFix.indexOf('Maintain the active/resolved'));
  assert.match(postFix, /Reclassify every post-fix result/i);
  assert.match(postFix, /`PASS`[\s\S]*closeout/i);
  assert.match(postFix, /`ACTIONABLE`[\s\S]*`plan-escalate`[\s\S]*stop/i);
  assert.match(postFix, /`ACTIONABLE`[\s\S]*all[^\n]*`impl-fix`[\s\S]*budget[\s\S]*advance `REVIEWED_HEAD`/i);
  assert.match(postFix, /`OPERATIONAL`[\s\S]*`CONTRACT`[\s\S]*`MALFORMED`[\s\S]*stop/i);
  assert.match(
    postFix,
    /create the next `FIXED_HEAD`[\s\S]*request another `verify-fix`[\s\S]*`REVIEWED_HEAD\.\.FIXED_HEAD`[\s\S]*second post-fix reviewer turn[\s\S]*reclassify/i,
  );

  const review = afterFix.indexOf('invoke `requesting-code-review`');
  const passCloseout = afterFix.indexOf('Only after a `PASS`');
  const revise = afterFix.indexOf('`llm-md-revise`', passCloseout);
  const closeout = afterFix.indexOf('execution-preflight closeout', revise);
  assert.ok(review < passCloseout, 'review must precede PASS-only follow-up');
  assert.ok(passCloseout < revise, 'instruction revision must require PASS');
  assert.ok(revise < closeout, 'instruction revision must precede execution closeout');
});

test('instruction revision is PASS-only inside implementation chains', () => {
  const revision = read('skills/llm-md-revise/SKILL.md');
  const implement = read('skills/implement/SKILL.md');

  assert.match(
    revision,
    /within `implement` and `systematic-debugging` chains[\s\S]*only after[\s\S]*final\s+reviewer state is `PASS`/i,
  );
  assert.match(revision, /independent[\s\S]*remember this[\s\S]*direct trigger/i);
  assert.match(
    implement,
    /Only after the final reviewer state is `PASS`[\s\S]*`llm-md-revise`[\s\S]*`finishing-a-development-branch`/i,
  );
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

test('local integration refuses a dirty main checkout before merge or pull', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-flow-main-dirty-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const repository = path.join(temp, 'repository');
  const feature = path.join(temp, 'feature');
  fs.mkdirSync(repository);
  initRepository(repository);
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', feature], { cwd: repository });
  const userFile = path.join(repository, 'user-change.txt');
  fs.writeFileSync(userFile, 'preserve me\n');

  const finishing = read('skills/finishing-a-development-branch/SKILL.md');
  const optionOne = finishing.slice(
    finishing.indexOf('### Option 1: Merge Locally'),
    finishing.indexOf('### Option 2: Push and Create PR'),
  );
  const integrationBlocks = bashBlocks(optionOne);
  assert.equal(integrationBlocks.length, 2, 'integration and branch deletion blocks must remain separate');

  const integration = integrationBlocks[0];
  const beforeCheckout = integration.slice(0, integration.indexOf('cd "$MAIN_ROOT"'));
  assert.match(beforeCheckout, /git -C "\$MAIN_ROOT" status --porcelain/);
  assert.match(integration, /git merge <feature-branch>[\s\S]*git merge --squash <feature-branch>/);
  assert.throws(() => execFileSync('bash', ['-c', beforeCheckout], { cwd: feature, stdio: 'pipe' }));
  assert.equal(fs.readFileSync(userFile, 'utf8'), 'preserve me\n');
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

  assert.match(finishing, /OWNER_RAW=.*git -C "\$FEATURE_WORKTREE_PATH" rev-parse --git-path harness-flow\/worktree-owner/);
  assert.match(finishing, /OWNER_FILE=/);
  assert.match(finishing, /"\$OWNER_KIND" = "manual-git-worktree"/);
  assert.match(finishing, /"\$OWNER_PATH" = "\$WORKTREE_PATH"/);
  assert.match(finishing, /"\$OWNER_COMMON" = "\$GIT_COMMON"/);
  assert.doesNotMatch(finishing, /\.harness-flow\/worktree-owner/);
  assert.doesNotMatch(finishing, /path is under `?\.worktrees/i);
  assert.doesNotMatch(finishing, /or `?worktrees\//i);
});

test('portable provenance parser accepts exactly three lines', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-owner-record-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const finishing = read('skills/finishing-a-development-branch/SKILL.md');
  const cleanup = finishing.slice(finishing.indexOf('### Step 6: Cleanup Workspace'));
  const block = cleanup.match(/```bash\n([\s\S]*?)```/)[1];
  const parser = block.slice(block.indexOf('if ! {'), block.indexOf('if [ "$OWNER_KIND"'));

  for (const [name, record, valid] of [
    ['valid', 'manual-git-worktree\n/path\n/common\n', true],
    ['short', 'manual-git-worktree\n/path\n', false],
    ['long', 'manual-git-worktree\n/path\n/common\nextra\n', false],
    ['long-no-newline', 'manual-git-worktree\n/path\n/common\nextra', false],
  ]) {
    const ownerFile = path.join(tmp, name);
    fs.writeFileSync(ownerFile, record);
    const run = () => execFileSync('bash', ['-c', parser], {
      env: { ...process.env, OWNER_FILE: ownerFile },
      stdio: 'pipe',
    });
    if (valid) assert.doesNotThrow(run);
    else assert.throws(run);
  }
});

test('feature clean gates stop when git status cannot be inspected', (t) => {
  const finishing = read('skills/finishing-a-development-branch/SKILL.md');
  const statusCommands = finishing.match(/git status --short/g) || [];
  const guardedStatusCommands = finishing.match(/if ! STATUS=\$\(git status --short\); then/g) || [];
  assert.equal(statusCommands.length, 3);
  assert.equal(guardedStatusCommands.length, statusCommands.length);

  const normalCheckout = finishing.slice(finishing.indexOf('If this is a normal checkout'));
  const discardScript = bashBlocks(normalCheckout)[0];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-status-failure-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const bin = path.join(tmp, 'bin');
  const log = path.join(tmp, 'git.log');
  fs.mkdirSync(bin);
  const fakeGit = path.join(bin, 'git');
  fs.writeFileSync(fakeGit, [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> "$GIT_LOG"',
    'if [ "$1" = status ]; then exit 7; fi',
    'exit 0',
    '',
  ].join('\n'));
  fs.chmodSync(fakeGit, 0o755);

  assert.throws(() => execFileSync('bash', ['-c', discardScript], {
    cwd: tmp,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GIT_LOG: log, MAIN_ROOT: tmp },
    stdio: 'pipe',
  }));
  assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['status --short']);
});

test('linked-worktree cleanup uses its recorded feature path after leaving it', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cleanup-cwd-'));
  const repo = path.join(tmp, 'project');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repo });
  execFileSync('git', [
    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
    'commit', '--quiet', '-m', 'fixture',
  ], { cwd: repo });
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const worktreeSkill = read('skills/using-git-worktrees/SKILL.md');
  const fallback = worktreeSkill.slice(worktreeSkill.indexOf('**1b. Manual git fallback**'));
  const createScripts = [...fallback.matchAll(/```bash\n([\s\S]*?)```/g)]
    .map((match) => match[1]);
  const createOutput = execFileSync('bash', ['-c', `${createScripts[0]}\n${createScripts[1]}`], {
    cwd: repo,
    env: { ...process.env, BRANCH_NAME: 'feat/cleanup' },
    encoding: 'utf8',
  });
  const featurePath = createOutput.match(/Worktree: (.+)/)[1].trim();

  const finishing = read('skills/finishing-a-development-branch/SKILL.md');
  const cleanupSection = finishing.slice(finishing.indexOf('### Step 6: Cleanup Workspace'));
  const cleanupScript = cleanupSection.match(/```bash\n([\s\S]*?)```/)[1];
  assert.match(cleanupScript, /git -C "\$FEATURE_WORKTREE_PATH"/);
  assert.doesNotMatch(cleanupScript, /\bmapfile\b/);
  assert.match(finishing, /before (?:leaving|changing)[^\n]*worktree[\s\S]*FEATURE_WORKTREE_PATH/i);

  execFileSync('bash', ['-c', `mapfile() { return 127; }\n${cleanupScript}`], {
    cwd: repo,
    env: { ...process.env, FEATURE_WORKTREE_PATH: featurePath },
    stdio: 'pipe',
  });

  assert.equal(fs.existsSync(featurePath), false);
  const listed = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.doesNotMatch(listed, new RegExp(featurePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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
  assert.match(review, /expected active ID[\s\S]*exact set[\s\S]*missing[\s\S]*extra[\s\S]*duplicate/i);
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
