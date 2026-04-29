#!/usr/bin/env node
// Stop hook — harness flow dispatcher PoC (prd-writer only).
//
// Runs when Claude Code thinks the assistant turn is finished. If the last
// assistant message contains a JSON skill output for `prd-writer`, this hook
// computes the next node per harness-flow.yaml and blocks the stop, injecting
// a `decision: block` continuation that tells the LLM to invoke the next
// skill. Other skills' output (or no JSON at all) → exit 0, allow stop.
//
// Scope (PoC): prd-writer only. Other writers/skills are no-ops.
// Set HARNESS_HOOK_DEBUG=1 to log to /tmp/harness-hook.log.

'use strict';

const fs = require('fs');
const path = require('path');

function debug(msg) {
  if (!process.env.HARNESS_HOOK_DEBUG) return;
  try {
    fs.appendFileSync('/tmp/harness-hook.log',
      new Date().toISOString() + ' [dispatch-next] ' + msg + '\n');
  } catch (_) { /* best-effort */ }
}

function allowStop(reason) {
  debug('allow stop: ' + reason);
  process.exit(0);
}

// 1. Read stdin
let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch (e) {
  allowStop('stdin parse failed: ' + e.message);
}

// Loop guard — Claude Code sets this true if a Stop hook in this chain
// already fired once. Without this check we could re-block forever.
if (input.stop_hook_active) allowStop('stop_hook_active=true (loop guard)');
if (input.hook_event_name && input.hook_event_name !== 'Stop') {
  allowStop('not a Stop event: ' + input.hook_event_name);
}

// 2. Locate plugin root (kept for future yaml parsing; PoC routes by hardcode)
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT
  || path.resolve(__dirname, '..');
debug('plugin root: ' + pluginRoot);

// 3. Read transcript, extract last assistant message text
let lastText = '';
try {
  if (!input.transcript_path) allowStop('no transcript_path');
  const lines = fs.readFileSync(input.transcript_path, 'utf8')
    .trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch (_) { continue; }
    const msg = entry.message || entry;
    if (msg.role !== 'assistant') continue;
    const content = msg.content;
    if (typeof content === 'string') {
      lastText = content;
    } else if (Array.isArray(content)) {
      lastText = content
        .filter(c => c && c.type === 'text')
        .map(c => c.text || '')
        .join('\n');
    }
    if (lastText) break;
  }
} catch (e) {
  allowStop('transcript read failed: ' + e.message);
}

if (!lastText) allowStop('no assistant text found');

// 4. Look for skill JSON output containing node_id
//    Permissive regex: pick the largest balanced-looking object that contains
//    "node_id". For PoC, we accept the simplest match.
const jsonMatch = lastText.match(/\{[^{}]*"node_id"\s*:\s*"[^"]+"[^{}]*\}/);
if (!jsonMatch) allowStop('no node_id JSON in last assistant message');

let out;
try {
  out = JSON.parse(jsonMatch[0]);
} catch (e) {
  allowStop('JSON parse failed: ' + e.message);
}

debug('parsed skill output: ' + JSON.stringify(out));

// 5. PoC scope guard
if (out.node_id !== 'prd-writer') {
  allowStop('PoC limited to prd-writer; saw node_id=' + out.node_id);
}

// 6. Compute next per harness-flow.yaml semantics
//    From flow.yaml:
//      trd-writer.depends_on includes prd-writer; when matches brainstorming_outcome ∈ {prd-trd, trd-only}
//      task-writer.depends_on includes prd-writer; when matches ∈ {prd-trd, prd-only, trd-only, tasks-only}
//    First-match-wins (declaration order: trd-writer before task-writer).
//    error → terminal.
let nextNode = null;
if (out.outcome === 'error') {
  nextNode = null;
} else {
  const brain = out.brainstorming_outcome;
  if (brain === 'prd-trd') nextNode = 'trd-writer';
  else if (brain === 'prd-only') nextNode = 'task-writer';
  else nextNode = null; // missing or unexpected → no match → terminal
}

if (!nextNode) {
  allowStop('terminal: nextNode resolved to null (outcome=' + out.outcome
    + ', brainstorming_outcome=' + (out.brainstorming_outcome || '<unset>') + ')');
}

// 7. Block stop, inject continuation reason
const prdPath = out.path || ('.planning/' + out.session_id + '/PRD.md');
const reason = [
  'Harness flow dispatcher (Stop hook PoC).',
  'prd-writer emitted node_id=' + out.node_id + ', outcome=' + out.outcome + '.',
  'Per harness-flow.yaml dispatch, the next node is `' + nextNode + '`.',
  'Invoke `Skill("' + nextNode + '")` now with payload:',
  JSON.stringify({
    session_id: out.session_id,
    prd_path: prdPath,
    brainstorming_outcome: out.brainstorming_outcome,
    request: '<reuse the original user request from earlier in this conversation>',
    brainstorming_output: '<reuse the brainstorming JSON if present earlier>'
  }),
  'Read prd_path with the Read tool to seed the next skill.',
  'Construct the rest of the payload per the next skill\'s SKILL.md.'
].join(' ');

console.log(JSON.stringify({ decision: 'block', reason }));
debug('blocked stop with continuation to ' + nextNode);
process.exit(0);
