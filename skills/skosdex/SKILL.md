---
name: skosdex
description: "Search and query skosdex (skosdex.fly.dev) — a skills-first index of ~648 openly-licensed SKOS concept schemes (controlled vocabularies / thesauri) from around the world: AGROVOC, EuroVoc, GEMET, LCSH, Getty AAT/ULAN, IPTC NewsCodes, Loterre, Finto/YSO and many more, ~2.5M concepts with cross-vocabulary skos:exactMatch / closeMatch mappings. Two surfaces: a Solr full-text index (the fast, populated search surface) and a SPARQL 1.1 endpoint (Oxigraph) where each scheme is its OWN NAMED GRAPH — the default graph is empty, so SPARQL patterns must use GRAPH ?g { … }. Third-party, NOT UK Parliament. Use when you need to look up a subject term / concept, walk a broader/narrower thesaurus hierarchy, or bridge a term across controlled vocabularies (e.g. tag parliamentary material against EuroVoc or GEMET)."
license: "Per-scheme; the distributed bundle is open / public-domain / copyleft only (noncommercial schemes are metadata-only). Each concept carries its scheme's licence — check the manifest."
metadata:
  facility: skosdex
  base-url: https://skosdex.fly.dev
  provenance:
    tier: 3
    operator: skosdex (SKOS aggregator; danbri/skosdex)
    service: skosdex.fly.dev
    upstream-data: "~648 third-party SKOS concept schemes, normalised to N-Quads and canonicalised with W3C RDFC-1.0; bundled into a Solr index + an Oxigraph SPARQL store"
    citation-short: "via skosdex (skosdex.fly.dev)"
    citation-formal: "skosdex SKOS index (skosdex.fly.dev), retrieved {date}; underlying concept from {scheme}"
    confidence: authoritative-passthrough
    confidence-notes: "skosdex re-publishes third-party vocabularies without semantic modification (N-Quads syntax normalisation only). Authority for any concept rests with its source scheme, not skosdex — cite the scheme too. Not UK Parliament data."
---

# skosdex — SKOS thesaurus index

Hosted demo: `https://skosdex.fly.dev/` · Source: `https://github.com/danbri/skosdex`

**This is a third-party facility, not a UK Parliament one.** skosdex
collects, normalises (N-Quads + W3C RDFC-1.0 canonicalisation) and
indexes many SKOS concept schemes into one searchable place. As of the
2026-06-12 build: **648 schemes** in the bundle, **~2.5M concept
documents** in Solr, **~3.12M `skos:Concept`** across the SPARQL named
graphs. It carries the cross-vocabulary mapping web
(`skos:exactMatch` / `skos:closeMatch`), so a term in one thesaurus
can be bridged to EuroVoc, GEMET, LCSH, Wikidata, etc.

## Two query surfaces

| Surface | URL | Use it for |
|---|---|---|
| **Solr** | `/solr/skos/select` | Fast full-text search over labels and definitions. **The populated, default surface.** |
| **SPARQL 1.1** | `/query` (Oxigraph) | Graph queries: hierarchy walks, mappings, per-scheme slices. |

There is also a corpus **manifest** at `/manifest.json` (every scheme,
its slug, namespace URI, licence, and triple count).

## ⚠️ The one thing to know about the SPARQL endpoint

The bundle is loaded as **one named graph per scheme — the graph IRI
*is* the scheme IRI**. The **default graph is empty**. So a plain

```sparql
SELECT * WHERE { ?s ?p ?o } LIMIT 5      -- returns NOTHING
```

You must wrap patterns in `GRAPH ?g { … }`:

```sparql
SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s a <http://www.w3.org/2004/02/skos/core#Concept> } }
-- => 3121417
```

This single gotcha accounts for almost every "the endpoint is empty"
false alarm. (Contrast with the UK Parliament `sparql` skill, whose
DDP store keeps everything in the default graph.)

