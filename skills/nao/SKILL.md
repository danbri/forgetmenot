---
name: nao
description: "Query the National Audit Office — Parliament's external auditor of UK central government. Wraps the NAO WordPress REST API and reports RSS feed for published value-for-money reports, financial audits, investigations, and good-practice guides. Use when the question is about an NAO report, audit findings on a department or programme, or what reports the Public Accounts Committee is likely to take evidence on next. NAO reports feed PAC; pair with the `committees` facility for the resulting parliamentary scrutiny."
license: Open Government Licence v3.0 (Crown copyright, NAO)
metadata:
  facility: nao
  cli-alias: nao
  base-url: https://www.nao.org.uk
  provenance:
    tier: 3
    operator: National Audit Office (NAO)
    service: www.nao.org.uk
    upstream-data: "NAO's own published reports + investigations + good-practice guides + financial audit opinions"
    citation-short: "via National Audit Office"
    citation-formal: "National Audit Office report, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative for NAO's own published findings. NAO is constitutionally independent of government but answerable to Parliament via the Public Accounts Commission and the Public Accounts Committee."
---

# National Audit Office

Base URL: `https://www.nao.org.uk`

The NAO is Parliament's external auditor of central government. Its
~60 reports a year drive most of the Public Accounts Committee's
agenda: when a department wastes money, fails delivery, or runs an
IT project off the rails, the NAO publishes a Value-for-Money
report; PAC then summons the Accounting Officer for evidence.

There is **no documented JSON API** for NAO. The library wraps
two functional surfaces:

| Surface | Path | What |
|---|---|---|
| WP REST | `/wp-json/wp/v2/posts` | Posts (reports) by id, search term, date, category |
| RSS | `/reports/feed/` | Recent reports as XML for tracking |

## CLI

```sh
parl nao reports --search "defence" --take 5             # WP search
parl nao reports --after 2025-01-01 --take 20            # reports since date
parl nao report 12345                                     # one report by WP id
parl nao feed --text                                      # recent reports RSS
parl nao categories                                       # topic taxonomy
```

Reports include the standard WP `title.rendered`,
`excerpt.rendered`, `content.rendered`, `slug`, `date`,
`modified`, and a `link` to the published page on nao.org.uk.

## Joins to Parliament

- **NAO report → PAC inquiry**: nearly every NAO Value-for-Money
  report is taken up by the [Public Accounts
  Committee](../committees/SKILL.md). Search PAC inquiries by the
  same topic terms to find the resulting evidence session and
  PAC report. The lag is typically 4–10 weeks.
- **NAO report → debate**: PAC reports themselves are debated;
  use [`hansard`](../hansard/SKILL.md) `search-debates --term`
  with the report's headline phrase.
- **Departmental audit opinion → Estimates**: NAO certifies the
  Resource Accounts of each department; cross-reference with the
  department's Main and Supplementary Estimates from
  [`bills`](../bills/SKILL.md) (Supply and Appropriation Bills).

## Caveats

- **Catalogue is WordPress.** Field shapes follow WP conventions
  (`title.rendered`, `content.rendered`, HTML-encoded). The
  underlying PDF reports are linked from the post body.
- **No structured authoring metadata.** Specific recommendations,
  the audited body, the spend at risk — these live in the body
  text, not as discrete fields. Plain-text extraction required for
  structured questions.
- **Categories are coarse.** "Defence", "Health", "Tax" etc.; not
  finer than departmental level.

## Provenance to cite

**Tier 3 — third-party (National Audit Office), authoritative.**

- Inline cite: **"(via National Audit Office)"** — once per
  paragraph.
- For formal output, name the report title and date: *"NAO,
  'Investigation into the British Steel pension scheme',
  published {date}, retrieved {date2}"*. Each WP post has `date`
  (publication) and a `link` (the canonical nao.org.uk URL).
- NAO is statutorily independent but is *not* a body of
  Parliament. Don't conflate NAO findings with PAC conclusions —
  PAC takes evidence on NAO reports and issues its own (often
  sharper) report; cite each separately.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
