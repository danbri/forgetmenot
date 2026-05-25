# UK Parliament SPARQL — reference

Endpoint: `https://api.parliament.uk/sparql` (the DDP graph).

The endpoint does not publish a schema document. The ontology lives
implicitly in the data — this reference is the empirical map, probed
2026-05-24 with the CLI. Raw probe results are kept under
`tmp/sparql-shapes/` in the repo.

## Three schema patterns worth knowing

### 1. Cross-cutting `*Thing` mixins

The schema decomposes most things along several dimensions at once.
A `Person` is also a `NamedThing`, a `ContactableThing`, a
`WebLinkedThing`, an `ImageSubject`, an `ExternalThing` (because it
came from external systems), a `MnisThing`, a `DodsThing`, a
`PimsThing`, a `WikidataThing`, a `SesThing` … and depending on
role, also a `Member`, `PartyMember`, `GovernmentPerson`,
`OppositionPerson`, `MnisMember`, `DodsPerson`, `PimsPerson`.

A typical Person has 16–19 simultaneous types. To list them all for
one person:

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT (GROUP_CONCAT(DISTINCT ?t; separator=", ") AS ?types) WHERE {
  ?p parl:mnisId "172"^^<http://www.w3.org/2001/XMLSchema#integer> ;
     a ?t .
} GROUP BY ?p
```

### 2. Source-system identity bridges as types

Each external system that fed data in gets its own `*Thing` mixin and
matching identifier predicate. A `Person` who appears in five upstream
systems carries five identifier predicates and five mixin types.

| Mixin | Identifier predicate | What it bridges to |
|---|---|---|
| `MnisThing` | `parl:mnisId` (xsd:integer) | Members Name Information System (legacy) |
| `PimsThing` | `parl:pimsId`, `parl:personPimsId` | Personnel Information Management System |
| `DodsThing` | `parl:dodsId`, `parl:personDodsId` | Dods Parliamentary Companion |
| `SesThing` | `parl:sesId` | Search Engine for parliamentary publications |
| `UkgapThing` | (predicates per type) | UK Government and Parliament list |
| `WikidataThing` | `parl:wikidataThingHasEquivalentWikidataResource`, `rdfs:seeAlso` | wikidata.org QID |
| `OnsThing` | (predicates per type) | Office for National Statistics geography |

1,894 of the 5,460 People carry a Wikidata link — making SPARQL
the easiest place to bridge Parliament records into the broader
Wikidata graph.

### 3. Past/Current dual classes

For time-bound entities the schema has *two* classes — one for
currently-active members and one for historical ones — rather than a
single class with a `validTo` predicate. So "current select
committees" is a class query, not a date filter:

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?c ?name WHERE {
  ?c a parl:SelectCommittee ;        # 174 current
     parl:formalBodyName ?name .
}
# vs.
SELECT ?c WHERE { ?c a parl:PastFormalBody }   # historical
```

Pairs used in this way include:

`Group/PastGroup`, `FormalBody/PastFormalBody`,
`FormalBodyMembership/PastFormalBodyMembership`,
`Incumbency/PastIncumbency`,
`IncumbencyInterruption/PastIncumbencyInterruption`,
`ConstituencyGroup/PastConstituencyGroup`,
`PartyMembership/PastPartyMembership`,
`ParliamentPeriod/PastParliamentPeriod`,
`ParliamentaryIncumbency/PastParliamentaryIncumbency`.

## Class population reference

Instance counts as of 2026-05-24. Cells reading "0" are
*defined-but-unpopulated* in DDP — the class exists in the schema
but no triples have been loaded.

### People and memberships

