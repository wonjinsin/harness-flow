'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchFilePath, matchPathPattern } = require('../../hooks/pre/secret-paths.cjs');
const { matchBashCommand } = require('../../hooks/pre/secret-bash.cjs');

test('OMP path normalization recognizes Windows separators', () => {
  assert.equal(matchFilePath('C:\\repo\\.env').id, 'read-dotenv');
});

test('OMP patterns protect brace, wildcard, and character-class branches', () => {
  for (const pattern of [
    '/repo/{.env,safe.txt}',
    '/repo/{safe.txt,{nested,.env}}',
    '/repo/{.env.example,.env}',
    '/repo/**/.env*',
    '/repo/**/[.]env',
    '/repo/.en?',
    '/repo/.en[!x]',
    '/repo/.e*v',
    '/repo/.e?v',
    '/repo/.[a-z]nv',
    '/home/u/.ssh/id_[a-z]sa',
    '/home/u/.ssh/id_{rsa,ed25519}',
    '/repo/.aws/credentia?s',
    '/repo/.config/gcloud/credentials.[d]b',
    '/repo/prod-serviceaccount-[0-9].json',
    '/home/u/.config/gcloud/access_tok?ns.db',
    '/home/u/.config/gcloud/access_toke[n]s.db',
    '/home/u/.config/gcloud/a?c.json',
    '/home/u/.config/gcloud/application_defaul?.json',
    '/repo/.config/gcloud/user_creden*/archive.txt',
    '/repo/prod-serviceacc?unt.json',
    '/repo/private.p?m',
    '/home/u/.netr?',
    '/repo/.en[]v]',
    '/repo/**/*.json',
  ]) assert.ok(matchPathPattern(pattern), pattern);
});

test('OMP patterns fail closed on unverifiable expansions', () => {
  const alternatives = Array.from({ length: 129 }, (_, index) => `safe-${index}`).join(',');
  assert.equal(matchPathPattern(`/repo/{${alternatives}}`).id, 'read-secret-pattern');
  assert.equal(matchPathPattern(`/repo/${'*'.repeat(4097)}`).id, 'read-secret-pattern');
  assert.equal(matchPathPattern('/repo/.en[[:lower:]]').id, 'read-secret-pattern');
  assert.equal(matchPathPattern('/repo/.e{n..n}v').id, 'read-secret-pattern');
});

test('OMP patterns allow safe unions but not template-prefix expansions', () => {
  assert.equal(matchPathPattern('src/{foo,bar}.js'), null);
  assert.equal(matchPathPattern('src/app-*.js'), null);
  assert.equal(matchPathPattern('src/[a-z].js'), null);
  assert.equal(matchPathPattern('/repo/.env.example'), null);
  assert.ok(matchPathPattern('/repo/.env.example*'));
});

test('OMP Bash matching recognizes quoted and expanded secret paths', () => {
  for (const command of [
    'cat "/repo/.env"',
    "cat '/repo/.env'",
    'cat "/repo/my dir/.env"',
    'cat "/repo/.env">/tmp/out',
    'cat /repo/.env*',
    'cat /repo/.en?',
    'cat /repo/.en[!x]',
    'cat /repo/.e"n"v',
    'cat /repo/.e\\nv',
    "cat /repo/$'\\x2e'env",
    'cat /repo/$".e"nv',
    'cat /repo/{safe.txt,.env}',
  ]) assert.equal(matchBashCommand(command)?.id, 'read-dotenv', command);
  assert.equal(matchBashCommand('cat /repo/.e{n..n}v')?.id, 'read-secret-pattern');
  assert.equal(matchBashCommand('cat /home/u/.config/gcloud/access_tok?ns.db')?.id, 'read-gcp-credentials');
  assert.equal(matchBashCommand('cat /home/u/.ssh/id_[a-z]sa')?.id, 'read-ssh-key');
});

test('OMP Bash matching keeps regex and code arguments literal', () => {
  assert.equal(matchBashCommand("rg 'foo.*' src"), null);
  assert.equal(matchBashCommand("node -e 'console.log({ok:true})'"), null);
  assert.equal(matchBashCommand("cat '/repo/.en?'"), null);
});

test('OMP Bash matching preserves quoted fragments next to active globs', () => {
  for (const command of [
    "cat /repo/.e'*'v*",
    'cat /repo/.e\\*v*',
    "cat *'.en?'",
    'cat *.en\\?',
    "cat *$'.en?'",
    'cat *$".en?"',
  ]) assert.equal(matchBashCommand(command), null, command);
});

test('OMP Bash matching crosses quoted directory metacharacters recursively', () => {
  assert.equal(matchBashCommand("cat '/repo/*'/.env*")?.id, 'read-dotenv');
  assert.equal(matchBashCommand("cat '/repo/?'/.ssh/id_[a-z]sa")?.id, 'read-ssh-key');
});

test('OMP Bash matching checks protected globs inside substitutions', () => {
  assert.equal(matchBashCommand('echo "$(cat /repo/.env*)"')?.id, 'read-dotenv');
  assert.equal(matchBashCommand('echo `cat /repo/.env*`')?.id, 'read-dotenv');
  assert.equal(matchBashCommand(`echo "$(printf '%s' "$(cat /repo/.env*)")"`)?.id, 'read-dotenv');
});

test('OMP Bash matching recognizes short ANSI-C Unicode escapes', () => {
  assert.equal(matchBashCommand(String.raw`cat /repo/$'\u2e'env`)?.id, 'read-dotenv');
  assert.equal(matchBashCommand(String.raw`cat /repo/$'\U2e'env`)?.id, 'read-dotenv');
});

test('OMP Bash matching preserves case delimiters and ANSI-C escaped quotes', () => {
  assert.equal(matchBashCommand('echo "$(case x in x) cat /repo/.env*;; esac)"')?.id, 'read-dotenv');
  assert.equal(matchBashCommand(String.raw`echo "$(printf $'\')'; cat /repo/.env*)"`)?.id, 'read-dotenv');
});

test('OMP Bash matching fails closed on excessive substitution complexity', () => {
  let command = 'true';
  for (let index = 0; index < 10000; index += 1) command = `echo "$(${command})"`;
  assert.equal(matchBashCommand(command)?.id, 'read-secret-pattern');
});

test('OMP patch matching preserves allowlisted heredoc targets', () => {
  const patch = "<<'EOF'\n*** Begin Patch\n*** Update File: .env.example\n*** End Patch\nEOF";
  assert.equal(matchBashCommand(patch), null);
});

test('OMP patch matching protects heredoc targets', () => {
  const patch = "<<'EOF'\n*** Begin Patch\n*** Update File: config/.env\n+X=1\n*** End Patch\nEOF";
  assert.equal(matchBashCommand(patch)?.id, 'read-dotenv');
});
