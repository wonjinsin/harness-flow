#!/usr/bin/env node
'use strict';

// =============================================================================
// session-start-caveman.js — caveman mode bootloader
// =============================================================================
//
// WHEN: Fires on SessionStart events with matcher `startup|resume|clear|compact`.
//       This means: every fresh session, after `/clear`, and after context compaction.
//       Anytime the LLM context is "reset", this runs.
//
// WHAT: Reads skills/caveman/SKILL.md and emits it as `additionalContext`
//       wrapped in <EXTREMELY_IMPORTANT> tags. Claude Code injects this string into
//       the LLM's system prompt for the new session, pre-activating caveman mode.
//
// WHY:  caveman mode (~75% token reduction via terse, fragment-style responses)
//       is desired as the default response style for every session. Relying on the
//       user to invoke `/caveman` each session defeats the purpose. Injecting the
//       skill body at SessionStart guarantees the rules are present before any
//       response is generated. User can still disable mid-session ("stop caveman"
//       / "normal mode") per the skill's own boundary rules.
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
  const skillFile = path.join(pluginRoot, 'skills', 'caveman', 'SKILL.md');

  let skillContent;
  try {
    skillContent = fs.readFileSync(skillFile, 'utf-8');
  } catch (err) {
    // A missing skill must not block session creation.
    skillContent = 'Error reading caveman skill';
  }

  return (
    '<EXTREMELY_IMPORTANT>\n' +
    'You have caveman mode pre-activated for token efficiency.\n\n' +
    "**Below is the full content of the 'caveman' skill — apply it to every response from this session start until explicitly disabled by the user (\"stop caveman\" / \"normal mode\"):**\n\n" +
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
