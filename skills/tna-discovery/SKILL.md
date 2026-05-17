---
name: tna-discovery
description: "Search and fetch records from TNA's Discovery catalogue — ~37 million record descriptions covering The National Archives' own holdings plus ~2,500 partner archives across the UK. Use when the question is about a specific archival file (treaty ratifications in FO 94, Cabinet papers in CAB, Foreign Office political correspondence in FO 371, Home Office records in HO, Prime Minister's Office in PREM), about a record series, about where a record is held, or about hierarchical browsing (department → series → piece). Pairs with fcdo-treaties / tna-legislation for archival depth behind contemporary citations."
license: Open Government Licence v3.0 (Crown copyright)
metadata:
  facility: tna-discovery
  cli-alias: discovery
  base-url: https://discovery.nationalarchives.gov.uk/API
  provenance:
    tier: 3
    operator: The National Archives (TNA)
    service: discovery.nationalarchives.gov.uk
    upstream-data: "Catalogue metadata for records at TNA and partner archives across the UK"
    citation-short: "via TNA Discovery"
    citation-formal: "Discovery catalogue, The National Archives, retrieved {date}, OGL v3.0"
    confidence: derived
    confidence-notes: "Discovery is the catalogue, not the content. A search result tells you the file exists, who holds it, and the description; the underlying record itself may be a physical paper file at Kew requiring a reader-room visit or paid copy order, or a digital scan, or a partner-archive holding."
---

# TNA Discovery

Base URL: `https://discovery.nationalarchives.gov.uk/API`

The catalogue of TNA + partner archives. ~37 million record
descriptions across 2,500+ UK archives. JSON API, no auth, OGL v3.0.

## Two endpoint styles

The Discovery API exposes two parallel surfaces over the same data:

| Style | Search path | Param convention |
|---|---|---|
| **v1** (default) | `/API/search/v1/records` | `searchQuery=…&resultsPageSize=N` |
| **sps** (older) | `/API/search/records` | `sps.searchQuery=…&sps.resultsPageSize=N` |

The library uses v1 by default; pass `style: 'sps'` to fall back to
the older shape (kept because some third-party tutorials assume it).

## Headline parliamentary-research series

| Series | What |
|---|---|
| **FO 93** | Foreign Office Protocols of Treaties (~8,900 files) |
| **FO 94** | Foreign Office Ratifications of Treaties (~3,300 files) |
| **FO 371** | FO Political Departments General Correspondence 1906–1966 |
| **CAB** | Cabinet papers (CAB 23, CAB 128, etc.) |
| **PREM** | Prime Minister's Office records |
| **HO** | Home Office records |
| **DEFE** | Ministry of Defence records |
| **T** | Treasury records |
| **HC** | House of Commons records (at the Parliamentary Archives) |
| **HL** | House of Lords records (at the Parliamentary Archives) |

## CLI

```sh
parl discovery search --query "Anglo-Egyptian Treaty" --record-series "FO 94" --take 5
parl discovery in-series "PREM 19" --query "Falklands"
parl discovery record C2840649                # one file's full metadata
parl discovery record C5 --include-children true
parl discovery children C5                    # series → pieces
parl discovery repositories --query "Westminster"
parl discovery repository A13530000           # TNA itself
parl discovery url C2840649                   # browser link for citation
```

## Response shape

`searchRecords` returns:

- `records[]` — each with `id`, `reference`, `title`, `description`, `coveringDates`, `numStartDate`/`numEndDate`, `heldBy`, `places`, `corpBodies`, `taxonomies`
- Aggregations: `taxonomySubjects`, `timePeriods`, `departments`, `catalogueLevels`, `closureStatuses`, `sources`, `repositories`, `heldByReps`, `referenceFirstLetters`, `titleFirstLetters`
- `count` — total matching
- `nextBatchMark` — cursor for paginating beyond the first batch

`record(id)` returns the full ISAD(G)-style metadata for one file:
`accessRegulation`, `accruals`, `accumulationDates`, `administrativeBackground`, `appraisalInformation`, `arrangement`, `corporateNames`, `creatorName`, `custodialHistory`, `scopeContent`, `formerReferenceDep`, etc.

## Joins to Parliament

- **Treaty research**: pair with [`fcdo-treaties`](../fcdo-treaties/SKILL.md) (catalogue of UKTO) and [`treaties`](../treaties/SKILL.md) (Parliament's CRaG-laid treaties). The ratifications themselves are physical files at TNA in **FO 94**.
- **Bills / Acts archival depth**: pair with [`tna-legislation`](../tna-legislation/SKILL.md) (the enacted text) and [`bills`](../bills/SKILL.md) (the parliamentary journey). Drafting papers, Cabinet committee minutes, and departmental rationale typically sit in **CAB**, **PREM**, or department-specific series.
- **Hansard depth**: the **HC** and **HL** series at the Parliamentary Archives hold the physical originals behind everything in [`hansard`](../hansard/SKILL.md) and [`historic-hansard`](../historic-hansard/SKILL.md).

## Caveats

- **Catalogue ≠ content.** Discovery tells you a file exists. Getting the actual document may require a Kew reader-room visit, a paid copy order, or a partner-archive request. Some records are fully digitised (especially Cabinet papers); most are not.
- **`heldByCode`** distinguishes `TNA` (held at Kew) from `OTH` (partner archive — Discovery indexes the catalogue but doesn't hold the document). For Westminster, the **Parliamentary Archives** are an `OTH` repository — search returns metadata, you'd need to contact them for the file.
- **Closure status** matters. `closureType` codes indicate whether a file is open, redacted, or sealed; respect them when citing.

## Provenance to cite

**Tier 3 — third-party (TNA), authoritative catalogue.**

- Inline cite: **"(via TNA Discovery)"** — once per paragraph.
- For formal output, name the reference and the repository:
  *"FO 94/523, The National Archives, Kew (via TNA Discovery,
  retrieved {date})"*. The `parl discovery url <id>` command
  gives a permanent citation link.
- A search result confirms a file's existence and description.
  If you assert the file's *content*, you've read either the
  digital scan (sometimes available via Discovery itself) or the
  physical document — cite accordingly.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
