---
name: parliament-thesaurus
description: Bulk-export the UK Parliament Thesaurus — the SKOS concept scheme used to subject-tag debates, papers, written questions, and other parliamentary records. Crawls the legacy Linked Data API at lda.data.parliament.uk/terms (no SPARQL endpoint exposed for it) into a single N-Quads file split across topical named graphs. Use when a question needs the thesaurus as RDF (e.g. for joining into a local SPARQL store, building a faceted UI, or exporting subject hierarchies). The thesaurus is the canonical subject vocabulary at parliament.uk; pair with `linked-data-api` for the document-level metadata that references these terms.
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated)
metadata:
  provenance:
    tier: 1
    operator: UK Parliament
    service: lda.data.parliament.uk/terms
    citation-short: "via lda.data.parliament.uk/terms (LDA Thesaurus)"
    citation-formal: "UK Parliament Thesaurus, retrieved {date} via lda.data.parliament.uk/terms"
    confidence: authoritative
---

# UK Parliament Thesaurus — bulk LDA → N-Quads

The Parliament Thesaurus is the SKOS concept scheme that subject-tags
debates, written questions, briefing papers, and other parliamentary
records. It is published only as the `terms` dataset on the legacy
Linked Data API at `lda.data.parliament.uk/terms`. The modern
`api.parliament.uk/sparql` (DDP) endpoint defines a `Concept` class but
has zero instances — so for any thesaurus-grade work, this dataset has
to be pulled and rehosted.

This skill ships a polite Python crawler that:

- Walks `/terms?_page=…&_pageSize=…&_view=…` paginated Turtle.
- Selects vocabulary-quality data (subjects under
  `http://data.parliament.uk/terms/`), keeping useful label sidecars
  for referenced broader / related / mapping targets.
- Skips LDA page-listing metadata, blank nodes and duplicates.
- Splits the resulting triples across five named graphs by predicate:
  - `…/legacy-terms/core` — `rdf:type`, `skos:prefLabel` / `altLabel` / `notation`, parl-internal flags
  - `…/legacy-terms/hierarchy` — `skos:broader`, `narrower`, `inScheme`, `topConceptOf`
  - `…/legacy-terms/related` — `skos:related`
  - `…/legacy-terms/mappings` — `skos:exactMatch`, `closeMatch`, etc.
  - `…/legacy-terms/label-sidecar` — labels for non-term subjects we surfaced

## Normalisation (done once, propagates downstream)

The LDA source emits neither `rdf:type` on its concepts nor language
tags on labels. `normalize_triples()` in `dump_terms.py` bakes both into
the `.nq.gz` **at harvest time**, so every consumer of that file — the
fpkg Oxigraph SPARQL store *and* the Turtle export below — inherits it
from this single point:

- every term node gets `a skos:Concept`;
- `skos:prefLabel` / `skos:altLabel` are language-tagged **`@en` by
  default**, with per-term exceptions for non-English proper names
  (French, Irish, Latin, …). `skos:notation` and the `parl:` attributes
  stay untagged — they are not lexical labels.

The exceptions are **data-driven**, in a reviewable sidecar
[`label-lang-overrides.jsonl`](label-lang-overrides.jsonl) — one decision
per line, `{"id","lang","label"}` — loaded by `dump_terms.py` (override
with `--lang-overrides`). The corpus is overwhelmingly English, so the
workflow is *default-English, then skim the labels for the foreign ones*:
the `.jsonl` is populated by an LLM pass over the label set (it flags
labels that are actually French/Irish/etc. and assigns the right BCP-47
tag), which is far more reliable than per-string language guessing in
code. Add a line and re-run `--renormalize` to retag; no code change.

The Turtle exporter (`scripts/lda-terms-nq-to-ttl.mjs`) is therefore a
**pure serializer** — it copies the tags/types straight through.

When the LDA endpoint is unreachable but the existing dump needs the
latest hygiene, re-apply it offline (no network) instead of re-crawling:

```sh
python3 skills/parliament-thesaurus/dump_terms.py --renormalize
```

