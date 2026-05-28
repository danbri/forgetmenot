# KGX Node-Flow — Design Note and MVP Plan

> Companion to [`node-flow-sketch.md`](./node-flow-sketch.md). That file
> was the seed; this is the longer design note that expands it. Contents
> incorporate analysis from a separate GPT-tools pass (May 2026) and are
> reproduced here as the working reference.
>
> Status: design sketch. Not yet built.
> Audience: project manager, Claude Code, future implementers.

This note consolidates the current thinking around turning the existing
KGX pivot notebook into a graph/DAG-based node-flow interface.

## Summary

The existing pivot page — `/kgx/demos/pivot/` — currently renders a
linear scrolling notebook:

    Seed → Pivot → Pivot → …

Each step is a SPARQL-backed hit list. The user starts with a set of
entities, then pivots through related entity sets.

The proposed node-flow generalises this. The notebook is just a path
through a graph. The graph view shows the same operations as a DAG,
where branches can fork from the same set, be refined independently,
and later be combined.

**Core slogan:**

- The notebook is a path through a graph.
- The graph is a DAG of operations.
- The edges are semantic bundles.
- The caches are materialised bundle values.
- The forks are explicit semantic variants.
- TriG is the durable manifest; JSON is the browser state.

## Current Problem

Large pivot result pages are difficult to navigate. A page can become a
long stack of images, empty image blocks, repeated cards, and weak
contextual cues. The user loses a sense of where they are in the chain.

A better interface would expose the structure:

    Bundle 1: UK Prime Ministers
      ↓ filter
    Bundle 2: Whig PMs active in the 1700s
      ↓ pivot children
    Bundle 3: Children of Bundle 2
      ↓ pivot children
    Bundle 4: Grandchildren
      ↓ intersect with Queen Elizabeth II ancestors
    Bundle 5: PM-linked royal ancestors

Each step should be collapsible and inspectable. The default should be a
compact semantic breadcrumb, not a giant table.

## Mental Model

Every step is an operation node. Every edge carries a typed entity set.

    Operation node → typed entity-set edge → operation node → typed entity-set edge

In earlier vocabulary, the word "bundle" mostly refers to the edge
value: a typed entity set, possibly cached and carrying provenance /
evidence metadata.

**Recommended distinction:**

    Node   = operation / derivation
    Edge   = bundle / typed entity set / materialised value
    View   = projection over a bundle
    Cache  = stored materialisation of a bundle
    Branch = named fork of semantic state

The existing notebook is a constrained DAG where every node has at most
one input and one output: a path. The graph view is the same data drawn
as a DAG.

## Node Kinds

Initial node kinds from the sketch:

| Kind | Inputs | Outputs | Op config | Maps to today |
|---|---|---|---|---|
| **Source** | — | typed set | endpoint, SPARQL query, facet schema | seed step, e.g. PMs from QLever |
| **Filter** | set | set, same type | facet predicates, text search, date range | facets + search input |
| **Pivot** | set | set, often new type | property, direction, groupBy flag, dedupe limit | each "From this selection →" jump |
| **Federate** | set + join key | augmented set | second endpoint, mapping property | deferred cross-endpoint item |
| **Combine** | 2+ sets | set | union, intersection, difference | not in today's app |
| **Group** | set | groups | property, top-N | "Group by" select |
| **View** | set or groups | visual | tilegrid, table, map, chart, force graph | result renderers |

**Suggested later additions:**

| Kind | Purpose |
|---|---|
| **Enrich** | Add labels, images, biographies, dates, coordinates, summaries |
| **Validate** | Check assertions against stricter sources, SHACL, rules, provenance, confidence |
| **Annotate** | Add weak AI/ML/entity-linking annotations |
| **Materialise** | Freeze/cache/export result as TriG, N-Quads, Parquet, HDT, etc. |
| **Rank** | Sort by confidence, relevance, date, centrality, count |

For MVP, do not build all of these. Start with read-only rendering of
the existing linear notebook as a graph.

## Edge / Bundle Metadata

Edges should eventually carry more than `from` and `to`.

Minimal edge:

    {
      "from": "n1",
      "to":   "n2"
    }

