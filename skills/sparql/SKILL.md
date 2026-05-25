---
name: sparql
description: Query the UK Parliament public SPARQL 1.1 endpoint at api.parliament.uk/sparql. Integrated graph (DDP) covering people, parties, governments, houses, constituencies, parliamentary periods, incumbencies, formal-body memberships, the procedural meta-layer (procedures / steps / routes / work packages), treaties, statutory instruments, written questions and answers, ePetitions, and historical Acts. Use whenever a question joins across more than one of those topics — SPARQL is the only place where everything is linked by URI. Not in DDP: Bills, Hansard contributions, Divisions / votes, Elections / candidates / results, Early Day Motions, the Register of Members' Financial Interests, Erskine May, committee evidence / inquiries — those require their dedicated REST APIs.
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated)
metadata:
  provenance:
    tier: 1
    operator: UK Parliament
    service: api.parliament.uk/sparql
    citation-short: "via api.parliament.uk/sparql (DDP store)"
    citation-formal: "UK Parliament SPARQL endpoint (DDP store), retrieved {date}"
    confidence: authoritative
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

## What it covers (and what it doesn't)

The endpoint fronts the **DDP graph** — ~7.5M asserted statements,
**inference off**, ~194 classes in the `parl:` schema. Empirically
probed instance populations 2026-05-24:

### Rich coverage (the headline SPARQL surface)

| Domain | Key classes (instance counts) |
|---|---|
| **People & memberships** | `Person` (5,460), `Member` (5,425), `Party` (395), `ConstituencyGroup` (4,722), `SeatIncumbency` (12,351), `PartyMembership` (9,846), `FormalBodyMembership` (11,540), `FormalBody` (399), `GovernmentIncumbency` (3,931), `OppositionIncumbency` (3,328), `GovernmentOrganisation` (54), `ContactPoint` (4,604), `WebLink` (41,504) |
| **Procedure meta-layer** | `Procedure` (63), `ProcedureStep` (4,602), `ProcedureRoute` (7,991), `WorkPackage` (7,719), `BusinessItem` (87,666), `Approval` (28,515), `Rejection` (83,865) |
| **Statutory instruments** | `StatutoryInstrumentPaper` (6,932), `MadeStatutoryInstrumentPaper` (4,781), `ProposedNegativeStatutoryInstrumentPaper` (424), `Laying` (14,695), `LaidThing` (7,710), `LayingBody` (34) |
| **Treaties** | `Treaty` (323; matches REST `/Treaty/Search` totalResults exactly — same IRIs) |
| **Questions & answers** | `Question` (192,296), `WrittenAnswer` (132,537), `WrittenAnswerExpectation` (190,085), `AnsweringBody` (58), `AnsweringBodyAllocation` (165,132), `CorrectingAnswer` (958) |
| **ePetitions** | `EPetition` (101,254 — 28k approved, 73k rejected), `Moderation` (112,380), `ThresholdAttainment` (103,068), `LocatedSignatureCount` (80,247) |
| **Acts of Parliament** | `ActOfParliament` (17,612 historical) |

### Absent from DDP (REST-only)

Defined-but-empty classes or topics with no schema presence at all:

| Topic | Why not here | Use instead |
|---|---|---|
| **Bills** | `PublicBillWork` has 6 instances; no `Bill`/`BillStage` typed view | `bills` skill (REST) |
| **Hansard contributions** | `Debate` exists, but in DDP it means *ePetition-triggered debate only* (328 instances), not general Commons/Lords proceedings | `hansard` skill |
| **Divisions / votes** | No `Division`, `Vote`, `MemberVoteRecord` class | `commons-votes` / `lords-votes` skills |
| **Elections / candidates / results** | Classes defined, **0 instances** — election data does not load into DDP | `psephology` skill (local Postgres) |
| **Register of Members' Financial Interests** | Not modelled in DDP | `interests` skill |
| **Early Day Motions** | Not in the schema | `oral-questions-and-edms` skill |
| **Erskine May** | Not in the schema | `erskine-may` skill |
| **Committee evidence / inquiries / publications** | Committee *typology* is in SPARQL; evidence and inquiries are REST | `committees` skill |
| **APPGs** | Not in the schema | `appg` skill (scraped) |

The reference doc has a deeper comparison and the empirical probe
queries — see [`reference.md`](reference.md).

## Three schema patterns worth knowing

