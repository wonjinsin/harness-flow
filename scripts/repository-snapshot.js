'use strict';

const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const MAX_OUTPUT = 16 * 1024 * 1024;

function runGit(label, args, options = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw new Error(`cannot collect ${label}`);
  if (options.detachedAllowed && result.status === 1 && result.stdout === '') {
    return 'DETACHED';
  }
  if (result.status !== 0) throw new Error(`cannot collect ${label}`);
  return result.stdout;
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function collectSnapshot() {
  const head = runGit('HEAD', ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const symbolic = runGit('symbolic HEAD', ['symbolic-ref', '-q', 'HEAD'], {
    detachedAllowed: true,
  });
  const symbolicHead = symbolic === 'DETACHED' ? symbolic : symbolic.trim();
  const status = runGit('worktree status', [
    'status',
    '--porcelain=v2',
    '--branch',
    '--untracked-files=all',
    '--ignored=matching',
  ]);
  const refs = runGit('refs', ['for-each-ref', '--format=%(refname) %(objectname)']);
  const index = runGit('index', ['ls-files', '--stage', '--debug']);
  const config = runGit('local config', ['config', '--local', '--list']);
  const remotes = runGit('remotes', ['remote', '-v']);

  return {
    version: 1,
    head,
    symbolicHead,
    statusHash: hash(status),
    refsHash: hash(refs),
    indexHash: hash(index),
    configHash: hash(config),
    remoteHash: hash(remotes),
  };
}

try {
  process.stdout.write(`${JSON.stringify(collectSnapshot())}\n`);
} catch (error) {
  process.stderr.write(`repository snapshot failed: ${error.message}\n`);
  process.exitCode = 1;
}
