# KGX Daisychain — slim-channel dataflow and equal-status arcs

> Refinement of [`node-flow-design.md`](./node-flow-design.md), focused on
> what *exactly* flows down an edge between two beads and how the renderer
> reads properties off an item.
>
> Status: design sketch. Not yet adopted. No code changes proposed in
> this commit — staged migration outlined at the bottom.
> Audience: anyone who wants to scale the daisychain past a few thousand
> items, write new ops without re-litigating where their facts get
> stored, or query a bead's data from outside the page.

## The two problems this doc is about

### 1. The channel is fatter at runtime than the spec wanted

The parent design (`node-flow-design.md` §"Edge / Bundle Metadata")
sketches an edge as a small object — `type`, `count`, `cache`,
`quality`, `sources`, and a short `sample` of URIs. The intent is
clear: edges are *references* to a materialised value, not the value
itself. Caches and large materialisations live elsewhere
(§"Materialise", §"Cache").

The current runtime does not match that spec. `Bundle.items` is a JS
array of fully-denormalised objects:

```
item = {
  uri, label, image, mpid,
  firstYr, lastYr, latestStart, sitting,
  parties, gender, citizenships, decade, coords, dob,
  birthplace, almaMaters, spouses, occupations,
  extra: {
    parl:     { personUri, constituency, currentParty, familyName, givenName, ... },
    identity: { wikidataQid, ddpPersonUri, govukSlug, scrapedSite, ... },
  },
}
```

Every downstream `Bundle` carries the union of every upstream `parse()`
step's contributions. A 10-bead chain over 100,000 items would move
roughly 100,000 × N denormalised fields × 10 hops. We are nowhere near
that load today (current chains are 100–650 items), but the abstraction
shouldn't be what decides the scalability ceiling.

### 2. Incoming RDF arcs are formally asymmetric in the JS model

Three augment ops produce three differently-shaped property bags:

| Op | Where its facts land on the item |
|---|---|
| `enrich` (Wikidata, QLever) | top-level under `item.extra.*` (`dob`, `birthplace`, `almaMaters`, `spouses`, `occupations`, …) |
| `parl-enrich` (DDP) and seed-time `parl-current-mps` | `item.extra.parl.{constituency, currentParty, ...}` |
| `identity-bridge` (FPKG identity-graph) | `item.extra.identity.{wikidataQid, ddpPersonUri, govukSlug, ...}` |

There is no formal account of why `extra.dob` is at depth 1 while
`extra.parl.constituency` is at depth 2. The shapes are
implementation-historical: Wikidata enrich went in first and was given
the flat slot; later sources were given namespaced sub-objects to avoid
collisions. The page reads each bucket explicitly:

```js
x.dob                                 // Wikidata, flat
x.extra?.parl?.constituency           // DDP, namespaced
x.extra?.identity?.wikidataQid        // FPKG identity, namespaced
```

In RDF, all three are just `<x.uri> ?p ?o` quads differing only in
`?g` (the named graph). They have equal formal status. The JS shape
disagrees. This has two concrete costs:

- **Hidden facts.** Triples that exist in a bead's graphs but were not
  promoted to a sidecar field by some `parse()` function are invisible
  to the renderer. `parl-enrich` may set `extra.parl.constituency` but
  *not* `extra.parl.dateOfBirth` even when the DDP query returned it;
  the dataset contains the fact, the projection doesn't, the UI never
  shows it. This is the specific dishonesty CLAUDE.md rule 11 warns
  against — facts hidden behind a renderer's denormalisation choices.
- **No general "view source" on a bead.** "What does the dataset know
  about Ashley Fox?" has no single answer — you have to look at the
  union of `x`, `x.extra.parl`, and `x.extra.identity`, and then go
  rebuild the source provenance for each field by reading three
  `parse()` functions.

## Proposed model

### Channel = `Set<Item>`

```
Item    = (uri: IRI, type: BundleType)
Channel = Set<Item>
```

Items are references. No `label`, no `image`, no `firstYr`, no
`extra.*`. Those are *renderer denormalisations* — a cache for snappy
display, not channel contents.

### Bead = `(channel, graphScope, type)`

```
Bead = {
  channel:    Set<Item>,
  graphScope: List<NamedGraphIRI>,
  type:       BundleType,    // redundant with item.type for single-type beads
}
```

Reference-light. A 10-bead chain over 100k items passes 100k IRI
strings + ~10 graph IRIs per edge. No triples flow.

