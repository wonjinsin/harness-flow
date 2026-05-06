'use strict';
const { spawnSync } = require('node:child_process');

function makeTargetExists(target, cwd) {
  const r = spawnSync('make', ['-n', target], {
    cwd: cwd || process.cwd(),
    encoding: 'utf-8',
  });
  if (r.status === 0) return true;
  // Make prints "No rule to make target" when target missing or Makefile absent.
  if (r.stderr && /No rule to make target|No targets|Makefile/i.test(r.stderr)) {
    return false;
  }
  return false;
}

function runMake(target, cwd) {
  const r = spawnSync('make', [target], {
    cwd: cwd || process.cwd(),
    encoding: 'utf-8',
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

module.exports = { makeTargetExists, runMake };
