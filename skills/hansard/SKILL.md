---
name: uk-parliament-hansard
description: Search and retrieve the modern UK Hansard — the official transcript of debates and proceedings of both Houses since 1988. Covers debate text, speaker lists, divisions linked to debates, contributions by Member, sitting day calendars, PDFs, and full-text search across debates, members, committees, divisions, petitions, and statements. Use whenever the question is about what was said in Parliament, who spoke, when a debate happened, or how an MP voted in context.
---

# UK Parliament Hansard API (modern, 1988→)

Base URL: `https://hansard-api.parliament.uk`

Swagger 2 spec: `https://hansard-api.parliament.uk/swagger/docs/v1`
(cached at `_specs/hansard.json`).

For Hansard before 1988, see [historic-hansard](../historic-hansard/SKILL.md).

## What it covers

The Official Report from 1988 onwards. It exposes:

- **Sitting calendar** — which days each House sat.
- **Section trees** — how a sitting day breaks into debates,
  questions, statements, divisions.
- **Debate text** — every spoken contribution with speaker ID,
  paragraph, column number.
- **Divisions** — every recorded vote, with member-level vote-for /
  vote-against linked to debates.
- **Search** — full-text search across debates, contributions,
  members, committees, divisions, petitions, statements.
- **PDFs** — the daily-part PDFs.

## URL conventions

Almost every endpoint uses a `.{format}` suffix in the path —
`json` or `xml`. Examples below all use `.json`. Query params live
under a `queryParameters.` prefix on the search endpoints (e.g.
`queryParameters.searchTerm=...`).

## Common entry points

| Use case | Endpoint |
|---|---|
| Last sitting date in a House | `GET /overview/lastsittingdate.json?house=Commons|Lords` |
| Sitting day calendar | `GET /overview/calendar.json?queryParameters.house=Commons&queryParameters.year=2026&queryParameters.month=4` |
| Section breakdown of a sitting day | `GET /overview/sectionsforday.json?queryParameters.house=Commons&queryParameters.date=2026-04-29` |
| Section hierarchy under a section | `GET /overview/sectiontrees.json?queryParameters.house=Commons&queryParameters.date=2026-04-29&queryParameters.section=Debates` |
| Full debate text | `GET /debates/debate/{debateSectionExtId}.json` |
| Speakers in a debate | `GET /debates/speakerslist/{debateSectionExtId}.json` |
| Divisions in a debate | `GET /debates/divisions/{debateSectionExtId}.json` |
| One division detail | `GET /debates/division/{divisionExtId}.json` |
| Contributions by a Member | `GET /debates/memberdebatecontributions/{memberId}.json` |
| Top-level debate by title | `GET /debates/topleveldebatebytitle.json?queryParameters.house=Commons&queryParameters.sittingDate=2026-04-29&queryParameters.sectionTitle=...` |
| Generic full-text search | `GET /search.json?queryParameters.searchTerm=climate&queryParameters.startDate=2026-01-01&queryParameters.endDate=2026-04-30` |
| Search a particular contribution type | `GET /search/contributions/{contributionType}.json` (`Spoken`, `Written` etc.) |

## Worked example

```sh
# 1. find sitting days in April 2026
curl -s 'https://hansard-api.parliament.uk/overview/calendar.json?queryParameters.house=Commons&queryParameters.year=2026&queryParameters.month=4' | jq '.[] | select(.sittingInProgress)'

# 2. for one date, get the debate sections
curl -s 'https://hansard-api.parliament.uk/overview/sectionsforday.json?queryParameters.house=Commons&queryParameters.date=2026-04-29'

# 3. drill into a debate section by extId
curl -s 'https://hansard-api.parliament.uk/debates/debate/<debateSectionExtId>.json'
```

## Notes

- `debateSectionExtId` is a GUID (e.g. `95D6BC58-9DE7-40ED-A2D8-04062482E883`).
- `memberId` is the same integer as in the [Members](../members/SKILL.md)
  API.
- Search results have aggregated counts (`TotalContributions`,
  `TotalDivisions`, `TotalDebates`, `TotalMembers`,
  `TotalWrittenStatements`, `TotalWrittenAnswers`, `TotalCorrections`,
  `TotalPetitions`) plus per-type result arrays.
- See `reference.md` for the full endpoint listing.

<!-- parl-cli-start -->

## Using the CLI

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs hansard --help
```

Or after `npm link` (one-time install):

```sh
parl hansard --help
```

Wraps the modern Hansard API. Use ext-IDs (GUIDs) returned by search to drill into debates and divisions.

### Examples

```sh
parl hansard last-sitting --house Commons
```
Latest sitting date.

```sh
parl hansard search --term climate --from 2026-01-01 --to 2026-04-30 --take 5
```
Generic search.

```sh
parl hansard search-debates --term "Online Safety" --take 5
```
Debates only.

```sh
parl hansard sections-for-day --house Commons --date 2026-04-29
```
Day breakdown.

```sh
parl hansard debate <debateSectionExtId>
```
Debate text.

```sh
parl hansard division <divisionExtId>
```
Division detail.

```sh
parl hansard member-contributions 4514
```
Per-member contributions.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/hansard.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
