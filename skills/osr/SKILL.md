---
name: osr
description: "Query the Office for Statistics Regulation — the independent regulatory arm of the UK Statistics Authority that polices the production and use of official statistics. Wraps OSR's RSS feed and HTML page fetcher for formal censures, case studies, review reports, and guidance. Use when the question is about whether a Minister or MP has been censured for misusing statistics, accreditation status of National Statistics, or compliance casework. OSR is the body that publicly rebukes politicians for citing dodgy numbers; pair with `hansard` for what was said and `interests` / `members` for who said it."
license: Open Government Licence v3.0 (Crown copyright, UK Statistics Authority)
metadata:
  facility: osr
  cli-alias: osr
  base-url: https://osr.statisticsauthority.gov.uk
  provenance:
    tier: 3
    operator: Office for Statistics Regulation (OSR)
    service: osr.statisticsauthority.gov.uk
    upstream-data: "OSR's own published casework + censures + review reports + Code of Practice for Statistics guidance"
    citation-short: "via Office for Statistics Regulation"
    citation-formal: "Office for Statistics Regulation, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative for OSR's own findings. OSR is part of the UK Statistics Authority (UKSA), itself a non-ministerial department reporting directly to Parliament under the Statistics and Registration Service Act 2007."
---

# Office for Statistics Regulation

Base URL: `https://osr.statisticsauthority.gov.uk`

OSR is the part of the UK Statistics Authority that regulates the
production and the *use* of official statistics. Its public-facing
casework typically falls in three categories:

1. **Censures of Ministers and MPs** when a public statement
   misrepresents official numbers (e.g. claims about NHS spending,
   crime, employment).
2. **National Statistics accreditation** — granting, suspending,
   or restoring the "National Statistics" badge on a publication
   under the Code of Practice for Statistics.
3. **Compliance reviews** of whole statistical series
   (e.g. housing starts, energy efficiency stats, immigration).

There is **no documented JSON API**. The library wraps:

| Surface | Path | What |
|---|---|---|
| All-publications RSS | `/feed/` | Recent censures, case studies, reports, guidance |
| HTML page | `/{path}` | Any OSR page (`/news/...`, `/publication/...`, `/casework/...`) |

## CLI

```sh
parl osr feed --text                                       # all OSR publications
parl osr page "news/letter-to-the-prime-minister-on-..." --text
parl osr page "publication/review-of-..." --text
```

## Joins to Parliament

- **OSR censure of an MP / Minister** → look up the offending
  statement in [`hansard`](../hansard/SKILL.md). The OSR letter
  is usually addressed to the named member; cite both the OSR
  letter and the Hansard column.
- **OSR review of a stats series** → if the series underpins a
  policy in a Bill, pair with [`bills`](../bills/SKILL.md). The
  Bill's Impact Assessment will typically rely on those
  statistics.
- **Code of Practice → Library briefing**: Commons Library
  briefings sometimes prompt OSR involvement when an MP queries
  a number; cross-reference with [`library-feeds`](../library-feeds/SKILL.md).

## Caveats

- **HTML-only.** OSR publishes a mix of letters (PDF), short
  case studies (HTML), and longer review reports (PDF). Extract
  named persons / departments from the HTML body or the linked
  PDF.
- **"Censure" is informal language.** OSR's formal output is a
  *letter* or a *case study*; politically the effect of a public
  OSR letter is a censure but the word doesn't always appear in
  the document title.
- **UKSA vs OSR.** UKSA is the wider body (with the Board and
  the National Statistician); OSR is its independent regulatory
  arm. Cite OSR specifically for regulatory output, UKSA for
  governance decisions.

## Provenance to cite

**Tier 3 — third-party (OSR / UK Statistics Authority),
authoritative.**

- Inline cite: **"(via Office for Statistics Regulation)"** —
  once per paragraph.
- For formal output, name the letter / publication and the
  addressee: *"OSR letter from Sir Robert Chote to the Prime
  Minister on NHS spending, {date}"*. Each OSR page is
  permalinked under `/news/` or `/publication/`.
- OSR sits inside UKSA; don't say "Parliament censured X" — say
  "OSR wrote to X" (the regulator is independent of Parliament
  even though UKSA reports to Parliament).
- See [`../../docs/provenance.md`](../../docs/provenance.md).
