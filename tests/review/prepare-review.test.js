'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const test = require('node:test');
const { prepareReview } = require('../../skills/requesting-code-review/scripts/prepare-review.js');

const execute = promisify(execFile);
const script = path.resolve(__dirname, '../../skills/requesting-code-review/scripts/prepare-review.js');
const gitEnv = {
  ...process.env,
  GIT_OPTIONAL_LOCKS: '0',
  GIT_AUTHOR_NAME: 'Review Fixture',
  GIT_AUTHOR_EMAIL: 'review@example.test',
  GIT_COMMITTER_NAME: 'Review Fixture',
  GIT_COMMITTER_EMAIL: 'review@example.test',
};

async function git(repo, ...args) {
  const { stdout } = await execute('git', args, { cwd: repo, env: gitEnv });
  return stdout.trim();
}

async function fixture(t) {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'prepare-review-test-'));
  t.after(() => fs.rm(repo, { recursive: true, force: true }));
  await git(repo, 'init', '-q');
  await fs.writeFile(path.join(repo, 'context.js'), Array.from({ length: 60 }, (_, i) => `const line${i} = ${i};`).join('\n') + '\n');
  await fs.writeFile(path.join(repo, 'deleted.txt'), 'remove this content\n');
  await fs.writeFile(path.join(repo, 'old-name.txt'), 'renamed content\n');
  await git(repo, 'add', '--all');
  await git(repo, 'commit', '-qm', 'test: base fixture');
  const fromSha = await git(repo, 'rev-parse', 'HEAD');
  await fs.writeFile(path.join(repo, 'context.js'), (await fs.readFile(path.join(repo, 'context.js'), 'utf8')).replace('const line30 = 30;', 'const line30 = 300;'));
  await fs.unlink(path.join(repo, 'deleted.txt'));
  await fs.rename(path.join(repo, 'old-name.txt'), path.join(repo, 'new-name.txt'));
  const specialPaths = ['[literal].js', ':!excluded.js', 'space name.txt', '\uD55C\uAE00.txt', 'line\nbreak.txt'];
  for (const name of specialPaths) await fs.writeFile(path.join(repo, name), `content for ${JSON.stringify(name)}\n`);
  await git(repo, 'add', '--all');
  await git(repo, 'commit', '-qm', 'test: changed fixture');
  return { repo, fromSha, toSha: await git(repo, 'rev-parse', 'HEAD'), specialPaths };
}

test('prepares complete literal diffs, resulting files, deletion and rename endpoints without mutation', async (t) => {
  const { repo, fromSha, toSha, specialPaths } = await fixture(t);
  const before = await git(repo, 'status', '--porcelain=v2', '--untracked-files=all');
  const indexBefore = await fs.readFile(path.join(repo, '.git', 'index'));
  const packet = await prepareReview({ repo, fromSha, toSha });
  assert.equal(packet.schemaVersion, 1);
  assert.equal(packet.fromSha, fromSha);
  assert.equal(packet.toSha, toSha);
  assert.deepEqual(new Set(packet.manifest), new Set(['context.js', 'deleted.txt', 'old-name.txt', 'new-name.txt', ...specialPaths]));
  assert.deepEqual(packet.files.map((file) => file.path), packet.manifest);
  for (const file of packet.files) assert.ok(file.diff.startsWith('diff --git '), file.path);
  const context = packet.files.find((file) => file.path === 'context.js');
  assert.match(context.diff, /-const line30 = 30;\n\+const line30 = 300;/);
  assert.match(context.diff, /const line20 = 20;/);
  assert.doesNotMatch(context.diff, /const line0 = 0;/);
  assert.match(context.resultingContent, /const line0 = 0;/);
  assert.match(context.resultingContent, /const line59 = 59;/);
  assert.equal(packet.files.find((file) => file.path === 'deleted.txt').resultingContent, null);
  assert.equal(packet.files.find((file) => file.path === 'old-name.txt').resultingContent, null);
  assert.equal(packet.files.find((file) => file.path === 'new-name.txt').resultingContent, 'renamed content\n');
  for (const name of specialPaths) assert.equal(packet.files.find((file) => file.path === name).resultingContent, `content for ${JSON.stringify(name)}\n`);
  assert.match(packet.log, /test: changed fixture/);
  const { digest, preparationMs, ...hashed } = packet;
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, createHash('sha256').update(JSON.stringify(hashed)).digest('hex'));
  assert.ok(preparationMs >= 0);
  assert.equal(await git(repo, 'status', '--porcelain=v2', '--untracked-files=all'), before);
  assert.equal(await git(repo, 'rev-parse', 'HEAD'), toSha);
  assert.deepEqual(await fs.readFile(path.join(repo, '.git', 'index')), indexBefore);
  assert.equal((await prepareReview({ repo, fromSha, toSha })).digest, digest);
});