| Class | n | Notes |
|---|---:|---|
| `Person` | 5,460 | All MPs + peers, current and historical |
| `Member` | 5,425 | Person ⊃ Member; the gap is e.g. lay committee members |
| `Party` | 395 | Including extinct/historical |
| `ConstituencyGroup` | 4,722 | A named constituency over a boundary period |
| `Constituency` | 0 | Defined but empty — use `ConstituencyGroup` |
| `SeatIncumbency` | 12,351 | "X represented Y from a to b" |
| `PartyMembership` | 9,846 | "X was in party Y from a to b" |
| `FormalBodyMembership` | 11,540 | Committee memberships |
| `FormalBody` | 399 | Committees and other formal bodies |
| `ParliamentaryCommittee` | 180 | Subset of FormalBody |
| `SelectCommittee` | 174 | |
| `StatutoryCommittee` | 4 | e.g. ISC |
| `NonSelectCommittee` | 6 | |
| `InformallyConstitutedCommittee` | 4 | |
| `GovernmentIncumbency` | 3,931 | A minister's term in a post |
| `OppositionIncumbency` | 3,328 | Shadow equivalents |
| `GovernmentPosition` | 869 | Distinct ministerial posts |
| `GovernmentOrganisation` | 54 | Departments + agencies in scope |
| `ExOfficioMembership` | 306 | Committee seats held by virtue of role |
| `ContactPoint` | 4,604 | |
| `PostalAddress` | 4,667 | |
| `WebLink` | 41,504 | Member-website/social/profile URLs |
| `Image` / `MemberImage` | 1,082 / 1,035 | |
| `ParliamentPeriod` | 57 | |

### Procedure meta-layer

| Class | n | Notes |
|---|---:|---|
| `Procedure` | 63 | Named procedures (SI affirmative, treaty CRaG, …) |
| `ProcedureStep` | 4,602 | Atomic procedural steps |
| `ProcedureRoute` | 7,991 | Edges between steps (the procedural state graph) |
| `WorkPackage` | 7,719 | A single instrument moving through its procedure |
| `BusinessItem` | 87,666 | Step-actualisations on a date in a House |
| `Approval` | 28,515 | |
| `Rejection` | 83,865 | |
| `Withdrawal` | 0 | Defined but empty |

### Statutory instruments

| Class | n |
|---|---:|
| `StatutoryInstrumentPaper` | 6,932 |
| `MadeStatutoryInstrumentPaper` | 4,781 |
| `ProposedNegativeStatutoryInstrumentPaper` | 424 |
| `ProposedDraftRemedialOrderPaper` | 11 |
| `PublishedDraftUnderEUWA` | 20 |
| `LaidThing` | 7,710 |
| `Laying` | 14,695 |
| `LayingBody` | 34 |

### Treaties

| Class | n | Notes |
|---|---:|---|
| `Treaty` | 323 | Matches REST `/Treaty/Search` totalResults exactly |
| `TreatySeriesMembership` | 0 | Defined but empty — use the typed subclasses |
| `CountrySeriesMembership` | 197 | |
| `EuropeanUnionSeriesMembership` | 14 | |
| `MiscellaneousSeriesMembership` | 110 | |
| `InForceTreaty` | 0 | Defined but empty |

### Questions and answers

| Class | n |
|---|---:|
| `Question` | 192,296 |
| `WrittenAnswer` | 132,537 |
| `WrittenAnswerExpectation` | 190,085 |
| `AnsweringBodyAllocation` | 165,132 |
| `CorrectingAnswer` | 958 |
| `AnsweringBody` | 58 |
| `OralAnswer` / `SubstantiveAnswer` / `HoldingAnswer` / `DelegatedAnswer` / `SinceCorrectedAnswer` / `RoundRobin` | 0 each — population is via the parent `Answer` class |

### ePetitions

| Class | n | Notes |
|---|---:|---|
| `EPetition` | 101,254 | |
| `ApprovedEPetition` | 28,509 | |
| `RejectedEPetition` | 72,745 | |
| `Moderation` | 112,380 | |
| `ThresholdAttainment` | 103,068 | 10k/100k crossings |
| `LocatedSignatureCount` | 80,247 | Geographic signature breakdowns |
| `Debate` | 328 | **In DDP this means "ePetition-triggered debate" only** — not Hansard debates |
| `RejectionCode` | 8 | Moderation rejection reasons |

### Acts and geography

| Class | n |
|---|---:|
| `ActOfParliament` | 17,612 |
| `PublicBillWork` | 6 (sparse) |
| `Place` | 1,579 |
| `Country` | 199 |
| `Territory` | 79 |

### Defined but not populated (REST-only topics)

These classes don't exist in the schema *or* exist with 0 instances.
For each one, the REST API is the authoritative source — no SPARQL
shortcut.

