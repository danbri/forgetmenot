# SPARQL (DDP) shapes and schemas vs the REST APIs

What's actually in the public SPARQL endpoint at
`api.parliament.uk/sparql` (the DDP graph, ~7.5M asserted statements,
no inference), and how that compares to what each dedicated REST API
exposes.

Empirically probed 2026-05-24 with the CLI; raw queries and responses
are under `tmp/sparql-shapes/`. For the broader story about *why*
there are three graphs and which is which, see
[`sparql-endpoints.md`](sparql-endpoints.md).

## Shape of the schema

194 classes live in the `https://id.parliament.uk/schema/` namespace.
They fall into three architectural patterns worth knowing about:

### 1. Mixin "*Thing" classes — a Person is many things at once

Most substantive entities inherit from several intersecting mixins
rather than from a single hierarchy. Asking for the types of a single
`Person` typically returns 16–19 classes, e.g.:

```
parl:Person          parl:Member            parl:PartyMember
parl:GovernmentPerson parl:OppositionPerson parl:MnisMember
parl:DodsPerson      parl:PimsPerson       parl:ImageSubject
parl:NamedThing      parl:ContactableThing parl:WebLinkedThing
parl:MnisThing       parl:DodsThing        parl:PimsThing
parl:WikidataThing   parl:ExternalThing    parl:SesThing
rdfs:Resource
```

The "thing" mixins (`NamedThing`, `ContactableThing`,
`WebLinkedThing`, `GeographicalThing`, `TemporalThing`,
`SubjectTaggedThing`, …) define *cross-cutting capabilities*: anything
named, anything addressable, anything geographically located, etc.
The substantive classes (`Person`, `Member`, `FormalBody`, `Treaty`,
…) tell you *what kind of thing* it is.

### 2. Source-system identity bridges — the `External*` family

Every external system that contributed identity gets its own mixin:
`MnisThing` (legacy MNIS), `PimsThing` (Parliament's old Personnel
Information Management System), `DodsThing` (Dods Parliamentary
Companion), `SesThing` (Search Engine for parliamentary publications),
`UkgapThing` (UK Government and Parliament list), `WikidataThing`
(external Wikidata equivalent), `OnsThing` (ONS geography).

This is *identity-bridge-as-type*. A Person who appears in all the
upstream systems gets typed as a member of each. The corresponding
identifier predicates (`parl:mnisId`, `parl:dodsId`, `parl:pimsId`,
`parl:sesId`, `parl:wikidataThingHasEquivalentWikidataResource`)
populate the join columns. This is what makes SPARQL the canonical
place to do cross-system joins — much more than any REST API.

### 3. Past-vs-current dual classes

For long-lived role types, the schema mints a sibling `Past*` class
so time-bound queries can avoid date arithmetic:
`Group`/`PastGroup`, `FormalBody`/`PastFormalBody`,
`FormalBodyMembership`/`PastFormalBodyMembership`,
`Incumbency`/`PastIncumbency`, `IncumbencyInterruption`/
`PastIncumbencyInterruption`, `ConstituencyGroup`/
`PastConstituencyGroup`, `PartyMembership`/`PastPartyMembership`,
`ParliamentPeriod`/`PastParliamentPeriod`,
`ParliamentaryIncumbency`/`PastParliamentaryIncumbency`.

So "current select committees" is `?c a parl:SelectCommittee`
without further filter; the historical ones live under
`PastFormalBody`. This denormalisation is unusual — most ontologies
would use a single class plus a `validTo` predicate — and it
trades simplicity-of-query for simplicity-of-modelling.

## Empirical class populations (2026-05-24)

Counts of asserted instances for the substantive classes. Anything
returning 0 is either a class that's *defined but unpopulated* (the
schema models it but the data isn't loaded) or *populated under a
sibling class* (the population is on a `Past*` variant or on a
specific subtype).

