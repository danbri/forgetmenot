---
name: lords-votes
description: Query House of Lords divisions — division metadata, content/not-content totals, every individual peer's vote, and grouped-by-party tallies. Use whenever the question is "how did peers vote on X" or "what was the result of the Lords division on Y". Lords vote with "Content" / "Not Content" rather than "Aye" / "No".
---

# UK Parliament Lords Votes API

Base URL: `https://lordsvotes-api.parliament.uk`

OpenAPI 3 spec: `https://lordsvotes-api.parliament.uk/swagger/v1/swagger.json`
(cached at `_specs/lordsvotes.json`).

## What it covers

Divisions in the House of Lords. Lords vote *Content* (in favour) /
*Not Content* (against), so the response shape uses
`contentCount`/`notContentCount` and `contents[]`/`notContents[]`
arrays of peers, not `Ayes`/`Noes`.

## Common entry points

| Use case | Endpoint |
|---|---|
| List recent divisions | `GET /data/Divisions/search?StartDate=2026-01-01&EndDate=2026-04-30&take=20` |
| Total result count | `GET /data/Divisions/searchTotalResults?...` |
| Division detail with member-level votes | `GET /data/Divisions/{divisionId}` |
| Division grouped by party | `GET /data/Divisions/groupedbyparty?divisionId=...` |
| Single peer's voting record | `GET /data/Divisions/membervoting?memberId=...` |

## Worked example

```sh
curl -s 'https://lordsvotes-api.parliament.uk/data/Divisions/search?take=1' \
  | jq '.[0] | {id: .divisionId, title, content: .contentCount, notContent: .notContentCount}'
```

## Notes

- Parameters are passed as **flat** query-string keys here — no
  `queryParameters.` prefix (unlike the Commons Votes API).
- `MemberId` is the same integer used by the Members API and by Hansard
  contributions.
- The Lords API returns rich peerage metadata per voter
  (`PartyColour`, `MemberFrom` for the lord's title, etc.).
- See `reference.md` for parameter details.

<!-- parl-cli-start -->

## Using the CLI

> See [`../parl/SKILL.md`](../parl/SKILL.md) for the CLI-wide conventions (output modes, flag rules, idiomatic chains).

This skill ships with a Node CLI alongside the documentation. From the
repo root:

```sh
node bin/parl.mjs lords-votes --help
```

Or after `npm link` (one-time install):

```sh
parl lords-votes --help
```

Wraps the Lords Votes API. Lords vote "Content" / "Not Content" rather than aye/no.

### Examples

```sh
parl lords-votes search --take 5
```
Recent Lords divisions.

```sh
parl lords-votes get 3000
```
One Lords division detail.

```sh
parl lords-votes by-party 3000
```
Content/not-content by party.


### Library use (Node + browser)

Same surface as a JS module:

```js
import * as fac from '../../lib/facilities/lords-votes.mjs';

// Each function is async and returns parsed JSON (or bytes for
// download endpoints). See the .mjs source for the full export list.
```

The library uses only `fetch` / `URL` / `AbortController`, so the
same source runs in Node 18+ and in modern browsers.

<!-- parl-cli-end -->