Better edge:

    {
      "id":   "e1",
      "from": "n1",
      "to":   "n2",
      "value": {
        "type":    "human",
        "count":   59,
        "cache":   "sha256:abc123",
        "quality": "strict",
        "sources": ["qlever/wd"],
        "sample":  ["wd:Q9682", "wd:Q43274"]
      }
    }

This lets the UI render compact edge badges:

    human × 59 · Wikidata/QLever · strict · cached

## Example Graph

                            ┌──────────┐
                            │  Source  │ UK PMs · QLever · seed query
                            └────┬─────┘
                                 │ human × 59
                ┌────────────────┼────────────────┐
                │                │                │
            ┌───▼──┐         ┌───▼──┐         ┌───▼────┐
            │Filter│         │Pivot │         │ Pivot  │
            │1970s │         │spouse│         │alma-mat│
            └───┬──┘         └───┬──┘         └───┬────┘
                │                │                │
            ┌───▼──┐         ┌───▼──┐         ┌───▼────┐
            │ View │         │Pivot │         │ Group  │
            │ Grid │         │ alma │         │ count  │
            └──────┘         │mater │         └───┬────┘
                             └───┬──┘             │
                                 │             ┌──▼───┐
                             ┌───▼──┐          │ View │
                             │ View │          │ Bar  │
                             │ Grid │          └──────┘
                             └──────┘

Edges are typed by entity type:

    human → human   spouses, children, siblings
    human → place   birthplaces
    place → human   people born here, via inverse P19
    human → org     employers, parties, alma maters

## View Nodes Versus View Attachments

Two possible treatments of views.

**Option A: make View a normal node.**

    Source → Pivot → View

**Option B: treat views as UI attachments to bundle edges.**

    {
      "views": [
        { "id": "v1", "edge": "e3", "view": "tilegrid" },
        { "id": "v2", "edge": "e5", "view": "bar" }
      ]
    }

**Recommendation:** for MVP, either is acceptable. Longer term, prefer
Option B, because it separates dataflow from screen layout. Views should
usually be terminal projections over data, not semantic transformations
in the derivation graph.

## State Model

Current sketch:

    {
      "nodes": [
        {
          "id": "n1",
          "kind": "Source",
          "op": { "endpoint": "qlever/wd", "query": "...", "type": "human" }
        },
        {
          "id": "n2",
          "kind": "Pivot",
          "op": { "prop": "wdt:P26", "groupBy": false, "target": "human" }
        },
        {
          "id": "n3",
          "kind": "View",
          "op": { "view": "tilegrid" }
        }
      ],
      "edges": [
        { "from": "n1", "to": "n2" },
        { "from": "n2", "to": "n3" }
      ]
    }

**Recommended evolution:**

    {
      "version": 1,
      "nodes": [],
      "edges": [],
      "sources": [],
      "relationTemplates": [],
      "qualityPolicies": [],
      "branches": [],
      "views": [],
      "caches": []
    }

The MVP can leave many of these arrays empty, but having the slots
prevents the design from becoming only a visual graph editor.

## Sources and Source Roles

A node may use multiple datasources. These should have explicit roles.

**Possible roles:**

    primary assertions
    cross-check
    enrichment
    adapter-derived evidence
    AI/ML weak annotation
    local cache/index
    text search
    embedding search
    official API source

Example:

    {
      "id": "n4",
      "kind": "Federate",
      "op": {
        "joinKey": "wikidataQid",
        "sources": [
          { "id": "qlever/wd",                          "role": "primaryAssertions" },
          { "id": "parliament/sparql",                  "role": "crossCheck"        },
          { "id": "sparql-anything/parliament-api",     "role": "adapterEvidence"   },
          { "id": "local/ai-annotations",               "role": "weakEnrichment"    }
        ]
      }
    }

The UI can then say:

    Uses Wikidata as primary source.
    Uses Parliament API as cross-check.
    Weak AI annotations excluded.

or:

    Exploratory mode: includes weak AI/entity-linking annotations.

## SPARQL Anything

SPARQL Anything should be treated as an **adapter source**, not as
equivalent to curated RDF.

Conceptually:

    SERVICE <x-sparql-anything:> {
      fx:properties
        fx:location "https://some.api.example/path.json" ;
        fx:media-type "application/json" .
      ?s ?p ?o .
    }

