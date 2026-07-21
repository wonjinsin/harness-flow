'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const md = fs.readFileSync(
  path.join(__dirname, '..', '..', 'skills/using-harness-flow/references/codex-tools.md'),
  'utf-8',
);

test('documents apply_patch secret-guard behavior', () => {
  assert.match(md, /apply_patch/);
});

test('documents advisory SDD tiers without custom profiles', () => {
  const legacyProfilePattern = /codex[-]agents|sdd-(?:cheap|standard|review)|\.codex\/agents/;
  assert.match(md, /cheap[\s\S]*standard[\s\S]*most capable/i);
  assert.doesNotMatch(md, legacyProfilePattern);
});

test('documents the marketplace install command', () => {
  assert.match(md, /codex plugin marketplace add/);
});

test('stale "agents field" removal-condition section is gone', () => {
  assert.doesNotMatch(md, /When this workaround can be removed/);
});
