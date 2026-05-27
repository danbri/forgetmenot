#!/usr/bin/env python3
import json, sys
from rdflib import Dataset

PREFIX = """PREFIX acc:  <https://forgetmenot.example/accountability#>
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
"""
G_QA      = "<https://forgetmenot.example/accountability#graph/questions-answers>"
G_BODIES  = "<https://forgetmenot.example/accountability#graph/answering-bodies>"
G_ALB     = "<https://forgetmenot.example/accountability#graph/arms-length-bodies>"
G_MEM     = "<https://forgetmenot.example/accountability#graph/members>"
G_LINKS   = "<https://forgetmenot.example/accountability#graph/cross-links>"

Q = {
  "q1_alb_most_indirectly_accountable": f"""
SELECT ?albName (COUNT(DISTINCT ?q) AS ?mentions) (COUNT(DISTINCT ?body) AS ?delegatingBodies) WHERE {{
  GRAPH {G_LINKS} {{ ?q acc:answerMentionsBody ?alb . OPTIONAL {{ ?body acc:delegatesTo ?alb }} }}
  GRAPH {G_ALB}   {{ ?alb acc:name ?albName }}
}} GROUP BY ?albName ORDER BY DESC(?mentions) LIMIT 20
""",
  "q2_dept_delegation_matrix": f"""
SELECT ?bodyName ?albName (COUNT(DISTINCT ?q) AS ?n) WHERE {{
  GRAPH {G_QA}    {{ ?q acc:answeringBody ?body }}
  GRAPH {G_LINKS} {{ ?q acc:answerMentionsBody ?alb }}
  GRAPH {G_BODIES} {{ ?body acc:name ?bodyName }}
  GRAPH {G_ALB}   {{ ?alb acc:name ?albName }}
}} GROUP BY ?bodyName ?albName ORDER BY DESC(?n) LIMIT 30
""",
  "q3_peers_pursuing_same_body": f"""
SELECT ?mname ?albName (COUNT(DISTINCT ?q) AS ?n) WHERE {{
  GRAPH {G_LINKS} {{ ?m acc:askedQuestion ?q . ?q acc:answerMentionsBody ?alb }}
  GRAPH {G_ALB}   {{ ?alb acc:name ?albName }}
  GRAPH {G_MEM}   {{ ?m foaf:name ?mname }}
}} GROUP BY ?mname ?albName  ORDER BY DESC(?n) LIMIT 30
""",
  "q4_peers_pursuing_same_topic": f"""
SELECT ?mname ?topic (COUNT(DISTINCT ?q) AS ?n) WHERE {{
  GRAPH {G_LINKS} {{ ?m acc:askedQuestion ?q }}
  GRAPH {G_QA}    {{ ?q acc:topic ?topic }}
  GRAPH {G_MEM}   {{ ?m foaf:name ?mname }}
}} GROUP BY ?mname ?topic  ORDER BY DESC(?n) LIMIT 30
""",
  "q5_short_answers_with_delegation": f"""
SELECT ?bodyName ?albName ?q ?heading ?ansLen WHERE {{
  GRAPH {G_QA}    {{ ?q acc:answerLength ?ansLen ; acc:answeringBody ?body ; acc:heading ?heading . FILTER(?ansLen < 200) }}
  GRAPH {G_LINKS} {{ ?q acc:answerMentionsBody ?alb }}
  GRAPH {G_BODIES} {{ ?body acc:name ?bodyName }}
  GRAPH {G_ALB}   {{ ?alb acc:name ?albName }}
}} LIMIT 30
""",
  "q6_followup_chains": f"""
SELECT ?mname (COUNT(DISTINCT ?refUin) AS ?followups) WHERE {{
  GRAPH {G_LINKS} {{ ?m acc:askedQuestion ?q . ?q acc:refersToQuestion ?refUin }}
  GRAPH {G_MEM}   {{ ?m foaf:name ?mname }}
}} GROUP BY ?mname  ORDER BY DESC(?followups) LIMIT 20
""",
  "q7_top_askers": f"""
SELECT ?mname ?party (COUNT(DISTINCT ?q) AS ?n) WHERE {{
  GRAPH {G_LINKS} {{ ?m acc:askedQuestion ?q }}
  GRAPH {G_MEM}   {{ ?m foaf:name ?mname . OPTIONAL {{ ?m acc:party ?party }} }}
}} GROUP BY ?mname ?party ORDER BY DESC(?n) LIMIT 25
""",
}

ds = Dataset()
ds.parse("third_party/data/accountability-graph/accountability.nq", format="nquads")
print(f"Loaded {sum(1 for _ in ds.quads((None,None,None,None)))} quads", file=sys.stderr)

out = {}
for k, q in Q.items():
    print(f"  q: {k}", file=sys.stderr)
    try:
        rows = list(ds.query(PREFIX + q))
        out[k] = [[(v.toPython() if hasattr(v,'toPython') else str(v)) if v is not None else None for v in row] for row in rows]
    except Exception as e:
        out[k] = {"error": str(e)}
with open("tmp/accountability-graph/query-results.json", "w") as f:
    json.dump(out, f, indent=2, default=str)
print(json.dumps({k: (len(v) if isinstance(v, list) else "ERR") for k, v in out.items()}, indent=2))