`Bill`, `BillStage`, `Vote`, `Division`, `MemberVoteRecord`,
`OutcomeOfDivision`, `EarlyDayMotion`, `EarlyDayMotionSignature`,
`DeclaredInterest`, `RegisterEntry`, `HansardContribution`,
`Contribution`, `PoliticalSpeech`, `ErskineMaySection`,
`EvidenceSession`, `Inquiry`, `CommitteeEvidence`, `Election`,
`Candidacy`, `Candidate`, `ElectionType`, `Concept` (SKOS), `Logo`,
`AlternateMembership`.

## Three RDF surfaces, plus REST — what's where

Parliament publishes UK Parliament data through three RDF surfaces
and a separate modern REST surface. They overlap unevenly:

| Surface | What it is | Coverage |
|---|---|---|
| **DDP SPARQL** (`api.parliament.uk/sparql`) | Modern integrated graph; ~7.5M asserted triples, inference off | The narrowest of the three. Strong on people, procedure, SIs, treaties, Q&A, petitions, Acts. Misses Bills, Hansard, divisions, elections, the Thesaurus. |
| **LDA** (`lda.data.parliament.uk`) | Legacy linked-data API, per-dataset URL access. *No federated SPARQL endpoint.* JSON-LD or Turtle per-resource | Broader catalogue: Bills, Hansard, divisions, elections, election results, the Thesaurus, briefing papers, research briefings, Lords Bill amendments. Often the only RDF source for these. |
| **MNIS XML platform** (`data.parliament.uk/membersdataplatform`) | Legacy XML/JSON, per-member or per-query | Members + the cross-system identifier bridge (`<Member Member_Id="172" Dods_Id="25790" Pims_Id="3572" Clerks_Id="1">`) directly as attributes. Same data DDP exposes as `parl:mnisId`/`parl:pimsId`/`parl:dodsId` — not unique to DDP. |
| **Modern REST APIs** (`*-api.parliament.uk`) | One service per topic: members, bills, hansard, divisions, treaties, SIs, committees, petitions, written-questions, etc. | The fullest coverage of the *content* of any one topic; just no cross-domain join key beyond member id. |

The asymmetry between DDP and REST is narrower than a glance at DDP's
class list suggests. Most topics absent from DDP are still RDF-available
via LDA. The truly RDF-absent set is small:

| Topic | DDP | LDA | Modern REST | MNIS |
|---|:---:|:---:|:---:|:---:|
| Bills | — | ✓ (`/bills`) | ✓ | — |
| Hansard contributions | — | ✓ (`/hansardcommons*`, `/hansardlords*`) | ✓ | — |
| Commons divisions | — | ✓ (`/commonsdivisions`, sparse) | ✓ | — |
| Lords divisions | — | ✓ (`/lordsdivisions`) | ✓ | — |
| Elections / results | — | ✓ (`/elections`, `/electionresults`) | psephology Postgres | — |
| Parliament Thesaurus (SKOS) | — | ✓ (`/terms` with `broader` / `exactMatch`) | — | — |
| Briefing / research papers | — | ✓ | — | — |
| Lords Bill amendments | — | ✓ | — | — |
| Members + careers + identifier bridges | ✓ | ✓ (`/members`) | ✓ (`members-api`) | ✓ (raw IDs) |
| Treaties | ✓ (323) | — | ✓ (323, same IRIs) | — |
| Statutory instruments | ✓ (6,932) | — | ✓ | — |
| Q&A | ✓ (192k Q / 132k A) | ✓ (`/parliamentaryquestionsanswered`) | ✓ | — |
| ePetitions | ✓ (101k) | — | ✓ | — |
| Acts of Parliament | ✓ (17,612) | — | — | — |
| Committee typology | ✓ (180/174/...) | — | ✓ | — |
| Committee evidence / inquiries | — | — | ✓ | — |
| Register of Members' Financial Interests | — | — | ✓ | — |
| Early Day Motions | — | — | ✓ | — |
| Erskine May text | — | — | scraped HTML | — |
| APPGs | — | — | scraped HTML | — |

**Genuinely RDF-absent (no SPARQL/LDA surface anywhere):** RMFI,
EDMs, Erskine May, APPGs, and committee evidence / inquiries.
Everything else is reachable as RDF — sometimes only via LDA's
per-URL fetch.

### Where SPARQL (DDP) is the right tool

