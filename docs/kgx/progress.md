# kgx node-flow — progress report (2026-05-28)

> Status of what we've built under the
> [`node-flow-design.md`](./node-flow-design.md) /
> [`node-flow-sketch.md`](./node-flow-sketch.md) plan. Updated as work lands.
> The honest checklist; complements the worklog. Edit in place.

## Where we are

Two demo pages now live, both UK-Parliament-flavoured, both built on the
same `Bundle` + `Bloom` core:

| Page | URL | Surface |
|---|---|---|
| **pivcab** | `/kgx/pivcab/` | DAG-first. Combine (A ∪ B / A ∩ B / A ∖ B) is the user-facing primitive. |
| **daisychain** | `/kgx/daisychain/` | Notebook-spine-first. Combine deferred; pivot/enrich/types-as-bundles are the primitives. Four+one views of the same chain state. |

Engines are now an abstraction (`SparqlEngine`):

| Engine id | Endpoint | Used by |
|---|---|---|
| `qlever-wikidata` | `https://qlever.dev/api/wikidata` | seed + Wikidata enrich + birthplaces/alma maters pivots |
| `parl-sparql` | `/api/sparql` (proxied DDP) | "Current MPs" starter + 🏛 Parliament enrich |
| `fpkg` | `/kgx/query` (bundled Oxigraph) | slotted, not yet wired into an op |
| `oxigraph-wasm` | — | stub for V2 in-page execution |

Each fetch (seed, enrich, pivot) and each client-side op mints a
`Source` with a synthesised `urn:fmn:bead/<ts>/<seq>/<kind>` named-graph
IRI. The bead's content is, formally, a SPARQL dataset whose named graphs
come from its sources. ⓘ on any bead shows lineage + the SPARQL used +
a TriG download.

## Design vocabulary vs. what's built

