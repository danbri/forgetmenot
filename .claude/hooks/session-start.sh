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

# --- Chrome for the chrome-devtools MCP server (see .mcp.json) -----------
# The chrome-devtools-mcp package drives a real Chrome but does NOT ship
# one; install Google Chrome stable so the server can launch it headless.
install_chrome() {
  command -v google-chrome >/dev/null 2>&1 && return 0
  local deb; deb="$(mktemp --suffix=.deb)"
  curl -fsSL -o "$deb" \
    https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb || return 1
  # apt resolves Chrome's shared-library dependencies from the .deb.
  apt-get update -qq && apt-get install -y -qq "$deb"
  rm -f "$deb"
}

# Chrome on Linux trusts certs from its own NSS database (~/.pki/nssdb),
# NOT the system bundle in /etc/ssl/certs. The web container reaches the
# internet through a TLS-terminating egress proxy whose CA is installed
# system-wide under /usr/local/share/ca-certificates; import those CAs
# into the NSS store so Chrome doesn't fail every HTTPS page with
# ERR_CERT_AUTHORITY_INVALID.
trust_egress_ca() {
  command -v certutil >/dev/null 2>&1 || apt-get install -y -qq libnss3-tools
  local db="$HOME/.pki/nssdb"
  mkdir -p "$db"
  [ -f "$db/cert9.db" ] || certutil -d "sql:$db" -N --empty-password
  local crt name
  for crt in /usr/local/share/ca-certificates/*.crt; do
    [ -e "$crt" ] || continue
    name="$(basename "$crt" .crt)"
    certutil -d "sql:$db" -L -n "$name" >/dev/null 2>&1 && continue
    certutil -d "sql:$db" -A -t "C,," -n "$name" -i "$crt" || true
  done
}

# Best-effort: a Chrome install failure (e.g. egress policy blocks
# dl.google.com) must not abort the whole session, so don't let `set -e`
# kill us here — the rest of the toolchain still works without Chrome.
install_chrome && trust_egress_ca || \
  echo "session-start: Chrome/chrome-devtools setup skipped or failed (non-fatal)" >&2
