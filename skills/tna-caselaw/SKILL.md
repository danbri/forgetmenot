---
name: tna-caselaw
description: "Find Case Law — The National Archives' open service for UK court and tribunal judgments at caselaw.nationalarchives.gov.uk. Use when the question is about an approved judgment from the Supreme Court, Court of Appeal (Civil or Criminal), High Court (King's Bench / Chancery / Family / Administrative / Commercial / TCC), Upper Tribunal, Employment Appeal Tribunal, or a growing set of First-tier Tribunals. Distributed as LegalDocML (Akoma Ntoso) XML with Atom feeds and a public search. Pair with tna-legislation — judgments cite legislation; legislation Acts are interpreted by judgments."
license: Open Justice Licence (judgment text); OGL v3.0 (TNA wrapper); MIT (this skill's library)
metadata:
  facility: tna-caselaw
  cli-alias: caselaw
  base-url: https://caselaw.nationalarchives.gov.uk
  provenance:
    tier: 3
    operator: The National Archives (TNA) — Find Case Law service
    service: caselaw.nationalarchives.gov.uk
    upstream-data: "Approved judgments from the senior courts and tribunals, published by the courts and rendered by TNA as Akoma Ntoso XML"
    citation-short: "via Find Case Law (TNA)"
    citation-formal: "Find Case Law, The National Archives, retrieved {date}, under the Open Justice Licence"
    confidence: authoritative
    confidence-notes: "Judgment text is the official approved version. Coverage is growing — older judgments are being added retrospectively; absence of a judgment from Find Case Law does not prove it isn't reportable."
---

# Find Case Law (TNA)

Base URL: `https://caselaw.nationalarchives.gov.uk`. Distributed as
**Akoma Ntoso** (LegalDocML) XML, the same standard `legislation.gov.uk`
uses. Atom feeds for new judgments per court.

## Court URL slugs

| Slug | Court |
|---|---|
| `uksc` | Supreme Court of the United Kingdom |
| `ewca/civ` | Court of Appeal, Civil Division |
| `ewca/crim` | Court of Appeal, Criminal Division |
| `ewhc/kb` | High Court — King's Bench |
| `ewhc/ch` | High Court — Chancery |
| `ewhc/fam` | High Court — Family |
| `ewhc/admin` | High Court — Administrative |
| `ewhc/comm` | High Court — Commercial |
| `ewhc/tcc` | High Court — Technology and Construction |
| `ukut/aac` | Upper Tribunal — Administrative Appeals Chamber |
| `ukut/iac` | Upper Tribunal — Immigration & Asylum |
| `ukut/lc`  | Upper Tribunal — Lands |
| `ukut/tcc` | Upper Tribunal — Tax & Chancery |
| `ukeat`    | Employment Appeal Tribunal |

## CLI

```sh
parl caselaw atom
parl caselaw atom-court uksc
parl caselaw search --query "Online Safety Act" --court ewhc/admin --format atom
parl caselaw judgment ewhc/admin/2024/2042                # Akoma Ntoso XML (default)
parl caselaw judgment ewhc/admin/2024/2042 --format html
parl caselaw judgment ewhc/admin/2024/2042 --format pdf --out judgment.pdf
parl caselaw url ewhc/admin/2024/2042 --format xml        # URL only
```

## Joins

- Judgments cite Acts / SIs via Akoma Ntoso `<ref href>` elements
  pointing at `legislation.gov.uk` URIs. Pair with
  [`tna-legislation`](../tna-legislation/SKILL.md).
- For procedural / political context around legislation cited,
  follow back to [`bills`](../bills/SKILL.md) and
  [`hansard`](../hansard/SKILL.md).

## Provenance to cite

**Tier 3 — third-party (TNA), authoritative within coverage.**

- Inline cite: **"(via Find Case Law, TNA)"** — once per paragraph.
- For formal output: court + year + neutral citation
  (e.g. `[2024] EWHC 2042 (Admin)`) plus the TNA URL.
- Coverage is incomplete for older judgments — see the `versionDate`
  on each judgment's Akoma Ntoso `<FRBRdate>` for the publication
  date on Find Case Law. "Not in Find Case Law" ≠ "never reported".
- See [`../../docs/provenance.md`](../../docs/provenance.md).
