#!/usr/bin/env python3
"""Run example queries against scrutiny.nq and emit JSON per query."""
import json, sys
import gzip, io

def _open(p):
    return io.TextIOWrapper(gzip.open(p, "rb"), encoding="utf-8") if p.endswith(".gz") else open(p, "r", encoding="utf-8")
from rdflib import Dataset

PREFIX = """PREFIX scr:  <https://forgetmenot.example/scrutiny#>
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
"""

G_SI    = "<https://forgetmenot.example/scrutiny#graph/parliament-si>"
G_DIV   = "<https://forgetmenot.example/scrutiny#graph/lords-votes>"
G_RMFI  = "<https://forgetmenot.example/scrutiny#graph/lords-rmfi>"
G_CTTE  = "<https://forgetmenot.example/scrutiny#graph/committees>"
G_MEM   = "<https://forgetmenot.example/scrutiny#graph/members>"
G_LINKS = "<https://forgetmenot.example/scrutiny#graph/cross-links>"

QUERIES = {
  "q1_departments_by_lords_division_count": f"""
SELECT ?deptName (COUNT(DISTINCT ?div) AS ?divisions) (COUNT(DISTINCT ?si) AS ?sis) WHERE {{
  GRAPH {G_SI}    {{ ?si scr:laidBy ?dept . ?dept scr:name ?deptName . }}
  GRAPH {G_LINKS} {{ ?si scr:scrutinisedInDivision ?div }}
}} GROUP BY ?deptName ORDER BY DESC(?divisions)
""",
  "q2_acts_generating_most_lords_visible_sis": f"""
SELECT ?actName (COUNT(DISTINCT ?si) AS ?sis) (COUNT(DISTINCT ?div) AS ?divisions) WHERE {{
  GRAPH {G_SI}    {{ ?si scr:madeUnder ?act . ?act scr:name ?actName . }}
  GRAPH {G_LINKS} {{ ?si scr:scrutinisedInDivision ?div }}
}} GROUP BY ?actName ORDER BY DESC(?divisions) LIMIT 30
""",
  "q3_peers_voting_most_on_sis": f"""
SELECT ?name ?party (COUNT(DISTINCT ?div) AS ?votes) WHERE {{
  GRAPH {G_DIV} {{ ?m ?p ?div . FILTER(?p = scr:votedContent || ?p = scr:votedNotContent) }}
  GRAPH {G_MEM} {{ ?m foaf:name ?name . OPTIONAL {{ ?m scr:party ?party }} }}
}} GROUP BY ?name ?party ORDER BY DESC(?votes) LIMIT 25
""",
  "q4_peers_on_scrutiny_committees_now": f"""
SELECT ?name ?party (GROUP_CONCAT(?cname; separator=" / ") AS ?committees) WHERE {{
  GRAPH {G_CTTE} {{ ?m scr:memberOfCommittee ?c . ?c scr:name ?cname . }}
  GRAPH {G_MEM}  {{ ?m foaf:name ?name . OPTIONAL {{ ?m scr:party ?party }} }}
}} GROUP BY ?name ?party ORDER BY ?name LIMIT 100
""",
  "q5_peers_with_ai_interest_who_voted_on_sis": f"""
SELECT DISTINCT ?name ?party (COUNT(DISTINCT ?div) AS ?siVotes) WHERE {{
  GRAPH {G_RMFI} {{ ?m scr:sectorTag "ai" }}
  GRAPH {G_DIV}  {{ ?m ?p ?div . FILTER(?p = scr:votedContent || ?p = scr:votedNotContent) }}
  GRAPH {G_MEM}  {{ ?m foaf:name ?name . OPTIONAL {{ ?m scr:party ?party }} }}
}} GROUP BY ?name ?party ORDER BY DESC(?siVotes) LIMIT 25
""",
  "q6_sis_with_division_summary": f"""
SELECT ?date ?divName ?siName ?deptName ?contentCount ?notContentCount ?procedure WHERE {{
  GRAPH {G_DIV} {{ ?div a scr:LordsDivision ;
                        scr:date ?date ;
                        scr:name ?divName ;
                        scr:contentCount ?contentCount ;
                        scr:notContentCount ?notContentCount . }}
  GRAPH {G_LINKS} {{ ?si scr:scrutinisedInDivision ?div }}
  GRAPH {G_SI} {{
    ?si scr:name ?siName ; scr:laidBy ?dept ; scr:procedure ?procedure .
    ?dept scr:name ?deptName .
  }}
}} ORDER BY DESC(?date) LIMIT 50
""",
  "q7_peers_by_sector_with_committee_seat": f"""
SELECT ?sector ?name ?party (GROUP_CONCAT(DISTINCT ?cname; separator=" / ") AS ?committees) WHERE {{
  GRAPH {G_RMFI} {{ ?m scr:sectorTag ?sector . }}
  GRAPH {G_CTTE} {{ ?m scr:memberOfCommittee ?c . ?c scr:name ?cname . }}
  GRAPH {G_MEM}  {{ ?m foaf:name ?name . OPTIONAL {{ ?m scr:party ?party }} }}
}} GROUP BY ?sector ?name ?party ORDER BY ?sector ?name
""",
  "q8_interest_alignment_per_sector": f"""
SELECT ?sector (COUNT(DISTINCT ?m) AS ?n) WHERE {{
  GRAPH {G_RMFI} {{ ?m scr:sectorTag ?sector }}
}} GROUP BY ?sector ORDER BY DESC(?n)
""",
  "q9_top_acts_by_lord_si_count": f"""
SELECT ?actName (COUNT(DISTINCT ?si) AS ?siCount) WHERE {{
  GRAPH {G_SI} {{ ?si scr:madeUnder ?act . ?act scr:name ?actName }}
}} GROUP BY ?actName ORDER BY DESC(?siCount) LIMIT 20
""",
}

print("Loading graph…", file=sys.stderr)
ds = Dataset()
ds.parse(_open("third_party/data/scrutiny-graph/scrutiny.nq.gz"), format="nquads")
print(f"Loaded {sum(1 for _ in ds.quads((None,None,None,None)))} quads in {len(list(ds.contexts()))} graphs", file=sys.stderr)

out = {}
for key, query in QUERIES.items():
    print(f"  q: {key}", file=sys.stderr)
    try:
        rows = list(ds.query(PREFIX + query))
        out[key] = [[(v.toPython() if hasattr(v,'toPython') else str(v)) if v is not None else None for v in row] for row in rows]
    except Exception as e:
        out[key] = {"error": str(e)}

with open("tmp/scrutiny-graph/query-results.json", "w") as f:
    json.dump(out, f, indent=2, default=str)

print(json.dumps({k: (len(v) if isinstance(v, list) else "ERR") for k, v in out.items()}, indent=2))
