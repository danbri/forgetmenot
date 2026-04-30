---
name: uk-parliament-linked-data-api
description: Query the legacy Parliament Linked Data API (Elda) at lda.data.parliament.uk — older but still-running JSON-over-HTTP endpoints for individual datasets like commonsdivisions, lordsdivisions, briefingpapers, researchbriefings, etc. Each dataset has its own URL pattern and supports filter parameters, pagination via `_pageSize` and `_page`, and content negotiation. Use when a question is about a dataset listed on explore.data.parliament.uk for which there is no modern REST API equivalent (briefing papers, research briefings, election results, the Parliament Thesaurus).
---

# UK Parliament Linked Data API (Elda)

Hosts:
- `https://lda.data.parliament.uk` (canonical)
- `https://eldaddp.azurewebsites.net` (Azure-hosted, identical content
  surface — useful as a fallback when the canonical host is slow)

This is the older "Elda" Linked Data API installation. The root path
returns 404; you must request a known dataset. The format suffix
selects the response type:

| Suffix | Response |
|---|---|
| `.json` | JSON Linked Data API output |
| `.xml` | XML |
| `.ttl` | Turtle |
| `.html` | HTML browser |

## What it covers

The 19 datasets listed by `explore.data.parliament.uk`'s catalogue
([`_specs/discovered/releaseddatasets.txt`](../../_specs/discovered/releaseddatasets.txt)
once captured) — see also
[`data-parliament-uk-datasets`](../data-parliament-uk-datasets/SKILL.md).
Some examples confirmed live:

- `/commonsdivisions.json` — Commons divisions list.
- `/lordsdivisions.json` — Lords divisions list.
- `/commonsoralquestions.json`
- `/commonswrittenquestions.json`
- `/lordswrittenquestions.json`
- `/briefingpapers.json` — Commons Library briefing papers.
- `/researchbriefings.json` — research briefings.
- `/electionresults.json`
- `/elections.json`
- `/edms.json` — Early Day Motions.
- `/proceedings.json` — sittings / proceedings.
- `/billamendments.json`

For an authoritative current list of routes, fetch the metadata of a
known dataset and walk:

```sh
curl -s 'https://lda.data.parliament.uk/commonsdivisions.json?_pageSize=1' \
  | jq '.result.isPartOf'
```

## Common entry points

| Use case | Endpoint |
|---|---|
| One page of items | `GET /<dataset>.json?_pageSize=10&_page=0` |
| Filter by property | `GET /<dataset>.json?propertyName=value` |
| Sort | `GET /<dataset>.json?_sort=-date` (`-` prefix = descending) |
| Just the count | `GET /<dataset>.json?_metadata=all&_pageSize=1` and read `result.totalResults` |

## Worked example

```sh
# Latest 5 Commons divisions (just IDs and titles)
curl -s 'https://lda.data.parliament.uk/commonsdivisions.json?_pageSize=5&_sort=-date' \
  | jq '.result.items[] | {date, divisionNumber, title: .title}'
```

## Notes

- The LDA returns `linked-data-api` envelope JSON: top-level `result`
  with `_about`, `definition`, `extendedMetadataVersion`, `first`,
  `next`, `prev`, `last` URLs and an `items[]` array. Each item is a
  resource with all its properties inlined.
- The output `_about` URI is the canonical resource URI in the
  Parliament data graph — the same URI you would see in the SPARQL
  endpoint.
- The LDA hosts have no Swagger/OpenAPI document; the dataset
  catalogue is implicit. We capture what we observe in
  `_specs/discovered/`.
- For new work prefer the modern REST APIs (Bills, Committees, etc.)
  or SPARQL where the LDA dataset has been retired.
