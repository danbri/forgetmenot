---
name: govuk-orgchart
description: Crawl, extract and query the GOV.UK government org chart -- ministerial roles, the people who hold them, the organisations they serve, and past office-holders. Wraps Python tools that fetch /government/* pages, harvest both their HTML and their /api/content/ JSON, lift the facts into named-graph N-Quads, and surface QA / SPARQL endpoints. Use whenever a question is about who holds which UK ministerial role, which department they sit in, past holders of an office, or cross-joining the gov.uk org-chart with the Parliament Members API or Wikidata.
---

# GOV.UK org-chart skill

GOV.UK publishes a public org chart across pages under `/government/`:
ministerial roles, the people who hold them, organisations (departments,
agencies, NDPBs), and historical figures. Every public page is double-
served as HTML and as structured JSON at the parallel `/api/content/`
path -- and both are crawled and stored locally so extraction can be
re-run offline.

The corpus lives at `third_party/govuk/html/orgcharts/`. The driver
scripts live at `scripts/govuk_*.py` (plus `scripts/govuk_sparql_serve.sh`).
Output Turtle and N-Quads sit under
`third_party/govuk/html/orgcharts/extractors/factoids/`.

## Pipeline

```
crawl              ->  pages/<slug>/page.html + fetch.json + headers.json
fetch_api          ->  pages/<slug>/api.json   (structured Content-API JSON)
extract_factoids   ->  extractors/factoids/<slug>/factoids.ttl
                       extractors/factoids/all.nq    (named-graph rollup)
extract_triples    ->  extractors/triples/<slug>/{jsonld,rdfa,microdata}.nt
sparql_serve       ->  http://127.0.0.1:8765/  (rdflib-endpoint over all.nq)
qa                 ->  exit non-zero on anchor failure
report             ->  extractors/factoids/report.pdf
```

## Commands

```sh
# 1. Crawl. Priority-frontier crawler: roles -> people -> orgs -> announcements.
python3 scripts/govuk_crawl.py --resume --max 500 --workers 5
python3 scripts/govuk_crawl.py --resume \
    --wikidata-seeds third_party/data/wikidata/data/people-bridge.jsonl
        # use Wikidata's people-bridge as supplementary seeds when the
        # natural link graph leaves gaps

# 2. Fetch the parallel /api/content/ JSON for each crawled page.
#    Adds api.json next to page.html. Idempotent.
python3 scripts/govuk_fetch_api.py --workers 5

# 3. Extract. Templates + API parser; emits per-page Turtle, rolls up to N-Quads.
python3 scripts/govuk_extract_factoids.py --refresh --workers 8
python3 scripts/govuk_extract_triples.py     # generic RDFa/JSON-LD/microdata

# 4. Serve a local SPARQL endpoint over the rollup.
./scripts/govuk_sparql_serve.sh              # 127.0.0.1:8765/

# 5. QA: anchor cases + cross-checks. Exits non-zero on regression.
python3 scripts/govuk_qa.py
python3 scripts/govuk_qa.py --probe-live     # distinguishes crawl-miss
                                             # from upstream-gap by HEAD

# 6. Visual report (PDF).
python3 scripts/govuk_report.py
```

## MCP integration

A `govuk-sparql` MCP server is declared in `.mcp.json` and points at
`scripts/govuk_mcp_sparql.py`. It wraps the local rdflib-endpoint and
exposes two tools to Claude Code sessions:

- `mcp__govuk-sparql__sparql_query(query)` -- SPARQL SELECT/ASK
  against the org-chart corpus, common prefixes auto-prepended
- `mcp__govuk-sparql__sparql_describe(uri)` -- everything we know
  about a given gov.uk URI

Start the endpoint first (`./scripts/govuk_sparql_serve.sh`) so the
MCP server has something to talk to. Requires `pip install mcp`. As
with every MCP server in the repo, it activates on the *next* session
start -- a running session cannot self-load.

## What's in the RDF

| Prefix | URI |
|---|---|
| `govuk:` | `https://forgetmenot.local/govuk#` (project vocab) |
| `schema:` | `http://schema.org/` |
| `dcterms:` | `http://purl.org/dc/terms/` |

Per-page Turtle holds:

- `schema:Person`, `govuk:Organisation` / `schema:GovernmentOrganization`,
  `govuk:MinisterialRole`, `govuk:RoleTenure`
- `govuk:CurrentOfficeHolder` / `govuk:FormerOfficeHolder` (driven by
  the Content API's explicit `current=true|false` flag)
- `govuk:contentId` (gov.uk's stable UUID), `govuk:schemaName`,
  `govuk:publishingApp`, `dcterms:modified` -- structural identifiers
  from `<meta name="govuk:*">` tags
- Provenance qualifiers on extracted tenures: `govuk:apiSourced true`
  (from `/api/content/` JSON) vs `govuk:proseExtracted true` (from
  biography prose regexes)
- Cross-page relations: `govuk:hasMinister`, `govuk:holdsRole`,
  `govuk:roleHolder`, `govuk:previouslyHeldBy`, `govuk:previouslyHeldRole`,
  `govuk:partOf`, `govuk:tenureStart`, `govuk:tenureEnd`

The rollup at `extractors/factoids/all.nq` puts every triple in a
named graph equal to the gov.uk page URL it came from, so the file
itself answers "which gov.uk page is this fact from?".

## Cross-corpus joins

Direct URL-string or name joins are brittle (departments rename,
people add suffixes). The repo carries two bridge layers:

- **Wikidata bridge** at `third_party/data/wikidata/`. The
  `people-bridge.ttl` is `owl:sameAs` between gov.uk person URIs and
  Wikidata QIDs, with `parl:memberId` for the Members API. Refresh
  with `third_party/data/wikidata/scripts/refresh.py`.
- **gov.uk content-id** (a stable UUID emitted in `<meta name="govuk:content-id">`)
  -- the extractor lifts it onto every page subject so URL renames
  don't break joins within the gov.uk corpus.

Worked example: voting record of the current Chancellor in one SPARQL
query, gov.uk -> Wikidata -> parliament.uk, with no name matching:

```sparql
PREFIX govuk: <https://forgetmenot.local/govuk#>
PREFIX owl:   <http://www.w3.org/2002/07/owl#>
PREFIX parl:  <https://id.parliament.uk/schema/>

SELECT ?holder ?wikidata ?parliamentId WHERE {
  GRAPH ?g {
    <https://www.gov.uk/government/ministers/chancellor-of-the-exchequer>
      govuk:roleHolder ?holder .
  }
  ?holder owl:sameAs   ?wikidata ;
          parl:memberId ?parliamentId .
}
# -> Rachel Reeves, Q574896, 4031
```

## Data-quality discipline

This skill operates under the [`data-quality`](../data-quality/SKILL.md)
discipline: anchor cases, cross-extractor checks, provenance
qualifiers on every triple, upstream issues for source bugs (e.g.
`danbri/forgetmenot#20` for gov.uk's stale past-PMs index), and a
hard rule against cobbling hybrid query workarounds. Run
`scripts/govuk_qa.py` before declaring an extraction change "done".

## Coverage caveats

- The past-PMs index on gov.uk is stale (missing Johnson / Truss /
  Sunak) and contains a broken link (`william-lamb-pitt`). Tracked
  as `danbri/forgetmenot#20`; the recent-PM tenures are recovered by
  the API extractor from each person's `/api/content/role_appointments`.
- 13% of the Wikidata-bridge politician set is not reachable from
  the current org chart's natural link graph; pass
  `--wikidata-seeds` to `govuk_crawl.py` to close.
- The crawler intentionally skips Welsh-language `.cy` URLs, which
  are translations rather than primary records.
