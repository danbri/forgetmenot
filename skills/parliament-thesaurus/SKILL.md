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
- `skos:prefLabel` / `skos:altLabel` are language-tagged **uniformly
  `@en`**. `skos:notation` and the `parl:` attributes stay untagged —
  they are not lexical labels.

> **Label language is delegated to skosdex.** As of 2026-06-17 we ship a
> uniform `@en` default and let the **skosdex importer language-detect
> from the literal text** on import (it re-hosts this thesaurus as
> `uk-parliament-thesaurus`). So `@en` here is a *default, not an
> assertion* — ~0.4%+ of the 130k+ labels are demonstrably non-English
> proper names (e.g. `Università Bocconi`, `Institut für Europäische
> Politik`) that skosdex resolves. **Do not** re-run an LLM language
> pass here; it would be redundant work that import overrides anyway.

The override mechanism below is **retained but dormant** (empty seed +
empty sidecar). It's a reviewable sidecar
[`label-lang-overrides.jsonl`](label-lang-overrides.jsonl) — one decision
per line, `{"id","lang","label"}`, loaded by `dump_terms.py` (override
with `--lang-overrides`) and merged over `SEED_LANG_OVERRIDE`. Re-populate
either **only** if we ever need per-term BCP-47 tags baked in at harvest
time again (then add lines + re-run `--renormalize`). ⚠ `--renormalize`
only tags *untagged* labels, so to *change* an existing tag you must
regenerate from the page cache, not renormalize.

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

## Dataset scale & current crawl state (2026-06-16)

The `terms` dataset is **large and resumable**, not a quick pull. The
Elda listing reports `opensearch:totalResults = 141,822` term resources
(the dataset is the whole `terms` space — it includes many **named
entities**: organisations, people, legislation, places — not only
subject concepts). At `_pageSize=20` that is **7,092 pages**.

| | value |
|---|---|
| Total term resources (endpoint-reported) | **141,822** |
| Page size used | **20** (see wall note below) |
| Total pages | **7,092** |
| Pages cached so far | **0–302** (297 present; **273–278 missing/failed**) |
| Coverage by page | **≈ 4.3 %** |
| Distinct term ids captured | **9,326** |
| `skos:prefLabel`s captured | **~8,551** |

This already **dwarfs the previously committed dump** (1,724 prefLabels,
which only reached page 19). It is **partial** — a resume target, not a
finished crawl.

**The old "deep-paging wall at ~page 20" was a `_pageSize=50` artifact.**
At `_pageSize=20` the crawl sailed past it to page 302. So: **always
crawl this dataset at `--page-size 20`.** (The 6 missing pages 273–278
were transient per-page failures, not a wall; they backfill on resume.)

## Caching & resume — DO NOT re-crawl from scratch

This is a paged service and the crawler **caches every page response**
at `cache-parliament-lda-terms/<sha256(url)[:24]>.ttl`. `fetch_url()`
returns the cached copy whenever it exists, so **resuming costs zero
network for pages already fetched** — it only fetches the gaps and the
tail. A truncated `.nq.gz` does **not** mean lost work: the `.nq.gz` is
just a serialization; the **cache is the source of truth** and the
importer re-emits it deterministically.

⚠ **The cache key includes `_pageSize`.** Resume with the **same
`--page-size 20`** or every URL misses and you re-crawl from zero.

⚠ The cache dir is **git-ignored** and the web/CI container is
**ephemeral** (it has restarted mid-crawl already). So progress is
preserved as a committed snapshot, **re-rolled at each checkpoint**
(filename carries the highest page):

- **`third_party/data/parliament-lda-terms/cache-snapshot-pages-0-759.tar.gz`**
  (sha256 `2dca0152799572bc3e7e4db5ef05e6e1f6f5272ba1177fbe19329d99cadea5e1`)
  — pages **0–759, zero gaps** (~10.7% of 7,092).

To resume in a fresh checkout (use whichever `0-NNN` snapshot is latest):

```sh
tar xzf third_party/data/parliament-lda-terms/cache-snapshot-pages-0-759.tar.gz -C .
python3 skills/parliament-thesaurus/dump_terms.py --all --page-size 20 --sleep 0.25
# pages 0–759 served from cache; fetching continues at 760.
# When it advances, re-snapshot + commit:
#   tar czf …/cache-snapshot-pages-0-NNN.tar.gz cache-parliament-lda-terms/
```

