# DDP — contents & history (working notes)

Working notes on **what the `api.parliament.uk/sparql` (DDP) store actually
contains and how it came to be** — a starting point, not finished. Pairs with
[`triple-stores.md`](triple-stores.md) (the three-stores lore).

## What DDP is, in one line
~**7.5M triples** on **GraphDB**, queried **asserted (no inference)**, in the
`id.parliament.uk/schema` vocabulary, surfaced three ways: **SPARQL**
(`/sparql`), **OData** (`/odata`, 183 entity sets), and **FixedQuery**
(`/query`, parameterised SPARQL). Updated ≥daily; the original team has largely
moved on.

## Three generations (the lineage)
DDP is the third layer of a ~20-year evolution; each layer still partly runs:

1. **MNIS** — Members' Names Information Service / Members Data Platform
   (`data.parliament.uk/membersdataplatform`). The members source, pre-linked-data
   (XML). Repo: `ukparliament/mnis-prodder`. Skill: `members-data-platform`.
2. **data.parliament.uk "Open Data" portal** — ~**19 datasets** served by the
   **Linked Data API (Elda)** at `lda.data.parliament.uk`: Members, Commons/Lords
   Divisions, Commons/Lords Written Questions, Commons Oral Questions, Briefing
   Papers, Research Briefings, **Thesaurus**, Elections, Election Results, Lords
   Bill Amendments, Hansard Commons/Lords Proceedings & Documents, Publication
   Logs, AV Live Logging. **Dataset-oriented.** Skills: `data-parliament-uk-datasets`,
   `linked-data-api`. (This is where our `parliament-thesaurus` crawl pulls from.)
3. **The modern DDP graph** (`id.parliament.uk`) — the **integrated ontology**
   store. The 183 OData entity types, the FixedQuery/SPARQL surface. Built from
   **2016** onward by the data team. The modern **REST APIs** (members-api,
   bills-api, committees-api, …) are the current production surface over/beside it.

## The data model (content structure)
**`ukparliament/ontologies`** — ~**40 ontology modules**, first commit
**2016-10-05** ("First cut of the parliament common models", *Silver Oliver*),
authors *Silver Oliver, Michael Smethurst, Robert Brook, Anya Somerville, Ben
Woodhams, Chris Alcock, Ned Morrell, Jayne Bosworth* (BBC-linked-data heritage).
OPL-licensed. Six super-domains:

- **People & membership** — person, peerage, lord-bishop, house-membership,
  formal-body(+affiliation), parliamentary-bloc, contact-point
- **Government & bodies** — government-organisation, organisation-accountable-to-parliament, agency
- **Elections & geography** — election, geographic-area(+overlap), place
- **Legislation & procedure** — **bill**, delegated-legislation, delegation,
  procedure(+step-annotation), laying, making-available, order-to-print,
  depositing, presentation
- **Papers & proceedings** — paper(+type), contribution, oral-contribution,
  proceeding, question-and-answer, petition
- **Records & meta** — record(+review), citation, related-item, publisher,
  oasis, concept

⚠ A **`bill-ontology` exists** even though the *live* DDP graph has **0 bill
instances** — the model covers bills; the data lives in DD / the Bills REST API.
**Model ⊋ data** is a recurring theme.

## The graph patterns / "shapes" (how DDP is queried)
**`ukparliament/Query`** — the **FixedQuery** service (C#, last touched 2022-12),
`Parliament.Data.Api.FixedQuery/Sparql/` holds **227 `.sparql` CONSTRUCT
templates** = the operational graph patterns over DDP (124 are exposed live at
`/query`). **No SHACL/ShEx in that repo** — so either the formal shapes live in
another repo, or these CONSTRUCTs *are* Parliament's de-facto shapes. Predecessor:
`ukparliament/members-query-application` (Ruby, 2016).

**Center of gravity — by graph pattern (n=227):**

| domain | patterns | share |
|---|---|---|
| people / membership | 108 | 48% |
| (other / misc, incl. treaty) | 41 | 18% |
| legislation / procedure | 32 | 14% |
| constituency / election | 20 | 9% |
| thesaurus / meta | 9 | 4% |
| government / bodies | 9 | 4% |
| papers / proceedings | 8 | 4% |

So DDP is, in practice, a **constitutional/membership graph** first; legislation
and procedure are modelled and queried but thinly instanced live.

## Live-graph class volumes (sampled via SPARQL, 2026-06)
`ActOfParliament` 17,612 · `StatutoryInstrumentPaper` 6,978 + `MadeStatutoryInstrumentPaper`
4,809 · `WorkPackage` 7,766 · `ProcedureRoute` 8,001 · `WorkPackagedThing` 7,763.
(Bills: 0.)

## Other ukparliament repos worth knowing (157 total)
`Procedure` (procedure data + bots), `procedure-browser`, `committees`,
`uk-treaties`, `psephology`(+`-data-graphs`), `bill-paper`, `publications-data`,
`library-feeds`, `regnal_years`, `question-checker`, `Pugin` (RDF rendering),
`lord-bishops`, `uk-general-elections`.

## Open threads (to work out next)
- **Formal shapes:** locate the ShEx/SHACL (not in `Query`) — graph patterns /
  validation. The 227 CONSTRUCTs are the practical stand-in meanwhile.
- **Generational crosswalk:** map the 19 old LDA datasets ↔ the 40 ontology
  modules ↔ the 183 live OData types ↔ the modern REST APIs — to see what each
  generation added/dropped, and where each subset's *real* source is.
- **"DD" probably isn't a separate store** (2026-06-18): the procedural data
  the lore put in a distinct DD (work packages, procedure routes, SI papers,
  Acts) is **directly on the public DDP SPARQL endpoint** —
  so assume **one store (DDP)** to mirror, not two. See the correction in
  [`triple-stores.md`](triple-stores.md).
- **Provenance per subset:** which REST API/system *produces* each cluster, vs
  what's curated/integrated only in the aggregate graph.