In KGX source metadata:

    {
      "id":            "sparql-anything/parliament-api",
      "kind":          "AdapterSource",
      "adapter":       "SparqlAnything",
      "location":      "https://some.api.example/path.json",
      "mediaType":     "application/json",
      "facadeGraphModel": "FacadeX",
      "evidenceClass": "adapterDerivedEvidence"
    }

This matters because adapter-derived data has different evidential
status from curated RDF.

## Quality and Evidence Policy

Every node or bundle should have an explicit quality policy.

**Suggested modes:**

    strict:       curated and official sources only
    exploratory:  curated, official, adapter-derived, and visible weak annotations
    recall:       broaden relations and include lower-confidence data
    precision:    tighten relation and source rules

**No silent broadening.** If a user starts with `children` and then
broadens to `family` or tightens to `sons` / `first child` / `biological
children only`, that should create a visible fork or variant, not mutate
the original node invisibly.

## Relation Templates

A pivot is not just a raw predicate. It is often a semantic relation
template with refinements and broadenings.

Example:

    relationTemplate: children
    default:
      wikidata:
        path: wdt:P40
        gloss: "child"
    tighten:
      sons:
        path: wdt:P40
        filter: { sex_or_gender: male }
      daughters:
        path: wdt:P40
        filter: { sex_or_gender: female }
      first_child:
        path: wdt:P40
        order_by: { date_of_birth: ascending }
        limit_per_parent: 1
    broaden:
      family:
        union:
          - wdt:P40        # child
          - ^wdt:P40       # parent
          - wdt:P3373      # sibling
          - wdt:P26        # spouse
      associates:
        union:
          - wdt:P463       # member of
          - wdt:P69        # educated at
          - wdt:P108       # employer
          - wdt:P1416      # affiliation

The UI should expose this as **relation refinement**, not force the user
to edit SPARQL directly.

## Cardinality Feedback

Cardinality should become first-class. If a node produces too many or
too few hits, the interface should offer principled refinements.

Example collapsed card:

    Bundle 3: Children of 18th-century Whig PMs
    47 results · using Wikidata P40 only · quality: curated statements only

Refinement controls:

    Tighten:
      sons only
      daughters only
      first child only
      biological children only
    Broaden:
      family members
      descendants
      associates
      AI/ML weak annotations

This creates a semantic exploration UI rather than a raw query editing
UI.

## Forking

Forks should be first-class.

Example:

    B3   Children of Whig PMs
    B3a  Sons of Whig PMs
    B3b  Close family of Whig PMs
    B3c  Children plus weak biography extraction

A graph topology gives forks mechanically, but branch metadata is also
useful:

    {
      "branches": [
        { "id": "main",             "head": "n7", "label": "children" },
        { "id": "sons-only",        "forkedFrom": "n3", "head": "n8", "label": "tightened to sons" },
        { "id": "family-broadened", "forkedFrom": "n3", "head": "n9", "label": "broadened to close family" }
      ]
    }

This is analogous to LLM UI branching: same upstream state, divergent
downstream semantics.

## Caching

At each node/edge, we can cache results.

Important distinction:

    Bundle definition ≠ bundle run ≠ cached materialisation ≠ UI view

Definitions should be stable and replayable. Runs are timestamped
executions. Caches are artefacts produced by runs.

**Suggested runtime objects:**

    BundleDef / NodeDef    immutable semantic definition
    Run                    immutable execution record
    CacheArtifact          content-addressed output
    Branch                 named pointer to a graph head
    View                   user-facing rendering state

**Minimal rules:**

1. Editing a node creates a new node version.
2. Running a node creates a new run.
3. Caches are content-addressed and reusable.
4. Forks are explicit branch nodes.
5. Weak, adapter, and AI evidence is never silently merged with strict
   assertions.
6. Large result sets are represented by manifests plus external
   materialisations.
7. UI state is stored separately from semantic state.

## Execution Plan

Execution can initially sit above the existing network layer.

1. Topological-sort the DAG.
2. Compile each node to one request through the existing `net()` helper
   in `/kgx/demos/pivot/index.html`.
3. Cache the result per node ID / node hash.
4. Editing a downstream Filter should not re-fetch the Source.
5. Each request still flows through the dev panel.
6. The graph view drops in above the network layer without replacing it.

This keeps the MVP small.

## Persistence

**For browser MVP:**

    JSON state in URL hash
    gzip + base64url for larger graphs

