#!/usr/bin/env python3
"""Run a SPARQL query against the gov.uk org-chart corpus.

Loaded on demand by skills/govuk-orgchart/SKILL.md so the query
capability only enters context when the skill is invoked. No MCP
server, no always-on tool schemas.

Two modes:
  - If the local rdflib-endpoint is running on 127.0.0.1:8765, use it
    (cached parse, fast).
  - Otherwise parse the N-Quads in-process. Slower first time but no
    setup needed.

Common prefixes (govuk:, schema:, parl:, owl:, dcterms:, xsd:) are
auto-prepended. Use --describe <uri> as a shortcut for everything we
know about a URI.

    python3 query.py 'SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s ?p ?o } }'
    python3 query.py --describe https://www.gov.uk/government/people/rachel-reeves
    python3 query.py --tsv 'SELECT ?role ?name WHERE { GRAPH ?g { ?role a <https://forgetmenot.local/govuk#MinisterialRole> ; <http://schema.org/name> ?name } } LIMIT 10'
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = "http://127.0.0.1:8765/"
NQ_PATH = Path(
    os.environ.get(
        "FORGETMENOT_GOVUK_NQ",
        "third_party/govuk/html/orgcharts/extractors/factoids/all.nq",
    )
)
PREFIXES = (
    "PREFIX govuk:   <https://forgetmenot.local/govuk#>\n"
    "PREFIX schema:  <http://schema.org/>\n"
    "PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n"
    "PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>\n"
    "PREFIX dcterms: <http://purl.org/dc/terms/>\n"
    "PREFIX owl:     <http://www.w3.org/2002/07/owl#>\n"
    "PREFIX parl:    <https://id.parliament.uk/schema/>\n"
)


def endpoint_running() -> bool:
    try:
        req = urllib.request.Request(
            ENDPOINT + "?query=" + urllib.parse.quote("ASK { ?s ?p ?o }"),
            headers={"Accept": "application/sparql-results+json"},
        )
        with urllib.request.urlopen(req, timeout=2) as r:
            r.read()
        return True
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return False


def via_endpoint(query: str) -> dict:
    body = urllib.parse.urlencode({"query": PREFIXES + query}).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={"Accept": "application/sparql-results+json",
                 "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def via_rdflib(query: str) -> dict:
    if not NQ_PATH.exists():
        sys.exit(f"corpus not found at {NQ_PATH}; "
                 f"run scripts/govuk_extract_factoids.py first")
    try:
        import rdflib
    except ImportError:
        sys.exit("rdflib not installed; pip install rdflib")
    ds = rdflib.Dataset()
    ds.parse(str(NQ_PATH), format="nquads")
    results = ds.query(PREFIXES + query)
    if results.type == "ASK":
        return {"head": {}, "boolean": bool(results.askAnswer)}
    bindings = []
    for row in results:
        b = {}
        for var, val in zip(results.vars or [], row):
            if val is None:
                continue
            if isinstance(val, rdflib.URIRef):
                b[str(var)] = {"type": "uri", "value": str(val)}
            elif isinstance(val, rdflib.Literal):
                b[str(var)] = {"type": "literal", "value": str(val)}
            else:
                b[str(var)] = {"type": "bnode", "value": str(val)}
        bindings.append(b)
    return {
        "head": {"vars": [str(v) for v in (results.vars or [])]},
        "results": {"bindings": bindings},
    }


def render_tsv(result: dict) -> str:
    if "boolean" in result:
        return str(result["boolean"]).lower()
    vars_ = result["head"].get("vars", [])
    out = ["\t".join(vars_)]
    for b in result["results"]["bindings"]:
        out.append("\t".join(b.get(v, {}).get("value", "") for v in vars_))
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("query", nargs="?", help="SPARQL query")
    parser.add_argument("--describe", help="shortcut: dump every triple "
                                            "in any graph mentioning the URI")
    parser.add_argument("--tsv", action="store_true",
                        help="tab-separated output instead of JSON")
    parser.add_argument("--force-rdflib", action="store_true",
                        help="parse N-Quads locally even if the endpoint is up")
    args = parser.parse_args(argv)

    if args.describe:
        query = (
            f"SELECT ?p ?o ?g WHERE {{ "
            f"GRAPH ?g {{ <{args.describe}> ?p ?o }} }} LIMIT 500"
        )
    elif args.query:
        query = args.query
    else:
        parser.error("provide a SPARQL query or --describe <uri>")

    use_endpoint = (not args.force_rdflib) and endpoint_running()
    result = via_endpoint(query) if use_endpoint else via_rdflib(query)

    if args.tsv:
        print(render_tsv(result))
    else:
        print(json.dumps(result, indent=2, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())
