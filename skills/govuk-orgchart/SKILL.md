---
name: govuk-orgchart
description: Crawl, extract and query the GOV.UK government org chart -- ministerial roles, the people who hold them, the organisations they serve, and past office-holders. Use whenever a question is about who holds which UK ministerial role, which department they sit in, past holders of an office, or cross-joining with the Parliament Members API or Wikidata. Loads its query capability via a bundled script (no MCP server, no boot-time tokens).
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/query.py *) Bash(./scripts/govuk_sparql_serve.sh *) Bash(python3 scripts/govuk_*.py *)
license: Open Government Licence v3.0 (upstream gov.uk content); MIT (this skill's crawler / extractors / query layer)
metadata:
  provenance:
    tier: 3
    operator: "forgetmenot (crawl + extraction)"
    service: gov.uk (Government Digital Service / Cabinet Office)
    upstream-data: "GOV.UK /government/ pages (HTML + parallel /api/content/ JSON), Crown copyright under OGL v3.0"
    citation-short: "GOV.UK (via forgetmenot govuk-orgchart extraction)"
    citation-formal: "GOV.UK org-chart pages (Government Digital Service / Cabinet Office); crawl + heuristic extraction by forgetmenot, retrieved {date}"
    confidence: derived
    confidence-notes: "Triples from upstream JSON-LD / RDFa / microdata = derived (confidence ≈ gov.uk's own structured data); factoids = heuristic (BeautifulSoup templates over gov.uk markup; QA harness in third_party/govuk/html/orgcharts/extractors/factoids/qa.json reports per-template accuracy)."
---

# GOV.UK org-chart skill

GOV.UK publishes a public org chart across pages under `/government/`:
ministerial roles, the people who hold them, organisations (departments,
agencies, NDPBs), and historical figures. Every public page is double-
served as HTML and as structured JSON at the parallel `/api/content/`
path -- both are crawled and stored locally so extraction can be
re-run offline. The corpus lives at `third_party/govuk/html/orgcharts/`.

## Querying (the on-demand part)

To answer an org-chart question, run the bundled query script. It uses
the local rdflib-endpoint at `127.0.0.1:8765` if it's up, otherwise
parses the N-Quads in-process (slower first time, no setup needed):

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/query.py 'SELECT ?holder WHERE {
  GRAPH ?g {
    <https://www.gov.uk/government/ministers/chancellor-of-the-exchequer>
      <https://forgetmenot.local/govuk#roleHolder> ?holder .
  }
} LIMIT 5'
```

Common prefixes are auto-prepended (`govuk:`, `schema:`, `parl:`, `owl:`,
`dcterms:`, `xsd:`). For a quick dump of everything we know about a URI:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/query.py --describe https://www.gov.uk/government/people/rachel-reeves
```

`--tsv` switches output to tab-separated for easier reading in chat.

This pattern (bundled script invoked from the skill body) is the
shipped way to give a session a capability without paying the
always-on MCP cost: nothing about SPARQL or rdflib enters context
until the skill is invoked.

## Pipeline (when extending or refreshing the corpus)

```sh
# 1. Crawl. Priority-frontier crawler: roles -> people -> orgs -> announcements.
python3 scripts/govuk_crawl.py --resume --max 500 --workers 5
python3 scripts/govuk_crawl.py --resume \
    --wikidata-seeds third_party/data/wikidata/data/people-bridge.jsonl
        # supplementary seeds for politicians the natural link graph misses

# 2. Fetch the parallel /api/content/ JSON for each crawled page.
python3 scripts/govuk_fetch_api.py --workers 5

# 3. Extract. Templates + API parser; per-page Turtle, rolls up to N-Quads.
python3 scripts/govuk_extract_factoids.py --refresh --workers 8
python3 scripts/govuk_extract_triples.py     # generic RDFa/JSON-LD/microdata

# 4. (Optional) Long-lived SPARQL endpoint for faster repeated queries.
./scripts/govuk_sparql_serve.sh              # 127.0.0.1:8765/

# 5. QA: anchor cases + cross-checks. Exits non-zero on regression.
python3 scripts/govuk_qa.py

# 6. Visual report (PDF).
python3 scripts/govuk_report.py
```

## What's in the RDF

| Prefix | URI | Role |
|---|---|---|
| `fm:` | `https://forgetmenot.local/vocab#` | This project's vocabulary -- everything we model ourselves |
| `govuk:` | `https://www.gov.uk/vocab/meta#` | Reserved for `<meta name="govuk:*">` attributes gov.uk publishes directly. We do NOT invent under this namespace -- see [`docs/vocab.md`](../../docs/vocab.md). |
| `schema:` | `http://schema.org/` | Standard |
| `dcterms:` | `http://purl.org/dc/terms/` | Standard |

Per-page Turtle holds:

- `schema:Person`, `fm:Organisation` / `schema:GovernmentOrganization`,
  `fm:MinisterialRole`, `fm:RoleTenure`