test('rejects dirty, stale, invalid and empty review packages', async (t) => {
  const input = await fixture(t);
  await assert.rejects(prepareReview({ ...input, fromSha: 'not-a-commit' }), /commit/i);
  await assert.rejects(prepareReview({ ...input, toSha: input.fromSha }), /HEAD|stale/i);
  await assert.rejects(prepareReview({ ...input, fromSha: input.toSha }), /empty/i);
  await fs.writeFile(path.join(input.repo, 'untracked.txt'), 'dirty\n');
  await assert.rejects(prepareReview(input), /clean|dirty/i);
});

test('submodule ignore configuration cannot hide unsupported gitlink changes beside regular files', async (t) => {
  const input = await fixture(t);
  await fs.mkdir(path.join(input.repo, 'vendor'));
  await git(input.repo, 'update-index', '--add', '--cacheinfo', `160000,${input.toSha},vendor`);
  await git(input.repo, 'commit', '-qm', 'test: gitlink base');
  const fromSha = await git(input.repo, 'rev-parse', 'HEAD');
  await fs.writeFile(path.join(input.repo, 'context.js'), 'changed alongside the gitlink\n');
  await git(input.repo, 'add', 'context.js');
  await git(input.repo, 'update-index', '--cacheinfo', `160000,${fromSha},vendor`);
  await git(input.repo, 'commit', '-qm', 'test: regular file and gitlink changes');
  const toSha = await git(input.repo, 'rev-parse', 'HEAD');
  await git(input.repo, 'config', 'diff.ignoreSubmodules', 'all');
  const range = `${fromSha}..${toSha}`;
  assert.equal(await git(input.repo, 'diff', '--name-only', '--no-renames', range), 'context.js');
  assert.equal(await git(input.repo, 'diff', '--ignore-submodules=none', '--name-only', '--no-renames', range), 'context.js\nvendor');
  const before = await git(input.repo, 'status', '--porcelain=v2', '--untracked-files=all');
  await assert.rejects(prepareReview({ repo: input.repo, fromSha, toSha }), /Resulting content for "vendor" failed/);
  await assert.rejects(execute(process.execPath, [script, '--repo', input.repo, '--from', fromSha, '--to', toSha], { env: gitEnv }), (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    assert.match(error.stderr, /Resulting content for "vendor" failed/);
    return true;
  });
  assert.equal(await git(input.repo, 'status', '--porcelain=v2', '--untracked-files=all'), before);
  assert.equal(await git(input.repo, 'rev-parse', 'HEAD'), toSha);
});

test('rejects binary and invalid UTF-8 evidence instead of losing data', async (t) => {
  for (const [label, content] of [['binary', Buffer.from([0, 1, 2])], ['utf8', Buffer.from([0xff, 0xfe])]]) {
    const input = await fixture(t);
    await fs.writeFile(path.join(input.repo, 'unsupported.txt'), content);
    await git(input.repo, 'add', '--all');
    await git(input.repo, 'commit', '-qm', `test: ${label} evidence`);
    const toSha = await git(input.repo, 'rev-parse', 'HEAD');
    await assert.rejects(prepareReview({ ...input, toSha }), /binary|UTF-8/i);
  }
});

