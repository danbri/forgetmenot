#!/usr/bin/env python3
"""Smoke-test queries against the bundled Parliament Thesaurus graph.

Reads third_party/data/parliament-lda-terms/parliament-lda-terms.nq.gz,
runs three illustrative SPARQL queries, prints the first few results
for each. Mostly used by the CI as a sanity check that the dump is
valid RDF before shipping it to fly.io.
"""
import gzip, io, sys
from rdflib import Dataset

PATH = "third_party/data/parliament-lda-terms/parliament-lda-terms.nq.gz"

PREFIX = """PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""

QUERIES = {
    "q1_term_count": """
SELECT (COUNT(DISTINCT ?term) AS ?n) WHERE {
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/core> {
    ?term skos:prefLabel ?label .
  }
}
""",
    "q2_top_concepts": """
SELECT ?label WHERE {
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/hierarchy> {
    ?term skos:topConceptOf ?scheme .
  }
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/core> {
    ?term skos:prefLabel ?label .
  }
} ORDER BY ?label LIMIT 10
""",
    "q3_sample_broader_links": """
SELECT ?child_label ?parent_label WHERE {
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/hierarchy> {
    ?child skos:broader ?parent .
  }
  GRAPH <https://lda.data.parliament.uk/graph/legacy-terms/core> {
    ?child  skos:prefLabel ?child_label .
    ?parent skos:prefLabel ?parent_label .
  }
} LIMIT 10
""",
}

print(f"Loading {PATH}…", file=sys.stderr)
ds = Dataset()
with gzip.open(PATH, "rt", encoding="utf-8") as f:
    ds.parse(f, format="nquads")
print(f"Loaded {sum(1 for _ in ds.quads((None,None,None,None)))} quads", file=sys.stderr)

for name, q in QUERIES.items():
    print(f"\n=== {name} ===")
    try:
        rows = list(ds.query(PREFIX + q))
    except Exception as e:
        print(f"ERROR: {e}")
        continue
    for r in rows[:10]:
        print("  ", tuple(v.toPython() if hasattr(v, 'toPython') else str(v) for v in r))
