# Harness Comparison: Analysis of 6 Systems

**Subjects**: Archon / everything-claude-code (ECC) / get-shit-done (GSD) / gstack / oh-my-claudecode (OMC) / superpowers
**Date**: 2026-04-16
**Basis**: Completed analysis documents for each harness (`reference/*.md`)

## TL;DR — Which one should you choose?

All six harnesses appear on the surface to be "tools that help you use Claude better," but they **live at entirely different layers**. Archon is the only one that wraps the platform as an external wrapper **outside** Claude Code/Codex. OMC is a hybrid that straddles **both outside (SDK) and inside (plugin)**. The remaining four (ECC, GSD, gstack, superpowers) are all **in-harness systems that operate inside Claude Code**. This single distinction is the root of every difference described below.

- **If you need remote chat or multi-platform support** → Archon is the only option
- **If you want to enforce stages from spec through implementation** → GSD (workflow) or superpowers (skill chain)
- **If you already use Claude Code daily and just want guardrails and memory** → ECC
- **If you want the same experience across multiple platforms (Claude Code / Cursor / Codex)** → gstack or superpowers
- **If you want long-running automation with iterative loops and parallel agents** → OMC

---

# Part 1: The Story — Comparison by Flow

## 1-1. Main Flow Side-by-Side (The Most Important Single View)

Placing the main path from **user input to LLM response** for all six harnesses at the same level of detail reveals three distinct **structural layers**.

```
─── Layer A: External Wrapper ──────────────────────────────────────────────────
(Directly owns LLM calls. Platform adapters are the entry point.)

  Archon
  ├─ Platform adapters (Slack/Telegram/GitHub/Discord/Web/CLI)
  │   └─ Auth check · unauthorized user blocking
  ├─ ConversationLockManager (per-conversation FIFO lock)
  ├─ Deterministic command whitelist → bypass AI on match
  ├─ Context 6-step staircase (conversation→session→code→workflow→config→thread)
  ├─ Agent SDK call (Claude/Codex swappable)
  ├─ Execute-evaluate loop + stream text transmission
  └─ /invoke-workflow detection → emitRetract → DAG workflow

─── Layer B: Hybrid ─────────────────────────────────────────────────
(Both plugin and SDK library entry points. Same logic called from two places.)

  oh-my-claudecode (OMC)
  ├─ Entry 1: Claude Code hook (UserPromptSubmit)
  │   OR
  │   Entry 2: SDK import (direct API call)
  ├─ keyword-detector.mjs (detects ralph/autopilot/ultrawork)
  ├─ [MAGIC KEYWORD: ...] marker injection
  ├─ skill-injector.mjs (trigger matching, up to 5 skills injected)
  ├─ 19 specialist agents dispatched in parallel via Task tool (max 5 concurrent)
  ├─ Anthropic API (Opus/Sonnet/Haiku tier routing)
  └─ Stop hook: boulder state detection → force next iteration

─── Layer C: In-Harness Skills ────────────────────────────────────────────────
(Claude Code owns LLM calls. The harness is nothing but "markdown to be read.")

  everything-claude-code (ECC)         get-shit-done (GSD)
  ├─ SessionStart: previous summary    ├─ /gsd:* command or CLI
  │  + up to 6 instincts injected       ├─ Query incomplete Phases from ROADMAP.md
  ├─ Slash command or natural language  ├─ Sequential Phase execution:
  ├─ commands/*.md → skills/*.md        │   Discuss→Research→Plan→Execute→Verify
  ├─ PreToolUse hook (block-no-verify)  ├─ Load per-Phase file manifest
  ├─ Claude Code tool execution         │   (.planning/ROADMAP·STATE·PLAN etc.)
  ├─ PostToolUse hook (Prettier·TS)     ├─ Agent SDK query() call (maxTurns=50)
  └─ Stop hook: instinct extraction     └─ Event stream → GSDEvent emission
     · session save

  gstack                              superpowers
  ├─ Root SKILL.md auto-load          ├─ SessionStart hook
  │  (preamble-tier:1)                ├─ Platform detection (CC/Cursor/Gemini/Copilot)
  ├─ 25 natural language routing      ├─ Full using-superpowers.md injection
  │  rules presented                  ├─ LLM learns "invoke skill if even 1% applicable" rule
  ├─ Slash or natural language match  ├─ Receive user message
  ├─ Skill tool call → SKILL.md load  ├─ LLM invokes skill per Skill Priority
  ├─ Bash Preamble (env detect·learn) ├─ Load skill markdown → follow workflow
  ├─ Step 1→N execution (natural      └─ TDD/Subagent/Review chain enforced
  │  language workflow)
  └─ STATUS report + learning append
```

