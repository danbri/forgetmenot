# MNIS / Members Data Platform — full reference

Base URL: `https://data.parliament.uk/membersdataplatform`

## Services exposed under `/services/mnis/`

| Path | Purpose |
|---|---|
| `members/query/{filter}/{expansions}/?format=json` | The query endpoint. |
| `parties/active/{Commons|Lords}/` | Currently active parties in a House. |
| `parties/state/{Commons|Lords}/{YYYY-MM-DD}/` | Seat counts at a date. |
| `members/list/{Commons|Lords}/{YYYY-MM-DD}/` | Member list for a date. |
| `members/{memberId}/` | Single member top-level record. |
| `members/{memberId}/{expansion}/` | Single member sub-resource. |
| `members/byPostcode/{postcode}/` | Postcode lookup for current Commons MP. |
| `referenceData/parties/` | Reference list of all parties. |
| `referenceData/houses/` | `Commons` / `Lords` constants. |
| `referenceData/policyInterests/` | Policy interest taxonomy. |

## Filter syntax

`{filter}` is a pipe-separated list of `key=value` predicates. The
pipe character is `|`, URL-encoded as `%7C`. Predicates AND together.

Example: `House%3DCommons%7CParty%3DLabour%7CIsEligible%3Dtrue` means
`House=Commons AND Party=Labour AND IsEligible=true`.

Operators are written `key gt value` / `key lt value` / `key eq value`
etc., with the operator separated from the value by a literal space —
in URL form `+`. Example: `MembershipStartDate gt 2020-01-01` becomes
`MembershipStartDate+gt+2020-01-01`.

## Expansions

After the filter you append a pipe-separated list of sub-resources:

| Expansion | Adds |
|---|---|
| `Constituencies` | All constituencies the member has represented. |
| `Parties` | All party affiliations over time. |
| `HouseMemberships` | All house memberships. |
| `Committees` | Committee memberships. |
| `PreferredNames` | Preferred display names over time. |
| `BiographyEntries` | Biographical text entries. |
| `Addresses` | Contact addresses. |
| `Statuses` | Status flags (eligible, on leave, …). |
| `AnsweringBodies` | Answering bodies (for ministers). |
| `GovernmentPosts` | Government office holdings. |
| `OppositionPosts` | Opposition front-bench. |
| `OtherPosts` | Other roles. |
| `Experiences` | Pre-Parliament experience. |
| `KeyDates` | Notable dates (election, sworn in, …). |
| `Interests` | Registered interests entries. |
| `Staff` | Staff list. |
| `MaidenSpeeches` | First speeches. |
| `Elections` | Election results. |
| `OtherParliaments` | Membership of other parliaments / assemblies. |

Use `Full` to get everything in one call (heavy).

## Notes

- Some endpoints emit XML even when you pass `?format=json`;
  particularly older `parties/`, `referenceData/`. Plan for both.
- MNIS uses ISO `YYYY-MM-DD` dates and serialises XML datetimes as
  `2020-12-12T00:00:00`.
- The XML namespace declarations include `xmlns:xsi` and `xsi:nil`
  for null fields — handle those when parsing.
- The legacy Excel front-end at `data.parliament.uk/.../OpenDataLoader/...`
  is built on top of the same service.
