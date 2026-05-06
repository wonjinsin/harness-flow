#!/usr/bin/env node
"use strict";

// =============================================================================
// post-edit.js — Post-edit secret scanner hook
// =============================================================================
//
// WHEN: Fires on PostToolUse events where matcher matches Edit|Write|MultiEdit,
//       i.e. immediately AFTER the LLM modifies a file.
//
// STDIN: { tool_name: 'Edit'|'Write'|'MultiEdit',
//          tool_input: { file_path: '/abs/path', ... }, ... }
//
// WHAT: Reads the modified file and scans the entire content with the secret
//       regex matrix (AWS keys, GCP, GitHub PATs, private key headers, generic
//       password/api_key assignments). On match → exit 2 with file path + line.
//
// WHY: This is the FIRST line of defense for accidentally hardcoded secrets.
//      The fix path is obvious at this point — the LLM just wrote the file,
//      so a `git restore` or revert is trivial. Catching secrets here is
//      cheaper than catching them at commit time (where the LLM has already
//      moved on mentally).
//
//      pre-bash.js's commit gate is the SECOND line of defense — even if this
//      hook is bypassed (kill switch, manual edit, etc.), commit time will
//      re-scan the staged diff.
//
// EXCLUSIONS: Test fixtures and *.env.example commonly contain dummy/example
//             keys that match real-secret patterns. We skip these paths to
//             keep false-positive noise low.
//
// EXIT CODES:
//   0 → no secrets, or excluded path, or fail-open path
//   2 → secret detected (Claude Code shows stderr to the LLM)
//
// FAIL-OPEN: Missing files, unreadable files, parse errors → exit 0. We refuse
//            to block edits because OUR scanner had a problem.
// =============================================================================

const fs = require("node:fs");
const { readStdinSync, parsePayload, getFilePath } = require("./lib/payload.js");
const { scanText } = require("./lib/secret-patterns.js");

// Same single kill switch as the other hooks.
if (process.env.HARNESS_FLOW_HOOKS_OFF === "1") {
  process.exit(0);
}

let payload;
try {
  payload = parsePayload(readStdinSync());
} catch (err) {
  console.error(`post-edit: payload parse error: ${err.message}`);
  process.exit(0);
}

// Edit/Write/MultiEdit all carry tool_input.file_path. If absent (unexpected
// payload shape) or the file no longer exists (deleted between events), there's
// nothing to scan — fail-open.
const filePath = getFilePath(payload);
if (!filePath || !fs.existsSync(filePath)) {
  process.exit(0);
}

// Skip paths where false positives are common:
//   - .env.example: dummy values that intentionally look like real secrets
//   - *.test.*:     test fixtures often hardcode example credentials
//   - **/fixtures/: same reason as test files
const SKIP_PATTERNS = [/\.env\.example$/, /\.test\./, /\/fixtures\//];
if (SKIP_PATTERNS.some((re) => re.test(filePath))) {
  process.exit(0);
}

// Read the entire file. We scan the full text (not just the diff) because Edit
// may have only changed a small region but the secret could already be elsewhere
// in the file from a prior edit.
let content;
try {
  content = fs.readFileSync(filePath, "utf-8");
} catch (err) {
  // Binary files, permission errors, etc. — fail-open.
  process.exit(0);
}

// scanText returns [{ name, line }] for every match. We log all matches before
// exiting so the LLM sees every secret at once (cheaper than one-at-a-time
// reveal across multiple Edit cycles).
const matches = scanText(content);
if (matches.length > 0) {
  for (const m of matches) {
    console.error(
      `secret detected: ${m.name} at ${filePath}:${m.line}. Revert immediately or move to environment variable.`,
    );
  }
  process.exit(2);
}
process.exit(0);
