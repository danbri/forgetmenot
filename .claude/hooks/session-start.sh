#!/bin/bash
# SessionStart hook for Claude Code on the web.
#
# Skills now live at the vendor-neutral `skills/<name>/SKILL.md`
# path that the open Agent Skills spec (agentskills.io) describes.
# The `.claude/skills/<name>` discovery shims are committed
# relative symlinks (`→ ../../skills/<name>`), so Claude Code
# auto-discovers them on container boot WITHOUT this hook
# having to do anything — that's the point.
#
# What this hook still does:
#   1. install Node deps so the parl CLI is runnable
#   2. put bin/ on PATH for the session
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

npm install --no-audit --no-fund --loglevel=error
echo "export PATH=\"${CLAUDE_PROJECT_DIR:-$(pwd)}/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