Example:

    #g=...

**For durable semantic interchange:**

    TriG as the manifest/control plane
    external artefacts for large materialisations:
      N-Quads
      Parquet
      HDT
      Bloom filters
      cached JSON

Do not require TriG to carry millions of rows. Use it to describe
workflows, bundles, runs, caches, branches, evidence, source bindings,
and UI state.

### Why TriG

TriG is a good interchange format because it is Turtle-like but supports
named graphs. It can represent:

- bundle definitions
- executable plans
- result materialisations
- evidence graphs
- quality policies
- UI state
- cache metadata
- branches/forks
- source bindings

Example conceptual TriG:

    @prefix gog:   <https://example.org/gog#> .
    @prefix prov:  <http://www.w3.org/ns/prov#> .
    @prefix dct:   <http://purl.org/dc/terms/> .
    @prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .
    @prefix wd:    <http://www.wikidata.org/entity/> .
    @prefix wdt:   <http://www.wikidata.org/prop/direct/> .

    <urn:gog:flow:queen-pm-chain> {
      <urn:gog:bundle:B1> a gog:SourceBundle ;
        dct:title "UK Prime Ministers" ;
        gog:itemType gog:Person ;
        gog:primarySource <urn:gog:source:wikidata-qlever> ;
        gog:uiShape gog:NameBioPicCard ;
        gog:latestRun <urn:gog:run:B1:2026-05-28T09-45-00Z> .

      <urn:gog:bundle:B2> a gog:FilterBundle ;
        dct:title "Whig PMs active in the 1700s" ;
        gog:derivedFrom <urn:gog:bundle:B1> ;
        gog:constraint <urn:gog:constraint:whig-party>,
                       <urn:gog:constraint:active-1700s> ;
        gog:latestRun <urn:gog:run:B2:2026-05-28T09-46-00Z> .

      <urn:gog:bundle:B3> a gog:ExpandBundle ;
        dct:title "Children of Bundle 2 people" ;
        gog:derivedFrom <urn:gog:bundle:B2> ;
        gog:relationTemplate <urn:gog:relation:children> ;
        gog:qualityPolicy <urn:gog:policy:curated-only> ;
        gog:latestRun <urn:gog:run:B3:2026-05-28T09-47-00Z> .

      <urn:gog:bundle:B3a> a gog:ExpandBundle ;
        dct:title "Sons of Bundle 2 people" ;
        gog:variantOf <urn:gog:bundle:B3> ;
        gog:derivedFrom <urn:gog:bundle:B2> ;
        gog:relationTemplate <urn:gog:relation:sons> ;
        gog:changedAspect gog:TightenedRelation .

      <urn:gog:bundle:B3b> a gog:ExpandBundle ;
        dct:title "Close family of Bundle 2 people" ;
        gog:variantOf <urn:gog:bundle:B3> ;
        gog:derivedFrom <urn:gog:bundle:B2> ;
        gog:relationTemplate <urn:gog:relation:close-family> ;
        gog:changedAspect gog:BroadenedRelation .
    }

**Source bindings:**

    <urn:gog:sources> {
      <urn:gog:source:wikidata-qlever> a gog:SparqlEndpoint ;
        dct:title "Wikidata via QLever" ;
        gog:endpoint <https://qlever.dev/api/wikidata> ;
        gog:role gog:PrimaryAssertionSource .

      <urn:gog:source:parliament-sparql> a gog:SparqlEndpoint ;
        dct:title "UK Parliament SPARQL" ;
        gog:endpoint <https://api.parliament.uk/sparql/> ;
        gog:role gog:SupportSource .

      <urn:gog:source:parliament-api-via-sparql-anything> a gog:AdapterSource ;
        dct:title "Parliament API via SPARQL Anything" ;
        gog:adapter gog:SparqlAnything ;
        gog:role gog:SupportSource ;
        gog:evidenceClass gog:AdapterDerivedEvidence .
    }

