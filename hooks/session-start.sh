#!/bin/bash
# SessionStart hook — inject using-harness meta-skill into session context.
# Plugin mode: $CLAUDE_PLUGIN_ROOT is injected by Claude Code.

set -euo pipefail

SKILL_FILE="$CLAUDE_PLUGIN_ROOT/skills/using-harness/SKILL.md"

if [ ! -f "$SKILL_FILE" ]; then
  echo "using-harness skill not found at $SKILL_FILE" >&2
  exit 1
fi

cat <<'EOF'
<EXTREMELY_IMPORTANT>
You have harness.

Below is the full content of the 'using-harness' skill — your introduction to operating the harness. It teaches you to interpret `docs/harness/harness-flow.yaml` and dispatch nodes yourself. Read it now, and follow its rules for every user message in this session.

---
EOF

cat "$SKILL_FILE"

cat <<'EOF'
---
</EXTREMELY_IMPORTANT>
EOF
