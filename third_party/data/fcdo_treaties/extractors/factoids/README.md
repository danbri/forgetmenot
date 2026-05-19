# FCDO UK Treaties Online — RDF lift

This directory holds the RDF lift of FCDO's UK Treaties Online
(`treaties.fcdo.gov.uk`) catalogue, produced by
[`scripts/fcdo_treaties_extract.py`](../../../../../scripts/fcdo_treaties_extract.py)
from the JSON records under
[`../../records/`](../../records/).

If you just want the data, the file you want is
**`all.nq.gz`** — one named graph per treaty, in N-Quads, gzipped.

## Files

| File | What it is | Tracked in git? |
|---|---|---|
| **`all.nq`** | The lift. One named graph per treaty record; graph IRI is the upstream UKTO record URL. Streamed during extraction so memory stays bounded. | No (regeneratable) |
| **`all.nq.gz`** | gzip of `all.nq`. | **Yes** — this is the committed corpus |
| **`_provenance.nq`** | Side file: `prov:generatedAtTime`, `prov:wasDerivedFrom`, `rdf:type prov:Entity` per named graph. Kept separate so `all.nq` is content-only. | No (regeneratable) |
| **`_dataset.ttl`** | `void:Dataset` self-description: count, vocabulary, license, coverage stats as data, known-gaps as readable comments. **First thing to read.** | Yes |
| **`fm-vocab.ttl`** | Hand-curated declaration of every `fm:` class and property emitted by the lift. Kept in sync with the script by [`scripts/fcdo_treaties_vocab_check.py`](../../../../../scripts/fcdo_treaties_vocab_check.py). | Yes |
| **`_index.json`** | Per-run summary: counts, coverage rates, paths, top-50 unmapped party labels. | Yes |
| **`_unmapped_party_labels.json`** | Full tail of every party label we couldn't map to a Wikidata QID, with occurrence counts. Source of truth when extending `../../country-qids.tsv`. | Yes |
| **`parliament-bridge.ttl`** | `owl:sameAs` map joining UKTO record URIs to Parliament Treaties API URIs, by command-paper number. | Yes |
| **`parliament-bridge.json`** | Same bridge as `parliament-bridge.ttl` but as JSON. | Yes |
| **`<id>.ttl`** | Per-record Turtle, written during extraction. Intermediate, not committed; the rollup is the artefact. | No |

Adjacent to this directory:

| File | What |
|---|---|
| [`../../country-qids.tsv`](../../country-qids.tsv) | Curated UKTO-country-label → Wikidata QID map. TAB-separated. Extending it is a single-PR change — no Python required. |

## Schema

