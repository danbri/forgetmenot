#!/usr/bin/env bash
# Spin up a SPARQL endpoint over one or more local RDF files.
#
# Generic — works for any N-Quads, Turtle, N-Triples, RDF/XML or
# TriG file produced anywhere in this repo. The three corpora that
# already document local-querying recipes (govuk-orgchart, fcdo,
# psephology, identity-graph, tna-legislation) all bottom out
# here.
#
# Three backends:
#   --backend rdflib (default)   pure-Python rdflib-endpoint;
#                                quickest to start, no Docker.
#                                Endpoint at http://127.0.0.1:8765/
#   --backend fuseki             Apache Jena Fuseki; canonical Java
#                                endpoint with a web UI and SPARQL
#                                Update support. Endpoint at
#                                http://127.0.0.1:3030/<dataset>/sparql.
#                                Downloads Fuseki 5.2.0 on first run.
#   --backend oxigraph           Rust engine via Docker; persistent
#                                store; full SPARQL 1.1 incl. RDF*.
#                                Endpoint at http://127.0.0.1:7878/query.
#
# .gz inputs are decompressed to a temp file transparently.
#
# Examples:
#   scripts/local-sparql-serve.sh third_party/data/psephology/all.nq.gz
#   scripts/local-sparql-serve.sh --backend fuseki \
#       --dataset govuk third_party/govuk/.../all.nq
#   scripts/local-sparql-serve.sh --backend oxigraph \
#       third_party/data/fcdo_treaties/extractors/factoids/all.nq.gz
#
# Stop with Ctrl-C; the temp decompressed files are cleaned up.

set -euo pipefail

BACKEND=rdflib
PORT=
DATASET=
INPUTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend) BACKEND="$2"; shift 2 ;;
    --port)    PORT="$2"; shift 2 ;;
    --dataset) DATASET="$2"; shift 2 ;;
    --help|-h) sed -n '2,32p' "$0"; exit 0 ;;
    --*) echo "Unknown flag: $1" >&2; exit 2 ;;
    *)   INPUTS+=("$1"); shift ;;
  esac
done

if [[ ${#INPUTS[@]} -eq 0 ]]; then
  echo "Usage: $0 PATH [PATH...] [--backend rdflib|fuseki|oxigraph] [--port N] [--dataset NAME]" >&2
  exit 2
fi

# Decompress *.gz inputs into a session-scoped tempdir; map .gz
# extensions to their inner format extension so backends see the
# right file type.
TMPDIR=$(mktemp -d -t local-sparql-XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT

NORMALISED=()
for f in "${INPUTS[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "✗ Missing file: $f" >&2; exit 2
  fi
  if [[ "$f" == *.gz ]]; then
    base=$(basename "${f%.gz}")          # strip .gz extension
    out="$TMPDIR/$base"
    echo "→ Decompressing $f → $out"
    gunzip -c "$f" > "$out"
    NORMALISED+=("$out")
  else
    NORMALISED+=("$f")
  fi
done

# Derive a default dataset name from the first input by stripping
# the extension regardless of which RDF flavour it is.
firstbase=$(basename "${INPUTS[0]}")
DEFAULT_DATASET="${firstbase%%.*}"
DATASET="${DATASET:-$DEFAULT_DATASET}"

case "$BACKEND" in
  rdflib)
    PORT="${PORT:-8765}"
    if ! command -v rdflib-endpoint >/dev/null 2>&1; then
      echo "✗ rdflib-endpoint not on PATH" >&2
      echo "  pip install rdflib rdflib-endpoint click uvicorn fastapi" >&2
      exit 3
    fi
    cat <<EOF
✓ rdflib-endpoint will serve:
$(for f in "${NORMALISED[@]}"; do printf '    %s (%s lines)\n' "$f" "$(wc -l < "$f")"; done)
  URL:  http://127.0.0.1:$PORT/
  Test: curl -sG http://127.0.0.1:$PORT/ \\
            --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE {GRAPH ?g {?s ?p ?o}}' \\
            -H 'Accept: application/sparql-results+json'
  Stop: Ctrl-C
EOF
    exec rdflib-endpoint serve --host 127.0.0.1 --port "$PORT" "${NORMALISED[@]}"
    ;;

  fuseki)
    PORT="${PORT:-3030}"
    FUSEKI_VERSION="5.2.0"
    FUSEKI_DIR="$HOME/.cache/forgetmenot/fuseki-$FUSEKI_VERSION"
    FUSEKI_BIN="$FUSEKI_DIR/apache-jena-fuseki-$FUSEKI_VERSION/fuseki-server"
    if [[ ! -x "$FUSEKI_BIN" ]]; then
      echo "→ Downloading Apache Jena Fuseki $FUSEKI_VERSION (one-time, ~60 MB)"
      mkdir -p "$FUSEKI_DIR"
      curl -sSL -o "$FUSEKI_DIR/fuseki.tar.gz" \
        "https://dlcdn.apache.org/jena/binaries/apache-jena-fuseki-$FUSEKI_VERSION.tar.gz"
      tar -xzf "$FUSEKI_DIR/fuseki.tar.gz" -C "$FUSEKI_DIR"
      rm "$FUSEKI_DIR/fuseki.tar.gz"
    fi
    # Fuseki's `--file` flag takes one path; concatenate if multiple.
    if [[ ${#NORMALISED[@]} -gt 1 ]]; then
      CONCAT="$TMPDIR/combined.nq"
      cat "${NORMALISED[@]}" > "$CONCAT"
      NORMALISED=("$CONCAT")
    fi
    cat <<EOF
✓ Fuseki will serve:
    file:    ${NORMALISED[0]}
    dataset: /$DATASET
  UI:    http://127.0.0.1:$PORT/
  Query: http://127.0.0.1:$PORT/$DATASET/sparql
  Stop:  Ctrl-C
EOF
    exec "$FUSEKI_BIN" --port "$PORT" --file="${NORMALISED[0]}" "/$DATASET"
    ;;

  oxigraph)
    PORT="${PORT:-7878}"
    DBDIR="$TMPDIR/oxigraph-db"
    mkdir -p "$DBDIR"
    if ! command -v docker >/dev/null 2>&1; then
      echo "✗ docker required for the oxigraph backend" >&2; exit 3
    fi
    echo "→ Loading into Oxigraph DB at $DBDIR"
    for f in "${NORMALISED[@]}"; do
      docker run --rm \
        -v "$(dirname "$f"):/data:ro" -v "$DBDIR:/db" \
        oxigraph/oxigraph load --location /db --file "/data/$(basename "$f")"
    done
    cat <<EOF
✓ Oxigraph will serve:
    db:   $DBDIR
  URL:  http://127.0.0.1:$PORT/query
  Test: curl -sG 'http://127.0.0.1:$PORT/query' \\
            --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE {GRAPH ?g {?s ?p ?o}}' \\
            -H 'Accept: application/sparql-results+json'
  Stop: Ctrl-C
EOF
    exec docker run --rm -p "$PORT:7878" -v "$DBDIR:/db" \
      oxigraph/oxigraph serve --bind 0.0.0.0:7878 --location /db
    ;;

  *)
    echo "Unknown backend: $BACKEND (use rdflib | fuseki | oxigraph)" >&2
    exit 2
    ;;
esac
