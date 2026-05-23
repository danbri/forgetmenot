---
name: local-sparql
description: Spin up a local SPARQL endpoint over any RDF file in this repository — N-Quads, Turtle, N-Triples, RDF/XML, TriG, gzipped or plain. Three backends covered: `rdflib-endpoint` (pure-Python, easiest), Apache Jena Fuseki (Java, web UI, SPARQL Update), and Oxigraph (Rust via Docker, persistent). Use whenever you want to query one of the repo's N-Quads dumps (psephology, govuk-orgchart, fcdo-treaties, identity-graph, tna-legislation) with real SPARQL instead of grep, or to host an endpoint for downstream tooling. Generic — not tied to any one corpus.
license: MIT (this skill's wrapper) — backends are Apache 2.0 (Jena, rdflib-endpoint), MIT/Apache (Oxigraph)
metadata:
  provenance:
    tier: 0
    operator: "forgetmenot (wrapper around upstream SPARQL engines)"
    citation-short: "via local SPARQL endpoint (rdflib-endpoint / Fuseki / Oxigraph)"
    confidence: deterministic
---

# Local SPARQL — query the repo's RDF corpora yourself

The repo ships several N-Quads dumps, each one a structured
re-expression of an upstream corpus:

| File | What | Size |
|---|---|---|
| `third_party/data/psephology/all.nq.gz` | Every UK election result since 1955 — Library data | 420 k quads / 2.4 MB gz |
| `third_party/data/fcdo_treaties/extractors/factoids/all.nq.gz` | FCDO UK Treaties Online | 1.7 M quads / 15.6 MB gz |
| `third_party/govuk/html/orgcharts/extractors/factoids/all.nq` | GOV.UK government org chart + people | 20 k quads / 7.4 MB |
| `third_party/identity-graph/identity.nq` | Cross-source identity for 1,400 MPs/peers — Members API ↔ DDP ↔ scraped MP sites ↔ APPG ↔ GOV.UK people factoids ↔ Wikidata QIDs | 58 k quads / 9.9 MB |
| `third_party/data/tna_legislation/…/*.ttl` | UK legislation (per-act Turtle files) | many small files |

Each of these is queryable as RDF the moment you put a SPARQL
endpoint in front of it. This skill is the one-stop recipe for
doing that, so consumers (and other skills' READMEs) don't have
to re-derive it.

## Quick start

One generic wrapper handles all three backends:

```sh
# Pure-Python, easiest, no Docker, no Java download:
scripts/local-sparql-serve.sh third_party/data/psephology/all.nq.gz
#   → http://127.0.0.1:8765/

# Apache Jena Fuseki — downloads on first run (~60 MB cached under
# ~/.cache/forgetmenot/), then runs with a web UI:
scripts/local-sparql-serve.sh \
  --backend fuseki --dataset psephology \
  third_party/data/psephology/all.nq.gz
#   → UI    http://127.0.0.1:3030/
#   → query http://127.0.0.1:3030/psephology/sparql

# Oxigraph via Docker — Rust engine, persistent on-disk store:
scripts/local-sparql-serve.sh \
  --backend oxigraph third_party/data/psephology/all.nq.gz
#   → http://127.0.0.1:7878/query
```

`.gz` inputs are decompressed to a temp file transparently. The
script accepts multiple input files; pass them all on the command
line. Stop with `Ctrl-C`; the temp files are cleaned up.

## Choosing a backend

| | rdflib-endpoint | Fuseki | Oxigraph |
|---|---|---|---|
| **Language** | Python | Java | Rust (Docker) |
| **First-run cost** | `pip install rdflib-endpoint` | ~60 MB download | `docker pull` (~60 MB) |
| **Time-to-query (this repo's data)** | seconds–minutes | seconds | seconds |
| **Web UI** | no | **yes** | minimal |
| **Persistence** | in-memory | optional (TDB2) | **on-disk** |
| **SPARQL 1.1 Update** | partial | yes | yes |
| **Named-graph (`GRAPH ?g`)** | yes | yes | yes |
| **RDF*** | no | partial | **yes** |
| **Best for** | ad-hoc queries on the smaller corpora | interactive exploration / shared endpoints | bigger graphs, repeated runs |

Rule of thumb: **start with `rdflib-endpoint`**. Move to Fuseki
when you want the UI; move to Oxigraph when you outgrow
in-memory or need RDF*.

## Loading times observed (this container)

| Corpus | Quads | rdflib-endpoint cold start |
|---|---:|---:|
| identity-graph | 57 k | ~3 s |
| govuk-orgchart factoids | 20 k | <1 s |
| psephology | 420 k | ~40 s |
| FCDO treaties | 1.7 M | several minutes (memory-bound) |

For the FCDO corpus, **Fuseki or Oxigraph are strongly preferred** —
rdflib's all-in-memory model becomes painful past ~500 k quads.

## Worked example — psephology

```sh
$ scripts/local-sparql-serve.sh third_party/data/psephology/all.nq.gz
→ Decompressing third_party/data/psephology/all.nq.gz → /tmp/.../all.nq
✓ rdflib-endpoint will serve:
    /tmp/.../all.nq (420158 lines)
  URL:  http://127.0.0.1:8765/
  …
INFO:     Application startup complete.
```

In another terminal:

```sh
$ curl -sG http://127.0.0.1:8765/ \
    --data-urlencode 'query=
PREFIX pe:   <http://parliament.uk/ontologies/election/>
PREFIX parl: <https://id.parliament.uk/schema/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>
SELECT ?cgName ?voteCount ?voteShare ?majority WHERE {
  ?p parl:memberId 5334 .
  ?c pe:isOfPerson ?p ; pe:inElection ?e .
  ?r pe:resultOfCandidacy ?c ; pe:voteCount ?voteCount ; pe:voteShare ?voteShare .
  ?e pe:forConstituencyGroup ?cg ;
     pe:electionPollingOn "2024-07-04"^^xsd:date ;
     pe:majority ?majority .
  ?cg rdfs:label ?cgName .
}' -H 'Accept: application/sparql-results+json' | jq -r '
    .results.bindings[] | "\(.cgName.value) · \(.voteCount.value) votes · \(.voteShare.value) · majority \(.majority.value)"'
Stoke-on-Trent South · 14221 votes · 0.347345 · majority 627
```

## Common prefixes

The corpora in this repo use:

```
PREFIX pe:      <http://parliament.uk/ontologies/election/>
PREFIX parl:    <https://id.parliament.uk/schema/>
PREFIX fm:      <https://forgetmenot.local/vocab#>
PREFIX govuk:   <https://www.gov.uk/vocab/meta#>
PREFIX schema:  <http://schema.org/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX prov:    <http://www.w3.org/ns/prov#>
PREFIX void:    <http://rdfs.org/ns/void#>
PREFIX rdfs:    <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>
PREFIX owl:     <http://www.w3.org/2002/07/owl#>
```

## Loading multiple corpora at once

```sh
scripts/local-sparql-serve.sh --backend rdflib \
  third_party/data/psephology/all.nq.gz \
  third_party/identity-graph/identity.nq
```

This puts both corpora in the same default-graph union, so you can
write joins like *"every MP elected in 2024 whose member-id is
also covered by the identity graph"* without leaving SPARQL.

## Notes / pitfalls

- **rdflib normalises blank-node IDs.** The 420,158 quads in
  `psephology/all.nq.gz` show up as 412,007 in `rdflib-endpoint`'s
  count, because rdflib coalesces same-named blank nodes across
  the file (which is the correct N-Quads-spec behaviour — our
  emitter intentionally uses stable `_:person_mnis_<N>` names so
  the same MP-as-Person is one node).
- **rdflib-endpoint serves at `/`, not `/sparql`.** Fuseki serves at
  `/<dataset>/sparql`. Oxigraph at `/query`.
- **Decompression is transparent.** The wrapper handles `.gz`; just
  pass the path you have.
- **CORS:** `rdflib-endpoint` and Fuseki default to same-origin;
  pass `--cors` (Fuseki) or front them with a reverse proxy if you
  want browser access from another host.

## Provenance

This skill is project plumbing — Tier 0, not a primary data
source. The upstream engines (rdflib-endpoint, Apache Jena,
Oxigraph) carry their own licences and citations.
