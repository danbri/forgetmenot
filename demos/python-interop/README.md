# Python interop demo — read a kgx daisychain manifest

A ~250-line Python utility that loads a kgx daisychain TriG manifest
with `rdflib` and reconstructs the chain spec — title, branches,
steps in execution order — without any FPKG client code.

The point: FPKG's writable Oxigraph stores chain manifests as
standard TriG (Turtle-with-Graphs) using a well-defined vocabulary.
Any RDF-aware tool — Python's rdflib, Java's Jena, Rust's Oxigraph
CLI, the SPARQL Anything project, command-line `roqet`, even
LibreOffice's Calc with an RDF plugin — can read them. There is no
"daisychain API" to negotiate. The manifest IS the API.

## Daisychain 1.0 — converged Python + JS DAL

As of Daisychain 1.0 the Python and JavaScript implementations share
one data-access layer with five operations — **load / validate / plan /
run / emit** — and byte-identical planners, enforced by
`tests/test_kgx_conformance.sh` over every chain in `examples/`.
Contract: [`docs/kgx/daisychain-1.0.md`](../../docs/kgx/daisychain-1.0.md).

```sh
# Python CLI
python3 kgx_chain.py --json chain.trig          # load  → spec JSON
python3 kgx_chain.py --validate chain.trig      # {ok, issues}
python3 kgx_chain.py --plan last chain.trig     # {endpoint, sparql, beads}
python3 kgx_chain.py --run  last chain.trig     # SPARQL results JSON
python3 kgx_chain.py --emit chain.trig          # normalized TriG

# JS CLI (same verbs, same outputs)
node kgx.mjs spec     chain.trig
node kgx.mjs validate chain.trig
node kgx.mjs plan     chain.trig last
node kgx.mjs run      chain.trig last
```

## Three ways to run it

- **Python CLI**: `kgx_chain.py` (needs `pip install rdflib`).
- **JS CLI**: `kgx.mjs` (Node; delegates TriG→spec to Python, then
  plans/runs via `kgx_core.mjs` — the same module the browser uses).
- **In your browser**: open
  [`pythonchain.html`](pythonchain.html) — the same `kgx_chain.py`
  loaded into Pyodide (Python compiled to WebAssembly) so parsing runs
  entirely client-side, plus `kgx_core.mjs` for plan/run. The browser
  demo is reachable on prod at
  <https://fpkg.fly.dev/python-interop/pythonchain>.

## Setup

```sh
pip install rdflib       # the only dependency
```

## Usage

```sh
python3 kgx_chain.py <file.trig>           # human-readable summary
python3 kgx_chain.py --json <file.trig>    # spec as JSON
python3 kgx_chain.py --query "<SPARQL>" <file.trig>
cat manifest.trig | python3 kgx_chain.py - # stdin
```

## Worked examples

### 1. Summarise a fork chain

```sh
# Generate one from the FPKG library and read it back via Python:
node -e "import('./demos/parliament-live/web/kgx/lib/library.mjs').then(({LIBRARY}) =>
  import('./demos/parliament-live/web/kgx/lib/trig.mjs').then(({chainToTrig}) => {
    process.stdout.write(chainToTrig(LIBRARY.find(x => x.id === 'fork-demo')));
  }))" > fork.trig

python3 kgx_chain.py fork.trig
```

```
title:   Fork demo — sitting Labour, branching to birthplaces
sub:     tree-shape chain: shared {starter → Labour → sitting} prefix, fork into birthplaces.
id:      fork-demo
branches (2, active = 'with-bp'):
  - main
    1. source = uk-mps-1900
    2. party = 'Labour Party'
    3. sitting
  - with-bp
    forked from 'main' at bead 2
    1. pivot birthplaces / default
```

### 2. JSON spec for piping into other tools

```sh
python3 kgx_chain.py --json fork.trig | jq '.branches[].steps[].op // .branches[].steps[].id'
```

### 3. Arbitrary SPARQL — the real interop value

Find every filter step across every chain in a directory:

```sh
for f in saved-chains/*.trig; do
  python3 kgx_chain.py --query '
    PREFIX kgx: <urn:kgx:vocab:>
    SELECT ?op ?value WHERE {
      GRAPH ?chain {
        ?bead a kgx:FilterBundle ; kgx:op ?op .
        OPTIONAL { ?bead kgx:opValue ?value }
      }
    }' "$f"
done
```