- Questions that need **cross-domain joins** between any two of:
  people, procedure, SIs, treaties, Q&A, petitions, Acts. SPARQL
  pre-joins all of these by URI.
- **Wikidata bridge** queries — `parl:wikidataThingHasEquivalentWikidataResource`
  exists on 1,894 People in DDP. Not in MNIS, not in the Members API.
- **Procedure-route graph** queries — 7,991 typed `ProcedureRoute` edges
  between `ProcedureStep`s. REST exposes individual stages, not the graph
  of legal transitions.
- Anything that benefits from the **multi-typing schema** (a `Person`
  is also `MnisMember + DodsPerson + PimsPerson + ContactableThing +
  WikidataThing + …`). This is the SPARQL surface's signature.

### Where LDA is the right tool instead of DDP

- Bills, Hansard, divisions, election results, the SKOS Thesaurus,
  briefing/research papers, Lords Bill amendments. None of these are
  in DDP. They are in LDA — though access is per-URL, not federated
  SPARQL.
- Parliament Thesaurus (SKOS) — `lda.data.parliament.uk/terms` carries
  the concept scheme that DDP's `Concept` class doesn't populate.

### Where the modern REST APIs are the only authoritative source

- RMFI, EDMs, Erskine May, APPGs, committee evidence / inquiries.
- Also wherever you want full per-record detail (Hansard contribution
  text, division per-member votes, RMFI gift descriptions) — LDA's
  modelling is sparse on the content even where it exists.

Rule of thumb: questions that *combine* people + procedure data
(e.g. "which ministers laid the most SIs in 2024") — start in SPARQL.
Anything DDP doesn't model — try LDA before falling back to the
modern REST surface, because LDA's RDF is sometimes the easiest way
to ask cross-cutting questions on Bills, Hansard, divisions or
elections.

## Discovery queries

### Enumerate classes

```sparql
SELECT DISTINCT ?cls WHERE { ?s a ?cls } LIMIT 200
```

(Counting all classes in one query — `SELECT ?cls (COUNT(?s) AS ?n) … GROUP BY ?cls` — times out. Do counts one class at a time.)

### Count instances of one class

```sparql
SELECT (COUNT(?s) AS ?n) WHERE {
  ?s a <https://id.parliament.uk/schema/Treaty> .
}
```

### Predicates used on a class — windowed pattern for big classes

The naïve `GROUP BY` query against `Question` (192k instances) times
out at the GraphDB 30s mark. Sample-then-distinct:

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT DISTINCT ?p WHERE {
  { SELECT ?s WHERE { ?s a parl:Question } LIMIT 50 }
  ?s ?p ?o .
}
```

For mid-sized classes (`Person` 5,460, `Treaty` 323) the full grouped
query works fine:

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT DISTINCT ?p (COUNT(?s) AS ?n) WHERE {
  ?s a parl:Person ; ?p ?o .
} GROUP BY ?p ORDER BY DESC(?n)
```

### rdfs:Class and owl:Class with labels

```sparql
SELECT DISTINCT ?cls ?label WHERE {
  { ?cls a rdfs:Class } UNION { ?cls a owl:Class }
  OPTIONAL { ?cls rdfs:label ?label }
} ORDER BY ?cls
```

### Class hierarchy

```sparql
SELECT ?sub ?super WHERE { ?sub rdfs:subClassOf ?super . } LIMIT 1000
```

The closure includes reflexive (`X rdfs:subClassOf X`) and
`rdfs:Resource` edges — those are SPARQL-spec trivial entailments,
not Parliament-modelled relationships.

## Common queries — verified against the schema

### Current MPs

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?person ?givenName ?familyName WHERE {
  ?incumbency a parl:SeatIncumbency ;
              parl:seatIncumbencyHasMember ?person .
  FILTER NOT EXISTS { ?incumbency parl:incumbencyEndDate ?e . }
  ?person parl:personGivenName ?givenName ;
          parl:personFamilyName ?familyName .
}
```

The Past/Current pattern means: a SeatIncumbency with no end date is
current. (Alternatively, type-filter on `parl:ParliamentaryIncumbency`
vs `parl:PastParliamentaryIncumbency`.)

### Current MPs with constituencies

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?member ?givenName ?familyName ?constituency WHERE {
  ?incumbency a parl:SeatIncumbency ;
              parl:seatIncumbencyHasMember ?member ;
              parl:seatIncumbencyHasHouseSeat ?seat .
  FILTER NOT EXISTS { ?incumbency parl:incumbencyEndDate ?e . }
  ?seat parl:houseSeatHasConstituencyGroup ?cg .
  ?cg parl:constituencyGroupName ?constituency .
  ?member parl:personGivenName ?givenName ;
          parl:personFamilyName ?familyName .
}
```

