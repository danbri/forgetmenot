# Lords Votes API — full endpoint reference

Cached spec: [`_specs/lordsvotes.json`](../../_specs/lordsvotes.json)
Endpoint table: [`_specs/endpoint-tables/lordsvotes.txt`](../../_specs/endpoint-tables/lordsvotes.txt)

Base URL: `https://lordsvotes-api.parliament.uk`

## Endpoints

### Division lookup
- `GET /data/Divisions/{divisionId}` — full record. Top-level fields:
  `divisionId`, `date`, `number`, `notes`, `title`, `isWhipped`,
  `isGovernmentContent`, `authoritativeContentCount`,
  `authoritativeNotContentCount`, `divisionHadTellers`, `tellerContentCount`,
  `tellerNotContentCount`, `memberContentCount`, `memberNotContentCount`,
  `sponsoringMemberId`, `isHouse`, `amendmentMotionNotes`, `divisionWasExempted`,
  `contentTellers[]`, `notContentTellers[]`, `contents[]`, `notContents[]`.

### Search
- `GET /data/Divisions/search` — query params (flat, no prefix):
  - `SearchTerm` — substring of title or notes.
  - `MemberId` — divisions this peer voted in.
  - `IncludeWhenMemberWasTeller` — bool.
  - `StartDate`, `EndDate` — ISO `YYYY-MM-DD`.
  - `DivisionNumber` — exact number.
  - `TotalVotesCast.Comparator` and `.ValueToCompare` — numeric filter.
  - `MemberVotedAye` — bool.
  - `skip`, `take`.
- `GET /data/Divisions/searchTotalResults` — same params, returns count.

### Aggregates
- `GET /data/Divisions/groupedbyparty?divisionId=...`
- `GET /data/Divisions/membervoting?MemberId=...&skip=0&take=25`

## Notes

- Every parameter is title-case here (`MemberId`, `StartDate`) — the
  Commons API uses the `queryParameters.<lowercase>` style. They are
  not interchangeable.
- `isHouse` is set when the whole House votes en bloc (uncommon).
- The `notes` field is sometimes the most useful identifier — Lords
  divisions are often on amendments and the title alone is generic.
