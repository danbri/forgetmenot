---
name: ico
description: "Query the Information Commissioner's Office — the UK's independent data-protection and FOI / EIR regulator. Wraps the HTML index of 'Action we've taken' (enforcement notices, Monetary Penalty Notices, decision notices, reprimands, undertakings, audits) and a generic page fetcher. No JSON API; ICO publishes regulatory action only as HTML. Use when the question is about ICO enforcement against a government department or other body, an FOI decision notice on a public authority, or the regulatory consequences of a data breach. Pairs with `bills` (Data Protection Bills) and `committees` (DSIT / Public Administration committee scrutiny)."
license: Open Government Licence v3.0 (Crown copyright, ICO)
metadata:
  facility: ico
  cli-alias: ico
  base-url: https://ico.org.uk
  provenance:
    tier: 3
    operator: Information Commissioner's Office (ICO)
    service: ico.org.uk
    upstream-data: "ICO's own published enforcement actions + decision notices + audit reports + reprimands + undertakings"
    citation-short: "via Information Commissioner's Office"
    citation-formal: "Information Commissioner's Office, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative for ICO's own regulatory output. ICO is a non-departmental public body sponsored by DSIT, with statutory functions under UK GDPR / Data Protection Act 2018 / FOIA 2000 / EIR 2004. Because there is no JSON API, structured extraction from the HTML listings is required for any aggregation."
---

# Information Commissioner's Office

Base URL: `https://ico.org.uk`

ICO is the UK's independent regulator for data protection (UK
GDPR, Data Protection Act 2018), freedom of information (FOIA
2000), environmental information (EIR 2004), and PECR (cookies /
direct marketing). Its public regulatory output sits under
`/action-weve-taken/` and is **HTML only** — there is no JSON
API and no RSS feed for enforcement actions (probed May 2026).

The library wraps:

| Surface | Path | What |
|---|---|---|
| Actions index | `/action-weve-taken/` | Umbrella listing of all categories |
| Category index | `/action-weve-taken/{category}/` | One category's listing |
| Generic page | `/{path}` | Any ICO HTML page |
| URL constructor | (client-side) | Build a stable action URL from a slug |

## Categories

| Category slug | What |
|---|---|
| `enforcement` | Enforcement notices, Monetary Penalty Notices (MPNs), undertakings, audits |
| `decision-notices` | FOI / EIR decision notices on public authorities |
| `audits` | Published audit reports |
| `reprimands` | Formal reprimands (introduced as a lighter-touch alternative to MPNs) |
| `undertakings` | Entity undertakings to remediate |

## CLI

```sh
parl ico actions --text                                    # umbrella index HTML
parl ico by-category enforcement --text                    # enforcement category
parl ico by-category decision-notices --text               # FOI / EIR decisions
parl ico by-category reprimands --text                     # reprimands
parl ico page "action-weve-taken/enforcement/<slug>/" --text
parl ico action-url some-enforcement-slug                  # build stable URL
```

## Joins to Parliament

- **ICO decision notice against a department**: when ICO finds a
  central government department in breach of FOIA / UK GDPR,
  related parliamentary scrutiny lives in [`committees`](../committees/SKILL.md)
  (typically DSIT / Public Administration and Constitutional
  Affairs / Justice committees) and [`written-questions-and-statements`](../written-questions-and-statements/SKILL.md).
- **Data protection Bills**: track the Bills themselves via
  [`bills`](../bills/SKILL.md) (e.g. Data Protection and Digital
  Information Bill, Data (Use and Access) Bill). The Commissioner
  routinely gives written and oral evidence on these.
- **ICO Annual Report → debate**: ICO lays its annual report
  before Parliament; floor debate is searchable via
  [`hansard`](../hansard/SKILL.md).

## Caveats

- **HTML-only.** Every aggregation task — counting MPNs in a
  year, listing reprimands against NHS bodies, etc. — requires
  scraping the listing pages. The library returns raw HTML; the
  LLM does the extraction.
- **No persistent IDs in the URL.** Each enforcement page has a
  slug, not a numeric ID. Pages can be re-slugged on publication
  of corrections; always store the full URL alongside the slug.
- **Decision notices are paginated**, sometimes with hundreds of
  pages per year. The umbrella index does *not* enumerate them
  all — use `by-category decision-notices` and follow the
  pagination links in the HTML.
- **Reprimands and MPNs are different instruments.** A reprimand
  is non-financial; an MPN imposes a monetary penalty (up to
  £17.5m / 4% of turnover under UK GDPR). Don't conflate.

## Provenance to cite

**Tier 3 — third-party (ICO), authoritative regulatory output.**

- Inline cite: **"(via Information Commissioner's Office)"** —
  once per paragraph.
- For formal output, name the action type, the respondent, and
  the date: *"ICO Monetary Penalty Notice against {body},
  £{amount}, issued {date}, retrieved {date2}"*. Use the page
  URL as the permanent reference.
- ICO is independent of government but sponsored by DSIT. Don't
  say "the government fined X" — say "the ICO fined X".
- See [`../../docs/provenance.md`](../../docs/provenance.md).
