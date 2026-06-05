---
name: fetch-sitemap
description: Fetch, parse and recurse XML sitemaps (the Sitemaps 0.9 protocol — sitemap.xml / sitemapindex.xml) for the UK Parliament web presence, and enumerate every public page URL. Use when you need the inventory of public web pages rather than structured API records — especially the many pages with NO JSON/REST API (corporate "About"/living-heritage, visiting, get-involved, site-information, Library landing pages, guidance), to know what the wrapped Members/Bills/Hansard/SPARQL facilities do NOT cover. The entry point is www.parliament.uk/sitemapindex.xml (a sitemap index → 6 child sitemaps; the root sitemap.xml alone lists ~16k URLs). Parses offline from a saved file too. Generic — works on any site's sitemap.
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

## Entry point

`https://www.parliament.uk/sitemapindex.xml` (declared in that host's
robots.txt) is a **sitemap index** pointing at 6 child sitemaps:

```
sitemap.xml               ← the big one: ~15,966 URLs (incl. living-heritage)
aboutsitemap.xml
visitingsitemap.xml
businesssitemap.xml
get-involvedsitemap.xml
site-informationsitemap.xml
```

Other web hosts (`hansard.`, `bills.`, `committees.`, `members.`,
`publications.`, the Library sites, `whatson.`) each have their own
`/sitemap.xml`; `parl sitemap hosts` lists the conventional entry points. The
authoritative location for any host is the `Sitemap:` line in its robots.txt.

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
# full corporate-site inventory (mind it's ~16k+ URLs — use --limit while exploring)
parl sitemap enumerate https://www.parliament.uk/sitemapindex.xml --delay-ms 300 --limit 50
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

See [`reference.md`](reference.md) for the data shapes and the full host list.

<!-- parl-cli-start -->
<!-- parl-cli-end -->
