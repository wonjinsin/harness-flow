'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PATTERNS,
  ALLOWLIST,
  matchFilePath,
  matchBashCommand,
} = require('../../hooks/pre-secrets.js');

// ---------- shape ----------

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

test('ALLOWLIST is a non-empty array of RegExp', () => {
  assert.ok(Array.isArray(ALLOWLIST));
  assert.ok(ALLOWLIST.length > 0);
  for (const r of ALLOWLIST) assert.ok(r instanceof RegExp);
});

// ---------- matchFilePath: read-dotenv ----------

test('file read-dotenv: matches /proj/.env', () => {
  assert.equal(matchFilePath('/proj/.env').id, 'read-dotenv');
});
test('file read-dotenv: matches /proj/.env.local', () => {
  assert.equal(matchFilePath('/proj/.env.local').id, 'read-dotenv');
});
test('file read-dotenv: matches /proj/.env.production', () => {
  assert.equal(matchFilePath('/proj/.env.production').id, 'read-dotenv');
});
test('file read-dotenv: matches bare basename .env', () => {
  assert.equal(matchFilePath('.env').id, 'read-dotenv');
});
test('file read-dotenv: does not match foo.env (not dotfile basename)', () => {
  assert.equal(matchFilePath('/proj/foo.env'), null);
});
test('file read-dotenv: does not match /proj/env.txt', () => {
  assert.equal(matchFilePath('/proj/env.txt'), null);
});

// ---------- matchFilePath: ALLOWLIST ----------

test('allowlist: .env.example returns null', () => {
  assert.equal(matchFilePath('/proj/.env.example'), null);
});
test('allowlist: .env.sample returns null', () => {
  assert.equal(matchFilePath('/proj/.env.sample'), null);
});
test('allowlist: .env.template returns null', () => {
  assert.equal(matchFilePath('/proj/.env.template'), null);
});
test('allowlist: .env.schema returns null', () => {
  assert.equal(matchFilePath('/proj/.env.schema'), null);
});
test('allowlist: .env.defaults returns null', () => {
  assert.equal(matchFilePath('/proj/.env.defaults'), null);
});

// ---------- matchFilePath: read-ssh-key ----------

test('file read-ssh-key: matches /home/u/.ssh/id_rsa', () => {
  assert.equal(matchFilePath('/home/u/.ssh/id_rsa').id, 'read-ssh-key');
});
test('file read-ssh-key: matches /tmp/id_ed25519', () => {
  assert.equal(matchFilePath('/tmp/id_ed25519').id, 'read-ssh-key');
});
test('file read-ssh-key: matches bare basename id_ecdsa', () => {
  assert.equal(matchFilePath('id_ecdsa').id, 'read-ssh-key');
});
test('file read-ssh-key: does not match id_rsa.pub', () => {
  assert.equal(matchFilePath('/home/u/.ssh/id_rsa.pub'), null);
});
test('file read-ssh-key: does not match id_rsa_backup', () => {
  assert.equal(matchFilePath('/home/u/.ssh/id_rsa_backup'), null);
});

// ---------- matchFilePath: read-aws-credentials ----------

test('file read-aws-credentials: matches /home/u/.aws/credentials', () => {
  assert.equal(
    matchFilePath('/home/u/.aws/credentials').id,
    'read-aws-credentials',
  );
});
test('file read-aws-credentials: does not match /home/u/.aws/config', () => {
  assert.equal(matchFilePath('/home/u/.aws/config'), null);
});
test('file read-aws-credentials: does not match /home/u/.aws/credentials.bak', () => {
  assert.equal(matchFilePath('/home/u/.aws/credentials.bak'), null);
});

// ---------- matchFilePath: read-gcp-credentials ----------

test('file read-gcp-credentials: matches /home/u/.config/gcloud/credentials.db', () => {
  assert.equal(
    matchFilePath('/home/u/.config/gcloud/credentials.db').id,
    'read-gcp-credentials',
  );
});
test('file read-gcp-credentials: matches application_default_credentials.json', () => {
  assert.equal(
    matchFilePath('/home/u/.config/gcloud/application_default_credentials.json').id,
    'read-gcp-credentials',
  );
});
test('file read-gcp-credentials: does not match /home/u/.config/other/credentials', () => {
  assert.equal(matchFilePath('/home/u/.config/other/credentials'), null);
});

// ---------- matchFilePath: read-gcp-service-account ----------

test('file read-gcp-service-account: matches /tmp/my-service-account.json', () => {
  assert.equal(
    matchFilePath('/tmp/my-service-account.json').id,
    'read-gcp-service-account',
  );
});
test('file read-gcp-service-account: matches /tmp/service_account_key.json', () => {
  assert.equal(
    matchFilePath('/tmp/service_account_key.json').id,
    'read-gcp-service-account',
  );
});
test('file read-gcp-service-account: does not match /tmp/account.json', () => {
  assert.equal(matchFilePath('/tmp/account.json'), null);
});

// ---------- matchFilePath: empty/null ----------

test('matchFilePath returns null on empty string', () => {
  assert.equal(matchFilePath(''), null);
});
test('matchFilePath returns null on null/undefined', () => {
  assert.equal(matchFilePath(null), null);
  assert.equal(matchFilePath(undefined), null);
});

// ---------- matchBashCommand: reader verbs (current coverage) ----------

