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

## Caveats

- **Sampling is not exhaustive.** `LIMIT n` checks a slice. To validate a whole
  class you must page through it (`LIMIT`/`OFFSET`) or run server-side — the
  browser is for spot-checks and shape development, not a full-store audit.
- **Bundle size** ~1 MB (carries n3 + jsonld + rdf-validate-shacl). Fine for a
  tool page; lazy-load it if you embed the checker elsewhere.
- **DESCRIBE breadth** is endpoint-defined (a shallow neighbourhood). If a shape
  needs related nodes, use a `CONSTRUCT` that pulls them in explicitly.
