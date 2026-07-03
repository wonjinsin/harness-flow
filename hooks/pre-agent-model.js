#!/usr/bin/env node
'use strict';

// pre-agent-model.js — PreToolUse(Agent|Task) model-omission guard for SDD.
// An SDD implementer/reviewer dispatch that omits `model` silently inherits the
// session's most expensive model (Opus). This hook denies such a dispatch so the
// controller must re-dispatch with an explicit tier. Scoped to SDD by matching
// the dispatch `description` — every other Agent dispatch (Explore, general
// searches, etc.) passes untouched, so there is no blast radius.
// Kill switch: HARNESS_FLOW_HOOKS_OFF=1. Fail-open on payload parse errors.

const { readStdinSync, parsePayload } = require('./lib/payload.js');

// SDD dispatch descriptions, set verbatim by the implementer/task-reviewer
// prompt templates: "Implement Task N: ..." and "Review Task N (spec + quality)".
// Anchored on each template's distinctive shape (the colon / the suffix) so an
// unrelated dispatch like "Review Task 3 in the ticket" is not caught.
const SDD_DESC = /^Implement Task \d+:|^Review Task \d+ \(spec \+ quality\)/;

// A model value that resolves to "the session default" is exactly the leak.
function modelChosen(model) {
  const m = String(model == null ? '' : model)
    .trim()
    .toLowerCase();
  return m !== '' && m !== 'inherit';
}

function checkDispatch(toolInput) {
  const ti = toolInput || {};
  if (!SDD_DESC.test(String(ti.description || ''))) return null; // out of scope
  if (modelChosen(ti.model)) return null; // model chosen → fine
  return { id: 'sdd-model-required' };
}

function emitDeny(description) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `[sdd-model-required] SDD dispatch "${description}" has no model — it would ` +
          'silently inherit the session\'s most expensive model (Opus). Re-dispatch with an explicit model.',
      },
      systemMessage:
        `Blocked SDD dispatch without a model: "${description}"\n\n` +
        'Re-dispatch with an explicit `model` chosen by task complexity:\n' +
        '  - cheap (1-2 files, complete spec, mechanical fix, named findings) -> haiku\n' +
        '  - standard (multi-file, integration concerns, routine reviewer) -> sonnet\n' +
        '  - most capable (subtle/high-risk or whole-branch review) -> opus\n' +
        'Reviewer floor is mid-tier (sonnet). Do NOT reflexively pick opus to clear this — ' +
        'choose the cheapest tier that fits the task.',
    }),
  );
}

function main() {
  if (process.env.HARNESS_FLOW_HOOKS_OFF === '1') return;

  let payload;
  try {
    payload = parsePayload(readStdinSync());
  } catch (err) {
    console.error(`pre-agent-model: payload parse error: ${err.message}`);
    return; // fail-open
  }

  const hit = checkDispatch(payload && payload.tool_input);
  if (hit) {
    emitDeny(String((payload.tool_input && payload.tool_input.description) || ''));
    process.exit(2); // belt-and-suspenders: JSON deny + exit code
  }
}

if (require.main === module) {
  main();
}

module.exports = { SDD_DESC, checkDispatch };
