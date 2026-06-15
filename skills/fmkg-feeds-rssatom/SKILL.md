---
name: fmkg-feeds-rssatom
description: Query the forgetmenot RSS/Atom feed catalogue — a concrete, metadata-rich index of every syndication feed across the UK Parliament web estate (House of Commons Library and House of Lords Library WordPress archives, exposed as <archive>/feed/, plus the first-party Bills API RSS), built by this repo and served on the fpkg demo app at https://fpkg.fly.dev/kgx/feeds. Use when the question is "what RSS/Atom feeds exist for Parliament", to enumerate per-topic / per-type / per-tag / per-author Library feeds with chamber + subject metadata, to track new Library briefings or Bills, or to cross-walk Library subject feeds against a controlled vocabulary (EuroVoc / GEMET) via the skosdex skill. Distinct from `library-feeds` (which wraps the official api.parliament.uk/library-feeds Rails aggregator); this is our own derived catalogue with a richer taxonomy and a live reader UI.
license: "Catalogue and code: this repo (forgetmenot). Underlying feeds: UK Parliament, Open Government Licence v3.0 (Crown copyright)."
metadata:
  facility: fmkg-feeds-rssatom
  cli-alias: null
  base-url: https://fpkg.fly.dev/kgx
  builder: scripts/build-parliament-feeds.mjs
  prober: scripts/probe-feed-liveness.mjs
  data:
    catalogue: third_party/data/parliament-sitemap/feeds.json
    catalogue-rdf: third_party/data/parliament-sitemap/feeds.ttl
    served-catalogue: https://fpkg.fly.dev/kgx/feeds.json
    served-items: https://fpkg.fly.dev/kgx/feeds-items.json
    reader: https://fpkg.fly.dev/kgx/feeds
  provenance:
    tier: 2
    operator: "forgetmenot (this repo) — derived catalogue over UK Parliament feeds"
    service: fpkg.fly.dev
    citation-short: "via forgetmenot feed catalogue (fpkg.fly.dev/kgx/feeds)"
    citation-formal: "forgetmenot RSS/Atom feed catalogue (fpkg.fly.dev/kgx/feeds.json), retrieved {date}; underlying feeds © UK Parliament, OGL v3.0"
    confidence: derived
    confidence-notes: "Feed URLs are derived from the cached UK Parliament taxonomy sitemaps + first-party API RSS, and one feed per class was HTTP-validated (200, application/rss+xml) at build. The catalogue is this repo's product, not a UK Parliament API. Feed CONTENTS are authoritative UK Parliament; cite the source feed too."
---

# fmkg-feeds-rssatom — the forgetmenot Parliament feed catalogue

A searchable/filterable catalogue of **real RSS/Atom feeds** across the
UK Parliament web estate, with enough metadata (host, chamber, scope,
subject group, tags) to power search, filtering and subject tagging.
It is built by this repo from the cached taxonomy sitemaps and served
on the **fpkg** demo app.

**This is not a UK Parliament API.** It is our own derived index. The
feeds it points at *are* UK Parliament (Commons / Lords Library, Bills
API); the catalogue, schema and reader are ours.

Sibling skills, do not confuse:
- [`library-feeds`](../library-feeds/SKILL.md) wraps the **official**
  `api.parliament.uk/library-feeds` Rails aggregator (one merged feed +
  per-publisher feeds, Commons/Lords Library + POST). Use that for the
  canonical merged stream.
- **This** skill is the broader, metadata-rich **catalogue** (≈900
  feeds incl. every Library *topic / type / tag / author* archive feed),
  with a live reader and a JSON/RDF catalogue you can join to skosdex.

## Where it lives

| Surface | URL / path | What |
|---|---|---|
| Reader (HTML) | `https://fpkg.fly.dev/kgx/feeds` | Human reader: search, chamber/scope chips, recent items per feed. |
| Recent items (JSON) | `https://fpkg.fly.dev/kgx/feeds-items.json` | The feeds active in the last 365 days, each with its latest ~8 items. Powers the reader. |
| Full catalogue (JSON) | `https://fpkg.fly.dev/kgx/feeds.json` | Every feed + `facets` (counts per host/chamber/scope/group/tag). The machine-readable index. |
| Catalogue (RDF) | `third_party/data/parliament-sitemap/feeds.ttl` | Same as Turtle (`dcterms:` + a small `fmn:` vocab). Repo only. |
| Builder | `scripts/build-parliament-feeds.mjs` | Derives feed URLs from cached sitemaps + first-party API RSS; writes `feeds.json`/`feeds.ttl` and the served copy. |
| Liveness prober | `scripts/probe-feed-liveness.mjs` | Nightly CI: fetches each feed, captures recent items, writes `feeds-items.json`. Refuses to overwrite if >50% fail (block/outage guard). |

