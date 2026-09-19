'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const COMMAND_PATH = path.join(ROOT, 'commands', 'create-worktree.md');
const readCommand = () => fs.readFileSync(COMMAND_PATH, 'utf8');

test('create-worktree command exists', () => {
  assert.equal(fs.existsSync(COMMAND_PATH), true);
});

test('uses a positional branch name and an optional --base branch', () => {
  const command = readCommand();

  assert.match(command, /^argument-hint: <branch-name> \[--base <base-branch-name>\]$/m);
  assert.match(command, /use `<branch-name>` as the new branch name/i);
  assert.match(command, /`--base`.*provided[\s\S]*use.*base branch/i);
  assert.match(command, /`--base`.*omitted[\s\S]*repository(?:'s)? base branch/i);
});

test('stops on invalid arguments before changing repository state', () => {
  const command = readCommand();

  assert.match(command, /arguments do not match[\s\S]*stop before changing[\s\S]*show the expected usage/i);
});

test('creates the worktree under the repository-local .worktrees directory', () => {
  const command = readCommand();

  assert.match(command, /repository root[\s\S]*\.worktrees[\\/]<worktree-name>/i);
  assert.match(command, /derive `<worktree-name>`[\s\S]*replac(?:e|ing)[\s\S]*`\/`[\s\S]*`-`/i);
});

test('lets the agent choose appropriate Git operations without a fixed recipe', () => {
  const command = readCommand();

  assert.match(command, /choose and run[\s\S]*appropriate Git operations[\s\S]*repository state/i);
  assert.doesNotMatch(command, /```|git\s+(?:rev-parse|worktree\s+add|branch|show-ref)/i);
});