The `fm:` namespace at `https://forgetmenot.local/vocab#` is the
project-wide forgetmenot vocabulary; the discipline is in
[`docs/vocab.md`](../../../../../docs/vocab.md) (one rule: never
invent under a third party's namespace). The authoritative declaration
of every class and property used by this lift is
[`fm-vocab.ttl`](fm-vocab.ttl).

At a glance:

```
fm:Treaty                     # one per UKTO record
  ├─ dct:title                # the treaty's title
  ├─ schema:alternateName     # short name from trailing [bracketed] in title
  ├─ fm:subject ─→ fm-s:POLLUTION (skos:Concept under fm:subject/)
  ├─ fm:kind                  # "bilateral" | "multilateral"
  ├─ fm:isBilateral           # xsd:boolean shortcut
  ├─ fm:signedDate            # xsd:date (DD/MM/YYYY lifted)
  ├─ fm:signedPlace           # rdf:langString
  ├─ fm:entryIntoForceDate    # xsd:date
  ├─ fm:commandPaper          # "Cm 4427" / "Cmnd 2535" / "CP 1547"
  ├─ fm:party ─→ fm:Country   # one per distinct party (deduplicated)
  ├─ fm:partyAction ─→ fm:TreatyAction (one per parties_detail row)
  │     ├─ fm:country ─→ fm:Country
  │     ├─ fm:action ─→ fm-a:signature (skos:Concept under fm:action/)
  │     ├─ fm:actionDate    # xsd:date
  │     └─ fm:effectiveDate # xsd:date
  ├─ fm:reference ─→ fm:Reference (one per references[] entry)
  │     ├─ rdfs:label       # cleaned text
  │     ├─ fm:series        # "Treaty Series" | "Country Series" | …
  │     ├─ fm:commandPaper  # if parseable
  │     └─ dct:hasFormat    # PDF URL if reference had "||URL" suffix
  ├─ dct:source             # the UKTO HTML / PDF URL
  └─ fm:uktoId / fm:uktoUuid

fm:Country
  ├─ rdfs:label   # raw FCDO label, casing preserved
  └─ owl:sameAs ─→ wd:Q145    # Wikidata QID where curated map covers it
```

## Named-graph convention

Each per-treaty graph is named by the same URI as the treaty resource
itself: `<https://treaties.fcdo.gov.uk/awweb/awfp/recno/<id>>`.
Equivalently:

- The treaty's IRI.
- The graph holding the treaty's facts.
- The `dct:source` of those facts (the upstream record URL).

This is a shortcut. Strictly speaking the graph and the treaty are
distinct entities — one is metadata about the other. We collapse them
because (a) it makes the `.nq` round-trip from per-record `.ttl` trivial
and (b) every consumer we've imagined wants the per-graph view to
*be* the per-treaty view. `prov:wasDerivedFrom` in `_provenance.nq` is
written redundantly to make the relationship explicit for anyone who
needs to disentangle the two.

## Determinism

Blank-node identifiers are derived from `<record id>_<kind>_<index>`
so re-running the lift on the same input produces byte-identical
output. The committed `all.nq.gz` therefore diffs trivially between
refreshes (only the genuinely-new records' quads appear in the patch),
which keeps git history sane as the crawler fills in the remaining
~6,500 records.

## How to load + query

The corpus is N-Quads, so any RDF store with N-Quads + named-graph
support will load it:

```sh
# Apache Jena: load into TDB2 and serve SPARQL
gunzip -c all.nq.gz | tdb2.tdbloader --loc ./tdb2 --
fuseki-server --tdb2 --loc ./tdb2 /fcdo

# Oxigraph (single binary)
gunzip -c all.nq.gz | oxigraph load --location ./oxigraph -f nq
oxigraph serve --location ./oxigraph

# rdflib (Python, for quick scripts)
python3 -c "import gzip, rdflib; ds=rdflib.Dataset(); ds.parse(gzip.open('all.nq.gz','rt'), format='nquads'); print(len(ds))"
```

Worked SPARQL examples:

```sparql
# Every treaty UK has signed since 2020, with command paper and parties.
PREFIX fm:  <https://forgetmenot.local/vocab#>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?treaty ?title ?signed ?cp (GROUP_CONCAT(?country; separator=", ") AS ?parties)
WHERE {
  GRAPH ?treaty {
    ?treaty a fm:Treaty ;
            dct:title ?title ;
            fm:signedDate ?signed ;
            fm:party ?p .
    ?p rdfs:label ?country .
    OPTIONAL { ?treaty fm:commandPaper ?cp }
    FILTER (?signed >= "2020-01-01"^^xsd:date)
  }
}
GROUP BY ?treaty ?title ?signed ?cp
ORDER BY DESC(?signed)
```

```sparql
# Every treaty the UK ratified more than 10 years after signing.
PREFIX fm: <https://forgetmenot.local/vocab#>
PREFIX dct: <http://purl.org/dc/terms/>
SELECT ?title ?signed ?ratified (YEAR(?ratified) - YEAR(?signed) AS ?gap_years)
WHERE {
  GRAPH ?treaty {
    ?treaty a fm:Treaty ;
            dct:title ?title ;
            fm:signedDate ?signed ;
            fm:partyAction ?pa .
    ?pa fm:country <https://forgetmenot.local/vocab/country/UNITED_KINGDOM> ;
        fm:action <https://forgetmenot.local/vocab/action/ratification> ;
        fm:actionDate ?ratified .
    FILTER (?ratified - ?signed > "P10Y"^^xsd:duration)
  }
} ORDER BY DESC(?gap_years)
```

## Coverage and known gaps

The live numbers are in [`_index.json`](_index.json) — and as
SPARQL-queryable triples in [`_dataset.ttl`](_dataset.ttl) under the
`fm-cov:` namespace, so a SPARQL query can answer "how complete is
this corpus?" without needing to read the JSON.

Major gaps you should know about before you trust the data:

1. **Signatory NAMES are NOT present.** The crawler was originally
   built to fill this gap — UKTO is the only UK source that *might*
   record who actually signed each treaty — but FCDO's public-anonymous
   surface does not expose signatory names. The `parties` field is
   countries, not people. A question like "which UK treaties has Liz
   Truss signed" cannot be answered from this corpus. See the original
   design doc at [`../../README.md`](../../README.md) for the audit
   findings.
2. **The crawl is partial.** FCDO publishes ~21,957 treaty records;
   the current corpus has the ones the crawler has reached so far. A
   leisurely-paced parallel crawler is filling in the rest; re-run
   `scripts/fcdo_treaties_extract.py --refresh` after new records land
   under `../../records/`.
3. **A large fraction of records are "thin"** — catalogue stubs with
   title + UKTO id only, no parties / subject / dates. The script
   counts them in `_index.json.records_thin`. These are emitted as
   bare `fm:Treaty` resources so they round-trip, but they carry no
   analytical content.
4. **Some party labels can't be mapped to Wikidata.** The curated
   [`../../country-qids.tsv`](../../country-qids.tsv) covers the bulk
   of modern sovereign states, UK overseas territories, Crown
   Dependencies and the highest-frequency historical entities, but a
   long tail of obscure colonial-era labels remains unmapped (e.g.
   ambiguous "Cameroons" — British vs French — we deliberately don't
   guess). Full tail in
   [`_unmapped_party_labels.json`](_unmapped_party_labels.json);
   extend the TSV when adding QIDs.
5. **Per-graph closure inflates triple counts.** Each treaty's named
   graph independently asserts the `rdf:type`, `rdfs:label` and
   `owl:sameAs` of every country and SKOS concept it mentions, so
   e.g. `<fm:country/UNITED_KINGDOM rdf:type fm:Country>` appears in
   thousands of graphs. Defensible (each graph is self-contained and
   independently loadable) but consumers computing distinct-resource
   counts should `SELECT DISTINCT`.
6. **`captured_at` appears in two places** — on the treaty (so
   triple-flattening consumers don't lose it) and on the named graph
   (`prov:generatedAtTime` in `_provenance.nq`). These match by
   construction.
7. **`document_url` doubles as the named-graph IRI.** See "Named-graph
   convention" above — a knowing shortcut, but worth flagging.

## License + citation

Upstream data: FCDO UK Treaties Online, available under the
[Open Government Licence v3.0](http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
Cite as `UK Treaties Online, Foreign, Commonwealth & Development
Office, retrieved {date} under OGL v3.0`.

This RDF lift (the schema choices, the QID curation, the documentation)
is also OGL v3.0; provenance qualifiers in `_provenance.nq` make the
upstream attribution explicit on every named graph.
