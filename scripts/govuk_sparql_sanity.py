#!/usr/bin/env python3
"""Sanity checks over the gov.uk org-chart factoid corpus.

Runs a battery of SPARQL queries against the local rdflib-endpoint
(127.0.0.1:8765) and prints a summary that the report can quote.
"""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request

ENDPOINT = "http://127.0.0.1:8765/"

PREFIXES = """
PREFIX govuk:   <https://forgetmenot.local/govuk#>
PREFIX schema:  <http://schema.org/>
PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>
"""


def q(query: str) -> list[dict]:
    body = urllib.parse.urlencode({"query": PREFIXES + query}).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body,
        headers={
            "Accept": "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["results"]["bindings"]


def val(b: dict, var: str) -> str:
    return b.get(var, {}).get("value", "")


def section(title: str) -> None:
    print(f"\n=== {title} ===")


# 1. Counts by type
section("Counts by class")
for row in q("""
SELECT ?type (COUNT(DISTINCT ?s) AS ?n) WHERE {
  GRAPH ?g { ?s a ?type }
} GROUP BY ?type ORDER BY DESC(?n)
"""):
    print(f"  {int(val(row,'n')):5d}  {val(row,'type')}")

# 2. Distinct subject counts per role/person/org
section("Distinct identifiers")
for row in q("""
SELECT
  (COUNT(DISTINCT ?o) AS ?orgs)
  (COUNT(DISTINCT ?p) AS ?people)
  (COUNT(DISTINCT ?r) AS ?roles)
WHERE {
  { GRAPH ?g { ?o a govuk:Organisation } } UNION
  { GRAPH ?g { ?p a schema:Person      } } UNION
  { GRAPH ?g { ?r a govuk:MinisterialRole } }
}
"""):
    print(f"  orgs={row['orgs']['value']}  people={row['people']['value']}  roles={row['roles']['value']}")

# 3. Roles with no current holder
section("Roles with NO current holder (any source)")
rows = q("""
SELECT ?role ?name WHERE {
  GRAPH ?g1 { ?role a govuk:MinisterialRole ; schema:name ?name }
  FILTER NOT EXISTS { GRAPH ?g2 { ?role govuk:roleHolder ?h } }
} ORDER BY ?name
""")
print(f"  {len(rows)} roles have no roleHolder asserted from any page")
for r in rows[:8]:
    print(f"    {val(r,'name')}  ({val(r,'role')})")

# 4. Multi-role holders
section("People holding more than 1 role")
rows = q("""
SELECT ?person ?name (COUNT(DISTINCT ?role) AS ?n) WHERE {
  GRAPH ?g { ?person govuk:holdsRole ?role ; schema:name ?name }
} GROUP BY ?person ?name HAVING (COUNT(DISTINCT ?role) > 1)
ORDER BY DESC(?n) ?name LIMIT 15
""")
for r in rows:
    print(f"  {int(val(r,'n')):2d}  {val(r,'name')}")

# 5. Cross-page corroboration: how many distinct pages assert each
# (person, holdsRole, role) triple? Higher = better corroboration.
section("Best-corroborated current-holder triples (top 10)")
for row in q("""
SELECT ?person ?role (COUNT(DISTINCT ?g) AS ?pages) WHERE {
  GRAPH ?g { ?person govuk:holdsRole ?role }
} GROUP BY ?person ?role ORDER BY DESC(?pages) LIMIT 10
"""):
    print(f"  {int(val(row,'pages')):2d}  {val(row,'person').rsplit('/',1)[-1]:30s} -> "
          f"{val(row,'role').rsplit('/',1)[-1]}")

# 6. Orgs by minister count
section("Top 15 organisations by ministerial headcount")
for row in q("""
SELECT ?org ?name (COUNT(DISTINCT ?p) AS ?n) WHERE {
  GRAPH ?g {
    ?org a govuk:Organisation ;
         schema:name ?name ;
         govuk:hasMinister ?p .
  }
} GROUP BY ?org ?name ORDER BY DESC(?n) LIMIT 15
"""):
    print(f"  {int(val(row,'n')):2d}  {val(row,'name')[:60]}")

# 7. Past PMs we have tenure data for
section("Past PM tenure coverage")
rows = q("""
SELECT (COUNT(DISTINCT ?pm) AS ?n) WHERE {
  GRAPH ?g {
    ?pm a govuk:PastPrimeMinister .
    ?t govuk:holder ?pm ; govuk:tenureStart ?s .
  }
}
""")
print(f"  past PMs with at least one tenure year: {val(rows[0],'n')}")
rows = q("""
SELECT (COUNT(DISTINCT ?pm) AS ?n) WHERE {
  GRAPH ?g { ?pm a govuk:PastPrimeMinister }
}
""")
print(f"  past PM entities total: {val(rows[0],'n')}")

# 8. Disagreements: a role page says holder A, the person's own page says they hold something else
section("Role pages vs person pages: any disagreement on the role's holder?")
rows = q("""
SELECT ?role ?holder_on_role_page ?holder_on_person_page WHERE {
  GRAPH ?gRole {
    ?role govuk:roleHolder ?holder_on_role_page .
    FILTER(STRSTARTS(STR(?gRole), "https://www.gov.uk/government/ministers/"))
  }
  GRAPH ?gPerson {
    ?holder_on_person_page govuk:holdsRole ?role .
    FILTER(STRSTARTS(STR(?gPerson), "https://www.gov.uk/government/people/"))
    FILTER(?holder_on_person_page != ?holder_on_role_page)
  }
} LIMIT 10
""")
if rows:
    for r in rows:
        print(f"  {val(r,'role').rsplit('/',1)[-1]}: role={val(r,'holder_on_role_page').rsplit('/',1)[-1]} "
              f"person={val(r,'holder_on_person_page').rsplit('/',1)[-1]}")
else:
    print("  none -- role pages and person pages agree")

# 9. Roles a person holds vs roles their org page lists for them
section("Org pages vs person pages: any mismatch?")
rows = q("""
SELECT ?person ?role_on_org_page WHERE {
  GRAPH ?gOrg {
    ?org govuk:hasMinister ?person .
    ?person govuk:holdsRole ?role_on_org_page .
    FILTER(STRSTARTS(STR(?gOrg), "https://www.gov.uk/government/organisations/"))
  }
  FILTER NOT EXISTS {
    GRAPH ?gPerson {
      ?person govuk:holdsRole ?role_on_org_page .
      FILTER(STRSTARTS(STR(?gPerson), "https://www.gov.uk/government/people/"))
    }
  }
} LIMIT 10
""")
if rows:
    print(f"  {len(rows)} org-page assertions not echoed on the person's own page")
    for r in rows[:5]:
        print(f"    {val(r,'person').rsplit('/',1)[-1]:30s} -> {val(r,'role_on_org_page').rsplit('/',1)[-1]}")
else:
    print("  none")

# 10. Responsibilities coverage
section("Responsibilities listed per role (distribution)")
rows = q("""
SELECT ?role (COUNT(?r) AS ?n) WHERE {
  GRAPH ?g { ?role a govuk:MinisterialRole ; govuk:responsibility ?r }
} GROUP BY ?role
""")
counts = [int(val(r,'n')) for r in rows]
if counts:
    print(f"  roles with at least one responsibility: {len(counts)}")
    print(f"  min/median/max bullets: {min(counts)} / {sorted(counts)[len(counts)//2]} / {max(counts)}")