Find every chain that pivots through `alma_maters`:

```sh
python3 kgx_chain.py --query '
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX kgx: <urn:kgx:vocab:>
SELECT ?title WHERE {
  GRAPH ?chain {
    ?chain dct:title ?title .
    ?bead a kgx:PivotBundle ; kgx:relTemplate "alma_maters" .
  }
}' manifest.trig
```

## The six-primitive algebra

The chain model the tool reads is a DAG over six primitive operators:

    Source / Filter / Pivot / Augment / Union / Intersect / Difference

Filter / Pivot / Augment have one main input (`kgx:input`); Union /
Intersect take an `rdf:List` of inputs (`kgx:inputs`); Difference
takes a `kgx:main` plus an `rdf:List` of `kgx:auxiliary` streams to
subtract. Today's named ops (`party`, `sitting`, `decade`,
`enrich`, …) decompose into Filter / Augment / Pivot with a
specific grounding; the kgx vocab privileges none of them and no
specific knowledge graph (every endpoint is just an `sd:Service`).

See `docs/kgx/chain-algebra.md` (DISCUSSION ONLY, dated 2026-06-12)
for the full design, including the optimising interpreter that fuses
runs of compatible beads into single `kgx:Execution` records.

The Python tool detects the chain's `shape`:

- `shape: linear` — a single chain of single-input beads.
- `shape: branched` — single-input beads in named branches with
  fork points (back-compat with the existing fork-demo).
- `shape: DAG` — at least one multi-input bead (Union / Intersect /
  Difference); rendered in topological order with input edges
  surfaced per step.

## Honesty about grounding

A chain manifest today describes the *structural shape* — lineage,
branch tree, op names — but not the *grounding*: which SPARQL
endpoint, which property / class IRIs, which actual SPARQL fragment
per step. A third-party tool can read the chain but can't actually
execute it. The tool surfaces this honestly:

- For each step it prints `✓ grounded`, `◐ partial` (has a gloss but
  no executable info) or `⚠ ungrounded` (nothing).
- For chains with no `kgx:Execution` records, it ends with
  `executions: none recorded — the chain has no kgx:Execution plan,
  so a third-party tool can't tell what actually ran`.

The proposed grounding vocabulary (DISCUSSION ONLY — see
`docs/kgx/trig-manifest-review.md`) adds per-bead `kgx:gloss`,
`kgx:queryAgainst` (pointing at an `sd:Service`), `kgx:sparqlFragment`
and `kgx:executedBy` (a `kgx:Execution` that may fuse several beads
into one engine call). The two `pythonchain.html` examples *Grounded
+ fused* and *With variants* show the proposed shape; the
*Linear / Fork / Augment* examples show the current (ungrounded)
emit. **No KG is privileged**: every target is `sd:Service` with an
`sd:endpoint`, whatever its origin.

## What this proves

- The TriG manifest is genuine interchange — anyone with `rdflib`
  (or any RDF library in any language) can read it.
- The vocabulary is small enough to learn in five minutes
  (`SourceBundle`, `FilterBundle`, `PivotBundle`, `AugmentBundle`,
  `derivedFrom`, `branch`, `activeBranch`, `starterId`, `op`,
  `opValue`, `relTemplate`, `relVariant`).
- Round-trip is byte-faithful: load TriG → spec → re-emit → identical
  TriG (modulo the random graph UUID — pin it with `graphIri` if you
  need bit-stable output).
- Cross-chain queries work — multiple manifests in one Dataset, no
  IRI collisions, SPARQL planning across them. Phase 2A's chain-scoped
  URN IRIs are what makes this clean.

## Limitations

This script is a demo, not a library. It:

- doesn't validate manifests against a SHACL shape (the vocabulary
  isn't documented as SHACL yet — see
  [trig-manifest-review.md](../../docs/kgx/trig-manifest-review.md)
  Phase 2B);
- doesn't materialise per-bead result data — manifests today carry
  the chain's *structure*, not the RDF facts each augment produced
  (slim-channel Step 2 will close this);
- pins the `urn:kgx:vocab:` namespace at the top of `kgx_chain.py`
  (if the vocab IRI ever moves, that constant needs updating).

For the canonical reader, see `demos/parliament-live/web/kgx/lib/chain-store.mjs`
(JavaScript) — the FPKG page uses that to load saved chains from its
writable Oxigraph.
