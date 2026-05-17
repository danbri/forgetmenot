---
name: obr
description: "Query the Office for Budget Responsibility — the UK's independent fiscal watchdog. Wraps OBR's RSS feeds (all publications + per-topic) and HTML page fetcher for Economic and Fiscal Outlooks (EFO), Fiscal Risks and Sustainability reports (FSR), Welfare Trends, Forecast Evaluation Reports (FER), and policy costings of Budget / Spring Statement measures. Use when the question is about OBR forecasts, fiscal headroom, or scrutiny of HM Treasury policy. Treasury Committee material; pair with the `committees` facility for the resulting parliamentary scrutiny."
license: Open Government Licence v3.0 (Crown copyright, OBR)
metadata:
  facility: obr
  cli-alias: obr
  base-url: https://obr.uk
  provenance:
    tier: 3
    operator: Office for Budget Responsibility (OBR)
    service: obr.uk
    upstream-data: "OBR's own published forecasts + costings + risk assessments + chart pack data"
    citation-short: "via Office for Budget Responsibility"
    citation-formal: "Office for Budget Responsibility, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative for OBR's own forecasts and analyses. OBR is a statutory non-departmental public body created by the Budget Responsibility and National Audit Act 2011; its forecasts underpin every UK Budget."
---

# Office for Budget Responsibility

Base URL: `https://obr.uk`

OBR provides the official UK fiscal forecast that the Chancellor
must use in setting policy. Its twice-yearly Economic and Fiscal
Outlook is published alongside the Budget and the Spring Statement;
its Fiscal Risks and Sustainability report (every two years) is the
long-horizon counterpart. OBR also costs every Budget measure and
periodically evaluates the accuracy of its own past forecasts.

There is **no documented JSON API**. The library wraps:

| Surface | Path | What |
|---|---|---|
| All-publications RSS | `/topics/feed/` | Recent OBR publications as XML |
| Per-topic RSS | `/{slug}/feed/` | One topic feed (e.g. `efo`, `fsr`, `wmar`, `policy-costing`) |
| WP REST (where exposed) | `/wp-json/wp/v2/posts` | WordPress search when available |
| HTML page | `/{path}` | Fetch any HTML page for LLM extraction |

## Useful topic slugs

| Slug | Document |
|---|---|
| `efo` | Economic and Fiscal Outlook (twice a year, alongside fiscal events) |
| `fsr` | Fiscal Risks and Sustainability report |
| `wmar` | Welfare Trends Report |
| `forecast-evaluation-report` | Forecast Evaluation Report (FER) |
| `policy-costing` | Individual policy costing notes (per measure in a Budget) |

## CLI

```sh
parl obr feed --text                                      # all-publications RSS
parl obr topic-feed efo --text                            # EFO feed
parl obr topic-feed policy-costing --text                 # costing notes feed
parl obr reports --search "headroom" --take 5             # WP search if exposed
parl obr page "publications/economic-and-fiscal-outlook-march-2026/" --text
```

The `page` command returns raw HTML — useful for asking an LLM to
extract the headline forecast numbers from a published outlook.

## Joins to Parliament

- **OBR EFO → Treasury Committee evidence**: every Budget,
  the [Treasury Committee](../committees/SKILL.md) takes oral
  evidence from the OBR's senior team. Search committee oral
  evidence by date and committee id.
- **OBR forecast → Budget debate**: floor debate on the Budget
  Resolutions and the Finance Bill cites OBR figures throughout;
  use [`hansard`](../hansard/SKILL.md) `search-debates`.
- **OBR costing → Finance Bill clause**: a policy-costing note
  attaches to a specific Budget measure that becomes a clause
  in the [Finance Bill](../bills/SKILL.md).

## Caveats

- **HTML-only.** Numeric forecast data (the public-finance
  tables, the supplementary data tables) lives in
  per-publication Excel workbooks linked from the HTML landing
  page. The `page` command returns the landing page; download
  the workbook separately for structured numbers.
- **OBR publications are dated by fiscal event**, not calendar
  date. Two EFOs a year (typically March + October/November).
- **Costings come in two forms**: per-policy notes (specific to
  one measure) and the policy-measures chapter inside each EFO.
  Both are authoritative.

## Provenance to cite

**Tier 3 — third-party (OBR), authoritative.**

- Inline cite: **"(via Office for Budget Responsibility)"** —
  once per paragraph.
- For numeric claims, cite the publication and the table number:
  *"OBR EFO October 2025, Table 1.1, retrieved {date}"*. Forecast
  numbers change between EFOs — always cite the specific EFO.
- OBR is statutorily independent of HM Treasury. Don't conflate
  OBR's central forecast with HM Treasury's policy assumptions.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
