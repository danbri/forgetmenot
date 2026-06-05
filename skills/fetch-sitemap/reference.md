# fetch-sitemap — reference

Wraps the [Sitemaps 0.9 protocol](https://www.sitemaps.org/protocol.html) for
the UK Parliament web estate. JS module: `lib/facilities/fetch-sitemap.mjs`
(Node + browser; the `parse*` functions are pure and dependency-free).

## Confirmed structure (probed 2026-06-05)

`https://www.parliament.uk/sitemapindex.xml` → `<sitemapindex>` with 6 children:

| Child sitemap | Notes |
|---|---|
| `https://www.parliament.uk/sitemap.xml` | ~15,966 `<loc>` — the bulk, incl. `/about/living-heritage/…` |
| `https://www.parliament.uk/aboutsitemap.xml` | About section |
| `https://www.parliament.uk/visitingsitemap.xml` | Visiting |
| `https://www.parliament.uk/businesssitemap.xml` | Business of the House(s) |
| `https://www.parliament.uk/get-involvedsitemap.xml` | Get involved |
| `https://www.parliament.uk/site-informationsitemap.xml` | Site information |

Conventional per-host entry points (authoritative = each host's robots.txt
`Sitemap:` line); list available at runtime via `sitemap hosts`:

```
www.parliament.uk/sitemapindex.xml      (confirmed)
hansard.parliament.uk/sitemap.xml
bills.parliament.uk/sitemap.xml
committees.parliament.uk/sitemap.xml
members.parliament.uk/sitemap.xml
publications.parliament.uk/sitemap.xml
questions-statements.parliament.uk/sitemap.xml
lordslibrary.parliament.uk/sitemap.xml
commonslibrary.parliament.uk/sitemap.xml
whatson.parliament.uk/sitemap.xml
```

## API (JS)

| Export | Signature | Returns |
|---|---|---|
| `parse(xml)` | `(string)` | `{type:'index', sitemaps:[{loc,lastmod}]}` or `{type:'urlset', urls:[{loc,lastmod,changefreq,priority}]}`. Pure; throws a clear error on a Cloudflare-challenge body or non-sitemap XML. |
| `parseFile(path)` | `(string)` | as `parse`, reading a local file (Node only). |
| `fetchSitemap(url, opts, ctx)` | | fetch one sitemap and `parse` it. |
| `enumerate(url, opts, ctx)` | `opts: {maxSitemaps=100, limit=Infinity, delayMs=0}` | recurses an index into children; `{root, kind, childSitemaps, urlCount, urlsTruncated, sitemaps:[{loc,urls\|error}], urls:[…]}`. Sequential; per-child errors captured, not thrown. |
| `byHost(urls)` | `([{loc}\|string])` | `[{host, count, sample[]}]`, sorted by count. |
| `hosts()` | | the `PARLIAMENT_SITEMAPS` array above. |
| `PARLIAMENT_SITEMAPS` | const | host → conventional sitemap URL. |

## CLI

```
parl sitemap hosts
parl sitemap fetch <url>
parl sitemap enumerate <url> [--max-sitemaps N] [--limit N] [--delay-ms MS]
parl sitemap parse-file <path>
```

Alias: `parl fetch-sitemap …`. Output is JSON (`--text` for human).

## Parsing notes

- Pure regex over the well-defined Sitemaps 0.9 schema (no XML library), so it
  runs unchanged in the browser. Handles `<sitemapindex>` vs `<urlset>`,
  entity-decodes `<loc>` (`&amp;` → `&`, etc.), and tolerates attributes/
  whitespace on elements.
- Not handled (add if a Parliament sitemap needs it): gzipped sitemaps
  (`.xml.gz`), `xhtml:link` hreflang alternates, image/video/news extensions.
  These don't appear in the Parliament sitemaps as probed.

## Cloudflare / access

See SKILL.md. Summary: Node `fetch` (undici) currently passes the managed
challenge for these sitemap URLs (transport-fingerprint, not UA); `curl` and
headless Chrome are 403'd. Behaviour may change — `parse-file` on a
browser-saved XML is the durable fallback. We use an honest UA and never solve
or spoof the challenge.
