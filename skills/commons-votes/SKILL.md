---
name: uk-parliament-commons-votes
description: Query Commons divisions (recorded votes in the House of Commons) — division metadata, aye/no totals, tellers, every individual member's vote, and grouped-by-party tallies. Use whenever the question is "how did MPs vote on X" or "what was the result of division N". Covers contemporary divisions; historic Commons votes before this API's coverage live in the SPARQL store.
---

# UK Parliament Commons Votes API

Base URL: `https://commonsvotes-api.parliament.uk`

Swagger 2 spec: `https://commonsvotes-api.parliament.uk/swagger/docs/v1`
(cached at `_specs/commonsvotes.json`).

## What it covers

Every recorded division in the House of Commons in the API's coverage
window (current Parliament back to ~2017). Each division has a title,
date, aye/no/double-majority counts, English Votes for English Laws
metadata, tellers, and a list of how each MP voted.

## URL convention

Endpoints end with a `.{format}` segment (`.json` or `.xml`). Query
params live under a `queryParameters.` prefix.

## Common entry points

| Use case | Endpoint |
|---|---|
| List recent divisions | `GET /data/divisions.json/search?queryParameters.startDate=2026-01-01&queryParameters.endDate=2026-04-30&queryParameters.take=20` |
| Total result count for a search | `GET /data/divisions.json/searchTotalResults?...` |
| Division detail with member-level votes | `GET /data/division/{divisionId}.json` |
| Division grouped by party | `GET /data/divisions.json/groupedbyparty?queryParameters.divisionId=...` |
| Single member's voting record | `GET /data/divisions.json/membervoting?queryParameters.memberId=...&queryParameters.includeWhenMemberWasTeller=true&queryParameters.skip=0&queryParameters.take=25` |

## Worked example

```sh
# Latest division
LATEST=$(curl -s 'https://commonsvotes-api.parliament.uk/data/divisions.json/search?queryParameters.take=1' \
           | jq '.[0].DivisionId')
# Member-level breakdown
curl -s "https://commonsvotes-api.parliament.uk/data/division/${LATEST}.json" \
  | jq '{title: .Title, ayes: .AyeCount, noes: .NoCount, ayes_list: [.Ayes[].Name]}'
```

## Notes

- `MemberId` matches the [Members API](../members/SKILL.md) ID, so you
  can join to biographies and constituencies.
- Unlike the Lords Votes API, this endpoint takes search parameters
  under a `queryParameters.` prefix even on `/data/division/{id}.json`
  detail calls when filtering — but the bare `/data/division/{id}.json`
  call needs no parameters.
- For a division that triggered a Lords ping-pong, also see the
  [Bills API](../bills/SKILL.md)'s `PingPongItems`.
- See `reference.md` for parameter details.

<!-- parl-cli-start -->

## Using the CLI

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs commons-votes --help
```

Or after `npm link` (one-time install):

```sh
parl commons-votes --help
```

Wraps the Commons Votes API. Member IDs match the Members API.

### Examples

```sh
parl commons-votes search --from 2026-04-01 --to 2026-04-30 --take 5
```
Recent divisions.

```sh
parl commons-votes get 2350
```
One division with member-level votes.

```sh
parl commons-votes by-party 2350
```
Aye/no/abstain by party.

```sh
parl commons-votes member 4514 --take 25
```
A Member's voting record.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/commons-votes.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
