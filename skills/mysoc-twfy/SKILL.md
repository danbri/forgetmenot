---
name: mysoc-twfy
description: "Query TheyWorkForYou (mySociety) — UK Parliament debates, written answers, written ministerial statements, MP / peer profiles, voting summaries, and user comments. Useful when you want MP-level data with mySociety's analyses on top (rebellion detection, attendance, contribution patterns) that Parliament's own APIs don't publish, or when the question is about a specific debate / written answer / WMS by date or by speaker. Requires a free API key from theyworkforyou.com/api/key — pass --api-key or set TWFY_API_KEY."
license: Creative Commons Attribution-ShareAlike 3.0 (TWFY content, mySociety)
metadata:
  facility: mysoc-twfy
  cli-alias: twfy
  base-url: https://www.theyworkforyou.com/api
  provenance:
    tier: 3
    operator: mySociety
    service: theyworkforyou.com
    upstream-data: "UK Parliament (members-api, bills-api, hansard-api, questions-statements-api) plus mySociety analyses"
    citation-short: "via TheyWorkForYou (mySociety)"
    citation-formal: "TheyWorkForYou, mySociety Ltd, retrieved {date}; underlying data: UK Parliament under Open Parliament Licence v3.0"
    confidence: derived
    confidence-notes: "Underlying parliamentary records track Parliament. Voting summaries / 'rebellion' counts / attendance metrics are mySociety analyses — useful but not authoritative; prefer the raw `commons-votes` and `hansard` facilities for primary citation."
---

# TheyWorkForYou (mySociety)

Base URL: `https://www.theyworkforyou.com/api`. Free API key from
<https://www.theyworkforyou.com/api/key>. Pass via `--api-key`,
`TWFY_API_KEY`, or `ctx.apiKey`.

## What it adds over our first-party Parliament wraps

- **Voting summaries per MP** — TWFY aggregates Commons divisions
  into thematic positions ("supported a more open Brexit", "voted
  against military intervention"). The taxonomy is mySociety's.
- **Stable TWFY person id** that maps across renamed / re-elected
  / changed-constituency MPs (P2009 on Wikidata).
- **Search across written + spoken + WMS** in one API.
- **TWFY's own comment threads** on speeches.

## CLI

```sh
parl twfy mps --search "Cooper" --api-key $TWFY_API_KEY
parl twfy mp --postcode "SW1P 3JA"
parl twfy mp-info <person> --fields "image,party,constituency,office"
parl twfy debates --type commons --date 2026-05-14
parl twfy wrans --search "climate" --person 24850
```

## Joins to Parliament data

- TWFY `person` id ↔ `parl members` `id` (TWFY's `office.position`
  records often quote the Parliament person id; cross-reference via
  Wikidata `wd by-mp-id <parl-id>` returning the TWFY id too).

## Provenance to cite

**Tier 3 — third-party (mySociety).**

- Inline cite: **"(via TheyWorkForYou, mySociety)"** — once per
  paragraph.
- For raw Hansard quotes, prefer the first-party
  [`hansard`](../hansard/SKILL.md) facility — TWFY's rendering of
  Hansard is faithful but not the official record.
- mySociety analyses (rebellion counts, attendance metrics, voting
  summaries) ARE TWFY-authored derivations; cite them as
  "TheyWorkForYou's analysis of ..." rather than "Parliament data
  shows ...". Never up-rate to first-party.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
