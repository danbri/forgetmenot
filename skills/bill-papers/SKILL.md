---
name: bill-papers
description: Fetch the Bill Papers catalogue at api.parliament.uk/bill-papers as CSV or RSS — every publication attached to a UK Parliament Bill (the Bill itself, Explanatory Notes, Impact Assessments, Amendment Papers, Committee documents, the Act as passed, etc.). Use when you want a bulk CSV of every bill or every publication type, or an RSS feed for a single bill's papers. Complements the bills facility, which exposes per-publication metadata via the JSON API; bill-papers gives you the flat catalogue and the per-bill feed for tracking new documents.
license: Open Government Licence v3.0 (Crown copyright)
metadata:
  facility: bill-papers
  cli-alias: bp
  base-url: https://api.parliament.uk/bill-papers
---

# UK Parliament Bill Papers

Base URL: `https://api.parliament.uk/bill-papers`

A Rails app that sits in front of the same data as the [bills](../bills/SKILL.md) API and exposes **CSV bulk catalogues** and **per-bill RSS feeds** — surfaces the JSON API does not expose.

## What's exposed

Confirmed alternate-format links (May 2026):

| Path | Format |
|---|---|
| `/bill-papers/bills.csv` | CSV: every bill (id, name, etc.) |
| `/bill-papers/publication-types.csv` | CSV: every publication type (id, label, counts, description) — currently 61 types |
| `/bill-papers/bills/{billId}.csv` | CSV: every publication attached to one bill |
| `/bill-papers/bills/{billId}.rss` | RSS feed of those publications |
| `/bill-papers/bills/{billId}` | HTML detail page (no JSON alt) |
| `/bill-papers/sessions`, `/bill-types`, `/bill-categories` | HTML only |

The site is the source of truth for the publication-type taxonomy (e.g. "Act of Parliament" = id 6; "Amendment Paper" = id 7; "Impact Assessment" lives in its own type). Use [bills](../bills/SKILL.md) for the typed JSON record of an individual publication.

## Using the CLI

```sh
parl bp pubtypes-csv --text       # CSV catalogue of publication types
parl bp bills-csv --text          # CSV catalogue of all bills
parl bp bill-csv 3973 --text      # All papers for bill 3973 as CSV
parl bp bill-rss 3973 --text      # Same, as RSS
```

The library also exports a small CSV parser:

```js
import * as bp from '../../lib/facilities/bill-papers.mjs';

const csv = await bp.publicationTypesCsv();
const rows = bp.parseCsv(csv);   // [{ "Bill system ID": "6", Label: "Act of Parliament", ... }]
```

## When to use this vs `bills`

- Use **`bills`** for JSON queries by id, search, stages, amendments, publications metadata.
- Use **`bill-papers`** for bulk CSV exports (e.g. mapping every bill id → publication count) and for RSS-driven tracking of new documents on a specific bill.

See [`../parl/SKILL.md`](../parl/SKILL.md) for global CLI usage.
