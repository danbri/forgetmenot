# Public SHACL checker for the Parliament endpoint

A browser-only [SHACL](https://www.w3.org/TR/shacl/) validator for data in the
public UK Parliament triple store (`api.parliament.uk/sparql`), built on
Google's [schemarama](https://github.com/google/schemarama) (vendored as a
submodule under `third_party/schemarama`).

- Page: [`browser/shacl-check.html`](../browser/shacl-check.html)
- Glue: [`browser/shacl-check.js`](../browser/shacl-check.js)
- Bundle: `browser/third_party/schemarama.bundle.min.js` (rebuilt — see below)

## The core idea: you don't validate a database, you validate a *subgraph*

SHACL validates an RDF **graph** — historically, the structured data found on a
single web page. Our data is a **database**: ~7.5M triples in the DDP store. You
can't (and don't want to) hand a whole store to a validator.

The bridge is a SPARQL **`CONSTRUCT`** or **`DESCRIBE`** query. It carves the
part you care about out of the store and returns it as an RDF document — exactly
the input SHACL expects:

```
pick a "bit"  ──►  SPARQL CONSTRUCT/DESCRIBE  ──►  RDF subgraph  ──►  SHACL shapes ──► report
```

The **extraction query is the scoping knob**. Three idioms:

| You want to check… | Extraction query |
|---|---|
| one resource | `DESCRIBE <https://id.parliament.uk/p4J3kpGD>` |
| a sample of a class | `CONSTRUCT { ?t ?p ?o } WHERE { ?t a p:Treaty ; ?p ?o . { SELECT ?t WHERE { ?t a p:Treaty } LIMIT 20 } }` |
| exactly what a shape needs | a targeted `CONSTRUCT` projecting only the predicates the shape mentions |

For `sh:targetClass` to fire, the extracted graph must contain the focus node's
`rdf:type` triples — `DESCRIBE` and `CONSTRUCT { ?s ?p ?o }` both include them.

## Two ways to drive it

The glue (`browser/shacl-check.js`) exposes both:

```js
import { check, validateRdf } from './shacl-check.js';

// 1. SAMPLE — extract a subgraph from the endpoint, then validate it.
const r = await check('DESCRIBE <https://id.parliament.uk/p4J3kpGD>', shapesTurtle);

// 2. PIPELINE — validate RDF you already have (e.g. piped from another API),
//    no SPARQL round-trip. Turtle / N-Triples / N-Quads / JSON-LD.
const r2 = await validateRdf(turtleFromSomeApi, shapesTurtle, { format: 'turtle' });

// => { triples, conforms, failures: [{ severity, property, message, shape }] }
```

No proxy is needed: the endpoint sends `Access-Control-Allow-Origin: *`, so a
static page can query it directly.

## Turtle support (why we rebuild the bundle)

schemarama's string auto-parser only sniffs JSON-LD / microdata / RDFa, and its
one exported low-level parser, `parseNQuads`, is **strict N-Quads** — it rejects
`@prefix`. But SPARQL `CONSTRUCT`/`DESCRIBE` and most RDF APIs emit **Turtle**.

Upstream's `parser.js` *has* a `parseTurtle`, but `core/index.js` doesn't export
it. So we re-bundle the same submodule sources with `parseTurtle` exposed:

```sh
scripts/build-schemarama-bundle.sh        # → browser/third_party/schemarama.bundle.min.js
```

The submodule stays pristine; only the build entry/config
(`scripts/schemarama-bundle/`) live in our tree. Re-run after bumping the
submodule. The glue negotiates `text/turtle` by default and parses with the
re-exposed `parseTurtle`; pass `{ format: 'ntriples' | 'jsonld' | … }` to override.

## Shapes

The page ships Parliament-specific example shapes (Treaty, Person,
ConstituencyGroup, Party), written against predicates/types actually present in
the store (verified with `parl sparql query`). They are starting points — edit
the shapes textarea, or the extraction query, to check anything else.

A shape is just Turtle; e.g. "every Treaty must carry a name and a lead
government organisation":

```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix p:  <https://id.parliament.uk/schema/> .
p:TreatyShape a sh:NodeShape ;
  sh:targetClass p:Treaty ;
  sh:property [ sh:path p:treatyName ; sh:minCount 1 ;
    sh:severity sh:Violation ; sh:message "A Treaty must carry a treatyName." ] ;
  sh:property [ sh:path p:treatyHasLeadGovernmentOrganisation ; sh:minCount 1 ;
    sh:severity sh:Violation ; sh:message "A Treaty should name a lead government organisation." ] .
```

## Deployed in the kgx hub (fpkg)

The same checker is wired into the FPKG kgx developer hub as a first-class
SPARQL client at **`/kgx/shacl`**
([`demos/parliament-live/web/kgx/shacl.html`](../demos/parliament-live/web/kgx/shacl.html)),
alongside studio / playground / flint / yasgui. It reads the shared
[`/kgx/endpoints.json`](../demos/parliament-live/web/kgx/endpoints.json) registry
(so it's multi-endpoint — bundled store, Parliament DDP, Wikidata, …; supports
`?endpoints=<url>` like the other clients) and ships these presets:

