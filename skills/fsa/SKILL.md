---
name: fsa
description: "Query the Food Standards Agency Food Hygiene Rating Scheme API — every food business in England, Wales and Northern Ireland scored 0-5 for hygiene by their council (the Scotland equivalent FHIS uses Pass / Improvement Required). ~660,000 establishments, each with the inspecting council, inspection date, and hygiene + structural + management-confidence sub-scores. Use when the question is about food hygiene ratings for a postcode, area, business, or council, when comparing inspection performance across local authorities, or when food-safety debates in Parliament reference specific outbreaks or rating distributions. Free, no auth, but the API requires the header `x-api-version: 2` (library injects it automatically)."
license: Open Government Licence v3.0 (Crown copyright; Food Standards Agency)
metadata:
  facility: fsa
  cli-alias: fsa
  base-url: https://api.ratings.food.gov.uk
  provenance:
    tier: 3
    operator: Food Standards Agency (FSA)
    service: api.ratings.food.gov.uk
    upstream-data: "Hygiene ratings issued by local authorities under the FHRS (England, Wales, NI) and FHIS (Scotland) schemes"
    citation-short: "via FSA Food Hygiene Rating Scheme"
    citation-formal: "Food Standards Agency, Food Hygiene Rating Scheme API, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative for FSA-published ratings as of inspection date. Inspection cadence varies by business risk category — recently-opened businesses may show 'AwaitingInspection'. Voluntary (England) since 2010 but ratings must be displayed by law in Wales (2013) and NI (2016)."
---

# FSA Food Hygiene Rating Scheme

Base URL: `https://api.ratings.food.gov.uk`. JSON, no API key; the
service requires the header `x-api-version: 2` (library injects).

## Two schemes

| Scheme | Where | Score |
|---|---|---|
| **FHRS** | England, Wales, NI | 0 (urgent improvement) to 5 (very good) |
| **FHIS** | Scotland | Pass / Improvement Required |

## What's wrapped

| Endpoint | Use |
|---|---|
| `/Establishments` | The ratings themselves. Filter by name, address, lat/lon + radius, council, scheme, rating, business type. |
| `/Establishments/<id>` | One business. |
| `/Authorities` | The 363 inspecting authorities. |
| `/Authorities/<id>` | One authority — includes contact, inspection performance counts. |
| Reference: `/Regions`, `/Countries`, `/BusinessTypes`, `/Ratings`, `/RatingOperators`, `/SchemeTypes`, `/SortOptions` |  |

## CLI

```sh
# Postcode-ish lookups (use lat/lon from `mapit postcode`)
parl fsa establishments --lat 51.4968 --lon -0.1262 --max-distance-km 1 --take 50

# By council
parl fsa authorities --take 363                    # find council id
parl fsa establishments --local-authority-id 197

# Only Scottish (FHIS) records
parl fsa establishments --scheme-type-key FHIS

# Only 5-star FHRS records
parl fsa establishments --rating-key fhrs_5_en

# Reference data
parl fsa ratings
parl fsa business-types
```

## Joins to Parliament

- Use [`mapit`](../mysoc-mapit/SKILL.md) to resolve a constituency
  to its containing councils, then `fsa authorities` to confirm
  the inspecting body and `fsa establishments --local-authority-id`
  to enumerate ratings under that council.
- The FSA's CEO appears before EFRA select committee periodically —
  pair with `committees`.
- Outbreaks debated in `hansard` (e.g. Pret 2018 allergen deaths
  Bill) — cross-reference specific affected businesses here.

## Provenance to cite

**Tier 3 — third-party (FSA), authoritative.**

- Inline cite: **"(via FSA Food Hygiene Rating Scheme)"** — once
  per paragraph.
- Quote both the rating value AND the rating date — ratings can
  go years between inspections.
- For "this constituency has X businesses with rating < 2"
  statements, cite the date you pulled the data; ratings change.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
