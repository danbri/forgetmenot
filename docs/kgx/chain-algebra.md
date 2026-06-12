# KGX chain algebra, grounding model, and optimising interpreter

> **DISCUSSION ONLY.** Dated 2026-06-12. Consolidates the
> [trig-manifest-review](./trig-manifest-review.md) Phase 2B+ ideas,
> the [slim-channel](./slim-channel-dataflow.md) Step 2-4 ideas, the
> grounding discussion, and the chain-as-DAG-of-primitive-ops point
> into one place. **No implementation beyond the introspecting
> `demos/python-interop/kgx_chain.py` tool until the project owner
> has signed off on a direction.**

## TL;DR

A chain is a DAG of six primitive operators over typed entity streams.
Every primitive is parameterised by an endpoint-agnostic grounding —
either a SPARQL fragment or a typed predicate IRI + value IRI. The
manifest records both the conceptual DAG (six primitive types) and
the physical execution plan (`kgx:Execution` records, possibly fusing
runs of compatible beads into one engine call). The vocabulary
privileges no specific knowledge graph; every target is just an
`sd:Service` with an `sd:endpoint`.

## 1. Why this exists

Today the chain spec has dozens of op IDs (`party`, `sitting`,
`decade`, `gender`, `citizenship`, `desc-contains`, `bridged`,
`has-image`, `rel-pivot`, `enrich`, `parl-enrich`, `identity-bridge`,
`pivot-bp`, `pivot-am`, …). Each is interpreted by an op-specific
closure in `lib/restrict.mjs` / `lib/augment.mjs` / `lib/rel-templates.mjs`
that knows what predicates and JS-side fields the op acts on. The
manifest serialises the bare op label and nothing else; a consumer
who can't import the registry can't run, query, or even fully
understand the chain.

This document proposes that:

1. The dozen-plus op IDs collapse to **six generic primitives**.
2. Today's named ops become *saved chips* — entries in a library
   that pin "Filter with predicate IRI X and value Y" under a
   human-friendly label.
3. Chain spec gains **multi-input ops** (Union / Intersect /
   Difference) so the shape generalises from tree-with-forks to
   proper DAG.
4. Every bead carries a **grounding** — either a SPARQL fragment
   or a typed predicate + value IRI — that any consumer can read,
   plan against, or execute.
5. An **optimising interpreter** lowers maximal runs of compatible
   beads into single engine calls (`kgx:Execution`), recording the
   plan in the manifest so the next reader sees what actually ran.

## 2. The six primitives

| Op                   | Inputs                          | Output                       | Semantics                                                                                       |
|----------------------|---------------------------------|------------------------------|--------------------------------------------------------------------------------------------------|
| `kgx:Filter`         | 1 main stream + a predicate     | subset of the input stream   | items where the predicate matches                                                                |
| `kgx:Pivot`          | 1 main stream + a relation      | derived stream               | replace each `x` with each `y` such that `x R y` (forward) or `y R x` (inverse)                  |
| `kgx:Augment`        | 1 main stream + a side query    | same stream, additional facts in a named graph | items unchanged; the bead's named graph gains triples about them               |
| `kgx:Union`          | 2+ streams                      | items in any input, deduped by URI |                                                                                            |
| `kgx:Intersect`      | 2+ streams                      | items in every input         |                                                                                                  |
| `kgx:Difference`     | 1 main + 1+ auxiliary streams   | items in main, absent from any auxiliary |                                                                                      |

That's the entire algebra. Today's whole op palette decomposes:

- `party`, `sitting`, `decade`, `gender`, `citizenship`, `has-image`,
  `desc-contains`, `bridged`, `latestStart-min/max`, `firstYr-min/max`,
  `top-by-size`, `in-commons`, `has-origin` → **Filter** with a
  predicate (typed IRI + value, or an inline SPARQL fragment).
- `rel-pivot` (and the legacy `pivot-bp`, `pivot-am` aliases) →
  **Pivot** with a relation IRI + direction (forward / inverse).
- `enrich`, `parl-enrich`, `identity-bridge` → **Augment** with a
  side query against a named `sd:Service`.

The UI's chip palette doesn't disappear — it becomes a library of
named shortcuts that pin a primitive + its grounding under a
human-friendly label. Adding a new chip becomes a data change
(a new library entry), not a code change.

