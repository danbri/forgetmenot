# Slim-channel migration — progress

> Tracks where we are in the migration sketched in
> [`slim-channel-dataflow.md`](./slim-channel-dataflow.md). Update on
> every landing.

## Status

| Step | What | State |
|---|---|---|
| 1 — `propertyOf` accessor + dual-mode augment writers | `BeadStore` lib + all 3 augment parseQuads + `runAugment` wiring | **mostly landed** (filter propagation deferred) |
| 2 — TriG `CONSTRUCT` export off cache-replay onto the store | not started | |
| 3 — Renderers off `item.extra.*` onto `propertyOf` | not started | |
| 4 — Slim channel: `Bundle.items` → `Set<URI>` | not started | |

## Step 1 — what's landed

### `lib/bead-store.mjs` — per-bead quad cache

The in-memory home for facts produced by augment ops. Each `BeadStore`
carries the DELTA contributed by its own bead and a reference to its
predecessor store. `propertyOf(s, p)` walks the parent chain so the
bead's full `graphScope` is recovered without copying triples.

API:

```
BeadStore.constructor(parent: BeadStore | null = null)
BeadStore.addQuad(s, p, o, g)              // add to this bead's delta
BeadStore.propertyOf(s, p) → [{o, g}]      // self + ancestors
BeadStore.propertiesOf(s) → [{p, o, g}]    // self + ancestors
BeadStore.graphScope() → [graphIri]
BeadStore.size() → number
```

Pure JS, no SPARQL dependency, no shadow DOM coupling. Covered by 15
unit tests in `tests/unit/kgx-bead-store.test.mjs`.

### `lib/augment.mjs` — all three augments gain `parseQuads()`

All three AUGMENT_OPS (`enrich`, `parl-enrich`, `identity-bridge`) now
declare `parseQuads(bindings, items, graphIri)` alongside their
existing `parse()`. Same input rows, different output: instead of
mutating `x.extra`, returns a flat `Array<{s, p, o, g}>` ready to
feed into a `BeadStore`.

Vocab IRIs are stop-gap (`urn:kgx:vocab:dob`, `urn:kgx:vocab:birthplace`,
`urn:kgx:vocab:almaMater`, …). Phase 2 of the TriG manifest review
([`trig-manifest-review.md`](./trig-manifest-review.md)) will rationalise
these to typed op-result predicates.

Facts about an item carry `s = item.uri`. Facts about a SECONDARY
entity (e.g. the item's birthplace) carry `s = birthplace.uri`, so the
store can answer questions about places without re-querying:

```js
store.propertiesOf('http://www.wikidata.org/entity/Q23154')
// → [
//   { p: rdfs:label, o: 'Cambridge', g: 'urn:kgx:bead:UUID:enrich' },
//   { p: kgx:country, o: 'United Kingdom', g: ... },
//   { p: kgx:coord, o: 'Point(0.1218 52.2053)', g: ... },
// ]
```

GROUP_CONCAT'd multi-values land as ONE quad per element, so set
arithmetic works against the store directly.

### `runAugment` in the daisychain page — wires it up

When `aug.parseQuads` is defined (today: just `enrich`), `runAugment`:

1. Mints an opaque per-bead graph IRI:
   `urn:kgx:bead:<uuid>:<op-id>` (e.g. `urn:kgx:bead:f4e1…:enrich`).
2. Calls `aug.parseQuads(bindings, items, graphIri)`.
3. Constructs a new `BeadStore` parented on the input bundle's store
   (if any).
4. Writes the quads.
5. Attaches the store to the enriched `Bundle` as `.store`.

When `aug.parseQuads` is NOT defined (today: `parl-enrich`,
`identity-bridge`), the enriched bundle inherits the parent's store
read-only if there is one. The parent's facts stay accessible; this
op just doesn't contribute new ones yet.

Dual mode: `parse()` still mutates `item.extra` exactly as before, so
renderers reading `x.extra.dob` etc. don't change. The store is a
parallel write — no behaviour change for users.

## Step 1 — what's NOT landed

- **Filter ops propagate store** — today's filter ops in
  `lib/restrict.mjs` don't carry `.store` through their output bundle.
  So `enrich → filter → enrich` loses the first enrich's quads from
  the second bead's scope. Sidecars still carry the values, so the
  user sees nothing wrong; the second enrich just can't query the
  first's facts through the store. Fix is a one-liner in each filter
  op (`out.store = b.store`).
- **Pivot store semantics** — when a pivot produces a new entity type
  (humans → places), the inherited store has facts about humans, not
  places. The pivot op should explicitly set `out.store = null` or
  start a fresh store. Not blocking; documented for Step 4.
- **Renderer migration** — no renderer reads from `bead.store` yet.
  This commit is the foundation; the rendering layer's
  `propertyOf`-based reads land in Step 3.
- **TriG `CONSTRUCT` over the store** — Step 2. The `BeadStore` doesn't
  yet serialise; the TriG download still rebuilds from cached
  bindings.

## How to verify Step 1 manually

Open the daisychain page on prod with the failing-then-fixed Tory
chain, run it through bead 4 (enrich), then in DevTools:

```js
const host = document.querySelector('daisy-app');
// however you reach the active bundle / bead in dev — fish out a
// bead with .enriched === true and check store
const bead = /* the bundle for step 4 */;
bead.store.size();           // > 0
bead.store.graphScope();     // contains 'urn:kgx:bead:<uuid>:enrich'
bead.store.propertiesOf('http://www.wikidata.org/entity/Q...');
//   → [{p, o, g}] including dob / birthplace / almaMater facts
```

The page's UI is unchanged; the store is a silent foundation waiting
for Step 3 renderers to read from it.

## Order of remaining work

1. Wire `parl-enrich` and `identity-bridge` to `parseQuads` (small).
2. Make filter ops propagate store (one-liner per filter).
3. Step 2: replace TriG cache-replay with a real `BeadStore`
   `CONSTRUCT` materialiser.
4. Step 3: migrate the bead-info ⓘ dialog renderer to `propertiesOf`,
   then the thing-sheet, then tile grid, then pivot bin labels, then
   map markers.
5. Step 4: drop `item.extra.*` mutation; channels become `Set<URI>`.
6. Concurrent: TriG manifest Phase 2 IRI rationalization
   ([`trig-manifest-review.md`](./trig-manifest-review.md)) — the
   per-bead graph IRIs `urn:kgx:bead:<uuid>:<op-id>` here become
   `urn:kgx:chain:<chain-uuid>:bead:<step>:graph`, in lockstep with
   the manifest's chain-scoped bundle IRIs.
