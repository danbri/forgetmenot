---
name: uk-parliament-lords-votes
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
