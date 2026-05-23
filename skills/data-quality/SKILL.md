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

## Worked example: peerage and the cabinet

The "is X currently in cabinet, and did they win their seat?" question
(see `scripts/test-cabinet-won.mjs` and `scripts/test-peers-in-cabinet.mjs`,
and the writeup at `docs/data-quality-2026-05-23.md`) looks simple
but ALL of the following lurk underneath. Each is a real failure
mode we have observed in this repo's data; document them whenever
you cross the Commons / Lords boundary.

**Identity moves over time.**

- *Elevated post-election.* An MP elected at one GE may be created
  a life peer at any later date. Joining "person's name now" against
  "role tenure then" mis-tags them as peers-at-the-time. **Observed**:
  Baroness Nicky Morgan appears in our GOV.UK factoids against her
  2014-16 Education Secretary tenure even though the peerage came
  in 2020.
- *Same person, two ID spaces.* The MP and the resulting peer share
  no identifier in any one corpus. Bridging needs Members API id →
  peerage register, which DDP has but the local corpora don't.

**Cabinet roles move category.**

- *Lord Chancellor.* Almost always a peer pre-2007; almost always
  in the Commons since the Constitutional Reform Act 2005 took
  effect (Jack Straw 2007 → David Lammy 2024).
- *Attorney General.* Routinely either house — Lord Goldsmith
  2001-07, Geoffrey Cox 2018-20, Victoria Prentis 2022-24, Lord
  Hermer 2024- . Filters that exclude "always-peer" posts must
  list these explicitly, not infer category from current incumbent.
- *Foreign / Defence / Business secretaries.* Almost always
  Commons, but with discrete exceptions (Lord Cameron 2023-24,
  Lord Mandelson 2008-10, Lord Carrington 1979-82, Earl of Halifax
  1938-40). Treat as "Commons by default, peer rarely" — not as
  Commons-only.

**Peer-flavours are not uniform.**

- *Life peers.* The modern default; created by Letters Patent on
  a specific date. The cleanest case to reason about.
- *Hereditary peers.* Inherited, not appointed; no creation date
  to filter by. 90 currently sit as elected hereditaries post-1999;
  others retain titles but no Lords seat. Some have held cabinet
  office (Earl of Halifax, Viscount Cranborne).
- *Disclaimed peerages.* Tony Benn disclaimed his viscountcy in
  1963 to stay in the Commons; Quintin Hogg disclaimed Lord
  Hailsham, served in cabinet from the Commons, was later created
  a life peer (different peerage). Same person, three identity
  states across their career.
- *Lords Spiritual.* 26 bishops sit ex officio; their "seat" is
  the diocese, not the person. Membership churns by promotion
  inside the Church of England.
- *Excluded / suspended.* Various peers are flagged as not currently
  sitting (expulsion, suspension, leave-of-absence). "Has a current
  incumbency" can mean "active" or "nominal but suspended".

**Data-window cliffs.**

- *psephology earliest real polling-day = 2010-05-06.* The 2005 GE
  exists in the dump but as 591 NOTIONAL elections / 2,976 NOTIONAL
  candidacies — re-allocations onto the post-2010 boundaries for
  swing analysis, not actual constituencies of the 2005-2010
  Parliament. So Brown's 2009 cabinet can't be verified as
  Commons-elected from psephology alone; you need DDP.
- *govuk-orgchart factoid corpus = current government's pages.*
  Past peer cabinet ministers (Mandelson, Falconer, Amos, Adonis)
  are not in the local extraction because GOV.UK no longer hosts
  their people-pages. Historical-cabinet queries need DDP's
  `parl:memberHasParliamentaryIncumbency` joined to formal-body
  membership, on the live endpoint.
- *DDP currency lag.* New MPs from the 2024 GE may not yet have a
  "current" (no-end-date) parliamentary-incumbency row in DDP
  even when psephology and the Members API agree they won. See
  `docs/sparql-endpoints.md` and `docs/upstream-bugs.md` for the
  specific cases.

**Naming and disambiguation.**

- *Same surname, different peer.* "Baroness Smith" alone is
  ambiguous; the territorial designation ("of Basildon", "of
  Cluny", etc.) disambiguates. Our identity-graph matcher has
  one logged false-match risk on these.
- *Peer styled "Lord" but rank "Baron".* "Lord Cameron" is the
  courtesy form; "Baron Cameron of Chipping Norton" is the
  formal rank. Both refer to the same person. Filters keyed on
  either string work; filters keyed on `?name = "Baron Cameron"`
  miss anyone styled "Lord".

**What to do about it in code.**

- Always keep a `KNOWN_FALSE_POSITIVES` set in tests that surface
  any cross-time identity join, like
  `scripts/test-peers-in-cabinet.mjs` does for Morgan.
- Categorise cabinet roles explicitly (`whitehall` /
  `law-officer` / `lords-leadership` / `cross-cutting`) rather
  than treating "peer in cabinet" as one bucket.
- When a query result depends on peerage timing, document the
  external register you used (Lords Library, Roll of the Peerage,
  DDP) — don't bake the assumption silently into the SPARQL.
- For pre-2010 questions, route through DDP. The local psephology
  corpus is not designed to be the answer.
