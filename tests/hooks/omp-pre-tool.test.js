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
      assert.equal(event, 'tool_call');
      handler = candidate;
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
  assert.match(result.reason, /Do NOT retry with a workaround/);
  assert.doesNotMatch(result.reason, /rm -rf \/$/m);
});

test('OMP bash adapter also applies the shared secret matcher', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const result = await handler({ toolName: 'bash', input: { command: 'cat .env' } });
  const quoted = await handler({ toolName: 'bash', input: { command: 'cat "/repo/my dir/.env"' } });

  assert.equal(result.block, true);
  assert.match(result.reason, /^\[read-dotenv\]/);
  assert.doesNotMatch(result.reason, /cat \.env/);
  assert.equal(quoted.block, true);
  assert.match(quoted.reason, /^\[read-dotenv\]/);
  assert.doesNotMatch(quoted.reason, /my dir/);
});

test('OMP file adapter reads native path input and preserves the allowlist', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);

  const denied = await handler({ toolName: 'read', input: { path: '/repo/.env' } });
  const delimitedPaths = [
    '/repo/.env:1-20;/repo/safe.txt',
    '/repo/safe.txt;/repo/.env:1-20;/repo/other.txt',
    '/repo/safe.txt;/repo/.env:1-20',
  ];
  const allowed = await handler({ toolName: 'read', input: { path: '/repo/.env.example' } });

  assert.equal(denied.block, true);
  assert.match(denied.reason, /^\[read-dotenv\]/);
  for (const path of delimitedPaths) {
    const result = await handler({ toolName: 'read', input: { path } });
    assert.equal(result.block, true, path);
    assert.match(result.reason, /^\[read-dotenv\]/);
  }
  assert.equal(allowed, undefined);
});

