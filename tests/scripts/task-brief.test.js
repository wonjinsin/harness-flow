'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', '..', 'skills', 'subagent-driven-development', 'scripts', 'task-brief');

function run(planText, n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-brief-'));
  const plan = path.join(dir, 'plan.md');
  fs.writeFileSync(plan, planText);
  const out = path.join(dir, 'out.md');
  const res = spawnSync(SCRIPT, [plan, String(n), out], { encoding: 'utf8' });
  return { res, body: fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '' };
}

const GROUPED = [
  '# Plan',
  '### Group 1: alpha',
  '#### Task 1.1: a', 'aaa',
  '### Group 2: beta',
  '#### Task 2.1: b', 'bbb',
  '#### Task 2.2: c', 'ccc',
  '## Next Section',
  'tail',
].join('\n');

const UNGROUPED = [
  '# Plan',
  '### Task 1: one', 'one-body',
  '### Task 2: two', 'two-body',
].join('\n');

test('group mode extracts only the requested group', () => {
  const { res, body } = run(GROUPED, 2);
  assert.equal(res.status, 0);
  assert.match(body, /### Group 2: beta/);
  assert.match(body, /Task 2\.1/);
  assert.match(body, /Task 2\.2/);
  assert.doesNotMatch(body, /Group 1: alpha/);
  assert.doesNotMatch(body, /Next Section/);
});

test('task mode (no groups) still extracts a single task — backward compat', () => {
  const { res, body } = run(UNGROUPED, 2);
  assert.equal(res.status, 0);
  assert.match(body, /### Task 2: two/);
  assert.doesNotMatch(body, /Task 1: one/);
});
