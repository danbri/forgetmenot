#!/usr/bin/env bash
# Spin up a SPARQL endpoint over the org-chart factoid corpus.
#
#   ./scripts/govuk_sparql_serve.sh            # listens on 127.0.0.1:8765
#   ./scripts/govuk_sparql_serve.sh 9999       # custom port
#
# Loads the rolled-up named-graph N-Quads (every triple tagged with the
# GOV.UK page it came from) into rdflib-endpoint, a thin FastAPI wrapper
# around rdflib. The endpoint serves at the ROOT path (/), not /sparql.
#
# Smoke test once it's up:
#   curl -sG http://127.0.0.1:8765/ \
#     --data-urlencode 'query=SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s ?p ?o } }' \
#     -H 'Accept: application/sparql-results+json'
#
# For a fuller endpoint (UI, autocomplete, SPARQL 1.1 Update) use
# Apache Jena Fuseki -- see the README at
# third_party/govuk/html/orgcharts/README.md.
set -euo pipefail

PORT="${1:-8765}"
NQ="third_party/govuk/html/orgcharts/extractors/factoids/all.nq"

if [ ! -f "$NQ" ]; then
  echo "missing $NQ -- run scripts/govuk_extract_factoids.py first" >&2
  exit 1
fi

if ! command -v rdflib-endpoint >/dev/null 2>&1; then
  echo "rdflib-endpoint not installed: pip install rdflib-endpoint click uvicorn fastapi" >&2
  exit 1
fi

echo "loading $(wc -l < "$NQ") quads from $NQ"
exec rdflib-endpoint serve --host 127.0.0.1 --port "$PORT" "$NQ"
