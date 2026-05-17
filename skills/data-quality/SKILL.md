---
name: data-quality
description: Data-quality discipline for the corpora in this repo. Use whenever building a new crawler/extractor, when an extraction "feels done", when a question hits the data and would benefit from explicit confidence, or when you find yourself reaching for a hybrid query that papers over a single-source gap. Prescribes anchor cases, cross-extractor checks, upstream-bug reporting, and identifier hygiene (Wikidata QIDs, gov.uk content-id, parliament.uk member id) rather than URLs or names.
metadata:
  provenance:
    tier: methodology         # not a data skill — discipline / policy
    operator: forgetmenot
    citation-short: "data-quality discipline (forgetmenot)"
    citation-formal: "forgetmenot data-quality discipline"
    confidence: n/a
---

# Data quality skill

This repo ingests data from multiple noisy sources (UK Parliament APIs,
gov.uk org-chart pages, Wikidata, member RSS feeds, the APPG register).
The temptation when a question is hard is to "make a workable hybrid":
join by name, sprinkle in another source, accept any answer. That
silently degrades the corpus.

The discipline this skill enforces:

1. **Diagnose, don't paper over.** If query A is missing data, treat
   the gap as a diagnostic signal: is the page uncrawled? Did the
   extractor templates miss it? Or is it upstream — the source itself
   doesn't publish the fact? Only after categorising can the fix go
   in the right place.
2. **Anchor cases.** Every extractor has a small set of known-good
   test cases ("the current Chancellor is Rachel Reeves and that fact
   is attested by 3 distinct gov.uk pages"). If anchors regress, the
   pipeline failed. Anchors should fail fast and noisily.
3. **Multiple independent extractors over the same source, with
   cross-checks.** If gov.uk publishes the same fact in HTML and in
   `/api/content/`, extract from both and assert they agree. Disagree-
   ments are the most valuable QA signal.
4. **Stable identifiers everywhere.** URLs change. Names change.
   Wikidata QIDs (Q…), gov.uk `content-id` (UUID), and parliament.uk
   member ids don't. Prefer them as join keys and own the cross-table.
5. **Upstream bugs get a GitHub issue, not a workaround.** When a
   data quality finding is on the source's side (e.g. gov.uk's
   past-PMs index missing recent PMs), file an issue at
   `danbri/forgetmenot` with the label `upstream`, list the
   evidence, mark it for human-verification before reporting to the
   data publisher. Don't paper over with hybrid queries that hide
   the problem from future readers.
6. **Provenance qualifiers on every extracted triple.** If a triple
   was scraped from HTML rather than read from a structured API,
   tag it (`govuk:proseExtracted true` vs `govuk:apiSourced true`).
   Consumers downstream can then choose their trust level.

## Worked example: gov.uk org-chart corpus

The [`govuk-orgchart`](../govuk-orgchart/SKILL.md) skill applies all
of the above. The full QA harness lives at `scripts/govuk_qa.py`; a
typical run reports:

| Check | Why |
|---|---|
| 4 recent-PM anchor cases (Johnson, Truss, Sunak, Starmer) | upstream past-PMs index is stale — anchors fail noisily when our extraction regresses |
| current-Chancellor cross-page reconciliation | should be asserted by ≥ 3 distinct gov.uk pages (role page, person page, organisation page); fewer means an extractor lost a link |
| random 25-slug sample from the Wikidata bridge | categorises shortfalls as crawl-miss / extract-miss / upstream-gap |
| ex-minister recognition counts | how many former-office-holders we tag without inferring which office |
| API↔prose cross-check | every (person, role) pair where both extractors fired must agree on the tenure years |

Wire the harness into CI by exiting non-zero on anchor failure:

```sh
./scripts/govuk_sparql_serve.sh &     # local SPARQL endpoint
python3 scripts/govuk_qa.py            # exits 1 if any anchor regressed
```

## Templates

When designing a new extractor, write the anchor file first:

```py
# scripts/<corpus>_qa.py
ANCHORS = [
    # (input, expected predicate, expected object, "why this matters")
    ("<seed_url>", schema:name, "<expected literal>",
     "Smoke-tests that <basic extraction path> is wired."),
    # ...
]
```

When adding a second extractor over the same source, write the cross-
check immediately, not later:

```sparql
# every (subject, predicate) pair touched by both extractors agrees
SELECT ?s ?p ?vA ?vB WHERE {
  GRAPH ?g1 { ?s ?p ?vA . ?g1 mycorp:extractedBy "structuredApi" }
  GRAPH ?g2 { ?s ?p ?vB . ?g2 mycorp:extractedBy "htmlScrape"    }
  FILTER(?vA != ?vB)
}
```

When discovering an upstream bug, file the GitHub issue immediately
with reproduction steps and any local cache references; don't
short-circuit to "let's fall back to Wikidata for this one case".

## Anti-patterns this skill explicitly forbids

- "Falls back to" or "merges" without provenance qualifiers on the
  triples.
- Anchors that only check counts ("we have > 100 ministers") instead
  of specific named entities ("Rachel Reeves is Chancellor").
- New crawling code without an updated QA anchor list checking that
  the new pages are reachable.
- Extractor heuristics that depend on CSS class names from a
  presentational framework (e.g., `caption-xl`) when a structural
  marker exists (`<meta name="govuk:schema-name">`, the
  `/api/content/` JSON, etc.).
- Cobbled hybrid datasets that paper over a single-source gap.
  Either fix the source extractor, file an upstream issue, or
  document the limitation — don't silently fill in.
