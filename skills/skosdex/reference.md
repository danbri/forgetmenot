# skosdex — reference

Deeper detail behind [`SKILL.md`](SKILL.md). skosdex
(`https://skosdex.fly.dev/`, source `github.com/danbri/skosdex`) is a
skills-first toolkit that fetches, normalises and indexes many SKOS
concept schemes. All figures below are from the **2026-06-12** build
and were re-checked live when this reference was written.

## Architecture

Data pipeline: **fetch → normalise to N-Quads → canonicalise (W3C
RDFC-1.0) → bundle**. The bundle is served two ways:

- **Solr** (`/solr/skos/select`) — one document per concept, optimised
  for full-text label/definition search. ~2,546,480 docs.
- **Oxigraph SPARQL** (`/query`) — the same RDF as **named graphs, one
  per scheme**. ~3,121,417 `skos:Concept`.
- **Static web frontend** (`/`, `/galaxy.html`, `/queries.html`) for
  human browsing + a SPARQL cookbook.

The two surfaces are built from the same source vocabularies but are
*separate stores* — Solr is not a view over Oxigraph. Solr is the
quick path for "find the concept"; SPARQL is the path for "walk the
graph".

## Corpus size (manifest, 2026-06-12)

`/manifest.json` has three top-level keys: `generated`, `included`,
`excluded`.

- **`included`: 648 schemes** actually in the bundle.
  - by `licenseClass`: 613 `open`, 28 `public-domain`, 5 `copyleft`,
    2 `noncommercial`.
  - total ~211M quads (dominated by AGROVOC at ~10M, Getty AAT/ULAN,
    EuroVoc, …).
- **`excluded`: 4 schemes** — metadata-only, kept out of the
  distributed bundle (e.g. `licenseClass: noncommercial`,
  `reason: "excluded (bundle: false)"`).

Each `included` entry looks like:

```json
{
  "slug": "agrovoc",
  "title": "AGROVOC",
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "licenseClass": "open",
  "containerOnly": false,
  "modifications": "N-Quads syntax normalization only; no semantic changes",
  "graph": "http://aims.fao.org/aos/agrovoc",
  "quads": 10089090
}
```

The `graph` value is the **named-graph IRI in the SPARQL store** and
also the `scheme` value in Solr — the join key across all three
surfaces.

## SPARQL: named graphs (the crucial detail)

The default graph is empty. **Every triple lives in a named graph
whose IRI equals the scheme IRI.** Consequences:

```sparql
-- WRONG: default graph, returns nothing
SELECT * WHERE { ?s ?p ?o } LIMIT 5

-- RIGHT: across all graphs
SELECT (COUNT(*) AS ?n)
WHERE { GRAPH ?g { ?s a <http://www.w3.org/2004/02/skos/core#Concept> } }
```

List the graphs (== the schemes):

```sparql
SELECT DISTINCT ?g WHERE { GRAPH ?g { } } ORDER BY ?g
```

Concept count per scheme (top three live: LCSH ~513k, Getty ULAN ~403k,
Getty AAT next):

```sparql
SELECT ?g (COUNT(*) AS ?n)
WHERE { GRAPH ?g { ?s a <http://www.w3.org/2004/02/skos/core#Concept> } }
GROUP BY ?g ORDER BY DESC(?n)
```

Restrict to one scheme by naming its graph:

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?c ?l WHERE {
  GRAPH <http://eurovoc.europa.eu/100141> {
    ?c skos:prefLabel ?l . FILTER(LANG(?l) = "en")
  }
} LIMIT 20
```

HTTP protocol: standard SPARQL 1.1. `GET ?query=…` or `POST` (form-
urlencoded `query=…`, or `Content-Type: application/sparql-query` with
the query as the body). `Accept` selects the result format
(`application/sparql-results+json`, `…+xml`, `text/csv`,
`text/tab-separated-values`; Turtle / RDF-XML for `CONSTRUCT` /
`DESCRIBE`). The CLI POSTs automatically for queries over ~1500 chars.

## Recipes

### Walk the hierarchy (narrower of a concept, with English labels)

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?narrower ?l WHERE {
  GRAPH ?g { <http://aims.fao.org/aos/agrovoc/c_5196> skos:narrower ?narrower . }
  OPTIONAL { GRAPH ?g2 { ?narrower skos:prefLabel ?l FILTER(LANG(?l) = "en") } }
} LIMIT 50
```

