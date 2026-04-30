---
name: uk-parliament-sparql
description: Query the UK Parliament public SPARQL 1.1 endpoint at api.parliament.uk/sparql. The triple store holds the integrated parliament.uk graph (people, parties, governments, houses, constituencies, periods, incumbencies, divisions, contributions, formal-body memberships) under namespaces id.parliament.uk and similar. Use whenever a question needs to join data across more than one of the REST APIs — SPARQL is the only place where everything is linked by URI.
---

# UK Parliament SPARQL endpoint

Endpoint: `https://api.parliament.uk/sparql`

Method: `GET` or `POST` with `query=<urlencoded SPARQL>`.
Result formats via `Accept`:

| `Accept` | Format |
|---|---|
| `application/sparql-results+json` | JSON results (recommended) |
| `application/sparql-results+xml` | SRX |
| `text/csv` | CSV |
| `text/tab-separated-values` | TSV |
| `text/turtle` | for `CONSTRUCT` / `DESCRIBE` |
| `application/rdf+xml` | for `CONSTRUCT` / `DESCRIBE` |

A bare `GET` to the endpoint without a query returns 404. You must
include `?query=...` or POST.

## What it covers

The integrated Parliament data graph maintained by Parliamentary
Digital Service. It includes (non-exhaustive):

- **People** — Members of both Houses, current and historical.
- **Memberships** — house seats, party affiliations, government and
  opposition posts, formal body (committee) memberships.
- **Constituencies** — including geometry as boundary URIs.
- **Periods** — incumbencies, governments, sessions, Parliaments.
- **Houses, parties, government organisations** — with start/end dates.
- **Procedure-related** — divisions, contributions, debates with
  links to Hansard items.
- **Formal bodies** — committees and other formal bodies.

## Namespaces (typical)

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
PREFIX id:   <https://id.parliament.uk/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX owl:  <http://www.w3.org/2002/07/owl#>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX dcterms: <http://purl.org/dc/terms/>
```

Resource URIs look like `https://id.parliament.uk/<opaque-id>` where
the opaque ID is an 8-character alphanumeric short-id (e.g.
`TyNGhslR`). The same person/place/event has one URI.

## Worked example

```sh
# Current MPs and their parties
curl -sLG 'https://api.parliament.uk/sparql' \
  -H 'Accept: application/sparql-results+json' \
  --data-urlencode 'query=
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?person ?name ?party WHERE {
  ?seatIncumbency parl:houseSeatIncumbencyHasMember ?person ;
                  parl:incumbencyEndDate [] .
  FILTER NOT EXISTS { ?seatIncumbency parl:incumbencyEndDate ?end . FILTER(?end < NOW()) }
  ?person parl:personGivenName ?name .
  OPTIONAL { ?partyMembership parl:partyMembershipHasPartyMember ?person ;
                              parl:partyMembershipHasParty ?p .
             ?p parl:partyName ?party . }
} LIMIT 10'
```

## Joining to the REST APIs

Every REST API resource that has a corresponding SPARQL URI carries
either:

- A direct URI in the JSON (rarer), or
- A `mnisId` (the legacy MNIS integer that joins to
  `parl:hasMnisId`), or
- A name + birth-date + house tuple sufficient for a join.

For Members, the integer `id` returned by the Members API
(`/Members/{id}`) is the MNIS ID — you can join via
`?p parl:hasMnisId "172"^^xsd:integer .`

## Notes

- The endpoint is rate-limited; keep `LIMIT` small while exploring.
- For schema discovery start with:
  ```sparql
  SELECT DISTINCT ?type WHERE { ?s a ?type } LIMIT 100
  ```
- The query endpoint does **not** support SPARQL Update; it is
  read-only.
- See `reference.md` for example queries (current MPs, divisions in a
  date range, post-holders on a date, committee membership,
  constituency geometry).
- See also the parameterised query browser at
  [`parameterised-query`](../parameterised-query/SKILL.md) for
  pre-canned queries you do not have to write yourself.