| Class | n | Notes |
|---|---:|---|
| **People & memberships** | | |
| Person | 5,460 | All MPs + peers, current + historical (back to ~MNIS coverage) |
| Member | 5,425 | Person ⊃ Member; the 35 "non-Member Persons" are e.g. lay committee members |
| Party | 395 | Including historical/extinct parties |
| ConstituencyGroup | 4,722 | A named-constituency-over-time; geography lives separately |
| Constituency | **0** | Defined but no instances at this level (use ConstituencyGroup or ConstituencyArea) |
| SeatIncumbency | 12,351 | One per "X represented Y from a to b" |
| PartyMembership | 9,846 | One per "X was a member of party Y from a to b" |
| FormalBodyMembership | 11,540 | Committee memberships |
| FormalBody | 399 | All committees and other formal bodies |
| ParliamentaryCommittee | 180 | Subset of FormalBody |
| SelectCommittee | 174 | |
| StatutoryCommittee | 4 | e.g. ISC |
| NonSelectCommittee | 6 | |
| InformallyConstitutedCommittee | 4 | |
| GeneralCommittee | 0 | Class defined, none asserted |
| GovernmentIncumbency | 3,931 | A minister's term in a post |
| OppositionIncumbency | 3,328 | Shadow-cabinet equivalents |
| GovernmentPosition | 869 | Distinct ministerial posts |
| GovernmentOrganisation | 54 | Departments + agencies in scope |
| ExOfficioMembership | 306 | Committee seats held by virtue of role |
| ContactPoint | 4,604 | |
| PostalAddress | 4,667 | |
| WebLink | 41,504 | Member-website/social/profile URLs |
| Image | 1,082 / MemberImage 1,035 | |
| **Procedure** | | |
| Procedure | 63 | The 63 named procedures (SI affirmative, treaty CRaG, etc.) |
| ProcedureStep | 4,602 | Atomic procedural steps |
| ProcedureRoute | 7,991 | Edges between steps |
| WorkPackage | 7,719 | A single instrument moving through its procedure |
| BusinessItem | 87,666 | Step-actualisations on a date in a House |
| Approval | 28,515 | Per-instrument approval events |
| Rejection | 83,865 | |
| Withdrawal | 0 | Class defined, none asserted |
| **Statutory instruments** | | |
| StatutoryInstrumentPaper | 6,932 | |
| MadeStatutoryInstrumentPaper | 4,781 | |
| ProposedNegativeStatutoryInstrumentPaper | 424 | |
| ProposedDraftRemedialOrderPaper | 11 | |
| PublishedDraftUnderEUWA | 20 | EU Withdrawal Act SIs |
| LaidThing | 7,710 | The thing laid before Parliament |
| Laying | 14,695 | The act of laying |
| LayingBody | 34 | The departments that lay |
| LayingPerson | 0 | Class defined, none asserted |
| **Treaties** | | |
| Treaty | 323 | Matches REST `/api/Treaty/Search?Take=1` totalResults exactly |
| TreatySeriesMembership | 0 | Use the specific subtypes instead |
| CountrySeriesMembership | (197) | Treaties by partner country |
| EuropeanUnionSeriesMembership | (14) | |
| MiscellaneousSeriesMembership | (110) | |
| InForceTreaty | 0 | Class defined, none asserted |
| **Questions & answers** | | |
| Question | 192,296 | |
| WrittenAnswer | 132,537 | |
| WrittenAnswerExpectation | 190,085 | |
| AnsweringBody | 58 | The Cabinet-Office-recognised list |
| AnsweringBodyAllocation | 165,132 | |
| CorrectingAnswer | 958 | Where a minister later corrected the record |
| OralAnswer / SubstantiveAnswer / HoldingAnswer / DelegatedAnswer / SinceCorrectedAnswer / RoundRobin | 0 | Classes defined, asserted population is via parent `Answer` |
| **Petitions** | | |
| EPetition | 101,254 | |
| ApprovedEPetition | 28,509 | |
| RejectedEPetition | 72,745 | |
| Moderation | 112,380 | |
| ThresholdAttainment | 103,068 | The 10k / 100k threshold-crossing events |
| LocatedSignatureCount | 80,247 | Geographic signature breakdowns |
| Debate | 328 | **Note: in DDP this means "epetition-triggered debate", not "general Hansard debate"** — 328 is the number of epetition debates, not the number of Commons sittings |
| RejectionCode | 8 | Moderation rejection reasons |
| Threshold | 3 | 10k / 100k / debate trigger |
| **Acts** | | |
| ActOfParliament | 17,612 | Historical Acts |
| PublicBillWork | 6 | Sparse; not the canonical "bills" view |
| **Geography** | | |
| Place | 1,579 / Country 199 / Territory 79 | |

