# GOV.UK org-chart corpus

This directory holds a snapshot of GOV.UK's ministerial / people /
organisation pages plus two extractor outputs:

- `pages/<slug>/`              raw HTML cache (gitignored, see `.gitignore`)
- `feeds.md`                   atom / sitemap / JSON-API feeds discovered while crawling
- `extractors/triples/`        generic RDFa / JSON-LD / microdata, one folder per page
- `extractors/factoids/`       hand-templated org-chart facts, per-page Turtle plus a
  rolled-up N-Quads file (`all.nq`) where every triple's named graph is the
  GOV.UK page it came from
- `extractors/factoids/report.pdf`   5-page validation + viz report

## Pipeline

```sh
# 1. Crawl (resumable; gentle parallel; gov.uk robots-aware)
python3 scripts/govuk_crawl.py --resume --max 500 --workers 5

# 2. Extract triples (one folder per extractor)
python3 scripts/govuk_extract_triples.py        # RDFa / JSON-LD / microdata
python3 scripts/govuk_extract_factoids.py       # hand-templated factoids

# 3. Query
./scripts/govuk_sparql_serve.sh                 # rdflib-endpoint at 127.0.0.1:8765
python3 scripts/govuk_sparql_sanity.py          # battery of consistency queries
python3 scripts/govuk_report.py                 # rebuild the PDF report
```

## Querying

The combined N-Quads at `extractors/factoids/all.nq` is the single most
useful file: 19k triples, one named graph per source GOV.UK page.

Three reasonable endpoint options:

1. **`rdflib-endpoint`** -- pure Python, one command. See
   `scripts/govuk_sparql_serve.sh`. Endpoint lives at `/` not
   `/sparql`.

2. **Apache Jena Fuseki** -- the canonical Java endpoint, with a
   web UI for ad-hoc querying:
   ```
   curl -LO https://dlcdn.apache.org/jena/binaries/apache-jena-fuseki-5.2.0.tar.gz
   tar xzf apache-jena-fuseki-5.2.0.tar.gz
   ./apache-jena-fuseki-5.2.0/fuseki-server --file=all.nq /govuk
   # http://localhost:3030/  (UI) ;  http://localhost:3030/govuk/sparql (endpoint)
   ```

3. **Oxigraph** (Rust, Docker) -- when you want named-graph semantics
   plus persistence:
   ```
   docker run --rm -p 7878:7878 \
     -v $PWD/extractors/factoids:/data \
     oxigraph/oxigraph serve --bind 0.0.0.0:7878 --location /tmp/db
   docker run --rm -v $PWD/extractors/factoids:/data \
     oxigraph/oxigraph load --location /tmp/db --file /data/all.nq
   ```

## Bridging out to other corpora

Joins from the GOV.UK org-chart to other UK-government datasets are
brittle if done by URL or name (departments rename, titles drift).
The Wikidata workspace at `third_party/data/wikidata/` carries
explicit cross-IDs (`P10428` parliament.uk member id, `P10874` GOV.UK
person slug, `P10712` GOV.UK organisation slug) and emits an
`owl:sameAs` Turtle file that merges into `all.nq` to give a person-
level join with `members-api.parliament.uk`.