test('bash read-dotenv: matches cat .env', () => {
  assert.equal(matchBashCommand('cat .env').id, 'read-dotenv');
});
test('bash read-dotenv: matches cat .env.local', () => {
  assert.equal(matchBashCommand('cat .env.local').id, 'read-dotenv');
});
test('bash read-dotenv: matches less ./.env.production', () => {
  assert.equal(matchBashCommand('less ./.env.production').id, 'read-dotenv');
});
test('bash read-ssh-key: matches cat ~/.ssh/id_rsa', () => {
  assert.equal(matchBashCommand('cat ~/.ssh/id_rsa').id, 'read-ssh-key');
});
test('bash read-ssh-key: matches cat id_ed25519', () => {
  assert.equal(matchBashCommand('cat id_ed25519').id, 'read-ssh-key');
});
test('bash read-aws-credentials: matches cat ~/.aws/credentials', () => {
  assert.equal(
    matchBashCommand('cat ~/.aws/credentials').id,
    'read-aws-credentials',
  );
});
test('bash read-gcp-credentials: matches cat ~/.config/gcloud/credentials.db', () => {
  assert.equal(
    matchBashCommand('cat ~/.config/gcloud/credentials.db').id,
    'read-gcp-credentials',
  );
});
test('bash read-gcp-credentials: matches application_default_credentials.json', () => {
  assert.equal(
    matchBashCommand('cat ~/.config/gcloud/application_default_credentials.json').id,
    'read-gcp-credentials',
  );
});
test('bash read-gcp-service-account: matches cat my-service-account.json', () => {
  assert.equal(
    matchBashCommand('cat my-service-account.json').id,
    'read-gcp-service-account',
  );
});
test('bash read-gcp-service-account: matches /tmp/service_account_key.json', () => {
  assert.equal(
    matchBashCommand('cat /tmp/service_account_key.json').id,
    'read-gcp-service-account',
  );
});

// ---------- matchBashCommand: non-reader verbs also block (new behavior) ----------

test('bash: rm .env blocks (read-dotenv)', () => {
  assert.equal(matchBashCommand('rm .env').id, 'read-dotenv');
});
test('bash: vim ~/.ssh/id_rsa blocks (read-ssh-key)', () => {
  assert.equal(matchBashCommand('vim ~/.ssh/id_rsa').id, 'read-ssh-key');
});
test('bash: mv ~/.aws/credentials /tmp/ blocks (read-aws-credentials)', () => {
  assert.equal(
    matchBashCommand('mv ~/.aws/credentials /tmp/').id,
    'read-aws-credentials',
  );
});
test('bash: git add .env blocks (read-dotenv)', () => {
  assert.equal(matchBashCommand('git add .env').id, 'read-dotenv');
});
test('bash: cp ~/.ssh/id_ed25519 /tmp/ blocks (read-ssh-key)', () => {
  assert.equal(
    matchBashCommand('cp ~/.ssh/id_ed25519 /tmp/').id,
    'read-ssh-key',
  );
});

// ---------- matchBashCommand: ALLOWLIST applies to Bash too ----------

test('bash: cat /proj/.env.example passes via ALLOWLIST', () => {
  assert.equal(matchBashCommand('cat /proj/.env.example'), null);
});
test('bash: cat .env.sample passes via ALLOWLIST', () => {
  assert.equal(matchBashCommand('cat .env.sample'), null);
});

// ---------- matchBashCommand: intentional false-positive ----------

test('bash: echo "use .env file" blocks (intentional false-positive — token .env matches)', () => {
  assert.equal(matchBashCommand('echo "use .env file"').id, 'read-dotenv');
});

// ---------- matchBashCommand: negative cases preserved ----------

test('bash: cat env.txt does not match (not a dotfile)', () => {
  assert.equal(matchBashCommand('cat env.txt'), null);
});
test('bash: cat ~/.ssh/id_rsa.pub does not match (.pub excluded)', () => {
  assert.equal(matchBashCommand('cat ~/.ssh/id_rsa.pub'), null);
});
test('bash: cat /path/credentials.txt does not match aws', () => {
  assert.equal(matchBashCommand('cat /path/credentials.txt'), null);
});
test('bash: cat ~/.config/other/file does not match gcp', () => {
  assert.equal(matchBashCommand('cat ~/.config/other/file'), null);
});
test('bash: cat account.json does not match service-account', () => {
  assert.equal(matchBashCommand('cat account.json'), null);
});
test('bash: ls -la returns null', () => {
  assert.equal(matchBashCommand('ls -la'), null);
});

// ---------- matchBashCommand: empty/null ----------

test('matchBashCommand returns null on empty string', () => {
  assert.equal(matchBashCommand(''), null);
});
test('matchBashCommand returns null on null/undefined', () => {
  assert.equal(matchBashCommand(null), null);
  assert.equal(matchBashCommand(undefined), null);
});

// ---------- matchBashCommand: destructive/CLI handled by sibling hook ----------

test('matchBashCommand: rm -rf / returns null (pre-bash-commands handles)', () => {
  assert.equal(matchBashCommand('rm -rf /'), null);
});
test('matchBashCommand: gcloud auth login returns null (pre-bash-commands handles)', () => {
  assert.equal(matchBashCommand('gcloud auth login'), null);
});

// ---------- cross-grammar safety ----------

test('matchFilePath does not match Bash-shaped string "cat .env" (has whitespace)', () => {
  assert.equal(matchFilePath('cat .env'), null);
});
test('matchFilePath does not match "rm -rf /"', () => {
  assert.equal(matchFilePath('rm -rf /'), null);
});