The most important fact this side-by-side reveals is that **all four Layer C harnesses do not call the LLM directly**. They simply place markdown for Claude Code (or Cursor, Codex) to read and intervene via hooks. This is why "Will Claude follow the rules?" becomes a fundamental trust problem, and why **enforcement mechanisms** like superpowers' `<HARD-GATE>` and ECC's `block-no-verify` came to exist.

By contrast, **Layer A's Archon** calls the Agent SDK directly, so the portion that "depends on Claude's will" shrinks dramatically. Routing, token interpretation, and cancellation are all verifiable in code. The cost is implementation complexity — 5,000+ lines of TypeScript vs. dozens of lines of markdown.

**OMC bears the advantages and disadvantages of both sides**. The SDK path ensures determinism, but the hook path relies on markdown inside Claude Code. This is why core logic like keyword-detector and skill-injector is **duplicated in two places**, and this is OMC's biggest technical debt.

## 1-2. Routing: The Moment of Deciding "What to Do" from Input

Routing is the axis on which the six harnesses **diverge most sharply**. Here is how the same phrase "take a look at this issue" gets interpreted differently by each harness.

```
  Input: "/deploy staging" (slash command)
  ─────────────────────────────────────────────────────────────────
  Archon      : Deterministic whitelist match → bypass AI, execute immediately
  ECC         : Load commands/deploy.md (direct filename mapping)
  GSD         : /gsd:execute → Phase orchestrator
  gstack      : Match Step 0 in SKILL.md → run Bash preamble
  OMC         : Keyword detected in hook → mode switch
  superpowers : LLM invokes skill per "Skill Priority" rule

  Input: "Can you refactor this code?" (natural language)
  ─────────────────────────────────────────────────────────────────
  Archon      : Sent to LLM; if /invoke-workflow token appears in
                response stream, cancel stream and switch to workflow
  ECC         : LLM reads skill description and decides (advisory, not enforced)
  GSD         : Does nothing — explicit /gsd:discuss required
  gstack      : 25 natural language rules matched → Skill tool call
  OMC         : keyword-detector scans for magic keyword → marker injected
  superpowers : LLM recalls "brainstorm first" rule and enters skill chain
```

These two tables reveal **three routing strategies**:

1. **Determinism + LLM token detection** (Archon): Use a whitelist if you don't trust the LLM at all; detect tokens mid-stream if you trust it but want verification. Archon uses both. The design where `emitRetract` cancels the stream and switches to a workflow DAG when `/invoke-workflow` appears in the stream is the only one among the six that achieves **"routing and response simultaneously in a single LLM call."**
2. **Determinism only** (ECC, GSD): Only recognizes explicit commands. Natural language is left to the LLM's default behavior. Simple, but unable to capture intent expressed as "please do X."
3. **Rule matching / LLM priority / keyword amplification** (gstack, superpowers, OMC): All three share the common trait of "letting the LLM choose the right skill on its own," but differ in enforcement strength — gstack uses explicit 25 rules, superpowers uses `<HARD-GATE>` to prevent rationalization, and OMC amplifies magic keywords into the prompt.

**Practical implication**: If a team only uses slash commands, ECC/GSD is the simplest. To capture natural language intent, gstack's 25 rules are the most explicit, superpowers' Skill Priority is the most principled, and Archon's token detection is the most powerful. The cost grows in that order.

## 1-3. State and Session: "Can You Resume After a Session Ends?"

Looking at the state storage models of the six harnesses reveals **three philosophies**.

```
                   Immutable linked chain    Append-only files        Mutable state
                   (resume + audit)          (resume + human edit)    (iterative loop)
                   ─────────────────         ─────────────────        ─────────
  Archon           ●
                   parent_session_id
                   pointer for branch/merge
                   fully traceable

  ECC                                        ●
                                             *-session.tmp
                                             instinct JSONL

  GSD                                        ●
                                             .planning/*.md
                                             human-readable and editable

  gstack                                     ●
                                             ~/.gstack/projects/
                                             learnings.jsonl

  OMC                                                                  ●
                                                                       .omc/state/*.json
                                                                       overwritable

  superpowers      (no state — git is the state)
```

Archon's **immutable linked chain** creates a new row per session and only points to `parent_session_id`. Race conditions are eliminated at the source, and an accurate timeline can be reconstructed for auditing and debugging. The tradeoff is increased database complexity.

ECC, GSD, and gstack **use the file system like a database**. The advantage is clear — Claude can read and write those files directly. GSD's `.planning/ROADMAP.md` can be opened in an editor by a developer to reorder Phases. The downside is weak concurrency control (no file locking).