test('rejects dirty submodules even when repository configuration hides their status', async (t) => {
  const input = await fixture(t);
  const vendor = path.join(input.repo, 'vendor');
  await fs.mkdir(vendor);
  await git(vendor, 'init', '-q');
  await fs.writeFile(path.join(vendor, 'module.txt'), 'committed module\n');
  await git(vendor, 'add', 'module.txt');
  await git(vendor, 'commit', '-qm', 'test: module base');
  const moduleSha = await git(vendor, 'rev-parse', 'HEAD');
  await git(input.repo, 'update-index', '--add', '--cacheinfo', `160000,${moduleSha},vendor`);
  await git(input.repo, 'commit', '-qm', 'test: unchanged submodule');
  const fromSha = await git(input.repo, 'rev-parse', 'HEAD');
  await fs.writeFile(path.join(input.repo, 'context.js'), 'reviewed change\n');
  await git(input.repo, 'add', 'context.js');
  await git(input.repo, 'commit', '-qm', 'test: parent change');
  const toSha = await git(input.repo, 'rev-parse', 'HEAD');
  const review = { repo: input.repo, fromSha, toSha };
  assert.deepEqual((await prepareReview(review)).manifest, ['context.js']);
  await git(input.repo, 'config', 'diff.ignoreSubmodules', 'all');
  await git(input.repo, 'config', 'submodule.vendor.ignore', 'all');
  await fs.writeFile(path.join(vendor, 'module.txt'), 'uncommitted module change\n');
  assert.equal(await git(input.repo, 'status', '--porcelain=v1'), '');
  assert.match(await git(input.repo, 'status', '--porcelain=v1', '--ignore-submodules=none'), /vendor/);
  await assert.rejects(prepareReview(review), /clean|dirty/i);
});

test('configured diff colors cannot change the prepared evidence', async (t) => {
  const input = await fixture(t);
  const expected = await prepareReview(input);
  await git(input.repo, 'config', 'color.ui', 'always');
  await git(input.repo, 'config', 'color.diff', 'always');
  const actual = await prepareReview(input);
  assert.deepEqual(actual.files, expected.files);
  assert.equal(actual.digest, expected.digest);
  for (const file of actual.files) assert.doesNotMatch(file.diff, /\x1b/);
});