This matches the parent design's edge sketch: `{ type, count,
cache, quality, sources, sample }` is exactly the shape of
`{ type, |channel|, …, graphScope }` plus a few small metadata
fields.

### Dataset = per-chain Oxigraph, named-graph-per-op

We already have writable Oxigraph for chains
(`a822f287` — *each chain in its own named graph*). The slim-channel
model extends that by giving *each op* its own named graph within the
chain's graph space:

```
urn:fmn:chain/<chain-uuid>                          chain spec / lineage
urn:fmn:chain/<chain-uuid>/bead/<step-idx>/<op-id>  per-op result graph
```

Every op that produces RDF writes its result quads into the matching
op graph. The store is append-only within a chain's lifetime. Beads
*point into* the store via `graphScope`; nothing duplicates.

### Edge contract

Three op kinds, three concrete edge shapes. Op signature in all cases:

```
op : (channelIn, graphScopeIn) → (channelOut, graphScopeOut, ΔnamedGraph?)
```

#### Filter (`party`, `sitting`, `decade`, `gender`, `has-image`, …)

```
channelOut    ⊆ channelIn
graphScopeOut = graphScopeIn
ΔnamedGraph   = ∅
```

A filter predicate runs as a SPARQL ASK against the dataset (or a
property fetch + JS predicate, equivalent for the items we care about).
No new RDF is produced; just a subset of items survives. The decision
*itself* can be recorded as a tiny graph if we want filter provenance,
but isn't required.

#### Augment (`enrich`, `parl-enrich`, `identity-bridge`)

```
channelOut    = channelIn                            (same items, same types)
graphScopeOut = graphScopeIn ∪ {newOpGraph}
ΔnamedGraph   = (newOpGraph, bindings → quads)
```

The op runs SPARQL against an external endpoint, materialises the
result rows as quads, and writes them into a new op graph in the
per-chain store. The bead's `graphScope` grows by one. Item identities
do not change — augments add facts *about* items, they don't substitute
items.

#### Pivot (`→ birthplaces`, `→ alma maters`, `→ children`,
`parl-wraps`, …)

```
channelOut    = SPARQL-walk(channelIn, graphScopeIn, relation)
graphScopeOut = graphScopeIn ∪ {newOpGraph}
type:         changes  (human → place, building → architect, …)
```

A pivot walks a relation; the new channel's items are different
entities of a (typically) different type. The bead's `type` tag
changes. Lineage from the source bead is preserved by the chain spec,
not by carrying anything extra in the channel.

### Property access (the renderer contract)

The renderer never reads `item.extra.*`. There is a single query path
for every property of every item, in every graph in scope:

```sparql
SELECT ?p ?o ?g WHERE {
  GRAPH ?g { <item.uri> ?p ?o }
  VALUES ?g { ...beadGraphScope }
}
```

The UI picks which `(?p, ?g)` pairs to render. That's a *display
policy*, not a model claim. Triples the UI doesn't render today still
answer the query — the bead's ⓘ panel can show "all facts known about
this item, with provenance" without each augment having to remember to
populate a sidecar field.

Concretely the renderer calls something like:

```
propertyOf(bead, item, p)         → List<{o, g}>
propertiesOf(bead, item)          → List<{p, o, g}>
propertyOfIn(bead, item, p, g)    → List<o>
```

The "namespaces" we currently have as sidecars (`parl`, `identity`,
Wikidata) re-emerge naturally from `?g` — the graph IRI tells you
which source contributed the triple. They are equal-status arcs,
distinguished only by provenance.

### Materialisation (TriG download, debugging, exports)

```sparql
CONSTRUCT { GRAPH ?g { ?s ?p ?o } } WHERE {
  GRAPH ?g { ?s ?p ?o }
  VALUES ?g { ...beadGraphScope }
  VALUES ?s { ...beadChannel }
}
```

One query, no replay, no cache. Honest: the TriG file *is* exactly
what the bead "is". Today the export rebuilds from per-augment cached
bindings; that path goes away.

For external tooling (Fuseki, Jena, oxigraph CLI), the same CONSTRUCT
is the natural API — load that TriG, replay the chain's SPARQL queries
against it, and the projection the page rendered is reproducible
byte-for-byte.

## Migration

Not a single-PR change. Four orderable steps; the first one is
risk-free and gives us empirical answers to the open questions below
before committing to the rest.

### Step 1 — Add the store-backed accessor; leave sidecars in place

Implement `propertyOf(bead, item, p)` against the per-chain Oxigraph.
Run augment writers in **dual mode**: still mutate `item.extra.*` as
today, AND write the same triples into the named op graph. Renderers
continue to read sidecars; new code can read via `propertyOf` and is
free to query any property the store knows about.

No behaviour changes. Validates that the store keeps up with the rate
of augment writes, and that round-tripping triples through Oxigraph
preserves what the existing code path captured.

### Step 2 — Move TriG export off the cache-replay onto a `CONSTRUCT`

Smallest "the store IS the dataset" assertion. Diff the new TriG
against the old replay-built one over a representative chain set
(parl-current-mps → party → bridge → enrich; uk-mps-1900 → 1910s;
Whig PMs → descendants → royal; HK skyscrapers → architects). If the
diff is empty, the store is a faithful materialisation and we can stop
maintaining the parallel cache.

### Step 3 — Move renderers off `item.extra.*` to `propertyOf`

One renderer at a time, smallest first:

1. Bead-info dialog (the ⓘ panel) — already shows "all facts, grouped
   by source", maps cleanly to `propertiesOf`.
2. Bead summary stat line (e.g. `top constituency: Bridgwater · DDP:
   116 · Wikidata: 69 · GOV.UK: 34 · site scraped: 88`) — currently
   reads each source's count off a sidecar; tomorrow it counts graph
   members in `graphScope`.
3. Thing-sheet (per-item popover) — same shape as bead-info but
   scoped to one URI.
4. Tile grid — needs `label` and `image` from the store on each tile.
5. Pivot bin labels — needs the bin-key property from the store.
6. Map markers — needs `coords`, `label`, `image` from the store.

Each move is one small PR. When the last renderer is moved, the
augment writers' "still mutate `item.extra`" half can be deleted.

### Step 4 — Make the channel actually slim

Once renderers no longer read `item.*`, the page's in-memory
`Bundle.items` can shrink from `Item[]` (denormalised JS objects) to
`Set<URI>` (or `Map<URI, BundleType>` for the rare mixed-type case).
Pivot and filter ops never touch JS property bags again — they shape
channels by querying the dataset.

For 100k+ bundles the win is structural (O(N) URIs vs O(N × P) fields
per hop). For 100-item bundles it's invisible to the user but unlocks
two real wins: (a) per-bead memoisation of `propertyOf` becomes a
straightforward `Map<URI, Map<P, [{o, g}]>>`, with cache invalidation
keyed only on `graphScope`; (b) forks across the same dataset stop
duplicating item state — they just point at different graph subsets.

## Risks and open questions

1. **Query latency.** Per-render SPARQL hits to Oxigraph could feel
   sluggish if we hit it naively. Mitigation: a per-bead memoised
   property cache rebuilt only when `graphScope` changes. The cache
   is a renderer concern; it doesn't leak into the model.

2. **Filter ops that depended on JS prop bags.** Today `op.party
   ('Conservative')` reads `x.parties` (a JS array). Tomorrow it reads
   `propertyOf(bead, x, parl:party / wdt:P102)` and ASKs. Predicates
   have to be rewritten as queries. Mechanical work but every filter
   gets touched.

3. **Derived boolean facets.** `x.sitting === true` is today a
   computed boolean on the item. In RDF this is "does the bead's
   graphs assert a current sitting membership?" — non-trivial to
   express as one ASK. Options: (a) keep a small fixed set of
   *derived facets* as part of the channel (a flag bag, not a fact
   bag); (b) have the seed write a `derivedFacets` named graph
   describing these once; (c) accept that some filters need a
   SPARQL-level predicate. Open.

4. **Type system on `BundleType`.** Today the enum spans `human,
   constituency, party, formal_body, appg, si, concept, wd_thing,
   wd_class, building, place, org`. With slim channels the type is
   the primary discriminator for which renderer to use; worth making
   it a closed enum with a tiny lattice (`org ⊃ party`,
   `place ⊃ constituency`?).

5. **Where does the store actually live?** `a822f287` introduced a
   single Oxigraph with one named graph per chain. The slim model
   needs *multiple* graphs per chain (one per op). Two implementation
   shapes: (a) one shared Oxigraph, op graphs IRI'd
   `urn:fmn:chain/<id>/bead/<i>/<op>`; (b) one Oxigraph per chain,
   op graphs flat inside it. (a) is cheaper, (b) is simpler to GC
   when a chain is discarded. The model works either way; the pick
   should follow the operational concern.

6. **Filter that depends on a property the seed didn't promote.**
   With slim channels this just works — the filter queries the store
   for the property whether the seed surfaced it to the UI or not.
   That's a feature, not a risk; worth calling out because today's
   model can't do it.

## Non-goals

This document does NOT propose:

- changing the user-visible spine UI, chip palette, or chain library
  cards;
- changing the chain JSON spec hash-encoded in the URL;
- splitting Oxigraph into a separate process or making it remote;
- moving any current renderer off DOM (the WebGL2 pivot atlas keeps
  its existing input contract — it just gets it via `propertyOf`
  instead of from `item.extra`);
- adopting a new RDF vocabulary or shape language for the chain spec
  itself (TriG-as-manifest from the parent design stays as-is).

## Decision

Not yet. Recommend doing **Step 1 in isolation** (dual-mode augment
writers + `propertyOf` accessor, behaviour unchanged) and using it to
answer the open questions above empirically before committing to the
rest. Step 1 is small enough — maybe a couple of days of work — that
it gives us real cost numbers without any downstream commitment.