OMC uses a **mutable state model** — it overwrites `.omc/state/*.json`. This is natural when ralph mode runs repeated iterations over the same PRD, but if two iterations run simultaneously, state can become corrupted.

Superpowers is unique — **it keeps no state of its own at all**. Context between sessions is connected only through git commits and plan markdown files; the harness itself is stateless. This is the natural consequence of its zero-dependency philosophy.

## 1-4. Isolation and Concurrency: "Can Multiple Tasks Run Simultaneously?"

On this axis, only Archon gave a serious answer; the rest largely gave up.

```
                      Isolation                   Concurrency
                      ──────────────────          ──────────────────
  Archon              git worktree + determinism  Global max 10
                      port assignment             per-conversation FIFO
                      (no Docker, single-user     (queue wait)
                      assumption)

  OMC                 none                        parallel subagents max 5
                                                  (BackgroundTaskManager)

  superpowers         worktree recommended        1 subagent per task
                      (using-git-worktrees skill) (isolation emphasized but not enforced)

  gstack              worktree detection          none
                      (not enforced)

  ECC, GSD            none                        none
```

Archon's **choice not to use Docker** is a deliberate design decision — Docker is overkill when a single user is running multiple conversations simultaneously. Instead, git worktree + hash-based port assignment (`3190-4089`) safely isolates **concurrent work on the same branch's code**. However, the lack of network and OS isolation leaves it vulnerable to malicious prompts ("delete all my files" is possible). This is a reasonable tradeoff given the single-user tool assumption.

OMC's **5 parallel subagents** are specialized for "splitting a large task and running it concurrently." In autopilot mode, 5 independent tasks from a plan are dispatched in parallel at once. The purpose differs from Archon's "handling multiple user conversations simultaneously."

The remaining four have almost no concurrency control. superpowers recommends isolation via the `using-git-worktrees` skill but does not enforce it; gstack only detects it; ECC and GSD avoid the topic entirely. Their shared assumption is **"one Claude Code session = one task."**

## 1-5. "How Much Do You Trust the LLM?" — The Decisive Philosophical Fork

This is the fundamental question all six harnesses must answer. The answers diverge completely.

```
Low trust ←────────────────────────────────────────→ High trust

Archon              OMC            gstack     ECC       GSD        superpowers
(verified in code)  (hook+SDK)     (25 rules  (hook     (Phase     (LLM
                                   +host)     block)    enforced)  complies)

↓ enforcement       ↓              ↓          ↓         ↓          ↓
deterministic       boulder state  determinism exit 2   ROADMAP.md <HARD-GATE>
routing             persistence    +rule match block    file-based Red Flags
emitRetract         next iter      JSONL learn          Phase      "invoke if
stream cancel       injection                           isolation  even 1%"
```

- **Archon** **cancels the stream in code** (`emitRetract`) when the LLM does something unexpected. The strongest enforcement.
- **OMC**: when the LLM considers stopping, the Stop hook **injects a "don't stop" message** to restart it. Enforced, but bypassable.
- **ECC** **blocks blacklisted patterns** (e.g., `--no-verify`) **with exit 2 in a hook**. Reliable but limited in scope.
- **GSD** enforces Phase order through file structure — to move to the Execute phase, a Plan must exist, and the LLM is aware of this.
- **superpowers** relies entirely on the LLM's voluntary compliance. It persuades through `<HARD-GATE>`, a `Red Flags` table, and strong language like "this rule is non-negotiable." An experiment in changing LLM behavior through markdown alone, with no code.
- **gstack** is in the middle — deterministic slash commands are reliable, and natural language rule matching is delegated to the LLM but with 25 rules explicitly stated in the prompt.

**This spectrum is decisive for selection**. The more critical the automation, the more the left side is appropriate; the more flexibility and simplicity matter, the more the right side is appropriate.

---

# Part 2: Reference — Table Comparison

## 2-1. 18-Dimension Summary Table