test('configured log presentation cannot replace commit history or inject notes', async (t) => {
  const input = await fixture(t);
  const expected = await prepareReview(input);
  await git(input.repo, 'config', 'format.pretty', 'format:REPLACED COMMIT HISTORY');
  await git(input.repo, 'config', 'log.decorate', 'full');
  await git(input.repo, 'config', 'log.abbrevCommit', 'true');
  await git(input.repo, 'config', 'log.date', 'relative');
  await git(input.repo, 'config', 'log.showSignature', 'true');
  await git(input.repo, 'config', 'log.showNotes', 'true');
  await git(input.repo, 'notes', 'add', '-m', 'UNPINNED REVIEW NOTE', input.toSha);
  const actual = await prepareReview(input);
  assert.match(actual.log, /test: changed fixture/);
  assert.doesNotMatch(actual.log, /REPLACED COMMIT HISTORY|UNPINNED REVIEW NOTE|refs\/heads\//);
  assert.equal(actual.log, expected.log);
  assert.equal(actual.digest, expected.digest);
});

test('colored binary deletion markers cannot bypass unsupported-evidence rejection', async (t) => {
  const input = await fixture(t);
  await fs.writeFile(path.join(input.repo, 'binary.dat'), Buffer.from([0, 1, 2]));
  await git(input.repo, 'add', '--all');
  await git(input.repo, 'commit', '-qm', 'test: binary base');
  const fromSha = await git(input.repo, 'rev-parse', 'HEAD');
  await fs.unlink(path.join(input.repo, 'binary.dat'));
  await git(input.repo, 'add', '--all');
  await git(input.repo, 'commit', '-qm', 'test: delete binary');
  const toSha = await git(input.repo, 'rev-parse', 'HEAD');
  await git(input.repo, 'config', 'color.ui', 'always');
  await git(input.repo, 'config', 'color.diff', 'always');
  await git(input.repo, 'config', 'color.diff.plain', 'red');
  await assert.rejects(prepareReview({ repo: input.repo, fromSha, toSha }), /binary/i);
});

test('log signature configuration cannot launch a verifier while collecting evidence', async (t) => {
  const input = await fixture(t);
  const metadata = path.join(input.repo, '.git');
  const marker = path.join(metadata, 'signature-verifier-ran');
  const verifier = path.join(metadata, 'signature-verifier');
  await fs.writeFile(verifier, `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n`);
  await fs.chmod(verifier, 0o755);
  const original = await git(input.repo, 'cat-file', 'commit', input.toSha);
  const signed = original.replace('\n\n', '\ngpgsig -----BEGIN PGP SIGNATURE-----\n fixture\n -----END PGP SIGNATURE-----\n\n');
  const commitFile = path.join(metadata, 'signed-commit-fixture');
  await fs.writeFile(commitFile, `${signed}\n`);
  const toSha = await git(input.repo, 'hash-object', '-t', 'commit', '-w', commitFile);
  await git(input.repo, 'update-ref', 'HEAD', toSha);
  await git(input.repo, 'config', 'gpg.program', verifier);
  await git(input.repo, 'config', 'log.showSignature', 'true');
  const packet = await prepareReview({ ...input, toSha });
  assert.match(packet.log, /test: changed fixture/);
  await assert.rejects(fs.access(marker), (error) => error.code === 'ENOENT');
});

test('fails oversized packets rather than returning a partial review', async (t) => {
  const input = await fixture(t);
  await assert.rejects(prepareReview({ ...input, maxBytes: 128 }), /size|bytes|buffer|large/i);
  await assert.rejects(prepareReview({ ...input, maxBytes: 0 }), /maxBytes/i);
  const complete = await prepareReview(input);
  const maxBytes = Math.floor(Buffer.byteLength(JSON.stringify(complete)) / 2);
  await assert.rejects(prepareReview({ ...input, maxBytes }), /Prepared evidence packet exceeds/);
});

test('ignores external diff commands and reads symlinks as their pinned blob content', async (t) => {
  const input = await fixture(t);
  await git(input.repo, 'config', 'diff.external', 'this-command-must-not-run');
  await git(input.repo, 'config', 'diff.fixture.textconv', 'this-command-must-not-run');
  await fs.writeFile(path.join(input.repo, '.gitattributes'), '*.js diff=fixture\n');
  await fs.symlink('context.js', path.join(input.repo, 'context-link'));
  await git(input.repo, 'add', '--all');
  await git(input.repo, 'commit', '-qm', 'test: diff configuration and symbolic link');
  const packet = await prepareReview({ ...input, toSha: await git(input.repo, 'rev-parse', 'HEAD') });
  assert.equal(packet.files.find((file) => file.path === 'context-link').resultingContent, 'context.js');
  assert.match(packet.files.find((file) => file.path === 'context.js').diff, /const line30 = 300/);
});

test('CLI prints the same complete JSON contract and exits nonzero on invalid input', async (t) => {
  const input = await fixture(t);
  const { stdout, stderr } = await execute(process.execPath, [script, '--repo', input.repo, '--from', input.fromSha, '--to', input.toSha], { env: gitEnv });
  const packet = JSON.parse(stdout);
  assert.equal(stderr, '');
  assert.equal(packet.toSha, input.toSha);
  assert.equal(packet.files.length, packet.manifest.length);
  await assert.rejects(execute(process.execPath, [script, '--repo', input.repo]), (error) => error.code === 1 && /--from|--to|usage/i.test(error.stderr));
});