## 3. Multi-input chains — the DAG shape

Today a bead has exactly one parent (`kgx:derivedFrom`). With set
ops, a bead may have 1, 2, or more parents — the chain is a proper
DAG. Predicates:

- `kgx:input` — for unary ops (Filter, Pivot, Augment), the single
  main input.
- `kgx:inputs` — for symmetric multi-input ops (Union, Intersect),
  an `rdf:List` of input beads, order immaterial.
- `kgx:main` + `kgx:auxiliary` — for asymmetric ops (Difference),
  the main stream and an `rdf:List` of auxiliary streams to subtract.

`kgx:derivedFrom` becomes a *projection* of these, computable from
`kgx:input` ∪ `kgx:inputs` ∪ `{kgx:main}` ∪ `kgx:auxiliary` — kept
optionally for back-compat readers and to render a single "this then
that" thread for the active path through the DAG.

The chain graph IRI still owns one named graph per manifest. The DAG
shape lives inside it.

### Example

```turtle
@prefix kgx: <urn:kgx:vocab:> .
@prefix sd:  <http://www.w3.org/ns/sparql-service-description#> .

<chain> {
  <chain:bead:0> a kgx:SourceBundle ;
    kgx:queryAgainst [ a sd:Service ; sd:endpoint <…/wikidata> ] ;
    kgx:sparqlFragment "?p wdt:P39 wd:Q11811941 ." .

  <chain:bead:1> a kgx:FilterBundle ;
    kgx:input <chain:bead:0> ;
    kgx:sparqlFragment "?p wdt:P102 wd:Q9626 ." .

  <chain:bead:2> a kgx:SourceBundle ;
    kgx:queryAgainst [ a sd:Service ; sd:endpoint <…/wikidata> ] ;
    kgx:sparqlFragment "?p wdt:P39 wd:Q11811941 ." .

  <chain:bead:3> a kgx:FilterBundle ;
    kgx:input <chain:bead:2> ;
    kgx:sparqlFragment "?p wdt:P102 wd:Q9251 ." .   # Reform UK

  <chain:bead:4> a kgx:UnionBundle ;
    kgx:inputs ( <chain:bead:1> <chain:bead:3> ) .

  <chain:bead:5> a kgx:DifferenceBundle ;
    kgx:main      <chain:bead:4> ;
    kgx:auxiliary ( <chain:bead:cabinet> ) .  # subtract cabinet members
}
```

Five named bundles + one Union + one Difference. Topologically a DAG.

## 4. Grounding — endpoint-agnostic

The vocabulary deliberately does *not* define per-KG classes
(no `kgx:WikidataSource` / `kgx:DDPSource`). Every target is just an
`sd:Service` (W3C SPARQL Service Description). The "which KG" is an
emergent property of the IRIs the SPARQL uses, not a model claim. A
consumer pointing at GeoNames, an in-house Stardog, or a
SPARQL-over-DuckDB bridge writes the same shape.

Per-bead grounding predicates:

- `kgx:gloss` — natural-language description (human-readable, not
  executable).
- `kgx:queryAgainst` — an `sd:Service` for the bead's target endpoint.
- `kgx:sparqlFragment` — a triple-pattern fragment suitable for
  fusion into a sibling query.
- `kgx:sparql` — the entire SPARQL query (when this bead runs alone).
- `kgx:executedBy` — points at the `kgx:Execution` that actually ran
  this bead, after the optimiser planned the chain.
- `kgx:variants` — an `rdf:List` of alternative groundings (each its
  own blank node with `kgx:label` + `kgx:sparqlFragment`).
- `kgx:activeVariant` — integer index into `kgx:variants`, recording
  which one ran.

A grounding can also be typed-predicate-and-value rather than
SPARQL-fragment:

- `kgx:propertyIri <IRI>` + `kgx:valueIri <IRI>` (or `kgx:valueLiteral`)
  — equivalent to the fragment `?item <IRI> <value> .`, but easier to
  query against and SHACL-constrain.

Either form is concrete enough to execute. At least one is required
on every `Filter` / `Pivot` / `Augment` bead with `kgx:gloss` as the
optional natural-language partner.

