---
name: llm-md-revise
description: Use when finishing a development branch and the session produced corrections, durable rules, facts, anti-patterns, or external-system references worth persisting in CLAUDE.md or AGENTS.md. Also use when the user says "remember this" / "add to project memory", asks to update AGENTS.md, CLAUDE.md, or project instructions, or repeats a correction twice. Do NOT use to audit or fix an existing CLAUDE.md/AGENTS.md as a whole (that is claude-md-improver), nor for code-derivable conventions, one-off task state, or unrelated personal preferences.
---

# llm-md-revise

Surface session-derived knowledge worth persisting, target the active harness's
durable instruction surface, place it at the **narrowest applicable scope**, then
apply per-candidate diffs the user approves one at a time.

**Core principle:** if a future coding agent could derive it by reading the code, it
does not belong in project instructions. Only persist what project state can't tell.

## Platform Detection

- Codex instructions or Codex-native tools present → target `AGENTS.md`.
- Claude Code tools/session present → target `CLAUDE.md` and optional `.claude/rules/*.md`.
- Uncertain → inspect existing root instruction files and ask before writing.

If the chosen file is only a thin re-export of another (e.g. a `CLAUDE.md` whose whole
body is `@AGENTS.md`), follow the import and write to the real file, so every harness
sees the change. Target the harness in use — don't create a Claude-only surface in a
Codex project or vice versa.

## When to use

- Implementation or a bug fix just completed (final review passed, or
  `systematic-debugging` Phase 4 verified) and the session had real corrections,
  conventions, or external constraints — surface candidates *before* finalizing the branch.
- User said "remember this" / "add to project memory" / "persist this in CLAUDE.md".
- User repeated the same correction 2+ times (a real rule, not a one-off).
- A non-obvious external fact came up (deadline, owner, deprecated path, external system).

**Not for:** auditing/fixing a whole CLAUDE.md (→ `claude-md-improver`); code
conventions visible in the code; anything `git log`/`git blame` shows; one-off task
state; personal preferences unrelated to the project (those → `~/.claude/CLAUDE.md`:
propose, don't write).

## The process

### Step 1 — Gather inputs

1. **Current session context** — primary source.
2. **Transcript fallback** — only a documented, harness-owned transcript pointer.
   - Codex: prefer current context and ledger files. Raw `~/.codex` transcript
     formats are unstable; do not scan them by guessed path.
   - Claude Code: if context compacted, the original messages may be on disk:
     ```bash
     slug=$(pwd | sed 's|/|-|g')
     ls -t ~/.claude/projects/$slug/*.jsonl | head -1
     ```
     Read the most-recent JSONL; filter to `type == "user"`/`"assistant"` (internal
     types like `attachment`, `system`, `file-history-snapshot` are interleaved).
3. **Existing project instructions** — read the active platform's files to skip
   already-covered candidates: every `AGENTS.md`/`CLAUDE.md` from `pwd` up to repo
   root, plus touched-subdir files and project `.claude/rules/*.md`. Anything under
   `~/.claude/` is user-owned — read to avoid restating, never write; propose instead.
   (On Codex there is no stable, documented user-level path — do not guess one.)

### Step 2 — Identify candidates

| Category | Example | Qualifies? |
|---|---|---|
| Rule | "we use bun, never npm" | ✓ if confidence ≥ medium |
| Fact | "merge freeze starts 2026-05-15" | ✓ — convert relative dates to absolute |
| Anti-pattern | "don't run hooks that call LLM" | ✓ if user explicitly corrected |
| Reference | "bugs tracked in Linear INGEST" | ✓ |
| Code convention | "we use TypeScript" (in package.json) | ✗ — derive, don't document |
| Task state | "the auth bug we fixed today" | ✗ — git history owns it |
| Secret / PII | API token, credential, private key, keyed internal URL, personal data | ✗ — **never persist**; drop the candidate or keep only the non-sensitive part (e.g. the hostname without the `key=`) |

### Step 3 — Filter against existing files

Scan all active-platform instruction files from Step 1. Skip candidates already
covered, even with different wording.

### Step 4 — Decide placement (WHERE + HOW)

Place each survivor at the narrowest scope that still loads when needed. **Codex and
Claude Code load nested files differently — do not assume Codex's nested `AGENTS.md`
behaves like Claude's subdir `CLAUDE.md`.** On Codex, the instruction chain is fixed at
startup as the `AGENTS.md` files from the repo root down to the launch directory
(cwd); a nested `AGENTS.md` loads only if Codex is launched in that directory or below,
and touching files under it later does NOT pull it in. On Claude Code, a subdir
`CLAUDE.md` loads on-demand when you read/edit files in that folder. On Claude Code
consult [references/placement-decision.md](references/placement-decision.md) for the
rules/import fork and 200-line spill.

| Candidate scope | Target file | Why |
|---|---|---|
| Codex: maps to one subdir **and** Codex is normally launched there or below | that subdir's `AGENTS.md` | it's on the launch→root chain |
| Codex: maps to one subdir but the launch dir is uncertain (e.g. repo-root launch) | root `AGENTS.md`, scoped in-file ("for `packages/api/`: …") | only the root→cwd chain is guaranteed to load |
| Codex: project-wide rule/fact | root `AGENTS.md` | always applies in repo |
| Maps to ONE existing module/subdir | that subdir's `CLAUDE.md` (create if absent) | on-demand load — keeps root lean |
| Project-wide rule/fact | root `CLAUDE.md` | parent dirs load eagerly |
| Spans multiple paths, **or** pushes root past 200 lines, **or** large rule bundle | `.claude/rules/<topic>.md` + reference from root | loads per frontmatter (no `paths:` = always-on; `paths:` = per-path) |

**The 200-line split is REACTIVE:** trigger only when *this session's additions*
push root past 200 lines, and relocate only your own additions — never reformat,
reorder, or move pre-existing root content (that's `claude-md-improver`'s job).

### Step 5 — Present diffs one-by-one

```
[N/M] <Category> · confidence <high|medium|low>
Evidence: "<verbatim user quote>"
Target: <file path> · reason: <why this scope + load style, one clause>

Proposed edit:
  - <old text or insertion point>
  + <new text>

Apply? (a)pprove / (e)dit / (r)eject / (d)efer
```

The `reason:` clause is annotation, not a second question — placement was decided in
Step 4. **Never bulk-approve** multiple candidates in one prompt: one decision each.
**(e)dit is not approval** — apply the requested change, re-show the revised diff, and
get an explicit (a)pprove before writing.

### Step 6 — Apply and suggest commit

Edit per approved candidate (create the target file if absent). Then summarize and suggest:

```
Project instructions updated with N entries. Suggested commit:
  git add <files>
  git commit -m "docs: persist session learnings"

Run now, or bundle with other work?
```

Do NOT auto-run the commit — the commit decision is the user's.

## Guardrails

- **Never persist a secret, token, credential, private key, or PII** — nor a sensitive
  internal URL with an embedded key. Reject the candidate, or strip the secret and keep
  only the harmless part. Instruction files are committed and plugin-distributed.
- A one-time "let's do it this way" is not yet a rule — **defer** it unless the user
  re-confirms; a single occurrence is a preference, not a durable instruction.
- A project-wide rule dropped into a subdir `CLAUDE.md` only loads when that folder
  is touched — so it silently won't apply elsewhere. Narrowest scope means narrowest
  that *still loads when needed*: project-wide → root or a no-`paths:` rules file.
