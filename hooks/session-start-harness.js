#!/usr/bin/env node
'use strict';

// =============================================================================
// session-start-harness.js — harness-flow skill bootloader
// =============================================================================
//
// WHEN: Fires on SessionStart events with matcher `startup|resume|clear|compact`.
//       This means: every fresh or resumed session, after `/clear`, and after context compaction.
//       Anytime the LLM context is "reset", this runs.
//
// WHAT: Reads skills/using-harness-flow/SKILL.md and emits it as `additionalContext`
//       wrapped in <EXTREMELY_IMPORTANT> tags. A compatible plugin runtime injects
//       this string into the LLM's context for the new session.
//
// WHY:  harness-flow requires loading the relevant skill before responding,
//       including before clarifying questions. This rule cannot be left to
//       LLM autonomy.
//       The using-harness-flow skill is the meta-skill that teaches the LLM how to
//       use the brainstorming → writing-plans → implement chain.
//       It must be present in context at every session boundary, so we inject it here.
//
// FAIL-OPEN: If SKILL.md cannot be read, we still emit a fallback string and exit 0.
//            A SessionStart hook must NEVER block session creation.
// =============================================================================

const fs = require('node:fs');
const path = require('node:path');

// CLAUDE_PLUGIN_ROOT is auto-injected by Claude Code's plugin runtime when this
// hook is registered via hooks/hooks.json. The __dirname fallback covers direct
// invocation (smoke tests, manual runs).
function getSessionContext(pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..')) {
  const skillFile = path.join(pluginRoot, 'skills', 'using-harness-flow', 'SKILL.md');

  let skillContent;
  try {
    skillContent = fs.readFileSync(skillFile, 'utf-8');
  } catch (err) {
    // A missing skill must not block session creation.
    skillContent = 'Error reading using-harness-flow skill';
  }

  return (
    '<EXTREMELY_IMPORTANT>\n' +
    'You have harness-flow.\n\n' +
    "**Below is the full content of your 'harness-flow:using-harness-flow' skill — your introduction to using skills. Load all other skills with the current harness's native skill mechanism:**\n\n" +
    skillContent +
    '\n</EXTREMELY_IMPORTANT>'
  );
}

module.exports = { getSessionContext };

if (require.main === module && process.env.HARNESS_FLOW_HOOKS_OFF !== '1') {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: getSessionContext(),
    },
  };
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}
