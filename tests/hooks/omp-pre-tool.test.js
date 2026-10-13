'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HOOK_PATH = path.join(__dirname, '..', '..', 'hooks', 'pre', 'harness-flow.js');
let importSequence = 0;

async function loadHook() {
  const url = pathToFileURL(HOOK_PATH);
  url.searchParams.set('test', String(importSequence++));
  return import(url.href);
}

function captureToolCallHandler(hook) {
  let handler;
  hook({
    on(event, candidate) {
      if (event === 'tool_call') handler = candidate;
    },
  });
  assert.equal(typeof handler, 'function');
  return handler;
}


test('OMP bash adapter blocks destructive commands with the native result shape', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const result = await handler({ toolName: 'bash', input: { command: 'rm -rf /' } });

  assert.deepEqual(Object.keys(result).sort(), ['block', 'reason']);
  assert.equal(result.block, true);
  assert.match(result.reason, /^\[rm-root\]/);
  assert.doesNotMatch(result.reason, /rm -rf \/$/m);
});

test('OMP bash adapter also applies the shared secret matcher', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const result = await handler({ toolName: 'bash', input: { command: 'cat .env' } });

  assert.equal(result.block, true);
  assert.match(result.reason, /^\[read-dotenv\]/);
  assert.doesNotMatch(result.reason, /cat \.env/);
});

test('OMP file adapter reads native path input and preserves the allowlist', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);

  const denied = await handler({ toolName: 'read', input: { path: '/repo/.env' } });
  const allowed = await handler({ toolName: 'read', input: { path: '/repo/.env.example' } });

  assert.equal(denied.block, true);
  assert.match(denied.reason, /^\[read-dotenv\]/);
  assert.equal(allowed, undefined);
});

test('OMP file adapter preserves a POSIX backslash inside a literal filename', { skip: process.platform === 'win32' }, async () => {
  const { matchToolCall } = await loadHook();
  const result = matchToolCall({
    toolName: 'read',
    input: { path: '/repo/reports/note\\.env' },
  });
  assert.equal(result, undefined);
});

test('OMP file adapter checks every normalized multi-file edit target', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);

  const denied = await handler({
    toolName: 'edit',
    input: { paths: ['/repo/safe.txt', '/repo/.env'] },
  });

  assert.equal(denied.block, true);
  assert.match(denied.reason, /^\[read-dotenv\]/);
});

test('OMP grep adapter checks the target path rather than the search pattern', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const denied = await handler({ toolName: 'grep', input: { pattern: '.+', path: '/repo/.env' } });

  assert.equal(denied.block, true);
  assert.equal(await handler({ toolName: 'grep', input: { pattern: '.env', path: 'src/' } }), undefined);
});

test('OMP glob adapter blocks protected path discovery and preserves the allowlist', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);

  const denied = await handler({ toolName: 'glob', input: { path: '/repo/**/.env' } });
  const allowed = await handler({ toolName: 'glob', input: { path: '/repo/**/.env.example' } });

  assert.equal(denied.block, true);
  assert.match(denied.reason, /^\[read-dotenv\]/);
  assert.equal(allowed, undefined);
});

test('OMP search adapters allow ordinary discovery without inventing protected directories', async () => {
  const { matchToolCall } = await loadHook();
  const events = [
    { toolName: 'glob', input: { path: '**/*.js' } },
    { toolName: 'glob', input: { path: '**/*.json' } },
    { toolName: 'glob', input: { path: 'src/**/*' } },
    { toolName: 'glob', input: { path: 'src/**/README.md' } },
    { toolName: 'glob', input: { path: 'src/**/app-*.js' } },
    { toolName: 'glob', input: { path: '*.md', hidden: false, gitignore: true } },
    { toolName: 'grep', input: { pattern: 'export', path: 'src/**/*.ts' } },
    { toolName: 'ast_edit', input: { paths: ['**/*.ts'], ops: [] } },
    { toolName: 'glob', input: { path: 'credentia?s' } },
  ];

  for (const event of events) assert.equal(matchToolCall(event), undefined, JSON.stringify(event));
});

test('OMP literal credential paths retain scope across path-list delimiters', async () => {
  const { matchToolCall } = await loadHook();
  for (const path of [
    '/synthetic/.config/gcloud/user credentials/archive.txt',
    '/synthetic/.config/gcloud/access,tokens.txt',
    '/synthetic/.config/gcloud/adc;backup/archive.txt',
  ]) {
    const result = matchToolCall({ toolName: 'read', input: { path } });
    assert.equal(result?.block, true, path);
    assert.match(result.reason, /^\[read-gcp-credentials\]/);
  }
});

test('OMP edit adapter checks raw patch references and structured rename targets', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const events = [
    {
      toolName: 'apply_patch',
      input: { input: '*** Begin Patch\n*** Update File: config/.env\n+X=1\n*** End Patch' },
    },
    {
      toolName: 'edit',
      input: {
        input: '[safe.txt#A1B2]\nMV /tmp/private-zone/.env',
        path: 'safe.txt',
        paths: ['safe.txt'],
      },
    },
    {
      toolName: 'edit',
      input: { path: 'safe.txt', edits: [{ op: 'update', rename: 'config/.env', diff: '@@\n-old\n+new' }] },
    },
  ];

  for (const event of events) {
    const result = await handler(event);
    assert.equal(result.block, true, JSON.stringify(event.input));
    assert.match(result.reason, /^\[read-dotenv\]/);
    assert.doesNotMatch(result.reason, /private-zone/);
  }

  assert.equal(
    await handler({
      toolName: 'edit',
      input: { input: '*** Begin Patch\n*** Update File: config/.env.example\n+X=1\n*** End Patch' },
    }),
    undefined,
  );
});

test('OMP edit guard treats secret references in patch content like the command guard', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const result = await handler({
    toolName: 'edit',
    input: {
      path: 'safe.txt',
      paths: ['safe.txt'],
      input: '[safe.txt#A1B2]\nPUT >1:\n+See .env for local settings',
    },
  });

  assert.equal(result?.block, true);
  assert.match(result.reason, /^\[read-dotenv\]/);
});

test('OMP adapter passes safe and unknown tool calls', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);

  assert.equal(await handler({ toolName: 'bash', input: { command: 'git status' } }), undefined);
  assert.equal(await handler({ toolName: 'web_fetch', input: { url: 'https://example.com/.env' } }), undefined);
});

test('OMP adapter honors HARNESS_FLOW_HOOKS_OFF', async () => {
  const original = process.env.HARNESS_FLOW_HOOKS_OFF;
  process.env.HARNESS_FLOW_HOOKS_OFF = '1';
  try {
    const module = await loadHook();
    const handler = captureToolCallHandler(module.default);
    assert.equal(await handler({ toolName: 'bash', input: { command: 'rm -rf /' } }), undefined);
  } finally {
    if (original === undefined) delete process.env.HARNESS_FLOW_HOOKS_OFF;
    else process.env.HARNESS_FLOW_HOOKS_OFF = original;
  }
});
