'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePayload, getCommand, getFilePath } = require('../../hooks/lib/payload.js');

test('parsePayload parses valid JSON', () => {
  const p = parsePayload('{"tool_name":"Bash","tool_input":{"command":"ls"}}');
  assert.equal(p.tool_name, 'Bash');
  assert.equal(p.tool_input.command, 'ls');
});

test('parsePayload throws on invalid JSON', () => {
  assert.throws(() => parsePayload('not json'));
});

test('getCommand returns command string', () => {
  const p = { tool_input: { command: 'git status' } };
  assert.equal(getCommand(p), 'git status');
});

test('getCommand returns empty string when missing', () => {
  assert.equal(getCommand({}), '');
  assert.equal(getCommand({ tool_input: {} }), '');
  assert.equal(getCommand(null), '');
});

test('getFilePath returns path', () => {
  const p = { tool_input: { file_path: '/abs/path/to/file.ts' } };
  assert.equal(getFilePath(p), '/abs/path/to/file.ts');
});

test('getFilePath returns empty when missing', () => {
  assert.equal(getFilePath({}), '');
  assert.equal(getFilePath(null), '');
});
