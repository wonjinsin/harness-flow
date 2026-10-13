#!/usr/bin/env node
'use strict';

// pre-secrets.js — PreToolUse(Read|Edit|Write|MultiEdit|Bash) secret guard.
// One hook, one concern, one pattern array. Dispatches on tool_name:
//   - Read|Edit|Write|MultiEdit → match against tool_input.file_path
//   - Bash                      → tokenize tool_input.command, then match each
//                                 token against the same file_path patterns
// Result: any reference to a secret-bearing path — read, write, move, delete,
// list — is blocked, whether the tool is Read or Bash. ALLOWLIST applies in
// both directions.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Fail-open on payload parse errors.

const { emitDeny } = require('./lib/guard.js');
const {
  readStdinSync,
  parsePayload,
  getCommand,
  getFilePath,
  getPatch,
} = require('./lib/payload.js');
const { matchFilePath } = require('./lib/secret-paths.js');
const { matchBashCommand } = require('./lib/secret-bash.js');

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit']);

function main() {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return;

  let payload;
  try {
    payload = parsePayload(readStdinSync());
  } catch (err) {
    console.error(`pre-secrets: payload parse error: ${err.message}`);
    return; // fail-open
  }

  const tool = payload && payload.tool_name;
  let value = '';
  let hit = null;
  let kind = '';

  if (tool === 'Bash') {
    value = getCommand(payload);
    hit = matchBashCommand(value);
    kind = 'Bash command';
  } else if (tool === 'apply_patch') {
    value = getPatch(payload);
    hit = matchBashCommand(value);
    kind = 'apply_patch';
  } else if (FILE_TOOLS.has(tool)) {
    value = getFilePath(payload);
    hit = matchFilePath(value);
    kind = 'file path';
  }

  if (hit) {
    emitDeny(hit, value, kind);
    return; // Exit 0 so the runtime parses the deny JSON on stdout.
  }
}

if (require.main === module) {
  main();
}