## The catalogue schema

`feeds.json` → `{ generated, note, facets, feeds: [...] }`. Each feed:

```jsonc
{
  "id": "cl-topic-africa",                 // stable slug id
  "url": "https://commonslibrary.parliament.uk/topic/world-affairs/africa/feed/",
  "title": "Africa",
  "host": "commonslibrary.parliament.uk",
  "hostLabel": "House of Commons Library",
  "chamber": "Commons",                    // Commons | Lords | null (API feeds)
  "scope": "topic",                        // site | topic | type | tag | author | api
  "group": "world-affairs",                // top-level topic group, where applicable
  "path": "world-affairs/africa",
  "slug": "africa",
  "tags": ["library", "commons", "topic", "world-affairs"],
  "tracks": "https://commonslibrary.parliament.uk/topic/world-affairs/africa/",
  "format": "application/rss+xml",
  "source": "https://commonslibrary.parliament.uk/rb_topics-sitemap.xml"
}
```

Coverage at the last build (`facets`): **918 feeds** —
`scope`: site 2, topic 143, type 9, tag 32, author 729, api 3;
`chamber`: Commons 778, Lords 137. (`feeds-items.json` carries the
~420 that have posted in the last year.)

`feeds-items.json` → `[{ id, title, scope, chamber, url, items: [{ title, link, date }] }]`.

## Recipes (curl)

```sh
# Every Library TOPIC feed in the catalogue (subject archives)
curl -s https://fpkg.fly.dev/kgx/feeds.json \
  | jq -r '.feeds[] | select(.scope=="topic") | "\(.chamber)\t\(.group)/\(.slug)\t\(.url)"'

# What's the catalogue's subject breadth? (facet counts)
curl -s https://fpkg.fly.dev/kgx/feeds.json | jq '.facets'

# Latest items across the live feeds, newest first
curl -s https://fpkg.fly.dev/kgx/feeds-items.json \
  | jq -r '.[].items[] | "\(.date)\t\(.title)"' | sort -r | head -20

# One Lords Library subject feed, raw
curl -s 'https://lordslibrary.parliament.uk/?s=&post_type=research-briefing/feed/' | head
```

## Combining with skosdex (controlled-vocabulary tagging)

The Library **topic** feeds are an informal subject taxonomy
(`world-affairs/africa`, `social-policy/welfare-pensions/benefits`,
`science/environment/climate-change`, …). [`skosdex`](../skosdex/SKILL.md)
carries EuroVoc and GEMET, so each topic slug can be cross-walked to a
controlled-vocabulary concept — turning a folksonomy of feeds into
interoperable, EuroVoc/GEMET-tagged subscriptions.

```sh
# 1. pull the topic feeds
curl -s https://fpkg.fly.dev/kgx/feeds.json \
  | jq -r '.feeds[] | select(.scope=="topic") | .slug' | sort -u > /tmp/topics.txt

# 2. for a slug, find its EuroVoc concept (bare terms auto-scope to labels)
parl skosdex search "climate change" \
  --scheme http://eurovoc.europa.eu/100141 --rows 2 --fl id,prefLabel
#   => http://eurovoc.europa.eu/434743   ("climate change")

# 3. …and its GEMET concept
parl skosdex search "climate change" \
  --scheme http://www.eionet.europa.eu/gemet/gemetThesaurus --rows 2 --fl id,prefLabel
```

Schemes to scope against:
- EuroVoc — `http://eurovoc.europa.eu/100141`
- GEMET — `http://www.eionet.europa.eu/gemet/gemetThesaurus` (environment-only)

To pick the **English** label of a hit, walk it on the skosdex SPARQL
surface (the Solr labels are language-mixed and untagged):

```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?en WHERE { GRAPH ?g {
  <http://eurovoc.europa.eu/434743> skos:prefLabel ?en . FILTER(LANG(?en)="en")
} }
```

Worked pattern: today's-business → feeds → codes. Take a chamber's
business subjects (via the `whatson`/`now` skills), match each to a
Library topic feed here for ongoing tracking, and to a EuroVoc/GEMET
code via skosdex for interoperable tagging — one row per subject.

## Refreshing the data

```sh
node scripts/build-parliament-feeds.mjs    # rebuild catalogue from cached sitemaps
node scripts/probe-feed-liveness.mjs       # re-probe liveness + recent items (nightly in CI)
```

The builder reads cached sitemaps under
`third_party/data/parliament-sitemap/raw/` (see the
[`fetch-sitemap`](../fetch-sitemap/SKILL.md) skill — the Library hosts
are Cloudflare-gated, so the sitemaps are captured and committed).
