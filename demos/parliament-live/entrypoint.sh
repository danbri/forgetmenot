#!/bin/sh
# fpkg-entrypoint — start Oxigraph (loaded from bundled .nq.gz dumps)
# in the background, then exec the Node server in the foreground.
#
# Oxigraph 0.5.x split the old `serve --read-only` into two subcommands:
#   - `load --location DIR --file F1 --file F2 ...`  populates an on-disk
#     RocksDB store at DIR.
#   - `serve-read-only --location DIR --bind ... --cors`  serves it.
# In-memory mode is no longer available for read-only operation; data
# must be loaded into a RocksDB directory before `serve-read-only` will
# open it. We use a tmpfs so the cold-start cost is paid per machine
# boot (~3-5 s for our data), not per query.
#
# --union-default-graph turns SELECT (... ) WHERE { ?s ?p ?o } into a
# union over every named graph in the store; without it queries default
# to the (empty) unnamed default graph and you get an unhelpful 0.

set -eu

DATA_DIR="${NQUADS_DIR:-/app/data}"
LOAD_DIR="$(mktemp -d)"
DB_DIR="$(mktemp -d -t oxi-db.XXXXXX)"
trap 'rm -rf "$LOAD_DIR" "$DB_DIR"' EXIT

BIND="${OXIGRAPH_BIND:-127.0.0.1:7878}"

echo "[fpkg] decompressing N-Quads from $DATA_DIR to $LOAD_DIR …"
files=""
for f in "$DATA_DIR"/*.nq.gz; do
    base="$(basename "$f" .gz)"
    out="$LOAD_DIR/$base"
    gunzip -c "$f" > "$out"
    files="$files --file $out"
    echo "  $(stat -c '%n  %s bytes' "$out")"
done

echo "[fpkg] loading into RocksDB at $DB_DIR …"
# shellcheck disable=SC2086
oxigraph load --location "$DB_DIR" $files

echo "[fpkg] starting oxigraph serve-read-only on $BIND …"
oxigraph serve-read-only \
    --location "$DB_DIR" \
    --bind "$BIND" \
    --cors \
    --union-default-graph &
OXI_PID=$!

# Wait for the SPARQL endpoint to come up so the Node health check
# doesn't briefly see a half-loaded stack. Up to 60s.
for i in $(seq 1 60); do
    if wget -qO- "http://$BIND/query?query=ASK%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D" >/dev/null 2>&1; then
        echo "[fpkg] oxigraph ready after ${i}s"
        break
    fi
    if ! kill -0 "$OXI_PID" 2>/dev/null; then
        echo "[fpkg] oxigraph died during startup" >&2
        exit 1
    fi
    sleep 1
done

echo "[fpkg] starting node server.mjs on ${HOST:-0.0.0.0}:${PORT:-8080} …"
exec node /app/server.mjs
