'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const md = fs.readFileSync(path.join(__dirname, '..', '..', 'AGENTS.md'), 'utf-8');

test('AGENTS.md points to using-harness-flow before code work', () => {
  assert.match(md, /using-harness-flow/);
});

test('AGENTS.md references the Codex tool mapping', () => {
  assert.match(md, /codex-tools\.md/);
});
