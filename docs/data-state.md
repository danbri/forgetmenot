# Where state lives (generated / cached data)

This repo carries a fair amount of *generated* state — crawled, extracted, or
aggregated artifacts that are committed so the site and tools work offline and
so results are reproducible. This is the inventory: what each file is, the
script that produces it, and what refreshes it.

Rule of thumb: **`third_party/data/` holds the canonical generated state; the
`demos/parliament-live/web/` copies are the lighter, *served* derivatives** that
ship in the fly.io image (only `web/` is in the deploy build context).

## Web estate — sitemaps, feeds, reader

Directory: `third_party/data/parliament-sitemap/`

| File | What | Produced by | Refresh |
|---|---|---|---|
| `raw/<host>/<file>.xml.gz` | every Parliament sitemap, as fetched (63 files) | `scripts/cache-parliament-sitemaps.mjs` | manual / occasional |
| `urls.jsonl.gz` | all 1,088,193 `<loc>` (+`lastmod`), one JSON/line | ″ | ″ |
| `manifest.json` | sitemap tree: loc, type, count, bytes, sha256 per file | ″ | ″ |
| `hierarchy.json` | host→path aggregation (counts) | ″ (`pathHierarchy`) | ″ |
| `feeds.json` / `feeds.ttl` | concrete RSS catalogue, 918 feeds + facets/metadata | `scripts/build-parliament-feeds.mjs` (reads the cached taxonomy sitemaps) | when the cache changes |
| `feeds-liveness.json` | per-feed HTTP status, item count, latest date | `scripts/probe-feed-liveness.mjs` | **nightly CI** |
| `feeds-items.json` | recent items per alive feed (full snapshot) | ″ | **nightly CI** |
| `feeds.json` raw URL | `raw.githubusercontent.com/danbri/forgetmenot/claude/main/third_party/data/parliament-sitemap/feeds.json` | | |

Served derivatives (ship in the fly image):

| File | What | Produced by |
|---|---|---|
| `demos/parliament-live/web/kgx/sitemap-tree.json` | viz hierarchy (minCount 40), same as `browser/sitemap-tree.json` | `cache-parliament-sitemaps.mjs` writes `browser/`; copied to `web/kgx/` |
| `demos/parliament-live/web/kgx/feeds-items.json` | reader snapshot, trimmed to feeds active <365d (419) | `probe-feed-liveness.mjs` writes this directly |

Pages that read them: `/kgx/sitemap-tree` (the D3 web-estate map) and
`/kgx/feeds` (the feed reader). Standalone copies live under `browser/`.

## schemarama SHACL bundle

| File | Produced by |
|---|---|
| `browser/third_party/schemarama.bundle.min.js` | `scripts/build-schemarama-bundle.sh` (webpacks the `third_party/schemarama` submodule with `parseTurtle` + the raw validator exported) |
| `demos/parliament-live/web/kgx/third_party/schemarama.bundle.min.js` | copied by the same script (the deploy image needs its own copy) |

Used by `/kgx/shacl` and `browser/shacl-check.html`.

## Project RDF graphs (bundled SPARQL store)

`third_party/data/{scrutiny,transparency,accountability}-graph/*.nq.gz`,
`third_party/identity-graph/identity.nq.gz`, `third_party/data/psephology/`,
`…/parliament-lda-terms/`, `…/fcdo_treaties/`, `third_party/govuk/…` — the
N-Quads loaded into the bundled Oxigraph at container boot. Built by the
per-graph `tmp/*/build.py` and skill scripts; refreshed weekly.

## CI that refreshes state

| Workflow | When | Refreshes |
|---|---|---|
| `.github/workflows/refresh-feeds.yml` | nightly **03:17 UTC** | feeds liveness + items snapshot, then deploys |
| `.github/workflows/rebuild-graphs.yml` | Mondays 06:00 UTC | the project N-Quads + APPG cache, then deploys |
| `.github/workflows/deploy-fpkg.yml` | push to `claude/main` touching `demos/parliament-live/**` (or manual) | deploy only |

Both data workflows commit as `forgetmenot-bot` and `flyctl deploy` at the end
(a `GITHUB_TOKEN` push does not trigger `deploy-fpkg.yml`'s path filter, so they
deploy themselves). All need the `FLY_API_TOKEN` repo secret.

## Regenerating by hand

```sh
# whole web-estate cache (re-crawls ~1.09M URLs; ~15 MB)
node scripts/cache-parliament-sitemaps.mjs
# feeds catalogue from the cached sitemaps
node scripts/build-parliament-feeds.mjs
# feeds liveness + reader snapshot (also writes the served web copy)
node scripts/probe-feed-liveness.mjs
# the SHACL bundle
bash scripts/build-schemarama-bundle.sh
```

See `skills/fetch-sitemap/` for the web-estate side and
`third_party/data/parliament-sitemap/README.md` for the local detail.
