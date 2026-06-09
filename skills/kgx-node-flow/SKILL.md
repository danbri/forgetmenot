---
name: kgx-node-flow
description: kgx node-flow lib — the canonical implementation of the daisychain / pivcab / studio op-node API. Use when wiring a new chain, adding an op kind, exposing a new SPARQL endpoint, writing tests against the library chain spec, generating a TriG manifest from a chain, or debugging why a saved chain isn't replaying. Read this before touching `demos/parliament-live/web/kgx/lib/*.mjs`, `demos/parliament-live/web/kgx/daisychain/index.html` op-table or starter-list, `bin/kgx.mjs` SPARQL routing, or the LIBRARY iteration tests.
---

# kgx node-flow — implementation guide

The browser pages (`/kgx/daisychain/`, `/kgx/pivcab/`, `/kgx/studio/`),
the Node CLI (`bin/kgx.mjs`), and the unit-test runner all consume one
library at **`demos/parliament-live/web/kgx/lib/*.mjs`**. Read here
before changing op behaviour; the lib is the single source of truth.

## The abstraction

A chain is a sequence of typed **Bundle** transformations:

```
() ────────────────────► { Bundle<T>, Source }     SOURCE  (starter)
Bundle<T> ─────────────► Bundle<T>                 RESTRICT (filter/picker)
Bundle<T> ─────────────► { Bundle<U>, Source }     PIVOT    (rel-template)
Bundle<T> ─────────────► { Bundle<T>+, Source }    AUGMENT  (enrich/federate)
Bundle<T> × Bundle<T> ─► Bundle<T>                 COMBINE  (∪ / ∩ / ∖)
```

Each non-restrict op mints a `Source` provenance bead (engineId, query,
ms, bindings, ts, note, namedGraphs). The chain is a sequence of these
beads.

## Modules

| File | What it exports | Purity |
|---|---|---|
| `node-flow.mjs` | `Bundle`, `Bloom`, `valuesQids`, `parsePoint`, `httpsify`, `commonsThumb`, `escapeHTML` | pure data + helpers |
| `engines.mjs` | `SparqlEngine` class, `ENGINES` registry, `engine(id)` resolver | runtime (fetch) |
| `sparql-validate.mjs` | `assertNoAliasCollisions(query, label)` | pure |
| `restrict.mjs` | `opFilters` (18 pure-client filters), `OP_FIELDS` (op→{field,types[]}), `opsRelevantTo(type)`, `nameGender`, `countBy`, `sortByKey`, `topCounts`, `GENDER_NAMES_FEMALE/_MALE` | pure |
| `frontier.mjs` | `frontierOf(bundle)` → `{type,size,facets,presence,uniform}` — data-driven "what can I slice here" (backs `kgx chain frontier`) | pure |
| `rel-templates.mjs` | `REL_TEMPLATES` (12 templates, 18 variants), `valuesMnisPersons` | pure data + pure build/parse |
| `starters.mjs` | `STARTERS` (9 entries — 5 SPARQL + 4 PQ shape), per-starter parse functions, `POST1900_MPS_QUERY`, `SEED_LIMIT` | pure data + pure parse |
| `augment.mjs` | `AUGMENT_OPS` (enrich / parl-enrich / identity-bridge), each with declarative `applicableTo` ({types, requiresFields/anyOfFields, uriPattern}) | pure data + pure query/parse |
| `quality.mjs` | `isVariantAllowedByPolicy`, `isOpAllowedByPolicy`, `variantsAllowedByPolicy`, `VALID_MODES` | pure |
| `library.mjs` | `LIBRARY` (23 saved chains incl. a fork-demo) | pure data |
| `branches.mjs` | `normaliseChainSpec(spec)`, `activeChainSteps(normalised)` | pure |
| `trig.mjs` | `chainToTrig(spec)` → TriG manifest string | pure |
| `runner.mjs` | `runChainSpec(spec, ctx)`, `UnsupportedOpError`, `OP_ALIASES`, `resolveOpStep(step)` | runtime (calls ctx.engine / ctx.pq) |

