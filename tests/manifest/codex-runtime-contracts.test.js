'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('plugin exposes each skill name exactly once', () => {
  const names = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      if (entry.isFile() && entry.name === 'SKILL.md') {
        const match = fs.readFileSync(full, 'utf8').match(/^name:\s*(.+)$/m);
        if (match) names.push({ name: match[1].trim(), full });
      }
    }
  };
  visit(path.join(ROOT, 'skills'));
  const duplicates = names.filter((item, index) =>
    names.findIndex((candidate) => candidate.name === item.name) !== index
  );
  assert.deepEqual(duplicates, []);
});

test('Codex SDD profile templates are removed', () => {
  const legacyProfileDir = ['codex', 'agents'].join('-');
  const profileDir = path.join(ROOT, 'skills/using-harness-flow/references', legacyProfileDir);
  assert.equal(fs.existsSync(profileDir), false);
});

test('entry skill uses harness-neutral wording, not Claude-specific tools', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');
  assert.match(entry, /harness-neutral/i);
  assert.match(entry, /task tracking/i);
  assert.doesNotMatch(entry, /TodoWrite/);
});

test('review dispatch documents the Codex direct-call translation', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');
  for (const text of [review, template]) {
    assert.match(text, /spawn_agent/);
    assert.match(text, /fork_turns[^\n]*none/);
    assert.match(text, /final_review/);
  }
});

test('code review is report-only and standalone review has no fix lifecycle', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');
  assert.match(review, /one invocation dispatches exactly one reviewer turn/i);
  assert.match(review, /standalone[\s\S]*report[\s\S]*does not fix, re-review, or finish/i);
  assert.match(template, /report-only/i);
  assert.match(template, /do not edit[\s\S]*stage[\s\S]*commit[\s\S]*push/i);
  assert.match(template, /do not dispatch a fixer/i);
  assert.match(template, /files, worktree, index, refs, repository config, or remotes/i);
  assert.match(template, /delete, move[\s\S]*restore[\s\S]*stash[\s\S]*clean/i);
});

test('code review preflights an immutable commit range', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  assert.match(review, /git merge-base/);
  assert.match(review, /git symbolic-ref -q HEAD/);
  assert.match(review, /git status --porcelain=v2 --branch --untracked-files=all --ignored=matching/);
  assert.match(review, /git for-each-ref/);
  assert.match(review, /git ls-files --stage --debug/);
  assert.match(review, /git config --local --list/);
  assert.match(review, /git remote -v/);
  assert.match(review, /git diff --quiet/);
  assert.match(review, /dirty[\s\S]*stop/i);
  assert.match(review, /empty[\s\S]*stop/i);
});

test('review report proves execution and preserves stable finding identity', () => {
  const template = read('skills/requesting-code-review/code-reviewer.md');
  assert.match(template, /Stage 1[\s\S]*Requirements compliance/i);
  assert.match(template, /Stage 2[\s\S]*Implementation quality/i);
  assert.match(template, /do not run tests/i);
  assert.match(template, /Finding ID/);
  assert.match(template, /Review execution:[^\n]*Complete[^\n]*Incomplete/i);
  assert.match(template, /Reviewed range/);
  assert.match(template, /git diff --name-only/);
  assert.match(template, /each listed path[\s\S]*exactly once/i);
  assert.match(template, /Reviewed files:[^\n]*N\/N/i);
  assert.match(template, /reviewed-file count[\s\S]*changed-file count[\s\S]*Incomplete/i);
  assert.match(template, /do not run an aggregate diff/i);
});

test('code review supports focused verification without rereading the branch', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');
  for (const text of [review, template]) {
    assert.match(text, /full-review/);
    assert.match(text, /verify-fix/);
    assert.match(text, /REVIEWED_HEAD/);
    assert.match(text, /FIXED_HEAD/);
  }
  assert.match(template, /PRIOR_FINDINGS/);
  assert.match(template, /TEST_EVIDENCE/);
  assert.match(template, /Resolved[\s\S]*Unresolved[\s\S]*Not-verifiable/i);
  assert.match(template, /do not\s+reread\s+the\s+original branch diff/i);
  assert.match(template, /do not read\s+files or commits outside this diff/i);
  assert.match(template, /fix range[\s\S]*git diff --name-only/i);
  assert.match(template, /new issue[\s\S]*unique[\s\S]*preserve/i);
  assert.match(template, /resolved[\s\S]*carry[\s\S]*do not re-evaluate/i);
  assert.doesNotMatch(template, /Read minimal unchanged context/i);
  assert.match(review, /resume[\s\S]*same reviewer/i);
  assert.match(review, /active findings[\s\S]*resolved ledger/i);
});