| # | Dimension | Archon | ECC | GSD | gstack | OMC | superpowers |
|---|-----------|--------|-----|-----|--------|-----|-------------|
| 1 | Type | External wrapper | in-harness | in-harness | in-harness | Hybrid | in-harness |
| 2 | Direct LLM call | Yes (SDK) | No | Yes (SDK) | No | Yes (SDK) + No (plugin) | No |
| 3 | Entry point | 6 platform adapters | SessionStart + command | CLI + slash command | Root SKILL.md | Hook + SDK | SessionStart |
| 4 | Routing | Determinism + AI token detection | Determinism only | Determinism only | Determinism + 25 rules | Keyword amplification + LLM | LLM Skill Priority |
| 5 | Isolation | git worktree + port | None | None | Optional worktree | None | Recommended only |
| 6 | Concurrency | Global 10 + FIFO | None | None | None | 5 background agents | 1 per task |
| 7 | Session model | Immutable linked chain | File-based immutable | `.planning/` files | File touch TTL | File-based mutable | stateless |
| 8 | State store | SQLite | `*-session.tmp` | `.planning/*.md` | JSONL append | `.omc/state/*.json` | git |
| 9 | Context assembly | 6-step staircase | Summary + instinct auto-inject | Per-Phase file manifest | Preamble bash | skill-injector injects 5 | using-superpowers injection |
| 10 | Workflow engine | DAG (YAML, 6 node types) | None | 5-Phase fixed | Markdown Step 1→N | Ralph/Autopilot mode | Skill chain |
| 11 | Enforcement | emitRetract + whitelist | PreToolUse hook exit 2 | Phase order | Deterministic slash | Stop hook persistence | `<HARD-GATE>` markdown |
| 12 | Platform support | 6 (Slack/TG/GH/DC/Web/CLI) | Claude Code only | Claude Code only | 8 hosts | Claude Code + SDK | 4 (CC/Cursor/Gemini/Copilot) |
| 13 | Learning/memory | SQLite log | Instinct (confidence ≥ 0.7) | `.planning/SUMMARY.md` | project/learnings.jsonl | None | git commits |
| 14 | Model selection | Claude/Codex swappable | Opus/Sonnet | Sonnet default | Host-dependent | 3-tier routing | Host-dependent |
| 15 | Guardrails | Whitelist + port isolation | block-no-verify hooks | bypassPermissions (dangerous) | STATUS report | boulder detection | Markdown rules |
| 16 | Extensibility | Add adapters/workflows/nodes | Add skill files | Modify Phase definitions | Add `.tmpl` | Add agents/keywords | Add skill `.md` |
| 17 | Dependencies | TypeScript/Bun/SQLite | Node.js | TypeScript/Node.js | Bash/Bun | TypeScript/Node.js | zero |
| 18 | Primary language | TypeScript 5k+ lines | Markdown + Node.js | TypeScript | Bash + TS | TypeScript + JS | Markdown only |

## 2-2. Strengths and Weaknesses Summary (Per Harness)

### Archon — The Most Complete External Wrapper

**Strengths**
- 6 chat platforms + CLI/HTTP entry all converge to a common orchestrator → consistent behavior
- Immutable session model eliminates race conditions; audit history is perfect
- Workflow DAG + approval nodes naturally insert human review checkpoints
- emitRetract token detection achieves "routing and response simultaneously in a single LLM call"

**Weaknesses / Tradeoffs**
- 5,000+ lines of TypeScript — highest maintenance cost
- Isolation is git worktree only → no network/OS isolation (single-user assumption)
- Shallow per-field config merging → cannot partially modify deep structures
- Global max 10 concurrent conversations → queue wait under high load

**Best for**: Individual developers or small teams who want to delegate work to AI via Slack. Workflows that require approval steps.

### everything-claude-code (ECC) — Maximum Claude Code Enhancement Plugin

**Strengths**
- 143 prebuilt skills → rich functionality immediately after installation
- Session memory + instinct learning (confidence ≥ 0.7) → crash recovery and behavior accumulation
- Hook profiles (minimal/standard/strict) to adjust guardrail intensity per team
- Almost no external dependencies (Node.js only)

**Weaknesses**
- Hooks **fail silently** on exit 0 principle → user is unaware of problems
- 143-skill management overhead + potential inter-skill interference
- Path-resolution resolver repeated across all hooks → complexity
- No markdown enforcement → LLM can ignore it

**Best for**: Developers who already use Claude Code daily and want TDD, commit quality, and session memory built in by default.

### get-shit-done (GSD) — Workflow Enforcement

**Strengths**
- 5-Phase enforcement → prevents coding without a plan
- `.planning/` file-based state → human-readable and editable (ROADMAP.md can be edited directly)
- Per-Phase tool scoping → Research is read-only, Execute allows writes
- Stable prompt prefix for cache optimization

**Weaknesses**
- Session independence between Phases → implicit context cannot transfer (files are the only medium)
- `bypassPermissions` by default → risk of modifying files outside the project
- Plan validation consumes 2 LLM sessions → increased speed and cost
- No natural language entry (only explicit `/gsd:*` invocation)

**Best for**: Teams who want to clearly separate a large feature into design → implementation stages. "Think first, code later."

