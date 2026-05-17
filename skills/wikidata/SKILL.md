---
name: wikidata
description: "Query Wikidata's SPARQL endpoint at query.wikidata.org/sparql, plus a quick `search` shortcut against the Wikidata web API for label → QID lookups, and an `entity` shortcut for the full Linked-Data JSON of a QID. Use when you need to cross-reference Parliament records (people, parties, constituencies) to identifiers in other ecosystems, when joining two datasets via Wikidata QIDs as a common bridge, or for free-form SPARQL over the world's largest open knowledge graph. CC0; the only ask is a polite User-Agent."
license: Creative Commons Public Domain Dedication (CC0) — Wikimedia Foundation
metadata:
  facility: wikidata
  cli-alias: wd
  base-url: https://query.wikidata.org/sparql
  provenance:
    tier: 3
    operator: Wikimedia Foundation
    service: query.wikidata.org
    upstream-data: "Community-curated Wikidata project (CC0)"
    citation-short: "via Wikidata"
    citation-formal: "Wikidata, Wikimedia Foundation, retrieved {date}, CC0"
    confidence: derived
    confidence-notes: "Wikidata IDs are community-curated. Cross-corpus identifier properties exist for UK politicians (TheyWorkForYou id, gov.uk profile slug, etc.) but the *specific property numbers* drift and we no longer hardcode them — discover via `entity(qid)` and inspect `claims` keys. For high-stakes joins, verify against the primary source."
---

# Wikidata SPARQL

Base URL: `https://query.wikidata.org/sparql`. Free SPARQL 1.1
endpoint, CC0, no auth. WDQS requires a polite `User-Agent` (the
library sets `forgetmenot-wikidata/0.1` automatically).

## Surface

| Command | What |
|---|---|
| `query <sparql>` | Run any SPARQL 1.1 query. Auto-POSTs for queries > 1500 chars. |
| `entity <qid>` | Linked-Data JSON for one QID — every claim, label, sitelink. |
| `search <label>` | Wikidata web-API label search. Faster than SPARQL for "what's the QID of X". |

## Discovery pattern (use this for cross-IDs)

Wikidata's property catalogue is large and the right property
numbers for UK-politician cross-refs drift. Don't hardcode. The
reliable discovery loop:

```sh
# 1. Find the QID for a known politician you trust
parl wd search "Keir Starmer" --take 3

# 2. Pull the full entity JSON
parl wd entity Q333062

# 3. Inspect `claims` keys to find the cross-ID property numbers
#    (e.g. "P10428", "P2009") and their values
```

Then use the discovered property in SPARQL queries against the
endpoint for all UK MPs:

```sh
parl wd query 'SELECT ?person ?label ?xid WHERE {
  ?person wdt:P<discovered> ?xid .
  OPTIONAL { ?person rdfs:label ?label . FILTER(LANG(?label)="en") }
} LIMIT 50'
```

## Worked chain

`postcode → constituency → MP → Wikidata → other corpora`:

```sh
parl mapit postcode SW1P3JA              # → constituency + GSS
parl members constituency-search --search-text "Cities of London and Westminster"
parl members get <member-id>             # → MP name + Parliament id
parl wd search "<MP name>" --take 3      # → candidate QIDs
parl wd entity Q<qid>                    # → every cross-corpus id Wikidata knows
```

## Existing cached extracts in this repo

For pre-resolved UK-politician cross-IDs, see
[`third_party/data/wikidata/`](../../third_party/data/wikidata/) —
JSON-Lines + Turtle bridge files maintained by the
[`govuk-orgchart`](../govuk-orgchart/SKILL.md) tooling.

## Provenance to cite

**Tier 3 — third-party (Wikimedia Foundation), CC0.**

- Inline cite: **"(via Wikidata)"** — once per paragraph.
- Wikidata claims are **community-curated**. For high-stakes
  identity statements, verify cross-IDs against the primary source.
- Never hardcode property numbers from memory; discover via
  `entity(qid)`.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