The parl: schema is unusual in three ways. Skimming
[`reference.md`](reference.md#three-schema-patterns) before writing
queries will save you hours:

1. **Mixin `*Thing` classes** — entities multi-type. A typical
   `Person` carries 16–19 simultaneous types (`Person + Member +
   PartyMember + GovernmentPerson + MnisMember + DodsPerson + NamedThing
   + ContactableThing + WikidataThing + …`).
2. **Source-system identity bridges as types** — `MnisThing`,
   `PimsThing`, `DodsThing`, `SesThing`, `WikidataThing`. Each is
   both a class membership and a join key to the system named in the
   prefix. This is what makes SPARQL the right place for cross-system
   joins.
3. **Past/Current dual classes** — `FormalBody` vs `PastFormalBody`,
   `Incumbency` vs `PastIncumbency`, etc. "Current" is a class, not a
   date filter.

## Namespaces

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
`TyNGhslR`). The same person/place/event has one URI across DDP, and
the same URI is used by the parameterised-query browser and (where
they overlap) by some REST APIs — e.g. `treaties-api.parliament.uk`
returns the same `https://id.parliament.uk/{shortId}` IRI as the
SPARQL store does for `?t a parl:Treaty`.

## Worked example

```sh
# Current MPs and their parties
curl -sLG 'https://api.parliament.uk/sparql' \
  -H 'Accept: application/sparql-results+json' \
  --data-urlencode 'query=
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?person ?name ?party WHERE {
  ?seatIncumbency parl:seatIncumbencyHasMember ?person .
  FILTER NOT EXISTS { ?seatIncumbency parl:incumbencyEndDate ?end . }
  ?person parl:personGivenName ?name .
  OPTIONAL { ?partyMembership parl:partyMembershipHasPartyMember ?person ;
                              parl:partyMembershipHasParty ?p .
             ?p parl:partyName ?party . }
} LIMIT 10'
```

## Joining to the REST APIs

For people, the join key is the MNIS integer surfaced as
`parl:mnisId`. The same integer is the Members API's
`/Members/{id}/...` path parameter:

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
SELECT ?p ?name WHERE {
  ?p parl:mnisId "172"^^xsd:integer ;
     parl:name ?name .
}
```

For treaties / SIs / petitions / acts, the join is the URI directly:
`https://id.parliament.uk/{shortId}` appears in both SPARQL subjects
and the matching REST resource JSON.

For everything else (bills, divisions, hansard, RMFI, elections,
EDMs, Erskine May, APPGs) — there is **nothing to join** SPARQL-side
because those topics aren't in DDP. Use the dedicated REST skill.

## Related skills

- **[`parameterised-query`](../parameterised-query/SKILL.md)** —
  124 named templates that wrap common SPARQL questions and return
  JSON without you writing the query. *Same DDP store underneath.*
  Coverage is therefore identical to this skill: the templates cover
  the same topics SPARQL covers, and equally don't cover what SPARQL
  doesn't. Use `parameterised-query` when there is a named template
  that fits the question; drop down to this skill for arbitrary joins,
  schema discovery, or topics outside the template set.
- **[`odata`](../odata/SKILL.md)** — third public face of the same
  DDP store; same coverage, different query language (OData v4).
- See [`docs/sparql-endpoints.md`](../../docs/sparql-endpoints.md) for
  the DDP-vs-DD-vs-internal story: DDP is on this endpoint, DD's
  inferred closure is not.

## Notes

- Endpoint is **read-only** (no SPARQL Update) and rate-limited.
- Big `GROUP BY` queries time out (read timeout from the back-end
  GraphDB at ~30s). For class-sized aggregates over `Question`
  (192k instances), use a windowed sub-select pattern — see
  [`reference.md`](reference.md).
- `Constituency` is defined but unpopulated (0 instances). Use
  `ConstituencyGroup` (4,722) or `ConstituencyArea`.
- `Concept` is defined but unpopulated; SKOS schemes / the Thesaurus
  are **not on this endpoint**. The Parliament Thesaurus lives on the
  legacy Linked Data API (`linked-data-api` skill) instead.
- Three opaque `http://example.com/{uuid}` predicates appear on
  every `Person` (5,229 statements each). They look like internal
  MNIS source UUIDs that leaked into the published RDF — treat as
  data-quality noise.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs sparql --help
```

Or after `npm link` (one-time install):

```sh
parl sparql --help
```

Wraps the public SPARQL endpoint. Note this fronts the DDP graph (~7.5M statements, no inference); the DD graph is not on this surface — see docs/sparql-endpoints.md.

### Examples

```sh
parl sparql query 'SELECT * WHERE { ?s ?p ?o } LIMIT 5'
```
Sanity-check probe.

```sh
parl sparql classes --limit 30
```
Top instance classes by frequency.

```sh
parl sparql rdfs-classes
```
rdfs:Class / owl:Class with labels.

```sh
parl sparql describe https://id.parliament.uk/TyNGhslR --format turtle
```
DESCRIBE a resource.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/sparql.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via api.parliament.uk/sparql (DDP store))"** — once per paragraph in
  user-facing answers.
- On request, give the URL `--raw` printed.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