Mapping against [`node-flow-design.md` § Node Kinds](./node-flow-design.md#node-kinds):

| Design concept | pivcab | daisychain | Notes |
|---|---|---|---|
| **Source** | ✓ Cabinet seed | ✓ `STARTERS[]`: `uk-mps-1900`, `parl-current-mps` | |
| **Filter** | ✓ via select+button | ✓ chip palette `OPS[bundle.type]` | |
| **Pivot** | ✗ | ✓ `→ birthplaces` (P19), `→ alma maters` (P69) | hardcoded predicates, not yet relation templates |
| **Federate** | ✗ | ⚠ implicit: 🏛 `enrich (Parliament)` is federate-via-rdfs:seeAlso | not yet a declared node kind with `{joinKey, sources[]}` |
| **Combine** | ✓ A ∪ B / A ∩ B / A ∖ B | ✗ deferred | |
| **Group** | ✓ | ⚠ minimal: `group by country` on places | no histogram-with-bar-view yet |
| **View** | ✓ tilegrid only | ✓ spine / graph / table / tiles / map | daisychain implements design's Option B (view as projection) |
| **Enrich** (later kind) | ✗ | ✓ ✨ Wikidata + 🏛 Parliament | per-item `extra` multigraph |
| **Validate** | ✗ | ✗ | |
| **Annotate** | ✗ | ✗ | |
| **Materialise** | ✗ | ⚠ per-bead TriG export | not yet workflow-level manifest |
| **Rank** | ✗ | ✗ | |

Mapping against design supporting concepts:

| Concept | Status | Notes |
|---|---|---|
| **Typed edges (bundle metadata)** | ✓ | `Bundle { items, type, label }`; ids set + lazy Bloom |
| **Mobile-first vertical DAG** | ✓ | both pages 360 px first |
| **Multiple engines** | ✓ | `SparqlEngine` abstraction, engineId on every Source |
| **Read-only graph render** (MVP) | ✓ | pivcab + daisychain graph view |
| **Provenance per bead** | ✓ | Source records: ng IRI, endpoint, engineId, query text, ms, row count, bindings, ts, note |
| **TriG export** | ⚠ per-bead | each `<urn:fmn:bead/…>` block, one per source; no workflow-wide manifest yet |
| **URL hash persistence** | ✗ | both pages lose state on reload |
| **Library / saved workflows** | ⚠ | daisychain has `LIBRARY[]` + replay; not yet TriG-shaped |
| **Bloom filters for set algebra** | ✓ in-memory | not yet shareable across runs |
| **Cache distinction (BundleDef / Run / CacheArtifact)** | ✗ | every chip click re-runs |
| **Relation templates** (tighten/broaden, sons/family/associates) | ✗ | the named gap; pivots are raw predicates |
| **Quality policies** (strict/exploratory/recall/precision) | ✗ | no policy gate; "no silent broadening" not enforced |
| **Source roles** (primary/crossCheck/adapterEvidence/weak) | ✗ | engineId is just an id, no role taxonomy |
| **Cardinality feedback** | ✗ | counts shown but no "tighten/broaden" affordance |
| **Forks / named branches** | ✗ | daisychain single-chain; pivcab has implicit branching via Combine but no `branches[]` array |
| **SPARQL Anything adapter source** | ✗ | not wired |

## What's in the page that wasn't strictly in the design

- **`daisychain` itself** — the spine-as-primary metaphor. The design called for read-only DAG render of the existing pivot notebook; we built a second metaphor in parallel.
- **Engines registry** (`SparqlEngine` + `ENGINES`) — design implies multiple sources but didn't specify a class.
- **`LIBRARY[]` of saved chains with replay** — fits "definitions should be stable and replayable" but wasn't called out as MVP.
- **Four-view toggle** (spine/graph/table/tiles/map) — design said "for MVP, either [view-as-node or view-as-attachment] is fine"; we picked attachment and shipped multiple renderers.
- **The 🏛 Parliament-DDP enrich** demonstrates federation across engines but isn't yet typed as a `Federate` node kind.

## What we'd next close, in priority order

1. **Relation templates** (next). Replace raw `→ birthplaces` / `→ alma maters` ops with a `RelationTemplate` registry: `id`, `gloss`, `inputType`, `outputType`, `engineId`, optional `namedGraphs[]`, `variants[{id, kind: 'default'|'tighten'|'broaden', label, build(items)}]`. A `→ pivot…` picker chip surfaces them. Source records carry `relTemplate` + `variant` + `namedGraphs[]` so lineage and TriG read in design vocabulary. Initial set: `birthplace`, `educated_at`, `children` (showpiece: default + sons + daughters + first child + family), `current_constituency` (parl-sparql), `appg_officer` (fpkg `appg-register` named graph) — proves non-Wikidata sources at the relation level, not just the seed level.
2. **Source roles**. Add `gog:role` per engine: primary / crossCheck / adapterEvidence / weakEnrichment. Render in the ⓘ panel.
3. **Quality policies**. A page-level mode: strict / exploratory / recall / precision. Filter the `RelationTemplate.variants` shown in the picker based on the active policy.
4. **URL hash persistence**. `#g=<base64url(gzip(chainSpec))>` — chains already serialise; just wire load.
5. **Workflow-level TriG manifest**. Lift the per-bead TriG to a whole-page TriG dump with `gog:` ontology (bundle defs, runs, source bindings, cache hashes).
6. **Federate as a node kind**. Declare the 🏛 op with `{joinKey: 'wikidataQid', sources: [{id, role}]}` shape.
7. **Forks/branches**. Daisychain back-gesture truncates; should optionally fork instead, with named branches.
8. **SPARQL Anything adapter source**. Wrap a JSON API (Members API list of MPs by constituency, e.g.) as RDF on demand.

## Files

- `demos/parliament-live/web/kgx/pivcab/index.html` — DAG demo
- `demos/parliament-live/web/kgx/daisychain/index.html` — spine demo
- `demos/parliament-live/web/kgx/index.html` — links both
- `docs/kgx/node-flow-design.md` — the canonical design
- `docs/kgx/node-flow-sketch.md` — the seed
- `docs/kgx/progress.md` — this file
