import bashGuard from '../pre-bash-commands.js';
import secretGuard from '../pre-secrets.js';
import payload from '../lib/payload.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { matchDangerous } = bashGuard;
const { matchFilePath, matchBashCommand } = secretGuard;
const { getPatch } = payload;

const FILE_TOOLS = new Set(['read', 'grep', 'glob', 'edit', 'write', 'multiedit', 'multi_edit', 'delete', 'ast_edit']);
const EDIT_TOOLS = new Set(['edit', 'apply_patch', 'patch']);

function blockResult(match) {
  if (!match) return undefined;
  return {
    block: true,
    reason: `[${match.id}] ${match.reason}\nStop here. Do NOT retry with a workaround. Ask the user how to proceed.`,
  };
}

export function matchToolCall(event) {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return undefined;

  const toolName = typeof event?.toolName === 'string' ? event.toolName.toLowerCase() : '';
  const input = event?.input && typeof event.input === 'object' ? event.input : {};

  if (toolName === 'bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    return blockResult(matchDangerous(command) || matchBashCommand(command));
  }

  if (!FILE_TOOLS.has(toolName) && !EDIT_TOOLS.has(toolName)) return undefined;

  const paths = [input.path, input.file_path, input._path, input.paths, input.glob, input.include];
  if (toolName === 'glob') paths.push(input.pattern);
  if (EDIT_TOOLS.has(toolName) && Array.isArray(input.edits)) {
    for (const edit of input.edits) {
      if (edit && typeof edit === 'object') paths.push(edit.rename, edit.move, edit.to);
    }
  }
  for (const path of paths.flat()) {
    if (typeof path !== 'string') continue;
    const match = matchFilePath(path);
    if (match) return blockResult(match);
  }

  // Reuse the command guard's conservative patch scan, including content references.
  if (EDIT_TOOLS.has(toolName)) {
    return blockResult(matchBashCommand(getPatch({ tool_input: input })));
  }

  return undefined;
}

export default function registerHarnessFlowPreToolHook(pi) {
  const pluginRoot = fileURLToPath(new URL('../../', import.meta.url));
  const sessionContextType = 'harness-flow-session-start';

  function canInject(ctx) {
    return process.env.HARNESS_FLOW_HOOKS_OFF !== '1' && ctx.agent?.kind !== 'sub';
  }

  function needsResetContext(ctx) {
    const branch = ctx.sessionManager.getBranch();
    for (let index = branch.length - 1; index >= 0; index -= 1) {
      const entry = branch[index];
      if (entry.type === 'custom_message' && entry.customType === sessionContextType) return false;
      if (entry.type === 'reset_boundary') return true;
    }
    return false;
  }

  function commandSessionContext(name) {
    const output = execFileSync(process.execPath, [`${pluginRoot}hooks/session-start-${name}.js`], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
    });
    return JSON.parse(output).hookSpecificOutput.additionalContext;
  }

  function sessionMessage() {
    return {
      customType: sessionContextType,
      content: commandSessionContext('harness') + '\n' + commandSessionContext('caveman'),
      display: false,
      attribution: 'agent',
    };
  }

  function injectSessionContext(_event, ctx) {
    if (!canInject(ctx)) return;
    pi.sendMessage(sessionMessage());
  }

  pi.on('session_start', injectSessionContext);
  pi.on('session_switch', (event, ctx) => {
    if (event.reason === 'new' || event.reason === 'resume') injectSessionContext(event, ctx);
  });
  pi.on('session_compact', injectSessionContext);
  pi.on('before_agent_start', (_event, ctx) => {
    if (!canInject(ctx) || !needsResetContext(ctx)) return;
    // /clear emits no lifecycle event. Only a persisted bootstrap consumes the
    // reset, so an abandoned prompt cannot leave the next turn uninitialized.
    return { message: sessionMessage() };
  });
  pi.on('tool_call', async (event) => matchToolCall(event));
}
