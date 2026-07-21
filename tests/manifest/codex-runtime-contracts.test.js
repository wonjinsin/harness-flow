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

test('Codex mapping uses current collaboration API contract', () => {
  const md = read('skills/using-harness-flow/references/codex-tools.md');
  assert.match(md, /wait_agent/);
  assert.match(md, /task_name/);
  assert.match(md, /fork_turns[^\n]*none/);
  assert.match(md, /followup_task/);
  assert.doesNotMatch(md, /\bclose_agent\b/);
  assert.doesNotMatch(md, /agent_type\s*=/);
});

test('Codex SDD model selection is advisory and profile-free', () => {
  const readme = read('README.md');
  const mapping = read('skills/using-harness-flow/references/codex-tools.md');
  const sdd = read('skills/subagent-driven-development/SKILL.md');
  const implementer = read('skills/subagent-driven-development/implementer-prompt.md');
  const reviewer = read('skills/subagent-driven-development/task-reviewer-prompt.md');
  const finalReview = read('skills/requesting-code-review/SKILL.md');
  const finalTemplate = read('skills/requesting-code-review/code-reviewer.md');
  const legacyProfilePattern = /sdd-(?:cheap|standard|review)|codex[-]agents|\.codex\/agents/;
  const customAgentModelRoutingPattern = /custom[ -]agent\s+TOML[\s\S]{0,160}\bmodel(?:_reasoning_effort)?\b/i;

  assert.match(sdd, /Codex[\s\S]*cheap[\s\S]*standard[\s\S]*most capable/i);
  assert.match(mapping, /cheap[\s\S]*standard[\s\S]*most capable/i);
  assert.match(readme, /Codex는 권고형[\s\S]*`cheap`[\s\S]*`standard`[\s\S]*`most capable`/);
  assert.match(readme, /direct `spawn_agent`에는 호출별\(per-call\) 모델 강제 기능이 없으며 정확한 모델은 보장되지 않/);
  for (const text of [readme, mapping, sdd, implementer, reviewer, finalReview, finalTemplate]) {
    assert.doesNotMatch(text, legacyProfilePattern);
    assert.doesNotMatch(text, customAgentModelRoutingPattern);
  }
  assert.match(mapping, /direct `spawn_agent`[\s\S]*`model`[\s\S]*지원하지/i);
});

test('Codex SDD profile templates are removed', () => {
  const legacyProfileDir = ['codex', 'agents'].join('-');
  const profileDir = path.join(ROOT, 'skills/using-harness-flow/references', legacyProfileDir);
  assert.equal(fs.existsSync(profileDir), false);
});

test('entry skill uses harness-native skill loading and task tracking', () => {
  const entry = read('skills/using-harness-flow/SKILL.md');
  assert.match(entry, /harness-native\s+skill/i);
  assert.match(entry, /harness-native (plan|task tracking)/i);
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
  assert.match(hooks, /spawn_agent\|collaboration\.spawn_agent/);
});

test('workflow documents one final SDD review and approval before execution', () => {
  const plans = read('skills/writing-plans/SKILL.md');
  const reviews = read('skills/requesting-code-review/SKILL.md');
  assert.doesNotMatch(plans, /review at each group boundary/i);
  assert.match(plans, /There is no\s+group-boundary reviewer/i);
  assert.match(plans, /After the user approves/);
  assert.match(reviews, /SDD.*final whole-branch review/is);
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

test('review workflow uses prepared diff artifacts and absolute skill scripts', () => {
  const reviewer = read('skills/requesting-code-review/code-reviewer.md');
  const sdd = read('skills/subagent-driven-development/SKILL.md');
  assert.match(reviewer, /\{DIFF_FILE\}/);
  assert.match(reviewer, /Do not re-run git commands/);
  assert.match(sdd, /SDD_SKILL_DIR/);
  assert.match(sdd, /IMPLEMENTATION_BASE HEAD/);
  assert.doesNotMatch(sdd, /final review use MERGE_BASE/);
});

test('project memory is platform-aware', () => {
  const memory = read('skills/claude-md-revise/SKILL.md');
  const sdd = read('skills/subagent-driven-development/SKILL.md');
  const debugging = read('skills/systematic-debugging/SKILL.md');
  assert.match(memory, /Codex[\s\S]*AGENTS\.md/);
  assert.match(memory, /do not scan them by guessed path/i);
  for (const text of [sdd, debugging]) {
    assert.match(text, /Codex[\s\S]*AGENTS\.md/);
    assert.match(text, /Claude Code[\s\S]*CLAUDE\.md/);
  }
});
