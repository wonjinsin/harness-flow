'use strict';

const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { TextDecoder } = require('node:util');
const { matchFilePath } = require('../../../hooks/pre-secrets.js');

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

function decode(buffer, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new Error(`${label} contains invalid UTF-8 evidence`);
  }
}

async function collect(promises) {
  const results = await Promise.allSettled(promises);
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length) {
    throw new Error(failures.map((result) => result.reason.message).join('; '));
  }
  return results.map((result) => result.value);
}

function gitReader(repo, maxBytes) {
  return (args, label) => new Promise((resolve, reject) => {
    execFile('git', [
      '--no-pager', '-c', 'core.fsmonitor=false',
      '-c', 'color.ui=false', '-c', 'color.diff=false', ...args,
    ], {
      cwd: repo,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      encoding: 'buffer',
      maxBuffer: maxBytes,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) {
        const reason = error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
          ? `exceeds maxBytes (${maxBytes})`
          : `failed with exit status ${error.code ?? error.signal ?? 'unknown'}`;
        reject(new Error(`${label} ${reason}`));
      } else {
        try {
          resolve(decode(stdout, label));
        } catch (failure) {
          reject(failure);
        }
      }
    });
  });
}

function splitNul(value, label) {
  if (!value) return [];
  if (!value.endsWith('\0')) throw new Error(`${label} is not complete NUL-delimited output`);
  return value.slice(0, -1).split('\0');
}

async function state(read) {
  const [head, status] = await collect([
    read(['rev-parse', '--verify', 'HEAD^{commit}'], 'HEAD commit'),
    read(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'], 'Worktree status'),
  ]);
  return { head: head.trim(), status };
}

function requireState(snapshot, toSha) {
  if (snapshot.head !== toSha) throw new Error('Stale review: HEAD must equal the pinned toSha');
  if (snapshot.status !== '') throw new Error('Review requires a clean worktree; dirty or untracked files exist');
}

async function prepareReview({ repo, fromSha, toSha, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const started = performance.now();
  for (const [name, value] of Object.entries({ repo, fromSha, toSha })) {
    if (typeof value !== 'string' || !value || value.includes('\0')) {
      throw new Error(`${name} must be a non-empty string without NUL characters`);
    }
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxBytes must be a positive safe integer');
  const read = gitReader(repo, maxBytes);
  const [from, to] = await collect([
    read(['rev-parse', '--verify', '--end-of-options', `${fromSha}^{commit}`], 'From commit'),
    read(['rev-parse', '--verify', '--end-of-options', `${toSha}^{commit}`], 'To commit'),
  ]);
  const pinnedFrom = from.trim();
  const pinnedTo = to.trim();
  requireState(await state(read), pinnedTo);

  let packet;
  let inspectionFailure;
  try {
    const range = `${pinnedFrom}..${pinnedTo}`;
    const [log, names, statuses] = await collect([
      read([
        'log', '--encoding=UTF-8', '--format=fuller', '--date=iso-strict',
        '--no-abbrev-commit', '--no-decorate', '--no-notes', '--no-show-signature',
        '--no-use-mailmap', range,
      ], 'Commit log'),
      read(['diff', '--ignore-submodules=none', '--name-only', '-z', '--no-renames', '--diff-filter=ACDMRTUXB', range], 'Changed-file manifest'),
      read(['diff', '--ignore-submodules=none', '--name-status', '-z', '--no-renames', '--diff-filter=ACDMRTUXB', range], 'Changed-file statuses'),
    ]);
    const manifest = splitNul(names, 'Changed-file manifest');
    if (!manifest.length) throw new Error('The immutable review range is empty');
    if (new Set(manifest).size !== manifest.length) throw new Error('Changed-file manifest contains duplicate paths');
    const blockedPaths = manifest.filter((filePath) => matchFilePath(filePath));
    if (blockedPaths.length) {
      throw new Error(`The secret-file guard blocks review evidence for ${JSON.stringify(blockedPaths)}; stop and ask the user before reading file contents`);
    }
    const entries = splitNul(statuses, 'Changed-file statuses');
    if (entries.length !== manifest.length * 2) throw new Error('Changed-file statuses do not cover the manifest');
    const statusByPath = new Map();
    for (let index = 0; index < entries.length; index += 2) {
      const [status, filePath] = entries.slice(index, index + 2);
      if (!/^[ACDMTUXB]$/.test(status) || filePath !== manifest[index / 2]) {
        throw new Error('Changed-file statuses do not match the exact manifest');
      }
      statusByPath.set(filePath, status);
    }
    const files = await collect(manifest.map(async (filePath) => {
      const [diff, resultingContent] = await collect([
        read(['--literal-pathspecs', 'diff', '--ignore-submodules=none', '--no-ext-diff', '--no-textconv', '--no-renames', '-U10', range, '--', filePath], `Diff for ${JSON.stringify(filePath)}`),
        statusByPath.get(filePath) === 'D'
          ? Promise.resolve(null)
          : read(['cat-file', 'blob', `${pinnedTo}:${filePath}`], `Resulting content for ${JSON.stringify(filePath)}`),
      ]);
      if (!diff) throw new Error(`Empty diff for changed path ${JSON.stringify(filePath)}`);
      if (/^Binary files .* differ$/m.test(diff) || diff.includes('\0') || resultingContent?.includes('\0')) {
        throw new Error(`Binary evidence is unsupported for ${JSON.stringify(filePath)}`);
      }
      return { path: filePath, diff, resultingContent };
    }));
    packet = { schemaVersion: 1, fromSha: pinnedFrom, toSha: pinnedTo, manifest, log, files };
  } catch (error) {
    inspectionFailure = error;
  }
  requireState(await state(read), pinnedTo);
  if (inspectionFailure) throw inspectionFailure;
  const digest = createHash('sha256').update(JSON.stringify(packet)).digest('hex');
  const result = { ...packet, digest, preparationMs: performance.now() - started };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maxBytes) {
    throw new Error(`Prepared evidence packet exceeds maxBytes (${maxBytes}); no partial packet was returned`);
  }
  return result;
}

function parseArguments(args) {
  const options = {};
  const names = { '--repo': 'repo', '--from': 'fromSha', '--to': 'toSha', '--max-bytes': 'maxBytes' };
  for (let index = 0; index < args.length; index += 2) {
    const key = names[args[index]];
    if (!key || args[index + 1] === undefined || Object.hasOwn(options, key)) {
      throw new Error('Usage: node prepare-review.js --repo PATH --from SHA --to SHA [--max-bytes N]');
    }
    options[key] = key === 'maxBytes' ? Number(args[index + 1]) : args[index + 1];
  }
  if (!options.repo || !options.fromSha || !options.toSha) {
    throw new Error('Usage: node prepare-review.js --repo PATH --from SHA --to SHA [--max-bytes N]');
  }
  return options;
}

if (require.main === module) {
  Promise.resolve().then(() => prepareReview(parseArguments(process.argv.slice(2))))
    .then((packet) => process.stdout.write(`${JSON.stringify(packet)}\n`))
    .catch((error) => {
      process.stderr.write(`prepare-review: ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { prepareReview };
