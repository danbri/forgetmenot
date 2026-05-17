#!/bin/bash
# SessionStart hook: install Node dependencies so the parl CLI, tests,
# and skills can run in Claude Code on the web sessions.
set -euo pipefail

# Only run inside the remote (web) execution environment; locally, the
# developer manages their own node_modules.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Install Node dependencies. `npm install` is idempotent and benefits
# from the container's cached state across sessions.
npm install --no-audit --no-fund --loglevel=error

# Make the CLI invokable as `parl` for the session.
echo "export PATH=\"${CLAUDE_PROJECT_DIR:-$(pwd)}/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
