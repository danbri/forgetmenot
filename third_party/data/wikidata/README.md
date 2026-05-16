# Wikidata bridge — UK Parliament ↔ GOV.UK

The Members API hands back JSON with `additionalInfoLink` pointing at
GOV.UK organisation URLs, and the GOV.UK org-chart pages contain person
slugs like `/government/people/rachel-reeves`. Joining the two corpora
by *those* values is brittle: department slugs change as departments
get renamed (DECC → BEIS → DESNZ → …), title prefixes drift, and the
date qualifiers on posts don't always line up.

Wikidata avoids the brittleness because it carries both identifiers as
first-class properties on every politician:

| Wikidata property | What it stores | Example (Keir Starmer) |
|---|---|---|
| **P10428** `parliament.uk member ID` | The Members API `Members/{id}` integer | `4514` |
| **P10874** `gov.uk person ID` | The slug under `/government/people/` | `keir-starmer` |

There is **no** Wikidata property for the GOV.UK organisation slug
(as of this writing only P10874 for people exists). For organisations
we fall back to matching via Wikipedia article URL -- see
`queries/orgs-via-wikipedia.rq`. That match is approximate and should
be reviewed before use.

A stable person-level join is `wd:Q… → wdt:P10428 → memberId` and
`wd:Q… → wdt:P10874 → govukSlug`, maintained by Wikidata editors.

## What's actually here

After running `scripts/refresh.py`, `data/refreshed.json` summarises:

| file | rows | notes |
|---|---|---|
| `people-bridge.jsonl` | ~673 | Wikidata items with **both** P10428 and P10874 |
| `people-bridge.ttl` | ~2,000 triples | the same data as `owl:sameAs` Turtle, mergeable into `all.nq` |
| `people-with-govuk.jsonl` | ~1,656 | Wikidata items with P10874 (incl. non-MPs: SpAds, civil servants, advisers) |
| `all-mps-with-bridge.jsonl` | ~5,221 | every Wikidata item with P10428; ~13% also have P10874 |
| `orgs-via-wikipedia.jsonl` | ~117 | UK government departments by Wikipedia sitelink (approximate) |
| `coverage.json` | one record | crawl-vs-bridge overlap (see `scripts/coverage.py`) |

The numbers will drift as Wikidata is edited. Re-run `refresh.py` to update.

## Layout

```
third_party/data/wikidata/
├── queries/                            SPARQL queries against WDQS
│   ├── people-bridge.rq                items with BOTH IDs (the join)
│   ├── people-with-govuk.rq            items with a gov.uk slug (incl. non-MPs)
│   ├── all-mps-with-bridge.rq          every UK MP, with whichever IDs Wikidata holds
│   ├── uk-government-orgs.rq           orgs with a gov.uk org slug
│   └── ministerial-positions.rq        current UK minister positions + holders
├── scripts/
│   └── refresh.py                      runs every query, writes data/*.jsonl
└── data/
    ├── people-bridge.jsonl             one row per linked person
    ├── people-bridge.ttl               owl:sameAs gov.uk URI <-> wd:Qxxxx
    ├── people-with-govuk.jsonl
    ├── all-mps-with-bridge.jsonl
    ├── uk-government-orgs.jsonl
    ├── ministerial-positions.jsonl
    └── refreshed.json                  per-query row counts + timestamp
```

## Refreshing

```
python3 third_party/data/wikidata/scripts/refresh.py            # all queries
python3 third_party/data/wikidata/scripts/refresh.py --query people-bridge
```

The runner identifies itself with a contact User-Agent and throttles
between requests, per the Wikimedia robot policy. WDQS occasionally
returns 429 with a long `Retry-After`; the runner retries once with a
capped wait.

## Using the bridge

The Turtle file `data/people-bridge.ttl` is structured so it can be
merged into the org-chart factoid graph and queried in one step. Load
the org-chart N-Quads with their named graphs intact, and the bridge
into the default graph:

```python
import rdflib
ds = rdflib.Dataset()
ds.parse(
    'third_party/govuk/html/orgcharts/extractors/factoids/all.nq',
    format='nquads',
)
ds.default_graph.parse(
    'third_party/data/wikidata/data/people-bridge.ttl',
    format='turtle',
)
```

Then a single SPARQL query crosses three independent corpora (see also
`queries/example-cross-corpus-join.rq`):

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
```

This returns Rachel Reeves with QID Q574896 and parliament.uk id 4031.
`{parliamentId}` then drops straight into the Members API URL
`https://members-api.parliament.uk/api/Members/{id}/Voting`, with no
name matching or URL guessing anywhere in the chain.

## Coverage caveat

Of the 597 GOV.UK person pages in our org-chart crawl, 276 (46%) have
a Wikidata bridge entry. The other 321 are mostly career civil servants,
NDPB chairs, and advisers who legitimately aren't MPs or peers and so
don't appear in Wikidata's parliament.uk-linked set. Conversely, 394
Wikidata bridge entries point to GOV.UK person pages we didn't crawl --
former MPs whose pages aren't reachable from the current org chart
seeds. Run `scripts/coverage.py` for the live numbers and a sample.