### Government post-holders on a specific date

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
SELECT ?postName ?holderName WHERE {
  ?incumbency a parl:GovernmentIncumbency ;
              parl:governmentIncumbencyHasGovernmentPosition ?post ;
              parl:governmentIncumbencyHasGovernmentPerson ?holder ;
              parl:incumbencyStartDate ?start .
  OPTIONAL { ?incumbency parl:incumbencyEndDate ?end . }
  FILTER (?start <= "2024-01-01"^^xsd:date &&
          (!BOUND(?end) || ?end > "2024-01-01"^^xsd:date))
  ?post parl:governmentPositionName ?postName .
  ?holder parl:personGivenName ?gname ; parl:personFamilyName ?fname .
  BIND(CONCAT(?gname, " ", ?fname) AS ?holderName)
}
```

(There is no `parl:postIncumbencyHasPost` predicate — older docs may
reference one; ignore. The actual predicates are
`parl:governmentIncumbencyHas*`.)

### Treaties laid by a department

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?t ?name ?dept WHERE {
  ?t a parl:Treaty ;
     parl:treatyName ?name ;
     parl:treatyHasLeadGovernmentOrganisation ?org .
  ?org parl:governmentOrganisationName ?dept .
} LIMIT 20
```

### Statutory instruments approved by procedure type

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
SELECT ?procName (COUNT(?approval) AS ?n) WHERE {
  ?wp a parl:WorkPackage ;
      parl:workPackageHasProcedure ?proc ;
      parl:workPackageHasWorkPackagedThing ?si .
  ?si a parl:StatutoryInstrumentPaper .
  ?bi parl:procedureStepHasBusinessItem ?step ;
      parl:businessItemHasWorkPackageInstance ?wp .
  ?approval a parl:Approval .   # if linked via BI
  ?proc parl:procedureName ?procName .
} GROUP BY ?procName ORDER BY DESC(?n) LIMIT 20
```

(The procedural-step graph is verbose; the parameterised-query
browser has pre-canned queries for the common shapes.)

### Committee membership for a person

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
SELECT ?body ?bodyName ?start ?end WHERE {
  ?membership a parl:FormalBodyMembership ;
              parl:formalBodyMembershipHasFormalBody ?body ;
              parl:formalBodyMembershipHasPerson ?p ;
              parl:formalBodyMembershipStartDate ?start .
  OPTIONAL { ?membership parl:formalBodyMembershipEndDate ?end . }
  ?body parl:formalBodyName ?bodyName .
  ?p parl:mnisId "172"^^xsd:integer .   # Diane Abbott
}
```

### Person + every external identifier (the identity bridge)

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
SELECT ?p ?name ?mnis ?pims ?dods ?ses ?wd WHERE {
  ?p a parl:Person ; parl:name ?name ; parl:mnisId ?mnis .
  OPTIONAL { ?p parl:personPimsId ?pims . }
  OPTIONAL { ?p parl:personDodsId ?dods . }
  OPTIONAL { ?p parl:sesId ?ses . }
  OPTIONAL { ?p parl:wikidataThingHasEquivalentWikidataResource ?wd . }
} LIMIT 20
```

This is the SPARQL endpoint's signature trick: one query returns the
join keys to five other systems.

## Notes

- Date-typed literals are `xsd:date`, not `xsd:dateTime`.
- The store occasionally has multiple URIs for the same person under
  different lifecycle representations; the **`parl:mnisId` join key
  is stable** across those.
- For `CONSTRUCT` / `DESCRIBE`, set `Accept: text/turtle` (or
  `application/rdf+xml`).
- `SKOS` (`Concept`, `ConceptScheme`) is **not on this endpoint**.
  The Parliament Thesaurus is on the legacy LDA endpoint —
  `linked-data-api` skill.
