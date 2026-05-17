'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PATTERNS, matchDangerous } = require('../../hooks/pre-bash-secrets.js');

test('PATTERNS is a non-empty array of {id, regex, reason}', () => {
  assert.ok(Array.isArray(PATTERNS));
  assert.equal(PATTERNS.length, 5);
  for (const p of PATTERNS) {
    assert.equal(typeof p.id, 'string');
    assert.ok(p.regex instanceof RegExp);
    assert.equal(typeof p.reason, 'string');
  }
});

test('PATTERN ids are unique', () => {
  const ids = PATTERNS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('read-dotenv: matches cat .env', () => {
  assert.equal(matchDangerous('cat .env').id, 'read-dotenv');
});
test('read-dotenv: matches cat .env.local', () => {
  assert.equal(matchDangerous('cat .env.local').id, 'read-dotenv');
});
test('read-dotenv: matches less ./.env.production', () => {
  assert.equal(matchDangerous('less ./.env.production').id, 'read-dotenv');
});
test('read-dotenv: does not match echo "use .env file"', () => {
  assert.equal(matchDangerous('echo "use .env file"'), null);
});
test('read-dotenv: does not match cat env.txt', () => {
  assert.equal(matchDangerous('cat env.txt'), null);
});

test('read-ssh-key: matches cat ~/.ssh/id_rsa', () => {
  assert.equal(matchDangerous('cat ~/.ssh/id_rsa').id, 'read-ssh-key');
});
test('read-ssh-key: matches cat id_ed25519', () => {
  assert.equal(matchDangerous('cat id_ed25519').id, 'read-ssh-key');
});
test('read-ssh-key: does not match cat readme.md', () => {
  assert.equal(matchDangerous('cat readme.md'), null);
});
test('read-ssh-key: does not match cat id_rsa.pub (public key)', () => {
  assert.equal(matchDangerous('cat ~/.ssh/id_rsa.pub'), null);
});

test('read-aws-credentials: matches cat ~/.aws/credentials', () => {
  assert.equal(
    matchDangerous('cat ~/.aws/credentials').id,
    'read-aws-credentials',
  );
});
test('read-aws-credentials: does not match cat /path/credentials.txt', () => {
  assert.equal(matchDangerous('cat /path/credentials.txt'), null);
});

test('read-gcp-credentials: matches cat ~/.config/gcloud/credentials.db', () => {
  assert.equal(
    matchDangerous('cat ~/.config/gcloud/credentials.db').id,
    'read-gcp-credentials',
  );
});
test('read-gcp-credentials: matches cat ~/.config/gcloud/application_default_credentials.json', () => {
  assert.equal(
    matchDangerous('cat ~/.config/gcloud/application_default_credentials.json').id,
    'read-gcp-credentials',
  );
});
test('read-gcp-credentials: does not match cat ~/.config/other/file', () => {
  assert.equal(matchDangerous('cat ~/.config/other/file'), null);
});

test('read-gcp-service-account: matches cat my-service-account.json', () => {
  assert.equal(
    matchDangerous('cat my-service-account.json').id,
    'read-gcp-service-account',
  );
});
test('read-gcp-service-account: matches cat /tmp/service_account_key.json', () => {
  assert.equal(
    matchDangerous('cat /tmp/service_account_key.json').id,
    'read-gcp-service-account',
  );
});
test('read-gcp-service-account: does not match cat account.json', () => {
  assert.equal(matchDangerous('cat account.json'), null);
});

test('matchDangerous returns null on clean command', () => {
  assert.equal(matchDangerous('ls -la'), null);
});

test('matchDangerous accepts empty string', () => {
  assert.equal(matchDangerous(''), null);
});

test('matchDangerous accepts null/undefined safely', () => {
  assert.equal(matchDangerous(null), null);
  assert.equal(matchDangerous(undefined), null);
});

// Cross-category: destructive/CLI patterns belong to the other hook
test('does not match rm -rf / (handled by pre-bash-commands)', () => {
  assert.equal(matchDangerous('rm -rf /'), null);
});
test('does not match gcloud auth login (handled by pre-bash-commands)', () => {
  assert.equal(matchDangerous('gcloud auth login'), null);
});