## Namespaces

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dcterms: <http://purl.org/dc/terms/>
```

## Solr fields

Each Solr doc is one concept. Multi-valued unless noted.

| Field | Meaning |
|---|---|
| `id` | the concept URI (also `_root_`) |
| `scheme` | the concept-scheme URI it belongs to |
| `prefLabel` | preferred labels (all languages) |
| `altLabel` | alternative labels / synonyms |
| `exactLabel` | the lowercased exact-match label index |
| `definition` | definition(s) (often a URI to a definition node) |
| `broader` / `narrower` | hierarchy parents / children (URIs) |
| `exactMatch` / `closeMatch` / `mapping` | cross-vocabulary links (URIs) |

Field-scoped Solr queries work: `prefLabel:climate`, `altLabel:GDP`.
Filter to one scheme with `fq=scheme:"<scheme-uri>"`.

## Worked examples (curl)

```sh
# Full-text search, two hits, selected fields
curl -sLG 'https://skosdex.fly.dev/solr/skos/select' \
  --data-urlencode 'q=prefLabel:climate' \
  --data-urlencode 'rows=2' \
  --data-urlencode 'fl=id,scheme,prefLabel'

# SPARQL: every label containing "parliament", across all graphs
curl -sL 'https://skosdex.fly.dev/query' -X POST \
  -H 'Accept: application/sparql-results+json' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'query=
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?c ?l WHERE { GRAPH ?g {
  ?c skos:prefLabel ?l . FILTER(CONTAINS(LCASE(STR(?l)),"parliament")) } } LIMIT 5'
```

## UK Parliament relevance

skosdex is general-purpose, but two bridges matter here:

- **Subject tagging against an international vocabulary.** EuroVoc and
  GEMET are both in the corpus; you can map a free-text parliamentary
  topic to a controlled-vocabulary URI for interoperable tagging.
- **The Parliament Thesaurus gap.** The UK Parliament SKOS thesaurus
  is *not* on `api.parliament.uk/sparql` (its `Concept` class is
  unpopulated) — it lives on the legacy
  [`linked-data-api`](../linked-data-api/SKILL.md) (`lda.../terms`).
  skosdex does not (yet) ingest the Parliament Thesaurus, but it is
  the right tool for the *other* controlled vocabularies you'd want to
  cross-walk Parliament subjects against.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with the same Node CLI as the rest of the repo. From
the repo root:

```sh
node bin/parl.mjs skosdex --help
```

Or after `npm link`:

```sh
parl skosdex --help
```

### Examples

```sh
parl skosdex search "prefLabel:climate" --rows 5 --fl id,scheme,prefLabel
```
Full-text Solr search over concept labels/definitions (the fast surface).

```sh
parl skosdex search "renewable energy" --scheme http://eurovoc.europa.eu/100141
```
Same search, restricted to one scheme via a Solr `fq` filter.

```sh
parl skosdex query 'SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s a <http://www.w3.org/2004/02/skos/core#Concept> } }'
```
SPARQL — remember `GRAPH ?g { … }`; the default graph is empty.

```sh
parl skosdex schemes --limit 20
```
List the concept-scheme named graphs (graph IRI == scheme IRI).

```sh
parl skosdex concept http://aims.fao.org/aos/agrovoc/c_27742
```
Labels + broader/narrower + cross-vocabulary mappings for one concept.

```sh
parl skosdex manifest
```
The corpus manifest: every scheme with slug, namespace, licence, triple count.

### Library use (Node + browser)

```js
import * as skosdex from '../../lib/facilities/skosdex.mjs';
const hits = await skosdex.search('prefLabel:climate', { rows: 5 });
```

Uses only `fetch` / `URL`, so the same source runs in Node 18+ and
modern browsers.

<!-- parl-cli-end -->

## Notes & caveats

- **Not UK Parliament.** Tier-3 third-party. Authority for any concept
  rests with its **source scheme**; cite the scheme, not just skosdex.
- **Licensing is per-scheme.** The distributed bundle is open /
  public-domain / copyleft only; noncommercial schemes are held as
  metadata in the manifest's `excluded` list and are *not* in the RDF
  bundle. Check `manifest` before redistributing anything.
- **Solr is the populated surface; SPARQL is the graph surface.** If a
  SPARQL query comes back empty, you almost certainly forgot
  `GRAPH ?g { … }`.
- **Endpoint is read-only** and hosted on a small Fly.io instance —
  be polite, keep result sets bounded, prefer Solr for label lookups
  and SPARQL only for graph-shaped questions.

See [`reference.md`](reference.md) for the full Solr field reference,
named-graph mechanics, hierarchy-walk and cross-mapping recipes, and
the manifest structure.

## Provenance to cite

**Tier 3 — third-party aggregator (skosdex), authoritative pass-through.**

- Inline cite: **"(via skosdex)"** — once per paragraph — *plus* the
  underlying scheme (e.g. "EuroVoc, via skosdex").
- See [`../../docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
