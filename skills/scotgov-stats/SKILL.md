---
name: scotgov-stats
description: "Query the Scottish Government statistics SPARQL endpoint at statistics.gov.scot — the official Scottish counterpart to ONS data, published as RDF DataCube vocabulary. Use when the question is about Scotland-specific statistics that join cleanly to the sp (Scottish Parliament) facility: economic indicators, demographics, public-sector finance, housing, transport, environment per Scottish council / SPC / Intermediate Zone. Free SPARQL 1.1, no auth. Endpoint sometimes 503s under load; retry with backoff."
license: Open Government Licence v3.0 (Crown copyright; Scottish Government)
metadata:
  facility: scotgov-stats
  cli-alias: scotstats
  base-url: https://statistics.gov.scot/sparql
  provenance:
    tier: 3
    operator: Scottish Government
    service: statistics.gov.scot
    upstream-data: "Scottish Government statistics published under the RDF DataCube vocabulary"
    citation-short: "via statistics.gov.scot SPARQL"
    citation-formal: "Scottish Government, statistics.gov.scot SPARQL endpoint, retrieved {date}, OGL v3.0"
    confidence: authoritative
    confidence-notes: "Authoritative for Scottish-Government-published statistics. Endpoint has intermittent availability (503 under load); retries advised. Bulk CSV downloads of the same datasets are available at statistics.gov.scot for resilience."
---

# statistics.gov.scot SPARQL

Base URL: `https://statistics.gov.scot/sparql`. SPARQL 1.1; no auth.
Polite User-Agent expected (library sets `forgetmenot-scotgov-stats/0.1`).

Sister to the [`wikidata`](../wikidata/SKILL.md) and Parliament
[`sparql`](../sparql/SKILL.md) facilities — same generic-query
pattern, narrower domain (Scottish statistics).

## CLI

```sh
parl scotstats datasets --take 50
parl scotstats query 'SELECT ?dataset (COUNT(*) AS ?obs) WHERE {
  ?dataset a <http://purl.org/linked-data/cube#DataSet> .
} GROUP BY ?dataset LIMIT 10'
parl scotstats dimensions http://statistics.gov.scot/data/population-estimates-current-geographic-boundaries
```

## Joins to Parliament

- Pair with [`sp`](../sp/SKILL.md) for Scottish-Parliament + Scottish-stats
  joins: "what's the unemployment rate in this MSP's constituency", "how
  has X changed under the SNP government".
- Use Wikidata QIDs as a meta-bridge to Westminster `members` records
  when an MP was previously an MSP.

## Provenance to cite

**Tier 3 — third-party (Scottish Government), authoritative.**

- Inline cite: **"(via statistics.gov.scot)"** — once per paragraph.
- For formal output, name the dataset URI you queried.
- Endpoint can be intermittently down (503 reported May 2026); cite
  the date you pulled the data.
- See [`../../docs/provenance.md`](../../docs/provenance.md).
