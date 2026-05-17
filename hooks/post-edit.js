#!/usr/bin/env node
'use strict';

// post-edit.js — PostToolUse(Edit|Write|MultiEdit) post-edit action runner.
// File-path matches a RULES regex → run that rule's commands at payload.cwd.
// Any command exit ≠ 0 → expose stdout/stderr to the LLM and exit 2.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Fail-open on payload parse / no Makefile.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readStdinSync, parsePayload, getFilePath } = require('./lib/payload.js');

function getCwd(payload) {
  // Claude Code PostToolUse payload includes `cwd`; fall back to process.cwd().
  return (payload && payload.cwd) || process.cwd();
}

const RULES = [
  {
    id: 'go-fmt',
    regex: /\.go$/,
    commands: ['make fmt'],
  },
];

function matchRule(filePath) {
  const text = String(filePath == null ? '' : filePath);
  if (!text) return null;
  for (const r of RULES) {
    if (r.regex.test(text)) return r;
  }
  return null;
}

const POST_EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

function main() {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return;

  let payload;
  try {
    payload = parsePayload(readStdinSync());
  } catch (err) {
    console.error(`post-edit: payload parse error: ${err.message}`);
    return; // fail-open
  }

  if (!POST_EDIT_TOOLS.has(payload && payload.tool_name)) return;

  const filePath = getFilePath(payload);
  const rule = matchRule(filePath);
  if (!rule) return;

  const cwd = getCwd(payload);
  // Makefile absent → fail-open (this hook only fires when a Go project asked for it).
  if (!fs.existsSync(path.join(cwd, 'Makefile'))) return;

  for (const cmd of rule.commands) {
    const r = spawnSync(cmd, {
      cwd,
      shell: true,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status !== 0) {
      const out = (r.stdout || '') + (r.stderr || '');
      console.error(
        `[${rule.id}] ${cmd} failed (exit ${r.status})\n${out}\n` +
          `Note: earlier commands in this rule (e.g. make fmt) may have ` +
          `modified ${filePath} on disk — re-Read before editing.\n` +
          `Stop here. Fix the reported issue, do not retry blindly.`,
      );
      process.exit(2);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { RULES, matchRule };
