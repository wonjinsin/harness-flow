"use strict";

// Pure parsing for plan-audit: extract each plan task's declared Files
// (Create/Modify/Test) so the audit can verify they exist. No I/O — the
// plan-audit executable owns the filesystem and git so this stays
// unit-testable.

const FENCE = /^```/;
const TASK_HEADING = /^####[ \t]+Task[ \t]+(\d+\.\d+):?[ \t]*(.*)$/;
const FILE_LINE = /^-[ \t]+(Create|Modify|Test):[ \t]*(.+)$/;

// A Files: entry value → repo-relative path, or null when the value is not a
// path (e.g. "none in this task"). Strips backticks, trailing prose, and
// ":12-18"-style line ranges.
function cleanPlanPath(raw) {
  const token = raw.replace(/`/g, "").trim().split(/[ \t]/)[0];
  const path = token.replace(/:[0-9]+(-[0-9]+)?$/, "");
  if (!path || !/[./]/.test(path)) return null;
  return path;
}

function parsePlanFiles(planText) {
  const tasks = [];
  let inFence = false;
  let current = null;
  for (const line of String(planText).split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = line.match(TASK_HEADING);
    if (heading) {
      current = { task: heading[1], name: heading[2].trim(), files: [] };
      tasks.push(current);
      continue;
    }
    if (/^#{1,3}[ \t]/.test(line)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const file = line.match(FILE_LINE);
    if (file) {
      const path = cleanPlanPath(file[2]);
      if (path) current.files.push({ kind: file[1].toLowerCase(), path });
    }
  }
  return tasks;
}

module.exports = { parsePlanFiles };