**Cache metadata:**

    <urn:gog:runs> {
      <urn:gog:run:B3:2026-05-28T09-47-00Z> a gog:Run ;
        prov:used <urn:gog:bundle:B3> ;
        prov:used <urn:gog:run:B2:2026-05-28T09-46-00Z> ;
        prov:used <urn:gog:source:wikidata-qlever> ;
        prov:startedAtTime "2026-05-28T09:47:00Z"^^xsd:dateTime ;
        prov:endedAtTime "2026-05-28T09:47:03Z"^^xsd:dateTime ;
        gog:resultCount 47 ;
        gog:cache <urn:gog:cache:B3:sha256-abc123> ;
        gog:status gog:Complete .

      <urn:gog:cache:B3:sha256-abc123> a gog:CacheArtifact ;
        gog:cacheKind gog:MaterialisedResultGraph ;
        gog:digestAlgorithm "sha256" ;
        gog:digestValue "abc123..." ;
        gog:format "application/trig" ;
        gog:storageUri <file:///cache/bundles/B3/abc123.trig> ;
        gog:hasBloomFilter <file:///cache/bundles/B3/abc123.bloom> ;
        gog:sampleSize 20 .
    }

For small bundles, the result graph may enumerate members:

    <urn:gog:result:B3:sha256-abc123> {
      <urn:gog:bundle:B3> gog:member wd:Q123 ;
                           gog:member wd:Q456 ;
                           gog:member wd:Q789 .
    }

For large bundles, TriG should point to external materialisations:

    <urn:gog:cache:B7:sha256-def456> a gog:CacheArtifact ;
      gog:cacheKind gog:ExternalMaterialisation ;
      gog:format "application/n-quads" ;
      gog:storageUri <s3://example-cache/B7/def456.nq.gz> ;
      gog:secondaryIndex <s3://example-cache/B7/def456.parquet> ;
      gog:hasBloomFilter <s3://example-cache/B7/def456.bloom> ;
      gog:tripleCount 18492301 ;
      gog:entityCount 923771 .

## UI Design

The UI should make every step collapsible and inspectable.

A simple CSS-mostly implementation can use native `<details>` /
`<summary>` blocks.

Example:

    <section class="pipeline">
      <details class="bundle" open>
        <summary>
          <span class="id">Bundle 1</span>
          <span class="title">UK Prime Ministers</span>
          <span class="meta">wikidata-qlever · Person · 59 results</span>
        </summary>
        <div class="bundle-body">
          <dl>
            <dt>ds</dt><dd>wikidata-qlever</dd>
            <dt>type</dt><dd>Person</dd>
            <dt>gloss</dt>
            <dd>Persons, living or dead, who are or have been Prime Minister of the United Kingdom or predecessor/successor offices.</dd>
            <dt>ui card shapes</dt><dd>basic-name · name-bio-pic</dd>
            <dt>see also</dt><dd>Parliament data · TODO</dd>
          </dl>
          <details class="query">
            <summary>SPARQL</summary>
            <pre><code>SELECT ?pm ?pmLabel WHERE {
      ?pm p:P39/ps:P39 wd:Q14211 .
      OPTIONAL { ?pm rdfs:label ?pmLabel . FILTER(lang(?pmLabel)="en") }
    }</code></pre>
          </details>
        </div>
      </details>
    </section>

