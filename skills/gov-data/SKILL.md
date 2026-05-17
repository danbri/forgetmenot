---
name: gov-data
description: "Query the data.gov.uk CKAN catalogue — the UK government's central index of ~58,000 published datasets aggregated from every central department, most local authorities, and statutory bodies. Wraps CKAN's full-text search, dataset detail, publishing organisations, tags, and topic groups. Use when the question is about whether a department has published structured data on a topic, who publishes a given dataset, or what data is newly available. The catalogue is OGL v3.0; individual dataset licences vary and should be checked per-record."
license: Open Government Licence v3.0 (catalogue) — individual datasets vary
metadata:
  facility: gov-data
  cli-alias: gov-data
  base-url: https://data.gov.uk/api/3/action
  provenance:
    tier: 3
    operator: Government Digital Service (Cabinet Office)
    service: data.gov.uk
    upstream-data: "Dataset metadata harvested from ~600 publishing organisations (central departments, local authorities, NDPBs, statutory bodies); dataset content is hosted by the publisher, not by data.gov.uk"
    citation-short: "via data.gov.uk"
    citation-formal: "data.gov.uk CKAN catalogue, retrieved {date}, OGL v3.0 (catalogue metadata)"
    confidence: derived
    confidence-notes: "Catalogue is authoritative for *what is published*; the catalogue record points to the publisher's hosted file. For numeric or substantive claims, follow the resource link to the source publication and cite that. Many older records carry broken resource URLs or stale schemas; treat 'last modified' as a freshness signal."
---

# data.gov.uk

Base URL: `https://data.gov.uk/api/3/action`

data.gov.uk is operated by the Government Digital Service (Cabinet
Office). It runs the standard CKAN API: ~58,000 dataset records
harvested from every UK central department, ~4,000+ local
authorities, and a long tail of statutory bodies (HSE, NICE, ONS,
Met Office, DVLA, …).

## CKAN actions wrapped

| Action | Wrap | What |
|---|---|---|
| `package_search` | `search` | Full-text + facet search across all datasets |
| `package_show` | `dataset` | One dataset's full record (resources, formats, sizes) |
| `organization_list` / `_show` | `organisations` / `organisation` | Publishing bodies |
| `tag_list` | `tags` | CKAN tag vocabulary |
| `group_list` | `groups` | Higher-level topic groups |
| (helper) | `recent` | Recently-modified datasets (sort=metadata_modified desc) |

## CLI

```sh
parl gov-data search --query "spend over 500" --rows 10        # Solr full-text
parl gov-data search --fq "organization:hm-revenue-customs" --rows 50
parl gov-data dataset "uk-trade-info"                          # one dataset
parl gov-data organisations --all-fields true --take 50
parl gov-data organisation "ministry-of-justice" --include-datasets true
parl gov-data tags --query "transparency"
parl gov-data groups
parl gov-data recent --rows 20                                 # newest changes
```

`search` accepts both `--query` (CKAN `q`) and `--fq` (Solr
filter query). Useful filters:

- `organization:<slug>` — datasets owned by one publisher
- `groups:<slug>` — datasets in one topic group
- `tags:<tag>` — datasets carrying one tag
- `res_format:CSV` — datasets with at least one CSV resource
- `metadata_modified:[2025-01-01T00:00:00Z TO *]` — modified since
  a date (Solr range syntax)

## Joins to Parliament

- **Transparency disclosure → committee scrutiny**: "spend over
  £25,000" / "spend over £500" datasets are published monthly by
  every central department. Cross-reference with
  [`committees`](../committees/SKILL.md) and
  [`written-questions-and-statements`](../written-questions-and-statements/SKILL.md)
  when MPs ask about specific contracts.
- **Departmental publication → Estimate / Bill**: datasets
  published by HM Treasury, DWP, MoJ etc. underpin spending
  rounds — pair with [`bills`](../bills/SKILL.md) (Supply and
  Appropriation Bills).
- **Local-authority data**: data.gov.uk indexes ~4,275 council
  datasets. For Parliament-adjacent constituency-level analysis,
  pair with [`ons-nomis`](../ons-nomis/SKILL.md) (Census) and
  [`mysoc-mapit`](../mysoc-mapit/SKILL.md) (postcode → LAD →
  constituency).
- **Election results & boundaries**: many electoral datasets
  live here as resources; the canonical sources are
  [`dc-elections`](../dc-elections/SKILL.md) for election
  metadata and [`ons-geo`](../ons-geo/SKILL.md) for boundaries.

## Caveats

- **CKAN is a catalogue, not a hosting service.** Each dataset
  record contains `resources[]`; each resource has a `url`
  pointing at the publisher's own server. Resource URLs go stale
  — check `resources[].mimetype` and `resources[].url` before
  citing as live.
- **Solr behind `q` parameter.** Full Solr query syntax works:
  fielded search, ranges, boosts. Use `fq` (filter query) for
  facet filters that should not affect relevance ranking.
- **Mixed licences.** The *catalogue metadata* is OGL v3.0; the
  *datasets* themselves vary — most central-government data is
  OGL, but some local-authority data uses CC-BY, ODbL, or
  bespoke terms. Check `license_id` / `license_title` per record.
- **Old records can be stale.** Some publisher organisations
  have moved on; their datasets sit in CKAN with a `state: active`
  flag even though the underlying URL 404s. Treat
  `metadata_modified` as a freshness signal.

## Provenance to cite

**Tier 3 — third-party (Government Digital Service / Cabinet
Office); catalogue is derived metadata, dataset content is
upstream of the publisher.**

- Inline cite: **"(via data.gov.uk)"** — once per paragraph.
- For substantive claims using the *content* of a dataset,
  follow the resource link and cite the publisher's own
  publication: *"Cabinet Office spend over £25,000, October
  2025, via data.gov.uk"*.
- Check each dataset's `license_id`. OGL v3.0 is the default
  for central-government data but not universal.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