It reads the existing `.nq.gz`, re-runs `normalize_triples()`, and
rewrites in place (idempotent; the summary's `pages_failed` is left
intact).
- Writes the output **gzip-compressed** directly to
  `third_party/data/parliament-lda-terms/parliament-lda-terms.nq.gz`,
  plus an uncompressed `parliament-lda-terms-summary.json` next to it
  (counts per graph / predicate / sample subjects).

## Running it

```sh
# Smoke test — first page only
python3 skills/parliament-thesaurus/dump_terms.py --max-pages 1

# Specific known item
python3 skills/parliament-thesaurus/dump_terms.py --ids 8193,478018

# Full crawl, polite (~10–15 min, ~50k quads)
python3 skills/parliament-thesaurus/dump_terms.py --all --sleep 0.25

# Force Elda's "all" view (slower/larger; useful if default view is
# suspected incomplete)
python3 skills/parliament-thesaurus/dump_terms.py --all --view all --sleep 0.25
```

The output paths default to `third_party/data/parliament-lda-terms/`
under the repo root. Override with `--out` and `--summary`.

## ⚠ Completeness — the last committed crawl is PARTIAL

The Epimorphics/Elda endpoint has a **deep-paging wall**: requests
beyond roughly `_page=20` (offset ≈ 1000 at `_pageSize=50`) time out /
500. In the committed dump the crawl skipped pages **20–29** and then
hit the `MAX_FAILED_PAGES=10` backstop and aborted — see
`parliament-lda-terms-summary.json` → `pages_failed`. So the dump holds
**1,724 term subjects / 6,361 triples**, but terms past that offset are
**missing**; this is *not* a clean "empty page reached" finish.

To get a complete dump when the endpoint is reachable, try smaller pages
to push the wall further out, and/or the `all` view:

```sh
python3 skills/parliament-thesaurus/dump_terms.py --all --page-size 20 --sleep 0.25
python3 skills/parliament-thesaurus/dump_terms.py --all --view all --sleep 0.25
```

(As of 2026-06-15 `lda.data.parliament.uk` was unreachable — HTTP 000 /
timeout — so the gap could not be re-filled.)

## Turtle dump (download)

`scripts/lda-terms-nq-to-ttl.mjs` converts the `.nq.gz` into a single
merged, prefixed **Turtle** file (the four named graphs are split only
by predicate class, so a download is more useful as one graph). The
header carries provenance and a PARTIAL warning whenever the source
crawl skipped pages. Concept typing and label language tags come from
the source `.nq.gz` (see Normalisation above), not from this script.

```sh
node scripts/lda-terms-nq-to-ttl.mjs
```

It writes two copies:
- `third_party/data/parliament-lda-terms/parliament-lda-terms.ttl` (repo)
- `demos/parliament-live/web/kgx/parliament-lda-terms.ttl` (bundled into
  the fpkg image), served at
  **<https://fpkg.fly.dev/kgx/parliament-lda-terms.ttl>**
  (`text/turtle`).

The weekly rebuild (`rebuild-graphs.yml`) regenerates both right after
the crawl, so the served `.ttl` tracks the latest dump automatically.

## CI

Wired into `.github/workflows/rebuild-graphs.yml` as one step of the
weekly Monday rebuild. The `.nq.gz` file is then bundled into the
`fpkg` Docker image and loaded by the in-process Oxigraph store, so
the live SPARQL endpoint at `https://fpkg.fly.dev/sparql` answers
queries against the thesaurus alongside the other graphs.

### Triggering a rebuild from your phone

Both relevant workflows have `workflow_dispatch` triggers — open the
URL in Safari (request Desktop Site for the "Run workflow ▾" button)
or the GitHub mobile app:

- **Data rebuild + deploy** (full ~20 min cron run, used Mondays):
  <https://github.com/danbri/forgetmenot/actions/workflows/rebuild-graphs.yml>
- **Deploy only** (skip the data rebuild, ship current `claude/main`
  to `fpkg.fly.dev` in ~3 min):
  <https://github.com/danbri/forgetmenot/actions/workflows/deploy-fpkg.yml>

The "Run workflow" button appears on the right of the workflow runs
list; the iOS GitHub app shows only past runs and not the dispatch
control, so Safari (with Desktop Site requested) is the reliable
mobile path.

## Reference

Endpoint shape, query patterns and result counts are documented in
[`reference.md`](reference.md).