(`git lfs` is **not installed** in the web container, so the snapshot
lives in normal git — it's only ~280 KB. If you run where LFS is
available, track `cache-snapshot-*.tar.gz` and `*.nq.gz` via LFS and
keep the same paths.)

## Running it

```sh
# Smoke test — first page only
python3 skills/parliament-thesaurus/dump_terms.py --max-pages 1 --page-size 20

# Specific known item
python3 skills/parliament-thesaurus/dump_terms.py --ids 8193,478018

# Resume / continue the full crawl (reuses cache; ~7,092 pages — budget for it)
python3 skills/parliament-thesaurus/dump_terms.py --all --page-size 20 --sleep 0.25

# Re-apply normalisation to the existing dump WITHOUT network
python3 skills/parliament-thesaurus/dump_terms.py --renormalize
```

The output paths default to `third_party/data/parliament-lda-terms/`
under the repo root. Override with `--out` and `--summary`.

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

## Downstream: skosdex reimport (keep URLs stable)

This thesaurus is **hosted by skosdex** and consumed back here for feed
subject-tagging — so a fuller crawl has a payoff beyond the SPARQL store.

The skosdex manifest (<https://skosdex.fly.dev/manifest.json>) already
lists it:

```
slug:  uk-parliament-thesaurus
title: "UK Parliament Thesaurus (Commons Library, partial)"   ← note "partial"
graph: http://data.parliament.uk/terms/
```

skosdex ingests it from our **stable published Turtle URL**
<https://fpkg.fly.dev/kgx/parliament-lda-terms.ttl>. The whole point of
keeping that path constant across re-crawls is that skosdex's source
pointer never has to change — a reimport just re-fetches the same URL
and gets the richer graph.

**Workflow to ship a more-complete thesaurus end to end:**

1. **Resume the crawl** (`--all --page-size 20`; reuses cache).
2. **Re-run importer** (`dump_terms.py`) → `parliament-lda-terms.nq.gz`
   and **exporter** (`scripts/lda-terms-nq-to-ttl.mjs`) → the two `.ttl`
   copies — **same output paths / same published URL**.
3. **Re-snapshot the cache** tarball so the new progress is durable.
4. **Signal skosdex to reimport.** skosdex is a **sibling project**
   (`danbri/skosdex`) the maintainer drives directly (e.g. "ask
   Skosdex-Opus to refresh the `uk-parliament-thesaurus` feed and, once
   the crawl is complete, drop *partial* from its manifest title"). From
   *this* repo we only have to (a) keep the published URL stable and
   (b) flag that a richer graph is live at the same URL — the manifest
   `graph`/source URL never changes, so the reimport is a re-fetch.

## Cross-references

Everything in this repo that touches the Parliament Thesaurus:

- **`lib/facilities/skosdex.mjs`** — client for the hosted skosdex
  service that *re-publishes* this thesaurus (manifest slug
  `uk-parliament-thesaurus`) alongside EuroVoc/GEMET/etc.
- **`scripts/enrich-feeds-skosdex.mjs`** — tags Commons/Lords Library
  RSS *topic* feeds with controlled-vocab subjects, using the
  `uk-parliament-thesaurus` scheme (exact label match only) plus EuroVoc
  / GEMET. **Direct consumer of this crawl's completeness.** (Caveat: a
  separate precision issue — partial token-subset label matches such as
  `Economy Economy → "underground economy"` — lives in that script, not
  here.) Sidecar output: `demos/parliament-live/web/kgx/feeds-enrichment.json`.
- **`scripts/lda-terms-nq-to-ttl.mjs`** — the exporter (nq.gz → ttl).
- **`demos/parliament-live/web/kgx/thesaurus.html`** — faceted browser
  UI over the dump (served on fpkg).
- **`skills/linked-data-api`** — the legacy Elda API this crawler walks
  (`lda.data.parliament.uk/terms`).
- **`skills/data-parliament-uk-datasets`** — catalogue entry that points
  at the Thesaurus dataset.
- **`label-lang-overrides.jsonl`** (this folder) — per-term language tags
  applied during normalisation.
- **fpkg Oxigraph SPARQL store** + **`.github/workflows/rebuild-graphs.yml`**
  — loads `parliament-lda-terms.nq.gz` so `https://fpkg.fly.dev/sparql`
  answers thesaurus queries.

## Reference

Endpoint shape, query patterns and result counts are documented in
[`reference.md`](reference.md).
