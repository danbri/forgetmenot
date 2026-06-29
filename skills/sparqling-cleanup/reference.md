# sparqling-cleanup — reference

## Files

| Path | What |
|---|---|
| `SKILL.md` | The one-page methodology (rule buckets A/B/C) + the discipline. |
| `bin/sparql-equiv.sh` | Equivalence checker: syntax → algebra → (optional) endpoint results. |
| `bin/sse-canon.py` | Canonicaliser for Jena's SSE algebra output (stdin → stdout). |
| `examples/houses-of-legislature.before.rq` | Messy input, captured verbatim from `api.parliament.uk/procedure-browser/legislatures/SO65GBkm`. |
| `examples/houses-of-legislature.after.rq` | Cleaned, meaning-preserving result (proved equivalent). |

The source style guide (the human checklist this methodology formalises) and the
raw captured queries are in `../../sparqling/from-trello.md`.

## Why algebra, and why canonicalise it

`qparse --print=op` prints the SPARQL **algebra** (Abstract Syntax in SSE form):
comments, whitespace and keyword case are already gone at this layer, so a pure
reformatting yields identical algebra. But two things survive raw `--print=op`
that a cleanup legitimately changes:

1. **The prefix prologue.** The algebra is wrapped in `(prefix ((..map..)) BODY)`
   and the map lists **every declared prefix, including unused ones**. So
   dropping an unused `PREFIX` (rule A3) changes the raw output even though the
   query is unchanged.
2. **Prefix-label choice.** The body writes IRIs in prefixed form (`:name`), so
   relabelling a namespace would differ textually though not semantically.

`sse-canon.py` removes both confounders: it parses the SSE, drops the `(prefix …)`
wrapper, and rewrites every prefixed name as an absolute `<IRI>`. What remains is
compared. It deliberately does **not** normalise variable names, triple order,
projection, or solution modifiers — those carry meaning.

```
(prefix ((: <…/schema/>) (rdfs: <…>) (id: <…/>))      ┐ prologue dropped
  (order (?HouseName)                                 │
    (filter (in ?Legislature id:SO65GBkm)             ├─ body kept, IRIs expanded,
      (bgp (triple ?Legislature … :Legislature) …)))) ┘ then compared
```

## Validated behaviour (run during authoring)

| Case | algebra | results @ public endpoint |
|---|---|---|
| before vs after (example; bucket-A only) | **identical** | identical (0 rows — see note) |
| same query, reformatted | identical | identical (5 rows) |
| `LIMIT 5` vs `LIMIT 3` | differs | **differ** (n=5 vs n=3) — correctly flagged |
| example vs a genuinely different query (var renamed + triple removed) | differs | — |

Note: the procedure-schema example returns **0 rows** on the public
`api.parliament.uk/sparql` (DDP) store — `:legislatureHasHouse` is populated in
the fuller store behind the procedure-browser, not in public DDP. Equivalence
still holds (both sides 0). For a non-trivial result-set demonstration use a
populated class, as the `LIMIT` test above does.

## Limitations (be honest about these)

- **Not a decision procedure.** SPARQL equivalence is undecidable in general.
  "Identical algebra" is *sufficient* for equivalence; "different algebra" is
  **not** proof of inequivalence (e.g. reordered independent triple patterns, or
  `OPTIONAL` rewrites, can be equivalent yet differ in algebra — fall through to
  the endpoint check).
- **Results equality is dataset-specific.** Identical results on one endpoint do
  not prove equivalence on all data.
- **Variable renaming is a real change.** The checker treats `?Foo` and `?foo`
  as different (they produce different output columns). This is correct: rule B8
  edits are interface changes, not cleanups.
- **`sse-canon.py` is a pragmatic SSE reader**, tuned for ARQ's `--print=op`
  output (IRIs, literals with `@lang`/`^^<dt>`, blank nodes, vars, prefixed
  names). Exotic SSE it hasn't seen may serialise imperfectly; when in doubt,
  trust the endpoint results check too.

## Tuning

- `--jena-version X.Y.Z` to pin a different Jena (default tracks a recent
  release; `dlcdn` keeps only the latest, `archive.apache.org` keeps all).
- Point `--endpoint` at a local store (see the `local-sparql` skill) to compare
  results over a controlled dataset instead of the live API.