- **FPKG · SKOS Concept** (default) — `skos:Concept`s in the bundled store
  (`prefLabel` required, `inScheme` warned). The extraction query uses
  `SELECT DISTINCT` because the store holds each concept in many named graphs —
  without it, `LIMIT 20` returns 20 duplicate rows of one concept.
- **FPKG · Identity mapping** — validates the join keys we serve: every
  `schema:Person` must carry an MNIS id (`Violation`); `wikidataQid` is a
  `Warning`, so unreconciled members surface as a coverage gap (≈45 of a 60-row
  sample today).
- **FPKG → Wikidata (federated)** — joins the bundled store to Wikidata through
  the identity mappings, then validates the *merged* graph. See below.
- **Parliament DDP · Treaty** — extracts the treaty **and each laying's own
  properties** (a bare `DESCRIBE` wouldn't include them) and checks the layings
  with a nested `sh:node` shape. The message is explicit that this is structural,
  not "laid under CRaG" — CRaG-ness isn't typed on the Treaty or Laying; it lives
  in the procedural DD store, off the public endpoint.
- **Parliament DDP · Person** and **· Party**.

### Reporting: which entity failed

schemarama's own result mapping keeps only `{property, message, shape, severity}`
— it drops `sh:focusNode`, so you can't tell *which* resource failed. The glue
therefore runs the raw `rdf-validate-shacl` validator (exposed from the rebuilt
bundle) and keeps the **focus node**. The pinned validator also never populates
`sh:value`, so for each failure the glue looks up the actual value(s) at
`(focusNode, path)` in the data and reports them. So a `precededBy` breach shows
the focus paper *and the two papers it's wrongly linked to* (clickable); a
clock-frozen breach shows `True False`. This is general — every check now names
the offending entity and the values present at the failing property.

### Data-integrity audits (single-valued properties)

Three presets check that properties the DDP data model treats as single-valued
really are — `sh:maxCount 1`, so any subject with two values is flagged. The
vocabulary and populations were probed on the live endpoint first:

| Preset | Predicate (class) | Population | Result |
|---|---|---|---|
| Question has ≤1 asking person | `questionHasAskingPerson` (`Question`) | 142,624 | conforms (0) |
| SI paper preceded by ≤1 paper | `precededBy` (`StatutoryInstrumentPaper`) | 378 | **3 violations** |
| Clock-frozen not both true & false | `workPackageIsClockFrozen` (`WorkPackage`) | 6,415 | **2 violations** |
| Clock-frozen is valid `xsd:boolean` | `workPackageIsClockFrozen` lexical form | 6,415 | **1,203 violations** (`True`/`False`) |

The latter two extract the *whole* population of the property (not a `LIMIT`
sample), so the audit actually catches the bad subjects — e.g. two WorkPackages
assert their scrutiny-clock flag as both `True` and `False`. Note the public DDP
has no explanatory-memorandum boolean (that lives in the non-public DD procedural
store), so the clock-frozen flag is the public boolean analog of that idea.

For a maxCount audit to be meaningful the extraction must pull *all* values per
subject; a bare `DESCRIBE` or a too-small `LIMIT` can hide violations.

### Federation (FPKG → Wikidata) and why it's two-step

Server-side SPARQL `SERVICE` from the bundled Oxigraph aborts at the proxy's 30s
cap (recorded in `skills/kgx-infra-cloud-containers/reference.md`). So the
federated preset does the join **client-side, in two fetches**: (1) CONSTRUCT a
base subgraph from FPKG (members + `owl:sameAs` to their Wikidata entity);
(2) CONSTRUCT birth dates from Wikidata for the QIDs found, keyed back to the
*same* `https://www.wikidata.org/entity/…` URI the store uses; merge; then
validate with a SHACL **sequence path** `( owl:sameAs schema:birthDate )`. The
glue exposes `fetchQuery` / `parse` / `validateStore` (and a `checkFederated`
convenience) for this. `queries/10-fpkg-wikidata-join.rq` and
`11-fpkg-ddp-join.rq` document the raw two-step recipes.

The deploy image only ships `demos/parliament-live/web/`, so the bundle is
copied there too (`web/kgx/third_party/`); `scripts/build-schemarama-bundle.sh`
writes both locations. A push to `claude/main` touching
`demos/parliament-live/**` triggers the `deploy-fpkg.yml` GitHub Action, which
deploys to fly.io (app `fpkg`) using the repo's `FLY_API_TOKEN` secret.

## Caveats

- **Sampling is not exhaustive.** `LIMIT n` checks a slice. To validate a whole
  class you must page through it (`LIMIT`/`OFFSET`) or run server-side — the
  browser is for spot-checks and shape development, not a full-store audit.
- **Bundle size** ~1 MB (carries n3 + jsonld + rdf-validate-shacl). Fine for a
  tool page; lazy-load it if you embed the checker elsewhere.
- **DESCRIBE breadth** is endpoint-defined (a shallow neighbourhood). If a shape
  needs related nodes, use a `CONSTRUCT` that pulls them in explicitly.
