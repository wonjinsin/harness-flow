# Codex Tool Mapping

Skills use Claude Code tool names. When you encounter these in a skill, use your platform equivalent:

| Skill references                 | Codex equivalent                                                  |
| -------------------------------- | ----------------------------------------------------------------- |
| `Task` tool (dispatch subagent)  | `spawn_agent` (see [Named agent dispatch](#named-agent-dispatch)) |
| Multiple `Task` calls (parallel) | Multiple `spawn_agent` calls                                      |
| Task returns result              | `wait`                                                            |
| Task completes automatically     | `close_agent` to free slot                                        |
| `TodoWrite` (task tracking)      | `update_plan`                                                     |
| `Skill` tool (invoke a skill)    | Skills load natively — just follow the instructions               |
| `Read`, `Write`, `Edit` (files)  | Use your native file tools                                        |
| `Bash` (run commands)            | Use your native shell tools                                       |
| File-edit patches                | `apply_patch` — the secret guard scans the patch body itself and blocks writes touching `.env`, SSH keys, and similar secret files |

## Installing the plugin in Codex

Codex supports plugin, skill, and hook install directly — install harness-flow
the same way as any other plugin marketplace source:

```bash
codex plugin marketplace add wonjinsin/harness-flow
# or, from a local checkout:
codex plugin marketplace add .
```

Hooks reference `${CLAUDE_PLUGIN_ROOT}`; Codex treats this as a compat alias
and resolves it the same way. Some macOS installs have been reported missing
this alias (see issue #448) — if a hook fails to find its script, verify
`CLAUDE_PLUGIN_ROOT` is set in the environment Codex launches hooks with.

## Subagent dispatch requires multi-agent support

Add to your Codex config (`~/.codex/config.toml`):

```toml
[features]
multi_agent = true
```

This enables `spawn_agent`, `wait`, and `close_agent` for skills like `dispatching-parallel-agents` and `subagent-driven-development`.

## Template-based agent dispatch

harness-flow skills dispatch a `general-purpose` agent and fill a prompt template
(e.g. `code-reviewer.md`, `task-reviewer-prompt.md`). Codex creates generic
agents from built-in roles (`default`, `explorer`, `worker`).

When a skill says to dispatch a `general-purpose` agent with a prompt template:

1. Find the skill's prompt template (e.g., `code-reviewer.md` or
   `task-reviewer-prompt.md`)
2. Read the prompt content
3. Fill any template placeholders (`{BASE_SHA}`, `{DESCRIPTION}`, etc.)
4. Spawn a `worker` agent with the filled content as the `message`

| Skill instruction                                | Codex equivalent                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `Task tool (general-purpose)` with template file | `spawn_agent(agent_type="worker", message=...)` with `code-reviewer.md` content |
| `Task tool (general-purpose)` with inline prompt | `spawn_agent(message=...)` with the same prompt                                 |

### Message framing

The `message` parameter is user-level input, not a system prompt. Structure it
for maximum instruction adherence:

```
Your task is to perform the following. Follow the instructions below exactly.

<agent-instructions>
[filled prompt content from the agent's .md file]
</agent-instructions>

Execute this now. Output ONLY the structured response following the format
specified in the instructions above.
```

- Use task-delegation framing ("Your task is...") rather than persona framing ("You are...")
- Wrap instructions in XML tags — the model treats tagged blocks as authoritative
- End with an explicit execution directive to prevent summarization of the instructions

### SDD model tiering (profiles)

Claude Code's `subagent-driven-development` picks a tier per dispatch —
`Task(model=cheap/haiku)` for mechanical groups, `standard/sonnet` for groups
requiring judgment, and a sonnet-or-higher floor for the reviewer. Claude Code
enforces the choice with `hooks/pre-agent-model.js`, which blocks a dispatch
that omits `model`.

Codex has no equivalent hook: `SubagentStart` cannot block a dispatch, and the
target model isn't exposed to it, so there is nothing to gate on. The Codex
equivalent is a custom agent **profile** per tier, not a hook:

1. Copy the templates from `references/codex-agents/` (`sdd-cheap.toml`,
   `sdd-standard.toml`, `sdd-review.toml`) into your project's `.codex/agents/`.
2. Dispatch by profile name (`sdd-cheap`, `sdd-standard`, `sdd-review`) instead
   of passing a `model` parameter.
3. Each profile's tier lever is `model_reasoning_effort` (`low` / `medium` /
   `high` — verified-valid Codex values). `model` is left commented in each
   template for users who also want to pin a specific model per tier.

## Environment Detection

Skills that create worktrees or finish branches should detect their
environment with read-only git commands before proceeding:

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
BRANCH=$(git branch --show-current)
```

- `GIT_DIR != GIT_COMMON` → already in a linked worktree (skip creation)
- `BRANCH` empty → detached HEAD (cannot branch/push/PR from sandbox)

See `using-git-worktrees` Step 0 and `finishing-a-development-branch`
Step 1 for how each skill uses these signals.

## Codex App Finishing

When the sandbox blocks branch/push operations (detached HEAD in an
externally managed worktree), the agent commits all work and informs
the user to use the App's native controls:

- **"Create branch"** — names the branch, then commit/push/PR via App UI
- **"Hand off to local"** — transfers work to the user's local checkout

The agent can still run tests, stage files, and output suggested branch
names, commit messages, and PR descriptions for the user to copy.
