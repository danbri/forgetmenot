---
name: uk-parliament-members
description: Look up Members of the UK House of Commons or House of Lords (current and historical), their constituencies, biographies, voting records, EDMs, written questions, registered interests, party state, government and opposition post-holders, and Commons constituency geometry. Use whenever the question is about an MP, peer, constituency, party composition, or who held a Cabinet / Shadow Cabinet post.
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