test('OMP file adapter strips read selectors before matching protected paths', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const selectors = ['1-20:raw', 'L1-L20', '1..20', '1-'];

  for (const selector of selectors) {
    const result = await handler({ toolName: 'read', input: { path: `/repo/.env:${selector}` } });
    assert.equal(result.block, true, selector);
    assert.match(result.reason, /^\[read-dotenv\]/);
  }
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

test('OMP grep adapter blocks protected paths in native string encodings', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const paths = [
    '/repo/.env',
    '["/repo/.env","/repo/safe.txt"]',
    '["/repo/safe.txt","/repo/.env","/repo/other.txt"]',
    '["/repo/safe.txt","/repo/.env"]',
    '/repo/.env:1-20;/repo/safe.txt',
    '/repo/safe.txt;/repo/.env:1-20;/repo/other.txt',
    '/repo/safe.txt;/repo/.env:1-20',
  ];

  for (const path of paths) {
    const result = await handler({ toolName: 'grep', input: { pattern: '.+', path } });
    assert.equal(result.block, true, path);
    assert.match(result.reason, /^\[read-dotenv\]/);
  }
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

test('OMP file adapter canonicalizes native quoted, padded, and hashline-wrapped paths', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const events = [
    { toolName: 'write', input: { path: '[/repo/.env#ABCD]' } },
    { toolName: 'write', input: { path: '[/repo/my dir/.env#ABCD]' } },
    { toolName: 'write', input: { path: '[C:\\repo\\.env#ABCD]' } },
    { toolName: 'read', input: { path: 'C:\\repo\\.env' } },
    { toolName: 'ast_edit', input: { paths: ['"/repo/.env"'] } },
    { toolName: 'grep', input: { pattern: '.+', path: '  "/repo/.env"  ' } },
    { toolName: 'glob', input: { path: '  /repo/.env  ' } },
    { toolName: 'read', input: { path: '"/repo/safe.txt";"/repo/.env"' } },
  ];

  for (const event of events) {
    const result = await handler(event);
    assert.equal(result.block, true, `${event.toolName}: ${JSON.stringify(event.input)}`);
    assert.match(result.reason, /^\[read-dotenv\]/);
  }

  assert.equal(
    await handler({ toolName: 'glob', input: { path: 'src/[a-z].js' } }),
    undefined,
    'glob character classes are not write-tool hashline headers',
  );
  assert.equal(await handler({ toolName: 'write', input: { path: '[/repo/.env.example#ABCD]' } }), undefined);
});

test('OMP search adapters conservatively inspect comma, whitespace, and mixed path lists', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const events = [
    { toolName: 'read', input: { path: '/repo/.env,/repo/safe.txt' } },
    { toolName: 'grep', input: { pattern: '.+', path: '/repo/safe.txt /repo/.env /repo/other.txt' } },
    { toolName: 'glob', input: { path: '/repo/safe.txt, /repo/other.txt; /repo/.env' } },
  ];

  for (const event of events) {
    const result = await handler(event);
    assert.equal(result.block, true, `${event.toolName}: ${JSON.stringify(event.input)}`);
    assert.match(result.reason, /^\[read-dotenv\]/);
  }

  assert.equal(await handler({ toolName: 'glob', input: { path: 'src/{foo,bar}.js' } }), undefined);
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


test('OMP search adapters detect protected glob expansions', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const events = [
    { toolName: 'glob', input: { path: '/repo/{.env,safe.txt}' } },
    { toolName: 'glob', input: { pattern: '/repo/{safe.txt,{nested,.env}}' } },
    { toolName: 'glob', input: { path: '/repo/**/.env*' } },
    { toolName: 'glob', input: { path: '/repo/**/[.]env' } },
    { toolName: 'glob', input: { path: '/repo/.en?' } },
    { toolName: 'glob', input: { path: '/repo/.en[!x]' } },
    { toolName: 'glob', input: { path: '/repo/.e*v' } },
    { toolName: 'glob', input: { path: '/home/u/.ssh/id_[a-z]sa' } },
    { toolName: 'glob', input: { path: '/home/u/.config/gcloud/access_toke[n]s.db' } },
    { toolName: 'glob', input: { path: '/repo/.config/gcloud/user_creden*/archive.txt' } },
    { toolName: 'grep', input: { pattern: '.+', path: '/home/u/.config/gcloud/access_toke?s.db' } },
    { toolName: 'ast_edit', input: { path: '/home/u/.config/gcloud/access_tok?ns.db', ops: [] } },
    { toolName: 'grep', input: { pattern: '.+', path: '/repo/{safe.txt,.env}' } },
    { toolName: 'grep', input: { pattern: '.+', include: '/repo/**/.env*' } },
    { toolName: 'ast_edit', input: { paths: ['/repo/{safe.ts,.env}'], ops: [] } },
    { toolName: 'ast_edit', input: { path: '/repo', glob: '**/.env*', ops: [] } },
  ];

  for (const event of events) {
    const result = await handler(event);
    assert.equal(result.block, true, `${event.toolName}: ${JSON.stringify(event.input)}`);
    assert.match(result.reason, /^\[read-/);
  }

  assert.equal(await handler({ toolName: 'glob', input: { path: 'src/{foo,bar}.js' } }), undefined);
  assert.equal(await handler({ toolName: 'glob', input: { path: '/repo/.env.example' } }), undefined);
});

test('OMP read and grep adapters inspect compound filesystem targets', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const events = [
    { toolName: 'read', input: { path: 'bundle.zip:.env' } },
    { toolName: 'grep', input: { pattern: '.+', path: 'bundle.zip:.env' } },
    { toolName: 'read', input: { path: '/repo/.env?q=describe' } },
    { toolName: 'read', input: { path: '/repo/.env:1-20?q=describe' } },
    { toolName: 'grep', input: { pattern: '.+', path: '/repo/.env?q=describe' } },
  ];

  for (const event of events) {
    const result = await handler(event);
    assert.equal(result.block, true, `${event.toolName}: ${JSON.stringify(event.input)}`);
    assert.match(result.reason, /^\[read-dotenv\]/);
  }
});

test('OMP JSON query text is not interpreted as a filesystem target', async () => {
  const { matchToolCall } = await loadHook();
  const paths = [
    'package.json?q={name:.name}',
    'data.json?q={value:1, note:"client.key; .env"}',
    'data.json?q=.items | map({name:.name})',
    'data.json?q="client.key"',
    'data.json?q={name:.name}&offset=0&limit=1',
  ];
  for (const path of paths) {
    assert.equal(matchToolCall({ toolName: 'read', input: { path } }), undefined, path);
  }
  const denied = matchToolCall({ toolName: 'read', input: { path: 'data.json?q=.name;/repo/.env' } });
  assert.equal(denied.block, true);
  assert.match(denied.reason, /^\[read-dotenv\]/);
});

test('OMP URI paths are decoded once before checking protected targets', async () => {
  const { matchToolCall } = await loadHook();
  const events = [
    { toolName: 'read', input: { path: 'local://%2eenv' } },
    { toolName: 'read', input: { path: 'ssh://synthetic-host/tmp/%2Eenv:1-20:raw' } },
    { toolName: 'write', input: { path: 'local://%2eenv', content: 'synthetic' } },
    { toolName: 'edit', input: { input: '*** Begin Patch\n[local://%2eenv#A1B2]\nREM\n*** End Patch' } },
    { toolName: 'read', input: { path: 'ssh://synthetic-host/tmp/.ssh/id%5Frsa' } },
  ];
  for (const event of events) {
    const result = matchToolCall(event);
    assert.equal(result?.block, true, JSON.stringify(event));
    assert.doesNotMatch(result.reason, /synthetic-host|%2eenv/i);
  }
  for (const path of ['local://%2eenv.example', 'local://%252eenv', '/repo/%2eenv']) {
    assert.equal(matchToolCall({ toolName: 'read', input: { path } }), undefined, path);
  }
});

test('OMP canonical edit adapter scans apply-patch, sloppy, and rename targets', async () => {
  const module = await loadHook();
  const handler = captureToolCallHandler(module.default);
  const events = [
    {
      toolName: 'edit',
      input: { input: '*** Begin Patch\n*** Update File: config/.env\n+X=1\n*** End Patch' },
    },
    {
      toolName: 'edit',
      input: {
        input:
          '*** Begin Patch\n*** Update File: safe.txt\n*** Move to: config/.env\n@@\n-old\n+new\n*** End Patch',
      },
    },
    {
      toolName: 'edit',
      input: { input: '*** Edit File: "config/.env"\n*** Find\nold\n*** Replace\nnew' },
    },
    {
      toolName: 'edit',
      input: { input: '*** Begin Patch\n*** Edit File: .env\n*** Find\nold\n*** Replace\nnew\n*** End Patch' },
    },
    {
      toolName: 'edit',
      input: { input: "<<'EOF'\n*** Begin Patch\n*** Update File: config/.env\n+X=1\n*** End Patch\nEOF" },
    },
    {
      toolName: 'edit',
      input: { input: '*** Edit File: "config/.env"\n*** Find\nold\n*** Replace\nnew\n*** Begin Patch' },
    },
    {
      toolName: 'edit',
      input: { input: '[config/.env#A1B2]\nMV safe.txt\n*** Begin Patch' },
    },
    {
      toolName: 'edit',
      input: { input: '*** Edit File: "/repo/\\u002eenv" all\n*** Find\nold\n*** Replace\nnew' },
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
      input: {
        input: '[safe.txt#A1B2]\nMV "/tmp/private zone/.env"',
        path: 'safe.txt',
        paths: ['safe.txt'],
      },
    },
    {
      toolName: 'edit',
      input: {
        input: '*** Begin Patch\n[safe.txt#A1B2]\nMV /tmp/private-zone/.env\n*** End Patch',
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
    assert.doesNotMatch(result.reason, /private[- ]zone/);
  }

  assert.equal(
    await handler({
      toolName: 'edit',
      input: { input: '*** Begin Patch\n*** Update File: config/.env.example\n+X=1\n*** End Patch' },
    }),
    undefined,
  );
  assert.equal(
    await handler({
      toolName: 'edit',
      input: {
        input:
          '*** Begin Patch\n*** Update File: safe.txt\n@@\n MV /tmp/private-zone/.env\n context only\n*** End Patch',
      },
    }),
    undefined,
    'apply-patch context that resembles a hashline MV operation is content, not a destination',
  );
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
