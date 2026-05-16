#!/usr/bin/env node
'use strict';

// =============================================================================
// session-start-harness.js — harness-flow skill bootloader
// =============================================================================
//
// WHEN: Fires on Claude Code SessionStart events with matcher `startup|clear|compact`.
//       This means: every fresh session, after `/clear`, and after context compaction.
//       Anytime the LLM context is "reset", this runs.
//
// WHAT: Reads skills/using-harness-flow/SKILL.md and emits it as `additionalContext`
//       wrapped in <EXTREMELY_IMPORTANT> tags. Claude Code injects this string into
//       the LLM's system prompt for the new session.
//
// WHY:  harness-flow's core rule — "if there's even a 1% chance a skill applies,
//       you MUST invoke it via the Skill tool" — cannot be left to LLM autonomy.
//       The using-harness-flow skill is the meta-skill that teaches the LLM how to
//       use the brainstorming → writing-plans → subagent-driven-development chain.
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
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const skillFile = path.join(pluginRoot, 'skills', 'using-harness-flow', 'SKILL.md');

let skillContent;
try {
  skillContent = fs.readFileSync(skillFile, 'utf-8');
} catch (err) {
  // Fallback keeps the session alive even if the skill file is missing/unreadable.
  skillContent = 'Error reading using-harness-flow skill';
}

// The <EXTREMELY_IMPORTANT> wrapper signals to the LLM that this is a hard
// behavioral rule, not optional guidance. The skill body itself contains the
// "1% rule" enforcement language and the Skill tool usage instructions.
const sessionContext =
  '<EXTREMELY_IMPORTANT>\n' +
  'You have harness-flow.\n\n' +
  "**Below is the full content of your 'harness-flow:using-harness-flow' skill — your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n" +
  skillContent +
  '\n</EXTREMELY_IMPORTANT>';

// Claude Code's hookSpecificOutput.additionalContext schema: the string in
// `additionalContext` is appended to the system prompt for the new session.
// JSON.stringify handles all escaping (newlines, quotes, etc.) automatically —
// no manual sed/awk escape gymnastics needed.
const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: sessionContext,
  },
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');
process.exit(0);
