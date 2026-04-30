# Members API — full endpoint reference

Cached spec: [`_specs/members.json`](../../_specs/members.json)
Endpoint table (auto-generated): [`_specs/endpoint-tables/members.txt`](../../_specs/endpoint-tables/members.txt)

Base URL: `https://members-api.parliament.uk/api`

## Endpoints by group

### Members
- `GET /Members/Search` — current members; query params `Name`, `Location`,
  `PostCode`, `PartyId`, `House` (1=Commons, 2=Lords), `MembershipStartedSince`,
  `MembershipEndedSince`, `IsEligible`, `IsCurrentMember`, `PolicyInterestId`,
  `Experience`, `NameStartsWith`, `NameTo`, `skip`, `take`.
- `GET /Members/SearchHistorical` — anyone who has ever served. Returns
  multiple historical records per person.
- `GET /Members/History` — bulk-fetch historical names/parties/memberships
  for a list of IDs (`ids` repeating param).
- `GET /Members/{id}` — current snapshot (name, party, house, gender,
  thumbnail URL, current memberships).
- `GET /Members/{id}/Biography` — addresses elected/appointed dates,
  party affiliations history, house memberships, committee memberships,
  representations (constituency / lordship type), government posts,
  opposition posts, other posts.
- `GET /Members/{id}/Contact` — phone, email, address, website, social.
- `GET /Members/{id}/Synopsis` — one-paragraph free-text bio (HTML).
- `GET /Members/{id}/Focus` — declared policy interests / areas of focus.
- `GET /Members/{id}/Experience` — pre-Parliament career.
- `GET /Members/{id}/Staff` — paid staff members.
- `GET /Members/{id}/Voting?house=...&page=...` — division voting record.
- `GET /Members/{id}/WrittenQuestions?page=...` — written questions tabled.
- `GET /Members/{id}/Edms?page=...` — Early Day Motions sponsored or
  signed.
- `GET /Members/{id}/ContributionSummary` — Hansard contribution counts.
- `GET /Members/{id}/RegisteredInterests` — entries in the relevant
  Register; for full structured data prefer the [Interests
  API](../interests/SKILL.md).
- `GET /Members/{id}/LatestElectionResult` — only meaningful for MPs.
- `GET /Members/{id}/Portrait` / `/PortraitUrl` — official portrait.
- `GET /Members/{id}/Thumbnail` / `/ThumbnailUrl` — small headshot.

### Constituencies
- `GET /Location/Constituency/Search?searchText=...&skip=&take=` — search
  by name fragment.
- `GET /Location/Constituency/{id}` — current MP, dates, type.
- `GET /Location/Constituency/{id}/Synopsis` — short blurb.
- `GET /Location/Constituency/{id}/Geometry` — boundary as GeoJSON-ish
  polygon (note: returns a string of WKT-like coordinates inside JSON;
  parse carefully).
- `GET /Location/Constituency/{id}/Representations` — list of MPs who
  have served the seat with start/end dates.
- `GET /Location/Constituency/{id}/ElectionResults` — every general or
  by-election result.
- `GET /Location/Constituency/{id}/ElectionResult/Latest` — most recent.
- `GET /Location/Constituency/{id}/ElectionResult/{electionId}` — one
  specific election.
- `GET /Location/Browse/{locationType}/{locationName}` — generic
  hierarchical browse (region → county → constituency etc.).

### Parties
- `GET /Parties/GetActive/{house}` — list of parties with at least one
  current member in `Commons` or `Lords`.
- `GET /Parties/StateOfTheParties/{house}/{forDate}` — seat counts for
  the date (ISO `YYYY-MM-DD`).
- `GET /Parties/LordsByType/{forDate}` — Lords broken down by peerage
  type (Life, Hereditary, Lord Spiritual).

### Posts (government / opposition)
- `GET /Posts/GovernmentPosts` — current Cabinet, Ministers of State,
  Parliamentary Under-Secretaries.
- `GET /Posts/OppositionPosts` — current Shadow Cabinet etc.
- `GET /Posts/Spokespersons` — Lords spokespersons by department.
- `GET /Posts/SpeakerAndDeputies/{forDate}` — Speaker, three Deputy
  Speakers, Lord Speaker, Senior Deputy Speaker.
- `GET /Posts/Departments/{type}` — list of `Government` /
  `Opposition` / `Other` departments.

### Reference data
- `GET /Reference/Departments` — answering bodies / departments table.
- `GET /Reference/Departments/{id}/Logo` — image bytes.
- `GET /Reference/AnsweringBodies` — alias of departments used in
  written question routing.
- `GET /Reference/PolicyInterests` — taxonomy used by Members focus.

### Lords-specific Register
- `GET /LordsInterests/Register` — current Register of Lords' Interests.
- `GET /LordsInterests/Staff` — declared peers' staff.

## Common patterns

- **Pagination.** Most list endpoints accept `skip` + `take`. `take`
  caps at 20.
- **Dates.** `forDate` parameters expect `YYYY-MM-DD`.
- **Member ID.** Same integer ID is shared with the Hansard, Voting, and
  Questions/Statements APIs — you can join across them.

## Worked join example

To get every Commons division a named member voted in last month:

```sh
ID=$(curl -s 'https://members-api.parliament.uk/api/Members/Search?Name=Cooper&House=1&take=1' \
       | jq '.items[0].value.id')
curl -s "https://members-api.parliament.uk/api/Members/${ID}/Voting?house=1&page=1" \
  | jq '.items[].value | {date, division: .title, vote: .voteFor}'
```
