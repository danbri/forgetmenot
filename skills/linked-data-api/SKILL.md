---
name: linked-data-api
description: Query the legacy Parliament Linked Data API (Elda) at lda.data.parliament.uk — older but still-running JSON-over-HTTP endpoints for individual datasets like commonsdivisions, lordsdivisions, briefingpapers, researchbriefings, etc. Each dataset has its own URL pattern and supports filter parameters, pagination via `_pageSize` and `_page`, and content negotiation. Use when a question is about a dataset listed on explore.data.parliament.uk for which there is no modern REST API equivalent (briefing papers, research briefings, election results, the Parliament Thesaurus).
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated)
metadata:
  provenance:
    tier: 1
    operator: UK Parliament
    service: lda.data.parliament.uk
    citation-short: "via lda.data.parliament.uk"
    citation-formal: "UK Parliament Linked Data API (Elda), retrieved {date}"
    confidence: authoritative
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

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs lda --help
```

Or after `npm link` (one-time install):

```sh
parl lda --help
```

Wraps the legacy Linked Data API (Elda) datasets.

### Examples

```sh
parl lda datasets
```
Known dataset slugs.

```sh
parl lda get commonsdivisions --page-size 5 --sort -date
```
Recent Commons divisions via LDA.

```sh
parl lda get briefingpapers --page-size 5 --sort -created
```
Recent Commons Library briefings.

```sh
parl lda get thesaurus --page-size 50
```
Walk the Parliament Thesaurus.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/linked-data-api.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via lda.data.parliament.uk)"** — once per paragraph in
  user-facing answers.
- On request, give the URL `--raw` printed.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
