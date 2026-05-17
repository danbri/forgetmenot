---
name: ec-donations
description: "Query the Electoral Commission's open search API for donations, campaign spending returns, loans to political parties, registered campaigners (referendum / election), and the Registers of political parties / non-party campaigners / accounting units. Use when the question is about who donated to which party, how much was spent on a campaign, or who's registered to spend on a referendum. Joins to the Parliament Register of Members' Financial Interests indirectly via the recipient name (party / MP / candidate)."
license: Open Government Licence v3.0 (Electoral Commission, Crown copyright)
metadata:
  facility: ec-donations
  cli-alias: ec
  base-url: https://search.electoralcommission.org.uk/api/search
  provenance:
    tier: 3
    operator: The Electoral Commission
    service: search.electoralcommission.org.uk
    upstream-data: "PPERA 2000 statutory returns from registered political parties, candidates, regulated entities, and (referendum) permitted participants"
    citation-short: "via Electoral Commission"
    citation-formal: "The Electoral Commission, donations / spending / loans registers, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative statutory register, but Donor names are free text — the same donor can appear under multiple spellings. For aggregation tasks, dedupe by donor address + nature of donation, not by donor name alone."
---

# Electoral Commission

Base URL: `https://search.electoralcommission.org.uk/api/search`

## Endpoints wrapped

| Endpoint | What |
|---|---|
| `Donations` | Cash + non-cash donations to parties, MPs, candidates, regulated entities |
| `Spending` | Campaign spending returns post-election |
| `Loans` | Loans to political parties |
| `Campaigners` | Registered campaigners for referendums + non-party campaigners |
| `Registers` | The statutory registers — political parties + non-party campaigners + accounting units |

## CLI

```sh
parl ec donations --recipient "Labour Party" --date-from 2024-01-01 --rows 50
parl ec donations --donor-name "Smith" --min-value 50000
parl ec spending --election "2024 UKPGE" --spender-name "Conservative"
parl ec loans --recipient "Reform UK"
parl ec registers --register-type "GB Political Parties"
```

## Joins to Parliament

- **Recipient → MP**: the donations register names parties and
  candidates. Match candidate names to `parl members search --name`
  to resolve to a Parliament member id (name-only matching has
  known false-positive risk — flag uncertain matches).
- **Cross-check with `interests`**: a donation to an MP should
  appear on both EC's donations register AND the MP's Register of
  Members' Financial Interests entry. Discrepancies are notable.

## Provenance to cite

**Tier 3 — third-party (Electoral Commission), authoritative.**

- Inline cite: **"(via Electoral Commission)"** — once per paragraph.
- For formal output, name the register + reporting period:
  *"Electoral Commission donations register, reporting Q2 2024,
  retrieved {date}"*. Each result row has `ReceivedDate` /
  `AcceptedDate` and a `RegulatedEntityName`.
- Donor names are free text; spell variations are common. Don't
  collapse two near-identical donor names without checking address
  / nature-of-donation fields.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
