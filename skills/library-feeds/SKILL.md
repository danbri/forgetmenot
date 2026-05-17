---
name: library-feeds
description: Fetch the RSS aggregator at api.parliament.uk/library-feeds that combines feeds from the parliamentary research services — the House of Commons Library, the House of Lords Library, and the Parliamentary Office of Science and Technology (POST). Use when the question is about new research briefings, POST notes, or "what has the Commons Library published recently." Exposes a single aggregated RSS feed plus per-publisher feeds. There is no JSON API.
license: Open Government Licence v3.0 (Crown copyright)
metadata:
  facility: library-feeds
  cli-alias: library
  base-url: https://api.parliament.uk/library-feeds
  provenance:
    tier: 1
    operator: UK Parliament
    service: api.parliament.uk/library-feeds
    citation-short: "via api.parliament.uk/library-feeds"
    citation-formal: "UK Parliament Library Feeds (Commons / Lords Library / POST), retrieved {date}"
    confidence: authoritative
---

# UK Parliament Library Feeds

Base URL: `https://api.parliament.uk/library-feeds`

A Rails app that ingests RSS from the parliamentary research services (Commons Library, Lords Library, POST) and republishes them as a single aggregated feed plus per-publisher feeds. Powers the official Bluesky / Mastodon bots.

## What's exposed

Confirmed (May 2026):

| Path | Format |
|---|---|
| `/library-feeds/publications.rss` | Aggregated RSS of every publisher's new items |
| `/library-feeds/publishers/{id}.rss` | RSS for a single publisher |
| `/library-feeds/publishers` | HTML index of publishers (no JSON alt) |
| `/library-feeds/publications` | HTML browse (no JSON alt) |

Publisher IDs are listed on the HTML index page; treat them as opaque integers.

## Using the CLI

```sh
parl library rss --text                          # aggregated RSS feed
parl library publisher-rss 1 --text              # one publisher's feed
parl library publishers-url                      # HTML index URL
```

## Library use

```js
import * as lf from '../../lib/facilities/library-feeds.mjs';

const rss = await lf.publicationsRss();    // raw RSS XML string
```

## When to use this

- "**Recent research briefings**" → `library rss` (across all publishers) or `library publisher-rss <id>` (one publisher).
- For the full set of historical briefings as structured data → see [linked-data-api](../linked-data-api/SKILL.md) `briefingpapers` / `researchbriefings` datasets, indexed at [data-parliament-uk-datasets](../data-parliament-uk-datasets/SKILL.md).

See [`../parl/SKILL.md`](../parl/SKILL.md) for global CLI usage.

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via api.parliament.uk/library-feeds)"** — once per paragraph in
  user-facing answers.
- On request, give the URL `--raw` printed.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
