# Worked Examples

Three calibration scenarios. Each shows: session signal → WHERE → HOW → the Step 5 `Target:` line.

## 1. Subdir-scoped rule

**Signal:** "In `packages/api`, always validate with zod before the handler — we got burned twice."

- **WHERE:** maps to one existing module directory → `packages/api/CLAUDE.md` (create if absent).
- **HOW:** plain content inside that subdir file. It loads on-demand whenever Claude edits files under `packages/api/`; no `@`-import needed.

```
Target: packages/api/CLAUDE.md (new) · reason: api-module-scoped, on-demand load
```

## 2. 200-line reactive spill

**Signal:** a 12-line block of new deployment rules surfaced this session; root `CLAUDE.md` is already 195 lines.

- **WHERE:** project-wide, but adding 12 lines pushes root to 207 (> 200) → spill.
- **HOW:** create `.claude/rules/deployment.md` (add `paths:` frontmatter if the rules are path-scoped); add ONE reference line in root.
- Move **only** the 12 new lines. Do NOT reformat or relocate any of the existing 195 lines.

```
Target: .claude/rules/deployment.md (new) · reason: root would exceed 200 lines; relocating only the new additions
```

## 3. Noise reject (no placement)

**Signal:** "we use TypeScript" (visible in `package.json`) and "the auth bug we fixed today."

- **WHERE:** none — both are code-derivable / one-off task state.
- **Action:** reject at the Step 2/3 filter. Neither reaches placement. Persisting them would violate the core principle (derivable → not CLAUDE.md).

No `Target:` line — the candidate never surfaces for approval.

## 4. `@import` vs plain path (reference-style call)

**Signal:** "Always follow the security checklist in `docs/security.md` before any release" (a global rule that must always be live) vs "API error codes are catalogued in `docs/errors.md`" (large, situational).

- The security checklist must be present every session → reference it from root with **`@docs/security.md`** (eager).
- The error catalogue is large and only relevant when touching error handling → mention it as a **plain path** (`docs/errors.md`), loaded on demand.

```
Target: CLAUDE.md · reason: must-always-be-live → @import (eager)
Target: CLAUDE.md · reason: large/situational → plain path (lazy)
```
