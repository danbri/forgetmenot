#!/usr/bin/env bash
# Shut down the local Postgres cluster brought up by
# psephology-up.sh. Leaves the cached dump and the database on
# disk; just stops the running server. Re-run psephology-up.sh
# to bring it back.
set -euo pipefail

if command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo pg_ctlcluster 16 main stop 2>/dev/null || pg_ctlcluster 16 main stop
  echo "✓ Postgres 16 main cluster stopped"
else
  echo "No pg_ctlcluster on PATH; stop your Postgres server manually." >&2
  exit 1
fi
