'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SECRET_PATTERNS, scanText } = require('../../hooks/lib/secret-patterns.js');

test('SECRET_PATTERNS is a non-empty array of {name, re}', () => {
  assert.ok(Array.isArray(SECRET_PATTERNS));
  assert.ok(SECRET_PATTERNS.length >= 5);
  for (const p of SECRET_PATTERNS) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.re instanceof RegExp);
  }
});

test('detects AWS Access Key', () => {
  const matches = scanText('aws_key = "AKIA0123456789ABCDEF"');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'AWS Access Key');
  assert.equal(matches[0].line, 1);
});

test('detects GitHub PAT', () => {
  const matches = scanText('token=ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'GitHub PAT');
});

test('detects Private Key Header', () => {
  const matches = scanText('-----BEGIN RSA PRIVATE KEY-----');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'Private Key Header');
});

test('detects GCP API Key', () => {
  const matches = scanText('GOOGLE_API_KEY=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R');
  assert.ok(matches.find((m) => m.name === 'GCP API Key'));
});

test('detects GCP OAuth Access Token', () => {
  const matches = scanText('access_token: "ya29.A0AfH6SMC1234567890abcdefghij"');
  assert.ok(matches.find((m) => m.name === 'GCP OAuth Access Token'));
});

test('detects GCP OAuth Client Secret', () => {
  const matches = scanText('client_secret=GOCSPX-AbCdEf0123456789AbCdEf01234567');
  assert.ok(matches.find((m) => m.name === 'GCP OAuth Client Secret'));
});

test('detects GCP Service Account JSON', () => {
  const matches = scanText('{\n  "type": "service_account",\n  "project_id": "x"\n}');
  assert.ok(matches.find((m) => m.name === 'GCP Service Account'));
});

test('detects generic password assignment', () => {
  const matches = scanText('password = "hunter2hunter"');
  assert.ok(matches.find((m) => m.name === 'Generic password'));
});

test('detects generic API key assignment', () => {
  const matches = scanText('api_key: "abcdef0123456789ABCDEF"');
  assert.ok(matches.find((m) => m.name === 'Generic API key'));
});

test('returns empty array on clean text', () => {
  const matches = scanText('// just a comment\nconst x = 1;');
  assert.deepEqual(matches, []);
});

test('reports correct line numbers', () => {
  const text = 'line 1\nline 2\nAKIA0123456789ABCDEF\nline 4';
  const matches = scanText(text);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].line, 3);
});