### gstack — King of Multi-Host Portability

**Strengths**
- `.tmpl` build pipeline auto-generates for 8 hosts (Claude/Codex/Kiro/OpenClaw, etc.)
- Per-project `learnings.jsonl` append-only → top 3 learnings automatically injected when working in the same repo
- 25 natural language routing rules stated explicitly → most transparent intent matching
- Bash preamble auto-detects environment

**Weaknesses**
- worktree isolation is optional — not enforced → accidental production modification is possible
- All bin utilities use `2>/dev/null || true` → bugs silently hidden
- Markdown workflow → unparseable, version validation is difficult
- Learning search is O(n) (not a database)

**Best for**: Developers who move between Cursor, Claude Code, and OpenClaw and want the same skill experience. Teams who want to accumulate per-project learnings.

### oh-my-claudecode (OMC) — King of Iterative Loops

**Strengths**
- Two entry points (plugin + SDK) → flexible integration
- Magic keyword amplification (ralph/autopilot/ultrawork) → natural mode switching
- 19 specialist agents dispatched in parallel up to 5 → role separation for design, review, and implementation
- 3-tier model routing (Opus/Sonnet/Haiku) → cost optimization

**Weaknesses**
- keyword-detector and skill-injector are **duplicated in both hook and SDK** → maintenance cost
- boulder state checked on every Stop hook → cost per response
- File-based mutable state → conflicts during concurrent iterations
- Under/over-cost when wrong model is selected per agent

**Best for**: Teams who want to hand over a PRD and have implementation, testing, and review run automatically in a loop. Projects wanting to split a large plan across parallel subagents.

### superpowers — The Extreme of Zero-Dependency

**Strengths**
- zero-dependency — simplest to install and upgrade
- Pure markdown → interpretable by any LLM platform
- 14 skills cover the entire development lifecycle (design→implementation→review)
- `<HARD-GATE>` and Red Flags table for explicit enforcement

**Weaknesses**
- Limited markdown enforcement — the LLM can ultimately ignore it
- Cost of n subagent calls (15 tasks = 15 calls)
- On-demand skill loading → tool call cost per skill
- Complex logic is impossible — all judgment is delegated to the LLM

**Best for**: Teams who want to "enforce process through documents rather than code." Organizations that want TDD, brainstorming, and code review to be mandatory gates.

---

## 2-3. Situation-Based Selection Guide

| Goal | 1st Choice | 2nd Choice |
|------|------------|------------|
| Delegate work to AI via Slack | **Archon** | — |
| Same experience across multiple CLI platforms | **gstack** | superpowers |
| Enforce phased spec → implementation | **GSD** | superpowers |
| Guardrails, commit quality, session memory | **ECC** | OMC |
| Iterative loops and parallel automation | **OMC** | Archon (workflow) |
| Minimal installation, maximum portability | **superpowers** | gstack |
| Workflow with approval steps | **Archon** | GSD |
| Split one large task into many pieces | **OMC** (autopilot) | Archon (DAG) |
| Accumulate per-project learnings | **gstack** | ECC (instinct) |
| Enforce process within a team | **superpowers** | GSD |

## 2-4. Combination Possibilities

It is important to note that the six harnesses **are not mutually exclusive**. Real-world combination examples:

- **ECC + superpowers**: Both are in-harness skill systems, so they can coexist as long as skill namespaces do not overlap. Both ECC's instincts and superpowers' `<HARD-GATE>` can be utilized.
- **gstack + GSD**: Use gstack's 25 rules to secure entry points; use GSD's 5-Phase for handling large tasks.
- **Archon + OMC (SDK mode)**: Archon handles the chat interface; OMC injects modes as an SDK library.
- **However, Archon + ECC/GSD/gstack/superpowers is an awkward combination**: Because Archon calls the LLM directly, in-harness skills do not work. They live at different layers.

---

## 3. Conclusion: Answer Three Axes First

Before choosing any of them, you need answers to three questions:

1. **Where will you talk to AI?**
   - Chat platforms (Slack, etc.) → Archon
   - Existing CLI tools (Claude Code / Cursor) → one of the four in-harness systems + OMC
2. **How much do you trust the LLM?**
   - Less → Archon or GSD with strong determinism
   - More → markdown-based superpowers or ECC
3. **What are you automating?**
   - Quality of a single conversation → ECC, superpowers
   - Long iterative tasks → OMC, GSD, Archon workflow
   - Multi-platform portability → gstack, superpowers

Once the answers to these three axes are settled, the "Situation-Based Selection Guide" table above naturally converges to a single choice.
