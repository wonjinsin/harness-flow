'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const codex = JSON.parse(fs.readFileSync(path.join(ROOT, '.codex-plugin/plugin.json'), 'utf-8'));
const claude = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf-8'));

test('codex manifest has required Codex fields', () => {
  assert.equal(typeof codex.name, 'string');
  assert.equal(typeof codex.version, 'string');
  assert.equal(typeof codex.description, 'string');
});

test('codex manifest name and version mirror the claude manifest', () => {
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
});

test('codex marketplace lists the harness-flow plugin at repo root', () => {
  const mkt = JSON.parse(fs.readFileSync(path.join(ROOT, '.agents/plugins/marketplace.json'), 'utf-8'));
  assert.ok(Array.isArray(mkt.plugins));
  const entry = mkt.plugins.find((p) => p.name === 'harness-flow');
  assert.ok(entry, 'harness-flow plugin entry present');
  assert.equal(entry.source.path, './');
});
