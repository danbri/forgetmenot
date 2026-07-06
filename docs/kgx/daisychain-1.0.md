# Daisychain 1.0 — the converged DSL toolchain / API / CLI

> **SHIPPED.** This is the contract both implementations satisfy today,
> enforced by `tests/test_kgx_conformance.sh` over every chain in
> `demos/python-interop/examples/`. Changes to either implementation's
> plan output must land in both, in the same commit, with the
> conformance suite green.

## Daisychain is a DSL that compiles to SPARQL

A kgx chain is a program in a small **domain-specific language** for
set-based dataflow over knowledge graphs. The vocabulary is the
language: `SourceBundle` / `FilterBundle` / `PivotBundle` /
`AugmentBundle` for single-input ops, `UnionBundle` / `IntersectBundle`
/ `DifferenceBundle` for the set ops, wired by `kgx:input` /
`kgx:inputs`. A chain says *what* set of things you want and *how* it's
derived — it does not hand-write SPARQL.

The point of 1.0 is that the language now has a **compiler**, and two
implementations of it agree byte-for-byte. `plan` is the compile step:
it takes the chain program **plus the circumstances** — which bead is
in focus, the endpoint that bead targets, the cumulative upstream
context, the active variant — and lowers all of that to one concrete
SPARQL query, on demand. The browser recompiles as you click a
different bead; an agent compiles by naming a bead on the command line;
both get the identical query.

The five operations are a compiler toolchain over the DSL:

| operation | compiler role |
|---|---|
| **load**     | parse — TriG source → spec (the AST) |
| **validate** | typecheck — structural / static analysis of the spec |
| **plan**     | compile — chain + focus + circumstances → SPARQL |
| **run**      | execute — send the compiled query to its endpoint |
| **emit**     | serialize — spec / graph back to TriG source |

## What converged

Two implementations of the same DSL toolchain over kgx chain
manifests:

| | Python | JavaScript |
|---|---|---|
| module | `demos/python-interop/kgx_chain.py` | `demos/python-interop/kgx_core.mjs` |
| CLI | `python3 kgx_chain.py <verbs>` | `node kgx.mjs <verbs>` |
| runs in | CLI, CI, Pyodide (browser) | browser (`pythonchain.html`), Node |

The **spec JSON is the interchange boundary**:

```
TriG ──(load: Python/rdflib)──▶ spec JSON ──(plan: either)──▶ {endpoint, sparql}
                                                │
                                                └──(run: either)──▶ SPARQL results JSON
```

Python owns TriG→spec (rdflib is the reference parser; in the browser
the *same Python* runs under Pyodide). Both sides implement
plan/run/validate over the spec, and the planners are **byte-identical**
— same fragment fusion, same prefix injection, same `SELECT DISTINCT`
/ `LIMIT` framing. An AI agent can hold either CLI and get the same
answers; a browser user clicking ▶ Run gets the same query an agent
gets from the command line.

## The five operations in detail

### load — TriG → spec (parse)

```sh
python3 kgx_chain.py --json chain.trig     # canonical
node kgx.mjs spec chain.trig               # delegates to Python
```

Spec shape (produced by `chain_to_spec`):

```jsonc
{
  "title": "…", "sub": "…",
  "shape": "linear" | "branched" | "dag",
  "steps":    [ /* linear */ ],
  "branches": [ {"id", "steps", "forkedFrom"} ],
  "dag":      [ /* topo order */ ],
  "executions": [ {"iri", "endpoint", "fusedSparql", "fuses", …} ]
}
```

Each step: `{kind, uri, kind_kgx, inputs: [{role, iri}], grounding:
{endpoint, sparqlFragment | sparql, gloss, produces, …}, grounded:
"grounded"|"partial"|"ungrounded"}`.

### validate — spec → {ok, issues} (typecheck)

```sh
python3 kgx_chain.py --validate chain.trig
node kgx.mjs validate chain.trig
```

Errors (exit 1): unresolved `input` edges, empty chain. Warnings:
ungrounded beads. Both implementations produce the same issue list.

### plan — (spec, bead, circumstances) → {endpoint, sparql, beads} (compile)

