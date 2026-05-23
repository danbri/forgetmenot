#!/bin/bash
# SessionStart hook: install Node dependencies AND wire the
# in-repo skills/ folders into .claude/skills/ so Claude Code
# auto-discovers them.
set -euo pipefail

# Only run inside the remote (web) execution environment; locally, the
# developer manages their own node_modules and runs install-skills.sh
# themselves (see docs/installation.md).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# 1. Install Node dependencies. `npm install` is idempotent and
#    benefits from the container's cached state across sessions.
npm install --no-audit --no-fund --loglevel=error

# 2. Wire every skills/<name>/ into .claude/skills/<name> via
#    relative symlinks so Claude Code's project-scope skill
#    discovery picks them up. Idempotent; re-running replaces
#    stale links and adds any new skills.
bash scripts/install-skills.sh >/dev/null

# 3. Make the CLI invokable as `parl` for the session.
echo "export PATH=\"${CLAUDE_PROJECT_DIR:-$(pwd)}/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