Useful CSS for performance and readability:

    .bundle {
      border: 1px solid #d9deea;
      border-radius: 14px;
      margin: 0.75rem 0;
      background: #fff;
      box-shadow: 0 2px 10px rgba(20, 30, 60, 0.06);
      overflow: hidden;
      content-visibility: auto;
      contain-intrinsic-size: 160px;
    }
    .bundle > summary {
      display: grid;
      grid-template-columns: 6.5rem 1fr auto;
      gap: 1rem;
      align-items: center;
      cursor: pointer;
      padding: 0.9rem 1rem;
      background: linear-gradient(90deg, #f7f9ff, #ffffff);
      list-style: none;
    }
    .bundle > summary::-webkit-details-marker { display: none; }
    .bundle > summary::before {
      content: "▸";
      font-size: 1rem;
      color: #53627d;
    }
    .bundle[open] > summary::before { content: "▾"; }
    .meta {
      font-size: 0.82rem;
      color: #65708a;
      white-space: nowrap;
    }

For images: `<img loading="lazy" src="..." alt="">`

For large result sets, do not render everything by default. Show:

    count
    first N examples
    expand sample
    open table
    download/export

## Mobile Layout

For 360 px phone screens, left-to-right DAGs are hard to read.

**Recommendation:**

    mobile:   top-to-bottom DAG
    desktop:  left-to-right DAG

The MVP should test whether the graph metaphor works on mobile before
investing in ports, dragging, and advanced layout.

## Layout Engine

**Options:**

    ELK.js:
      declarative
      server-side-renderable
      around 150 KB
      good for tidy Sugiyama-style layouts

    Tiny custom DAG layout:
      likely sufficient for MVP
      avoids a large dependency

**Avoid for this use case:**

    Cytoscape
    d3-force

Reason: this is not a force-directed network. It is a workflow DAG. We
want a tidy layered layout.

## Interaction Plan

Cheapest-first iterations:

### 1. Read-only graph render

Render the existing linear notebook as a DAG. No new operations. No
drag/drop. No combine. No ports.

Purpose: test whether the metaphor reads.

Implementation:

    existing steps        → nodes
    existing transitions  → typed edges
    existing result counts→ edge badges
    existing cards/tables → views

**This is the MVP.**

### 2. Edit operations

Add simple edit controls:

    drag node output port → spawn connected child node
    long-press node       → change op
    long-press edge       → splice in Filter

### 3. Branching

Allow two pivots from the same source. Example:

    PMs → spouses
    PMs → alma maters

### 4. Combine node

Set algebra: union, intersection, difference. Example:

    Labour PMs' alma maters ∩ Conservative PMs' alma maters

## MVP Scope

MVP should be deliberately small.

**Build:**

1. Adapter from existing pivot notebook state to nodes + edges.
2. Read-only graph rendering.
3. Typed edge badges: type, count, source, cached/not cached if known.
4. Basic responsive layout.
5. Keep execution through existing `net()` helper.
6. Preserve existing dev/network panel.

**Do not build yet:**

    drag ports
    visual query editing
    combine node execution
    TriG import/export
    AI annotation support
    full cache store
    collaborative editing
    advanced versioning

## Scale — DOM today, GPU eventually

Raised during May 2026 testing: the seed for UK parliamentarians via
`?pos wdt:P1001 wd:Q145` returns 17,382 distinct people. `LIMIT 500` in
the seed query hides 97% of that set — and any filter you apply
operates on just the visible slice, not the underlying total. That
**"subsetting undercuts the point"** observation is correct: at this
scale, the current architecture is sampling, not browsing.

Two orthogonal problems:

1. **Render scaling.** Today every tile is a real DOM `<img>`. iOS
   Safari starts to chug above ~1,000 tiles. The browser-native fix is
   **virtualised scrolling**: render only the ~60 tiles in the
   viewport, recycle nodes as the user scrolls. Bumps practical
   ceiling to maybe 50,000 tiles with no API changes.

   For real-Pivot-Viewer behaviour at hundreds-of-thousands, the
   target is a **GPU canvas**: a `<canvas>` (WebGL or WebGPU) where
   each tile is a textured quad. Labels can be rendered to off-screen
   `<canvas>` 2D contexts and uploaded as textures (cheap; we already
   know `OffscreenCanvas` ships everywhere we care about). Image
   thumbnails ditto. Animation between groupings becomes a vertex
   shader.

2. **Filter scaling.** Even with GPU rendering, the seed has to
   actually contain the rows you want to filter. Two paths:

   - **Push facets into the SPARQL**: each facet selection becomes a
     WHERE clause; re-fire the seed query when filters change. Cheap
     for the client; relies on QLever being fast (it is, ~0.5–2 s for
     this shape). Currently we filter client-side because the seed is
     cached and filters animate; the server-side push would re-fetch
     per filter change. A hybrid: client-side for the first 500,
     server-side bump when the user "snapshots" or asks for "all of
     them".
   - **Bloom filters for set membership**: ship a compact (~30 KB)
     bloom of the full 17K QID set, query QLever lazily for rows on
     demand as the user scrolls. Cheaper than re-firing, more code.

The "promote selection as new step" button shipped this commit is
the smallest step that respects the user's mental model: filter
fluidly *and then commit* the subset as its own provenance node, so
later pivots branch from a known, named slice. Persists in the graph
DAG; the live-seed-with-filters becomes a transient stage.

## Out of Scope for This Sketch

    multi-user collaborative editing
    backend persistence
    undo/version control beyond URL hash
    large endpoint catalogue
    anything beyond Wikidata / FPKG / one or two known endpoints
    full RDF-native runtime
    general-purpose graph database UI

## Implementation Notes for Claude Code

**Target area:** `/kgx/demos/pivot/`

**Likely file:** `/kgx/demos/pivot/index.html`

Use the existing `net()` helper. The graph view should sit above the
current request layer.

**First task:** find the current in-memory representation of the linear
notebook / pivot steps (it's `STEPS[]` today). Write a small adapter
that converts it into:

    {
      version: 1,
      nodes:   [...],
      edges:   [...],
      views:   [...]
    }

**Suggested initial node shape:**

    {
      id:    "n1",
      kind:  "Source",
      label: "UK Prime Ministers",
      op: {
        endpoint: "qlever/wd",
        query:    "...",
        type:     "human"
      }
    }

**Suggested initial edge shape:**

    {
      id:   "e1",
      from: "n1",
      to:   "n2",
      value: {
        type:   "human",
        count:  59,
        source: "qlever/wd"
      }
    }

**Suggested initial view shape:**

    {
      id:   "v1",
      edge: "e1",
      view: "tilegrid"
    }

Graph render can initially be plain HTML/CSS/SVG. Avoid heavy
frameworks. Use a simple layered layout.

**If implementing manually:**

1. Assign each node a depth from source.
2. Group nodes by depth.
3. Stack nodes within each depth.
4. Draw SVG paths between node boxes.
5. On mobile, use vertical depth.
6. On desktop, optionally switch to horizontal depth.

No React unless explicitly chosen later.

## Acceptance Criteria for MVP

A successful first increment should satisfy:

1. Existing pivot notebook still works.
2. A read-only graph view can be toggled on.
3. The graph reflects the current linear walk.
4. Each step appears as a node.
5. Each transition appears as an edge.
6. Edges show at least type/count where available.
7. Existing network/dev panel still sees requests.
8. No new backend is required.
9. It is readable on a phone-width viewport.
10. Implementation does not preclude later branching/forks.

## Example User Story

As a user exploring KGX pivots, I want to start with UK Prime Ministers,
filter to Whig PMs active in the 1700s, pivot to their children,
continue through descendants, and intersect with royal ancestors, while
retaining a compact visual sense of the whole derivation chain.

The UI should let me see:

    B1  UK PMs
        source: wikidata-qlever
        quality: curated only
        count: 59
     ↓ filter(party=Whig, activeDate overlaps 1700s)
    B2  18th-century Whig PMs
        count: 14
     ↓ expand(children)
        relation: wdt:P40
        evidence: curated only
        alternatives: sons, daughters, first child, family, associates
    B3  Children of B2
        count: 47
     ↓ expand(children)
    B4  Grandchildren of B2
        count: 132
     ↓ intersect(ancestors-of Queen Elizabeth II)
    B5  PM-linked royal ancestors
        count: 2

## Key Principle

**Do not silently change semantics.**

If a node starts as `children` and gets changed to `sons` / `family` /
`associates` / `children plus weak AI annotations`, that is a **fork or
variant**, not the same bundle.

The UI should make these differences visible.

## Final Design Position

The project does not need a full graph editor first. It needs a
graph-shaped interpretation of the existing notebook.

Build the read-only DAG view first. Keep JSON in the URL hash. Keep
execution through `net()`. Add richer edge metadata and branch semantics
incrementally. Use TriG later as the durable graph-of-graphs manifest
when saving, sharing, replaying, or exchanging workflows beyond the
browser.

---

## Relation to the existing pivot page

Cross-references for the implementer reading this in May 2026:

- The "linear notebook" lives in `STEPS[]` in
  `/demos/parliament-live/web/kgx/demos/pivot/index.html`.
- Each step today has `{ id, kind, title, source, sourceStepIdx, via,
  type, rows[] }` — already close to the proposed node shape.
- The `net()` helper is the funnel for every HTTP request and feeds the
  dev panel.
- "Local reslice vs persistent fork" — the existing facets, search and
  group-by are already pure-client reslices over a step's in-memory
  rows. See the short
  [`node-flow-sketch.md`](./node-flow-sketch.md#pivot-viewer-fluidity--local-reflow--graph-edit)
  for the Pivot-Viewer-style fluidity addendum.
