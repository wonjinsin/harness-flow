'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function runGit(repo, args, allowedStatuses = [0]) {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  if (result.error) throw result.error;
  if (!allowedStatuses.includes(result.status)) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args[0]} failed with exit ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return { status: result.status, stdout: result.stdout };
}

function requireCommit(repo, value, label) {
  if (!/^[0-9a-f]{40,64}$/i.test(value || '')) {
    throw new Error(`${label} must be a full commit SHA`);
  }
  return runGit(repo, ['rev-parse', '--verify', `${value}^{commit}`]).stdout.trim();
}

function captureReviewState({ repo, from, to }) {
  if (!repo) throw new Error('repo is required');
  const requestedRoot = fs.realpathSync(repo);
  const repoRoot = fs.realpathSync(runGit(requestedRoot, ['rev-parse', '--show-toplevel']).stdout.trim());
  if (requestedRoot !== repoRoot) throw new Error('repo must name the checkout root');

  const fromSha = requireCommit(repoRoot, from, 'from');
  const toSha = requireCommit(repoRoot, to, 'to');
  const headSha = runGit(repoRoot, ['rev-parse', '--verify', 'HEAD^{commit}']).stdout.trim();
  if (headSha !== toSha) throw new Error(`HEAD ${headSha} does not match TO_SHA ${toSha}`);

  const cleanStatus = runGit(repoRoot, [
    'status', '--porcelain', '--untracked-files=all', '--ignore-submodules=none',
  ]).stdout;
  if (cleanStatus !== '') throw new Error('worktree is not clean');

  const range = runGit(repoRoot, [
    'diff', '--quiet', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none',
    fromSha, toSha,
  ], [0, 1]);
  if (range.status === 0) throw new Error('review range is empty');

  const branchResult = runGit(repoRoot, ['symbolic-ref', '-q', 'HEAD'], [0, 1]);
  const state = {
    schemaVersion: 1,
    repoRoot,
    fromSha,
    toSha,
    headSha,
    branch: branchResult.status === 0 ? branchResult.stdout.trim() : null,
    clean: true,
    nonEmpty: true,
    worktreeHash: hash(runGit(repoRoot, [
      'status', '--porcelain=v2', '--branch', '--untracked-files=all',
      '--ignored=matching', '--ignore-submodules=none',
    ]).stdout),
    refsHash: hash(runGit(repoRoot, ['for-each-ref', '--format=%(refname) %(objectname)']).stdout),
    indexHash: hash(runGit(repoRoot, ['ls-files', '--stage', '--debug']).stdout),
    configHash: hash(runGit(repoRoot, ['config', '--local', '--list']).stdout),
    remotesHash: hash(runGit(repoRoot, ['remote', '-v']).stdout),
  };
  return { ...state, snapshotDigest: hash(JSON.stringify(state)) };
}

function parseArgs(argv) {
  const entries = Array.from({ length: Math.ceil(argv.length / 2) }, (_, pairIndex) => {
    const index = pairIndex * 2;
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--repo', '--from', '--to'].includes(key) || value === undefined) {
      throw new Error('Usage: review-state.js --repo PATH --from SHA --to SHA');
    }
    return [key.slice(2), value];
  });
  const values = Object.fromEntries(entries);
  if (!values.repo || !values.from || !values.to) {
    throw new Error('Usage: review-state.js --repo PATH --from SHA --to SHA');
  }
  return values;
}

module.exports = { captureReviewState };

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(captureReviewState(parseArgs(process.argv.slice(2))))}\n`);
  } catch (error) {
    process.stderr.write(`review-state: ${error.message}\n`);
    process.exitCode = 1;
  }
}
