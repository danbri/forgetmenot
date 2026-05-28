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

## Pivot-Viewer fluidity — local reflow ≠ graph edit

The sketch above treats every set-shape change as a node boundary.
That's right for *graph structure* (provenance, persistence, sharing)
but wrong for *interaction texture*.

Pivot Viewer's defining move was that you don't redraw the graph to
slice a set — you fluidly reflow tiles in place, with animated
transitions. Drag a "Gender" facet onto a histogram of movies-by-year
and the bars smoothly split into stacked pairs. Restrict by genre and
empty bars collapse into the gaps. No new node; the *view* re-stages
the same set.

That's a separate axis from the DAG. Reconciling:

**Two kinds of transformation on a `View` node:**

- **Local reslice (Pivot-Viewer style).** Pure-client. The view holds
  the set in JS memory; the user toggles a facet, changes the
  group-by, switches axis. The DOM rearranges via FLIP / View
  Transitions / Web Animations. No SPARQL hit, no new node.
- **Persistent fork.** A button on the view ("commit this slice as a
  new step") promotes the currently-visible subset into a fresh
  downstream node. Provenance preserved; subsequent pivots see the
  smaller set.

**Implications for the schema:**

```jsonc
{
  "id": "n3",
  "kind": "View",
  "op": { "view": "histogram", "bin": "year", "binSize": 10 },
  "ui": {
    "filters": { "gender": ["female"] },     // local-only state
    "highlight": "Q12345"                    // local-only state
  }
}
```

`op` is the persistent graph state — shared via permalink, recorded in
history. `ui` is volatile per-view state — discarded on reload unless
the user explicitly forks it into a new node.

**View kinds and what reflow looks like in each:**

| View | What changes when you twiddle a control |
|---|---|
| **Grid** | tile re-order via key reconciliation; FLIP transform |
| **Histogram** | bars split / merge / resize; tiles fly to their new bin |
| **Map** | pins fade in / out; cluster sizes reanimate |
| **Timeline** | dots slide along the axis as the date facet narrows |
| **Force-graph** | nodes recompute physics; edges fade with filter |

**Why View Transitions API is enough for most of this.** Modern
browsers (Safari 18, Chrome 111+) reconcile DOM diffs across a single
`document.startViewTransition` call automatically — the FLIP work
becomes implicit. Our `/kgx/demos/pivot/` already uses it for filter +
group-by changes; the histogram and map views would just be more
visually elaborate cases of the same primitive.

**The pivot page is the prototype for one view kind.** Building the
node-flow tab on top of it means:

- Reuse `STEPS[]` as the underlying DAG (it's already that)
- Reuse `applyFilters() + renderNotebook()` as the local-reflow engine
  for whichever step the user is focused on
- Add new view ops (`histogram`, `map`, `timeline`) by writing one
  renderer each — they all consume the same set shape

So the node-graph is the persistent transformation lattice. The view
is the fluid local stage on top of it. Different commitments, both
visible at once.

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
