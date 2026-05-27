#!/bin/sh
# fpkg-entrypoint — start Oxigraph against the pre-baked RocksDB, then
# exec the Node server in the foreground.
#
# The Docker image is built in three stages (Dockerfile): the load-stage
# runs `oxigraph load` once at CI time, producing a populated RocksDB
# directory that's copied into the runtime image at /app/data-db. Cold
# starts no longer pay the gunzip + load cost — they go straight to
# `serve-read-only --location` which is essentially "open files".
#
# For local dev (no pre-baked store), fall back to the old gunzip + load
# flow if /app/data-db is empty.
#
# --union-default-graph turns SELECT (... ) WHERE { ?s ?p ?o } into a
# union over every named graph in the store; without it queries default
# to the (empty) unnamed default graph and you get an unhelpful 0.

set -eu

DB_DIR="${OXIGRAPH_DB:-/app/data-db}"
BIND="${OXIGRAPH_BIND:-127.0.0.1:7878}"

# Pre-baked check: RocksDB stores have at least a CURRENT file when
# populated. Empty dir → we're running locally without a baked store
# and need to do the load on the fly.
if [ ! -s "$DB_DIR/CURRENT" ]; then
    echo "[fpkg] no pre-baked RocksDB at $DB_DIR — falling back to runtime load"
    DATA_DIR="${NQUADS_DIR:-/app/data}"
    LOAD_DIR="$(mktemp -d)"
    DB_DIR="$(mktemp -d -t oxi-db.XXXXXX)"
    trap 'rm -rf "$LOAD_DIR" "$DB_DIR"' EXIT

    echo "[fpkg] decompressing N-Quads from $DATA_DIR to $LOAD_DIR …"
    files=""
    for f in "$DATA_DIR"/*.nq.gz; do
        base="$(basename "$f" .gz)"
        out="$LOAD_DIR/$base"
        gunzip -c "$f" > "$out"
        files="$files --file $out"
    done
    echo "[fpkg] loading into RocksDB at $DB_DIR …"
    # shellcheck disable=SC2086
    oxigraph load --location "$DB_DIR" $files
else
    echo "[fpkg] using pre-baked RocksDB at $DB_DIR"
fi

echo "[fpkg] starting oxigraph serve-read-only on $BIND …"
oxigraph serve-read-only \
    --location "$DB_DIR" \
    --bind "$BIND" \
    --cors \
    --union-default-graph &
OXI_PID=$!

# Brief readiness loop; with a pre-baked store this should pass on the
# first or second poll.
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
