'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = path.join(__dirname, '..', '..', 'hooks', 'pre', 'harness-flow.js');

async function createSession() {
  const { default: register } = await import(pathToFileURL(HOOK_PATH).href);
  const handlers = new Map();
  const messages = [];
  const branch = [];
  register({
    on(event, handler) { handlers.set(event, handler); },
    sendMessage(message) { messages.push(message); },
  });
  const context = {
    agent: { kind: 'main' },
    sessionManager: { getBranch: () => branch },
  };
  return {
    messages,
    branch,
    context,
    emit: (type, event = {}) => handlers.get(type)?.({ type, ...event }, context),
  };
}

test('OMP clear re-primes the session once without reactivating it on ordinary prompts', async () => {
  const session = await createSession();
  await session.emit('session_start');
  session.branch.push({ type: 'message', id: 'stop', message: { role: 'user', content: 'stop caveman' } });
  assert.equal(await session.emit('before_agent_start', { prompt: 'Continue in normal mode' }), undefined);

  session.branch.push({ type: 'reset_boundary', id: 'clear-1' });
  const reset = await session.emit('before_agent_start', { prompt: 'Continue' });
  assert.equal(reset?.message.customType, 'harness-flow-session-start');
  assert.equal(reset.message.display, false);
  session.branch.push({ type: 'custom_message', ...reset.message });
  assert.equal(await session.emit('before_agent_start', { prompt: 'stop caveman' }), undefined);
  session.branch.push({ type: 'message', id: 'normal', message: { role: 'user', content: 'Explain fully' } });
  assert.equal(await session.emit('before_agent_start', { prompt: 'Explain fully' }), undefined);

  session.branch.push({ type: 'reset_boundary', id: 'clear-2' });
  assert.equal((await session.emit('before_agent_start', { prompt: 'Continue' }))?.message.customType, 'harness-flow-session-start');
});

test('an abandoned post-clear prompt does not consume the next bootstrap', async () => {
  const session = await createSession();
  await session.emit('session_start');
  session.branch.push({ type: 'reset_boundary', id: 'clear-abandoned' });
  const abandoned = await session.emit('before_agent_start', { prompt: 'Cancelled prompt' });
  const retry = await session.emit('before_agent_start', { prompt: 'Replacement prompt' });
  assert.equal(abandoned?.message.customType, 'harness-flow-session-start');
  assert.equal(retry?.message.customType, 'harness-flow-session-start');
});

test('session bootstraps leave subagent task context alone', async () => {
  const session = await createSession();
  session.context.agent.kind = 'sub';
  for (const event of ['session_start', 'session_compact']) await session.emit(event);
  await session.emit('session_switch', { reason: 'resume' });
  session.branch.push({ type: 'reset_boundary', id: 'sub-clear' });
  assert.equal(await session.emit('before_agent_start', { prompt: 'Review the diff' }), undefined);
  assert.deepEqual(session.messages, []);
  const blocked = await session.emit('tool_call', { toolName: 'bash', input: { command: 'rm -rf /' } });
  assert.equal(blocked.block, true);
});

test('disabled OMP hooks do not reactivate either skill across session boundaries', async () => {
  const previous = process.env.HARNESS_FLOW_HOOKS_OFF;
  process.env.HARNESS_FLOW_HOOKS_OFF = '1';
  try {
    const session = await createSession();
    for (const event of ['session_start', 'session_compact']) await session.emit(event);
    await session.emit('session_switch', { reason: 'resume' });
    session.branch.push({ type: 'reset_boundary', id: 'disabled-clear' });
    assert.equal(await session.emit('before_agent_start', { prompt: 'Continue' }), undefined);
    assert.deepEqual(session.messages, []);
  } finally {
    if (previous === undefined) delete process.env.HARNESS_FLOW_HOOKS_OFF;
    else process.env.HARNESS_FLOW_HOOKS_OFF = previous;
  }
});

test('disabled command hooks do not inject session context on Claude or Codex', () => {
  for (const name of ['harness', 'caveman']) {
    const script = path.join(__dirname, '..', '..', 'hooks', `session-start-${name}.js`);
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, HARNESS_FLOW_HOOKS_OFF: '1' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '', `${name} must not reactivate when hooks are disabled`);
  }
});
