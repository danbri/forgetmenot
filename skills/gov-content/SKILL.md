---
name: gov-content
description: "Query the gov.uk Content API and Search API — every page on www.gov.uk as structured JSON, plus full-text + facet search across them. Use when you want the structured form of a gov.uk page (e.g. /rubbish-collection-day, /check-uk-vat-number, /foreign-travel-advice/france), when you want to enumerate every lookup-shaped page of a given document_type (local_transaction, smart_answer, place, transaction, licence_transaction, finder, hmrc_contact, …), or when you need bank-holiday dates as JSON. Sister to gov-data which wraps the CKAN dataset catalogue at data.gov.uk; this wraps the *content* store. Free, no auth, OGL v3.0."
license: Open Government Licence v3.0 (Crown copyright)
metadata:
  facility: gov-content
  cli-alias: gov-content
  base-url: https://www.gov.uk
  provenance:
    tier: 3
    operator: Government Digital Service (Cabinet Office)
    service: www.gov.uk Content API + Search API
    upstream-data: "Every published gov.uk page, structured per its content schema (~138 document_types). Plus /bank-holidays.json — the canonical first-party hidden JSON API."
    citation-short: "via gov.uk Content API"
    citation-formal: "Government Digital Service, gov.uk Content API, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Content API mirrors the published page; what gov.uk says is what GDS / the publishing department wrote. For statements about *the state of the world* (e.g. flood warnings, vehicle MOT history) gov.uk is a frontend — the actual data comes from the relevant agency's backend, sometimes wrapped here as a separate facility (`flood`, `dvla`, etc.)."
---

# gov.uk Content API + Search API

Base URL: `https://www.gov.uk`. Two endpoints:

| Endpoint | What |
|---|---|
| `/api/content/<path>` | Full structured record for any gov.uk page |
| `/api/search.json?…` | Faceted search across all gov.uk pages |
| `/bank-holidays.json` | Canonical first-party hidden JSON API (3 divisions × ~30 dates × per-year) |

## Lookup-shaped document types (the "feels like an API" set)

`parl gov-content lookup-types` returns the live counts. As of
May 2026:

| `document_type` | Count | Pattern |
|---|---|---|
| `answer` | 762 | helpers, sign-ins, calculators |
| `licence_transaction` | 453 | postcode → council-issued licence |
| `transaction` | 241 | national lookups (vehicle reg, NI number, share code, …) |
| `hmrc_contact` | 127 | HMRC enquiry-route lookup |
| `local_transaction` | 118 | postcode → council service |
| `finder` | 57 | faceted search frontends |
| `step_by_step_nav` | 42 | multi-step process guides |
| `simple_smart_answer` | 38 | simpler Q&A trees |
| `smart_answer` | 29 | full Q&A trees with structured output |
| `place` | 23 | postcode → nearest provider |
| `help_page` | 11 | minor helpers |

**Total: ~1,900 lookup-shaped pages.** Each is fetchable via the
Content API for its structured representation.

## CLI

```sh
parl gov-content content rubbish-collection-day
parl gov-content content government/foreign-travel-advice/france
parl gov-content search --query "council tax" --filter-document-type local_transaction --count 10
parl gov-content list-type smart_answer --take 50
parl gov-content lookup-types
parl gov-content bank-holidays
```

## Joins to Parliament

- Every gov.uk page has `links.organisations` pointing at the
  publishing department; cross-reference to `members` for "who's
  the Secretary of State" and to `govuk-orgchart` for the wider
  hierarchy.
- gov.uk consultations and policy papers (other document types)
  often feed parliamentary debate — pair with `hansard` for what
  was said when, and `bills` for any resulting legislation.

## Sister facility

- [`gov-data`](../gov-data/SKILL.md) wraps the CKAN catalogue at
  `data.gov.uk` (datasets); this skill wraps the gov.uk Content +
  Search API (web pages). Use both depending on whether you want
  "what data exists" or "what does gov.uk say".

## Provenance to cite

**Tier 3 — third-party (GDS / Cabinet Office), authoritative for
what gov.uk has published.**

- Inline cite: **"(via gov.uk Content API)"** — once per paragraph.
- For statements about *facts of the world* served via a gov.uk
  page (e.g. an MOT history, a vehicle's tax status), cite the
  underlying agency too: gov.uk is the frontend; DVSA / DVLA / HMRC
  is the source of record.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
