#!/usr/bin/env bash
# Spin up a local PostgreSQL endpoint loaded with the latest
# House of Commons Library psephology dump.
#
# Idempotent: re-running with no args is safe. To force a fresh
# fetch + reload, pass `--refetch`.
#
# Usage:
#   bash scripts/psephology-up.sh                       # use bundled / cached dump
#   bash scripts/psephology-up.sh --refetch             # always pull a fresh dump
#   bash scripts/psephology-up.sh --dump path/to.sql    # load a specific dump
#
# Connection string after success:
#   postgresql://postgres@localhost:5432/psephology

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_DIR="$REPO/third_party/data/psephology"
DB=psephology
DUMP_URL_DEFAULT="https://raw.githubusercontent.com/ukparliament/psephology/main/db/dumps/2026-05-23.sql"
DUMP_PATH=""
REFETCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --refetch) REFETCH=1; shift ;;
    --dump)    DUMP_PATH="$2"; shift 2 ;;
    --help|-h) sed -n '2,16p' "$0"; exit 0 ;;
    *)         echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

mkdir -p "$CACHE_DIR"

# 1. Ensure Postgres is running.
if command -v pg_isready >/dev/null 2>&1 && pg_isready -h localhost -q; then
  echo "✓ Postgres already accepting connections on localhost:5432"
elif command -v pg_ctlcluster >/dev/null 2>&1; then
  echo "→ Starting Postgres 16 main cluster…"
  sudo pg_ctlcluster 16 main start 2>/dev/null || pg_ctlcluster 16 main start
  pg_isready -h localhost -q || { echo "✗ Postgres failed to start" >&2; exit 1; }
else
  echo "✗ No Postgres found. Install postgresql-16 or point this script at a running server." >&2
  exit 1
fi

# 2. Fetch the dump if we don't have one or --refetch was passed.
#    We only ever consider the original YYYY-MM-DD.sql dumps —
#    derivative files written below (e.g. *.filtered.sql) are
#    excluded so re-runs are idempotent.
if [[ -z "$DUMP_PATH" ]]; then
  if [[ $REFETCH -eq 0 ]]; then
    DUMP_PATH=$(ls -1 "$CACHE_DIR"/????-??-??.sql 2>/dev/null | sort | tail -n1 || true)
  fi
  if [[ -z "$DUMP_PATH" || $REFETCH -eq 1 ]]; then
    NAME=$(basename "$DUMP_URL_DEFAULT")
    DUMP_PATH="$CACHE_DIR/$NAME"
    echo "→ Fetching $DUMP_URL_DEFAULT → $DUMP_PATH"
    curl -sSL "$DUMP_URL_DEFAULT" -o "$DUMP_PATH.tmp"
    mv "$DUMP_PATH.tmp" "$DUMP_PATH"
  fi
fi

if [[ ! -s "$DUMP_PATH" ]]; then
  echo "✗ Dump file empty or missing: $DUMP_PATH" >&2
  exit 1
fi
echo "✓ Using dump $DUMP_PATH ($(wc -c < "$DUMP_PATH") bytes)"

# 3. (Re)create the database. The Rails-style dump assumes empty
#    schema; the safest pattern is drop-and-recreate. DROP DATABASE
#    cannot run inside a transaction, so issue the two statements
#    as separate -c calls.
PG_RUN() {
  if sudo -n -u postgres psql -tAc "$1" >/dev/null 2>&1; then
    return 0
  fi
  psql -h localhost -U postgres -tAc "$1" >/dev/null
}
PG_RUN "DROP DATABASE IF EXISTS $DB"
PG_RUN "CREATE DATABASE $DB"
echo "✓ (Re)created database $DB"

# 4. Pre-filter the dump:
#    - drop SET transaction_timeout (pg17-only; pg16 errors on it)
#    - drop ALTER … OWNER TO smethurstm and similar role-bound
#      ownership / privilege grants — the upstream maintainer's
#      local username, not a role on this host. Loading as
#      `postgres` is fine for analysis use.
FILTERED="${DUMP_PATH%.sql}.filtered.sql"
sed -E \
  -e '/^SET transaction_timeout/d' \
  -e '/OWNER TO smethurstm/d' \
  -e '/^ALTER (DATABASE|SCHEMA|TABLE|SEQUENCE|VIEW|FUNCTION|TYPE) [^;]+ OWNER TO/d' \
  -e '/^GRANT .* TO smethurstm/d' \
  "$DUMP_PATH" > "$FILTERED"

echo "→ Loading dump (this is fast — the file is ~3 MB)…"
# Prefer the local-socket sudo path; fall back to TCP only if sudo
# is unavailable. Don't fall through on SQL errors — those should
# surface, not retry against a credential-less TCP socket.
if sudo -n true 2>/dev/null; then
  sudo -u postgres psql -d "$DB" -q -v ON_ERROR_STOP=1 -f "$FILTERED" 2>&1 | tail -3
  STATUS="${PIPESTATUS[0]}"
else
  psql -h localhost -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$FILTERED" 2>&1 | tail -3
  STATUS="${PIPESTATUS[0]}"
fi
[[ "$STATUS" -eq 0 ]] || { echo "✗ Dump load failed (status $STATUS)" >&2; exit 1; }

# 5. Sanity-check.
COUNT_SQL="SELECT json_object_agg(relname, n_live_tup) FROM pg_stat_user_tables WHERE n_live_tup > 0;"
echo
echo "Row counts (non-empty tables):"
{ sudo -u postgres psql -d "$DB" -tAc "$COUNT_SQL" 2>/dev/null \
    || psql -h localhost -U postgres -d "$DB" -tAc "$COUNT_SQL"; } \
  | python3 -m json.tool 2>/dev/null \
  || true

cat <<EOF

✓ psephology is up.

  Database:        $DB
  Connection URI:  postgresql://postgres@localhost:5432/$DB
  Dump on disk:    $DUMP_PATH

Try:
  psql -h localhost -U postgres -d $DB -c 'SELECT polling_on FROM general_elections ORDER BY polling_on DESC LIMIT 5'
  parl psephology tables
  parl psephology sql 'SELECT COUNT(*) FROM candidacies'

To shut down again:
  bash scripts/psephology-down.sh
EOF
