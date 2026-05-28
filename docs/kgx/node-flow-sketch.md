# kgx node-flow — sketch

Design note. Not yet built. Saved here so whoever picks it up next
doesn't start from scratch.

The pivot page (`/kgx/demos/pivot/`) renders a linear scrolling
"notebook" — Seed → Pivot → Pivot → … Each step is a SPARQL hit;
the chain is a walk through related entity sets.

This is a path. A graph view generalises it: same operations, but you
can fork the same set into two different walks, then combine them later.

## Mental model

Every step is a node. Edges carry a typed entity set. Notebook ≡ a DAG
where every node has at most one input and one output (a path). The
graph view is the same data, drawn as a DAG.

## Node kinds

| Kind | Inputs | Outputs | Op config | Maps to today |
|---|---|---|---|---|
| **Source** | — | typed set | endpoint, SPARQL query, facet schema | seed step (PMs from QLever) |
| **Filter** | set | set (same type) | facet predicates, text search, date range | seed step's facets + search input |
| **Pivot** | set | set (often new type) | property (forward / `^reverse`), `groupBy` flag, dedupe limit | each "From this selection →" jump |
| **Federate** | set + join key | set (augmented same type) | second endpoint, mapping property | the deferred cross-endpoint item |
| **Combine** | 2+ sets | set | ∪ · ∩ · ∖ | not in today's app |
| **Group** | set | groups[] | property, top-N | the "Group by" select |
| **View** | set or groups[] | visual | tilegrid · table · map · chart · force-graph | the result renderers |

Edges typed by entity type: `human → human` (spouses), `human → place`
(birthplaces), `place → human` (`^P19` famous-people-born-here).

## ASCII

```
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
```

## State model

```jsonc
{
  "nodes": [
    { "id": "n1", "kind": "Source", "op": { "endpoint": "qlever/wd",
      "query": "...", "type": "human" } },
    { "id": "n2", "kind": "Pivot",  "op": { "prop": "wdt:P26",
      "groupBy": false, "target": "human" } },
    { "id": "n3", "kind": "View",   "op": { "view": "tilegrid" } }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" }
  ]
}
```

JSON-serialisable. Permalink encodes the whole thing in the URL hash
(`#g=…`). For big graphs, gzip + base64url.

## Execution

- Topological-sort the DAG.
- Compile each node to one request through the existing `net()` helper
  in `/kgx/demos/pivot/index.html`.
- Cache the result per node ID so editing a downstream `Filter` doesn't
  re-fetch the `Source`.
- Each request still flows through the dev panel — the graph view drops
  in *above* the network layer without touching it.

## UI iterations, cheapest first

1. **Read-only graph render** of the existing linear notebook — same
   walk, drawn as a DAG. Zero new operations; only a visualisation.
   Lets us check whether the metaphor reads on a 360 px phone before
   we invest in ports and drag.
2. **Edit ops** — drag a node's output port → spawn a connected child
   of chosen op type. Long-press a node → change op. Long-press an
   edge → splice in a `Filter`.
3. **Branching** — two `Pivot` nodes on the same source (PMs → spouses
   AND PMs → alma maters in parallel).
4. **Combine node** — set algebra. Intersect "Labour PMs' alma maters"
   ∩ "Conservative PMs' alma maters".

The MVP (1) is the cheap win.

## Tech choices to make later

- **Layout engine**: ELK.js (declarative, server-side-renderable, ~150 KB)
  or a tiny custom DAG layout. Avoid Cytoscape / d3-force for this —
  they're force-directed; we want a tidy left-to-right Sugiyama layout.
- **Port-drag library**: rete.js? Or write the 200 lines ourselves —
  pointermove + SVG paths is not hard for a single-page tool.
- **Persistence**: same `#hash` permalink pattern the playground uses.
  No backend needed.

## Out of scope for the sketch

- Multi-user collaborative editing.
- Re-arrangement / undo / version control of the graph beyond the URL
  hash.
- Anything beyond Wikidata / FPKG / one or two well-known endpoints in
  the catalogue.