- `fm:CurrentOfficeHolder` / `fm:FormerOfficeHolder` (driven by
  the Content API's explicit `current=true|false` flag)
- `govuk:contentId` (stable UUID), `govuk:schemaName`,
  `govuk:publishingApp`, `dcterms:modified` -- structural identifiers
  literally lifted from `<meta name="govuk:*">` tags
- Provenance qualifiers: `fm:apiSourced true` (from `/api/content/`
  JSON) vs `fm:proseExtracted true` (from biography prose regexes).
  Two independent extractors run and their disagreements surface in QA.
- Cross-page relations: `fm:hasMinister`, `fm:holdsRole`,
  `fm:roleHolder`, `fm:previouslyHeldBy`, `fm:previouslyHeldRole`,
  `fm:partOf`, `fm:tenureStart`, `fm:tenureEnd`

The rollup at `third_party/govuk/html/orgcharts/extractors/factoids/all.nq`
puts every triple in a named graph equal to the gov.uk page URL it came
from, so the file itself answers "which gov.uk page is this fact from?".
If raw source text gets attached for LLM-verification, it lives in a
**separate** named graph (`<page-url>#raw` convention) — never inline
with the extracted triples. See [`docs/vocab.md`](../../docs/vocab.md).

## Cross-corpus joins

Direct URL-string or name joins are brittle (departments rename,
people add suffixes). The repo carries two bridge layers:

- **Wikidata bridge** at `third_party/data/wikidata/`. The
  `people-bridge.ttl` is `owl:sameAs` between gov.uk person URIs and
  Wikidata QIDs, with `parl:memberId` for the Members API. Refresh
  with `third_party/data/wikidata/scripts/refresh.py`.
- **gov.uk content-id** -- the extractor lifts the publishing-app UUID
  onto every page subject so URL renames don't break joins within
  the gov.uk corpus.

Worked example -- voting record of the current Chancellor in one
SPARQL query, gov.uk → Wikidata → parliament.uk, no name matching:

```sparql
PREFIX govuk: <https://forgetmenot.local/govuk#>
PREFIX owl:   <http://www.w3.org/2002/07/owl#>
PREFIX parl:  <https://id.parliament.uk/schema/>

SELECT ?holder ?wikidata ?parliamentId WHERE {
  GRAPH ?g {
    <https://www.gov.uk/government/ministers/chancellor-of-the-exchequer>
      govuk:roleHolder ?holder .
  }
  ?holder owl:sameAs    ?wikidata ;
          parl:memberId ?parliamentId .
}
# -> Rachel Reeves, Q574896, 4031
```

## Data-quality discipline

This skill operates under the [`data-quality`](../data-quality/SKILL.md)
discipline: anchor cases, cross-extractor checks, provenance
qualifiers on every triple, upstream issues for source bugs
(`danbri/forgetmenot#20`), and a hard rule against cobbling hybrid
query workarounds. Run `scripts/govuk_qa.py` before declaring an
extraction change "done".

## Coverage caveats

- gov.uk's past-PMs index lists Sunak/Truss/Johnson as cards
  *without* dedicated `/history/past-prime-ministers/<slug>` URLs
  (they appear in `details.appointments_without_historical_accounts`
  in the Content API). `_extract_pms_index_from_api()` reads them.
- 13% of the Wikidata-bridge politician set is not reachable from
  the current org chart's natural link graph; pass
  `--wikidata-seeds` to `govuk_crawl.py` to close.
- Welsh-language `.cy` URLs are intentionally skipped (translations,
  not primary records).

## On MCP

`scripts/govuk_mcp_sparql.py` is registered in the project `.mcp.json`
as the `govuk-sparql` server -- intentionally eager-loaded because
SPARQL over this corpus is a core capability for any org-chart
question. Two tools:

- `sparql_query(query)` -- run any SPARQL SELECT or ASK against the
  corpus, prefixes auto-prepended.
- `sparql_describe(uri)` -- shortcut for every triple mentioning
  a URI.

Tool Search defers individual tool schemas until invoked, so the
boot-time cost is the server registration, not the full tool surface.

The bundled `scripts/query.py` here exists as a fallback for sessions
without MCP available (e.g. running the pipeline outside Claude Code,
or in a subagent context where MCP servers aren't proxied).

Before either path: the rdflib HTTP endpoint must be running --

```sh
./scripts/govuk_sparql_serve.sh   # 127.0.0.1:8765/
```

## Provenance to cite

**Tier 3 — third-party.** GOV.UK is operated by the Government
Digital Service (Cabinet Office). The crawl, extraction and query
layer are *ours*. Upstream content is under OGL v3.0; our
heuristics can be wrong.

- Inline cite: **"(GOV.UK, via `govuk-orgchart` extraction)"** —
  once per paragraph in user-facing answers.
- When stating a factoid (role-holder, office, start/end date),
  prefer hedged phrasing ("per GOV.UK as of {date}"). QA results
  for the extractor live at
  `third_party/govuk/html/orgcharts/extractors/factoids/qa.json`.
- When the data is a triple lifted from gov.uk's own JSON-LD /
  RDFa / microdata, cite it as such — that's gov.uk's structured
  data, not our parsing. Triples / factoids are tagged
  differently in the extractor output.
- **Cross-corpus joins** (gov.uk content_id ↔ parliament.uk member
  id ↔ Wikidata QID) flow through the bridge files at
  `third_party/data/wikidata/data/people-bridge.{jsonl,ttl}`.
  Cite both endpoints when joining: e.g. "Yvette Cooper
  (parliament.uk member 4514; gov.uk
  /government/people/yvette-cooper; Wikidata Q333062), via the
  forgetmenot bridge".
- Never present heuristic factoids as authoritative.
- See [`../../docs/provenance.md`](../../docs/provenance.md) for
  the cross-skill rules.