test('managed review loops batch fixes and cap focused verification', () => {
  const implement = read('skills/implement/SKILL.md');
  const brainstorm = read('skills/brainstorming/SKILL.md');
  const agents = read('AGENTS.md');
  const readme = read('README.md');
  assert.match(implement, /batch all Critical\/Important[\s\S]*impl-fix/i);
  assert.match(implement, /resume the same reviewer/i);
  assert.match(implement, /at most two post-fix reviewer turns/i);
  assert.match(implement, /full-review[\s\S]*verify-fix[\s\S]*count/i);
  assert.match(implement, /public API[\s\S]*schema[\s\S]*security[\s\S]*dependencies[\s\S]*full-review/i);
  assert.match(implement, /Incomplete[\s\S]*escalate/i);
  assert.doesNotMatch(implement, /3 re-reviews/i);
  assert.match(brainstorm, /focused `verify-fix`[\s\S]*two post-fix\s+reviewer turns/i);
  assert.match(brainstorm, /use TDD[\s\S]*full suite[\s\S]*one fix commit/i);
  assert.match(agents, /report-only[\s\S]*two focused post-fix/i);
  assert.match(readme, /report-only[\s\S]*focused `verify-fix`/i);
  assert.match(readme, /RCR_FULL -- "impl-fix" --> FIX/);
  assert.match(readme, /FIX --> RCR_VERIFY/);
  assert.match(readme, /shared[^\n]*2 post-fix turns/i);
});

test('incomplete or mutating reviewer runs fail closed', () => {
  const review = read('skills/requesting-code-review/SKILL.md');
  const template = read('skills/requesting-code-review/code-reviewer.md');
  assert.match(template, /execution is Incomplete[\s\S]*Ready to merge[^\n]*No/i);
  assert.match(review, /after the reviewer returns[\s\S]*compare every snapshot/i);
  assert.match(review, /tool-level read-only/i);
  assert.match(review, /cannot enforce[\s\S]*isolated disposable checkout[\s\S]*active checkout/i);
  assert.match(review, /timeout[\s\S]*empty[\s\S]*malformed[\s\S]*not approval/i);
  assert.match(review, /state changed[\s\S]*invalid[\s\S]*never\s+revert/i);
});

test('SessionStart covers Codex resume and Windows hook commands', () => {
  const hooks = read('hooks/hooks.json');
  assert.match(hooks, /startup\|resume\|clear\|compact/);
  assert.match(hooks, /commandWindows/);
});

test('workflow documents one final review and approval before execution', () => {
  const plans = read('skills/writing-plans/SKILL.md');
  const reviews = read('skills/requesting-code-review/SKILL.md');
  assert.doesNotMatch(plans, /review at each group boundary/i);
  assert.match(plans, /There is no\s+group-boundary reviewer/i);
  assert.match(plans, /After the user approves/);
  assert.match(reviews, /implement.*final whole-branch review/is);
});

test('TDD deletion rule preserves pre-existing user code', () => {
  const tdd = read('skills/test-driven-development/SKILL.md');
  assert.match(tdd, /pre-existing user code/i);
  assert.match(tdd, /current TDD cycle/i);
});

test('manual worktree flow validates names, avoids branch pollution, and records ownership', () => {
  const worktrees = read('skills/using-git-worktrees/SKILL.md');
  assert.match(worktrees, /git check-ref-format --branch/);
  assert.match(worktrees, /git check-ignore -q -- "\$LOCATION"/);
  assert.match(worktrees, /sibling directory/i);
  assert.match(worktrees, /manual-git-worktree/);
  assert.doesNotMatch(worktrees, /Add to \.gitignore, commit/i);
});

test('branch finishing handles detached hosts and invokes PR creation', () => {
  const finishing = read('skills/finishing-a-development-branch/SKILL.md');
  assert.match(finishing, /detached HEAD[\s\S]*exactly these 2 options/i);
  assert.match(finishing, /Create branch/);
  assert.match(finishing, /Hand off to local/);
  assert.match(finishing, /harness-flow:pr-creator/);
  assert.match(finishing, /git switch <base-branch>/);
});

test('project memory is platform-aware', () => {
  const memory = read('skills/llm-md-revise/SKILL.md');
  assert.match(memory, /Codex[\s\S]*AGENTS\.md/);
  assert.match(memory, /do not scan them by guessed path/i);
  // Codex nested-file loading is launch-cwd dependent, not subtree/on-demand
  assert.match(memory, /launch(ed)?[\s\S]*director/i);
  // never persist secrets/credentials/PII into instruction files
  assert.match(memory, /never persist a secret|Secret \/ PII/i);
});