A bead's grounding can be **partial**: gloss only, no fragment. The
tool reports that as `◐ partial` (the chain is documented but not
executable by a third party). A bead with neither gloss nor fragment
is `⚠ ungrounded`.

## 5. The optimising interpreter

A chain manifest carries TWO layers:

1. **Conceptual DAG** — the six-primitive shape the user designed.
   This is what the daisychain UI renders, what the URL hash encodes,
   what library cards save.
2. **Execution plan** — the runtime's record of which engine calls
   actually ran. Each call is a `kgx:Execution` that records its
   endpoint, the SPARQL it sent, the beads it fused, and the rows
   it returned.

```turtle
<chain:exec:0> a kgx:Execution ;
    kgx:against     [ a sd:Service ; sd:endpoint <…/wikidata> ] ;
    kgx:fuses       ( <chain:bead:0> <chain:bead:1> ) ;
    kgx:fusedSparql "SELECT ?p WHERE { ?p wdt:P39 wd:Q11811941 ; wdt:P102 wd:Q9626 }" ;
    kgx:rowsReturned "116"^^xsd:integer ;
    kgx:durationMs   "320"^^xsd:integer .
```

The interpreter's job:

### 5.1 Fusion pass

Walk the DAG. For each maximal connected run of Filter / Pivot /
Augment beads that target the **same** `sd:Service`, fuse them into
one query — joining triple patterns, intersecting FILTERs, walking
Pivots as relation joins, materialising the result.

Pseudo-code:

```
for each bead in topo order:
  if bead.op in {Filter, Pivot, Augment} and bead.endpoint == current.endpoint:
    append bead.fragment to current.fused_query
    record bead in current.fuses
  else:
    emit current
    start new current rooted at bead
emit current
```

### 5.2 Set-op lowering

- `Union(A, B)` over the same endpoint → one SPARQL with `UNION`.
- `Intersect(A, B)` over the same endpoint → one SPARQL with a join
  on `?item`.
- `Difference(A, B)` over the same endpoint → one SPARQL with
  `MINUS`.
- Cross-endpoint set ops → materialise each input as URI sets,
  compute the set op in the interpreter. Trivially parallel.
- Federated set ops via SPARQL `SERVICE` clauses where both
  endpoints support it (declared via `sd:supportedFeature`).

### 5.3 Fallback

When the source can't express an op (an in-memory predicate, a
property the endpoint doesn't expose, a non-SPARQL bead), the run
breaks — materialise the upstream, evaluate the bead in the
interpreter, continue with the new materialised set as the next
run's seed.

### 5.4 Manifest output

After interpretation, every bead has `kgx:executedBy <exec:N>`
pointing at an `Execution`. Each Execution lists the beads it fused.
The conceptual DAG stays as it was. A consumer can read either or
both views.

## 6. Knock-on consequences

- **Op registry shrinks dramatically.** From `lib/restrict.mjs`'s
  ~22 named filter ops + the augment registry + the rel-template
  registry to one Filter implementation, one Pivot, one Augment,
  and three set-op evaluators. The variety lives in the library
  entries (data) rather than the runtime (code).
- **Chip palette is metadata.** Each chip is `{ label, primitive,
  grounding }` — a JSON entry, not a closure. Adding a chip
  requires no code change; the daisychain page generates chips from
  a library file at load time.
- **Slim-channel `propertyOf` is the streaming evaluator.** When
  fusion can't run an op natively, the interpreter materialises the
  upstream items into a `BeadStore` (slim-channel Step 1's data
  structure), then evaluates the op item-by-item using
  `propertyOf(bead, item, p)`. The two designs reinforce each other.
- **The TriG manifest stops being write-only.** With grounded
  primitives, any RDF tool can not just *read* the chain but
  *re-execute* it from scratch — assuming network access to the
  declared endpoints. The `kgx_chain.py` browser demo can do this
  interactively today (see §7).
- **Federation becomes natural.** Cross-endpoint Union / Intersect /
  Difference fall out of the set-op lowering rules. The user doesn't
  write federation by hand; they connect a Wikidata bead to a DDP
  bead with a Union, and the interpreter picks SERVICE or
  materialise-and-merge.

## 7. The Python tool implementation

`demos/python-interop/kgx_chain.py` is the introspecting reader; it
reports what's present and what's absent without judgement.

