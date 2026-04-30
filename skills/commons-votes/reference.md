# Commons Votes API — full endpoint reference

Cached spec: [`_specs/commonsvotes.json`](../../_specs/commonsvotes.json)
Endpoint table: [`_specs/endpoint-tables/commonsvotes.txt`](../../_specs/endpoint-tables/commonsvotes.txt)

Base URL: `https://commonsvotes-api.parliament.uk`

## Endpoints

### Division lookup
- `GET /data/division/{divisionId}.{format}` — full record. Fields:
  `DivisionId`, `Date`, `PublicationUpdated`, `Number`, `IsDeferred`,
  `EVELType`, `EVELCountry`, `Title`, `AyeCount`, `NoCount`,
  `DoubleMajorityAyeCount`, `DoubleMajorityNoCount`, `AyeTellers[]`,
  `NoTellers[]`, `Ayes[]`, `Noes[]`, `NoVoteRecorded[]`. Each member
  entry has `MemberId`, `Name`, `Party`, `SubParty`, `PartyColour`,
  `PartyAbbreviation`, `MemberFrom`, `ListAs`, `ProxyName`.

### Search
- `GET /data/divisions.{format}/search` — query params (all under
  `queryParameters.`):
  - `searchTerm` — substring of title.
  - `memberId` — return only divisions this MP voted in.
  - `includeWhenMemberWasTeller` — bool.
  - `startDate`, `endDate` — ISO `YYYY-MM-DD`.
  - `divisionNumber` — exact number within session.
  - `skip`, `take` (default 25, max 25).
- `GET /data/divisions.{format}/searchTotalResults` — same parameters,
  returns just an integer count.

### Aggregates
- `GET /data/divisions.{format}/groupedbyparty?queryParameters.divisionId=...`
  Returns aye/no/abstain/no-vote-recorded broken down per party for one
  division.
- `GET /data/divisions.{format}/membervoting?queryParameters.memberId=...&queryParameters.skip=0&queryParameters.take=25`
  Returns a paged list of every division a Member voted in, including
  what they voted.

## Notes

- The take cap is 25; loop over `skip` to walk a long result.
- `IsDeferred` flags deferred divisions taken at the next sitting.
- `EVELType` (English Votes for English Laws) is no longer applied
  procedurally but persists in older divisions.
- Use [`Lords Votes`](../lords-votes/SKILL.md) for the upper House;
  the parameter convention is slightly different (no `queryParameters.`
  prefix).
