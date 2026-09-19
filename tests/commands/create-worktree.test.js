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

test('selects an explicit branch or falls back to the repository base branch', () => {
  const command = readCommand();

  assert.match(command, /branch.*provided[\s\S]*use it as the base/i);
  assert.match(command, /no branch.*provided[\s\S]*repository(?:'s)? base branch/i);
});

test('creates the worktree under the repository-local .worktrees directory', () => {
  const command = readCommand();

  assert.match(command, /repository root[\s\S]*\.worktrees[\\/]<worktree-name>/i);
});

test('lets the agent choose appropriate Git operations without a fixed recipe', () => {
  const command = readCommand();

  assert.match(command, /choose and run[\s\S]*appropriate Git operations[\s\S]*repository state/i);
  assert.doesNotMatch(command, /```|git\s+(?:rev-parse|worktree\s+add|branch|show-ref)/i);
});