(e.g. AGROVOC `c_5196` → `c_27742` "biological nitrogen fixation".)

### Bridge a concept across vocabularies

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?match WHERE {
  GRAPH ?g { <http://aims.fao.org/aos/agrovoc/c_27742> ?p ?match .
             FILTER(?p IN (skos:exactMatch, skos:closeMatch)) }
}
```

`mapping` (in Solr) collects all of these into one multi-valued field.

### Find a concept fast, then go to SPARQL

Solr first (cheap), then take the `id` URI into a SPARQL `GRAPH` query
for hierarchy or mappings:

```sh
parl skosdex search "biological nitrogen fixation" --rows 1 --fl id,scheme
parl skosdex concept http://aims.fao.org/aos/agrovoc/c_27742
```

## Solr query reference

Endpoint: `GET /solr/skos/select`. Standard Solr params:

| Param | Notes |
|---|---|
| `q` | query; bare term hits the default field, or field-scope it (`prefLabel:climate`, `altLabel:GDP`) |
| `fq` | filter query — scope to a scheme: `fq=scheme:"http://eurovoc.europa.eu/100141"` |
| `rows` / `start` | page size / offset |
| `fl` | comma-separated fields to return |
| `wt` | response writer (`json` default here) |
| `facet=true&facet.field=…` | faceting (note: not every field is configured for faceting) |

Document fields: `id`, `scheme`, `prefLabel`, `altLabel`, `exactLabel`,
`definition`, `broader`, `narrower`, `exactMatch`, `closeMatch`,
`mapping`, `inScheme`, plus Solr internals `_version_`, `_root_`.

The Solr `search` count for a term in a single scheme is just a
`q` + `fq` + `rows=0` request (read `response.numFound`):

```sh
curl -sLG 'https://skosdex.fly.dev/solr/skos/select' \
  --data-urlencode 'q=prefLabel:energy' \
  --data-urlencode 'fq=scheme:"http://eurovoc.europa.eu/100141"' \
  --data-urlencode 'rows=0'      # => numFound 62
```

## Library surface

`lib/facilities/skosdex.mjs` exports:

| Function | Purpose |
|---|---|
| `query(sparql, opts, ctx)` | raw SPARQL; GET, or POST when long / `method:'post'`; `format` selects Accept |
| `search(q, opts, ctx)` | Solr; `rows`, `start`, `fl`, `scheme` (→ `fq`), `wt` |
| `schemes(opts, ctx)` | list named graphs (== schemes); `limit` |
| `concept(uri, opts, ctx)` | labels + broader/narrower/related/mappings for one URI, across graphs |
| `manifest(ctx)` | the `/manifest.json` corpus manifest |

Exported constants: `BASE`, `ENDPOINT` (`/query`), `SOLR`
(`/solr/skos/select`), `MANIFEST` (`/manifest.json`).

## Caveats

- **Not UK Parliament.** Tier-3 third-party. Authority for a concept is
  its source scheme; always name the scheme alongside "via skosdex".
- **Licence is per-scheme.** The bundle excludes noncommercial schemes
  (held as metadata only). Consult the manifest before reuse.
- **Solr ≠ SPARQL store contents 1:1.** Concept counts differ (Solr
  ~2.55M docs vs SPARQL ~3.12M `skos:Concept`) because they're built
  separately and index different shapes. Treat each as its own surface.
- **Small host.** Fly.io instance; keep result sets bounded and prefer
  Solr for label lookups.
- **Empty SPARQL result?** First suspect: a missing `GRAPH ?g { … }`.
