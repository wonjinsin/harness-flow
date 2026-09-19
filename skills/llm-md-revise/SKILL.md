---
name: llm-md-revise
description: Use when the user chooses project-memory revision after a code review; when the user says "remember this" / "add to project memory"; when asked to update AGENTS.md, CLAUDE.md, or project instructions; or when a correction repeats twice. Do NOT use to audit or fix an existing CLAUDE.md/AGENTS.md as a whole.
---

# llm-md-revise

Persist durable project knowledge that future agents cannot reliably derive from
the repository. Present all candidates together, then apply only the user's
selected diffs.

## 1. Gather

- Use the current session as the primary source.
- After a completed code review, inspect the branch diff only when it may reveal
  a non-obvious reason or constraint behind a change; never persist the change itself.
- Read the applicable project instructions before proposing additions.

Do not scrape raw transcript files. If the available context does not support a
candidate, omit it.

## 2. Filter

- Keep project-specific rules, repeated corrections, external facts, references,
  and constraints that future agents need but cannot reliably rediscover.
- Reject code-derivable facts, one-off task state, and semantic duplicates.
- A frequently reused command may qualify when its source is ambiguous or agents
  repeatedly waste time rediscovering it.
- Never persist a secret, credential, private key, sensitive URL, or PII.
- Treat a single preference as non-durable unless the user explicitly confirms it.

## 3. Place

- Follow the repository's existing canonical instruction surface.
- If none exists, use the active harness's project default; if that is uncertain, ask.
- If it is a thin import such as `CLAUDE.md` → `AGENTS.md`, edit the real source file.
- Before proposing a root edit, estimate its resulting line count.
- At 200 lines or fewer, keep project-wide guidance in the root instruction file.
- Above 200 lines, place only new additions in an existing instruction or rules
  surface that the active harness reliably loads.
- If that would split or duplicate one topic, propose moving the smallest coherent
  existing block with the additions as a separate approval item.
- Use an always-loaded surface for project-wide guidance and a reliable path-scoped
  surface for narrower guidance.
- If no alternative loads reliably, keep a path-qualified rule in the root;
  reliable loading takes priority over the line target.
- Never reorganize unrelated existing instructions.
- Do not create a duplicate harness-specific surface or write user-scope files.

## 4. Propose

Remove candidates already covered by applicable instructions. Show every survivor
in one batch with stable numeric IDs:

`ID | durable reason | target | exact diff`

Use a concrete session statement, diff path with rationale, or stable external
reference as the durable reason. Never fabricate evidence. If no candidates remain,
report that briefly and stop.

## 5. Apply

Ask once for selected IDs, `all`, or `none`. Apply only selected, exactly displayed
diffs; leave unmentioned IDs deferred. If the user changes wording, show the revised
diff again before applying it. Preserve all unrelated content, then report applied
and deferred IDs. Do not commit automatically.
