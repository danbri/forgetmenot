---
name: members
description: Look up Members of the UK House of Commons or House of Lords (current and historical), their constituencies, biographies, voting records, EDMs, written questions, registered interests, party state, government and opposition post-holders, and Commons constituency geometry. Use whenever the question is about an MP, peer, constituency, party composition, or who held a Cabinet / Shadow Cabinet post.
license: Open Parliament Licence v3.0 (Crown copyright; Parliament-operated)
metadata:
  provenance:
    tier: 1
    operator: UK Parliament
    service: members-api.parliament.uk
    citation-short: "via members-api.parliament.uk"
    citation-formal: "UK Parliament Members API, retrieved {date}"
    confidence: authoritative
---

# UK Parliament Members API

Base URL: `https://members-api.parliament.uk/api`

OpenAPI 3 spec: `https://members-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/members.json`).

## What it covers

Members of both Houses, current and historical, plus the constituencies
they represent, parties, government and opposition posts, the Speaker and
Deputy Speakers, and per-member detail pages (biography, voting record,
written questions, registered interests, EDMs, contact info, portraits).

## Common entry points

| Use case | Endpoint |
|---|---|
| Find a current MP or peer by name | `GET /Members/Search?Name=...&House=Commons|Lords&take=20` |
| Find a member who served at any point | `GET /Members/SearchHistorical?name=...` |
| Get a member's full record | `GET /Members/{id}` |
| Voting record | `GET /Members/{id}/Voting?house=Commons|Lords&page=1` |
| Registered financial interests | `GET /Members/{id}/RegisteredInterests` |
| Find a constituency by name or postcode | `GET /Location/Constituency/Search?searchText=...` |
| Constituency boundary as GeoJSON | `GET /Location/Constituency/{id}/Geometry` |
| Current state of the parties | `GET /Parties/StateOfTheParties/{house}/{forDate}` |
| Cabinet / opposition front-bench | `GET /Posts/GovernmentPosts` and `GET /Posts/OppositionPosts` |

`House` is the integer enum `1=Commons`, `2=Lords` in some endpoints and
the string `Commons`/`Lords` in others — check the spec when a request
returns 400.

Pagination is `skip` + `take` on most list endpoints; default `take` is 20
and the maximum is 20 (so to walk all members you must page).

## Worked example

```sh
# Find current MPs called "Smith" in the Commons
curl -s 'https://members-api.parliament.uk/api/Members/Search?Name=Smith&House=1&take=20' \
  | jq '.items[] | {id: .value.id, name: .value.nameDisplayAs, party: .value.latestParty.name}'
```

## Notes

- All data is under the [Open Parliament Licence](https://www.parliament.uk/site-information/copyright-parliament/open-parliament-licence/).
- No authentication; rate-limiting is light but be polite.
- `Portrait` and `Thumbnail` endpoints return image bytes (PNG/JPEG); the
  `*Url` variants return a CDN URL.
- For deeper work see `reference.md` (every endpoint with summary).

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs members --help
```

Or after `npm link` (one-time install):

```sh
parl members --help
```

Wraps the modern Members API. Member IDs are MNIS integers and join with Hansard, voting and questions APIs.

### Examples

```sh
parl members search --name Cooper --house Commons --take 5
```
Search current MPs called Cooper.

```sh
parl members get 4514
```
Full record for Sir Keir Starmer (MNIS 4514).

```sh
parl members voting 4514 --house Commons --page 1
```
Voting record.

```sh
parl members interests 4514
```
Registered financial interests.

```sh
parl members constituency-search --search-text "Hackney" --take 5
```
Constituencies matching "Hackney".

```sh
parl members parties-state Commons 2024-07-04
```
State of parties on a date.

```sh
parl members gov-posts
```
Current Government posts.

```sh
parl members urls 4514
```
Per-member URL bundle from `/Members/{id}/Contact`: `social[]`,
`websites[]`, `emails[]`, `phones[]`, `offices[]`. Social entries
include X (formerly Twitter), Facebook, the member's website, and
in some cases Prime Minister's office and other role pages.

```sh
parl members crawl --out data/members --delay-ms 100
```
Stash every current member to disk keyed by MNIS ID. For each
member writes `<out>/<id>.json` containing id, name, party (with
abbreviation and ID), house, constituency, gender, plus the URL
bundle above. Also writes `<out>/index.json` with a summary
manifest. Crawls Commons + Lords by default (~1426 members);
restrict with `--house Commons` or `--house Lords`. Existing
files are skipped on rerun unless you pass `--refetch`. Add
`--include-historical` to include former members. Cap with
`--max N` for testing.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/members.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->

## Provenance to cite

**Tier 1 — first-party UK Parliament.** Authoritative.

- Inline cite: **"(via members-api.parliament.uk)"** — once per paragraph in
  user-facing answers.
- On request, give the URL `--raw` printed.
- See [`docs/provenance.md`](../../docs/provenance.md) for the
  cross-skill rules.