## What's in SPARQL that's NOT in the REST APIs

Material that has no obvious dedicated REST equivalent, or that exists
only in SPARQL with the joins pre-made:

- **Cross-system identifier bridges per person.** `parl:mnisId`,
  `parl:pimsId`, `parl:dodsId`, `parl:sesId`, the three opaque
  `http://example.com/{uuid}` predicates (which look like internal
  MNIS source UUIDs that leaked into the published RDF — worth filing
  as a data-quality issue) and `rdfs:seeAlso → wikidata.org/entity/Q…`
  on 1,894 people. There is no REST endpoint that returns all of these
  in one record.
- **The Past/Current dual class** for time-bound queries — e.g.
  "currently sitting select committees" is a one-class query in
  SPARQL but requires date filtering in the REST APIs.
- **The procedural-route graph** — `ProcedureRoute` (7,991 edges)
  encodes the allowed transitions between `ProcedureStep`s. The REST
  APIs surface individual procedure steps but not the *graph* of
  legal transitions between them.
- **Multi-source person typing** — `DodsPerson` vs `PimsPerson` vs
  `MnisMember` tell you which upstream systems hold a record for this
  person. Useful when reconciling identity gaps.
- **Per-class subtype taxonomies** for statutory-instrument papers,
  answer types, committee types — finer-grained than what REST surfaces
  as enum values.

## What's in the REST APIs that's NOT in SPARQL

The major absences. For these, SPARQL is not an alternative to the
REST API — the data isn't on the surface at all:

| Topic | REST API | DDP coverage |
|---|---|---|
| **Bills** (passage, amendments, sponsors, stages) | `bills-api.parliament.uk` | `PublicBillWork` exists with 6 instances — effectively absent. Public Bills move through `WorkPackage`/`ProcedureStep`/`BusinessItem` but the typed "Bill" view is REST-only. |
| **Hansard contributions** (the actual speech text) | `hansard-api.parliament.uk` | `Debate` exists but means "ePetition debate". 328 instances total. The ~millions of Commons/Lords contributions are REST-only. |
| **Divisions** (Commons + Lords votes, per-member votes) | `commonsvotes-api.parliament.uk`, `lordsvotes-api.parliament.uk` | No `Division`, `Vote`, or `MemberVoteRecord` class. Voting is entirely REST-only. |
| **Elections, candidates, results** | psephology (House of Commons Library Postgres dump) | `Election`/`Candidacy`/`Candidate`/`ElectionType` classes are defined in the schema with **0** instances. Election data does not enter DDP. |
| **Early Day Motions** | (no dedicated REST; via `oral-questions-and-edms`) | Not in the DDP schema at all. |
| **Register of Members' Financial Interests** | `interests-api.parliament.uk` (Commons); `members-api/Members/{id}/RegisteredInterests` (Lords) | Not in the DDP schema at all. |
| **Erskine May** | scraped HTML at `erskinemay.parliament.uk` | Not in the DDP schema at all. |
| **Committee evidence / inquiries / publications** | `committees-api.parliament.uk` | The committee *typology* (FormalBody / SelectCommittee / …) is in SPARQL; the inquiries / evidence sessions / publications are REST-only. |
| **APPGs** | scraped HTML via `parl appg` (this repo) | Not in the DDP schema at all. |

## What's in BOTH — and which is better for which question

