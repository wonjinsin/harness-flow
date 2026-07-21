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
