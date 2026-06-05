---
name: fetch-sitemap
description: Fetch, parse and recurse XML sitemaps (the Sitemaps 0.9 protocol — sitemap.xml / sitemapindex.xml) for the UK Parliament web presence, enumerate every public page URL (~1.09M across the estate), and track updates via the RSS/Atom feeds. Use when you need the inventory of public web pages rather than structured API records — especially the many pages with NO JSON/REST API (corporate "About"/living-heritage, visiting, get-involved, site-information, Library landing pages, guidance), to know what the wrapped Members/Bills/Hansard/SPARQL facilities do NOT cover. Entry: www.parliament.uk/sitemapindex.xml; publications via www.publications.parliament.uk/sitemap_index.xml (21 child sitemaps, ~1.04M URLs). A cached snapshot, a concrete 918-feed catalogue, a liveness survey, a D3 web-estate map (/kgx/sitemap-tree) and a feed reader (/kgx/feeds) are all committed — see docs/data-state.md. Parses offline from a saved file too. Generic — works on any site's sitemap.
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated) for parliament.uk content; the sitemap protocol itself is sitemaps.org (CC-BY-SA).
metadata:
  provenance:
    tier: 1
    operator: UK Parliament (web estate)
    service: "www.parliament.uk sitemapindex.xml + per-host sitemap.xml"
    citation-short: "via www.parliament.uk sitemap"
    confidence: empirical
    confidence-notes: "Sitemap index + root sitemap fetched & parsed 2026-06-05 via the parl library (6 child sitemaps; root sitemap.xml ~15,966 URLs). Live fetch is Cloudflare-fingerprint dependent — see the Cloudflare note."
---

# fetch-sitemap — enumerate Parliament's public web URLs

Most of this repo wraps Parliament's **APIs** (structured records). This
facility wraps the **sitemaps** — the published list of public *web page*
URLs. That matters because the APIs do **not** cover every public URL: large
swathes of `www.parliament.uk` (living-heritage / "About", visiting,
get-involved, site-information, guidance, Library landing pages) are web-only,
with no JSON/REST representation. A sitemap is the authoritative way to
inventory them.

## Entry points & scale (~1.09M URLs)

The whole reachable estate is **1,088,193 URLs across 63 sitemaps** (probed
2026-06-05). Roots:

- `https://www.parliament.uk/sitemapindex.xml` → 6 child sitemaps = 30,915 URLs
  (sitemap.xml 15,966 · business 9,552 · about 3,798 · site-info 1,047 ·
  visiting 293 · get-involved 259).
- **`http://www.publications.parliament.uk/sitemap_index.xml` → 21 child
  sitemaps = 1,041,256 URLs.** Use the *index*, not the bare `sitemap.xml`,
  which is only the first child capped at the 50k protocol limit.
- `commonslibrary.` (index → 20, ~13k) and `lordslibrary.` (index → 10, ~2.9k)
  are WordPress; `members.` 67; `hansard.` a 15-URL stub.
- `bills.`/`committees.`/`questions-statements.` have **no** sitemap — that
  content is API-only.

The authoritative location for any host is the `Sitemap:` line in its
robots.txt (readable via Node fetch). `parl sitemap hosts` lists entry points.

## CLI

```sh
parl sitemap hosts                                   # known entry points (offline, static)
parl sitemap fetch <url>                             # fetch + parse one sitemap / sitemapindex
parl sitemap enumerate <url> [--max-sitemaps N] [--limit N] [--delay-ms 300]
parl sitemap parse-file <path>                       # parse a locally-saved sitemap XML
```

`enumerate` recurses an index into its child sitemaps and returns a flat list
of every `<loc>` (with `lastmod`). It is **sequential and polite** — pass
`--delay-ms` to space out child fetches, and `--limit` to cap the URL count.

```sh
# corporate-site inventory (~31k URLs — use --limit while exploring)
parl sitemap enumerate https://www.parliament.uk/sitemapindex.xml --delay-ms 300 --limit 50
# the big one — publications via its index (~1.04M; cache it, don't hold in memory)
parl sitemap enumerate http://www.publications.parliament.uk/sitemap_index.xml --limit 50
```

## Cloudflare reality (read this)

Parliament's web hosts sit behind a Cloudflare **managed challenge**. Whether a
client gets through is **transport-fingerprint dependent, not UA dependent**
(probed 2026-06-05):

| Client | Result on the sitemap URLs |
|---|---|
| `curl` (any UA) | **403** "Just a moment…" |
| headless Chrome | **403** (never solves the challenge) |
| **Node `fetch` (undici)** — what `parl` uses | **passes** — returns the real XML |

So `parl sitemap fetch/enumerate` **works live today** from Node. We send an
honest identifying User-Agent and do **not** spoof a browser or solve the
challenge — a sitemap is published *for* crawlers, so this is a plain polite
GET, not bot-evasion. But the edge behaviour can change without notice, so the
parser is decoupled from the fetch: if a live fetch starts returning 403, open
the sitemap in a normal browser (it passes the challenge in one click), save
the XML, and run `parl sitemap parse-file saved.xml`. The `*-api.parliament.uk`
hosts are not challenged at all.

## Why this is useful: URLs with no API

Cross-reference the enumerated URLs against the wrapped facilities to find the
public pages that have **no** API representation (the original motivation):
`parl sitemap enumerate … ` → group by path section → anything under
`/about/`, `/visiting/`, `/get-involved/`, `/site-information/`,
`commonslibrary.`/`lordslibrary.` landing pages, etc. is web-only. The library
exposes `byHost(urls)` for a quick host breakdown.

## Cached state, feeds & reader

The whole estate is **cached and committed** so you don't need to re-crawl — see
[`docs/data-state.md`](../../docs/data-state.md) for the full map. Headlines:

- `third_party/data/parliament-sitemap/` — `raw/*.xml.gz` (every sitemap as
  fetched), `urls.jsonl.gz` (all 1.09M `<loc>`), `manifest.json`, `hierarchy.json`.
  Built by `scripts/cache-parliament-sitemaps.mjs`.
- **Feeds for update-tracking** — `feeds.json` / `feeds.ttl`: a concrete
  catalogue of **918 RSS/Atom feeds** (Commons/Lords Library per
  topic/type/tag/author + Bills API) with metadata (host, chamber, scope, group,
  tags, facet counts). Built by `scripts/build-parliament-feeds.mjs` from the
  cached taxonomy sitemaps. Sitemaps give the full URL set; feeds give the deltas.
- **Liveness** — `feeds-liveness.json` + `feeds-items.json`: of 918 feeds, all
  return 200 and 917 have items, but only ~**419 are active in the last year**
  (the author feeds are mostly dormant). Built by `scripts/probe-feed-liveness.mjs`,
  refreshed **nightly** by `.github/workflows/refresh-feeds.yml` (03:17 UTC).
- **UIs on fpkg**: `/kgx/sitemap-tree` (D3 icicle/treemap/sunburst of the estate)
  and `/kgx/feeds` (a search/filter feed reader over the 419 live feeds).

See [`reference.md`](reference.md) for the data shapes and the full host list.

<!-- parl-cli-start -->
<!-- parl-cli-end -->
