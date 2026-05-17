#!/usr/bin/env python3
"""Tiny stdio MCP server exposing the local gov.uk SPARQL endpoint.

Wraps the rdflib-endpoint at http://127.0.0.1:8765/ (served by
scripts/govuk_sparql_serve.sh over
third_party/govuk/html/orgcharts/extractors/factoids/all.nq) so that
Claude Code sessions can run SPARQL queries against the corpus as an
MCP tool, without having to know about the HTTP transport.

Declared in `.mcp.json` as the `govuk-sparql` server. As with all MCP
servers, takes effect on next session start -- a running session
cannot self-load a new MCP server.

Two tools:

    sparql_query(query: str)  -- SPARQL SELECT/ASK against the corpus.
                                  Returns JSON results bindings (or
                                  the boolean for ASK).
    sparql_describe(uri: str) -- shortcut for DESCRIBE <uri>; useful to
                                  inspect everything we know about a
                                  given gov.uk URI.

Requires `pip install mcp` (the official Python MCP SDK).
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request

ENDPOINT = "http://127.0.0.1:8765/"
PREFIXES = (
    "PREFIX govuk:   <https://forgetmenot.local/govuk#>\n"
    "PREFIX schema:  <http://schema.org/>\n"
    "PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n"
    "PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>\n"
    "PREFIX dcterms: <http://purl.org/dc/terms/>\n"
    "PREFIX owl:     <http://www.w3.org/2002/07/owl#>\n"
    "PREFIX parl:    <https://id.parliament.uk/schema/>\n"
)


def _ask_endpoint(query: str) -> dict:
    body = urllib.parse.urlencode({"query": PREFIXES + query}).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={
            "Accept": "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def main() -> int:
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError:
        sys.stderr.write(
            "missing dep: pip install mcp\n"
            "this script only runs as an MCP server -- the SDK provides\n"
            "the stdio JSON-RPC plumbing.\n"
        )
        return 1

    server = FastMCP("govuk-sparql")

    @server.tool()
    def sparql_query(query: str) -> str:
        """Run a SPARQL SELECT or ASK against the local gov.uk org-chart
        corpus. Prefixes (govuk:, schema:, parl:, owl:, ...) are
        auto-prepended. Returns JSON-formatted results bindings."""
        try:
            return json.dumps(_ask_endpoint(query), indent=2)
        except Exception as exc:  # noqa: BLE001
            return json.dumps({"error": repr(exc)})

    @server.tool()
    def sparql_describe(uri: str) -> str:
        """Return every triple in any named graph that mentions <uri>
        -- a quick way to inspect everything the corpus knows about
        a gov.uk URI (e.g. https://www.gov.uk/government/people/X)."""
        q = f"""SELECT ?p ?o ?g WHERE {{
            GRAPH ?g {{ <{uri}> ?p ?o }}
        }} LIMIT 200"""
        try:
            return json.dumps(_ask_endpoint(q), indent=2)
        except Exception as exc:  # noqa: BLE001
            return json.dumps({"error": repr(exc)})

    server.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