```sh
python3 kgx_chain.py --plan last chain.trig     # or --plan bead:5, --plan <uri>
node kgx.mjs plan chain.trig last
```

The heart of the convergence. The planner walks `kgx:input` edges
upstream from the target bead, collecting every transitively-reachable
**fusable** bead (`SourceBundle` / `FilterBundle` / `PivotBundle` with a
`kgx:sparqlFragment` on the *same endpoint*), upstream-first, and emits:

```
SELECT DISTINCT * WHERE {
  <fragment₀>
  <fragment₁>
  …
} LIMIT 50
```

with `PREFIX` declarations prepended for every known prefix the body
uses (fixed table, fixed iteration order — see `KNOWN_PREFIXES` in
either implementation).

- `AugmentBundle` carries a full `kgx:sparql` (with `VALUES`) — its plan
  is that query verbatim (prefix-injected), single-bead.
- Bead addressing: full URI | `:suffix` tail-match | `last`.
- `--limit N` overrides the row cap; `--sparql-only` prints bare SPARQL.

**Conformance:** `tests/test_kgx_conformance.sh` requires
`py_plan == js_plan` byte-for-byte on all example chains, and that both
sides *refuse* to plan the same unplannable beads with the same exit
status.

### run — plan → SPARQL results JSON (execute)

```sh
python3 kgx_chain.py --run last chain.trig
node kgx.mjs run chain.trig last
```

GET `endpoint?query=…` with `Accept: application/sparql-results+json`.
The browser page (`pythonchain.html`) uses the identical `planBead` →
fetch path via `kgx_core.mjs` — the ▶ Run button and the CLIs cannot
drift apart.

### emit — graph → normalized TriG (serialize)

```sh
python3 kgx_chain.py --emit chain.trig
```

Round-trips the manifest graph through rdflib's TriG serializer
(normalization, stable ordering). JS defers emit to the canonical
`chainToTrig` in `demos/parliament-live/web/kgx/lib/trig.mjs`, which
owns spec→TriG for chains authored in the daisychain UI.

## Set-based dataflow, node-based dataflow

The manifest IS both views of the same program:

- **Set-based**: each bead denotes a set of bindings; Filter is set
  intersection with a predicate extension, Union/Intersect/Difference
  are the set ops, Pivot is an image under a relation. `plan` compiles
  a connected same-endpoint region of the DAG into one set expression
  (a SPARQL group graph pattern).
- **Node-based**: each bead is a dataflow node with typed ports
  (`kgx:input`, `kgx:inputs`, `kgx:main`/`kgx:auxiliary`);
  `kgx:produces` types the output port. The daisychain UI edits this
  view; `kgx_chain.py` summarizes it; Mermaid renders it.

The identity-variable convention makes the two views compose: a
Source binds `?p`; each Pivot at depth N rebinds identity to `?pN` and
projects `?labelN` / `?imageN`; consumers (tile renderer, agents) take
the highest-numbered suffix as "the chain's current entity".

## AI-readiness

Every verb is machine-consumable:

- All outputs are JSON by default (`--sparql-only` opts out for plan).
- `validate` exit codes are meaningful (0 ok / 1 structural error).
- Bead addressing accepts stable URIs, so an agent can quote a bead
  from `--json` output straight into `--plan`/`--run`.
- The negation discipline (no `MINUS` / `NOT EXISTS` in the example
  library — see [`shared-components.md`](./shared-components.md))
  keeps chain semantics monotonic: an agent can safely fuse, split,
  or re-order positive-pattern beads without changing meaning under
  incomplete data.

## Non-goals for 1.0

- No JS-native TriG parsing in the CLI (spec JSON is the boundary;
  Python/Pyodide is the reference parser).
- No SHACL validation (structural checks only).
- No cross-endpoint plan fusion — a plan stops at endpoint boundaries;
  federation runs as separate plans joined by the consumer (or via
  Augment's VALUES bridge).
- No write path (chains are authored in the daisychain UI or by hand).

## Conformance

```sh
tests/test_kgx_conformance.sh                 # plan parity, all chains
tests/test_kgx_conformance.sh --run-spotcheck # + live row-count parity
```
