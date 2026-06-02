# Placement Decision: WHERE and HOW

Consult this when a candidate has survived the Step 3 filter and its target is non-trivial — the subdir-vs-rules fork, the `@`-vs-plain-path choice, or a 200-line spill. The common case (a global rule → root `CLAUDE.md`) is resolvable from the table in SKILL.md Step 4 without reading this file.

## The 6 loading facts (the "why")

Verified against the official Claude Code docs (`code.claude.com/docs/en/claude-md.md`).

| Fact | Implication for placement |
|---|---|
| `@path` import = **eager**, auto-loaded at session start (nesting max 4 hops) | Costs context every session — reserve for core global rules that must always be live |
| Plain path mention (no `@`) = **lazy**, read only when Claude judges it relevant | Default for situational / large reference material |
| Parent-dir CLAUDE.md = **eager** (cwd traversed upward, every file loaded) | Root rules are always live — keep root small |
| Subdir CLAUDE.md = **on-demand** (loads only when reading/editing files in that folder) | Scoping a rule to a subdir keeps it out of every session |
| Official target: **< 200 lines per file** | Past 200 → context waste + lower instruction adherence |
| `.claude/rules/*.md` with **NO `paths:`** = loaded **unconditionally at launch** (always-on, same priority as `.claude/CLAUDE.md`) | The home for an always-live project-wide rule that you want out of the root file |
| `.claude/rules/*.md` **with `paths:`** frontmatter = **conditional**, loads only when editing files matching the glob | The home for a path-scoped rule |

## WHERE — narrowest applicable scope

| Candidate nature | Target file |
|---|---|
| Limited to one submodule/folder that maps to a clear directory | that subdir `CLAUDE.md` (create if absent) — on-demand load, root stays lean |
| Project-wide rule/fact | root `CLAUDE.md` |
| Topic spans multiple paths, **or** would push root past 200 lines, **or** is a large rule bundle | `.claude/rules/<topic>.md` + reference from root |

### Subdir CLAUDE.md vs `.claude/rules/` — the disambiguating rule

Both are path-scoped and load on-demand, so they overlap. Tiebreak:

- **Subdir `CLAUDE.md`** when the knowledge maps to exactly **one existing module directory** (e.g. `packages/api/` validation quirks). It is the most discoverable home for "this folder works like X."
- **`.claude/rules/<topic>.md`** when the knowledge is a **topic cluster crossing multiple paths** (e.g. "all `*.test.ts` run sequentially"), or when it is a root spill that has **no single home directory**. Use `paths:` frontmatter to scope it:

  ```markdown
  ---
  paths:
    - "src/**/*.test.ts"
  ---
  Tests run sequentially (shared DB state) — never parallelize.
  ```

When a flat repo has no clear module directory, prefer `.claude/rules/` over inventing a subdir.

## HOW — reference style

Two distinct mechanisms — don't conflate them:

**1. Content placed in `.claude/rules/` loads by its own frontmatter** (not by how root points to it):

| `.claude/rules/<topic>.md` | Loads | Use for |
|---|---|---|
| no `paths:` | always at launch | project-wide rule that must always be live |
| `paths: [...]` | only when editing matching files | path-scoped rule |

A plain-text pointer to the rules file from root is for human discoverability only — the rules file loads regardless. You do **not** need `@import` to keep a no-`paths:` rules file live.

**2. Referencing a file that lives OUTSIDE `.claude/rules/`** (e.g. `docs/security.md`), from CLAUDE.md:

| Style | Semantics | When |
|---|---|---|
| `@path` | eager — pulled into context every session (nesting capped at 4 hops) | A doc/checklist that must always be live but isn't a rules file |
| plain path | lazy — read only when Claude judges it relevant | Situational or large reference material |

Decision: for an always-live project-wide rule, prefer a no-`paths:` file in `.claude/rules/` (clean, auto-loads). Reserve `@import` for must-always-be-live content that lives outside `.claude/rules/`. Use a plain path for situational material.

## The 200-line split is REACTIVE

Trigger a spill **only** when *this session's new additions* push root `CLAUDE.md` past 200 lines. Then:

1. Create `.claude/rules/<topic>.md` containing **only your new additions**. Add `paths:` frontmatter only if the rule is path-scoped; for an always-live project-wide rule, omit `paths:` (it then auto-loads at launch).
2. Add one reference line in root pointing to it.
3. Never reformat, reorder, or relocate pre-existing root content — that is `claude-md-improver`'s job and is out of scope here.

Do not proactively refactor a root file that is already over 200 lines for reasons unrelated to your additions.

## See also

Worked examples of these decisions: [examples.md](examples.md).
