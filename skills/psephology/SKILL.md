---
name: psephology
description: Authoritative election-results database for UK parliamentary elections — every candidacy, certification, electorate, constituency boundary set and general-election period maintained by the House of Commons Library (Robert Leigh-Pemberton's psephology project). Distributed as a daily PostgreSQL dump at github.com/ukparliament/psephology. Use when a question needs structured per-candidate / per-constituency vote totals, vote shares, or majority counts at any historical UK general election or by-election — granularity the modern Members API does not expose.
license: Open Parliament Licence v3.0 (Crown copyright; House of Commons Library)
metadata:
  provenance:
    tier: 1
    operator: House of Commons Library
    service: github.com/ukparliament/psephology
    citation-short: "via ukparliament/psephology PostgreSQL dump"
    citation-formal: "UK Parliament psephology database, House of Commons Library, dump {YYYY-MM-DD}"
    confidence: authoritative
---

# UK Parliament psephology — election-results database

A PostgreSQL database of UK Parliamentary election results maintained
by the House of Commons Library and published as daily SQL dumps on
GitHub. Covers candidates, candidacies, certifications by political
parties, vote counts and shares, constituency boundary sets, general
elections, and by-elections (`elections` rows where
`general_election_id IS NULL`). Currently authoritative for the
1955-onwards modern dataset; pre-1955 cover is partial.

## What it is

- **Repository:** <https://github.com/ukparliament/psephology>
- **Dump file pattern:**
  `db/dumps/YYYY-MM-DD.sql` (`pg_dump` plain-SQL text dumps)
- **Latest known good dump (this skill):** `2026-05-23.sql`
- **Schema version:** the Rails-style `schema_migrations` table
  records every migration applied; the `ar_internal_metadata`
  table identifies the application environment (production)
- **Size:** ~3.3 MB raw SQL, ~30 tables, ~26k candidacies, ~4.5k
  elections, ~1.9k constituencies, ~320 political parties
- **NOT an API.** It's a database. To query it you stand up
  Postgres locally and load the dump. See `Spinning it up` below.

## What's in it

Headline tables (rough row counts as of the 2026-05-23 dump):

| Table | Rows | What |
|---|---|---|
| `candidacies` | 26,372 | One row per (candidate, election). Carries `vote_count`, `vote_share`, `vote_change`, `result_position`, `is_winning_candidacy`. |
| `certifications` | 24,524 | Joins a candidacy to the political party that certified them. Coalitions show up as one candidacy with multiple certifications via `adjunct_to_certification_id`. |
| `electorates` | 4,554 | Eligible-voter counts per constituency per election. |
| `elections` | 4,552 | One row per (constituency, polling-day). General-election contests have `general_election_id`; by-elections have it NULL. |
| `constituency_groups` | 1,959 | Constituencies — name + period of validity. The "group" framing is because a constituency name can persist across boundary changes. |
| `constituency_areas` | 1,959 | Geographic area paired with each `constituency_group` for each `boundary_set`. |
| `members` | 1,547 | Sitting/former MPs. Carries the MNIS / Members API `member_id`, and joins back to candidacies that put them in. |
| `constituency_area_overlaps` | 1,438 | Boundary-change crosswalk: which areas in boundary-set N map to which areas in N+1. |
| `maiden_speeches` | 1,368 | Date + Hansard reference per MP's first speech. |
| `political_party_registrations` | 376 | Electoral Commission registration history — names a party held over time. |
| `political_parties` | 324 | One row per party including legacy ones. |
| `boundary_set_legislation_items` | 84 | Acts/Orders that established each boundary set. |
| `legislation_items` | 79 | Acts/Orders cited by the schema (`enablings`, boundary changes). |
| `enablings` | 73 | Joins a `political_party_registration` to the legislation that enabled it. |
| `general_elections` | 6 | One row per UK general election since 2010 in this dump. Older general elections are seeded as the boundary sets and elections data is back-filled. |
| `parliament_periods` | n | Each Parliament period (dissolution to dissolution). |
| `commons_library_dashboards` | n | Links into the Commons Library's published dashboards. |
| `boundary_sets` / `general_election_in_boundary_sets` | n | Each set of constituency boundaries and which general elections were fought on it. |
| `election_states` / `general_election_states` | small | State machine for elections (called / declared / etc.). |
| `english_regions` / `countries` / `genders` | small | Reference / lookup tables. |
| `result_summaries` | small | Per-election summary text the Commons Library publishes. |
| `task_records` | n | The application's own job-execution log; not data. |

The schema is fully relational — every foreign key is declared,
every join you'd want for analysis is one or two hops.

## Spinning it up locally

Repo ships a script:

    npm run psephology:up

which:

1. Boots Postgres 16 on the current host if it isn't already running
   (uses `pg_ctlcluster` on Debian/Ubuntu; otherwise needs Postgres
   on PATH and a running server you can connect to).
2. Fetches the latest dump under `db/dumps/` from GitHub.
3. Creates the `psephology` database (idempotent).
4. Loads the dump.
5. Prints a connection string and a few sanity-check counts.

After that you can connect with:

    psql -U postgres -d psephology

or, in code, with any Postgres client pointed at
`postgresql://postgres@localhost:5432/psephology`.

`npm run psephology:down` shuts the cluster down again.

## Useful queries

Top 10 most-recent general elections, votes cast per:

```sql
SELECT
  ge.polling_on,
  SUM(e.valid_vote_count)   AS valid,
  SUM(e.invalid_vote_count) AS spoiled,
  COUNT(*)                  AS contested_seats
FROM   general_elections ge
JOIN   elections          e ON e.general_election_id = ge.id
WHERE  NOT e.is_notional
GROUP  BY ge.polling_on
ORDER  BY ge.polling_on DESC;
```

Largest majorities in a given general election:

```sql
SELECT cg.name, c.candidate_given_name || ' ' || c.candidate_family_name AS name,
       pp.name AS party, e.majority
FROM   elections          e
JOIN   general_elections ge ON e.general_election_id = ge.id
JOIN   constituency_groups cg ON e.constituency_group_id = cg.id
JOIN   candidacies        c ON c.election_id = e.id AND c.is_winning_candidacy
JOIN   certifications     ct ON ct.candidacy_id = c.id
JOIN   political_parties  pp ON pp.id = ct.political_party_id
WHERE  ge.polling_on = '2024-07-04'
ORDER  BY e.majority DESC NULLS LAST
LIMIT 20;
```

Bridge to the Members API (cross-reference via `members.id`):

```sql
SELECT m.id AS member_id, m.given_name, m.family_name,
       cg.name AS won_constituency, ge.polling_on
FROM   members            m
JOIN   candidacies        c ON c.member_id = m.id AND c.is_winning_candidacy
JOIN   elections          e ON e.id = c.election_id
JOIN   general_elections ge ON ge.id = e.general_election_id
JOIN   constituency_groups cg ON cg.id = e.constituency_group_id
WHERE  m.id IN (4294, 5334)         -- Lord Holmes (was an MP), Allison Gardner
ORDER  BY ge.polling_on;
```

## CLI access via `parl psephology`

The `parl` CLI ships a small SQL passthrough so you don't have to
remember the connection string:

    parl psephology sql 'SELECT COUNT(*) FROM candidacies'
    parl psephology sql --file my-query.sql
    parl psephology tables                   # list tables + row counts
    parl psephology dump-info                # which dump file is loaded
    parl psephology refresh                  # re-pull + reload latest dump

All output is JSON unless `--text` is passed.

## RDFification — relationship to the election ontology

The Parliament-published **election ontology** at
<https://ukparliament.github.io/ontologies/election/election-ontology.html>
(prefix `pe: <http://parliament.uk/ontologies/election/>`) maps
almost one-to-one onto this schema. The full mapping is in
[`reference.md`](reference.md).

A complete N-Quads dump of the database is committed to the repo
at [`third_party/data/psephology/all.nq.gz`](../../third_party/data/psephology/all.nq.gz)
— **420,158 quads, 81 MB uncompressed, 2.4 MB gzipped** — produced
by `scripts/psephology-to-rdf.mjs` (run via `npm run psephology:rdf`
once the database is up). Highlights:

- One named graph per source table:
  `…/graph/psephology/{countries, parliament-periods, boundary-sets,
  legislation-items, constituency-group-sets, constituency-groups,
  constituency-areas, political-parties, political-party-registrations,
  general-elections, general-election-in-boundary-sets, electorates,
  elections, candidacies, certifications, members-bridge, provenance}`.
- Members API bridge: every candidacy with a sitting/former MP
  carries an `_:person_mnis_<N>` blank node with
  `parl:memberId "<N>"` + `owl:sameAs
  <https://members-api.parliament.uk/api/Members/<N>>`. The
  separate `members-bridge` graph holds the same facts on a
  canonical IRI (`…/Person/mnis-<N>`) so the bridge is queryable
  as a standalone graph without unpacking candidacies. Resolves
  through `members.mnis_id`, not the psephology-local
  `members.id`.
- Provenance graph describes every other graph as a
  `void:Dataset` with `prov:wasGeneratedBy` pointing at the build
  activity (with `fm:gitRevision`) and `dcterms:source` pointing
  at the upstream `db/dumps/<date>.sql` file on GitHub.

The uncompressed `all.nq` is not committed (81 MB exceeds the
repo's committed-uncompressed threshold; FCDO's `all.nq.gz`
follows the same gzip-only convention). To inspect on disk:

    zcat third_party/data/psephology/all.nq.gz | head
    zgrep 'WinningCandidacyResult' third_party/data/psephology/all.nq.gz | wc -l   # 4,552 winning results

## Provenance

Tier 1 — first-party Parliament data, maintained by the House of
Commons Library. Cite as *"House of Commons Library psephology
database, dump YYYY-MM-DD"*. The repo's own README is the canonical
description; this skill summarises what's in the dump and how to
query it, not what the data means politically.
