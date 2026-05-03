# Per-MP site profile snapshot

Output of `parl members crawl-sites --in third_party/data/members --out third_party/data/sites`.

For every member with a personal/constituency website (per the
[`members`](../members/) snapshot), the site-respecting crawler
in `lib/facilities/sites.mjs` fetches the homepage + robots.txt
+ sitemap + any RSS/Atom feeds + a small set of
politically-relevant typed pages. Personal/family pages are
explicitly excluded by the `EXCLUDE_PERSONAL` rules in the same
file.

## Per-site layout

```
<id>/
  manifest.json          # decisions, log, platform, social, feed/page metadata
  robots.txt             # what we fetched
  sitemap.xml            # if present
  homepage.html          # raw homepage body
  homepage.json          # extracted record
  feeds/<n>.xml          # raw feed bodies
  pages/<type>.{html,json}   # one pair per typed page actually fetched
```

`<type>` is one of: `about`, `news_index`, `parliament`,
`campaigns`, `petition`, `surgery`, `contact`, `get_involved`,
`newsletter`, `jobs`, `events`, `donate`, `accessibility`,
`privacy` — see `POLITICAL_TYPES` in `lib/facilities/sites.mjs`
for the canonical list and the slug fragments used to detect each.

## Manifest schema (per site)

```jsonc
{
  "member": { "id": ..., "name": ..., "party": ..., "house": ..., "constituency": ... },
  "homepageUrl": "...",
  "origin": "https://...",
  "ok": true,                            // false if homepage fetch failed
  "blocked": false,                      // true if blocked by robots.txt
  "homepage_error": null,                // {status, message} on failure
  "startedAt": "...", "finishedAt": "...",
  "platform": "WordPress (labour-new-theme)",   // best-effort fingerprint
  "newsletter_provider": "Mailchimp",           // null if not detected
  "social": [{ "url": "...", "host": "twitter.com" }, ...],
  "robots": { "allow": [...], "disallow": [...] },
  "feeds":  [{ "url": "...", "file": "feeds/0.xml", "bytes": ... }],
  "sitemap_file": "sitemap.xml",
  "homepage": { "title": ..., "h1": ..., "headings": [...], "text_excerpt": "...", "raw_html_file": "homepage.html", ... },
  "pages": [
    { "url": "...", "type": "campaigns", "http_status": 200, "bytes": ..., "matched_token": "campaign", "candidates": { "campaigns": [...] }, "raw_html_file": "pages/campaigns.html" },
    { "url": "...", "type": "donate", "presence_only": true, "link_text": "Donate" }
  ],
  "decisions": [
    { "url": "...", "text": "...", "action": "classified", "type": "campaigns", "matched": "campaign" },
    { "url": "...", "text": "...", "action": "excluded-personal", "rule": "family", "reason": "family-life pages" },
    { "url": "...", "text": "...", "action": "skipped-robots" },
    { "url": "...", "text": "...", "action": "unclassified" }
  ],
  "log": [...]   // chronological steps
}
```

Every classification + exclusion + skip is recorded under
`decisions[]`, and every fetch step under `log[]`, so reviewers
can audit exactly what the crawler did per site.

## Refreshing

```sh
parl members crawl-sites --in third_party/data/members --out third_party/data/sites --concurrency 4
```

Resumable — sites with an existing `manifest.json` are skipped
unless `--refetch`. Restrict with `--ids 4514,172,...` or
`--max N` for testing.

## Source

UK Parliament Members API → personal-website URLs → MP-controlled
sites under each MP's own domain. Open Parliament Licence does
not apply to the third-party site content; reuse is governed by
each site's own terms.