What lands in this turn:

1. Recognises all six primitive bundle types
   (`Source/Filter/Pivot/Augment/Union/Intersect/Difference`).
2. Reads multi-input edges: `kgx:input`, `kgx:inputs` (rdf:List),
   `kgx:main`, `kgx:auxiliary` (rdf:List), plus the existing
   `kgx:derivedFrom` for back-compat.
3. Topologically sorts the DAG when set ops are present; falls back
   to the existing linear / fork walk otherwise.
4. Reports per-bead inputs in the summary and JSON output.
5. Surfaces `kgx:Execution` records as before, now potentially
   covering set-op beads too.
6. Detects DAG-shape vs tree-shape and labels the output accordingly.

What does NOT land:

- The interpreter / fusion / compiler — these stay in the design
  doc until the runtime side is signed off.
- No SHACL shapes — explicitly paused.
- No `kgx:Filter`-typed bundle subclasses (per the earlier
  conversation; op-as-subtype is the same mistake as per-KG
  subtype). Bundle TYPE is one of {Source, Filter, Pivot, Augment,
  Union, Intersect, Difference} — these are *structural* roles,
  not opinionated semantic categories.

## 8. The web demo (`pythonchain.html`)

The browser demo grows two affordances:

1. **More examples.** Union and Intersect / Difference chains
   alongside the existing Linear / Fork / Augment / Grounded /
   Variants set.
2. **Interactive query buttons.** When a bead carries
   `kgx:queryAgainst` + `kgx:sparqlFragment`, a "▶ Run this query"
   button appears next to it. The page builds a `SELECT ?item WHERE
   { fragment } LIMIT 50` query and `fetch()`s it via the
   endpoint's standard SPARQL HTTP protocol. Results render as a
   table. Same for `kgx:Execution` records: "▶ Run the fused
   query" sends the recorded `kgx:fusedSparql` straight at the
   endpoint.

CORS-permitting: Wikidata via qlever.dev allows cross-origin SPARQL.
Parliament's `api.parliament.uk/sparql` allows ACAO:* on GET. Other
endpoints may not; the page reports the failure honestly rather
than silently failing.

## 9. Migration path — held

The order if/when this gets signed off:

1. **Add primitives to the lib** (small) — make Filter / Pivot /
   Augment / Union / Intersect / Difference first-class in
   `lib/restrict.mjs` (or a new `lib/primitives.mjs`); make the
   existing chip closures dispatch into them with their bundled
   grounding.
2. **Library JSON for chips** — extract the chip palette into a
   data file with `{ label, primitive, propertyIri, valueIri }` per
   entry. Existing chips keep their human labels.
3. **Manifest emit** — `chainToTrig` learns `kgx:input` /
   `kgx:inputs` / `kgx:main` / `kgx:auxiliary` for multi-input beads;
   `kgx:gloss`, `kgx:sparqlFragment`, `kgx:queryAgainst` for
   grounded beads.
4. **Optimising interpreter** — implement the fusion pass; emit
   `kgx:Execution` records; wire the runtime to use them.
5. **Set ops in the UI** — add Union / Intersect / Difference
   actions to the bead-level menus where two upstream beads make
   them sensible.

Each phase is independently shippable; (1) and (2) together would
already cut `restrict.mjs` down significantly without changing any
user-visible behaviour.

## 10. Open questions

- **Bead vs Execution provenance** — should every Augment bead
  declare its own named graph for resulting triples
  (`kgx:resultGraph`), or should the `kgx:Execution` carry that?
  Probably both: bead → graph IRI for slim-channel reads, Execution
  → graph IRI for replay.
- **Variant fallback policy** — when a bead has 3 variants and the
  active one returns 0 rows, does the interpreter try the others?
  If yes, in what order? Recording fallback history feels right;
  worth a separate `kgx:fellBackTo` predicate.
- **Per-item parallelism** — is it ever worth declaring on a bead
  that its op is "embarrassingly parallel by item" so the
  interpreter can shard? Probably not until items get large
  enough that one-query-per-shard makes sense.
- **Federation declarations** — should the manifest carry hints
  about which endpoints can `SERVICE` each other, or should the
  interpreter discover this dynamically? The latter is cleaner;
  the former is faster.

These wait for the project owner's direction.
