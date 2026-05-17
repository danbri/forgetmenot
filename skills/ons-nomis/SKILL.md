---
name: ons-nomis
description: "Query Nomis — ONS's free Census 2021 + labour-market data service — at constituency / LAD / MSOA / LSOA / OA granularity. Use when the question is about the population, employment, claimant count, occupation, qualifications, ethnicity, age, health, or any other Census 2021 / labour-market table for a specific Westminster constituency, council area, or ward, or for by-constituency comparisons across the UK. Coverage spans ~1,600 datasets including the full Census 2021 (TS-series) and the ONS labour-market series (claimant count, BRES, ASHE, APS). Anonymous SDMX-JSON; no auth."
license: Open Government Licence v3.0 (Crown copyright; ONS via Nomis at the University of Durham)
metadata:
  facility: ons-nomis
  cli-alias: nomis
  base-url: https://www.nomisweb.co.uk/api/v01
  provenance:
    tier: 3
    operator: Office for National Statistics (Nomis, University of Durham)
    service: nomisweb.co.uk
    upstream-data: "ONS Census 2021 + labour-market series + DWP claimant data"
    citation-short: "via Nomis (ONS)"
    citation-formal: "Nomis, Office for National Statistics, retrieved {date}"
    confidence: authoritative
    confidence-notes: "Underlying tables are ONS-published official statistics. The Nomis service itself is hosted by the University of Durham under contract to ONS. The per-row 'value' is what ONS publishes."
---

# Nomis — ONS Census + labour-market data

Base URL: `https://www.nomisweb.co.uk/api/v01`

Free SDMX-JSON API to ~1,600 datasets at Westminster-constituency
(WMC) and finer granularities. The canonical UK source for
"who lives here, what do they do" questions, joinable to Parliament
data via ONS GSS codes.

## Headline datasets

| Dataset id | What it is |
|---|---|
| `NM_2021_1` | Census 2021 main residents table (TS001 — usual residents in households / communal establishments). |
| `NM_2021_*` | Other Census 2021 TS-series tables (TS002 = household composition, TS003 = age, TS021 = ethnicity, …). Each gets its own `NM_2021_<n>` id. |
| `NM_1_1` | Jobseeker's Allowance — claimant count with rates and proportions. |
| `NM_17_5` | Annual Survey of Hours and Earnings (ASHE) — workplace-based. |
| `NM_142_1` | Annual Population Survey (APS) — labour market by area. |
| `NM_189_1` | Business Register and Employment Survey (BRES). |

`parl nomis datasets` lists every one.

## The geography-filter dance (read this)

Nomis indexes data by **its own internal geography ids and "type"
codes**, NOT by bare ONS GSS codes. A bare `geography=E14001063`
filter often returns **zero observations**, even for a valid
Aldershot record. Two reliable patterns:

1. **All geographies of a type** (the typed query):
   `geography=2092957699TYPE172`
   means "every Westminster Parliamentary Constituency 2024 within
   the UK parent (2092957699)". Returns up to ~650 rows.

2. **One geography by Nomis internal id** (NOT GSS): obtained from
   the `geography` codelist for the dataset.

To discover the right TYPE number for the boundary you want, run:

```sh
parl nomis geography-types NM_1_1
```

Look for the `TypeCode` annotation. For 2024 Westminster
constituencies the answer is **TYPE172**. Census 2021 datasets use
the same convention. The type numbers are stable across datasets
that publish the same geography.

## CLI

```sh
# Discovery
parl nomis datasets                                  # 1,600+ datasets
parl nomis dataset-def NM_2021_1                     # dimensions & codelists
parl nomis codelist NM_2021_1 geography              # what geographies are valid?
parl nomis geography-types NM_1_1                    # TYPE codes the dataset is indexed by

# Data
parl nomis data NM_1_1 \
    --geography 2092957699TYPE172 \                  # every WMC 2024
    --measures 20100 \                               # measure "Value"
    --date latest \
    --take 650

# CSV instead of SDMX-JSON
parl nomis data NM_2021_1 --geography 2092957699TYPE172 --measures 20100 --format csv
```

## Worked chain

```
parl mapit postcode SW1P3JA              # → constituency name "Cities of London and Westminster", GSS E14001172
parl nomis geography-types NM_2021_1     # find TYPE172 = Westminster 2024
parl nomis data NM_2021_1 \
    --geography 2092957699TYPE172 \
    --measures 20100 \
    --date latest                        # → Census 2021 totals for every constituency
```

## Common dimension filters

| Dimension | Meaning |
|---|---|
| `geography` | The area code or `<parent>TYPE<n>` typed query |
| `measures` | What metric (20100 = "Value", others vary) |
| `date` | Time period — `latest`, `2024`, `2024-12`, or comma-separated |
| `c_age`, `c_sex`, `c_industry`, … | Census / survey breakdowns — vary per dataset |
| `select` | Comma-separated list of fields to project (`geography_name,obs_value,…`) |
| `recordlimit` (via `--take`) | Page size |
| `RecordOffset` (via `--skip`) | Page offset |

Every Nomis dataset has its own list. `parl nomis dataset-def <id>`
returns the full dimension list with codelist references.

## Provenance to cite

**Tier 3 — third-party (ONS via Nomis), authoritative.**

- Inline cite: **"(via Nomis, ONS)"** — once per paragraph.
- For formal output use "Office for National Statistics, Census
  2021, via Nomis, retrieved {date}" — the underlying authority is
  ONS; Nomis is the delivery vehicle.
- When publishing a constituency-level figure, name the dataset
  table number (e.g. "TS001"), the geography type used
  (`TYPE172` = Westminster 2024), and the date.
- The bare GSS-code shortcut can silently return 0 obs; the skill
  body documents the typed-query workaround. Don't claim "no data
  for X" if you've only tried the GSS shortcut.
- See [`../../docs/provenance.md`](../../docs/provenance.md) for
  cross-skill rules.
