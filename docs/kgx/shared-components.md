# KGX shared web components — extraction plan

> **DISCUSSION ONLY.** Dated 2026-06-12. The factorization order
> implied by the daisychain ↔ pythonchain comparison. Companion to
> [`chain-algebra.md`](./chain-algebra.md). **Held for sign-off
> before Phase 2 onwards.**

## TL;DR

Two demos, one item shape. Lift four things from daisychain into a
shared `lib/kgx-components/` module so both demos read from the same
source: the bead-intents data structure, a tiny type→render registry,
`<kgx-item-card>`, and `<kgx-tile-grid>`. Map and pivot stay
daisychain-only for now (heavier; not needed by pythonchain).

## Why this exists

`pythonchain.html` today renders SPARQL JSON as a flat table — useful
for inspection, baffling next to daisychain's tile grid + photos +
party badges. The reason daisychain's renderers feel rich is that the
*item shape* is structured (`{ uri, label, image, mpid, sitting,
parties: [], … }`) and the renderers dispatch on a `type` field.

That structure isn't manifest-specific or FPKG-specific. Any demo that
reads kgx chains and shows their content would want it. So the
factorization isn't "let pythonchain look like daisychain" — it's
"both demos compute the same item view and share the rendering."

## What lives where today

| Concern | Daisychain location | Lines | Liftability |
|---|---|---|---|
| `BEAD_INTENTS` + `ENTITY_INTENTS` | `lib/intents.mjs` | ~290 | **already extractable** — pure data structures + applicability funcs |
| `tileHTML(item, type)` | `daisychain/index.html` L4609–4631 | ~25 | inline string-template, easy to lift |
| `<daisy-bead>` custom element | L1096–1456 | ~360 | tangled with OPS palette + chip generation |
| Type→meta-line dispatch | L1244–1342 | ~100 | scattered switch statements; needs a registry |
| `_renderTiles()` collection | L4567–4683 | ~120 | depends on tileHTML + IntersectionObserver |
| `_renderPivot()` (DOM) | L4271–4566 | ~300 | clean data interface; usable standalone |
| `PivotRenderer` (GPU) | `lib/pivot-gpu.mjs` | already isolated | already a clean module |
| `_renderMap()` | L3598–4268 | ~670 | tile mosaic + cluster; isolatable but big |

## Proposed phases (each independently shippable, each held)

### Phase 1 — pure data lifts, no UI change

- **Move `lib/intents.mjs` to `lib/kgx-components/intents.mjs`**.
  Keep a re-export at the old path so daisychain doesn't change.
  Pythonchain can then `import { BEAD_INTENTS } from
  '/kgx-components/intents.mjs'` and offer the same per-bead actions
  (copy permalink, copy TriG, copy chain JSON) without re-implementing.
- **NEW: `lib/kgx-components/type-registry.mjs`** — a tiny module:

  ```js
  export const TYPE_RENDERERS = {
    human:  { labelField: 'label', imageField: 'image',
              metaFields: ['firstYr', 'lastYr', 'parties'] },
    place:  { labelField: 'label', imageField: 'image',
              metaFields: ['country', 'originCount'] },
    building: { … },
    si:     { … },
  };
  ```

  Daisychain's scattered `if (type === 'human') …` checks become
  `const r = TYPE_RENDERERS[type]; r.labelField` lookups. No
  user-visible change but the registry is now one file.

Phase 1 is zero-risk; no rendering changes anywhere.

### Phase 2 — `<kgx-item-card>` + `<kgx-tile-grid>` as custom elements

- **NEW: `lib/kgx-components/item-card.mjs`**:

  ```html
  <kgx-item-card type="human" label="…" image="…" uri="…" meta="…">
  </kgx-item-card>
  ```

  Web component, no framework, no build step. Constructor reads
  attributes; render uses Phase 1's `TYPE_RENDERERS` for layout.
  Click bubbles a `thing-open` CustomEvent — same name daisychain
  already uses.
- **NEW: `lib/kgx-components/tile-grid.mjs`**:

  ```html
  <kgx-tile-grid type="human"
                 .items=${[{uri, label, image, …}, …]}>
  </kgx-tile-grid>
  ```

  Hosts a grid of `<kgx-item-card>`s; lazy image load via the same
  IntersectionObserver pattern as daisychain.

- **Adoption**:
  - daisychain's `tileHTML` + `_renderTiles` becomes `<kgx-tile-grid>`.
    No visible change for users; ~140 lines deleted from index.html.
  - pythonchain swaps its current `runSparql` result rendering: when
    the SPARQL response has columns named `label` / `image`, build
    items + pass to `<kgx-tile-grid>`. Otherwise fall back to the
    current table.

Phase 2 is where the user-visible payoff lands: pythonchain results
become actual items with faces, not raw URIs.

### Phase 3 — pivot DOM + map (daisychain-heavy, optional)

- **NEW: `lib/kgx-components/pivot.mjs`** wrapping the current
  `_renderPivot()` + facet extraction. Drops `PivotRenderer` from
  `lib/pivot-gpu.mjs` into the same module via dynamic import when
  the item count crosses the GPU threshold.
