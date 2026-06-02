# kgx node-flow — progress report

> Status of what we've built under the
> [`node-flow-design.md`](./node-flow-design.md) /
> [`node-flow-sketch.md`](./node-flow-sketch.md) plan. Updated as work
> lands. The honest checklist; complements the worklog. Edit in place.
>
> Last update: 2026-06-02 (this session lifted ~960 lines of inline
> daisychain code into `lib/`; LIBRARY iteration now runs 19 / 20 saved
> chains through the lib's runChainSpec via `cachedFetch`; suite 165).

## Where we are

Two demo pages, both UK-Parliament-flavoured, both built on the same
substrate now in **`/kgx/lib/`** — the canonical source the browser
demos, the integrated studio, the CLI, and the unit tests all share:

| Module | Exports | Notes |
|---|---|---|
| `node-flow.mjs` | `Bundle` `Bloom` `valuesQids` `parsePoint` … | the substrate |
| `engines.mjs` | `SparqlEngine` `ENGINES` `engine(id)` | qlever / fpkg / parl-sparql; GET small, POST >2 KB |
| `sparql-validate.mjs` | `assertNoAliasCollisions` | SPARQL 1.1 §18.2.4.4 hygiene gate |
| `starters.mjs` | `STARTERS` (9: SPARQL + PQ shapes) | source ops |
| `restrict.mjs` | `opFilters` (13 pure-client filters), `nameGender`, aggregators | restrict ops |
| `rel-templates.mjs` | `REL_TEMPLATES` (12 templates, 18 variants), `valuesMnisPersons` | pivot ops |
| `augment.mjs` | `AUGMENT_OPS` (enrich, parl-enrich, identity-bridge) | augment ops |
| `library.mjs` | `LIBRARY` (20 saved chains) | data |
| `runner.mjs` | `runChainSpec(spec, ctx)`, `UnsupportedOpError` | interpreter |

Page surfaces:

| Page | URL | Surface |
|---|---|---|
| **daisychain** | `/kgx/daisychain/` | Notebook-spine. Tap a starter → grow the chain via op chips; tap an older bead to truncate. Same `Bundle` engine as pivcab. URL hash auto-syncs (`#g=<base64url>` permalink); `#library=<id>` deep-link rehydrates. |
| **pivcab** | `/kgx/pivcab/` | DAG view of the same engine. Combine (∪ / ∩ / ∖) as the user-facing primitive. |
| **studio** | `/kgx/studio` | Three tabs: Debug (catalogue + endpoint + editor), Library (every chain in LIBRARY, tap to deep-link into daisychain), Ops registry (introspects each lib module — what's executable today). |

Plus `bin/kgx.mjs` — node CLI with `engines`, `validate`, `sparql`, `chain run`, `chain replay` verbs over the same lib.

## Design vocabulary vs. what's built

| Design concept | Status | Notes |
|---|---|---|
| **Source** | ✓ | `STARTERS`: uk-mps-1900 / parl-current-mps / hk-skyscrapers / us-presidents / recent-sis / 4 PQ-shape (constituency-current, party-index, formal-body-index, concept-index) |
| **Filter / Restrict** | ✓ | `opFilters` with 13 entries (party, decade, sitting, bridged, gender + heuristic, citizenship, has-origin, by-mp-party, in-commons, in-lords, top-by-size, top-by-officer-count, name-contains) |
| **Pivot** | ✓ | `REL_TEMPLATES` registry, 12 templates, 18 variants. `inputType → outputType` typed. tighten/broaden variants on `children`, `birthplaces`, `current_constituency`, `wd_instances_of`. |
| **Federate / Augment** | ✓ | `AUGMENT_OPS`: enrich (Wikidata), parl-enrich (DDP via rdfs:seeAlso, role=crossCheck), identity-bridge (FPKG identity-graph, role=crossCheck) |
| **Combine** | ✓ in pivcab | `Bundle.union/intersect/difference` in node-flow.mjs |
| **Group** | ⚠ | minimal (`group by country`); no histogram-with-bar-view yet |
| **View** | ✓ daisychain | spine / graph / table / tiles / map (4+1 toggle) |
| **Validate** | ✓ | `sparql-validate.mjs::assertNoAliasCollisions` — gates every op's emitted SPARQL |
| **Annotate** | ✗ | |
| **Materialise** | ⚠ per-bead | each bead exports TriG; whole-workflow manifest still pending |
| **Rank** | ✗ | |

| Concept | Status | Notes |
|---|---|---|
| **Typed edges (bundle metadata)** | ✓ | `Bundle { items, type, label }` |
| **Mobile-first vertical** | ✓ | all surfaces 360 px first |
| **Multiple engines** | ✓ | `engines.mjs` registry, engineId on every Source |
| **Provenance per bead** | ✓ | `Source { ng, kind, endpoint, engineId, query, ms, bindings, ts, note, namedGraphs }` |
| **TriG export** | ✓ workflow-level | per-bead block + `chainToTrig(spec)` workflow manifest; studio Library has "📋 Copy TriG" per card. Vocab: `kgx:SourceBundle` / `kgx:FilterBundle` / `kgx:PivotBundle` / `kgx:AugmentBundle` under `https://forgetmenot.local/vocab/kgx/`. Execution records (prov:Run) still TODO. |
| **URL hash persistence** | ✓ | `#g=<base64url(spec)>` auto-syncs; `#library=<id>` deep-links |
| **Library / saved workflows** | ✓ | `LIBRARY` in lib; daisychain `_replay` consumes; studio Library tab lists |
| **Bloom filters for set algebra** | ✓ in-memory | not yet shareable across runs |
| **Cache distinction (BundleDef / Run / CacheArtifact)** | ✗ | every chip click re-runs |
| **Relation templates** (tighten/broaden) | ✓ | 18 variants across 12 templates |
| **Quality policies** (strict/exploratory/recall/precision) | ✓ lib + studio | `quality.mjs::isVariantAllowedByPolicy / isOpAllowedByPolicy`; studio Ops tab mode-toggle dims disallowed rows. Daisychain chip-picker integration deferred. Replay is intentionally NOT gated by mode — authoring concern only. |
| **Source roles** (primary/crossCheck/adapterEvidence/weak) | ✓ metadata | role on each STARTER / REL_TEMPLATE / AUGMENT_OP; pinned by contract tests; UI surface in studio Ops tab. Not yet surfaced on daisychain beads. |
| **Cardinality feedback** | ⚠ partial | counts + the "⚠ large — see 🔧" hint exist; no principled tighten/broaden affordance yet |
| **Forks / named branches** | ✗ | back-gesture truncates; no `branches[]` |
| **SPARQL Anything adapter source** | ✗ | not wired |
| **Facets, entities, descriptions (DATA/REFERENT split)** | ⚠ documented | design note `§ Facets, entities, descriptions` captures it; op-API metadata pending until a REFERENT op motivates it |

## Test coverage

Suite: **165 tests** (164 pass, 1 skip, 0 fail). Skip is `sitting-bridged-enriched` — chain author forgot to narrow before augment (cap exceeded; intended product behaviour).

LIBRARY iteration test runs every saved chain through `runChainSpec`:

- **19 / 20 PASS** live + cached (HK skyscrapers→architects→works, MPs since 1900 → Labour → sitting → current constituency, US Presidents → children → alma maters, …)
- **1 SKIP** with diagnostic (the cap one above)
- **+1 determinism cross-check** (`tory-sitting` bindHash stable across two runs)

Two-tier HTTP cache (`tests/_lib/http-cache.mjs`): committed summary
(~few KB per request, in `tests/fixtures/http-cache/`) + `/tmp` full
body for fast local re-runs. Frozen-mode hermetic CI works from
summary alone.

## What we'd next close, in priority order

1. **Forks / branches — UI layer.** Lib foundation is in place
   (`lib/branches.mjs` + tree-shape acceptance in runner, trig,
   daisychain `_replay`, CLI `chain run --library`). LIBRARY has a
   `fork-demo` entry that round-trips through every surface.
   Still TODO: daisychain `state` model gains `branches[]` +
   `activeBranch`; back-gesture long-press creates a branch instead
   of truncating; spine view shows the active-branch indicator;
   graph view renders the whole tree; URL hash carries `activeBranch`
   alongside the spec. Sizeable UX decisions about where the fork
   affordance lives.
2. **SPARQL Anything adapter source**. Wrap a JSON API (Members API
   list-by-constituency, e.g.) as RDF on demand. Adds a new engine
   kind with `role: 'adapterEvidence'`. The role slot is already in
   the lib's quality gate; it just needs an op that uses it.
3. **Cache distinction (BundleDef / Run / CacheArtifact)**. Today every
   chip click re-runs; a content-addressed cache (hash of node-def +
   inputs → cached bindings) would let `#g=…` permalinks load
   instantly without re-fetching. The two-tier http-cache in
   `tests/_lib/http-cache.mjs` is the test-side analogue; production-
   side a similar idea applies.

Plus polish items that surface as testing exposes them:

4. **bindHash on every runner-emitted bead**. The lib has the helper
   pattern; the runner doesn't compute it inline today. Would make
   TriG execution records carry stable content hashes for free.
5. **Larger LIBRARY chains**. The 20 today are a good baseline;
   parallax-style chains across more entity types (legislation,
   committees, treaties) would exercise more of the rel-template +
   augment surface.

## Files

- `demos/parliament-live/web/kgx/lib/*.mjs` — the canonical library
- `demos/parliament-live/web/kgx/{daisychain,pivcab,studio}/` — page surfaces
- `bin/kgx.mjs` — node CLI
- `tests/unit/kgx-*.test.mjs` — lib unit tests; LIBRARY iteration
- `tests/_lib/http-cache.mjs` — two-tier record/replay
- `tests/fixtures/http-cache/<aa>/<key>.json` — committed summaries
- `docs/kgx/node-flow-design.md` — canonical design
- `docs/kgx/node-flow-sketch.md` — seed
- `docs/kgx/progress.md` — this file