| Domain | REST | SPARQL | Pick SPARQL when |
|---|---|---|---|
| People | rich per-MP profiles; live activity feeds | rich career: every seat, every party, every government post, identifier bridges to Wikidata + MNIS + DODS + PIMS + SES | the question crosses people *and* a second axis (committee co-membership, government overlap, party-switches over a period) |
| Treaties | full text, doc links, current parliamentary stage | the entity (`Treaty`), its `Laying`, its `WorkPackage`, its country/EU/misc series | you want to enumerate treaties by partner country or scrutiny route, or join treaties to the laying minister |
| Statutory instruments | per-SI metadata, stages, stops | rich subtype taxonomy (Made / ProposedNegative / ProposedDraftRemedialOrder / PublishedDraftUnderEUWA), full `Approval` / `Rejection` event log | counting per-procedure outcomes; aggregating SI types per laying body per period |
| Written questions | per-question, per-answer, search | `Question` (192k), `WrittenAnswer` (132k), `WrittenAnswerExpectation` (190k), `CorrectingAnswer` (958) — answer-type lifecycle | finding ministers who issued correcting answers; cross-department answer-rate analysis |
| ePetitions | per-petition, signature counts, response | the full moderation lifecycle: `Moderation` (112k events), `ThresholdAttainment` (103k crossings), `LocatedSignatureCount` (80k geo-breakdowns) | analysing rejection reasons by code; signature-velocity per constituency |
| Procedure (the meta-layer) | enums in each API | first-class entity: 63 named `Procedure`s with 4,602 `ProcedureStep`s connected by 7,991 `ProcedureRoute`s | answering "what are the legal next steps from this stage", or modelling all of CRaG / affirmative / negative as one shape |
| Acts of Parliament | (no dedicated REST) | 17,612 historical Acts | anything Acts-related, basically |

## Joining strategy

The two surfaces share URIs where they overlap. A Treaty's URI in
the REST API is the same `https://id.parliament.uk/{shortId}` as
its SPARQL subject IRI — verified on a sample: REST
`/api/Treaty/Search` returns 323; SPARQL `?t a parl:Treaty`
returns 323; the IDs match.

For people, the join key is the MNIS integer:

```sparql
PREFIX parl: <https://id.parliament.uk/schema/>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
SELECT ?p ?name WHERE {
  ?p parl:mnisId "172"^^xsd:integer ;
     parl:name ?name .
}
```

That same `172` is the `id` returned by
`members-api.parliament.uk/api/Members/172`.

For bills / divisions / hansard / interests / elections / EDMs /
Erskine May / APPGs — there is nothing to join SPARQL-side. Use
the REST API for everything; SPARQL doesn't replace it.

## Practical takeaway

SPARQL (DDP) is best understood as **the integrated people-procedure-
treaty-SI-questions-petitions graph**, not as a SPARQL equivalent
of "everything the REST APIs expose". For the topics it covers,
it does richer joins than any single REST endpoint, with built-in
identifier bridges to external systems. For the topics it doesn't
cover — half the headline REST surfaces — the REST API is the only
authoritative source.

Rule of thumb: if a question needs to *combine* people-related and
procedural data (e.g. "which ministers laid the most SIs in 2024"),
start with SPARQL. If it's a single-subject query against one of
the missing topics (e.g. "show me the divisions on the Online Safety
Act"), use the REST API directly.

## Caveats

- Counts above are asserted-instance counts (DDP has inference
  off). With the closure switched on (DD graph, not on a public
  endpoint), some counts would rise.
- The `Question` predicate-probe used a windowed sub-select
  (`{ SELECT ?s WHERE { ?s a parl:Question } LIMIT 50 } ?s ?p ?o`)
  because the naïve `GROUP BY` query times out at the 500 mark on
  the 192k-instance class — recorded here for future probes.
- Three `http://example.com/{uuid}` predicates surfaced on `Person`
  (5,229 statements each) — these look like Parliament-internal
  MNIS source UUIDs that should not be in the published RDF.
  Worth filing upstream.
- Cloudflare interstitials encountered on `publications.parliament.uk`
  during the same week did NOT affect `api.parliament.uk/sparql`,
  which appears to have a more lenient bot policy.