- **NEW: `lib/kgx-components/map.mjs`** with the Web Mercator +
  cluster code. Inputs: items with `{coords: {lat, lon}}`.

Pythonchain may or may not adopt these. The point of the extraction
is to make daisychain's own renderers reachable from any other demo
that wants the same view modes.

## Manifest-side: a small structural ask

Phase 2 needs *one* piece of manifest information that today's TriG
doesn't carry: which **type** of thing the bead outputs. Without it,
the renderer has to guess from SPARQL projection variable names —
that works for the common case (`?label`, `?image`) but breaks the
moment a chain uses non-standard variable names or a non-Wikidata
endpoint.

Proposed (DISCUSSION ONLY, lands with Phase 2):

```turtle
<bead:N> a kgx:FilterBundle ;
    kgx:produces wd:Q5 ;          # what kind of item — IRI, no central registry
    kgx:queryAgainst   [ a sd:Service ; sd:endpoint <…> ] ;
    kgx:sparqlFragment "…" ;
    # Optional: tell the renderer which SELECT variable plays which role.
    kgx:projection (
        [ kgx:var "p"     ; kgx:role kgx:identityVar ]
        [ kgx:var "label" ; kgx:role kgx:labelVar ]
        [ kgx:var "image" ; kgx:role kgx:imageVar ]
    ) .
```

`kgx:produces` is just an IRI — the kgx vocab doesn't enumerate types
any more than it enumerates endpoints. The type-registry module
maps known IRIs (`wd:Q5` → human, `wd:Q41176` → building, etc.) to
a renderer; unknown types fall through to a generic card. No central
authority required.

`kgx:projection` is optional. If absent, the renderer falls back to
the variable-name heuristic (`label` / `image` / etc.) — which is
also what pythonchain ships in this round.

## Closed-world hazards in a federated setting

The six-primitive algebra includes Difference (kgx:DifferenceBundle) and
the runtime should keep emitting it when a chain actually wants set
subtraction, but the `pythonchain.html` example library
**deliberately doesn't ship a Difference demo**, and the grounded
sitting-MP queries avoid `FILTER NOT EXISTS { ?seat pq:P582 ?end }` in
favour of positive temporal anchors (`?seat pq:P580 ?start
FILTER(?start >= "2024-07-04"^^xsd:dateTime)`).

The reason: SPARQL's `NOT EXISTS`, `MINUS` and our Difference primitive
are closed-world / negation-as-failure operators. They conflate "X is
not asserted in this graph" with "X is false everywhere." Inside one
endpoint that's usually fine; across endpoints — which is the
*entire point* of a chain that walks Wikidata then Parliament's DDP —
it breaks immediately. An MP whose seat end-date hasn't been added to
Wikidata yet ≠ a sitting MP. A statute that lacks a repealed-by
triple ≠ in-force law.

The example library uses three positive substitutes:

- **Temporal anchors on start dates.** "Conservative MPs whose seat
  started on or after 4 July 2024" returns the same cohort as
  "currently sitting Conservative MPs" without the CWA.
- **Set membership on positive property paths.** "Members of the House
  of Tudor" (`P53 = Q101978`), not "non-members of every other dynasty."
- **Positive intersections.** "Cabinet ministers who sit in the
  Lords" = `?p wdt:P39 ?role . ?role wdt:P279* wd:Q83307 . ?p wdt:P39
  ?seat . ?seat wdt:P279* wd:Q18941264`, not "cabinet ∖ MPs."

The Difference primitive remains in the *algebra* — the manifest
should record subtraction semantics when the user explicitly wants
them. But Difference results should be treated as derived facts that
depend on the closure of the input KGs at execution time, and the
example library reserves Difference for chains where that closure
assumption is documented.

## Non-goals

- No SHACL. The structural shape of a Filter/Pivot/Augment bead's
  projection can be SHACL-constrained later; not now.
- No central type registry IRI (e.g. `kgx:HumanType`). The bead points
  at whatever IRI the consumer recognises — Wikidata Q5, schema.org
  Person, a custom type in someone's KG.
- No display IRIs in the manifest (no `kgx:labelProperty wdt:P1810`).
  That's UI policy and lives in the type-registry module.

## What this commit lands (NOT pause-able discussion-only)

Out of the four pieces in the response thread, three small ones ship
in the same commit as this doc:

1. `kgx_chain.py` recognises `kgx:produces` and surfaces it in the
   spec JSON + text summary. Forward-compatible: no existing example
   sets it, no parse changes; just reads the predicate when present.
2. `pythonchain.html` result renderer now detects `label` and
   `image` (and `img`, `photo`, `picture`) columns in the SPARQL
   response and renders rows as a tile grid — image left, label
   right, URI as a small badge — instead of a flat table. Falls
   back to the table when neither column is present.
3. The grounded example's source bead projects `?p ?label ?image`
   via OPTIONAL clauses, so the cumulative ▶ Run shows faces and
   names. The other examples can adopt the same pattern when
   convenient; nothing forces them to.

That's the "items have faces" win without committing to any of the
phases above. The web-components extraction itself stays held.