**Op aliases:** legacy chip ids (`pivot-bp`, `pivot-am`) are sugar for
rel-pivot templates. `resolveOpStep(step)` canonicalises them and is the
single source every surface routes through — runner (execute), `chain
explain` (narrate), `chainToTrig` (serialise), `chain validate` /
`candidates` (introspect). Never hand-roll a fifth copy of the alias
table; the paper trail must match the run.

**CLI exploration loop:** `kgx chain explain` (preview, no fetch) →
`candidates` (ops applicable to a bundle TYPE — restrict-ops filtered by
`OP_FIELDS`'s applicable-type list so an SI bundle gets `year/has-cif/
decade` not the full 18, and augment-ops filtered by each entry's
`applicableTo.types` so an SI bundle gets no augments (all three are
human-only today), with the `applicableTo` metadata surfaced per op;
pass `--all` for the blind dump) → `frontier`
(RUN, then report which slices the fetched data actually supports + their
facet counts — the frontier bead from the CLI) → `run` (JSONL beads, each
with a `bindHash` content hash) → `trig` (RDF manifest with
`prov:Activity` records). `frontier` is data-driven (reads the bundle, no
per-op metadata) so it surfaces fields the page palette doesn't hard-code.

**Adding a new opFilters entry:** also add an `OP_FIELDS[id] = { field,
types }` row in `restrict.mjs`. Tests in `kgx-restrict.test.mjs` enforce
that every opFilters key has an OP_FIELDS row and every declared type is
one the daisychain actually produces.

The page (`daisychain/index.html`) adds: state management, custom-element
UI, `loadStarter`, `runAugment`, `runRelPivot`, `applyRelation` (the
runtime wrappers that bind a lib plan to `engine()` + `makeSource()`).

## Adding a new SOURCE op (starter)

```js
// in lib/starters.mjs
export const MY_QUERY = `
PREFIX wd:   <http://www.wikidata.org/entity/>
PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
SELECT ?x ?label WHERE {
  ?x wdt:P31 wd:Q…
  OPTIONAL { ?x rdfs:label ?label . FILTER(lang(?label)="en") }
}
LIMIT 1000`;

export function parseMyRows(bindings) {
  return bindings.map((b) => ({
    uri:   b.x.value,
    label: b.label?.value || b.x.value.replace(/^.*\//, ''),
    image: null, country: null, coords: null,
  }));
}

// then append to STARTERS:
{
  id:       'my-thing',
  label:    'My thing',
  sub:      'Wikidata: every instance of …',
  type:     'thing',                   // bundle type for downstream ops
  engineId: 'qlever-wikidata',         // or 'fpkg' / 'parl-sparql'
  query:    MY_QUERY,
  parse:    parseMyRows,
  role:     'primary',                 // must be one of the four
  note:     'one-line provenance hint',
},
```

For PQ-shape (Parliament parameterised query, no inline SPARQL):

```js
{
  id:         'my-pq',
  label:      '…',
  sub:        '…',
  type:       'concept',
  pqTemplate: 'my_template',           // /api/query/my_template
  parse:      parseMyPqRows,           // (rows) => items[]
  role:       'primary',
  note:       '…',
}
```

`tests/unit/kgx-starters.test.mjs` will then pin shape contract + SPARQL
hygiene (§18.2.4.4 + prefix declarations) on the new entry automatically.

## Adding a new PIVOT op (rel-template)

```js
// in lib/rel-templates.mjs, append to REL_TEMPLATES:
{
  id: 'my_rel',
  label: 'my-rel',
  gloss: '…',
  inputType: 'human', outputType: 'org',   // bundle-type contract
  engineId: 'qlever-wikidata',
  role: 'primary',
  requires: (b) => b.items.some((x) => /Q\d+$/.test(x.uri)),
  variants: [
    {
      id: 'default', kind: 'default', label: '…',
      gloss: '…',
      namedGraphs: [],
      build: (items) => `
        PREFIX wd:   <http://www.wikidata.org/entity/>
        PREFIX wdt:  <http://www.wikidata.org/prop/direct/>
        SELECT ?org … WHERE {
          VALUES ?p { ${valuesQids(items)} }
          ?p wdt:Pxxx ?org . …
        } GROUP BY ?org`,
      parse: (rows) => rows.map((b) => ({ uri: b.org.value, label: …, … })),
    },
    // optional tighten / broaden variants:
    { id: 'narrow', kind: 'tighten', … },
    { id: 'wider',  kind: 'broaden', … },
  ],
}
```

Tests pin: every variant.build() passes §18.2.4.4; every used PNAME
prefix is declared; the `kind` is in `{default, tighten, broaden}`.
Quality-policy filter (`variantsAllowedByPolicy`) Just Works.

## Adding a RESTRICT op (pure-client filter)

```js
// in lib/restrict.mjs::opFilters, append:
'my-filter': (b, v) => new Bundle(
  b.items.filter((x) => x.myField === v),
  b.type, `${b.label} · my-filter=${v}`),
```

Daisychain's `OPS[bundle.type]` table then references it via
`run: (b, v) => opFilters['my-filter'](b, v)`. Tests pin: filter
preserves bundle type, doesn't mutate input, returns a fresh Bundle.

## Adding an AUGMENT op

```js
// in lib/augment.mjs, append:
export const myAugment = {
  id:        'my-augment',
  kind:      'enrich' | 'federate',   // federate requires joinKey
  joinKey:   '…',                     // describes the cross-source link
  engineId:  'qlever-wikidata',
  role:      'crossCheck',            // primary / crossCheck / adapterEvidence / weakEnrichment
  cap:       500,
  requires:  (b) => …,                // runtime guard on the actual bundle
  applicableTo: {                     // declarative twin of requires() — pure
    types: ['human'],                 //   data, used by `kgx chain candidates`
    requiresFields: ['mpid'],         //   to filter augments by bundle type;
    // anyOfFields / uriPattern also supported (see module doc)
  },                                  //   guard-tested in kgx-augment.test.mjs
  note:      '…',
  namedGraphs: [],
  query:     (items) => `…SPARQL with VALUES { ${items.map(…)} }…`,
  parse:     (bindings, items) => /* merge bindings into item.extra by uri/mpid */,
};
// then add to the AUGMENT_OPS map at the bottom of the file.
```

## Running a chain

**In the browser (daisychain).** The page wraps each starter / op kind:

```js
const { items, source } = await loadStarter(s);                 // sources
const out               = opFilters[step.op](bundle, step.value); // restrict
const { bundle, source } = await runRelPivot(tpl, variant, b); // pivot
const { bundle, source } = await runAugment(opId, b);          // augment
```

**In node / tests.** `runner.mjs::runChainSpec(spec, ctx)`:

```js
import { runChainSpec } from '/kgx/lib/runner.mjs';
const ctx = {
  engine: (id) => /* SparqlEngine-shaped */,    // required
  pq:     (template) => /* {rows, ms, endpoint} */, // for PQ starters
};
const { beads, bundle } = await runChainSpec(spec, ctx);
```

## Saved chain spec shape

**Flat (legacy single branch)** — accepted everywhere:

```jsonc
{
  "title": "…",
  "sub":   "…",
  "id":    "…",            // optional
  "qualityMode": "strict" | "exploratory" | "recall" | "precision",  // optional, authoring hint
  "steps": [
    { "kind": "starter", "id": "uk-mps-1900" },
    { "kind": "op",      "op":  "party", "value": "Labour Party" },
    { "kind": "op",      "op":  "rel-pivot", "template": "children", "variant": "family" },
    { "kind": "op",      "op":  "enrich" }
  ]
}
```

**Tree (forks)** — also accepted:

```jsonc
{
  "title": "…",
  "activeBranch": "with-bp",
  "branches": [
    { "id": "main", "steps": [
        { "kind": "starter", "id": "uk-mps-1900" },
        { "kind": "op", "op": "party", "value": "Labour Party" },
        { "kind": "op", "op": "sitting" }
      ] },
    { "id": "with-bp",
      "forkedFrom": { "branch": "main", "beadIdx": 2 },
      "steps": [
        { "kind": "op", "op": "rel-pivot", "template": "birthplaces", "variant": "default" }
      ] }
  ]
}
```

Both shapes pass through `branches.mjs::normaliseChainSpec(spec)`;
`activeChainSteps(normalised)` flattens the active branch's walk
(ancestor prefix up to each fork point + the active branch's own
steps). The runner, the TriG manifest emitter, the daisychain
`_replay`, and the CLI `chain run --library` all consume both shapes
identically.

Legacy aliases the runner accepts:

- `op: 'pivot-bp'`  → rel-pivot template=birthplaces variant=default
- `op: 'pivot-am'`  → rel-pivot template=alma_maters variant=default

URL hash encoding for permalinks: `#g=<base64url(JSON.stringify({steps}))>`.
Daisychain auto-syncs the hash on every state change and rehydrates from
it on load.

## Tests

```sh
npm test                                       # full suite (190 tests)
node --test tests/unit/kgx-library.test.mjs   # LIBRARY iteration: 19/20 pass
KGX_HTTP_CACHE_MODE=frozen npm test           # hermetic CI mode (no network)
rm -rf tests/fixtures/http-cache && npm test  # re-record fixtures live
```

The HTTP-cache wrapper (`tests/_lib/http-cache.mjs`) is two-tier:
committed summary (small JSON, in git) + `/tmp` full body (ephemeral,
fast local replay). See file's module-doc for cache-key derivation
(method + URL + accept + body) and the three modes (cache / live /
frozen).

## Common bugs that should fail at the lib layer, not in prod

1. **§18.2.4.4 alias collision.** `(SAMPLE(?x) AS ?x)` paired with `?x`
   in the WHERE body. Caught by `assertNoAliasCollisions`; tests pin
   every starter / rel-template / augment query.
2. **Undeclared PNAME prefix.** Emit `wd:Q…` without `PREFIX wd:`.
   Caught by the prefix-declaration test in `kgx-starters.test.mjs` +
   `kgx-rel-templates.test.mjs`.
3. **Invalid op role / quality kind.** Tests pin {primary, crossCheck,
   adapterEvidence, weakEnrichment} on every op; {default, tighten,
   broaden} on every variant.
4. **POST-vs-GET URL-length thrashing.** `SparqlEngine` switches to
   POST automatically when `query.length > 2048`. The proxy
   (`server.mjs`) only accepts POST on `/kgx/query` + `/api/sparql`;
   other proxy routes are GET-only.

## CLAUDE.md cross-references

This skill respects the demos-side rules — see
`demos/parliament-live/CLAUDE.md`:
- Rule 1 (probe-then-render): when adding a starter or rel-template,
  curl the endpoint first to read actual JSON keys before writing
  parse().
- Rule 3 (the proxy is the only path): browser code calls
  `/api/sparql`, NOT `api.parliament.uk/sparql` directly. Node tests
  go direct, because there's no proxy in node and the upstream is
  CORS-public.
- Rule 6 (OPL attribution): chain-level TriG manifests should carry
  the OPL string in `dct:license` when sharing. Not done yet — flag
  to add.
- Rule 7 (no impersonation): the Crowned Portcullis and the Royal Arms
  are out; "Forgetmeknot Palace" / "kgx" / "fpkg" are the in-vocab
  names.

## Honesty about coverage (from repo CLAUDE.md)

Every fact in this skill is anchored to source. If you find a claim
here that doesn't match `demos/parliament-live/web/kgx/lib/` reality,
fix the skill *and* the code together — drift is worse than absence.
