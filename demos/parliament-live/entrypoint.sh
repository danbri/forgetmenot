#!/bin/sh
# fpkg-entrypoint — start Oxigraph (in-memory SPARQL store, preloaded
# from bundled .nq.gz dumps) in the background, then exec the Node
# server in the foreground.
#
# Read-only by design: Oxigraph is bound to 127.0.0.1 only, accessible
# from outside the container exclusively via the Node /sparql/* proxy.

set -eu

DATA_DIR="${NQUADS_DIR:-/app/data}"
LOAD_DIR="$(mktemp -d)"
trap 'rm -rf "$LOAD_DIR"' EXIT

echo "[fpkg] decompressing N-Quads to $LOAD_DIR …"
for f in "$DATA_DIR"/*.nq.gz; do
    base="$(basename "$f" .gz)"
    gunzip -c "$f" > "$LOAD_DIR/$base"
    echo "  $(stat -c '%n  %s bytes' "$LOAD_DIR/$base")"
done

# Oxigraph: serve over HTTP, in-memory store, bulk-load every .nq.
# `oxigraph serve` runs an in-memory database when no --location is
# given; the load happens once at startup.
BIND="${OXIGRAPH_BIND:-127.0.0.1:7878}"

echo "[fpkg] starting oxigraph on $BIND (in-memory) …"
oxigraph serve \
    --bind "$BIND" \
    --read-only \
    --cors \
    "$LOAD_DIR"/*.nq &
OXI_PID=$!

# Wait for the SPARQL endpoint to come up before launching Node so the
# health check doesn't briefly see a half-loaded stack. Up to 60s.
for i in $(seq 1 60); do
    if wget -qO- "http://$BIND/query?query=SELECT%20(COUNT(*)%20AS%20%3Fn)%20WHERE%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D" >/dev/null 2>&1; then
        echo "[fpkg] oxigraph ready after ${i}s"
        break
    fi
    if ! kill -0 "$OXI_PID" 2>/dev/null; then
        echo "[fpkg] oxigraph died during startup" >&2
        exit 1
    fi
    sleep 1
done

echo "[fpkg] starting node server.mjs on $HOST:$PORT …"
exec node /app/server.mjs
