#!/usr/bin/env python3
import json, sys
import gzip, io

def _open(p):
    return io.TextIOWrapper(gzip.open(p, "rb"), encoding="utf-8") if p.endswith(".gz") else open(p, "r", encoding="utf-8")
from rdflib import Dataset

PREFIX = """PREFIX trn:  <https://forgetmenot.example/transparency#>
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
"""
G_APPG     = "<https://forgetmenot.example/transparency#graph/appg-register>"
G_INT      = "<https://forgetmenot.example/transparency#graph/lords-rmfi>"
G_MEM      = "<https://forgetmenot.example/transparency#graph/members>"
G_ENT      = "<https://forgetmenot.example/transparency#graph/entities-resolved>"
G_OVERLAP  = "<https://forgetmenot.example/transparency#graph/overlaps>"

Q = {
  "q1_officers_with_secretariat_overlap": f"""
SELECT ?mname ?party ?appgTitle ?entityName WHERE {{
  GRAPH {G_OVERLAP} {{ ?m trn:isOfficerOfOverlappedAPPG ?appg .
                       ?e trn:connectsAPPG ?appg ; trn:connectsMember ?m ; trn:appgRelationType "secretariatOf" . }}
  GRAPH {G_APPG} {{ ?appg trn:title ?appgTitle . }}
  GRAPH {G_ENT}  {{ ?e trn:canonicalName ?entityName . }}
  GRAPH {G_MEM}  {{ ?m foaf:name ?mname . OPTIONAL {{ ?m trn:party ?party }} }}
}} ORDER BY ?mname
""",
  "q2_entities_appearing_across_appg_and_interests": f"""
SELECT ?entityName (COUNT(DISTINCT ?appg) AS ?appgCount) (COUNT(DISTINCT ?m) AS ?peerCount) WHERE {{
  GRAPH {G_OVERLAP} {{ ?e trn:connectsAPPG ?appg ; trn:connectsMember ?m . }}
  GRAPH {G_ENT}     {{ ?e trn:canonicalName ?entityName . }}
}} GROUP BY ?entityName ORDER BY DESC(?peerCount) DESC(?appgCount) LIMIT 30
""",
  "q3_appgs_with_most_member_interest_overlap": f"""
SELECT ?appgTitle (COUNT(DISTINCT ?m) AS ?peers) (COUNT(DISTINCT ?e) AS ?entities) WHERE {{
  GRAPH {G_OVERLAP} {{ ?e trn:connectsAPPG ?appg ; trn:connectsMember ?m . }}
  GRAPH {G_APPG}    {{ ?appg trn:title ?appgTitle . }}
}} GROUP BY ?appgTitle ORDER BY DESC(?peers) DESC(?entities) LIMIT 30
""",
  "q4_peers_with_most_appg_overlaps": f"""
SELECT ?mname ?party (COUNT(DISTINCT ?appg) AS ?appgs) WHERE {{
  GRAPH {G_OVERLAP} {{ ?m trn:hasOverlapWithAPPG ?appg . }}
  GRAPH {G_MEM}     {{ ?m foaf:name ?mname . OPTIONAL {{ ?m trn:party ?party }} }}
}} GROUP BY ?mname ?party ORDER BY DESC(?appgs) LIMIT 25
""",
  "q5_top_appg_funders_overall": f"""
SELECT ?sourceName (COUNT(DISTINCT ?appg) AS ?appgs) WHERE {{
  GRAPH {G_APPG} {{
    ?appg trn:hasFinancialBenefit ?b .
    ?b trn:benefitSource ?e .
  }}
  GRAPH {G_ENT}  {{ ?e trn:canonicalName ?sourceName . }}
}} GROUP BY ?sourceName ORDER BY DESC(?appgs) LIMIT 20
""",
  "q6_appg_funder_also_peer_interest": f"""
SELECT ?sourceName ?appgTitle ?mname WHERE {{
  GRAPH {G_APPG} {{
    ?appg trn:hasFinancialBenefit ?b .
    ?b trn:benefitSource ?e .
    ?appg trn:title ?appgTitle .
  }}
  GRAPH {G_OVERLAP} {{ ?e trn:connectsMember ?m . }}
  GRAPH {G_ENT}  {{ ?e trn:canonicalName ?sourceName . }}
  GRAPH {G_MEM}  {{ ?m foaf:name ?mname . }}
}} ORDER BY ?sourceName LIMIT 50
""",
}

ds = Dataset()
ds.parse(_open("third_party/data/transparency-graph/transparency.nq.gz"), format="nquads")
print(f"Loaded {sum(1 for _ in ds.quads((None,None,None,None)))} quads", file=sys.stderr)

out = {}
for k, q in Q.items():
    print(f"  q: {k}", file=sys.stderr)
    try:
        rows = list(ds.query(PREFIX + q))
        out[k] = [[(v.toPython() if hasattr(v,'toPython') else str(v)) if v is not None else None for v in row] for row in rows]
    except Exception as e:
        out[k] = {"error": str(e)}
with open("tmp/transparency-graph/query-results.json", "w") as f:
    json.dump(out, f, indent=2, default=str)
print(json.dumps({k: (len(v) if isinstance(v, list) else "ERR") for k, v in out.items()}, indent=2))
