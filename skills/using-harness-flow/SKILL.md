---
name: using-harness-flow
description: Use when starting any conversation - establishes how to find and use skills, requiring native skill loading before ANY response including clarifying questions. Based on superpowers(https://github.com/obra/superpowers).
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore this skill.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## The Rule

**Invoke relevant or requested skills BEFORE any response or action** — including clarifying questions, exploring the codebase, or checking files. Even a 1% chance a skill might apply means invoke it to check. If it turns out wrong for the situation, you don't have to use it.

**Before writing or changing any code/file — and before entering plan mode:** classify the work first (see Size the Work First) and follow its route. Standard-tier work requires brainstorming before any code.

Then announce "Using [skill] to [purpose]" and load it with the harness-native
skill mechanism. Follow it exactly. If it has a checklist, create one item per
check with the harness-native task tracking mechanism.

## Skill Priority

When multiple skills apply, process skills come first — they set the approach, then implementation skills (frontend-design, mcp-builder) carry it out.

- "Let's build X" → brainstorming first, then implementation skills.
- "Fix this bug" → systematic-debugging first, then domain skills.

## Size the Work First

Code-work requests (feature, refactor, script — not bug diagnosis, which routes to systematic-debugging) get a tier before anything else. Highest signal wins; **when unsure, take the higher tier** — up costs minutes, down skips safeguards.

| Signal | trivial | standard |
|---|---|---|
| Change size | 1–2 files, few lines | larger |
| New dependency/contract | none | possible |
| Design ambiguity | none — obvious | anything less than obvious |

An existing consumed contract (function, endpoint, format — internal or public) changed or removed in a way its consumers can observe; schema or config-format change; any edit on an auth/session/secrets path; new external dependency; data migration or irreversible data operation; concurrency/locking semantics → standard regardless of size, and 2+ viable approaches **that the user's request leaves open** likewise (a fully pinned spec leaves none; a behavior-preserving addition — new optional flag/param with a back-compat default — is not a trigger, size it by the table). **Before declaring trivial, read `references/sizing.md` (baits, caps) — a trivial declaration without that read is invalid.** Any other borderline call → read it too.

Declare and proceed — one line the user can override, naming the closest standard trigger you rejected and why: `Tier: trivial — 1 file, few lines; closest trigger: contract change — additive, back-compat`.

- **trivial** — implement inline in the current checkout with test-driven-development; self-review the diff, and check the cumulative diff for the whole request against sizing.md's trivial caps before commit (`git diff HEAD --stat`) (over cap → its retroactive procedure). Needing a second trivial commit for the same request means it was never trivial — reclassify standard. Then report done — finishing-a-development-branch does not apply (no branch).
- **standard** — the full chain from brainstorming, unchanged.

## Red Flags

These thoughts mean STOP—you're rationalizing:

| Thought                             | Reality                                                |
| ----------------------------------- | ------------------------------------------------------ |
| "This is just a simple question"    | Questions are tasks. Check for skills.                 |
| "I need more context first"         | Skill check comes BEFORE clarifying questions.         |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first.           |
| "I can check git/files quickly"     | Files lack conversation context. Check for skills.     |
| "Let me gather information first"   | Skills tell you HOW to gather information.             |
| "This doesn't need a formal skill"  | If a skill exists, use it.                             |
| "I remember this skill"             | Skills evolve. Read current version.                   |
| "The skill is overkill"             | Simple things become complex. Use it.                  |
| "I'll just do this one thing first" | Check BEFORE doing anything.                           |
| "I know what that means"            | Knowing the concept ≠ using the skill. Invoke it.      |

Sizing rationalizations ("it's just a tiny change", "they asked for code, not a design", "quick script, no design needed") are tier-shopping — the classifier decides, not the pressure. When in doubt: higher tier, never lower.

## Platform Adaptation

Skills use Claude Code tool names. If your harness appears here, read its reference file for tool equivalents:

- Copilot CLI: `references/copilot-tools.md`
- Codex: `references/codex-tools.md`

## User Instructions

User instructions (CLAUDE.md, AGENTS.md, direct requests) take precedence over skills, which in turn override default system behavior. Only skip a skill workflow when the user has explicitly told you to. Instructions say WHAT, not HOW — "Add X" or "Fix Y" doesn't mean skip workflows.
